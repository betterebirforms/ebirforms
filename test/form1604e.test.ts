import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1604E } from "@/form/form1604e.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm1604e:";

const rows: FormState = {
  [`${P}txtSched1TaxWheld1`]: "1,000.00", [`${P}txtSched1Pen1`]: "10.00",
  [`${P}txtSched1TaxWheld2`]: "2,000.00", [`${P}txtSched1Pen2`]: "20.00",
  [`${P}txtSched2TaxWheld1`]: "500.50", [`${P}txtSched2Pen1`]: "0.25",
};

describe("1604E compute", () => {
  it("per-row TotalAmt and per-sched totals", () => {
    const o = computeAll(FORM_1604E, rows);
    expect(o[`${P}txtSched1TotalAmt1`]).toBe("1,010.00");
    expect(o[`${P}txtSched1TaxWheldTotal`]).toBe("3,000.00");
    expect(o[`${P}txtSched1PenTotal`]).toBe("30.00");
    expect(o[`${P}txtSched1Total`]).toBe("3,030.00");
    expect(o[`${P}txtSched2TotalAmt1`]).toBe("500.75");
    expect(o[`${P}txtSched2Total`]).toBe("500.75");
  });
});

describe.skipIf(!hasForm("1604E"))("native 1604E matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1604E computes the same schedule totals", async () => {
    const state: FormState = {
      ...rows, [`${P}txtYear`]: "2017",
      [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043", [`${P}txtAgentname`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_1604E, state, "84653210700000-1604E-2017.xml");
    expect(await value(`${P}txtSched1TaxWheldTotal`)).toBe("3,000.00");
    expect(await value(`${P}txtSched1Total`)).toBe("3,030.00");
    expect(await value(`${P}txtSched2Total`)).toBe("500.75");
    expect(error).toEqual([]);
  }, 120_000);
});
