// BIR Form 1701 (2013 layout) test states: a filer's choices and figures, by bare id (`id()` adds the prefix).
import type { FormState } from "@/form/schema.ts";

export const id = (k: string): string => `frm1701:${k}`;
const of = (o: Record<string, string>): FormState => Object.fromEntries(Object.entries(o).map(([k, v]) => [id(k), v]));

export const identity: FormState = of({
  txtPg1Pt1I5TIN1: "846", txtPg1Pt1I5TIN2: "532", txtPg1Pt1I5TIN3: "107", txtTIN4: "00000", ddlPg1Pt1I6RDOCode: "043",
  txtPg1Pt1I8TaxFiler: "DELA CRUZ", txtPg1Pt1I8TaxFilerFirstName: "JUAN", txtPg1Pt1I8TaxFilerMiddleName: "SANTOS",
  txtPg1Pt1I10Address: "1 RIZAL ST., QUEZON CITY", txtPg1Pt1I13Contact: "0281234567", txtZIP: "1100", txtPg1Pt1I17Business: "RETAIL",
  txtPg1I1Year: "17",
});

const single = of({
  rdoPg1I2AmmendNo: "true", rdoPg1I3ShortPeriodNo: "true", rdoPg1Pt1I7TypeSingle: "true", rdoPg1Pt1I14StatusSingle: "true",
  rdoPg1Pt1I21Cash: "true", rdoPg1Pt1I22IncomeExemptNo: "true", rdoPg1Pt1I23IncomeSpecialNo: "true", rdoPg1Pt1I24ClaimingNo: "true",
});

/** single proprietor, business income, itemized: Sched 2 sales, Sched 4A cost of sales, Sched 4B deductions, credits */
export const bizItemized: FormState = {
  ...identity,
  ...single,
  ...of({
    rdoPg1Pt1I4Business: "true", rdoPg1Pt1I20DeductionItemized: "true",
    txtPg5Sc2I1TaxPayerC1: "1,500,000.00", txtPg5Sc2I2TaxPayerC1: "250,000.40", txtPg5Sc2I4TaxPayerC1: "50,000.00",
    txtPg5Sc4AI1TaxPayerC1: "100,000.00", txtPg5Sc4AI2TaxPayerC1: "700,000.00", txtPg5Sc4AI4TaxPayerC1: "80,000.00",
    txtPg6Sc4BI6TaxPayerC1: "120,000.00", txtPg6Sc4BI7TaxPayerC1: "35,000.50",
    txtPg9Sc9I1TaxPayerC1: "15,000.00", txtPg9Sc9I2TaxPayerC1: "12,345.67",
    txtPg3Pt5I81Surcharge: "1,000.00",
  }),
};

/** the same business on the optional standard deduction (40% of gross sales, Sched 4–7 locked) */
export const bizOsd: FormState = { ...bizItemized, [id("rdoPg1Pt1I20DeductionItemized")]: "false", [id("rdoPg1Pt1I20DeductionOSD")]: "true" };

/** compensation only: Sched 1 employers (the tax-filer column), Part IV 41–49 */
export const compensation: FormState = {
  ...identity,
  ...single,
  ...of({
    rdoPg1Pt1I4Compensation: "true",
    rdoPg5Sc1I1Taxpayer: "true", txtPg5Sc1I1NameOfEmp: "ACME TRADING CORP.",
    txtPg5Sc1I1EmpTIN1C1: "123", txtPg5Sc1I1EmpTIN2C1: "456", txtPg5Sc1I1EmpTIN3C1: "789", txtPg5Sc1I1EmpTIN4C1: "00000",
    txtPg5Sc1I1ComIncomeC2: "480,000.00", txtPg5Sc1I1TaxWithheldC3: "60,000.00",
    txtPg2Pt4I44PremiumC1: "2,000.00",
  }),
};

/** married, joint: the taxpayer mixed income (Sched 1 + Sched 2, itemized), the spouse business on OSD (Part VII 105/109) */
export const joint: FormState = {
  ...identity,
  ...of({
    rdoPg1I2AmmendNo: "true", rdoPg1I3ShortPeriodNo: "true", rdoPg1Pt1I7TypeSingle: "true", rdoPg1Pt1I14StatusMarried: "true",
    rdoPg1Pt1I15WithIncome: "true", rdoPg1Pt1I16Joint: "true", rdoPg1Pt1I21Cash: "true",
    rdoPg1Pt1I22IncomeExemptNo: "true", rdoPg1Pt1I23IncomeSpecialNo: "true", rdoPg1Pt1I24ClaimingNo: "true",
    rdoPg1Pt1I4Mixed: "true", rdoPg1Pt1I20DeductionItemized: "true",
    rdoPg5Sc1I1Taxpayer: "true", txtPg5Sc1I1NameOfEmp: "ACME TRADING CORP.",
    txtPg5Sc1I1EmpTIN1C1: "123", txtPg5Sc1I1EmpTIN2C1: "456", txtPg5Sc1I1EmpTIN3C1: "789", txtPg5Sc1I1EmpTIN4C1: "00000",
    txtPg5Sc1I1ComIncomeC2: "300,000.00", txtPg5Sc1I1TaxWithheldC3: "25,000.00",
    txtPg5Sc2I1TaxPayerC1: "600,000.00", txtPg5Sc4AI2TaxPayerC1: "200,000.00", txtPg6Sc4BI6TaxPayerC1: "50,000.00",
    txtPg4Pt7I95SpouseTIN1: "111", txtPg4Pt7I95SpouseTIN2: "222", txtPg4Pt7I95SpouseTIN3: "333", txtPg4Pt7I95SpouseTIN4: "00000",
    txtPg4Pt7I97SpouseName: "DELA CRUZ, MARIA", rdoPg4Pt7I105OSD: "true", rdoPg4Pt7I106Cash: "true",
    rdoPg4Pt7I107No: "true", rdoPg4Pt7I108No: "true", rdoPg4Pt7I109Business: "true", rdoPg4Pt7I110No: "true",
    txtPg5Sc2I1SpouseC2: "900,000.00", txtPg9Sc9I1SpouseC2: "9,000.00",
  }),
};
