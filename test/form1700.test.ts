import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formRecords, type FormState, type GroupRow, type GroupState } from "@/form/schema.ts";
import { FORM_1700, P } from "@/form/form1700.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
import { allPageParityCheck } from "./parity-page.ts";

const id = (s: string): string => `${P}${s}`;

// a single filer, itemized: employer 1 on the main rows (ticked TaxFiler), item 12 under SourceOfIncome_2
const base: FormState = {
  [id("txtYear")]: "25",
  [id("rdoPg1Pt1I3JointFilingNo")]: "true", [id("rdoPg1Pt1I13SingleInd")]: "true",
  [id("rdoPg1Pt1I14YesInd")]: "true",
  // one qualified dependent on page 4's Table 2 → item 15 = 1 → item 9 = 25,000 (BIR computes the count)
  [id("txtPg4T2FirstName1")]: "JUAN", [id("txtPg4T2LastName1")]: "DELA CRUZ", [id("txtPg4T2DependentDOB1")]: "01/15/2015",
  [id("txtPg1Pt1I5TIN1")]: "846", [id("txtPg1Pt1I5TIN2")]: "532", [id("txtPg1Pt1I5TIN3")]: "107", [id("txtPg1Pt1I5BranchCode")]: "00000",
  [id("txtPg1Pt1I6RDOCode")]: "043", [id("txtPg1Pt1I8TaxFilerLastName")]: "DELA CRUZ",
  [id("txtPg1Pt1I9Address1")]: "1 RIZAL ST., QUEZON CITY", [id("txtPg1Pt1I9ZipCode")]: "1100", [id("txtPg1Pt1I12ContactNo")]: "0281234567",
  // employer row 1 (the TaxFiler box ticked), the amounts
  [id("rdoPg2Pt4I1TaxFiler")]: "true",
  [id("txtPg2Pt4I1NameOfEmployer")]: "ACME CORP.", [id("txtPg2Pt4I1EMPTIN1")]: "123", [id("txtPg2Pt4I1EMPTIN2")]: "456", [id("txtPg2Pt4I1EMPTIN3")]: "789", [id("txtPg2Pt4I1EMPTINBranchCode")]: "000",
  [id("txtPg2Pt4I1ComIncomeC1")]: "600,000", [id("txtPg2Pt4I1TaxWithholdC2")]: "30,000",
  [id("txtPg2Pt4I5C1")]: "10,000", [id("txtPg2Pt4I8C1")]: "0",
  [id("SourceOfIncome_2")]: "true", [id("txtPg2Pt4I12")]: "OTHERS", [id("txtPg2Pt4I12C1")]: "5,000", [id("txtPg2Pt4I12C2")]: "0",
  [id("txtPg2Pt4I16C1")]: "2,000", [id("txtPg2Pt4I17C1")]: "1,500", [id("txtPg2Pt4I18C1")]: "500",
  [id("txtPg2Pt4I24")]: "1,000", [id("txtPg2Pt4I25")]: "2,000", [id("txtPg2Pt4I26")]: "3,000",
  [id("AmendedRtn_2")]: "true",
};
// one OTHERS row in the item-12 modal
const groups: GroupState = {
  Page2Part4I12ModalI12: [
    { [id("txtPg2Pt4I12Description_{i}C1")]: "HONORARIA", [id("txtPg2Pt4I12TaxFiler_{i}C2")]: "8,000", [id("txtPg2Pt4I12Spouse_{i}C3")]: "0" },
  ],
};

// a joint return with every modal populated: an employer-continuation row (item 4), two item-12 OTHERS rows, and one
// row in each page-3 schedule (A1 item 6, A2 items 7-11, A3 items 12-17, A4 items 18-20, B1 items 4-7, B2 items 8-9)
const joint: FormState = {
  [id("txtYear")]: "25",
  [id("rdoPg1Pt1I3JointFilingYes")]: "true", [id("rdoPg1Pt1I13MarriedInd")]: "true",
  [id("rdoPg1Pt1I14YesInd")]: "true", [id("rdoPg1Pt1I21SpouseClaimAdditionalExemptionNo")]: "true",
  [id("txtPg1Pt1I5TIN1")]: "846", [id("txtPg1Pt1I5TIN2")]: "532", [id("txtPg1Pt1I5TIN3")]: "107", [id("txtPg1Pt1I5BranchCode")]: "00000",
  [id("txtPg1Pt1I6RDOCode")]: "043", [id("txtPg1Pt1I8TaxFilerLastName")]: "DELA CRUZ",
  [id("txtPg1Pt1I17SpouseTIN1")]: "111", [id("txtPg1Pt1I17SpouseTIN2")]: "222", [id("txtPg1Pt1I17SpouseTIN3")]: "333", [id("txtPg1Pt1I17SpouseBranchCode")]: "00012",
  [id("rdoPg2Pt4I1TaxFiler")]: "true",
  [id("txtPg2Pt4I1NameOfEmployer")]: "ACME CORP.", [id("txtPg2Pt4I1EMPTIN1")]: "123", [id("txtPg2Pt4I1EMPTIN2")]: "456", [id("txtPg2Pt4I1EMPTIN3")]: "789", [id("txtPg2Pt4I1EMPTINBranchCode")]: "000",
  [id("txtPg2Pt4I1ComIncomeC1")]: "600,000", [id("txtPg2Pt4I1TaxWithholdC2")]: "30,000",
  [id("rdoPg2Pt4I2Spouse")]: "true",
  [id("txtPg2Pt4I2NameOfEmployer")]: "BETA INC.", [id("txtPg2Pt4I2EMPTIN1")]: "222", [id("txtPg2Pt4I2EMPTIN2")]: "333", [id("txtPg2Pt4I2EMPTIN3")]: "444", [id("txtPg2Pt4I2EMPTINBranchCode")]: "000",
  [id("txtPg2Pt4I2ComIncomeC1")]: "400,000", [id("txtPg2Pt4I2TaxWithholdC2")]: "20,000",
  [id("SourceOfIncome_2")]: "true",
  [id("txtPg3Pt5BI1")]: "1,000", [id("txtPg3Pt5BI7A")]: "300",
};
const jointGroups: GroupState = {
  modalPage2Part4: [
    { [id("txtPg2Pt4I3NameOfEmployer{i}")]: "GAMMA LTD.", [id("txtPg2Pt4I3EMPTIN1{i}")]: "555", [id("txtPg2Pt4I3EMPTIN2{i}")]: "666", [id("txtPg2Pt4I3EMPTIN3{i}")]: "777", [id("txtPg2Pt4I3EMPTINBranchCode{i}")]: "000",
      [id("txtPg2Pt4I{i}ComIncomeC1")]: "50,000", [id("txtPg2Pt4I{i}TaxWithholdC2")]: "2,500", [id("rdoPg2Pt4I{i}TaxFiler")]: "true", [id("rdoPg2Pt4I{i}Spouse")]: "false" },
  ],
  Page2Part4I12ModalI12: [
    { [id("txtPg2Pt4I12Description_{i}C1")]: "honoraria", [id("txtPg2Pt4I12TaxFiler_{i}C2")]: "8,000", [id("txtPg2Pt4I12Spouse_{i}C3")]: "1,000" },
    { [id("txtPg2Pt4I12Description_{i}C1")]: "royalty", [id("txtPg2Pt4I12TaxFiler_{i}C2")]: "2,000", [id("txtPg2Pt4I12Spouse_{i}C3")]: "500" },
  ],
  Page3Part5I6ModalA1: [
    { [id("txtPg3Pt5I6Description_{i}C1")]: "interest", [id("txtPg3Pt5I6AAFM_{i}C2")]: "10,000", [id("txtPg3Pt5I6FinalTaxWithheld_{i}C3")]: "2,000" },
  ],
  Page3Part5ModalA2: [
    { [id("txtPg3Pt5I7_{i}C1")]: "share co", [id("txtPg3Pt5I7_{i}C2")]: "x", [id("txtPg3Pt5I8_{i}C1")]: "100", [id("txtPg3Pt5I8_{i}C2")]: "", [id("txtPg3Pt5I9_{i}C1")]: "a", [id("txtPg3Pt5I9_{i}C2")]: "",
      [id("txtPg3Pt5I10_{i}C1")]: "5,000", [id("txtPg3Pt5I10_{i}C2")]: "0", [id("txtPg3Pt5I11SaleEx1_{i}C1")]: "300", [id("txtPg3Pt5I11SaleEx2_{i}C2")]: "0" },
  ],
  Page3Part5ModalA3: [
    { [id("drpPg3Pt5I12A1{i}")]: "", [id("txtPg3Pt5I12_{i}C1")]: "lot", [id("drpPg3Pt5I12B2{i}")]: "", [id("txtPg3Pt5I12_{i}C2")]: "", [id("txtPg3Pt5I13_{i}C1")]: "makati", [id("txtPg3Pt5I13_{i}C2")]: "",
      [id("txtPg3Pt5I14_{i}C1")]: "1,000,000", [id("txtPg3Pt5I14_{i}C2")]: "0", [id("txtPg3Pt5I15DateofIssue_{i}C1")]: "01/02/2025", [id("txtPg3Pt5I15DateofIssue_{i}C2")]: "",
      [id("txtPg3Pt5I16{i}C1")]: "60,000", [id("txtPg3Pt5I16{i}C2")]: "0", [id("txtPg3Pt5I17SaleEx1_{i}C1")]: "60,000", [id("txtPg3Pt5I17SaleEx2_{i}C2")]: "0" },
  ],
  Page3Part5ModalA4: [
    { [id("txtPg3Pt5I18R1_{i}C1")]: "prize", [id("txtPg3Pt5I18R2_{i}C2")]: "", [id("txtPg3Pt5I18R1_{i}C3")]: "", [id("txtPg3Pt5I18R2_{i}C4")]: "",
      [id("txtPg3Pt5I19_{i}C1")]: "20,000", [id("txtPg3Pt5I19_{i}C2")]: "0", [id("txtPg3Pt5I20SaleEx1_{i}C1")]: "4,000", [id("txtPg3Pt5I20SaleEx2_{i}C2")]: "0" },
  ],
  Page3Part5ModalB1: [
    { [id("txtPg3Pt5BI4_{i}C1")]: "car", [id("txtPg3Pt5BI4_{i}C2")]: "", [id("txtPg3Pt5BI5_{i}C1")]: "", [id("txtPg3Pt5BI5_{i}C2")]: "", [id("txtPg3Pt5BI6_{i}C1")]: "", [id("txtPg3Pt5BI6_{i}C2")]: "",
      [id("txtPg3Pt5BI7_{i}C1")]: "700", [id("txtPg3Pt5BI7_{i}C2")]: "0" },
  ],
  Page3Part5ModalB2: [
    { [id("txtPg3Pt5BI8_{i}C1")]: "gift", [id("txtPg3Pt5BI8_{i}C2")]: "", [id("txtPg3Pt5BI9_{i}C1")]: "90", [id("txtPg3Pt5BI9_{i}C2")]: "0" },
  ],
};

describe("1700 compute (the 2011 purely-compensation ITR)", () => {
  const v = (s: FormState = base, g: GroupState = groups) => {
    const m = new Map(formRecords(FORM_1700, s, g).map((r) => [r.key, r.value]));
    return (k: string) => m.get(k);
  };

  it("item 8 is the FIXED 50,000 personal exemption (processCivilStatus), zero for a non-joint spouse", () => {
    expect(v()(id("txtPg2Pt4I8C1"))).toBe("50,000");
    expect(v()(id("txtPg2Pt4I8C2"))).toBe("0");
  });

  it("item 4A = the ticked employer rows' Σ; 6 = 4A − 5; 10 = 7 + 8 + 9 (9 = 25,000 × dependents); 11 = 6 − 10", () => {
    const o = v();
    expect(o(id("txtPg2Pt4I4AC1"))).toBe("600,000");
    expect(o(id("txtPg2Pt4I6C1"))).toBe("590,000");
    expect(o(id("txtPg2Pt4I9C1"))).toBe("25,000");
    expect(o(id("txtPg2Pt4I10C1"))).toBe("75,000"); // 0 + 50,000 + 25,000
    expect(o(id("txtPg2Pt4I11C1"))).toBe("515,000");
  });

  it("item 13 = 11 + 12, 14 = graduated(13) (the pre-TRAIN table), 15 = item 4's withheld, 19/20/21", () => {
    const o = v();
    expect(o(id("txtPg2Pt4I12C1"))).toBe("8,000"); // the modal row's TaxFiler column (Σ/2 — one row)
    expect(o(id("txtPg2Pt4I13C1"))).toBe("523,000");
    expect(o(id("txtPg2Pt4I14C1"))).toBe("132,360"); // 125,000 + 32% × (523,000 − 500,000)
    expect(o(id("txtPg2Pt4I15C1"))).toBe("30,000");
    expect(o(id("txtPg2Pt4I19C1"))).toBe("34,000");
    expect(o(id("txtPg2Pt4I20C1"))).toBe("98,360");
    expect(o(id("txtPg2Pt4I21"))).toBe("98,360");
  });

  it("a non-joint return zeroes the spouse column (disablePt4I7, the C2 employer rows, item 22's rule)", () => {
    const o = v();
    expect(o(id("txtPg2Pt4I7C2"))).toBe("0");
    expect(o(id("txtPg2Pt4I22"))).toBe("0"); // 19 < 50% of 14 and 21 > 0: item 22 stays open, the sweep's blank → "0"
    expect(o(id("txtPg2Pt4I23"))).toBe("98,360");
    expect(o(id("txtPg1Pt2I31"))).toBe("104,360"); // 28 − 29(0) + 30(6,000)
  });

  it("the unticked employer rows are cleared by the reload (processTFEmployer's else)", () => {
    const o = v({ ...base, [id("txtPg2Pt4I2ComIncomeC1")]: "9,999" });
    expect(o(id("txtPg2Pt4I2ComIncomeC1"))).toBe("0");
    expect(o(id("txtPg2Pt4I2EMPTINBranchCode"))).toBe("000");
  });

  it("a joint return: the employer modal row joins 4A, item 12 is the OTHERS rows' Σ, BI10 = fields + rows", () => {
    const o = v(joint, jointGroups);
    expect(o(id("txtCtrmodalPage2Part4"))).toBe("1");
    expect(o(id("txtPg2Pt4I4ComIncomeC1"))).toBe("50,000"); // the modal row is item 4 (first_index 4)
    expect(o(id("rdoPg2Pt4I4TaxFiler"))).toBe("true");
    expect(o(id("txtPg2Pt4I4AC1"))).toBe("650,000"); // 600,000 + the modal row's 50,000
    expect(o(id("txtPg2Pt4I4BC1"))).toBe("400,000");
    expect(o(id("txtPg2Pt4I12"))).toBe("OTHERS");
    expect(o(id("txtPg2Pt4I12C1"))).toBe("10,000");
    expect(o(id("txtPg2Pt4I12C2"))).toBe("1,500");
    expect(o(id("txtPg2Pt4I8C2"))).toBe("50,000"); // married + joint: the spouse's personal exemption
    expect(o(id("txtPg2Pt4I13C1"))).toBe("610,000"); // 650,000 − 50,000 + 10,000
    expect(o(id("txtPg2Pt4I13C2"))).toBe("351,500"); // 400,000 − 50,000 + 1,500
    expect(o(id("txtPg2Pt4I6SubtotalC1"))).toBe("10,000");
    expect(o(id("txtPg2Pt4I17SubtotalC1"))).toBe("60,000");
    expect(o(id("txtPg3Pt5BI10TotalIncome"))).toBe("2,090"); // 1,000 + 300 + 700 + 90 (measured live in BIR)
    expect(o(id("txtPg3Pt5I21TotTaxWithheldPaid"))).toBe("0"); // item 21 sums the page fields only, not the modals
    expect(o(id("txtPg3Pt5I6Description_1C1"))).toBe("INTEREST");
    expect(o(id("drpPg3Pt5I12A11"))).toBe("PS"); // an unpicked select loads as its first option
    // the typed spouse branch code is BIR's save (its reload's reset to 000 is a BIR defect, ledgered)
    expect(o(id("txtPg1Pt1I17SpouseBranchCode"))).toBe("00012");
    expect(v({ ...joint, [id("txtPg1Pt1I17SpouseBranchCode")]: "" }, jointGroups)(id("txtPg1Pt1I17SpouseBranchCode"))).toBe("000"); // the Yes click's default
  });

  it("validates the TIN check digit", () => {
    expect(v()(id("txtPg1Pt1I5TIN1"))).toBe("846");
  });
});

describe.skipIf(!hasForm("1700"))("native 1700 is 1:1 with BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());

  it("is 1:1 (a single filer with an employer row, item 12 under SourceOfIncome_2, the item-12 modal row)", async () => {
    const r = await parityCheck(oracle, FORM_1700, base, "84653210700000-1700-122025.xml", groups);
    expect(parityProblem(r)).toEqual([]);
  }, 300_000);

  it("is 1:1 for a joint return with every modal populated (the reload, and every page shown + blurred)", async () => {
    // BIR defect: on every reopen of a joint return, processJointFiling → enableSpouse(true) resets the spouse branch
    // code to 000, whatever BIR itself saved (here 00012)
    const branch = `${P}txtPg1Pt1I17SpouseBranchCode`;
    const r = await parityCheck(oracle, FORM_1700, joint, "84653210700000-1700-joint.xml", jointGroups);
    expect(parityProblem(r, [branch])).toEqual([]);
    expect(r.diff.map((d) => [d.key, d.native, d.legacy])).toEqual([[branch, "00012", "000"]]);
    const all = await allPageParityCheck(oracle, FORM_1700, joint, "84653210700000-1700-jointp.xml", jointGroups);
    // BIR defect: BI10's summation counts the page fields twice (its own id contains "…BI1", holding the running Σ)
    // and the B1/B2 rows twice live (temp table + Repository copy), then halves. A reopen clears the temp tables, so
    // a blur on any Part-I field then halves the rows' share: 1,000 + 300 + (700 + 90)/2 = 1,695, not the 2,090 BIR
    // itself computed and saved. The save is BIR's live figure (measured: 2,090).
    expect(parityProblem(all, [branch, `${P}txtPg3Pt5BI10TotalIncome`])).toEqual([]);
    expect(all.diff.map((d) => [d.key, d.native, d.legacy])).toEqual([[branch, "00012", "000"], [`${P}txtPg3Pt5BI10TotalIncome`, "2,090", "1,695"]]);
  }, 300_000);

  it("is 1:1 for the seeded random fill", async () => {
    const { parityCheck: pc } = await import("./parity.ts");
    const state: FormState = {
      ...base,
      [id("txtPg2Pt4I5C1")]: "92,283.34", [id("txtPg2Pt4I7C1")]: "92,283.34", [id("txtPg2Pt4I8C1")]: "52,916.52",
      [id("txtPg2Pt4I5C2")]: "6,982.11", [id("txtPg2Pt4I12C1")]: "68,656.61", [id("txtPg2Pt4I12C2")]: "1,368.44",
      [id("txtPg2Pt4I1ComIncomeC1")]: "31,054.02", [id("txtPg2Pt4I2ComIncomeC1")]: "11,735.54",
      [id("txtPg3Pt5I11C1")]: "11,011.08", [id("txtPg3Pt5I17C1")]: "81,065.20",
    };
    void pc;
    const r = await pc(oracle, FORM_1700, state, "84653210700000-1700-seeded.xml", groups);
    expect(parityProblem(r)).toEqual([]);
  }, 300_000);
});
