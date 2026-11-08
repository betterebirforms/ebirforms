// The Documentary Stamp Tax rate engine — BIR's per-ATC tax-due arithmetic for the 2000 family, replicated exactly.
//
// Rate data: src/form/dst-atc.json (tool/dst-extract.mjs) is BIR's own ATC list for DST, every xml/atcCodes.xml record
// containing "2000^", in BIR's order, with each record's slots verbatim. BIR's record format has base / compType /
// constTaxDue / minimum / maximum slots that feed a generic engine (2000's computeSectionATaxDue: compType "M" =
// constant up to a maximum then per-base steps, "C" = constant above a minimum, else rate × ceil(base ÷ atcBase)),
// but in the shipped XML those slots are EMPTY for every DST code. So the generic engine never yields a figure
// (parseFloat("") is NaN) and every code's arithmetic lives in a per-code switch inside each form. The `format_rate`
// slot is the rate text BIR shows and saves in the row (txtTaxRate / txt12C). Each function below is one BIR
// switch, case for case — including BIR's bugs, named at the case — because BIR's server checks BIR's arithmetic.
//
// Arithmetic is BIR's: the tax base is a JS float (NumWithComma), the product is a float, and the result goes
// through `x.toFixed(2)` then formatCurrency's round-half-up — `taxFloat` below reproduces that pipeline exactly.

import dstAtc from "./dst-atc.json";
import { parseMoney, type Centavo } from "./money.ts";

export interface DstAtc {
  atc_code: string;
  description: string;
  rate: string;
  category: string;
  base: string;
  comp_type: string;
  const_tax_due: string;
  minimum: string;
  maximum: string;
  format_rate: string;
}

/** BIR's DST ATC list (loadATC keeps every record containing "2000^"), in BIR's order. DS112 appears twice:
 *  capital of annuities (P1.00/P200) and pre-need plans (P0.40/P200). */
export const DST_ATC: DstAtc[] = (dstAtc as Record<string, DstAtc[]>)["2000"]!;

/** `formatCurrency(NumWithComma(x.toFixed(2)))` — BIR's pipeline from a float tax to the saved string, in centavos.
 *  A NaN (e.g. an undefined month count) prints "NaN", which formatCurrency turns into "0.00". */
export const taxFloat = (x: number): Centavo => (Number.isFinite(x) ? parseMoney(x.toFixed(2)) : 0);

/** The form-level answers the 2000v2018 DS106 / DS130–DS132 pop-ups store. BIR keeps ONE of each per form, so every
 *  row of the same code shares it (a BIR limitation: two DS106 instruments with different terms can't both be right). */
export interface DstModal {
  /** ds106modYes: "Is the term of the debt instrument less than a year?" answered Yes. */
  ds106_short_term: boolean;
  /** frm2000:numOfDays, as typed. */
  day_count: string;
  /** ds130modYes: "Is the duration of the charter 6 months or less?" answered Yes (only shapes DS130's rate text). */
  ds130_short_term: boolean;
  /** frm2000:numOfMonths (DS130), frm2000:numOfMonths131, frm2000:numOfMonths132, as typed. */
  month_count_130: string;
  month_count_131: string;
  month_count_132: string;
}
export const NO_MODAL: DstModal = { ds106_short_term: false, day_count: "0", ds130_short_term: false, month_count_130: "0", month_count_131: "0", month_count_132: "0" };

/** What one Schedule 1 blur leaves in the row: the tax due (null = BIR leaves the cell as it was), a rewritten tax
 *  base (BIR's range checks reset it to 0.00), a rewritten rate text, and whether BIR's code threw. */
export interface DstRowResult {
  tax_due: Centavo | null;
  tax_base?: Centavo;
  rate_text?: string;
  /** BIR's case threw a ReferenceError before writing anything (DS125). */
  is_error?: boolean;
}

/** 2000v2018 `computeSched1TaxDue(i)`: one Schedule 1 row's tax due from its ATC, tax base (centavos, already
 *  rounded by the blur's round()) and rate text, plus the form's pop-up answers. Case for case with BIR. */
export function taxDue2000v2018(atc_code: string, base_centavo: Centavo, rate_text: string, modal: DstModal = NO_MODAL): DstRowResult {
  const b = base_centavo / 100; // NumWithComma(txtTaxBase) — the float BIR parses back from "1,234.56"
  const due = (x: number): DstRowResult => ({ tax_due: taxFloat(x) });
  const flat = (peso: number): DstRowResult => ({ tax_due: peso * 100 });
  // DS130–DS132: a <= 0 base writes 0.00 first; an out-of-range base alerts, resets the BASE to 0.00 and leaves
  // the tax due as it was (BIR's `break` skips the month arithmetic); else 6 months or less → the constant,
  // longer → constant + (months − 6) × step. parseInt of an empty month box is NaN → "0.00".
  const charter = (monthText: string, constant: number, step: number, outOfRange: boolean, rate?: string): DstRowResult => {
    const zeroed = b <= 0;
    if (outOfRange) return { tax_due: zeroed ? 0 : null, tax_base: 0, ...(rate && { rate_text: rate }) };
    const n = parseInt(monthText, 10);
    const x = zeroed ? 0 : n <= 6 ? constant : constant + (n - 6) * step;
    return { ...due(x), ...(rate && { rate_text: rate }) };
  };
  switch (atc_code) {
    case "DS101": return due((b / 200) * 2);
    case "DS102": return due((b / 200) * 1.5);
    case "DS103": return due(b * 0.75);
    case "DS104": return due((b / 200) * 1);
    case "DS105": return due(b * 3); // P3.00 per check: the "base" is the number of checks
    case "DS106": {
      // a short-term debt instrument is prorated by days ÷ 365 (the day box is coerced as JS `days / 365` does)
      const days = Number(modal.day_count);
      return due(modal.ds106_short_term ? (b / 200) * 1.5 * (days / 365) : (b / 200) * 1.5);
    }
    case "DS107":
    case "DS108":
    case "DS126": return due((b / 200) * 0.6);
    case "DS109": // life insurance, by amount of cover (since January 2018)
      if (b <= 100_000) return flat(0);
      if (b <= 300_000) return flat(20);
      if (b <= 500_000) return flat(50);
      if (b <= 750_000) return flat(100);
      if (b <= 1_000_000) return flat(150);
      return flat(200);
    case "DS110":
    case "DS111": return due((b / 4) * 0.5);
    case "DS112": // two list entries share the code; BIR tells them apart by the rate text the row carries
      if (rate_text === "P1.00/P200") return due((b / 200) * 1);
      if (rate_text === "P0.40/P200") return due((b / 200) * 0.4);
      return { tax_due: null };
    case "DS113": return due((b / 4) * 0.3);
    case "DS114":
    case "DS118": return due(b * 30); // per certificate / per proxy: the base is a count
    case "DS115": return flat(b <= 200 ? 0 : 30);
    case "DS116": return due(b * 0.2);
    case "DS117": return flat(b < 100 ? 0 : b <= 1000 ? 2 : 20);
    case "DS119": return due(b * 10);
    case "DS120": // leases: P6 for the first P2,000, P2 per P1,000 after — NOT rounded up to a whole P1,000 (BIR's float)
      if (b >= 1 && b <= 2000) return flat(6);
      return b > 2000 ? due(6 + ((b - 2000) / 1000) * 2) : flat(0);
    case "DS121": // mortgages: P40 for the first P5,000, P20 per P5,000 after — likewise not rounded up
      if (b >= 1 && b <= 5000) return flat(40);
      return b > 5000 ? due(40 + ((b - 5000) / 5000) * 20) : flat(0);
    case "DS124": return due(b * 0.15);
    case "DS130": return charter(modal.month_count_130, 1000, 100, b > 1000);
    case "DS131": // a positive base also rewrites the rate text (correcting the pop-up's "P,2000" typo)
      return charter(modal.month_count_131, 2000, 200, (b > 0 && b < 1001) || b > 10_000, b > 0 ? "1ST 6 MONTHS P2,000 IN EXCESS + P200" : undefined);
    case "DS132":
      return charter(modal.month_count_132, 3000, 300, (b > 0 && b < 10_001) || b > 100_000_000_000_000);
    case "DS125":
      // BIR bug: `var result = atcInputTaxbase * 0.50;S` — a stray `S` throws a ReferenceError, so BIR never writes
      // the tax due (nor the Schedule 1 total on this blur). The row keeps whatever it held.
      return { tax_due: null, is_error: true };
    default: // "DS010" (general: the tax due is typed) and "-" (no ATC)
      return { tax_due: null };
  }
}

/** The rate text a 2000v2018 row shows after its ATC is picked: getATCdrpTaxRate writes the record's formatRate
 *  (the second DS112 entry when `is_pre_need`), DS109 a fixed summary; then newRate's pop-ups overwrite DS130–132
 *  (with BIR's "P,1000" typo) and, answered Yes with a count, DS106 / DS130 (DS131/DS132's Yes branch throws on an
 *  undefined `newds130rate`, so their text stays). DS010 and "-" are not on the list, so the text is "". */
export function rateText2000v2018(atc_code: string, is_pre_need = false, modal: DstModal = NO_MODAL): string {
  switch (atc_code) {
    case "DS109": return "Exempt, P20, P50, P100, P150, P200";
    case "DS106":
      return modal.ds106_short_term && Number(modal.day_count) !== 0 ? `P1.5/200 * ${modal.day_count}/365 days` : formatRateOf("DS106");
    case "DS130":
      return modal.ds130_short_term && Number(modal.month_count_130) > 0 ? `P1.5/200 * ${modal.month_count_130}/12 months` : "1ST 6 MONTHS P,1000 IN EXCESS + P100";
    case "DS131": return "1ST 6 MONTHS P,2000 IN EXCESS + P200";
    case "DS132": return "1ST 6 MONTHS P,3000 IN EXCESS + P300";
    case "DS112": return DST_ATC.filter((a) => a.atc_code === "DS112")[is_pre_need ? 1 : 0]!.format_rate;
    default: return formatRateOf(atc_code);
  }
}

const formatRateOf = (atc_code: string): string => DST_ATC.find((a) => a.atc_code === atc_code)?.format_rate ?? "";

/** The ATC codes a 2000v2018 Schedule 1 row may carry: "-", BIR's hard-coded "DS010 - GENERAL", then the list. */
export const ATC_CHOICE_2000V2018: string[] = ["-", "DS010", ...new Set(DST_ATC.map((a) => a.atc_code))];

// ---- 2000OTv2018 (one-time transactions, TRAIN edition) ----
// Its ATCs are not in atcCodes.xml at all (BIR commented its loadATC out): three radios with rate texts hard-coded as
// globals (ATC_DO102 / ATC_DO122 / ATC_DO125), and TaxComputation's switch is the engine.

export type OneTimeAtc = "DO102" | "DO122" | "DO125";
/** The rate text SelectedATC writes into item 16 (BIR's own globals, verbatim). */
export const ONE_TIME_RATE: Record<OneTimeAtc, string> = {
  DO102: "P1.50 / P200",
  DO122: "P15 / P1,000",
  DO125: "50% DST paid on original issue",
};
/** Item 12's nature of transaction: shares of stock (rbTransNature_1) or real property (_2 / _3). */
export type OneTimeNature = "shares" | "property" | "";

/** BIR's `+= NumWithComma(…)` running sum, row by row, as a JS float (no rounding until BIR rounds). */
export const floatSum = (value: string[]): number => value.reduce((s, v) => s + (parseFloat(v.replace(/,/g, "")) || 0), 0);

/** 2000OTv2018 TaxComputation's item 17 (tax due), or null where BIR leaves it as it was (no nature / no ATC).
 *  `par_sum` / `paid_sum` are Schedule 1B's float sums of par value / DST paid on original issue; `property_base`
 *  is Schedule 2's taxable base (item 15), which BIR only computes for DO122. */
export function taxDue2000OTv2018(atc: OneTimeAtc | "", nature: OneTimeNature, par_sum: number, paid_sum: number, property_base: number): Centavo | null {
  if (nature === "shares") {
    switch (atc) {
      // P1.50 per FULL P200 of par value: BIR floors ("Remove +1 to correct the computation 020926"), so a fraction
      // of P200 pays nothing (the Tax Code's "or fractional part thereof" would round up)
      case "DO102": return par_sum !== 0 ? taxFloat(Math.floor(par_sum / 200) * 1.5) : 0;
      // DO122 is the real-property ATC: ComputeSharesOfStock returns undefined for it, NaN × 0 → "0.00"
      case "DO122": return 0;
      case "DO125": return taxFloat(paid_sum * 0.5); // 50% of the DST paid on the original issue
      default: return null;
    }
  }
  if (nature === "property") {
    switch (atc) {
      case "DO102":
      case "DO125": return 0; // ComputeRealProperty returns undefined for these: NaN × 0 → "0.00"
      // P15 per P1,000 with Math.ROUND: a remainder under P500 pays nothing, P500 or more a whole P15 (the Tax Code
      // says per P1,000 "or fractional part thereof")
      case "DO122": return taxFloat(Math.round(property_base / 1000) * 15);
      default: return null;
    }
  }
  return null;
}

// ---- 2000 (pre-TRAIN monthly DST, superseded by 2000v2018) ----
// Same "2000^" ATC list. The pickers render each record into table cells (`<td> RATE </td>`), and the form copies a
// cell's innerHTML into item 12C / a Schedule 1 row, so a rate text carries a leading and trailing space; the
// nature of payment (item 12A) a trailing one.

/** What getATCCode / getSched1ATCCode copy from the picker into 12C / txtTaxRate<i>: " RATE ". */
export const rateCell2000 = (a: DstAtc): string => ` ${a.format_rate} `;
/** What getATCCode copies into 12A: "DESCRIPTION ". */
export const natureCell2000 = (a: DstAtc): string => `${a.description} `;

/** 2000 `computeAmount12D` (Section A, item 12D) from the ATC (txtATC), 12A and 12C texts and the 12B base. Returns
 *  the new 12D (null = BIR leaves it as it was) and, for DS109, the bracket text BIR writes into 12C. */
export function amount12D2000(atc_code: string, nature_text: string, rate_text: string, base_centavo: Centavo): { tax_due: Centavo | null; rate_text?: string } {
  const b = base_centavo / 100;
  let due: Centavo | null = null;
  const flat = (peso: number) => (due = peso * 100);
  const by = (x: number) => (due = taxFloat(x));
  if (b > 0) {
    // BIR's first pass keys on the 12C text, but compares it with NO leading space, so a picked ATC's " RATE " text
    // never matches; an EMPTY (or blank) 12C is `!isNaN("")` → base × 0 = 0.00. Kept whole for that last branch.
    switch (rate_text) {
      case "P3.00 ": flat(3); break;
      case "P15.0 ": flat(30); break;
      case "P30.0 W/ VALUE ABOVE 200.01 ": flat(b > 200 ? 30 : 0); break;
      case "1ST P1000.0 = P1.0 IN EXCESS P10.0/P1000.0 ": break;
      case "P5.0 ": flat(10); break;
      case "1ST P2000.0 = P3.0 IN EXCESS P1.0/P1000.0 ": if (b <= 2000) flat(3); else by(3 + (b - 2000) * (1 / 1000)); break;
      case "1ST P5000.0 = P20.0 IN EXCESS P10.0/P5000.0 ": if (b <= 5000) flat(20); else by(20 + (b - 5000) * (10 / 5000)); break;
      case "P2.00/P200 ": by(b * 0.01); break;
      case "P0.75/200 ": by(b * 0.00375); break;
      case "P1.00/P200 ": by(b * 0.005); break;
      case "P0.60/P200 ": by(b * 0.003); break;
      case "P0.50/P4 ": by(b * 0.125); break;
      case "P0.20/P200 ": by(b * 0.001); break;
      case "P0.30/P4.00 ": by(b * 0.075); break;
      case "P0.10/P1.00 ": by(b * 0.1); break;
      default: if (!Number.isNaN(Number(rate_text))) by(b * Number(rate_text)); // JS isNaN(text) / text * 1
    }
  }
  let text: string | undefined;
  switch (atc_code) {
    case "DS101": by((b / 200) * 2); break;
    case "DS102": by((b / 200) * 1.5); break;
    case "DS103": by(b * 0.75); break;
    case "DS104": by((b / 200) * 1); break;
    case "DS105": by(b * 3); break;
    case "DS106": by((b / 200) * 1.5); break;
    case "DS107":
    case "DS108": by((b / 200) * 0.6); break; // (no DS126 case here: its 12D is typed)
    case "DS109": {
      const tier: Array<[number, number, string]> = [
        [100_000, 0, "Does not exceed P100,000 - Exempt"],
        [300_000, 20, "Exceed P100,000 but does not exceed P300,000 - P20"],
        [500_000, 50, "Exceed P300,000 but does not exceed P500,000 - P50"],
        [750_000, 100, "Exceed P500,000 but does not exceed P750,000 - P100"],
        [1_000_000, 150, "Exceed P750,000 but does not exceed P1,000,000 - P150"],
        [Infinity, 200, "Exceed P1,000,000 - P200"],
      ];
      const [, peso, label] = tier.find(([max]) => b <= max)!;
      flat(peso);
      text = label;
      break;
    }
    case "DS110":
    case "DS111": by((b / 4) * 0.5); break;
    case "DS112": // two entries share the code; BIR tells them apart by 12A
      if (nature_text === "CAPITAL OF THE ANNUITIES ") by((b / 200) * 1);
      else if (nature_text === "ON PRE-NEED PLANS ") by((b / 200) * 0.4);
      break;
    case "DS113": by((b / 4) * 0.3); break;
    case "DS114":
    case "DS118": by(b * 30); break;
    case "DS117": // BIR bug: exactly P100 matches no branch, so 12D keeps its old value
      if (b < 100) flat(0);
      else if (b > 100 && b <= 1000) flat(2);
      else if (b > 1000) flat(20);
      break;
    case "DS119": by(b * 10); break;
    case "DS116": by((b / 1) * 0.2); break;
    case "DS120": if (b <= 2000 && b >= 1) flat(6); else if (b > 2000) by(6 + ((b - 2000) / 1000) * 2); else flat(0); break;
    case "DS121": if (b <= 5000 && b >= 1) flat(40); else if (b > 5000) by(40 + ((b - 5000) / 5000) * 20); else flat(0); break;
    case "DS124": by(b * 0.15); break;
    // charters: the base is read as a MONTH count — exactly 6 → the constant, more → + step per month, and fewer
    // than 6 months → 0.00 (BIR bug: a short charter pays nothing)
    case "DS130": if (b === 6) flat(1000); else if (b > 6) by(1000 + (b - 6) * 100); else flat(0); break;
    case "DS131": if (b === 6) flat(2000); else if (b > 6) by(2000 + (b - 6) * 200); else flat(0); break;
    case "DS132": if (b === 6) flat(3000); else if (b > 6) by(3000 + (b - 6) * 300); else flat(0); break;
    case "DS125": by(b * 0.5); break;
    default: break; // DS115 and DS126 have no case: 12D is whatever the filer typed
  }
  return text === undefined ? { tax_due: due } : { tax_due: due, rate_text: text };
}

/** 2000 `computeSched1TaxDue(i)` (Section B, Schedule 1 row). Returns the row's new tax due (null = unchanged: the
 *  cell is typeable, and for most codes BIR computes nothing) and, for DS130–DS132, the figure BIR writes into
 *  SECTION A's item 12D instead of the row (BIR bug). Nothing happens unless the base is above zero. */
export function sched1Due2000(atc_code: string, rate_text: string, base_centavo: Centavo): { tax_due: Centavo | null; item_12d?: Centavo } {
  const b = base_centavo / 100;
  if (!(b > 0)) return { tax_due: null };
  let due: Centavo | null = null;
  let item_12d: Centavo | undefined;
  const charter = (constant: number, step: number) => (item_12d = b === 6 ? constant * 100 : b > 6 ? taxFloat(constant + (b - 6) * step) : 0);
  switch (atc_code) {
    case "DS105": due = 300; break; // BIR bug: P3.00 flat, not P3.00 per check (Section A multiplies)
    case "DS114": due = 3000; break; // likewise flat P30
    case "DS115": due = b > 200 ? 3000 : 0; break;
    case "DS117": due = b < 100 ? 0 : b <= 1000 ? 100 : taxFloat(((b - 1000) / 1000) * 10 + 1); break; // the pre-2018 P1 + P10/P1,000
    case "DS118": due = 3000; break;
    case "DS119": due = 1000; break;
    case "DS120": break;
    case "DS121": due = b === 5000 ? 4000 : b > 5000 ? taxFloat(40 + (b - 5000) * (10 / 5000)) : 0; break;
    case "DS130": charter(1000, 100); break;
    case "DS131": charter(2000, 200); break;
    case "DS132": charter(3000, 300); break;
    default: {
      // BIR bug: parseFloat of the " RATE " text — " P2.00/P200 " is NaN (typed tax due), but " 75% " / " 15% " /
      // " 50% OF …" parse as 75 / 15 / 50, so DS103 / DS124 / DS125 multiply the base by 75 / 15 / 50
      const rate = parseFloat(rate_text);
      if (!Number.isNaN(rate)) due = taxFloat(b * rate);
    }
  }
  // the second switch: DS120 zeroes a base up to P2,000 (and leaves a larger one alone); DS121 is redone at P20/P5,000
  if (atc_code === "DS120" && b <= 2000) due = 0;
  if (atc_code === "DS121") due = b === 5000 ? 4000 : b > 5000 ? taxFloat(40 + ((b - 5000) / 5000) * 20) : 0;
  return item_12d === undefined ? { tax_due: due } : { tax_due: due, item_12d };
}
