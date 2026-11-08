// BIR Form 1800 v2018 (Donor's Tax Return — TRAIN), P3. Flat 6% on net gifts above a ₱250,000 annual
// exemption (TRAIN replaced the pre-TRAIN graduated / 30%-stranger scheme that the older form1800.ts models).
// Three live dynamic schedules, each reconstructed by field-occurrence splitting (j % 2 != 0), NOT marker
// counting:
//   Schedule A (personal property)  → Σ txtFairMarketValue → schedA:txtTotalPayment1 → PersonalProperties
//   Schedule B-2 (real property)     → Σ txtFairMarketValue → schedB2:txtTotal       → RealProperties
//   Schedule B-1 (real-property detail) — descriptive only (OCT/TaxDec/Location/…), feeds no total.
// Scalar chain (compute27/33/34/36/38/16/17D/18/penalties/total):
//   27: TotalGifts = PersonalProperties + RealProperties
//   33: TotalDeductionsAllowed = Σ DeductionAmt1..5   (⚠ those inputs carry id txtDeductionAmount28..32 but
//       name DeductionAmt1..5; the legacy reads them by NAME via IE's getElementById-matches-name quirk, but
//       saveXML serializes by ID — so the savefile keys, and ours, are txtDeductionAmount28..32.)
//   34: TotalReturnNetGifts = TotalGifts − TotalDeductionsAllowed
//   36: TotalNetGifts36 = TotalReturnNetGifts + TotalPriorNetGifts
//   38: TotalNetGiftsSubjectToTax = TotalNetGifts36 − 250000 ; TotalNetGifts := TotalNetGiftsSubjectToTax
//   16: DonorTaxDue = TotalNetGifts × 6%
//   17D: TaxCredit17D = 17A + 17B + 17C ; 18: txtTaxPayable = DonorTaxDue − TaxCredit17D
//   penalties = Surcharge + Interest + Compromise ; TotalAmountPayable = txtTaxPayable + penalties
// ⚠ The legacy subtracts the 250k exemption UNCONDITIONALLY with no floor, so net gifts below 250k yield a
// NEGATIVE tax due (a BIR defect). We replicate it byte-for-byte; see test/form1800v2018.test.ts.
// NOTE: the compute-target fields are NOT in dependency order in the DOM (TotalNetGifts/DonorTaxDue sit on
// page 1, their inputs on the schedule page), so every compute derives from BASE inputs (injected group
// totals + user inputs), never from a sibling computed field that may not be ready in the single DOM-order pass.

import fieldJson from "./fields/1800v2018.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1800v2018:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));

// base aggregates, each derived purely from injected group totals + user inputs (DOM-order-independent)
const personal = (r: Read): number => m(r, "PersonalProperties");
const real = (r: Read): number => m(r, "RealProperties");
const totalGifts = (r: Read): number => personal(r) + real(r);
const totalDeduct = (r: Read): number =>
  m(r, "txtDeductionAmount28") + m(r, "txtDeductionAmount29") + m(r, "txtDeductionAmount30") + m(r, "txtDeductionAmount31") + m(r, "txtDeductionAmount32");
const returnNetGifts = (r: Read): number => totalGifts(r) - totalDeduct(r);
const netGifts36 = (r: Read): number => returnNetGifts(r) + m(r, "TotalPriorNetGifts");
const netSubject = (r: Read): number => netGifts36(r) - 25_000_000; // minus ₱250,000 (no floor — faithful to legacy)
const donorTax = (r: Read): number => parseMoney((netSubject(r) / 100) * 0.06);
const credit17D = (r: Read): number => m(r, "TaxCredit17A") + m(r, "TaxCredit17B") + m(r, "TaxCredit17C");
const taxPayable = (r: Read): number => donorTax(r) - credit17D(r);
const penalties = (r: Read): number => m(r, "Surcharge") + m(r, "Interest") + m(r, "Compromise");

export const SCHEDA_1800V2018: GroupSpec = {
  name: "schedA",
  first_index: 0,
  row: [
    { id: `${P}schedA:txtParticulars`, kind: "text" },
    { id: `${P}schedA:txtFairMarketValue`, kind: "money" },
  ],
  total: [
    { into: `${P}schedA:txtTotalPayment1`, of: `${P}schedA:txtFairMarketValue` },
    { into: `${P}PersonalProperties`, of: `${P}schedA:txtFairMarketValue` },
  ],
};
export const SCHEDB2_1800V2018: GroupSpec = {
  name: "schedB2",
  first_index: 0,
  row: [
    { id: `${P}schedB2:txtArea`, kind: "text" },
    { id: `${P}schedB2:txtFTD`, kind: "text" },
    { id: `${P}schedB2:txtFMVperTDperBIRZonalValue`, kind: "text" },
    { id: `${P}schedB2:txtFairMarketValue`, kind: "money" },
  ],
  total: [
    { into: `${P}schedB2:txtTotal`, of: `${P}schedB2:txtFairMarketValue` },
    { into: `${P}RealProperties`, of: `${P}schedB2:txtFairMarketValue` },
  ],
};
export const SCHEDB1_1800V2018: GroupSpec = {
  name: "schedB1",
  first_index: 0,
  row: [
    { id: `${P}schedB1:txtOCT`, kind: "text" },
    { id: `${P}schedB1:txtTaxDecNo`, kind: "text" },
    { id: `${P}schedB1:txtLocation`, kind: "text" },
    { id: `${P}schedB1:txtLotImprovement`, kind: "text" },
    { id: `${P}schedB1:txtClassification`, kind: "text" },
  ],
};

const isRow = (id: string): boolean =>
  /:sched(A|B1|B2|3|4):/.test(id) && /\d+$/.test(id) && !id.includes(":schedA:txtTotalPayment");

const moneyField = new Set(
  [
    "PersonalProperties", "RealProperties", "TotalGifts", "TotalDeductionsAllowed", "TotalReturnNetGifts",
    "TotalPriorNetGifts", "TotalNetGifts36", "TotalNetGiftsSubjectToTax", "TotalNetGifts", "DonorTaxDue",
    "TaxCredit17A", "TaxCredit17B", "TaxCredit17C", "TaxCredit17D", "txtTaxPayable", "Surcharge", "Interest",
    "Compromise", "TotalPenalties", "TotalAmountPayable", "txtDeductionAmount28", "txtDeductionAmount29",
    "txtDeductionAmount30", "txtDeductionAmount31", "txtDeductionAmount32", "schedA:txtTotalPayment1",
    "schedB2:txtTotal",
  ].map((s) => `${P}${s}`),
);

const scalarField = (fieldJson as FieldJson[])
  .filter((f) => !isRow(f.id))
  .map((f) => (moneyField.has(f.id) ? { ...f, kind: "money" as const } : f));

export const FORM_1800V2018 = buildSchema("1800v2018", "Donor's Tax Return (TRAIN)", scalarField, {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtDonorName`]: { required: true },
  [`${P}txtYear`]: { required: true },
  [`${P}TotalGifts`]: { compute: (r) => totalGifts(r) },
  [`${P}TotalDeductionsAllowed`]: { compute: (r) => totalDeduct(r) },
  [`${P}TotalReturnNetGifts`]: { compute: (r) => returnNetGifts(r) },
  [`${P}TotalNetGifts36`]: { compute: (r) => netGifts36(r) },
  [`${P}TotalNetGiftsSubjectToTax`]: { compute: (r) => netSubject(r) },
  [`${P}TotalNetGifts`]: { compute: (r) => netSubject(r) },
  [`${P}DonorTaxDue`]: { compute: (r) => donorTax(r) },
  [`${P}TaxCredit17D`]: { compute: (r) => credit17D(r) },
  [`${P}txtTaxPayable`]: { compute: (r) => taxPayable(r) },
  [`${P}TotalPenalties`]: { compute: (r) => penalties(r) },
  [`${P}TotalAmountPayable`]: { compute: (r) => taxPayable(r) + penalties(r) },
  // BIR bug: string-util.js defines capital() twice; the zero-argument one wins, so the onblur of every name and
  // address box ("capital(this, event)") uppercases EVERY text input in the form, including this read-only DS106
  // prompt label, which saveXML then writes. Any session that touches a name or address saves it uppercased.
  [`${P}modLabel`]: { compute: () => 0, format: () => "IS THE TERM OF DEBT INSTRUMENT LESS THAN A YEAR?" },
});
// BIR bug, not reproducible in a file: compute18() and computeTotalAmtPayable() call each other forever, so every
// blur of 17A / 17B / surcharge / interest / compromise ends in "Maximum call stack size exceeded" (each pass has
// already written the right values, so the saved figures are unaffected).
FORM_1800V2018.group = [SCHEDA_1800V2018, SCHEDB2_1800V2018, SCHEDB1_1800V2018];

export function validate1800v2018(state: FormState, _groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1800V2018, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
