// BIR Form 1600 (Monthly Remittance Return of VAT and Other Percentage Taxes Withheld), P3 rewrite. Two tables:
//   • Part II ATC table (item 14): getATCCode builds one row per checked `AtcCode<i>` picker box, in pick-list order
//     (frm1600:txtAtcCd/txtTaxBase/txtTaxRate/txtTaxbeWithHeld<i>, from 1). Per row getRequiredWithheld:
//     withheld = base × rate ÷ 100; computeofTotalWithheldTax: 14 = Σ withheld, 16 = 14 − 15, 18 = 16 + 17D.
//   • Schedule II (payees): 10 STATIC rows frm1600:dtSched:txtTin/txtFullname/drpAtcCode:/naturePayment/amount/
//     txtRatePercent/taxWithheld<i>; each row's ATC comes from a second, single-choice picker (`SchedIIAtcCde<i>`
//     radios). computeDtShedTaxWithheld: taxWithheld = amount × rate ÷ 100, Σ → dtSched:TotaltaxWithheld. The
//     schedule total feeds no item — 14 is Part II's total, as in BIR.
// Reload: loadData restores the radios (item 12 → changedrpATCList builds BOTH pickers; item 13 = Yes →
// enableSelTreaty appends "N/A" to both) and the boxes; getATCCode (105 ms) rebuilds Part II; loadDataATCRow
// (1 s) refills every text field by id. So a native save emits AtcCode<i> per Part II row and every
// SchedIIAtcCde<i> radio (extra_record).
// BIR quirk kept: loadATC keeps a record that CONTAINS "1600" but not "1600WP", so the 1600VT/1600PT records are
// on this picker too; atcPickList("1600") minus the 1600WP records is that list (category "PG" never shows).

import fieldJson from "./fields/1600.json";
import { atcInListOrder, atcPickIndex, atcPickList, atcPickRecord, type AtcPick } from "./atc.ts";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1600:";
const read = (r: (id: string) => string, id: string) => parseMoney(r(P + id));
/** Schedule II has exactly 10 rows in BIR's page. */
export const SCHEDULE_ROW_COUNT = 10;

export const ATC_1600: GroupSpec = {
  name: "atc",
  size_field: "hPartIITableSize", // validate(): tblPartIIComputeTax.rows.length − 1 = the Part II row count
  first_index: 1,
  row: [
    { id: `${P}txtAtcCd`, kind: "text" },
    { id: `${P}txtTaxBase`, kind: "money" },
    { id: `${P}txtTaxRate`, kind: "text" }, // BIR's rate string from the picker, e.g. " 12.0"
    {
      id: `${P}txtTaxbeWithHeld`,
      kind: "money",
      row_compute: (r) => Math.round((parseMoney(r(`${P}txtTaxBase`)) * (parseFloat(r(`${P}txtTaxRate`)) || 0)) / 100),
    },
  ],
  total: { into: `${P}txtTax14`, of: `${P}txtTaxbeWithHeld` },
};

export const SCHEDULE_1600: GroupSpec = {
  name: "dtSched",
  first_index: 1,
  row: [
    { id: `${P}dtSched:txtTin`, kind: "text" },
    { id: `${P}dtSched:txtFullname`, kind: "text" }, // saved raw (only the payer name/LOB/address are escaped)
    { id: `${P}dtSched:drpAtcCode:{i}`, kind: "text" },
    { id: `${P}dtSched:naturePayment`, kind: "text" },
    { id: `${P}dtSched:amount`, kind: "money" },
    { id: `${P}dtSched:txtRatePercent`, kind: "text" },
    {
      id: `${P}dtSched:taxWithheld`,
      kind: "money",
      row_compute: (r) => Math.round((parseMoney(r(`${P}dtSched:amount`)) * (parseFloat(r(`${P}dtSched:txtRatePercent`)) || 0)) / 100),
    },
  ],
  total: { into: `${P}dtSched:TotaltaxWithheld`, of: `${P}dtSched:taxWithheld` },
};

/** Item 12's picker list (both pickers share it): private (j_id392:_1) or government (_2), plus "N/A" under item 13. */
export function pickList1600(state: FormState): AtcPick[] {
  const category = state[`${P}j_id392:_2`] === "true" ? "G" : "P";
  const drop = [...atcPickList("1600WP", category)];
  const list = atcPickList("1600", category).filter((e) => {
    const j = drop.findIndex((w) => w.atc_code === e.atc_code && w.rate === e.rate);
    if (j >= 0) drop.splice(j, 1);
    return j < 0;
  });
  return state[`${P}rdTreaty:_1`] === "true" ? [...list, { atc_code: "N/A", rate: "0.0" }] : list;
}

export function pickIndex1600(state: FormState, groups: GroupState): number[] {
  const row = (groups.atc ?? []).map((r: GroupRow) => ({ atc_code: r[`${P}txtAtcCd`] ?? "", rate: r[`${P}txtTaxRate`] ?? "" }));
  return atcPickIndex(pickList1600(state), row);
}

// Schedule II's indexed fields are owned by the group; its total becomes a money scalar
const schedRow = /:dtSched:(txtTin|txtFullname|drpAtcCode:|naturePayment|amount|txtRatePercent|taxWithheld)\d+$/;
const scalarField = (fieldJson as FieldJson[])
  .filter((f) => !schedRow.test(f.id))
  .map((f): FieldJson => (f.id === `${P}dtSched:TotaltaxWithheld` ? { ...f, kind: "money" } : f));

export const FORM_1600 = buildSchema("1600", "VAT & Percentage Taxes Withheld", scalarField, {
  [`${P}txtYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtPayerName`]: { required: true },
  // 15 (tax remitted on the original) is only open on an amended return; the "No" radio zeroes it
  [`${P}txtTax15`]: { gate: { on: `${P}j_id217:_1`, equals: "true" } },
  [`${P}txtTax16`]: { compute: (r) => read(r, "txtTax14") - read(r, "txtTax15") },
  [`${P}txtTax17D`]: { compute: (r) => read(r, "txtTax17A") + read(r, "txtTax17B") + read(r, "txtTax17C") },
  [`${P}txtTax18`]: { compute: (r) => read(r, "txtTax16") + read(r, "txtTax17D") },
});
FORM_1600.group = [ATC_1600, SCHEDULE_1600];
FORM_1600.extra_record = (state, groups) => {
  const list = pickList1600(state);
  // the Schedule II picker is one radio group; a native save leaves none of it chosen
  // the payee amount's onblur is round(this,2), live in every editable return (only disableAllControl, the final
  // copy, disables it), so an untouched padded row saves "0.00" once the filer tabs through, not the blank ""
  const padded = Array.from({ length: Math.max(0, SCHEDULE_ROW_COUNT - (groups.dtSched ?? []).length) }, (_, k) => ({
    key: `${P}dtSched:amount${(groups.dtSched ?? []).length + k + 1}`,
    value: "0.00",
  }));
  return [...atcPickRecord("AtcCode", list, pickIndex1600(state, groups)), ...list.map((_, j) => ({ key: `SchedIIAtcCde${j + 1}`, value: "false" })), ...padded];
};

export function validate1600(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1600, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) {
    problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  }
  const index = pickIndex1600(state, groups);
  const sched = groups.dtSched ?? [];
  if ((index.length > 0 || sched.length > 0) && state[`${P}j_id252:_1`] !== "true") {
    problem.push({ id: `${P}j_id252:_1`, message: "Item 4 must be Yes to fill Part II or Schedule II." });
  }
  index.forEach((j, k) => {
    if (j < 0) problem.push({ id: `${P}txtAtcCd${k + 1}`, message: `ATC in Part II row ${k + 1} is not on this return's ATC list.` });
  });
  if (!atcInListOrder(index.filter((j) => j >= 0))) {
    problem.push({ id: `${P}txtAtcCd1`, message: "BIR rebuilds Part II in its ATC-list order; list the rows in that order." });
  }
  if (sched.length > SCHEDULE_ROW_COUNT) problem.push({ id: `${P}dtSched:txtTin1`, message: `Schedule II holds at most ${SCHEDULE_ROW_COUNT} payees.` });
  const listed = new Set(pickList1600(state).map((e) => e.atc_code));
  // BIR's validate(), per filled row; txtTin's onblur (blockLetterInt) blanks anything that isn't a number
  sched.forEach((r, k) => {
    const i = k + 1;
    const payeeTin = r[`${P}dtSched:txtTin`] ?? "";
    if (!/^\d{12,14}$/.test(payeeTin)) problem.push({ id: `${P}dtSched:txtTin${i}`, message: `Enter the payee's 12- to 14-digit TIN (digits only) in Schedule II row ${i}.` });
    const payeeName = r[`${P}dtSched:txtFullname`] ?? "";
    if (!payeeName.trim()) problem.push({ id: `${P}dtSched:txtFullname${i}`, message: `Enter the payee's name in Schedule II row ${i}.` });
    // BIR bug: the payee name is saved unescaped and reloaded through $("#response").html(), so & < > come back
    // as &amp; &lt; &gt; (then upper-cased) — BIR cannot reopen such a name intact
    else if (/[&<>]/.test(payeeName)) problem.push({ id: `${P}dtSched:txtFullname${i}`, message: `BIR's form garbles & < > in a payee name on reopen; spell them out in Schedule II row ${i}.` });
    const atc = (r[`${P}dtSched:drpAtcCode:{i}`] ?? "").trim();
    if (!listed.has(atc) || !(r[`${P}dtSched:naturePayment`] ?? "").trim()) problem.push({ id: `${P}dtSched:drpAtcCode:${i}`, message: `Choose an ATC from this return's list for Schedule II row ${i}.` });
    if (parseMoney(r[`${P}dtSched:amount`] ?? "") <= 0) problem.push({ id: `${P}dtSched:amount${i}`, message: `Enter the amount for Schedule II row ${i}.` });
  });
  return problem;
}
