import type { NativeForm } from "../registry.ts";
import { FORM_2550M, validate2550M } from "../form2550m.ts";

const P = "frm2550m:";
const tax = (item: string, label: string): [string, string] => [`${P}txtTax${item}`, `${item} — ${label}`];

const entry: NativeForm = {
  schema: FORM_2550M,
  validate: validate2550M,
  label: {
    [`${P}RtnYear`]: "1 — For the month (MM)", [`${P}txtYear`]: "1 — Year (YYYY)",
    [`${P}OptAmendedYN1`]: "Yes", [`${P}OptAmendedYN2`]: "No", [`${P}txtSheets`]: "No. of sheets attached",
    [`${P}txtBranchCode`]: "Branch code", [`${P}txtRDOCode`]: "RDO code", [`${P}txtLineBus`]: "Line of business",
    [`${P}txtTaxPayerName`]: "Taxpayer name", [`${P}txtTelephoneNum`]: "Telephone", [`${P}txtAddress`]: "Registered address",
    [`${P}txtZipCode`]: "ZIP", [`${P}OptSpecialTax1`]: "Yes", [`${P}OptSpecialTax2`]: "No", [`${P}lstSpecialTax`]: "Special law / tax treaty",
    ...Object.fromEntries([
      tax("12A", "Sales to private parties (Schedule 1)"), tax("12B", "Output tax"),
      tax("13A", "Sales to government"), tax("13B", "Output tax"), tax("14", "Zero-rated sales"), tax("15", "Exempt sales"),
      tax("16A", "Total sales"), tax("16B", "Total output tax due"),
      tax("17A", "Input tax carried over from previous period"), tax("17B", "Input tax deferred on capital goods from previous period"),
      tax("17C", "Transitional input tax"), tax("17D", "Presumptive input tax"), tax("17E", "Others"), tax("17F", "Total"),
      tax("18A", "Capital goods ≤ ₱1M (Schedule 2)"), tax("18B", "Input tax"), tax("18C", "Capital goods > ₱1M (Schedule 3)"), tax("18D", "Input tax"),
      tax("18E", "Domestic purchases of goods"), tax("18F", "Input tax"), tax("18G", "Importation of goods"), tax("18H", "Input tax"),
      tax("18I", "Domestic purchase of services"), tax("18J", "Input tax"), tax("18K", "Services by non-residents"), tax("18L", "Input tax"),
      tax("18M", "Purchases not qualified for input tax"), tax("18N", "Others"), tax("18O", "Input tax"), tax("18P", "Total current purchases"),
      tax("19", "Total available input tax"),
      tax("20A", "Capital goods input tax deferred (Schedule 3)"), tax("20B", "Input tax on sales to government (Schedule 4)"),
      tax("20C", "Input tax on exempt sales (Schedule 5)"), tax("20D", "VAT refund / TCC claimed"), tax("20E", "Others"), tax("20F", "Total deductions"),
      tax("21", "Total allowable input tax"), tax("22", "Net VAT payable"),
      tax("23A", "Creditable VAT withheld (Schedule 6)"), tax("23B", "Advance sugar VAT (Schedule 7)"),
      tax("23C", "VAT withheld on sales to government (Schedule 8)"), tax("23D", "VAT paid in return previously filed (amended only)"),
      tax("23E", "Advance payments"), tax("23F", "Others"), tax("23G", "Total tax credits / payments"), tax("24", "Tax still payable / (overpayment)"),
      tax("25A", "Surcharge"), tax("25B", "Interest"), tax("25C", "Compromise"), tax("25D", "Total penalties"), tax("26", "Total amount payable"),
    ]),
    [`${P}txtAtcCde`]: "ATC", [`${P}txtAmountSales`]: "Sales / receipts", [`${P}txtOutputTax`]: "Output tax",
    txtDatePurchased: "Date purchased", txtDescription: "Description", txtAmt: "Amount (net of VAT)", txtInputTax: "Input tax",
    txtDatePurchased3A: "Date purchased", txtDescription3A: "Description", txtAmt3A: "Amount (net of VAT)", txtInputTax3A: "Input tax",
    txtEstLife3A: "Est. life (months)", txtRecogLife3A: "Recognized life (months)", txtAllowInputTax3A: "Allowable input tax", txtBalInputTax3A: "Balance",
    txtDatePurchased3B: "Date purchased", txtDescription3B: "Description", txtAmt3B: "Amount (net of VAT)", txtBalInputTaxPrevious3B: "Balance from previous",
    txtEstLife3B: "Est. life (months)", txtRecogLife3B: "Remaining life (months)", txtAllowInputTax3B: "Allowable input tax", txtBalInputTax3B: "Balance",
    txtinputtaxSched4: "Sched 4 — Input tax directly attributable", txtInputTaxnotDirectSched4: "Sched 4 — Input tax not directly attributable",
    txtTotal20BSched4: "Sched 4 — Total (to 20B)", txtlessStdTaxSched4: "Sched 4 — Less: standard input tax (7%)",
    txtinputtaxSched5: "Sched 5 — Input tax directly attributable", txtAmountInputnotDirectSched5: "Sched 5 — Input tax not directly attributable",
    txtTotal20CSched5: "Sched 5 — Total (to 20C)",
    txtPeriodCovered: "Period covered", txtNameAgent: "Withholding agent", txtIncomePayment: "Income payment", txtTotalWithheld: "Tax withheld",
    txtAppliedCurr: "Applied this month",
    txtPeriodCoveredSch7: "Period covered", txtNameMillerSch7: "Sugar mill", txtNameTaxPayerSch7: "Taxpayer", txtORNumSch7: "OR number",
    txtAmountPaidSch7: "Amount paid", txtAppliedCurrSch7: "Applied this month",
    txtPeriodCoveredSch8: "Period covered", txtNameAgentSch8: "Government agency", txtIncomePaymentSch8: "Income payment",
    txtTotalWithheldSch8: "Tax withheld", txtAppliedCurrSch8: "Applied this month",
  },
  // createXMLFileName: month + year, e.g. "102026"
  periodName: (s) => `${s[`${P}RtnYear`] ?? ""}${s[`${P}txtYear`] ?? ""}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}txtTaxPayerName`]: "fn", [`${P}txtLineBus`]: "lob", [`${P}txtAddress`]: "regAddr",
    [`${P}txtZipCode`]: "zip", [`${P}txtTelephoneNum`]: "telNo",
  },
};
export default entry;
