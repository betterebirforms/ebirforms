// BIR Form 2200A (Excise Tax Return for Alcohol Products), the edition superseded by 2200Av2020, P3.
//
// Schedule 1 (a modal) has nine fixed ATC rows (XA035/036 distilled spirits, XA061/062/070/080 wines, XA055/056/057
// fermented liquors), XA090 (fortified wine, "taxed as distilled spirits": its due is ENTERED), an Others table
// (sched1*<i>, row 0 static) and thirteen calculator modals whose rows build each row's tax base.
// Rates are YEAR-dependent: setATCSchedule1 keeps the xml/atcCodes.xml entries whose description ends "==<year>"; for a
// year past 2018 it takes the 2018 entry and, when that rate is > 1, multiplies it by 1.04^(year − 2018) (an unrounded
// float, used as is). RATE below is that table. Two ATCs carry a second rate in some years (XA055 2013, XA056
// 2013–2016): populateSchedule1 inserts a second row (xa3_{exempt,taxable,exciseTaxDue}XA0552 / …XA0562) for it.
// computeSched1Alcohol / computeSched1TotalTaxDue (float), every result through roundDownComputation (toPrecision(14),
// then TRUNCATED to two decimals — not rounded):
//   row due = roundDown(rate × taxable)
//   totalTaxDue = roundDown( Σ fixed rows' UNROUNDED rate × taxable  +  the inserted rows' (rounded) dues
//                            + Σ Others rows' dues + XA090's entered due )   ← BIR sums unrounded products: replicated
//   Others row due (computeDynamicSched1) = roundDown(rate × taxable), the rate read as a percentage for XA035
// Calculators (computeXA035Bottle … computeOthers): total bottles = cases × bottles per case (formatCurrencyWOC, no
// decimals), proof = strength × 2 / 100, tax base = bottles × NRP (or content) × proof; each sub-total is
// roundDown(Σ tax base); XA035/XA036 combine Bottle + Bulk. computeToSchedule1 copies a sub-total into its row's
// taxable — modelled as: a calculator with a positive sub-total supplies the row's taxable.
// Part II, after sched1OK puts the total into item 18 (and changeMannerOfPayment zeroes 18 for a prepayment):
//   19C = 19A + 19B (19B disabled) ; 20 = 18 − 19C ; 22 = 20 − 21 (21 only on an amended return) ;
//   23D = 23A + 23B + 23C (zeroed for a prepayment: setTax23) ; chkPenalties = 23D > 0 ; 25B = chkPenalties ? 23D : 0 ;
//   24 = 22 + 23D ; 25C = 25A + 25B ; 26 = 24 − 25C
// saveXML escape()s EVERY text value except the TIN, RDO, ZIP, contact number, items 22/23A–D/25C and the date; its
// loadData unescapes them all. Replicated with `escaped`.
// BIR reload bugs (documented, see the test): loadData rebuilds calculator rows from the 13 txtCtrmodalCalculator*
// counters by POSITION but hard-codes only 11 cases, so XA056's rows come back with XA0552's count, XA057's with
// XA056's, and the XA0552 / XA0562 / XA057 counts are ignored; the reload's setATCSchedule1 inserts the XA0552 / XA0562
// rows AFTER loading, empty.

import fieldJson from "./fields/2200A.json";
import { parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { legacyEscape, type SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2200A:";
type Read = (id: string) => string;

// ── BIR's number helpers (js/string-util2014.js), replicated on the binary float ──
const num = (v: string): number => parseFloat(String(v).replace(/,/g, ""));
const addCommas = (s: string): string => s.replace(/(\d)(?=(\d{3})+$)/g, "$1,");
/** roundDownComputation: parseFloat(x.toPrecision(14)), then truncate to two decimals. */
export function roundDown(x: number): string {
  if (Number.isNaN(x)) return "0.00";
  const n = parseFloat(x.toPrecision(14));
  const s = n.toString();
  if (s.includes(".")) {
    const [p0 = "", p1 = ""] = s.split(".");
    return `${addCommas(p0 !== "-0" ? String(Number(p0)) : "-0")}.${p1.length === 1 ? `${p1}0` : p1.slice(0, 2)}`;
  }
  return `${addCommas(String(Number(n)))}.00`;
}
const rd = (x: number): Centavo => parseMoney(roundDown(x));
/** formatCurrencyWOC: rounds to the centavo, then drops the centavos ("12.7" → "12"). */
export function woc(v: string | number): string {
  let n = Number(String(v).replace(/[$,]/g, ""));
  if (Number.isNaN(n)) n = 0;
  const sign = n < 0 ? "-" : "";
  return sign + addCommas(String(Math.floor(Math.floor(Math.abs(n) * 100 + 0.50000000001) / 100)));
}
/** setPercentage(e, 2): truncate to two decimals, append "%"; blank, non-numeric or outside 0–100 → "0.00%". */
export function pct(v: string): string {
  const raw = v.includes("%") ? v.split("%")[0]! : v;
  if (raw.trim() === "" || Number.isNaN(Number(raw)) || Number(raw) < 0 || Number(raw) > 100) return "0.00%";
  const [p0 = "", p1] = raw.split(".");
  if (p1 === undefined) return `${addCommas(String(Number(p0)))}.00%`;
  return `${p1.length > 1 ? `${Number(p0)}.${p1.slice(0, 2)}` : `${addCommas(String(Number(p0)))}.${p1.length === 1 ? `${p1}0` : "00"}`}%`;
}
/** xa036VolumeChecker: truncate to three decimals. */
export function vol(v: string | number): string {
  const a = String(v).replace(/[$,]/g, "");
  if (Number.isNaN(Number(a))) return "0.000";
  if (!a.includes(".")) return `${addCommas(String(Number(a)))}.000`;
  const [p0 = "", p1 = ""] = a.split(".");
  return `${addCommas(String(Number(p0)))}.${p1.length > 2 ? p1.slice(0, 3) : p1.padEnd(3, "0")}`;
}
/** isAmountWithinAllowedPrecision (string-util.js) is false on an XA036 volume: xa036VolumeChecker then alerts
 *  "Value should not exceed Billion" and sets the box to 0.000. More than 12 digits before the point is over. */
export function overBillion(v: string): boolean {
  const a = v.replace(/[$,]/g, "");
  if (Number.isNaN(Number(a))) return false;
  return (a.indexOf(".") > 0 ? a.split(".")[0]! : a).length > 12;
}
/** The XA036 volume box xa036VolumeChecker guards: Bottle column 6, Bulk column 3. */
export const isVolumeBox = (kind: string, column: number): boolean => (kind === "036Bottle" && column === 6) || (kind === "036Bulk" && column === 3);
/** roundDownWithAlert on an entered amount: truncate (not round) to two decimals. */
const trunc2 = (v: string): string => (v === "" ? "" : roundDownEntered(v));
function roundDownEntered(v: string): string {
  const a = v.replace(/[$,]/g, "");
  if (Number.isNaN(Number(a))) return "0.00";
  if (!a.includes(".")) return `${addCommas(String(Number(a)))}.00`;
  const [p0 = "", p1 = ""] = a.split(".");
  return `${addCommas(String(Number(p0)))}.${p1.length === 1 ? `${p1}0` : p1.length === 0 ? "00" : p1.slice(0, 2)}`;
}
const capitalize = (v: string): string => v.toUpperCase().trim();

// ── the year → rate table (atcCodes.xml "==<year>" entries, in file order; a second value is the inserted row's) ──
type Atc = "XA035" | "XA036" | "XA061" | "XA062" | "XA070" | "XA080" | "XA055" | "XA056" | "XA057";
export const RATE: Record<Atc, Record<number, string[]>> = {
  XA035: { 2013: ["0.15"], 2014: ["0.15"], 2015: ["0.20"], 2016: ["0.20"], 2017: ["0.20"], 2018: ["0.20"] },
  XA036: { 2013: ["20.00"], 2014: ["20.00"], 2015: ["20.00"], 2016: ["20.80"], 2017: ["21.63"], 2018: ["22.50"] },
  XA061: { 2013: ["250.00"], 2014: ["260.00"], 2015: ["270.40"], 2016: ["281.22"], 2017: ["292.47"], 2018: ["304.16"] },
  XA062: { 2013: ["700.00"], 2014: ["728.00"], 2015: ["757.12"], 2016: ["787.40"], 2017: ["818.90"], 2018: ["851.66"] },
  XA070: { 2013: ["30.00"], 2014: ["31.20"], 2015: ["32.45"], 2016: ["33.75"], 2017: ["35.10"], 2018: ["36.50"] },
  XA080: { 2013: ["60.00"], 2014: ["62.40"], 2015: ["64.90"], 2016: ["67.50"], 2017: ["70.20"], 2018: ["73.00"] },
  XA055: { 2013: ["15.00", "15.49"], 2014: ["17.00"], 2015: ["19.00"], 2016: ["21.00"], 2017: ["23.50"], 2018: ["24.44"] },
  XA056: { 2013: ["20.00", "20.57"], 2014: ["21.00", "21.39"], 2015: ["22.00", "22.25"], 2016: ["23.00", "23.14"], 2017: ["23.50"], 2018: ["24.44"] },
  XA057: { 2013: ["28.00"], 2014: ["29.12"], 2015: ["30.28"], 2016: ["31.50"], 2017: ["32.76"], 2018: ["34.07"] },
};
/** The rate setATCSchedule1 puts in a row's ratehidden for `year` (slot 1 = the inserted second row), as the number
 *  BIR multiplies by; NaN when the year has none (BIR leaves the hidden rate blank). */
export function rateFor(atc: Atc, year: number, slot = 0): number {
  const own = RATE[atc][year];
  if (own) return own[slot] === undefined ? NaN : parseFloat(own[slot]!);
  if (year > 2018 && slot === 0) {
    const base = RATE[atc][2018]![0]!;
    return parseFloat(base) > 1 ? parseFloat(base) * Math.pow(1.04, year - 2018) : parseFloat(base);
  }
  return NaN;
}

/** The fixed Schedule 1 rows: [ATC, taxable/due stem index, calculator(s) feeding the taxable]. */
const FIXED: ReadonlyArray<readonly [Atc, string, string]> = [
  ["XA035", "xa1_%1", "XA035"], ["XA036", "xa1_%2", "XA036"],
  ["XA061", "xa2_%1", "XA061"], ["XA062", "xa2_%2", "XA062"], ["XA070", "xa2_%3", "XA070"], ["XA080", "xa2_%4", "XA080"],
  ["XA055", "xa3_%1", "XA055"], ["XA056", "xa3_%2", "XA056"], ["XA057", "xa3_%3", "XA057"],
];
const cell = (stem: string, col: "exempt" | "taxable" | "exciseTaxDue") => `${P}${stem.replace("%", col)}`;
/** The inserted second-rate rows: [ATC, id suffix, the years that have a second rate]. */
const DUP: ReadonlyArray<readonly [Atc, string, number[]]> = [["XA055", "XA0552", [2013]], ["XA056", "XA0562", [2013, 2014, 2015, 2016]]];
const dupCell = (suffix: string, col: "exempt" | "taxable" | "exciseTaxDue") => `${P}xa3_${col}${suffix}`;

const year = (r: Read): number => parseInt(r(`${P}txtForYr`), 10);
const onRemoval = (r: Read): boolean => r(`${P}chkPymntManner_1`) === "true";
/** populateSchedule1 inserts a second-rate row only on "payment on removal" with a year that has one. */
const hasDup = (r: Read, years: number[]): boolean => onRemoval(r) && years.includes(year(r));

// ── calculators ──
interface Calc { name: string; col: number; base: number; kind: "035Bottle" | "035Bulk" | "036Bottle" | "036Bulk" | "other" }
export const CALC: Calc[] = [
  { name: "XA035Bottle", col: 9, base: 9, kind: "035Bottle" }, { name: "XA035Bulk", col: 6, base: 6, kind: "035Bulk" },
  { name: "XA036Bottle", col: 10, base: 10, kind: "036Bottle" }, { name: "XA036Bulk", col: 6, base: 6, kind: "036Bulk" },
  ...["XA061", "XA062", "XA070", "XA080", "XA055", "XA0552", "XA056", "XA0562", "XA057"].map((name) => ({ name, col: 7, base: 7, kind: "other" as const })),
];
const colId = (calc: string, n: number) => `${P}Cal${calc}_{i}_Col${n}`;
const calcSpec = (c: Calc): GroupSpec => {
  const id = (n: number) => colId(c.name, n);
  const n = (read: Read, k: number) => num(read(id(k)));
  const derived: Record<number, (read: Read) => string> = {};
  // the read-only columns, exactly as BIR's compute* writes them
  if (c.kind === "035Bottle") {
    derived[5] = (r) => woc(n(r, 3) * n(r, 4));
    derived[8] = (r) => roundDown((n(r, 7) * 2) / 100);
    derived[9] = (r) => roundDown(n(r, 3) * n(r, 4) * n(r, 6) * ((n(r, 7) * 2) / 100));
  } else if (c.kind === "036Bottle") {
    derived[5] = (r) => woc(n(r, 3) * n(r, 4));
    derived[8] = (r) => roundDown((n(r, 7) * 2) / 100);
    derived[9] = (r) => vol(n(r, 6) * ((n(r, 7) * 2) / 100));
    derived[10] = (r) => roundDown(n(r, 3) * n(r, 4) * (n(r, 6) * ((n(r, 7) * 2) / 100)));
  } else if (c.kind === "035Bulk" || c.kind === "036Bulk") {
    derived[5] = (r) => roundDown((n(r, 4) * 2) / 100);
    derived[6] = (r) => roundDown(n(r, 3) * ((n(r, 4) * 2) / 100));
  } else {
    derived[5] = (r) => woc(n(r, 3) * n(r, 4));
    derived[7] = (r) => roundDown(n(r, 3) * n(r, 4) * n(r, 6));
  }
  // the entered columns, as BIR's blur handlers leave them
  const isBottle = c.kind === "035Bottle" || c.kind === "036Bottle" || c.kind === "other";
  const entered: Record<number, (v: string) => string> = {
    2: (v) => capitalize(v),
    ...(isBottle
      ? { 3: (v: string) => woc(v || "0"), 4: (v: string) => woc(v || "0"), 6: c.kind === "036Bottle" ? (v: string) => vol(v || "0") : (v: string) => trunc2(v) || "0.00" }
      : { 3: c.kind === "036Bulk" ? (v: string) => vol(v || "0") : (v: string) => trunc2(v) || "0.00" }),
    ...(c.kind === "035Bottle" || c.kind === "036Bottle" ? { 7: (v: string) => pct(v) } : c.kind === "035Bulk" || c.kind === "036Bulk" ? { 4: (v: string) => pct(v) } : {}),
  };
  return {
    name: `calc${c.name}`,
    size_field: `${P}txtCtrmodalCalculator${c.name}`,
    first_index: 1,
    row: Array.from({ length: c.col }, (_, k) => {
      const col = k + 1;
      if (col === 1) return { id: id(1), kind: "checkbox" as const, derive: (_r: Read, v: string) => v || "false" };
      const d = derived[col];
      const e = entered[col];
      const spec: FieldSpec = { id: id(col), kind: "text", escaped: true };
      if (d) spec.derive = (r: Read) => d(r);
      else if (e) spec.derive = (_r: Read, v: string) => e(v);
      return spec;
    }),
    total: { into: `CalcSubTotal${c.name}`, of: id(c.base) },
  };
};
const CALC_GROUP = CALC.map(calcSpec);
const sub = (r: Read, name: string): number => num(r(`CalcSubTotal${name}`) || "0");
/** The sub-total computeToSchedule1 copies into a row's taxable (XA035 / XA036 combine Bottle + Bulk). */
const calcTotal = (r: Read, name: string): number =>
  name === "XA035" || name === "XA036" ? num(roundDown(sub(r, `${name}Bottle`) + sub(r, `${name}Bulk`))) : sub(r, name);
/** A row's taxable: the box's own value. BIR writes a calculator's sub-total into it only on Compute, on Clear, or when
 *  Delete empties the calculator (computeToSchedule1 / computeToSchedule1WithNoAlertAndPrint); a row typed into the
 *  calculator moves only the calculator's sub-total, and a reload keeps the saved box. */
const taxable = (r: Read, id: string, _calc: string): number => num(r(id) || "0");

/** computeToSchedule1's route for a calculator: the sub-total it copies (XA035 / XA036 combine Bottle + Bulk) and the
 *  Schedule 1 taxable box it writes. */
export function calcRoute(name: string): { source: string; target: string } {
  const source = /^XA03[56]/.test(name) ? name.slice(0, 5) : name;
  const fixed = FIXED.find(([, , calc]) => calc === source);
  return { source, target: fixed ? cell(fixed[1], "taxable") : dupCell(name, "taxable") };
}
/** The sub-total computeToSchedule1 writes into the taxable box, as BIR's text. */
export const calcSubTotal = (r: Read, source: string): string => roundDown(calcTotal(r, source));
/** computeSched1Alcohol's ceiling: the row's due, or the total due, reaching 1,000,000,000,000. */
export function calcDueExceeds(r: Read, source: string): boolean {
  const fixed = FIXED.find(([, , calc]) => calc === source);
  const dup = DUP.find(([, suffix]) => suffix === source);
  const rate = fixed ? rateFor(fixed[0], year(r)) : dup ? rateFor(dup[0], year(r), 1) : NaN;
  return rate * calcTotal(r, source) >= 1000000000000 || scheduleTotal(r) >= 1000000000000;
}
/** openDialogForATC3536: BIR asks the XA035 / XA036 calculators to be filled in pairs. `empty(name)` says a
 *  calculator has no rows; the answer is BIR's alert, or null when the calculator opens. */
export function calcOpenAlert(name: string, empty: (calc: string) => boolean): string | null {
  const a = empty("XA035Bottle"), b = empty("XA035Bulk"), c = empty("XA036Bottle"), d = empty("XA036Bulk");
  const first = (text: string) => `Please fill up ${text} Calculator first.`;
  const s36bulk = first("XA036 Specific Tax (Bulk)"), s36bottle = first("XA036 Specific Tax (Bottle)");
  const s35bulk = first("XA035 Ad Valorem Tax (Bulk)"), s35bottle = first("XA035 Ad Valorem Tax (Bottle)");
  switch (name) {
    case "XA035Bottle": return a && !b && c && d ? s36bulk : a && b && c && !d ? s35bulk : null;
    case "XA035Bulk": return !a && b && c && d ? s36bottle : a && b && !c && d ? s35bottle : null;
    case "XA036Bottle": return a && b && c && !d ? s35bulk : a && !b && c && d ? s36bulk : null;
    case "XA036Bulk": return a && b && !c && d ? s35bottle : !a && b && c && d ? s36bottle : null;
    default: return null;
  }
}
/** getLabel: the name BIR gives a calculator box in its "should be greater than zero" alert (by the id's last digit). */
export function calcLabel(id: string): string {
  const col = id.slice(-1);
  if (id.includes("Bottle")) return col === "3" ? "Cases" : col === "4" ? "Bottles per Case" : col === "6" ? (id.includes("XA035") ? "NRP Per Bottle" : "Bottle Content") : col === "7" ? "Alcohol Strength" : "Description";
  if (id.includes("Bulk")) return col === "3" ? (id.includes("XA035") ? "NRP" : "Content") : col === "4" ? "Alcohol Strength" : "Description";
  return col === "3" ? "No. of Cases" : col === "4" ? "Bottles per Case" : col === "6" ? "Volume Content" : "Description";
}
/** ValidateTable: BIR's alert for the first box it finds wrong (rows in order, boxes left to right), or null. `row`
 *  holds each row's SHOWN values by column number; only the boxes a person fills are checked. */
export function calcTableAlert(name: string, row: Array<Record<number, string>>): string | null {
  const calc = CALC.find((c) => c.name === name)!;
  const typed = calc.kind === "035Bulk" || calc.kind === "036Bulk" ? [2, 3, 4] : calc.kind === "other" ? [2, 3, 4, 6] : [2, 3, 4, 6, 7];
  for (let i = 0; i < row.length; i++)
    for (const n of typed) {
      const v = (row[i]![n] ?? "").split("%")[0]!;
      if (n === 2 ? v.trim() === "" : v === "" || Number(v) === 0)
        return n === 2 ? `Please enter a valid Description at Row ${i + 1}.` : `${calcLabel(`${P}Cal${name}_${i + 1}_Col${n}`)} at Row ${i + 1} should be greater than zero.`;
    }
  return null;
}

// ── Others (sched1*<i>) ──
const OTHER: GroupSpec = {
  name: "other",
  first_index: 0,
  row: [
    { id: `${P}sched1Chk`, kind: "checkbox", derive: (_r, v) => v || "false" },
    { id: `${P}sched1Atc`, kind: "text", escaped: true, derive: (_r, v) => capitalize(v || "XA") },
    { id: `${P}sched1Desc`, kind: "text", escaped: true },
    { id: `${P}sched1TaxBracket`, kind: "text", escaped: true },
    { id: `${P}sched1AppRate`, kind: "text", escaped: true, derive: (_r, v) => v || "0.00" },
    { id: `${P}sched1Exempt`, kind: "money", escaped: true },
    { id: `${P}sched1Taxable`, kind: "money", escaped: true },
    {
      id: `${P}sched1ExciseTaxDue`, kind: "money", escaped: true,
      row_compute: (r) => rd(otherRate(r(`${P}sched1Atc`) || "XA", r(`${P}sched1AppRate`) || "0.00") * num(r(`${P}sched1Taxable`) || "0.00")),
    },
  ],
  total: { into: `${P}sched1OtherTotal`, of: `${P}sched1ExciseTaxDue` },
};
/** computeDynamicSched1's rate: a percentage for XA035, else the number itself. */
export const otherRate = (atc: string, rate: string): number => (atc.trim().toUpperCase() === "XA035" ? num(rate.split("%")[0]!) / 100 : num(rate));

/** computeSched1TotalTaxDue, from the inputs (item 18 sits above Schedule 1 in the DOM). */
export function scheduleTotal(r: Read): number {
  const y = year(r);
  let total = 0;
  for (const [atc, stem, calc] of FIXED) total += rateFor(atc, y) * taxable(r, cell(stem, "taxable"), calc) || 0;
  for (const [atc, suffix, years] of DUP) if (hasDup(r, years)) total +=num(roundDown(rateFor(atc, y, 1) * taxable(r, dupCell(suffix, "taxable"), suffix)));
  total += parseMoney(r(`${P}sched1OtherTotal`)) / 100;
  total += num(r(`${P}xa2_exciseTaxDue5`) || "0.00");
  return total;
}

const m = (r: Read, id: string): Centavo => parseMoney(r(`${P}${id}`));
const money = { kind: "money" as const };
/** saveXML writes these verbatim; every other text value goes through escape(). */
const PLAIN = new Set(["txtContactNum", "txtTIN1", "txtTIN2", "txtTIN3", "txtBranchCode", "txtRDOCode", "txtZipCode", "txtTax23A", "txtTax23B", "txtTax23C", "txtTax22", "txtTax23D", "txtTax25C", "txtMonth1", "txtDate", "txtForYr"].map((k) => `${P}${k}`));

const json = (fieldJson as FieldJson[]).filter((f) => f.id !== `${P}xa2_rate5` && !/^frm2200A:sched1(Chk|Atc|Desc|TaxBracket|AppRate|Exempt|Taxable|ExciseTaxDue)0$/.test(f.id));
// the inserted second-rate rows sit right after their ATC's row
const field: FieldJson[] = json.flatMap((f) => {
  for (const [, suffix] of DUP) {
    const after = suffix === "XA0552" ? `${P}xa3_exciseTaxDue1` : `${P}xa3_exciseTaxDue2`;
    if (f.id === after) return [f, ...(["exempt", "taxable", "exciseTaxDue"] as const).map((c) => ({ id: dupCell(suffix, c), kind: "money" as const }))];
  }
  return [f];
});

const override: Record<string, Partial<FieldSpec>> = {
  ...Object.fromEntries(["txtMonth1", "txtDate", "txtForYr", "txtTIN1", "txtTIN2", "txtTIN3", "txtBranchCode", "txtRDOCode", "txtTaxPayerName", "txtAddress", "txtZipCode", "txtContactNum", "txtLineBus", "txtPSIC"].map((k) => [`${P}${k}`, { required: true }])),
  ...Object.fromEntries(["ebirOnlineConfirmUsername", "ebirOnlineConfirmPassword", "ebirOnlineUsername", "ebirOnlinePassword", "ebirOnlineSecret"].map((k) => [k, { secret: true }])),
  // changeTreaty: no relief → the list back to its blank option "0"
  [`${P}lstTaxTreaty`]: { derive: (r, v) => (r(`${P}optTreaty_1`) === "true" || v === "" ? v : "0") },
  // "Others" manner of payment is a checkbox under prepayment; "payment on removal" unchecks it and clears the text
  [`${P}chkPymntManner_3`]: { gate: { on: `${P}chkPymntManner_2`, equals: "true" } },
  [`${P}txt17OthMannerofPymnt`]: { gate: { on: `${P}chkPymntManner_3`, equals: "true" }, derive: (_r, v) => capitalize(v) },
  [`${P}txtTax18`]: { ...money, compute: (r) => (onRemoval(r) ? rd(scheduleTotal(r)) : 0) },
  [`${P}txtTax19A`]: money,
  [`${P}txtTax19B`]: { ...money, gate: { when: () => false } }, // disabled at init, never entered
  [`${P}txtTax19C`]: { ...money, compute: (r) => m(r, "txtTax19A") + m(r, "txtTax19B") },
  [`${P}txtTax20`]: { ...money, compute: (r) => m(r, "txtTax18") - m(r, "txtTax19C") },
  [`${P}txtTax21`]: { ...money, gate: { on: `${P}amendedRtn_1`, equals: "true" } },
  [`${P}txtTax22`]: { ...money, compute: (r) => m(r, "txtTax20") - m(r, "txtTax21") },
  // setTax23(true) on a prepayment zeroes and disables the penalties
  ...Object.fromEntries(["txtTax23A", "txtTax23B", "txtTax23C"].map((k) => [`${P}${k}`, { ...money, gate: { when: (r: Read) => r(`${P}chkPymntManner_2`) !== "true" } }])),
  [`${P}txtTax23D`]: { ...money, compute: (r) => m(r, "txtTax23A") + m(r, "txtTax23B") + m(r, "txtTax23C") },
  [`${P}txtTax24`]: { ...money, compute: (r) => m(r, "txtTax22") + m(r, "txtTax23D") },
  [`${P}txtTax25A`]: money,
  // compute23D: chkPenalties = (23D > 0); payPenalties: 25B = 23D when checked
  [`${P}chkPenalties`]: { derive: (r) => String(m(r, "txtTax23D") > 0) },
  [`${P}txtTax25B`]: { ...money, compute: (r) => (m(r, "txtTax23D") > 0 ? m(r, "txtTax23D") : 0) },
  [`${P}txtTax25C`]: { ...money, compute: (r) => m(r, "txtTax25A") + m(r, "txtTax25B") },
  [`${P}txtTax26`]: { ...money, compute: (r) => m(r, "txtTax24") - m(r, "txtTax25C") },
  // Schedule 1 fixed rows
  ...Object.fromEntries(
    FIXED.flatMap(([atc, stem, calc]) => [
      [cell(stem, "exempt"), { ...money, derive: (_r: Read, v: string) => trunc2(v) }],
      [cell(stem, "taxable"), { ...money, is_editable: true, compute: (r: Read) => parseMoney(roundDownEntered(String(taxable(r, cell(stem, "taxable"), calc)))) }],
      [cell(stem, "exciseTaxDue"), { ...money, compute: (r: Read) => rd(rateFor(atc, year(r)) * taxable(r, cell(stem, "taxable"), calc) || 0) }],
    ]),
  ),
  ...Object.fromEntries(
    DUP.flatMap(([atc, suffix]) => [
      [dupCell(suffix, "exempt"), { ...money, derive: (_r: Read, v: string) => trunc2(v) }],
      [dupCell(suffix, "taxable"), { ...money, is_editable: true, compute: (r: Read) => parseMoney(roundDownEntered(String(taxable(r, dupCell(suffix, "taxable"), suffix)))) }],
      [dupCell(suffix, "exciseTaxDue"), { ...money, compute: (r: Read) => rd(rateFor(atc, year(r), 1) * taxable(r, dupCell(suffix, "taxable"), suffix) || 0) }],
    ]),
  ),
  [`${P}xa2_exempt5`]: { ...money, derive: (_r, v) => trunc2(v) },
  [`${P}xa2_taxable5`]: { ...money, derive: (_r, v) => trunc2(v) },
  [`${P}xa2_exciseTaxDue5`]: { ...money, derive: (_r, v) => trunc2(v) },
  [`${P}totalTaxDue`]: { ...money, compute: (r) => rd(scheduleTotal(r)) },
  ...Object.fromEntries(CALC.map((c) => [`CalcSubTotal${c.name}`, money])),
};
// escape() on save for every text / select / money value BIR doesn't list
const built = buildSchema("2200A", "Excise Tax — Alcohol Products (pre-2020)", field, override);
for (const f of built.field) if ((f.kind === "text" || f.kind === "money" || f.kind === "select") && !PLAIN.has(f.id) && !f.secret) f.escaped = true;

/** The derived records outside the template: the inserted second-rate rows, and the XA035 / XA036 combined
 *  sub-totals computeSum writes once a Bottle / Bulk calculator is used (blank until then). */
function extraRecord(state: FormState, groups: GroupState): SaveRecord[] {
  const r = (id: string) => state[id] ?? "";
  const out: SaveRecord[] = [];
  for (const [, suffix, years] of DUP)
    if (hasDup(r, years)) for (const c of ["exempt", "taxable", "exciseTaxDue"] as const) out.push({ key: dupCell(suffix, c), value: legacyEscape(r(dupCell(suffix, c)) || "0.00") });
  for (const atc of ["XA035", "XA036"])
    if ((groups[`calc${atc}Bottle`]?.length ?? 0) + (groups[`calc${atc}Bulk`]?.length ?? 0) > 0)
      out.push({ key: `CalcSubTotal${atc}`, value: legacyEscape(roundDown(sub(r, `${atc}Bottle`) + sub(r, `${atc}Bulk`))) });
  return out;
}

export const FORM_2200A: FormSchema = { ...built, group: [OTHER, ...CALC_GROUP], extra_record: extraRecord };

/** BIR's validateForm / validateDate / sched1OK / isValidDataOnSched1 checks a native save can fail. */
export function validate2200A(state: FormState, groups: Record<string, GroupRow[]> = {}): Problem[] {
  const problem = validateRequired(FORM_2200A, state);
  const v = (id: string) => (state[`${P}${id}`] ?? "").trim();
  const tin = `${v("txtTIN1")}${v("txtTIN2")}${v("txtTIN3")}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  const month = parseInt(v("txtMonth1"), 10), day = parseInt(v("txtDate"), 10), y = parseInt(v("txtForYr"), 10);
  if (v("txtDate") && v("txtForYr")) {
    if (!/^\d{2}$/.test(v("txtDate")) || !(day >= 1 && day <= new Date(y, month, 0).getDate())) problem.push({ id: `${P}txtDate`, message: "Please provide a valid date (MM/DD/YYYY)." });
    else if (new Date(y, month - 1, day) > new Date()) problem.push({ id: `${P}txtForYr`, message: "This date cannot be a future date." });
    if (y < 2013) problem.push({ id: `${P}txtForYr`, message: "The year cannot be less than 2013." });
  }
  if (v("txtZipCode") && v("txtZipCode").length < 4) problem.push({ id: `${P}txtZipCode`, message: "Please enter Taxpayer's Zip Code on Item 7A." });
  if (v("txtPSIC") && v("txtPSIC").length < 4) problem.push({ id: `${P}txtPSIC`, message: "Please enter a valid PSIC on Item 10." });
  if (v("chkPymntManner_1") === "true") {
    // sched1OK: XA035 and XA036 go together
    const t1 = parseMoney(v("xa1_taxable1")), t2 = parseMoney(v("xa1_taxable2"));
    if (t1 !== 0 && t2 === 0) problem.push({ id: `${P}xa1_taxable2`, message: "Tax Base column for XA036 must have a value." });
    if (t2 !== 0 && t1 === 0) problem.push({ id: `${P}xa1_taxable1`, message: "Tax Base column for XA035 must have a value." });
    const rows = groups.other ?? [];
    const blank = (row: GroupRow) => !(row[`${P}sched1Desc`] ?? "").trim() && parseMoney(row[`${P}sched1Taxable`] ?? "") === 0 && parseMoney(row[`${P}sched1AppRate`] ?? "") === 0;
    if (rows.length > 1 || (rows.length === 1 && !blank(rows[0]!)))
      rows.forEach((row, i) => {
        const atc = (row[`${P}sched1Atc`] ?? "").trim().toUpperCase();
        const at = (k: string) => `${P}sched1${k}${i}`;
        if (!atc || atc === "XA") problem.push({ id: at("Atc"), message: `Please enter a valid ATC at Row ${i + 1}.` });
        else if (!atc.startsWith("XA") || !/^XA\d{3}$/.test(atc)) problem.push({ id: at("Atc"), message: `Invalid ATC at Row ${i + 1}.` });
        else if (!(row[`${P}sched1Desc`] ?? "").trim()) problem.push({ id: at("Desc"), message: `Please enter a valid Description at Row ${i + 1}.` });
        else if (!(row[`${P}sched1TaxBracket`] ?? "").trim()) problem.push({ id: at("TaxBracket"), message: `Please enter a valid Tax Bracket at Row ${i + 1}.` });
        else if (otherRate(atc, row[`${P}sched1AppRate`] ?? "0") === 0) problem.push({ id: at("AppRate"), message: `Please enter a valid Applicable rate at Row ${i + 1}.` });
        else if (parseMoney(row[`${P}sched1Taxable`] ?? "") === 0) problem.push({ id: at("Taxable"), message: `Please enter a valid Tax Base at Row ${i + 1}.` });
      });
  } else if (v("chkPymntManner_2") !== "true") problem.push({ id: `${P}chkPymntManner_1`, message: "Choose Manner of Payment." });
  return problem;
}
