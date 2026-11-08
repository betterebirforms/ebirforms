import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1702EX, bare, comma, peso, validate1702EX, yearEndEX } from "@/form/form1702ex.ts";
import { legacyUnescape } from "@/lib/savefile.ts";
import { hasForm, startOracle, type Oracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1702EX:";
const id = (s: string) => `${P}${s}`;
const row = (stem: string, ...col: Array<[string, string]>) => Object.fromEntries(col.map(([c, v]) => [`${P}${stem}{i}${c}`, v]));
/** A DIV pop-up column (Sch 9 II–IV, Sch 10 I–II): cells `<stem>C_{i}`. */
const col = (cell: Record<string, string>) => Object.fromEntries(Object.entries(cell).map(([k, v]) => [`${P}${k}C_{i}`, v]));

const identity: FormState = {
  [id("txtPg1Pt1I6TINC1")]: "846", [id("txtPg1Pt1I6TINC2")]: "532", [id("txtPg1Pt1I6TINC3")]: "107", [id("txtPg1Pt1I6TINC4")]: "00000",
  [id("hdnPg1Pt1I7RDO")]: "043", [id("rdoPg1Pt1I7RDO")]: "043", [id("txtPg1Pt1I9RegisteredName")]: "ABC FOUNDATION (PHILS.) INC.",
  [id("txtPg1Pt1I10RegisteredAddress")]: "1 RIZAL ST., QUEZON CITY", [id("txtZIP")]: "1100", [id("txtPg1Pt1I11ContactNumber")]: "0281234567",
  [id("txtPg1Pt1I13MainLine")]: "CHARITY", [id("txtPg1Pt1I14PSICCode")]: "9499", [id("txtPg1I2YearEnd")]: "17",
  [id("txtPg1Pt1I8DateofIncorporation")]: "03/15/2010", [id("rdoPg1I5ATCR1C3")]: "true", [id("rdoPg1I5ATCR2C3")]: "false",
  [id("txtPg1Pt1I16LegalBasis")]: "SEC. 30(E) NIRC", [id("txtPg1Pt1I17Investment")]: "SEC", [id("txtPg1Pt1I18RegisteredActivity")]: "CHARITABLE WORK",
  [id("txtPg1Pt1I19EffectivityFrom")]: "01/01/2010", [id("txtPg1Pt1I19EffectivityTo")]: "12/31/2030",
  [id("rdoPg1Reg")]: "true", [id("rdoPg1CTC")]: "false", [id("txtPg1Pt2I23CommunityTax")]: "CN201012345",
  [id("txtPg1Pt1I24DateofIssue")]: "03/15/2010", [id("txtPg1Pt1I25PlaceofIssue")]: "QUEZON CITY", [id("txtPg1Pt2NumberofPagesFiled")]: "07",
};

/** Every schedule and every pop-up populated (an odd Sch 9 IV pop-up: BIR pads the pair), a negative net income per
 *  books and retained earnings (the two signed inputs), centavo inputs (truncated), Sch 8 with the "00000" bug. */
const full: FormState = {
  ...identity,
  [id("txtPg1Pt2I21AddPenalty")]: "1,000",
  [id("txtPg2Pt6I45NameofExternalAuditor")]: "REYES & CO.", [id("txtPg2Pt6I46TinC1")]: "111", [id("txtPg2Pt6I46TinC2")]: "222",
  [id("txtPg2Pt6I46TinC3")]: "333", [id("txtPg2Pt6I46TinC4")]: "00000",
  [id("txtPg3S1I1GoodsProp")]: "5,000,000", [id("txtPg3S1I2SaleServices")]: "1,000,000.75", [id("txtPg3S1I3LeaseProp")]: "200,000",
  [id("txtPg3S1I5LessSales")]: "100,000",
  [id("txtPg3S2I1MerchInventory")]: "500,000", [id("txtPg3S2I2AddPurchases")]: "1,500,000", [id("txtPg3S2I4LessMerch")]: "300,000",
  [id("txtPg3S2I6DirectMaterials")]: "100,000", [id("txtPg3S2I7AddPurchases")]: "200,000", [id("txtPg3S2I9DirectMaterials")]: "50,000",
  [id("txtPg3S2I11DirectLabor")]: "80,000", [id("txtPg3S2I12ManOverhead")]: "20,000", [id("txtPg3S2I14WorkProcess")]: "10,000",
  [id("txtPg3S2I15LessWork")]: "5,000", [id("txtPg3S2I17FinishedGoods")]: "40,000", [id("txtPg3S2I18LessFinished")]: "15,000",
  [id("txtPg3S2I20DirectWage")]: "60,000", [id("txtPg3S2I21DirectMaterials")]: "10,000", [id("txtPg3S2I25DirectOthers")]: "5,000",
  [id("txtPg4S3I1Col1")]: "INTEREST", [id("txtPg4S3I1Col2")]: "12,000", [id("txtPg4S3I2Col1")]: "RENT", [id("txtPg4S3I2Col2")]: "8,000",
  [id("txtPg4S4I1AdsAndPromotions")]: "50,000", [id("txtPg4S4I2Col1")]: "AMORTIZATION A", [id("txtPg4S4I2Col2")]: "5,000",
  [id("txtPg4S4I3Col1")]: "AMORTIZATION B", [id("txtPg4S4I3Col2")]: "3,000", [id("txtPg4S4I5BadDebts")]: "10,000",
  [id("txtPg4S4I29Salaries")]: "1,500,000", [id("txtPg4S4I23Rental")]: "240,000", [id("txtPg5S4I31SSS")]: "60,000",
  [id("txtPg5S4I35Transportation")]: "30,000", [id("txtPg5S4I36Col1")]: "OTHER ONE", [id("txtPg5S4I36Col2")]: "4,000",
  [id("txtPg5S4I37Col1")]: "OTHER TWO", [id("txtPg5S4I37Col2")]: "3,000", [id("txtPg5S4I38Col1")]: "OTHER THREE", [id("txtPg5S4I38Col2")]: "2,000",
  [id("txtPg5S5I1Col1")]: "TRAINING", [id("txtPg5S5I1Col2")]: "RA 10771", [id("txtPg5S5I1Col3")]: "25,000",
  [id("txtPg5S6I1NetIncomeLoss")]: "(50,000)", [id("txtPg5S6I2Col1")]: "NON-DEDUCTIBLE", [id("txtPg5S6I2Col2")]: "10,000",
  [id("txtPg5S6I5Col1")]: "INTEREST INCOME", [id("txtPg5S6I5Col2")]: "4,000", [id("txtPg5S6I7Col1")]: "SPECIAL", [id("txtPg5S6I7Col2")]: "3,000",
  [id("txtPg6S7I1CurrentAssets")]: "1,000,000", [id("txtPg6S7I3Property")]: "2,000,000", [id("txtPg6S7I8CurrentLiabilities")]: "500,000",
  [id("txtPg6S7I9LongLiabilities")]: "500,000", [id("txtPg6S7I13CapitalStock")]: "2,500,000", [id("txtPg6S7I15RetainedEarnings")]: "(500,000)",
  [id("chkPg6S8StockHolders")]: "true",
  [id("txtPg6S8I1Col1Name")]: "JUAN DELA CRUZ", [id("txtPg6S8I1Col2TIN1")]: "123", [id("txtPg6S8I1Col2TIN2")]: "456", [id("txtPg6S8I1Col2TIN3")]: "789",
  [id("txtPg6S8I1Col2TIN4")]: "00000", [id("txtPg6S8I1Col3CapContri")]: "1,000,000", [id("txtPg6S8I1Col4PTotal")]: "50",
  [id("txtPg6S8I2Col1Name")]: "MARIA SANTOS", [id("txtPg6S8I2Col2TIN1")]: "987", [id("txtPg6S8I2Col2TIN2")]: "654", [id("txtPg6S8I2Col2TIN3")]: "321",
  [id("txtPg6S8I2Col2TIN4")]: "00001", [id("txtPg6S8I2Col3CapContri")]: "1,000,000", [id("txtPg6S8I2Col4PTotal")]: "50.50",
  [id("txtPg7Sc9I1InterestsC2")]: "100,000", [id("txtPg7Sc9I1InterestsC3")]: "20,000", [id("txtPg7Sc9I3DividendsC2")]: "50,000", [id("txtPg7Sc9I3DividendsC3")]: "5,000",
  [id("txtPg7Sc9I5DescriptionofPropertyC1")]: "LOT A", [id("txtPg7Sc9I5DescriptionofPropertyC2")]: "LOT B",
  [id("txtPg7Sc9I8ActualAmountC1")]: "1,000,000", [id("txtPg7Sc9I8ActualAmountC2")]: "500,000",
  [id("txtPg7Sc9I9FinalTaxC1")]: "60,000", [id("txtPg7Sc9I9FinalTaxC2")]: "30,000",
  [id("ddPg7S9I10C1")]: "CS", [id("txtPg7Sc9I10PSCSC1")]: "ABC CORP", [id("txtPg7Sc9I12NumberofSharesC1")]: "1,000",
  [id("txtPg7Sc9I13DateofIssueC1")]: "06/15/2017", [id("txtPg7Sc9I14ActualAmountC1")]: "100,000", [id("txtPg7Sc9I15FinalTaxC1")]: "500",
  [id("txtPg7Sc9I16OtherIncomeC1")]: "ROYALTY", [id("txtPg7Sc9I17ActualAmountC1")]: "10,000", [id("txtPg7Sc9I18FinalTaxC1")]: "2,000",
  [id("txtPg7Sc10I1ReturnofPremium")]: "5,000", [id("txtPg7Sc10I2DescriptionofPropertyC1")]: "DONATED LOT", [id("txtPg7Sc10I5ActualAmountC1")]: "10,000",
  [id("txtPg7Sc10I6OtherExemptC2")]: "GRANTS", [id("txtPg7Sc10I7ActualAmountC2")]: "2,000",
};
const groups: GroupState = {
  sc3_3: [row("txtPg4S3I3_", ["Col1", "OTHER INCOME A"], ["Col2", "1,000"]), row("txtPg4S3I3_", ["Col1", "OTHER INCOME B"], ["Col2", "2,500.90"])],
  sc4_4: [row("txtPg4S4I4_", ["Col1", "AMORTIZATION C"], ["Col2", "2,000"])],
  sc4_39: [row("txtPg5S4I39_", ["Col1", "MISC 1"], ["Col2", "1,000"]), row("txtPg5S4I39_", ["Col1", "MISC 2"], ["Col2", "1,000"]), row("txtPg5S4I39_", ["Col1", "MISC 3"], ["Col2", "1,000"])],
  sc5_4: [row("txtPg5S5I4_", ["Col1", "ADOPT-A-SCHOOL"], ["Col2", "RA 8525"], ["Col3", "10,000"]), row("txtPg5S5I4_", ["Col1", "PWD WAGES"], ["Col2", "RA 7277"], ["Col3", "5,000"])],
  sc6_3: [row("txtPg5S6I3_", ["Col1", "PENALTIES"], ["Col2", "5,000"])],
  sc6_6: [row("txtPg5S6I6_", ["Col1", "DIVIDEND"], ["Col2", "1,000"]), row("txtPg5S6I6_", ["Col1", "INTEREST"], ["Col2", "2,000"])],
  sc6_8: [row("txtPg5S6I8_", ["Col1", "NOLCO"], ["Col2", "500"])],
  sc9_1: [row("txtPg7S9Pt1_", ["Col1", "PRIZE X"], ["Col2", "0"], ["Col3", "10,000"], ["Col4", "2,000"])],
  sc9_2: [
    col({ txtPg7Sc9I5DescriptionofProperty: "LOT C", txtPg7Sc9I6OCT: "TCT-1", txtPg7Sc9I7CAR: "CAR-1", txtPg7Sc9I8ActualAmount: "300,000", txtPg7Sc9I9FinalTax: "18,000" }),
    col({ txtPg7Sc9I5DescriptionofProperty: "LOT D", txtPg7Sc9I6OCT: "TCT-2", txtPg7Sc9I7CAR: "CAR-2", txtPg7Sc9I8ActualAmount: "200,000", txtPg7Sc9I9FinalTax: "12,000" }),
  ],
  sc9_3: [
    col({ ddPg7S9I10: "CS", txtPg7Sc9I10PSCS: "XYZ INC", txtPg7Sc9I11CAR: "CAR-3", txtPg7Sc9I12NumberofShares: "500", txtPg7Sc9I13DateofIssue: "03/01/2017", txtPg7Sc9I14ActualAmount: "50,000", txtPg7Sc9I15FinalTax: "250" }),
    col({ ddPg7S9I10: "PS", txtPg7Sc9I10PSCS: "PQR INC", txtPg7Sc9I11CAR: "CAR-4", txtPg7Sc9I12NumberofShares: "200", txtPg7Sc9I13DateofIssue: "04/01/2017", txtPg7Sc9I14ActualAmount: "20,000", txtPg7Sc9I15FinalTax: "100" }),
  ],
  sc9_4: [
    col({ txtPg7Sc9I16OtherIncome: "FEES A", txtPg7Sc9I17ActualAmount: "1,000", txtPg7Sc9I18FinalTax: "150" }),
    col({ txtPg7Sc9I16OtherIncome: "FEES B", txtPg7Sc9I17ActualAmount: "2,000", txtPg7Sc9I18FinalTax: "300" }),
    col({ txtPg7Sc9I16OtherIncome: "FEES C", txtPg7Sc9I17ActualAmount: "3,000", txtPg7Sc9I18FinalTax: "450" }),
  ],
  sc10_1: [
    col({ txtPg7Sc10I2DescriptionofProperty: "BUILDING", txtPg7Sc10I3ModeofTransfer: "DONATION", txtPg7Sc10I4CAR: "CAR-5", txtPg7Sc10I5ActualAmount: "40,000" }),
    col({ txtPg7Sc10I2DescriptionofProperty: "VEHICLE", txtPg7Sc10I3ModeofTransfer: "DONATION", txtPg7Sc10I4CAR: "CAR-6", txtPg7Sc10I5ActualAmount: "60,000" }),
  ],
  sc10_2: [col({ txtPg7Sc10I6OtherExempt: "GRANT A", txtPg7Sc10I7ActualAmount: "7,000" }), col({ txtPg7Sc10I6OtherExempt: "GRANT B", txtPg7Sc10I7ActualAmount: "3,000" })],
};

const thisYear = new Date().getFullYear();
/** Fiscal June 2017, IC 021 (Partners), a CTC issued this year, a live accreditation, negative inputs (BIR's blur
 *  makes them 0), a TO date before FROM (cleared), a Sch 9 date outside the taxable year (cleared). */
const fiscal: FormState = {
  ...identity,
  [id("rdoPg1I1Fiscal")]: "true", [id("rdoPg1I1Calendar")]: "false", [id("ddlPg1I2Date")]: "06",
  [id("rdoPg1I5ATCR1C3")]: "false", [id("rdoPg1I5ATCR2C3")]: "true",
  [id("rdoPg1CTC")]: "true", [id("rdoPg1Reg")]: "false", [id("txtPg1Pt1I24DateofIssue")]: `01/01/${thisYear}`, [id("txtPg1Pt1I26Amount")]: "500",
  [id("txtPg1Pt1I19EffectivityFrom")]: "01/01/2012", [id("txtPg1Pt1I19EffectivityTo")]: "01/01/2011",
  [id("txtPg2Pt6I47NameofSigningPartner")]: "ANA REYES", [id("txtPg2Pt6I49BIRAccreditedNoC1")]: "07", [id("txtPg2Pt6I49BIRAccreditedNoC2")]: "001234",
  [id("txtPg2Pt6I49BIRAccreditedNoC3")]: "001", [id("txtPg2Pt6I49BIRAccreditedNoC4")]: "2025", [id("txtPg2Pt6I50IssueDate")]: `01/02/${thisYear - 1}`,
  [id("txtPg3S1I1GoodsProp")]: "300,000.99", [id("txtPg3S1I5LessSales")]: "-5,000", [id("txtPg4S4I29Salaries")]: "400,000",
  [id("txtPg5S6I1NetIncomeLoss")]: "-99,999", [id("txtPg6S7I1CurrentAssets")]: "-10", [id("txtPg6S7I13CapitalStock")]: "100",
  [id("txtPg7Sc9I13DateofIssueC1")]: "08/01/2017",
  [id("txtPg6S8I1Col1Name")]: "PARTNER ONE", [id("txtPg6S8I1Col4PTotal")]: "ABC",
};
/** An expired accreditation: BIR overwrites 51 with 50 + 3 years, then wipes both. */
const expired: FormState = { ...identity, [id("txtPg2Pt6I50IssueDate")]: "06/01/2016", [id("txtPg2Pt6I51ExpiryDate")]: "06/01/2018", [id("rdoPg1Reg")]: "false", [id("rdoPg1CTC")]: "true" };

describe("1702EX compute (whole pesos, saved bare)", () => {
  const o = computeForm(FORM_1702EX, full, groups);
  const v = (s: string) => o[id(s)];

  it("Sch 1 / Sch 2 / Sch 3 → page 2 gross income", () => {
    expect(v("txtPg3S1I4Total")).toBe("6200000"); // 1,000,000.75 is a whole 1,000,000
    expect(v("txtPg2Pt4I31NetSales")).toBe("6100000");
    expect(v("txtPg3S2I27TotalCostSales")).toBe("2155000"); // 1.7M + 380k + 75k
    expect(v("txtPg2Pt4I33GrossIncome")).toBe("3945000");
    expect(v("txtPg4S3I4TotalTaxIncome")).toBe("23500"); // 12k + 8k + pop-up (1,000 + 2,500)
    expect(v("txtPg2Pt4I35TotalGross")).toBe("3968500");
  });

  it("Sch 4 / Sch 5 deductions, 39, the 30% Part V and page 1", () => {
    expect(v("txtPg5S4I40TotalAllowableDeduction")).toBe("1912000");
    expect(v("txtPg5S5I5TotalAllowable")).toBe("40000");
    expect(v("txtPg2Pt4I39NetTaxable")).toBe("2016500");
    expect(v("txtPg2Pt4I41TotalIncome")).toBe("0");
    expect(v("txtPg2Pt5I42RegularIncome")).toBe("604950");
    expect(v("txtPg2Pt5I43SpecialAllowable")).toBe("12000");
    expect(v("txtPg2Pt5I44TotalTax")).toBe("616950");
    expect(v("txtPg1Pt2I22TotalAmount")).toBe("1000");
  });

  it("Sch 6 keeps a negative net income per books; Sch 7 a negative retained earnings; Sch 9 / 10 totals", () => {
    expect(v("txtPg5S6I4Total")).toBe("-35000");
    expect(v("txtPg5S6I9Col2")).toBe("10500");
    expect(v("txtPg5S6I10NetTaxable")).toBe("-45500");
    expect(v("txtPg6S7I16TotalEquity")).toBe("2000000");
    expect(v("txtPg6S7I17LiabilitiesAndEquity")).toBe("3000000");
    // 25k Part I + 90k item 9 + 500 + 2,000 + pop-ups: 4.x 2,000, II 30,000, III 350, IV 900
    expect(v("txtPg7Sc9I19TotalFinalTax")).toBe("150750");
    expect(v("txtPg7Sc10I8TotalIncome")).toBe("127000"); // 5k + 10k + 2k + 100k + 10k
  });

  it("saved records: bare amounts, comma subtotals, pop-up lines, DIV counts and padding, Sch 8's 00000 bug", () => {
    const rec = new Map(formRecords(FORM_1702EX, full, groups).map((r) => [r.key, r.value]));
    expect(rec.get(id("txtPg3S1I2SaleServices"))).toBe("1000000");
    expect(rec.get(id("txtPg5S6I1NetIncomeLoss"))).toBe("-50000");
    expect(rec.get(id("txtPg4S3I3Col1"))).toBe("OTHERS");
    expect(rec.get(id("txtPg4S3I3Col2"))).toBe("3500");
    expect(rec.get("Pg4S3I3SubTotal")).toBe("3,500");
    expect(rec.get(id("txtPg4S3I3_2Col2"))).toBe("2500");
    expect(rec.get(id("txtPg5S5I4Col1"))).toBe("OTHERS");
    expect(rec.get(id("txtPg4S4I4Col1"))).toBe("AMORTIZATION C");
    expect(rec.get("Pg7S9Pt1SubTotal")).toBe("2,000");
    expect(rec.get("Pg7S9Pt4PopLength")).toBe("2");
    expect(rec.get(id("txtPg7Sc9I16OtherIncomeC_5"))).toBe("FEES C");
    expect(rec.get(id("txtPg7Sc9I16OtherIncomeC_6"))).toBe("");
    expect(rec.get(id("txtPg7Sc9I18FinalTaxC_6"))).toBe("0");
    expect(rec.get(id("ddPg7S9I10C_4"))).toBe("PS");
    expect(rec.get(id("txtPg6S8I1Col2TIN4"))).toBe("0");
    expect(rec.get(id("txtPg6S8I2Col2TIN4"))).toBe("1");
    expect(rec.get(id("txtPg6S8I2Col4PTotal"))).toBe("50.5");
    expect(rec.get(id("chkPg6S8Partners"))).toBe("false");
    expect(rec.get(id("txtPg7TINC3"))).toBe("107");
    expect(rec.get(id("txtPg5RegisteredName"))).toBe("ABC FOUNDATION (PHILS.) INC.");
    expect(legacyUnescape(rec.get(id("txtPg1Pt1I9RegisteredName"))!)).toBe("ABC FOUNDATION (PHILS.) INC.");
    expect(rec.get(id("txtPg1Pt1I26Amount"))).toBe("0"); // Reg: Select_CTCorReg forces 0
    expect(rec.get("Pg4S4I4PopLength")).toBe("1");
    const blank = new Map(formRecords(FORM_1702EX, identity, {}).map((r) => [r.key, r.value]));
    expect(blank.get("Pg4S3I3PopLength")).toBe("0"); // BIR's template default for this one
    expect(blank.get("Pg5S6I8PopLength")).toBe("");
  });

  it("negatives become 0, decimals truncate, dates BIR clears, the ATC's checkboxes", () => {
    const c = computeForm(FORM_1702EX, fiscal, {});
    expect(c[id("txtPg3S1I6NetSales")]).toBe("300000"); // 300,000.99 → 300,000; −5,000 → 0
    expect(c[id("txtPg5S6I4Total")]).toBe("-99999");
    expect(c[id("txtPg6S7I7TotalAssets")]).toBe("0");
    expect(c[id("txtPg2Pt5I42RegularIncome")]).toBe("0"); // 39 < 0
    const rec = new Map(formRecords(FORM_1702EX, fiscal, {}).map((r) => [r.key, r.value]));
    expect(rec.get(id("txtPg1Pt1I19EffectivityTo"))).toBe("");
    expect(rec.get(id("txtPg7Sc9I13DateofIssueC1"))).toBe(""); // after the June 2017 year end
    expect(rec.get(id("txtPg2Pt6I51ExpiryDate"))).toBe(`01/02/${thisYear + 2}`);
    expect(rec.get(id("chkPg6S8Partners"))).toBe("true");
    expect(rec.get(id("chkPg6S8StockHolders"))).toBe("false");
    expect(rec.get(id("txtPg6S8I1Col4PTotal"))).toBe("0");
    expect(rec.get(id("txtPg1Pt1I26Amount"))).toBe("500");
    expect(rec.get(id("txtPg1Pt1I24DateofIssue"))).toBe(`01/01/${thisYear}`);
    const gone = new Map(formRecords(FORM_1702EX, expired, {}).map((r) => [r.key, r.value]));
    expect(gone.get(id("txtPg2Pt6I50IssueDate"))).toBe("");
    expect(gone.get(id("txtPg2Pt6I51ExpiryDate"))).toBe("");
    expect(gone.get(id("txtPg1Pt1I24DateofIssue"))).toBe(""); // a CTC from 2010, not this year
    expect(validate1702EX(fiscal).map((p) => p.id)).toEqual(expect.arrayContaining([id("txtPg1Pt1I19EffectivityTo"), id("txtPg7Sc9I13DateofIssueC1")]));
    expect(validate1702EX(full, groups).map((p) => p.id)).toContain(id("txtPg7Sc9I16OtherIncomeC_6"));
  });

  it("helpers: BIR's whole-peso reads and FormatValue", () => {
    expect(peso("(1,234)")).toBe(-1234);
    expect(peso("1,234.99")).toBe(1234);
    expect(bare(-1234)).toBe("-1234");
    expect(comma(-1234567)).toBe("(1,234,567)");
    expect(yearEndEX((k) => ({ [id("rdoPg1I1Fiscal")]: "true", [id("txtPg1I2YearEnd")]: "17" })[k] ?? "")).toEqual({ month: "00", year: "17" });
  });
});

/** The BIR side of a full session: reveal pages 2–7, blur every input twice, press each populated pop-up's
 *  More → Save, and read what saveXML would write (maxlength-12/15 amounts bare). */
async function fullRecompute(oracle: Oracle, s: FormState, file: string, g: GroupState) {
  const escaped = new Set(FORM_1702EX.field.filter((f) => f.escaped).map((f) => f.id));
  const native = formRecords(FORM_1702EX, s, g).map((r) => ({ key: r.key, value: escaped.has(r.key) ? legacyUnescape(r.value) : r.value }));
  const table = { sc3_3: "Pg4S3I3", sc4_4: "Pg4S4I4", sc4_39: "Pg5S4I39", sc5_4: "Pg5S5I4", sc6_3: "Pg5S6I3", sc6_6: "Pg5S6I6", sc6_8: "Pg5S6I8", sc9_1: "Pg7S9Pt1" } as Record<string, string>;
  const div = { sc9_2: "Pt2", sc9_3: "Pt3", sc9_4: "Pt4", sc10_1: "Pt5", sc10_2: "Pt6" } as Record<string, string>;
  const press = Object.keys(g).filter((k) => (g[k] ?? []).length > 0);
  const { page, error } = await oracle.openSaved(FORM_1702EX, s, file, g);
  const legacy: Array<[string, string]> = await page.evaluate(([press, table, div]) => {
    for (const pg of [2, 3, 4, 5, 6, 7]) (document.getElementById(`Page${pg}Content`) as HTMLElement).style.display = "block";
    const all = () => Array.from((document.getElementById("frmMain") as HTMLFormElement).elements) as HTMLInputElement[];
    const blur = () => {
      for (const el of all()) if (!el.disabled && el.type === "text" && el.offsetParent !== null) el.dispatchEvent(new FocusEvent("blur"));
    };
    blur();
    blur();
    const w = window as unknown as Record<string, () => unknown>;
    for (const k of press) {
      if (table[k]) {
        w[`Set_${table[k]}`]?.();
        w[`Load_${table[k]}PopTable`]!();
        w[`Save_${table[k]}PopTable`]!();
      } else {
        w[`Load_Pg7S9${div[k]}PopDiv`]!();
        w[`Save_Pg7S9${div[k]}PopDiv`]!();
        (document.getElementById(`Pg7S9${div[k]}IterationDiv`) as HTMLElement).innerHTML = ""; // ConditionSave's Empty_Temp
      }
    }
    const saved = (el: HTMLInputElement) =>
      el.type === "text" && (el.maxLength === 12 || el.maxLength === 15)
        ? (el.value.includes("(") && el.value.includes(")") ? el.value.replace("(", "-").replace(")", "") : el.value).replace(/,/g, "")
        : el.value;
    return all()
      .filter((el) => el.id && ["text", "select-one", "radio", "checkbox"].includes(el.type))
      .map((el): [string, string] => [el.id, el.type === "radio" || el.type === "checkbox" ? String(el.checked) : saved(el)]);
  }, [press, table, div] as const);
  await page.close();
  const bir = new Map(legacy);
  const diff = native.filter((r) => bir.get(r.key)?.trim() !== r.value.trim()).map((r) => ({ key: r.key, native: r.value, legacy: bir.get(r.key) ?? null }));
  const missing = [...bir.keys()].filter((k) => !native.some((r) => r.key === k));
  return { diff, missing, error };
}

/** Keys a full-page session legitimately changes that a native save (the state BEFORE that session's extra blurs)
 *  does not: the pager (redirectToSchedule on item 25), and Sch 8 boxes of UNTOUCHED rows, which the maxlength-5
 *  blur turns from "" into `"" * 1` = 0. */
const untouchedSch8 = (s: FormState) => (key: string) => /:txtPg6S8I\d+Col(2TIN4|4PTotal)$/.test(key) && !(key in s);
/** BIR reload bugs, each kept natively at what BIR's own first save holds:
 *  • "&" is saved verbatim but read back through innerHTML, so a reopen shows "&amp;";
 *  • the Sch 9 III pop-up's PS/CS select: loadToDiv copies the DIV by .html() and Save_popDiv restores only text
 *    inputs, so every reopen resets it to "PS";
 *  • a negative in the two signed inputs: a reopen shows FormatValue's "(50,000)", and FormatValue cannot parse
 *    its own parentheses, so the next blur writes 0 (and the totals follow). */
const RELOAD_BUG = (s: FormState): string[] => [
  id("txtPg2Pt6I45NameofExternalAuditor"),
  ...Object.keys(s).filter((k) => /:ddPg7S9I10C_\d+$/.test(k)),
  ...(peso(s[id("txtPg5S6I1NetIncomeLoss")] ?? "0") < 0 ? ["txtPg5S6I1NetIncomeLoss", "txtPg5S6I4Total", "txtPg5S6I10NetTaxable"].map(id) : []),
  ...(peso(s[id("txtPg6S7I15RetainedEarnings")] ?? "0") < 0 ? ["txtPg6S7I15RetainedEarnings", "txtPg6S7I16TotalEquity", "txtPg6S7I17LiabilitiesAndEquity"].map(id) : []),
];
const rowSelect = (g: GroupState) => (g.sc9_3 ?? []).map((_, i) => id(`ddPg7S9I10C_${i + 3}`));
const SESSION = (s: FormState, g: GroupState) => (d: { key: string }) =>
  d.key !== id("txtCurrentPage") && !untouchedSch8(s)(d.key) && !RELOAD_BUG(s).includes(d.key) && !rowSelect(g).includes(d.key);

describe.skipIf(!hasForm("1702EX"))("native 1702EX is 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("BIR's reload rebuilds every pop-up: table rows, DIV pairs into their savers, counts", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1702EX, full, "84653210700000-1702EX-1217.xml", groups);
    const n = await page.evaluate(() => ({
      table: ["Pg4S3I3", "Pg4S4I4", "Pg5S4I39", "Pg5S5I4", "Pg5S6I3", "Pg5S6I6", "Pg5S6I8", "Pg7S9Pt1"].map((k) => (document.getElementById(`${k}PopTable`) as HTMLTableElement).rows.length),
      div: ["Pt2", "Pt3", "Pt4", "Pt5", "Pt6"].map((k) => document.querySelectorAll(`#Pg7S9${k}IterationDivSaver > div`).length),
    }));
    expect(n).toEqual({ table: [2, 1, 3, 2, 1, 2, 1, 1], div: [1, 1, 2, 1, 1] });
    expect(await value(id("txtPg7Sc9I16OtherIncomeC_5"))).toBe("FEES C");
    expect(await value(id("ddPg7S9I10C_3"))).toBe("PS"); // BIR reload bug: the saved "CS" is lost (see RELOAD_BUG)
    expect(await value(id("txtPg5S5I4_2Col2"))).toBe("RA 7277");
    expect(await value(id("txtPg4S3I3_2Col2"))).toBe("2,500"); // sleeptime's FormatValue pass
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("BIR's own Compute_* chain, date checks and pop-up Saves (all 7 pages, every input) land on the native save", async () => {
    for (const [s, g, file] of [
      [full, groups, "84653210700000-1702EX-1217.xml"],
      [fiscal, {}, "84653210700000-1702EX-0617.xml"],
      [expired, {}, "84653210700000-1702EX-1217.xml"],
    ] as const) {
      const r = await fullRecompute(oracle, s, file, g);
      expect(r.diff.filter(SESSION(s, g))).toEqual([]);
      expect(r.missing).toEqual([]);
      expect(r.error).toEqual([]);
    }
  }, 300_000);

  it("parityCheck: every schedule and pop-up populated; a fiscal IC 021 return; an expired accreditation", async () => {
    // BIR defect (ledgered in parity.test.ts): blurring item 25 moves BIR's saved pager from 1 to 3
    // plus the BIR reload bugs above that page 1's blur can see: "&" in item 45 and the pop-up PS/CS select
    const allow = [id("txtCurrentPage"), id("txtPg2Pt6I45NameofExternalAuditor"), ...rowSelect(groups)];
    expect(parityProblem(await parityCheck(oracle, FORM_1702EX, full, "84653210700000-1702EX-1217.xml", groups), allow)).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702EX, fiscal, "84653210700000-1702EX-0617.xml", {}), [id("txtCurrentPage")])).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_1702EX, expired, "84653210700000-1702EX-1217.xml", {}), [id("txtCurrentPage")])).toEqual([]);
  }, 200_000);
});
