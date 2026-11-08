import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1604CF } from "@/form/form1604cf.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm1604cf:";

const rows: FormState = {
  // sched 1 (with Adj): one positive row, one row made negative by Adj (excluded from Total)
  [`${P}txtSched1TaxWheld1`]: "1,000.00", [`${P}txtSched1Pen1`]: "10.00", [`${P}txtSched1Adj1`]: "5.00",
  [`${P}txtSched1TaxWheld2`]: "100.00", [`${P}txtSched1Pen2`]: "0.00", [`${P}txtSched1Adj2`]: "-300.00",
  // sched 2 (no Adj)
  [`${P}txtSched2TaxWheld1`]: "2,000.00", [`${P}txtSched2Pen1`]: "20.00",
  // sched 4 (4 rows, no Adj)
  [`${P}txtSched4TaxWheld4`]: "750.50", [`${P}txtSched4Pen4`]: "0.25",
};

describe("1604CF compute", () => {
  it("sched 1 has Adj + positive-only Total; sched 2/4 are withheld+pen", () => {
    const o = computeAll(FORM_1604CF, rows);
    expect(o[`${P}txtSched1TotalAmt1`]).toBe("1,015.00");
    expect(o[`${P}txtSched1TotalAmt2`]).toBe("-200.00");
    expect(o[`${P}txtSched1TaxWheldTotal`]).toBe("1,100.00");
    expect(o[`${P}txtSched1AdjTotal`]).toBe("-295.00");
    expect(o[`${P}txtSched1Total`]).toBe("1,015.00"); // row 2 (−200) excluded
    expect(o[`${P}txtSched2Total`]).toBe("2,020.00");
    expect(o[`${P}txtSched4TotalAmt4`]).toBe("750.75");
    expect(o[`${P}txtSched4Total`]).toBe("750.75");
  });
});

describe.skipIf(!hasForm("1604CF"))("native 1604CF matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1604CF computes the same schedule totals", async () => {
    const state: FormState = {
      ...rows, [`${P}txtYear`]: "2017", [`${P}categoryAgent_1`]: "true",
      [`${P}tinA`]: "846", [`${P}tinB`]: "532", [`${P}tinC`]: "107", [`${P}branchCode`]: "00000",
      [`${P}rdoCode`]: "043", [`${P}registeredName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_1604CF, state, "84653210700000-1604CF-2017.xml");
    expect(await value(`${P}txtSched1Total`)).toBe("1,015.00");
    expect(await value(`${P}txtSched1AdjTotal`)).toBe("-295.00");
    expect(await value(`${P}txtSched2Total`)).toBe("2,020.00");
    expect(await value(`${P}txtSched4Total`)).toBe("750.75");
    expect(error).toEqual([]);
  }, 120_000);
});
