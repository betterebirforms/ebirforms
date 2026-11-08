import type { NativeForm } from "../registry.ts";
import { FORM_1700V2018, validate1700v2018 } from "../form1700v2018.ts";

const P = "frm1700:";
const form: NativeForm = {
  schema: FORM_1700V2018,
  validate: (state) => validate1700v2018(state),
  label: {
    [`${P}txtPg1I1Year`]: "Year (YYYY)", [`${P}txtPg1I4TIN1`]: "TIN", [`${P}txtPg1I7TaxpayerName`]: "Taxpayer name",
    [`${P}txtPg1I8Address`]: "Registered address", [`${P}txtPg1I8AZipCode`]: "Zip code",
    [`${P}rdoPg1I6TaxpayerTypeE`]: "Taxpayer — compensation earner (graduated)", [`${P}rdoPg1I6TaxpayerTypeN`]: "Taxpayer — minimum wage earner (25% flat)",
    [`${P}rdoPg1I20SpouseTaxpayerTypeE`]: "Spouse — compensation earner (graduated)", [`${P}rdoPg1I20SpouseTaxpayerTypeN`]: "Spouse — minimum wage earner (25% flat)",
    [`${P}txtPg1I26A`]: "26A — Total tax due (taxpayer)", [`${P}txtPg1I26B`]: "26B — Total tax due (spouse)",
    [`${P}txtPg1I28A`]: "28A — Total amount payable (taxpayer)", [`${P}txtPg1I28B`]: "28B — Total amount payable (spouse)",
    [`${P}txtPg1I29A`]: "29A — Less tax withheld (taxpayer)", [`${P}txtPg1I29B`]: "29B — Less tax withheld (spouse)",
    [`${P}txtPg1I30A`]: "30A — Tax still due (taxpayer)", [`${P}txtPg1I30B`]: "30B — Tax still due (spouse)",
    [`${P}txtPg1I34A`]: "34A — Total credits (taxpayer)", [`${P}txtPg1I34B`]: "34B — Total credits (spouse)",
    [`${P}txtPg1I35A`]: "35A — Amount payable / (overpayment) (taxpayer)", [`${P}txtPg1I35B`]: "35B — Amount payable / (overpayment) (spouse)",
    [`${P}txtPg1I36`]: "36 — Total amount payable / (overpayment)",
    [`${P}txtPg2I42A`]: "42A — Compensation income (graduated)", [`${P}txtPg2I43A`]: "43A — Less: exempt under RR 11-2018",
    [`${P}txtPg2I47A`]: "47A — Tax due (graduated)", [`${P}txtPg2I48A`]: "48A — Compensation income (25% flat)",
    [`${P}txtPg2I53A`]: "53A — Tax due (25% flat)", [`${P}txtPg2I58A`]: "58A — Total tax withheld (taxpayer)",
    [`${P}txtPg2I58B`]: "58B — Total tax withheld (spouse)", [`${P}txtPg2I59A`]: "59A — Net tax payable (taxpayer)",
    [`${P}txtPg2I59B`]: "59B — Net tax payable (spouse)",
  },
  periodName: (s) => `${s[`${P}txtPg1I1Year`] ?? ""}`,
  prefill: {
    [`${P}txtPg1I4TIN1`]: "tin1", [`${P}txtPg1I4TIN2`]: "tin2", [`${P}txtPg1I4TIN3`]: "tin3", [`${P}txtPg1I4BranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}txtPg1I7TaxpayerName`]: "fn", [`${P}txtPg1I8Address`]: "regAddr",
    [`${P}txtPg1I8AZipCode`]: "zip", [`${P}txtPg1I14TelNum`]: "telNo", [`${P}txtLOB`]: "lob",
    [`${P}txtPg2TIN1`]: "tin1", [`${P}txtPg2TIN2`]: "tin2", [`${P}txtPg2TIN3`]: "tin3", [`${P}txtPg2BranchCode`]: "tin4",
    [`${P}txtPg2TaxpayerName`]: "fn",
  },
};
export default form;
