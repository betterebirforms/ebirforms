import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1702Q } from "@/form/form1702q.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm1702q:";

// Column C income, itemized deductions, normal tax above MCIT.
const base: FormState = {
  [`${P}txt16C`]: "10,000,000.00", [`${P}txt17C`]: "4,000,000.00", // 18C = 6,000,000
  [`${P}txt21C`]: "1,000,000.00", // itemized
  [`${P}txt25B`]: "25", // 25% corporate rate
  [`${P}txt29B`]: "50,000.00", [`${P}txt31A`]: "100,000.00", [`${P}txt33A`]: "10,000.00",
  txt1st: "2,000,000.00", txt2nd: "3,000,000.00", txt3rd: "5,000,000.00", // MCIT base → 28 = 200,000
  "1702q:OptMethodDeduct_1": "true",
};

describe("1702Q compute", () => {
  it("itemized, normal tax above MCIT: full 18→34 chain", () => {
    const o = computeAll(FORM_1702Q, base);
    expect(o[`${P}txt18C`]).toBe("6,000,000.00");
    expect(o[`${P}txt20C`]).toBe("6,000,000.00");
    expect(o[`${P}txt22B`]).toBe("5,000,000.00"); // 20C − 21C
    expect(o[`${P}txt26B`]).toBe("1,250,000.00"); // × 25%
    expect(o[`${P}txt28`]).toBe("200,000.00"); // MCIT 2% of 10M
    expect(o[`${P}txt29A`]).toBe("1,250,000.00"); // normal > MCIT
    expect(o[`${P}txt29C`]).toBe("1,200,000.00"); // 29A − 29B
    expect(o[`${P}txt30`]).toBe("1,200,000.00");
    expect(o[`${P}txt32`]).toBe("1,100,000.00"); // − 31H(100k)
    expect(o[`${P}txt34`]).toBe("1,110,000.00"); // + 33D(10k)
  });
  it("OSD: item 21C becomes 40% of 20C", () => {
    const o = computeAll(FORM_1702Q, { ...base, "1702q:OptMethodDeduct_1": "false", "1702q:OptMethodDeduct_2": "true" });
    expect(o[`${P}txt21C`]).toBe("2,400,000.00"); // 6,000,000 × 40%
    expect(o[`${P}txt22B`]).toBe("3,600,000.00"); // 20C − 21C
  });
  it("MCIT applies when normal tax < 2% floor: 29A = MCIT, 29B forced 0", () => {
    const o = computeAll(FORM_1702Q, { ...base, [`${P}txt16C`]: "4,100,000.00", [`${P}txt21C`]: "3,900,000.00" });
    // 18C=100k, 20C=100k, 22B=100k−... → small; 26B tiny < 28(200k)
    expect(o[`${P}txt29A`]).toBe("200,000.00"); // MCIT floor
    expect(o[`${P}txt29B`]).toBe("0.00"); // forced
  });
});

describe.skipIf(!hasForm("1702Q"))("native 1702Q matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1702Q computes the same values", async () => {
    const state: FormState = {
      ...base, [`${P}optQtr:_3`]: "true", [`${P}txtYearEnded`]: "2017", [`${P}itemYearEndMonth`]: "12",
      [`${P}txtTin1`]: "846", [`${P}txtTin2`]: "532", [`${P}txtTin3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRdoCode`]: "043", [`${P}txtTaxpayerName`]: "ACME CORP",
    };
    const { value, error } = await oracle.openSaved(FORM_1702Q, state, "84653210700000-1702Q-2017Q3.xml");
    expect(await value(`${P}txt22B`)).toBe("5,000,000.00");
    expect(await value(`${P}txt28`)).toBe("200,000.00");
    expect(await value(`${P}txt29A`)).toBe("1,250,000.00");
    expect(await value(`${P}txt34`)).toBe("1,110,000.00");
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR's form (26A saved as the bare '0' BIR's compute26A writes when 24A <= 0)", async () => {
    const state: FormState = {
      ...base, [`${P}optQtr:_3`]: "true", [`${P}txtYearEnded`]: "2017", [`${P}itemYearEndMonth`]: "12",
      [`${P}txtTin1`]: "846", [`${P}txtTin2`]: "532", [`${P}txtTin3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRdoCode`]: "043", [`${P}txtTaxpayerName`]: "ACME CORP", [`${P}txt16A`]: "300,000.00", [`${P}txt17A`]: "500,000.00",
    };
    expect(computeAll(FORM_1702Q, state)[`${P}txt26A`]).toBe("0");
    expect(computeAll(FORM_1702Q, { ...state, [`${P}txt19A`]: "200,000.00", [`${P}txt25A`]: "10" })[`${P}txt26A`]).toBe("20,000.00");
    const r = await parityCheck(oracle, FORM_1702Q, state, "84653210700000-1702Q-2017Q3.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
