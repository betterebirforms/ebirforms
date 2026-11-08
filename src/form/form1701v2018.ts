// BIR Form 1701 (Annual Income Tax Return — Individuals, Estates and Trusts, mixed income), January 2018 (TRAIN)
// edition, P3. Field prefix `frm1701:`; two columns A = taxpayer/filer, B = spouse (joint filing only).
//
//   Page 1  items 1–37: period, filer type (6) and ATC (7) that fix the tax regime, civil status / joint filing,
//           19/20 exempt / special-rate income (→ Part X, Part VIII), 21 graduated (21A itemized / OSD) or 8%;
//           22 = Part VI 5, 23 = Part VII 10, 24 = 22−23, 25 (≤ 50% of 22), 26 = 24−25, 30 = 27+28+29,
//           31 = 26+30 (but just 30 when 26 < 0 and 30 > 0), 32 = 31A+31B.
//   Page 2  spouse background; Part V Sched 1 (compensation, 2 employers), Sched 2 (taxable compensation: 7 = tax on
//           6), Sched 3.A (graduated: 10 = 8−9, 12 = 10−11, 16 = 13+14+15 (Sched 4 18, 5 3/6, 6 8/13), 17 = OSD
//           40% of 10, 18 = 12−16 | 10−17, 22 = 19+20+21, 23 = 18+22, 24 = 6+23, 25 = tax on 24).
//   Page 3  Sched 3.B (8%: 28 = 26+27, 30 = 28−29 (≤ ₱250,000), 31 = 30 × 8%, 32 = 7+31), Sched 4 (itemized
//           deductions), Sched 5 (special deductions), Sched 6 (NOLCO, taxpayer rows 4–7).
//   Page 4  Sched 6 (spouse rows 9–12), Part VI (1 = 25 | 32, 4 = 2−3, 5 = 1+4), Part VII credits (10 = Σ 1–9),
//           Part VIII (tax relief), Part IX (reconciliation).
//   Part X / XI (pop-up pages Pg1m/Pg2m, Pg3m/Pg4m): the consolidated schedules for exempt / special-rate income.
//
// The arithmetic and every enable / reset is BIR's own, run by form1701v2018-sim.ts (see its header for why it
// is a simulation): every field's saved value is what BIR's own page logic leaves after a filer fills the native
// values in, saves and reopens. saveXML escape()s the name, the line of business and the address — both address
// lines go into the one `txtPg1I9Address` record (`txtPg1I9Address2` gets none; loadData splits the record at 100).

import template from "./template/1701v2018.json";
import { ATTACH, ATTACH_STATE, attachmentRow, attachStem, cellType, PFX, simulate, type AttachKind, type SimResult } from "./form1701v2018-sim.ts";
import { parseMoney } from "./money.ts";
import { validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type GroupSpec, type Problem } from "./schema.ts";
import { legacyEscape, type SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

export const P = PFX;
type Read = (id: string) => string;
type TemplateRecord = [string, string, string?];
const ESCAPED = new Set([`${P}txtPg1I8TaxpayerName`, `${P}txtLineBus`, `${P}txtPg1I9Address`]);

/** Field list straight from BIR's save template: radios (template radio group), the three selects, checkboxes,
 *  money (blank default "0.00") and text. */
export function fieldList(record: TemplateRecord[]): FieldJson[] {
  return record.map(([key, value, radio]): FieldJson => {
    const type = cellType(key, value, radio);
    if (type === "radio") return { id: key, kind: "radio" };
    if (type === "select-one") return { id: key, kind: "select" };
    if (type === "checkbox") return { id: key, kind: "checkbox" };
    if (value === "0.00") return { id: key, kind: "money" };
    return { id: key, kind: "text", ...(ESCAPED.has(key) ? { escaped: true } : {}) };
  });
}

// one simulation per computeAll pass: computeAll hands every field's derive the same `read`, and the first derive
// (item 1's month, first in DOM order) sees the state before any field was rewritten
const cache = new WeakMap<Read, SimResult>();
export const run = (r: Read): SimResult => {
  let hit = cache.get(r);
  if (!hit) cache.set(r, (hit = simulate(r)));
  return hit;
};

const REQUIRED = ["txtPg1I4TIN1", "txtPg1I4TIN2", "txtPg1I4TIN3", "txtPg1I4BranchCode", "txtPg1I8TaxpayerName", "txtPg1I1Year"].map((x) => `${P}${x}`);
/** Amounts BIR only ever computes (the filer never types them): read-only in the native form. */
const COMPUTED = new RegExp(
  "^frm1701:txt(Pg1I(22[AB]TaxDue|23[AB]|24[AB]TaxPayable|26[AB]|30[AB]|31[AB]TotalAmtPyble|32AggregateAmtPyble)" +
    "|Pg2IShed2_[467][AB]|Pg2IShed3_(10|12|13|14|15|16|17|18|22|23|24|25)[AB]|Pg3IShed3_(28|30|31|32)[AB]|Pg3IShed4_18[AB]|Pg3IShed5_[36]" +
    "|Pg3IShed6_(3[AB]|[4-7]E|7A|8D)|Pg4IShed6_(9|10|11|12)E|Pg4IShed6_12A|Pg4IShed6_13D|Pg4ISc6_[145][AB]|Pg4IPart7_(5|10)[AB]" +
    "|Pg4IPart8_(3|5|7|10)[AB]|Pg4IPart9_(5|10|11)[AB]|Pg2mI18[A-D]SchdC|Pg2mI5[AB]SchdD)$",
);
const field: FieldSpec[] = fieldList(template as TemplateRecord[]).map((f) => ({
  ...f,
  ...(REQUIRED.includes(f.id) ? { required: true } : {}),
  ...(COMPUTED.test(f.id) ? { compute: (r: Read) => parseMoney(run(r).value[f.id] ?? "0") } : {}),
  derive: (r: Read) => run(r).value[f.id] ?? "",
}));

// Part XI attachments: one group per kind, rows = BIR's attachment elements `<key>EX<n>` / `<key>SP<n>` (1-based).
// Every cell is derived by attachmentRow (BIR's own Sched B/C/D computes and setTaxRegime) once per row: computeGroupRows
// hands all of a row's derives the same reader. The groups pass their computed rows to the page logic (Part X
// consolidation, txtAttachmentTypes) through a hidden aggregate.
const rowCache = new WeakMap<Read, Record<string, string>>();
const attachGroup = (kind: AttachKind, name: string): GroupSpec => ({
  name,
  first_index: 1,
  row: ATTACH.map(([key, value, radio]) => ({
    id: attachStem(key, kind),
    kind: radio ? ("radio" as const) : value === "0.00" ? ("money" as const) : ("text" as const),
    derive: (r: Read) => {
      let hit = rowCache.get(r);
      if (!hit) rowCache.set(r, (hit = attachmentRow((k) => r(attachStem(k, kind)), kind, r(`${P}rdoPg1mOption2`) === "true")));
      return hit[key] ?? "";
    },
  })),
  total: { into: ATTACH_STATE[kind], of: "", sum: (row) => JSON.stringify(row) },
});
export const ATTACHMENT_GROUP = { exempt: attachGroup("EX", "exempt"), special: attachGroup("SP", "special") };

export const FORM_1701v2018: FormSchema = {
  form_code: "1701v2018",
  title: "Annual Income Tax — Individuals (Mixed Income)",
  field,
  group: [ATTACHMENT_GROUP.exempt, ATTACHMENT_GROUP.special],
  // saveXML: "<div>frm1701:txtPg1I9Address=" + escape(line 1) + escape(line 2) + "frm1701:txtPg1I9Address=</div>"
  extra_record: (state): SaveRecord[] => [
    { key: `${P}txtPg1I9Address`, value: legacyEscape((state[`${P}txtPg1I9Address`] ?? "").toUpperCase()) + legacyEscape((state[`${P}txtPg1I9Address2`] ?? "").toUpperCase()) },
    { key: `${P}txtPg1I9Address2`, value: "" },
  ],
};

export function validate1701v2018(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1701v2018, state);
  const tin = `${state[`${P}txtPg1I4TIN1`] ?? ""}${state[`${P}txtPg1I4TIN2`] ?? ""}${state[`${P}txtPg1I4TIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1I4TIN1`, message: "The TIN's check digit doesn't match." });
  const year = Number(state[`${P}txtPg1I1Year`] ?? "");
  if (year && year < 2018) problem.push({ id: `${P}txtPg1I1Year`, message: "Returns before 2018 use the old version of the form." });
  return problem;
}
