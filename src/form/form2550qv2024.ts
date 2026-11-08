// BIR Form 2550Q (Quarterly Value-Added Tax Return, 2024 edition — "2550Qv2024"), P3. No ATC tables: page 2 is a
// fixed output-tax / input-tax ladder (items 31–61), page 1 the credits and payable (items 15–26), plus seven
// runtime schedules, all 0-indexed with no size field (BIR reconstructs each by counting a key's occurrences):
//   • Schedule 1 (capital goods > ₱1M deferred input tax): txtDatePurchase1<i> … txtBalanceInputTax1<i>.
//     Per row (computeSched1) allowed = input tax ÷ recognized life × 3 ; balance = input tax − allowed.
//     Σ input tax → txtTotalAmountOfBalanceofInputTaxFromPrevious → item 39 ; Σ balance → …ToBeCarried → item 52.
//   • Schedule 3 (creditable VAT withheld): Σ txtTotalTaxWithHeld3<i> → item 16.
//   • Schedule 4 (advance VAT paid by sugar millers): Σ txtAmountPaid4<i> → item 17.
//   • Items 19 / 42 / 47 / 56 "(Specify)": the "Add more…" modal rows frm2550qv2024:totalTaxPayableNo<N>
//     Description<i>/Amount<i>; Σ amount → the item (and BIR's resultOtherCreditsNo<N>), description = row 0's,
//     or "VARIOUS" for 2+ rows (closeModalNo<N>).
// Schedule 2 (input tax attributable to exempt sales) is scalar: 53 = direct + exempt ÷ total sales × input tax.
// Chain: 31B = 34B = 31A × 12% ; 34A = 31A+32+33 ; 37 = 34B−35+36 ; 43 = 38+39+40+41+42 ; 44B/45B/46B/47B = A × 12% ;
//   50A = 44A+45A+46A+47A+48+49 ; 50B = 44B+45B+46B+47B ; 51 = 43+50B ; 57 = 52+53+54+55+56 ; 59 = 57+58 ;
//   60 = 51−59 ; 61 = 37−60 ; 15 = 61 ; 20 = 16+17+18+19 ; 21 = 15−20 ; 25 = 22+23+24 ; 26 (see compute26 below).
//
// BIR behaviours replicated because they change saved values:
//   • 12% products and the Schedule 2 ratio are BIR float arithmetic rounded by formatCurrency (x12 / ratable).
//   • compute26: when 21 < 0 and 25 > 0, item 26 is 25 alone (the excess credit is dropped, not netted); otherwise
//     21 + 25 — so a negative 21 with no penalty stays negative.
//   • Item 18 (VAT paid in the return being amended) is zeroed by validateAmendedReturn unless item 5 = Yes (gate).
//   • Item 15 is not an input: compute61AB copies 61 into it.
//   • Page 2's header (txtPg2TIN*, Pg2TaxPayer) is copied from the profile; Pg2TaxPayer keeps only the text before
//     the first comma (loadBGData's `.split(',')[0]`), e.g. "DELA CRUZ, JUAN" → "DELA CRUZ".
//   • The reload (sleeptime) blanks items 19 and 42 unless their modal rows were saved — a value typed straight
//     into the item is lost on reopen — so the native form always carries those items as modal rows.
//   • Item 4 (return period) is changeYear's string: calendar quarters unpadded ("4/01/2026"), fiscal zero-padded
//     ("04/01/2025"), the fiscal year starting the year before item 2's.
// BIR bugs NOT replicated (they depend on click history or corrupt the reload, not the arithmetic):
//   • loadSched3/loadSched4 split on "txtDateCovered3"/"txtDate4", which also match the "…To" keys, so on reopen an
//     odd row's From date shows an earlier row's To date. The native save keeps the dates as entered.
//   • closeModalNo47 never re-runs compute47AB, so with 2+ item-47 rows 47B keeps its last-blurred value; native
//     always derives 47B from 47A. capital() (string-util.js) uppercases every text field on any capital-blur.
//   • showModalNo47 tests addSpecifyNo42 (not 47) for "VARIOUS", so reopening a VARIOUS item 47 overwrites its
//     row 0 with ("VARIOUS", total). computeOtherCreditsNo42 reads `.value` twice (a no-op); closeModalNo42 still
//     copies the total in, so the saved item 42 is unaffected.

import fieldJson from "./fields/2550Qv2024.json";
import templateJson from "./template/2550Qv2024.json";
import { parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import type { SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2550qv2024:";
type Read = (id: string) => string;
const v = (r: Read, id: string): Centavo => parseMoney(r(`${P}${id}`));
/** BIR's `NumWithComma(x) * 0.12` through formatCurrency: a float product, rounded half-up to the centavo. */
export const x12 = (cents: Centavo): Centavo => parseMoney((cents / 100) * 0.12);

const DEFAULT = new Map((templateJson as Array<[string, string, string?]>).map(([key, value]) => [key, value]));

const specifyRow = (n: number): GroupSpec["row"] => [
  { id: `${P}totalTaxPayableNo${n}Description`, kind: "text" },
  { id: `${P}totalTaxPayableNo${n}Amount`, kind: "money" },
];
/** The "Add more…" modal of item 19 / 42 / 47 / 56: Σ amount → the item's amount and BIR's resultOtherCreditsNo<N>. */
const specifyGroup = (n: number, into: string): GroupSpec => ({
  name: `specify${n}`,
  first_index: 0,
  row: specifyRow(n),
  total: [
    { into, of: `${P}totalTaxPayableNo${n}Amount` },
    { into: `resultOtherCreditsNo${n}`, of: `${P}totalTaxPayableNo${n}Amount` },
  ],
});
export const SPECIFY_2550QV2024 = {
  19: specifyGroup(19, `${P}otherCreditsNo19`),
  42: specifyGroup(42, `${P}otherSpecify42`),
  47: specifyGroup(47, `${P}otherSpecify47`),
  56: specifyGroup(56, `${P}otherSpecify56`),
} as const;

/** Schedule 1 allowed input tax this quarter: BIR's `inputTax / recognizedLife * 3` (same in every month branch). */
export function sched1Allowed(inputTax: Centavo, recognizedLife: string): Centavo {
  const life = parseFloat(recognizedLife.replace(/,/g, ""));
  return parseMoney((inputTax / 100 / life) * 3);
}
export const SCHED1_2550QV2024: GroupSpec = {
  name: "sched1",
  first_index: 0,
  row: [
    { id: "txtDatePurchase1", kind: "text" }, // MM/DD/YYYY, on or before 12/31/2021
    { id: "txtSourceCode1", kind: "text" }, // "D" domestic / "I" imported
    { id: "txtDescription1", kind: "text" },
    { id: "txtAmountPurchase1", kind: "money" },
    { id: "txtInputTax1", kind: "money" },
    { id: "txtEstimatedLife1", kind: "text" }, // months, 1–60
    { id: "txtRecognizedLife1", kind: "text" }, // months
    { id: "txtAllowedInputTax1", kind: "money", row_compute: (read) => sched1Allowed(parseMoney(read("txtInputTax1")), read("txtRecognizedLife1")) },
    {
      id: "txtBalanceInputTax1",
      kind: "money",
      row_compute: (read) => parseMoney(read("txtInputTax1")) - sched1Allowed(parseMoney(read("txtInputTax1")), read("txtRecognizedLife1")),
    },
  ],
  total: [
    { into: "txtTotalAmountOfBalanceofInputTaxFromPrevious", of: "txtInputTax1" },
    { into: "sched1TotalBalPrev", of: "txtInputTax1" },
    { into: "txtTotalAmountOfBalanceofInputTaxToBeCarried", of: "txtBalanceInputTax1" },
    { into: "sched1TotalBalNext", of: "txtBalanceInputTax1" },
  ],
};
export const SCHED3_2550QV2024: GroupSpec = {
  name: "sched3",
  first_index: 0,
  row: [
    { id: "txtDateCovered3", kind: "text" },
    { id: "txtDateCovered3To", kind: "text" },
    { id: "txtNameWithHoldingAgent3", kind: "text" },
    { id: "txtIncomePayment3", kind: "money" },
    { id: "txtTotalTaxWithHeld3", kind: "money" },
  ],
  total: [
    { into: "txtTotalAmountofIncomePayment", of: "txtIncomePayment3" },
    { into: "sched3TotalIncome", of: "txtIncomePayment3" },
    { into: "txtTotalAmoungOfTaxWithHeld", of: "txtTotalTaxWithHeld3" },
    { into: "sched3TotalTax", of: "txtTotalTaxWithHeld3" },
  ],
};
export const SCHED4_2550QV2024: GroupSpec = {
  name: "sched4",
  first_index: 0,
  row: [
    { id: "txtDate4", kind: "text" },
    { id: "txtDate4To", kind: "text" },
    { id: "txtNameOfMiller4", kind: "text" },
    { id: "txtNameOfTaxpayer4", kind: "text" },
    { id: "txtOfficialReceiptNumber4", kind: "text" },
    { id: "txtAmountPaid4", kind: "money" },
  ],
  total: [
    { into: "txtAmountPaidSched4", of: "txtAmountPaid4" },
    { into: "sched4AmountPaid", of: "txtAmountPaid4" },
  ],
};

// ---- the output − input chain, every item derived from inputs (page 1 precedes page 2 in the DOM) ----
const s31A = (r: Read) => v(r, "vatableSales");
const s34A = (r: Read) => s31A(r) + v(r, "zeroRatedSales") + v(r, "exemptSales");
const s34B = (r: Read) => x12(s31A(r));
const s37 = (r: Read) => s34B(r) - v(r, "lessOutputVat") + v(r, "addOutputVat");
const s39 = (r: Read) => parseMoney(r("txtTotalAmountOfBalanceofInputTaxFromPrevious"));
const s43 = (r: Read) => v(r, "inputTaxCarried") + s39(r) + v(r, "transitionalInputTax") + v(r, "presumptiveInputTax") + v(r, "otherSpecify42");
const s50A = (r: Read) =>
  v(r, "domesticPurchase") + v(r, "servicesPurchase") + v(r, "importPurchase") + v(r, "otherSpecify47") + v(r, "domesticPurchaseNoTax") + v(r, "vatExemptImports");
const s50B = (r: Read) => x12(v(r, "domesticPurchase")) + x12(v(r, "servicesPurchase")) + x12(v(r, "importPurchase")) + x12(v(r, "otherSpecify47"));
const s51 = (r: Read) => s43(r) + s50B(r);
const s52 = (r: Read) => parseMoney(r("txtTotalAmountOfBalanceofInputTaxToBeCarried"));
/** Schedule 2 ratable portion: BIR's float `exempt / totalSales * inputTax` (0 when total sales is 0: NaN → "0.00"). */
export const ratable = (exempt: Centavo, total: Centavo, inputTax: Centavo): Centavo => parseMoney(((exempt / 100) / (total / 100)) * (inputTax / 100));
const sRatable = (r: Read) => ratable(v(r, "exemptSales"), s34A(r), v(r, "sched2AmountInputTax"));
const s53 = (r: Read) => v(r, "sched2InputTaxDirect") + sRatable(r);
const s57 = (r: Read) => s52(r) + s53(r) + v(r, "vatRefund") + v(r, "inputVatUnpaid") + v(r, "otherSpecify56");
const s59 = (r: Read) => s57(r) + v(r, "addInputVat");
const s60 = (r: Read) => s51(r) - s59(r);
const s61 = (r: Read) => s37(r) - s60(r);
const amended = { on: `${P}amendedReturnYesNo5`, equals: "true" };
const s18 = (r: Read) => (r(amended.on) === amended.equals ? v(r, "vatPaidReturn") : 0);
const s20 = (r: Read) => parseMoney(r("txtTotalAmoungOfTaxWithHeld")) + parseMoney(r("txtAmountPaidSched4")) + s18(r) + v(r, "otherCreditsNo19");
const s21 = (r: Read) => s61(r) - s20(r);
const s25 = (r: Read) => v(r, "surcharge") + v(r, "interest") + v(r, "compromise");
/** compute26: a negative 21 is dropped (not netted) once there is a penalty. */
export const item26 = (i21: Centavo, i25: Centavo): Centavo => (i21 < 0 && i25 > 0 ? i25 : i21 + i25);

const moneyStem = [
  "excessInputTax", "creditableVat", "advVatPayment", "vatPaidReturn", "otherCreditsNo19", "totalTaxCredits", "excessCredits",
  "surcharge", "interest", "compromise", "penalties", "totalPayable", "vatableSales", "outputVatSales", "zeroRatedSales",
  "exemptSales", "totalSales", "outputTaxDue", "lessOutputVat", "addOutputVat", "totalAdjOutput", "inputTaxCarried",
  "inputTaxDeferred", "transitionalInputTax", "presumptiveInputTax", "otherSpecify42", "total43", "domesticPurchase",
  "domesticInputTax", "servicesPurchase", "serviceInputTax", "importPurchase", "importInputTax", "otherSpecify47",
  "domesticPurchaseNoTax", "vatExemptImports", "totalCurPurchase", "totalCurInputTax", "totalAvailInputTax",
  "importCapitalInputTax", "inputTaxAttr", "vatRefund", "inputVatUnpaid", "otherSpecify56", "totalDeductions",
  "addInputVat", "adjDeductions", "totalAllowInputTax", "netVatPayable", "sched2InputTaxDirect", "sched2VatExemptSale",
  "sched2AmountInputTax", "sched2TotalSales", "sched2TotalRatable", "sched2TotalAttr",
];
const moneyField = new Set([
  ...moneyStem.map((s) => `${P}${s}`),
  "otherSpecify47B", "sched1TotalBalPrev", "sched1TotalBalNext", "sched3TotalIncome", "sched3TotalTax", "sched4AmountPaid",
  "resultOtherCreditsNo19", "resultOtherCreditsNo42", "resultOtherCreditsNo47", "resultOtherCreditsNo56",
  "txtTotalAmountOfBalanceofInputTaxFromPrevious", "txtTotalAmountOfBalanceofInputTaxToBeCarried",
  "txtTotalAmountofIncomePayment", "txtTotalAmoungOfTaxWithHeld", "txtAmountPaidSched4",
]);
/** Keys the native form derives in extra_record (copied / text-computed by BIR), so not user fields. */
const DERIVED = new Set([
  `${P}addSpecifyNo19`, `${P}addSpecifyNo42`, `${P}addSpecifyNo47`, `${P}addSpecifyNo56`,
  `${P}txtPg2TIN1`, `${P}txtPg2TIN2`, `${P}txtPg2TIN3`, `${P}txtPg2BranchCode`, `${P}Pg2TaxPayer`,
]);
/** Page bookkeeping, submission flags and eBIRForms-Online fields: BIR's defaults are kept as-is. */
const INTERNAL = new Set([
  `${P}txtCurrentPage`, `${P}txtMaxPage`, "txtFinalFlag", "txtEnroll", "txtEmail", "driveSelectTPExport",
  "ebirOnlineConfirmUsername", "ebirOnlineConfirmPassword", "ebirOnlineUsername", "ebirOnlinePassword", "ebirOnlineSecret",
]);
// the blank form's two static rows per schedule (…10/…11, …30/…31, …40/…41) are the groups' rows 0 and 1
const STATIC_ROW = /^(txtDatePurchase1|txtSourceCode1|txtDescription1|txtAmountPurchase1|txtInputTax1|txtEstimatedLife1|txtRecognizedLife1|txtAllowedInputTax1|txtBalanceInputTax1|txtDateCovered3|txtDateCovered3To|txtNameWithHoldingAgent3|txtIncomePayment3|txtTotalTaxWithHeld3|txtDate4|txtDate4To|txtNameOfMiller4|txtNameOfTaxpayer4|txtOfficialReceiptNumber4|txtAmountPaid4)[01]$/;

const scalarField = (fieldJson as FieldJson[])
  .filter((f) => !DERIVED.has(f.id) && !INTERNAL.has(f.id) && !STATIC_ROW.test(f.id))
  .map((f) => (moneyField.has(f.id) ? { ...f, kind: "money" as const } : f));

const c = (fn: (r: Read) => Centavo): Partial<FieldSpec> => ({ compute: fn });
const shortPeriod = { on: `${P}OptShortPrd1`, equals: "true" };

export const FORM_2550QV2024 = buildSchema("2550Qv2024", "Quarterly Value-Added Tax Return (2024)", scalarField, {
  [`${P}txtYearNo2`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}branchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}taxpayerName`]: { required: true },
  // item 4 is typed only for a short-period return; otherwise it is changeYear's (see extra_record)
  [`${P}RtnPeriodFromNo4`]: { gate: shortPeriod },
  [`${P}RtnPeriodToNo4`]: { gate: shortPeriod },
  [`${P}excessInputTax`]: c(s61),
  [`${P}creditableVat`]: c((r) => parseMoney(r("txtTotalAmoungOfTaxWithHeld"))),
  [`${P}advVatPayment`]: c((r) => parseMoney(r("txtAmountPaidSched4"))),
  [`${P}vatPaidReturn`]: { gate: amended },
  [`${P}totalTaxCredits`]: c(s20),
  [`${P}excessCredits`]: c(s21),
  [`${P}penalties`]: c(s25),
  [`${P}totalPayable`]: c((r) => item26(s21(r), s25(r))),
  [`${P}outputVatSales`]: c(s34B),
  [`${P}totalSales`]: c(s34A),
  [`${P}outputTaxDue`]: c(s34B),
  [`${P}totalAdjOutput`]: c(s37),
  [`${P}inputTaxDeferred`]: c(s39),
  [`${P}total43`]: c(s43),
  [`${P}domesticInputTax`]: c((r) => x12(v(r, "domesticPurchase"))),
  [`${P}serviceInputTax`]: c((r) => x12(v(r, "servicesPurchase"))),
  [`${P}importInputTax`]: c((r) => x12(v(r, "importPurchase"))),
  otherSpecify47B: c((r) => x12(v(r, "otherSpecify47"))),
  [`${P}totalCurPurchase`]: c(s50A),
  [`${P}totalCurInputTax`]: c(s50B),
  [`${P}totalAvailInputTax`]: c(s51),
  [`${P}importCapitalInputTax`]: c(s52),
  [`${P}inputTaxAttr`]: c(s53),
  [`${P}totalDeductions`]: c(s57),
  [`${P}adjDeductions`]: c(s59),
  [`${P}totalAllowInputTax`]: c(s60),
  [`${P}netVatPayable`]: c(s61),
  [`${P}sched2VatExemptSale`]: c((r) => v(r, "exemptSales")),
  [`${P}sched2TotalSales`]: c(s34A),
  [`${P}sched2TotalRatable`]: c(sRatable),
  [`${P}sched2TotalAttr`]: c(s53),
});
FORM_2550QV2024.group = [SCHED1_2550QV2024, SCHED3_2550QV2024, SCHED4_2550QV2024, ...Object.values(SPECIFY_2550QV2024)];

const daysIn = (month: number, year: number): number => new Date(year, month, 0).getDate();
const pad2 = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Item 4, the return period, exactly as BIR's changeYear writes it: [from, to] ("" when no quarter is picked). */
export function returnPeriod2550Qv2024(state: FormState): [string, string] {
  const get = (id: string) => state[`${P}${id}`] ?? DEFAULT.get(`${P}${id}`) ?? "";
  const yearText = get("txtYearNo2");
  const quarter = [1, 2, 3, 4].find((q) => get(`OptQuarter${q}`) === "true");
  if (yearText === "" || !quarter) return ["", ""];
  const month = parseInt(get("selectedMonthNo2"), 10);
  const year = parseInt(yearText, 10);
  if (get("calendarNo1") === "true") {
    let start1 = month + 1;
    if (start1 > 12) start1 = 1;
    let end1 = start1 + 2;
    if (end1 > 12) end1 -= 12;
    // quarter q starts end1 + (1, 4, 7) — Q1 uses start1 itself; months are NOT zero-padded here
    let start = quarter === 1 ? start1 : end1 + [0, 1, 4, 7][quarter - 1]!;
    if (start > 12) start -= 12;
    let end = quarter === 1 ? end1 : start + 2;
    if (end > 12) end -= 12;
    return [`${start}/01/${year}`, `${end}/${daysIn(end, year)}/${year}`];
  }
  if (get("fiscalNo1") === "true") {
    let from = month + [1, 4, 7, 10][quarter - 1]!;
    let yearFrom = year - 1;
    if (from > 12) {
      from -= 12;
      yearFrom += 1;
    }
    const to = from === 11 ? 1 : from === 12 ? 2 : from + 2;
    const yearTo = from > to ? yearFrom + 1 : yearFrom;
    return [`${pad2(from)}/01/${yearFrom}`, `${pad2(to)}/${daysIn(to, yearTo)}/${yearTo}`];
  }
  return ["", ""];
}

/** An item's "(Specify)" description as closeModalNo<N> leaves it: row 0's, or "VARIOUS" for 2+ rows. */
export const specifyDescription = (row: GroupRow[], n: number): string =>
  row.length > 1 ? "VARIOUS" : row.length === 1 ? (row[0]![`${P}totalTaxPayableNo${n}Description`] ?? "") : "";

FORM_2550QV2024.extra_record = (state, groups): SaveRecord[] => {
  const [from, to] = returnPeriod2550Qv2024(state);
  const isShort = state[shortPeriod.on] === shortPeriod.equals;
  const record: SaveRecord[] = [];
  if (!isShort || !(state[`${P}RtnPeriodFromNo4`] ?? "")) record.push({ key: `${P}RtnPeriodFromNo4`, value: from });
  if (!isShort || !(state[`${P}RtnPeriodToNo4`] ?? "")) record.push({ key: `${P}RtnPeriodToNo4`, value: to });
  for (const n of [19, 42, 47, 56]) record.push({ key: `${P}addSpecifyNo${n}`, value: specifyDescription(groups[`specify${n}`] ?? [], n) });
  const copy = (from: string, to: string) => {
    if (state[`${P}${from}`] !== undefined) record.push({ key: `${P}${to}`, value: state[`${P}${from}`]! });
  };
  copy("txtTIN1", "txtPg2TIN1");
  copy("txtTIN2", "txtPg2TIN2");
  copy("txtTIN3", "txtPg2TIN3");
  copy("branchCode", "txtPg2BranchCode");
  if (state[`${P}taxpayerName`] !== undefined) record.push({ key: `${P}Pg2TaxPayer`, value: state[`${P}taxpayerName`]!.split(",")[0]! });
  return record;
};

const DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const dateValue = (s: string): number | null => {
  const m = DATE.exec(s.trim());
  return m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2])).getTime() : null;
};
/** BIR's own item-4 strings ("4/01/2026") parsed the way dateSched3 does: split on "/" into M, D, Y. */
const periodValue = (s: string): number | null => {
  const part = s.split("/");
  return part.length === 3 ? new Date(Number(part[2]), Number(part[0]) - 1, Number(part[1])).getTime() : null;
};

export function validate2550Qv2024(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2550QV2024, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  if ((state[`${P}txtRDOCode`] ?? "000") === "000") problem.push({ id: `${P}txtRDOCode`, message: "Enter a valid RDO code (item 8)." });
  if (![1, 2, 3, 4].some((q) => state[`${P}OptQuarter${q}`] === "true")) problem.push({ id: `${P}OptQuarter1`, message: "Choose the quarter (item 3)." });
  if (state[`${P}calendarNo1`] === "true" && (state[`${P}selectedMonthNo2`] ?? "12") !== "12") {
    problem.push({ id: `${P}selectedMonthNo2`, message: "A calendar-year return ends in December (item 2)." });
  }
  (groups.sched1 ?? []).forEach((row, i) => {
    const date = DATE.exec((row.txtDatePurchase1 ?? "").trim());
    if (!date) problem.push({ id: `txtDatePurchase1${i}`, message: `Schedule 1 row ${i + 1}: date of purchase must be MM/DD/YYYY.` });
    else if (Number(date[3]) > 2021) problem.push({ id: `txtDatePurchase1${i}`, message: `Schedule 1 row ${i + 1}: only purchases on or before 12/31/2021 are allowed.` });
    if (!/^[DI]$/i.test((row.txtSourceCode1 ?? "").trim())) problem.push({ id: `txtSourceCode1${i}`, message: `Schedule 1 row ${i + 1}: source code is D or I.` });
    const est = Number(row.txtEstimatedLife1 ?? "");
    if (!(est >= 1 && est <= 60)) problem.push({ id: `txtEstimatedLife1${i}`, message: `Schedule 1 row ${i + 1}: estimated life is 1 to 60 months.` });
    if (!(parseFloat(row.txtRecognizedLife1 ?? "") > 0)) problem.push({ id: `txtRecognizedLife1${i}`, message: `Schedule 1 row ${i + 1}: enter the recognized life.` });
  });
  const [from, to] = returnPeriod2550Qv2024(state).map(periodValue);
  const periodCheck = (rows: GroupRow[], fromStem: string, toStem: string, label: string) =>
    rows.forEach((row, i) => {
      const a = dateValue(row[fromStem] ?? "");
      const b = dateValue(row[toStem] ?? "");
      if (a === null || b === null) problem.push({ id: `${fromStem}${i}`, message: `${label} row ${i + 1}: enter both dates (MM/DD/YYYY).` });
      else if (from != null && to != null && (a < from || a > to || b < from || b > to)) problem.push({ id: `${fromStem}${i}`, message: `${label} row ${i + 1}: dates must fall within the return period.` });
      else if (a > b) problem.push({ id: `${fromStem}${i}`, message: `${label} row ${i + 1}: the From date is after the To date.` });
    });
  periodCheck(groups.sched3 ?? [], "txtDateCovered3", "txtDateCovered3To", "Schedule 3");
  periodCheck(groups.sched4 ?? [], "txtDate4", "txtDate4To", "Schedule 4");
  for (const n of [19, 42, 47, 56]) {
    (groups[`specify${n}`] ?? []).forEach((row, i) => {
      if (!(row[`${P}totalTaxPayableNo${n}Description`] ?? "").trim() || !(parseMoney(row[`${P}totalTaxPayableNo${n}Amount`] ?? "") > 0)) {
        problem.push({ id: `${P}totalTaxPayableNo${n}Description${i}`, message: `Item ${n} row ${i + 1}: enter a description and an amount above zero.` });
      }
    });
  }
  return problem;
}
