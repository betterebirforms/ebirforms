import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1707Av2021 } from "@/form/form1707av2021.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm1707Av2021:";

const input: FormState = {
  [`${P}txtS1C5CapitalGainsI1`]: "80,000.00", [`${P}txtS1C5CapitalGainsI2`]: "30,000.00",
  [`${P}txtS1C6TaxPaidI1`]: "1,000.00",
  [`${P}txtS2C5CapitalLossI1`]: "10,000.00",
  [`${P}txtI16ApplicableTaxRate`]: "15",
  [`${P}txtI18ASurcharge`]: "100.00", [`${P}txtI18BInterest`]: "50.00", [`${P}txtI18CCompromise`]: "25.00",
};

describe("1707Av2021 compute", () => {
  it("flat applicable rate (TRAIN 15%) and the 12→19 chain", () => {
    const o = computeAll(FORM_1707Av2021, input);
    expect(o[`${P}txtI12TotalCapitalGains`]).toBe("110,000.00");
    expect(o[`${P}txtI14NetCapitalGainLoss`]).toBe("100,000.00");
    expect(o[`${P}txtI15TaxDue`]).toBe("15,000.00"); // 100,000 × 15%
    expect(o[`${P}txtI16CTotalTaxPaid`]).toBe("1,000.00");
    expect(o[`${P}txtI17TaxStillPayable`]).toBe("14,000.00");
    expect(o[`${P}txtI19TotalAmountPayable`]).toBe("14,175.00");
  });
  it("net loss → tax due floors at 0, parentheses on the net", () => {
    const o = computeAll(FORM_1707Av2021, { [`${P}txtS2C5CapitalLossI1`]: "5,000.00", [`${P}txtI16ApplicableTaxRate`]: "15" });
    expect(o[`${P}txtI14NetCapitalGainLoss`]).toBe("(5,000.00)");
    expect(o[`${P}txtI15TaxDue`]).toBe("0.00");
  });
});

describe.skipIf(!hasForm("1707Av2021"))("native 1707Av2021 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1707Av2021 computes the same values", async () => {
    const state: FormState = {
      ...input, [`${P}txtI1YearEndMonth`]: "12", [`${P}txtI1YearEndDay`]: "31", [`${P}txtI1YearEndYear`]: "2021",
      [`${P}txtI5TIN1`]: "846", [`${P}txtI5TIN2`]: "532", [`${P}txtI5TIN3`]: "107", [`${P}txtI5BranchMask`]: "00000",
      [`${P}rdoI6RDO`]: "043", [`${P}txtI8RegisteredName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_1707Av2021, state, "84653210700000-1707Av2021-12312021.xml");
    expect(await value(`${P}txtI14NetCapitalGainLoss`)).toBe("100,000.00");
    expect(await value(`${P}txtI15TaxDue`)).toBe("15,000.00");
    expect(await value(`${P}txtI17TaxStillPayable`)).toBe("14,000.00");
    expect(await value(`${P}txtI19TotalAmountPayable`)).toBe("14,175.00");
    expect(error).toEqual([]);
  }, 120_000);
});
