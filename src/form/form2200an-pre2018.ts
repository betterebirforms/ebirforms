// BIR Form 2200AN (Excise Tax Return for Automobiles and Non-Essential Goods), the pre-2018 edition superseded by
// 2200ANv2018 (form2200an.ts). Its layout shares nothing with v2018 (that one is a fixed XG grid with entered dues);
// here Schedule 1 is BUILT from xml/atcCodes.xml at init (loadATC keeps every entry whose text contains "2200AN"):
//   list 1 (category 1, automobiles): 26 rows listSched1x1{B,C,D,E,Due}{i}; B/C = units, D/E = value (exempt/taxable)
//   list 2 (category 2, non-essential goods): 3 rows listSched1x2{B,D,E,Due}{i} — and column C is saved under the
//     id "frm2200AN:{i}" (dataATCList2 forgets the stem in the id; replicated, the keys are BIR's)
//   Others: sched1{Chk,Atc,Other,TaxRate,ExemptA,TaxableA,ExemptB,TaxableB,ExciseTaxDue}{i}, row 0 static, rows 1+
//     added; the reload rebuilds them by counting sched1Chk records (loadXML).
// computeSched1BasicExcisetax (list 1, on blur of C or E), all float, rendered by formatCurrency (round half-up):
//   C = 0 and E = 0 → 0; C = 0 or E = 0 → 0 (with an alert);
//   E/C ≤ min or E/C > max (max 0 read as 999,999,999,999.99) → E is reset to 0.00 and Due = 0 (bracket alert);
//   min ≠ 0 → Due = ((rate/100 × (E/C − min) + constTax).toFixed(2)) × C   (the per-unit tax rounds FIRST);
//   XG065 (hybrids) → Due = rate/100 × E.
//   BIR BUG (replicated): the `else` that should tax a min = 0 bracket binds to `if (E != 0)`, which is always true
//   there, so XG021/031/041/051/061 (first bracket), XG055 and XG068 always compute Due = 0.00.
// computeSched1BasicExcisetax2 (list 2): Due = ((rate/100) × E).toFixed(2), 0 when E = 0.
// computeExciseDueSched1 (Others): Due = ((rate × TaxableB) / 100).toFixed(2).
// computeTotalSched1: totalTaxDue = Σ list-1 Due + Σ list-2 Due + Σ Others Due. sched1OK (also run by the reload, so
// item 16 always ends up the schedule total — 16 is disabled at init): 16 = totalTaxDue.
// Part III: 17C = 17A + 17B (17B is disabled, never entered) ; 18 = 16 − 17C ; 20 = 18 − 19 (19 only on an amended
// return) ; 21D = 21A + 21B + 21C ; 22 = 20 + 21D ; 23B = PayPenalties ? 21D : 0 ; 23C = 23A + 23B ; 24 = 22 − 23C.

import fieldJson from "./fields/2200AN.json";
import { parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupRow, type GroupSpec, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2200AN:";
type Read = (id: string) => string;
const m = (r: Read, id: string): Centavo => parseMoney(r(`${P}${id}`));
const money = { kind: "money" as const };

/** List 1, in atcCodes.xml order: [ATC, description, rate %, constant tax, bracket min, bracket max (0 = none)]. */
export const LIST1: ReadonlyArray<readonly [atc: string, desc: string, rate: string, constTax: string, min: string, max: string]> = [
  ["XG021", "Passenger Car", "2.0", "0.0", "0", "600000"], ["XG022", "Passenger Car", "20.0", "12000.0", "600000", "1100000"],
  ["XG023", "Passenger Car", "40.0", "112000.0", "1100000", "2100000"], ["XG024", "Passenger Car", "60.0", "512000.0", "2100000.0", "0"],
  ["XG031", "Utility Vehicles", "2.0", "0.0", "0", "600000"], ["XG032", "Utility Vehicles", "20.0", "12000.0", "600000", "1100000"],
  ["XG033", "Utility Vehicles", "40.0", "112000.0", "1100000", "2100000"], ["XG034", "Utility Vehicles", "60.0", "512000.0", "2100000.0", "0"],
  ["XG041", "Passenger Vans", "2.0", "0.0", "0", "600000"], ["XG042", "Passenger Vans", "20.0", "12000.0", "600000", "1100000"],
  ["XG043", "Passenger Vans", "40.0", "112000.0", "1100000", "2100000"], ["XG044", "Passenger Vans", "60.0", "512000.0", "2100000.0", "0"],
  ["XG051", "Pick-Ups", "2.0", "0.0", "0", "600000"], ["XG052", "Pick-Ups", "20.0", "12000.0", "600000", "1100000"],
  ["XG053", "Pick-Ups", "40.0", "112000.0", "1100000", "2100000"], ["XG054", "Pick-Ups", "60.0", "512000.0", "2100000.0", "0"],
  ["XG055", "Pick-Ups", "0.0", "0", "0", "0"],
  ["XG061", "Others", "2.0", "0.0", "0", "600000"], ["XG062", "Others", "20.0", "12000.0", "600000", "1100000"],
  ["XG063", "Others", "40.0", "112000.0", "1100000", "2100000"], ["XG064", "Others", "60.0", "512000.0", "2100000.0", "0"],
  ["XG065", "Hybrid Vehicles (50% of applicable tax rates)", "4.0", "0", "0", "600000"],
  ["XG065", "Hybrid Vehicles (50% of applicable tax rates)", "10.0", "0", "600000", "1000000"],
  ["XG065", "Hybrid Vehicles (50% of applicable tax rates)", "20.0", "0", "1000000", "4000000"],
  ["XG065", "Hybrid Vehicles (50% of applicable tax rates)", "50.0", "0", "4000000", "0"],
  ["XG068", "Purely Electric Hybrid Vehicles", "0.0", "0", "0", "0"],
];
/** List 2 (non-essential goods): [ATC, description, rate %]. */
export const LIST2: ReadonlyArray<readonly [atc: string, desc: string, rate: string]> = [
  ["XG100", "Jewelry, pearls, precious and semi-precious, whether real or imitation", "20.0"],
  ["XG110", "Perfumes and Toilet Waters", "20.0"],
  ["XG120", "Yachts and other Vessels for Pleasure or Sports", "20.0"],
];

/** NumWithComma then parseFloat ("" → NaN, as BIR). */
const num = (v: string): number => parseFloat(v.replace(/,/g, ""));
/** formatCurrency on a JS number (round half-up on the float, like parseMoney). NaN → 0. */
const currency = (x: number): Centavo => (Number.isFinite(x) ? parseMoney(String(x)) : 0);

/** List 1 bracket check: true when E/C falls outside the row's (min, max] price bracket, so BIR resets E. */
export function outOfBracket(row: number, c: string, e: string): boolean {
  const [, , , , min, max] = LIST1[row]!;
  const C = num(c), E = num(e);
  if (!(C !== 0 || E !== 0) || C === 0 || E === 0) return false;
  const hi = parseFloat(max) === 0 ? 999999999999.99 : parseFloat(max);
  return E / C <= parseFloat(min) || E / C > hi;
}
/** computeSched1BasicExcisetax for list-1 row `row` from its C (units) and E (value) inputs. */
export function list1Due(row: number, c: string, e: string): Centavo {
  const [atc, , rate, constTax, min] = LIST1[row]!;
  const C = num(c), E = num(e);
  if (!(C !== 0 || E !== 0) || C === 0 || E === 0 || outOfBracket(row, c, e)) return 0;
  let due: number | string = "0.00"; // BIR's initial value: a min = 0 bracket never leaves it (the dangling-else bug)
  if (parseFloat(min) !== 0) due = Number((((parseFloat(rate) / 100) * (E / C - parseFloat(min))) + parseFloat(constTax)).toFixed(2)) * C;
  if (atc === "XG065") due = (parseFloat(rate) / 100) * E;
  return currency(Number(due));
}
/** computeSched1BasicExcisetax2 for list-2 row `row`. */
export function list2Due(row: number, e: string): Centavo {
  const E = num(e);
  return E !== 0 && Number.isFinite(E) ? currency(Number(((parseFloat(LIST2[row]![2]) / 100) * E).toFixed(2))) : 0;
}
/** computeExciseDueSched1 for an Others row. */
export const otherDue = (rate: string, taxableB: string): Centavo => currency(Number(((num(rate) * num(taxableB)) / 100).toFixed(2)));

const x1 = (col: string, i: number) => `${P}listSched1x1${col}${i}`;
const x2 = (col: string, i: number) => (col === "C" ? `${P}${i}` : `${P}listSched1x2${col}${i}`);
/** BIR resets E to 0.00 when E/C is outside the bracket (the value it saves after its alert). */
const x1E = (r: Read, i: number): string => (outOfBracket(i, r(x1("C", i)), r(x1("E", i))) ? "0.00" : r(x1("E", i)));

/** The Others schedule: row 0 static, rows 1+ added (stems take the index as a suffix). */
const OTHER: GroupSpec = {
  name: "other",
  first_index: 0,
  row: [
    // the reload counts sched1Chk<i> records to rebuild rows 1+, so every row writes its (delete-marker) checkbox
    { id: `${P}sched1Chk`, kind: "checkbox", derive: (_r, v) => v || "false" },
    { id: `${P}sched1Atc`, kind: "text" },
    { id: `${P}sched1Other`, kind: "text" },
    { id: `${P}sched1TaxRate`, kind: "money" },
    { id: `${P}sched1ExemptA`, kind: "money" },
    { id: `${P}sched1TaxableA`, kind: "money" },
    { id: `${P}sched1ExemptB`, kind: "money" },
    { id: `${P}sched1TaxableB`, kind: "money" },
    { id: `${P}sched1ExciseTaxDue`, kind: "money", row_compute: (r) => otherDue(r(`${P}sched1TaxRate`) || "0.00", r(`${P}sched1TaxableB`) || "0.00") },
  ],
  total: { into: `${P}sched1OtherTotal`, of: `${P}sched1ExciseTaxDue` },
};
const otherTotal = (r: Read): Centavo => parseMoney(r(`${P}sched1OtherTotal`));
const sched1Total = (r: Read): Centavo =>
  LIST1.reduce((s, _, i) => s + list1Due(i, r(x1("C", i)) || "0", x1E(r, i) || "0.00"), 0) +
  LIST2.reduce((s, _, i) => s + list2Due(i, r(x2("E", i)) || "0.00"), 0) +
  otherTotal(r);

// the runtime-built list rows sit between Part III and the Others table in the DOM (and the save)
const listField: FieldJson[] = [
  ...LIST1.flatMap((_, i) => ["B", "C", "D", "E", "Due"].map((c) => ({ id: x1(c, i), kind: "money" as const }))),
  ...LIST2.flatMap((_, i) => ["B", "C", "D", "E", "Due"].map((c) => ({ id: x2(c, i), kind: "money" as const }))),
];
const json = fieldJson as FieldJson[];
const at = json.findIndex((f) => f.id === `${P}sched1Chk0`);
// the Others rows (incl. row 0) are the group; the field list keeps only the checkbox and the totals
const isOtherCell = (id: string) => /^frm2200AN:sched1(Chk|Atc|Other|TaxRate|ExemptA|TaxableA|ExemptB|TaxableB|ExciseTaxDue)0$/.test(id);
const field: FieldJson[] = [...json.slice(0, at), ...listField, ...json.slice(at)].filter((f) => !isOtherCell(f.id));

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtMonth1`]: { required: true },
  [`${P}txtDate`]: { required: true },
  [`${P}txtForYr`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtLineBus`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  [`${P}txtTelNum`]: { required: true },
  [`${P}txtAddress`]: { required: true },
  [`${P}txtZipCode`]: { required: true },
  // changeTreaty: no relief → the treaty list back to its blank option "0"
  [`${P}lstTaxTreaty`]: { derive: (r, v) => (r(`${P}optTreaty_1`) === "true" ? v : v === "" ? "" : "0") },
  // changeMannerOfPayment: "payment on removal" disables and clears the other-manner text
  [`${P}txtOthMannerofPymnt`]: { gate: { on: `${P}chkPymntManner_2`, equals: "true" } },
  [`${P}txtTax16`]: { ...money, compute: sched1Total },
  [`${P}txtTax17B`]: { ...money, gate: { when: () => false } }, // disabled at init, never entered
  [`${P}txtTax17C`]: { ...money, compute: (r) => m(r, "txtTax17A") + m(r, "txtTax17B") },
  [`${P}txtTax18`]: { ...money, compute: (r) => m(r, "txtTax16") - m(r, "txtTax17C") },
  // item 19 is enabled only by the amended "Yes" (the "No" onclick zeroes it)
  [`${P}txtTax19`]: { ...money, gate: { on: `${P}amendedRtn_1`, equals: "true" } },
  [`${P}txtTax20`]: { ...money, compute: (r) => m(r, "txtTax18") - m(r, "txtTax19") },
  [`${P}txtTax21D`]: { ...money, compute: (r) => m(r, "txtTax21A") + m(r, "txtTax21B") + m(r, "txtTax21C") },
  [`${P}txtTax22`]: { ...money, compute: (r) => m(r, "txtTax20") + m(r, "txtTax21D") },
  [`${P}txtTax23B`]: { ...money, compute: (r) => (r(`${P}PayPenalties`) === "true" ? m(r, "txtTax21D") : 0) },
  [`${P}txtTax23C`]: { ...money, compute: (r) => m(r, "txtTax23A") + m(r, "txtTax23B") },
  [`${P}txtTax24`]: { ...money, compute: (r) => m(r, "txtTax22") - m(r, "txtTax23C") },
  ...Object.fromEntries(
    LIST1.flatMap((_, i) => [
      [x1("E", i), { ...money, derive: (r: Read, v: string) => (v !== "" && outOfBracket(i, r(x1("C", i)) || "0", v) ? "0.00" : v) }],
      [x1("Due", i), { ...money, compute: (r: Read) => list1Due(i, r(x1("C", i)) || "0", r(x1("E", i)) || "0.00") }],
    ]),
  ),
  ...Object.fromEntries(LIST2.map((_, i) => [x2("Due", i), { ...money, compute: (r: Read) => list2Due(i, r(x2("E", i)) || "0.00") }])),
  [`${P}totalTaxDue`]: { ...money, compute: sched1Total },
};

export const FORM_2200AN_PRE2018 = {
  ...buildSchema("2200AN", "Excise Tax — Automobiles & Non-Essential Goods (pre-2018)", field, override),
  group: [OTHER],
};

/** BIR's validateForm / isValidDataOnSched1 checks a native save can fail. */
export function validate2200AnPre2018(state: FormState, groups: Record<string, GroupRow[]> = {}): Problem[] {
  const problem = validateRequired(FORM_2200AN_PRE2018, state);
  const v = (id: string) => (state[`${P}${id}`] ?? "").trim();
  const tin = `${v("txtTIN1")}${v("txtTIN2")}${v("txtTIN3")}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  const month = parseInt(v("txtMonth1"), 10), day = parseInt(v("txtDate"), 10), year = parseInt(v("txtForYr"), 10);
  if (v("txtDate") && v("txtForYr") && !(day >= 1 && day <= new Date(year, month, 0).getDate())) problem.push({ id: `${P}txtDate`, message: "Invalid date entry on item 1." });
  if (v("txtForYr") && year < 1900) problem.push({ id: `${P}txtForYr`, message: "Invalid date entry on Item no.1. Entry should not be lower than 1900." });
  if (v("txtRDOCode") === "000") problem.push({ id: `${P}txtRDOCode`, message: "Please enter a valid RDO Code on Item 5." });
  for (const [id, item] of [["frm2200ANoptCity", 11], ["frm2200ANoptCity1", 12]] as const)
    if (!(state[id] ?? "") || state[id] === "00") problem.push({ id, message: `Please enter a value on item no. ${item}. Entry must not be empty.` });
  // isValidDataOnSched1 checks the LAST Others row; any filled row must carry an XG code
  (groups.other ?? []).forEach((row, i) => {
    const atc = (row[`${P}sched1Atc`] ?? "").trim().toUpperCase();
    if (atc && !atc.startsWith("XG")) problem.push({ id: `${P}sched1Atc${i}`, message: "The supplied ATC code should start with 'XG'." });
    else if (i > 0 && !atc) problem.push({ id: `${P}sched1Atc${i}`, message: "Please enter a valid ATC for the specified row." });
    else if (i > 0 && (parseMoney(row[`${P}sched1TaxRate`] ?? "") === 0 || parseMoney(row[`${P}sched1TaxableB`] ?? "") === 0))
      problem.push({ id: `${P}sched1TaxRate${i}`, message: `Please enter valid values for row ${i + 1} of Schedule 1, or delete the row if not applicable.` });
  });
  if (parseMoney(state[`${P}txtTax24`] ?? "") > 0)
    problem.push({ id: `${P}txtTax23A`, message: "Balance to be carried over to next return must not be positive. Please adjust Tax Payment/Deposit accordingly." });
  return problem;
}
