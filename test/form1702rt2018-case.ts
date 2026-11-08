// Shared 1702-RT (2018 layout) fill cases: both 2018 editions have the same save keys, so their tests reuse them.
import type { FormState, GroupState } from "@/form/schema.ts";
import { P } from "@/form/form1702rtv2018c.ts";

export const id = (s: string) => `${P}${s}`;
export const identity: FormState = {
  [id("txtPg1Pt1I6TIN1")]: "846", [id("txtPg1Pt1I6TIN2")]: "532", [id("txtPg1Pt1I6TIN3")]: "107", [id("txtPg1Pt1I6TIN4")]: "00000",
  [id("txtRDO")]: "043", [id("drpPg1Pt1I7RDOCode")]: "043", [id("txtPg1Pt1I8Name1")]: "ABC (PHILS.) INC.",
  [id("txtPg1Pt1I9Address1")]: "1 RIZAL ST., QUEZON CITY", [id("txtZIP")]: "1100", [id("txtPg1Pt1I11Contact")]: "0281234567",
};

/** Itemized, ≥ 4 years since incorporation (MCIT ticked), every schedule populated, a positive tax still due. */
export const itemized: FormState = {
  ...identity,
  [id("txtPg1Pt1I10")]: "03/15/2015",
  [id("txtPg1Pt2I17Surcharge")]: "1,000", [id("txtPg1Pt2I18Interest")]: "250", [id("txtPg1Pt2I19Compromise")]: "0",
  [id("txtPg2Pt4I27Sales")]: "10,000,000", [id("txtPg2Pt4I28LessSales")]: "200,000", [id("txtPg2Pt4I30LessCost")]: "6,000,000",
  [id("txtPg2Pt4I32AddOtherTaxable")]: "150,000",
  [id("Pg2Pt4I40IncomeTaxRate")]: "25",
  [id("txtPg2Pt4I42MinimumCorporate")]: "79,000",
  [id("txtPg2Pt4I44ExcessCredits")]: "10,000", [id("txtPg2Pt4I45IncomeTaxPaymentUnderMCIT")]: "5,000",
  [id("txtPg2Pt4I46IncomeTaxUnderRegular")]: "120,000", [id("txtPg2Pt4I48CreditableTaxWithheldFromPrevious")]: "30,000",
  [id("txtPg2Pt4I49CreditableTaxWithheldFor4thQuarter")]: "12,500", [id("txtPg2Pt4I50ForeignTaxCredits")]: "0",
  [id("txtPg2Pt452SpecialTaxCredits")]: "2,000", [id("txtPg2Pt4I53C1")]: "TAX CREDIT CERTIFICATE", [id("txtPg2Pt4I53C2")]: "3,000",
  [id("txtPg2Pt5I57SpecialAllowable")]: "7,500",
  [id("txtPg3Sc1I1Amortization")]: "15,000", [id("txtPg3Sc1I5Depreciation")]: "250,000", [id("txtPg3Sc1I8Interest")]: "40,000",
  [id("txtPg3Sc1I13Salaries")]: "1,800,000", [id("txtPg3Sc1I15TaxesandLicenses")]: "60,000", [id("txtPg3Sc1I17bProfessionalFees")]: "90,000",
  [id("txtPg3Sc1I17dC1")]: "REPAIRS", [id("txtPg3Sc1I17dC2")]: "35,000",
  [id("txtPg3Sc2I1C1")]: "TRAINING EXPENSE", [id("txtPg3Sc2I1C2")]: "RA 10771", [id("txtPg3Sc2I1C3")]: "25,000",
  [id("txtPg4Sc3AI5C1")]: "2022", [id("txtPg4Sc3AI5C2")]: "300,000", [id("txtPg4Sc3AI5C3")]: "0", [id("txtPg4Sc3AI5C4")]: "100,000", [id("txtPg4Sc3AI5C5")]: "150,000",
  [id("txtPg4Sc3AI6C1")]: "2023", [id("txtPg4Sc3AI6C2")]: "80,000", [id("txtPg4Sc3AI6C5")]: "80,000",
  [id("txtPg4Sc4I1C1")]: "2022", [id("txtPg4Sc4I1C2")]: "40,000", [id("txtPg4Sc4I1C3")]: "70,000", [id("txtPg4Sc4I1C5")]: "10,000", [id("txtPg4Sc4I1C7")]: "15,000",
  [id("txtPg4Sc4I2C1")]: "2023", [id("txtPg4Sc4I2C2")]: "50,000", [id("txtPg4Sc4I2C3")]: "60,000", [id("txtPg4Sc4I2C7")]: "4,000",
  [id("txtPg4Sc5I1NetIncome")]: "1,234,567", [id("txtPg4Sc5I2C1")]: "NON-DEDUCTIBLE EXPENSES", [id("txtPg4Sc5I2C2")]: "45,000",
  [id("txtPg4Sc5I5C1")]: "INCOME SUBJECTED TO FINAL TAX", [id("txtPg4Sc5I5C2")]: "12,000",
  [id("txtPg4Sc5I7C1")]: "DIVIDENDS", [id("txtPg4Sc5I7C2")]: "8,000",
  [id("txtPg1Pt2PagesFilled")]: "004",
};
export const row = (stem: string, ...col: Array<[string, string]>) => Object.fromEntries(col.map(([c, v]) => [`${P}${stem}.{i}${c}`, v]));
export const groups: GroupState = {
  credit54: [row("txtPg2Pt4I54", ["C1", "PRIOR-YEAR TCC"], ["C2", "4,000"]), row("txtPg2Pt4I54", ["C1", "BOI (RA 7916) CREDIT"], ["C2", "6,500"])],
  sc1_17i: [row("txtPg3Sc1I17i", ["C1", "COMMUNICATION"], ["C2", "22,000"]), row("txtPg3Sc1I17i", ["C1", "UTILITIES"], ["C2", "48,000"]), row("txtPg3Sc1I17i", ["C1", "SUPPLIES"], ["C2", "11,000"])],
  sc2_4: [row("txtPg3Sc2I4", ["C1", "SENIOR CITIZEN DISCOUNT"], ["C2", "RA 9994"], ["C3", "18,000"])],
  sc5_3: [row("txtPg4Sc5I3", ["C1", "UNREALIZED FX LOSS"], ["C2", "3,500"]), row("txtPg4Sc5I3", ["C1", "PENALTIES"], ["C2", "1,500"])],
  sc5_6: [row("txtPg4Sc5I6", ["C1", "TAX-EXEMPT INCOME"], ["C2", "2,000"])],
  sc5_8: [row("txtPg4Sc5I8", ["C1", "NOLCO APPLIED"], ["C2", "230,000"]), row("txtPg4Sc5I8", ["C1", "SPECIAL DEDUCTIONS"], ["C2", "43,000"])],
};

/** OSD, a negative gross (Sch IIIA row 4 still fills), an amended return and an overpayment carried over. */
export const osdLoss: FormState = {
  ...itemized, [id("rdoPg1Pt1I13OptionalStandard")]: "true", [id("rdoPg1Pt1I13ItemizedDeduction")]: "false",
  [id("txtPg2Pt4I30LessCost")]: "9,900,000", [id("txtPg2Pt4I32AddOtherTaxable")]: "-500,000",
  [id("rdoPg1Pt2I21OverpaymentCarried")]: "true", [id("rdoPg1I3AmmendYes")]: "true", [id("rdoPg1I3AmmendNo")]: "false",
  [id("txtPg2Pt4I51TaxPaidInReturn")]: "20,000",
};

/** Under 4 years since incorporation (no MCIT), an itemized loss, and NOLCO rows that break BIR's checks. */
export const youngLoss: FormState = {
  ...itemized, [id("txtPg1Pt1I10")]: "06/01/2023", [id("txtPg2Pt4I30LessCost")]: "9,500,000",
  [id("txtPg4Sc3AI5C5")]: "400,000", [id("txtPg4Sc3AI6C3")]: "50,000", [id("txtPg4Sc3AI7C1")]: "2024",
  [id("txtPg4Sc3AI7C2")]: "10,000", [id("txtPg4Sc3AI7C3")]: "20,000",
};

/** The NOLCO chain sticks on row 5 (C3 > C2 with C5 already 0), so row 6 is only cleared by the row check. */
export const stuckNolco: FormState = {
  ...itemized,
  [id("txtPg4Sc3AI5C2")]: "10,000", [id("txtPg4Sc3AI5C3")]: "20,000", [id("txtPg4Sc3AI5C4")]: "0", [id("txtPg4Sc3AI5C5")]: "0",
  [id("txtPg4Sc3AI6C2")]: "100,000", [id("txtPg4Sc3AI6C3")]: "80,000", [id("txtPg4Sc3AI6C5")]: "50,000",
};

/** Fiscal June year-end, centavo inputs (truncated), a stale overpayment tick, a negative Sch V input. */
export const fiscal: FormState = {
  ...identity,
  [id("rdoPg1I1Fiscal")]: "true", [id("rdoPg1I1Calendar")]: "false", [id("ddlPg1I2Month")]: "06",
  [id("txtPg1Pt1I10")]: "01/10/2010",
  [id("txtPg2Pt4I27Sales")]: "1,000,000.75", [id("txtPg2Pt4I28LessSales")]: "0.50", [id("txtPg2Pt4I30LessCost")]: "700,000.99",
  [id("txtPg3Sc1I13Salaries")]: "250,000.60", [id("txtPg3Sc1I17aJanitorial")]: "8,000",
  [id("txtPg2Pt4I42MinimumCorporate")]: "60,000",
  [id("txtPg2Pt4I48CreditableTaxWithheldFromPrevious")]: "1,000",
  [id("rdoPg1Pt2I21OverpaymentRefunded")]: "true",
  [id("txtPg4Sc5I1NetIncome")]: "-15,000", [id("txtPg4Sc5I7C1")]: "OTHER (SEE ATTACHED)", [id("txtPg4Sc5I7C2")]: "500",
  [id("txtPg1Pt2Signatory1")]: "JUAN (TREASURER)",
};
export const fiscalGroups: GroupState = {
  credit54: [row("txtPg2Pt4I54", ["C1", "CREDIT (TCC)"], ["C2", "700"])],
  sc5_6: [row("txtPg4Sc5I6", ["C1", "EXEMPT"], ["C2", "250"])],
};

/** Sch I 18 = 100 > 33 = 90, but "100" > "90" is false as strings: BIR records no NOL. */
export const tinyNol: FormState = { ...identity, [id("txtPg2Pt4I27Sales")]: "90", [id("txtPg3Sc1I1Amortization")]: "100" };
/** Deductions exactly equal to gross income: no NOL. */
export const evenNol: FormState = { ...identity, [id("txtPg2Pt4I27Sales")]: "500,000", [id("txtPg3Sc1I13Salaries")]: "500,000" };
