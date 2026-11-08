// BIR Form 2551M (Monthly Percentage Tax Return — pre-TRAIN), P3. Two dynamic schedules:
//   • ATC tax table (tblListSelectedATC, un-prefixed 1-indexed ids txtTaxableAmount/txtTaxRate/txtTaxDue):
//       per row txtTaxDue = txtTaxableAmount × txtTaxRate / 100 ; Σ txtTaxDue → txtTotalTaxDue.
//     The reload repaints this grid from the ATC picker: loadData restores the AtcCode<j> checkboxes (one per
//     entry of BIR's 2551M list), getSelectedATC builds one row per CHECKED entry in list order, then
//     loadDataATCRow refills row i by id. So each native row carries its `atc_code` (not itself a saved key), the
//     save emits every AtcCode<j> (extra_record), and the rows must follow list order, one per code.
//   • Tax-credit Schedule I (tblTaxWithheldClaimedAsTaxCredit, frm2551m:-prefixed 0-indexed rows):
//       Σ txtApplied → txt20A. Reconstructed by counting txtPeriodCovered occurrences — a clean repaint.
// Scalar chain (getRowInTable / computePenalty):
//   txt21 = txt20A + txt20B ; txt22 = txtTotalTaxDue − txt21 (tax still due) ;
//   txt23D = txtSurcharge + txtInterest + txtCompromise ; txtTotalAmountPayable_24 = txt22 + txt23D.
// (The legacy's computeTaxDue transiently sets txt22 = txtTotalTaxDue; getRowInTable is the final word and
//  subtracts the credits — we model the final, correct chain.)

import fieldJson from "./fields/2551m.json";
import { atcPickList } from "./atc.ts";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import type { SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2551m:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));

export const ATC_2551M: GroupSpec = {
  name: "atc",
  first_index: 1, // getSelectedATC indexes ATC rows from 1
  row: [
    { id: "txtTaxableAmount", kind: "money" }, // the reload counts this occurrence
    { id: "txtTaxRate", kind: "text" }, // percent as a plain number (e.g. "3"), from the ATC reference
    {
      id: "txtTaxDue",
      kind: "money",
      row_compute: (read) => parseMoney((parseMoney(read("txtTaxableAmount")) / 100) * ((parseFloat(read("txtTaxRate")) || 0) / 100)),
    },
  ],
  total: { into: `${P}txtTotalTaxDue`, of: "txtTaxDue" },
};
/** BIR's 2551M ATC list (getWithHoldingTax), in picker order: position j is the legacy `AtcCode<j+1>`. */
export const PICK_LIST_2551M = atcPickList("2551M", "");
/** The row key holding a row's ATC code. Not a sub-field, so it is never serialized itself. */
export const ATC_CODE = "atc_code";

export const CREDIT_2551M: GroupSpec = {
  name: "credit",
  first_index: 0, // Schedule I rows reconstruct 0-indexed (sched1() counter starts at 0)
  row: [
    { id: `${P}txtPeriodCovered`, kind: "text" }, // the reload counts this occurrence
    { id: `${P}txtNameOfWithAgent`, kind: "text" },
    { id: `${P}txtIncomePayments`, kind: "money" },
    { id: `${P}txtTaxWithheld`, kind: "money" },
    { id: `${P}txtApplied`, kind: "money" },
  ],
  // getRowInTable writes the Schedule I total into BOTH 20A and the schedule's own total box (txtTotalAmount)
  total: [
    { into: `${P}txt20A`, of: `${P}txtApplied` },
    { into: `${P}txtTotalAmount`, of: `${P}txtApplied` },
  ],
};

const moneyField = new Set(
  ["txtTotalTaxDue", "txt20A", "txt20B", "txt21", "txt22", "txt23D", "txtTotalAmount"].map((s) => `${P}${s}`),
);
const secretField = new Set(["ebirOnlineConfirmUsername", "ebirOnlineConfirmPassword", "ebirOnlineUsername", "ebirOnlinePassword", "ebirOnlineSecret"]);

const scalarField = (fieldJson as FieldJson[]).map((f) =>
  secretField.has(f.id) ? { ...f, secret: true } : moneyField.has(f.id) ? { ...f, kind: "money" as const } : f,
);

const overpaid = { when: (r: Read) => m(r, "txtTotalAmountPayable_24") < 0 };

export const FORM_2551M = buildSchema("2551M", "Monthly Percentage Tax Return", scalarField, {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxPayerName`]: { required: true },
  [`${P}txtYear`]: { required: true },
  [`${P}txt21`]: { kind: "money", compute: (r) => m(r, "txt20A") + m(r, "txt20B") },
  [`${P}txt22`]: { kind: "money", compute: (r) => m(r, "txtTotalTaxDue") - m(r, "txt21") },
  [`${P}txt23D`]: { kind: "money", compute: (r) => m(r, "txtSurcharge") + m(r, "txtInterest") + m(r, "txtCompromise") },
  [`${P}txtTotalAmountPayable_24`]: { kind: "money", compute: (r) => m(r, "txt22") + m(r, "txt23D") },
  // item 25 (refund / tax credit certificate) is live only on an overpayment: getRowInTable unchecks both
  // whenever item 24 is not negative
  [`${P}optToBeRefunded:_1`]: { gate: overpaid },
  [`${P}optToBeIssued:_2`]: { gate: overpaid },
});
FORM_2551M.group = [ATC_2551M, CREDIT_2551M];
// one AtcCode<j> checkbox per list entry, checked for the codes the ATC rows came from
FORM_2551M.extra_record = (_state, groups): SaveRecord[] => {
  const code = new Set((groups.atc ?? []).map((row) => row[ATC_CODE]));
  return PICK_LIST_2551M.map((pick, j) => ({ key: `AtcCode${j + 1}`, value: String(code.has(pick.atc_code)) }));
};

export function validate2551m(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2551M, state);
  // the reload rebuilds one row per checked code, in list order: anything else comes back reshuffled or merged
  const position = (groups.atc ?? []).map((row) => PICK_LIST_2551M.findIndex((pick) => pick.atc_code === row[ATC_CODE]));
  position.forEach((j, i) => {
    if (j < 0) problem.push({ id: `txtTaxableAmount${i + 1}`, message: `ATC row ${i + 1} needs a code from the 2551M ATC list.` });
    else if (i > 0 && j <= position[i - 1]!) problem.push({ id: `txtTaxableAmount${i + 1}`, message: `ATC row ${i + 1}: list each ATC once, in the list's order.` });
  });
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
