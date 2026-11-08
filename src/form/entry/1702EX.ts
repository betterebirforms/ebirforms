import type { NativeForm } from "../registry.ts";
import { FORM_1702EX, validate1702EX } from "../form1702ex.ts";

const P = "frm1702EX:";
const form: NativeForm = {
  schema: FORM_1702EX,
  validate: (state, groups) => validate1702EX(state, groups),
  label: {
    [`${P}rdoPg1I1Calendar`]: "1 — Calendar year", [`${P}rdoPg1I1Fiscal`]: "1 — Fiscal year",
    [`${P}ddlPg1I2Date`]: "2 — Year ended: month", [`${P}txtPg1I2YearEnd`]: "2 — Year ended (YY, up to 17)",
    [`${P}rdoPg1I5ATCR1C3`]: "5 — ATC IC 011 (exempt corporation)", [`${P}rdoPg1I5ATCR2C3`]: "5 — ATC IC 021 (general professional partnership)",
    [`${P}hdnPg1Pt1I7RDO`]: "7 — RDO code", [`${P}txtPg1Pt1I8DateofIncorporation`]: "8 — Date of incorporation (MM/DD/YYYY)",
    [`${P}txtPg1Pt1I9RegisteredName`]: "9 — Registered name", [`${P}txtPg1Pt1I10RegisteredAddress`]: "10 — Registered address",
    [`${P}txtZIP`]: "ZIP", [`${P}txtPg1Pt1I11ContactNumber`]: "11 — Contact number", [`${P}txtPg1Pt1I12Email`]: "12 — E-mail",
    [`${P}txtPg1Pt1I13MainLine`]: "13 — Main line of business", [`${P}txtPg1Pt1I14PSICCode`]: "14 — PSIC code",
    [`${P}txtPg1Pt1I16LegalBasis`]: "16 — Legal basis of tax relief/exemption", [`${P}txtPg1Pt1I17Investment`]: "17 — Investment promotion agency",
    [`${P}txtPg1Pt1I18RegisteredActivity`]: "18 — Registered activity/program", [`${P}txtPg1Pt1I19EffectivityFrom`]: "19 — Effectivity: from",
    [`${P}txtPg1Pt1I19EffectivityTo`]: "19 — Effectivity: to", [`${P}txtPg1Pt2I20TotalIncome`]: "20 — Total income tax due",
    [`${P}txtPg1Pt2I21AddPenalty`]: "21 — Add: penalties", [`${P}txtPg1Pt2I22TotalAmount`]: "22 — Total amount payable",
    [`${P}rdoPg1CTC`]: "23 — Community tax certificate", [`${P}rdoPg1Reg`]: "23 — SEC registration",
    [`${P}txtPg1Pt2I23CommunityTax`]: "23 — CTC / registration number", [`${P}txtPg1Pt1I24DateofIssue`]: "24 — Date of issue",
    [`${P}txtPg1Pt1I25PlaceofIssue`]: "25 — Place of issue", [`${P}txtPg1Pt1I26Amount`]: "26 — Amount (CTC)",
    [`${P}txtPg2Pt4I31NetSales`]: "31 — Net sales (Sch 1)", [`${P}txtPg2Pt4I32LessCost`]: "32 — Less: cost of sales (Sch 2)",
    [`${P}txtPg2Pt4I33GrossIncome`]: "33 — Gross income", [`${P}txtPg2Pt4I34AddOther`]: "34 — Add: other taxable income (Sch 3)",
    [`${P}txtPg2Pt4I35TotalGross`]: "35 — Total gross income", [`${P}txtPg2Pt4I36OrdinaryAllowable`]: "36 — Ordinary allowable deductions (Sch 4)",
    [`${P}txtPg2Pt4I37SpecialAllowable`]: "37 — Special allowable deductions (Sch 5)", [`${P}txtPg2Pt4I38TotalItemized`]: "38 — Total itemized deductions",
    [`${P}txtPg2Pt4I39NetTaxable`]: "39 — Net taxable income", [`${P}txtPg2Pt4I41TotalIncome`]: "41 — Total income tax due (exempt: 0)",
    [`${P}txtPg2Pt5I42RegularIncome`]: "42 — Regular income tax otherwise due (39 × 30%)", [`${P}txtPg2Pt5I43SpecialAllowable`]: "43 — Special allowable deductions × 30%",
    [`${P}txtPg2Pt5I44TotalTax`]: "44 — Total tax relief availment",
    [`${P}txtPg5S6I1NetIncomeLoss`]: "Sch 6 1 — Net income/(loss) per books", [`${P}txtPg5S6I10NetTaxable`]: "Sch 6 10 — Net taxable income",
    [`${P}txtPg6S7I7TotalAssets`]: "Sch 7 7 — Total assets", [`${P}txtPg6S7I17LiabilitiesAndEquity`]: "Sch 7 17 — Total liabilities and equity",
    [`${P}txtPg7Sc9I19TotalFinalTax`]: "Sch 9 19 — Total final tax withheld/paid", [`${P}txtPg7Sc10I8TotalIncome`]: "Sch 10 8 — Total exempt income",
  },
  // createXMLFileName, old layout: month + the 2-digit year (no "20")
  periodName: (s) => `${s[`${P}ddlPg1I2Date`] || "12"}${s[`${P}txtPg1I2YearEnd`] || "25"}`,
  prefill: {
    [`${P}txtPg1Pt1I6TINC1`]: "tin1", [`${P}txtPg1Pt1I6TINC2`]: "tin2", [`${P}txtPg1Pt1I6TINC3`]: "tin3", [`${P}txtPg1Pt1I6TINC4`]: "tin4",
    [`${P}hdnPg1Pt1I7RDO`]: "rdo", [`${P}rdoPg1Pt1I7RDO`]: "rdo", [`${P}txtPg1Pt1I9RegisteredName`]: "fn",
    [`${P}txtPg1Pt1I10RegisteredAddress`]: "regAddr", [`${P}txtZIP`]: "zip", [`${P}txtPg1Pt1I11ContactNumber`]: "telNo", [`${P}txtPg1Pt1I13MainLine`]: "lob",
  },
};
export default form;
