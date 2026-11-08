import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, type FormState } from "@/form/schema.ts";
import { FORM_1702Qv2018C, atcRate1702Qv2018C, item10Rate, mcitRate, validate1702Qv2018C } from "@/form/form1702qv2018c.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1702q:";
const t = (...id: string[]): FormState => Object.fromEntries(id.map((i) => [`${P}${i}`, "true"]));
const v = (o: Record<string, string>): FormState => Object.fromEntries(Object.entries(o).map(([k, x]) => [`${P}${k}`, x]));

// calendar 2025, Q2, RCIT 25% (IC010) with the MCIT box, itemized; Schedule 1 B at a 10% special rate
const rcit: FormState = {
  ...t("rbForClndrFscl_1", "rbQuarter_2", "rbAmendedRtn_2", "rbATC_1", "rbATC_2", "rbMthdOfDdctns_1", "rbTxRlf_2"),
  ...v({
    txtYrEndYear: "25", cbATC_2: "IC010_25%",
    "Sched2:txtTax1": "5,000,000.40", "Sched2:txtTax2": "3,000,000.60", "Sched2:txtTax4": "100,000.00", "Sched2:txtTax6": "500,000.50",
    "Sched2:txtTax8": "400,000.00",
    "Sched3:txtTax1": "5,000,000.00", "Sched3:txtTax2": "4,000,000.00", "Sched3:txtTax3": "3,000,000.00",
    "Sched1:txtTax1A": "200,000.00",
    "Sched1:txtTax1B": "1,000,000.00", "Sched1:txtTax2B": "400,000.00", "Sched1:txtTax6B": "100,000.00", "Sched1:txtTax8B": "50,000.00",
    "Sched1:txtTax10B": "10", "Sched1:txtTax12B": "5,000.00",
    txtTax15: "10,000.00",
    "Sched4:txtTax1": "1,000.00", "Sched4:txtTax2": "100,000.00", "Sched4:txtTax3": "20,000.00", "Sched4:txtTax5": "30,000.49",
    "Sched4:txtTax6": "7,777.00", "Sched4:txtOthrTxCrdts0": "SPECIAL CREDIT", "Sched4:txtOthrTxCrdtAmnt0": "2,500.00",
    txtTax21: "100.50", txtTax22: "50.00",
  }),
};

describe("1702Qv2018C compute", () => {
  it("RCIT 25% vs MCIT 2%: whole-peso rounding, Schedule 1 special rate, Schedule 4 credits, Part II", () => {
    const o = computeAll(FORM_1702Qv2018C, rcit);
    expect(o[`${P}rbYrEndMonth`]).toBe("12"); // calendar year
    expect(o[`${P}Sched2:txtTax1`]).toBe("5,000,000.00"); // roundupdown
    expect(o[`${P}Sched2:txtTax2`]).toBe("3,000,001.00");
    expect(o[`${P}Sched2:txtTax5`]).toBe("2,099,999.00");
    expect(o[`${P}Sched2:txtTax6`]).toBe("500,001.00"); // itemized, Math.round(500,000.50)
    expect(o[`${P}Sched2:txtTax9`]).toBe("1,999,998.00");
    expect(o[`${P}Sched2:txtTax10`]).toBe("25.00"); // the ATC's rate
    expect(o[`${P}Sched2:txtTax11`]).toBe("500,000.00"); // 499,999.50 → 500,000
    // Q2: Schedule 3 items 1–2 only (item 3 is closed until Q3)
    expect(o[`${P}Sched3:txtTax3`]).toBe("0.00");
    expect(o[`${P}Sched3:txtTax5`]).toBe("2.00");
    expect(o[`${P}Sched3:txtTax6`]).toBe("180,000.00");
    expect(o[`${P}Sched2:txtTax12`]).toBe("180,000.00");
    expect(o[`${P}Sched2:txtTax13`]).toBe("500,000.00");
    expect(o[`${P}txtTax14`]).toBe("500,000.00");
    expect(o[`${P}txtTax16`]).toBe("490,000.00");
    // Schedule 1 B: 1,000,000 − 400,000 − 100,000 + 50,000 = 550,000 × 10% = 55,000 − 5,000
    expect(o[`${P}Sched1:txtTax9B`]).toBe("550,000.00");
    expect(o[`${P}Sched1:txtTax11B`]).toBe("55,000.00");
    expect(o[`${P}Sched1:txtTax11A`]).toBe("0.00"); // 10A is never live
    expect(o[`${P}Sched1:txtTax13B`]).toBe("50000"); // netIncome's bare number
    expect(o[`${P}txtTax17`]).toBe("50,000.00");
    expect(o[`${P}txtTax18`]).toBe("540,000.00");
    expect(o[`${P}Sched4:txtTax6`]).toBe("0.00"); // not an amended return
    expect(o[`${P}Sched4:txtTax7`]).toBe("153,500.00");
    expect(o[`${P}txtTax20`]).toBe("386,500.00");
    expect(o[`${P}txtTax24`]).toBe("151.00"); // 101 + 50
    expect(o[`${P}txtTax25`]).toBe("386,651.00");
  });

  it("MCIT above RCIT: 13 = MCIT, item 15 forced 0; Q1 zeroes the previous-quarter items; OSD = 40% of 5", () => {
    const o = computeAll(FORM_1702Qv2018C, {
      ...rcit,
      ...t("rbForClndrFscl_2", "rbQuarter_1", "rbMthdOfDdctns_2"),
      ...v({ rbForClndrFscl_1: "false", rbQuarter_2: "false", rbMthdOfDdctns_1: "false", rbYrEndMonth: "09", "Sched2:txtTax1": "1,000,001.00", "Sched2:txtTax2": "0", "Sched2:txtTax4": "0" }),
    });
    expect(o[`${P}Sched2:txtTax6`]).toBe("400,000.00"); // round(1,000,001 × 40%)
    expect(o[`${P}Sched2:txtTax8`]).toBe("0.00"); // Q1
    expect(o[`${P}Sched2:txtTax11`]).toBe("150,000.00"); // 600,001 × 25% = 150,000.25
    expect(o[`${P}Sched3:txtTax2`]).toBe("0.00"); // Q1
    expect(o[`${P}Sched3:txtTax6`]).toBe("100,000.00"); // 5,000,000 × 2%
    expect(o[`${P}Sched2:txtTax13`]).toBe("150,000.00");
    const mcitHigher = computeAll(FORM_1702Qv2018C, { ...rcit, ...v({ "Sched3:txtTax1": "50,000,000.00" }) });
    expect(mcitHigher[`${P}Sched2:txtTax13`]).toBe("1,080,000.00"); // (50M + 4M) × 2%
    expect(mcitHigher[`${P}txtTax15`]).toBe("0.00");
    expect(o[`${P}Sched4:txtTax2`]).toBe("0.00");
    expect(o[`${P}Sched1:txtTax8B`]).toBe("0.00");
  });

  it("no ATC: Schedules 1, 2 and 4 are disabled and zeroed", () => {
    const o = computeAll(FORM_1702Qv2018C, { ...rcit, [`${P}cbATC_2`]: "" });
    for (const id of ["Sched1:txtTax1B", "Sched2:txtTax1", "Sched2:txtTax11", "Sched4:txtTax1", "Sched4:txtOthrTxCrdtAmnt0", "txtTax17", "txtTax19"]) {
      expect(o[`${P}${id}`]).toBe("0.00");
    }
    expect(o[`${P}Sched1:txtTax10B`]).toBe("0.00");
    expect(o[`${P}Sched2:txtTax10`]).toBe("0.00");
  });

  it("overpayment with penalties: 25 = 24", () => {
    const o = computeAll(FORM_1702Qv2018C, { ...rcit, ...v({ "Sched4:txtTax5": "900,000.00" }) });
    expect(o[`${P}txtTax20`]).toBe("-483,500.00");
    expect(o[`${P}txtTax25`]).toBe("151.00");
  });

  it("CREATE rates by ATC, and BIR's item-10 / MCIT-rate period rules (bugs included)", () => {
    expect(atcRate1702Qv2018C("IC010_20%")).toBe("20.00");
    expect(atcRate1702Qv2018C("IC080_2.5%")).toBe("2.5");
    expect(atcRate1702Qv2018C("IC021_Exempt")).toBe("0.00");
    const r = (o: FormState) => (id: string) => o[id] ?? "";
    const at = (yy: string, mm: string, atc = "IC010_25%") => r({ [`${P}txtYrEndYear`]: yy, [`${P}rbYrEndMonth`]: mm, [`${P}cbATC_2`]: atc, ...t("rbATC_1", "rbATC_2", "rbQuarter_1") });
    expect(item10Rate(at("25", "12"))).toBe("25.00");
    expect(item10Rate(at("25", "08"))).toBe("0.00"); // `… && month == 7 || month == 8`
    expect(item10Rate(at("20", "07"))).toBe("0.00");
    expect(item10Rate(at("25", "12", "IC030_10%"))).toBe("0.00"); // special rate → Schedule 1
    expect(mcitRate(at("19", "12"))).toBe("2.00");
    expect(mcitRate(at("20", "06"))).toBe("2.00");
    expect(mcitRate(at("22", "12"))).toBe("0.00"); // 1% period: user-entered
    expect(mcitRate(at("24", "12"))).toBe("0.00");
    expect(mcitRate(at("25", "06"))).toBe("0.00"); // BIR bug: Jan–Jun 2025+ falls to the else branch
    expect(mcitRate(at("25", "09"))).toBe("2.00");
  });

  it("itemized is forced for ATCs that are not 30/25/20%", () => {
    const o = computeAll(FORM_1702Qv2018C, { ...rcit, ...v({ cbATC_2: "IC030_10%", rbMthdOfDdctns_1: "false", rbMthdOfDdctns_2: "true" }) });
    expect(o[`${P}rbMthdOfDdctns_1`]).toBe("true");
    expect(o[`${P}rbMthdOfDdctns_2`]).toBe("false");
  });

  it("validates period, quarter and ATC", () => {
    expect(validate1702Qv2018C({}).map((p) => p.id)).toEqual(expect.arrayContaining([`${P}rbForClndrFscl_1`, `${P}rbQuarter_1`, `${P}cbATC_2`]));
    expect(validate1702Qv2018C(rcit).map((p) => p.id)).not.toContain(`${P}cbATC_2`);
  });
});

describe.skipIf(!hasForm("1702Qv2018C"))("native 1702Qv2018C matches BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  // BIR reload defect + harness artifact: BIR saves 13B as netIncome's bare number ("50000", on blur of 12B, the
  // last Schedule 1 input); its reload re-runs Sched1_Computation, which rewrites it as "50,000.00", and only a blur
  // of 12B (page 2, which the harness doesn't show) would restore it.
  const ALLOW = [`${P}Sched1:txtTax13B`];
  const identity: FormState = v({
    txtTIN1: "846", txtTIN2: "532", txtTIN3: "107", txtBranchCode: "00000", txtRDOCode: "043", txtTaxpayerName1: "ABC TRADING CORP.",
    txtAddress: "1 RIZAL ST., QUEZON CITY", txtZipCode: "1100", txtTelNum: "0281234567", txtLOB: "RETAIL",
  });

  it("BIR reopens the save and shows the same Part II", async () => {
    const { value, error } = await oracle.openSaved(FORM_1702Qv2018C, { ...identity, ...rcit }, "84653210700000-1702Qv2018C-2025Q2.xml");
    expect(await value(`${P}Sched2:txtTax11`)).toBe("500,000.00");
    expect(await value(`${P}txtTax17`)).toBe("50,000.00");
    expect(await value(`${P}txtTax25`)).toBe("386,651.00");
    // pages 2–3 aren't blurred by the parity pass: run BIR's own full recompute (and 12B's netIncome) and compare
    const { page } = await oracle.openSaved(FORM_1702Qv2018C, { ...identity, ...rcit }, "84653210700000-1702Qv2018C-2025Q2-all.xml");
    await page.evaluate("ALL_Computation(); netIncome();");
    const native = computeAll(FORM_1702Qv2018C, { ...identity, ...rcit });
    for (const id of ["Sched4:txtTax7", "txtTax19", "txtTax20", "txtTax25", "Sched2:txtTax13", "Sched3:txtTax6", "Sched1:txtTax13B", "txtTax17"]) {
      expect(await page.locator(`[id="${P}${id}"]`).inputValue(), id).toBe(native[`${P}${id}`]);
    }
    await page.close();
    expect(error).toEqual([]);
  }, 120_000);

  it("RCIT 25% + MCIT, Schedule 1 special rate, credits: 1:1 after BIR recomputes", async () => {
    const r = await parityCheck(oracle, FORM_1702Qv2018C, { ...identity, ...rcit }, "84653210700000-1702Qv2018C-2025Q2-parity.xml");
    expect(parityProblem(r, ALLOW)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count - ALLOW.length);
  }, 120_000);

  it("fiscal year (Sep 2025), Q1, OSD, MCIT the higher tax: 1:1", async () => {
    const mcitCase: FormState = {
      ...identity,
      ...rcit,
      ...t("rbForClndrFscl_2", "rbQuarter_1", "rbMthdOfDdctns_2", "rbAmendedRtn_1"),
      ...v({
        rbForClndrFscl_1: "false", rbQuarter_2: "false", rbMthdOfDdctns_1: "false", rbAmendedRtn_2: "false", rbYrEndMonth: "09",
        "Sched3:txtTax1": "50,000,000.00", "Sched2:txtTax2": "4,500,000.00",
      }),
    };
    const r = await parityCheck(oracle, FORM_1702Qv2018C, mcitCase, "84653210700000-1702Qv2018C-2025Q1-parity.xml");
    expect(parityProblem(r, ALLOW)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count - ALLOW.length);
  }, 120_000);
});
