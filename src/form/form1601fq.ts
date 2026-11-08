// BIR Form 1601-FQ (Quarterly Remittance Return of Final Income Taxes Withheld), P3. Three tables:
//   • Part II ATC tables (items 14–19 + "other"): rows built at runtime by getATCCode from the ATC picker's checked
//     `AtcCd<i>` boxes, in pick-list order. The first 6 picks fill the compute table (indices 1–6), the rest the
//     "other tax" table (7+) — ONE index space for both (frm1601FQ:txtAtcCode/txtTaxBase/txtTaxRate/txtTaxbeWithHeld<i>).
//     Per row txtTaxbeWithHeld = base × rate ÷ 100; Σ every row → txtTax20; Σ rows 7+ → txtTotalOtherTax.
//   • Schedule I (treaty / special-law relief): 5 STATIC rows 0–4 (txtAmtIncomePay/txtRate/txtReqWithheld<i>), live
//     only when item 13 = Yes (disableSelTreaty zeros them otherwise). Σ txtReqWithheld → txtDvTotalSchedI → 21.
// Chain (computeofTotalWithheldTax): 22 = 20+21 ; 26 = 23+24+25 ; 27 = 22−26 ; 31 = 28+29+30 ; 32 = 27+31.
// Reload: loadData restores the AtcCd boxes, getATCCode rebuilds that many rows, loadDataWithATC refills them by
// id — so a native save emits AtcCd<i> per row (extra_record), matched on (code, rate) because BIR's list repeats
// codes at different rates (private list: WC212 at 30% and 25%, WI350 at 30% and 20%).

import fieldJson from "./fields/1601FQ.json";
import { atcPickList, type AtcPick } from "./atc.ts";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import type { SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1601FQ:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const sum = (...n: number[]) => (r: Read) => n.reduce((s, i) => s + m(r, `txtTax${i}`), 0);
const SCHED_ROW = [0, 1, 2, 3, 4];
/** The compute table holds the first 6 picks; getATCCode routes the 7th onward to the "other tax" table. */
export const COMPUTE_ROW_COUNT = 6;

const partIIRow = (): GroupSpec["row"] => [
  { id: `${P}txtAtcCode`, kind: "text" },
  { id: `${P}txtTaxBase`, kind: "money" },
  { id: `${P}txtTaxRate`, kind: "text" }, // BIR's rate string, e.g. " 20.0"
  {
    id: `${P}txtTaxbeWithHeld`,
    kind: "money",
    row_compute: (read) => Math.round((parseMoney(read(`${P}txtTaxBase`)) * (parseFloat(read(`${P}txtTaxRate`)) || 0)) / 100),
  },
];
export const ATC_1601FQ: GroupSpec = {
  name: "atc",
  first_index: 1,
  row: partIIRow(),
  total: { into: `${P}_tmpComputeTax`, of: `${P}txtTaxbeWithHeld` },
};
export const OTHER_1601FQ: GroupSpec = {
  name: "other",
  first_index: COMPUTE_ROW_COUNT + 1,
  row: partIIRow(),
  total: { into: `${P}txtTotalOtherTax`, of: `${P}txtTaxbeWithHeld` },
};

/** The ATC picker's list for this return: private or government agent (item 11), plus the "N/A" entry that
 *  enableSelTreaty appends when item 13 (treaty / special law) is Yes. */
export function pickList1601FQ(state: FormState): AtcPick[] {
  const list = atcPickList("1601FQ", state[`${P}CatAgent_G`] === "true" ? "G" : "P");
  return state[`${P}SpecialTax_1`] === "true" ? [...list, { atc_code: "N/A", rate: "0.0" }] : list;
}

/** For each Part II row (compute then other), the 0-based pick-list position it came from, or -1 if its code is
 *  not on the list. Same code at several rates → the entry whose rate matches, else the first unused one. */
export function pickIndex1601FQ(state: FormState, groups: GroupState): number[] {
  const list = pickList1601FQ(state);
  const used = new Set<number>();
  const row: GroupRow[] = [...(groups.atc ?? []), ...(groups.other ?? [])];
  return row.map((r) => {
    const code = (r[`${P}txtAtcCode`] ?? "").trim();
    const rate = parseFloat(r[`${P}txtTaxRate`] ?? "");
    const free = (j: number) => !used.has(j) && list[j]!.atc_code === code;
    let j = list.findIndex((e, k) => free(k) && parseFloat(e.rate) === rate);
    if (j < 0) j = list.findIndex((_, k) => free(k));
    if (j >= 0) used.add(j);
    return j;
  });
}

const schedMoney = SCHED_ROW.flatMap((i) => [`txtAmtIncomePay${i}`, `txtRate${i}`, `txtReqWithheld${i}`]);
const moneyField = new Set([...schedMoney, "txtDvTotalSchedI", `${P}txtTotalOtherTax`]);
const scalarField = (fieldJson as FieldJson[]).map((f) => (moneyField.has(f.id) ? { ...f, kind: "money" as const } : f));

const treaty = { on: `${P}SpecialTax_1`, equals: "true" };
const schedWithheld = (r: Read, i: number): number => Math.round((parseMoney(r(`txtAmtIncomePay${i}`)) * (parseFloat(r(`txtRate${i}`)) || 0)) / 100);
// Schedule I sits AFTER item 21 in the DOM (= compute order), so 21 derives from the row inputs, not the total.
const schedTotal = (r: Read): number => (r(treaty.on) === treaty.equals ? SCHED_ROW.reduce((s, i) => s + schedWithheld(r, i), 0) : 0);
const schedOverride: Record<string, Partial<FieldSpec>> = Object.fromEntries(
  SCHED_ROW.flatMap((i) => [
    [`txtAmtIncomePay${i}`, { gate: treaty }],
    [`txtRate${i}`, { gate: treaty }],
    [`txtReqWithheld${i}`, { gate: treaty, compute: (r: Read) => schedWithheld(r, i) }],
  ]),
);

export const FORM_1601FQ = buildSchema("1601FQ", "Quarterly Final Income Taxes Withheld", scalarField, {
  [`${P}txtYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  [`${P}txtTax20`]: { compute: (r) => m(r, "_tmpComputeTax") + m(r, "txtTotalOtherTax") },
  ...schedOverride,
  txtDvTotalSchedI: { gate: treaty, compute: schedTotal },
  [`${P}txtTax21`]: { compute: schedTotal },
  [`${P}txtTax22`]: { compute: sum(20, 21) },
  [`${P}txtTax26`]: { compute: sum(23, 24, 25) },
  [`${P}txtTax27`]: { compute: (r) => m(r, "txtTax22") - m(r, "txtTax26") },
  [`${P}txtTax31`]: { compute: sum(28, 29, 30) },
  [`${P}txtTax32`]: { compute: (r) => m(r, "txtTax27") + m(r, "txtTax31") },
});
FORM_1601FQ.group = [ATC_1601FQ, OTHER_1601FQ];
// One AtcCd<i> checkbox per pick-list entry, checked for the entries the Part II rows came from.
FORM_1601FQ.extra_record = (state, groups): SaveRecord[] => {
  const picked = new Set(pickIndex1601FQ(state, groups));
  return pickList1601FQ(state).map((_, j) => ({ key: `AtcCd${j + 1}`, value: String(picked.has(j)) }));
};

export function validate1601FQ(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1601FQ, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  // the legacy only opens the "other tax" table once the compute table is full; earlier rows would be lost on reload
  if ((groups.other ?? []).length > 0 && (groups.atc ?? []).length < COMPUTE_ROW_COUNT) {
    problem.push({ id: `${P}txtTotalOtherTax`, message: `Fill all ${COMPUTE_ROW_COUNT} Part II rows before adding other taxes.` });
  }
  pickIndex1601FQ(state, groups).forEach((j, k) => {
    if (j < 0) problem.push({ id: `${P}txtAtcCode${k + 1}`, message: `ATC in Part II row ${k + 1} is not on this return's ATC list.` });
  });
  return problem;
}
