// BIR Form 1706 (Capital Gains Tax Return — Onerous Transfer of Real Property Classified as Capital Asset), P3.
// Taxable base (txtTax) is selected by the nature-of-transaction radios, over FMV/Gross/Bid/Installment/Others:
//   FMVLI = greatest of (land+improv, zonal+bir, improv+zonal, land+bir)
//   default base = max(Gross, FMVLI); _4 (auction) → max(FMVLI, Bid, Gross); _3 (installment) → Installment;
//   _2/_5 (other) → Others30F; opt30E → Others30E   (applied in order, last match wins)
// Then: tax (txtRate) = base × 6% ; taxDue = tax − less ; penalties = surcharge+interest+compromise ;
//       total = taxDue + penalties.

import fieldJson from "./fields/1706.json";
import { formatMoney, parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1706:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const checked = (r: Read, id: string): boolean => r(`${P}${id}`) === "true";
// FMV land/improvement: greatest of the four two-way combinations (centavos)
const fmvli = (r: Read): number => Math.max(
  m(r, "txtFMVLand") + m(r, "txtFMVImprovements"),
  m(r, "txtFMVZonal") + m(r, "txtFMVBIR"),
  m(r, "txtFMVImprovements") + m(r, "txtFMVZonal"),
  m(r, "txtFMVLand") + m(r, "txtFMVBIR"),
);
// taxable base in centavos, per the nature-of-transaction radios (later matches override earlier)
const base = (r: Read): number => {
  let b = Math.max(m(r, "txtGross"), fmvli(r));
  if (checked(r, "j_id395:_4")) b = Math.max(fmvli(r), m(r, "txtBid"), m(r, "txtGross"));
  if (checked(r, "j_id395:_3")) b = m(r, "txtInstallment");
  if (checked(r, "j_id395:_2") || checked(r, "j_id395:_5")) b = m(r, "txtOthers30F");
  if (checked(r, "opt30E")) b = m(r, "txtOthers30E");
  return b;
};
const money = { kind: "money" as const };
// Items 29A–29D, in the order of their boxes opt29A–D (A land, B improvements, C zonal, D BIR).
const FMV = ["txtFMVLand", "txtFMVImprovements", "txtFMVZonal", "txtFMVBIR"];
// BIR bug (blockletter): these four inputs run parseFloat(value).toFixed(2) on every blur BEFORE round() adds the
// commas, so a saved "92,769.63" re-blurred on reload becomes "92.00" (parseFloat stops at the comma) and FMVLI,
// the base and the tax drop with it. Native writes them comma-free ("92769.63"), which every blur leaves at the
// same amount ("92,769.63") and NumWithComma reads identically.
const plainAmount = (_r: Read, v: string): string => (v.trim() === "" ? v : formatMoney(parseMoney(v)).replace(/,/g, ""));
const refundOption = (r: Read, v: string): string => (m(r, "txtTotal") < 0 ? v : "false");
const input = (ids: string[]): Record<string, Partial<FieldSpec>> => Object.fromEntries(ids.map((id) => [`${P}${id}`, money]));

export const FORM_1706 = buildSchema("1706", "Capital Gains Tax — Real Property", fieldJson as FieldJson[], {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtSellerName`]: { required: true },
  [`${P}txtDateMonth`]: { required: true },
  [`${P}txtDateYear`]: { required: true },
  ...input(["txtFMVLand", "txtFMVImprovements", "txtFMVZonal", "txtFMVBIR", "txtGross", "txtBid", "txtInstallment", "txtOthers30F", "txtOthers30E", "txtLess", "txtSurcharge", "txtInterest", "txtCompromise"]),
  ...Object.fromEntries(FMV.map((id) => [`${P}${id}`, { ...money, derive: plainAmount }])),
  [`${P}txtFMVLI`]: { ...money, compute: fmvli },
  [`${P}txtTax`]: { ...money, compute: base }, // taxable base
  [`${P}txtRate`]: { ...money, compute: (r) => parseMoney((base(r) / 100) * 0.06) }, // tax = base × 6%
  [`${P}txtTaxDue`]: { ...money, compute: (r) => m(r, "txtRate") - m(r, "txtLess") },
  [`${P}txtTotalPenalties`]: { ...money, compute: (r) => m(r, "txtSurcharge") + m(r, "txtInterest") + m(r, "txtCompromise") },
  [`${P}txtTotal`]: { ...money, compute: (r) => m(r, "txtTaxDue") + m(r, "txtTotalPenalties") },
  // computeOfTotalAmtDue: the refund / TCC option only stands for an overpayment (item 36 < 0); otherwise BIR unchecks both
  [`${P}opt37:_1`]: { derive: refundOption },
  [`${P}opt37:_2`]: { derive: refundOption },
});
// The 29A–29D boxes (missing from the extracted field list): tickCheckboxWithValue ticks one when its FMV input is > 0.
FORM_1706.field.push(
  ...(["opt29A", "opt29B", "opt29C", "opt29D"] as const).map((id, i) => ({
    id: `${P}${id}`,
    kind: "checkbox" as const,
    derive: (r: Read, v: string) => (m(r, FMV[i]!) > 0 ? "true" : v),
  })),
);

export function validate1706(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1706, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
