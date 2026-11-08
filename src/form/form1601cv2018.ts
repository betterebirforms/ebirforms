// BIR Form 1601-C v2018 (Monthly Remittance Return of Income Taxes Withheld on Compensation), P3 rewrite.
// Compute (exact centavo): 21=15+16+17+18+19+20, 22=14−21, 24=22−23, 27=25+26, 30=28+29, 31=27−30, 35=32+33+34, 36=31+35.

import fieldJson from "./fields/1601Cv2018.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1601c:";
const read = (r: (id: string) => string, id: string) => parseMoney(r(P + id));
const T = (n: number) => `${P}txtTax${n}`;
const sum = (...n: number[]) => (r: (id: string) => string) => n.reduce((s, i) => s + read(r, `txtTax${i}`), 0);
const diff = (a: number, b: number) => (r: (id: string) => string) => read(r, `txtTax${a}`) - read(r, `txtTax${b}`);

export const FORM_1601Cv2018 = buildSchema("1601Cv2018", "Income Taxes Withheld on Compensation", fieldJson as FieldJson[], {
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

export function validate1601Cv2018(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1601Cv2018, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) {
    problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  }
  return problem;
}
