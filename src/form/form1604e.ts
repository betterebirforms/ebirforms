// BIR Form 1604E (Annual Information Return of Creditable Income Taxes Withheld — Expanded), P3.
// Two schedules (1, 2), each twelve rows. Per row: TotalAmt = TaxWheld + Pen.
// Per schedule: TaxWheldTotal / PenTotal = Σ rows; Total = TaxWheldTotal + PenTotal. Annual info return.

import fieldJson from "./fields/1604E.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1604e:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const sched = [1, 2];
const rowN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const money = { kind: "money" as const };

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtAgentname`]: { required: true },
  [`${P}txtYear`]: { required: true },
};
for (const s of sched) {
  for (const x of rowN) {
    override[`${P}txtSched${s}TaxWheld${x}`] = money;
    override[`${P}txtSched${s}Pen${x}`] = money;
    override[`${P}txtSched${s}TotalAmt${x}`] = { ...money, compute: (r: Read) => m(r, `txtSched${s}TaxWheld${x}`) + m(r, `txtSched${s}Pen${x}`) };
  }
  override[`${P}txtSched${s}TaxWheldTotal`] = { ...money, compute: (r: Read) => rowN.reduce((t, x) => t + m(r, `txtSched${s}TaxWheld${x}`), 0) };
  override[`${P}txtSched${s}PenTotal`] = { ...money, compute: (r: Read) => rowN.reduce((t, x) => t + m(r, `txtSched${s}Pen${x}`), 0) };
  override[`${P}txtSched${s}Total`] = { ...money, compute: (r: Read) => rowN.reduce((t, x) => t + (m(r, `txtSched${s}TaxWheld${x}`) + m(r, `txtSched${s}Pen${x}`)), 0) };
}

export const FORM_1604E = buildSchema("1604E", "Annual Expanded Withholding Tax Information Return", fieldJson as FieldJson[], override);

export function validate1604E(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1604E, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
