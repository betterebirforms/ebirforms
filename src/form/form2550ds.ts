// BIR Form 2550DS (Value-Added Tax Return on Digital Services), P3. A clean named-field scalar chain:
//   balanceSubjectToVAT = grossSaleForTheQuarter − lessGrossSaleSubjectedToWithHoldingTax
//   vatPayable          = balanceSubjectToVAT × vatRate%
//   totalPaymentsCredits= vatPaidInReturn + excessPaymentCarriedOver + advancePaymentOrDepositMadeThisQuarter
//                         + otherPaymentCreditAmount
//   vatStillPayable     = vatPayable − totalPaymentsCredits
//   addPenaltiesTotal   = addPenaltiesSurcharge + addPenaltiesInterest
//   totalAmountPayable  = vatStillPayable + addPenaltiesTotal
// (The "other credits" #22D breakdown is an optional dynamic table; here otherPaymentCreditAmount is the entry.)

import fieldJson from "./fields/2550DS.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

// Shared by 2550DS and 2550DS-old — identical prefix, fields, and compute graph (the latter is an older revision).
const P = "frm2550ds:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const numv = (r: Read, id: string): number => {
  const n = Number(String(r(`${P}${id}`)).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const money = { kind: "money" as const };
const input: Array<[string, Partial<FieldSpec>]> = [
  "grossSaleForTheQuarter", "lessGrossSaleSubjectedToWithHoldingTax", "vatPaidInReturn", "excessPaymentCarriedOver",
  "advancePaymentOrDepositMadeThisQuarter", "otherPaymentCreditAmount", "addPenaltiesSurcharge", "addPenaltiesInterest",
].map((id) => [`${P}${id}`, money]);

/** Build the shared 2550DS schema for a given form code (2550DS / 2550DS-old) and its field list. */
function makeDS(code: string, json: FieldJson[]): FormSchema {
  return buildSchema(code, "VAT Return on Digital Services", json, {
    [`${P}txtTIN1`]: { required: true },
    [`${P}txtTIN2`]: { required: true },
    [`${P}txtTIN3`]: { required: true },
    [`${P}branchCode`]: { required: true },
    [`${P}rdoCode`]: { required: true },
    [`${P}taxpayerName`]: { required: true },
    [`${P}selectedMonthNo2`]: { required: true },
    [`${P}txtYearNo2`]: { required: true },
    ...Object.fromEntries(input),
    // item 19's rate is BIR's fixed, disabled "12.00%" text (never inputtable); computePart3A parses it as 12
    [`${P}vatRate`]: { compute: () => 0, format: () => "12.00%" },
    [`${P}balanceSubjectToVAT`]: { ...money, compute: (r) => m(r, "grossSaleForTheQuarter") - m(r, "lessGrossSaleSubjectedToWithHoldingTax") },
    [`${P}vatPayable`]: { ...money, compute: (r) => parseMoney((m(r, "balanceSubjectToVAT") / 100) * (numv(r, "vatRate") / 100)) },
    [`${P}totalPaymentsCredits`]: { ...money, compute: (r) => m(r, "vatPaidInReturn") + m(r, "excessPaymentCarriedOver") + m(r, "advancePaymentOrDepositMadeThisQuarter") + m(r, "otherPaymentCreditAmount") },
    [`${P}vatStillPayable`]: { ...money, compute: (r) => m(r, "vatPayable") - m(r, "totalPaymentsCredits") },
    [`${P}addPenaltiesTotal`]: { ...money, compute: (r) => m(r, "addPenaltiesSurcharge") + m(r, "addPenaltiesInterest") },
    [`${P}totalAmountPayable`]: { ...money, compute: (r) => m(r, "vatStillPayable") + m(r, "addPenaltiesTotal") },
  });
}

export function validateDS(schema: FormSchema, state: FormState): Problem[] {
  const problem = validateRequired(schema, state);
  const quarter = [1, 2, 3, 4].some((n) => state[`${P}OptQuarter${n}`] === "true");
  if (!quarter) problem.push({ id: `${P}OptQuarter1`, message: "Select the quarter being filed." });
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}

export const FORM_2550DS = makeDS("2550DS", fieldJson as FieldJson[]);
export const validate2550DS = (state: FormState): Problem[] => validateDS(FORM_2550DS, state);

export { makeDS };
