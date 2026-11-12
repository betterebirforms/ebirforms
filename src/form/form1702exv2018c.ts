// BIR Form 1702-EX (Annual Income Tax Return for Use ONLY by Corporation, Partnership and Other Non-Individual
// Taxpayer EXEMPT under the Tax Code, as Amended, Sec. 30 and those exempted in Sec. 27(C) and Other Special Laws,
// with NO Other Taxable Income), the 2018 layout, P3. One shared builder for BOTH 2018 editions — 1702EXv2018C
// (current) and 1702EXv2018 (superseded) have the SAME 187 save keys in the same DOM order and differ only in item 40
// and Part V (`Edition` below). Field prefix `frm1702EX:`. The computation lives in FormatAmount / amountComputation /
// compTaxReliefAvail (no compute* functions); here it is one pure model of the INPUTS (`model`):
//   30 = 28−29   32 = 30−31   34 = 32+33
//   Sch 1 18 = Σ items 1–17i (17i opens a pop-up)   Sch 2 5 = Σ items 1–4 (4 opens a pop-up)
//   itemized: 35 = Sch1 18, 36 = Sch2 5, 38 = 0, 39 = 34−37      OSD: 38 = 34 × 40%, 35 = 36 = 0, 39 = 34−38
//   37 = 35+36   41 = 39 × 40 (rate) ÷ 100   50 = Σ 42–49   51 = 41−50
//   18 = 41, 19 = 50, 20 = 51   22 = 20 ≥ 0 ? 20+21 : (21 > 0 ? 21 : 20)
//   Part V: v2018C 52 / 53 are entered, 54 = 52+53; v2018 52 = 39 × r, 53 = 36 × r, r = 30% for years ≤ 2020
//   Sch 3 (reconciliation): 4 = 1+2+3   9 = 5+6+7+8   10 = 4−9   (3, 6, 8 open pop-ups)
//
// BIR arithmetic replicated because it changes SAVED values (each named where it is applied):
//   • every total is formatCurrency((a ± b …).toFixed(0)) on binary floats: whole pesos, rounded half away from zero
//     by Number#toFixed — except Sch 3 item 4, which BIR formats WITHOUT toFixed(0) and so keeps its centavos;
//   • item 22 on an overpayment with penalties is formatCurrency(21) — the penalty's centavos survive;
//   • 38 = 34 × 40% is also written while NO method is ticked (FormatAmount always sets it; only the itemized
//     branch of amountComputation zeroes it), and 39 then never leaves its initial 0;
//   • the tax due is not clamped: a net LOSS (39 < 0) times the rate is a negative item 41;
//   • v2018's rate test is `YearEnd.value <= 20` on the 2-digit year string, and its item 40 is overwritten by
//     taxRate.xml's "0" on every load, so v2018's 41 is always 0;
//   • pop-up rows are whole pesos (toComma → FormatValue truncates, a negative row becomes 0), and the Sch 3 item-3
//     pop-up's amount input has maxlength 12, so saveXML strips its commas ("1234.00");
//   • ticking OSD (disableForOSD) zeroes and clears Sch 1 and Sch 2 — but NOT their pop-up rows, which stay in the
//     DOM and in the savefile with their count and subtotal;
//   • item 47 (tax paid in a return previously filed) is set to the literal 0 by checkFilingYear unless amended.
// The year-end, date-of-incorporation and effectivity-date checks read the clock, as BIR's do.

import frozen from "./template/1702EXv2018C.json";
import { liveTemplate } from "./clock.ts";

const template = liveTemplate("1702EXv2018C", frozen as Array<[string, string, string?]>);
import { parseMoney, type Centavo } from "./money.ts";
import {
  validate as validateRequired,
  type FieldJson,
  type FieldSpec,
  type FormSchema,
  type FormState,
  type GroupSpec,
  type GroupState,
  type Problem,
} from "./schema.ts";
import { legacyEscape, type SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

export type Edition = "2018" | "2018C";
export const P = "frm1702EX:";
type Read = (id: string) => string;

// ── BIR's float arithmetic ──────────────────────────────────────────────────────────────────────────────────────

/** NumWithComma on a field BIR has already round()ed ("1,234.56"), as a float peso. An unset native field is the
 *  template's "0.00". */
export const num = (s: string): number => parseMoney(s) / 100;
/** formatCurrency((x).toFixed(0)): whole pesos by Number#toFixed (NaN → 0), in centavos. */
export const fix0 = (x: number): Centavo => (Number.isFinite(x) ? Number(x.toFixed(0)) * 100 : 0);
/** formatCurrency(x) on a float: Math.floor(|x| × 100 + 0.50000000001), sign kept, in centavos. */
export const fc = (x: number): Centavo => {
  if (!Number.isFinite(x)) return 0;
  const c = Math.floor(Math.abs(x) * 100 + 0.50000000001);
  return x < 0 ? -c : c;
};
const peso = (c: Centavo): number => c / 100;
/** Left-to-right float sum, as BIR writes `a * 1 + b * 1 + …`. */
const sum = (x: number[]): number => x.reduce((s, v) => s + v, 0);

// ── field ids ───────────────────────────────────────────────────────────────────────────────────────────────────

const SC1_ITEM = [
  "Ammortization", "BadDebts", "CharitableContrib", "Depletion", "Depreciation", "EntertainmentAmuseRecreate",
  "FringeBenefits", "Interest", "Losses", "PensionTrust", "Rental", "RnD", "SalaryWageAllowance", "SssGsisPHealthHDMFOthers",
  "TaxAndLicense", "TranspoAndTravel", "aJanitorAndMessengerServ", "bProfessionalFee", "cSecurityServices",
].map((x, i) => `txtPg3Pt6S1I${i < 16 ? i + 1 : 17}${x}`);
const SC1_OTHER = ["D", "E", "F", "G", "H", "I"]; // 17D–17I: Desc + Amt (17I opens the pop-up)
const SC2_ROW = [1, 2, 3, 4]; // Description, LegalBasis, Amount (4 opens the pop-up)
const CREDIT = [
  "txtPg2Pt4I42PriorYearExcessCr", "txtPg2Pt4I43IncomeTaxPmtFromPreviousQrt", "txtPg2Pt4I44CreditableTaxWithheldFromPrevQrt",
  "txtPg2Pt4I45CreditableTaxWithheldFor4thQrt", "txtPg2Pt4I46ForeignTaxCr", "txtPg2Pt4I47TaxPaidInReturnPrevFiled",
  "txtPg2Pt4I48OtherTaxCrPmtAmt", "txtPg2Pt4I49OtherTaxCrPmtAmt",
];
const S3_DESC: Record<number, string> = {
  2: "NonDeductExpenseOtherIncome", 3: "NonDeductExpenseOtherIncome", 5: "NonTaxIncomeAndIncomeSubjectToFinTax",
  6: "NonTaxIncomeAndIncomeSubjectToFinTax", 7: "SpecialDeduct", 8: "SpecialDeduct",
};
const s3 = (k: number, part: "Desc" | "Amt") => `txtPg3Pt6S3I${k}${S3_DESC[k]}${part}`;

/** A pop-up ("More"): dynamic rows `<stem><i>Col<n>` counted by `<key>PopLength`, summed into `<key>SubTotal`, and
 *  written back to the item's own line. */
interface Modal {
  name: string;
  /** Pop-up key, e.g. "Pg3Pt6S1I17": the PopLength / SubTotal ids. */
  key: string;
  stem: string;
  /** The text columns of a row. */
  text: string[];
  /** The amount column. */
  amount: string;
  /** The item's line: its text ids (row text 1:1 for one row; the first becomes "OTHERS" for two or more) and amount. */
  line_text: string[];
  line_amount: string;
  /** maxlength="12" on the row amount: saveXML strips its commas. */
  bare: boolean;
  /** Cleared by disableForOSD. */
  osd: boolean;
}
export const MODAL: Modal[] = [
  { name: "sc1_17", key: "Pg3Pt6S1I17", stem: "txtPg3Pt6S1I17_", text: ["Col1"], amount: "Col2", line_text: ["txtPg3Pt6I17OthersIDesc"], line_amount: "txtPg3Pt6I17OthersIAmt", bare: false, osd: true },
  { name: "sc2_4", key: "Pg3Pt6S2I4", stem: "txtPg3Pt6S2I4_", text: ["Col1", "Col2"], amount: "Col3", line_text: ["txtPg3Pt6S2I4Description", "txtPg3Pt6S2I4LegalBasis"], line_amount: "txtPg3Pt6S2I4Amount", bare: false, osd: true },
  { name: "sc3_3", key: "Pg3Pt6S3I3", stem: "txtPg3Pt6S3I3_", text: ["Col1"], amount: "Col2", line_text: [s3(3, "Desc")], line_amount: s3(3, "Amt"), bare: true, osd: false },
  { name: "sc3_6", key: "Pg3Pt6S3I6", stem: "txtPg3Pt6S3I6_", text: ["Col1"], amount: "Col2", line_text: [s3(6, "Desc")], line_amount: s3(6, "Amt"), bare: false, osd: false },
  { name: "sc3_8", key: "Pg3Pt6S3I8", stem: "txtPg3Pt6S3I8_", text: ["Col1"], amount: "Col2", line_text: [s3(8, "Desc")], line_amount: s3(8, "Amt"), bare: false, osd: false },
];
const modalTotal = (m: Modal) => `_total_${m.name}`;
const rowId = (m: Modal, col: string) => `${P}${m.stem}{i}${col}`;
/** A pop-up row's amount after its blur (toComma → round): whole pesos, truncated; a negative row becomes 0. */
export const rowPeso = (s: string): Centavo => Math.max(0, Math.trunc(parseMoney(s) / 100) * 100);

export const MODAL_GROUP: GroupSpec[] = MODAL.map((m) => ({
  name: m.name,
  size_field: `${m.key}PopLength`,
  first_index: 1,
  row: [
    ...m.text.map((col) => ({ id: rowId(m, col), kind: "text" as const })),
    {
      id: rowId(m, m.amount),
      kind: "money" as const,
      row_compute: (read: Read) => rowPeso(read(rowId(m, m.amount))),
      ...(m.bare ? { derive: (_: Read, value: string) => value.replace(/,/g, "") } : {}),
    },
  ],
  total: { into: modalTotal(m), of: rowId(m, m.amount) },
}));

// ── the clock-reading checks ────────────────────────────────────────────────────────────────────────────────────

/** validateDate (validateNotCurrent with `future` off): MM/DD/YYYY, month "00"–"12" (BIR lets "00" through), a real
 *  day, year ≥ 1800; validateDate also refuses a future date. */
export function validDate(s: string, future: boolean, now = new Date()): boolean {
  if (s === "") return true;
  const part = s.split("/");
  if (part.length !== 3) return false;
  const [mm, dd, yyyy] = part as [string, string, string];
  // isNaN(result[0] || result[1] || result[2]): only the first non-empty part is checked
  if (Number.isNaN(Number(mm || dd || yyyy))) return false;
  if (mm.length !== 2 || +mm > 12 || +mm < 0) return false;
  if (dd.length !== 2 || +dd > 31 || +dd < 1) return false;
  if (yyyy.length !== 4 || +yyyy < 1800) return false;
  const leap = new Date(+yyyy, 1, 29).getMonth() === 1;
  if (+mm === 2 && +dd >= (leap ? 30 : 29)) return false;
  if (["04", "06", "09", "11"].includes(mm) && +dd > 30) return false;
  return !(future && new Date(+yyyy, +mm - 1, +dd) > now);
}

/** Item 2 after checkYearEnd (blur of the year): a fiscal year may not end in the future (year cleared) or in
 *  December (month reset to "00"); a year before 2018, or a calendar non-short-period year not yet over, resets
 *  to last year (holdYr); a short-period month in the future is cleared. sleeptime fills an empty calendar year
 *  with last year — an empty year reads as BIR's template "25" here, the same thing for a calendar return. A 1-digit
 *  year is padded. */
export function yearEnd(r: Read, now = new Date()): { month: string; year: string } {
  let month = r(`${P}ddlPg1I2Date`) || "12";
  let year = r(`${P}txtPg1I2YearEnd`) || "25";
  const fiscal = r(`${P}rdoPg1I1Fiscal`) === "true";
  const calendar = !fiscal && r(`${P}rdoPg1I1Calendar`) !== "false";
  const shortYes = r(`${P}rdoPg1I4ShortPeriodYes`) === "true";
  const shortNo = !shortYes && r(`${P}rdoPg1I4ShortPeriodNo`) !== "false";
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  const holdYr = String(nowYear - 2001);
  if (year !== "") {
    const inputYear = 2000 + Number(year);
    const inputMonth = Number(month) - 1;
    if (fiscal && (inputYear > nowYear || (inputMonth > nowMonth && inputYear === nowYear))) year = "";
    else if (fiscal && inputMonth === 11) month = "00";
    else if (inputYear < 2018) year = holdYr;
    else if (calendar) {
      if (shortNo && inputYear >= nowYear) year = holdYr;
      else if (shortYes) {
        if (inputYear > nowYear) year = holdYr;
        else if (inputYear === nowYear && (inputMonth > nowMonth || inputMonth === 11)) month = "";
      }
    }
  }
  if (year !== "" && Number(year) > -1 && Number(year) < 10) year = `0${Number(year)}`;
  return { month, year };
}

/** Item 17 after chkDtTaxRliefFrom + validateDate (FROM) and validateNotCurrent + DateCompare_Page1_Item17 (TO):
 *  FROM may not fall after the taxable year; TO must be a valid date after FROM and after the taxable year. */
export function effectivity(r: Read, period: { month: string; year: string }, now = new Date()): { from: string; to: string } {
  let from = r(`${P}txtPg1Pt1I17EffectivityFrom`);
  let to = r(`${P}txtPg1Pt1I17EffectivityTo`);
  const taxYear = Number(period.year) + 2000;
  const month = Number(period.month); // the select's string compared with a number: numeric
  const part = (s: string, k: number) => Number(s.split("/")[k]); // undefined * 1 → NaN, every comparison false
  if (taxYear < part(from, 2) || (taxYear === part(from, 2) && month < part(from, 0))) from = "";
  if (!validDate(from, true, now)) from = "";
  if (!validDate(to, false, now)) to = "";
  const date = (s: string) => {
    const [mm, dd, yyyy] = s.split("/").map(Number) as [number, number, number];
    return s === "" ? NaN : new Date(yyyy, mm - 1, dd).getTime();
  };
  if (date(from) >= date(to)) to = "";
  else if (taxYear > part(to, 2) || (taxYear >= part(to, 2) && month > part(to, 0))) to = "";
  return { from, to };
}

// ── the model ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface Model {
  osd: boolean;
  itemized: boolean;
  /** Computed amounts by field id (prefix stripped), in centavos. */
  amount: Record<string, Centavo>;
  /** Inputs BIR forces in the saved file (OSD clearing, item 47), by id. */
  forced: Record<string, string>;
  /** Derived text and ticks (item 2, cleared dates, method, overpayment), by id. */
  text: Record<string, string>;
}

export function model(r: Read, edition: Edition, now = new Date()): Model {
  const raw = (id: string): number => num(r(`${P}${id}`));
  const ic011 = r(`${P}rdoPg1I5ATCR1C3`) === "true";
  // Select_rdoPg1I5ATC: IC 011 ticks itemized and disables OSD
  const osd = !ic011 && r(`${P}rdoPg1Pt1I13MethodOfDeducOptional`) === "true";
  const itemized = ic011 || (!osd && r(`${P}rdoPg1Pt1I13MethodOfDeducItemized`) === "true");
  const amended = r(`${P}rdoPg1I3AmendedYes`) === "true";
  const period = yearEnd(r, now);
  const amount: Record<string, Centavo> = {};
  const forced: Record<string, string> = {};
  const text: Record<string, string> = {};
  const force = (id: string, value: string) => (forced[id] = value);

  // a pop-up's line shows its subtotal once it has rows (BIR refuses to save a zero-amount row)
  const line = (m: Modal): number => {
    const t = parseMoney(r(modalTotal(m)));
    if (m.osd && osd) return 0;
    return t !== 0 ? peso(t) : raw(m.line_amount);
  };
  const lineOf = (key: string) => line(MODAL.find((m) => m.key === key)!);

  // Part IV gross income (FormatAmount 'totalGrossIncome')
  amount.txtPg2Pt4I30NetSalesReceiptsRevFees = fix0(raw("txtPg2Pt4I28SalesReceiptsRevFees") * 1 - raw("txtPg2Pt4I29SalesRetAllowanceDisc") * 1);
  amount.txtPg2Pt4I32GrossIncomeFromOper = fix0(peso(amount.txtPg2Pt4I30NetSalesReceiptsRevFees) - raw("txtPg2Pt4I31CostOfSalesServ"));
  const i34 = fix0(peso(amount.txtPg2Pt4I32GrossIncomeFromOper) + raw("txtPg2Pt4I33AddOther"));
  amount.txtPg2Pt4I34TotalGross = i34;

  // Schedules 1 and 2 (disableForOSD zeroes and clears every input of both)
  const sc1 = [...SC1_ITEM.map(raw), ...SC1_OTHER.map((x) => (x === "I" ? lineOf("Pg3Pt6S1I17") : raw(`txtPg3Pt6I17Others${x}Amt`)))];
  const sc1Total = osd ? 0 : fix0(sum(sc1));
  amount.txtPg3Pt6S1I18TotOrdinaryAllowableItemDeduc = sc1Total;
  const sc2 = SC2_ROW.map((k) => (k === 4 ? lineOf("Pg3Pt6S2I4") : raw(`txtPg3Pt6S2I${k}Amount`)));
  const sc2Total = osd ? 0 : fix0(sum(sc2));
  amount.txtPg3Pt6S2I5TotSpecialAllowedItemDeduc = sc2Total;
  if (osd) {
    for (const id of SC1_ITEM) force(id, "0.00");
    for (const x of SC1_OTHER) force(`txtPg3Pt6I17Others${x}Desc`, ""), force(`txtPg3Pt6I17Others${x}Amt`, "0.00");
    for (const k of SC2_ROW) force(`txtPg3Pt6S2I${k}Description`, ""), force(`txtPg3Pt6S2I${k}LegalBasis`, ""), force(`txtPg3Pt6S2I${k}Amount`, "0.00");
  }

  // amountComputation
  let i35 = sc1Total;
  let i36 = sc2Total;
  let i38 = fix0(peso(i34) * 0.4); // FormatAmount writes it whatever the method
  let i39 = 0; // with no method ticked, neither branch ever writes 39
  if (itemized) {
    i38 = 0;
    i39 = fix0(peso(i34) - peso(fix0(peso(i35) + peso(i36))));
  } else if (osd) {
    i35 = 0;
    i36 = 0;
    i39 = fix0(peso(i34) - peso(i38));
  }
  amount.txtPg2Pt4I35OrdinaryAllowable = i35;
  amount.txtPg2Pt4I36SpecialAllowable = i36;
  amount.txtPg2Pt4I37TotalItemized = fix0(peso(i35) + peso(i36));
  amount.txtPg2Pt4I38OptionalStandardDeduc = i38;
  amount.txtPg2Pt4I39NetTaxable = i39;
  // v2018's item 40 is disabled and overwritten with taxRate.xml's "0" on load
  const rate = edition === "2018C" ? raw("txtPg2Pt4I40TaxRate") : 0;
  const i41 = fix0((peso(i39) * 1 * rate) / 100);
  amount.txtPg2Pt4I41TaxDue = i41;

  // checkFilingYear: item 47 is only open on an amended return; otherwise BIR writes the number 0
  if (!amended && raw("txtPg2Pt4I47TaxPaidInReturnPrevFiled") !== 0) force("txtPg2Pt4I47TaxPaidInReturnPrevFiled", "0");
  const credit = (id: string): number => (id in forced ? num(forced[id]!) : raw(id));
  const i50 = fix0(sum(CREDIT.map(credit)));
  amount.txtPg2Pt4I50TotalTaxCrPmt = i50;
  const i51 = fix0(peso(i41) - peso(i50));
  amount.txtPg2Pt4I51TotalOverpayment = i51;

  // Part V (compTaxReliefAvail)
  let i52 = raw("txtPg2Pt5I52RegularIncomeOtherwiseDue");
  let i53 = raw("txtPg2Pt5I53SpecialAllowableItemizedDeduc");
  if (edition === "2018") {
    // `YearEnd.value <= 20`: "" and "18"–"20" take 30%, later years the (always "0") item 40
    const r52 = (period.year === "" ? 0 : Number(period.year)) <= 20 ? 30 : rate;
    const a52 = fix0(peso(i39) * 1 * (r52 / 100));
    const a53 = fix0(peso(i36) * 1 * (r52 / 100));
    amount.txtPg2Pt5I52RegularIncomeOtherwiseDue = a52;
    amount.txtPg2Pt5I53SpecialAllowableItemizedDeduc = a53;
    i52 = peso(a52);
    i53 = peso(a53);
  }
  amount.txtPg2Pt5I54TotalTaxReliefAvailment = fix0(i52 * 1 + i53 * 1);

  // Page 1 Part II
  amount.txtPg1Pt2I18TaxDue = i41;
  amount.txtPg1Pt2I19TotalTaxCrPmt = i50;
  amount.txtPg1Pt2I20TotalOverpmt = i51;
  const i20 = peso(i51);
  const penalty = raw("txtPg1Pt2I21PenaltyCompromise");
  amount.txtPg1Pt2I22TotalAmtPayable = i20 > -1 ? fix0(i20 * 1 + penalty * 1) : i20 < 0 && penalty > 0 ? fc(penalty * 1) : fc(i20 * 1);
  if (!(i20 < 0)) for (const x of ["Refund", "TCC", "CarryOver"]) text[`rdoPg1Overpayment${x}`] = "false";

  // Schedule 3 reconciliation: item 4 keeps its centavos (formatCurrency without toFixed(0))
  const s3a = fc(raw("txtPg3Pt6S3I1NetIncomePerBook") * 1 + raw(s3(2, "Amt")) * 1 + lineOf("Pg3Pt6S3I3") * 1);
  const s3b = fix0(raw(s3(5, "Amt")) * 1 + lineOf("Pg3Pt6S3I6") * 1 + raw(s3(7, "Amt")) * 1 + lineOf("Pg3Pt6S3I8") * 1);
  amount.txtPg3Pt6S3I4Total = s3a;
  amount.txtPg3Pt6S3I9Total = s3b;
  amount.txtPg3Pt6S3I10NetTaxableIncome = fix0(peso(s3a) - peso(s3b));

  // Page 1 text BIR rewrites on blur
  if (period.month !== (r(`${P}ddlPg1I2Date`) || "12")) text.ddlPg1I2Date = period.month;
  if (period.year !== r(`${P}txtPg1I2YearEnd`)) text.txtPg1I2YearEnd = period.year;
  const inc = r(`${P}txtPg1Pt1I10DateofIncorporation`);
  if (!validDate(inc, true, now)) text.txtPg1Pt1I10DateofIncorporation = "";
  const eff = effectivity(r, period, now);
  if (eff.from !== r(`${P}txtPg1Pt1I17EffectivityFrom`)) text.txtPg1Pt1I17EffectivityFrom = eff.from;
  if (eff.to !== r(`${P}txtPg1Pt1I17EffectivityTo`)) text.txtPg1Pt1I17EffectivityTo = eff.to;
  if (ic011) (text.rdoPg1Pt1I13MethodOfDeducItemized = "true"), (text.rdoPg1Pt1I13MethodOfDeducOptional = "false");
  return { osd, itemized, amount, forced, text };
}

// ── schema ──────────────────────────────────────────────────────────────────────────────────────────────────────

type TemplateRecord = [string, string, string?];
/** saveXML escape()s exactly these two (the first name and address lines); every other text is saved verbatim. */
const ESCAPED = new Set([`${P}txtPg1Pt1I8RegisteredName`, `${P}txtPg1Pt1I9RegisteredAddress`]);
/** Template keys the native form does not model: BIR never lets the user set them (the ATC labels, the always
 *  disabled signatory title/TIN boxes, Part III payment details for the online channel, the pager, submission and
 *  eBIRForms-Online flags), or the native form derives them (page 2–3 TIN/name headers, pop-up counts/subtotals).
 *  They keep BIR's own default unless derivedRecord writes them. */
const UNMODELLED =
  /:txtPg1I5ATCR\dC[12]$|:txtPg1Pt2TitleofSignatory|:txtPg1Pt2TINofSignatory|:txtPg1Pt3I|:txtPg[23]TinC\d$|:txtPg[23]RegisteredName$|:txtCurrentPage$|:txtMaxPage$|SubTotal$|PopLength$|^driveSelectTPExport$|^txtFinalFlag$|^txtEnroll$|^ebirOnline/;

/** Field list straight from BIR's save template (the authority on which keys exist). */
export function fieldList(record: TemplateRecord[], edition: Edition): FieldJson[] {
  return (
    record
      .filter(([key]) => !UNMODELLED.test(key))
      // v2018's item 40 is disabled and refilled from taxRate.xml ("0"); it keeps the default
      .filter(([key]) => edition === "2018C" || key !== `${P}txtPg2Pt4I40TaxRate`)
      .map(([key, value, radio]): FieldJson => {
        if (radio) return { id: key, kind: "radio" };
        if (/:(ddl|rdoPg1Pt1I7RDO$)/.test(key)) return { id: key, kind: "select" };
        if (value === "0.00" || key === `${P}txtPg2Pt4I40TaxRate`) return { id: key, kind: "money" };
        return { id: key, kind: "text", ...(ESCAPED.has(key) ? { escaped: true } : {}) };
      })
  );
}

export function make1702EX2018(code: string, edition: Edition, record: TemplateRecord[]): FormSchema {
  const json = fieldList(record, edition);
  // every model output is a computed field; the model reads only inputs, so the single DOM-order pass is safe
  const computed = new Set(Object.keys(model(() => "", edition).amount));
  const field: FieldSpec[] = json.map((f) => {
    const key = f.id.slice(P.length);
    if (f.kind === "money" && computed.has(key)) return { ...f, compute: (r: Read) => model(r, edition).amount[key] ?? 0 };
    return { ...f };
  });
  for (const id of ["txtPg1Pt1I6TINC1", "txtPg1Pt1I6TINC2", "txtPg1Pt1I6TINC3", "txtPg1Pt1I6TINC4", "txtPg1Pt1I8RegisteredName", "txtPg1Pt1I9RegisteredAddress"]) {
    const f = field.find((x) => x.id === `${P}${id}`);
    if (f) f.required = true;
  }
  return {
    form_code: code,
    title: "Annual Income Tax — Exempt Corporations",
    field,
    group: MODAL_GROUP,
    extra_record: (state, groups) => derivedRecord(state, groups, edition),
  };
}

/** Centavos → formatCurrency's "1,234.00". */
const formatPeso = (cents: Centavo): string => {
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${String(abs % 100).padStart(2, "0")}`;
  return cents < 0 ? `-${s}` : s;
};

/** Saved values BIR derives at load / on blur, overlaid on the template: the pop-ups' item lines and subtotals,
 *  forced zeros, derived ticks and text, and the page 2–3 headers. */
function derivedRecord(state: FormState, groups: GroupState, edition: Edition): SaveRecord[] {
  const r: Read = (id) => state[id] ?? "";
  const m = model(r, edition);
  const record = new Map<string, string>();
  // Save_<pop>PopTable: one row → the line is that row; two or more → "OTHERS" (Sch 2's legal basis is left as it
  // was); the line amount and SubTotal are formatCurrency of the whole-peso sum. A pop-up never saved keeps "" counts.
  for (const mo of MODAL) {
    const row = groups[mo.name] ?? [];
    if (row.length === 0) {
      record.set(`${mo.key}PopLength`, "");
      continue;
    }
    const amount = formatPeso(row.reduce((s, x) => s + rowPeso(x[rowId(mo, mo.amount)] ?? ""), 0));
    if (row.length === 1) mo.line_text.forEach((id, j) => record.set(`${P}${id}`, (row[0]![rowId(mo, mo.text[j]!)] ?? "").toUpperCase()));
    else record.set(`${P}${mo.line_text[0]}`, "OTHERS");
    record.set(`${P}${mo.line_amount}`, amount);
    record.set(`${mo.key}SubTotal`, amount);
  }
  for (const [id, v] of Object.entries(m.forced)) record.set(`${P}${id}`, v);
  for (const [id, v] of Object.entries(m.text)) record.set(`${P}${id}`, v);
  // sleeptime copies item 8's first line into the page 2–3 name headers; the TIN headers are loaded as saved
  for (const pg of [2, 3]) {
    for (const k of [1, 2, 3, 4]) record.set(`${P}txtPg${pg}TinC${k}`, r(`${P}txtPg1Pt1I6TINC${k}`));
    record.set(`${P}txtPg${pg}RegisteredName`, r(`${P}txtPg1Pt1I8RegisteredName`).toUpperCase());
  }
  return [...record].map(([key, value]) => ({ key, value: ESCAPED.has(key) ? legacyEscape(value) : value }));
}

export const FORM_1702EXv2018C = make1702EX2018("1702EXv2018C", "2018C", template as TemplateRecord[]);

/** validateAll's checks a native fill can fail (the rest are fixed by the profile or BIR's own rewrites). */
export function validate1702EX2018(schema: FormSchema, edition: Edition, state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(schema, state);
  const r: Read = (id) => state[id] ?? "";
  const need = (id: string, message: string) => {
    if (!r(`${P}${id}`).trim()) problem.push({ id: `${P}${id}`, message });
  };
  const tin = `${r(`${P}txtPg1Pt1I6TINC1`)}${r(`${P}txtPg1Pt1I6TINC2`)}${r(`${P}txtPg1Pt1I6TINC3`)}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1Pt1I6TINC1`, message: "The TIN's check digit doesn't match." });
  if (r(`${P}rdoPg1I5ATCR1C3`) !== "true" && r(`${P}rdoPg1I5ATCR2C3`) !== "true") problem.push({ id: `${P}rdoPg1I5ATCR1C3`, message: "Select an ATC (item 5)." });
  if ((r(`${P}rdoPg1Pt1I7RDO`) || "000") === "000") problem.push({ id: `${P}rdoPg1Pt1I7RDO`, message: "Enter a valid RDO code (item 7)." });
  need("txPg1I9ZipCode", "Enter the ZIP code (item 9A).");
  need("txtPg1Pt1I10DateofIncorporation", "Enter the date of incorporation (item 10).");
  const m = model(r, edition);
  const period = yearEnd(r);
  const inc = r(`${P}txtPg1Pt1I10DateofIncorporation`);
  if (inc && !validDate(inc, true)) problem.push({ id: `${P}txtPg1Pt1I10DateofIncorporation`, message: "Date of incorporation must be a past date in MM/DD/YYYY form (BIR clears it)." });
  else if (inc) {
    // checkDateOfIncorporation
    const [mm, , yyyy] = inc.split("/").map(Number) as [number, number, number];
    const filing = 2000 + Number(period.year);
    if (yyyy > filing || (yyyy === filing && mm > Number(period.month)))
      problem.push({ id: `${P}txtPg1Pt1I10DateofIncorporation`, message: "The date of incorporation cannot be after the year end (item 2)." });
  }
  need("txtPg1Pt1I11ContactNumber", "Enter the contact number (item 11).");
  if (!m.itemized && !m.osd) problem.push({ id: `${P}rdoPg1Pt1I13MethodOfDeducItemized`, message: "Select a method of deduction (item 13)." });
  if (r(`${P}rdoPg1I5ATCR1C3`) === "true" && r(`${P}rdoPg1Pt1I13MethodOfDeducOptional`) === "true")
    problem.push({ id: `${P}rdoPg1Pt1I13MethodOfDeducOptional`, message: "Itemized is the only method allowed under ATC IC 011 (BIR ticks it)." });
  need("txtPg1Pt1I14LegalBasis", "Enter the legal basis of the tax relief/exemption (item 14).");
  need("txtPg1Pt1I15Investment", "Enter the investment promotion agency (item 15).");
  need("txtPg1Pt1I16RegisteredActivity", "Enter the registered activity/program (item 16).");
  need("txtPg1Pt1I17EffectivityFrom", "Enter the effectivity date FROM (item 17).");
  need("txtPg1Pt1I17EffectivityTo", "Enter the effectivity date TO (item 17).");
  if (r(`${P}txtPg1Pt1I17EffectivityFrom`) && m.text.txtPg1Pt1I17EffectivityFrom === "")
    problem.push({ id: `${P}txtPg1Pt1I17EffectivityFrom`, message: "Item 17 FROM must be a valid past date within the taxable year (BIR clears it)." });
  if (r(`${P}txtPg1Pt1I17EffectivityTo`) && m.text.txtPg1Pt1I17EffectivityTo === "")
    problem.push({ id: `${P}txtPg1Pt1I17EffectivityTo`, message: "Item 17 TO must be a valid date after FROM and after the taxable year (BIR clears it)." });
  if (m.amount.txtPg1Pt2I20TotalOverpmt! < 0 && !["Refund", "TCC", "CarryOver"].some((x) => r(`${P}rdoPg1Overpayment${x}`) === "true"))
    problem.push({ id: `${P}rdoPg1OverpaymentRefund`, message: "Choose how the overpayment is to be handled." });
  if (m.amount.txtPg2Pt4I39NetTaxable !== m.amount.txtPg3Pt6S3I10NetTaxableIncome)
    problem.push({ id: `${P}txtPg3Pt6S3I10NetTaxableIncome`, message: "Page 2 item 39 must equal Schedule 3 item 10." });
  if (edition === "2018C") {
    if (m.amount.txtPg2Pt4I36SpecialAllowable! > 0 && num(r(`${P}txtPg2Pt5I53SpecialAllowableItemizedDeduc`)) === 0)
      problem.push({ id: `${P}txtPg2Pt5I53SpecialAllowableItemizedDeduc`, message: "Provide item 53 (item 36 × the applicable rate)." });
    if (m.amount.txtPg2Pt4I39NetTaxable! > 0 && num(r(`${P}txtPg2Pt5I52RegularIncomeOtherwiseDue`)) === 0)
      problem.push({ id: `${P}txtPg2Pt5I52RegularIncomeOtherwiseDue`, message: "Provide item 52 (item 39 × the applicable rate)." });
  }
  // validateAmountDescription(_pt2): a description needs an amount and an amount a description
  const owned = (id: string) => MODAL.some((mo) => (groups[mo.name] ?? []).length > 0 && (mo.line_amount === id || mo.line_text.includes(id)));
  const pair = (desc: string, amt: string, basis?: string) => {
    if (owned(amt)) return;
    const d = r(`${P}${desc}`).trim() !== "" && (!basis || r(`${P}${basis}`).trim() !== "");
    const a = num(r(`${P}${amt}`)) !== 0;
    if (d !== a) problem.push({ id: `${P}${d ? amt : desc}`, message: d ? "The amount should not be zero." : "The description should not be empty." });
  };
  pair("txtPg2Pt4I48OtherTaxCrPmtDesc", "txtPg2Pt4I48OtherTaxCrPmtAmt");
  pair("txtPg2Pt4I49OtherTaxCrPmtDesc", "txtPg2Pt4I49OtherTaxCrPmtAmt");
  if (!m.osd) {
    for (const x of SC1_OTHER) pair(`txtPg3Pt6I17Others${x}Desc`, `txtPg3Pt6I17Others${x}Amt`);
    for (const k of SC2_ROW) pair(`txtPg3Pt6S2I${k}Description`, `txtPg3Pt6S2I${k}Amount`, `txtPg3Pt6S2I${k}LegalBasis`);
  }
  for (const k of [2, 3, 5, 6, 7, 8]) pair(s3(k, "Desc"), s3(k, "Amt"));
  // CheckEmptyDesc: a pop-up row needs its text columns and a non-zero (whole-peso) amount
  for (const mo of MODAL)
    (groups[mo.name] ?? []).forEach((row, i) => {
      for (const col of mo.text)
        if (!(row[rowId(mo, col)] ?? "").trim()) problem.push({ id: `${P}${mo.stem}${i + 1}${col}`, message: `Row ${i + 1}: this column should not be blank.` });
      if (rowPeso(row[rowId(mo, mo.amount)] ?? "") === 0)
        problem.push({ id: `${P}${mo.stem}${i + 1}${mo.amount}`, message: `Row ${i + 1}: the amount should not be zero (whole pesos).` });
    });
  return problem;
}

export const validate1702EXv2018C = (state: FormState, groups: GroupState = {}): Problem[] => validate1702EX2018(FORM_1702EXv2018C, "2018C", state, groups);
