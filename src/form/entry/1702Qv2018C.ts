// 1702Q v2018C (quarterly corporate ITR, CREATE) — see src/form/form1702qv2018c.ts.
import type { NativeForm } from "../registry.ts";
import { FORM_1702Qv2018C, validate1702Qv2018C } from "../form1702qv2018c.ts";

const P = "frm1702q:";
const label: Record<string, string> = {
  [`${P}rbForClndrFscl_1`]: "1 — Calendar year", [`${P}rbForClndrFscl_2`]: "1 — Fiscal year",
  [`${P}rbYrEndMonth`]: "2 — Year ended: month (MM)", [`${P}txtYrEndYear`]: "2 — Year ended: year (YY)",
  [`${P}rbQuarter_1`]: "3 — 1st quarter", [`${P}rbQuarter_2`]: "3 — 2nd quarter", [`${P}rbQuarter_3`]: "3 — 3rd quarter",
  [`${P}rbAmendedRtn_1`]: "4 — Amended return: Yes", [`${P}rbAmendedRtn_2`]: "4 — Amended return: No",
  [`${P}rbATC_1`]: "7 — IC055 Minimum Corporate Income Tax (MCIT)", [`${P}rbATC_2`]: "7 — Regular / special rate ATC", [`${P}cbATC_2`]: "7 — ATC",
  [`${P}txtRDOCode`]: "6 — RDO code", [`${P}txtTaxpayerName1`]: "8 — Registered name", [`${P}txtAddress`]: "9 — Registered address",
  [`${P}txtZipCode`]: "9A — ZIP code", [`${P}txtTelNum`]: "10 — Contact number", txtEmail: "11 — Email address",
  [`${P}rbMthdOfDdctns_1`]: "12 — Itemized deductions", [`${P}rbMthdOfDdctns_2`]: "12 — Optional standard deduction (40%)",
  [`${P}rbTxRlf_1`]: "13 — Tax relief: Yes", [`${P}rbTxRlf_2`]: "13 — Tax relief: No", [`${P}txtTxRlfSpcfy`]: "13 — Tax relief (specify)",
  [`${P}txtTax14`]: "14 — Income tax due (regular / MCIT)", [`${P}txtTax15`]: "15 — Less: unexpired excess of prior years' MCIT",
  [`${P}txtTax16`]: "16 — Balance / income tax still due", [`${P}txtTax17`]: "17 — Income tax due (special rate)",
  [`${P}txtTax18`]: "18 — Aggregate income tax due", [`${P}txtTax19`]: "19 — Less: total tax credits/payments",
  [`${P}txtTax20`]: "20 — Net tax payable / (overpayment)", [`${P}txtTax21`]: "21 — Surcharge", [`${P}txtTax22`]: "22 — Interest",
  [`${P}txtTax23`]: "23 — Compromise", [`${P}txtTax24`]: "24 — Total penalties", [`${P}txtTax25`]: "25 — Total amount payable / (overpayment)",
  [`${P}txtLOB`]: "Line of business",
};
const s1: Record<number, string> = {
  1: "Sales / receipts / revenues / fees", 2: "Less: cost of sales / services", 3: "Gross income from operation", 4: "Add: other taxable income",
  5: "Total gross income", 6: "Less: deductions", 7: "Taxable income this quarter", 8: "Add: taxable income previous quarter(s)",
  9: "Total taxable income to date", 10: "Applicable income tax rate (%)", 11: "Income tax due",
};
for (const [n, text] of Object.entries(s1)) {
  label[`${P}Sched1:txtTax${n}A`] = `Schedule 1 — ${n}A ${text} (exempt)`;
  label[`${P}Sched1:txtTax${n}B`] = `Schedule 1 — ${n}B ${text} (special rate)`;
}
label[`${P}Sched1:txtTax12B`] = "Schedule 1 — 12B Less: share of other government agencies";
label[`${P}Sched1:txtTax13B`] = "Schedule 1 — 13B Net income tax due to National Government";
const s2: Record<number, string> = {
  1: "Sales / receipts / revenues / fees", 2: "Less: cost of sales / services", 3: "Gross income from operation", 4: "Add: other taxable income",
  5: "Total gross income", 6: "Less: deductions", 7: "Taxable income this quarter", 8: "Add: taxable income previous quarter(s)",
  9: "Total taxable income to date", 10: "Applicable income tax rate (%)", 11: "Income tax due other than MCIT", 12: "MCIT",
  13: "Income tax due (higher of 11 and 12)",
};
for (const [n, text] of Object.entries(s2)) label[`${P}Sched2:txtTax${n}`] = `Schedule 2 — ${n} ${text}`;
const s3: Record<number, string> = {
  1: "Gross income — 1st quarter", 2: "Gross income — 2nd quarter", 3: "Gross income — 3rd quarter", 4: "Total gross income",
  5: "MCIT rate (%)", 6: "Minimum corporate income tax",
};
for (const [n, text] of Object.entries(s3)) label[`${P}Sched3:txtTax${n}`] = `Schedule 3 — ${n} ${text}`;
const s4: Record<number, string> = {
  1: "Prior year's excess credits", 2: "Tax payment(s) — previous quarter(s)", 3: "Creditable tax withheld — previous quarter(s)",
  4: "Excess MCIT applied this quarter", 5: "Creditable tax withheld per BIR Form 2307 — this quarter",
  6: "Tax paid in return previously filed (amended)", 7: "Total tax credits/payments",
};
for (const [n, text] of Object.entries(s4)) label[`${P}Sched4:txtTax${n}`] = `Schedule 4 — ${n} ${text}`;
for (const i of [0, 1]) {
  label[`${P}Sched4:txtOthrTxCrdts${i}`] = `Schedule 4 — other credit ${i + 1} (specify)`;
  label[`${P}Sched4:txtOthrTxCrdtAmnt${i}`] = `Schedule 4 — other credit ${i + 1} amount`;
}

const form: NativeForm = {
  schema: FORM_1702Qv2018C,
  validate: validate1702Qv2018C,
  label,
  periodName: (s) => `${2000 + Number(s[`${P}txtYrEndYear`] ?? "")}Q${[1, 2, 3].find((q) => s[`${P}rbQuarter_${q}`] === "true") ?? ""}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}txtTaxpayerName1`]: "fn", [`${P}txtAddress`]: "regAddr", [`${P}txtZipCode`]: "zip",
    [`${P}txtTelNum`]: "telNo", [`${P}txtLOB`]: "lob",
  },
};
export default form;
