import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, type FormState } from "@/form/schema.ts";
import { FORM_1701MS, P, validate1701MS } from "@/form/form1701ms.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const id = (s: string): string => `${P}${s}`;

// a married taxpayer on mixed income, graduated + itemized; the spouse earns compensation income
const base: FormState = {
  [id("txtMonthNo1")]: "12", [id("txtYearNo1")]: "2024",
  [id("txtAmendedNoNo2")]: "true", [id("txtReturnPeriodNoNo3")]: "true",
  [id("txtIfMarriedJointlyNo5")]: "true",
  [id("txtPg1TIN1")]: "846", [id("txtPg1TIN2")]: "532", [id("txtPg1TIN3")]: "107", [id("txtPg1BranchCode")]: "000",
  [id("txtRDOCodea")]: "043", [id("txtTaxpayerNo8a")]: "DELA CRUZ, JUAN",
  [id("txtTaxpayerNo11b")]: "true", // mixed income
  [id("txtTaxpayerNo12b")]: "true", // graduated rates
  [id("txtTaxpayerNo17a")]: "true", // itemized
  // Part III (compensation): gross 1,000,000, non-taxable 200,000 → 3 = 800,000 → 4 = graduated(800,000) = 102,500
  [id("txtGrossa")]: "1,000,000", [id("txtLessNonTaxablea")]: "200,000",
  // Part IV-B1: sales 2,000,000 − returns 100,000 = 7 → 9 = 7 − 8(300,000) = 1,600,000
  [id("txtSalesRevenueNo5a")]: "2,000,000", [id("txtSalesReturnsNo6a")]: "100,000", [id("txtCostofSalesNo8a")]: "300,000",
  [id("txtAllowableItemizedDeductionsNo10a")]: "400,000", [id("txtNetOperatingLossNo10a")]: "50,000",
  [id("txtNonOperatingIncomeNo13a")]: "25,000",
  // Part V credits
  [id("txtCreditableTaxNo3a")]: "10,000", [id("txtCreditableForm2316No5a")]: "5,000",
  [id("txtSurchangeNo28a")]: "1,000",
  // spouse: compensation income earner (11d1), graduated (12b1)
  [id("txtTaxpayerNo11d1")]: "true", [id("txtTaxpayerNo12b1")]: "true",
  [id("txtGrossb")]: "800,000", [id("txtLessNonTaxableb")]: "100,000",
};

describe("1701MS compute (the EPT mixed-income return)", () => {
  const v = (s: FormState = base) => computeForm(FORM_1701MS, s);

  it("Part III and IV-B1: 3 = 1 − 2, 4 = graduated(3), 7 = 5 − 6, 9 = 7 − 8, 10D = A + B + C, 12 = 9 − 10D, 14 = 12 + 13", () => {
    const o = v();
    expect(o[id("txtTaxableCompensationIncomea")]).toBe("800,000");
    expect(o[id("txtTaxpayerNo4a")]).toBe("102,500"); // graduated(800,000)
    expect(o[id("txtTaxableCompensationIncomeNo7a")]).toBe("1,900,000");
    expect(o[id("txtGrossIncomeNo9a")]).toBe("1,600,000");
    expect(o[id("txtTotalAllowableItemixedDeductionsNo10a")]).toBe("450,000");
    expect(o[id("txtNetIncomeLossNo12a")]).toBe("1,150,000");
    expect(o[id("txtTaxableIncomeBusinesNo14a")]).toBe("1,175,000");
  });

  it("item 15 = (3>0?3:0) + (14>0?14:0); 18B = graduated(15); 22 = 18B; 23 = 21 + 22", () => {
    const o = v();
    expect(o[id("txtCompensationBusinessNo15a")]).toBe("1,975,000"); // 800,000 + 1,175,000
    expect(o[id("TotalTaxDueCompensationBTP")]).toBe("396,250"); // 102,500 + 25% × (1,975,000 − 800,000)
    expect(o[id("txtIncomeTaxRegularNo22a")]).toBe("396,250");
    expect(o[id("txtTotalIncomeTaxDueNo23a")]).toBe("396,250"); // 21 = 19 − 20 (19 stays blank for a graduated return)
    expect(o[id("txtTaxPayableNo25a")]).toBe("381,250"); // 23 − 24 (credits 15,000)
    expect(o[id("txtAmountPayableNo27a")]).toBe("381,250");
    expect(o[id("txtTotalAmountPayableNo29a")]).toBe("382,250"); // + 28D 1,000
  });

  it("the removeDecimal blurs: the Part V credit lines and the penalties save as whole pesos", () => {
    const o = v({ ...base, [id("txtCreditableTaxNo3a")]: "10,250.75", [id("txtInterestNo28a")]: "500.60", [id("txtCompromise28a")]: "1.4" });
    expect(o[id("txtCreditableTaxNo3a")]).toBe("10,251");
    expect(o[id("txtTotalTaxCreditsPaymentsPartVNo10a")]).toBe("15,251");
    expect(o[id("txtInterestNo28a")]).toBe("501"); // Math.round(500.60)
    expect(o[id("txtCompromise28a")]).toBe("1"); // Math.round(1.4)
    expect(o[id("txtTotalPenaltiesNo28a")]).toBe("1,502");
  });

  it("the 8% path: B2's 24 = 8% of 23 and 25 = item 4 + 24 → item 22", () => {
    const s: FormState = {
      ...base, [id("txtTaxpayerNo12b")]: "false", [id("txtTaxpayerNo12c")]: "true", [id("txtTaxpayerNo17a")]: "false",
      [id("txtSalesRevenuesFeesANo19a")]: "3,000,000", [id("txtOtherNonOperatingIncomeNo20a")]: "100,000", [id("txtLess22A")]: "250,000",
    };
    const o = v(s);
    expect(o[id("txtTotalIncomeNo21a")]).toBe("3,100,000");
    expect(o[id("txtTaxableIncomeLoss23A")]).toBe("2,850,000");
    expect(o[id("txtTaxDueBusinessIncome24A")]).toBe("228,000"); // 8%
    expect(o[id("txtCompensationBusinessNo25a")]).toBe("330,500"); // item 4 102,500 + 228,000
    expect(o[id("txtIncomeTaxRegularNo22a")]).toBe("330,500");
  });

  it("item 30: 29A + 29B (the one-negative rule and the refund clearing are exercised by the parity run)", () => {
    const o = v();
    expect(o[id("txtAggregateAmountPayable30a")]).toBe("464,750");
    // the overpaid case: credits exceed 23a → 29a takes the penalties alone
    const o2 = v({ ...base, [id("txtCreditableTaxNo3a")]: "500,000" });
    expect(o2[id("txtTotalTaxCreditsPaymentsPartVNo10a")]).toBe("505,000");
    expect(o2[id("txtTaxPayableNo25a")]).toBe("-108,750");
    expect(o2[id("txtTaxDueAllowedNo26a")]).toBe("0"); // 25 < 0 forces item 26 to "0"
    expect(o2[id("txtTotalAmountPayableNo29a")]).toBe("1,000"); // 27 < 0 with penalties → 29 = 28D
    expect(o2[id("txtAggregateAmountPayable30a")]).toBe("83,500"); // 1,000 + 82,500
  });

  it("validates the TIN check digit", () => {
    expect(validate1701MS(base)).toEqual([]);
    const bad = validate1701MS({ ...base, [id("txtPg1TIN3")]: "106" }).map((p) => p.id);
    expect(bad).toContain(id("txtPg1TIN1"));
  });
});

describe.skipIf(!hasForm("1701MS"))("native 1701MS is 1:1 with BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("is 1:1 (married joint: graduated mixed income + an 8% spouse)", async () => {
    const r = await parityCheck(oracle, FORM_1701MS, base, "84653210700000-1701MS-122024.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 300_000);
});
