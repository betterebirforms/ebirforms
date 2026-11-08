import type { NativeForm } from "../registry.ts";
import { FORM_1700, P } from "../form1700.ts";
import { validate as validateRequired } from "../schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const form: NativeForm = {
  schema: FORM_1700,
  validate: (state) => {
    const problem = validateRequired(FORM_1700, state);
    const tin = `${state[`${P}txtPg1Pt1I5TIN1`] ?? ""}${state[`${P}txtPg1Pt1I5TIN2`] ?? ""}${state[`${P}txtPg1Pt1I5TIN3`] ?? ""}`;
    if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1Pt1I5TIN1`, message: "The TIN's check digit doesn't match." });
    return problem;
  },
  label: {
    [`${P}txtYear`]: "Year (YY)", [`${P}txtPg1Pt1I5TIN1`]: "TIN", [`${P}txtPg1Pt1I6RDOCode`]: "RDO code",
    [`${P}txtPg1Pt1I8TaxFilerLastName`]: "Tax filer last name", [`${P}txtPg1Pt1I9Address1`]: "Registered address",
    [`${P}rdoPg1Pt1I3JointFilingYes`]: "3 — Joint filing", [`${P}rdoPg1Pt1I13MarriedInd`]: "13 — Married",
    [`${P}txtPg1Pt2I25TotalIncomeTaxDue`]: "25 — Total income tax due", [`${P}txtPg1Pt2I28NetTaxPayable`]: "28 — Net tax payable",
    [`${P}txtPg1Pt2I31`]: "31 — Total amount payable / (overpayment)",
  },
  periodName: (s) => `${s[`${P}txtYear`] ?? ""}`,
  prefill: {
    [`${P}txtPg1Pt1I5TIN1`]: "tin1", [`${P}txtPg1Pt1I5TIN2`]: "tin2", [`${P}txtPg1Pt1I5TIN3`]: "tin3", [`${P}txtPg1Pt1I5BranchCode`]: "tin4",
    [`${P}txtPg1Pt1I6RDOCode`]: "rdo", [`${P}txtPg1Pt1I8TaxFilerLastName`]: "fn", [`${P}txtPg1Pt1I9Address1`]: "regAddr",
    [`${P}txtPg1Pt1I9ZipCode`]: "zip", [`${P}txtPg1Pt1I12ContactNo`]: "telNo",
    [`${P}txtPg2Pt4TIN1`]: "tin1", [`${P}txtPg2Pt4TIN2`]: "tin2", [`${P}txtPg2Pt4TIN3`]: "tin3",
    [`${P}txtPg3Pt5TIN1`]: "tin1", [`${P}txtPg3Pt5TIN2`]: "tin2", [`${P}txtPg3Pt5TIN3`]: "tin3",
    [`${P}txtPg4TIN1`]: "tin1", [`${P}txtPg4TIN2`]: "tin2", [`${P}txtPg4TIN3`]: "tin3",
  },
};
export default form;
