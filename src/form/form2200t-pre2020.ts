// BIR Form 2200T (Excise Tax Return for Tobacco Products), the edition superseded by 2200Tv2020 (form2200t.ts), P3.
//
// Schedule 1 (a modal) has nine fixed product rows (txtPro{Exempt,Taxable,BasicTaxDue}0..8: XT010 a/b/c, XT020, XT035
// cigars ad valorem, XT036 cigars specific, XT040 / XT140 / XT150 cigarettes), six inspection-fee rows
// (txtIns…0..5: XT080 / XT090 / XT100 / XT110 / XT120 ×2, fixed rates in getInspectionFee), an Others table
// (txtsched1*<i>, row 0 static, rows 1+ rebuilt on reopen by counting sched1Chk records) and five calculator modals
// (XT35 / XT36 / XT40 / XT140 / XT150) whose rows build a product row's tax base.
// Rates are YEAR-dependent, set on blur of item 1's year (setATCSchedule1 + changeTaxRatePerYear, which also runs
// when "payment on removal" is clicked — so on every reopen of such a return):
//   2013–2017: the xml/atcCodes.xml entries whose description ends "==<year>" (file order = the nine rows);
//   any other year: changeTaxRatePerYear's fallback — base rates compounded by 4% (r += r × .04) once per year past
//     2017, then toFixed(2); XT035 stays 0.20.
//   BIR BUG (replicated): changeTaxRatePerYear's XT010 base is 2.81 while getProducts / otherRateCheck use 2.05;
//     the year blur always runs last, so 2.81 is the base every saved XT010 due uses.
// Every compute is a float through roundDownComputation (toPrecision(14), then TRUNCATED to two decimals):
//   product / inspection row due = roundDown(rate × taxable)   (computeProBasicTaxDue / computeInsBasicTaxDue)
//   Others row due = roundDown(rate × taxable), the rate read as a percentage for XT035 (computeSched1BasicTaxDue)
//   totalTaxDue = roundDown(Σ the shown product, inspection and Others dues)   (totalTaxDue)
// Calculators (computeCalculatorXT*, getProduct, computeCalculatorSubTotal):
//   XT35: C5 = roundDown(C3 quantity × C4 NRP); total = roundDown(Σ C5) → product row 4's taxable
//   XT36: total = formatCurrencyWOC(Σ C3 quantity) → product row 5
//   XT40 / XT140 / XT150: C5 = woc(C3 × C4), C7 = woc(C5 × C6); total = woc(Σ C7) → product rows 6 / 7 / 8
//   The Compute button copies a total into its row's taxable — modelled as: a calculator with a positive total
//   supplies the row's taxable.
// Part II (sched1OK puts the total into item 16; recomputePrepayment zeroes it for a prepayment):
//   17C = 17A + 17B (17B disabled) ; 18 = 16 − 17C ; 20 = 18 − 19 (19 only on an amended return) ;
//   21D = 21A + 21B + 21C (zeroed for a prepayment: disableItem22) ; PayPenalties = 21D ≠ 0 ; 23B = PayPenalties ? 21D : 0 ;
//   22 = 20 + 21D ; 23C = 23A + 23B ; 24 = 22 − 23C
// saveXML escape()s only the taxpayer name, address and line of business; loadData unescapes them.

import fieldJson from "./fields/2200T.json";
import { parseMoney, type Centavo } from "./money.ts";
import { pct, roundDown, woc } from "./form2200a.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2200T:";
type Read = (id: string) => string;

// ── BIR's number helpers, on the binary float ──
/** NumWithComma(v) * 1: "" and non-numbers are NaN (BIR's `* 1` then poisons the product, roundDown → 0.00). */
export const num = (v: string): number => parseFloat(String(v).replace(/,/g, ""));
const addCommas = (s: string | number): string => String(s).replace(/(\d)(?=(\d{3})+$)/g, "$1,");
const rd = (x: number): Centavo => parseMoney(roundDown(x));
/** roundDownWithAlert on an entered amount: truncate (not round) to two decimals; a non-number → 0.00. */
export function trunc2(v: string): string {
  const a = v.replace(/[$,]/g, "");
  if (Number.isNaN(Number(a))) return "0.00";
  if (!a.includes(".")) return `${addCommas(Number(a))}.00`;
  const [p0 = "", p1 = ""] = a.split(".");
  return `${addCommas(Number(p0))}.${p1.length === 1 ? `${p1}0` : p1.length === 0 ? "00" : p1.slice(0, 2)}`;
}
export const trunc2Entered = (v: string): string => (v === "" ? "" : trunc2(v));
/** setToZeroIfEmpty (calculator quantities): blank, non-numeric or negative → "0", else woc(Math.round(n)). */
export function quantity(v: string): string {
  const both = v.includes("(") && v.includes(")");
  const n = Number(v.replace(/[(),]/g, ""));
  if (v.trim() === "" || both || Number.isNaN(n)) return "0";
  if (parseInt(v, 10) < 0) return "0";
  return woc(Math.round(n));
}
/** setApplicableTaxrate: blank / non-numeric / outside 0–999.99 → "0.00", else truncated to two decimals. */
export function appRate(v: string): string {
  if (v.trim() === "" || Number.isNaN(Number(v))) return "0.00";
  if (Number(v) < 0 || Number(v) > 999.99) return "0.00";
  const t = v.split(".");
  if (t.length === 2) {
    const [p0 = "", p1 = ""] = t;
    if (p1.length > 1) return `${Number(p0)}.${p1.slice(0, 2)}`;
    if (p1.length === 1) return `${addCommas(Number(p0))}.${p1}0`;
    return `${addCommas(Number(p0))}.00`;
  }
  return t[0]!.length > 0 ? `${addCommas(Number(t[0]))}.00` : v;
}
/** checkIfValidValues (a text box of maxlength 30 / none): drop characters outside BIR's set, trim. */
export const cleanText = (v: string): string => v.replace(/[^a-zA-Z 0-9.,#@'()_-]/g, "").trim();
const capitalize = (v: string): string => v.toUpperCase().trim();

// ── the year → rate table ──
/** xml/atcCodes.xml's "==<year>" entries for 2200T, in file order (= product rows 0..8). */
export const RATE_XML: Record<number, string[]> = {
  2013: ["1.75", "1.75", "1.75", "1.50", "0.20", "5.00", "12.00", "12.00", "25.00"],
  2014: ["1.82", "1.82", "1.82", "1.56", "0.20", "5.20", "15.00", "17.00", "27.00"],
  2015: ["1.89", "1.89", "1.89", "1.62", "0.20", "5.41", "18.00", "21.00", "28.00"],
  2016: ["1.97", "1.97", "1.97", "1.68", "0.20", "5.62", "21.00", "25.00", "29.00"],
  2017: ["2.05", "2.05", "2.05", "1.75", "0.20", "5.85", "30.00", "30.00", "30.00"],
};
/** The hidden rate each product row holds for item 1's year (changeTaxRatePerYear). */
export function productRate(year: string): string[] {
  const y = parseInt(year, 10);
  const own = RATE_XML[y];
  if (own) return own;
  const n = y - 2017; // NaN for a blank year: BIR's `x < NaN` loop never runs
  const base = [2.81, 1.75, 5.85, 30, 30, 30]; // XT010 (BIR's 2.81, not 2.05), XT020, XT036, XT040, XT140, XT150
  const r = base.map((b) => {
    let v = b;
    for (let x = 0; x < n; x++) v += v * 0.04;
    return v.toFixed(2);
  });
  return [r[0]!, r[0]!, r[0]!, r[1]!, "0.2", r[2]!, r[3]!, r[4]!, r[5]!];
}
/** Product rows: [ATC, description] (row 4's rate shows as "20%"). */
export const PRODUCT: ReadonlyArray<readonly [string, string]> = [
  ["XT010", "Tobacco twisted by hand or reduced into a condition to be consumed other than by ordinary drying and curing"],
  ["XT010", "Tobacco prepared or partially prepared, not pressed or sweetened"],
  ["XT010", "Fine-cut shorts, refuse, scraps, clippings, cuttings, stems, midribs and sweepings"],
  ["XT020", "Chewing tobacco unsuitable for use in any other manner"],
  ["XT035", "Cigars — ad valorem, 20% of the net retail price per cigar"],
  ["XT036", "Cigars — specific tax per cigar"],
  ["XT040", "Cigarettes packed by hand"],
  ["XT140", "Cigarettes packed by machine, NRP ₱11.50 and below per pack"],
  ["XT150", "Cigarettes packed by machine, NRP more than ₱11.50 per pack"],
];
/** Inspection-fee rows (getInspectionFee): [ATC, description, unit, rate]. */
export const INSPECTION: ReadonlyArray<readonly [string, string, string, string]> = [
  ["XT080", "Inspection fee — cigars", "per 1,000 cigars", "0.50"],
  ["XT090", "Inspection fee — cigarettes", "per 1,000 sticks", "0.10"],
  ["XT100", "Inspection fee — leaf tobacco", "per kilogram", "0.02"],
  ["XT110", "Inspection fee — scraps and other manufactured tobacco", "per kilogram", "0.03"],
  ["XT120", "Imported blending tobacco inspection and monitoring fee — leaf", "per kilogram", "0.02"],
  ["XT120", "Imported blending tobacco inspection and monitoring fee — partially manufactured", "per kilogram", "0.03"],
];

// ── calculators ──
export interface Calc { name: "XT35" | "XT36" | "XT40" | "XT140" | "XT150"; row: number; col: number }
export const CALC: Calc[] = [
  { name: "XT35", row: 4, col: 5 }, { name: "XT36", row: 5, col: 3 },
  { name: "XT40", row: 6, col: 7 }, { name: "XT140", row: 7, col: 7 }, { name: "XT150", row: 8, col: 7 },
];
export const calcCell = (name: string, col: number): string => (col === 1 ? `${P}chk${name}Delete_{i}C1` : `${P}txt${name}_{i}C${col}`);
/** The calculator total as BIR writes it into txt<name>Total. */
const calcTotal = (c: Calc, rows: GroupRow[]): string => {
  const of = c.name === "XT35" ? 5 : c.name === "XT36" ? 3 : 7;
  const total = rows.reduce((s, row) => {
    const v = num(row[calcCell(c.name, of)] ?? "");
    return Number.isNaN(v) ? s : s + v;
  }, 0);
  return c.name === "XT35" ? roundDown(total) : woc(total);
};
const calcSpec = (c: Calc): GroupSpec => {
  const id = (n: number) => calcCell(c.name, n);
  const n = (r: Read, k: number) => num(r(id(k)));
  const row: GroupSpec["row"] = [
    { id: id(1), kind: "checkbox", derive: (_r, v) => v || "false" },
    { id: id(2), kind: "text", derive: (_r, v) => capitalize(cleanText(v)) },
    { id: id(3), kind: "text", derive: (_r, v) => quantity(v) },
  ];
  if (c.name === "XT35") {
    row.push({ id: id(4), kind: "text", derive: (_r, v) => trunc2(v || "0.00") }, { id: id(5), kind: "text", derive: (r) => roundDown(n(r, 3) * n(r, 4)) });
  } else if (c.name !== "XT36") {
    row.push(
      { id: id(4), kind: "text", derive: (_r, v) => quantity(v) },
      { id: id(5), kind: "text", derive: (r) => woc(n(r, 3) * n(r, 4)) },
      { id: id(6), kind: "text", derive: (_r, v) => quantity(v) },
      { id: id(7), kind: "text", derive: (r) => woc(n(r, 5) * n(r, 6)) },
    );
  }
  return {
    name: `calc${c.name}`,
    size_field: `${P}txtCtrmodalCalculator${c.name}`,
    first_index: 1,
    row,
    total: { into: `${P}txt${c.name}Total`, of: id(c.col), sum: (rows) => calcTotal(c, rows) },
  };
};
const CALC_GROUP = CALC.map(calcSpec);

// ── Others (txtsched1*<i>) ──
/** computeSched1BasicTaxDue's rate: a percentage for XT035, else the number itself. */
export const otherRate = (atc: string, rate: string): number => (atc.trim() === "XT035" ? num(rate.split("%")[0]!) / 100 : num(rate));
const OTHER: GroupSpec = {
  name: "other",
  first_index: 0,
  row: [
    { id: `${P}sched1Chk`, kind: "checkbox", derive: (_r, v) => v || "false" },
    { id: `${P}txtsched1Atc`, kind: "text", derive: (_r, v) => capitalize(cleanText(v || "XT")) },
    { id: `${P}txtsched1Desc`, kind: "text", derive: (_r, v) => cleanText(v) },
    { id: `${P}txtsched1TaxBracket`, kind: "text", derive: (_r, v) => cleanText(v) },
    // checkATCValue gives an XT035 row setPercentage ("15.00%"); any other ATC setApplicableTaxrate
    { id: `${P}txtsched1AppTaxRate`, kind: "text", derive: (r, v) => (r(`${P}txtsched1Atc`) === "XT035" ? pct(v || "0.00") : appRate(v.includes("%") ? "0.00" : v || "0.00")) },
    { id: `${P}txtsched1Exempt`, kind: "money", derive: (_r, v) => trunc2(v || "0.00") },
    { id: `${P}txtsched1Taxable`, kind: "money", derive: (_r, v) => trunc2(v || "0.00") },
    {
      id: `${P}txtsched1BasicTaxDue`, kind: "money",
      // derive (not row_compute) so it sees the ATC / rate / taxable as their own derives left them
      derive: (r) => roundDown(otherRate(r(`${P}txtsched1Atc`), r(`${P}txtsched1AppTaxRate`)) * num(r(`${P}txtsched1Taxable`))),
    },
  ],
  total: { into: `${P}otherDueTotal`, of: `${P}txtsched1BasicTaxDue` },
};

// ── Schedule 1 from the inputs (item 16 sits above it in the DOM, so it can't read the later computed cells) ──
const year = (r: Read): string => r(`${P}txtForYr`);
/** A product row's taxable: its calculator's total when positive, else the entered amount (roundDownWithAlert). */
const productTaxable = (r: Read, i: number): string => {
  const c = CALC.find((x) => x.row === i);
  if (c && num(r(`${P}txt${c.name}Total`) || "0") > 0) return trunc2(r(`${P}txt${c.name}Total`));
  return trunc2(r(`${P}txtProTaxable${i}`) || "0.00");
};
const productDue = (r: Read, i: number): Centavo => rd(num(productRate(year(r))[i]!) * num(productTaxable(r, i)));
const inspectionDue = (r: Read, i: number): Centavo => rd(num(INSPECTION[i]![3]) * num(trunc2(r(`${P}txtInsTaxable${i}`) || "0.00")));
/** totalTaxDue: Σ the shown (truncated) dues — exact in centavos. */
export const scheduleTotal = (r: Read): Centavo =>
  PRODUCT.reduce((s, _p, i) => s + productDue(r, i), 0) + INSPECTION.reduce((s, _p, i) => s + inspectionDue(r, i), 0) + parseMoney(r(`${P}otherDueTotal`));

const m = (r: Read, id: string): Centavo => parseMoney(r(`${P}${id}`));
const money = { kind: "money" as const };
const prepayment = (r: Read): boolean => r(`${P}chkPymntManner_2`) === "true";

const json = (fieldJson as FieldJson[]).filter((f) => !/^frm2200T:(sched1Chk|txtsched1(Atc|Desc|TaxBracket|AppTaxRate|Exempt|Taxable|BasicTaxDue))0$/.test(f.id));

// dateMonthYear() stamps a prepayment with TODAY and re-stamps on every reopen (it runs on the checkbox
// click and in the reload's payment-manner sweep) — so the saved date is always the day of the last open
const prepayDate = (r: Read): string | null =>
  r(`${P}chkPymntManner_2`) === "true" ? String(new Date().getDate()).padStart(2, "0") : null;
const prepayMonth = (r: Read): string | null =>
  r(`${P}chkPymntManner_2`) === "true" ? String(new Date().getMonth() + 1).padStart(2, "0") : null;
const prepayYear = (r: Read): string | null =>
  r(`${P}chkPymntManner_2`) === "true" ? String(new Date().getFullYear()) : null;

const override: Record<string, Partial<FieldSpec>> = {
  ...Object.fromEntries(["txtMonth1", "txtDate", "txtForYr", "txtTIN1", "txtTIN2", "txtTIN3", "txtBranchCode", "txtRDOCode", "taxpayerName", "txtAddress", "txtZipCode", "txtTelNum", "txtLineBus", "txtPSIC", "txtEmailAddress"].map((k) => [`${P}${k}`, { required: true }])),
  ...Object.fromEntries(["ebirOnlineConfirmUsername", "ebirOnlineConfirmPassword", "ebirOnlineUsername", "ebirOnlinePassword", "ebirOnlineSecret"].map((k) => [k, { secret: true }])),
  [`${P}txtMonth1`]: { derive: (r: Read, v: string) => prepayMonth(r) ?? v },
  [`${P}txtDate`]: { derive: (r: Read, v: string) => prepayDate(r) ?? v },
  [`${P}txtForYr`]: { derive: (r: Read, v: string) => prepayYear(r) ?? v },
  // saveXML escape()s these three; loadBGData upper-cases them from the profile, capitalize() on blur
  ...Object.fromEntries(["taxpayerName", "txtAddress", "txtLineBus"].map((k) => [`${P}${k}`, { required: true, escaped: true, derive: (_r: Read, v: string) => capitalize(v) }])),
  // changeTreaty: no relief → the list back to its blank option "0"
  [`${P}lstTaxTreaty`]: { derive: (r, v) => (r(`${P}optTreaty_1`) === "true" || v === "" ? v : "0") },
  // item 17 "others" is a checkbox live only under prepayment; its text only while it is ticked
  [`${P}chkPymntManner_3`]: { gate: { on: `${P}chkPymntManner_2`, equals: "true" } },
  [`${P}txtOthMannerofPymnt`]: { gate: { on: `${P}chkPymntManner_3`, equals: "true" }, derive: (_r, v) => cleanText(v) },
  // Part II
  [`${P}txtTax16`]: { ...money, compute: (r) => (prepayment(r) ? 0 : scheduleTotal(r)) },
  [`${P}txtTax17A`]: money,
  [`${P}txtTax17B`]: { ...money, gate: { when: () => false } }, // disabled at init, never entered
  [`${P}txtTax17C`]: { ...money, compute: (r) => m(r, "txtTax17A") + m(r, "txtTax17B") },
  [`${P}txtTax18`]: { ...money, compute: (r) => m(r, "txtTax16") - m(r, "txtTax17C") },
  [`${P}txtTax19`]: { ...money, gate: { on: `${P}amendedRtn_1`, equals: "true" } },
  [`${P}txtTax20`]: { ...money, compute: (r) => m(r, "txtTax18") - m(r, "txtTax19") },
  ...Object.fromEntries(["txtTax21A", "txtTax21B", "txtTax21C"].map((k) => [`${P}${k}`, { ...money, gate: { when: (r: Read) => !prepayment(r) } }])),
  [`${P}txtTax21D`]: { ...money, compute: (r) => m(r, "txtTax21A") + m(r, "txtTax21B") + m(r, "txtTax21C") },
  [`${P}txtTax22`]: { ...money, compute: (r) => m(r, "txtTax20") + m(r, "txtTax21D") },
  [`${P}txtTax23A`]: money,
  // compute21D: PayPenalties = (21D != 0); payPenalties: 23B = 21D when ticked
  [`${P}PayPenalties`]: { derive: (r) => String(m(r, "txtTax21D") !== 0) },
  [`${P}txtTax23B`]: { ...money, compute: (r) => m(r, "txtTax21D") },
  [`${P}txtTax23C`]: { ...money, compute: (r) => m(r, "txtTax23A") + m(r, "txtTax23B") },
  [`${P}txtTax24`]: { ...money, compute: (r) => m(r, "txtTax22") - m(r, "txtTax23C") },
  // Schedule 1 fixed rows
  ...Object.fromEntries(
    PRODUCT.flatMap((_p, i) => [
      [`${P}txtProExempt${i}`, { ...money, derive: (_r: Read, v: string) => trunc2Entered(v) }],
      [`${P}txtProTaxable${i}`, { ...money, is_editable: true, compute: (r: Read) => parseMoney(productTaxable(r, i)) }],
      [`${P}txtProBasicTaxDue${i}`, { ...money, compute: (r: Read) => productDue(r, i) }],
    ]),
  ),
  ...Object.fromEntries(
    INSPECTION.flatMap((_p, i) => [
      [`${P}txtInsExempt${i}`, { ...money, derive: (_r: Read, v: string) => trunc2Entered(v) }],
      [`${P}txtInsTaxable${i}`, { ...money, derive: (_r: Read, v: string) => trunc2Entered(v) }],
      [`${P}txtInsBasicTaxDue${i}`, { ...money, compute: (r: Read) => inspectionDue(r, i) }],
    ]),
  ),
  [`${P}totalTaxDue`]: { ...money, compute: scheduleTotal },
};

export const FORM_2200T_PRE2020: FormSchema = { ...buildSchema("2200T", "Excise Tax — Tobacco Products (pre-2020)", json, override), group: [OTHER, ...CALC_GROUP] };

/** BIR's validateForm / validateDate / sched1OK / isValidDataOnSched1 / otherRateCheck checks a native save can fail. */
export function validate2200TPre2020(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2200T_PRE2020, state);
  const v = (id: string) => (state[`${P}${id}`] ?? "").trim();
  const tin = `${v("txtTIN1")}${v("txtTIN2")}${v("txtTIN3")}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  const month = parseInt(v("txtMonth1"), 10), day = parseInt(v("txtDate"), 10), y = parseInt(v("txtForYr"), 10);
  if (v("txtDate") && v("txtForYr")) {
    if (!/^\d{2}$/.test(v("txtDate")) || !(day >= 1 && day <= new Date(y, month, 0).getDate())) problem.push({ id: `${P}txtDate`, message: "Please provide a valid date (MM/DD/YYYY)." });
    else if (new Date(y, month - 1, day) > new Date()) problem.push({ id: `${P}txtForYr`, message: "This date cannot be a future date." });
    if (y < 2013) problem.push({ id: `${P}txtForYr`, message: "The year cannot be less than 2013." });
  }
  if (v("txtRDOCode") === "000") problem.push({ id: `${P}txtRDOCode`, message: "Please enter a valid RDO Code on Item 5." });
  if (v("txtZipCode") && v("txtZipCode").length < 4) problem.push({ id: `${P}txtZipCode`, message: "Please enter Taxpayer's Zip Code on Item 7A." });
  if (v("txtPSIC") && v("txtPSIC").length < 4) problem.push({ id: `${P}txtPSIC`, message: "Please enter a valid PSIC on Item 10." });
  const place = (id: string) => (state[id] ?? "00") === "00" || (state[id] ?? "") === "";
  if (["frm2200ToptRegion", "frm2200ToptProvince", "frm2200ToptCity"].some(place)) problem.push({ id: "frm2200ToptCity", message: "Please enter values on item no. 12. All entries must not be empty." });
  if (["frm2200ToptRegion1", "frm2200ToptProvince1", "frm2200ToptCity1"].some(place)) problem.push({ id: "frm2200ToptCity1", message: "Please enter values on item no. 13. All entries must not be empty." });
  if (v("optTreaty_1") === "true" && (v("lstTaxTreaty") === "" || v("lstTaxTreaty") === "0")) problem.push({ id: `${P}lstTaxTreaty`, message: "Please select a tax relief on Item 14A." });
  if (v("chkPymntManner_2") === "true") {
    // dateMonthYear stamps a prepayment with today's date (and BIR re-stamps it on every reopen)
    const now = new Date();
    if (month !== now.getMonth() + 1 || day !== now.getDate() || y !== now.getFullYear()) problem.push({ id: `${P}txtDate`, message: "A prepayment / advance deposit is dated today (item 1)." });
    if (v("chkPymntManner_3") === "true" && !v("txtOthMannerofPymnt")) problem.push({ id: `${P}txtOthMannerofPymnt`, message: "Please enter a value on Item 17." });
    if (!(parseMoney(v("txtTax23A")) > 0)) problem.push({ id: `${P}txtTax23A`, message: "Please enter Tax Payment / Deposit on Item 23A." });
  } else if (v("chkPymntManner_1") !== "true") problem.push({ id: `${P}chkPymntManner_1`, message: "Please select an option on Part II Manner of Payment." });
  // validateForm: parseFloat("" + item 24) > 0 — parseFloat stops at the first comma, still positive for any positive balance
  if (parseMoney(v("txtTax24")) > 0) problem.push({ id: `${P}txtTax23A`, message: "Payment not sufficient to cover amount payable (item 24 must not be positive)." });
  if (v("chkPymntManner_1") === "true") {
    // sched1OK: XT035 and XT036 go together
    const t4 = parseMoney(v("txtProTaxable4")), t5 = parseMoney(v("txtProTaxable5"));
    if (t4 !== 0 && t5 === 0) problem.push({ id: `${P}txtProTaxable5`, message: "Tax Base column for XT036 must have a value." });
    if (t5 !== 0 && t4 === 0) problem.push({ id: `${P}txtProTaxable4`, message: "Tax Base column for XT035 must have a value." });
    const rows = groups.other ?? [];
    const cell = (row: GroupRow, k: string) => (row[`${P}txtsched1${k}`] ?? "").trim();
    const blank = (row: GroupRow) => ["", "XT"].includes(cell(row, "Atc").toUpperCase()) && !cell(row, "Desc") && !cell(row, "TaxBracket") && parseMoney(cell(row, "Taxable")) === 0 && num(cell(row, "AppTaxRate") || "0") === 0;
    const rate = productRate(v("txtForYr"));
    const fixed: Array<[string, number]> = [...PRODUCT.map(([atc], i): [string, number] => [atc, num(rate[i]!)]), ...INSPECTION.map(([atc, , , r]): [string, number] => [atc, num(r)])];
    if (rows.length > 1 || (rows.length === 1 && !blank(rows[0]!)))
      rows.forEach((row, i) => {
        const atc = cell(row, "Atc").toUpperCase();
        const at = (k: string) => `${P}txtsched1${k}${i}`;
        const r = otherRate(atc, cell(row, "AppTaxRate") || "0");
        if (!atc || atc === "XT") problem.push({ id: at("Atc"), message: `Please enter a valid ATC at Row ${i + 1}.` });
        else if (!/^XT\d{3}$/.test(atc)) problem.push({ id: at("Atc"), message: `Invalid ATC at Row ${i + 1} (XT + 3 digits).` });
        else if (!cell(row, "Desc")) problem.push({ id: at("Desc"), message: `Please enter a Description at Row ${i + 1}.` });
        else if (!cell(row, "TaxBracket")) problem.push({ id: at("TaxBracket"), message: `Please enter a Tax Bracket at Row ${i + 1}.` });
        else if (!r) problem.push({ id: at("AppTaxRate"), message: `Please enter a valid Applicable rate at Row ${i + 1}.` });
        else if (parseMoney(cell(row, "Taxable")) === 0) problem.push({ id: at("Taxable"), message: `Please enter a valid Tax Base at Row ${i + 1}.` });
        else if (fixed.some(([a, x]) => a === atc && x === r) || rows.filter((o) => cell(o, "Atc").toUpperCase() === atc && otherRate(atc, cell(o, "AppTaxRate") || "0") === r).length > 1)
          problem.push({ id: at("AppTaxRate"), message: `Rate should be unique per ATC (row ${i + 1}).` });
      });
  }
  // validateModal: every calculator row needs a description and non-zero amounts
  for (const c of CALC)
    (groups[`calc${c.name}`] ?? []).forEach((row, i) => {
      const cols = c.name === "XT36" ? [2, 3] : c.name === "XT35" ? [2, 3, 4] : [2, 3, 4, 6];
      for (const col of cols) {
        const val = (row[calcCell(c.name, col)] ?? "").trim();
        if (col === 2 ? !val : !(num(val) > 0)) {
          problem.push({ id: `${calcCell(c.name, col).replace("{i}", String(i + 1))}`, message: `${c.name} calculator row ${i + 1}: ${col === 2 ? "a description is required" : "the amount should be greater than zero"}.` });
          break;
        }
      }
    });
  return problem;
}
