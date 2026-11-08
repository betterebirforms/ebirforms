// BIR Form 1601-F (Monthly Remittance Return of Final Income Taxes Withheld), P3 rewrite. Two tables:
//   • Part II ATC table (item 14): getATCCode builds one row per checked `AtcCd<i>` picker box, in pick-list order
//     (frm1601F:txtAtcCode/txtTaxBase/txtTaxRate/txtTaxbeWithHeld<i>, from 1). Per row withheld = base × rate ÷ 100;
//     computeofTotalWithheldTax: 14 = Σ withheld.
//   • Schedule I (treaty / special-law relief, a DYNAMIC modal): rows chxSchedI/drpTreatyCode/drpATCCode/
//     txtAmtIncomePay/txtRate/txtReqWithheld<i> from 0. Per row txtReqWithheld = amount × rate ÷ 100;
//     Σ → txtDvTotalSchedI → 15.
// Chain: 16 = 14 + 15, 18 = 16 − 17, 19D = 19A+19B+19C, 20 = 18 + 19D.
// Reload: loadData restores the radios (item 12 → changedrpATCList builds the picker) and the AtcCd boxes;
// getATCCode rebuilds Part II; one addlistSchedIReload per `chxSchedI<digit>` record rebuilds Schedule I (BIR has
// no size field for it); loadDataWithATC / loadData / loadDataATCRow refill by id; getSchedI recommits Schedule I
// and recomputes the chain. So a native save emits AtcCd<i> per Part II row (extra_record) and a chxSchedI marker
// per Schedule I row.
// BIR bugs kept: loadATC keeps an atcCodes.xml record when it CONTAINS "1601F", so the 1601FQ records land on this
// picker too (58 private / 72 government entries, codes repeated); atcPickList("1601F") is that list verbatim.
// loadData fires only item 12's onclick, never item 13's enableSelTreaty, so the "N/A" special-law picker entry
// is not rebuilt on reopen and a Part II row for it is silently dropped — the native form refuses such a row.

import fieldJson from "./fields/1601F.json";
import { atcInListOrder, atcPickIndex, atcPickList, atcPickRecord, type AtcPick } from "./atc.ts";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1601F:";
const read = (r: (id: string) => string, id: string) => parseMoney(r(P + id));

export const ATC_1601F: GroupSpec = {
  name: "atc",
  first_index: 1,
  row: [
    { id: `${P}txtAtcCode`, kind: "text" },
    { id: `${P}txtTaxBase`, kind: "money" },
    { id: `${P}txtTaxRate`, kind: "text" }, // BIR's rate string from the picker, e.g. " 20.0"
    {
      id: `${P}txtTaxbeWithHeld`,
      kind: "money",
      row_compute: (r) => Math.round((parseMoney(r(`${P}txtTaxBase`)) * (parseFloat(r(`${P}txtTaxRate`)) || 0)) / 100),
    },
  ],
  total: { into: `${P}txtTax14`, of: `${P}txtTaxbeWithHeld` },
};

// Schedule I rows: fields are UN-prefixed (the legacy form uses getElementById('txtAmtIncomePay'+i)). The row's
// delete checkbox chxSchedI<i> — the marker the reload counts — is written by extra_record as "false".
export const SCHEDULE_1601F: GroupSpec = {
  name: "schedI",
  first_index: 0,
  row: [
    { id: "drpTreatyCode", kind: "select" }, // "NA" or a treaty code
    { id: "drpATCCode", kind: "select" }, // "NA" or a code on item 12's ATC list
    { id: "txtAmtIncomePay", kind: "money" },
    { id: "txtRate", kind: "money" }, // the rate field's onblur is round(this,2): BIR keeps it as "10.00"
    {
      id: "txtReqWithheld",
      kind: "money",
      row_compute: (r) => Math.round((parseMoney(r("txtAmtIncomePay")) * (parseFloat(r("txtRate").replace(/,/g, "")) || 0)) / 100),
    },
  ],
  total: { into: "txtDvTotalSchedI", of: "txtReqWithheld" },
};

/** Item 12's picker list: private (CatAgent_P) or government (CatAgent_G). No "N/A" — see the reload bug above. */
export const pickList1601F = (state: FormState): AtcPick[] => atcPickList("1601F", state[`${P}CatAgent_G`] === "true" ? "G" : "P");

export function pickIndex1601F(state: FormState, groups: GroupState): number[] {
  const row = (groups.atc ?? []).map((r: GroupRow) => ({ atc_code: r[`${P}txtAtcCode`] ?? "", rate: r[`${P}txtTaxRate`] ?? "" }));
  return atcPickIndex(pickList1601F(state), row);
}

const scalarField = (fieldJson as FieldJson[]).map((f): FieldJson => (f.id === "txtDvTotalSchedI" ? { ...f, kind: "money" } : f));

export const FORM_1601F = buildSchema("1601F", "Final Income Taxes Withheld", scalarField, {
  [`${P}j_id201`]: { required: true },
  [`${P}txtYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true },
  [`${P}txtTax15`]: { compute: (r) => parseMoney(r("txtDvTotalSchedI")) },
  [`${P}txtTax16`]: { compute: (r) => read(r, "txtTax14") + read(r, "txtTax15") },
  // 17 (tax remitted on the original) is only open on an amended return; the "No" radio zeroes it
  [`${P}txtTax17`]: { gate: { on: `${P}AmendedRtn_1`, equals: "true" } },
  [`${P}txtTax18`]: { compute: (r) => read(r, "txtTax16") - read(r, "txtTax17") },
  [`${P}txtTax19D`]: { compute: (r) => read(r, "txtTax19A") + read(r, "txtTax19B") + read(r, "txtTax19C") },
  [`${P}txtTax20`]: { compute: (r) => read(r, "txtTax18") + read(r, "txtTax19D") },
});
FORM_1601F.group = [ATC_1601F, SCHEDULE_1601F];
FORM_1601F.extra_record = (state, groups) => [
  ...atcPickRecord("AtcCd", pickList1601F(state), pickIndex1601F(state, groups)),
  ...(groups.schedI ?? []).map((_, i) => ({ key: `chxSchedI${i}`, value: "false" })),
];

export function validate1601F(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1601F, state);
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) {
    problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  }
  const index = pickIndex1601F(state, groups);
  const sched = groups.schedI ?? [];
  if ((index.length > 0 || sched.length > 0) && state[`${P}TaxWithheld_1`] !== "true") {
    problem.push({ id: `${P}TaxWithheld_1`, message: "Item 4 must be Yes to fill Part II or Schedule I." });
  }
  index.forEach((j, k) => {
    if (j < 0) problem.push({ id: `${P}txtAtcCode${k + 1}`, message: `ATC in Part II row ${k + 1} is not on this return's ATC list.` });
  });
  if (!atcInListOrder(index.filter((j) => j >= 0))) {
    problem.push({ id: `${P}txtAtcCode1`, message: "BIR rebuilds Part II in its ATC-list order; list the rows in that order." });
  }
  // showAddSchedI opens Schedule I only under item 13 = Yes with a relief type; ifRequirementMeetSched1 then
  // refuses a row without a treaty, an ATC, or an amount (and the reload would not recommit it)
  if (sched.length > 0 && (state[`${P}SpecialTax_1`] !== "true" || (state[`${P}drpSpecialTax`] ?? "0") === "0")) {
    problem.push({ id: `${P}SpecialTax_1`, message: "Schedule I applies only when item 13 (tax relief) is Yes with a relief type." });
  }
  const atcCode = new Set(pickList1601F(state).map((e) => e.atc_code));
  sched.forEach((r, i) => {
    const treaty = (r.drpTreatyCode ?? "").trim();
    const atc = (r.drpATCCode ?? "").trim();
    if (treaty === "" || treaty === "-") problem.push({ id: `drpTreatyCode${i}`, message: `Choose a treaty code for Schedule I row ${i + 1}.` });
    if (atc !== "NA" && !atcCode.has(atc)) problem.push({ id: `drpATCCode${i}`, message: `Schedule I row ${i + 1}: choose NA or an ATC on this return's list.` });
    if (parseMoney(r.txtAmtIncomePay ?? "") === 0) problem.push({ id: `txtAmtIncomePay${i}`, message: `Enter the income payment for Schedule I row ${i + 1}.` });
  });
  return problem;
}
