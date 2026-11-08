import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1706 } from "@/form/form1706.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm1706:";

const input: FormState = {
  [`${P}txtFMVLand`]: "1,000,000.00", [`${P}txtFMVImprovements`]: "500,000.00",
  [`${P}txtFMVZonal`]: "1,200,000.00", [`${P}txtFMVBIR`]: "400,000.00",
  [`${P}txtGross`]: "1,800,000.00",
  [`${P}txtSurcharge`]: "1,000.00", [`${P}txtInterest`]: "500.00", [`${P}txtCompromise`]: "250.00",
};

describe("1706 compute", () => {
  it("FMVLI = greatest combo; base = max(Gross, FMVLI); tax = base × 6%; chain", () => {
    const o = computeAll(FORM_1706, input);
    expect(o[`${P}txtFMVLI`]).toBe("1,700,000.00"); // improvements + zonal
    expect(o[`${P}txtTax`]).toBe("1,800,000.00"); // Gross > FMVLI
    expect(o[`${P}txtRate`]).toBe("108,000.00"); // × 6%
    expect(o[`${P}txtTaxDue`]).toBe("108,000.00");
    expect(o[`${P}txtTotalPenalties`]).toBe("1,750.00");
    expect(o[`${P}txtTotal`]).toBe("109,750.00");
  });
  it("installment transaction (radio _3) overrides the base", () => {
    const o = computeAll(FORM_1706, { ...input, [`${P}j_id395:_3`]: "true", [`${P}txtInstallment`]: "2,000,000.00" });
    expect(o[`${P}txtTax`]).toBe("2,000,000.00");
    expect(o[`${P}txtRate`]).toBe("120,000.00");
  });
  it("writes the FMV inputs comma-free and ticks their 29A–29D boxes; refund option only on an overpayment", () => {
    const o = computeAll(FORM_1706, { ...input, [`${P}txtFMVBIR`]: "", [`${P}opt37:_1`]: "true" });
    expect(o[`${P}txtFMVLand`]).toBe("1000000.00");
    expect([o[`${P}opt29A`], o[`${P}opt29B`], o[`${P}opt29C`], o[`${P}opt29D`]]).toEqual(["true", "true", "true", undefined]);
    expect(o[`${P}opt37:_1`]).toBe("false");
    const over = computeAll(FORM_1706, { ...input, [`${P}txtLess`]: "200,000.00", [`${P}opt37:_1`]: "true" });
    expect(over[`${P}txtTotal`]).toBe("-90,250.00");
    expect(over[`${P}opt37:_1`]).toBe("true");
  });
});

describe.skipIf(!hasForm("1706"))("native 1706 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  const state: FormState = {
    ...input, [`${P}txtDateMonth`]: "12", [`${P}txtDateDay`]: "31", [`${P}txtDateYear`]: "2017",
    [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
    [`${P}txtRDOCode`]: "043", [`${P}txtSellerName`]: "DELA CRUZ, JUAN", [`${P}j_id395:_1`]: "true",
  };
  it("legacy 1706 computes the same values", async () => {
    const { value, error } = await oracle.openSaved(FORM_1706, state, "84653210700000-1706-12312017.xml");
    expect(await value(`${P}txtFMVLI`)).toBe("1,700,000.00");
    expect(await value(`${P}txtTax`)).toBe("1,800,000.00");
    expect(await value(`${P}txtRate`)).toBe("108,000.00");
    expect(await value(`${P}txtTotal`)).toBe("109,750.00");
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR: a cash sale with all four FMV bases", async () => {
    const r = await parityCheck(oracle, FORM_1706, state, "84653210700000-1706-12312017.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR: an overpayment with the refund option", async () => {
    const over: FormState = { ...state, [`${P}txtLess`]: "200,000.00", [`${P}opt37:_1`]: "true", [`${P}opt37:_2`]: "false" };
    const r = await parityCheck(oracle, FORM_1706, over, "84653210700000-1706-12312017.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
