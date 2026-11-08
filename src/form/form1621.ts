// BIR Form 1621 (Quarterly Remittance Return of Tax Withheld on the Amount Withdrawn from the Decedent's
// Deposit Account), P3 — the first dynamic-schedule form built with the extended GroupSpec.
// Schedule 1 is a dynamic list; per row: Withheld = Withdrawn × txtTaxRate% (the rate lives on the form,
// default "6.0 %" → 6%). Column totals feed items; then:
//   txtTaxBase = Σ Withdrawn ; txtTaxWithheld = Σ Withheld
//   txtRemittance_Tot = Remittance_1 + Remittance_2 + Remittance_Prev
//   txtStillDue = txtTaxWithheld − txtRemittance_Tot
//   txtPen_Tot = Surcharge + Interest + Compromise
//   txtStillDue_tot = txtStillDue ≥ 0 ? txtStillDue + txtPen_Tot : txtPen_Tot   (penalty-offset quirk)

import fieldJson from "./fields/1621.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm1621:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const rate = (form: (id: string) => string): number => {
  const n = Number(String(form(`${P}txtTaxRate`)).replace(/[%\s]/g, ""));
  return Number.isFinite(n) ? n / 100 : 0; // percentStringToFloat: "6.0 %" → 0.06
};

export const SCHEDULE_1621: GroupSpec = {
  name: "sched1",
  first_index: 1, // no size field — the legacy reconstructs rows from the saved entries
  row: [
    { id: `${P}txtSched1_{i}_Withdrawn`, kind: "money" },
    {
      id: `${P}txtSched1_{i}_Withheld`,
      kind: "money",
      row_compute: (r, form) => parseMoney((parseMoney(r(`${P}txtSched1_{i}_Withdrawn`)) / 100) * rate(form)),
    },
  ],
  total: [
    { into: `${P}txtSched1_Total_Withdrawn`, of: `${P}txtSched1_{i}_Withdrawn` },
    { into: `${P}txtSched1_Total_Withheld`, of: `${P}txtSched1_{i}_Withheld` },
  ],
};

const scalarField = (fieldJson as FieldJson[]).filter((f) => !/txtSched1_\{?i?\}?_|txtSched1_\d+_/.test(f.id));

export const FORM_1621 = buildSchema("1621", "Quarterly WHT on Decedent's Deposit Withdrawal", scalarField, {
  [`${P}tinA`]: { required: true },
  [`${P}tinB`]: { required: true },
  [`${P}tinC`]: { required: true },
  [`${P}branchCode`]: { required: true },
  [`${P}rdoCode`]: { required: true },
  [`${P}registeredName`]: { required: true },
  [`${P}txtYear`]: { required: true },
  [`${P}txtTaxRate`]: { kind: "text" },
  [`${P}txtTaxBase`]: { kind: "money", compute: (r) => m(r, "txtSched1_Total_Withdrawn") },
  [`${P}txtTaxWithheld`]: { kind: "money", compute: (r) => m(r, "txtSched1_Total_Withheld") },
  [`${P}txtRemittance_1`]: { kind: "money" },
  [`${P}txtRemittance_2`]: { kind: "money" },
  [`${P}txtRemittance_Prev`]: { kind: "money" },
  [`${P}txtRemittance_Tot`]: { kind: "money", compute: (r) => m(r, "txtRemittance_1") + m(r, "txtRemittance_2") + m(r, "txtRemittance_Prev") },
  [`${P}txtStillDue`]: { kind: "money", compute: (r) => m(r, "txtTaxWithheld") - (m(r, "txtRemittance_1") + m(r, "txtRemittance_2") + m(r, "txtRemittance_Prev")) },
  [`${P}txtPen_Surcharge`]: { kind: "money" },
  [`${P}txtPen_Interest`]: { kind: "money" },
  [`${P}txtPen_Compromise`]: { kind: "money" },
  [`${P}txtPen_Tot`]: { kind: "money", compute: (r) => m(r, "txtPen_Surcharge") + m(r, "txtPen_Interest") + m(r, "txtPen_Compromise") },
  [`${P}txtStillDue_tot`]: {
    kind: "money",
    compute: (r) => {
      const still = m(r, "txtStillDue");
      const pen = m(r, "txtPen_Surcharge") + m(r, "txtPen_Interest") + m(r, "txtPen_Compromise");
      return still >= 0 ? still + pen : pen;
    },
  },
});
FORM_1621.group = [SCHEDULE_1621];

export function validate1621(state: FormState, _groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_1621, state);
  const tin = `${state[`${P}tinA`] ?? ""}${state[`${P}tinB`] ?? ""}${state[`${P}tinC`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}tinA`, message: "The TIN's check digit doesn't match." });
  return problem;
}
