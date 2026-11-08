// BIR Form 2000-OT (Documentary Stamp Tax Declaration / Return — One-Time Transactions, TRAIN edition "2000OTv2018"), P3.
// Unlike the pre-TRAIN 2000OT (form2000ot.ts: an FMV combination grid and a typed ATC rate code), this edition picks
// one of three ATC radios (item 3) and computes from two schedules:
//   • Schedule 1A (real property): ONE row list in BIR's UI — addSchedule1A adds a row to both of its tables at once
//     (title rows chkSchedule1ADelete / sched1A:txtOCTNo / txtTaxDecNo / txtLoc, and lot rows chkSchedule1A1Delete /
//     txtLot / txtClassification / txtArea / txtFMVCol1 / txtFMVCol2 / txtFMVSubTot), so it is one group here.
//     Per row FMV subtotal = the higher of the two FMV columns; Σ → sched1A:txtFMVTotal = Sched2:txtTotalFairMarket.
//   • Schedule 1B (shares of stock): par value / DST paid on original issue columns.
//   • Schedule 2: taxable base of real property = the higher of gross selling price and total FMV, unless an "other"
//     base is entered (then that amount) — computed only for DO122.
// Items (TaxComputation): 14 = Σ par value (DO102) or Σ DST paid on original issue (DO125) ; 15 = Schedule 2 base
// (DO122) ; 16 = the ATC's rate text ; 17 = the DST rate engine (dst.ts `taxDue2000OTv2018`) ; 19 = 17 − 18 ;
// 20D = 20A+20B+20C ; 21 = max(19, 0) + 20D (BIR's "no offsetting of penalties" rule).
//
// BIR behaviours replicated because they change saved values:
//   • DO102 floors to whole P200 steps and DO122 Math.rounds to the nearest P1,000 (see dst.ts); a mismatched
//     ATC / nature pair is BIR's NaN × 0 → 0.00. Schedule 1B's sums are BIR's float running sums (floatSum), which
//     can land just under an exact P200 multiple and lose a step.
//   • Items 14 / 15 / 17 / the taxable base are written only for the ATC / nature that computes them; otherwise BIR
//     leaves them as they were (here: as the state holds them, 0.00 on a fresh return).
//   • Item 18 (paid in the return amended) is zeroed and disabled by ProcessAmended unless item 2 = Yes (gate).
//   • Choosing item 12 = shares clears item 13 (location of the real property).
//   • js/string-util.js's second, no-argument capital() wins, so item 11A's onblur `capital(this)` upper-cases every
//     text input but txtEmail — and 11A is required, so a saved return is always upper-cased (item 16's rate text too).
// BIR's reload never re-runs SelectedATC (ATC_Selected is "" after a reopen), so it re-derives only the FMV
// subtotals / totals and 19–21; the parity test re-clicks the ATC to make BIR recompute the rest.

import fieldJson from "./fields/2000OTv2018.json";
import { floatSum, ONE_TIME_RATE, taxDue2000OTv2018, taxFloat, type OneTimeAtc, type OneTimeNature } from "./dst.ts";
import { formatMoney, parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2000OT:";
const A = `${P}sched1A:`;
const B = `${P}sched1B:`;
const S2 = `${P}Sched2:`;
type Read = (id: string) => string;
const m = (r: Read, id: string): Centavo => parseMoney(r(id));
const on = (r: Read, id: string): boolean => r(id) === "true";
const upper = (_r: Read, v: string): string => v.toUpperCase();

export const atc2000OTv2018 = (r: Read): OneTimeAtc | "" =>
  on(r, `${P}ATC_1`) ? "DO102" : on(r, `${P}ATC_2`) ? "DO122" : on(r, `${P}ATC_3`) ? "DO125" : "";
export const nature2000OTv2018 = (r: Read): OneTimeNature =>
  on(r, `${P}rbTransNature_1`) ? "shares" : on(r, `${P}rbTransNature_2`) || on(r, `${P}rbTransNature_3`) ? "property" : "";

const text = (id: string): GroupSpec["row"][number] => ({ id, kind: "text", derive: upper });
const box = (id: string): GroupSpec["row"][number] => ({ id, kind: "checkbox", derive: () => "false" });
const money = (id: string): GroupSpec["row"][number] => ({ id, kind: "money", derive: (_r, v) => formatMoney(parseMoney(v)) });

export const SCHED1A_2000OTV2018: GroupSpec = {
  name: "sched1A",
  first_index: 0,
  row: [
    box("chkSchedule1ADelete"), text(`${A}txtOCTNo`), text(`${A}txtTaxDecNo`), text(`${A}txtLoc`),
    box("chkSchedule1A1Delete"), text(`${A}txtLot`), text(`${A}txtClassification`), text(`${A}txtArea`),
    money(`${A}txtFMVCol1`), money(`${A}txtFMVCol2`),
    // ComputeFMV: column 1 when it is at least column 2, else column 2
    { id: `${A}txtFMVSubTot`, kind: "money", row_compute: (read) => Math.max(parseMoney(read(`${A}txtFMVCol1`)), parseMoney(read(`${A}txtFMVCol2`))) },
  ],
  total: { into: `${A}txtFMVTotal`, of: `${A}txtFMVSubTot` },
};
const PAR_SUM = `${P}_parSum`; // not a BIR field: Schedule 1B's float sums, for the engine
const PAID_SUM = `${P}_paidSum`;
export const SCHED1B_2000OTV2018: GroupSpec = {
  name: "sched1B",
  first_index: 0,
  row: [box("chkSchedule1BDelete"), text(`${B}txtNameOfCorpStock`), text(`${B}txtNoOfSharesSold`), text(`${B}txtStockCertNo`), money(`${B}txtParValOfShares`), money(`${B}txtDSTPaid`)],
  total: [
    { into: PAR_SUM, of: `${B}txtParValOfShares`, sum: (row) => String(floatSum(row.map((x) => x[`${B}txtParValOfShares`] ?? ""))) },
    { into: PAID_SUM, of: `${B}txtDSTPaid`, sum: (row) => String(floatSum(row.map((x) => x[`${B}txtDSTPaid`] ?? ""))) },
  ],
};

// ---- the chain (each derived from inputs: Schedule 2 sits after items 14–21 in the DOM) ----
const fmvTotal = (r: Read) => m(r, `${A}txtFMVTotal`);
/** ComputeRealProperty's DO122 taxable base: the "other" amount if one is entered, else max(gross selling price, FMV). */
export const taxableBase = (r: Read): Centavo => {
  if (atc2000OTv2018(r) !== "DO122") return m(r, `${S2}txtTaxableBase`);
  if (r(`${S2}txtOthers`) === "" && m(r, `${S2}txtOthersAmount`) === 0) return Math.max(m(r, `${S2}txtGrossSellingPrice`), fmvTotal(r));
  return m(r, `${S2}txtOthersAmount`);
};
const item14 = (r: Read): Centavo => {
  const atc = atc2000OTv2018(r);
  if (atc === "DO102") return taxFloat(Number(r(PAR_SUM)) || 0);
  if (atc === "DO125") return taxFloat(Number(r(PAID_SUM)) || 0);
  return m(r, `${P}txtTax14`);
};
const item15 = (r: Read): Centavo => (atc2000OTv2018(r) === "DO122" ? taxableBase(r) : m(r, `${P}txtTax15`));
export const item17 = (r: Read): Centavo =>
  taxDue2000OTv2018(atc2000OTv2018(r), nature2000OTv2018(r), Number(r(PAR_SUM)) || 0, Number(r(PAID_SUM)) || 0, taxableBase(r) / 100) ?? m(r, `${P}txtTax17`);
const amended = { on: `${P}AmendedRtn_1`, equals: "true" };
const item18 = (r: Read): Centavo => (on(r, amended.on) ? m(r, `${P}txtTax18`) : 0);
const item19 = (r: Read): Centavo => item17(r) - item18(r);
const item20D = (r: Read): Centavo => m(r, `${P}txtTax20A`) + m(r, `${P}txtTax20B`) + m(r, `${P}txtTax20C`);

/** Schedule rows (managed by the groups), submission / eBIRForms-Online state, and ids BIR's save never writes. */
const ROW = /^(chkSchedule1(A1?|B)Delete\d+|frm2000OT:sched1[AB]:txt\w+\d+)$/;
const DROP = new Set([
  "txtFinalFlag", "txtEnroll", "txtEmail", "driveSelectTPExport",
  "ebirOnlineConfirmUsername", "ebirOnlineConfirmPassword", "ebirOnlineUsername", "ebirOnlinePassword", "ebirOnlineSecret",
]);
const MONEY = new Set([`${A}txtFMVTotal`, `${S2}txtGrossSellingPrice`, `${S2}txtTotalFairMarket`, `${S2}txtOthersAmount`, `${S2}txtTaxableBase`]);
const scalarField = (fieldJson as FieldJson[])
  .filter((f) => !DROP.has(f.id) && !ROW.test(f.id) && f.id.startsWith(P))
  .map((f) => (MONEY.has(f.id) ? { ...f, kind: "money" as const } : f.id === `${P}txtTax16` ? { ...f, kind: "text" as const } : f));

const c = (fn: (r: Read) => Centavo): Partial<FieldSpec> => ({ compute: fn });
const upperText: Record<string, Partial<FieldSpec>> = Object.fromEntries(
  scalarField.filter((f) => f.kind === "text").map((f) => [f.id, { derive: upper, ...(!f.escaped && { derive_default: upper }) }]),
);
const copy = (from: string): Partial<FieldSpec> => ({ derive: (r, v) => (r(`${P}${from}`) || v).toUpperCase() });

export const FORM_2000OTV2018 = buildSchema("2000OTv2018", "DST Declaration / Return — One-Time Transactions", scalarField, {
  ...upperText,
  [`${P}txtTransactionDate`]: { required: true, derive: upper },
  [`${P}txtTIN1`]: { required: true, derive: upper },
  [`${P}txtTIN2`]: { required: true, derive: upper },
  [`${P}txtTIN3`]: { required: true, derive: upper },
  [`${P}txtBranchCode`]: { required: true, derive: upper },
  [`${P}txtRDOCode`]: { required: true, derive: upper },
  [`${P}txtTaxpayerName`]: { required: true, derive: upper },
  [`${P}txtRealLocation`]: { derive: (r, v) => (on(r, `${P}rbTransNature_1`) ? "" : v.toUpperCase()) },
  [`${P}txtTax14`]: c(item14),
  [`${P}txtTax15`]: c(item15),
  [`${P}txtTax16`]: { derive: (r, v) => { const atc = atc2000OTv2018(r); return atc ? ONE_TIME_RATE[atc].toUpperCase() : v; } },
  [`${P}txtTax17`]: c(item17),
  [`${P}txtTax18`]: { gate: amended },
  [`${P}txtTax19`]: c(item19),
  [`${P}txtTax20D`]: c(item20D),
  [`${P}txtTax21`]: c((r) => Math.max(item19(r), 0) + item20D(r)),
  [`${P}txtPg2TIN1`]: copy("txtTIN1"),
  [`${P}txtPg2TIN2`]: copy("txtTIN2"),
  [`${P}txtPg2TIN3`]: copy("txtTIN3"),
  [`${P}txtPg2BranchCode`]: copy("txtBranchCode"),
  [`${P}txtPg2TaxpayerName`]: copy("txtTaxpayerName"),
  [`${S2}txtTotalFairMarket`]: c(fmvTotal),
  [`${S2}txtTaxableBase`]: c(taxableBase),
});
FORM_2000OTV2018.group = [SCHED1A_2000OTV2018, SCHED1B_2000OTV2018];

const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function validate2000OTv2018(state: FormState, _groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2000OTV2018, state);
  const r: Read = (id) => state[id] ?? "";
  const tin = `${r(`${P}txtTIN1`)}${r(`${P}txtTIN2`)}${r(`${P}txtTIN3`)}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  const date = DATE.exec(r(`${P}txtTransactionDate`).trim());
  if (r(`${P}txtTransactionDate`) && !date) problem.push({ id: `${P}txtTransactionDate`, message: "Enter the transaction date as MM/DD/YYYY (item 1)." });
  // validateDate blanks a date before 2018 (the old 2000OT form covers those)
  if (date && Number(date[3]) < 2018) problem.push({ id: `${P}txtTransactionDate`, message: "Transactions before 2018 are filed on the old 2000OT form." });
  if (!atc2000OTv2018(r)) problem.push({ id: `${P}ATC_1`, message: "Choose an ATC (item 3)." });
  if (!on(r, `${P}optParty_1`) && !on(r, `${P}optParty_2`)) problem.push({ id: `${P}optParty_1`, message: "Choose the other party to the transaction (item 11)." });
  if (!r(`${P}txtOtherName`).trim()) problem.push({ id: `${P}txtOtherName`, message: "Enter the other party's name (item 11A)." });
  if (!r(`${P}txtOtherTIN`).trim()) problem.push({ id: `${P}txtOtherTIN`, message: "Enter the other party's TIN (item 11B)." });
  const nature = nature2000OTv2018(r);
  if (!nature) problem.push({ id: `${P}rbTransNature_1`, message: "Choose the nature of the transaction (item 12)." });
  if (nature === "property" && !r(`${P}txtRealLocation`).trim()) problem.push({ id: `${P}txtRealLocation`, message: "Enter the location of the real property (item 13)." });
  return problem;
}
