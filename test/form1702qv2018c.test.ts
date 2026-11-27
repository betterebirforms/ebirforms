import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, computeForm, formRecords, groupsFromSavefile, type FormState, type GroupState } from "@/form/schema.ts";
import { parseMoney } from "@/form/money.ts";
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

  // mod/fix/edit-schedule-by-atc: BIR's Edit (enableAllControl) reopened Schedules 1, 2 and 4 only for the
  // regular-rate ATCs, while picking any ATC opens them; a special-rate or exempt ATC left Schedule 4 greyed
  it("Validate then Edit reopens Schedule 4 for every ATC, as picking the ATC does", async () => {
    for (const atc of ["IC010_25%", "IC030_10%", "IC011_0%"]) {
      const state = { ...identity, ...v({ rbForClndrFscl_1: "true", rbQuarter_2: "true", rbAmendedRtn_1: "true", cbATC_2: atc }) };
      const { page } = await oracle.openSaved(FORM_1702Qv2018C, state, `84653210700000-1702Qv2018C-edit${atc.replace(/\W/g, "")}.xml`);
      const open = () => page.evaluate(() => [1, 2, 3, 4, 5, 6].filter((n) => !(document.getElementById(`frm1702q:Sched4:txtTax${n}`) as HTMLInputElement).disabled));
      expect(await open(), atc).toEqual([1, 2, 3, 4, 5, 6]);
      await page.evaluate("disableAllControl(); enableAllControl();");
      expect(await open(), atc).toEqual([1, 2, 3, 4, 5, 6]);
      await page.close();
    }
  }, 90_000);

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

// Schedule 4's "Add" pop-up (modalSched4): rows B.1 (a copy of row b) ... B.n, feeding row b and resultOtherSpecify
describe("1702Qv2018C Schedule 4 pop-up (Add)", () => {
  const DS = `${P}sched4:Description`;
  const AS = `${P}sched4:Amount`;
  const D = (i: number) => `${DS}${i}`;
  const A = (i: number) => `${P}sched4:Amount${i}`;
  const rowB = (desc: string, amount: string): FormState => v({ "Sched4:txtOthrTxCrdts1": desc, "Sched4:txtOthrTxCrdtAmnt1": amount });
  const more: GroupState = { sched4more: [{ [DS]: "OLD", [AS]: "10.00" }, { [DS]: "TCC", [AS]: "100.60" }] };
  const ctx: FormState = { ...rcit, ...rowB("OLD", "10.00") };
  it("2+ rows: row b reads VARIOUS and the sum of each row rounded to whole pesos; credits follow", () => {
    const o = computeForm(FORM_1702Qv2018C, ctx, more);
    expect(o[`${P}Sched4:txtOthrTxCrdts1`]).toBe("VARIOUS");
    expect(o[`${P}Sched4:txtOthrTxCrdtAmnt1`]).toBe("111.00"); // 10 + round(100.60)
    expect(o.resultOtherSpecify).toBe("111.00");
    const base = computeForm(FORM_1702Qv2018C, ctx, {});
    // item 4 credits: row b was 10 whole pesos before, 111 after
    expect(parseMoney(o[`${P}Sched4:txtTax7`] ?? "") - parseMoney(base[`${P}Sched4:txtTax7`] ?? "")).toBe(10100);
    expect(o[`${P}txtTax19`]).toBe(o[`${P}Sched4:txtTax7`]);
  });
  it("1 row: row b keeps its description, its amount is the row rounded", () => {
    const o = computeForm(FORM_1702Qv2018C, ctx, { sched4more: [{ [DS]: "OLD", [AS]: "10.60" }] });
    expect(o[`${P}Sched4:txtOthrTxCrdts1`]).toBe("OLD");
    expect(o[`${P}Sched4:txtOthrTxCrdtAmnt1`]).toBe("11.00");
  });
  it("no ATC: the schedule is disabled, so row b is blank whatever the pop-up holds", () => {
    const o = computeForm(FORM_1702Qv2018C, { ...ctx, [`${P}cbATC_2`]: "" }, more);
    expect(o[`${P}Sched4:txtOthrTxCrdts1`]).toBe("");
    expect(o[`${P}Sched4:txtOthrTxCrdtAmnt1`]).toBe("0.00");
  });
  it("saves the rows under BIR's ids, and a reopened file drops them (BIR never rebuilds them)", () => {
    const record = formRecords(FORM_1702Qv2018C, ctx, more);
    const at = (key: string) => record.find((r) => r.key === key)?.value;
    expect(at(D(1))).toBe("TCC");
    expect(at(A(0))).toBe("10.00");
    expect(at("resultOtherSpecify")).toBe("111.00");
    expect(at(`${P}Sched4:txtOthrTxCrdts1`)).toBe("VARIOUS");
    expect(groupsFromSavefile(FORM_1702Qv2018C, { record, trailer_year: 2014, is_final_copy: false }, "1702Qv2018C").sched4more).toBeUndefined();
    expect(formRecords(FORM_1702Qv2018C, ctx).some((r) => r.key === D(0))).toBe(false); // no pop-up, no rows
  });
});

describe.skipIf(!hasForm("1702Qv2018C"))("native 1702Qv2018C Schedule 4 pop-up matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  const identity: FormState = v({
    txtTIN1: "846", txtTIN2: "532", txtTIN3: "107", txtBranchCode: "00000", txtRDOCode: "043", txtTaxpayerName1: "ABC TRADING CORP.",
    txtAddress: "1 RIZAL ST., QUEZON CITY", txtZipCode: "1100", txtTelNum: "0281234567", txtLOB: "RETAIL",
  });
  const DS = `${P}sched4:Description`;
  const AS = `${P}sched4:Amount`;
  const D = (i: number) => `${DS}${i}`;
  const A = (i: number) => `${P}sched4:Amount${i}`;
  const state: FormState = { ...identity, ...rcit, ...v({ "Sched4:txtOthrTxCrdts1": "OLD", "Sched4:txtOthrTxCrdtAmnt1": "10.00" }) };
  const rows = [{ [DS]: "OLD", [AS]: "10.00" }, { [DS]: "TCC", [AS]: "100.60" }, { [DS]: "EXCESS", [AS]: "0.50" }];

  it("BIR's own pop-up flow (Add, Add Row x2, Save and Close) saves what the native group saves", async () => {
    const native = new Map(formRecords(FORM_1702Qv2018C, state, { sched4more: rows }).map((x) => [x.key, x.value]));
    const { page } = await oracle.openSaved(FORM_1702Qv2018C, state, "84653210700000-1702Qv2018C-2025Q2-pop.xml");
    const legacy: Array<[string, string]> = await page.evaluate(() => {
      const w = window as unknown as Record<string, (...a: unknown[]) => void>;
      const box = (id: string) => document.getElementById(id) as HTMLInputElement;
      w.addOtherTaxCredits!();
      w.addColSched4!();
      box("frm1702q:sched4:Description1").value = "TCC";
      box("frm1702q:sched4:Amount1").value = "100.60";
      w.computeOtherSpecify!();
      w.addColSched4!();
      box("frm1702q:sched4:Description2").value = "EXCESS";
      box("frm1702q:sched4:Amount2").value = "0.50";
      w.computeOtherSpecify!();
      w.closeModalSched4!();
      const form = document.getElementById("frmMain") as HTMLFormElement;
      return (Array.from(form.elements) as HTMLInputElement[]).filter((el) => el.id && el.type === "text" && /sched4|OtherSpecify|txtTax19$|txtTax20$|txtTax25$/i.test(el.id)).map((el) => [el.id, el.value] as [string, string]);
    });
    await page.close();
    for (const [key, value] of legacy) expect([key, native.get(key)]).toEqual([key, value]);
    expect(legacy.map(([k]) => k)).toEqual(expect.arrayContaining([A(2), `${P}Sched4:txtOthrTxCrdts1`, "resultOtherSpecify"]));
    expect(native.get("resultOtherSpecify")).toBe("112.00"); // 10 + 101 + 1: each row rounded half up
  }, 120_000);

  it("is 1:1 with BIR after a reload: item 4 credits and Part II follow the pop-up's total", async () => {
    // BIR never rebuilds the pop-up rows, so only what they fed is compared: the rows' own keys stay out
    const r = await parityCheck(oracle, FORM_1702Qv2018C, state, "84653210700000-1702Qv2018C-2025Q2-pop2.xml", { sched4more: rows });
    expect(parityProblem(r, [`${P}Sched1:txtTax13B`, ...rows.flatMap((_, i) => [D(i), A(i)])])).toEqual([]);
  }, 120_000);
});
