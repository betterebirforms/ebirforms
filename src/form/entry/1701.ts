import type { NativeForm } from "../registry.ts";
import { FORM_1701, P, validate1701 } from "../form1701.ts";

const ab = (stem: string, text: string): Record<string, string> => ({ [`${P}${stem}C1`]: `${text} — taxpayer`, [`${P}${stem}C2`]: `${text} — spouse` });

const form: NativeForm = {
  schema: FORM_1701,
  validate: (state) => validate1701(state),
  label: {
    [`${P}ddlPg1I1Month`]: "1 — For the year: month", [`${P}txtPg1I1Year`]: "1 — For the year (YY)",
    [`${P}rdoPg1I2AmmendYes`]: "2 — Amended return: Yes", [`${P}rdoPg1I2AmmendNo`]: "2 — Amended return: No",
    [`${P}rdoPg1I3ShortPeriodYes`]: "3 — Short period return: Yes", [`${P}rdoPg1I3ShortPeriodNo`]: "3 — Short period return: No",
    [`${P}rdoPg1Pt1I4Compensation`]: "4 — ATC: compensation income", [`${P}rdoPg1Pt1I4Business`]: "4 — ATC: business / profession",
    [`${P}rdoPg1Pt1I4Mixed`]: "4 — ATC: mixed income",
    [`${P}txtPg1Pt1I5TIN1`]: "5 — TIN", [`${P}ddlPg1Pt1I6RDOCode`]: "6 — RDO code",
    [`${P}txtPg1Pt1I8TaxFiler`]: "8 — Taxpayer's last name", [`${P}txtPg1Pt1I8TaxFilerFirstName`]: "8 — First name",
    [`${P}txtPg1Pt1I8TaxFilerMiddleName`]: "8 — Middle name", [`${P}txtPg1Pt1I10Address`]: "10 — Registered address",
    [`${P}txtPg1Pt1I13Contact`]: "13 — Contact number", [`${P}txtPg1Pt1I17Business`]: "17 — Line of business",
    [`${P}txtPg1Pt2I26IncomeTax`]: "26 — Income tax due", [`${P}txtPg1Pt2I27LessTotalTax`]: "27 — Less: total tax credits/payments",
    [`${P}txtPg1Pt2I28NetTax`]: "28 — Net tax payable/(overpayment)", [`${P}txtPg1Pt2I31TotalPenalties`]: "31 — Total penalties",
    [`${P}txtPg1Pt2I32TotalUponFiling`]: "32 — Total amount payable/(overpayment) upon filing",
    ...ab("txtPg2Pt4I66TotalTaxable", "66 — Total taxable income"), ...ab("txtPg2Pt4I67TaxDueRegular", "67 — Tax due (graduated rates)"),
    ...ab("txtPg2Pt4I46AdditionalExemp", "46 — Additional exemption"),
  },
  periodName: (s) => `${s[`${P}ddlPg1I1Month`] ?? "12"}${s[`${P}txtPg1I1Year`] ?? ""}`, // createXMLFileName: month + item 1's year
  prefill: {
    [`${P}txtPg1Pt1I5TIN1`]: "tin1", [`${P}txtPg1Pt1I5TIN2`]: "tin2", [`${P}txtPg1Pt1I5TIN3`]: "tin3", [`${P}txtTIN4`]: "tin4",
    [`${P}ddlPg1Pt1I6RDOCode`]: "rdo", [`${P}txtPg1Pt1I17Business`]: "lob", [`${P}txtPg1Pt1I10Address`]: "regAddr",
    [`${P}txtPg1Pt1I13Contact`]: "telNo", [`${P}txtZIP`]: "zip",
  },
};
export default form;
