// BIR Form 1604C (Annual Information Return of Income Taxes Withheld on Compensation), P3.
// A single twelve-row Schedule 1 with an Adjustment column. Per row b: TotalAmt = TaxWheld + Pen + Adj.
// Column totals: TaxWheldTotal / PenTotal / AdjTotal = Σ(1..12). Schedule Total = Σ of the row TotalAmt that
// are > 0 (the legacy excludes non-positive rows — replicated). An annual info return; no page-1 tax chain.

import fieldJson from "./fields/1604C.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1604c:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const rowN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
// per-row total (self-contained, order-independent): tax withheld + penalty + adjustment
const rowTotal = (r: Read, b: number): number => m(r, `txtSched1TaxWheld${b}`) + m(r, `txtSched1Pen${b}`) + m(r, `txtSched1Adj${b}`);
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
for (const b of rowN) {
  override[`${P}txtSched1TaxWheld${b}`] = money;
  override[`${P}txtSched1Pen${b}`] = money;
  override[`${P}txtSched1Adj${b}`] = money;
  override[`${P}txtSched1TotalAmt${b}`] = { ...money, compute: (r: Read) => rowTotal(r, b) };
}
override[`${P}txtSched1TaxWheldTotal`] = { ...money, compute: (r: Read) => rowN.reduce((t, b) => t + m(r, `txtSched1TaxWheld${b}`), 0) };
override[`${P}txtSched1PenTotal`] = { ...money, compute: (r: Read) => rowN.reduce((t, b) => t + m(r, `txtSched1Pen${b}`), 0) };
override[`${P}txtSched1AdjTotal`] = { ...money, compute: (r: Read) => rowN.reduce((t, b) => t + m(r, `txtSched1Adj${b}`), 0) };
// schedule total: sum only the rows whose TotalAmt is positive, exactly like the legacy
override[`${P}txtSched1Total`] = { ...money, compute: (r: Read) => rowN.reduce((t, b) => t + Math.max(rowTotal(r, b), 0), 0) };

export const FORM_1604C = buildSchema("1604C", "Annual Compensation Withholding Tax Information Return", fieldJson as FieldJson[], override);

export function validate1604C(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1604C, state);
  const category = state[`${P}categoryAgent_1`] === "true" || state[`${P}categoryAgent_2`] === "true";
  if (!category) problem.push({ id: `${P}categoryAgent_1`, message: "Select the category of withholding agent." });
  const tin = `${state[`${P}tinA`] ?? ""}${state[`${P}tinB`] ?? ""}${state[`${P}tinC`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}tinA`, message: "The TIN's check digit doesn't match." });
  return problem;
}
