// BIR Form 1601-C v2018 (Monthly Remittance Return of Income Taxes Withheld on Compensation), P3 rewrite.
// Compute (exact centavo): 21=15+16+17+18+19+20, 22=14−21, 24=22−23, 27=25+26, 30=28+29, 31=27−30, 35=32+33+34, 36=31+35.

import fieldJson from "./fields/1601Cv2018.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1601c:";
const read = (r: (id: string) => string, id: string) => parseMoney(r(P + id));
const T = (n: number) => `${P}txtTax${n}`;
const sum = (...n: number[]) => (r: (id: string) => string) => n.reduce((s, i) => s + read(r, `txtTax${i}`), 0);
const diff = (a: number, b: number) => (r: (id: string) => string) => read(r, `txtTax${a}`) - read(r, `txtTax${b}`);

// Schedule 1 (prior-month adjustments): BIR's page ships 3 rows and its "Add" / "Delete" buttons (addSchedule /
// deleteSchedule) add and drop whole rows, 0-indexed. Each row is a group row (the page's own boxes are its first rows),
// so the scalar list leaves them out. Adjustment = should-have-been-paid - paid (computeSchedule1), and the total feeds
// item 26. BIR's loadSchedule rebuilds the table by counting the saved txtMonthYear boxes.
const SCHED1 = "frm1601c:sched1:";
const rowOfSched1 = /^(chkScheduleDelete|frm1601c:sched1:(txtMonthYear|txtDatePaid|txtBankCode|txtNumber|txtTaxPaid|txtShouldTaxDue|txtAdjustments))\d+$/;
export const SCHED1_1601C: GroupSpec = {
  name: "sched1",
  first_index: 0,
  row: [
    { id: "chkScheduleDelete", kind: "checkbox" },
    { id: `${SCHED1}txtMonthYear`, kind: "text" },
    { id: `${SCHED1}txtDatePaid`, kind: "text" },
    { id: `${SCHED1}txtBankCode`, kind: "text" },
    { id: `${SCHED1}txtNumber`, kind: "text" },
    { id: `${SCHED1}txtTaxPaid`, kind: "money" },
    { id: `${SCHED1}txtShouldTaxDue`, kind: "money" },
    { id: `${SCHED1}txtAdjustments`, kind: "money", row_compute: (read) => parseMoney(read(`${SCHED1}txtShouldTaxDue`)) - parseMoney(read(`${SCHED1}txtTaxPaid`)) },
  ],
  total: [
    { into: `${SCHED1}txtTotal1`, of: `${SCHED1}txtAdjustments` },
    { into: `${P}txtTax26`, of: `${SCHED1}txtAdjustments` },
  ],
};

export const FORM_1601Cv2018 = buildSchema("1601Cv2018", "Income Taxes Withheld on Compensation", (fieldJson as FieldJson[]).filter((f) => !rowOfSched1.test(f.id)), {
  [`${P}txtMonth`]: { required: true },
  [`${P}txtYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  [T(21)]: { compute: sum(15, 16, 17, 18, 19, 20) }, // computeTxt21 sums every non-taxable item, 15 through 20
  [T(22)]: { compute: diff(14, 21) },
  [T(24)]: { compute: diff(22, 23) },
  [T(27)]: { compute: sum(25, 26) },
  [T(30)]: { compute: sum(28, 29) },
  [T(31)]: { compute: diff(27, 30) },
  [T(35)]: { compute: sum(32, 33, 34) },
  [T(36)]: { compute: (r) => read(r, "txtTax31") + read(r, "txtTax35") },
});

FORM_1601Cv2018.group = [SCHED1_1601C];
// BIR's table holds exactly the rows the filer left (Delete drops them), so the blank form's 3 template rows past
// a shorter schedule are not saved
FORM_1601Cv2018.attachment_omit = (_state, groups) => {
  const n = (groups.sched1 ?? []).length;
  if (n === 0 || n >= 3) return [];
  return Array.from({ length: 3 - n }, (_, k) => n + k).flatMap((i) =>
    ["chkScheduleDelete", "txtMonthYear", "txtDatePaid", "txtBankCode", "txtNumber", "txtTaxPaid", "txtShouldTaxDue", "txtAdjustments"].map((c) => (c === "chkScheduleDelete" ? `${c}${i}` : `${SCHED1}${c}${i}`)),
  );
};

export function validate1601Cv2018(state: FormState, _groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1601Cv2018, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) {
    problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  }
  return problem;
}
