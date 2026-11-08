// BIR Form 0619-E (Monthly Remittance Form for Creditable Income Taxes Withheld — Expanded), P3 rewrite.
// Compute (exact centavo, fixing BIR's float): 16 = 14 − 15, 17D = 17A+17B+17C, 18 = 16 + 17D.
// Field list is extracted from the legacy form (src/form/fields/0619E.json); the compute graph and
// validation are authored here. Proven byte-compatible by test/form0619e.test.ts against the legacy form.

import fieldJson from "./fields/0619E.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm0619E:";
const read = (r: (id: string) => string, id: string) => parseMoney(r(P + id));

export const FORM_0619E = buildSchema("0619E", "Monthly Remittance (Expanded)", fieldJson as FieldJson[], {
  [`${P}txtMonth`]: { required: true },
  [`${P}txtYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  // net amount of remittance = tax withheld for the quarter − tax remitted
  [`${P}txtTax16`]: { compute: (r) => read(r, "txtTax14") - read(r, "txtTax15") },
  // total penalties = surcharge + interest + compromise
  [`${P}txtTax17D`]: { compute: (r) => read(r, "txtTax17A") + read(r, "txtTax17B") + read(r, "txtTax17C") },
  // total amount still due = net remittance + penalties
  [`${P}txtTax18`]: { compute: (r) => read(r, "txtTax16") + read(r, "txtTax17D") },
});

export function validate0619E(state: FormState): Problem[] {
  const problem = validateRequired(FORM_0619E, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) {
    problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  }
  return problem;
}
