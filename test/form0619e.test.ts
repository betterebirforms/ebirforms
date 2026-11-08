import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_0619E, validate0619E } from "@/form/form0619e.ts";
import { hasForm, startOracle } from "./oracle.ts";

const P = "frm0619E:";

describe("0619E compute graph (exact centavo)", () => {
  const base: FormState = {
    [`${P}txtTax14`]: "1,000.00",
    [`${P}txtTax15`]: "250.50",
    [`${P}txtTax17A`]: "10.10",
    [`${P}txtTax17B`]: "20.20",
    [`${P}txtTax17C`]: "0.30",
  };
  it("16 = 14−15, 17D = 17A+17B+17C, 18 = 16+17D", () => {
    const out = computeAll(FORM_0619E, base);
    expect(out[`${P}txtTax16`]).toBe("749.50");
    expect(out[`${P}txtTax17D`]).toBe("30.60"); // 10.10+20.20+0.30 — exact, float gives 30.599999...
    expect(out[`${P}txtTax18`]).toBe("780.10");
  });
});

describe("0619E validation", () => {
  const full: FormState = {
    [`${P}txtMonth`]: "10",
    [`${P}txtYear`]: "2026",
    [`${P}txtTIN1`]: "846",
    [`${P}txtTIN2`]: "532",
    [`${P}txtTIN3`]: "107",
    [`${P}txtBranchCode`]: "00000",
    [`${P}txtRDOCode`]: "043",
    [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
  };
  it("passes when complete and flags a bad TIN", () => {
    expect(validate0619E(full)).toEqual([]);
    expect(validate0619E({ ...full, [`${P}txtTIN3`]: "999" }).map((p) => p.id)).toContain(`${P}txtTIN1`);
  });
});

describe.skipIf(!hasForm("0619E"))("native 0619E is byte-compatible with the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("legacy 0619E shows the same values and the same computed totals", async () => {
    const state: FormState = {
      [`${P}txtMonth`]: "10",
      [`${P}txtYear`]: "2026",
      [`${P}txtTIN1`]: "846",
      [`${P}txtTIN2`]: "532",
      [`${P}txtTIN3`]: "107",
      [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043",
      [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN & SONS",
      [`${P}txtAddress`]: "1 RIZAL ST. <A> & CO.",
      [`${P}txtTax14`]: "1,000.00",
      [`${P}txtTax15`]: "250.50",
      [`${P}txtTax17A`]: "10.10",
      [`${P}txtTax17B`]: "20.20",
      [`${P}txtTax17C`]: "0.30",
    };
    expect(validate0619E(state)).toEqual([]);
    const { value, error } = await oracle.openSaved(FORM_0619E, state, "84653210700000-0619E-102026.xml");
    expect(await value(`${P}txtTaxpayerName`)).toBe("DELA CRUZ, JUAN & SONS");
    expect(await value(`${P}txtAddress`)).toBe("1 RIZAL ST. <A> & CO."); // & and < survive
    expect(await value(`${P}txtTax16`)).toBe("749.50");
    expect(await value(`${P}txtTax18`)).toBe("780.10");
    expect(error).toEqual([]);
  }, 120_000);
});
