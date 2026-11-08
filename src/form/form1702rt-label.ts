// Labels, period name and profile prefill shared by the 1702-RT editions (all use the frm1702RT: prefix).
import type { Profile } from "@/lib/savefile.ts";
import type { FormState } from "./schema.ts";

const P = "frm1702RT:";

/** BIR's savefile period segment: month + "20" + the 2-digit year of item 2 (createXMLFileName). */
export const periodName1702RT = (s: FormState): string => `${s[`${P}ddlPg1I2Month`] || "12"}20${s[`${P}txtPg1I2Year`] || "25"}`;

export const prefill1702RT2018: Record<string, keyof Profile> = {
  [`${P}txtPg1Pt1I6TIN1`]: "tin1",
  [`${P}txtPg1Pt1I6TIN2`]: "tin2",
  [`${P}txtPg1Pt1I6TIN3`]: "tin3",
  [`${P}txtPg1Pt1I6TIN4`]: "tin4",
  [`${P}txtRDO`]: "rdo",
  [`${P}drpPg1Pt1I7RDOCode`]: "rdo",
  [`${P}txtPg1Pt1I8Name1`]: "fn",
  [`${P}txtPg1Pt1I9Address1`]: "regAddr",
  [`${P}txtZIP`]: "zip",
  [`${P}txtPg1Pt1I11Contact`]: "telNo",
};

export const label1702RT2018: Record<string, string> = {
  [`${P}rdoPg1I1`]: "1 — Accounting period", [`${P}rdoPg1I1Calendar`]: "Calendar", [`${P}rdoPg1I1Fiscal`]: "Fiscal",
  [`${P}ddlPg1I2Month`]: "2 — Year ended: month", [`${P}txtPg1I2Year`]: "2 — Year ended (YY)",
  [`${P}rdoPg1I3Ammend`]: "3 — Amended return?", [`${P}rdoPg1I3AmmendYes`]: "Yes", [`${P}rdoPg1I3AmmendNo`]: "No",
  [`${P}rdoPg1I4ShortPeriod`]: "4 — Short period return?", [`${P}rdoPg1I4ShortPeriodYes`]: "Yes", [`${P}rdoPg1I4ShortPeriodNo`]: "No",
  [`${P}rdoPg1I5Atc`]: "5 — ATC IC055 (MCIT; set from item 10)", [`${P}rdoPg1I5AtcOther`]: "5 — Other ATC", [`${P}drpPg1I5AtcOther`]: "5 — Other ATC code",
  [`${P}txtRDO`]: "7 — RDO code", [`${P}drpPg1Pt1I7RDOCode`]: "7 — RDO",
  [`${P}txtPg1Pt1I8Name1`]: "8 — Registered name", [`${P}txtPg1Pt1I9Address1`]: "9 — Registered address", [`${P}txtZIP`]: "ZIP",
  [`${P}txtPg1Pt1I10`]: "10 — Date of incorporation (MM/DD/YYYY)", [`${P}txtPg1Pt1I11Contact`]: "11 — Contact number", [`${P}txtPg1Pt1I12Email`]: "12 — E-mail",
  [`${P}rdoPg1Pt1I13ItemizedDeduction`]: "13 — Itemized deductions", [`${P}rdoPg1Pt1I13OptionalStandard`]: "13 — Optional standard deduction (40%)",
  [`${P}txtPg1Pt2I14IncomeTax`]: "14 — Tax due", [`${P}txtPg1Pt2I15TotalTaxCredits`]: "15 — Tax credits/payments",
  [`${P}txtPg1Pt2I16NetTax`]: "16 — Net tax payable / (overpayment)", [`${P}txtPg1Pt2I17Surcharge`]: "17 — Surcharge",
  [`${P}txtPg1Pt2I18Interest`]: "18 — Interest", [`${P}txtPg1Pt2I19Compromise`]: "19 — Compromise",
  [`${P}txtPg1Pt2I20TotalPenalties`]: "20 — Total penalties", [`${P}txtPg1Pt2I21TotalAmount`]: "21 — Total amount payable / (overpayment)",
  [`${P}Pg1Pt2I21`]: "21 — Overpayment is to be", [`${P}rdoPg1Pt2I21OverpaymentRefunded`]: "Refunded",
  [`${P}rdoPg1Pt2I21OverpaymentIssued`]: "Issued a tax credit certificate", [`${P}rdoPg1Pt2I21OverpaymentCarried`]: "Carried over",
  [`${P}txtPg2Pt4I27Sales`]: "27 — Sales/receipts/revenues/fees", [`${P}txtPg2Pt4I28LessSales`]: "28 — Less: returns, allowances, discounts",
  [`${P}txtPg2Pt4I29NetSales`]: "29 — Net sales", [`${P}txtPg2Pt4I30LessCost`]: "30 — Less: cost of sales/services",
  [`${P}txtPg2Pt4I31GrossIncome`]: "31 — Gross income from operation", [`${P}txtPg2Pt4I32AddOtherTaxable`]: "32 — Add: other taxable income",
  [`${P}txtPg2Pt4I33TotalGross`]: "33 — Total gross income", [`${P}txtPg2Pt4I34OrdinaryAllowable`]: "34 — Ordinary allowable deductions (Sch I)",
  [`${P}txtPg2Pt4I35SpecialAllowable`]: "35 — Special allowable deductions (Sch II)", [`${P}txtPg2Pt4I36Nolco`]: "36 — NOLCO (Sch IIIA)",
  [`${P}txtPg2Pt4I37TotalItemized`]: "37 — Total itemized deductions", [`${P}txtPg2Pt4I38OptionalStandard`]: "38 — OSD (40% of 33)",
  [`${P}txtPg2Pt4I39NetTaxable`]: "39 — Net taxable income", [`${P}Pg2Pt4I40IncomeTaxRate`]: "40 — Income tax rate",
  [`${P}txtPg2Pt4I41IncomeTaxDue`]: "41 — Regular income tax due", [`${P}txtPg2Pt4I42MinimumCorporate`]: "42 — MCIT",
  [`${P}txtPg2Pt4I43TotalIncomeTax`]: "43 — Income tax due (higher of 41 and 42)", [`${P}txtPg2Pt4I44ExcessCredits`]: "44 — Prior year's excess credits",
  [`${P}txtPg2Pt4I45IncomeTaxPaymentUnderMCIT`]: "45 — Payments under MCIT (prior quarters)", [`${P}txtPg2Pt4I46IncomeTaxUnderRegular`]: "46 — Payments under regular rate (prior quarters)",
  [`${P}txtPg2Pt4I47ExcessMCIT`]: "47 — Excess MCIT applied (Sch IV)", [`${P}txtPg2Pt4I48CreditableTaxWithheldFromPrevious`]: "48 — CWT, prior quarters",
  [`${P}txtPg2Pt4I49CreditableTaxWithheldFor4thQuarter`]: "49 — CWT, 4th quarter", [`${P}txtPg2Pt4I50ForeignTaxCredits`]: "50 — Foreign tax credits",
  [`${P}txtPg2Pt4I51TaxPaidInReturn`]: "51 — Tax paid in the return previously filed (amended)", [`${P}txtPg2Pt452SpecialTaxCredits`]: "52 — Special-rate tax credits",
  [`${P}txtPg2Pt4I53C1`]: "53 — Other credit (description)", [`${P}txtPg2Pt4I53C2`]: "53 — Other credit",
  [`${P}txtPg2Pt4I54C1`]: "54 — Other credit (description)", [`${P}txtPg2Pt4I54C2`]: "54 — Other credit",
  [`${P}txtPg2Pt4I55TotalTaxCredits`]: "55 — Total tax credits/payments", [`${P}txtPg2Pt4I56NetTax`]: "56 — Net tax payable / (overpayment)",
  [`${P}txtPg2Pt5I57SpecialAllowable`]: "57 — Tax on special allowable deductions", [`${P}txtPg2Pt5I58AddSpecialTax`]: "58 — Add: special tax credits",
  [`${P}txtPg2Pt5I59TotalTax`]: "59 — Total tax relief availment",
  [`${P}txtPg3Sc1I18TotalOrdinaryAllowable`]: "Sch I 18 — Total ordinary allowable deductions",
  [`${P}txtPg3Sc2I5TotalSpecialAllowable`]: "Sch II 5 — Total special allowable deductions",
  [`${P}txtPg4Sc3I1GrossIncome`]: "Sch III 1 — Gross income", [`${P}txtPg4Sc3I2TotalDeductions`]: "Sch III 2 — Total deductions",
  [`${P}txtPg4Sc3I3NetOperatingLoss`]: "Sch III 3 — Net operating loss", [`${P}txtPg4Sc4I8TotalNOLCO`]: "Sch IIIA 8 — Total NOLCO applied",
  [`${P}txtPg4Sc4I4TotalExcessMCIT`]: "Sch IV 4 — Total excess MCIT applied",
  [`${P}txtPg4Sc5I1NetIncome`]: "Sch V 1 — Net income per books", [`${P}txtPg4Sc5I4Total`]: "Sch V 4 — Total",
  [`${P}txtPg4Sc5I9Total`]: "Sch V 9 — Total", [`${P}txtPg4Sc5I10NetTaxableIncome`]: "Sch V 10 — Net taxable income",
};
