// BIR Form 2200-M (Excise Tax Return for Mineral Products, superseded by 2200Mv2018), P3. One page (items 1–25) plus
// the Schedule 1 pop-up (#modalSched1, opened by btnSched1 only when item 13 = "payment upon actual removal"):
//   • Six fixed product rows, columns A/B volume (taxable/exempt), C/D provisional value, E provisional rate, F
//     provisional tax, G/H final value, I final rate, J final tax, K adjustment, L = F + J + K. BIR hard-codes the
//     per-commodity rate engine row by row (computeJ / computeF), NumWithComma floats through formatCurrency:
//       row 1 XM010 coal & coke (P10.00/MT)  J1 = A1 × 10            (F1 never computed)
//       row 2 XM020 non-metallic (2%)       J2 = G2 × 0.02          (F2 never computed)
//       row 3 XM030 copper (2%)             F3 = C3 × 0.02          (J3 never computed)
//       row 4 XM040 gold & chromite (2%)    F4 = C4 × 0.02          (J4 never computed)
//       row 5 XM050 petroleum (3%)          F5 = C5 × 0.03          (J5 never computed)
//       row 6 XM051 natural gas (0%)        no rate compute: L6 = K6
//     F and J are disabled, so a column BIR never computes stays 0.00. getPlaceToSched1 copies item 12's place of
//     removal into a row's Place of Extraction when its column A is non-zero ("" otherwise).
//   • Added rows (frm2200M:txtsched1*<i>, index 0 in the page, 1+ by addFieldsForSched1): typed ATC (XM…), description,
//     place, A–D, rates E / I; F = C × E ÷ 100, J = G × I ÷ 100 (computeFDynamic / computeJDynamic), L = F + J + K.
//   • computeTotalTaxDueSched1: totalTaxDue = Σ L over the six fixed and every added row; sched1OK copies it to item 17.
// Reload: loadXML adds one row per saved `frm2200M:sched1Chk<i>` whose first index digit is non-zero (rows 1+), then
// loadData refills by id and sched1OK re-runs (17 = totalTaxDue, then 19 → 25).
// Chain: 18C = 18A + 18B (18B is disabled, never written: 0.00) ; 19 = 17 − 18C ; 21 = 19 − 20 ; 22D = 22A+22B+22C ;
//   23 = 21 + 22D ; 24B = 22D when "pay penalties" is ticked, else 0.00 ; 24C = 24A + 24B ; 25 = 23 − 24C.
// BIR behaviours replicated because they change saved values: the row-by-row rate engine above (including the columns
// it never computes and row 6's missing 0% compute); item 20 zeroed by amendedRtn_2's onclick (gate); item 13's
// "others" description blanked by changeMannerOfPayment (gate); changeTreaty resets the treaty list to its blank entry;
// compute25 ends with capital(), so every text field is upper-cased (upper-case.json "all").
// Not modelled: choosing Prepayment (chkPymntManner_2) resets the return date to TODAY and locks it — a date-dependent
// UI coercion, not a compute; the native form keeps the date the filer typed.

import fieldJson from "./fields/2200M.json";
import { formatCurrency, numWithComma } from "./bir-arith.ts";
import { parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2200M:";
type Read = (id: string) => string;
const m = (r: Read, id: string): Centavo => parseMoney(r(`${P}${id}`));
const money = { kind: "money" as const };
/** BIR float `NumWithComma(x)*1` of a cell; "" reads as NaN like BIR (formatCurrency(NaN) → 0.00). */
const n = (r: Read, id: string): number => numWithComma(r(id) === "" ? "0.00" : r(id)) * 1;
/** formatCurrency(float) as a Centavo. */
const cents = (x: number): Centavo => parseMoney(formatCurrency(x));

export const FIXED_ROW = [1, 2, 3, 4, 5, 6];
export const FIXED_ATC = ["XM010", "XM020", "XM030", "XM040", "XM050", "XM051"];
const fx = (col: string, row: number) => `${P}txt${col}${row}`;

/** The fixed rows' rate engine (computeJ / computeF): the provisional tax F and final tax J BIR writes per row. */
export function fixedF(r: Read, row: number): Centavo {
  if (row === 3 || row === 4) return cents(n(r, fx("C", row)) * 0.02);
  if (row === 5) return cents(n(r, fx("C", row)) * 0.03);
  return 0;
}
export function fixedJ(r: Read, row: number): Centavo {
  if (row === 1) return cents(n(r, fx("A", row)) * 10);
  if (row === 2) return cents(n(r, fx("G", row)) * 0.02);
  return 0;
}
/** computeL: L = F + J + K (the formatted F / J read back, float sum, formatCurrency). */
export const fixedL = (r: Read, row: number): Centavo => cents(fixedF(r, row) / 100 + fixedJ(r, row) / 100 + n(r, fx("K", row)));

const dyn = (col: string) => `${P}txtsched1${col}`;
/** computeFDynamic / computeJDynamic: `C × E` then ÷ 100 (and G × I ÷ 100), floats through formatCurrency. */
export const dynamicTax = (base: number, rate: number): Centavo => cents((base * rate) / 100);
const dynF = (read: Read): Centavo => dynamicTax(n(read, dyn("C")), n(read, dyn("E")));
const dynJ = (read: Read): Centavo => dynamicTax(n(read, dyn("G")), n(read, dyn("I")));

/** The added Schedule 1 rows (index 0 is in the page, 1+ are rebuilt from the saved sched1Chk<i> boxes). */
export const SCHED1_2200M: GroupSpec = {
  name: "sched1",
  first_index: 0,
  row: [
    { id: `${P}sched1Chk`, kind: "checkbox", derive: (_r, v) => (v === "true" ? "true" : "false") },
    { id: dyn("Atc"), kind: "text" },
    { id: dyn("Desc"), kind: "text" },
    { id: dyn("PlaceOfExtract"), kind: "text" },
    ...["A", "B", "C", "D", "E"].map((c) => ({ id: dyn(c), kind: "money" as const })),
    { id: dyn("F"), kind: "money", row_compute: dynF },
    ...["G", "H", "I"].map((c) => ({ id: dyn(c), kind: "money" as const })),
    { id: dyn("J"), kind: "money", row_compute: dynJ },
    { id: dyn("K"), kind: "money" },
    { id: dyn("L"), kind: "money", row_compute: (read) => cents(dynF(read) / 100 + dynJ(read) / 100 + n(read, dyn("K"))) },
  ],
  // the added rows' share of computeTotalTaxDueSched1 (exact centavo sum; BIR adds 2-dp floats, same to the centavo)
  total: { into: `${P}_sched1AddedL`, of: dyn("L") },
};

/** computeTotalTaxDueSched1: Σ L1..L6 + Σ added-row L. totalTaxDue sits AFTER item 17 in the DOM, so 17 and the
 *  total both derive from the row inputs. */
export const totalTaxDue = (r: Read): Centavo => cents(FIXED_ROW.reduce((s, row) => s + fixedL(r, row) / 100, 0) + m(r, "_sched1AddedL") / 100);

const fixedOverride: Record<string, Partial<FieldSpec>> = Object.fromEntries(
  FIXED_ROW.flatMap((row) => [
    // getPlaceToSched1: the row's place of extraction is item 12's place of removal while column A is non-zero
    [`${P}txtPlaceOfExtract${row}`, { derive: (r: Read) => (n(r, fx("A", row)) !== 0 ? r(`${P}txtPlaceofRem`) : "") }],
    ...["A", "B", "C", "D", "G", "H", "K"].map((c) => [fx(c, row), money]),
    [fx("F", row), { ...money, compute: (r: Read) => fixedF(r, row) }],
    [fx("J", row), { ...money, compute: (r: Read) => fixedJ(r, row) }],
    [fx("L", row), { ...money, compute: (r: Read) => fixedL(r, row) }],
  ]),
);

// row 0 of the added-row table is in the page, but it is a schedule row: the group owns it, not a scalar field
const scalarField = (fieldJson as FieldJson[]).filter((f) => !/^frm2200M:(txtsched1[A-Za-z]+|sched1Chk)0$/.test(f.id));

export const FORM_2200M = buildSchema("2200M", "Excise Tax — Mineral Products (pre-2018)", scalarField, {
  [`${P}txtForYr`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  // changeTreaty: "No" disables the list and resets it to its blank first option (value "0")
  [`${P}lstTaxTreaty`]: { derive: (r, v) => (r(`${P}optTreaty_1`) === "true" || v === "" ? v : "0") },
  // changeMannerOfPayment: payment upon actual removal blanks and locks the "others" description
  [`${P}txtOthMannerofPymnt`]: { gate: { when: (r) => r(`${P}chkPymntManner_1`) !== "true" } },
  // sched1OK: item 17 = Schedule 1's total tax due
  [`${P}txtTax17`]: { ...money, compute: totalTaxDue },
  [`${P}txtTax18A`]: money,
  [`${P}txtTax18B`]: { ...money, compute: () => 0 },
  [`${P}txtTax18C`]: { ...money, compute: (r) => m(r, "txtTax18A") + m(r, "txtTax18B") },
  [`${P}txtTax19`]: { ...money, compute: (r) => m(r, "txtTax17") - m(r, "txtTax18C") },
  // amendedRtn_2's onclick zeroes item 20 (and init leaves it disabled)
  [`${P}txtTax20`]: { ...money, gate: { on: `${P}amendedRtn_1`, equals: "true" } },
  [`${P}txtTax21`]: { ...money, compute: (r) => m(r, "txtTax19") - m(r, "txtTax20") },
  [`${P}txtTax22A`]: money,
  [`${P}txtTax22B`]: money,
  [`${P}txtTax22C`]: money,
  [`${P}txtTax22D`]: { ...money, compute: (r) => m(r, "txtTax22A") + m(r, "txtTax22B") + m(r, "txtTax22C") },
  [`${P}txtTax23`]: { ...money, compute: (r) => m(r, "txtTax21") + m(r, "txtTax22D") },
  [`${P}txtTax24A`]: money,
  [`${P}txtTax24B`]: { ...money, compute: (r) => (r(`${P}PayPenalties`) === "true" ? m(r, "txtTax22D") : 0) },
  [`${P}txtTax24C`]: { ...money, compute: (r) => m(r, "txtTax24A") + m(r, "txtTax24B") },
  [`${P}txtTax25`]: { ...money, compute: (r) => m(r, "txtTax23") - m(r, "txtTax24C") },
  ...fixedOverride,
  [`${P}totalTaxDue`]: { ...money, compute: totalTaxDue },
});
FORM_2200M.group = [SCHED1_2200M];

export function validate2200M(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2200M, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  // isValidDataOnSched1: an added row's ATC must start with XM; rows after the first also need ATC and description
  (groups.sched1 ?? []).forEach((row: GroupRow, i) => {
    const atc = (row[dyn("Atc")] ?? "").trim();
    if (atc === "" && i > 0) problem.push({ id: `${dyn("Atc")}${i}`, message: `Enter a valid ATC in Schedule 1 row ${i + 1}.` });
    else if (atc !== "" && atc.toUpperCase().slice(0, 2) !== "XM") problem.push({ id: `${dyn("Atc")}${i}`, message: "The supplied ATC code should start with 'XM'." });
    else if (i > 0 && !(row[dyn("Desc")] ?? "").trim()) problem.push({ id: `${dyn("Desc")}${i}`, message: `Enter a description in Schedule 1 row ${i + 1}.` });
  });
  return problem;
}
