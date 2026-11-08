import type { NativeForm } from "../registry.ts";
import { FORM_2550Q, validate2550Q } from "../form2550q.ts";

const P = "frm2550q:";
const tax = (item: string, label: string): [string, string] => [`${P}txtTax${item}`, `${item} — ${label}`];

const entry: NativeForm = {
  schema: FORM_2550Q,
  validate: validate2550Q,
  label: {
    [`${P}optAmend:_1`]: "Calendar", [`${P}optAmend:_2`]: "Fiscal", [`${P}RtnMonth`]: "Year ended (month)", [`${P}txtYear`]: "Year ended (YYYY)",
    [`${P}OptQuarter1`]: "1st", [`${P}OptQuarter2`]: "2nd", [`${P}OptQuarter3`]: "3rd", [`${P}OptQuarter4`]: "4th",
    [`${P}AmendedRtnY`]: "Yes", [`${P}AmendedRtnN`]: "No", [`${P}OptShortPrd1`]: "Yes", [`${P}OptShortPrd2`]: "No",
    [`${P}txtBranchCode`]: "Branch code", [`${P}txtRDOCode`]: "RDO code", [`${P}txtSheets`]: "No. of sheets attached",
    [`${P}txtLineBus`]: "Line of business", [`${P}TaxPayer`]: "Taxpayer name", [`${P}txtTelNum`]: "Telephone",
    [`${P}txtAddress`]: "Registered address", [`${P}txtZipCode`]: "ZIP",
    [`${P}OptTreaty1`]: "Yes", [`${P}OptTreaty2`]: "No", [`${P}lstTaxTreaty`]: "Tax treaty / special rate",
    ...Object.fromEntries([
      tax("15A", "Sales to private parties (Schedule 1)"), tax("15B", "Output tax"),
      tax("16A", "Sales to government"), tax("16B", "Output tax"), tax("17", "Zero-rated sales"), tax("18", "Exempt sales"),
      tax("19A", "Total sales"), tax("19B", "Total output tax due"),
      tax("20A", "Input tax carried over from previous period"), tax("20B", "Input tax deferred on capital goods from previous period"),
      tax("20C", "Transitional input tax"), tax("20D", "Presumptive input tax"), tax("20E", "Others"), tax("20F", "Total"),
      tax("21A", "Capital goods ≤ ₱1M (Schedule 2)"), tax("21B", "Input tax"), tax("21C", "Capital goods > ₱1M (Schedule 3)"), tax("21D", "Input tax"),
      tax("21E", "Domestic purchases of goods"), tax("21F", "Input tax"), tax("21G", "Importation of goods"), tax("21H", "Input tax"),
      tax("21I", "Domestic purchase of services"), tax("21J", "Input tax"), tax("21K", "Services by non-residents"), tax("21L", "Input tax"),
      tax("21M", "Purchases not qualified for input tax"), tax("21N", "Others"), tax("21O", "Input tax"), tax("21P", "Total current purchases"),
      tax("22", "Total available input tax"),
      tax("23A", "Capital goods input tax deferred (Schedule 3)"), tax("23B", "Input tax on sales to government (Schedule 4)"),
      tax("23C", "Input tax on exempt sales (Schedule 5)"), tax("23D", "VAT refund / TCC claimed"), tax("23E", "Others"), tax("23F", "Total deductions"),
      tax("24", "Total allowable input tax"), tax("25", "Net VAT payable"),
      tax("26A", "Monthly VAT payments (previous two months)"), tax("26B", "Creditable VAT withheld (Schedule 6)"),
      tax("26C", "Advance sugar VAT (Schedule 7)"), tax("26D", "VAT withheld on sales to government (Schedule 8)"),
      tax("26E", "VAT paid in return previously filed (amended only)"), tax("26F", "Advance payments"), tax("26G", "Others"),
      tax("26H", "Total tax credits / payments"), tax("27", "Tax still payable / (overpayment)"),
      tax("28A", "Surcharge"), tax("28B", "Interest"), tax("28C", "Compromise"), tax("28D", "Total penalties"), tax("29", "Total amount payable"),
    ]),
    [`${P}txtAtcCde`]: "ATC", [`${P}txtAmountSales`]: "Sales / receipts", [`${P}txtOutputTax`]: "Output tax",
    txtDatePurchased: "Date purchased", txtDescription: "Description", txtAmt: "Amount (net of VAT)", txtInputTax: "Input tax",
    txtDatePurchased3A: "Date purchased", txtDescription3A: "Description", txtAmt3A: "Amount (net of VAT)", txtInputTax3A: "Input tax",
    txtEstLife3A: "Est. life (months)", txtRecogLife3A: "Recognized life (months)", txtAllowInputTax3A: "Allowable input tax", txtBalInputTax3A: "Balance",
    txtDatePurchased3B: "Date purchased", txtDescription3B: "Description", txtAmt3B: "Amount (net of VAT)", txtBalInputTaxPrevious3B: "Balance from previous",
    txtEstLife3B: "Est. life (months)", txtRecogLife3B: "Recognized life (months)", txtAllowInputTax3B: "Allowable input tax", txtBalInputTax3B: "Balance",
    txtinputtaxSched4: "Sched 4 — Input tax directly attributable", txtInputTaxnotDirectSched4: "Sched 4 — Input tax not directly attributable",
    txtTotal20BSched4: "Sched 4 — Total (to 23B)", txtlessStdTaxSched4: "Sched 4 — Less: standard input tax (7%)",
    txtinputtaxSched5: "Sched 5 — Input tax directly attributable", txtAmountInputnotDirectSched5: "Sched 5 — Input tax not directly attributable",
    txtTotal20CSched5: "Sched 5 — Total (to 23C)",
    txtPeriodCovered: "Period covered", txtNameAgent: "Withholding agent", txtIncomePayment: "Income payment", txtTotalWithheld: "Tax withheld",
    txtPrevious2Mo: "Applied previous two months", txtAppliedCurr: "Applied this quarter",
    txtPeriodCoveredSch7: "Period covered", txtNameMillerSch7: "Sugar mill", txtNameTaxPayerSch7: "Taxpayer", txtORNumSch7: "OR number",
    txtAmountPaidSch7: "Amount paid", txtPrevious2MoSch7: "Applied previous two months", txtAppliedCurrSch7: "Applied this quarter",
    txtPeriodCoveredSch8: "Period covered", txtNameAgentSch8: "Government agency", txtIncomePaymentSch8: "Income payment",
    txtTotalWithheldSch8: "Tax withheld", txtPrevious2MoSch8: "Applied previous two months", txtAppliedCurrSch8: "Applied this quarter",
  },
  // createXMLFileName: month + year + quarter, e.g. "122025Q4"
  periodName: (s) =>
    `${s[`${P}RtnMonth`] ?? "12"}${s[`${P}txtYear`] ?? ""}${[1, 2, 3, 4].map((q) => (s[`${P}OptQuarter${q}`] === "true" ? `Q${q}` : "")).join("")}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}TaxPayer`]: "fn", [`${P}txtLineBus`]: "lob", [`${P}txtAddress`]: "regAddr",
    [`${P}txtZipCode`]: "zip", [`${P}txtTelNum`]: "telNo",
  },
};
export default entry;
