// BIR Form 1601-EQ (Quarterly Remittance Return of Creditable Income Taxes Withheld — Expanded), P3 rewrite.
// Part II (items 13–18 + "Other Selected ATC"): getATCCode builds the rows from the picker's checked `AtcCode<i>`
// boxes, in pick-list order. Six picks or fewer fill the compute table (1–6, the rest padded empty); from the 7th
// pick on, the first 6 go to the compute table and the rest to the "other" table (7+) — ONE index space for both
// (frm1601EQ:txtAtcCd/txtTaxBase/txtTaxRate/txtTaxbeWithHeld<i>). Per row withheld = base × rate ÷ 100.
// computeofTotalWithheldTax: 19 = Σ every row; computeTotalOtherWithheldTax: txtTotalOtherTax = Σ rows 7+.
// Chain: 24 = 20+21+22+23 ; 25 = 19 − 24 ; 29 = 26+27+28 ; 30 = 25 + 29.
// Reload: loadData restores the radios (item 11 → changeCategory → changedrpATCList builds the picker) and the
// AtcCode boxes, getATCCode rebuilds the rows, loadDataATCRow refills every text field by id — so a native save
// emits AtcCode<i> per row (extra_record). loadATC matches "1601EQ"; no longer form code contains it.
// BIR quirks kept: validateForm stores hPartIITableSize = tblPartIIComputeTax.rows.length − 1, which counts the
// thead and tfoot rows too, so a validated save always says "7"; saveXML writes item 8's two address lines as ONE
// `txtAddress` key (escape(line 1) + escape(line 2)) and loadData splits that at 127 ESCAPED characters.

import fieldJson from "./fields/1601EQ.json";
import { atcInListOrder, atcPickIndex, atcPickList, atcPickRecord, type AtcPick } from "./atc.ts";
import { parseMoney } from "./money.ts";
import { buildSchema, computeForm, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { legacyEscape, type SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1601EQ:";
const read = (r: (id: string) => string, id: string) => parseMoney(r(P + id));
const T = (n: number) => `${P}txtTax${n}`;
const sum = (...n: number[]) => (r: (id: string) => string) => n.reduce((s, i) => s + read(r, `txtTax${i}`), 0);
/** The compute table holds the first 6 picks; getATCCode routes the 7th onward to the "other" table. */
export const COMPUTE_ROW_COUNT = 6;

const partIIRow = (): GroupSpec["row"] => [
  { id: `${P}txtAtcCd`, kind: "text" },
  { id: `${P}txtTaxBase`, kind: "money" },
  { id: `${P}txtTaxRate`, kind: "text" }, // BIR's rate string from the picker, e.g. " 2.0"
  { id: `${P}txtTaxbeWithHeld`, kind: "money", row_compute: (r) => Math.round((parseMoney(r(`${P}txtTaxBase`)) * (parseFloat(r(`${P}txtTaxRate`)) || 0)) / 100) },
];
export const SCHEDULE_1601EQ: GroupSpec = {
  name: "atc",
  first_index: 1,
  row: partIIRow(),
  total: { into: `${P}_tmpComputeTax`, of: `${P}txtTaxbeWithHeld` },
};
export const OTHER_1601EQ: GroupSpec = {
  name: "other",
  first_index: COMPUTE_ROW_COUNT + 1,
  row: partIIRow(),
  total: { into: `${P}txtTotalOtherTax`, of: `${P}txtTaxbeWithHeld` },
};

/** The picker list for item 11's category: private (P) or government (G). */
export const pickList1601EQ = (state: FormState): AtcPick[] => atcPickList("1601EQ", state[`${P}optCategory:G`] === "true" ? "G" : "P");

export function pickIndex1601EQ(state: FormState, groups: GroupState): number[] {
  const row = [...(groups.atc ?? []), ...(groups.other ?? [])].map((r: GroupRow) => ({ atc_code: r[`${P}txtAtcCd`] ?? "", rate: r[`${P}txtTaxRate`] ?? "" }));
  return atcPickIndex(pickList1601EQ(state), row);
}

const rowStem = new RegExp(`^${P}(txtAtcCd|txtTaxBase|txtTaxRate|txtTaxbeWithHeld)\\d+$`);
const scalarField = (fieldJson as FieldJson[])
  .filter((f) => !rowStem.test(f.id))
  .map((f): FieldJson => (f.id === `${P}txtTotalOtherTax` ? { ...f, kind: "money" } : f));

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  // 1601EQ's saveXML escapes only the name and address; the line of business is written (and reloaded) raw
  [`${P}txtLineBus`]: { escaped: false },
  [T(19)]: { compute: (r) => read(r, "_tmpComputeTax") + read(r, "txtTotalOtherTax") },
  [T(24)]: { compute: sum(20, 21, 22, 23) },
  [T(25)]: { compute: (r) => read(r, "txtTax19") - read(r, "txtTax24") },
  [T(29)]: { compute: sum(26, 27, 28) },
  [T(30)]: { compute: (r) => read(r, "txtTax25") + read(r, "txtTax29") },
};
export const FORM_1601EQ = buildSchema("1601EQ", "Quarterly Creditable Taxes Withheld (Expanded)", scalarField, override);
FORM_1601EQ.group = [SCHEDULE_1601EQ, OTHER_1601EQ];
FORM_1601EQ.extra_record = (state, groups): SaveRecord[] => [
  ...atcPickRecord("AtcCode", pickList1601EQ(state), pickIndex1601EQ(state, groups)),
  { key: "hPartIITableSize", value: "7" },
  // item 8 as saveXML writes it: both address lines in the one txtAddress key; txtAddress2 itself is never saved
  { key: `${P}txtAddress`, value: legacyEscape(state[`${P}txtAddress`] ?? "") + legacyEscape(state[`${P}txtAddress2`] ?? "") },
  { key: `${P}txtAddress2`, value: "" },
];

const OVERPAYMENT = ["ifRefund", "ifIssueCert", "ifCarriedOver"].map((id) => `${P}${id}`);

export function validate1601EQ(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1601EQ, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) {
    problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  }
  // the legacy only opens the "other" table once the compute table is full; earlier rows would move on reload
  if ((groups.other ?? []).length > 0 && (groups.atc ?? []).length < COMPUTE_ROW_COUNT) {
    problem.push({ id: `${P}txtTotalOtherTax`, message: `Fill all ${COMPUTE_ROW_COUNT} Part II rows before adding other ATCs.` });
  }
  const index = pickIndex1601EQ(state, groups);
  if (index.length > 0 && state[`${P}optWithheld:Y`] !== "true") {
    problem.push({ id: `${P}optWithheld:Y`, message: "Item 4 must be Yes to list ATCs in Part II." });
  }
  index.forEach((j, k) => {
    if (j < 0) problem.push({ id: `${P}txtAtcCd${k + 1}`, message: `ATC in Part II row ${k + 1} is not on this return's ATC list.` });
  });
  if (!atcInListOrder(index.filter((j) => j >= 0))) {
    problem.push({ id: `${P}txtAtcCd1`, message: "BIR rebuilds Part II in its ATC-list order; list the rows in that order." });
  }
  // computeOfTotalAmtDue unchecks and disables the overpayment boxes unless 30 is negative; validateForm then
  // demands one of them when it is
  const due = parseMoney(computeForm(FORM_1601EQ, state, groups)[T(30)] ?? "0.00");
  const chosen = OVERPAYMENT.filter((id) => state[id] === "true");
  if (due >= 0 && chosen.length > 0) problem.push({ id: chosen[0]!, message: "An overpayment option applies only when item 30 is negative." });
  if (due < 0 && chosen.length !== 1) problem.push({ id: OVERPAYMENT[0]!, message: "Choose one overpayment option for item 30." });
  return problem;
}
