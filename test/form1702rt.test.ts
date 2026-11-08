import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1702RT, modelRT, validate1702RT } from "@/form/form1702rt.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1702RT:";
const id = (s: string) => `${P}${s}`;
const row = (stem: string, ...col: Array<[string, string]>) => Object.fromEntries(col.map(([c, v]) => [`${P}${stem}.{i}${c}`, v]));
/** Blurring item 24 asks to jump to Schedule 1 and the oracle accepts every dialog, so BIR's saved pager reads 3. */
const ALLOW = [id("txtCurrentPage")];

const identity: FormState = {
  [id("txtPg1Pt1I6TIN1")]: "846", [id("txtPg1Pt1I6TIN2")]: "532", [id("txtPg1Pt1I6TIN3")]: "107", [id("txtPg1Pt1I6TIN4")]: "00000",
  [id("txtPg1Pt1I7RDO")]: "043", [id("drpPg1Pt1I7RDOCode")]: "043", [id("txtPg1Pt1I9Name")]: "ABC (PHILS.) INC.",
  [id("txtPg1Pt1I10Address")]: "1 RIZAL ST., QUEZON CITY", [id("txtZIP")]: "1100", [id("txtPg1Pt1I11Contact")]: "0281234567",
  [id("ddlPg1I2Month")]: "12", [id("txtPg1I2Year")]: "17",
};
/** Calendar 2017, itemized, incorporated 2010 (IC055 ticked), every simple modal populated. */
const itemized: FormState = {
  ...identity,
  [id("txtPg1Pt1I8")]: "03/15/2010",
  [id("txtPg3Sc1I1GoodsProp")]: "8,000,000", [id("txtPg3Sc1I2SaleServices")]: "2,000,000", [id("txtPg3Sc1I5LessSales")]: "200,000",
  [id("txtPg3Sc2I1MerchInventory")]: "1,000,000", [id("txtPg3Sc2I2AddPurchases")]: "4,500,000", [id("txtPg3Sc2I4LessMerch")]: "900,000",
  [id("txtPg3Sc2I11DirectLabor")]: "300,000", [id("txtPg3Sc2I14WorkProcess")]: "50,000.60", [id("txtPg3Sc2I15LessWorkProcess")]: "20,000",
  [id("txtPg3Sc2I20DirectSalaries")]: "250,000",
  [id("txtPg4Sc3I1OtherTaxIncome")]: "RENT INCOME", [id("txtPg4Sc3I1OtherTaxAmount")]: "120,000",
  [id("txtPg4Sc4I1Advertising")]: "60,000", [id("txtPg4Sc4I10Depreciation")]: "180,000", [id("txtPg4Sc4I29Salaries")]: "1,500,000",
  [id("txtPg5Sc4I32TaxesandLicenses")]: "45,000", [id("txtPg5Sc4I36C1")]: "REPAIRS", [id("txtPg5Sc4I36C2")]: "30,000",
  [id("txtPg5Sc5I1C1")]: "TRAINING", [id("txtPg5Sc5I1C2")]: "RA 10771", [id("txtPg5Sc5I1C3")]: "20,000",
  [id("txtPg5Sc6AI5C1")]: "2015", [id("txtPg5Sc6AI5C2")]: "200,000", [id("txtPg5Sc6AI5C4")]: "50,000", [id("txtPg5Sc6AI5C5")]: "100,000",
  [id("txtPg6Sc7I1ExcessCredits")]: "5,000", [id("txtPg6Sc7I2IncomeTaxPaymentUnderMCIT")]: "8,000", [id("txtPg6Sc7I3IncomeTaxUnderRegular")]: "90,000",
  [id("txtPg6Sc7I5CreditableTaxWithheldFromPrevious")]: "20,000", [id("txtPg6Sc7I9SpecialTaxCredits")]: "1,500",
  [id("txtPg6Sc8I1C1")]: "2014", [id("txtPg6Sc8I1C2")]: "30,000", [id("txtPg6Sc8I1C3")]: "45,000", [id("txtPg6Sc8I1C7")]: "10,000",
  [id("txtPg2Pt4I47Surcharge")]: "2,000", [id("txtPg2Pt4I48Interest")]: "500",
  [id("txtPg6Sc9I1NetIncome")]: "900,000", [id("txtPg6Sc9I2C1")]: "NON-DEDUCTIBLE", [id("txtPg6Sc9I2C2")]: "15,000",
  [id("txtPg7Sc10I1CurrentAssets")]: "3,000,000", [id("txtPg7Sc10I3PropertyPlantEquipment")]: "2,500,000",
  [id("txtPg7Sc10I8CurrentLiabilities")]: "1,200,000", [id("txtPg7Sc10I13CapitalStock")]: "2,000,000", [id("txtPg7Sc10I15RetainedEarnings")]: "2,300,000",
  [id("txtPg8Sc12I1C1")]: "100,000", [id("txtPg8Sc12I1C3")]: "20,000", [id("txtPg8Sc13I1ReturnOfPremium")]: "7,000",
};
const groups: GroupState = {
  sc3_3: [row("txtPg4Sc3I3", ["C1", "ROYALTIES"], ["C2", "40,000"]), row("txtPg4Sc3I3", ["C1", "GAIN (FX)"], ["C2", "10,000"])],
  sc4_4: [row("txtPg4Sc4I4", ["C1", "SOFTWARE"], ["C2", "12,000"])],
  sc4_39: [row("txtPg5Sc4I39", ["C1", "UTILITIES"], ["C2", "70,000"]), row("txtPg5Sc4I39", ["C1", "SUPPLIES"], ["C2", "15,000"])],
  sc5_4: [row("txtPg5Sc5I4", ["C1", "SENIOR DISCOUNT"], ["C2", "RA 9994"], ["C3", "9,000"])],
  sc7_11: [row("txtPg6Sc7I11", ["C1", "TCC"], ["C2", "3,000"]), row("txtPg6Sc7I11", ["C1", "BOI CREDIT"], ["C2", "2,000"])],
  sc9_3: [row("txtPg6Sc9I3", ["C1", "PENALTIES"], ["C2", "4,000"])],
  sc9_6: [row("txtPg6Sc9I6", ["C1", "EXEMPT"], ["C2", "6,000"]), row("txtPg6Sc9I6", ["C1", "FINAL-TAXED"], ["C2", "9,000"])],
  sc9_8: [row("txtPg6Sc9I8", ["C1", "NOLCO"], ["C2", "100,000"])],
};

describe("1702RT (pre-2018 layout) compute", () => {
  const o = computeForm(FORM_1702RT, itemized, groups);
  const v = (s: string) => o[id(s)];

  it("Schedules 1–3 feed 30–34 (Sch 2's 16/19 round, the rest truncate)", () => {
    expect(v("txtPg3Sc1I6NetSales")).toBe("9,800,000");
    expect(v("txtPg3Sc2I5CostofSales")).toBe("4,600,000");
    expect(v("txtPg3Sc2I16CostOfGoods")).toBe("330,001"); // 300,000 + 50,000.60 − 20,000 → Math.round
    expect(v("txtPg3Sc2I27TotalSales")).toBe("5,180,001");
    expect(v("txtPg2Pt4I32GrossIncome")).toBe("4,619,999");
    expect(v("txtPg4Sc3I4OtherTaxTotalAmount")).toBe("170,000"); // 120k + modal (40k + 10k)
    expect(v("txtPg2Pt4I34TotalGross")).toBe("4,789,999");
  });

  it("itemized deductions, NOLCO, RCIT vs MCIT, Sch 7 credits and the payable", () => {
    expect(v("txtPg5Sc4I40TotalOrdinaryAllowable")).toBe("1,912,000"); // incl. modals 12k and 85k
    expect(v("txtPg5Sc5I5TotalSpecialAllowable")).toBe("29,000");
    expect(v("txtPg5Sc6AI5C6")).toBe("50,000");
    expect(v("txtPg2Pt4I37Nolco")).toBe("100,000");
    expect(v("txtPg2Pt4I38TotalItemized")).toBe("2,041,000");
    expect(v("txtPg2Pt4I40NetTaxable")).toBe("2,748,999");
    expect(v("txtPg2Pt4I42IncomeTaxDue")).toBe("824,700"); // Math.round(2,748,999 × 30%)
    expect(v("txtPg2Pt4I43MinimumCorporate")).toBe("95,800");
    expect(v("txtPg2Pt4I44TotalIncomeTax")).toBe("824,700");
    expect(v("txtPg6Sc7I4ExcessMCIT")).toBe("10,000"); // counts because RCIT ≥ MCIT
    expect(v("txtPg6Sc7I12TotalTaxCredits")).toBe("139,500");
    expect(v("txtPg2Pt4I46NetTax")).toBe("685,200");
    expect(v("txtPg2Pt4I51TotalAmount")).toBe("687,700");
    expect(v("txtPg1Pt2I20TotalAmount")).toBe("687,700");
    expect(v("txtPg2Pt5I52SpecialAllowable")).toBe("8,700");
    expect(v("txtPg2Pt5I54TotalTax")).toBe("10,200");
    expect(v("txtPg6Sc9I10NetTaxableIncome")).toBe("804,000");
    expect(v("txtPg7Sc10I17TotalLiabilitiesEquity")).toBe("5,500,000");
    expect(v("txtSc12I19TotalFinalTaxWitheld")).toBe("20,000");
    expect(v("txtPg8Sc13I8TotalIncome")).toBe("7,000");
  });

  it("OSD only when 34 > 0, MCIT wins and the excess-MCIT credit drops, an overpayment needs an option", () => {
    const osd = computeForm(FORM_1702RT, { ...itemized, [id("rdoPg1Pt1I15OptionalStandard")]: "true" }, groups);
    expect(osd[id("txtPg2Pt4I39OptionalStandard")]).toBe("1,916,000");
    expect(osd[id("txtPg2Pt4I38TotalItemized")]).toBe("0");
    const thin = { ...itemized, [id("txtPg3Sc1I2SaleServices")]: "0" };
    const t = computeForm(FORM_1702RT, thin, groups);
    expect(t[id("txtPg2Pt4I42IncomeTaxDue")]).toBe("224,700");
    const loss = { ...itemized, [id("txtPg3Sc1I1GoodsProp")]: "5,500,000", [id("txtPg3Sc1I2SaleServices")]: "0" };
    const l = computeForm(FORM_1702RT, loss, groups);
    expect(l[id("txtPg2Pt4I40NetTaxable")]).toBe("-1,751,001");
    expect(l[id("txtPg2Pt4I42IncomeTaxDue")]).toBe("0");
    expect(l[id("txtPg2Pt4I44TotalIncomeTax")]).toBe(l[id("txtPg2Pt4I43MinimumCorporate")]);
    expect(l[id("txtPg6Sc7I4ExcessMCIT")]).toBe("0");
    expect(l[id("txtPg5Sc6AI4C2")]).toBe("1,622,001"); // Sch 6: 34 < 35, NOL = 35 − 34
    expect(modelRT((k) => loss[k] ?? "").text.txtPg5Sc6AI4C1).toBe("2017");
    expect(validate1702RT({ ...loss, [id("txtPg6Sc7I1ExcessCredits")]: "900,000" }).map((p) => p.id)).toContain(id("rdoPg1Pt2I21OverpaymentRefunded"));
  });

  it("saved records: modal lines, page headers 2–8, NumWithParenthesis on text, escaped name", () => {
    const rec = new Map(formRecords(FORM_1702RT, itemized, groups).map((r) => [r.key, r.value]));
    expect(rec.get(id("txtPg4Sc3I3CtrModal"))).toBe("2");
    expect(rec.get(id("txtPg4Sc3I3C1"))).toBe("OTHERS");
    expect(rec.get(id("txtPg4Sc3I3C2"))).toBe("50,000");
    expect(rec.get(id("txtPg4Sc3I3.2C1"))).toBe("GAIN -FX");
    expect(rec.get(id("txtPg5Sc5I4C2"))).toBe("RA 9994");
    expect(rec.get(id("txtPg7BranchCode"))).toBe("00000");
    expect(rec.get(id("txtPg8RegisteredName"))).toBe("ABC -PHILS. INC.");
    expect(rec.get(id("txtPg1Pt1I9Name"))).toBe("ABC%20%28PHILS.%29%20INC.");
    expect(rec.get(id("rdoPg1I5Atc"))).toBe("true");
  });
});

describe.skipIf(!hasForm("1702RT"))("native 1702RT is 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  const file = "84653210700000-1702RT-122017.xml";

  it("itemized + MCIT + every simple modal populated", async () => {
    const r = await parityCheck(oracle, FORM_1702RT, itemized, file, groups);
    expect(parityProblem(r, ALLOW)).toEqual([]);
    expect(r.key_count).toBeGreaterThan(581);
  }, 120_000);

  it("OSD, a loss year where MCIT wins, an overpayment carried over", async () => {
    const state = {
      ...itemized, [id("rdoPg1Pt1I15OptionalStandard")]: "true", [id("rdoPg1Pt1I15ItemizedDeduction")]: "false",
      [id("txtPg3Sc1I1GoodsProp")]: "5,500,000", [id("txtPg3Sc1I2SaleServices")]: "0",
      [id("txtPg6Sc7I1ExcessCredits")]: "900,000", [id("rdoPg1Pt2I21OverpaymentCarried")]: "true",
    };
    expect(parityProblem(await parityCheck(oracle, FORM_1702RT, state, file, groups), ALLOW)).toEqual([]);
  }, 120_000);

  it("itemized loss with no MCIT (under 4 years) and NOLCO rows that break BIR's checks", async () => {
    const state = {
      ...itemized, [id("txtPg1Pt1I8")]: "06/01/2015", [id("txtPg3Sc1I1GoodsProp")]: "5,500,000", [id("txtPg3Sc1I2SaleServices")]: "0",
      [id("txtPg5Sc6AI5C5")]: "300,000", [id("txtPg5Sc6AI6C1")]: "2016", [id("txtPg5Sc6AI6C2")]: "10,000", [id("txtPg5Sc6AI6C3")]: "20,000",
    };
    expect(parityProblem(await parityCheck(oracle, FORM_1702RT, state, file, {}), ALLOW)).toEqual([]);
  }, 120_000);

  it("fiscal June year-end with centavo inputs and one-row modals", async () => {
    const state = {
      ...identity, [id("rdoPg1I1Fiscal")]: "true", [id("rdoPg1I1Calendar")]: "false", [id("ddlPg1I2Month")]: "06",
      [id("txtPg1Pt1I8")]: "01/10/2005", [id("txtPg3Sc1I1GoodsProp")]: "1,000,000.75", [id("txtPg3Sc2I1MerchInventory")]: "400,000.99",
      [id("txtPg4Sc4I29Salaries")]: "250,000.60", [id("txtPg2Pt4I47Surcharge")]: "0.40", [id("txtPg1Pt2I22CTC")]: "CC2017-1",
    };
    const one: GroupState = { sc7_11: [row("txtPg6Sc7I11", ["C1", "CREDIT (TCC)"], ["C2", "700"])] };
    expect(parityProblem(await parityCheck(oracle, FORM_1702RT, state, "84653210700000-1702RT-062017.xml", one), ALLOW)).toEqual([]);
  }, 120_000);
});
