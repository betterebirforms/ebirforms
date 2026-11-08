// BIR Form 0619-F (Monthly Remittance Form for Final Income Taxes Withheld), P3 rewrite.
// Compute (exact centavo): 15 = 13 + 14, 18D = 18A+18B+18C, 17 = 15 − 16, 19 = 17 + 18D.

import fieldJson from "./fields/0619F.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm0619F:";
const read = (r: (id: string) => string, id: string) => parseMoney(r(P + id));

export const FORM_0619F = buildSchema("0619F", "Monthly Remittance (Final)", fieldJson as FieldJson[], {
  [`${P}txtMonth`]: { required: true },
  [`${P}txtYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  [`${P}txtTax15`]: { compute: (r) => read(r, "txtTax13") + read(r, "txtTax14") },
  [`${P}txtTax18D`]: { compute: (r) => read(r, "txtTax18A") + read(r, "txtTax18B") + read(r, "txtTax18C") },
  [`${P}txtTax17`]: { compute: (r) => read(r, "txtTax15") - read(r, "txtTax16") },
  [`${P}txtTax19`]: { compute: (r) => read(r, "txtTax17") + read(r, "txtTax18D") },
});

export function validate0619F(state: FormState): Problem[] {
  const problem = validateRequired(FORM_0619F, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) {
    problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  }
  return problem;
}
