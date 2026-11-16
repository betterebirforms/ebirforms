// 1:1 with BIR's own form once every "(Add more...)" table of the 1702-RT / 1702-EX families holds rows typed the way a
// filer types them: round amounts ("100,000") and non-round ones ("54,321", "1,234,567"), each run through the form's
// FormSchema.typed. BIR reloads the file, recomputes, and must save the same records. (test/typed-1702.test.ts proves
// the text of each typed row cell; this proves the totals they feed.)
// EBF_PARITY=1702RT npx vitest run test/parity-1702-row.test.ts   (or a list, or 1 for all six)
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NATIVE_FORM } from "@/form/registry.ts";
import { rowFieldId, typedMoney, type FormState, type GroupRow, type GroupSpec, type GroupState } from "@/form/schema.ts";
import type { Profile } from "@/lib/savefile.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem, randomFill } from "./parity.ts";

const want = process.env.EBF_PARITY;
const FORM = ["1702RT", "1702RTv2018", "1702RTv2018C", "1702EX", "1702EXv2018", "1702EXv2018C"];
const profile: Profile = {
  fn: "DELA CRUZ, JUAN", tin1: "846", tin2: "532", tin3: "107", tin4: "00000", rdo: "043", lob: "RETAIL",
  regAddr: "1 RIZAL ST., QUEZON CITY", zip: "1100", telNo: "0281234567", email: "juan@example.com", formType: "",
};
/** Blurring the place of issue asks to jump to the schedules, and the oracle accepts every dialog. */
const ALLOW = (code: string) => [
  `frm${code.slice(0, 6)}:txtCurrentPage`,
  // EX 2018 Sch 3 item 3: BIR saves a typed row as "1234567.00" (round(this)), but its reload shows the row as "1,234,567"
  // (FormatValue), so the reopened page saves "1234567". The native file is the first, as BIR writes it.
  ...(code.startsWith("1702EXv2018") ? [1, 2].map((i) => `frm1702EX:txtPg3Pt6S3I3_${i}Col2`) : []),
];
/** Round, non-round, and a three-group figure, in the order a row's amount columns take them. */
const AMOUNT = [["1234567", "100000", "54321", "765"], ["1000000", "54321", "765", "100000"]];

/** Two rows of a group: the first with the larger amounts. Description boxes hold words, a date box a date. */
function rows(schema: NonNullable<(typeof NATIVE_FORM)[string]>["schema"], g: GroupSpec): GroupRow[] {
  return [0, 1].map((n) => {
    let m = 0;
    const row: GroupRow = {};
    for (const sub of g.row) {
      if (sub.kind === "money") row[sub.id] = sub.compute ? "0" : typedMoney(schema, AMOUNT[n]![m++ % 4]!);
      else if (sub.kind === "select") row[sub.id] = "PS"; // BIR's pop-up rows come back as "PS" on a reload, whatever was saved
      else if (/Date/.test(sub.id)) row[sub.id] = "03/15/2017";
      else if (g.name === "sc6a_7" && /C1$/.test(sub.id)) row[sub.id] = String(2014 + n); // the year incurred
      else row[sub.id] = `ROW ${n + 1} ${rowFieldId(sub.id, 0).slice(-8)}`.toUpperCase().slice(0, 25);
    }
    return row;
  });
}

describe.skipIf(!want || !FORM.every(hasForm))("1702-RT / 1702-EX are 1:1 with rows typed in every pop-up", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(async () => {
    await oracle?.stop();
  });
  for (const code of FORM.filter((c) => want === "1" || want?.split(",").includes(c))) {
    it(`${code}: every group holds a round and a non-round row`, async () => {
      const def = NATIVE_FORM[code]!;
      const base: FormState = {};
      for (const [id, key] of Object.entries(def.prefill)) base[id] = profile[key];
      const state = randomFill(def.schema, base);
      const groups: GroupState = {};
      for (const g of def.schema.group ?? []) groups[g.name] = rows(def.schema, g);
      const r = await parityCheck(oracle, def.schema, state, `84653210700000-${code}-parityrow.xml`, groups);
      expect(parityProblem(r, ALLOW(code))).toEqual([]);
      console.log(`${code}: key ${r.key_count}, equal ${r.equal_count}, page error ${r.page_error.length}, group ${(def.schema.group ?? []).length}`);
    }, 120_000);
  }
});
