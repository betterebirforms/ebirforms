// BIR Form 1702Q v2018C (Quarterly Income Tax Return for Corporations, Partnerships and Other Non-Individual
// Taxpayers — CREATE edition), P3. The ATC (item 7, `cbATC_2`, e.g. "IC010_25%") drives everything:
//   • Schedule 1 — special rate / tax relief: columns A and B, items 1–13
//       3 = 1 − 2 ; 5 = 4 + 3 ; 7 = 5 − 6 ; 9 = 7 + 8 ; 11A = 9A × 10A% (10A is always 0) ;
//       11B = 9B ≤ 0 ? 0 : 9B × 10B% ; 13B = 11A + 11B − 12B → Part II item 17
//   • Schedule 2 — regular rate (RCIT): 3 = 1 − 2 ; 5 = 3 + 4 ; 6 = itemized ? entered : OSD ? 40% × 5 : 0 ;
//       7 = 5 − 6 ; 9 = 7 + 8 ; 10 = the ATC's rate ; 11 = 9 < 0 ? 0 : 9 × 10% ; 12 = MCIT (Schedule 3 item 6) ;
//       13 = max(11, 12) → Part II item 14
//   • Schedule 3 — MCIT (item 7 "IC055" box + the ATC box): 4 = 1 + 2 + 3 ; 5 = MCIT rate ; 6 = max(0, 4 × 5%)
//   • Schedule 4 — tax credits: 7 = Σ 1–6 + the two "other credits" rows → Part II item 19
//   Part II: 14 = Sch2 13 ; 16 = 14 − 15 ; 17 = Sch1 13B ; 18 = 16 + 17 ; 19 = Sch4 7 ; 20 = 18 − 19 ;
//            24 = 21 + 22 + 23 ; 25 = (20 < 0 && 24 > 0) ? 24 : 20 + 24
//
// BIR's arithmetic and bugs, replicated because the saved values carry them:
//   • every entered amount is rounded to WHOLE PESOS on blur (roundupdown), and so is every computed one.
//   • Sched2Item10TaxRate: the rate comes from the ATC for the RCIT ATCs, except that `year == 2020 && month == 7
//     || month == 8` (operator precedence) leaves it 0 for EVERY fiscal year ending in August, as does a blank
//     year or month. Every other ATC has rate 0.
//   • Sched3Item5TaxRate (MCIT rate): 2% for 2018–2019 and 2020 H1; 0 (user-entered 1%) for 2020 H2–2023 and for
//     2024 from May on; 2% from July of 2025 on — and 0, disabled, for every other month (e.g. a fiscal year
//     ending January–June 2025+, or January–April 2024): the 2024 ">= 6" branch is unreachable.
//   • netIncome (on blur of 12B, the last Schedule 1 input) rewrites 13B as a bare number, max(0, |11A| + |11B| −
//     |12B|) — "1234", not "1,234.00" — while item 17 keeps the signed, formatted value.
//   • enableOptionalDeduction forces itemized deduction for every ATC that is not 30/25/20% (or IC021).
//   • item 15 (prior years' excess MCIT) is forced to 0 when the MCIT exceeds the regular tax.
// Reload (loadData): 10A is reset to 0.00, every schedule is re-enabled/zeroed for the saved ATC, and the item-10
// and MCIT rates are re-derived — so a user-entered rate (the 0%-default periods) does not survive BIR's reopen.
// Save format: name, address and LOB are escape()d; txtCurrentPage is "1"; the page-2 header mirrors page 1.

import fieldJson from "./fields/1702Qv2018C.json";
import { formatMoney, parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1702q:";
const S1 = `${P}Sched1:txtTax`;
const S2 = `${P}Sched2:txtTax`;
const S3 = `${P}Sched3:txtTax`;
const S4 = `${P}Sched4:txtTax`;
const OTHER = [0, 1];
type Read = (id: string) => string;
const on = (r: Read, id: string): boolean => r(`${P}${id}`) === "true";
/** JS Math.round on an exact centavo amount (half → +∞), back in centavos. */
const peso = (c: number): number => Math.floor((c + 50) / 100) * 100;
/** BIR's roundupdown: Math.round(NumWithComma(value)) — a blank or non-number becomes 0. */
const entered = (r: Read, id: string): number => peso(parseMoney(r(id)));

/** The ATC's regular income-tax rate (getATCRate), as BIR writes it into Schedule 2 item 10. */
export function atcRate1702Qv2018C(atc: string): string {
  if (atc === "IC080_2.5%") return "2.5";
  const m = /^(?:IC\d{3}|OBU)_(\d+)%/.exec(atc);
  return m ? `${m[1]}.00` : "0.00";
}
const REGULAR = new Set(
  ("IC010_30% IC010_25% IC010_20% IC020_30% IC020_25% IC020_20% IC030_30% IC030_25% IC030_20% IC031_30% IC031_25% IC031_20% " +
    "IC040_30% IC040_25% IC040_20% IC041_30% IC041_25% IC041_20% IC070_30% IC070_25% IC101_25% OBU_25% IC191_30% " +
    "IC191_25%_OtherThanForeignCurrencyTransaction_New").split(" "),
);
const atcOf = (r: Read): string => r(`${P}cbATC_2`);
const yearOf = (r: Read): number => 2000 + Number(r(`${P}txtYrEndYear`));
const monthOf = (r: Read): string => r(`${P}rbYrEndMonth`);

/** Schedule 2 item 10 after Sched2Item10TaxRate. */
export function item10Rate(r: Read): string {
  const atc = atcOf(r);
  if (!REGULAR.has(atc)) return "0.00";
  const month = monthOf(r);
  // BIR bug (precedence): `CreateYear == 2020 && CreateMonth == 7 || CreateMonth == 8`
  if ((yearOf(r) === 2020 && Number(month) === 7) || Number(month) === 8) return "0.00";
  if (r(`${P}txtYrEndYear`) === "" || month === "") return "0.00";
  return atcRate1702Qv2018C(atc);
}

const mcit = (r: Read): boolean => on(r, "rbATC_1") && on(r, "rbATC_2");
const quarter = (r: Read): number => [1, 2, 3].find((q) => on(r, `rbQuarter_${q}`)) ?? 0;

/** Schedule 3 item 5 after Sched3Item5TaxRate, or null when BIR leaves the (user-entered) value alone. */
export function mcitRate(r: Read): string | null {
  if (!mcit(r) || !quarter(r)) return null;
  const y = yearOf(r);
  const m = Number(monthOf(r));
  if (y === 2018 || y === 2019) return "2.00";
  if (y === 2020 && m <= 6) return "2.00";
  if (y === 2020 && m >= 7) return "0.00";
  if (y === 2021 || y === 2022 || y === 2023) return "0.00";
  if (y === 2024 && m >= 5) return "0.00";
  if (y >= 2024 && m >= 7) return "2.00";
  return "0.00";
}

/** An entered amount as BIR leaves it: whole pesos, or 0 where the ATC / quarter / options disable and clear it. */
function input(r: Read, id: string): number {
  const atc = atcOf(r) !== "";
  const q1 = on(r, "rbQuarter_1");
  if (id.startsWith(S1) || id.startsWith(S2) || id.startsWith(S4) || id.startsWith(`${P}Sched4:txtOthrTxCrdtAmnt`)) {
    if (!atc) return 0; // ATCEnableDisableSchedules("") disables and zeroes Schedules 1, 2 and 4
    if (q1 && [`${S1}8A`, `${S1}8B`, `${S2}8`, `${S4}2`, `${S4}3`, `${S4}4`].includes(id)) return 0;
    if (id === `${S4}6` && on(r, "rbAmendedRtn_2")) return 0;
  }
  if (id.startsWith(S3)) {
    const q = quarter(r);
    if (!mcit(r) || !q) return 0;
    if ((id === `${S3}2` && q < 2) || (id === `${S3}3` && q < 3)) return 0;
  }
  return entered(r, id);
}

/** Every computed item, in centavos (and the two BIR-formatted strings), from the inputs. */
export function chain1702Qv2018C(r: Read) {
  const v = (id: string) => input(r, id);
  // Schedule 1 (Sched1_Computation, whole pesos at each step)
  const col = (c: "A" | "B") => {
    const t3 = peso(v(`${S1}1${c}`) - v(`${S1}2${c}`));
    const t5 = peso(v(`${S1}4${c}`) + t3);
    const t7 = peso(t5 - v(`${S1}6${c}`));
    const t9 = peso(t7 + v(`${S1}8${c}`));
    return { t3, t5, t7, t9 };
  };
  const a = col("A");
  const b = col("B");
  const rate10B = rate10BOf(r);
  const t11A = 0; // 10A is never enabled and reloads as 0.00
  const t11B = b.t9 <= 0 ? 0 : Math.round(((b.t9 / 100) * Number(rate10B)) / 100) * 100;
  const t12B = v(`${S1}12B`);
  const t13B = peso(t11A + t11B - t12B);
  // Schedule 3 (MCIT)
  const s3t4 = v(`${S3}1`) + v(`${S3}2`) + v(`${S3}3`);
  const s3rate = Number(mcitRate(r) ?? r(`${S3}5`)) || 0;
  const s3t6 = Math.max(0, peso(parseMoney((((s3t4 / 100) * s3rate * 1) / 100).toFixed(2))));
  // Schedule 2 (RCIT)
  const s2t3 = v(`${S2}1`) - v(`${S2}2`);
  const s2t5 = s2t3 + v(`${S2}4`);
  const osd = on(r, "rbMthdOfDdctns_2");
  const s2t6 = !atcOf(r) ? 0 : on(r, "rbMthdOfDdctns_1") && !osd ? v(`${S2}6`) : osd ? peso(parseMoney(((s2t5 / 100) * 0.4).toFixed(2))) : 0;
  const s2t7 = s2t5 - s2t6;
  const s2t9 = s2t7 + v(`${S2}8`);
  const s2rate = Number(item10Rate(r)) || 0;
  const s2t11 = s2t9 < 0 ? 0 : peso(parseMoney((((s2t9 / 100) * s2rate * 1) / 100).toFixed(5)));
  const s2t12 = s3t6;
  const s2t13 = Math.max(s2t11, s2t12);
  // Schedule 4
  const s4t7 = [1, 2, 3, 4, 5, 6].reduce((s, n) => s + v(`${S4}${n}`), 0) + OTHER.reduce((s, i) => s + v(`${P}Sched4:txtOthrTxCrdtAmnt${i}`), 0);
  // Part II
  const t14 = peso(s2t13);
  const t15 = s2t11 < s2t12 ? 0 : entered(r, `${P}txtTax15`);
  const t16 = t14 - t15;
  const t17 = t13B;
  const t18 = t16 + t17;
  const t19 = s4t7;
  const t20 = t18 - t19;
  const t24 = [21, 22, 23].reduce((s, n) => s + entered(r, `${P}txtTax${n}`), 0);
  const t25 = t20 < 0 && t24 > 0 ? t24 : t20 + t24;
  // netIncome: |11A| + |11B| − |12B| floored at 0, as a bare number
  const abs = (c: number) => Math.abs(c) / 100;
  const net = abs(t11A) + abs(t11B) < abs(t12B) ? 0 : abs(t11A) + abs(t11B) - abs(t12B);
  const value: Record<string, number> = {
    [`${S1}3A`]: a.t3, [`${S1}5A`]: a.t5, [`${S1}7A`]: a.t7, [`${S1}9A`]: a.t9, [`${S1}11A`]: t11A,
    [`${S1}3B`]: b.t3, [`${S1}5B`]: b.t5, [`${S1}7B`]: b.t7, [`${S1}9B`]: b.t9, [`${S1}11B`]: t11B, [`${S1}13B`]: t13B,
    [`${S2}3`]: s2t3, [`${S2}5`]: s2t5, [`${S2}6`]: s2t6, [`${S2}7`]: s2t7, [`${S2}9`]: s2t9, [`${S2}11`]: s2t11, [`${S2}12`]: s2t12, [`${S2}13`]: s2t13,
    [`${S3}4`]: s3t4, [`${S3}6`]: s3t6, [`${S4}7`]: s4t7,
    [`${P}txtTax14`]: t14, [`${P}txtTax15`]: t15, [`${P}txtTax16`]: t16, [`${P}txtTax17`]: t17, [`${P}txtTax18`]: t18,
    [`${P}txtTax19`]: t19, [`${P}txtTax20`]: t20, [`${P}txtTax24`]: t24, [`${P}txtTax25`]: t25,
  };
  return { value, net: String(net) };
}

/** Schedule 1 item 10B as BIR leaves it: setDecimalB resets anything but digits with ≤ 5 decimals to "0". */
function rate10BOf(r: Read): string {
  if (atcOf(r) === "") return "0.00";
  const v = r(`${S1}10B`);
  return /^\d+(\.\d{1,5})?$/.test(v) ? v : "0";
}

const COMPUTED = [
  ...["3A", "5A", "7A", "9A", "11A", "3B", "5B", "7B", "9B", "11B"].map((n) => `${S1}${n}`),
  ...[3, 5, 7, 9, 11, 12, 13].map((n) => `${S2}${n}`),
  `${S3}4`, `${S3}6`, `${S4}7`,
  ...[14, 16, 17, 18, 19, 20, 24, 25].map((n) => `${P}txtTax${n}`),
];
const ENTERED = [
  ...["1A", "2A", "4A", "6A", "8A", "1B", "2B", "4B", "6B", "8B", "12B"].map((n) => `${S1}${n}`),
  ...[1, 2, 4, 8].map((n) => `${S2}${n}`),
  ...[1, 2, 3].map((n) => `${S3}${n}`),
  ...[1, 2, 3, 4, 5, 6].map((n) => `${S4}${n}`),
  ...OTHER.map((i) => `${P}Sched4:txtOthrTxCrdtAmnt${i}`),
];
const money = { kind: "money" as const };
const fmt = (c: number): string => formatMoney(c);

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName1`]: { required: true },
  [`${P}txtYrEndYear`]: { required: true, derive: (r, v) => yearEnded(r, v) },
  // checkFilingYear: a calendar-year return ends in December
  [`${P}rbYrEndMonth`]: { derive: (r, v) => (on(r, "rbForClndrFscl_1") ? "12" : v) },
  // enableOptionalDeduction: only the 30/25/20% ATCs (and IC021) may choose OSD; the rest are itemized
  [`${P}rbMthdOfDdctns_1`]: { derive: (r, v) => (forcedItemized(r) ? "true" : v) },
  [`${P}rbMthdOfDdctns_2`]: { derive: (r, v) => (forcedItemized(r) ? "false" : v) },
  [`${P}txtTxRlfSpcfy`]: { derive: (r, v) => (on(r, "rbTxRlf_2") ? "" : v) },
  [`${P}txtCurrentPage`]: { derive: () => "1" },
  [`${P}txtPg2TIN1`]: { derive: (r) => r(`${P}txtTIN1`) },
  [`${P}txtPg2TIN2`]: { derive: (r) => r(`${P}txtTIN2`) },
  [`${P}txtPg2TIN3`]: { derive: (r) => r(`${P}txtTIN3`) },
  [`${P}txtPg2BranchCode`]: { derive: (r) => r(`${P}txtBranchCode`) },
  [`${P}txtPg2TaxpayerName`]: { derive: (r) => r(`${P}txtTaxpayerName1`) },
  // rates are BIR strings ("25.00", "2.5", "0.0000"), not amounts
  [`${S1}10A`]: { kind: "text", derive: () => "0.00" },
  [`${S1}10B`]: { kind: "text", derive: (r) => rate10BOf(r) },
  // Sched2Item10TaxRate writes the rate; where it writes 0.00 the field stays open for the user's own rate
  // (setDecimal: anything but digits with ≤ 5 decimals becomes "0")
  [`${S2}10`]: { kind: "text", derive: (r, v) => (item10Rate(r) === "0.00" && v !== "" ? (/^\d+(\.\d{1,5})?$/.test(v) ? v : "0") : item10Rate(r)) },
  [`${S3}5`]: { kind: "text", derive: (r, v) => mcitRate(r) ?? v },
  // entered (itemized) or derived (OSD 40% / none / no ATC) — and item 15, zeroed when the MCIT is the higher tax
  [`${S2}6`]: { ...money, derive: (r) => fmt(chain1702Qv2018C(r).value[`${S2}6`]!) },
  [`${P}txtTax15`]: { ...money, derive: (r) => fmt(chain1702Qv2018C(r).value[`${P}txtTax15`]!) },
  ...Object.fromEntries([21, 22, 23].map((n) => [`${P}txtTax${n}`, { ...money, derive: (r: Read) => fmt(entered(r, `${P}txtTax${n}`)) }])),
};
for (const id of ENTERED) override[id] = { ...money, derive: (r) => fmt(input(r, id)) };
for (const i of OTHER) override[`${P}Sched4:txtOthrTxCrdts${i}`] = { derive: (r, v) => (atcOf(r) === "" ? "" : v) };
for (const id of COMPUTED) override[id] = { ...money, compute: (r) => chain1702Qv2018C(r).value[id]! };
// 13B: netIncome's bare number once Schedule 1 B is live (an ATC is chosen); else Sched1_Computation's "0.00"
override[`${S1}13B`] = { ...money, compute: (r) => chain1702Qv2018C(r).value[`${S1}13B`]!, derive: (r, v) => (atcOf(r) === "" ? v : chain1702Qv2018C(r).net) };

function forcedItemized(r: Read): boolean {
  const atc = atcOf(r);
  return atc !== "" && atc !== "IC021_Exempt" && !/30%|25%|20%/.test(atc);
}

/** validateYear (two-digit year ended), once a quarter is chosen: before 2018 → "18"; a calendar year after this
 *  year → this year. */
function yearEnded(r: Read, v: string): string {
  const month = r(`${P}rbYrEndMonth`);
  if (v === "" || Number.isNaN(Number(v)) || month === "" || Number.isNaN(Number(month)) || !quarter(r)) return v;
  const year = 2000 + parseInt(v, 10);
  if ((on(r, "rbForClndrFscl_1") || on(r, "rbForClndrFscl_2")) && year < 2018) return "18";
  const now = new Date().getFullYear();
  if (on(r, "rbForClndrFscl_1") && year > now) return String(now - 2000);
  return v;
}

export const FORM_1702Qv2018C = buildSchema("1702Qv2018C", "Quarterly Income Tax — Corporations (CREATE)", fieldJson as FieldJson[], override);

export function validate1702Qv2018C(state: FormState): Problem[] {
  const problem = validateRequired(FORM_1702Qv2018C, state);
  const has = (id: string) => state[`${P}${id}`] === "true";
  if (!has("rbForClndrFscl_1") && !has("rbForClndrFscl_2")) problem.push({ id: `${P}rbForClndrFscl_1`, message: "Choose calendar or fiscal year (item 1)." });
  if (![1, 2, 3].some((q) => has(`rbQuarter_${q}`))) problem.push({ id: `${P}rbQuarter_1`, message: "Select the quarter being filed (item 3)." });
  if (has("rbForClndrFscl_2") && !/^(0[1-9]|1[0-2])$/.test(state[`${P}rbYrEndMonth`] ?? "")) {
    problem.push({ id: `${P}rbYrEndMonth`, message: "Choose the month the fiscal year ends (item 2)." });
  }
  if (!(state[`${P}cbATC_2`] ?? "")) problem.push({ id: `${P}cbATC_2`, message: "Choose the ATC (item 7)." });
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
