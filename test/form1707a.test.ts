import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1707A } from "@/form/form1707a.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm1707A:";

// gains: 500,000 − 420,000 = 80,000 and 130,000 − 100,000 = 30,000; loss: 50,000 − 40,000 = 10,000
const input: FormState = {
  [`${P}txtS1C3SellingPriceI1`]: "500,000.00", [`${P}txtS1C4CostI1`]: "420,000.00", [`${P}txtS1C6TaxPaidI1`]: "1,000.00",
  [`${P}txtS1C3SellingPriceI2`]: "130,000.00", [`${P}txtS1C4CostI2`]: "100,000.00",
  [`${P}txtS2C3SellingPriceI1`]: "40,000.00", [`${P}txtS2C4CostI1`]: "50,000.00",
  [`${P}txtI18ASurcharge`]: "100.00", [`${P}txtI18BInterest`]: "50.00", [`${P}txtI18CCompromise`]: "25.00",
};

describe("1707A compute", () => {
  it("column 5 = selling − cost (S1) / cost − selling (S2); 5% bracket (net ≤ 100k) and the 12→19 chain", () => {
    const o = computeAll(FORM_1707A, input);
    expect(o[`${P}txtS1C5CapitalGainsI1`]).toBe("80,000.00");
    expect(o[`${P}txtS2C5CapitalLossI1`]).toBe("10,000.00");
    expect(o[`${P}txtI12TotalCapitalGains`]).toBe("110,000.00");
    expect(o[`${P}txtI13TotalCapitalLoss`]).toBe("10,000.00");
    expect(o[`${P}txtI14NetCapitalGainLoss`]).toBe("100,000.00");
    expect(o[`${P}txtI15TaxDue`]).toBe("5,000.00"); // 100,000 × 5%
    expect(o[`${P}txtI16CTotalTaxPaid`]).toBe("1,000.00"); // 16A only; not amended → 16B is 0
    expect(o[`${P}txtI17TaxStillPayable`]).toBe("4,000.00");
    expect(o[`${P}txtI19TotalAmountPayable`]).toBe("4,175.00");
  });
  it("10% bracket above 100k", () => {
    const o = computeAll(FORM_1707A, { [`${P}txtS1C3SellingPriceI1`]: "150,000.00" });
    expect(o[`${P}txtI15TaxDue`]).toBe("10,000.00"); // 5,000 + (50,000 × 10%)
  });
  it("renders negatives as accounting parentheses; tax due floors at 0", () => {
    const o = computeAll(FORM_1707A, { [`${P}txtS1C3SellingPriceI1`]: "10,000.00", [`${P}txtS1C4CostI1`]: "30,000.00" });
    expect(o[`${P}txtS1C5CapitalGainsI1`]).toBe("(20,000.00)"); // a loss row in Schedule 1
    expect(o[`${P}txtI14NetCapitalGainLoss`]).toBe("(20,000.00)");
    expect(o[`${P}txtI15TaxDue`]).toBe("0.00"); // floored
  });
  it("16B counts only on an amended return; the overpayment option only stands for a negative 17", () => {
    const amended = { ...input, [`${P}rdoI2AmemdedYes`]: "true", [`${P}rdoI2AmemdedNo`]: "false", [`${P}txtI16BTotalTaxPaid`]: "500.00" };
    expect(computeAll(FORM_1707A, amended)[`${P}txtI16CTotalTaxPaid`]).toBe("1,500.00");
    expect(computeAll(FORM_1707A, { ...input, [`${P}txtI16BTotalTaxPaid`]: "500.00" })[`${P}txtI16BTotalTaxPaid`]).toBe("0.00");
    expect(computeAll(FORM_1707A, { ...input, [`${P}rdoI19Refund`]: "true" })[`${P}rdoI19Refund`]).toBe("false");
    const over = { ...input, [`${P}txtS1C6TaxPaidI1`]: "9,000.00", [`${P}rdoI19Refund`]: "true" };
    expect(computeAll(FORM_1707A, over)[`${P}txtI17TaxStillPayable`]).toBe("(4,000.00)");
    expect(computeAll(FORM_1707A, over)[`${P}rdoI19Refund`]).toBe("true");
  });
});

describe.skipIf(!hasForm("1707A"))("native 1707A matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  const state: FormState = {
    ...input, [`${P}txtI1YearEndMonth`]: "12", [`${P}txtI1YearEndDay`]: "31", [`${P}txtI1YearEndYear`]: "2019",
    [`${P}txtI5TIN1`]: "846", [`${P}txtI5TIN2`]: "532", [`${P}txtI5TIN3`]: "107", [`${P}txtI5BranchMask`]: "00000",
    [`${P}rdoI6RDO`]: "043", [`${P}txtI8RegisteredName`]: "DELA CRUZ, JUAN",
    [`${P}txtS1C1DateOfTransactionI1`]: "03/15/2019", [`${P}txtS1C2NameOfCorporateStockI1`]: "ABC HOLDINGS",
    [`${P}txtS1C1DateOfTransactionI2`]: "07/01/2019", [`${P}txtS1C2NameOfCorporateStockI2`]: "XYZ CORP",
    [`${P}txtS2C1DateOfTransactionI1`]: "09/30/2019", [`${P}txtS2C2NameOfCorporateStockI1`]: "LMN INC",
  };

  it("legacy 1707A computes the same values (incl. parentheses)", async () => {
    const { value, error } = await oracle.openSaved(FORM_1707A, state, "84653210700000-1707A-12312019.xml");
    expect(await value(`${P}txtS1C5CapitalGainsI1`)).toBe("80,000.00");
    expect(await value(`${P}txtI14NetCapitalGainLoss`)).toBe("100,000.00");
    expect(await value(`${P}txtI15TaxDue`)).toBe("5,000.00");
    expect(await value(`${P}txtI17TaxStillPayable`)).toBe("4,000.00");
    expect(await value(`${P}txtI19TotalAmountPayable`)).toBe("4,175.00");
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR: a payable return, both schedules filled", async () => {
    const r = await parityCheck(oracle, FORM_1707A, state, "84653210700000-1707A-12312019.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR: an amended overpayment (16B live, refund option)", async () => {
    const over: FormState = {
      ...state, [`${P}rdoI2AmemdedYes`]: "true", [`${P}rdoI2AmemdedNo`]: "false", [`${P}txtI16BTotalTaxPaid`]: "6,000.00",
      [`${P}rdoI19Refund`]: "false", [`${P}rdoI19TaxCreditCertificate`]: "true",
    };
    const r = await parityCheck(oracle, FORM_1707A, over, "84653210700000-1707A-12312019.xml");
    expect(r.diff.find((d) => d.key === `${P}txtI17TaxStillPayable`)).toBeUndefined();
    // BIR reload bug, not native: init() runs roundElement over every amount, and Number("(2,000.00)") is NaN, so
    // each "(…)" overpayment loads as "0.00"; checkOverPaymentRadio then sees no ")" and unchecks the choice
    // (the later blurs recompute 17 but never re-check it). BIR's own save of this return reloads the same way.
    expect(r.diff.map((d) => d.key)).toEqual([`${P}rdoI19TaxCreditCertificate`]);
    expect(parityProblem(r, [`${P}rdoI19TaxCreditCertificate`])).toEqual([]);
  }, 120_000);
});
