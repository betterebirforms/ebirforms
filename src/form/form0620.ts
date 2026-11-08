// BIR Form 0620 (Monthly Remittance Form of Tax Withheld on the Amount Withdrawn from a Decedent's Deposit), P3.
// Compute (from the legacy compute16/computePenalties/computeRemittance): 16 = 14 − 15; 17D = 17A+17B+17C;
// 18 = (16 < 0) ? 17D : 16 + 17D. The legacy drops a negative item 16 from the total due (a BIR quirk we keep).

import fieldJson from "./fields/0620.json";
import { parseMoney } from "./money.ts";
import { buildSchema, templateValue, validate as validateRequired, type FieldJson, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm0620:";
type Read = (id: string) => string;
const read = (r: Read, item: string): number => parseMoney(r(`${P}txtTax${item}`));
const T = (item: string) => `${P}txtTax${item}`;
const pad2 = (n: number): string => String(n).padStart(2, "0");
// an unset period is saved as BIR's blank-form default (init(): this month and year), so derive from that
const saved = (r: Read, id: string): string => r(`${P}${id}`) || (templateValue("0620", `${P}${id}`) ?? "");
const period = (r: Read): { month: number; year: number } | null => {
  const month = Number(saved(r, "txtMonth"));
  const year = Number(saved(r, "txtYear"));
  return month && year ? { month, year } : null;
};

export const FORM_0620 = buildSchema("0620", "Tax Withheld on Decedent's Deposit", fieldJson as FieldJson[], {
  [`${P}txtMonth`]: { required: true },
  [`${P}txtYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  // setDueDateFromPeriod (onchange of the month, onblur of the year): the due date is the 10th of the month after
  // the return period. Month and year are not inputtable; the day defaults to 10 but stays editable. With no
  // period yet BIR leaves the due fields alone (each reads its own value back).
  [`${P}txtDueMonth`]: {
    compute: (r) => (period(r) ? (period(r)!.month % 12) + 1 : Number(r(`${P}txtDueMonth`)) || 1),
    format: pad2,
  },
  [`${P}txtDueDate`]: { compute: (r) => Number(r(`${P}txtDueDate`)) || 10, format: pad2, is_editable: true },
  [`${P}txtDueYear`]: {
    compute: (r) => (period(r) ? period(r)!.year + (period(r)!.month === 12 ? 1 : 0) : Number(r(`${P}txtDueYear`)) || 0),
    format: (n) => (n ? String(n) : ""),
  },
  [T("14")]: { gate: { on: `${P}AmendedRtn_1`, equals: "true" } },
  [T("15")]: { gate: { on: `${P}AmendedRtn_1`, equals: "true" } },
  [T("16")]: { compute: (r) => read(r, "14") - read(r, "15") },
  [T("17D")]: { compute: (r) => read(r, "17A") + read(r, "17B") + read(r, "17C") },
  [T("18")]: { compute: (r) => (read(r, "16") < 0 ? read(r, "17D") : read(r, "16") + read(r, "17D")) },
});

export function validate0620(state: FormState): Problem[] {
  const problem = validateRequired(FORM_0620, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
