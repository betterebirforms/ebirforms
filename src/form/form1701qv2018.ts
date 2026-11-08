// BIR Form 1701Q v2018 (Quarterly Income Tax Return for Individuals, Estates and Trusts — TRAIN), P3.
// Two columns: A = taxpayer, B = spouse. Each column takes ONE of two tax schedules, chosen by its ATC (item 8 / 20):
//   • Schedule I — graduated rates (II012 / II014 / II013, and every estate or trust): items 36–46
//       38 = 36 − 37 ; 40 = 36 × 40% (OSD) ; 41 = itemized ? 38 − 39 : 38 − 40 ; 45 = 41 + 42 + 43 + 44 ;
//       46 = graduated tax on 45 (table by item 1's year: <2018 pre-TRAIN, 2018–2022 TRAIN, 2023+ TRAIN phase 2)
//   • Schedule II — 8% (II015 / II017 / II016): items 47–54
//       49 = 47 + 48 ; 51 = 49 + 50 ; 53 = 51 − 52 ; 54 = max(0, 53 × 8%)
//   Then (Part IV) 62 = Σ 55–61 ; 63 = (graduated ? 46 : 54) − 62 ; 67 = Σ 64–66 ; 68 = 63 + 67
//   and (Part III) 26 = graduated ? 46 : 54 ; 27 = 62 ; 28 = 26 − 27 ; 29 = 67 ; 30 = 28 + 29 ; 31 = 30A + 30B.
//
// BIR's arithmetic, replicated because the saved values carry it:
//   • every compute* past item 36 rounds to WHOLE PESOS (formatCurrency(Math.round(x))): 38, 40, 41, 45, 46, 49,
//     51, 53, 54, 62, 63, 67, 68 never carry centavos, even when the inputs do.
//   • computetxt40 tests `taxpayer OSD || spouse OSD`, so one person's OSD puts 40% of item 36 into the OTHER
//     person's item 40 too (on blur of their item 36), even under itemized deductions (41 then ignores it).
//   • item 52 above ₱250,000 is reset to 0 (item52Validate); it is forced to 0 for II016 (taxpayer) and for a
//     non-compensation spouse on II016 (enableSchedule2).
//   • validateYear clears a year later than the current one, and computetxt46 then falls through to the
//     pre-TRAIN table ("" < 2018).
// Radio rules (processTaxType / processATC): the ATC fixes the tax rate (II012/14/13 → graduated, else 8%);
// 8% clears the deduction method; an estate or trust forces II012 + graduated and clears the spouse (disableSpouse);
// a compensation-only spouse is II011, and II011 zeroes every spouse amount (items 36B–68B).
// Save format: name, LOB and the address are escape()d; the address is ONE key holding both address inputs;
// the page-2 header mirrors page 1 with the surname only (loadBGData: name.split(',')[0]); txtCurrentPage is "1".

import fieldJson from "./fields/1701Qv2018.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GateCond, type Problem } from "./schema.ts";
import { legacyEscape, type SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1701q:";
type Read = (id: string) => string;
type Col = "A" | "B";
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const on = (r: Read, id: string): boolean => r(`${P}${id}`) === "true";
const flag = (b: boolean): string => String(b);
const money = { kind: "money" as const };
/** JS Math.round on an exact centavo amount, back in centavos: BIR's whole-peso rounding (half → +∞). */
const peso = (c: number): number => Math.floor((c + 50) / 100) * 100;

// ── radio state (as BIR leaves it after processTaxType / processATC) ──
const estate = (r: Read): boolean => on(r, "optType_3") || on(r, "optType_4");
const ATC_A = [1, 2, 3, 4, 5, 6];
const ATC_B = [1, 2, 3, 4, 5, 6, 7];
/** Taxpayer ATC position 1–6 (II012, II014, II013, II015, II017, II016), 0 = none. Estate/trust → II012. */
const atcA = (r: Read): number => (estate(r) ? 1 : (ATC_A.find((k) => on(r, `optATC_${k}`)) ?? 0));
/** Spouse ATC position 1–7 (II012, II014, II013, II011, II015, II017, II016). A compensation-only spouse is II011. */
const atcB = (r: Read): number => {
  if (estate(r)) return 0;
  const type = [1, 2, 3].filter((k) => on(r, `optSpouseType_${k}`));
  if (type.length === 1 && type[0] === 3) return 4;
  return ATC_B.find((k) => on(r, `optSpouseATC_${k}`)) ?? 0;
};
/** "1" graduated, "2" 8%, "" none — fixed by the ATC when one is chosen, else the radios as set. */
const rateA = (r: Read): string => {
  const atc = atcA(r);
  if (atc) return atc <= 3 ? "1" : "2";
  return on(r, "optTaxRate_1") ? "1" : on(r, "optTaxRate_2") ? "2" : "";
};
const rateB = (r: Read): string => {
  if (estate(r)) return "";
  const atc = atcB(r);
  if (atc) return atc <= 3 ? "1" : atc === 4 ? "" : "2";
  return on(r, "optSpouseTaxRate_1") ? "1" : on(r, "optSpouseTaxRate_2") ? "2" : "";
};
const rate = (c: Col) => (c === "A" ? rateA : rateB);
const method = (c: Col): string => (c === "A" ? "optMethodOfDeduction:" : "optSpouseMethod:");
const itemized = (r: Read, c: Col): boolean => on(r, `${method(c)}_1`);
const anyOsd = (r: Read): boolean => on(r, "optMethodOfDeduction:_2") || on(r, "optSpouseMethod:_2");

/** Item 1 as BIR leaves it: blank → this year (init); blockletterWithout2Decimal; a future year → "" (validateYear). */
export function year1701Qv2018(value: string): string {
  const now = new Date().getFullYear();
  if (value.trim() === "") return String(now);
  const n = parseFloat(value);
  if (Number.isNaN(n)) return "";
  const year = n.toFixed(0);
  return Number(year) > now ? "" : year;
}

/** Item 46: BIR's graduated table on item 45 (whole pesos in, whole pesos out), chosen by item 1. */
export function graduated1701Qv2018(c45: number, year: string): number {
  const v = c45 / 100;
  const y = Number(year);
  let tax = 0; // centavos, exact (v is whole pesos, so excess × rate% is whole centavos)
  const band = (excess: number, pct: number, base: number) => excess * pct + base * 100;
  if (y >= 2018 && y <= 2022) {
    if (v <= 250000) tax = 0;
    else if (v <= 400000) tax = band(v - 250000, 20, 0);
    else if (v <= 800000) tax = band(v - 400000, 25, 30000);
    else if (v <= 2000000) tax = band(v - 800000, 30, 130000);
    else if (v <= 8000000) tax = band(v - 2000000, 32, 490000);
    else tax = band(v - 8000000, 35, 2410000);
  } else if (y > 2022) {
    if (v <= 250000) tax = 0;
    else if (v <= 400000) tax = band(v - 250000, 15, 0);
    else if (v <= 800000) tax = band(v - 400000, 20, 22500);
    else if (v <= 2000000) tax = band(v - 800000, 25, 102500);
    else if (v <= 8000000) tax = band(v - 2000000, 30, 402500);
    else tax = band(v - 8000000, 35, 2202500);
  } else if (y < 2018) {
    // pre-TRAIN, also reached by a blank year (BIR: "" < 2018)
    if (v <= 0) tax = 0;
    else if (v < 10000) tax = band(v, 5, 0);
    else if (v < 30000) tax = band(v - 10000, 10, 500);
    else if (v < 70000) tax = band(v - 30000, 15, 2500);
    else if (v < 140000) tax = band(v - 70000, 20, 8500);
    else if (v < 250000) tax = band(v - 140000, 25, 22500);
    else if (v < 500000) tax = band(v - 250000, 30, 50000);
    else tax = band(v - 500000, 32, 125000);
  } else return 0; // a non-numeric year: computetxt46 leaves item 46 at 0
  return v <= 0 ? 0 : peso(tax);
}

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtYear`]: { required: true, derive: (_, v) => year1701Qv2018(v) },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  [`${P}txtCurrentPage`]: { derive: () => "1" },
  [`${P}txtPg2TIN1`]: { derive: (r) => r(`${P}txtTIN1`) },
  [`${P}txtPg2TIN2`]: { derive: (r) => r(`${P}txtTIN2`) },
  [`${P}txtPg2TIN3`]: { derive: (r) => r(`${P}txtTIN3`) },
  [`${P}txtPg2BranchCode`]: { derive: (r) => r(`${P}txtBranchCode`) },
  [`${P}txtPg2TaxpayerName`]: { derive: (r) => r(`${P}txtTaxpayerName`).split(",")[0] ?? "" },
  // the Part II payment-detail rows are disabled in BIR's form; they are text, not amounts to fill
  ...Object.fromEntries([32, 33, 34, 35].map((n) => [`${P}txtAmount${n}`, { kind: "text" as const }])),
};

// ── radios ──
for (const k of ATC_A) override[`${P}optATC_${k}`] = { derive: (r) => flag(atcA(r) === k) };
override[`${P}optTaxRate_1`] = { derive: (r, v) => (rateA(r) ? flag(rateA(r) === "1") : v) };
override[`${P}optTaxRate_2`] = { derive: (r, v) => (rateA(r) ? flag(rateA(r) === "2") : v) };
for (const k of [1, 2]) override[`${P}optMethodOfDeduction:_${k}`] = { derive: (r, v) => (rateA(r) === "2" ? "false" : v) };
// disableSpouse (an estate or trust files alone)
const spouseClear: Record<string, string> = {
  txtSpouseTIN1: "", txtSpouseTIN2: "", txtSpouseTIN3: "", txtSpouseBranchCode: "00000", txtSpouseRDOCode: "",
  txtSpouseName: "", txtSpouseCitizenship: "", txtSpouseForeignTaxNum: "",
};
for (const [id, cleared] of Object.entries(spouseClear)) override[`${P}${id}`] = { derive: (r, v) => (estate(r) ? cleared : v) };
for (const id of ["optSpouseForeignTaxCred_1", "optSpouseForeignTaxCred_2", "optSpouseType_1", "optSpouseType_2", "optSpouseType_3"]) {
  override[`${P}${id}`] = { derive: (r, v) => (estate(r) ? "false" : v) };
}
for (const k of ATC_B) override[`${P}optSpouseATC_${k}`] = { derive: (r) => flag(atcB(r) === k) };
override[`${P}optSpouseTaxRate_1`] = { derive: (r, v) => (rateB(r) || atcB(r) || estate(r) ? flag(rateB(r) === "1") : v) };
override[`${P}optSpouseTaxRate_2`] = { derive: (r, v) => (rateB(r) || atcB(r) || estate(r) ? flag(rateB(r) === "2") : v) };
for (const k of [1, 2]) {
  override[`${P}optSpouseMethod:_${k}`] = { derive: (r, v) => (rateB(r) === "2" || atcB(r) === 4 || estate(r) ? "false" : v) };
}

// ── amounts, per column ──
const rateRadio = (c: Col, n: 1 | 2): string => `${P}${c === "A" ? "optTaxRate" : "optSpouseTaxRate"}_${n}`;
const live = (c: Col, n: 1 | 2): GateCond => ({ on: rateRadio(c, n), equals: "true" });
const SCHED_1 = [36, 37, 39, 42, 43, 44];
const SCHED_2 = [47, 48, 50, 52];
const CREDIT = [55, 56, 57, 58, 59, 60, 61];
const PENALTY = [64, 65, 66];

/** One column's whole chain, in centavos, from its inputs as BIR leaves them (gated / forced). Part III (items
 *  26–31) sits BEFORE the schedules in the DOM (= compute order), so every computed item reads from this. */
export function chain1701Qv2018(r: Read, c: Col): Record<number, number> {
  const g = rate(c)(r);
  const isItemized = itemized(r, c);
  const v: Record<number, number> = {};
  const input = (n: number, open: boolean) => (v[n] = open ? m(r, `txt${n}${c}`) : 0);
  for (const n of SCHED_1) input(n, g === "1" && ((n !== 37 && n !== 39) || isItemized));
  for (const n of SCHED_2) input(n, g === "2");
  const spouseII011 = c === "B" && on(r, "optSpouseATC_4");
  for (const n of [...CREDIT, ...PENALTY]) input(n, !spouseII011);
  // item52Validate: above ₱250,000 → 0; enableSchedule2: II016 (spouse: unless also a compensation earner) → 0
  const forced52 = c === "A" ? on(r, "optATC_6") : on(r, "optSpouseATC_7") && !on(r, "optSpouseType_3");
  if (forced52 || v[52]! > 25_000_000) v[52] = 0;
  // Schedule I
  v[38] = peso(v[36]! - v[37]!);
  // BIR bug: either person's OSD puts 40% of item 36 into BOTH columns' item 40 (computetxt40)
  v[40] = g === "1" && anyOsd(r) ? Math.floor((v[36]! * 40 + 5000) / 10000) * 100 : 0;
  v[41] = peso(v[38] - (isItemized ? v[39]! : v[40]));
  v[45] = peso(v[41] + v[42]! + v[43]! + v[44]!);
  v[46] = graduated1701Qv2018(v[45], r(`${P}txtYear`));
  // Schedule II
  v[49] = peso(v[47]! + v[48]!);
  v[51] = peso(v[49] + v[50]!);
  v[53] = peso(v[51] - v[52]!);
  v[54] = Math.max(0, peso((v[53] * 8) / 100));
  // Part IV
  v[62] = peso(CREDIT.reduce((s, n) => s + v[n]!, 0));
  v[63] = peso((g === "1" ? v[46] : v[54]) - v[62]);
  v[67] = peso(PENALTY.reduce((s, n) => s + v[n]!, 0));
  v[68] = peso(v[63] + v[67]);
  // Part III (computePartIII; computetxt26: graduated ? 46 : 54)
  v[26] = g === "1" ? v[46] : v[54];
  v[27] = v[62];
  v[28] = v[26] - v[27];
  v[29] = v[67];
  v[30] = v[28] + v[29];
  return v;
}

for (const c of ["A", "B"] as const) {
  const sched1 = live(c, 1);
  const sched2 = live(c, 2);
  const deduction: GateCond = { on: `${P}${method(c)}_1`, equals: "true" };
  const credit: GateCond[] = c === "B" ? [{ on: `${P}optSpouseATC_4`, equals: "false" }] : [];
  const pick = (n: number) => (r: Read) => chain1701Qv2018(r, c)[n]!;
  for (const n of SCHED_1) override[`${P}txt${n}${c}`] = { ...money, gate: n === 37 || n === 39 ? [sched1, deduction] : sched1 };
  for (const n of SCHED_2) override[`${P}txt${n}${c}`] = { ...money, gate: sched2 };
  override[`${P}txt52${c}`]!.derive = (r, v) => (chain1701Qv2018(r, c)[52] === 0 ? "0.00" : v);
  for (const n of [...CREDIT, ...PENALTY]) override[`${P}txt${n}${c}`] = { ...money, gate: credit };
  for (const n of [26, 27, 28, 29, 30, 38, 40, 41, 45, 46, 49, 51, 53, 54, 62, 63, 67, 68]) override[`${P}txt${n}${c}`] = { ...money, compute: pick(n) };
}
override[`${P}txt31`] = { ...money, compute: (r) => chain1701Qv2018(r, "A")[30]! + chain1701Qv2018(r, "B")[30]! };
// the shared descriptions (items 43 / 48) are cleared by disableSchedule1/2 unless some column uses that schedule
override[`${P}txt43Desc`] = { derive: (r, v) => (rateA(r) === "1" || rateB(r) === "1" ? v : "") };
override[`${P}txt48Desc`] = { derive: (r, v) => (rateA(r) === "2" || rateB(r) === "2" ? v : "") };

export const FORM_1701Qv2018 = buildSchema("1701Qv2018", "Quarterly Income Tax — Individuals, Estates and Trusts (TRAIN)", fieldJson as FieldJson[], override);

// item 10 as saveXML writes it: both address inputs in the one txtAddress key; txtAddress2 itself is never saved
FORM_1701Qv2018.extra_record = (state): SaveRecord[] => [
  { key: `${P}txtAddress`, value: legacyEscape(((state[`${P}txtAddress`] ?? "") + (state[`${P}txtAddress2`] ?? "")).toUpperCase()) },
  { key: `${P}txtAddress2`, value: "" },
];

export function validate1701Qv2018(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1701Qv2018, state);
  const has = (id: string) => state[`${P}${id}`] === "true";
  if (![1, 2, 3].some((n) => has(`DateQuarter_${n}`))) problem.push({ id: `${P}DateQuarter_1`, message: "Select the quarter being filed (item 2)." });
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  const year = state[`${P}txtYear`] ?? "";
  if (year && Number(year) > new Date().getFullYear()) problem.push({ id: `${P}txtYear`, message: "Item 1 cannot be later than the current year." });
  if (![1, 2, 3, 4].some((n) => has(`optType_${n}`))) problem.push({ id: `${P}optType_1`, message: "Select an option for item 7." });
  const read: Read = (id) => state[id] ?? "";
  if (!atcA(read)) problem.push({ id: `${P}optATC_1`, message: "Select an option for item 8 (ATC)." });
  if (rateA(read) === "1" && !has("optMethodOfDeduction:_1") && !has("optMethodOfDeduction:_2")) {
    problem.push({ id: `${P}optMethodOfDeduction:_1`, message: "Select a method of deduction (item 16A)." });
  }
  if ((state[`${P}txtSpouseName`] ?? "") !== "" && !estate(read)) {
    if (![1, 2, 3].some((n) => has(`optSpouseType_${n}`))) problem.push({ id: `${P}optSpouseType_1`, message: "Select an option for item 19." });
    if (!atcB(read)) problem.push({ id: `${P}optSpouseATC_1`, message: "Select an option for item 20 (spouse ATC)." });
  }
  const spouseTin = `${state[`${P}txtSpouseTIN1`] ?? ""}${state[`${P}txtSpouseTIN2`] ?? ""}${state[`${P}txtSpouseTIN3`] ?? ""}`;
  if (spouseTin.length === 9 && validateTin(spouseTin) !== TinStatus.Valid) problem.push({ id: `${P}txtSpouseTIN1`, message: "The spouse TIN's check digit doesn't match." });
  return problem;
}
