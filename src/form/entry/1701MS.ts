import type { NativeForm } from "../registry.ts";
import { FORM_1701MS, P, validate1701MS } from "../form1701ms.ts";

const form: NativeForm = {
  schema: FORM_1701MS,
  validate: (state) => validate1701MS(state),
  label: {
    [`${P}txtMonthNo1`]: "Period month (MM)", [`${P}txtYearNo1`]: "Period year (YYYY)",
    [`${P}txtPg1TIN1`]: "TIN", [`${P}txtRDOCodea`]: "RDO code", [`${P}txtTaxpayerNo8a`]: "Taxpayer name",
    [`${P}txtTaxpayerNo11b`]: "Taxpayer — mixed income", [`${P}txtTaxpayerNo12b`]: "Taxpayer — graduated rates",
    [`${P}txtTaxpayerNo12c`]: "Taxpayer — 8% option", [`${P}txtTaxpayerNo12d`]: "Taxpayer — exempt from income tax",
    [`${P}txtTaxpayerNo12e`]: "Taxpayer — special / preferential rate",
    [`${P}txtTaxpayerNo17a`]: "Taxpayer — itemized deductions", [`${P}txtTaxpayerNo17b`]: "Taxpayer — optional standard deduction",
    [`${P}txtIncomeTaxDueNo19a`]: "19a — Income tax due (taxpayer)", [`${P}txtIncomeTaxDueNo19b`]: "19b — Income tax due (spouse)",
    [`${P}txtTotalIncomeTaxDueNo23a`]: "23a — Total income tax due (taxpayer)", [`${P}txtTotalIncomeTaxDueNo23b`]: "23b — Total income tax due (spouse)",
    [`${P}txtAggregateAmountPayable30a`]: "30 — Aggregate amount payable / (overpayment)",
  },
  periodName: (s) => `${s[`${P}txtMonthNo1`] ?? ""}${s[`${P}txtYearNo1`] ?? ""}`,
  prefill: {
    [`${P}txtPg1TIN1`]: "tin1", [`${P}txtPg1TIN2`]: "tin2", [`${P}txtPg1TIN3`]: "tin3", [`${P}txtPg1BranchCode`]: "tin4",
    [`${P}txtRDOCodea`]: "rdo", [`${P}txtTaxpayerNo8a`]: "fn", [`${P}txtEmaila`]: "email", [`${P}txtTelNum10a`]: "telNo",
    [`${P}txtPg2TIN1`]: "tin1", [`${P}txtPg2TIN2`]: "tin2", [`${P}txtPg2TIN3`]: "tin3", [`${P}txtPg2BranchCode`]: "tin4",
  },
};
export default form;
