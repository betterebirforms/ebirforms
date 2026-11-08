// BIR Form 1700v2018 — Annual Income Tax Return for Individuals with Purely Compensation Income (TRAIN). P3.
// Two columns A=taxpayer / B=spouse; each column's taxpayer-type radio picks its Part V path:
//   E (graduated)  → 42 = Schedule-1 item 5c; 44 = 42−43; 46 = 44+45; 47 = graduated(46); 26 = 47
//   N (25% flat)   → 48 = item 5d; 50 = 48−49; 52 = 50+51; 53 = 52×25%; 26 = 53
//   54 = item 5e; 58 = 54+55+56+57 (→ 27); 59 = (47|53) − 58 (→ 28). Then 29 (tax withheld in a previous
//   return, zeroed by three validations), 30 = 28 − 29, 34 = 31+32+33, 35 = 30±34 netting, 36 = 35A+35B.
// Every figure is WHOLE PESOS: BIR runs each result through `.toFixed(0)` (round half away from zero) before
// formatCurrency — except 59, whose cents are cut only by 28's `.toFixed(0)`.
//
// The graduated table (computeTaxDue) is YEAR-DEPENDENT, verbatim per band: 2023+ (15/20/25/30/35% with
// 22500/102500/402500/2202500 stops) and 2018–2022 (20/25/30/32/35% with 30000/130000/490000/2410000). An
// out-of-range year ("" reads as 0) makes computeTaxDue return 0, so item 47 is "0.00".
//
// What BIR's reload (enableAllControlAfterLoad and friends) does to a saved return, and so what a native save
// must already hold:
//   processTaxpayerType — A-type N zeroes Part V.A (42A..47A) and item 29A; A-type E zeroes Part V.B (48A..53A).
//   processSpouseTaxpayerType (married + spouse income + joint only) — the same for B, and zeroes 29B on N.
//   enabledContinuationOfSchedule1 (items 1..4) — zeroes every REG cell when no E radio is checked anywhere and
//     every CIFR cell when no N radio is; with Part VI pop-up rows it also rewrites item 4 to "OTHERS" with an
//     empty TIN (setUpSchedule1TableModal) and unchecks the item-4 Spouse box when Taxpayer is ticked.
//   computeSched1I5 (on any Schedule-1 blur or type-radio toggle) — copies the pop-up Subtotals into item 4's
//     C/D/E and computes item 5. It runs at reload under a checked type radio, and in the harness whenever a
//     Schedule-1 cell is enabled — which needs a complete employer TIN (3+3+3 and ≥3 chars).
//   validatePg1I28 / computePg1I30 — 29 is zeroed when 26 > 0 and 28 ≤ 0, when 29 > 26×50%, and when
//     27 ≠ 0 and 26×50% > 29 > 28.
// BIR column quirks kept verbatim: 44A rounds the SUBTRAHEND (`.toFixed(0)` inside the subtraction) while 44B
// rounds the difference; 30 rounds the 29 term on both columns.
import fieldJson from "./fields/1700v2018.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupAgg, type GroupRow, type GroupSpec, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1700:";
type Read = (id: string) => string;

/** BIR's NumWithComma: parseFloat with commas stripped — but a value that == 0 ("" and "0.00" do) skips the
 *  strip, so "" parses as NaN and formatCurrency renders it "0.00". */
const nwc = (s: string): number => (Number(s) === 0 ? parseFloat(s) : parseFloat(s.replace(/,/g, "")));
/** BIR's formatCurrency: round half away from zero to 2 dp, comma-grouped, "-" sign. */
const cur = (pesos: number): string => {
  if (Number.isNaN(pesos)) return "0.00";
  const sign = pesos < 0 ? "-" : "";
  const abs = Math.floor(Math.abs(pesos) * 100 + 0.50000000001);
  return `${sign}${Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(abs % 100).toString().padStart(2, "0")}`;
};
/** BIR's `.toFixed(0)`: round half away from zero to a whole peso. */
const fix0 = (pesos: number): number => Number(pesos.toFixed(0));
const on = (r: Read, id: string): boolean => r(`${P}${id}`) === "true";
/** BIR's money inputs never hold "": the markup default is "0.00" and round(this,2) rewrites a cleared box. */
const m = (r: Read, id: string): string => r(id) || "0.00";
const spouseJoint = (r: Read): boolean =>
  on(r, "rdoPg1I15CivilStatusM") && on(r, "rdoPg1I16SpouseHasIncomeY") && on(r, "rdoPg1I17FilingStatusJ");

// computeTaxDue, verbatim per year band; the .toFixed(2) strings are kept (I47 re-rounds them to whole pesos)
const taxDue = (income: number, year: string): number | string => {
  const yr = Number(year);
  if (yr >= 2023) {
    if (income >= 8000000) return ((income - 8000000) * (35 / 100) + 2202500).toFixed(2);
    if (income >= 2000000) return ((income - 2000000) * (30 / 100) + 402500).toFixed(2);
    if (income >= 800000) return ((income - 800000) * (25 / 100) + 102500).toFixed(2);
    if (income >= 400000) return ((income - 400000) * (20 / 100) + 22500).toFixed(2);
    if (income >= 250000) return ((income - 250000) * (15 / 100)).toFixed(2);
    return 0;
  }
  if (yr >= 2018 && yr <= 2022) {
    if (income >= 8000000) return ((income - 8000000) * (35 / 100) + 2410000).toFixed(2);
    if (income >= 2000000) return ((income - 2000000) * (32 / 100) + 490000).toFixed(2);
    if (income >= 800000) return ((income - 800000) * (30 / 100) + 130000).toFixed(2);
    if (income >= 400000) return ((income - 400000) * (25 / 100) + 30000).toFixed(2);
    if (income >= 250000) return ((income - 250000) * (20 / 100)).toFixed(2);
    return 0;
  }
  return 0;
};

// an employer row's TIN is complete when BIR's enabledContinuationOfSchedule1 says so (3+3+3 and ≥3 chars)
const tinOk = (r: Read, n: number): boolean =>
  [1, 2, 3].every((t) => r(`${P}txtPg2I${n}PartVIEmployerTIN${t}`).length === 3) && r(`${P}txtPg2I${n}PartVIEmployerBranchCode`).length >= 3;

/** computePg1I35's netting: a positive 30 absorbs 34; a negative 30 with credits yields 34 alone. */
const payable = (i30: string, i34: string): string => {
  if (nwc(i30) >= 0) return cur(nwc(i30) + nwc(i34));
  if (nwc(i34) === 0) return cur(nwc(i30));
  return cur(nwc(i34));
};

/** BIR's whole chain, from the raw inputs and the injected Schedule-1 item-5 strings (`_i5*`), as the strings
 *  BIR leaves in each field. Reads only raw inputs — safe to call from any field's compute, in any order. */
export function chain1700v2018(r: Read): Record<string, string> {
  const eA = on(r, "rdoPg1I6TaxpayerTypeE");
  const nA = on(r, "rdoPg1I6TaxpayerTypeN");
  const eB = on(r, "rdoPg1I20SpouseTaxpayerTypeE");
  const nB = on(r, "rdoPg1I20SpouseTaxpayerTypeN");
  const joint = spouseJoint(r);
  const year = r(`${P}txtPg1I1Year`);

  // Part V.A — the E path (43A's blur runs it whenever N is not checked; BIR's reload zeroes it under N)
  const i42A = eA ? r("_i5Ac") : "0.00";
  const i44A = !nA ? cur(nwc(i42A) - fix0(nwc(m(r, `${P}txtPg2I43A`)))) : "0.00"; // 44A rounds the subtrahend
  const i46A = !nA ? cur(fix0(nwc(i44A) + nwc(m(r, `${P}txtPg2I45A`)))) : "0.00";
  const i47A = !nA ? cur(fix0(nwc(String(taxDue(nwc(i46A), year))))) : "0.00";
  // Part V.B — the N path (49A's blur runs it whenever E is not checked; E zeroes it)
  const i48A = !eA ? r("_i5Ad") : "0.00";
  const i50A = !eA ? cur(fix0(nwc(i48A) - nwc(m(r, `${P}txtPg2I49A`)))) : "0.00";
  const i52A = !eA ? cur(fix0(nwc(i50A) + nwc(m(r, `${P}txtPg2I51A`)))) : "0.00";
  const i53A = !eA ? cur(fix0(nwc(i52A) * (25 / 100))) : "0.00";
  // computePg2I47 writes 26A = 47A, computePg2I53 writes 26A = 53A — the VB path runs last in the DOM
  const i26A = eA ? cur(fix0(nwc(i47A))) : cur(fix0(nwc(i53A)));
  const i54A = r("_i5Ae");
  const i58A = cur(fix0(nwc(i54A) + nwc(m(r, `${P}txtPg2I55A`)) + nwc(m(r, `${P}txtPg2I56A`)) + nwc(m(r, `${P}txtPg2I57A`))));
  const i27A = cur(fix0(nwc(i58A)));
  const i59A = cur(nwc(eA ? i47A : i53A) - nwc(i58A));
  const i28A = cur(fix0(nwc(i59A)));
  // item 29: processTaxpayerType zeroes it under N, then validatePg1I28 (26 > 0 and 28 ≤ 0), validatePg1I26
  // (29 > 26×50%) and computePg1I30's item-27 check (26×50% > 29 > 28 while 27 ≠ 0), each reading the current 29
  let i29A = nA ? "0.00" : m(r, `${P}txtPg1I29A`);
  if (nwc(i26A) > 0 && nwc(i28A) <= 0) i29A = "0.00";
  if (nwc(i26A) * 0.5 < nwc(i29A)) i29A = "0.00";
  if (nwc(i27A) !== 0 && nwc(i26A) * 0.5 > nwc(i29A) && nwc(i29A) > nwc(i28A) && nwc(i29A) !== 0) i29A = "0.00";
  const i30A = cur(nwc(i28A) - fix0(nwc(i29A))); // 30 rounds the 29 term (misplaced .toFixed(0), both columns)
  const i34A = cur(fix0(nwc(m(r, `${P}txtPg1I31A`)) + nwc(m(r, `${P}txtPg1I32A`)) + nwc(m(r, `${P}txtPg1I33A`))));
  const i35A = payable(i30A, i34A);

  // Spouse — the B zeroings fire at reload only for a married + spouse-income + joint return
  const vaB = !(joint && nB);
  const vbB = !(joint && eB);
  const i42B = eB ? r("_i5Bc") : "0.00";
  const i44B = vaB ? cur(fix0(nwc(i42B) - nwc(m(r, `${P}txtPg2I43B`)))) : "0.00"; // 44B rounds the difference
  const i46B = vaB ? cur(fix0(nwc(i44B) + nwc(m(r, `${P}txtPg2I45B`)))) : "0.00";
  const i47B = vaB ? cur(fix0(nwc(String(taxDue(nwc(i46B), year))))) : "0.00";
  const i48B = nB ? r("_i5Bd") : "0.00";
  const i50B = vbB ? cur(fix0(nwc(i48B) - nwc(m(r, `${P}txtPg2I49B`)))) : "0.00";
  const i52B = vbB ? cur(fix0(nwc(i50B) + nwc(m(r, `${P}txtPg2I51B`)))) : "0.00";
  const i53B = vbB ? cur(fix0(nwc(i52B) * (25 / 100))) : "0.00";
  const i26B = joint && eB ? cur(fix0(nwc(i47B))) : cur(fix0(nwc(i53B)));
  const i54B = r("_i5Be");
  const i58B = cur(fix0(nwc(i54B) + nwc(m(r, `${P}txtPg2I55B`)) + nwc(m(r, `${P}txtPg2I56B`)) + nwc(m(r, `${P}txtPg2I57B`))));
  const i27B = cur(fix0(nwc(i58B)));
  const i59B = cur(nwc(eB ? i47B : i53B) - nwc(i58B));
  const i28B = cur(fix0(nwc(i59B)));
  let i29B = joint && nB ? "0.00" : m(r, `${P}txtPg1I29B`);
  if (nwc(i26B) > 0 && nwc(i28B) <= 0) i29B = "0.00";
  if (nwc(i26B) * 0.5 < nwc(i29B)) i29B = "0.00";
  if (nwc(i27B) !== 0 && nwc(i26B) * 0.5 > nwc(i29B) && nwc(i29B) > nwc(i28B) && nwc(i29B) !== 0) i29B = "0.00";
  const i30B = cur(nwc(i28B) - fix0(nwc(i29B)));
  const i34B = cur(fix0(nwc(m(r, `${P}txtPg1I31B`)) + nwc(m(r, `${P}txtPg1I32B`)) + nwc(m(r, `${P}txtPg1I33B`))));
  const i35B = payable(i30B, i34B);
  const i36 = cur(nwc(i35A) + nwc(i35B));

  return {
    i26A, i27A, i28A, i29A, i30A, i34A, i35A, i42A, i44A, i46A, i47A, i48A, i50A, i52A, i53A, i54A, i58A, i59A,
    i26B, i27B, i28B, i29B, i30B, i34B, i35B, i42B, i44B, i46B, i47B, i48B, i50B, i52B, i53B, i54B, i58B, i59B, i36,
  };
}

// Part VI "add more" employers pop-up: row 1 holds the original item-4 entry; BIR reconstructs the rows on
// reload purely from the saved keys (loadData calls addRow_schedule1 for each id it cannot find), so there is
// no size record. Employer cells first, then the money cells — one group emits the same key set.
const MORE = "{i}";
const SCHED_CELL = { c: "REG", d: "CIFR", e: "TW" } as const;
const cell = (col: "c" | "d" | "e", n: number | string): string => `${P}txtPg2ISched1${col}_${n}${SCHED_CELL[col]}`;
// the pop-up money cells carry the item number AND the row index: txtPg2ISched1c_4_{i}REG
const moreCell = (col: "c" | "d" | "e"): string => `${P}txtPg2ISched1${col}_4_${MORE}${SCHED_CELL[col]}`;
const sched1more: GroupSpec = {
  name: "sched1more",
  row: [
    { id: `${P}rdoPg2I4_${MORE}PartVIEmployeeT`, kind: "checkbox" },
    { id: `${P}rdoPg2I4_${MORE}PartVIEmployeeS`, kind: "checkbox" },
    { id: `${P}txtPg2I4_${MORE}PartVIEmployerName1`, kind: "text" },
    { id: `${P}txtPg2I4_${MORE}PartVIEmployerName2`, kind: "text" },
    { id: `${P}txtPg2I4_${MORE}PartVIEmployerTIN1`, kind: "text" },
    { id: `${P}txtPg2I4_${MORE}PartVIEmployerTIN2`, kind: "text" },
    { id: `${P}txtPg2I4_${MORE}PartVIEmployerTIN3`, kind: "text" },
    { id: `${P}txtPg2I4_${MORE}PartVIEmployerBranchCode`, kind: "text" },
    { id: moreCell("c"), kind: "money" },
    { id: moreCell("d"), kind: "money" },
    { id: moreCell("e"), kind: "money" },
  ],
  first_index: 1,
};

/** computeSched1I5's item-5 buckets: items 1–3 by their Taxpayer box (unchecked → spouse), item 4 from the
 *  pop-up rows or the main item-4 cells. BIR adds NumWithComma floats in this order. The cells it reads are the
 *  ones enabledContinuationOfSchedule1 left on the page — the REG column zeroed without an E radio and the CIFR
 *  column without an N radio — so the aggregates sum the zeroed values, not the raw saved ones. */
const bucket = (r: Read, rows: GroupRow[], col: "c" | "d" | "e"): { t: number; s: number } => {
  const { eAny, nAny } = zeroing(r);
  const live = (v: string) => nwc(col === "c" ? (eAny ? v : "0.00") : col === "d" ? (nAny ? v : "0.00") : v);
  let t = 0;
  let s = 0;
  for (const n of [1, 2, 3]) {
    const v = live(m(r, cell(col, n)));
    if (on(r, `rdoPg2I${n}PartVIEmployeeT`)) t += v;
    else s += v;
  }
  if (rows.length > 0) {
    for (const row of rows) {
      const v = live(row[moreCell(col)] ?? "0.00");
      if (row[`${P}rdoPg2I4_${MORE}PartVIEmployeeT`] === "true") t += v;
      else s += v;
    }
  } else {
    const v = live(m(r, cell(col, 4)));
    if (on(r, "rdoPg2I4PartVIEmployeeT")) t += v;
    else s += v;
  }
  return { t, s };
};

// injected into scalar state before computeAll: the pop-up Subtotals ("" keeps BIR's "0" template default),
// the item-5 whole-peso strings, and a rows-present flag for the item-4 derives
const agg = (into: string, sum: (rows: GroupRow[], r: Read) => string): GroupAgg => ({ into, of: "", sum: (rows, form) => sum(rows, (id) => form[id] ?? "") });
const total: GroupAgg[] = [
  agg("_hasRows", (rows) => (rows.length > 0 ? "1" : "")),
  ...(["c", "d", "e"] as const).map((col) => agg(`_sub${col.toUpperCase()}`, (rows) => (rows.length > 0 ? cur(rows.reduce((t, row) => t + nwc(row[moreCell(col)] ?? "0.00"), 0)) : ""))),
  ...(["c", "d", "e"] as const).flatMap((col) => [
    agg(`_i5A${col}`, (rows, r) => cur(fix0(bucket(r, rows, col).t))),
    agg(`_i5B${col}`, (rows, r) => cur(fix0(bucket(r, rows, col).s))),
  ]),
];

const money = { kind: "money" as const };
const pesos = (s: string | undefined): number => parseMoney(s ?? "0.00");
const chainField = (key: string) => ({ ...money, compute: (r: Read) => pesos(chain1700v2018(r)[key]) });

const spouseZeroN = (r: Read): boolean => spouseJoint(r) && on(r, "rdoPg1I20SpouseTaxpayerTypeN");
const spouseZeroE = (r: Read): boolean => spouseJoint(r) && on(r, "rdoPg1I20SpouseTaxpayerTypeE");
// computeSched1I5 ran whenever the type radios or a complete employer TIN could trigger it
const sched1Ran = (r: Read): boolean =>
  on(r, "rdoPg1I6TaxpayerTypeE") || (spouseJoint(r) && (on(r, "rdoPg1I20SpouseTaxpayerTypeE") || on(r, "rdoPg1I20SpouseTaxpayerTypeN"))) ||
  tinOk(r, 1) || tinOk(r, 2) || tinOk(r, 3);
const zeroing = (r: Read) => ({
  eAny: on(r, "rdoPg1I6TaxpayerTypeE") || on(r, "rdoPg1I20SpouseTaxpayerTypeE"),
  nAny: on(r, "rdoPg1I6TaxpayerTypeN") || on(r, "rdoPg1I20SpouseTaxpayerTypeN"),
});

const override: Record<string, Partial<FieldSpec>> = {};
// the whole-chain fields
for (const [key, id] of [
  ["i26A", "txtPg1I26A"], ["i27A", "txtPg1I27A"], ["i28A", "txtPg1I28A"], ["i29A", "txtPg1I29A"],
  ["i30A", "txtPg1I30A"], ["i34A", "txtPg1I34A"], ["i35A", "txtPg1I35A"], ["i36", "txtPg1I36"],
  ["i42A", "txtPg2I42A"], ["i44A", "txtPg2I44A"], ["i46A", "txtPg2I46A"], ["i47A", "txtPg2I47A"],
  ["i48A", "txtPg2I48A"], ["i50A", "txtPg2I50A"], ["i52A", "txtPg2I52A"], ["i53A", "txtPg2I53A"],
  ["i54A", "txtPg2I54A"], ["i58A", "txtPg2I58A"], ["i59A", "txtPg2I59A"],
  ["i26B", "txtPg1I26B"], ["i27B", "txtPg1I27B"], ["i28B", "txtPg1I28B"], ["i29B", "txtPg1I29B"],
  ["i30B", "txtPg1I30B"], ["i34B", "txtPg1I34B"], ["i35B", "txtPg1I35B"],
  ["i42B", "txtPg2I42B"], ["i44B", "txtPg2I44B"], ["i46B", "txtPg2I46B"], ["i47B", "txtPg2I47B"],
  ["i48B", "txtPg2I48B"], ["i50B", "txtPg2I50B"], ["i52B", "txtPg2I52B"], ["i53B", "txtPg2I53B"],
  ["i54B", "txtPg2I54B"], ["i58B", "txtPg2I58B"], ["i59B", "txtPg2I59B"],
] as const) {
  override[`${P}${id}`] = chainField(key);
}
// computed Schedule-1 item 5
const ITEM5 = { A: { c: "c_5AREG", d: "d_5ACIFR", e: "e_5ATW" }, B: { c: "c_5BREG", d: "d_5BCIFR", e: "e_5BTW" } } as const;
for (const side of ["A", "B"] as const)
  for (const col of ["c", "d", "e"] as const)
    override[`${P}txtPg2ISched1${ITEM5[side][col]}`] = { ...money, compute: (r: Read) => pesos(r(`_i5${side}${col}`)) };
// Part VI pop-up Subtotals: rows → the formatted sum; no rows → BIR's blank-save default ("0", not "0.00")
for (const col of ["C", "D", "E"] as const)
  override[`${P}txtPg2Pt6I4Subtotal${col}`] = { derive: (r, v) => (r(`_sub${col}`) !== "" ? r(`_sub${col}`) : v) };

// reload zeroings on the Schedule-1 input cells (enabledContinuationOfSchedule1, items 1..4)
for (const n of [1, 2, 3, 4]) {
  override[cell("c", n)] = { ...money, derive: (r, v) => (zeroing(r).eAny ? v : "0.00") };
  override[cell("d", n)] = { ...money, derive: (r, v) => (zeroing(r).nAny ? v : "0.00") };
}
// item 4 with pop-up rows: the Subtotal copies stand whenever computeSched1I5 ran (a checked radio, or the
// harness sweeping an enabled cell — which needs a complete TIN); C/D fall back to their radio zeroings
override[cell("c", 4)] = {
  ...money,
  derive: (r, v) => (r("_hasRows") ? (zeroing(r).eAny || sched1Ran(r) ? r("_subC") : "0.00") : zeroing(r).eAny ? v : "0.00"),
};
override[cell("d", 4)] = {
  ...money,
  derive: (r, v) => (r("_hasRows") ? (zeroing(r).nAny || sched1Ran(r) ? r("_subD") : "0.00") : zeroing(r).nAny ? v : "0.00"),
};
override[cell("e", 4)] = { ...money, derive: (r, v) => (r("_hasRows") && sched1Ran(r) ? r("_subE") : v) };
override[`${P}rdoPg2I4PartVIEmployeeS`] = { derive: (r, v) => (r("_hasRows") && on(r, "rdoPg2I4PartVIEmployeeT") ? "false" : v) };
for (const [id, value] of [
  ["txtPg2I4PartVIEmployerName1", "OTHERS"],
  ["txtPg2I4PartVIEmployerName2", ""], ["txtPg2I4PartVIEmployerTIN1", ""], ["txtPg2I4PartVIEmployerTIN2", ""],
  ["txtPg2I4PartVIEmployerTIN3", ""], ["txtPg2I4PartVIEmployerBranchCode", ""],
] as const) {
  override[`${P}${id}`] = { derive: (r, v) => (r("_hasRows") ? value : v) };
}

// Part V.A/B inputs their type toggle zeroes; the shared descriptions follow both columns' toggles
for (const [ids, zero] of [
  [["txtPg2I43A", "txtPg2I45A"], (r: Read) => on(r, "rdoPg1I6TaxpayerTypeN")],
  [["txtPg2I43B", "txtPg2I45B"], spouseZeroN],
  [["txtPg2I49A", "txtPg2I51A"], (r: Read) => on(r, "rdoPg1I6TaxpayerTypeE")],
  [["txtPg2I49B", "txtPg2I51B"], spouseZeroE],
] as const) {
  for (const id of ids) override[`${P}${id}`] = { ...money, derive: (r, v) => (zero(r) ? "0.00" : v) };
}
const keep45 = (r: Read): boolean =>
  !((on(r, "rdoPg1I6TaxpayerTypeN") && !on(r, "rdoPg1I20SpouseTaxpayerTypeE")) ||
    (spouseJoint(r) && on(r, "rdoPg1I20SpouseTaxpayerTypeN") && !on(r, "rdoPg1I6TaxpayerTypeE")));
const keep49 = (r: Read): boolean =>
  !((on(r, "rdoPg1I6TaxpayerTypeE") && !on(r, "rdoPg1I20SpouseTaxpayerTypeN")) ||
    (spouseJoint(r) && on(r, "rdoPg1I20SpouseTaxpayerTypeE") && !on(r, "rdoPg1I6TaxpayerTypeN")));
override[`${P}txtPg2I45Desc`] = { derive: (r, v) => (keep45(r) ? v : "") };
override[`${P}txtPg2I49Desc`] = { derive: (r, v) => (keep49(r) ? v : "") };
override[`${P}txtPg2I51Desc`] = { derive: (r, v) => (keep49(r) ? v : "") };

export const FORM_1700V2018 = buildSchema("1700v2018", "Annual Income Tax Return — Purely Compensation Income", fieldJson as FieldJson[], {
  ...override,
  [`${P}txtPg1I7TaxpayerName`]: { escaped: true }, // saveXML escapes the taxpayer name
});
FORM_1700V2018.group = [sched1more];
sched1more.total = total;

export function validate1700v2018(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1700V2018, state);
  const tin = `${state[`${P}txtPg1I4TIN1`] ?? ""}${state[`${P}txtPg1I4TIN2`] ?? ""}${state[`${P}txtPg1I4TIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1I4TIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
