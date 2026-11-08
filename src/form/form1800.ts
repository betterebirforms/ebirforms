// BIR Form 1800 (Donor's Tax Return — pre-TRAIN), P3. Two dynamic schedules (chxSchedA/chxSchedB marker
// reconstruction, first_index 0), each split into Stranger (col A) and Relative (col B) gift columns:
//   Sched A → totalStranger/totalRelative → items 18A/18B ; Sched B → 19A/19B.
//   20 = 18 + 19 ; 21K/L = prior net gifts (Σ) ; 22 = 20 − 21 ; 24 = 22 + 23
//   25A = 24A × 30% (gifts to strangers) ; 25B = graduated donor's tax on 24B (gifts to relatives)
//   25C = 25A + 25B ; 26D = 26A+26B+26C ; 27 = 25C − 26D ; penalties = surcharge+interest+compromise ;
//   29 = 27 + penalties.

import fieldJson from "./fields/1800.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1800:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
// pre-TRAIN donor's tax on net gifts to relatives (centavos → centavos)
const donorBracket = (cents: number): number => {
  const v = cents / 100;
  let t: number;
  if (v <= 100000) t = 0;
  else if (v <= 200000) t = (v - 100000) * 0.02;
  else if (v <= 500000) t = 2000 + (v - 200000) * 0.04;
  else if (v <= 1000000) t = 14000 + (v - 500000) * 0.06;
  else if (v <= 3000000) t = 44000 + (v - 1000000) * 0.08;
  else if (v <= 5000000) t = 204000 + (v - 3000000) * 0.1;
  else if (v <= 10000000) t = 404000 + (v - 5000000) * 0.12;
  else t = 1004000 + (v - 10000000) * 0.15;
  return parseMoney(t);
};

const refundOption = (r: Read, v: string): string => (m(r, "txt29") < 0 ? v : "false");

export const SCHEDA_1800: GroupSpec = {
  name: "schedA",
  first_index: 0,
  row: [
    { id: "chxschedA", kind: "checkbox" },
    { id: "txtSchedAParticulars", kind: "text" },
    { id: "txtSchedAStranger", kind: "money" },
    { id: "txtSchedARelative", kind: "money" },
  ],
  total: [
    { into: `${P}totalStranger`, of: "txtSchedAStranger" },
    { into: `${P}totalRelative`, of: "txtSchedARelative" },
  ],
};
export const SCHEDB_1800: GroupSpec = {
  name: "schedB",
  first_index: 0,
  row: [
    { id: "chxschedB", kind: "checkbox" },
    { id: "txtSchedBClassification", kind: "text" },
    { id: "txtSchedBArea", kind: "text" },
    { id: "txtSchedBLocation", kind: "text" },
    { id: "txtSchedBTaxDeclaration", kind: "text" },
    { id: "txtSchedBStranger", kind: "money" },
    { id: "txtSchedBRelative", kind: "money" },
  ],
  total: [
    { into: `${P}totalStrangerB`, of: "txtSchedBStranger" },
    { into: `${P}totalRelativeB`, of: "txtSchedBRelative" },
  ],
};

const scalarField = (fieldJson as FieldJson[]).filter((f) => !/^(chxSched[AB]|txtSchedA(Particulars|Stranger|Relative)|txtSchedB(Classification|Area|Location|TaxDeclaration|Stranger|Relative))\d+$/.test(f.id));

export const FORM_1800 = buildSchema("1800", "Donor's Tax Return", scalarField, {
  [`${P}txtDonorTIN1`]: { required: true },
  [`${P}txtDonorTIN2`]: { required: true },
  [`${P}txtDonorTIN3`]: { required: true },
  [`${P}txtDonorBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtDonorName`]: { required: true },
  [`${P}txtDateMonth`]: { required: true },
  [`${P}txtDateYear`]: { required: true },
  [`${P}txt18A`]: { kind: "money", compute: (r) => m(r, "totalStranger") },
  [`${P}txt18B`]: { kind: "money", compute: (r) => m(r, "totalRelative") },
  [`${P}txt19A`]: { kind: "money", compute: (r) => m(r, "totalStrangerB") },
  [`${P}txt19B`]: { kind: "money", compute: (r) => m(r, "totalRelativeB") },
  [`${P}txt20A`]: { kind: "money", compute: (r) => m(r, "txt18A") + m(r, "txt19A") },
  [`${P}txt20B`]: { kind: "money", compute: (r) => m(r, "txt18B") + m(r, "txt19B") },
  [`${P}txt21K`]: { kind: "money", compute: (r) => m(r, "txt21B") + m(r, "txt21E") + m(r, "txt21H") },
  [`${P}txt21L`]: { kind: "money", compute: (r) => m(r, "txt21C") + m(r, "txt21F") + m(r, "txt21I") },
  [`${P}txt22A`]: { kind: "money", compute: (r) => m(r, "txt20A") - m(r, "txt21K") },
  [`${P}txt22B`]: { kind: "money", compute: (r) => m(r, "txt20B") - m(r, "txt21L") },
  [`${P}txt24A`]: { kind: "money", compute: (r) => m(r, "txt22A") + m(r, "txt23A") },
  [`${P}txt24B`]: { kind: "money", compute: (r) => m(r, "txt22B") + m(r, "txt23B") },
  // BIR quirk (compute25AB): a non-positive 24A, and a 24B at or under the 100,000 exemption, are assigned the
  // NUMBER 0, so the field (and the save) holds "0", not "0.00".
  [`${P}txt25A`]: { kind: "money", compute: (r) => parseMoney((m(r, "txt24A") / 100) * 0.3), derive: (r, v) => (m(r, "txt24A") <= 0 ? "0" : v) },
  [`${P}txt25B`]: { kind: "money", compute: (r) => donorBracket(m(r, "txt24B")), derive: (r, v) => (m(r, "txt24B") <= 10_000_000 ? "0" : v) },
  [`${P}txt25C`]: { kind: "money", compute: (r) => m(r, "txt25A") + m(r, "txt25B") },
  [`${P}txt26D`]: { kind: "money", compute: (r) => m(r, "txt26A") + m(r, "txt26B") + m(r, "txt26C") },
  [`${P}txt27`]: { kind: "money", compute: (r) => m(r, "txt25C") - m(r, "txt26D") },
  [`${P}txtTotalPenalties`]: { kind: "money", compute: (r) => m(r, "txtSurcharge") + m(r, "txtInterest") + m(r, "txtCompromise") },
  [`${P}txt29`]: { kind: "money", compute: (r) => m(r, "txt27") + m(r, "txtTotalPenalties") },
  // compute29: the refund / tax-credit option only stands when item 29 is an overpayment; otherwise BIR unchecks both
  [`${P}opt37:_1`]: { derive: refundOption },
  [`${P}opt37:_2`]: { derive: refundOption },
});
FORM_1800.group = [SCHEDA_1800, SCHEDB_1800];

export function validate1800(state: FormState, _groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1800, state);
  const tin = `${state[`${P}txtDonorTIN1`] ?? ""}${state[`${P}txtDonorTIN2`] ?? ""}${state[`${P}txtDonorTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtDonorTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
