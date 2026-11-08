// BIR Form 1604F (Annual Information Return of Income Payments Subjected to Final Withholding Taxes), P3.
// Three fixed schedules (1–3), each four rows (1–4). Per row b: TotalAmt = TaxWheld + Pen.
// Per schedule s: TaxWheldTotal = Σ TaxWheld; PenTotal = Σ Pen; Total = TaxWheldTotal + PenTotal.
// An annual information return — no overall tax-due/penalty chain.

import fieldJson from "./fields/1604F.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1604f:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const sched = [1, 2, 3];
const rowN = [1, 2, 3, 4];
const money = { kind: "money" as const };

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}tinA`]: { required: true },
  [`${P}tinB`]: { required: true },
  [`${P}tinC`]: { required: true },
  [`${P}branchCode`]: { required: true },
  [`${P}rdoCode`]: { required: true },
  [`${P}registeredName`]: { required: true },
  [`${P}txtYear`]: { required: true },
};
for (const s of sched) {
  for (const b of rowN) {
    override[`${P}txtSched${s}TaxWheld${b}`] = money;
    override[`${P}txtSched${s}Pen${b}`] = money;
    override[`${P}txtSched${s}TotalAmt${b}`] = { ...money, compute: (r: Read) => m(r, `txtSched${s}TaxWheld${b}`) + m(r, `txtSched${s}Pen${b}`) };
  }
  override[`${P}txtSched${s}TaxWheldTotal`] = { ...money, compute: (r: Read) => rowN.reduce((t, b) => t + m(r, `txtSched${s}TaxWheld${b}`), 0) };
  override[`${P}txtSched${s}PenTotal`] = { ...money, compute: (r: Read) => rowN.reduce((t, b) => t + m(r, `txtSched${s}Pen${b}`), 0) };
  override[`${P}txtSched${s}Total`] = { ...money, compute: (r: Read) => m(r, `txtSched${s}TaxWheldTotal`) + m(r, `txtSched${s}PenTotal`) };
}

export const FORM_1604F = buildSchema("1604F", "Annual Final Withholding Tax Information Return", fieldJson as FieldJson[], override);

export function validate1604F(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1604F, state);
  const tin = `${state[`${P}tinA`] ?? ""}${state[`${P}tinB`] ?? ""}${state[`${P}tinC`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}tinA`, message: "The TIN's check digit doesn't match." });
  return problem;
}
