// BIR Form 1604CF (Annual Information Return of Income Taxes Withheld on Compensation and Final Withholding
// Taxes), P3. Four schedules: 1 (12 rows, with Adjustment), 2 & 3 (12 rows), 4 (4 rows).
//   per row b: TotalAmt = TaxWheld + Pen (+ Adj on schedule 1)
//   TaxWheldTotal / PenTotal = Σ rows;  AdjTotal (sched 1) = Σ Adj
//   schedule Total: sched 1 = Σ of the row TotalAmt that are > 0 (legacy excludes non-positive rows);
//                   others   = TaxWheldTotal + PenTotal
// An annual info return — no page-1 tax chain.

import fieldJson from "./fields/1604CF.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1604cf:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const sched: Array<{ s: number; rows: number[]; adj: boolean }> = [
  { s: 1, rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], adj: true },
  { s: 2, rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], adj: false },
  { s: 3, rows: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], adj: false },
  { s: 4, rows: [1, 2, 3, 4], adj: false },
];
const rowTotal = (r: Read, s: number, b: number, adj: boolean): number =>
  m(r, `txtSched${s}TaxWheld${b}`) + m(r, `txtSched${s}Pen${b}`) + (adj ? m(r, `txtSched${s}Adj${b}`) : 0);
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
for (const { s, rows, adj } of sched) {
  for (const b of rows) {
    override[`${P}txtSched${s}TaxWheld${b}`] = money;
    override[`${P}txtSched${s}Pen${b}`] = money;
    if (adj) override[`${P}txtSched${s}Adj${b}`] = money;
    override[`${P}txtSched${s}TotalAmt${b}`] = { ...money, compute: (r: Read) => rowTotal(r, s, b, adj) };
  }
  override[`${P}txtSched${s}TaxWheldTotal`] = { ...money, compute: (r: Read) => rows.reduce((t, b) => t + m(r, `txtSched${s}TaxWheld${b}`), 0) };
  override[`${P}txtSched${s}PenTotal`] = { ...money, compute: (r: Read) => rows.reduce((t, b) => t + m(r, `txtSched${s}Pen${b}`), 0) };
  if (adj) {
    override[`${P}txtSched${s}AdjTotal`] = { ...money, compute: (r: Read) => rows.reduce((t, b) => t + m(r, `txtSched${s}Adj${b}`), 0) };
    // schedule 1 total: sum only rows whose TotalAmt is positive, like the legacy
    override[`${P}txtSched${s}Total`] = { ...money, compute: (r: Read) => rows.reduce((t, b) => t + Math.max(rowTotal(r, s, b, adj), 0), 0) };
  } else {
    override[`${P}txtSched${s}Total`] = { ...money, compute: (r: Read) => m(r, `txtSched${s}TaxWheldTotal`) + m(r, `txtSched${s}PenTotal`) };
  }
}

export const FORM_1604CF = buildSchema("1604CF", "Annual Compensation & Final Withholding Tax Information Return", fieldJson as FieldJson[], override);

export function validate1604CF(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1604CF, state);
  const category = state[`${P}categoryAgent_1`] === "true" || state[`${P}categoryAgent_2`] === "true";
  if (!category) problem.push({ id: `${P}categoryAgent_1`, message: "Select the category of withholding agent." });
  const tin = `${state[`${P}tinA`] ?? ""}${state[`${P}tinB`] ?? ""}${state[`${P}tinC`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}tinA`, message: "The TIN's check digit doesn't match." });
  return problem;
}
