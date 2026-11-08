import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1604C } from "@/form/form1604c.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm1604c:";

const rows: FormState = {
  [`${P}txtSched1TaxWheld1`]: "1,000.00", [`${P}txtSched1Pen1`]: "10.00", [`${P}txtSched1Adj1`]: "5.00",
  [`${P}txtSched1TaxWheld2`]: "2,000.00", [`${P}txtSched1Pen2`]: "20.00", [`${P}txtSched1Adj2`]: "0.00",
  // a row whose total is negative — excluded from the schedule Total
  [`${P}txtSched1TaxWheld3`]: "100.00", [`${P}txtSched1Pen3`]: "0.00", [`${P}txtSched1Adj3`]: "-300.00",
};

describe("1604C compute", () => {
  it("per-row TotalAmt = withheld + pen + adj; column totals; Total sums only positive rows", () => {
    const o = computeAll(FORM_1604C, rows);
    expect(o[`${P}txtSched1TotalAmt1`]).toBe("1,015.00");
    expect(o[`${P}txtSched1TotalAmt2`]).toBe("2,020.00");
    expect(o[`${P}txtSched1TotalAmt3`]).toBe("-200.00");
    expect(o[`${P}txtSched1TaxWheldTotal`]).toBe("3,100.00");
    expect(o[`${P}txtSched1PenTotal`]).toBe("30.00");
    expect(o[`${P}txtSched1AdjTotal`]).toBe("-295.00");
    // Total = 1015 + 2020 (row 3's −200 excluded)
    expect(o[`${P}txtSched1Total`]).toBe("3,035.00");
  });
});

describe.skipIf(!hasForm("1604C"))("native 1604C matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1604C computes the same schedule totals", async () => {
    const state: FormState = {
      ...rows, [`${P}txtYear`]: "2017", [`${P}categoryAgent_1`]: "true",
      [`${P}tinA`]: "846", [`${P}tinB`]: "532", [`${P}tinC`]: "107", [`${P}branchCode`]: "00000",
      [`${P}rdoCode`]: "043", [`${P}registeredName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_1604C, state, "84653210700000-1604C-2017.xml");
    expect(await value(`${P}txtSched1TaxWheldTotal`)).toBe("3,100.00");
    expect(await value(`${P}txtSched1AdjTotal`)).toBe("-295.00");
    expect(await value(`${P}txtSched1Total`)).toBe("3,035.00");
    expect(error).toEqual([]);
  }, 120_000);
});
