// Run the 1:1 check over every native form: EBF_PARITY=1 npx vitest run test/parity.test.ts
// (or one form: EBF_PARITY=1601FQ). Writes bench/result/parity.json. Not part of the gate — it is the scoreboard.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { NATIVE_FORM } from "@/form/registry.ts";
import type { Profile } from "@/lib/savefile.ts";
import type { FormState } from "@/form/schema.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, randomFill, type ParityResult } from "./parity.ts";

const want = process.env.EBF_PARITY;
const profile: Profile = {
  fn: "DELA CRUZ, JUAN", tin1: "846", tin2: "532", tin3: "107", tin4: "00000", rdo: "043", lob: "RETAIL",
  regAddr: "1 RIZAL ST., QUEZON CITY", zip: "1100", telNo: "0281234567", email: "juan@example.com", formType: "",
};
/** Keys where BIR's OWN reload mangles BIR's own save, so the native file (which matches BIR's save) differs after
 *  a reopen. Counted separately as `bir_defect`, never as equal. One reason per key. */
const BIR_DEFECT: Record<string, Record<string, string>> = {
  "1702RT": { "frm1702RT:txtCurrentPage": "blurring item 24 asks to jump to Schedule 1 (redirectToSchedule); the accepted confirm moves BIR's saved pager from 1 to 3" },
  "1702EX": { "frm1702EX:txtCurrentPage": "blurring item 25 (place of issue) asks to jump to the schedules (redirectToSchedule); the accepted confirm moves BIR's saved pager from 1 to 3" },
  "1707A": { "frm1707A:rdoI19TaxCreditCertificate": "BIR saves negatives as \"(…)\"; its reload turns them into 0.00 and unchecks the overpayment choice" },
  "1700": { "frm1700:txtPg1Pt1I17SpouseBranchCode": "processJointFiling → enableSpouse(true) resets the spouse's branch code to 000 on every reopen of a joint return, whatever was saved" },
  "2000v2018": { "frm2000:modLabel": "four pop-up labels share this id; BIR's loadData fills all four from the first saved one" },
  "1701v2018": {
    "frm1701:rdoPg2I8ForeignTaxCreditsYes": "checkFieldsAfterXMLLoad ticks the spouse's foreign-tax-credit \"No\" on every reopen of a joint return, whatever was saved",
    "frm1701:rdoPg2I8ForeignTaxCreditsNo": "same reload bug, the other radio of the pair",
  },
};
/** Page errors thrown by BIR's OWN code when the harness blurs every input (they fire on Windows too). Exact
 *  message per form; counted as `bir_defect_error`, never hidden. */
const BIR_PAGE_ERROR: Record<string, Record<string, string>> = {
  "1800v2018": { "Maximum call stack size exceeded.": "two penalty/credit computes call each other forever on blur (IE: Out of stack space); values are already final" },
  "1602Qv2018": { "null is not an object (evaluating 'd.getElementById(rate).value')": "row 15's blur passes a literal where an element id is expected" },
};
const code = Object.keys(NATIVE_FORM).filter((c) => hasForm(c) && (want === "1" || want?.split(",").includes(c)));

describe.runIf(want)("1:1 parity with BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  const result: ParityResult[] = [];
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(async () => {
    await oracle?.stop();
    mkdirSync("bench/result", { recursive: true });
    const summary = result.map((r) => {
      const defect = BIR_DEFECT[r.form_code] ?? {};
      const diff = r.diff.filter((d) => !(d.key in defect));
      const known = BIR_PAGE_ERROR[r.form_code] ?? {};
      const page_error = r.page_error.filter((e) => !(e in known));
      return { form_code: r.form_code, key: r.key_count, equal: r.equal_count, bir_defect: r.diff.length - diff.length, bir_defect_error: r.page_error.length - page_error.length, missing: r.missing.length, extra: r.extra.length, diff: diff.length, page_error: page_error.length };
    });
    writeFileSync(`bench/result/parity${want === "1" ? "" : "-" + want}.json`, JSON.stringify({ summary, result }, null, 1) + "\n");
  });

  for (const c of code) {
    it(`${c} is 1:1`, async () => {
      const def = NATIVE_FORM[c]!;
      const base: FormState = {};
      for (const [id, key] of Object.entries(def.prefill)) base[id] = profile[key];
      const state = randomFill(def.schema, base);
      const r = await parityCheck(oracle, def.schema, state, `84653210700000-${c}-parity.xml`);
      result.push(r);
      expect(r).toBeDefined();
    }, 120_000);
  }
});
