// BIR Form 2550M (Monthly Value-Added Tax Declaration), P3. One page (items 12–26) fed by eight schedules — the
// same machinery as 2550Q (see form2550q.ts) with monthly numbering and a few differences of BIR's own:
//   • Schedule 1 (sales to private parties, by ATC): rows frm2550m:txtAtcCde/txtAmountSales/txtOutputTax<x>, rebuilt
//     from the checked AtcCode<j> boxes in pick-list order; output tax = sales × 12% ; Σ → frm2550M:txtmodaltxtTotal12A/B
//     (BIR's capital "M") → items 12A/12B.
//   • Schedule 2 (capital goods ≤ ₱1M) → 18A/18B ; Schedule 3A → 18C/18D ; 3A + 3B balances → 20A.
//     Here BIR computes the allowable input tax: 3A allowed = input tax ÷ recognized life, 3B allowed = balance from
//     previous period ÷ recognized life (2550Q leaves both typed).
//   • Schedule 4 (sales to government) → 20B ; Schedule 5 (exempt sales) → 20C.
//   • Schedules 6 / 7 / 8 have no "prior two months" column: 23A / 23B / 23C = Σ applied this month.
// Chain: 13B = 13A × 12% ; 16A = 12A+13A+14+15 ; 16B = 12B+13B ; 17F = 17A..17E ; 18F/H/J/L/O = 18E/G/I/K/N × 12% ;
//   18P = 18A+C+E+G+I+K+M+N ; 19 = 17F+18B+D+F+H+J+L+O ; 20F = 20A..20E ; 21 = 19−20F ; 22 = 16B−21 ;
//   23G = 23A..23F ; 24 = 22−23G ; 25D = 25A+B+C ; 26 = 24+25D.
//
// BIR behaviours replicated because they change saved values:
//   • 12% products, the Schedule 3 ÷ recognized-life divisions, the Schedule 4/5 ratios and the 7% standard input
//     tax (`13A * 7 / 100`) are BIR float arithmetic rounded by formatCurrency.
//   • 13B and 18F/H/J/L/O are typeable but re-derived on every blur of 13A / 18E…, so they are computed here.
//   • Item 23D (VAT paid in the return being amended) is zeroed by optAmendFunc unless item 2 = Yes (gate).
//   • Schedule 4 / 5 copy their sales figures (13A, 15, 16A) only when opened, and 20B / 20C are written only by their
//     OK buttons: an untouched schedule keeps its BIR blank values and leaves 20B / 20C at 0.
// BIR quirks NOT replicated: compute24 ends with capital(), which uppercases every text field on any amount blur.

import fieldJson from "./fields/2550M.json";
import { atcPickList, type AtcPick } from "./atc.ts";
import { parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import type { SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2550m:";
type Read = (id: string) => string;
const t = (r: Read, item: string): Centavo => parseMoney(r(`${P}txtTax${item}`));
const m = (r: Read, id: string): Centavo => parseMoney(r(id));
/** BIR's `NumWithComma(x) * 0.12` through formatCurrency: a float product, rounded half-up to the centavo. */
export const x12 = (cents: Centavo): Centavo => parseMoney((cents / 100) * 0.12);
/** BIR's float `part / whole * inputTax` (Schedules 4 and 5); a zero whole is NaN → "0.00". */
export const ratable = (part: Centavo, whole: Centavo, inputTax: Centavo): Centavo => parseMoney(((part / 100) / (whole / 100)) * (inputTax / 100));
/** changedTxtTax13A: the standard input tax on sales to government, `13A * 7 / 100`. */
export const standardInputTax = (sales: Centavo): Centavo => parseMoney(((sales / 100) * 7) / 100);
/** computeSumTax3A/3B: `amount / recognizedLife` (an empty or zero life is BIR's division by zero → "0.00" here). */
export const perLife = (cents: Centavo, life: string): Centavo => parseMoney(cents / 100 / parseFloat(life.replace(/,/g, "")));

/** BIR's ATC pick list for 2550M (loadATC keeps every atcCodes.xml record containing "2550M"). */
export const pickList2550M = (): AtcPick[] => atcPickList("2550M", "");

export const ATC_2550M: GroupSpec = {
  name: "atc",
  first_index: 1,
  row: [
    { id: `${P}txtAtcCde`, kind: "text" },
    { id: `${P}txtAmountSales`, kind: "money" },
    { id: `${P}txtOutputTax`, kind: "money", row_compute: (read) => x12(parseMoney(read(`${P}txtAmountSales`))) },
  ],
  total: [
    { into: "frm2550M:txtmodaltxtTotal12A", of: `${P}txtAmountSales` },
    { into: "frm2550M:txtmodaltxtTotal12B", of: `${P}txtOutputTax` },
  ],
};
export const SCHED2_2550M: GroupSpec = {
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
const input3A = (read: Read) => x12(parseMoney(read("txtAmt3A")));
const allow3A = (read: Read) => perLife(input3A(read), read("txtRecogLife3A"));
export const SCHED3A_2550M: GroupSpec = {
  name: "sched3A",
  first_index: 0,
  row: [
    { id: "txtDatePurchased3A", kind: "text" },
    { id: "txtDescription3A", kind: "text" },
    { id: "txtAmt3A", kind: "money" }, // the reload counts this key
    { id: "txtInputTax3A", kind: "money", row_compute: input3A },
    { id: "txtEstLife3A", kind: "text" },
    { id: "txtRecogLife3A", kind: "text" },
    { id: "txtAllowInputTax3A", kind: "money", row_compute: allow3A },
    { id: "txtBalInputTax3A", kind: "money", row_compute: (read) => input3A(read) - allow3A(read) },
  ],
  total: [
    { into: "txtmodalTotalAmountSched3", of: "txtAmt3A" },
    { into: "txtmodalTotalInputTaxSched3", of: "txtInputTax3A" },
    { into: "txtmodalTotalBalanceSched3A", of: "txtBalInputTax3A" },
  ],
};
const allow3B = (read: Read) => perLife(parseMoney(read("txtBalInputTaxPrevious3B")), read("txtRecogLife3B"));
export const SCHED3B_2550M: GroupSpec = {
  name: "sched3B",
  first_index: 0,
  row: [
    { id: "txtDatePurchased3B", kind: "text" },
    { id: "txtDescription3B", kind: "text" },
    { id: "txtAmt3B", kind: "money" }, // the reload counts this key
    { id: "txtBalInputTaxPrevious3B", kind: "money" },
    { id: "txtEstLife3B", kind: "text" },
    { id: "txtRecogLife3B", kind: "text" },
    { id: "txtAllowInputTax3B", kind: "money", row_compute: allow3B },
    { id: "txtBalInputTax3B", kind: "money", row_compute: (read) => parseMoney(read("txtBalInputTaxPrevious3B")) - allow3B(read) },
  ],
  total: { into: "txtmodalTotalBalanceSched3B", of: "txtBalInputTax3B" },
};
const creditSchedule = (name: string, row: GroupSpec["row"], total: string, applied: string, into: [string, string]): GroupSpec => ({
  name,
  first_index: 0,
  row,
  total: [
    { into: into[0], of: total },
    { into: into[1], of: applied },
  ],
});
export const SCHED6_2550M = creditSchedule(
  "sched6",
  [
    { id: "txtPeriodCovered", kind: "text" }, // the reload counts this key
    { id: "txtNameAgent", kind: "text" },
    { id: "txtIncomePayment", kind: "money" },
    { id: "txtTotalWithheld", kind: "money" },
    { id: "txtAppliedCurr", kind: "money" },
  ],
  "txtTotalWithheld",
  "txtAppliedCurr",
  ["txtmodalTotal23A", "txtmodalTotalSched6AppliedCurrent"],
);
export const SCHED7_2550M = creditSchedule(
  "sched7",
  [
    { id: "txtPeriodCoveredSch7", kind: "text" }, // the reload counts this key
    { id: "txtNameMillerSch7", kind: "text" },
    { id: "txtNameTaxPayerSch7", kind: "text" },
    { id: "txtORNumSch7", kind: "text" },
    { id: "txtAmountPaidSch7", kind: "money" },
    { id: "txtAppliedCurrSch7", kind: "money" },
  ],
  "txtAmountPaidSch7",
  "txtAppliedCurrSch7",
  ["txtmodalTotal23B", "txtmodalTotalSched7AppliedCurrent"],
);
export const SCHED8_2550M = creditSchedule(
  "sched8",
  [
    { id: "txtPeriodCoveredSch8", kind: "text" },
    { id: "txtNameAgentSch8", kind: "text" }, // the reload counts this key
    { id: "txtIncomePaymentSch8", kind: "money" },
    { id: "txtTotalWithheldSch8", kind: "money" },
    { id: "txtAppliedCurrSch8", kind: "money" },
  ],
  "txtTotalWithheldSch8",
  "txtAppliedCurrSch8",
  ["txtmodalTotal23C", "txtmodalTotalSched8AppliedCurrent"],
);
/** Schedules whose rows carry a "select for delete" checkbox chxSched<N><i> (saved, always false). */
const ROW_CHECKBOX: Array<[string, string]> = [
  ["sched2", "chxSched2"], ["sched3A", "chxSched3A"], ["sched3B", "chxSched3B"],
  ["sched6", "chxSched6"], ["sched7", "chxSched7"], ["sched8", "chxSched8"],
];

// ---- the chain, each item derived from inputs (Schedules 4/5 sit after the page in the DOM) ----
const s12A = (r: Read) => m(r, "frm2550M:txtmodaltxtTotal12A");
const s12B = (r: Read) => m(r, "frm2550M:txtmodaltxtTotal12B");
const s13B = (r: Read) => x12(t(r, "13A"));
const s16A = (r: Read) => s12A(r) + t(r, "13A") + t(r, "14") + t(r, "15");
const s16B = (r: Read) => s12B(r) + s13B(r);
const s17F = (r: Read) => t(r, "17A") + t(r, "17B") + t(r, "17C") + t(r, "17D") + t(r, "17E");
const PAIR: Array<[string, string]> = [["18E", "18F"], ["18G", "18H"], ["18I", "18J"], ["18K", "18L"], ["18N", "18O"]];
const s18P = (r: Read) =>
  m(r, "txtmodalTotalAmt") + m(r, "txtmodalTotalAmountSched3") + t(r, "18E") + t(r, "18G") + t(r, "18I") + t(r, "18K") + t(r, "18M") + t(r, "18N");
const s19 = (r: Read) =>
  s17F(r) + m(r, "txtmodalTotalInputTax") + m(r, "txtmodalTotalInputTaxSched3") + PAIR.reduce((sum, [base]) => sum + x12(t(r, base)), 0);
const s20A = (r: Read) => m(r, "txtmodalTotalBalanceSched3A") + m(r, "txtmodalTotalBalanceSched3B");
// Schedule 4 / 5 count once they hold input tax (their copies and 20B/20C are written only when opened / OK'd)
const s4Used = (r: Read) => m(r, "txtinputtaxSched4") !== 0 || m(r, "txtInputTaxnotDirectSched4") !== 0;
const s4Taxable = (r: Read) => (s4Used(r) ? t(r, "13A") : 0);
const s4Whole = (r: Read) => (s4Used(r) ? s16A(r) : 0);
const s4Ratable = (r: Read) => (s4Used(r) ? ratable(s4Taxable(r), s4Whole(r), m(r, "txtInputTaxnotDirectSched4")) : 0);
const s4Total = (r: Read) => (s4Used(r) ? m(r, "txtinputtaxSched4") + s4Ratable(r) : 0);
const s4Std = (r: Read) => standardInputTax(t(r, "13A"));
const s20B = (r: Read) => (s4Used(r) ? s4Total(r) - s4Std(r) : 0);
const s5Used = (r: Read) => m(r, "txtinputtaxSched5") !== 0 || m(r, "txtAmountInputnotDirectSched5") !== 0;
const s5Part = (r: Read) => (s5Used(r) ? t(r, "15") : 0);
const s5Whole = (r: Read) => (s5Used(r) ? s16A(r) : 0);
const s5Ratable = (r: Read) => (s5Used(r) ? ratable(s5Part(r), s5Whole(r), m(r, "txtAmountInputnotDirectSched5")) : 0);
const s20C = (r: Read) => (s5Used(r) ? m(r, "txtinputtaxSched5") + s5Ratable(r) : 0);
const s20F = (r: Read) => s20A(r) + s20B(r) + s20C(r) + t(r, "20D") + t(r, "20E");
const s21 = (r: Read) => s19(r) - s20F(r);
const s22 = (r: Read) => s16B(r) - s21(r);
const amended = { on: `${P}OptAmendedYN1`, equals: "true" };
const s23D = (r: Read) => (r(amended.on) === amended.equals ? t(r, "23D") : 0);
const s23G = (r: Read) =>
  m(r, "txtmodalTotalSched6AppliedCurrent") + m(r, "txtmodalTotalSched7AppliedCurrent") + m(r, "txtmodalTotalSched8AppliedCurrent") + s23D(r) + t(r, "23E") + t(r, "23F");
const s24 = (r: Read) => s22(r) - s23G(r);
const s25D = (r: Read) => t(r, "25A") + t(r, "25B") + t(r, "25C");

const moneyField = new Set([
  "frm2550M:txtmodaltxtTotal12A", "frm2550M:txtmodaltxtTotal12B", "txtmodalTotalAmt", "txtmodalTotalInputTax", "txtmodalTotalAmountSched3",
  "txtmodalTotalInputTaxSched3", "txtmodalTotalBalanceSched3A", "txtmodalTotalBalanceSched3B", "txtmodalTotalInputTax20ASched3",
  "txtinputtaxSched4", "txtTaxableSaleSched4", "txtInputTaxnotDirectSched4", "txtTotalInputTaxnotDirectSched4", "txtTotalSaleSched4",
  "txtTotalInputSaletoGovernmentSched4", "txtlessStdTaxSched4", "txtTotal20BSched4", "txtinputtaxSched5", "txtTotSaleSched5",
  "txtAmountInputnotDirectSched5", "txtProductnotDirectSched5", "txtSumTotalSaleSched5", "txtTotal20CSched5",
  "txtmodalTotal23A", "txtmodalTotalSched6AppliedCurrent", "txtmodalTotal23B", "txtmodalTotalSched7AppliedCurrent",
  "txtmodalTotal23C", "txtmodalTotalSched8AppliedCurrent",
]);
/** Submission / eBIRForms-Online state: BIR's defaults stand. */
const DROP = new Set([
  "txtFinalFlag", "txtEnroll", "txtEmail", "driveSelectTPExport",
  "ebirOnlineConfirmUsername", "ebirOnlineConfirmPassword", "ebirOnlineUsername", "ebirOnlinePassword", "ebirOnlineSecret",
]);
// tool/form-fields.mjs misses item 11's "Yes" radio (BIR wrote `id ="…"` with a space); it precedes OptSpecialTax2
const scalarField = (fieldJson as FieldJson[])
  .filter((f) => !DROP.has(f.id))
  .flatMap((f): FieldJson[] => (f.id === `${P}OptSpecialTax2` ? [{ id: `${P}OptSpecialTax1`, kind: "radio" }, f] : [f]))
  .map((f) => (moneyField.has(f.id) ? { ...f, kind: "money" as const } : f));

const c = (fn: (r: Read) => Centavo): Partial<FieldSpec> => ({ compute: fn });
const tax = (item: string, fn: (r: Read) => Centavo): [string, Partial<FieldSpec>] => [`${P}txtTax${item}`, c(fn)];

export const FORM_2550M = buildSchema("2550M", "Monthly Value-Added Tax Declaration", scalarField, {
  [`${P}txtYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxPayerName`]: { required: true },
  ...Object.fromEntries([
    tax("12A", s12A), tax("12B", s12B), tax("13B", s13B), tax("16A", s16A), tax("16B", s16B), tax("17F", s17F),
    tax("18A", (r) => m(r, "txtmodalTotalAmt")), tax("18B", (r) => m(r, "txtmodalTotalInputTax")),
    tax("18C", (r) => m(r, "txtmodalTotalAmountSched3")), tax("18D", (r) => m(r, "txtmodalTotalInputTaxSched3")),
    ...PAIR.map(([base, out]) => tax(out, (r) => x12(t(r, base)))),
    tax("18P", s18P), tax("19", s19), tax("20A", s20A), tax("20B", s20B), tax("20C", s20C), tax("20F", s20F),
    tax("21", s21), tax("22", s22),
    tax("23A", (r) => m(r, "txtmodalTotalSched6AppliedCurrent")), tax("23B", (r) => m(r, "txtmodalTotalSched7AppliedCurrent")),
    tax("23C", (r) => m(r, "txtmodalTotalSched8AppliedCurrent")),
    tax("23G", s23G), tax("24", s24), tax("25D", s25D), tax("26", (r) => s24(r) + s25D(r)),
  ]),
  [`${P}txtTax23D`]: { gate: amended },
  txtmodalTotalInputTax20ASched3: c(s20A),
  txtTaxableSaleSched4: c(s4Taxable),
  txtTotalSaleSched4: c(s4Whole),
  txtTotalInputTaxnotDirectSched4: c(s4Ratable),
  txtTotalInputSaletoGovernmentSched4: c(s4Total),
  txtlessStdTaxSched4: c(s4Std),
  txtTotal20BSched4: c(s20B),
  txtTotSaleSched5: c(s5Part),
  txtSumTotalSaleSched5: c(s5Whole),
  txtProductnotDirectSched5: c(s5Ratable),
  txtTotal20CSched5: c(s20C),
});
FORM_2550M.group = [ATC_2550M, SCHED2_2550M, SCHED3A_2550M, SCHED3B_2550M, SCHED6_2550M, SCHED7_2550M, SCHED8_2550M];

/** For each Schedule 1 row, its 0-based position on BIR's pick list (-1 if the code is not on it). */
export function pickIndex2550M(groups: GroupState): number[] {
  const list = pickList2550M();
  return (groups.atc ?? []).map((row) => list.findIndex((e) => e.atc_code === (row[`${P}txtAtcCde`] ?? "").trim()));
}

FORM_2550M.extra_record = (_state, groups): SaveRecord[] => {
  const picked = new Set(pickIndex2550M(groups));
  const record: SaveRecord[] = pickList2550M().map((_, j) => ({ key: `AtcCode${j + 1}`, value: String(picked.has(j)) }));
  for (const [name, stem] of ROW_CHECKBOX) (groups[name] ?? []).forEach((_, i) => record.push({ key: `${stem}${i}`, value: "false" }));
  return record;
};

const DATE = /^\d{2}\/\d{2}\/\d{4}$/;

export function validate2550M(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2550M, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  if ((state[`${P}txtRDOCode`] ?? "000") === "000") problem.push({ id: `${P}txtRDOCode`, message: "Choose the RDO code." });
  if ((state[`${P}RtnYear`] ?? "00") === "00") problem.push({ id: `${P}RtnYear`, message: "Choose the month (item 1)." });
  // getATCCode rebuilds Schedule 1 in pick-list order: rows out of that order would reopen with swapped amounts
  const index = pickIndex2550M(groups);
  index.forEach((j, k) => {
    const row = groups.atc![k]!;
    if (j < 0) problem.push({ id: `${P}txtAtcCde${k + 1}`, message: `Schedule 1 row ${k + 1}: ATC is not on this return's list.` });
    else if (k > 0 && j <= index[k - 1]!) problem.push({ id: `${P}txtAtcCde${k + 1}`, message: `Schedule 1 row ${k + 1}: list each ATC once, in BIR's ATC-list order.` });
    if (!(parseMoney(row[`${P}txtAmountSales`] ?? "") > 0)) problem.push({ id: `${P}txtAmountSales${k + 1}`, message: `Schedule 1 row ${k + 1}: enter the sales amount.` });
  });
  let total2 = 0;
  (groups.sched2 ?? []).forEach((row, i) => {
    if (!DATE.test((row.txtDatePurchased ?? "").trim()) || !(row.txtDescription ?? "").trim()) problem.push({ id: `txtDatePurchased${i}`, message: `Schedule 2 row ${i + 1}: enter the date (MM/DD/YYYY) and description.` });
    const amt = parseMoney(row.txtAmt ?? "");
    total2 += amt;
    if (!(amt > 0) || amt > 100_000_000) problem.push({ id: `txtAmt${i}`, message: `Schedule 2 row ${i + 1}: amount must be above zero and at most ₱1,000,000.` });
  });
  // getSched2Modal refuses (and keeps 18A/18B unchanged) when the schedule's total exceeds ₱1M
  if (total2 > 100_000_000) problem.push({ id: "txtmodalTotalAmt", message: "Schedule 2's total must not exceed ₱1,000,000." });
  for (const [name, stem] of [["sched3A", "txtRecogLife3A"], ["sched3B", "txtRecogLife3B"]] as const) {
    (groups[name] ?? []).forEach((row, i) => {
      if (!(parseFloat(row[stem] ?? "") > 0)) problem.push({ id: `${stem}${i}`, message: `Schedule 3 row ${i + 1}: enter the recognized life (months).` });
    });
  }
  for (const [name, stem, label] of [["sched6", "txtPeriodCovered", "Schedule 6"], ["sched7", "txtPeriodCoveredSch7", "Schedule 7"], ["sched8", "txtPeriodCoveredSch8", "Schedule 8"]] as const) {
    (groups[name] ?? []).forEach((row, i) => {
      if (!DATE.test((row[stem] ?? "").trim())) problem.push({ id: `${stem}${i}`, message: `${label} row ${i + 1}: enter the period covered (MM/DD/YYYY).` });
    });
  }
  return problem;
}
