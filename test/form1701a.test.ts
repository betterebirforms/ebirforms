import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1701A } from "@/form/form1701a.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm1701A:";

// Graduated path, 2023+ table: gross 1,000,000 − OSD 40% = 600,000 taxable.
const grad2023: FormState = {
  [`${P}txtYear`]: "2023", [`${P}txt36A`]: "1,000,000.00",
  [`${P}txt57A`]: "2,500.00", [`${P}txt25A`]: "1,000.00", "frm1701A:optTaxRate_1": "true",
};

describe("1701A compute", () => {
  it("graduated 2023+ table, OSD 40%, credits, penalties (whole-peso)", () => {
    const o = computeAll(FORM_1701A, grad2023);
    expect(o[`${P}txt39A`]).toBe("400,000.00"); // OSD 40%
    expect(o[`${P}txt45A`]).toBe("600,000.00"); // taxable
    expect(o[`${P}txt46A`]).toBe("62,500.00"); // (600k−400k)×20% + 22,500
    expect(o[`${P}txt20A`]).toBe("62,500.00");
    expect(o[`${P}txt22A`]).toBe("60,000.00"); // − 2,500 credits
    expect(o[`${P}txt29A`]).toBe("61,000.00"); // + 1,000 penalties
    expect(o[`${P}txt30`]).toBe("61,000.00");
  });
  it("year-dependent bracket: 2022 table gives a different graduated tax", () => {
    const o = computeAll(FORM_1701A, { ...grad2023, [`${P}txtYear`]: "2022" });
    expect(o[`${P}txt46A`]).toBe("80,000.00"); // (600k−400k)×25% + 30,000
  });
  it("8% option path", () => {
    const o = computeAll(FORM_1701A, { [`${P}txtYear`]: "2023", [`${P}txt47A`]: "1,000,000.00", [`${P}txt54A`]: "250,000.00", "frm1701A:optTaxRate_2": "true" });
    expect(o[`${P}txt55A`]).toBe("750,000.00"); // 1,000,000 − 250,000
    expect(o[`${P}txt56A`]).toBe("60,000.00"); // × 8%
    expect(o[`${P}txt20A`]).toBe("60,000.00"); // 8% method selected
  });
  it("pre-2018 (or blank) year uses BIR's old graduated table", () => {
    expect(computeAll(FORM_1701A, { ...grad2023, [`${P}txtYear`]: "2017" })[`${P}txt46A`]).toBe("157,000.00"); // (600k − 500k) × 32% + 125,000
  });
  it("the chosen method zeroes the other Part IV column as BIR does (\"0\" inputs, \"0.00\" recomputed)", () => {
    const o = computeAll(FORM_1701A, { ...grad2023, [`${P}txt47A`]: "500,000.00", [`${P}txt50A`]: "1,000.00" });
    expect([o[`${P}txt47A`], o[`${P}txt50A`], o[`${P}txt52A`], o[`${P}txt49A`], o[`${P}txt56A`]]).toEqual(["0", "0", "0", "0.00", "0.00"]);
    const e = computeAll(FORM_1701A, { [`${P}txtYear`]: "2023", [`${P}txt36A`]: "1,000.00", [`${P}txt47A`]: "100,000.00", [`${P}txt48A`]: "200,000.00", "frm1701A:optTaxRate_2": "true" });
    expect([e[`${P}txt36A`], e[`${P}txt44A`], e[`${P}txt38A`]]).toEqual(["0", "0", "0.00"]);
    expect([e[`${P}txt55A`], e[`${P}txt56A`], e[`${P}txt20A`]]).toEqual(["-100,000.00", "0", "0"]); // computeTxt56's bare "0"
  });
  it("not filing jointly: spouse inputs read \"0\", spouse radios and identity clear", () => {
    const o = computeAll(FORM_1701A, { ...grad2023, [`${P}optCivilStatus_1`]: "true", [`${P}optFilingStatus_1`]: "true", [`${P}txt23B`]: "5,000.00", [`${P}txtSpouseName`]: "X", [`${P}optSpouseTaxRate_1`]: "true" });
    expect([o[`${P}optFilingStatus_1`], o[`${P}txt23B`], o[`${P}txtSpouseName`], o[`${P}optSpouseTaxRate_1`]]).toEqual(["false", "0", "", "false"]);
  });
});

describe.skipIf(!hasForm("1701A"))("native 1701A matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy 1701A computes the same values (graduated 2023)", async () => {
    const state: FormState = {
      ...grad2023, [`${P}txtMonth`]: "12",
      [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
    };
    const { value, error } = await oracle.openSaved(FORM_1701A, state, "84653210700000-1701A-122023.xml");
    expect(await value(`${P}txt46A`)).toBe("62,500.00");
    expect(await value(`${P}txt22A`)).toBe("60,000.00");
    expect(await value(`${P}txt30`)).toBe("61,000.00");
    expect(error).toEqual([]);
  }, 120_000);

  const id: FormState = {
    [`${P}txtMonth`]: "12", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
    [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN", [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY", [`${P}txtZipCode`]: "1100",
    [`${P}txtBirthDate`]: "01/15/1980", [`${P}txtCitizenship`]: "FILIPINO", [`${P}optAmendedReturn_2`]: "true", [`${P}optShortPeriod_2`]: "true",
  };

  it("is 1:1 with BIR: single, sole proprietor on graduated rates (2023)", async () => {
    const state: FormState = {
      ...grad2023, ...id, [`${P}optCivilStatus_1`]: "true", [`${P}optTaxType_1`]: "true", [`${P}optATC_1`]: "true",
      [`${P}optForeignTaxCredits_2`]: "true", [`${P}txt37A`]: "12,345.67", [`${P}txt41Desc`]: "RENTAL", [`${P}txt41A`]: "30,000.00",
      [`${P}txt58A`]: "1,234.50", [`${P}txt23A`]: "100.25", [`${P}txt26A`]: "75.00",
    };
    const r = await parityCheck(oracle, FORM_1701A, state, "84653210700000-1701A-122023.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR: married joint filing — taxpayer 8% with a foreign tax credit, spouse graduated (2022), overpaid", async () => {
    const state: FormState = {
      ...id, [`${P}txtYear`]: "2022", [`${P}optCivilStatus_2`]: "true", [`${P}optSpouseIncome_1`]: "true", [`${P}optFilingStatus_1`]: "true",
      [`${P}optTaxType_2`]: "true", [`${P}optATC_4`]: "true", [`${P}optTaxRate_2`]: "true",
      [`${P}optForeignTaxCredits_1`]: "true", [`${P}txtForeignTaxNumber`]: "FTN-001",
      [`${P}txt47A`]: "900,000.00", [`${P}txt48A`]: "20,000.00", [`${P}txt50Desc`]: "INTEREST", [`${P}txt50A`]: "5,000.00", [`${P}txt54A`]: "250,000.00",
      [`${P}txt57A`]: "40,000.00", [`${P}txt62A`]: "30,000.00",
      [`${P}txtSpouseTIN1`]: "123", [`${P}txtSpouseTIN2`]: "456", [`${P}txtSpouseTIN3`]: "789", [`${P}txtSpouseBranchCode`]: "00000",
      [`${P}txtSpouseRDOCode`]: "043", [`${P}txtSpouseName`]: "DELA CRUZ, MARIA", [`${P}txtSpouseCitizenship`]: "FILIPINO",
      [`${P}optSpouseTaxType_1`]: "true", [`${P}optSpouseATC_1`]: "true", [`${P}optSpouseFTC_2`]: "true", [`${P}optSpouseTaxRate_1`]: "true",
      [`${P}txt36B`]: "700,000.00", [`${P}txt37B`]: "50,000.00", [`${P}txt57B`]: "60,000.00", [`${P}txt25B`]: "500.00",
      [`${P}optRefund_2`]: "true",
    };
    const o = computeAll(FORM_1701A, state);
    expect(o[`${P}txt30`]).toMatch(/^-/); // an overpayment, so the refund choice stands
    const r = await parityCheck(oracle, FORM_1701A, state, "84653210700000-1701A-122022.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
