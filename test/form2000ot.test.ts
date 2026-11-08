import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_2000OT } from "@/form/form2000ot.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2000OT:";

describe("2000OT compute", () => {
  it("FMV base = max of the four combinations", () => {
    const o = computeAll(FORM_2000OT, { [`${P}txtSched1A`]: "100.00", [`${P}txtSched1B`]: "200.00", [`${P}txtSched2A`]: "300.00", [`${P}txtSched2B`]: "400.00" });
    expect(o[`${P}txtSched1C`]).toBe("300.00");
    expect(o[`${P}txtSched3A`]).toBe("500.00"); // 1A + 2B
    expect(o[`${P}txt12F`]).toBe("700.00"); // max (2C)
  });
  it("ATC rate codes: P15/1000 uses a ceiling; P1.50/P200 and 0.5 are proportional", () => {
    const ceil = computeAll(FORM_2000OT, { [`${P}NatureOfTrans_1`]: "true", [`${P}txt12E`]: "1,000,500.00", [`${P}txtTax15`]: "P15/1000 " });
    expect(ceil[`${P}txtTax16`]).toBe("15,015.00"); // ceil(1000.5) × 15 = 1001 × 15
    const prop = computeAll(FORM_2000OT, { [`${P}NatureOfTrans_1`]: "true", [`${P}txt12E`]: "200,000.00", [`${P}txtTax15`]: "P1.50/P200 " });
    expect(prop[`${P}txtTax16`]).toBe("1,500.00"); // 200,000 / 200 × 1.50
    const half = computeAll(FORM_2000OT, { [`${P}NatureOfTrans_3`]: "true", [`${P}txt12K`]: "10,000.00", [`${P}txtTax15`]: "0.5" });
    expect(half[`${P}txtTax16`]).toBe("5,000.00"); // shares base × 0.50
  });
  it("tax-due and penalty chain", () => {
    const o = computeAll(FORM_2000OT, {
      [`${P}NatureOfTrans_1`]: "true", [`${P}txt12E`]: "1,000,000.00", [`${P}txtTax15`]: "P15/1000 ",
      [`${P}txtTax19A`]: "100.00", [`${P}txtTax19B`]: "50.00", [`${P}txtTax19C`]: "25.00",
    });
    expect(o[`${P}txtTax16`]).toBe("15,000.00");
    expect(o[`${P}txtTaxDue`]).toBe("15,000.00");
    expect(o[`${P}txtTax19D`]).toBe("175.00");
    expect(o[`${P}txtTax20`]).toBe("15,175.00");
  });
});

describe.skipIf(!hasForm("2000OT"))("native 2000OT matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 2000OT computes the same values (incl. the ceiling rate)", async () => {
    const state: FormState = {
      [`${P}NatureOfTrans_1`]: "true", [`${P}txt12E`]: "1,000,000.00", [`${P}txtTax15`]: "P15/1000 ",
      [`${P}txtTax19A`]: "100.00", [`${P}txtTax19B`]: "50.00", [`${P}txtTax19C`]: "25.00",
      "frm2000_OT:txtDateMonth": "12", "frm2000_OT:txtDateDay": "31", "frm2000_OT:txtDateYear": "2017",
      [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_2000OT, state, "84653210700000-2000OT-12312017.xml");
    expect(await value(`${P}txtTax16`)).toBe("15,000.00");
    expect(await value(`${P}txtTax20`)).toBe("15,175.00");
    expect(error).toEqual([]);
  }, 120_000);

  const identity: FormState = {
    "frm2000_OT:txtDateMonth": "12", "frm2000_OT:txtDateDay": "31", "frm2000_OT:txtDateYear": "2017",
    [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
    [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
  };
  it("is 1:1 with BIR's form, real property: 13 = max(12E, 12F per the FMV schedule) (TaxBaseRealProperty)", async () => {
    const state: FormState = {
      ...identity, [`${P}NatureOfTrans_1`]: "true", [`${P}opt12_1`]: "true", [`${P}txt12E`]: "900,000.00",
      [`${P}txtSched1A`]: "400,000.00", [`${P}txtSched1B`]: "300,000.00", [`${P}txtSched2A`]: "250,000.00", [`${P}txtSched2B`]: "500,000.00",
      [`${P}txtTax15`]: "P15/1000 ", [`${P}txtTax19A`]: "100.00",
    };
    const o = computeAll(FORM_2000OT, state);
    expect(o[`${P}txt12F`]).toBe("900,000.00"); // 1A + 2B
    expect(o[`${P}txtTax13`]).toBe("900,000.00");
    expect(o[`${P}txtTax14`]).toBe("0.00");
    const r = await parityCheck(oracle, FORM_2000OT, state, "84653210700000-2000OT-12312017.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR's form, shares: 14 = max(12K, 12L) (TaxBaseStocks)", async () => {
    const state: FormState = {
      ...identity, [`${P}NatureOfTrans_3`]: "true", [`${P}opt12_2`]: "true",
      [`${P}txt12K`]: "50,000.00", [`${P}txt12L`]: "80,000.00", [`${P}txtTax15`]: "0.5",
    };
    expect(computeAll(FORM_2000OT, state)[`${P}txtTax14`]).toBe("80,000.00");
    const r = await parityCheck(oracle, FORM_2000OT, state, "84653210700000-2000OT-12312017.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
