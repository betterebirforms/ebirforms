import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1702Qv2008C } from "@/form/form1702qv2008c.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm1702q:";

const base: FormState = {
  [`${P}txt16C`]: "10,000,000.00", [`${P}txt17C`]: "4,000,000.00", [`${P}txt21C`]: "1,000,000.00",
  [`${P}txt25B`]: "25", [`${P}txt29B`]: "50,000.00", [`${P}txt31A`]: "100,000.00", [`${P}txt33A`]: "10,000.00",
  txt1st: "2,000,000.00", txt2nd: "3,000,000.00", txt3rd: "5,000,000.00",
  "1702q:OptMethodDeduct_1": "true",
};

describe("1702Qv2008C compute (shared with 1702Q)", () => {
  it("itemized, normal tax above MCIT", () => {
    const o = computeAll(FORM_1702Qv2008C, base);
    expect(o[`${P}txt22B`]).toBe("5,000,000.00");
    expect(o[`${P}txt28`]).toBe("200,000.00");
    expect(o[`${P}txt29A`]).toBe("1,250,000.00");
    expect(o[`${P}txt34`]).toBe("1,110,000.00");
  });
});

describe.skipIf(!hasForm("1702Qv2008C"))("native 1702Qv2008C matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1702Qv2008C computes the same values", async () => {
    const state: FormState = {
      ...base, [`${P}optQtr:_3`]: "true", [`${P}txtYearEnded`]: "2017",
      [`${P}txtTin1`]: "846", [`${P}txtTin2`]: "532", [`${P}txtTin3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRdoCode`]: "043", [`${P}txtTaxpayerName`]: "ACME CORP",
    };
    const { value, error } = await oracle.openSaved(FORM_1702Qv2008C, state, "84653210700000-1702Qv2008C-2017Q3.xml");
    expect(await value(`${P}txt29A`)).toBe("1,250,000.00");
    expect(await value(`${P}txt34`)).toBe("1,110,000.00");
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR's form; 31G survives only with its 'Others, please specify' text (validate31G)", async () => {
    const state: FormState = {
      ...base, [`${P}optQtr:_3`]: "true", [`${P}txtYearEnded`]: "2017",
      [`${P}txtTin1`]: "846", [`${P}txtTin2`]: "532", [`${P}txtTin3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRdoCode`]: "043", [`${P}txtTaxpayerName`]: "ACME CORP",
      [`${P}txt25B`]: "25.00", // as FormView leaves a money input after blur
      [`${P}txt31Gothers`]: "FOREIGN TAX CREDIT", [`${P}txt31G`]: "5,000.00",
    };
    expect(computeAll(FORM_1702Qv2008C, state)[`${P}txt31H`]).toBe("105,000.00");
    expect(computeAll(FORM_1702Qv2008C, { ...state, [`${P}txt31Gothers`]: "  " })[`${P}txt31G`]).toBe("0.00");
    const r = await parityCheck(oracle, FORM_1702Qv2008C, state, "84653210700000-1702Qv2008C-2017Q3.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
