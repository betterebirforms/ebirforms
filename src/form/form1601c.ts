// BIR Form 1601C (Monthly Remittance Return of Income Taxes Withheld on Compensation — pre-TRAIN), P3.
// Two prior-month-adjustment structures feed item 19/26, plus the main remittance chain:
//   • A FIXED 3-row radio sub-section (SectionA:…Radio1..3): per row, a Month/Year radio (SelMonthYear{i}_1 = M)
//     routes (ShouldTaxDue − TaxPaid) into TxtCurrentYearRadio{i} (month) or TxtFromYearEndRadio{i} (year).
//     summationTax7a = Σ (ShouldTaxDueRadio − TaxPaidRadio) over the 3 rows.
//   • A DYNAMIC modal Section A (tbllistSectionA) reconstructed by counting checkSectionADelete{i} markers
//     (0-indexed), then loadData fills rows by id. Per row the same M/Y branch; the two column sums combine into
//     txtDvTotalAmount7a7b = Σ (ShouldTaxDue − TaxPaid) over modal rows.
// Items (verbatim from the legacy compute fns):
//   17 = 15 − (16A+16B+16C)            [computeAmountOfCompensation]
//   19 = 26 = summationTax7a + txtDvTotalAmount7a7b     [computeSectionA/Radio + computeOverall26TotalAmount]
//   20 = 18 + 19 ; 22 = 21A + 21B ; 23 = 20 − 22       [computeTaxDue]
//   24D = 24A + 24B + 24C ; 25 = 23 + 24D              [computePenalties + computeTaxAmountStillDue]
// 21A is gated on an amended return (j_id217:_1 = Yes), matching changeAmended().

import fieldJson from "./fields/1601c.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1601c:";
const SA = `${P}SectionA:`;
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`)); // prefixed scalar
const mp = (r: Read, id: string): number => parseMoney(r(id)); // full-id read
const adj = (read: (s: string) => string, std: string, tp: string): number => parseMoney(read(std)) - parseMoney(read(tp));

export const SECTIONA_1601C: GroupSpec = {
  name: "sectionA",
  first_index: 0, // modal rows reconstruct 0-indexed
  row: [
    { id: "checkSectionADelete", kind: "checkbox" }, // the reload counts this marker
    { id: `${SA}SelMonthYear`, kind: "text" }, // select value "M" | "Y"
    { id: `${SA}TxtMonthYear`, kind: "text" },
    { id: `${SA}TxtDatePaid`, kind: "text" },
    { id: `${SA}TxtRORNo`, kind: "text" },
    { id: `${SA}TxtBankCode`, kind: "text" },
    { id: `${SA}TxtTaxPaid`, kind: "money" },
    { id: `${SA}TxtShouldTaxDue`, kind: "money" },
    { id: `${SA}TxtCurrentYear`, kind: "money", row_compute: (read) => (read(`${SA}SelMonthYear`) === "M" ? adj(read, `${SA}TxtShouldTaxDue`, `${SA}TxtTaxPaid`) : 0) },
    { id: `${SA}TxtFromYearEnd`, kind: "money", row_compute: (read) => (read(`${SA}SelMonthYear`) === "M" ? 0 : adj(read, `${SA}TxtShouldTaxDue`, `${SA}TxtTaxPaid`)) },
  ],
  total: [
    { into: `${P}_tmpModalCY`, of: `${SA}TxtCurrentYear` },
    { into: `${P}_tmpModalFYE`, of: `${SA}TxtFromYearEnd` },
  ],
};

const isMonth = (r: Read, i: number): boolean => r(`${SA}SelMonthYear${i}_1`) === "true";
const radioAdj = (r: Read, i: number): number => mp(r, `${SA}TxtShouldTaxDueRadio${i}`) - mp(r, `${SA}TxtTaxPaidRadio${i}`);
const radioSum = (r: Read): number => [1, 2, 3].reduce((s, i) => s + radioAdj(r, i), 0);
const modalTotal = (r: Read): number => m(r, "_tmpModalCY") + m(r, "_tmpModalFYE");
const item19 = (r: Read): number => radioSum(r) + modalTotal(r);

const moneyField = new Set<string>([
  ...["txtTax15", "txtTax16A", "txtTax16B", "txtTax16C", "txtTax17", "txtTax18", "txtTax19", "txtTax20", "txtTax21A",
    "txtTax21B", "txtTax22", "txtTax23", "txtTax24A", "txtTax24B", "txtTax24C", "txtTax24D", "txtTax25", "txtTax26"].map((s) => `${P}${s}`),
  "txtDvTotalAmount7a7b",
  ...[1, 2, 3].flatMap((i) => [`${SA}TxtTaxPaidRadio${i}`, `${SA}TxtShouldTaxDueRadio${i}`, `${SA}TxtCurrentYearRadio${i}`, `${SA}TxtFromYearEndRadio${i}`]),
]);
const scalarField = (fieldJson as FieldJson[]).map((f) => (moneyField.has(f.id) ? { ...f, kind: "money" as const } : f));

const radioBranch: Record<string, Partial<FieldSpec>> = Object.fromEntries(
  [1, 2, 3].flatMap((i) => [
    [`${SA}TxtCurrentYearRadio${i}`, { kind: "money", compute: (r: Read) => (isMonth(r, i) ? radioAdj(r, i) : 0) }],
    [`${SA}TxtFromYearEndRadio${i}`, { kind: "money", compute: (r: Read) => (isMonth(r, i) ? 0 : radioAdj(r, i)) }],
  ]),
);

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtPayerName`]: { required: true },
  [`${P}txtYear`]: { required: true },
  // fixed radio sub-section: route (ShouldTaxDue − TaxPaid) by the Month/Year radio
  ...radioBranch,
  "txtDvTotalAmount7a7b": { kind: "money", compute: (r) => modalTotal(r) },
  [`${P}txtTax17`]: { kind: "money", compute: (r) => m(r, "txtTax15") - (m(r, "txtTax16A") + m(r, "txtTax16B") + m(r, "txtTax16C")) },
  [`${P}txtTax19`]: { kind: "money", compute: item19 },
  [`${P}txtTax26`]: { kind: "money", compute: item19 },
  [`${P}txtTax20`]: { kind: "money", compute: (r) => m(r, "txtTax18") + m(r, "txtTax19") },
  [`${P}txtTax21A`]: { kind: "money", gate: { on: `${P}j_id217:_1`, equals: "true" } },
  [`${P}txtTax22`]: { kind: "money", compute: (r) => m(r, "txtTax21A") + m(r, "txtTax21B") },
  [`${P}txtTax23`]: { kind: "money", compute: (r) => m(r, "txtTax20") - m(r, "txtTax22") },
  [`${P}txtTax24D`]: { kind: "money", compute: (r) => m(r, "txtTax24A") + m(r, "txtTax24B") + m(r, "txtTax24C") },
  [`${P}txtTax25`]: { kind: "money", compute: (r) => m(r, "txtTax23") + m(r, "txtTax24D") },
};

export const FORM_1601C = buildSchema("1601C", "Monthly Remittance Return — Income Taxes Withheld on Compensation", scalarField, override);
FORM_1601C.group = [SECTIONA_1601C];

export function validate1601c(state: FormState, _groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1601C, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
