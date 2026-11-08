import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_0619F, validate0619F } from "@/form/form0619f.ts";
import { hasForm, startOracle } from "./oracle.ts";

const P = "frm0619F:";

describe("0619F compute graph (exact centavo)", () => {
  it("15 = 13+14, 18D = 18A+18B+18C, 17 = 15−16, 19 = 17+18D", () => {
    const out = computeAll(FORM_0619F, {
      [`${P}txtTax13`]: "1,000.00",
      [`${P}txtTax14`]: "200.00",
      [`${P}txtTax16`]: "150.50",
      [`${P}txtTax18A`]: "10.10",
      [`${P}txtTax18B`]: "20.20",
      [`${P}txtTax18C`]: "0.30",
    });
    expect(out[`${P}txtTax15`]).toBe("1,200.00");
    expect(out[`${P}txtTax17`]).toBe("1,049.50");
    expect(out[`${P}txtTax18D`]).toBe("30.60");
    expect(out[`${P}txtTax19`]).toBe("1,080.10");
  });
});

describe.skipIf(!hasForm("0619F"))("native 0619F is byte-compatible with the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("legacy 0619F shows the same values and computed totals", async () => {
    const state: FormState = {
      [`${P}txtMonth`]: "10",
      [`${P}txtYear`]: "2026",
      [`${P}txtTIN1`]: "846",
      [`${P}txtTIN2`]: "532",
      [`${P}txtTIN3`]: "107",
      [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043",
      [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN & SONS",
      [`${P}txtTax13`]: "1,000.00",
      [`${P}txtTax14`]: "200.00",
      [`${P}txtTax16`]: "150.50",
      [`${P}txtTax18A`]: "10.10",
      [`${P}txtTax18B`]: "20.20",
      [`${P}txtTax18C`]: "0.30",
    };
    expect(validate0619F(state)).toEqual([]);
    const { value, error } = await oracle.openSaved(FORM_0619F, state, "84653210700000-0619F-102026.xml");
    expect(await value(`${P}txtTaxpayerName`)).toBe("DELA CRUZ, JUAN & SONS");
    expect(await value(`${P}txtTax17`)).toBe("1,049.50");
    expect(await value(`${P}txtTax19`)).toBe("1,080.10");
    expect(error).toEqual([]);
  }, 120_000);
});
