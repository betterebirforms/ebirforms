// Every native form names its savefile the way BIR's own page does. BIR's Save calls the form's
// createXMLFileName("savefile/") — TIN + branch, form code, period — and eBIRForms finds, lists, amends and submits
// returns by that name, so a native file under another name is one BIR's app treats as a different return.
// Open the native save in BIR's page, ask BIR's createXMLFileName for the name, compare with the export adapter's.
//   EBF_NAME=1 npx vitest run test/export-name.test.ts      (or EBF_NAME=0605,1701Qv2018). Writes bench/result/name.json.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { NATIVE_FORM } from "@/form/registry.ts";
import { savefileName } from "@/form/export.ts";
import type { FormState } from "@/form/schema.ts";
import type { Profile } from "@/lib/savefile.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { randomFill } from "./parity.ts";

const want = process.env.EBF_NAME;
const profile: Profile = {
  fn: "DELA CRUZ, JUAN", tin1: "846", tin2: "532", tin3: "107", tin4: "00000", rdo: "043", lob: "RETAIL",
  regAddr: "1 RIZAL ST., QUEZON CITY", zip: "1100", telNo: "0281234567", email: "juan@example.com", formType: "",
};
// a period every form accepts: the field's own name says which part it is
// (the 1702 family's month is a select named ddl…Date, and its year-end takes two digits)
const PERIOD: Array<[RegExp, string]> = [[/:ddl\w*Date$/i, "12"], [/YearEnd$/i, "25"], [/year|yr$/i, "2025"], [/month/i, "12"], [/day$|date$/i, "31"]];
// BIR's own page errors on load, as in test/parity.test.ts BIR_PAGE_ERROR; the name is still BIR's
const BIR_PAGE_ERROR: Record<string, string> = { "1602Qv2018": "null is not an object (evaluating 'd.getElementById(rate).value')" };
// BIR's pre-2018 Form 2000 resets any later year to 2017 on blur
const YEAR: Record<string, string> = { "2000": "2017" };
// the clock BIR's eight HHMMSS forms (0605, 2000, 2200*) put in the name; pinned on both sides
const NOW = new Date(2026, 10, 8, 9, 7, 5);

const code = Object.keys(NATIVE_FORM).filter((c) => hasForm(c) && (want === "1" || want?.split(",").includes(c)));

describe.runIf(want)("the savefile name matches BIR's createXMLFileName", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  const result: Array<{ form_code: string; native: string; bir: string | null; page_error: string[] }> = [];
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(async () => {
    await oracle?.stop();
    mkdirSync("bench/result", { recursive: true });
    const mismatch = result.filter((r) => r.native !== r.bir);
    writeFileSync(`bench/result/name${want === "1" ? "" : "-" + want}.json`, JSON.stringify({ form: result.length, mismatch: mismatch.length, result }, null, 1) + "\n");
  });

  for (const c of code) {
    it(`${c}`, async () => {
      const def = NATIVE_FORM[c]!;
      const base: FormState = {};
      for (const f of def.schema.field) {
        if (f.kind !== "text" && f.kind !== "select") continue;
        const hit = PERIOD.find(([re]) => re.test(f.id));
        if (hit && !/tin|zip|tel|rdo/i.test(f.id)) base[f.id] = hit[1] === "2025" ? (YEAR[c] ?? hit[1]) : hit[1];
      }
      for (const [id, key] of Object.entries(def.prefill)) base[id] = profile[key];
      const state = randomFill(def.schema, base);
      const native = savefileName({ form_code: c, state, now: NOW });
      const { page, error } = await oracle.openSaved(def.schema, state, native);
      const bir: string | null = await page.evaluate((t) => {
        const w = window as unknown as Record<string, unknown>;
        if (typeof w.createXMLFileName !== "function") return null;
        // pin BIR's clock to the same instant (getHHMMSS reads new Date())
        const RealDate = Date;
        w.Date = class extends RealDate { constructor(...a: unknown[]) { super(...((a.length ? a : [t]) as [number])); } };
        try { return String((w.createXMLFileName as (s: string) => string)("savefile/")).replace(/^savefile\//, ""); } finally { w.Date = RealDate; }
      }, NOW.getTime());
      await page.close();
      result.push({ form_code: c, native, bir, page_error: error });
      expect(error.filter((e) => e !== BIR_PAGE_ERROR[c])).toEqual([]);
      expect(native).toBe(bir);
    }, 120_000);
  }
});
