// When BIR turns on the "(add more...)" links of 1701 (disableLinkIfEmpty), 1700 and 1700v2018, 1701A (src/form/gate1701.ts,
// gate1700.ts, gate1701a.ts):
//   unit   : BIR's value tests with JS semantics (a string compared with 0, trim, parseInt of a comma amount), each rule's cases;
//   oracle : the same rule against BIR's page. 1701: every link, every box set from a pool of awkward values and BIR's own
//            disableLinkIfEmpty(ids, link) called, link.disabled read and compared with on(); then a typed run (each box of the
//            link blurred in DOM order, as a filer would) comparing the link after every blur. Needs BIR's tree and WebKit.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NATIVE_FORM } from "@/form/registry.ts";
import { BUTTON_GROUP } from "@/form/picker.ts";
import { LINK_1701, amountOver0, linkOn1701 } from "@/form/gate1701.ts";
import { numWithCommaOver0, on1700v2018 } from "@/form/gate1700.ts";
import { wholeNumAtMost0 } from "@/form/gate1701a.ts";
import type { FormState, GroupState } from "@/form/schema.ts";
import { hasForm, startOracle } from "./oracle.ts";

const on = (code: string, link: string) => BUTTON_GROUP[code]![link]!.on!;

describe("1701: BIR's isAmountValid value test (removeCommaParenthesis(id) > 0)", () => {
  it("positive numbers, with commas and decimals, count", () => {
    expect([amountOver0("5"), amountOver0("1,000"), amountOver0("1,000.50"), amountOver0("0.5"), amountOver0(" 7 ")]).toEqual([true, true, true, true, true]);
  });
  it("zero, blank, negative and bracketed amounts do not", () => {
    expect([amountOver0(""), amountOver0("0"), amountOver0("0.00"), amountOver0("-3"), amountOver0("(5)"), amountOver0("(5,000)")]).toEqual([false, false, false, false, false, false]);
  });
  it("a comma amount is cut at the dot by parseInt: 0,000.90 is 0, not > 0", () => {
    expect([amountOver0("0,000.90"), amountOver0("1,000.90")]).toEqual([false, true]);
  });
  it("a non-number is not > 0 (NaN)", () => {
    expect([amountOver0("abc"), amountOver0("1e3"), amountOver0("0x10")]).toEqual([false, true, true]); // JS: Number("1e3") and Number("0x10")
  });
});

const link = (name: string) => LINK_1701.find((l) => l.link === name)!;
const copyOf = (copy: string, id: string) => id.replace(/TYPE/g, copy);

describe("1701 links: every link has BIR's rule", () => {
  it("covers the 11 main-page links and the 11 attachment kinds on each of the ten copies", () => {
    expect(LINK_1701.length).toBe(22);
    expect(LINK_1701.filter((l) => l.attachment).length).toBe(11);
    for (const l of LINK_1701) {
      const names = l.attachment ? ["EX", "SP"].flatMap((k) => [1, 2, 3, 4, 5].map((n) => `${k}${n}`)) : [""];
      for (const c of names) expect(BUTTON_GROUP["1701"]![l.link.replace(/TYPE/g, c)]?.on, l.link + c).toBeTypeOf("function");
    }
  });
  it("every link is greyed out on a blank form", () => {
    for (const [id, b] of Object.entries(BUTTON_GROUP["1701"]!)) if (b.on && id !== "frm1701:lnkPg5Sc1More") expect(b.on({}, {}), id).toBe(false);
  });
  it("Schedule 1's hand-ported rule is not changed by this port", () => {
    expect(BUTTON_GROUP["1701"]!["frm1701:lnkPg5Sc1More"]!.on!({}, {})).toBe(false);
  });
});

describe("1701 rules", () => {
  const sc3 = link("frm1701:lnkPg5Sc3I2More");
  const filled: FormState = {
    "frm1701:txtPg5Sc3I1Description": "RENT", "frm1701:txtPg5Sc3I1TaxPayerC1": "100", "frm1701:txtPg5Sc3I1SpouseC2": "0",
    "frm1701:txtPg5Sc3I2Description": "ROYALTY", "frm1701:txtPg5Sc3I2TaxPayerC1": "0", "frm1701:txtPg5Sc3I2SpouseC2": "200",
  };
  it("on when both items have a description and an amount in either column", () => expect(linkOn1701(sc3, filled, "", 0)).toBe(true));
  it("a blank description does not turn it off while the amount after it is valid (BIR's isValid is overwritten by the amount test)", () => {
    expect(linkOn1701(sc3, { ...filled, "frm1701:txtPg5Sc3I2Description": "   " }, "", 0)).toBe(true);
    expect(linkOn1701(sc3, { ...filled, "frm1701:txtPg5Sc3I2Description": "   ", "frm1701:txtPg5Sc3I2SpouseC2": "0" }, "", 0)).toBe(false);
  });
  it("off when an item has an amount in neither column", () => {
    expect(linkOn1701(sc3, { ...filled, "frm1701:txtPg5Sc3I2SpouseC2": "0.00" }, "", 0)).toBe(false);
  });
  it("the first invalid amount ends the walk, a later valid amount cannot undo it", () => {
    expect(linkOn1701(sc3, { ...filled, "frm1701:txtPg5Sc3I1TaxPayerC1": "0", "frm1701:txtPg5Sc3I1SpouseC2": "0" }, "", 0)).toBe(false);
  });
  it("two rows or more in the pop-up leave it on (the item reads OTHERS and is disabled)", () => {
    expect(on("1701", "frm1701:lnkPg5Sc3I2More")({ modalPage5Schedule3: [{}, {}] }, {})).toBe(true);
    expect(on("1701", "frm1701:lnkPg5Sc3I2More")({ modalPage5Schedule3: [{}] }, {})).toBe(false);
  });
  it("an attachment copy reads its own boxes", () => {
    const ex = link("frm1701:lnkPg2mScEI2MoreTYPE");
    const state: FormState = {};
    for (const n of [1, 2]) {
      state[`frm1701:txtPg2mScEI${n}DescriptionC1EX3`] = "ITEM";
      state[`frm1701:txtPg2mScEI${n}C3EX3`] = "10"; // the spouse column alone is enough
    }
    expect(linkOn1701(ex, state, "EX3", 0)).toBe(true);
    expect(linkOn1701(ex, state, "EX1", 0)).toBe(false);
    expect(on("1701", "frm1701:lnkPg2mScEI2MoreEX3")({}, state)).toBe(true);
    expect(on("1701", "frm1701:lnkPg2mScEI2MoreSP3")({}, state)).toBe(false);
  });
  it("Schedule 12A / 12B (page 10) boxes: description and amount of both items", () => {
    const l = link("frm1701:lnkPg10Sc11AI3More");
    const state: FormState = { "frm1701:txtPg10Sc11AI2TaxableOtherIncomeC1": "X", "frm1701:txtPg10Sc11AI2TaxableOtherIncomeC2": "5", "frm1701:txtPg10Sc11AI3TaxableOtherIncomeC1": "Y", "frm1701:txtPg10Sc11AI3TaxableOtherIncomeC2": "7" };
    expect(linkOn1701(l, state, "", 0)).toBe(true);
    expect(linkOn1701(l, { ...state, "frm1701:txtPg10Sc11AI3TaxableOtherIncomeC2": "0" }, "", 0)).toBe(false);
  });
});

describe("1700 (2013): disableLinkIfEmptyControls", () => {
  const I12 = "frm1700:lnkPg2Pt4I12ADDMore";
  it("off on a blank form, on once the description is in (BIR's amount boxes hold 0, which counts as filled)", () => {
    expect(on("1700", I12)({}, {})).toBe(false);
    expect(on("1700", I12)({}, { "frm1700:txtPg2Pt4I12": "OTHER INCOME" })).toBe(true);
    expect(on("1700", I12)({}, { "frm1700:txtPg2Pt4I12": "  " })).toBe(false);
    expect(on("1700", I12)({}, { "frm1700:txtPg2Pt4I12": "X", "frm1700:txtPg2Pt4I12C1": "" })).toBe(false);
  });
  it("item 3's link follows the employer's name and TIN; the pop-up's rows keep it on", () => {
    const l = "frm1700:lnkPg2Pt4AddLink";
    const state: FormState = { "frm1700:txtPg2Pt4I3NameOfEmployer": "ACME", "frm1700:txtPg2Pt4I3EMPTIN1": "123", "frm1700:txtPg2Pt4I3EMPTIN2": "456", "frm1700:txtPg2Pt4I3EMPTIN3": "789" };
    expect(on("1700", l)({}, {})).toBe(false);
    expect(on("1700", l)({}, state)).toBe(true);
    expect(on("1700", l)({}, { ...state, "frm1700:txtPg2Pt4I3EMPTIN3": "" })).toBe(false);
    expect(on("1700", l)({ modalPage2Part4: [{}] }, {})).toBe(true);
  });
  it("a pop-up with rows keeps it on; item 6 is never greyed out", () => {
    expect(on("1700", I12)({ Page2Part4I12ModalI12: [{}] }, {})).toBe(true);
    expect(on("1700", "frm1700:lnkPg3Pt5I6ADDMore")({}, {})).toBe(true);
  });
  it("Part V B item 10: both boxes of items 8 and 9", () => {
    const l = "frm1700:lnkPg3Pt5I10ADDMore";
    const state: FormState = Object.fromEntries(["8A", "8B", "9A", "9B"].map((k) => [`frm1700:txtPg3Pt5BI${k}`, "1"]));
    expect(on("1700", l)({}, state)).toBe(true);
    expect(on("1700", l)({}, { ...state, "frm1700:txtPg3Pt5BI9B": " " })).toBe(false);
  });
});

describe("1700v2018: enableAddMore", () => {
  const rows: GroupState = { sched1more: [{}] };
  const amount: FormState = { "frm1700:txtPg2ISched1c_4REG": "1,000.00", "frm1700:txtPg2ISched1d_4CIFR": "0.00", "frm1700:txtPg2ISched1e_4TW": "50.00", "frm1700:rdoPg1I6TaxpayerTypeE": "true" };
  it("NumWithComma(v) > 0 with JS semantics", () => {
    expect([numWithCommaOver0("1,000.50"), numWithCommaOver0("0.00"), numWithCommaOver0(""), numWithCommaOver0("-1"), numWithCommaOver0("abc")]).toEqual([true, false, false, false, false]);
  });
  it("off on a blank form and without rows; on with rows, reg or cifr, and tw", () => {
    expect(on1700v2018({}, {})).toBe(false);
    expect(on1700v2018({}, amount)).toBe(false);
    expect(on1700v2018(rows, amount)).toBe(true);
    const flat = { ...amount, "frm1700:txtPg2ISched1c_4REG": "0.00", "frm1700:txtPg2ISched1d_4CIFR": "9.00" };
    expect(on1700v2018(rows, flat)).toBe(false); // type N is not ticked: BIR writes 0.00 into the flat-rate box
    expect(on1700v2018(rows, { ...flat, "frm1700:rdoPg1I20SpouseTaxpayerTypeN": "true" })).toBe(true);
    expect(on1700v2018(rows, { ...amount, "frm1700:rdoPg1I6TaxpayerTypeE": "false" })).toBe(false); // type E not ticked: the regular box is 0.00
    expect(on1700v2018(rows, { ...amount, "frm1700:txtPg2ISched1e_4TW": "0.00" })).toBe(false);
    expect(on1700v2018(rows, { ...amount, "frm1700:txtPg2ISched1c_4REG": "0.00" })).toBe(false);
  });
});

describe("1701A: disableLinkIfEmpty", () => {
  const A = "frm1701A:lnkPartIVAMore";
  const state: FormState = {
    "frm1701A:optTaxRate_1": "true", "frm1701A:txt41Desc": "A", "frm1701A:txt42Desc": "B", "frm1701A:txt41A": "100", "frm1701A:txt42A": "5,000.00",
  };
  it("WholeNumWithComma(v) <= 0: a non-number is NaN, and NaN <= 0 is false", () => {
    expect([wholeNumAtMost0("0.00"), wholeNumAtMost0("0"), wholeNumAtMost0(""), wholeNumAtMost0("-5"), wholeNumAtMost0("5"), wholeNumAtMost0("0,000.99"), wholeNumAtMost0("abc")]).toEqual([true, true, false, true, false, true, false]);
    // "" is NaN too: parseInt("") — BIR does not stop an empty amount box, but its blur sets a blank to 0 first
  });
  it("off on a blank form; on once both descriptions and the ticked column's amounts are in", () => {
    expect(on("1701A", A)({}, {})).toBe(false);
    expect(on("1701A", A)({}, state)).toBe(true);
  });
  it("off when a description is blank or an amount is 0.00", () => {
    expect(on("1701A", A)({}, { ...state, "frm1701A:txt42Desc": " " })).toBe(false);
    expect(on("1701A", A)({}, { ...state, "frm1701A:txt41A": "0.00" })).toBe(false);
  });
  it("an unticked column is not checked; a ticked spouse column is", () => {
    expect(on("1701A", A)({}, { ...state, "frm1701A:optTaxRate_1": "false", "frm1701A:txt41A": "0.00" })).toBe(true);
    expect(on("1701A", A)({}, { ...state, "frm1701A:optSpouseTaxRate_1": "true" })).toBe(false);
    expect(on("1701A", A)({}, { ...state, "frm1701A:optSpouseTaxRate_1": "true", "frm1701A:txt41B": "1", "frm1701A:txt42B": "2" })).toBe(true);
  });
  it("two rows or more keep it on; Part IV.B reads items 50 and 51 but the same two ticks", () => {
    expect(on("1701A", A)({ partIVA: [{}, {}] }, {})).toBe(true);
    const B = "frm1701A:lnkPartIVBMore";
    expect(on("1701A", B)({}, { ...state, "frm1701A:txt50Desc": "C", "frm1701A:txt51Desc": "D", "frm1701A:txt50A": "1", "frm1701A:txt51A": "1" })).toBe(true);
    expect(on("1701A", B)({}, state)).toBe(false);
  });
});

const POOL_TEXT = ["", " ", "X", "OTHERS", "  Y  "];
const POOL_AMOUNT = ["", "0", "0.00", "5", "1,000", "(5)", "abc", "-3", "1,000.50", "0,000", "0x10", " 7 ", "1e2", "0.5"];

describe.skipIf(!hasForm("1701"))("1701: the rule against BIR's page", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(async () => {
    await oracle?.stop();
  });

  it("BIR's own disableLinkIfEmpty over random values agrees with linkOn1701, link by link", async () => {
    const schema = NATIVE_FORM["1701"]!.schema;
    const { page } = await oracle.openSaved(schema, {}, "84653210700000-1701-link.xml", {});
    const miss: string[] = [];
    let trial = 0;
    // IE's getElementById("") finds nothing; the shim's name lookup matches the HTA element, whose name is empty. BIR's attachment
    // getSpouseIDviaTaxfilerID returns "" for a box with no partner (Schedule K item 1), so make the empty id find nothing, as in IE.
    await page.evaluate(() => {
      const find = document.getElementById.bind(document);
      document.getElementById = (id: string) => (id === "" ? null : find(id));
    });
    for (const entry of LINK_1701) {
      const copy = entry.attachment ? "TYPE" : "";
      const all = [...new Set(entry.box.flatMap((b) => [b.id, ...(b.partner ? [b.partner] : [])]))];
      const kind = new Map(entry.box.map((b) => [b.id, b.kind]));
      for (let n = 0; n < 60; n++) {
        const value: FormState = {};
        for (const id of all) {
          const pool = kind.get(id) === "text" ? POOL_TEXT : POOL_AMOUNT;
          // bias toward valid values so both outcomes show up
          value[id] = n % 3 === 0 && kind.get(id) !== "text" ? "5" : pool[(n * 7 + trial++ * 13 + id.length) % pool.length]!;
        }
        const disabled = await page.evaluate(
          ([entry, value]) => {
            const w = window as unknown as Record<string, unknown>;
            w.isOnAttachment = entry!.attachment;
            (document.getElementById("frm1701:txtCurrentPage") as HTMLInputElement).disabled = entry!.attachment;
            for (const [id, v] of Object.entries(value!)) {
              const e = document.getElementById(id) as HTMLInputElement | null;
              if (e) {
                e.disabled = false;
                e.value = v;
              }
            }
            const link = document.getElementById(entry!.link) as HTMLInputElement;
            link.disabled = false;
            try {
              (w.disableLinkIfEmpty as (a: string, b: string) => void)(entry!.id.join(","), entry!.link);
            } catch {
              /* validateEnabledIDs runs after the link is set */
            }
            return link.disabled;
          },
          [{ link: entry.link, attachment: entry.attachment, id: entry.id }, value] as const,
        );
        const expected = linkOn1701(entry, value, copy, 0);
        if (disabled === expected) miss.push(`${entry.link} ${JSON.stringify(value)}: BIR ${disabled ? "off" : "on"}, native ${expected ? "on" : "off"}`);
      }
    }
    await page.close();
    expect(miss.slice(0, 5)).toEqual([]);
    expect(trial).toBeGreaterThan(1000);
  }, 600_000);

  it("a filer typing the boxes of a main-page link, blur by blur, sees the link follow on()", async () => {
    const schema = NATIVE_FORM["1701"]!.schema;
    const { page } = await oracle.openSaved(schema, {}, "84653210700000-1701-link2.xml", {});
    const miss: string[] = [];
    for (const entry of LINK_1701.filter((l) => !l.attachment)) {
      const ids = entry.id;
      const kind = new Map(entry.box.map((b) => [b.id, b.kind]));
      const trace: Array<{ at: string; disabled: boolean; value: Record<string, string> }> = await page.evaluate(
        ([link, ids, text, all]) => {
          const btn = document.getElementById(link!) as HTMLInputElement;
          const box = ids!.map((i) => document.getElementById(i) as HTMLInputElement).filter(Boolean);
          const read = () => Object.fromEntries(all!.map((i) => [i, (document.getElementById(i) as HTMLInputElement).value] as [string, string]));
          const out: Array<{ at: string; disabled: boolean; value: Record<string, string> }> = [{ at: "blank", disabled: btn.disabled, value: read() }];
          const put = (e: HTMLInputElement, v: string, at: string) => {
            e.disabled = false;
            e.value = v;
            e.dispatchEvent(new FocusEvent("blur"));
            out.push({ at, disabled: btn.disabled, value: read() });
          };
          for (const e of box) put(e, text!.includes(e.id) ? "ITEM" : "100", e.id);
          const last = box[box.length - 1]!;
          put(last, "0", "last box zero");
          put(last, "100", "last box back");
          const word = box.find((e) => text!.includes(e.id));
          if (word) put(word, "  ", "a description blank");
          return out;
        },
        [entry.link, ids, ids.filter((i) => kind.get(i) === "text"), [...new Set(entry.box.flatMap((b) => [b.id, ...(b.partner ? [b.partner] : [])]))]] as const,
      );
      for (const step of trace) {
        const expected = linkOn1701(entry, step.value, "", 0);
        if (step.disabled === expected) miss.push(`${entry.link} after ${step.at}: BIR ${step.disabled ? "off" : "on"}, native ${expected ? "on" : "off"}`);
      }
    }
    await page.close();
    expect(miss).toEqual([]);
  }, 600_000);
});
