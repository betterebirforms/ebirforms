// BIR Form 1707 (Capital Gains Tax Return for Onerous Transfer of Shares of Stock Not Traded Through the LSE),
// P3. Two dynamic schedules reconstructed by chxSched<i> marker counting (first_index 0, no size field):
//   Schedule 1 (share transactions) → txtTax = Σ txtSched1TaxableBase (net capital gain)
//   Schedule 2 (tax credits/payments) → txtLess = Σ txtSched2Amt
// Chain: netCap = txtTax − txtLess; taxDue (pre-TRAIN bracket) = netCap>100k ? (netCap−100k)×10% + 5000 : ×5%;
//   taxPayable = taxDue − txtLess2 (treaty relief swaps in txtTaxDue2); total = penalties + taxPayable.

import fieldJson from "./fields/1707.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1707:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const bracket = (netCents: number): number => {
  const v = netCents / 100;
  return parseMoney(v > 100000 ? (v - 100000) * 0.1 + 5000 : v * 0.05);
};

export const SCHEDULE1_1707: GroupSpec = {
  name: "sched1",
  first_index: 0,
  row: [
    { id: "chxSched1", kind: "checkbox" }, // marker the reload counts
    { id: "txtSched1CorpStockName", kind: "text" },
    { id: "txtSched1StockCertNum", kind: "text" },
    { id: "txtSched1NumOfShares", kind: "text" },
    { id: "txtSched1TaxableBase", kind: "money" },
  ],
  total: { into: `${P}txtTax`, of: "txtSched1TaxableBase" },
};
export const SCHEDULE2_1707: GroupSpec = {
  name: "sched2",
  first_index: 0,
  row: [
    { id: "chxSched2", kind: "checkbox" },
    { id: "txtSched2Particulars", kind: "text" },
    { id: "txtSched2Amt", kind: "money" },
  ],
  total: { into: `${P}txtLess`, of: "txtSched2Amt" },
};

const scalarField = (fieldJson as FieldJson[]).filter((f) => !/^(chxSched[12]|txtSched1(CorpStockName|StockCertNum|NumOfShares|TaxableBase)|txtSched2(Particulars|Amt))\d+$/.test(f.id));

export const FORM_1707 = buildSchema("1707", "Capital Gains Tax — Shares Not Traded", scalarField, {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtDateMonth`]: { required: true },
  [`${P}txtDateYear`]: { required: true },
  [`${P}txtNetCap`]: { kind: "money", compute: (r) => m(r, "txtTax") - m(r, "txtLess") },
  [`${P}txtTaxDue`]: { kind: "money", compute: (r) => bracket(m(r, "txtTax") - m(r, "txtLess")) },
  [`${P}txtLess2`]: { kind: "money" },
  [`${P}txtTaxPayable`]: { kind: "money", compute: (r) => (r(`${P}TaxRelief_IS`) === "true" ? m(r, "txtTaxDue2") - m(r, "txtLess2") : bracket(m(r, "txtTax") - m(r, "txtLess")) - m(r, "txtLess2")) },
  [`${P}txtSurcharge`]: { kind: "money" },
  [`${P}txtInterest`]: { kind: "money" },
  [`${P}txtCompromise`]: { kind: "money" },
  [`${P}txtTotalPenalties`]: { kind: "money", compute: (r) => m(r, "txtSurcharge") + m(r, "txtInterest") + m(r, "txtCompromise") },
  [`${P}txtTotal`]: { kind: "money", compute: (r) => m(r, "txtTotalPenalties") + m(r, "txtTaxPayable") },
});
FORM_1707.group = [SCHEDULE1_1707, SCHEDULE2_1707];

export function validate1707(state: FormState, _groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1707, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
