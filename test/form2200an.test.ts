import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_2200AN } from "@/form/form2200an.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm2200ANv2018:";

const input: FormState = {
  [`${P}txtXG021TaxDue`]: "1,000.00", [`${P}txtXG022TaxDue`]: "2,000.00",
  [`${P}txtXG100TaxDue`]: "500.00", [`${P}txtXG110TaxDue`]: "250.00",
  [`${P}txt17A`]: "100.00", [`${P}txt17B`]: "50.00", [`${P}txt19`]: "100.00",
  [`${P}txt21A`]: "50.00", [`${P}txt21B`]: "25.00", [`${P}txt21C`]: "10.00", [`${P}txt23A`]: "20.00",
};

describe("2200ANv2018 compute", () => {
  it("sums excise codes → 16, chain with the legacy 21-series over-count in 22", () => {
    const o = computeAll(FORM_2200AN, input);
    expect(o[`${P}txtBasicExciseTaxDue`]).toBe("3,000.00");
    expect(o[`${P}txtBasicExciseTaxDueNonEssentialGoods`]).toBe("750.00");
    expect(o[`${P}txt16`]).toBe("3,750.00");
    expect(o[`${P}txt17C`]).toBe("150.00");
    expect(o[`${P}txt18`]).toBe("3,600.00");
    expect(o[`${P}txt20`]).toBe("3,500.00");
    expect(o[`${P}txt21D`]).toBe("85.00");
    // over-count: 3500 + (50+25+10) + 85 = 3670 (penalties counted twice), NOT 3585
    expect(o[`${P}txt22`]).toBe("3,670.00");
    expect(o[`${P}txt23C`]).toBe("105.00");
    expect(o[`${P}txt24`]).toBe("3,565.00");
  });
});

describe.skipIf(!hasForm("2200ANv2018"))("native 2200ANv2018 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 2200ANv2018 computes the same values (incl. the over-count)", async () => {
    const state: FormState = {
      ...input, [`${P}txtMonth`]: "03", [`${P}txtDate`]: "20", [`${P}txtYear`]: "2026",
      [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_2200AN, state, "84653210700000-2200ANv2018-03202026.xml");
    expect(await value(`${P}txt16`)).toBe("3,750.00");
    expect(await value(`${P}txt20`)).toBe("3,500.00");
    expect(await value(`${P}txt22`)).toBe("3,670.00");
    expect(await value(`${P}txt24`)).toBe("3,565.00");
    expect(error).toEqual([]);
  }, 120_000);
});
