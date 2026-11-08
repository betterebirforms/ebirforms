import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_2000V2018, validate2000v2018 } from "@/form/form2000v2018.ts";
import { DST_ATC, NO_MODAL, rateText2000v2018, taxDue2000v2018, taxFloat, type DstModal } from "@/form/dst.ts";
import { formatMoney, parseMoney } from "@/form/money.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
import { allPageParityCheck } from "./parity-page.ts";

const P = "frm2000:";
const S1 = `${P}sched1:`;
const due = (code: string, base: string, rate = rateText2000v2018(code), modal: DstModal = NO_MODAL) => {
  const r = taxDue2000v2018(code, parseMoney(base), rate, modal);
  return r.tax_due === null ? null : formatMoney(r.tax_due);
};

describe("2000v2018 rate engine (computeSched1TaxDue, case for case)", () => {
  it("reads BIR's own DST list: 28 records containing \"2000^\", DS112 twice, empty generic-engine slots", () => {
    expect(DST_ATC).toHaveLength(28);
    expect(DST_ATC.filter((a) => a.atc_code === "DS112").map((a) => a.format_rate)).toEqual(["P1.00/P200", "P0.40/P200"]);
    // base / compType / constTaxDue / minimum / maximum are empty in BIR's XML, so the per-code switch is the engine
    expect(DST_ATC.every((a) => !a.base && !a.comp_type && !a.const_tax_due && !a.minimum && !a.maximum)).toBe(true);
  });
  it("per-P200 / per-P4 rates are BIR's float product rounded by toFixed(2)", () => {
    expect(due("DS101", "100,000.00")).toBe("1,000.00"); // P2.00/P200
    expect(due("DS102", "12,345.67")).toBe("92.59"); // 61.728… × 1.50
    expect(due("DS104", "1,000.00")).toBe("5.00");
    expect(due("DS107", "33,333.33")).toBe("100.00"); // ×0.60/200
    expect(due("DS126", "1,000.00")).toBe("3.00");
    expect(due("DS110", "1,001.00")).toBe("125.13"); // (1001/4)×0.50 = 125.125 → toFixed → 125.13
    expect(due("DS113", "10.00")).toBe("0.75");
    expect(due("DS116", "1,234.56")).toBe("246.91");
    expect(taxFloat(1.005)).toBe(100); // toFixed(2) of the double nearest 1.005 is "1.00", not "1.01"
  });
  it("percentages and per-piece counts", () => {
    expect(due("DS103", "1,000.00")).toBe("750.00"); // 75%
    expect(due("DS124", "1,000.00")).toBe("150.00"); // 15%
    expect(due("DS105", "7.00")).toBe("21.00"); // P3 per check
    expect(due("DS114", "3.00")).toBe("90.00");
    expect(due("DS118", "2.00")).toBe("60.00");
    expect(due("DS119", "2.00")).toBe("20.00");
  });
  it("tiered constants (min/max brackets): DS109, DS115, DS117", () => {
    expect(due("DS109", "100,000.00")).toBe("0.00");
    expect(due("DS109", "100,000.01")).toBe("20.00");
    expect(due("DS109", "500,000.00")).toBe("50.00");
    expect(due("DS109", "750,000.00")).toBe("100.00");
    expect(due("DS109", "1,000,000.00")).toBe("150.00");
    expect(due("DS109", "1,000,000.01")).toBe("200.00");
    expect(due("DS115", "200.00")).toBe("0.00");
    expect(due("DS115", "200.01")).toBe("30.00");
    expect(due("DS117", "99.99")).toBe("0.00");
    expect(due("DS117", "100.00")).toBe("2.00");
    expect(due("DS117", "1,000.01")).toBe("20.00");
  });
  it("constant-plus-excess: DS120 (P6 + P2/P1000) and DS121 (P40 + P20/P5000), prorated, not stepped", () => {
    expect(due("DS120", "0.50")).toBe("0.00"); // below the P1 minimum
    expect(due("DS120", "2,000.00")).toBe("6.00");
    expect(due("DS120", "2,500.00")).toBe("7.00"); // 6 + 0.5 × 2
    expect(due("DS121", "5,000.00")).toBe("40.00");
    expect(due("DS121", "7,500.00")).toBe("50.00");
  });
  it("DS106: P1.50/P200, prorated by days ÷ 365 when the pop-up says the term is under a year", () => {
    expect(due("DS106", "200,000.00")).toBe("1,500.00");
    const shortTerm = { ...NO_MODAL, ds106_short_term: true, day_count: "90" };
    expect(due("DS106", "200,000.00", undefined, shortTerm)).toBe("369.86"); // 1500 × 90/365
    expect(rateText2000v2018("DS106", false, shortTerm)).toBe("P1.5/200 * 90/365 days");
  });
  it("charters DS130–DS132: constant for ≤ 6 months, + step per month beyond; range checks reset the base", () => {
    const months = (n: string): DstModal => ({ ...NO_MODAL, month_count_130: n, month_count_131: n, month_count_132: n });
    expect(due("DS130", "500.00", undefined, months("6"))).toBe("1,000.00");
    expect(due("DS130", "500.00", undefined, months("9"))).toBe("1,300.00");
    expect(due("DS130", "0.00")).toBe("0.00");
    expect(taxDue2000v2018("DS130", 100_001, "", months("9"))).toEqual({ tax_due: null, tax_base: 0 }); // > 1,000 tons
    expect(due("DS131", "5,000.00", undefined, months("8"))).toBe("2,400.00");
    expect(taxDue2000v2018("DS131", 50_000, "", months("8"))).toMatchObject({ tax_due: null, tax_base: 0 }); // < 1,001
    expect(taxDue2000v2018("DS131", 500_000, "", NO_MODAL).rate_text).toBe("1ST 6 MONTHS P2,000 IN EXCESS + P200");
    expect(due("DS132", "20,000.00", undefined, months("12"))).toBe("4,800.00");
    expect(due("DS130", "500.00", undefined, months(""))).toBe("0.00"); // an emptied box: parseInt("") is NaN → "0.00"
  });
  it("DS112 is told apart by the row's rate text; DS010 is typed; DS125 throws in BIR", () => {
    expect(due("DS112", "20,000.00", "P1.00/P200")).toBe("100.00");
    expect(due("DS112", "20,000.00", rateText2000v2018("DS112", true))).toBe("40.00");
    expect(due("DS112", "20,000.00", "")).toBeNull();
    expect(due("DS010", "20,000.00")).toBeNull();
    expect(taxDue2000v2018("DS125", 100_000, "")).toEqual({ tax_due: null, is_error: true });
    expect(rateText2000v2018("DS010")).toBe("");
    expect(rateText2000v2018("DS109")).toBe("Exempt, P20, P50, P100, P150, P200");
    expect(rateText2000v2018("DS130")).toBe("1ST 6 MONTHS P,1000 IN EXCESS + P100"); // BIR's typo
  });
});

const state: FormState = {
  [`${P}txtMonth`]: "05",
  [`${P}txtYear`]: "2024",
  [`${P}AmendedRtn_1`]: "true",
  [`${P}txtTIN1`]: "846",
  [`${P}txtTIN2`]: "532",
  [`${P}txtTIN3`]: "107",
  [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043",
  [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
  [`${P}txtAddress`]: "1 Rizal St., Quezon City",
  [`${P}txtZipCode`]: "1100",
  [`${P}txtTelNum`]: "0281234567",
  [`${P}txtLineBus`]: "Lending",
  [`${P}optParty_1`]: "true",
  [`${P}txtOtherName`]: "Santos, Maria",
  [`${P}txtOtherTIN`]: "123456789",
  [`${P}optMode_2`]: "true",
  [`${P}txtTax15A`]: "100.00",
  [`${P}txtTax17A`]: "250.00",
  [`${P}txtTax17B`]: "33.33",
  [`${P}txtTax17C`]: "1,000.00",
  ds106modYes: "true",
  [`${P}numOfDays`]: "120",
  [`${P}numOfMonths`]: "9",
  [`${P}numOfMonths131`]: "4",
  [`${P}numOfMonths132`]: "13",
};
const s1 = (code: string, base: string, extra: Record<string, string> = {}) => ({ drpATCCode: code, [`${S1}txtTaxBase`]: base, ...extra });
const groups: GroupState = {
  sched1: [
    s1("DS101", "1,234,567.89"),
    s1("DS102", "12,345.67"),
    s1("DS106", "500,000.00"), // prorated 120/365 by the pop-up answer
    s1("DS109", "650,000.00"),
    s1("DS112", "20,000.00", { [`${S1}txtTaxRate`]: "P0.40/P200" }), // pre-need entry
    s1("DS117", "1,500.00"),
    s1("DS120", "12,345.00"),
    s1("DS121", "17,777.77"),
    s1("DS130", "800.00"),
    s1("DS131", "5,000.00"),
    s1("DS132", "50,000.00"),
    s1("DS010", "9,999.00", { [`${S1}txtTaxDue`]: "77.77" }), // general: typed
    s1("DS110", "1,001.00"),
  ],
  sched2: [
    { [`${P}sched2:txtPaymentDate`]: "05/02/2024", [`${P}sched2:txtReceipt`]: "or-1001", [`${P}sched2:txtAmountPaid`]: "500.00" },
    { [`${P}sched2:txtPaymentDate`]: "05/20/2024", [`${P}sched2:txtReceipt`]: "OR-1002", [`${P}sched2:txtAmountPaid`]: "1,250.50" },
  ],
  // mode 2 disables Schedule 3: BIR blanks these rows on the reload
  sched3: [{ [`${P}sched3:txtPaymentDate`]: "05/03/2024", [`${P}sched3:txtReceipt`]: "EDST-1", [`${P}sched3:txtAmountPaid`]: "999.00" }],
  sched4: [
    {
      [`${P}sched4:txtRCOCode`]: "rco-7", [`${P}sched4:txtRemittanceDate`]: "05/31/2024", [`${P}sched4:txtBank`]: "LBP",
      [`${P}sched4:txtAmountRemitted`]: "3,000.00", [`${P}sched4:txtNumberFrom`]: "1001", [`${P}sched4:txtNumberTo`]: "1100",
    },
  ],
};

describe("2000v2018 form (schedules → items 14–19)", () => {
  it("Schedule 1 → 14; Schedules 2/4 live for mode 2, Schedule 3 blanked; 16 = max(14 − (15A+15B), 0); 18 = 16 + 17D", () => {
    const o = computeForm(FORM_2000V2018, state, groups);
    expect(o[`${P}txtTax14`]).toBe("22,551.85");
    expect(o[`${P}txtTax15B`]).toBe("1,750.50");
    expect(o[`${P}txtTax15C`]).toBe("0.00");
    expect(o[`${P}txtTax15D`]).toBe("1,850.50");
    expect(o[`${P}txtTax16`]).toBe("20,701.35");
    expect(o[`${P}txtTax17D`]).toBe("1,283.33");
    expect(o[`${P}txtTax18`]).toBe("21,984.68");
    expect(o[`${P}txtTax19`]).toBe("3,000.00");
  });
  it("modes 1 / 3: item 16 is −|14 − 15D| (BIR negates a positive difference)", () => {
    const o = computeForm(FORM_2000V2018, { ...state, [`${P}optMode_2`]: "false", [`${P}optMode_1`]: "true" }, groups);
    expect(o[`${P}txtTax15B`]).toBe("0.00");
    expect(o[`${P}txtTax15C`]).toBe("999.00");
    expect(o[`${P}txtTax16`]).toBe("-21,452.85"); // 22,551.85 − 100 − 0 − 999, negated
    expect(o[`${P}txtTax19`]).toBe("0.00"); // Schedule 4 needs mode 2 or 3
  });
  it("saves BIR's row format: rate text from the ATC, upper-cased by capital(), disabled schedules blanked", () => {
    const record = new Map(formRecords(FORM_2000V2018, state, groups).map((r) => [r.key, r.value]));
    expect(record.get(`${S1}txtTaxRate0`)).toBe("P2.00/P200");
    expect(record.get(`${S1}txtTaxRate2`)).toBe("P1.5/200 * 120/365 DAYS");
    expect(record.get(`${S1}txtTaxRate9`)).toBe("1ST 6 MONTHS P2,000 IN EXCESS + P200");
    expect(record.get(`${S1}txtTaxDue11`)).toBe("77.77");
    expect(record.get("chkSchedule1Delete12")).toBe("false");
    expect(record.get(`${P}sched2:txtReceipt0`)).toBe("OR-1001");
    expect(record.get(`${P}sched3:txtAmountPaid0`)).toBe("0.00");
    expect(record.get(`${P}sched3:txtReceipt0`)).toBe("");
    expect(record.get(`${P}txtOtherName`)).toBe("SANTOS%2C%20MARIA");
    expect(record.get(`${P}txtPg2TaxpayerName`)).toBe("DELA CRUZ, JUAN");
    expect(record.get(`${P}modLabel`)).toBe("IS THE DURATION OF THE CHARTER/CONTRACT IS 6 MONTHS OR LESS?            ");
  });
  it("validates BIR's checks (party, mode, schedule dates, ATC ranges)", () => {
    const problem = validate2000v2018({ ...state, [`${P}optParty_1`]: "false", [`${P}optMode_2`]: "false" }, { sched1: [s1("DS130", "5,000.00"), s1("DS125", "1.00")] });
    const id = problem.map((p) => p.id);
    expect(id).toEqual(expect.arrayContaining([`${P}optParty_1`, `${P}optMode_1`, `${S1}txtTaxBase0`, "drpATCCode1"]));
    expect(validate2000v2018(state, groups)).toEqual([]);
  });
});

describe.skipIf(!hasForm("2000v2018"))("native 2000v2018 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("BIR's own computeSched1TaxDue agrees with the native engine on every code across bracket edges", async () => {
    const { page, error } = await oracle.openSaved(FORM_2000V2018, { [`${P}txtTIN1`]: "846" }, "84653210700000-2000v2018-sweep.xml");
    const base = ["0.00", "0.01", "1.00", "1.005", "99.99", "100.00", "200.00", "200.01", "333.33", "1,000.00", "1,000.01", "1,001.00", "2,000.00", "2,000.01", "2,345.67", "5,000.00", "5,000.01", "9,999.99", "10,000.00", "10,001.00", "100,000.00", "100,000.01", "300,000.00", "500,000.01", "750,000.00", "1,000,000.00", "1,000,000.01", "987,654.32"];
    const modal: DstModal[] = [
      NO_MODAL,
      { ds106_short_term: true, day_count: "45", ds130_short_term: true, month_count_130: "11", month_count_131: "7", month_count_132: "20" },
    ];
    const code = ["DS010", ...new Set(DST_ATC.map((a) => a.atc_code))].filter((c) => c !== "DS125");
    const want: Array<{ code: string; pre_need: boolean; base: string; modal: DstModal }> = [];
    for (const c of code) for (const b of base) for (const md of modal) for (const pre_need of c === "DS112" ? [false, true] : [false]) want.push({ code: c, pre_need, base: b, modal: md });
    const got = await page.evaluate((want) => {
      const d = document;
      const el = (id: string) => d.getElementById(id) as HTMLInputElement & HTMLSelectElement;
      const w = window as unknown as Record<string, (i: number) => void>;
      return want.map(({ code, pre_need, base, modal }) => {
        const sel = el("drpATCCode0");
        sel.value = code;
        if (pre_need) sel.selectedIndex = Array.from(sel.options).findLastIndex((o) => o.value === "DS112");
        w.getATCdrpTaxRate!(0);
        const rate = el("frm2000:sched1:txtTaxRate0").value;
        el("ds106modYes").checked = modal.ds106_short_term;
        el("frm2000:numOfDays").value = modal.day_count;
        el("frm2000:numOfMonths").value = modal.month_count_130;
        el("frm2000:numOfMonths131").value = modal.month_count_131;
        el("frm2000:numOfMonths132").value = modal.month_count_132;
        el("frm2000:sched1:txtTaxBase0").value = base;
        el("frm2000:sched1:txtTaxDue0").value = "9.99"; // sentinel: what BIR leaves untouched
        (window as unknown as { round: (e: HTMLInputElement, n: number) => void }).round(el("frm2000:sched1:txtTaxBase0"), 2);
        w.computeSched1TaxDue!(0);
        return { rate, rate_after: el("frm2000:sched1:txtTaxRate0").value, base: el("frm2000:sched1:txtTaxBase0").value, due: el("frm2000:sched1:txtTaxDue0").value };
      });
    }, want);
    await page.close();
    const mismatch: string[] = [];
    want.forEach((c, k) => {
      const rate = rateText2000v2018(c.code, c.pre_need);
      const n = taxDue2000v2018(c.code, parseMoney(c.base), rate, c.modal);
      const native = { rate, rate_after: n.rate_text ?? rate, base: formatMoney(n.tax_base ?? parseMoney(c.base)), due: n.tax_due === null ? "9.99" : formatMoney(n.tax_due) };
      // getATCdrpTaxRate writes the record text; newRate's pop-ups (not driven here) rewrite DS130–132 afterwards
      const bir = got[k]!;
      const birRate = ["DS130", "DS131", "DS132"].includes(c.code) ? native.rate : bir.rate;
      if (birRate !== native.rate || bir.due !== native.due || bir.base !== native.base || (c.code === "DS131" && parseMoney(c.base) > 0 && bir.rate_after !== native.rate_after))
        mismatch.push(`${c.code}${c.pre_need ? "(pre-need)" : ""} base ${c.base} ${JSON.stringify(c.modal)}: BIR ${JSON.stringify(bir)} vs native ${JSON.stringify(native)}`);
    });
    expect(mismatch).toEqual([]);
    expect(want.length).toBeGreaterThan(1500);
    expect(error).toEqual([]);
  }, 180_000);

  it("BIR's DS125 case throws (the stray `S`), leaving the tax due untouched", async () => {
    const { page } = await oracle.openSaved(FORM_2000V2018, { [`${P}txtTIN1`]: "846" }, "84653210700000-2000v2018-ds125.xml");
    const message = await page.evaluate(() => {
      const el = (id: string) => document.getElementById(id) as HTMLInputElement;
      (el("drpATCCode0") as unknown as HTMLSelectElement).value = "DS125";
      el("frm2000:sched1:txtTaxBase0").value = "1,000.00";
      try {
        (window as unknown as { computeSched1TaxDue: (i: number) => void }).computeSched1TaxDue(0);
        return `no error, due ${el("frm2000:sched1:txtTaxDue0").value}`;
      } catch (e) {
        return `${(e as Error).name}: due ${el("frm2000:sched1:txtTaxDue0").value}`;
      }
    });
    await page.close();
    expect(message).toBe("ReferenceError: due 0.00");
  }, 120_000);

  const mode1: FormState = { ...state, [`${P}optMode_2`]: "false", [`${P}optMode_1`]: "true", [`${P}optParty_1`]: "false", [`${P}optParty_3`]: "true", [`${P}txtOtherName`]: "", [`${P}txtOtherTIN`]: "" };
  const mode3: FormState = { ...state, [`${P}optMode_2`]: "false", [`${P}optMode_3`]: "true", [`${P}AmendedRtn_1`]: "false", [`${P}AmendedRtn_2`]: "true", [`${P}txtTax15A`]: "0.00" };
  /** Keys BIR's OWN reload mangles, so a reopen differs from the save (native keeps BIR's save format):
   *  • frm2000:modLabel — four pop-up label inputs share this id and loadData fills all four from the FIRST saved one.
   *  • a Schedule 1 rate text containing "=" (DS117 / DS120 / DS121) — loadSchedule1 reads each row with
   *    `split('=')[1]`, truncating the text at its first "=" ("P100 TO P1000 = P2.0 …" reopens as "P100 TO P1000 ").
   *  • a mode-3 return's Schedule 4 and item 19 — processModeAffixture runs disableSchedule4 (mode 2 is unchecked),
   *    which blanks the rows and zeroes 19, BEFORE enableSchedule4 for mode 3, so every reopen wipes them. */
  const reloadBug = (s: FormState, g: GroupState): string[] => {
    const record = formRecords(FORM_2000V2018, s, g);
    const isMode3 = s[`${P}optMode_3`] === "true";
    return [
      `${P}modLabel`,
      ...record.filter((r) => r.key.startsWith(`${S1}txtTaxRate`) && r.value.includes("=")).map((r) => r.key),
      ...(isMode3 ? [`${P}txtTax19`, ...record.filter((r) => r.key.startsWith(`${P}sched4:`)).map((r) => r.key)] : []),
    ];
  };

  it("is 1:1 with populated schedules (parityCheck), modes 2, 1 and 3", async () => {
    for (const [s, name] of [[state, "a"], [mode1, "b"], [mode3, "c"]] as const) {
      const r = await parityCheck(oracle, FORM_2000V2018, s, `84653210700000-2000v2018-0520${name}.xml`, groups);
      expect(parityProblem(r, reloadBug(s, groups))).toEqual([]);
      expect(r.key_count).toBeGreaterThan(180);
    }
  }, 180_000);

  it("is 1:1 with page 2 shown too, so BIR re-blurs and recomputes every schedule row", async () => {
    for (const [s, name] of [[state, "a"], [mode1, "b"], [mode3, "c"]] as const) {
      const r = await allPageParityCheck(oracle, FORM_2000V2018, s, `84653210700000-2000v2018-0521${name}.xml`, groups);
      expect(parityProblem(r, reloadBug(s, groups))).toEqual([]);
    }
  }, 180_000);
});
