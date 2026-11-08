import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_2551Q } from "@/form/form2551q.ts";
import { hasForm, startOracle } from "./oracle.ts";
const P = "frm2551Qv2018:";

// Percentage-tax path (taxRate1). Schedule 1 ATC rows are set directly (rate is ATC-dropdown-derived in the
// legacy — see caveat); here we drive the compute graph with explicit amount/rate.
const pct: FormState = {
  [`${P}taxRate1`]: "true",
  txtATCAmt1: "100,000.00", txtATCRate1: "3",
  txtATCAmt2: "50,000.00", txtATCRate2: "1",
  [`${P}txt15`]: "200.00", [`${P}txt17`]: "100.00",
  [`${P}txt20`]: "50.00", [`${P}txt21`]: "25.00", [`${P}txt22`]: "10.00",
};

describe("2551Qv2018 compute", () => {
  it("Schedule 1 → 14, then 18/19/23/24 (original return: 16 gated)", () => {
    const o = computeAll(FORM_2551Q, pct);
    expect(o.txtATCDue1).toBe("3,000.00");
    expect(o.txtATCDue2).toBe("500.00");
    expect(o.txtTotalSched1).toBe("3,500.00");
    expect(o[`${P}txt14`]).toBe("3,500.00");
    expect(o[`${P}txt16`]).toBe("0.00"); // not amended → gated
    expect(o[`${P}txt18`]).toBe("300.00"); // 200 + 0 + 100
    expect(o[`${P}txt19`]).toBe("3,200.00"); // 3500 − 300
    expect(o[`${P}txt23`]).toBe("85.00");
    expect(o[`${P}txt24`]).toBe("3,285.00"); // 3200 + 85
  });
  it("item 16 is live only with taxRate1 AND an amended return (AND-gate)", () => {
    const o = computeAll(FORM_2551Q, { ...pct, [`${P}amendedRtn_1`]: "true", [`${P}txt16`]: "150.00" });
    expect(o[`${P}txt16`]).toBe("150.00");
    expect(o[`${P}txt18`]).toBe("450.00"); // 200 + 150 + 100
    expect(o[`${P}txt24`]).toBe("3,135.00"); // (3500−450) + 85
  });
  it("8% option (taxRate2) zeroes the whole return for compliance", () => {
    const o = computeAll(FORM_2551Q, { ...pct, [`${P}taxRate1`]: "false", [`${P}taxRate2`]: "true", [`${P}amendedRtn_1`]: "true", [`${P}txt16`]: "150.00" });
    for (const id of ["txt14", "txt15", "txt16", "txt17", "txt18", "txt19", "txt20", "txt21", "txt22", "txt23", "txt24"]) {
      expect(o[`${P}${id}`]).toBe("0.00");
    }
  });
});

describe.skipIf(!hasForm("2551Qv2018"))("native 2551Qv2018 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  // The 8% (taxRate2) path is a clean all-zero return — it proves the gate collapses the chain exactly like
  // the legacy, without depending on the ATC-dropdown schedule reconstruction.
  it("8% compliance return round-trips as all zeros", async () => {
    const state: FormState = {
      [`${P}taxRate2`]: "true", [`${P}qtr_1`]: "true", [`${P}rtnMonth`]: "03", [`${P}txtYear`]: "2026",
      [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043", [`${P}registeredName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_2551Q, state, "84653210700000-2551Qv2018-032026Q1.xml");
    expect(await value(`${P}txt14`)).toBe("0.00");
    expect(await value(`${P}txt19`)).toBe("0.00");
    expect(await value(`${P}txt24`)).toBe("0.00");
    expect(error).toEqual([]);
  }, 120_000);
});
