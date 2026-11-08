import type { NativeForm } from "../registry.ts";
import { FORM_1701v2018, P, validate1701v2018 } from "../form1701v2018.ts";

const ab = (stem: string, text: string): Record<string, string> => ({ [`${P}${stem}A`]: `${text} — taxpayer`, [`${P}${stem}B`]: `${text} — spouse` });

const form: NativeForm = {
  schema: FORM_1701v2018,
  validate: (state) => validate1701v2018(state),
  label: {
    [`${P}txtPg1I1Year`]: "1 — For the year (YYYY)", [`${P}txtPg1I1Month`]: "1 — Month (short period)",
    [`${P}rdoPg1I2AmendedYes`]: "2 — Amended return: Yes", [`${P}rdoPg1I2AmendedNo`]: "2 — Amended return: No",
    [`${P}rdoPg1I3ShortPeriodYes`]: "3 — Short period return: Yes", [`${P}rdoPg1I3ShortPeriodNo`]: "3 — Short period return: No",
    [`${P}txtPg1I5RDOCode`]: "5 — RDO code", [`${P}txtPg1I8TaxpayerName`]: "8 — Taxpayer's name", [`${P}txtPg1I9Address`]: "9 — Registered address",
    [`${P}txtPg1I9Address2`]: "9 — Registered address (cont.)", [`${P}txtPg1I9AZipCode`]: "9A — ZIP", [`${P}txtPg1I10BirthDate`]: "10 — Date of birth (MM/DD/YYYY)",
    [`${P}txtPg1I12Citizenship`]: "12 — Citizenship", [`${P}txtPg1I14ForeignTaxNumber`]: "14 — Foreign tax number", [`${P}txtPg1I15TelNum`]: "15 — Contact number",
    [`${P}rdoPg1I21TaxRateG`]: "21 — Graduated rates", [`${P}rdoPg1I21AMethodDeductionI`]: "21A — Itemized deductions",
    [`${P}rdoPg1I21AMethodDeductionO`]: "21A — Optional standard deduction (40%)", [`${P}rdoPg1I21TaxRateP`]: "21 — 8% in lieu of graduated rates",
    [`${P}txtPg1I22ATaxDue`]: "22 — Tax due — taxpayer", [`${P}txtPg1I22BTaxDue`]: "22 — Tax due — spouse",
    ...ab("txtPg1I23", "23 — Tax credits/payments"),
    [`${P}txtPg1I24ATaxPayable`]: "24 — Tax payable/(overpayment) — taxpayer", [`${P}txtPg1I24BTaxPayable`]: "24 — Tax payable/(overpayment) — spouse",
    ...ab("txtPg1I25", "25 — Portion of tax payable allowed for 2nd installment"), ...ab("txtPg1I26", "26 — Amount payable/(overpayment)"),
    ...ab("txtPg1I27", "27 — Surcharge"), ...ab("txtPg1I28", "28 — Interest"), ...ab("txtPg1I29", "29 — Compromise"), ...ab("txtPg1I30", "30 — Total penalties"),
    [`${P}txtPg1I31ATotalAmtPyble`]: "31 — Total amount payable/(overpayment) — taxpayer", [`${P}txtPg1I31BTotalAmtPyble`]: "31 — Total amount payable/(overpayment) — spouse",
    [`${P}txtPg1I32AggregateAmtPyble`]: "32 — Aggregate amount payable/(overpayment)",
    [`${P}rdoPg1OverpaymentRefund`]: "Overpayment: to be refunded", [`${P}rdoPg1OverpaymentTCC`]: "Overpayment: tax credit certificate",
    [`${P}rdoPg1OverpaymentCarryOver`]: "Overpayment: carried over",
    [`${P}txtPg2I5SpouseName`]: "Part IV 5 — Spouse's name", [`${P}txtPg2I2SpouseRDOCode`]: "Part IV 2 — Spouse's RDO code",
    ...ab("txtPg2IShed2_6", "Sched 2 item 6 — Taxable compensation"), ...ab("txtPg2IShed2_7", "Sched 2 item 7 — Tax due on compensation"),
    ...ab("txtPg2IShed3_8", "Sched 3.A item 8 — Sales/revenues/receipts/fees"), ...ab("txtPg2IShed3_10", "Sched 3.A item 10 — Net sales"),
    ...ab("txtPg2IShed3_17", "Sched 3.A item 17 — Optional standard deduction (40%)"), ...ab("txtPg2IShed3_23", "Sched 3.A item 23 — Total taxable income"),
    ...ab("txtPg2IShed3_24", "Sched 3.A item 24 — Total taxable income (with compensation)"), ...ab("txtPg2IShed3_25", "Sched 3.A item 25 — Tax due (graduated)"),
    ...ab("txtPg3IShed3_26", "Sched 3.B item 26 — Sales/revenues/receipts/fees"), ...ab("txtPg3IShed3_29", "Sched 3.B item 29 — Less: ₱250,000"),
    ...ab("txtPg3IShed3_30", "Sched 3.B item 30 — Taxable income (8%)"), ...ab("txtPg3IShed3_31", "Sched 3.B item 31 — Tax due (8%)"),
    ...ab("txtPg3IShed4_18", "Sched 4 item 18 — Total ordinary allowable itemized deductions"),
    ...ab("txtPg4ISc6_5", "Part VI 5 — Total income tax due"), ...ab("txtPg4IPart7_10", "Part VII 10 — Total tax credits/payments"),
    [`${P}rdoPg1mOption1`]: "Part X — Consolidated for all activities", [`${P}rdoPg1mOption2`]: "Part X — Per activity (Part XI attachments)",
  },
  periodName: (s) => `12${s[`${P}txtPg1I1Year`] ?? ""}`, // createXMLFileName: "12" + item 1's year, whatever the month
  prefill: {
    [`${P}txtPg1I4TIN1`]: "tin1", [`${P}txtPg1I4TIN2`]: "tin2", [`${P}txtPg1I4TIN3`]: "tin3", [`${P}txtPg1I4BranchCode`]: "tin4",
    [`${P}txtPg1I5RDOCode`]: "rdo", [`${P}txtPg1I8TaxpayerName`]: "fn", [`${P}txtPg1I9Address`]: "regAddr",
    [`${P}txtPg1I9AZipCode`]: "zip", [`${P}txtPg1I15TelNum`]: "telNo", [`${P}txtLineBus`]: "lob",
  },
};
export default form;
