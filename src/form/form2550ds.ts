// BIR Form 2550DS (Value-Added Tax Return on Digital Services), P3. A clean named-field scalar chain:
//   balanceSubjectToVAT = grossSaleForTheQuarter − lessGrossSaleSubjectedToWithHoldingTax
//   vatPayable          = balanceSubjectToVAT × vatRate%
//   totalPaymentsCredits= vatPaidInReturn + excessPaymentCarriedOver + advancePaymentOrDepositMadeThisQuarter
//                         + otherPaymentCreditAmount
//   vatStillPayable     = vatPayable − totalPaymentsCredits
//   addPenaltiesTotal   = addPenaltiesSurcharge + addPenaltiesInterest
//   totalAmountPayable  = vatStillPayable + addPenaltiesTotal
// Item 22D's "Add more" pop-up (modalNo22D) is the group `specify22D`: its rows are the inputs BIR's showModalNo22D draws
// (totalTaxPayableNo22DDescription<i> / ...Amount<i>, 0-indexed), saved with the form. closeModalNo22D then writes item 22D:
//   2+ rows → description "VARIOUS", amount = the rows' sum;   1 row → that row's description, amount = the sum;
// and BIR's resultOtherCreditsNo22D is that sum (0.00 until the pop-up has rows). With no rows item 22D is typed as usual.
// Reopening a file drops the rows (BIR's loadData has no box for them) and keeps item 22D as saved.

import fieldJson from "./fields/2550DS.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type GroupSpec, type Problem } from "./schema.ts";
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
const DESCRIPTION = `${P}totalTaxPayableNo22DDescription`;
const AMOUNT = `${P}totalTaxPayableNo22DAmount`;
/** The item 22D pop-up's rows. The hidden `_22D…` keys carry what the item's two boxes derive from them. */
export const SPECIFY_2550DS: GroupSpec = {
  name: "specify22D",
  first_index: 0,
  not_reloaded: true, // loadData fills only the blank page's boxes: a reopened file keeps item 22D, not the rows
  row: [
    { id: DESCRIPTION, kind: "text" },
    { id: AMOUNT, kind: "money" },
  ],
  total: [
    { into: "resultOtherCreditsNo22D", of: AMOUNT },
    { into: "_22Dcount", of: AMOUNT, sum: (row) => String(row.length) },
    { into: "_22Dfirst", of: DESCRIPTION, sum: (row) => row[0]?.[DESCRIPTION] ?? "" },
  ],
};
const input: Array<[string, Partial<FieldSpec>]> = [
  "grossSaleForTheQuarter", "lessGrossSaleSubjectedToWithHoldingTax", "vatPaidInReturn", "excessPaymentCarriedOver",
  "advancePaymentOrDepositMadeThisQuarter", "otherPaymentCreditAmount", "addPenaltiesSurcharge", "addPenaltiesInterest",
].map((id) => [`${P}${id}`, money]);

/** Build the shared 2550DS schema for a given form code (2550DS / 2550DS-old) and its field list. */
function makeDS(code: string, json: FieldJson[]): FormSchema {
  const schema = buildSchema(code, "VAT Return on Digital Services", json, {
    [`${P}txtTIN1`]: { required: true },
    [`${P}txtTIN2`]: { required: true },
    [`${P}txtTIN3`]: { required: true },
    [`${P}branchCode`]: { required: true },
    [`${P}rdoCode`]: { required: true },
    [`${P}taxpayerName`]: { required: true },
    [`${P}selectedMonthNo2`]: { required: true },
    [`${P}txtYearNo2`]: { required: true },
    ...Object.fromEntries(input),
    // item 22D after closeModalNo22D: rows replace what was typed (2+ rows read VARIOUS)
    [`${P}otherPaymentCreditSpecify`]: { derive: (r, v) => { const n = Number(r("_22Dcount")); return n > 1 ? "VARIOUS" : n === 1 ? r("_22Dfirst") : v; } },
    [`${P}otherPaymentCreditAmount`]: { ...money, derive: (r, v) => (Number(r("_22Dcount")) > 0 ? r("resultOtherCreditsNo22D") : v) },
    // item 19's rate is BIR's fixed, disabled "12.00%" text (never inputtable); computePart3A parses it as 12
    [`${P}vatRate`]: { compute: () => 0, format: () => "12.00%" },
    [`${P}balanceSubjectToVAT`]: { ...money, compute: (r) => m(r, "grossSaleForTheQuarter") - m(r, "lessGrossSaleSubjectedToWithHoldingTax") },
    [`${P}vatPayable`]: { ...money, compute: (r) => parseMoney((m(r, "balanceSubjectToVAT") / 100) * (numv(r, "vatRate") / 100)) },
    [`${P}totalPaymentsCredits`]: { ...money, compute: (r) => m(r, "vatPaidInReturn") + m(r, "excessPaymentCarriedOver") + m(r, "advancePaymentOrDepositMadeThisQuarter") + m(r, "otherPaymentCreditAmount") },
    [`${P}vatStillPayable`]: { ...money, compute: (r) => m(r, "vatPayable") - m(r, "totalPaymentsCredits") },
    [`${P}addPenaltiesTotal`]: { ...money, compute: (r) => m(r, "addPenaltiesSurcharge") + m(r, "addPenaltiesInterest") },
    [`${P}totalAmountPayable`]: { ...money, compute: (r) => m(r, "vatStillPayable") + m(r, "addPenaltiesTotal") },
  });
  schema.group = [SPECIFY_2550DS];
  return schema;
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
