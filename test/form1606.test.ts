import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1606 } from "@/form/form1606.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm1606:";

const input: FormState = {
  [`${P}txtFMVLand`]: "1,000,000.00", [`${P}txtFMVImprovements`]: "500,000.00",
  [`${P}txtFMVZonal`]: "1,200,000.00", [`${P}txtFMVBIR`]: "400,000.00",
  [`${P}txtGross`]: "1,800,000.00", [`${P}txtTaxRate`]: "6",
  [`${P}txtSurcharge`]: "1,000.00", [`${P}txtInterest`]: "500.00", [`${P}txtCompromise`]: "250.00",
};

describe("1606 compute", () => {
  it("FMVLI = max of two combos; base = max(Gross, FMVLI); taxR = base × rate%; chain", () => {
    const o = computeAll(FORM_1606, input);
    expect(o[`${P}txtFMVLI`]).toBe("1,600,000.00"); // max(1.5M, 1.6M)
    expect(o[`${P}txtTax`]).toBe("1,800,000.00"); // Gross > FMVLI
    expect(o[`${P}txtTaxR`]).toBe("108,000.00"); // × 6%
    expect(o[`${P}txtTaxDue`]).toBe("108,000.00");
    expect(o[`${P}txtTotalPenalties`]).toBe("1,750.00");
    expect(o[`${P}txtTotal`]).toBe("109,750.00");
  });
  it("auction (radio _4) → base = max(FMVLI, Bid); variable rate applies", () => {
    const o = computeAll(FORM_1606, { ...input, [`${P}j_id395:_4`]: "true", [`${P}txtBid`]: "2,000,000.00", [`${P}txtTaxRate`]: "1.5" });
    expect(o[`${P}txtTax`]).toBe("2,000,000.00"); // Bid > FMVLI
    expect(o[`${P}txtTaxR`]).toBe("30,000.00"); // 2,000,000 × 1.5%
  });
  it("ticks 27A–27D for entered FMV inputs; refund option only on an overpayment", () => {
    const o = computeAll(FORM_1606, { ...input, [`${P}txtFMVBIR`]: "", [`${P}opt37:_2`]: "true" });
    expect([o[`${P}opt27A`], o[`${P}opt27B`], o[`${P}opt27C`], o[`${P}opt27D`]]).toEqual(["true", "true", "true", undefined]);
    expect(o[`${P}opt37:_2`]).toBe("false");
    const over = computeAll(FORM_1606, { ...input, [`${P}txtLess`]: "150,000.00", [`${P}opt37:_2`]: "true" });
    expect(over[`${P}txtTotal`]).toBe("-40,250.00");
    expect(over[`${P}opt37:_2`]).toBe("true");
  });
});

describe.skipIf(!hasForm("1606"))("native 1606 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  const state: FormState = {
    ...input, [`${P}txtDateMonth`]: "12", [`${P}txtDateDay`]: "31", [`${P}txtDateYear`]: "2017",
    [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
    [`${P}txtRDOCode`]: "043", [`${P}txtBuyerName`]: "DELA CRUZ, JUAN", [`${P}j_id395:_1`]: "true",
  };
  it("legacy 1606 computes the same values", async () => {
    const { value, error } = await oracle.openSaved(FORM_1606, state, "84653210700000-1606-12312017.xml");
    expect(await value(`${P}txtFMVLI`)).toBe("1,600,000.00");
    expect(await value(`${P}txtTax`)).toBe("1,800,000.00");
    expect(await value(`${P}txtTaxR`)).toBe("108,000.00");
    expect(await value(`${P}txtTotal`)).toBe("109,750.00");
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR: a cash sale at 6% with all four FMV bases", async () => {
    const r = await parityCheck(oracle, FORM_1606, state, "84653210700000-1606-12312017.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR: an auction at 1.5% overpaid, with the TCC option", async () => {
    const over: FormState = {
      ...state, [`${P}j_id395:_1`]: "false", [`${P}j_id395:_4`]: "true", [`${P}txtBid`]: "2,000,000.00", [`${P}txtTaxRate`]: "1.5",
      [`${P}txtLess`]: "50,000.00", [`${P}opt37:_1`]: "false", [`${P}opt37:_2`]: "true",
    };
    const r = await parityCheck(oracle, FORM_1606, over, "84653210700000-1606-12312017.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
