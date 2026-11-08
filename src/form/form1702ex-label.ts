// Labels, period name and profile prefill shared by the 1702-EX 2018 editions (both use the frm1702EX: prefix).
import type { Profile } from "@/lib/savefile.ts";
import type { FormState } from "./schema.ts";

const P = "frm1702EX:";

/** BIR's savefile period segment: month + "20" + the 2-digit year of item 2 (createXMLFileName). */
export const periodName1702EX = (s: FormState): string => `${s[`${P}ddlPg1I2Date`] || "12"}20${s[`${P}txtPg1I2YearEnd`] || "25"}`;

/** loadBGData fills these from the taxpayer profile (the e-mail too, but only from the profile file itself). */
export const prefill1702EX2018: Record<string, keyof Profile> = {
  [`${P}txtPg1Pt1I6TINC1`]: "tin1",
  [`${P}txtPg1Pt1I6TINC2`]: "tin2",
  [`${P}txtPg1Pt1I6TINC3`]: "tin3",
  [`${P}txtPg1Pt1I6TINC4`]: "tin4",
  [`${P}hdnPg1Pt1I7RDO`]: "rdo",
  [`${P}rdoPg1Pt1I7RDO`]: "rdo",
  [`${P}txtPg1Pt1I8RegisteredName`]: "fn",
  [`${P}txtPg1Pt1I9RegisteredAddress`]: "regAddr",
  [`${P}txPg1I9ZipCode`]: "zip",
  [`${P}txtPg1Pt1I11ContactNumber`]: "telNo",
  [`${P}txtLOB`]: "lob",
};

export const label1702EX2018: Record<string, string> = {
  [`${P}rdoPg1I1Calendar`]: "1 — Calendar year", [`${P}rdoPg1I1Fiscal`]: "1 — Fiscal year",
  [`${P}ddlPg1I2Date`]: "2 — Year ended: month", [`${P}txtPg1I2YearEnd`]: "2 — Year ended (YY)",
  [`${P}rdoPg1I3AmendedYes`]: "3 — Amended return: yes", [`${P}rdoPg1I3AmendedNo`]: "3 — Amended return: no",
  [`${P}rdoPg1I4ShortPeriodYes`]: "4 — Short period return: yes", [`${P}rdoPg1I4ShortPeriodNo`]: "4 — Short period return: no",
  [`${P}rdoPg1I5ATCR1C3`]: "5 — ATC IC 011 (exempt corporation on exempt activities)", [`${P}rdoPg1I5ATCR2C3`]: "5 — ATC IC 021 (general professional partnership)",
  [`${P}txtPg1Pt1I6TINC1`]: "6 — TIN", [`${P}hdnPg1Pt1I7RDO`]: "7 — RDO code", [`${P}rdoPg1Pt1I7RDO`]: "7 — RDO",
  [`${P}txtPg1Pt1I8RegisteredName`]: "8 — Registered name", [`${P}txtPg1Pt1I8RegisteredName2`]: "8 — Registered name (line 2)",
  [`${P}txtPg1Pt1I8RegisteredName3`]: "8 — Registered name (line 3)", [`${P}txtPg1Pt1I9RegisteredAddress`]: "9 — Registered address",
  [`${P}txPg1I9ZipCode`]: "9A — ZIP", [`${P}txtPg1Pt1I10DateofIncorporation`]: "10 — Date of incorporation (MM/DD/YYYY)",
  [`${P}txtPg1Pt1I11ContactNumber`]: "11 — Contact number", [`${P}txtPg1Pt1I12Email`]: "12 — E-mail",
  [`${P}rdoPg1Pt1I13MethodOfDeducItemized`]: "13 — Itemized deductions", [`${P}rdoPg1Pt1I13MethodOfDeducOptional`]: "13 — Optional standard deduction (40%)",
  [`${P}txtPg1Pt1I14LegalBasis`]: "14 — Legal basis of tax relief/exemption", [`${P}txtPg1Pt1I15Investment`]: "15 — Investment promotion agency",
  [`${P}txtPg1Pt1I16RegisteredActivity`]: "16 — Registered activity/program (reg. no.)",
  [`${P}txtPg1Pt1I17EffectivityFrom`]: "17 — Effectivity of tax relief: from (MM/DD/YYYY)", [`${P}txtPg1Pt1I17EffectivityTo`]: "17 — to (MM/DD/YYYY)",
  [`${P}txtPg1Pt2I18TaxDue`]: "18 — Tax due", [`${P}txtPg1Pt2I19TotalTaxCrPmt`]: "19 — Tax credits/payments",
  [`${P}txtPg1Pt2I20TotalOverpmt`]: "20 — Tax payable / (overpayment)", [`${P}txtPg1Pt2I21PenaltyCompromise`]: "21 — Total penalties",
  [`${P}txtPg1Pt2I22TotalAmtPayable`]: "22 — Total amount payable / (overpayment)",
  [`${P}rdoPg1OverpaymentRefund`]: "Overpayment: refunded", [`${P}rdoPg1OverpaymentTCC`]: "Overpayment: tax credit certificate",
  [`${P}rdoPg1OverpaymentCarryOver`]: "Overpayment: carried over",
  [`${P}txtPg1P2I23NumOfAttachments`]: "23 — Number of attachments",
  [`${P}txtPg2Pt4I28SalesReceiptsRevFees`]: "28 — Sales/receipts/revenues/fees", [`${P}txtPg2Pt4I29SalesRetAllowanceDisc`]: "29 — Less: returns, allowances, discounts",
  [`${P}txtPg2Pt4I30NetSalesReceiptsRevFees`]: "30 — Net sales", [`${P}txtPg2Pt4I31CostOfSalesServ`]: "31 — Less: cost of sales/services",
  [`${P}txtPg2Pt4I32GrossIncomeFromOper`]: "32 — Gross income from operation", [`${P}txtPg2Pt4I33AddOther`]: "33 — Add: other income",
  [`${P}txtPg2Pt4I34TotalGross`]: "34 — Total gross income", [`${P}txtPg2Pt4I35OrdinaryAllowable`]: "35 — Ordinary allowable deductions (Sch 1)",
  [`${P}txtPg2Pt4I36SpecialAllowable`]: "36 — Special allowable deductions (Sch 2)", [`${P}txtPg2Pt4I37TotalItemized`]: "37 — Total itemized deductions",
  [`${P}txtPg2Pt4I38OptionalStandardDeduc`]: "38 — OSD (40% of 34)", [`${P}txtPg2Pt4I39NetTaxable`]: "39 — Net taxable income / (loss)",
  [`${P}txtPg2Pt4I40TaxRate`]: "40 — Tax rate (%)", [`${P}txtPg2Pt4I41TaxDue`]: "41 — Tax due",
  [`${P}txtPg2Pt4I42PriorYearExcessCr`]: "42 — Prior year's excess credits", [`${P}txtPg2Pt4I43IncomeTaxPmtFromPreviousQrt`]: "43 — Payments, previous quarters",
  [`${P}txtPg2Pt4I44CreditableTaxWithheldFromPrevQrt`]: "44 — CWT, previous quarters", [`${P}txtPg2Pt4I45CreditableTaxWithheldFor4thQrt`]: "45 — CWT, 4th quarter",
  [`${P}txtPg2Pt4I46ForeignTaxCr`]: "46 — Foreign tax credits", [`${P}txtPg2Pt4I47TaxPaidInReturnPrevFiled`]: "47 — Tax paid in the return previously filed (amended)",
  [`${P}txtPg2Pt4I48OtherTaxCrPmtDesc`]: "48 — Other credit (description)", [`${P}txtPg2Pt4I48OtherTaxCrPmtAmt`]: "48 — Other credit",
  [`${P}txtPg2Pt4I49OtherTaxCrPmtDesc`]: "49 — Other credit (description)", [`${P}txtPg2Pt4I49OtherTaxCrPmtAmt`]: "49 — Other credit",
  [`${P}txtPg2Pt4I50TotalTaxCrPmt`]: "50 — Total tax credits/payments", [`${P}txtPg2Pt4I51TotalOverpayment`]: "51 — Tax payable / (overpayment)",
  [`${P}txtPg2Pt5I52RegularIncomeOtherwiseDue`]: "52 — Regular income tax otherwise due", [`${P}txtPg2Pt5I53SpecialAllowableItemizedDeduc`]: "53 — Special allowable itemized deductions × rate",
  [`${P}txtPg2Pt5I54TotalTaxReliefAvailment`]: "54 — Total tax relief availment",
  [`${P}txtPg3Pt6S1I18TotOrdinaryAllowableItemDeduc`]: "Sch 1 18 — Total ordinary allowable itemized deductions",
  [`${P}txtPg3Pt6S2I5TotSpecialAllowedItemDeduc`]: "Sch 2 5 — Total special allowable itemized deductions",
  [`${P}txtPg3Pt6S3I1NetIncomePerBook`]: "Sch 3 1 — Net income/(loss) per books", [`${P}txtPg3Pt6S3I4Total`]: "Sch 3 4 — Total",
  [`${P}txtPg3Pt6S3I9Total`]: "Sch 3 9 — Total", [`${P}txtPg3Pt6S3I10NetTaxableIncome`]: "Sch 3 10 — Net taxable income/(loss)",
  [`${P}txtLOB`]: "Line of business",
};
