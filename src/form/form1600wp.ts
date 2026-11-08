// BIR Form 1600WP (Remittance Return of Percentage Tax on Winnings and Prizes), P3 rewrite. Two tables:
//   • Part II ATC table (item 12): getATCCode builds one row per checked `AtcCd<i>` picker box, in pick-list order
//     (frm1600WP:txtAtcCode/txtTaxBase/txtTaxRate/txtTaxbeWithHeld<i>, from 1). Per row withheld = base × rate ÷ 100;
//     computeofTotalWithheldTax: 12 = Σ withheld, 14 = 12 − 13, 16 = 15D + 14.
//   • Schedule II (payees): 10 STATIC rows frm1600WP:dtSched:txtTin/txtFullname/drpAtcCode/naturePayment/amount/
//     txtRatePercent/taxWithheld<i>; each row's ATC comes from a second, single-choice picker (`SchedIIAtcCde<i>`
//     radios). Σ taxWithheld → dtSched:TotaltaxWithheld, which feeds no item — 12 is Part II's total, as in BIR.
// Reload: loadData restores the radios (item 11 → changedrpATCList builds BOTH pickers) and the boxes; getATCCode
// (105 ms) rebuilds Part II; loadDataATCRow (600 ms) refills every text field by id. So a native save emits AtcCd<i>
// per Part II row and every SchedIIAtcCde<i> radio (extra_record). loadATC matches "1600WP" (2 entries per category).
// BIR bug kept: computeDtShedTaxWithheld rounds the rate FRACTION to 2 places before multiplying —
// amount × (rate ÷ 100).toFixed(2) — so a 0.5% row withholds at 1%; the row is then .toFixed(2) and formatCurrency'd.

import fieldJson from "./fields/1600WP.json";
import { atcInListOrder, atcPickIndex, atcPickList, atcPickRecord, type AtcPick } from "./atc.ts";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1600WP:";
const read = (r: (id: string) => string, id: string) => parseMoney(r(P + id));
/** Schedule II has exactly 10 rows in BIR's page. */
export const SCHEDULE_ROW_COUNT = 10;

export const ATC_1600WP: GroupSpec = {
  name: "atc",
  size_field: "hPartIITableSize", // validate(): tblPartIIComputeTax.rows.length − 1 = the Part II row count
  first_index: 1,
  row: [
    { id: `${P}txtAtcCode`, kind: "text" },
    { id: `${P}txtTaxBase`, kind: "money" },
    { id: `${P}txtTaxRate`, kind: "text" }, // BIR's rate string from the picker, e.g. " 4.0"
    {
      id: `${P}txtTaxbeWithHeld`,
      kind: "money",
      row_compute: (r) => Math.round((parseMoney(r(`${P}txtTaxBase`)) * (parseFloat(r(`${P}txtTaxRate`)) || 0)) / 100),
    },
  ],
  total: { into: `${P}txtTax12`, of: `${P}txtTaxbeWithHeld` },
};

/** computeDtShedTaxWithheld's float arithmetic, verbatim (see the rate-fraction bug above), in centavos. */
export function schedWithheld1600WP(amount: string, rate: string): number {
  const pesos = parseMoney(amount) / 100;
  const fraction = Number(((parseFloat(rate) || 0) / 100).toFixed(2));
  return parseMoney((pesos * fraction).toFixed(2));
}

export const SCHEDULE_1600WP: GroupSpec = {
  name: "dtSched",
  first_index: 1,
  row: [
    { id: `${P}dtSched:txtTin`, kind: "text" },
    { id: `${P}dtSched:txtFullname`, kind: "text" }, // 1600WP saves this raw (no escape/unescape)
    { id: `${P}dtSched:drpAtcCode`, kind: "text" },
    { id: `${P}dtSched:naturePayment`, kind: "text" },
    { id: `${P}dtSched:amount`, kind: "money" },
    { id: `${P}dtSched:txtRatePercent`, kind: "text" },
    { id: `${P}dtSched:taxWithheld`, kind: "money", row_compute: (r) => schedWithheld1600WP(r(`${P}dtSched:amount`), r(`${P}dtSched:txtRatePercent`)) },
  ],
  total: { into: `${P}dtSched:TotaltaxWithheld`, of: `${P}dtSched:taxWithheld` },
};

/** Item 11's picker list (both pickers share it): private (CategoryAgent_P) or government (CategoryAgent_G). */
export const pickList1600WP = (state: FormState): AtcPick[] => atcPickList("1600WP", state[`${P}CategoryAgent_G`] === "true" ? "G" : "P");

export function pickIndex1600WP(state: FormState, groups: GroupState): number[] {
  const row = (groups.atc ?? []).map((r: GroupRow) => ({ atc_code: r[`${P}txtAtcCode`] ?? "", rate: r[`${P}txtTaxRate`] ?? "" }));
  return atcPickIndex(pickList1600WP(state), row);
}

// the schedule's indexed fields (dtSched:*<n>) are owned by the group, not the scalar schema — strip them so
// a field isn't serialized twice (the legacy loader takes the first `key=` match, which would be the empty one)
const scalarField = (fieldJson as FieldJson[])
  .filter((f) => !/:dtSched:[A-Za-z]+\d+$/.test(f.id))
  .map((f): FieldJson => (f.id === `${P}dtSched:TotaltaxWithheld` ? { ...f, kind: "money" } : f));

export const FORM_1600WP = buildSchema("1600WP", "Percentage Tax on Winnings/Prizes", scalarField, {
  [`${P}DateWithholdingMonth`]: { required: true },
  [`${P}DateWithholdingYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  // 13 (tax remitted on the original) is only open on an amended return; the "No" radio zeroes it
  [`${P}txtTax13`]: { gate: { on: `${P}AmendedReturn_1`, equals: "true" } },
  // txtTax12 is filled from the Part II total by computeForm; the rest chain off it
  [`${P}txtTax14`]: { compute: (r) => read(r, "txtTax12") - read(r, "txtTax13") },
  [`${P}txtTax15D`]: { compute: (r) => read(r, "txtTax15A") + read(r, "txtTax15B") + read(r, "txtTax15C") },
  [`${P}txtTax16`]: { compute: (r) => read(r, "txtTax15D") + read(r, "txtTax14") },
});
FORM_1600WP.group = [ATC_1600WP, SCHEDULE_1600WP];
FORM_1600WP.extra_record = (state, groups) => {
  const list = pickList1600WP(state);
  // the Schedule II picker is one radio group; a native save leaves none of it chosen
  // the payee amount's onblur is round(this,2), live in every editable return (only disableAllControl, the final
  // copy, disables it), so an untouched padded row saves "0.00" once the filer tabs through, not the blank ""
  const padded = Array.from({ length: Math.max(0, SCHEDULE_ROW_COUNT - (groups.dtSched ?? []).length) }, (_, k) => ({
    key: `${P}dtSched:amount${(groups.dtSched ?? []).length + k + 1}`,
    value: "0.00",
  }));
  return [...atcPickRecord("AtcCd", list, pickIndex1600WP(state, groups)), ...list.map((_, j) => ({ key: `SchedIIAtcCde${j + 1}`, value: "false" })), ...padded];
};

export function validate1600WP(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1600WP, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) {
    problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  }
  const index = pickIndex1600WP(state, groups);
  const sched = groups.dtSched ?? [];
  if ((index.length > 0 || sched.length > 0) && state[`${P}AnyTaxHeld_1`] !== "true") {
    problem.push({ id: `${P}AnyTaxHeld_1`, message: "Item 4 must be Yes to fill Part II or Schedule II." });
  }
  index.forEach((j, k) => {
    if (j < 0) problem.push({ id: `${P}txtAtcCode${k + 1}`, message: `ATC in Part II row ${k + 1} is not on this return's ATC list.` });
  });
  if (!atcInListOrder(index.filter((j) => j >= 0))) {
    problem.push({ id: `${P}txtAtcCode1`, message: "BIR rebuilds Part II in its ATC-list order; list the rows in that order." });
  }
  if (sched.length > SCHEDULE_ROW_COUNT) problem.push({ id: `${P}dtSched:txtTin1`, message: `Schedule II holds at most ${SCHEDULE_ROW_COUNT} payees.` });
  const listed = new Set(pickList1600WP(state).map((e) => e.atc_code));
  sched.forEach((r, k) => {
    const i = k + 1;
    // txtTin's onblur (blockLetterInt) blanks anything that isn't a number
    if (!/^\d+$/.test(r[`${P}dtSched:txtTin`] ?? "")) problem.push({ id: `${P}dtSched:txtTin${i}`, message: `Enter the payee's TIN (digits only) in Schedule II row ${i}.` });
    const payeeName = r[`${P}dtSched:txtFullname`] ?? "";
    // BIR bug: the payee name is saved unescaped and reloaded through $("#response").html(), so & < > come back
    // as &amp; &lt; &gt; — BIR cannot reopen such a name intact
    if (/[&<>]/.test(payeeName)) problem.push({ id: `${P}dtSched:txtFullname${i}`, message: `BIR's form garbles & < > in a payee name on reopen; spell them out in Schedule II row ${i}.` });
    if (!listed.has((r[`${P}dtSched:drpAtcCode`] ?? "").trim())) problem.push({ id: `${P}dtSched:drpAtcCode${i}`, message: `Choose an ATC from this return's list for Schedule II row ${i}.` });
  });
  return problem;
}
