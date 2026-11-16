// 1700, 1700v2018 and 1701A "(add more...)" links against BIR's page (rules: src/form/gate1700.ts, gate1701a.ts; unit cases in
// gate-1701-link.test.ts). Each link is greyed on a blank page as in BIR; then BIR's own function (disableLinkIfEmptyControls,
// disableLinkIfEmpty, enabledContinuationOfSchedule1) runs over awkward values and the link is compared with on().
// Needs BIR's tree and WebKit; skips otherwise.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NATIVE_FORM } from "@/form/registry.ts";
import { BUTTON_GROUP } from "@/form/picker.ts";
import { on1700v2018 } from "@/form/gate1700.ts";
import linkJson from "@/form/page/1700-link.json";
import type { FormState } from "@/form/schema.ts";
import { hasForm, startOracle } from "./oracle.ts";

const on = (code: string, link: string) => BUTTON_GROUP[code]![link]!.on!;

describe.skipIf(!["1700", "1700v2018", "1701A"].every(hasForm))("1700, 1700v2018, 1701A: the rule against BIR's page", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(async () => {
    await oracle?.stop();
  });

  it("every link is greyed out on a blank page, as BIR's is (item 6 of 1700 is on)", async () => {
    for (const code of ["1700", "1700v2018", "1701A"]) {
      const { page } = await oracle.openSaved(NATIVE_FORM[code]!.schema, {}, `84653210700000-${code}-blank.xml`, {});
      for (const id of Object.keys(BUTTON_GROUP[code]!)) {
        const disabled = await page.evaluate((id) => (document.getElementById(id) as HTMLInputElement | null)?.disabled ?? null, id);
        expect(disabled, `${code} ${id}`).toBe(!on(code, id)({}, {}));
      }
      await page.close();
    }
  }, 120_000);

  it("1700: disableLinkIfEmptyControls over random values", async () => {
    const link = linkJson as Array<{ link: string; id?: string[] }>;
    const { page } = await oracle.openSaved(NATIVE_FORM["1700"]!.schema, {}, "84653210700000-1700-link.xml", {});
    const miss: string[] = [];
    for (const entry of link.filter((l) => l.id && BUTTON_GROUP["1700"]![l.link])) {
      for (let n = 0; n < 25; n++) {
        const pool = ["", " ", "0", "X", "0.00", "5", "  "];
        const value: FormState = Object.fromEntries(entry.id!.map((id, k) => [id, n % 4 === 0 ? "1" : pool[(n * 3 + k * 5) % pool.length]!]));
        const disabled = await page.evaluate(
          ([link, id, value]) => {
            for (const [i, v] of Object.entries(value!)) (document.getElementById(i) as HTMLInputElement).value = v;
            const e = document.getElementById(link!) as HTMLInputElement;
            (window as unknown as Record<string, (a: string, b: string) => void>).disableLinkIfEmptyControls!(id!.join(","), link!);
            return e.disabled;
          },
          [entry.link, entry.id, value] as const,
        );
        const group = BUTTON_GROUP["1700"]![entry.link]!.group;
        if (disabled === on("1700", entry.link)({ [group]: [] }, value)) miss.push(`${entry.link} ${JSON.stringify(value)}`);
      }
    }
    await page.close();
    expect(miss.slice(0, 5)).toEqual([]);
  }, 300_000);

  it("1701A: disableLinkIfEmpty over random values and ticks", async () => {
    const { page } = await oracle.openSaved(NATIVE_FORM["1701A"]!.schema, {}, "84653210700000-1701A-link.xml", {});
    const miss: string[] = [];
    const pool = ["", "0", "0.00", "5", "1,000", "abc", "-3", "1,000.50", "0,000.99", " 7 "];
    let trial = 0;
    for (const [linkId, a, b] of [["frm1701A:lnkPartIVAMore", 41, 42], ["frm1701A:lnkPartIVBMore", 50, 51]] as const) {
      const group = linkId.includes("IVA") ? "partIVA" : "partIVB";
      for (let n = 0; n < 120; n++) {
        const value: FormState = {};
        for (const k of [a, b]) {
          value[`frm1701A:txt${k}Desc`] = ["", " ", "X"][(n + k) % 3]!;
          value[`frm1701A:txt${k}A`] = pool[(n * 3 + k + trial++) % pool.length]!;
          value[`frm1701A:txt${k}B`] = pool[(n * 5 + k + trial++) % pool.length]!;
        }
        value["frm1701A:optTaxRate_1"] = String(n % 2 === 0);
        value["frm1701A:optSpouseTaxRate_1"] = String(n % 3 !== 0);
        const disabled = await page.evaluate(
          ([link, ids, value]) => {
            for (const [i, v] of Object.entries(value!)) {
              const e = document.getElementById(i) as HTMLInputElement;
              if (e.type === "radio" || e.type === "checkbox") e.checked = v === "true";
              else e.value = v;
            }
            const e = document.getElementById(link!) as HTMLInputElement;
            (window as unknown as Record<string, (a: string, b: string) => void>).disableLinkIfEmpty!(ids!.join(","), link!);
            return e.disabled;
          },
          [linkId, [`frm1701A:txt${a}Desc`, `frm1701A:txt${a}A`, `frm1701A:txt${b}Desc`, `frm1701A:txt${b}A`], value] as const,
        );
        if (disabled === on("1701A", linkId)({ [group]: [] }, value)) miss.push(`${linkId} ${JSON.stringify(value)}`);
      }
    }
    await page.close();
    expect(miss.slice(0, 5)).toEqual([]);
  }, 300_000);

  it("1700v2018: enabledContinuationOfSchedule1 over item 4's amounts: off without saved rows, enableAddMore with them", async () => {
    const { page } = await oracle.openSaved(NATIVE_FORM["1700v2018"]!.schema, {}, "84653210700000-1700v2018-link.xml", {});
    const miss: string[] = [];
    const pool = ["0.00", "", "5.00", "1,000.00", "-1", "abc", "0.5"];
    for (let n = 0; n < 60; n++) {
      const value: FormState = {
        "frm1700:txtPg2ISched1c_4REG": pool[n % pool.length]!,
        "frm1700:txtPg2ISched1d_4CIFR": pool[(n * 3) % pool.length]!,
        "frm1700:txtPg2ISched1e_4TW": pool[(n * 5 + 1) % pool.length]!,
        "frm1700:rdoPg1I6TaxpayerTypeE": String(n % 3 === 1),
        "frm1700:rdoPg1I6TaxpayerTypeN": String(n % 3 === 2), // one radio group: E and N cannot both be ticked
        "frm1700:rdoPg1I20SpouseTaxpayerTypeE": String(n % 5 === 1),
        "frm1700:rdoPg1I20SpouseTaxpayerTypeN": String(n % 5 === 2),
      };
      const row = n % 2;
      const disabled = await page.evaluate(
        ([value, row]) => {
          const w = window as unknown as Record<string, unknown>;
          for (const [i, v] of Object.entries(value!)) {
            const e = document.getElementById(i) as HTMLInputElement;
            if (e.type === "radio") e.checked = v === "true";
            else e.value = v;
          }
          const link = document.getElementById("addMoreSched1Link") as HTMLInputElement;
          link.disabled = true;
          w.saveSched1Items = row ? [{}] : [];
          try {
            (w.enabledContinuationOfSchedule1 as (n: number) => void)(4);
          } catch {
            /* the item's own enabling runs after the link is set */
          }
          return link.disabled;
        },
        [value, row] as const,
      );
      if (disabled === on1700v2018(row ? { sched1more: [{}] } : {}, value)) miss.push(`${row} ${JSON.stringify(value)}`);
    }
    await page.close();
    expect(miss.slice(0, 5)).toEqual([]);
  }, 300_000);
});
