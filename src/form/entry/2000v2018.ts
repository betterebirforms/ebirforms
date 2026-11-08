import type { NativeForm } from "../registry.ts";
import { FORM_2000V2018, validate2000v2018 } from "../form2000v2018.ts";

const P = "frm2000:";
const tax = (item: string, label: string): [string, string] => [`${P}txtTax${item}`, `${item} — ${label}`];

const entry: NativeForm = {
  schema: FORM_2000V2018,
  validate: validate2000v2018,
  label: {
    [`${P}txtMonth`]: "1 — For the month (MM)", [`${P}txtYear`]: "1 — Year (YYYY)",
    [`${P}AmendedRtn_1`]: "Yes", [`${P}AmendedRtn_2`]: "No", [`${P}txtSheets`]: "No. of sheets attached",
    [`${P}txtBranchCode`]: "Branch code", [`${P}txtRDOCode`]: "RDO code", [`${P}txtTaxpayerName`]: "Taxpayer name",
    [`${P}txtAddress`]: "Registered address", [`${P}txtAddress2`]: "Registered address (cont.)", [`${P}txtZipCode`]: "ZIP",
    [`${P}txtTelNum`]: "Telephone", [`${P}txtLineBus`]: "Line of business",
    [`${P}optParty_1`]: "10 — Creditor", [`${P}optParty_2`]: "10 — Debtor", [`${P}optParty_3`]: "10 — None",
    [`${P}txtOtherName`]: "11 — Other party's name", [`${P}txtOtherName2`]: "11 — Other party's name (cont.)", [`${P}txtOtherTIN`]: "12 — Other party's TIN",
    [`${P}optMode_1`]: "13 — eDST system", [`${P}optMode_2`]: "13 — Constructive affixture / loose stamps", [`${P}optMode_3`]: "13 — Loose documentary stamps",
    ...Object.fromEntries([
      tax("14", "Total tax due (Schedule 1)"), tax("15A", "eDST payments in the return amended"), tax("15B", "Loose stamps (Schedule 2)"),
      tax("15C", "eDST payments (Schedule 3)"), tax("15D", "Total tax credits / payments"), tax("16", "Tax still due / (overpayment)"),
      tax("17A", "Surcharge"), tax("17B", "Interest"), tax("17C", "Compromise"), tax("17D", "Total penalties"),
      tax("18", "Total amount payable"), tax("19", "Total remittance (Schedule 4)"),
    ]),
    drpATCCode: "ATC", "frm2000:sched1:txtTaxBase": "Tax base", "frm2000:sched1:txtTaxRate": "Tax rate", "frm2000:sched1:txtTaxDue": "Tax due",
    "frm2000:sched2:txtPaymentDate": "Date of purchase", "frm2000:sched2:txtReceipt": "Receipt no.", "frm2000:sched2:txtAmountPaid": "Amount paid",
    "frm2000:sched3:txtPaymentDate": "Date of payment", "frm2000:sched3:txtReceipt": "Reference no.", "frm2000:sched3:txtAmountPaid": "Amount paid",
    "frm2000:sched4:txtRCOCode": "RCO code", "frm2000:sched4:txtRemittanceDate": "Date of remittance", "frm2000:sched4:txtBank": "Bank",
    "frm2000:sched4:txtAmountRemitted": "Amount remitted", "frm2000:sched4:txtNumberFrom": "Serial no. from", "frm2000:sched4:txtNumberTo": "Serial no. to",
    [`${P}numOfDays`]: "DS106 — term of the debt instrument (days)", ds106modYes: "DS106 — term less than a year: Yes", ds106modNo: "No",
    [`${P}numOfMonths`]: "DS130 — charter duration (months)", [`${P}numOfMonths131`]: "DS131 — charter duration (months)",
    [`${P}numOfMonths132`]: "DS132 — charter duration (months)",
  },
  // createXMLFileName: month + year, e.g. "102026"
  periodName: (s) => `${s[`${P}txtMonth`] ?? ""}${s[`${P}txtYear`] ?? ""}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}txtTaxpayerName`]: "fn", [`${P}txtLineBus`]: "lob", [`${P}txtAddress`]: "regAddr",
    [`${P}txtZipCode`]: "zip", [`${P}txtTelNum`]: "telNo",
  },
};
export default entry;
