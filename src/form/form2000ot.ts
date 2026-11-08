// BIR Form 2000OT (Documentary Stamp Tax Declaration / Return — One-Time Transactions), P3.
// FMV schedule: 1C=1A+1B, 2C=2A+2B, 3A=1A+2B, 4A=1B+2A; the taxable base 12F = max of those four.
// DST due (txt16) depends on the nature of transaction (radio) and the ATC rate code (txt15 string):
//   property (NatureOfTrans_1/_2) → base txt13 ; shares (NatureOfTrans_3) → base txt14
//   "P1.50/P200" → base ÷ 200 × 1.50 ; "P15/1000" → ceil(base ÷ 1000) × 15 ; "0.5" → base × 0.50
// Then: taxDue = 16 − less ; 19D = 19A+19B+19C ; 20 = 19D + taxDue.
// Note: date fields use the sibling prefix frm2000_OT:, the rest use frm2000OT:.

import fieldJson from "./fields/2000OT.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2000OT:";
const PD = "frm2000_OT:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const numv = (r: Read, id: string): number => {
  const n = Number(String(r(`${P}${id}`)).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
// FMV combinations (in centavos)
const comboMax = (r: Read): number => {
  const c = [m(r, "txtSched1A") + m(r, "txtSched1B"), m(r, "txtSched2A") + m(r, "txtSched2B"), m(r, "txtSched1A") + m(r, "txtSched2B"), m(r, "txtSched1B") + m(r, "txtSched2A")];
  return Math.max(...c);
};
// DST due from the ATC rate code applied to the nature-of-transaction base (pesos)
const dstDue = (r: Read): number => {
  const property = r(`${P}NatureOfTrans_1`) === "true" || r(`${P}NatureOfTrans_2`) === "true";
  const shares = r(`${P}NatureOfTrans_3`) === "true";
  const base = property ? numv(r, "txtTax13") : shares ? numv(r, "txtTax14") : 0;
  if (base <= 0) return 0;
  switch (String(r(`${P}txtTax15`)).trim()) {
    case "P1.50/P200": return parseMoney((base / 200) * 1.5);
    case "P15/1000": return parseMoney(Math.ceil(base / 1000) * 15);
    case "0.5": return parseMoney(base * 0.5);
    default: return 0;
  }
};
const money = { kind: "money" as const };

export const FORM_2000OT = buildSchema("2000OT", "DST Declaration — One-Time Transactions", fieldJson as FieldJson[], {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  [`${PD}txtDateMonth`]: { required: true },
  [`${PD}txtDateYear`]: { required: true },
  [`${P}txtSched1A`]: money,
  [`${P}txtSched1B`]: money,
  [`${P}txtSched2A`]: money,
  [`${P}txtSched2B`]: money,
  [`${P}txtSched1C`]: { ...money, compute: (r) => m(r, "txtSched1A") + m(r, "txtSched1B") },
  [`${P}txtSched2C`]: { ...money, compute: (r) => m(r, "txtSched2A") + m(r, "txtSched2B") },
  [`${P}txtSched3A`]: { ...money, compute: (r) => m(r, "txtSched1A") + m(r, "txtSched2B") },
  [`${P}txtSched4A`]: { ...money, compute: (r) => m(r, "txtSched1B") + m(r, "txtSched2A") },
  [`${P}txtSched5A`]: { ...money, compute: comboMax },
  [`${P}txt12F`]: { ...money, compute: comboMax },
  // 13 / 14 are read-only tax bases BIR derives on every blur of 12E / 12K / 12L (TaxBaseRealProperty /
  // TaxBaseStocks): the larger of 12E (zonal / assessed value) and 12F (FMV per schedule), and the larger of
  // 12K (par value) and 12L (DST on original issue)
  [`${P}txt12E`]: money,
  [`${P}txt12K`]: money,
  [`${P}txt12L`]: money,
  [`${P}txtTax13`]: { ...money, compute: (r) => Math.max(m(r, "txt12E"), m(r, "txt12F")) },
  [`${P}txtTax14`]: { ...money, compute: (r) => Math.max(m(r, "txt12K"), m(r, "txt12L")) },
  [`${P}txtTax16`]: { ...money, compute: dstDue },
  [`${P}txtLess`]: money,
  [`${P}txtTaxDue`]: { ...money, compute: (r) => m(r, "txtTax16") - m(r, "txtLess") },
  [`${P}txtTax19A`]: money,
  [`${P}txtTax19B`]: money,
  [`${P}txtTax19C`]: money,
  [`${P}txtTax19D`]: { ...money, compute: (r) => m(r, "txtTax19A") + m(r, "txtTax19B") + m(r, "txtTax19C") },
  [`${P}txtTax20`]: { ...money, compute: (r) => m(r, "txtTax19D") + m(r, "txtTaxDue") },
} as Record<string, Partial<FieldSpec>>);

export function validate2000OT(state: FormState): Problem[] {
  const problem = validateRequired(FORM_2000OT, state);
  const nature = [1, 2, 3].some((n) => state[`${P}NatureOfTrans_${n}`] === "true");
  if (!nature) problem.push({ id: `${P}NatureOfTrans_1`, message: "Select the nature of the transaction." });
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
