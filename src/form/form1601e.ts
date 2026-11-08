// BIR Form 1601-E (Monthly Remittance Return of Creditable Income Taxes Withheld — Expanded), P3 rewrite.
// Part II is the ATC table: rows are built at runtime by getATCCode from the picker's checked `AtcCode<i>` boxes,
// in pick-list order (frm1601E:txtAtcCd/txtTaxBase/txtTaxRate/txtTaxbeWithHeld<i>, from 1). Per row
// getRequiredWithheld: withheld = base × rate ÷ 100; computeofTotalWithheldTax: 14 = Σ withheld.
// Compute (exact centavo): 15C = 15A+15B, 16 = 14 − 15C, 17D = 17A+17B+17C, 18 = 16 + 17D.
// Reload: loadData restores the radios (item 12 → changedrpATCList builds the picker; item 13 = Yes →
// enableSelTreaty appends "N/A") and the AtcCode boxes, getATCCode rebuilds one row per checked box, and
// loadDataATCRow refills every text field by id — so a native save emits AtcCode<i> per row (extra_record).
// BIR bug kept: loadATC keeps an atcCodes.xml record when it CONTAINS "1601E", so every 1601EQ record lands on
// this picker too (204 private entries, most codes twice). atcPickList("1601E") reproduces that list verbatim.

import fieldJson from "./fields/1601E.json";
import { atcInListOrder, atcPickIndex, atcPickList, atcPickRecord, type AtcPick } from "./atc.ts";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1601E:";
const read = (r: (id: string) => string, id: string) => parseMoney(r(P + id));

export const ATC_1601E: GroupSpec = {
  name: "atc",
  size_field: "hPartIITableSize",
  first_index: 1,
  row: [
    { id: `${P}txtAtcCd`, kind: "text" },
    { id: `${P}txtTaxBase`, kind: "money" },
    { id: `${P}txtTaxRate`, kind: "text" }, // BIR's rate string from the picker, e.g. " 2.0"
    {
      id: `${P}txtTaxbeWithHeld`,
      kind: "money",
      row_compute: (r) => Math.round((parseMoney(r(`${P}txtTaxBase`)) * (parseFloat(r(`${P}txtTaxRate`)) || 0)) / 100),
    },
  ],
  total: { into: `${P}txtTax14`, of: `${P}txtTaxbeWithHeld` },
};

/** The picker list: private (item 12 = P, j_id392:_1) or government (G), plus enableSelTreaty's "N/A" entry when
 *  item 13 (tax treaty / special law) is Yes. */
export function pickList1601E(state: FormState): AtcPick[] {
  const list = atcPickList("1601E", state[`${P}j_id392:_2`] === "true" ? "G" : "P");
  return state[`${P}j_id398:_1`] === "true" ? [...list, { atc_code: "N/A", rate: "0.0" }] : list;
}

export function pickIndex1601E(state: FormState, groups: GroupState): number[] {
  const row = (groups.atc ?? []).map((r: GroupRow) => ({ atc_code: r[`${P}txtAtcCd`] ?? "", rate: r[`${P}txtTaxRate`] ?? "" }));
  return atcPickIndex(pickList1601E(state), row);
}

export const FORM_1601E = buildSchema("1601E", "Monthly Remittance (Expanded)", fieldJson as FieldJson[], {
  [`${P}txtYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  // item 13's special-law select: disableSelTreaty resets it to "-" and disables it
  [`${P}j_id402`]: { gate: { on: `${P}j_id398:_1`, equals: "true" } },
  // 15A (prior over-remittance) is only open on an amended return; the "No" radio zeroes it
  [`${P}txtTax15A`]: { gate: { on: `${P}j_id217:_1`, equals: "true" } },
  [`${P}txtTax15C`]: { compute: (r) => read(r, "txtTax15A") + read(r, "txtTax15B") },
  [`${P}txtTax16`]: { compute: (r) => read(r, "txtTax14") - read(r, "txtTax15C") },
  [`${P}txtTax17D`]: { compute: (r) => read(r, "txtTax17A") + read(r, "txtTax17B") + read(r, "txtTax17C") },
  [`${P}txtTax18`]: { compute: (r) => read(r, "txtTax16") + read(r, "txtTax17D") },
});
FORM_1601E.group = [ATC_1601E];
FORM_1601E.extra_record = (state, groups) => atcPickRecord("AtcCode", pickList1601E(state), pickIndex1601E(state, groups));

export function validate1601E(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1601E, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) {
    problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  }
  const index = pickIndex1601E(state, groups);
  if (index.length > 0 && state[`${P}j_id252:_1`] !== "true") {
    problem.push({ id: `${P}j_id252:_1`, message: "Item 4 must be Yes to list ATCs in Part II." });
  }
  index.forEach((j, k) => {
    if (j < 0) problem.push({ id: `${P}txtAtcCd${k + 1}`, message: `ATC in Part II row ${k + 1} is not on this return's ATC list.` });
  });
  if (!atcInListOrder(index.filter((j) => j >= 0))) {
    problem.push({ id: `${P}txtAtcCd1`, message: "BIR rebuilds Part II in its ATC-list order; list the rows in that order." });
  }
  return problem;
}
