// BIR Form 2550Q (Quarterly Value-Added Tax Return — pre-2024 edition, superseded by 2550Qv2024), P3.
// Page 1 is the whole return (items 15–29); eight schedules feed it:
//   • Schedule 1 (sales to private parties, by ATC): rows frm2550q:txtAtcCde/txtAmountSales/txtOutputTax<x>, 1-indexed,
//     rebuilt on reload by getATCCode from the ATC picker's checked AtcCode<j> boxes IN PICK-LIST ORDER (so a native
//     save emits AtcCode<j> per row via extra_record and keeps the rows in list order). Output tax = sales × 12%.
//     Σ → txtmodaltxtTotal15A/B → items 15A/15B.
//   • Schedule 2 (capital goods ≤ ₱1M): chxSched2/txtDatePurchased/txtDescription/txtAmt/txtInputTax<i> → 21A/21B.
//   • Schedule 3A (capital goods > ₱1M, this quarter) → 21C/21D; its balance + Schedule 3B's (prior quarters) → 23A.
//   • Schedule 4 (input tax on sales to government, scalar) → 23B ; Schedule 5 (exempt sales, scalar) → 23C.
//   • Schedules 6 / 7 / 8 (creditable VAT withheld / advance sugar VAT / VAT withheld by government):
//     Σ applied this quarter + Σ prior two months → 26B / 26C / 26D (getSched6/7/8Modal).
// The reload counts each schedule's marker key (chxSched2, txtAmt3A, txtAmt3B, txtPeriodCovered, txtPeriodCoveredSch7,
// txtNameAgentSch8) to rebuild that many rows, so the row checkboxes chxSched<N><i> are emitted (false) by extra_record.
// Chain: 16B = 16A × 12% ; 19A = 15A+16A+17+18 ; 19B = 15B+16B ; 20F = 20A..20E ; 21F/H/J/L/O = 21E/G/I/K/N × 12% ;
//   21P = 21A+C+E+G+I+K+M+N ; 22 = 20F+21B+D+F+H+J+L+O ; 23F = 23A..23E ; 24 = 22−23F ; 25 = 19B−24 ;
//   26H = 26A..26G ; 27 = 25−26H ; 28D = 28A+B+C ; 29 = 27+28D.
//
// BIR behaviours replicated because they change saved values:
//   • Every 12% product, the Schedule 4/5 ratios (sales ÷ total sales × input tax) and the 7% standard input tax
//     (`16A * 7 / 100`) are BIR float arithmetic rounded by formatCurrency.
//   • 16B, 21F/H/J/L/O and Schedule 4's standard input tax are typeable in BIR but re-derived on every blur of
//     16A / 21E… — the save holds the derived value, so they are computed here.
//   • Item 26E (VAT paid in the return being amended) is zeroed by the AmendedRtn radios unless item 2 = Yes (gate).
//   • 23B / txtTotal20BSched4 = Schedule 4 total − 7% standard input tax, but only once Schedule 4 holds an amount
//     (BIR writes 23B only from the Schedule 4 OK button); an untouched Schedule 4 leaves 23B at 0.
// BIR quirks NOT replicated: compute29 ends with capital() (string-util.js), which uppercases EVERY text field
// whenever any amount is blurred — the native form keeps text as typed.

import fieldJson from "./fields/2550Q.json";
import { atcPickList, type AtcPick } from "./atc.ts";
import { parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import type { SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2550q:";
type Read = (id: string) => string;
const t = (r: Read, item: string): Centavo => parseMoney(r(`${P}txtTax${item}`));
const m = (r: Read, id: string): Centavo => parseMoney(r(id));
/** BIR's `NumWithComma(x) * 0.12` through formatCurrency: a float product, rounded half-up to the centavo. */
export const x12 = (cents: Centavo): Centavo => parseMoney((cents / 100) * 0.12);
/** BIR's float `part / whole * inputTax` (Schedules 4 and 5); a zero whole is NaN → "0.00". */
export const ratable = (part: Centavo, whole: Centavo, inputTax: Centavo): Centavo => parseMoney(((part / 100) / (whole / 100)) * (inputTax / 100));
/** changedTxtTax16A: the standard input tax on sales to government, `16A * 7 / 100`. */
export const standardInputTax = (sales: Centavo): Centavo => parseMoney(((sales / 100) * 7) / 100);

/** BIR's ATC pick list for 2550Q (loadATC keeps every atcCodes.xml record containing "2550Q"). */
export const pickList2550Q = (): AtcPick[] => atcPickList("2550Q", "");

export const ATC_2550Q: GroupSpec = {
  name: "atc",
  first_index: 1,
  row: [
    { id: `${P}txtAtcCde`, kind: "text" },
    { id: `${P}txtAmountSales`, kind: "money" },
    { id: `${P}txtOutputTax`, kind: "money", row_compute: (read) => x12(parseMoney(read(`${P}txtAmountSales`))) },
  ],
  total: [
    { into: "txtmodaltxtTotal15A", of: `${P}txtAmountSales` },
    { into: "txtmodaltxtTotal15B", of: `${P}txtOutputTax` },
  ],
};
export const SCHED2_2550Q: GroupSpec = {
  name: "sched2",
  first_index: 0,
  row: [
    { id: "txtDatePurchased", kind: "text" },
    { id: "txtDescription", kind: "text" },
    { id: "txtAmt", kind: "money" },
    { id: "txtInputTax", kind: "money", row_compute: (read) => x12(parseMoney(read("txtAmt"))) },
  ],
  total: [
    { into: "txtmodalTotalAmt", of: "txtAmt" },
    { into: "txtmodalTotalInputTax", of: "txtInputTax" },
  ],
};
export const SCHED3A_2550Q: GroupSpec = {
  name: "sched3A",
  first_index: 0,
  row: [
    { id: "txtDatePurchased3A", kind: "text" },
    { id: "txtDescription3A", kind: "text" },
    { id: "txtAmt3A", kind: "money" }, // the reload counts this key
    { id: "txtInputTax3A", kind: "money", row_compute: (read) => x12(parseMoney(read("txtAmt3A"))) },
    { id: "txtEstLife3A", kind: "text" },
    { id: "txtRecogLife3A", kind: "text" },
    { id: "txtAllowInputTax3A", kind: "money" }, // typed: BIR's ÷ recognized-life formula is commented out
    {
      id: "txtBalInputTax3A",
      kind: "money",
      row_compute: (read) => x12(parseMoney(read("txtAmt3A"))) - parseMoney(read("txtAllowInputTax3A")),
    },
  ],
  total: [
    { into: "txtmodalTotalAmountSched3", of: "txtAmt3A" },
    { into: "txtmodalTotalInputTaxSched3", of: "txtInputTax3A" },
    { into: "txtmodalTotalBalanceSched3A", of: "txtBalInputTax3A" },
  ],
};
export const SCHED3B_2550Q: GroupSpec = {
  name: "sched3B",
  first_index: 0,
  row: [
    { id: "txtDatePurchased3B", kind: "text" },
    { id: "txtDescription3B", kind: "text" },
    { id: "txtAmt3B", kind: "money" }, // the reload counts this key
    { id: "txtBalInputTaxPrevious3B", kind: "money" },
    { id: "txtEstLife3B", kind: "text" },
    { id: "txtRecogLife3B", kind: "text" },
    { id: "txtAllowInputTax3B", kind: "money" },
    {
      id: "txtBalInputTax3B",
      kind: "money",
      row_compute: (read) => parseMoney(read("txtBalInputTaxPrevious3B")) - parseMoney(read("txtAllowInputTax3B")),
    },
  ],
  total: { into: "txtmodalTotalBalanceSched3B", of: "txtBalInputTax3B" },
};
const creditSchedule = (name: string, row: GroupSpec["row"], prev: string, applied: string, into: [string, string]): GroupSpec => ({
  name,
  first_index: 0,
  row,
  total: [
    { into: into[0], of: prev },
    { into: into[1], of: applied },
  ],
});
export const SCHED6_2550Q = creditSchedule(
  "sched6",
  [
    { id: "txtPeriodCovered", kind: "text" }, // the reload counts this key
    { id: "txtNameAgent", kind: "text" },
    { id: "txtIncomePayment", kind: "money" },
    { id: "txtTotalWithheld", kind: "money" },
    { id: "txtPrevious2Mo", kind: "money" },
    { id: "txtAppliedCurr", kind: "money" },
  ],
  "txtPrevious2Mo",
  "txtAppliedCurr",
  ["txtmodalTotal23A", "txtmodalTotalSched6AppliedCurrent"],
);
export const SCHED7_2550Q = creditSchedule(
  "sched7",
  [
    { id: "txtPeriodCoveredSch7", kind: "text" }, // the reload counts this key
    { id: "txtNameMillerSch7", kind: "text" },
    { id: "txtNameTaxPayerSch7", kind: "text" },
    { id: "txtORNumSch7", kind: "text" },
    { id: "txtAmountPaidSch7", kind: "money" },
    { id: "txtPrevious2MoSch7", kind: "money" },
    { id: "txtAppliedCurrSch7", kind: "money" },
  ],
  "txtPrevious2MoSch7",
  "txtAppliedCurrSch7",
  ["txtmodalTotal23B", "txtmodalTotalSched7AppliedCurrent"],
);
export const SCHED8_2550Q = creditSchedule(
  "sched8",
  [
    { id: "txtPeriodCoveredSch8", kind: "text" },
    { id: "txtNameAgentSch8", kind: "text" }, // the reload counts this key
    { id: "txtIncomePaymentSch8", kind: "money" },
    { id: "txtTotalWithheldSch8", kind: "money" },
    { id: "txtPrevious2MoSch8", kind: "money" },
    { id: "txtAppliedCurrSch8", kind: "money" },
  ],
  "txtPrevious2MoSch8",
  "txtAppliedCurrSch8",
  ["txtmodalTotal23C", "txtmodalTotalSched8AppliedCurrent"],
);
/** Schedules whose rows carry a "select for delete" checkbox chxSched<N><i> (saved, always false). */
const ROW_CHECKBOX: Array<[string, string]> = [
  ["sched2", "chxSched2"], ["sched3A", "chxSched3A"], ["sched3B", "chxSched3B"],
  ["sched6", "chxSched6"], ["sched7", "chxSched7"], ["sched8", "chxSched8"],
];

// ---- the chain, each item derived from inputs (Schedules 4/5 sit after page 1 in the DOM) ----
const s15A = (r: Read) => m(r, "txtmodaltxtTotal15A");
const s15B = (r: Read) => m(r, "txtmodaltxtTotal15B");
const s16B = (r: Read) => x12(t(r, "16A"));
const s19A = (r: Read) => s15A(r) + t(r, "16A") + t(r, "17") + t(r, "18");
const s19B = (r: Read) => s15B(r) + s16B(r);
const s20F = (r: Read) => t(r, "20A") + t(r, "20B") + t(r, "20C") + t(r, "20D") + t(r, "20E");
const PAIR: Array<[string, string]> = [["21E", "21F"], ["21G", "21H"], ["21I", "21J"], ["21K", "21L"], ["21N", "21O"]];
const s21P = (r: Read) =>
  m(r, "txtmodalTotalAmt") + m(r, "txtmodalTotalAmountSched3") + t(r, "21E") + t(r, "21G") + t(r, "21I") + t(r, "21K") + t(r, "21M") + t(r, "21N");
const s22 = (r: Read) =>
  s20F(r) + m(r, "txtmodalTotalInputTax") + m(r, "txtmodalTotalInputTaxSched3") + PAIR.reduce((sum, [base]) => sum + x12(t(r, base)), 0);
const s23A = (r: Read) => m(r, "txtmodalTotalBalanceSched3A") + m(r, "txtmodalTotalBalanceSched3B");
// Schedule 4: input tax attributable to sales to government
const s4Ratable = (r: Read) => ratable(t(r, "16A"), s19A(r), m(r, "txtInputTaxnotDirectSched4"));
const s4Total = (r: Read) => m(r, "txtinputtaxSched4") + s4Ratable(r);
const s4Std = (r: Read) => standardInputTax(t(r, "16A"));
/** Schedule 4 counts once it holds input tax: BIR's 23B is set only by the Schedule 4 OK button (getSched4Modal), so a
 *  return that never fills it keeps 23B = 0 rather than "0 − standard input tax". */
const s4Used = (r: Read) => m(r, "txtinputtaxSched4") !== 0 || m(r, "txtInputTaxnotDirectSched4") !== 0;
const s23B = (r: Read) => (s4Used(r) ? s4Total(r) - s4Std(r) : 0);
// Schedule 5: input tax attributable to exempt sales
const s5Ratable = (r: Read) => ratable(t(r, "18"), s19A(r), m(r, "txtAmountInputnotDirectSched5"));
const s23C = (r: Read) => m(r, "txtinputtaxSched5") + s5Ratable(r);
const s23F = (r: Read) => s23A(r) + s23B(r) + s23C(r) + t(r, "23D") + t(r, "23E");
const s24 = (r: Read) => s22(r) - s23F(r);
const s25 = (r: Read) => s19B(r) - s24(r);
const amended = { on: `${P}AmendedRtnY`, equals: "true" };
const s26B = (r: Read) => m(r, "txtmodalTotalSched6AppliedCurrent") + m(r, "txtmodalTotal23A");
const s26C = (r: Read) => m(r, "txtmodalTotalSched7AppliedCurrent") + m(r, "txtmodalTotal23B");
const s26D = (r: Read) => m(r, "txtmodalTotalSched8AppliedCurrent") + m(r, "txtmodalTotal23C");
const s26E = (r: Read) => (r(amended.on) === amended.equals ? t(r, "26E") : 0);
const s26H = (r: Read) => t(r, "26A") + s26B(r) + s26C(r) + s26D(r) + s26E(r) + t(r, "26F") + t(r, "26G");
const s27 = (r: Read) => s25(r) - s26H(r);
const s28D = (r: Read) => t(r, "28A") + t(r, "28B") + t(r, "28C");

const moneyField = new Set([
  "txtmodaltxtTotal15A", "txtmodaltxtTotal15B", "txtmodalTotalAmt", "txtmodalTotalInputTax", "txtmodalTotalAmountSched3",
  "txtmodalTotalInputTaxSched3", "txtmodalTotalBalanceSched3A", "txtmodalTotalBalanceSched3B", "txtmodalTotalInputTax20ASched3",
  "txtinputtaxSched4", "txtTaxableSaleSched4", "txtInputTaxnotDirectSched4", "txtTotalInputTaxnotDirectSched4", "txtTotalSaleSched4",
  "txtTotalInputSaletoGovernmentSched4", "txtlessStdTaxSched4", "txtTotal20BSched4", "txtinputtaxSched5", "txtTotSaleSched5",
  "txtAmountInputnotDirectSched5", "txtProductnotDirectSched5", "txtSumTotalSaleSched5", "txtTotal20CSched5",
  "txtmodalTotal23A", "txtmodalTotalSched6AppliedCurrent", "txtmodalTotal23B", "txtmodalTotalSched7AppliedCurrent",
  "txtmodalTotal23C", "txtmodalTotalSched8AppliedCurrent",
]);
/** Not saved by BIR (date inputs, a commented-out total) or submission/eBIRForms-Online state: BIR's defaults stand. */
const DROP = new Set([
  `${P}RtnPeriodFrom`, `${P}RtnPeriodTo`, "txtmodalTotalInputDdivFTaxSched", "txtFinalFlag", "txtEnroll", "txtEmail", "driveSelectTPExport",
  "ebirOnlineConfirmUsername", "ebirOnlineConfirmPassword", "ebirOnlineUsername", "ebirOnlinePassword", "ebirOnlineSecret",
]);
const scalarField = (fieldJson as FieldJson[]).filter((f) => !DROP.has(f.id)).map((f) => (moneyField.has(f.id) ? { ...f, kind: "money" as const } : f));

const c = (fn: (r: Read) => Centavo): Partial<FieldSpec> => ({ compute: fn });
const tax = (item: string, fn: (r: Read) => Centavo): [string, Partial<FieldSpec>] => [`${P}txtTax${item}`, c(fn)];

export const FORM_2550Q = buildSchema("2550Q", "Quarterly Value-Added Tax Return", scalarField, {
  [`${P}txtYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}TaxPayer`]: { required: true },
  ...Object.fromEntries([
    tax("15A", s15A), tax("15B", s15B), tax("16B", s16B), tax("19A", s19A), tax("19B", s19B), tax("20F", s20F),
    tax("21A", (r) => m(r, "txtmodalTotalAmt")), tax("21B", (r) => m(r, "txtmodalTotalInputTax")),
    tax("21C", (r) => m(r, "txtmodalTotalAmountSched3")), tax("21D", (r) => m(r, "txtmodalTotalInputTaxSched3")),
    ...PAIR.map(([base, out]) => tax(out, (r) => x12(t(r, base)))),
    tax("21P", s21P), tax("22", s22), tax("23A", s23A), tax("23B", s23B), tax("23C", s23C), tax("23F", s23F),
    tax("24", s24), tax("25", s25), tax("26B", s26B), tax("26C", s26C), tax("26D", s26D),
    tax("26H", s26H), tax("27", s27), tax("28D", s28D), tax("29", (r) => s27(r) + s28D(r)),
  ]),
  [`${P}txtTax26E`]: { gate: amended },
  txtmodalTotalInputTax20ASched3: c(s23A),
  txtTaxableSaleSched4: c((r) => t(r, "16A")),
  txtTotalSaleSched4: c(s19A),
  txtTotalInputTaxnotDirectSched4: c(s4Ratable),
  txtTotalInputSaletoGovernmentSched4: c(s4Total),
  txtlessStdTaxSched4: c(s4Std),
  txtTotal20BSched4: c(s23B),
  txtTotSaleSched5: c((r) => t(r, "18")),
  txtSumTotalSaleSched5: c(s19A),
  txtProductnotDirectSched5: c(s5Ratable),
  txtTotal20CSched5: c(s23C),
});
FORM_2550Q.group = [ATC_2550Q, SCHED2_2550Q, SCHED3A_2550Q, SCHED3B_2550Q, SCHED6_2550Q, SCHED7_2550Q, SCHED8_2550Q];

/** For each Schedule 1 row, its 0-based position on BIR's pick list (-1 if the code is not on it). */
export function pickIndex2550Q(groups: GroupState): number[] {
  const list = pickList2550Q();
  return (groups.atc ?? []).map((row) => list.findIndex((e) => e.atc_code === (row[`${P}txtAtcCde`] ?? "").trim()));
}

FORM_2550Q.extra_record = (_state, groups): SaveRecord[] => {
  const picked = new Set(pickIndex2550Q(groups));
  const record: SaveRecord[] = pickList2550Q().map((_, j) => ({ key: `AtcCode${j + 1}`, value: String(picked.has(j)) }));
  for (const [name, stem] of ROW_CHECKBOX) (groups[name] ?? []).forEach((_, i) => record.push({ key: `${stem}${i}`, value: "false" }));
  return record;
};

const DATE = /^\d{2}\/\d{2}\/\d{4}$/;

export function validate2550Q(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2550Q, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  if ((state[`${P}txtRDOCode`] ?? "000") === "000") problem.push({ id: `${P}txtRDOCode`, message: "Choose the RDO code." });
  // getATCCode rebuilds Schedule 1 in pick-list order: rows out of that order would reopen with swapped amounts
  const index = pickIndex2550Q(groups);
  index.forEach((j, k) => {
    const row = groups.atc![k]!;
    if (j < 0) problem.push({ id: `${P}txtAtcCde${k + 1}`, message: `Schedule 1 row ${k + 1}: ATC is not on this return's list.` });
    else if (k > 0 && j <= index[k - 1]!) problem.push({ id: `${P}txtAtcCde${k + 1}`, message: `Schedule 1 row ${k + 1}: list each ATC once, in BIR's ATC-list order.` });
    if (!(parseMoney(row[`${P}txtAmountSales`] ?? "") > 0)) problem.push({ id: `${P}txtAmountSales${k + 1}`, message: `Schedule 1 row ${k + 1}: enter the sales amount.` });
  });
  (groups.sched2 ?? []).forEach((row, i) => {
    if (!DATE.test((row.txtDatePurchased ?? "").trim()) || !(row.txtDescription ?? "").trim()) problem.push({ id: `txtDatePurchased${i}`, message: `Schedule 2 row ${i + 1}: enter the date (MM/DD/YYYY) and description.` });
    const amt = parseMoney(row.txtAmt ?? "");
    if (!(amt > 0) || amt > 100_000_000) problem.push({ id: `txtAmt${i}`, message: `Schedule 2 row ${i + 1}: amount must be above zero and at most ₱1,000,000.` });
  });
  for (const [name, stem, label] of [["sched6", "txtPeriodCovered", "Schedule 6"], ["sched7", "txtPeriodCoveredSch7", "Schedule 7"], ["sched8", "txtPeriodCoveredSch8", "Schedule 8"]] as const) {
    (groups[name] ?? []).forEach((row, i) => {
      if (!DATE.test((row[stem] ?? "").trim())) problem.push({ id: `${stem}${i}`, message: `${label} row ${i + 1}: enter the period covered (MM/DD/YYYY).` });
      if (name === "sched6" && parseMoney(row.txtAppliedCurr ?? "") > parseMoney(row.txtTotalWithheld ?? "")) {
        problem.push({ id: `txtAppliedCurr${i}`, message: `Schedule 6 row ${i + 1}: applied this quarter exceeds the tax withheld.` });
      }
    });
  }
  return problem;
}
