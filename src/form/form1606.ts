// BIR Form 1606 (Withholding Tax Remittance Return for Onerous Transfer of Real Property — Creditable), P3.
// Sibling of 1706 (CGT) but with a VARIABLE creditable rate and a two-combination FMVLI.
//   FMVLI = max(land+improvements, zonal+bir)
//   base (txtTax): default max(Gross, FMVLI); _4 (auction) → max(FMVLI, Bid); _3 (installment) → Installment;
//                  _2/_5 (other) → Others28E   (applied in order, last match wins)
//   txtTaxR = base × txtTaxRate% ; txtTaxDue = txtTaxR − less ; penalties = surcharge+interest+compromise ;
//   txtTotal = taxDue + penalties.

import fieldJson from "./fields/1606.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1606:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const numv = (r: Read, id: string): number => {
  const n = Number(String(r(`${P}${id}`)).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const checked = (r: Read, id: string): boolean => r(`${P}${id}`) === "true";
const fmvli = (r: Read): number => Math.max(m(r, "txtFMVLand") + m(r, "txtFMVImprovements"), m(r, "txtFMVZonal") + m(r, "txtFMVBIR"));
const base = (r: Read): number => {
  let b = Math.max(m(r, "txtGross"), fmvli(r));
  if (checked(r, "j_id395:_4")) b = Math.max(fmvli(r), m(r, "txtBid"));
  if (checked(r, "j_id395:_3")) b = m(r, "txtInstallment");
  if (checked(r, "j_id395:_2") || checked(r, "j_id395:_5")) b = m(r, "txtOthers28E");
  return b;
};
const money = { kind: "money" as const };
const tickWith = (field: string) => (r: Read, v: string): string => (r(`${P}${field}`).trim() !== "" ? "true" : v);
const refundOption = (r: Read, v: string): string => (m(r, "txtTotal") < 0 ? v : "false");
const input = (ids: string[]): Record<string, Partial<FieldSpec>> => Object.fromEntries(ids.map((id) => [`${P}${id}`, money]));

export const FORM_1606 = buildSchema("1606", "Creditable WHT — Transfer of Real Property", fieldJson as FieldJson[], {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtBuyerName`]: { required: true },
  [`${P}txtDateMonth`]: { required: true },
  [`${P}txtDateYear`]: { required: true },
  ...input(["txtFMVLand", "txtFMVImprovements", "txtFMVZonal", "txtFMVBIR", "txtGross", "txtBid", "txtInstallment", "txtOthers28E", "txtLess", "txtSurcharge", "txtInterest", "txtCompromise"]),
  // item 31 is a <select> (0 / 1.5 / 3 / 5 / 6 %), not an amount
  [`${P}txtTaxRate`]: { kind: "select" },
  // tickCheckboxWithValue: blurring an FMV input ticks its 27A–27D box unconditionally, so an entered value has it ticked
  [`${P}opt27A`]: { derive: tickWith("txtFMVLand") },
  [`${P}opt27B`]: { derive: tickWith("txtFMVImprovements") },
  [`${P}opt27C`]: { derive: tickWith("txtFMVZonal") },
  [`${P}opt27D`]: { derive: tickWith("txtFMVBIR") },
  [`${P}txtFMVLI`]: { ...money, compute: fmvli },
  [`${P}txtTax`]: { ...money, compute: base }, // taxable base
  // BIR's float order: formatCurrency(tax × rate × 1 / 100)
  [`${P}txtTaxR`]: { ...money, compute: (r) => parseMoney(((base(r) / 100) * numv(r, "txtTaxRate") * 1) / 100) },
  [`${P}txtTaxDue`]: { ...money, compute: (r) => m(r, "txtTaxR") - m(r, "txtLess") },
  [`${P}txtTotalPenalties`]: { ...money, compute: (r) => m(r, "txtSurcharge") + m(r, "txtInterest") + m(r, "txtCompromise") },
  [`${P}txtTotal`]: { ...money, compute: (r) => m(r, "txtTaxDue") + m(r, "txtTotalPenalties") },
  // computeOfTotalAmtDue: the refund / TCC option only stands for an overpayment (item 36 < 0); otherwise BIR unchecks both
  [`${P}opt37:_1`]: { derive: refundOption },
  [`${P}opt37:_2`]: { derive: refundOption },
});

export function validate1606(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1606, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
