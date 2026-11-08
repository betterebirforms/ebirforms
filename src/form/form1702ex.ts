// BIR Form 1702-EX, the pre-2018 7-page layout (superseded by 1702EXv2018/C, tax years up to 2017), P3. Same
// `frm1702EX:` prefix as the 2018 editions but a different form: 484 save keys, WHOLE-PESO amounts, the full
// schedules of the old return and the computation in `Compute_*` functions on blur (no compute*):
//   Sch 1  4 = 1+2+3, 6 = 4−5 → 31         Sch 2  3 = 1+2, 5 = 3−4, 8 = 6+7, 10 = 8−9, 13 = 10+11+12,
//                                                  16 = 13+14−15, 19 = 16+17−18, 26 = Σ 20–25, 27 = 5+19+26 → 32
//   33 = 31−32   Sch 3 4 = Σ 1–3 → 34   35 = 33+34   Sch 4 40 = Σ 1–39 → 36   Sch 5 5 = Σ 1–4 → 37
//   38 = 36+37   39 = 35−38   41 = 39 × 0 (exempt)   42 = round(39 × 30%), 0 when negative   43 = round(37 × 30%)
//   44 = 42+43   page 1: 20 = 41, 22 = 20+21
//   Sch 6  4 = 1+2+3, 9 = 5+6+7+8, 10 = 4−9   Sch 7  7 = Σ 1–6, 12 = Σ 8–11, 16 = 13+14+15, 17 = 12+16
//   Sch 9  19 = every final tax (C of 1–4, 9, 15, 18 in both columns, the 4.x pop-up and the II–IV pop-ups)
//   Sch 10 8 = 1 + 5 + 7 (both columns) + the I–II pop-ups
//
// BIR arithmetic and quirks replicated because they change SAVED values (each named where it is applied):
//   • every amount is a whole peso: the maxlength-12 blur handler runs FormatValue (decimals TRUNCATED, a
//     negative becomes 0 — except Sch 6 item 1 and Sch 7 item 15, which keep "(1,234)"), and saveXML strips the
//     commas of every maxlength-12/15 input and turns "(1,234)" into "-1234". So the file holds "1234" / "-1234";
//   • the pop-up subtotals are FormatValue strings WITH commas ("5,000": no maxlength), copied to the item line;
//   • Sch 8's `#sched8 input[maxlength="5"]` blur handler (meant for the percent column) also catches each
//     row's 5-digit TIN branch code, so "00000" is saved as "0";
//   • item 51 is overwritten with item 50 + 3 years whenever item 50 is blurred, and BOTH are cleared when that
//     expiry is already past (DateCompare_Page2_Item50 reads the clock) — an old accreditation is wiped;
//   • item 24 (CTC date of issue) must be in the CURRENT year for a CTC (validateCTCDate reads the clock);
//   • Sch 9 item 13 dates must fall within the 12 months ending at item 2 (validateIssueDateSched9);
//   • the ATC picks Sch 8's checkboxes (IC 021 → Partners only; IC 011 → Stockholders, never Partners);
//   • a Reg (not CTC) certificate forces item 26 to 0 (Select_CTCorReg runs on every load).
// The Sch 9 II–IV and Sch 10 I–II pop-ups are DIV pairs: each div holds two sales/items, columns C_3/C_4, C_5/C_6 …
// Here each column is a row (first index 3), and the div count (PopLength) is derived as ⌈rows ÷ 2⌉.

import template from "./template/1702EX.json";
import type { Centavo } from "./money.ts";
import { validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { legacyEscape, type SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";
import { validDate } from "./form1702exv2018c.ts";

const P = "frm1702EX:";
type Read = (id: string) => string;
type TemplateRecord = [string, string, string?];

// ── BIR's whole-peso handling ───────────────────────────────────────────────────────────────────────────────────

/** removeCommaParenthesis(…) * 1 on a field after its blur: the whole peso (parseInt / FormatValue truncate). */
export const peso = (s: string): number => {
  const v = String(s).trim().replace("(", "-").replace(")", "").replace(/,/g, "");
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
};
/** What saveXML writes for a maxlength-12/15 amount: no commas, "-" for a negative. */
export const bare = (n: number): string => String(Math.trunc(n) || 0);
/** The maxlength-12 blur (FormatValue): a negative input becomes 0 unless the field keeps its sign. */
const input = (s: string, signed = false): number => {
  const n = peso(s);
  return n < 0 && !signed ? 0 : n;
};
/** FormatValue with commas, as the pop-up subtotals keep it ("5,000", "(1,234)", "0"). */
export const comma = (n: number): string => {
  const s = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return n < 0 ? `(${s})` : s;
};

// ── ids ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const SC4_ITEM = [
  "txtPg4S4I1AdsAndPromotions", "txtPg4S4I2Col2", "txtPg4S4I3Col2", "txtPg4S4I4Col2", "txtPg4S4I5BadDebts", "txtPg4S4I6CharitableContri",
  "txtPg4S4I7Commissions", "txtPg4S4I8Communication", "txtPg4S4I9Depletion", "txtPg4S4I10Depreciation", "txtPg4S4I11DirectorFees",
  "txtPg4S4I12FringeBenefits", "txtPg4S4I13FuelAndOil", "txtPg4S4I14Insurance", "txtPg4S4I15Interest", "txtPg4S4I16Janitorial",
  "txtPg4S4I17Losses", "txtPg4S4I18Management", "txtPg4S4I19Insurance", "txtPg4S4I20OfficeSupplies", "txtPg4S4I21OtherServices",
  "txtPg4S4I22PersonalFees", "txtPg4S4I23Rental", "txtPg4S4I24RepairLabor", "txtPg4S4I25RepairMaterials", "txtPg4S4I26Representation",
  "txtPg4S4I27Research", "txtPg4S4I28Royalties", "txtPg4S4I29Salaries", "txtPg5S4I30SecurityServices", "txtPg5S4I31SSS",
  "txtPg5S4I32TaxesAndLicense", "txtPg5S4I33TollingFees", "txtPg5S4I34Training", "txtPg5S4I35Transportation", "txtPg5S4I36Col2",
  "txtPg5S4I37Col2", "txtPg5S4I38Col2", "txtPg5S4I39Col2",
];
/** Inputs whose maxlength-12/15 blur keeps a negative ("(1,234)"). */
const SIGNED = new Set([`${P}txtPg5S6I1NetIncomeLoss`, `${P}txtPg6S7I15RetainedEarnings`]);

/** A table pop-up: rows `<stem><i>Col<n>`, `<key>PopLength`, `<key>SubTotal` (FormatValue of Σ amount), and the line. */
interface Modal {
  name: string;
  key: string;
  stem: string;
  text: string[];
  amount: string[];
  /** The column summed into the SubTotal. */
  sum: string;
  /** The item line: text ids (1:1 for one row; the first becomes "OTHERS" for two or more) and amount, if any. */
  line_text: string[];
  line_amount?: string;
}
export const MODAL: Modal[] = [
  { name: "sc3_3", key: "Pg4S3I3", stem: "txtPg4S3I3_", text: ["Col1"], amount: ["Col2"], sum: "Col2", line_text: ["txtPg4S3I3Col1"], line_amount: "txtPg4S3I3Col2" },
  { name: "sc4_4", key: "Pg4S4I4", stem: "txtPg4S4I4_", text: ["Col1"], amount: ["Col2"], sum: "Col2", line_text: ["txtPg4S4I4Col1"], line_amount: "txtPg4S4I4Col2" },
  { name: "sc4_39", key: "Pg5S4I39", stem: "txtPg5S4I39_", text: ["Col1"], amount: ["Col2"], sum: "Col2", line_text: ["txtPg5S4I39Col1"], line_amount: "txtPg5S4I39Col2" },
  { name: "sc5_4", key: "Pg5S5I4", stem: "txtPg5S5I4_", text: ["Col1", "Col2"], amount: ["Col3"], sum: "Col3", line_text: ["txtPg5S5I4Col1", "txtPg5S5I4Col2"], line_amount: "txtPg5S5I4Col3" },
  { name: "sc6_3", key: "Pg5S6I3", stem: "txtPg5S6I3_", text: ["Col1"], amount: ["Col2"], sum: "Col2", line_text: ["txtPg5S6I3Col1"], line_amount: "txtPg5S6I3Col2" },
  { name: "sc6_6", key: "Pg5S6I6", stem: "txtPg5S6I6_", text: ["Col1"], amount: ["Col2"], sum: "Col2", line_text: ["txtPg5S6I6Col1"], line_amount: "txtPg5S6I6Col2" },
  { name: "sc6_8", key: "Pg5S6I8", stem: "txtPg5S6I8_", text: ["Col1"], amount: ["Col2"], sum: "Col2", line_text: ["txtPg5S6I8Col1"], line_amount: "txtPg5S6I8Col2" },
  // Sch 9 Part I item 4.x: description, A exempt, B actual amount, C final tax (Σ C → item 19); no item line
  { name: "sc9_1", key: "Pg7S9Pt1", stem: "txtPg7S9Pt1_", text: ["Col1"], amount: ["Col2", "Col3", "Col4"], sum: "Col4", line_text: [] },
];
const modalTotal = (m: Modal) => `_total_${m.name}`;
const rowId = (m: Modal, col: string) => `${P}${m.stem}{i}${col}`;
/** toComma on a pop-up amount: whole pesos (truncated), a negative becomes 0. */
const rowPeso = (s: string): number => input(s);

/** A DIV pop-up (Sch 9 II–IV, Sch 10 I–II): each column is a row, ids `<stem>C_<n>` from 3. */
interface Pair {
  name: string;
  key: string;
  text: string[];
  amount: string[];
  /** A select column (Sch 9 III's PS/CS), default "PS". */
  select?: string;
  /** The amount summed into item 19 / Sch 10 item 8. */
  sum: string;
}
export const PAIR: Pair[] = [
  { name: "sc9_2", key: "Pg7S9Pt2", text: ["txtPg7Sc9I5DescriptionofProperty", "txtPg7Sc9I6OCT", "txtPg7Sc9I7CAR"], amount: ["txtPg7Sc9I8ActualAmount", "txtPg7Sc9I9FinalTax"], sum: "txtPg7Sc9I9FinalTax" },
  { name: "sc9_3", key: "Pg7S9Pt3", select: "ddPg7S9I10", text: ["txtPg7Sc9I10PSCS", "txtPg7Sc9I11CAR", "txtPg7Sc9I13DateofIssue"], amount: ["txtPg7Sc9I12NumberofShares", "txtPg7Sc9I14ActualAmount", "txtPg7Sc9I15FinalTax"], sum: "txtPg7Sc9I15FinalTax" },
  { name: "sc9_4", key: "Pg7S9Pt4", text: ["txtPg7Sc9I16OtherIncome"], amount: ["txtPg7Sc9I17ActualAmount", "txtPg7Sc9I18FinalTax"], sum: "txtPg7Sc9I18FinalTax" },
  { name: "sc10_1", key: "Pg7S9Pt5", text: ["txtPg7Sc10I2DescriptionofProperty", "txtPg7Sc10I3ModeofTransfer", "txtPg7Sc10I4CAR"], amount: ["txtPg7Sc10I5ActualAmount"], sum: "txtPg7Sc10I5ActualAmount" },
  { name: "sc10_2", key: "Pg7S9Pt6", text: ["txtPg7Sc10I6OtherExempt"], amount: ["txtPg7Sc10I7ActualAmount"], sum: "txtPg7Sc10I7ActualAmount" },
];
const pairId = (stem: string) => `${P}${stem}C_{i}`;
const pairTotal = (p: Pair) => `_total_${p.name}`;

const upper = (_: Read, value: string) => value.toUpperCase();
const bareRow = (_: Read, value: string) => bare(peso(value));

export const GROUP: GroupSpec[] = [
  ...MODAL.map((m) => ({
    name: m.name,
    size_field: `${m.key}PopLength`,
    first_index: 1,
    row: [
      ...m.text.map((c) => ({ id: rowId(m, c), kind: "text" as const, derive: upper })),
      ...m.amount.map((c) => ({ id: rowId(m, c), kind: "money" as const, row_compute: (r: Read) => rowPeso(r(rowId(m, c))) * 100, derive: bareRow })),
    ],
    total: { into: modalTotal(m), of: rowId(m, m.sum) },
  })),
  ...PAIR.map((p) => ({
    name: p.name,
    first_index: 3,
    row: [
      // an untouched PS/CS select keeps its first option
      ...(p.select ? [{ id: pairId(p.select), kind: "select" as const, derive: (_: Read, value: string) => value || "PS" }] : []),
      ...p.text.map((stem) => ({ id: pairId(stem), kind: "text" as const, derive: upper })),
      ...p.amount.map((stem) => ({ id: pairId(stem), kind: "money" as const, row_compute: (r: Read) => rowPeso(r(pairId(stem))) * 100, derive: bareRow })),
    ],
    total: { into: pairTotal(p), of: pairId(p.sum) },
  })),
];

// ── the model ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface Model {
  /** Computed whole-peso amounts by field id (prefix stripped). */
  amount: Record<string, number>;
  /** Derived text, ticks and forced inputs, by id (prefix stripped). */
  text: Record<string, string>;
}

/** Item 2 after the old checkYearEnd: a fiscal year may not end in the future (year cleared) or in December (month
 *  "00"); everything else (before September 2013, 2018 or later) only alerts. A 1-digit year is padded. */
export function yearEndEX(r: Read, now = new Date()): { month: string; year: string } {
  let month = r(`${P}ddlPg1I2Date`) || "12";
  let year = r(`${P}txtPg1I2YearEnd`) || "25";
  const fiscal = r(`${P}rdoPg1I1Fiscal`) === "true";
  const inputYear = 2000 + Number(year);
  const inputMonth = Number(month) - 1;
  if (fiscal && (inputYear > now.getFullYear() || (inputMonth > now.getMonth() && inputYear === now.getFullYear()))) year = "";
  else if (fiscal && inputMonth === 11) month = "00";
  if (year !== "" && Number(year) > -1 && Number(year) < 10) year = `0${Number(year)}`;
  return { month, year };
}

const dateOf = (s: string): number => {
  const [mm, dd, yyyy] = s.split("/").map(Number) as [number, number, number];
  return s === "" ? NaN : new Date(yyyy, mm - 1, dd).getTime();
};

export function model(r: Read, now = new Date()): Model {
  const v = (id: string) => input(r(`${P}${id}`), SIGNED.has(`${P}${id}`));
  const amount: Record<string, number> = {};
  const text: Record<string, string> = {};
  const lineOf = (key: string): number => {
    const m = MODAL.find((x) => x.key === key)!;
    const t = peso(r(modalTotal(m)));
    return t !== 0 ? t : v(m.line_amount!);
  };
  const sum = (id: string[]) => id.reduce((s, x) => s + v(x), 0);

  // Sch 1 / Sch 2 → 31 / 32
  const s1i4 = sum(["txtPg3S1I1GoodsProp", "txtPg3S1I2SaleServices", "txtPg3S1I3LeaseProp"]);
  amount.txtPg3S1I4Total = s1i4;
  const s1i6 = s1i4 - v("txtPg3S1I5LessSales");
  amount.txtPg3S1I6NetSales = s1i6;
  amount.txtPg2Pt4I31NetSales = s1i6;
  const s2i3 = v("txtPg3S2I1MerchInventory") + v("txtPg3S2I2AddPurchases");
  const s2i5 = s2i3 - v("txtPg3S2I4LessMerch");
  const s2i8 = v("txtPg3S2I6DirectMaterials") + v("txtPg3S2I7AddPurchases");
  const s2i10 = s2i8 - v("txtPg3S2I9DirectMaterials");
  const s2i13 = s2i10 + v("txtPg3S2I11DirectLabor") + v("txtPg3S2I12ManOverhead");
  const s2i16 = s2i13 + v("txtPg3S2I14WorkProcess") - v("txtPg3S2I15LessWork");
  const s2i19 = s2i16 + v("txtPg3S2I17FinishedGoods") - v("txtPg3S2I18LessFinished");
  const s2i26 = sum(["txtPg3S2I20DirectWage", "txtPg3S2I21DirectMaterials", "txtPg3S2I22DirectDepreciation", "txtPg3S2I23DirectRental", "txtPg3S2I24DirectOutside", "txtPg3S2I25DirectOthers"]);
  const s2i27 = s2i5 + s2i19 + s2i26;
  Object.assign(amount, {
    txtPg3S2I3TotalGoods: s2i3, txtPg3S2I5CostSales: s2i5, txtPg3S2I8MaterialsAvailable: s2i8, txtPg3S2I10RawMaterials: s2i10,
    txtPg3S2I13TotalMan: s2i13, txtPg3S2I16CostOfGoods: s2i16, txtPg3S2I19GoodsManAndSold: s2i19, txtPg3S2I26TotalCostServices: s2i26,
    txtPg3S2I27TotalCostSales: s2i27, txtPg2Pt4I32LessCost: s2i27,
  });
  const i33 = s1i6 - s2i27;
  amount.txtPg2Pt4I33GrossIncome = i33;
  // Sch 3 → 34
  const s3 = v("txtPg4S3I1Col2") + v("txtPg4S3I2Col2") + lineOf("Pg4S3I3");
  amount.txtPg4S3I4TotalTaxIncome = s3;
  amount.txtPg2Pt4I34AddOther = s3;
  const i35 = i33 + s3;
  amount.txtPg2Pt4I35TotalGross = i35;
  // Sch 4 → 36, Sch 5 → 37
  const s4 = SC4_ITEM.reduce((s, id) => s + (id === "txtPg4S4I4Col2" ? lineOf("Pg4S4I4") : id === "txtPg5S4I39Col2" ? lineOf("Pg5S4I39") : v(id)), 0);
  amount.txtPg5S4I40TotalAllowableDeduction = s4;
  amount.txtPg2Pt4I36OrdinaryAllowable = s4;
  const s5 = v("txtPg5S5I1Col3") + v("txtPg5S5I2Col3") + v("txtPg5S5I3Col3") + lineOf("Pg5S5I4");
  amount.txtPg5S5I5TotalAllowable = s5;
  amount.txtPg2Pt4I37SpecialAllowable = s5;
  const i38 = s4 + s5;
  amount.txtPg2Pt4I38TotalItemized = i38;
  const i39 = i35 - i38;
  amount.txtPg2Pt4I39NetTaxable = i39;
  amount.txtPg2Pt4I41TotalIncome = 0; // 39 × 0
  // Compute_Page2_Item42 / 43: Math.round of the float product; a negative 42 is written as 0
  const i42 = Math.max(0, Math.round(i39 * 0.3));
  const i43 = Math.round(s5 * 0.3);
  amount.txtPg2Pt5I42RegularIncome = i42;
  amount.txtPg2Pt5I43SpecialAllowable = i43;
  amount.txtPg2Pt5I44TotalTax = i42 + i43;
  amount.txtPg1Pt2I20TotalIncome = 0;
  amount.txtPg1Pt2I22TotalAmount = 0 + v("txtPg1Pt2I21AddPenalty");

  // Sch 6 reconciliation, Sch 7 balance sheet
  const s6i4 = v("txtPg5S6I1NetIncomeLoss") + v("txtPg5S6I2Col2") + lineOf("Pg5S6I3");
  const s6i9 = v("txtPg5S6I5Col2") + lineOf("Pg5S6I6") + v("txtPg5S6I7Col2") + lineOf("Pg5S6I8");
  Object.assign(amount, { txtPg5S6I4Total: s6i4, txtPg5S6I9Col2: s6i9, txtPg5S6I10NetTaxable: s6i4 - s6i9 });
  const s7i7 = sum(["txtPg6S7I1CurrentAssets", "txtPg6S7I2LongInvestment", "txtPg6S7I3Property", "txtPg6S7I4LongReceivables", "txtPg6S7I5IntangibleAssets", "txtPg6S7I6OtherAssets"]);
  const s7i12 = sum(["txtPg6S7I8CurrentLiabilities", "txtPg6S7I9LongLiabilities", "txtPg6S7I10DefferedCredits", "txtPg6S7I11OtherLiablities"]);
  const s7i16 = sum(["txtPg6S7I13CapitalStock", "txtPg6S7I14AdditionalCapital", "txtPg6S7I15RetainedEarnings"]);
  Object.assign(amount, { txtPg6S7I7TotalAssets: s7i7, txtPg6S7I12TotalLiabilities: s7i12, txtPg6S7I16TotalEquity: s7i16, txtPg6S7I17LiabilitiesAndEquity: s7i12 + s7i16 });

  // Sch 9 item 19 and Sch 10 item 8 (pop-up totals included)
  const pair = (name: string) => peso(r(pairTotal(PAIR.find((p) => p.name === name)!)));
  amount.txtPg7Sc9I19TotalFinalTax =
    sum(["txtPg7Sc9I1InterestsC3", "txtPg7Sc9I2RoyaltiesC3", "txtPg7Sc9I3DividendsC3", "txtPg7Sc9I4PrizesC3", "txtPg7Sc9I9FinalTaxC1", "txtPg7Sc9I9FinalTaxC2",
      "txtPg7Sc9I15FinalTaxC1", "txtPg7Sc9I15FinalTaxC2", "txtPg7Sc9I18FinalTaxC1", "txtPg7Sc9I18FinalTaxC2"]) +
    peso(r(modalTotal(MODAL.find((m) => m.name === "sc9_1")!))) + pair("sc9_2") + pair("sc9_3") + pair("sc9_4");
  amount.txtPg7Sc10I8TotalIncome =
    sum(["txtPg7Sc10I1ReturnofPremium", "txtPg7Sc10I5ActualAmountC1", "txtPg7Sc10I5ActualAmountC2", "txtPg7Sc10I7ActualAmountC1", "txtPg7Sc10I7ActualAmountC2"]) + pair("sc10_1") + pair("sc10_2");

  // page 1/2/7 text BIR rewrites on blur
  const period = yearEndEX(r, now);
  if (period.month !== (r(`${P}ddlPg1I2Date`) || "12")) text.ddlPg1I2Date = period.month;
  if (period.year !== (r(`${P}txtPg1I2YearEnd`) || "25")) text.txtPg1I2YearEnd = period.year;
  const clear = (id: string, keep: boolean) => {
    if (!keep && r(`${P}${id}`) !== "") text[id] = "";
  };
  clear("txtPg1Pt1I8DateofIncorporation", validDate(r(`${P}txtPg1Pt1I8DateofIncorporation`), true, now));
  // item 19: FROM validateDate; TO validateNotCurrent, then cleared unless after FROM
  const from = validDate(r(`${P}txtPg1Pt1I19EffectivityFrom`), true, now) ? r(`${P}txtPg1Pt1I19EffectivityFrom`) : "";
  clear("txtPg1Pt1I19EffectivityFrom", from !== "" || r(`${P}txtPg1Pt1I19EffectivityFrom`) === "");
  const toRaw = r(`${P}txtPg1Pt1I19EffectivityTo`);
  const to = validDate(toRaw, false, now) && !(dateOf(from) >= dateOf(toRaw)) ? toRaw : "";
  clear("txtPg1Pt1I19EffectivityTo", to !== "" || toRaw === "");
  // item 24: validateCTCDate (a CTC must be this year's; a SEC registration not older than 50 years)
  const ctc = r(`${P}rdoPg1CTC`) === "true";
  const reg = !ctc && r(`${P}rdoPg1Reg`) === "true";
  const issue = r(`${P}txtPg1Pt1I24DateofIssue`);
  const issueYear = issue.split("/")[2];
  const issueOk =
    validDate(issue, true, now) &&
    (issue === "" || !(ctc && (Number.isNaN(Number(issueYear)) || Number(issueYear) !== now.getFullYear())) && !(reg && (Number.isNaN(Number(issueYear)) || String(issueYear) < String(now.getFullYear() - 50))));
  clear("txtPg1Pt1I24DateofIssue", issueOk);
  if (reg) text.txtPg1Pt1I26Amount = "0"; // Select_CTCorReg on load
  // items 50/51: set_Page2_Item51 writes 50 + 3 years over 51; DateCompare_Page2_Item50 wipes both once expired
  const accIssueRaw = r(`${P}txtPg2Pt6I50IssueDate`);
  const accIssue = validDate(accIssueRaw, true, now) ? accIssueRaw : "";
  if (accIssue !== accIssueRaw) text.txtPg2Pt6I50IssueDate = "";
  const part = accIssue.split("/");
  const expiry = accIssue !== "" ? `${part[0]}/${part[1]}/${Number(part[2]) + 3}` : "";
  if (expiry !== "" && dateOf(expiry) < now.getTime()) (text.txtPg2Pt6I50IssueDate = ""), (text.txtPg2Pt6I51ExpiryDate = "");
  else if (expiry !== r(`${P}txtPg2Pt6I51ExpiryDate`)) text.txtPg2Pt6I51ExpiryDate = expiry;
  // Sch 9 item 13: validateIssueDateSched9 — within the 12 months ending at item 2
  for (const c of ["C1", "C2"]) {
    const id = `txtPg7Sc9I13DateofIssue${c}`;
    const s = r(`${P}${id}`);
    if (s === "") continue;
    let ok = validDate(s, true, now) && period.month !== "" && period.year !== "";
    if (ok) {
      const month = Number(period.month);
      const filing = new Date(Number(`20${period.year}`), month, 0).getTime();
      const start = new Date(Number(`20${period.year}`), month, 1);
      start.setMonth(start.getMonth() - 12);
      const d = dateOf(s);
      ok = !(d < start.getTime() || d > filing);
    }
    if (!ok) text[id] = "";
  }
  // Select_rdoPg1I5ATC: the ATC sets Sch 8's checkboxes
  if (r(`${P}rdoPg1I5ATCR2C3`) === "true") Object.assign(text, { chkPg6S8Partners: "true", chkPg6S8StockHolders: "false", chkPg6S8MembersInfo: "false" });
  else if (r(`${P}rdoPg1I5ATCR1C3`) === "true") {
    text.chkPg6S8Partners = "false";
    if (r(`${P}chkPg6S8StockHolders`) === "") text.chkPg6S8StockHolders = "true";
  }
  return { amount, text };
}

// ── schema ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** saveXML escape()s these three; every other text is saved verbatim. */
const ESCAPED = new Set([`${P}txtPg1Pt1I9RegisteredName`, `${P}txtPg1Pt1I10RegisteredAddress`, `${P}txtPg1Pt1I13MainLine`]);
/** Template keys not modelled: the ATC labels, the always-disabled item 15 checkbox, Part III payment details,
 *  the page 2–7 TIN/name headers (derived), the pager, submission flags, pop-up counts/subtotals (derived). */
const UNMODELLED =
  /:txtPg1I5ATCR\dC[12]$|:rdoPg1Pt1I15ItemizedDeduction$|:txtPg1Pt3I|:txtPg[2-7]T[Ii][Nn]C\d$|:txtPg[2-7]RegisteredName$|:txtCurrentPage$|:txtMaxPage$|SubTotal$|PopLength$|^driveSelectTPExport$|^txtFinalFlag$|^txtEnroll$|^ebirOnline/;
/** maxlength-12/15 amounts (template default "0"), except the Sch 8 percentage (maxlength 5). */
const AMOUNT = (key: string, value: string) => value === "0" && !/Col4PTotal$/.test(key);
const SCHED8_NUMBER = /:txtPg6S8I\d+Col(2TIN4|4PTotal)$/;

export function fieldList(record: TemplateRecord[]): FieldJson[] {
  return record
    .filter(([key]) => !UNMODELLED.test(key))
    .map(([key, value, radio]): FieldJson => {
      if (radio) return { id: key, kind: "radio" };
      if (/:chk/.test(key)) return { id: key, kind: "checkbox" };
      if (/:(ddl|dd|rdoPg1Pt1I7RDO$)/.test(key)) return { id: key, kind: "select" };
      if (AMOUNT(key, value)) return { id: key, kind: "money" };
      return { id: key, kind: "text", ...(ESCAPED.has(key) ? { escaped: true } : {}) };
    });
}

function make1702EX(): FormSchema {
  const json = fieldList(template as TemplateRecord[]);
  const computed = new Set(Object.keys(model(() => "").amount));
  const field: FieldSpec[] = json.map((f): FieldSpec => {
    const key = f.id.slice(P.length);
    if (f.kind === "money" && computed.has(key)) return { ...f, compute: (r: Read) => (model(r).amount[key] ?? 0) * 100 };
    // the maxlength-12/15 blur, then saveXML: a whole, bare number
    if (f.kind === "money") return { ...f, derive: (_: Read, value: string) => (value === "" ? "" : bare(input(value, SIGNED.has(f.id)))) };
    // Sch 8's maxlength-5 blur handler: `value * 1` (NaN → 0) — on the percentage AND the TIN branch code
    if (SCHED8_NUMBER.test(f.id)) return { ...f, derive: (_: Read, value: string) => (value === "" ? "" : String(Number.isNaN(Number(value)) ? 0 : Number(value))) };
    if (f.kind === "text" && !/Email$/.test(f.id)) return { ...f, derive: (_: Read, value: string) => value.toUpperCase() };
    return { ...f };
  });
  for (const id of ["txtPg1Pt1I6TINC1", "txtPg1Pt1I6TINC2", "txtPg1Pt1I6TINC3", "txtPg1Pt1I6TINC4", "txtPg1Pt1I9RegisteredName", "txtPg1Pt1I10RegisteredAddress"]) {
    const f = field.find((x) => x.id === `${P}${id}`);
    if (f) f.required = true;
  }
  return {
    form_code: "1702EX",
    title: "Annual Income Tax — Exempt Corporations (pre-2018)",
    field,
    group: GROUP,
    format: (cents: Centavo) => bare(cents / 100),
    extra_record: (state, groups) => derivedRecord(state, groups),
  };
}

const TEMPLATE_DEFAULT = new Map((template as TemplateRecord[]).map(([k, v]) => [k, v]));

/** Saved values BIR derives at load / on blur: pop-up lines, subtotals and counts, the DIV pop-ups' counts and
 *  padding, derived text/ticks, and the page 2–7 headers. */
function derivedRecord(state: FormState, groups: GroupState): SaveRecord[] {
  const r: Read = (id) => state[id] ?? "";
  const m = model(r);
  const record = new Map<string, string>();
  for (const mo of MODAL) {
    const row = groups[mo.name] ?? [];
    if (row.length === 0) {
      record.set(`${mo.key}PopLength`, TEMPLATE_DEFAULT.get(`${mo.key}PopLength`) ?? "");
      continue;
    }
    const total = row.reduce((s, x) => s + rowPeso(x[rowId(mo, mo.sum)] ?? ""), 0);
    record.set(`${mo.key}SubTotal`, comma(total));
    if (!mo.line_amount) continue;
    if (row.length === 1) mo.line_text.forEach((id, j) => record.set(`${P}${id}`, (row[0]![rowId(mo, mo.text[j]!)] ?? "").toUpperCase()));
    else record.set(`${P}${mo.line_text[0]}`, "OTHERS");
    record.set(`${P}${mo.line_amount}`, bare(total));
  }
  // a DIV holds two columns: the count is ⌈columns ÷ 2⌉, and an odd last column is BIR's untouched pair ("" / "0")
  for (const p of PAIR) {
    const n = (groups[p.name] ?? []).length;
    record.set(`${p.key}PopLength`, n === 0 ? (TEMPLATE_DEFAULT.get(`${p.key}PopLength`) ?? "") : String(Math.ceil(n / 2)));
    if (n % 2 === 1) {
      const k = n + 3;
      if (p.select) record.set(`${P}${p.select}C_${k}`, "PS");
      for (const stem of p.text) record.set(`${P}${stem}C_${k}`, "");
      for (const stem of p.amount) record.set(`${P}${stem}C_${k}`, "0");
    }
  }
  for (const [id, v] of Object.entries(m.text)) record.set(`${P}${id}`, v);
  // sleeptime copies item 9 into every page's name header; the TIN headers are loaded as saved
  for (const pg of [2, 3, 4, 5, 6, 7]) {
    const tin = pg === 7 ? "TINC" : "TinC";
    for (const k of [1, 2, 3, 4]) record.set(`${P}txtPg${pg}${tin}${k}`, r(`${P}txtPg1Pt1I6TINC${k}`));
    record.set(`${P}txtPg${pg}RegisteredName`, r(`${P}txtPg1Pt1I9RegisteredName`).toUpperCase());
  }
  return [...record].map(([key, value]) => ({ key, value: ESCAPED.has(key) ? legacyEscape(value) : value }));
}

export const FORM_1702EX = make1702EX();

/** validateAll's checks a native fill can fail. */
export function validate1702EX(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1702EX, state);
  const r: Read = (id) => state[id] ?? "";
  const need = (id: string, message: string) => {
    if (!r(`${P}${id}`).trim()) problem.push({ id: `${P}${id}`, message });
  };
  const tin = `${r(`${P}txtPg1Pt1I6TINC1`)}${r(`${P}txtPg1Pt1I6TINC2`)}${r(`${P}txtPg1Pt1I6TINC3`)}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1Pt1I6TINC1`, message: "The TIN's check digit doesn't match." });
  const year = 2000 + Number(r(`${P}txtPg1I2YearEnd`) || "25");
  if (year >= 2018) problem.push({ id: `${P}txtPg1I2YearEnd`, message: "This edition is for tax years up to 2017; use 1702-EX (2018) for later years." });
  if (r(`${P}rdoPg1I5ATCR1C3`) !== "true" && r(`${P}rdoPg1I5ATCR2C3`) !== "true") problem.push({ id: `${P}rdoPg1I5ATCR1C3`, message: "Select an ATC (item 5)." });
  if ((r(`${P}rdoPg1Pt1I7RDO`) || "000") === "000") problem.push({ id: `${P}rdoPg1Pt1I7RDO`, message: "Enter a valid RDO code (item 7)." });
  need("txtPg1Pt1I8DateofIncorporation", "Enter the date of incorporation (item 8).");
  need("txtPg1Pt1I11ContactNumber", "Enter the contact number (item 11).");
  need("txtPg1Pt1I13MainLine", "Enter the line of business (item 13).");
  if (r(`${P}txtPg1Pt1I14PSICCode`).length < 4) problem.push({ id: `${P}txtPg1Pt1I14PSICCode`, message: "Enter the 4-digit PSIC code (item 14)." });
  need("txtPg1Pt1I16LegalBasis", "Enter the legal basis of the tax relief/exemption (item 16).");
  need("txtPg1Pt1I17Investment", "Enter the investment promotion agency (item 17).");
  need("txtPg1Pt1I18RegisteredActivity", "Enter the registered activity/program (item 18).");
  need("txtPg1Pt1I19EffectivityFrom", "Enter the effectivity date FROM (item 19).");
  need("txtPg1Pt1I19EffectivityTo", "Enter the effectivity date TO (item 19).");
  if (r(`${P}rdoPg1CTC`) !== "true" && r(`${P}rdoPg1Reg`) !== "true") problem.push({ id: `${P}rdoPg1CTC`, message: "Choose CTC or SEC registration (item 23)." });
  need("txtPg1Pt2I23CommunityTax", "Enter the CTC / registration number (item 23).");
  need("txtPg1Pt1I24DateofIssue", "Enter the date of issue (item 24).");
  need("txtPg1Pt1I25PlaceofIssue", "Enter the place of issue (item 25).");
  const m = model(r);
  for (const id of ["txtPg1Pt1I8DateofIncorporation", "txtPg1Pt1I19EffectivityFrom", "txtPg1Pt1I19EffectivityTo", "txtPg1Pt1I24DateofIssue", "txtPg2Pt6I50IssueDate", "txtPg2Pt6I51ExpiryDate", "txtPg7Sc9I13DateofIssueC1", "txtPg7Sc9I13DateofIssueC2"])
    if (r(`${P}${id}`) && m.text[id] === "") problem.push({ id: `${P}${id}`, message: "BIR clears this date (invalid, out of range or expired)." });
  if (r(`${P}rdoPg1CTC`) === "true" && peso(r(`${P}txtPg1Pt1I26Amount`)) <= 0) problem.push({ id: `${P}txtPg1Pt1I26Amount`, message: "The CTC amount (item 26) should not be 0." });
  if (m.amount.txtPg2Pt4I39NetTaxable !== m.amount.txtPg5S6I10NetTaxable)
    problem.push({ id: `${P}txtPg5S6I10NetTaxable`, message: "Part IV item 39 must equal Schedule 6 item 10." });
  if (m.amount.txtPg6S7I7TotalAssets === 0) problem.push({ id: `${P}txtPg6S7I1CurrentAssets`, message: "Total assets (Sch 7 item 7) must not be zero." });
  if (m.amount.txtPg6S7I7TotalAssets !== m.amount.txtPg6S7I17LiabilitiesAndEquity)
    problem.push({ id: `${P}txtPg6S7I17LiabilitiesAndEquity`, message: "Sch 7 items 7 and 17 must be equal." });
  if (!r(`${P}txtPg6S8I1Col1Name`).trim()) problem.push({ id: `${P}txtPg6S8I1Col1Name`, message: "Sch 8 item 1 is mandatory." });
  if (m.amount.txtPg3S1I4Total! > 600000 && !r(`${P}txtPg2Pt6I45NameofExternalAuditor`).trim() && !r(`${P}txtPg2Pt6I47NameofSigningPartner`).trim())
    problem.push({ id: `${P}txtPg2Pt6I45NameofExternalAuditor`, message: "Gross sales over ₱600,000 need an external auditor or signing partner (item 45 or 47)." });
  // CheckEmptyDesc: a pop-up row needs its text and a non-zero amount; a DIV column needs a description
  for (const mo of MODAL)
    (groups[mo.name] ?? []).forEach((row, i) => {
      for (const col of mo.text) if (!(row[rowId(mo, col)] ?? "").trim()) problem.push({ id: `${P}${mo.stem}${i + 1}${col}`, message: `Row ${i + 1}: this column should not be blank.` });
      if (rowPeso(row[rowId(mo, mo.sum)] ?? "") === 0) problem.push({ id: `${P}${mo.stem}${i + 1}${mo.sum}`, message: `Row ${i + 1}: the amount should not be zero (whole pesos).` });
    });
  for (const p of PAIR) {
    const row = groups[p.name] ?? [];
    row.forEach((x, i) => {
      if (!(x[pairId(p.text[0]!)] ?? "").trim()) problem.push({ id: `${P}${p.text[0]}C_${i + 3}`, message: `Column ${i + 3}: enter a description.` });
    });
    if (row.length % 2 === 1) problem.push({ id: `${P}${p.text[0]}C_${row.length + 3}`, message: "BIR adds these in pairs: fill both columns of the last pair." });
  }
  return problem;
}
