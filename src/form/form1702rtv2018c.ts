// BIR Form 1702-RT (Annual Income Tax Return — Corporation, Partnership and Other Non-Individual Taxpayer Subject
// Only to REGULAR Income Tax Rate), the 2018 layout, P3. One shared builder for BOTH 2018 editions — 1702RTv2018C
// (current) and 1702RTv2018 (superseded) have the SAME 258 save keys in the same DOM order and differ only in a
// handful of compute branches (`Edition` below). Field prefix `frm1702RT:`; every amount is a WHOLE PESO.
//
// The legacy form is a web of ~55 mutually-calling compute* functions (host/form-patch.ts guards their re-entry).
// Here it is one pure model of the INPUTS (`model`), so the result never depends on field order:
//   29 = 27−28   31 = 29−30   33 = 31+32
//   Sch I  18 = Σ items 1–17i              → 34          Sch II 5 = Σ C3 rows 1–4 → 35
//   Sch IIIA row 4 (this year's NOL)       = Sch I 18 − 33 when the deductions exceed the gross (itemized)
//   Sch IIIA rows 5–7: C6 = C2 − (C3+C4+C5);  NOLCO 8 = Σ C5 → 36
//   37 = 34+35+36 (itemized)   38 = 33 × 40% (OSD)   39 = 33 − (37 | 38)
//   41 = 39 × rate (0 when 39 ≤ 0)   43 = max(41, 42 MCIT)   47 = Sch IV Σ C7
//   55 = Σ 44–54   56 = 43 − 55   14 = 43, 15 = 55, 16 = 56   57 / 58 = 52 / 59 = 57+58
//   20 = 17+18+19   21 = 16 ≥ 0 ? 16+20 : (20 > 0 ? 20 : 16)
//   Sch V (reconciliation): 4 = 1+2+3   9 = 5+6+7+8   10 = 4 − 9
//
// BIR arithmetic replicated because it changes SAVED values (each named where it is applied):
//   • whole-peso truncation: getSum/getDifference write formatCurrency(x).slice(0,-3) — 1,234.99 → 1,234
//     (toward zero), and every later item reads that truncated figure;
//   • products round: getProduct2 writes Math.round(x × k) (38 OSD, 41 regular tax, v2018's 42 / 57);
//   • negatives display as "(1,234)" and save as "-1,234" (saveXML's NumWithParenthesis);
//   • Sch IIIA row 4 compares Sch I 18 with 33 through getValAmount, which returns a STRING when the figure has no
//     thousands comma, so two amounts under 1,000 compare lexicographically ("100" > "90" is false): a small
//     current-year NOL is silently dropped;
//   • under OSD with a negative gross (33 < 0) BIR still fills Sch IIIA row 4 with |33| (its OSD branch reads
//     Sch I 18 = 0 > 33);
//   • the MCIT box (ATC IC055) is not the user's: blurring item 10 (date of incorporation) unticks it and re-ticks
//     it only when the filing year is ≥ 4 years after incorporation; unticked, items 42/45/47 and Sch IV are zeroed;
//   • the NOLCO check is an else-if chain that zeroes ONE offending C5 per call (see `nolcoRows`);
//   • every other text field is saved through NumWithParenthesis too: the first "(" becomes "-", the first ")" is
//     dropped ("ABC (PHILS.) INC." → "ABC -PHILS. INC.") — names/addresses are escaped instead and survive.
// The current edition's branches follow `taxableYear >= 20` (BIR derives it from the CLOCK, not item 2): the rate
// (40), regular tax (41), MCIT (42) and special-rate tax (57) are editable; v2018 hard-codes 30% / 2% instead.
//
// Six "(Add more…)" modals are dynamic rows `<stem>.<i>C<n>` with a `…CtrModal` count (loadData rebuilds that many
// rows, then fills them by id). With rows, the item's own line shows their subtotal (C1 "OTHERS" from 2 rows up).
// The Sch IIIA row-7 modal is not modelled: it has no CtrModal, so BIR can neither save its count nor reload it.

import template from "./template/1702RTv2018C.json";
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
export const P = "frm1702RT:";
type Read = (id: string) => string;

// ── BIR's whole-peso number handling ────────────────────────────────────────────────────────────────────────────

/** Centavos → BIR's saved whole-peso string: truncated toward zero, comma-grouped, "-" for negatives (a value in
 *  (−1, 0) saves as "-0", BIR's "(0)"). */
export function formatPeso(cents: Centavo): string {
  const peso = Math.trunc(Math.abs(cents) / 100);
  const s = peso.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cents < 0 ? `-${s}` : s;
}
/** What the legacy DOM shows for an output: NegativeValue's "(1,234)". */
export const domPeso = (cents: Centavo): string => (cents < 0 ? `(${formatPeso(-cents)})` : formatPeso(cents));
/** formatCurrency(x).slice(0, -3): the figure every getSum/getDifference writes (whole pesos, toward zero). */
export const out = (cents: Centavo): Centavo => Math.trunc(cents / 100) * 100;
/** getProduct2: Math.round(pesos × k), on the (already whole-peso) operand. */
export const product = (cents: Centavo, k: number): Centavo => Math.round((cents / 100) * k) * 100;
/** WholeNumWithComma(NumWithParenthesis(v)): parseInt — the integer peso part (NaN → 0). */
export const wholeNum = (s: string): number => {
  const n = parseInt(String(s).replace("(", "-").replace(")", "").replace(/,/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
};
/** getValAmount → removeCommaParenthesis: a number only when the text had a thousands comma, else a string. */
export const valAmount = (s: string): number | string => {
  let v = s;
  if (v.includes("(") || v.includes(")")) v = v.replace("(", "-").replace(")", "");
  return v.includes(",") ? parseFloat(v.replace(/,/g, "")) : v;
};
/** JavaScript's `a > b`: lexicographic when both are strings, numeric otherwise. */
export const jsGreater = (a: number | string, b: number | string): boolean =>
  typeof a === "string" && typeof b === "string" ? a > b : Number(a) > Number(b);
/** saveXML's NumWithParenthesis on a text field: first "(" → "-", first ")" removed. */
export const numWithParenthesis = (s: string): string => s.replace("(", "-").replace(")", "");

// ── field ids ───────────────────────────────────────────────────────────────────────────────────────────────────

const SC1_ITEM = [
  "txtPg3Sc1I1Amortization", "txtPg3Sc1I2BadDebts", "txtPg3Sc1I3CharitableContributions", "txtPg3Sc1I4Depletion",
  "txtPg3Sc1I5Depreciation", "txtPg3Sc1I6Entertainment", "txtPg3Sc1I7FringeBenefits", "txtPg3Sc1I8Interest",
  "txtPg3Sc1I9Losses", "txtPg3Sc1I10PensionTrust", "txtPg3Sc1I11Rental", "txtPg3Sc1I12Research", "txtPg3Sc1I13Salaries",
  "txtPg3Sc1I14Contributions", "txtPg3Sc1I15TaxesandLicenses", "txtPg3Sc1I16TransportationandTravel",
  "txtPg3Sc1I17aJanitorial", "txtPg3Sc1I17bProfessionalFees", "txtPg3Sc1I17cSecurityServices",
];
const SC1_OTHER = ["d", "e", "f", "g", "h", "i"]; // 17d–17i: C1 description, C2 amount (17i opens a modal)
const SC2_ROW = [1, 2, 3, 4]; // C1 description, C2 legal basis, C3 amount (row 4 opens a modal)
const NOLCO_ROW = [5, 6, 7]; // Sch IIIA prior-year NOLCO rows: C1 year, C2 amount, C3 expired, C4 applied prior, C5 applied now
const MCIT_ROW = [1, 2, 3]; // Sch IV: C1 year, C2 normal tax, C3 MCIT, C4 excess, C5 used prior, C6 expired, C7 applied now
const CREDIT = [
  "txtPg2Pt4I44ExcessCredits", "txtPg2Pt4I45IncomeTaxPaymentUnderMCIT", "txtPg2Pt4I46IncomeTaxUnderRegular",
  "txtPg2Pt4I47ExcessMCIT", "txtPg2Pt4I48CreditableTaxWithheldFromPrevious", "txtPg2Pt4I49CreditableTaxWithheldFor4thQuarter",
  "txtPg2Pt4I50ForeignTaxCredits", "txtPg2Pt4I51TaxPaidInReturn", "txtPg2Pt452SpecialTaxCredits", "txtPg2Pt4I53C2", "txtPg2Pt4I54C2",
];

/** A modal: dynamic rows `<stem>.<i>C<n>`, the item's own line (`line`), its count and subtotal fields. */
interface Modal {
  name: string;
  stem: string;
  /** The row sub-field holding the amount (summed into the subtotal). */
  amount: string;
  /** The text columns of a row (C1, or C1 + C2 for Sch II). */
  text: string[];
  /** The item's own line: its text columns and amount column. */
  line_text: string[];
  line_amount: string;
}
export const MODAL: Modal[] = [
  { name: "credit54", stem: "txtPg2Pt4I54", amount: "C2", text: ["C1"], line_text: ["txtPg2Pt4I54C1"], line_amount: "txtPg2Pt4I54C2" },
  { name: "sc1_17i", stem: "txtPg3Sc1I17i", amount: "C2", text: ["C1"], line_text: ["txtPg3Sc1I17iC1"], line_amount: "txtPg3Sc1I17iC2" },
  { name: "sc2_4", stem: "txtPg3Sc2I4", amount: "C3", text: ["C1", "C2"], line_text: ["txtPg3Sc2I4C1", "txtPg3Sc2I4C2"], line_amount: "txtPg3Sc2I4C3" },
  { name: "sc5_3", stem: "txtPg4Sc5I3", amount: "C2", text: ["C1"], line_text: ["txtPg4Sc5I3C1"], line_amount: "txtPg4Sc5I3C2" },
  { name: "sc5_6", stem: "txtPg4Sc5I6", amount: "C2", text: ["C1"], line_text: ["txtPg4Sc5I6C1"], line_amount: "txtPg4Sc5I6C2" },
  { name: "sc5_8", stem: "txtPg4Sc5I8", amount: "C2", text: ["C1"], line_text: ["txtPg4Sc5I8C1"], line_amount: "txtPg4Sc5I8C2" },
];
const modalTotal = (m: Modal) => `_total_${m.name}`;
const rowId = (m: Modal, col: string) => `${P}${m.stem}.{i}${col}`;

export const MODAL_GROUP: GroupSpec[] = MODAL.map((m) => ({
  name: m.name,
  size_field: `${P}${m.stem}CtrModal`,
  first_index: 1,
  row: [
    ...m.text.map((col) => ({ id: rowId(m, col), kind: "text" as const })),
    { id: rowId(m, m.amount), kind: "money" as const },
  ],
  total: { into: modalTotal(m), of: rowId(m, m.amount) },
}));

// ── the model ───────────────────────────────────────────────────────────────────────────────────────────────────

export interface Model {
  osd: boolean;
  mcit: boolean;
  amended: boolean;
  /** Computed whole-peso amounts by field id (prefix stripped), in centavos. */
  amount: Record<string, Centavo>;
  /** Inputs BIR forces to 0 / "" in the saved file (OSD, no MCIT, not amended, the NOLCO checks), by id. */
  forced: Record<string, string>;
  /** Derived text (Sch IIIA row 4 year, the MCIT tick, cleared date of incorporation), by id. */
  text: Record<string, string>;
}

/** validateDate (MM/DD/YYYY, real calendar day, not in the future). */
export function validIncorporationDate(s: string, now = new Date()): boolean {
  const part = s.split("/");
  if (part.length !== 3) return false;
  const [mm, dd, yyyy] = part as [string, string, string];
  if (Number.isNaN(Number(mm || dd || yyyy))) return false;
  if (mm.length !== 2 || +mm > 12 || +mm < 1) return false;
  if (dd.length !== 2 || +dd > 31 || +dd < 1) return false;
  if (yyyy.length !== 4 || +yyyy < 1800) return false;
  const leap = new Date(+yyyy, 1, 29).getMonth() === 1;
  if (+mm === 2 && (leap ? +dd > 29 : +dd >= 29)) return false;
  if (["04", "06", "09", "11"].includes(mm) && +dd > 30) return false;
  return !(new Date(+yyyy, +mm - 1, +dd) > now);
}

/** Item 2 after validateYearEnd (blur of the year): BIR CLEARS the year or the month when they break its rules —
 *  a fiscal year may not end in December or in the future, a year before 2018 is refused, and a calendar-year
 *  return (not short-period) must be for a past year. The rules read the clock, as BIR's do. Unset fields are
 *  BIR's defaults (12 / 25); a 1-digit year is padded. */
export function yearEnd(r: Read, now = new Date()): { month: string; year: string } {
  let month = r(`${P}ddlPg1I2Month`) || "12";
  let year = r(`${P}txtPg1I2Year`) || "25";
  const fiscal = r(`${P}rdoPg1I1Fiscal`) === "true";
  const calendar = !fiscal && r(`${P}rdoPg1I1Calendar`) !== "false";
  const shortYes = r(`${P}rdoPg1I4ShortPeriodYes`) === "true";
  const shortNo = !shortYes && r(`${P}rdoPg1I4ShortPeriodNo`) !== "false";
  const inputYear = 2000 + Number(year);
  const inputMonth = Number(month) - 1;
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth();
  if (fiscal && (inputYear > nowYear || (inputMonth > nowMonth && inputYear === nowYear))) year = "";
  else if (fiscal && inputMonth === 11) month = "";
  else if (inputYear < 2018) year = "";
  else if (calendar) {
    if (shortNo && inputYear >= nowYear) year = "";
    else if (shortYes) {
      if (inputYear > nowYear) year = "";
      else if (inputYear === nowYear && (inputMonth > nowMonth || inputMonth === 11)) month = "";
    }
  }
  if (year !== "" && Number(year) > -1 && Number(year) < 10) year = `0${Number(year)}`;
  return { month, year };
}

/** checkDateOfIncorporation: whether ATC IC055 (MCIT) ends up ticked, and whether item 10 is cleared. v2018C
 *  unticks first; v2018 starts from the saved tick, but its branches land on the same answer once item 10 has been
 *  blurred twice (a cleared date unticks on the second blur). */
export function mcitFromIncorporation(r: Read, now = new Date()): { mcit: boolean; clear: boolean } {
  const date = r(`${P}txtPg1Pt1I10`).trim();
  if (date === "") return { mcit: false, clear: false };
  if (!validIncorporationDate(date, now)) return { mcit: false, clear: true };
  const [mm, dd, yyyy] = date.split("/").map(Number) as [number, number, number];
  const { month, year } = yearEnd(r, now);
  const filingMonth = Number(month);
  const filingYear = 2000 + Number(year);
  const elapsed = (new Date(filingYear, filingMonth - 1, 1).getTime() - new Date(yyyy, mm - 1, dd).getTime()) / 31536000000;
  const filingDateIsEmpty = month === "" && year === "";
  if (!filingDateIsEmpty && (yyyy > filingYear || (mm > filingMonth && yyyy === filingYear))) return { mcit: false, clear: true };
  if (filingYear - yyyy === 4) return { mcit: true, clear: false };
  if (filingYear - yyyy < 4) return { mcit: false, clear: false };
  return { mcit: elapsed >= 4, clear: false };
}

/** Sch IIIA rows 5–7 after BIR's checks. computeP4Sc3AI8TotalNOLCO is an else-if chain: each call zeroes only the
 *  FIRST offending C5 (C5 > C2, then C3+C4+C5 > C2), and a check that stays true after zeroing blocks every later
 *  one; the load runs it repeatedly, then checkP4Sc3I4NetOperatingLoss zeroes C3, C4 and C5 of a row whose
 *  C3+C4+C5 still exceeds C2. Comparisons are parseInt (WholeNumWithComma), so centavos are ignored. */
export function nolcoRows(row: Array<{ C2: string; C3: string; C4: string; C5: string }>): { C3: boolean; C4: boolean; C5: boolean }[] {
  const n = row.map((x) => ({ C2: wholeNum(x.C2), C3: wholeNum(x.C3), C4: wholeNum(x.C4), C5: wholeNum(x.C5) }));
  const zero = row.map(() => ({ C3: false, C4: false, C5: false }));
  for (let pass = 0; pass < 8; pass++) {
    const k = [0, 1, 2].find((j) => n[j]!.C5 > n[j]!.C2) ?? [0, 1, 2].find((j) => n[j]!.C3 + n[j]!.C4 + n[j]!.C5 > n[j]!.C2);
    if (k === undefined || n[k]!.C5 === 0) break; // nothing to zero, or stuck on a check zeroing cannot clear
    n[k]!.C5 = 0;
    zero[k]!.C5 = true;
  }
  n.forEach((x, j) => {
    if (x.C3 + x.C4 + x.C5 > x.C2) zero[j] = { C3: true, C4: true, C5: true };
  });
  return zero;
}

export function model(r: Read, edition: Edition): Model {
  const raw = (id: string): Centavo => parseMoney(r(`${P}${id}`));
  const osd = r(`${P}rdoPg1Pt1I13OptionalStandard`) === "true";
  const item = !osd; // the load ticks itemized whenever OSD is not ticked
  const { mcit, clear } = mcitFromIncorporation(r);
  const amended = r(`${P}rdoPg1I3AmmendYes`) === "true";
  const period = yearEnd(r);
  const year = period.year;
  const amount: Record<string, Centavo> = {};
  const forced: Record<string, string> = {};
  const text: Record<string, string> = {};
  if (period.month !== (r(`${P}ddlPg1I2Month`) || "12")) text.ddlPg1I2Month = period.month;
  if (period.year !== (r(`${P}txtPg1I2Year`) || "25")) text.txtPg1I2Year = period.year;
  const force = (id: string, value: string) => (forced[id] = value);

  // a modal's line shows its subtotal once it has rows (BIR refuses to save a zero-amount row)
  const line = (m: Modal): Centavo => {
    const t = parseMoney(r(modalTotal(m)));
    return t !== 0 ? t : raw(m.line_amount);
  };
  const lineOf = (stem: string) => line(MODAL.find((m) => m.stem === stem)!);
  for (const m of MODAL) {
    const t = parseMoney(r(modalTotal(m)));
    amount[`${m.stem}Subtotal`] = out(t);
    if (t !== 0) force(m.line_amount, formatPeso(out(t)));
  }

  // Part IV gross income
  amount.txtPg2Pt4I29NetSales = out(raw("txtPg2Pt4I27Sales") - raw("txtPg2Pt4I28LessSales"));
  amount.txtPg2Pt4I31GrossIncome = out(amount.txtPg2Pt4I29NetSales - raw("txtPg2Pt4I30LessCost"));
  const i33 = out(amount.txtPg2Pt4I31GrossIncome + raw("txtPg2Pt4I32AddOtherTaxable"));
  amount.txtPg2Pt4I33TotalGross = i33;

  // Schedules I and II (itemized only; methodOfDeductionsOptional zeroes and clears them)
  const sc1 = [...SC1_ITEM.map(raw), ...SC1_OTHER.map((x) => (x === "i" ? lineOf("txtPg3Sc1I17i") : raw(`txtPg3Sc1I17${x}C2`)))];
  const sc1Total = item ? out(sc1.reduce((s, x) => s + x, 0)) : 0;
  amount.txtPg3Sc1I18TotalOrdinaryAllowable = sc1Total;
  amount.txtPg2Pt4I34OrdinaryAllowable = sc1Total;
  const sc2 = SC2_ROW.map((k) => (k === 4 ? lineOf("txtPg3Sc2I4") : raw(`txtPg3Sc2I${k}C3`)));
  const sc2Total = item ? out(sc2.reduce((s, x) => s + x, 0)) : 0;
  amount.txtPg3Sc2I5TotalSpecialAllowable = sc2Total;
  amount.txtPg2Pt4I35SpecialAllowable = sc2Total;
  if (osd) {
    for (const id of SC1_ITEM) force(id, "0");
    for (const x of SC1_OTHER) force(`txtPg3Sc1I17${x}C1`, ""), force(`txtPg3Sc1I17${x}C2`, "0");
    for (const k of SC2_ROW) force(`txtPg3Sc2I${k}C1`, ""), force(`txtPg3Sc2I${k}C2`, ""), force(`txtPg3Sc2I${k}C3`, "0");
    for (const k of NOLCO_ROW) for (const c of ["C1", "C2", "C3", "C4", "C5"]) force(`txtPg4Sc3AI${k}${c}`, c === "C1" ? "" : "0");
    if (edition === "2018C") force("txtPg2Pt5I57SpecialAllowable", "0");
  }

  // Schedule III / IIIA row 4: this year's net operating loss (computeItem18and33 + fillNetOperatingLossItems)
  let nol = 0;
  amount.txtPg4Sc3I1GrossIncome = 0;
  amount.txtPg4Sc3I2TotalDeductions = 0;
  amount.txtPg4Sc3I3NetOperatingLoss = 0;
  if (jsGreater(valAmount(domPeso(sc1Total)), valAmount(domPeso(i33)))) {
    const loss = out(i33 - sc1Total);
    if (wholeNum(domPeso(loss)) < 0) {
      nol = Math.abs(wholeNum(domPeso(loss))) * 100;
      amount.txtPg4Sc3I3NetOperatingLoss = loss;
      // itemized keeps 1 = 33 and 2 = Sch I 18; OSD's computeP2Pt4I39 then resets 1 to 0 (and 2 is Sch I 18 = 0)
      if (item) (amount.txtPg4Sc3I1GrossIncome = i33), (amount.txtPg4Sc3I2TotalDeductions = sc1Total);
    }
  }
  text.txtPg4Sc3AI4C1 = nol && year !== "" ? `20${year}` : ""; // validateYearEnd blanks it with the year
  amount.txtPg4Sc3AI4C2 = nol;
  // C6 = C2 − (C3+C4+C5), and C3–C5 of row 4 are never enabled — except that computeItem18and33 calls
  // fillNetOperatingLossItems BEFORE its comparison, with Sch III 1 still 0, so C6 first becomes Sch I 18; only
  // computeP2Pt4I39 resets it, and only when 33 > 34. With no NOL recorded and 33 ≤ 34 the stale Sch I 18 stays.
  amount.txtPg4Sc3AI4C6 = nol || osd || i33 > sc1Total ? nol : sc1Total;

  // Schedule IIIA rows 5–7 and the NOLCO total (itemized only)
  const nrow = NOLCO_ROW.map((k) => ({ C2: r(`${P}txtPg4Sc3AI${k}C2`), C3: r(`${P}txtPg4Sc3AI${k}C3`), C4: r(`${P}txtPg4Sc3AI${k}C4`), C5: r(`${P}txtPg4Sc3AI${k}C5`) }));
  const zero = item ? nolcoRows(nrow) : nrow.map(() => ({ C3: true, C4: true, C5: true }));
  let nolco = 0;
  NOLCO_ROW.forEach((k, j) => {
    const col = (c: "C2" | "C3" | "C4" | "C5"): Centavo => (c !== "C2" && zero[j]![c]) || osd ? 0 : raw(`txtPg4Sc3AI${k}${c}`);
    for (const c of ["C3", "C4", "C5"] as const) if (zero[j]![c] && item) force(`txtPg4Sc3AI${k}${c}`, "0");
    amount[`txtPg4Sc3AI${k}C6`] = item ? out(col("C2") - (col("C3") + col("C4") + col("C5"))) : 0;
    nolco += col("C5");
  });
  amount.txtPg4Sc4I8TotalNOLCO = item ? out(nolco) : 0;
  amount.txtPg2Pt4I36Nolco = amount.txtPg4Sc4I8TotalNOLCO;

  // Part IV tax due
  const i37 = item ? out(sc1Total + sc2Total + amount.txtPg4Sc4I8TotalNOLCO) : 0;
  amount.txtPg2Pt4I37TotalItemized = i37;
  const i38 = osd ? out(product(i33, 0.4)) : 0;
  amount.txtPg2Pt4I38OptionalStandard = i38;
  const i39 = out(i33 - (osd ? i38 : i37));
  amount.txtPg2Pt4I39NetTaxable = i39;
  const rate = edition === "2018C" ? Number(r(`${P}Pg2Pt4I40IncomeTaxRate`) || "30") / 100 : 0.3;
  const i41 = i39 <= 0 ? 0 : out(product(i39, rate));
  amount.txtPg2Pt4I41IncomeTaxDue = i41;
  let i42: Centavo;
  if (edition === "2018C") {
    i42 = mcit ? raw("txtPg2Pt4I42MinimumCorporate") : 0;
    if (!mcit) force("txtPg2Pt4I42MinimumCorporate", "0");
  } else {
    // computeP2Pt4I42 (fixed 2% of 33, only while IC055 is ticked)
    i42 = i33 <= 0 || !mcit ? 0 : out(product(i33, 0.02));
    amount.txtPg2Pt4I42MinimumCorporate = i42;
  }
  const i43 = i41 >= i42 ? i41 : i42;
  amount.txtPg2Pt4I43TotalIncomeTax = i43;

  // Schedule IV (excess MCIT) — enableMCITFields clears it unless IC055 is ticked
  let excessMcit = 0;
  for (const k of MCIT_ROW) {
    const c4 = Math.max(0, out(raw(`txtPg4Sc4I${k}C3`) - raw(`txtPg4Sc4I${k}C2`)));
    let c8 = out(c4 - (raw(`txtPg4Sc4I${k}C5`) + raw(`txtPg4Sc4I${k}C6`) + raw(`txtPg4Sc4I${k}C7`)));
    if (edition === "2018" && wholeNum(domPeso(c8)) < 0) c8 = 0; // v2018 clamps C8; v2018C only alerts
    amount[`txtPg4Sc4I${k}C4`] = mcit ? c4 : 0;
    amount[`txtPg4Sc4I${k}C8`] = mcit ? c8 : 0;
    if (mcit) excessMcit += raw(`txtPg4Sc4I${k}C7`);
    else {
      force(`txtPg4Sc4I${k}C1`, "");
      for (const c of ["C2", "C3", "C5", "C6", "C7"]) force(`txtPg4Sc4I${k}${c}`, "0");
    }
  }
  amount.txtPg4Sc4I4TotalExcessMCIT = mcit ? out(excessMcit) : 0;
  amount.txtPg2Pt4I47ExcessMCIT = amount.txtPg4Sc4I4TotalExcessMCIT;
  if (!mcit) force("txtPg2Pt4I45IncomeTaxPaymentUnderMCIT", "0");
  if (!amended) force("txtPg2Pt4I51TaxPaidInReturn", "0");

  // tax credits and net tax
  const credit = (id: string): Centavo => {
    if (id === "txtPg2Pt4I47ExcessMCIT") return amount.txtPg2Pt4I47ExcessMCIT!;
    if (id in forced) return parseMoney(forced[id]!);
    return raw(id);
  };
  const i55 = out(CREDIT.reduce((s, id) => s + credit(id), 0));
  amount.txtPg2Pt4I55TotalTaxCredits = i55;
  const i56 = out(i43 - i55);
  amount.txtPg2Pt4I56NetTax = i56;
  amount.txtPg1Pt2I14IncomeTax = i43;
  amount.txtPg1Pt2I15TotalTaxCredits = i55;
  amount.txtPg1Pt2I16NetTax = i56;

  // Part V special-rate tax
  const i57 = edition === "2018C" ? (osd ? 0 : raw("txtPg2Pt5I57SpecialAllowable")) : out(product(sc2Total, 0.3));
  if (edition === "2018") amount.txtPg2Pt5I57SpecialAllowable = i57;
  amount.txtPg2Pt5I58AddSpecialTax = out(raw("txtPg2Pt452SpecialTaxCredits"));
  amount.txtPg2Pt5I59TotalTax = out(i57 + amount.txtPg2Pt5I58AddSpecialTax);

  // Page 1 penalties and amount payable
  const i20 = out(raw("txtPg1Pt2I17Surcharge") + raw("txtPg1Pt2I18Interest") + raw("txtPg1Pt2I19Compromise"));
  amount.txtPg1Pt2I20TotalPenalties = i20;
  amount.txtPg1Pt2I21TotalAmount = i56 >= 0 ? out(i56 + i20) : i20 > 0 ? i20 : i56;

  // Schedule V reconciliation
  const sc5a = out(raw("txtPg4Sc5I1NetIncome") + raw("txtPg4Sc5I2C2") + lineOf("txtPg4Sc5I3"));
  const sc5b = out(raw("txtPg4Sc5I5C2") + lineOf("txtPg4Sc5I6") + raw("txtPg4Sc5I7C2") + lineOf("txtPg4Sc5I8"));
  amount.txtPg4Sc5I4Total = sc5a;
  amount.txtPg4Sc5I9Total = sc5b;
  amount.txtPg4Sc5I10NetTaxableIncome = out(sc5a - sc5b);

  text.rdoPg1I5Atc = String(mcit);
  if (clear) text.txtPg1Pt1I10 = "";
  return { osd, mcit, amended, amount, forced, text };
}

// ── schema ──────────────────────────────────────────────────────────────────────────────────────────────────────

type TemplateRecord = [string, string, string?];
const ESCAPED = new Set(["Name1", "Name2", "Name3", "Address1", "Address2", "Address3"].map((x) => `${P}txtPg1Pt1I${x.startsWith("N") ? 8 : 9}${x}`));
/** Saved verbatim by saveXML's own branches (TIN, RDO, contact, ZIP, e-mail); every other text gets NumWithParenthesis. */
const VERBATIM = /:txtPg[1-4](Pt1I6)?TIN[1-4]$|:txtRDO$|:txtPg1Pt1I11Contact$|:txtZIP$|:txtPg1Pt1I12Email$/;
/** Template keys the native form does not model: BIR never lets the user set them (Part III payment details are for
 *  the online payment channel, the signature lines, Sch IIIA row 4 columns B–D, masks, pager and submission flags)
 *  or they belong to the unmodelled Sch IIIA row-7 modal. They keep BIR's own default. */
const UNMODELLED = /BranchMask|:txtPg1Pt3I2[3-6]|:txtSignature|:txtPg4Sc3AI4C[345]$|:txtCurrentPage|:txtMaxPage|driveSelectTPExport|txtFinalFlag|txtEnroll|ebirOnline|:txtPg4Sc3I3Subtotal|:txtPg4Sc4I4Subtotal|:txtPg4Sc3AI7C\dSubtotal/;
const TEXT_AMOUNT = new Set([`${P}Pg2Pt4I40IncomeTaxRate`]);
const COUNT = /CtrModal$/;

/** Field list straight from BIR's save template (the authority on which keys exist): radios, selects, the
 *  whole-peso amounts (template default "0"), and text. */
export function fieldList(record: TemplateRecord[]): FieldJson[] {
  return record
    .filter(([key]) => !UNMODELLED.test(key) && !COUNT.test(key))
    .map(([key, value, radio]): FieldJson => {
      if (radio) return { id: key, kind: "radio" };
      if (/:(ddl|drp)/.test(key)) return { id: key, kind: "select" };
      if (value === "0" && !TEXT_AMOUNT.has(key)) return { id: key, kind: "money" };
      return { id: key, kind: "text", ...(ESCAPED.has(key) ? { escaped: true } : {}) };
    });
}

export function make1702RT2018(code: string, edition: Edition, record: TemplateRecord[]): FormSchema {
  // v2018's rate (40) is a fixed "30%" BIR never lets the user change (taxRate.xml fills it); it keeps the default
  const json = fieldList(record).filter((f) => edition === "2018C" || f.id !== `${P}Pg2Pt4I40IncomeTaxRate`);
  // every model output is a computed field; the model reads only inputs, so the single DOM-order pass is safe
  const sample = model(() => "", edition);
  const computed = new Set(Object.keys(sample.amount));
  const field: FieldSpec[] = json.map((f) => {
    const key = f.id.slice(P.length);
    if (f.kind === "money" && computed.has(key)) return { ...f, compute: (r: Read) => model(r, edition).amount[key] ?? 0 };
    return { ...f };
  });
  for (const id of ["txtPg1Pt1I6TIN1", "txtPg1Pt1I6TIN2", "txtPg1Pt1I6TIN3", "txtPg1Pt1I6TIN4", "txtPg1Pt1I8Name1", "txtPg1Pt1I9Address1"]) {
    const f = field.find((x) => x.id === `${P}${id}`);
    if (f) f.required = true;
  }
  return {
    form_code: code,
    title: "Annual Income Tax — Corporations (Regular Rate)",
    field,
    group: MODAL_GROUP,
    format: formatPeso,
    extra_record: (state, groups) => derivedRecord(state, groups, edition, json),
  };
}

/** Saved values BIR derives at load / on blur, overlaid on the template: forced zeros, derived ticks and text, the
 *  modals' item lines, the page 2–4 headers, and NumWithParenthesis on plain text. */
function derivedRecord(state: FormState, groups: GroupState, edition: Edition, json: FieldJson[]): SaveRecord[] {
  const r: Read = (id) => state[id] ?? "";
  const m = model(r, edition);
  const record = new Map<string, string>();
  const set = (id: string, value: string) => record.set(id.startsWith(P) ? id : `${P}${id}`, value);
  for (const f of json) {
    if (f.kind !== "text" || f.escaped || VERBATIM.test(f.id) || !(f.id in state)) continue;
    const v = numWithParenthesis(state[f.id]!);
    if (v !== state[f.id]) record.set(f.id, v);
  }
  // a modal with rows owns its item line (OSD's clearing, applied after, still wins): one row → that row; two or more → "OTHERS" + the subtotal
  for (const mo of MODAL) {
    const row = groups[mo.name] ?? [];
    if (row.length === 0) continue;
    mo.line_text.forEach((id, j) => {
      const v = row.length === 1 ? (row[0]![`${P}${mo.stem}.{i}${mo.text[j]}`] ?? "") : "OTHERS";
      set(id, numWithParenthesis(v));
    });
  }
  for (const [id, v] of Object.entries(m.forced)) set(id, v);
  for (const [id, v] of Object.entries(m.text)) set(id, v);
  set(`${P}rdoPg1Pt1I13ItemizedDeduction`, String(!m.osd));
  set(`${P}rdoPg1Pt1I13OptionalStandard`, String(m.osd));
  // computeP1Pt2I21: overpayment options are cleared (and disabled) unless 16 is negative
  if (m.amount.txtPg1Pt2I16NetTax! >= 0)
    for (const x of ["Refunded", "Issued", "Carried"]) set(`${P}rdoPg1Pt2I21Overpayment${x}`, "false");
  // page 2–4 headers repeat page 1's TIN and registered name (loadBGData fills every txtTIN<n> / txtRegisteredName)
  const name = ["Name1", "Name2", "Name3"].map((x) => r(`${P}txtPg1Pt1I8${x}`)).join("");
  for (const pg of [2, 3, 4]) {
    for (const k of [1, 2, 3, 4]) set(`${P}txtPg${pg}TIN${k}`, r(`${P}txtPg1Pt1I6TIN${k}`));
    set(`${P}txtPg${pg}RegisteredName`, numWithParenthesis(name));
  }
  if (r(`${P}txtRDO`)) set(`${P}drpPg1Pt1I7RDOCode`, r(`${P}txtRDO`));
  // modal row text is plain text too
  for (const mo of MODAL)
    (groups[mo.name] ?? []).forEach((row, i) => {
      for (const col of mo.text) {
        const v = row[`${P}${mo.stem}.{i}${col}`] ?? "";
        if (numWithParenthesis(v) !== v) set(`${P}${mo.stem}.${i + 1}${col}`, numWithParenthesis(v));
      }
    });
  return [...record].map(([key, value]) => ({ key, value: ESCAPED.has(key) ? legacyEscape(value) : value }));
}

export const FORM_1702RTv2018C = make1702RT2018("1702RTv2018C", "2018C", template as TemplateRecord[]);

export function validate1702RT(schema: FormSchema, edition: Edition, state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(schema, state);
  const tin = `${state[`${P}txtPg1Pt1I6TIN1`] ?? ""}${state[`${P}txtPg1Pt1I6TIN2`] ?? ""}${state[`${P}txtPg1Pt1I6TIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1Pt1I6TIN1`, message: "The TIN's check digit doesn't match." });
  const date = state[`${P}txtPg1Pt1I10`] ?? "";
  if (date && !validIncorporationDate(date)) problem.push({ id: `${P}txtPg1Pt1I10`, message: "Date of incorporation must be a past date in MM/DD/YYYY form." });
  if (state[`${P}rdoPg1Pt1I13ItemizedDeduction`] === "true" && state[`${P}rdoPg1Pt1I13OptionalStandard`] === "true")
    problem.push({ id: `${P}rdoPg1Pt1I13OptionalStandard`, message: "Choose one method of deduction (BIR keeps OSD when both are ticked)." });
  const m = model((id) => state[id] ?? "", edition);
  for (const id of Object.keys(m.forced)) {
    if (!/C5$|C3$|C4$/.test(id) || !id.includes("Sc3A") || m.osd) continue;
    if (parseMoney(state[`${P}${id}`] ?? "0") !== 0) problem.push({ id: `${P}${id}`, message: "Sch IIIA: columns B + C + D cannot exceed column A (BIR zeroes this amount)." });
  }
  if (m.amount.txtPg1Pt2I16NetTax! < 0 && !["Refunded", "Issued", "Carried"].some((x) => state[`${P}rdoPg1Pt2I21Overpayment${x}`] === "true"))
    problem.push({ id: `${P}rdoPg1Pt2I21OverpaymentRefunded`, message: "Choose how the overpayment (item 21) is to be handled." });
  for (const mo of MODAL)
    (groups[mo.name] ?? []).forEach((row, i) => {
      if (parseMoney(row[`${P}${mo.stem}.{i}${mo.amount}`] ?? "") === 0)
        problem.push({ id: `${P}${mo.stem}.${i + 1}${mo.amount}`, message: `Row ${i + 1}: the amount should not be zero.` });
      if (!(row[`${P}${mo.stem}.{i}C1`] ?? "").trim()) problem.push({ id: `${P}${mo.stem}.${i + 1}C1`, message: `Row ${i + 1}: the description should not be blank.` });
    });
  return problem;
}

export const validate1702RTv2018C = (state: FormState, groups: GroupState = {}): Problem[] => validate1702RT(FORM_1702RTv2018C, "2018C", state, groups);
