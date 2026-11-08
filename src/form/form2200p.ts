// BIR Form 2200-P (Excise Tax Return for Petroleum Products, superseded by 2200Pv2020), P3. One page (items 1–24)
// plus the Schedule 1 pop-up (#modalSched1, opened by btnSchedule1 only for "payment upon actual removal"):
//   • 26 fixed product rows 0–25, built at init by createStaticFieldForSched1 (so the field tool can't see them). Each
//     row's specific rate is a hidden `frm2200P:hideAppRate<i>` BIR never saves (getStaticATC): the per-commodity rate
//     engine is RATE_2200P below. Per row, NumWithComma floats through formatCurrency:
//       TaxRem = Locally + Imported                  (computeTotalTaxRem)
//       Conditional = TaxPaid + Underbond + Exports + Others   (computeTotalConTaxFreeRem)
//       BasicTaxDue = TaxRem × rate                   (computeBasicExciseTaxDue)
//     getPlaceOfRemSched1 copies item 12's place of removal into the row while Locally is non-zero ("" otherwise).
//   • Added rows (frm2200P:txtsched1*<i>, index 0 in the page, 1+ by addFieldsForSched1): typed ATC (XP…), description,
//     unit, applicable rate and place; the same three computes with the typed rate (sched1TotalTaxRem, …).
//   • totalTaxDue (function of the same name) = Σ BasicTaxDue over the 26 fixed and every added row; sched1OK copies it
//     to item 16.
// Reload: loadXML adds one row per saved `frm2200P:sched1Chk<i>` whose first index digit is non-zero, then loadData
// refills by id — replaying the onclick of EVERY checked radio (BIR's `indexOf(_1) == -1 || indexOf(_2) == -1` test
// is always true) — and sched1OK re-runs (16 = totalTaxDue, then 18 → 24).
// Chain: 17C = 17A + 17B (17B is disabled at init, never written: 0.00) ; 18 = 16 − 17C ; 20 = 18 − 19 ;
//   21D = 21A + 21B + 21C ; 22 = 20 + 21D ; 23B = 21D when "pay penalties" is ticked, else 0.00 ; 23C = 23A + 23B ;
//   24 = 22 − 23C.
// BIR behaviours replicated because they change saved values: the rate engine; item 19 zeroed by amendedRtn_2
// (gate); the "others" manner-of-payment description blanked by changeMannerOfPayment (gate); changeTreaty's reset of
// the treaty list; compute24 ends with capital(), so every text field is upper-cased (upper-case.json "all").
// BIR reload bug NOT replicated (it is BIR mangling BIR's own save, see test/parity.test.ts BIR_DEFECT): with
// Prepayment ticked, the replayed onclick runs dateMonthYear(), which overwrites item 1 with TODAY — and sets the month
// select to selectedIndex getMonth() + 1, i.e. NEXT month (December → no month at all).

import fieldJson from "./fields/2200P.json";
import { formatCurrency, numWithComma } from "./bir-arith.ts";
import { parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2200P:";
type Read = (id: string) => string;
const m = (r: Read, id: string): Centavo => parseMoney(r(`${P}${id}`));
const money = { kind: "money" as const };
/** BIR float `NumWithComma(x)*1` of a cell (BIR's cells default to "0.00"; "" reads as 0 here). */
const n = (r: Read, id: string): number => numWithComma(r(id) === "" ? "0.00" : r(id)) * 1;
const cents = (x: number): Centavo => parseMoney(formatCurrency(x));

/** getStaticATC: the 26 fixed rows' ATC and the hidden hideAppRate<i> value (pesos per unit) BIR multiplies by. */
export const RATE_2200P: Array<[atc: string, rate: number]> = [
  ["XP010", 4.5], ["XP020", 4.5], ["XP030", 0.05], ["XP040", 3.5], ["XP050", 0.05], ["XP060", 4.35], ["XP070", 5.35],
  ["XP080", 4.35], ["XP085", 7.0], ["XP090", 4.35], ["XP100", 0.0], ["XP105", 0.0], ["XP110", 5.35], ["XP120", 3.67],
  ["XP130", 0.0], ["XP131", 3.67], ["XP140", 0.0], ["XP150", 0.0], ["XP160", 0.0], ["XP165", 0.0], ["XP170", 0.56],
  ["XP180", 0.0], ["XP190", 4.5], ["XP200", 2.5], ["XP210", 0.0], ["XP220", 8.0],
];
export const FIXED_ROW = RATE_2200P.map((_, i) => i);
/** The fixed rows' columns, in DOM order. */
const FIXED_COL = ["PlaceOfRemoval", "Locally", "Imported", "TaxRem", "TaxPaid", "Underbond", "Exports", "Others", "Conditional", "BasicTaxDue"];
const fx = (col: string, row: number) => `${P}txt${col}${row}`;

/** The three per-row computes, shared by fixed and added rows (`col` maps a column to its cell id). */
const taxRem = (r: Read, col: (c: string) => string): Centavo => cents(n(r, col("Locally")) + n(r, col("Imported")));
const conditional = (r: Read, col: (c: string) => string): Centavo =>
  cents(n(r, col("TaxPaid")) + n(r, col("Underbond")) + n(r, col("Exports")) + n(r, col("Others")));
/** computeBasicExciseTaxDue: the formatted TaxRem read back, × the rate, through formatCurrency. */
export const basicTaxDue = (removal: Centavo, rate: number): Centavo => cents((removal / 100) * rate);
export const fixedBasicTaxDue = (r: Read, row: number): Centavo => basicTaxDue(taxRem(r, (c) => fx(c, row)), RATE_2200P[row]![1]);

const dyn = (col: string) => `${P}txtsched1${col}`;
const dynBasic = (read: Read): Centavo => basicTaxDue(taxRem(read, dyn), n(read, dyn("AppRate")));

/** The added Schedule 1 rows (index 0 is in the page, 1+ are rebuilt from the saved sched1Chk<i> boxes). */
export const SCHED1_2200P: GroupSpec = {
  name: "sched1",
  first_index: 0,
  row: [
    { id: `${P}sched1Chk`, kind: "checkbox", derive: (_r, v) => (v === "true" ? "true" : "false") },
    { id: dyn("Atc"), kind: "text" },
    { id: dyn("Desc"), kind: "text" },
    { id: dyn("UnitOfMeasure"), kind: "text" },
    { id: dyn("AppRate"), kind: "money" },
    { id: dyn("PlaceOfRemoval"), kind: "text" },
    { id: dyn("Locally"), kind: "money" },
    { id: dyn("Imported"), kind: "money" },
    { id: dyn("TaxRem"), kind: "money", row_compute: (read) => taxRem(read, dyn) },
    ...["TaxPaid", "Underbond", "Exports", "Others"].map((c) => ({ id: dyn(c), kind: "money" as const })),
    { id: dyn("Conditional"), kind: "money", row_compute: (read) => conditional(read, dyn) },
    { id: dyn("BasicTaxDue"), kind: "money", row_compute: dynBasic },
  ],
  // the added rows' share of totalTaxDue (exact centavo sum; BIR adds 2-dp floats, same to the centavo)
  total: { into: `${P}_sched1AddedBasicTaxDue`, of: dyn("BasicTaxDue") },
};

/** totalTaxDue: Σ BasicTaxDue of the fixed and added rows. Item 16 precedes Schedule 1 in the DOM, so both derive
 *  from the row inputs. */
export const totalTaxDue = (r: Read): Centavo =>
  cents(FIXED_ROW.reduce((s, row) => s + fixedBasicTaxDue(r, row) / 100, 0) + m(r, "_sched1AddedBasicTaxDue") / 100);

// createStaticFieldForSched1's rows go where BIR builds them: after txtTax24, before the added-row table
const added = /^frm2200P:(txtsched1[A-Za-z]+|sched1Chk)0$/;
const json = (fieldJson as FieldJson[]).filter((f) => !added.test(f.id));
const at = json.findIndex((f) => f.id === `${P}totalTaxDue`);
const fixedField: FieldJson[] = FIXED_ROW.flatMap((row) => FIXED_COL.map((c) => ({ id: fx(c, row), kind: c === "PlaceOfRemoval" ? ("text" as const) : ("money" as const) })));
const scalarField = [...json.slice(0, at), ...fixedField, ...json.slice(at)];

const fixedOverride: Record<string, Partial<FieldSpec>> = Object.fromEntries(
  FIXED_ROW.flatMap((row) => [
    [fx("PlaceOfRemoval", row), { derive: (r: Read) => (n(r, fx("Locally", row)) !== 0 ? r(`${P}txtPlaceofRem`) : "") }],
    [fx("TaxRem", row), { compute: (r: Read) => taxRem(r, (c) => fx(c, row)) }],
    [fx("Conditional", row), { compute: (r: Read) => conditional(r, (c) => fx(c, row)) }],
    [fx("BasicTaxDue", row), { compute: (r: Read) => fixedBasicTaxDue(r, row) }],
  ]),
);

export const FORM_2200P = buildSchema("2200P", "Excise Tax — Petroleum Products (pre-2020)", scalarField, {
  [`${P}txtForYr`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}taxpayerName`]: { required: true },
  // changeTreaty: "No" disables the list and resets it to its blank first option (value "0")
  [`${P}lstTaxTreaty`]: { derive: (r, v) => (r(`${P}optTreaty_1`) === "true" || v === "" ? v : "0") },
  // changeMannerOfPayment: payment upon actual removal blanks and locks the "others" description
  [`${P}txtOthMannerofPymnt`]: { gate: { when: (r) => r(`${P}chkPymntManner_1`) !== "true" } },
  [`${P}txtTax16`]: { ...money, compute: totalTaxDue },
  [`${P}txtTax17A`]: money,
  [`${P}txtTax17B`]: { ...money, compute: () => 0 },
  [`${P}txtTax17C`]: { ...money, compute: (r) => m(r, "txtTax17A") + m(r, "txtTax17B") },
  [`${P}txtTax18`]: { ...money, compute: (r) => m(r, "txtTax16") - m(r, "txtTax17C") },
  // amendedRtn_2's onclick (replayed on reload) zeroes item 19
  [`${P}txtTax19`]: { ...money, gate: { on: `${P}amendedRtn_1`, equals: "true" } },
  [`${P}txtTax20`]: { ...money, compute: (r) => m(r, "txtTax18") - m(r, "txtTax19") },
  [`${P}txtTax21A`]: money,
  [`${P}txtTax21B`]: money,
  [`${P}txtTax21C`]: money,
  [`${P}txtTax21D`]: { ...money, compute: (r) => m(r, "txtTax21A") + m(r, "txtTax21B") + m(r, "txtTax21C") },
  [`${P}txtTax22`]: { ...money, compute: (r) => m(r, "txtTax20") + m(r, "txtTax21D") },
  [`${P}txtTax23A`]: money,
  [`${P}txtTax23B`]: { ...money, compute: (r) => (r(`${P}PayPenalties`) === "true" ? m(r, "txtTax21D") : 0) },
  [`${P}txtTax23C`]: { ...money, compute: (r) => m(r, "txtTax23A") + m(r, "txtTax23B") },
  [`${P}txtTax24`]: { ...money, compute: (r) => m(r, "txtTax22") - m(r, "txtTax23C") },
  ...fixedOverride,
  [`${P}totalTaxDue`]: { ...money, compute: totalTaxDue },
});
FORM_2200P.group = [SCHED1_2200P];

export function validate2200P(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2200P, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  // isValidDataOnSched1: an added row's ATC must start with XP; rows after the first also need an ATC and a rate
  (groups.sched1 ?? []).forEach((row: GroupRow, i) => {
    const atc = (row[dyn("Atc")] ?? "").trim();
    if (atc === "" && i > 0) problem.push({ id: `${dyn("Atc")}${i}`, message: `Enter a valid ATC in Schedule 1 row ${i + 1}.` });
    else if (atc !== "" && atc.toUpperCase().slice(0, 2) !== "XP") problem.push({ id: `${dyn("Atc")}${i}`, message: "The supplied ATC code should start with 'XP'." });
    else if (i > 0 && parseMoney(row[dyn("AppRate")] ?? "") === 0) problem.push({ id: `${dyn("AppRate")}${i}`, message: `Enter a valid applicable rate in Schedule 1 row ${i + 1}.` });
  });
  return problem;
}
