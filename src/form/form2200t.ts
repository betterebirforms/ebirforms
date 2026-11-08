// BIR Form 2200Tv2020 (Excise Tax Return for Tobacco, Heated-Tobacco and Vapor Products), P3.
// Schedule 1 is a fixed grid: per product row the filer enters export / taxable volume and the excise DUE (BIR
// computes no row tax). BIR's two compute functions (amounts parsed with parseFloat, printed with
// toFixed(2) + thousands commas):
//   calculate_Sched1_TotalDue (onblur of any *_Due): Sched1_TotalDue = Σ *_Due ; ExciseDue (item 14) = that total
//   calculate_Part3 (onblur of every Part III input):
//     Less_Tot = Less_Balance + Less_Excise ; NetTaxDue = ExciseDue − Less_Tot ; StillDue = NetTaxDue − PrevReturn
//     Pen_Tot = Surcharge + Interest + Compromise ; AmtPayable = StillDue + Pen_Tot
//     Pay_Penalties = Pen_Tot ; Pay_Tot = Pay_TaxPayment + Pay_Penalties ; Balance = AmtPayable − Pay_Tot

import fieldJson from "./fields/2200Tv2020.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2200Tv2020:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const sum = (...id: string[]) => (r: Read) => id.reduce((s, k) => s + m(r, k), 0);

const sched1 = (fieldJson as FieldJson[]).map((f) => f.id.slice(P.length)).filter((id) => /^txtSched1_.+_(Export|Taxable|Due)$/.test(id));
const sched1Due = sched1.filter((id) => id.endsWith("_Due"));
const money = { kind: "money" as const };
const input = ["txtLess_Balance", "txtLess_Excise", "txtPrevReturn", "txtPen_Surcharge", "txtPen_Interest", "txtPen_Compromise", "txtPay_TaxPayment", ...sched1];

export const FORM_2200T = buildSchema("2200Tv2020", "Excise Tax — Tobacco & Vapor Products", fieldJson as FieldJson[], {
  [`${P}tinA`]: { required: true },
  [`${P}tinB`]: { required: true },
  [`${P}tinC`]: { required: true },
  [`${P}branchCode`]: { required: true },
  [`${P}rdoCode`]: { required: true },
  [`${P}registeredName`]: { required: true },
  [`${P}txtDateMonth`]: { required: true },
  [`${P}txtDateYear`]: { required: true },
  ...Object.fromEntries(input.map((id) => [`${P}${id}`, money])),
  // item 19 (paid in a previous return) applies only to an amended return: onAmendedClick zeroes it otherwise
  [`${P}txtPrevReturn`]: { ...money, gate: { on: `${P}amendedRtn_1`, equals: "true" } },
  // item 14 sits above Schedule 1 in the DOM, so it sums the row inputs rather than the (later) schedule total
  [`${P}txtExciseDue`]: { ...money, compute: sum(...sched1Due) },
  [`${P}txtLess_Tot`]: { ...money, compute: sum("txtLess_Balance", "txtLess_Excise") },
  [`${P}txtNetTaxDue`]: { ...money, compute: (r) => m(r, "txtExciseDue") - m(r, "txtLess_Tot") },
  [`${P}txtStillDue`]: { ...money, compute: (r) => m(r, "txtNetTaxDue") - m(r, "txtPrevReturn") },
  [`${P}txtPen_Tot`]: { ...money, compute: sum("txtPen_Surcharge", "txtPen_Interest", "txtPen_Compromise") },
  [`${P}txtAmtPayable`]: { ...money, compute: (r) => m(r, "txtStillDue") + m(r, "txtPen_Tot") },
  [`${P}txtPay_Penalties`]: { ...money, compute: (r) => m(r, "txtPen_Tot") },
  [`${P}txtPay_Tot`]: { ...money, compute: (r) => m(r, "txtPay_TaxPayment") + m(r, "txtPay_Penalties") },
  [`${P}txtBalance`]: { ...money, compute: (r) => m(r, "txtAmtPayable") - m(r, "txtPay_Tot") },
  [`${P}txtSched1_TotalDue`]: { ...money, compute: sum(...sched1Due) },
} as Record<string, Partial<FieldSpec>>);

export function validate2200T(state: FormState): Problem[] {
  const problem = validateRequired(FORM_2200T, state);
  const tin = `${state[`${P}tinA`] ?? ""}${state[`${P}tinB`] ?? ""}${state[`${P}tinC`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}tinA`, message: "The TIN's check digit doesn't match." });
  return problem;
}
