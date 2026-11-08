import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1604F } from "@/form/form1604f.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm1604f:";

const rows: FormState = {
  [`${P}txtSched1TaxWheld1`]: "1,000.00", [`${P}txtSched1Pen1`]: "10.00",
  [`${P}txtSched1TaxWheld2`]: "2,000.00", [`${P}txtSched1Pen2`]: "20.00",
  [`${P}txtSched2TaxWheld1`]: "500.00", [`${P}txtSched2Pen1`]: "5.00",
  [`${P}txtSched3TaxWheld4`]: "750.50", [`${P}txtSched3Pen4`]: "0.25",
};

describe("1604F compute", () => {
  it("per-row TotalAmt, per-sched TaxWheld/Pen/Total", () => {
    const o = computeAll(FORM_1604F, rows);
    expect(o[`${P}txtSched1TotalAmt1`]).toBe("1,010.00");
    expect(o[`${P}txtSched1TotalAmt2`]).toBe("2,020.00");
    expect(o[`${P}txtSched1TaxWheldTotal`]).toBe("3,000.00");
    expect(o[`${P}txtSched1PenTotal`]).toBe("30.00");
    expect(o[`${P}txtSched1Total`]).toBe("3,030.00");
    expect(o[`${P}txtSched2Total`]).toBe("505.00");
    expect(o[`${P}txtSched3TotalAmt4`]).toBe("750.75");
    expect(o[`${P}txtSched3Total`]).toBe("750.75");
  });
});

describe.skipIf(!hasForm("1604F"))("native 1604F matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1604F computes the same schedule totals", async () => {
    const state: FormState = {
      ...rows, [`${P}txtYear`]: "2017",
      [`${P}tinA`]: "846", [`${P}tinB`]: "532", [`${P}tinC`]: "107", [`${P}branchCode`]: "00000",
      [`${P}rdoCode`]: "043", [`${P}registeredName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_1604F, state, "84653210700000-1604F-2017.xml");
    expect(await value(`${P}txtSched1TaxWheldTotal`)).toBe("3,000.00");
    expect(await value(`${P}txtSched1PenTotal`)).toBe("30.00");
    expect(await value(`${P}txtSched1Total`)).toBe("3,030.00");
    expect(await value(`${P}txtSched3Total`)).toBe("750.75");
    expect(error).toEqual([]);
  }, 120_000);
});
