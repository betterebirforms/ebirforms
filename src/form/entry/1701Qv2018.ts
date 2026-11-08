// 1701Q v2018 (quarterly ITR, individuals / estates / trusts, TRAIN) — see src/form/form1701qv2018.ts.
import type { NativeForm } from "../registry.ts";
import { FORM_1701Qv2018, validate1701Qv2018 } from "../form1701qv2018.ts";

const P = "frm1701q:";
const label: Record<string, string> = {
  [`${P}txtYear`]: "1 — For the year (YYYY)",
  [`${P}DateQuarter_1`]: "2 — 1st quarter", [`${P}DateQuarter_2`]: "2 — 2nd quarter", [`${P}DateQuarter_3`]: "2 — 3rd quarter",
  [`${P}AmendedRtn_1`]: "3 — Amended return: Yes", [`${P}AmendedRtn_2`]: "3 — Amended return: No",
  [`${P}txtSheets`]: "4 — Number of sheets attached", [`${P}txtRDOCode`]: "6 — RDO code",
  [`${P}optType_1`]: "7 — Single proprietor", [`${P}optType_2`]: "7 — Professional", [`${P}optType_3`]: "7 — Estate", [`${P}optType_4`]: "7 — Trust",
  [`${P}optATC_1`]: "8 — II012 business (graduated)", [`${P}optATC_2`]: "8 — II014 profession (graduated)", [`${P}optATC_3`]: "8 — II013 mixed (graduated)",
  [`${P}optATC_4`]: "8 — II015 business (8%)", [`${P}optATC_5`]: "8 — II017 profession (8%)", [`${P}optATC_6`]: "8 — II016 mixed (8%)",
  [`${P}txtTaxpayerName`]: "9 — Taxpayer / filer's name", [`${P}txtAddress`]: "10 — Registered address", [`${P}txtZipCode`]: "10A — ZIP code",
  [`${P}txtBirthMonth`]: "11 — Birth month (MM)", [`${P}txtBirthDay`]: "11 — Birth day (DD)", [`${P}txtBirthYear`]: "11 — Birth year (YYYY)",
  txtEmail: "12 — Email address", [`${P}txtCitizenship`]: "13 — Citizenship", [`${P}txtForeignTaxNumber`]: "14 — Foreign tax number",
  [`${P}optForeignTaxCredits_1`]: "15 — Foreign tax credits: Yes", [`${P}optForeignTaxCredits_2`]: "15 — Foreign tax credits: No",
  [`${P}optTaxRate_1`]: "16 — Graduated rates", [`${P}optTaxRate_2`]: "16 — 8% on gross sales/receipts",
  [`${P}optMethodOfDeduction:_1`]: "16A — Itemized deduction", [`${P}optMethodOfDeduction:_2`]: "16A — Optional standard deduction (40%)",
  [`${P}txtSpouseRDOCode`]: "18 — Spouse RDO code",
  [`${P}optSpouseType_1`]: "19 — Spouse: single proprietor", [`${P}optSpouseType_2`]: "19 — Spouse: professional", [`${P}optSpouseType_3`]: "19 — Spouse: compensation earner",
  [`${P}optSpouseATC_1`]: "20 — Spouse II012 (graduated)", [`${P}optSpouseATC_2`]: "20 — Spouse II014 (graduated)", [`${P}optSpouseATC_3`]: "20 — Spouse II013 (graduated)",
  [`${P}optSpouseATC_4`]: "20 — Spouse II011 (compensation)", [`${P}optSpouseATC_5`]: "20 — Spouse II015 (8%)", [`${P}optSpouseATC_6`]: "20 — Spouse II017 (8%)", [`${P}optSpouseATC_7`]: "20 — Spouse II016 (8%)",
  [`${P}txtSpouseName`]: "21 — Spouse's name", [`${P}txtSpouseCitizenship`]: "22 — Spouse citizenship", [`${P}txtSpouseForeignTaxNum`]: "23 — Spouse foreign tax number",
  [`${P}optSpouseTaxRate_1`]: "25 — Spouse graduated rates", [`${P}optSpouseTaxRate_2`]: "25 — Spouse 8%",
  [`${P}optSpouseMethod:_1`]: "25A — Spouse itemized deduction", [`${P}optSpouseMethod:_2`]: "25A — Spouse OSD (40%)",
  [`${P}txt31`]: "31 — Aggregate tax payable / (overpayment)", [`${P}txt43Desc`]: "43 — Other non-operating income (specify)",
  [`${P}txt48Desc`]: "48 — Other non-operating income (specify)", [`${P}txt61Desc`]: "61 — Other tax credits (specify)",
  [`${P}txtLOB`]: "Line of business", [`${P}txtTelno`]: "Telephone",
};
const item: Record<number, string> = {
  26: "Tax due", 27: "Less: tax credits/payments", 28: "Tax payable / (overpayment)", 29: "Add: total penalties", 30: "Total amount payable",
  36: "Sales / revenues / receipts / fees", 37: "Cost of sales / services", 38: "Gross income from operation", 39: "Total allowable itemized deductions",
  40: "Optional standard deduction (40%)", 41: "Net income", 42: "Taxable income — previous quarter(s)", 43: "Non-operating income",
  44: "Amount received from compensation", 45: "Total taxable income to date", 46: "Tax due (graduated)",
  47: "Sales / receipts (8%)", 48: "Non-operating income (8%)", 49: "Total income for the quarter", 50: "Taxable income — previous quarter(s)",
  51: "Cumulative taxable income", 52: "Allowable reduction (₱250,000)", 53: "Taxable income to date", 54: "Tax due (8%)",
  55: "Prior year's excess credits", 56: "Tax payments — previous quarter(s)", 57: "Creditable tax withheld — previous quarter(s)",
  58: "Creditable tax withheld per BIR Form 2307 — this quarter", 59: "Tax paid in return previously filed (amended)", 60: "Foreign tax credits",
  61: "Other tax credits/payments", 62: "Total tax credits/payments", 63: "Tax payable / (overpayment)", 64: "Surcharge", 65: "Interest",
  66: "Compromise", 67: "Total penalties", 68: "Total amount payable / (overpayment)",
};
for (const [n, text] of Object.entries(item)) {
  label[`${P}txt${n}A`] = `${n}A — ${text} (taxpayer)`;
  label[`${P}txt${n}B`] = `${n}B — ${text} (spouse)`;
}

const form: NativeForm = {
  schema: FORM_1701Qv2018,
  validate: validate1701Qv2018,
  label,
  periodName: (s) => `${s[`${P}txtYear`] ?? ""}Q${[1, 2, 3].find((n) => s[`${P}DateQuarter_${n}`] === "true") ?? ""}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}txtTaxpayerName`]: "fn", [`${P}txtAddress`]: "regAddr", [`${P}txtZipCode`]: "zip",
    [`${P}txtLOB`]: "lob", [`${P}txtTelno`]: "telNo",
  },
};
export default form;
