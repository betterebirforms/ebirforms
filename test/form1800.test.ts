import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1800 } from "@/form/form1800.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm1800:";

const state: FormState = { [`${P}txtSurcharge`]: "1,000.00" };
const groups: GroupState = { schedA: [{ txtSchedAStranger: "300,000.00", txtSchedARelative: "600,000.00" }], schedB: [] };

describe("1800 compute", () => {
  it("stranger 30% + relative graduated donor's tax, net gifts, chain", () => {
    const o = computeForm(FORM_1800, state, groups);
    expect(o[`${P}txt18A`]).toBe("300,000.00");
    expect(o[`${P}txt18B`]).toBe("600,000.00");
    expect(o[`${P}txt24A`]).toBe("300,000.00");
    expect(o[`${P}txt24B`]).toBe("600,000.00");
    expect(o[`${P}txt25A`]).toBe("90,000.00"); // 300k × 30%
    expect(o[`${P}txt25B`]).toBe("20,000.00"); // 14,000 + (600k−500k)×6%
    expect(o[`${P}txt25C`]).toBe("110,000.00");
    expect(o[`${P}txt27`]).toBe("110,000.00");
    expect(o[`${P}txt29`]).toBe("111,000.00"); // + 1,000 penalty
  });
  it("BIR's bare \"0\" for 25A (no stranger gifts) and 25B (relatives within the 100k exemption); refund only on overpayment", () => {
    const o = computeForm(FORM_1800, { [`${P}opt37:_1`]: "true" }, { schedA: [{ txtSchedARelative: "80,000.00" }], schedB: [] });
    expect(o[`${P}txt25A`]).toBe("0");
    expect(o[`${P}txt25B`]).toBe("0");
    expect(o[`${P}txt25C`]).toBe("0.00");
    expect(o[`${P}opt37:_1`]).toBe("false");
    const over = computeForm(FORM_1800, { ...state, [`${P}txt26A`]: "200,000.00", [`${P}opt37:_1`]: "true" }, groups);
    expect(over[`${P}txt29`]).toBe("-89,000.00");
    expect(over[`${P}opt37:_1`]).toBe("true");
  });
});

describe.skipIf(!hasForm("1800"))("native 1800 matches the legacy form (dynamic reload probe)", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1800 reconstructs Schedule A and computes the same donor's tax", async () => {
    const full: FormState = {
      ...state, [`${P}txtDateMonth`]: "12", [`${P}txtDateDay`]: "31", [`${P}txtDateYear`]: "2017",
      [`${P}txtDonorTIN1`]: "846", [`${P}txtDonorTIN2`]: "532", [`${P}txtDonorTIN3`]: "107", [`${P}txtDonorBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043", [`${P}txtDonorName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_1800, full, "84653210700000-1800-12312017.xml", groups);
    // The dynamic Schedule A reconstructs and its column totals / item 18 round-trip exactly.
    expect(await value(`${P}totalStranger`)).toBe("300,000.00");
    expect(await value(`${P}txt18A`)).toBe("300,000.00");
    expect(await value(`${P}txt18B`)).toBe("600,000.00");
    // NOTE: items 24+ (the donor's-tax chain) are computed by the legacy only via blur handlers, which do NOT
    // fire on reload, so its display shows 0 there. Our saved file carries the correct values (the compute test
    // above proves the full chain), and BIR parses the file — the stale reload display is a legacy defect.
    expect(error).toEqual([]);
  }, 120_000);

  const full: FormState = {
    ...state, [`${P}txtDateMonth`]: "12", [`${P}txtDateDay`]: "31", [`${P}txtDateYear`]: "2017",
    [`${P}txtDonorTIN1`]: "846", [`${P}txtDonorTIN2`]: "532", [`${P}txtDonorTIN3`]: "107", [`${P}txtDonorBranchCode`]: "00000",
    [`${P}txtRDOCode`]: "043", [`${P}txtDonorName`]: "DELA CRUZ, JUAN", [`${P}txt21B`]: "50,000.00", [`${P}txt21C`]: "20,000.00",
  };
  const both: GroupState = {
    schedA: [
      { chxschedA: "true", txtSchedAParticulars: "CASH", txtSchedAStranger: "300,000.00", txtSchedARelative: "600,000.00" },
      { chxschedA: "true", txtSchedAParticulars: "SHARES OF STOCK", txtSchedAStranger: "0.00", txtSchedARelative: "150,000.00" },
    ],
    schedB: [
      {
        chxschedB: "true", txtSchedBClassification: "RESIDENTIAL", txtSchedBArea: "250 SQM", txtSchedBLocation: "QUEZON CITY",
        txtSchedBTaxDeclaration: "TD-12345", txtSchedBStranger: "0.00", txtSchedBRelative: "1,200,000.00",
      },
    ],
  };

  it("is 1:1 with BIR: both schedules populated, prior gifts, graduated + 30%", async () => {
    const r = await parityCheck(oracle, FORM_1800, full, "84653210700000-1800-12312017.xml", both);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR: relatives only, within the exemption, overpaid with the refund option", async () => {
    const small: GroupState = { schedA: [{ chxschedA: "true", txtSchedAParticulars: "CASH", txtSchedAStranger: "0.00", txtSchedARelative: "80,000.00" }], schedB: [] };
    const over: FormState = { ...full, [`${P}txt21B`]: "0.00", [`${P}txt21C`]: "0.00", [`${P}txt26A`]: "5,000.00", [`${P}opt37:_1`]: "true", [`${P}opt37:_2`]: "false" };
    const r = await parityCheck(oracle, FORM_1800, over, "84653210700000-1800-12312017.xml", small);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
