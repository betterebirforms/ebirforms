// BIR Form 2000 (Documentary Stamp Tax Declaration / Return, pre-TRAIN edition — superseded by 2000v2018), P3.
// One page, three sections chosen by the frm2000:optSection radios:
//   • Section A (constructive affixture, the default): ONE ATC picked from the AtcCode<i> radio list (BIR's "2000^"
//     ATC list, dst-atc.json) → txtATC / 12A (nature) / 12C (rate text); 12B tax base → 12D tax due (dst.ts
//     `amount12D2000`) → item 15.
//   • Section B (metering machine): 13B + 13C − 13D = 13E, where 13D = Σ Schedule 1 (txtDateFrom / txtDateTo /
//     txtAtcCode / txtTaxBase / txtTaxRate / txtTaxDue <i>, from 1) = txtSumTaxDue. The reload rebuilds Schedule 1 from
//     the checked Sched1AtcCode<j> boxes in list order (extra_record), one row per box. Item 15 is typed here.
//   • Section C (loose stamps, collection agents): free-text 14A–14E. Its radio shares the id `frm2000:optSection:_2`
//     with Section B's; the native form keeps it in `frm2000:optSectionC` (never saved) and writes the two
//     `optSection:_2` records per occurrence.
// Chain: 17 = 15 − 16 ; 18D = 18A+18B+18C ; 19 = 17 + 18D.
//
// BIR behaviours replicated because they change saved values:
//   • Choosing A blanks every Section B field (disabledsec13) and choosing B blanks Section A's (enablesec13).
//   • Section B's row engine (sched1Due2000): DS103 / DS124 / DS125 multiply the base by 75 / 15 / 50 (parseFloat of
//     " 75% "), DS105 / DS114 are flat P3 / P30, most per-P200 codes compute nothing (the filer types the tax due),
//     and a DS130–DS132 row writes its charter figure into SECTION A's 12D.
//   • 12G / 12H (TINs) keep only a numeric value (blockLetterInt: "123-456-789" → ""), 13G–13I keep
//     parseFloat(value).toFixed(0) (leading zeros dropped); txtForYr above 2017 is forced to "2017" (validateYear).
//   • Item 16 (amended return) is zeroed unless item 2 = Yes.
// BIR reload bugs (kept BIR's save format; allow-listed in the test): both `optSection:_2` radios take the FIRST saved
// value, so a Section B return reopens with the Section C radio checked, and a Section C return with none.

import fieldJson from "./fields/2000.json";
import { amount12D2000, DST_ATC, natureCell2000, rateCell2000, sched1Due2000 } from "./dst.ts";
import { formatMoney, parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import type { SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2000:";
type Read = (id: string) => string;
const m = (r: Read, id: string): Centavo => parseMoney(r(id));
const on = (r: Read, id: string): boolean => r(id) === "true";
const SECTION_A = `${P}optSection:_1`;
const SECTION_B = `${P}optSection:_2`;
/** Not a BIR id: Section C's radio, whose real id duplicates Section B's. */
export const SECTION_C = `${P}optSectionC`;
const isB = (r: Read) => on(r, SECTION_B) && !on(r, SECTION_C);
const isA = (r: Read) => !isB(r);

/** The AtcCode<i> radio (1-based list position) checked for Section A, or 0. */
export const pickedAtc2000 = (r: Read): number => DST_ATC.findIndex((_, i) => on(r, `AtcCode${i + 1}`)) + 1;
const picked = (r: Read) => DST_ATC[pickedAtc2000(r) - 1];

// ---- Section A ----
/** getATCCode copies the picked ATC into txtATC / 12A / 12C; enablesec13 blanks them in Section B. */
const atcText = (r: Read, v: string) => (isB(r) ? "" : (picked(r)?.atc_code ?? v));
const natureText = (r: Read, v: string) => (isB(r) ? "" : picked(r) ? natureCell2000(picked(r)!) : v);
const baseRateText = (r: Read, v: string) => (isB(r) ? "" : picked(r) ? rateCell2000(picked(r)!) : v);
const engineA = (r: Read) => amount12D2000(atcText(r, r(`${P}txtATC`)), natureText(r, r(`${P}txt12A`)), baseRateText(r, r(`${P}txt12C`)), m(r, `${P}txt12B`));

// ---- Section B: Schedule 1 ----
const S = { from: "txtDateFrom", to: "txtDateTo", atc: "txtAtcCode", base: "txtTaxBase", rate: "txtTaxRate", due: "txtTaxDue" };
/** A row's rate text: as given, else the picker's " RATE " cell for its code (the first list entry for DS112). */
const rowRate = (r: Read, v: string) => {
  const entry = DST_ATC.find((a) => a.atc_code === r(S.atc).trim());
  return v || (entry ? rateCell2000(entry) : "");
};
/** The last DS130–DS132 row with a positive base writes its charter figure into 12D (BIR bug), in Section B. */
const charterInto12D = (row: GroupRow[]): Centavo | undefined => {
  let out: Centavo | undefined;
  for (const x of row) {
    const v = sched1Due2000((x[S.atc] ?? "").trim(), x[S.rate] ?? "", parseMoney(x[S.base] ?? "")).item_12d;
    if (v !== undefined) out = v;
  }
  return out;
};
const CHARTER_12D = `${P}_charter12D`; // not a BIR field: the charter rows' 12D figure
export const SCHED1_2000: GroupSpec = {
  name: "sched1",
  first_index: 1,
  row: [
    { id: S.from, kind: "text" },
    { id: S.to, kind: "text" },
    { id: S.atc, kind: "text", derive: (_r, v) => v.trim() },
    { id: S.base, kind: "money", derive: (_r, v) => formatMoney(parseMoney(v)) },
    { id: S.rate, kind: "text", derive: rowRate },
    { id: S.due, kind: "money", derive: (r, v) => formatMoney(sched1Due2000(r(S.atc), r(S.rate), m(r, S.base)).tax_due ?? parseMoney(v)) },
  ],
  total: [
    { into: `${P}txtSumTaxDue`, of: S.due },
    { into: CHARTER_12D, of: S.due, sum: (row) => { const v = charterInto12D(row); return v === undefined ? "" : String(v); } },
  ],
};

/** For each Schedule 1 row, its 0-based position on the Sched1AtcCode list (-1 if none): code match, DS112 by rate. */
export function pickIndex2000(groups: GroupState): number[] {
  const used = new Set<number>();
  return (groups.sched1 ?? []).map((row) => {
    const code = (row[S.atc] ?? "").trim();
    const rate = (row[S.rate] ?? "").trim();
    const free = (j: number) => !used.has(j) && DST_ATC[j]!.atc_code === code;
    let j = DST_ATC.findIndex((a, k) => free(k) && (!rate || a.format_rate === rate));
    if (j < 0) j = DST_ATC.findIndex((_, k) => free(k));
    if (j >= 0) used.add(j);
    return j;
  });
}

// ---- the chain ----
const item12D = (r: Read): Centavo => {
  if (isB(r)) return r(CHARTER_12D) ? Number(r(CHARTER_12D)) : 0;
  return engineA(r).tax_due ?? m(r, `${P}txt12D`);
};
const item13D = (r: Read): Centavo => (isB(r) ? m(r, `${P}txtSumTaxDue`) : 0);
const item15 = (r: Read): Centavo => (isA(r) ? item12D(r) : m(r, `${P}txtTax15`));
const amended = { on: `${P}AmendedRtn_1`, equals: "true" };
const item16 = (r: Read): Centavo => (on(r, amended.on) ? m(r, `${P}txtTax16`) : 0);
const item18D = (r: Read): Centavo => m(r, `${P}txtTax18A`) + m(r, `${P}txtTax18B`) + m(r, `${P}txtTax18C`);

/** blockLetterInt: a value that isn't a number is cleared. */
const numericOnly = (v: string) => (Number.isNaN(Number(v)) ? "" : v);
/** blockletterWithout2Decimal: parseFloat(value).toFixed(0), "" when not a number. */
const wholeNumber = (v: string) => (v === "" || Number.isNaN(parseFloat(v)) ? "" : parseFloat(v).toFixed(0));
const onlyIn = (live: (r: Read) => boolean, blank: string, fn: (r: Read, v: string) => string = (_r, v) => v) => (r: Read, v: string) => (live(r) ? fn(r, v) : blank);

const DROP = new Set([
  "txtFinalFlag", "txtEnroll", "txtEmail", "driveSelectTPExport",
  "ebirOnlineConfirmUsername", "ebirOnlineConfirmPassword", "ebirOnlineUsername", "ebirOnlinePassword", "ebirOnlineSecret",
]);
const MONEY = new Set(["12B", "12D", "13B", "13C", "13D", "13E"].map((n) => `${P}txt${n}`).concat(`${P}txtSumTaxDue`));
const scalarField: FieldJson[] = [
  ...(fieldJson as FieldJson[])
    .filter((f, i, all) => !DROP.has(f.id) && all.findIndex((g) => g.id === f.id) === i) // one optSection:_2 field
    .map((f) => (MONEY.has(f.id) ? { ...f, kind: "money" as const } : f)),
  { id: SECTION_C, kind: "checkbox" },
  ...DST_ATC.map((_, i): FieldJson => ({ id: `AtcCode${i + 1}`, kind: "radio" })),
];

const c = (fn: (r: Read) => Centavo): Partial<FieldSpec> => ({ compute: fn });
const blankInA = (id: string, kind: "text" | "money"): [string, Partial<FieldSpec>] => [`${P}${id}`, { derive: onlyIn(isB, kind === "money" ? "0.00" : "") }];

export const FORM_2000 = buildSchema("2000", "Documentary Stamp Tax Declaration / Return (pre-TRAIN)", scalarField, {
  [`${P}txtForYr`]: { required: true, derive_default: (_r, v) => (Number(v) > 2017 ? "2017" : v) },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  // the section radios: Section C's real radio is the SECOND `optSection:_2` record
  [SECTION_A]: { derive: (r, v) => (on(r, SECTION_C) || on(r, SECTION_B) ? "false" : v) },
  [SECTION_B]: { derive_default: (r, _v, occurrence) => String(occurrence === 0 ? isB(r) : on(r, SECTION_C)) },
  // Section A
  [`${P}txtATC`]: { derive: atcText },
  [`${P}txt12A`]: { derive: natureText },
  [`${P}txt12B`]: { derive: (r, v) => (isB(r) ? "0.00" : v) },
  [`${P}txt12C`]: { derive: (r, v) => (isB(r) ? "" : (engineA(r).rate_text ?? baseRateText(r, v))) },
  [`${P}txt12D`]: c(item12D),
  [`${P}txt12E`]: { derive: onlyIn(isA, "") },
  [`${P}txt12F`]: { derive: onlyIn(isA, "") },
  [`${P}txt12G`]: { derive: onlyIn(isA, "", (_r, v) => numericOnly(v)) },
  [`${P}txt12H`]: { derive: onlyIn(isA, "", (_r, v) => numericOnly(v)) },
  // Section B
  ...Object.fromEntries([blankInA("txt13A", "text"), blankInA("txt13B", "money"), blankInA("txt13C", "money"), blankInA("txt13F", "text")]),
  [`${P}txt13D`]: c(item13D),
  [`${P}txt13E`]: c((r) => (isB(r) ? m(r, `${P}txt13B`) + m(r, `${P}txt13C`) - item13D(r) : 0)),
  [`${P}txt13G`]: { derive: onlyIn(isB, "", (_r, v) => wholeNumber(v)) },
  [`${P}txt13H`]: { derive: onlyIn(isB, "", (_r, v) => wholeNumber(v)) },
  [`${P}txt13I`]: { derive: onlyIn(isB, "", (_r, v) => wholeNumber(v)) },
  [`${P}txtTax15`]: c(item15),
  [`${P}txtTax16`]: c(item16),
  [`${P}txtTax17`]: c((r) => item15(r) - item16(r)),
  [`${P}txtTax18D`]: c(item18D),
  [`${P}txtTax19`]: c((r) => item15(r) - item16(r) + item18D(r)),
  [`${P}txtSumTaxDue`]: c((r) => (isB(r) ? m(r, `${P}txtSumTaxDue`) : 0)),
});
FORM_2000.group = [SCHED1_2000];
// One Sched1AtcCode<j> box per list entry, checked for the entries Schedule 1's rows came from (Section B only).
FORM_2000.extra_record = (state, groups): SaveRecord[] => {
  const r: Read = (id) => state[id] ?? "";
  const pick = new Set(isB(r) ? pickIndex2000(groups) : []);
  return DST_ATC.map((_, j) => ({ key: `Sched1AtcCode${j + 1}`, value: String(pick.has(j)) }));
};

export function validate2000(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2000, state);
  const r: Read = (id) => state[id] ?? "";
  const tin = `${r(`${P}txtTIN1`)}${r(`${P}txtTIN2`)}${r(`${P}txtTIN3`)}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  if (Number(r(`${P}txtForYr`)) > 2017) problem.push({ id: `${P}txtForYr`, message: "Returns for 2018 onward are filed on 2000v2018 (BIR forces the year to 2017)." });
  if (isA(r) && !on(r, SECTION_C) && pickedAtc2000(r) === 0) problem.push({ id: "AtcCode1", message: "Choose the ATC (item 4) for Section A." });
  const row = groups.sched1 ?? [];
  if (!isB(r) && row.length > 0) problem.push({ id: `${S.atc}1`, message: "Schedule 1 belongs to Section B; choosing Section A clears it." });
  // getSched1ATCCode rebuilds the rows from the checked boxes in list order, one row per box
  const index = pickIndex2000(groups);
  index.forEach((j, k) => {
    if (j < 0) problem.push({ id: `${S.atc}${k + 1}`, message: `Schedule 1 row ${k + 1}: not a DST ATC (or listed twice).` });
    else if (k > 0 && j <= index[k - 1]!) problem.push({ id: `${S.atc}${k + 1}`, message: `Schedule 1 row ${k + 1}: list each ATC once, in BIR's ATC-list order.` });
  });
  return problem;
}
