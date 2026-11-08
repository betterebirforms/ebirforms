import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1601Cv2018, validate1601Cv2018 } from "@/form/form1601cv2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1601c:";

describe("1601Cv2018 compute graph", () => {
  it("21=15+…+20, 22=14−21, 31=27−30, 35=32+33+34, 36=31+35", () => {
    const out = computeAll(FORM_1601Cv2018, {
      [`${P}txtTax14`]: "5,000.00",
      [`${P}txtTax15`]: "100.00",
      [`${P}txtTax16`]: "200.00",
      [`${P}txtTax17`]: "50.00",
      [`${P}txtTax25`]: "10.00",
      [`${P}txtTax26`]: "20.00",
      [`${P}txtTax28`]: "5.00",
      [`${P}txtTax29`]: "5.00",
      [`${P}txtTax32`]: "1.10",
      [`${P}txtTax33`]: "2.20",
      [`${P}txtTax34`]: "0.30",
    });
    expect(out[`${P}txtTax21`]).toBe("350.00"); // 100+200+50
    expect(out[`${P}txtTax22`]).toBe("4,650.00"); // 5000−350
    expect(out[`${P}txtTax27`]).toBe("30.00"); // 10+20
    expect(out[`${P}txtTax30`]).toBe("10.00"); // 5+5
    expect(out[`${P}txtTax31`]).toBe("20.00"); // 30−10
    expect(out[`${P}txtTax35`]).toBe("3.60"); // 1.10+2.20+0.30
    expect(out[`${P}txtTax36`]).toBe("23.60"); // 20+3.60
  });
});

describe.skipIf(!hasForm("1601Cv2018"))("native 1601Cv2018 is byte-compatible with the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("legacy 1601Cv2018 shows the same values and computed totals", async () => {
    const state: FormState = {
      [`${P}txtMonth`]: "10",
      [`${P}txtYear`]: "2026",
      [`${P}txtTIN1`]: "846",
      [`${P}txtTIN2`]: "532",
      [`${P}txtTIN3`]: "107",
      [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043",
      [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
      [`${P}txtTax14`]: "5,000.00",
      [`${P}txtTax15`]: "100.00",
      [`${P}txtTax16`]: "200.00",
      [`${P}txtTax17`]: "50.00",
      [`${P}txtTax25`]: "10.00",
      [`${P}txtTax26`]: "20.00",
      [`${P}txtTax28`]: "5.00",
      [`${P}txtTax29`]: "5.00",
      [`${P}txtTax32`]: "1.10",
      [`${P}txtTax33`]: "2.20",
      [`${P}txtTax34`]: "0.30",
    };
    expect(validate1601Cv2018(state)).toEqual([]);
    const { value, error } = await oracle.openSaved(FORM_1601Cv2018, state, "84653210700000-1601Cv2018-102026.xml");
    expect(await value(`${P}txtTax21`)).toBe("350.00");
    expect(await value(`${P}txtTax36`)).toBe("23.60");
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR's form, items 18-20 included in 21 (computeTxt21)", async () => {
    const state: FormState = {
      [`${P}txtMonth`]: "09", [`${P}txtYear`]: "2026", [`${P}TaxWithheld_1`]: "true", [`${P}AmendedRtn_2`]: "true",
      [`${P}CatAgent_P`]: "true", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107",
      [`${P}txtBranchCode`]: "00000", [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
      [`${P}txtTax14`]: "500,000.00", [`${P}txtTax15`]: "100.00", [`${P}txtTax16`]: "200.00", [`${P}txtTax17`]: "50.00",
      [`${P}txtTax18`]: "1,000.00", [`${P}txtTax19`]: "2,000.00", [`${P}txtTax20`]: "3,000.00",
      [`${P}txtTax23`]: "40,000.00", [`${P}txtTax25`]: "60,000.00", [`${P}txtTax32`]: "100.00",
    };
    const o = computeAll(FORM_1601Cv2018, state);
    expect(o[`${P}txtTax21`]).toBe("6,350.00");
    expect(o[`${P}txtTax24`]).toBe("453,650.00");
    const r = await parityCheck(oracle, FORM_1601Cv2018, state, "84653210700000-1601Cv2018-092026.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
