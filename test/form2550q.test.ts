import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_2550Q, pickIndex2550Q, pickList2550Q, ratable, standardInputTax, validate2550Q, x12 } from "@/form/form2550q.ts";
import { parseMoney } from "@/form/money.ts";
import { legacyUnescape } from "@/lib/savefile.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm2550q:";
const state: FormState = {
  [`${P}optAmend:_1`]: "true",
  [`${P}RtnMonth`]: "12",
  [`${P}txtYear`]: "2023",
  [`${P}OptQuarter2`]: "true",
  [`${P}AmendedRtnY`]: "true",
  [`${P}OptShortPrd2`]: "true",
  [`${P}txtTIN1`]: "846",
  [`${P}txtTIN2`]: "532",
  [`${P}txtTIN3`]: "107",
  [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043",
  [`${P}TaxPayer`]: "DELA CRUZ, JUAN",
  [`${P}txtLineBus`]: "RETAIL",
  [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}OptTreaty2`]: "true",
  [`${P}txtTax16A`]: "250,000.00",
  [`${P}txtTax17`]: "30,000.00",
  [`${P}txtTax18`]: "120,000.00",
  [`${P}txtTax20A`]: "4,000.00",
  [`${P}txtTax20B`]: "1,000.00",
  [`${P}txtTax20C`]: "500.00",
  [`${P}txtTax20D`]: "250.00",
  [`${P}txtTax20E`]: "100.00",
  [`${P}txtTax21E`]: "300,000.05",
  [`${P}txtTax21G`]: "80,000.00",
  [`${P}txtTax21I`]: "40,000.00",
  [`${P}txtTax21K`]: "20,000.00",
  [`${P}txtTax21M`]: "15,000.00",
  [`${P}txtTax21N`]: "5,000.00",
  [`${P}txtTax23D`]: "300.00",
  [`${P}txtTax23E`]: "200.00",
  [`${P}txtTax26A`]: "2,000.00",
  [`${P}txtTax26E`]: "750.00",
  [`${P}txtTax26F`]: "150.00",
  [`${P}txtTax26G`]: "50.00",
  [`${P}txtTax28A`]: "500.00",
  [`${P}txtTax28B`]: "123.45",
  [`${P}txtTax28C`]: "1,000.00",
  txtinputtaxSched4: "3,000.00",
  txtInputTaxnotDirectSched4: "9,999.99",
  txtinputtaxSched5: "1,500.00",
  txtAmountInputnotDirectSched5: "7,777.77",
};
const atc = (code: string, sales: string) => ({ [`${P}txtAtcCde`]: code, [`${P}txtAmountSales`]: sales });
const groups: GroupState = {
  // pick-list order (VB010 = AtcCode1, VB100 = 2, VS010 = 33)
  atc: [atc("VB010", "1,000,000.00"), atc("VB100", "234,567.89"), atc("VS010", "55,555.55")],
  sched2: [
    { txtDatePurchased: "04/10/2023", txtDescription: "LAPTOPS", txtAmt: "400,000.00" },
    { txtDatePurchased: "05/20/2023", txtDescription: "AIRCON UNITS", txtAmt: "150,000.03" },
  ],
  sched3A: [
    {
      txtDatePurchased3A: "06/01/2023", txtDescription3A: "TRUCK", txtAmt3A: "2,000,000.00", txtEstLife3A: "60", txtRecogLife3A: "60",
      txtAllowInputTax3A: "4,000.00",
    },
  ],
  sched3B: [
    {
      txtDatePurchased3B: "01/15/2023", txtDescription3B: "GENERATOR", txtAmt3B: "1,500,000.00", txtBalInputTaxPrevious3B: "170,000.00",
      txtEstLife3B: "60", txtRecogLife3B: "57", txtAllowInputTax3B: "3,000.00",
    },
  ],
  sched6: [
    { txtPeriodCovered: "06/30/2023", txtNameAgent: "ACME CORP", txtIncomePayment: "100,000.00", txtTotalWithheld: "5,000.00", txtPrevious2Mo: "1,000.00", txtAppliedCurr: "4,000.00" },
  ],
  sched7: [
    {
      txtPeriodCoveredSch7: "05/31/2023", txtNameMillerSch7: "VICTORIAS MILLING", txtNameTaxPayerSch7: "DELA CRUZ", txtORNumSch7: "OR123",
      txtAmountPaidSch7: "2,500.00", txtPrevious2MoSch7: "500.00", txtAppliedCurrSch7: "2,000.00",
    },
  ],
  sched8: [
    {
      txtPeriodCoveredSch8: "06/15/2023", txtNameAgentSch8: "CITY OF MANILA", txtIncomePaymentSch8: "250,000.00", txtTotalWithheldSch8: "12,500.00",
      txtPrevious2MoSch8: "2,500.00", txtAppliedCurrSch8: "10,000.00",
    },
  ],
};

describe("2550Q compute (Schedule 1 ATC sales, input-tax schedules, output − input chain)", () => {
  const o = computeForm(FORM_2550Q, state, groups);
  const n = (item: string) => o[`${P}txtTax${item}`];

  it("Schedule 1 → 15A/15B (12% per row, BIR float rounding); 16B; 19A/19B", () => {
    expect(x12(parseMoney("234,567.89"))).toBe(2_814_815); // 28,148.1468 → 28,148.15
    expect(n("15A")).toBe("1,290,123.44");
    expect(n("15B")).toBe("154,814.82"); // 120,000 + 28,148.15 + 6,666.67
    expect(n("16B")).toBe("30,000.00");
    expect(n("19A")).toBe("1,690,123.44");
    expect(n("19B")).toBe("184,814.82");
  });

  it("purchases: 20F, 21A–D (Schedules 2/3A), 21F/H/J/L/O = 12%, 21P, 22", () => {
    expect(n("20F")).toBe("5,850.00");
    expect(n("21A")).toBe("550,000.03");
    expect(n("21B")).toBe("66,000.00"); // 48,000 + 18,000.0036
    expect(n("21C")).toBe("2,000,000.00");
    expect(n("21D")).toBe("240,000.00");
    expect(n("21F")).toBe("36,000.01"); // 300,000.05 × 12% = 36,000.006
    expect(n("21O")).toBe("600.00");
    expect(n("21P")).toBe("3,010,000.08");
    expect(n("22")).toBe("365,250.01"); // 5,850 + 66,000 + 240,000 + 36,000.01 + 9,600 + 4,800 + 2,400 + 600
  });

  it("deductions: 23A (Schedule 3 balances), 23B (Schedule 4), 23C (Schedule 5), 23F; 24; 25", () => {
    expect(o.txtmodalTotalBalanceSched3A).toBe("236,000.00");
    expect(o.txtmodalTotalBalanceSched3B).toBe("167,000.00");
    expect(n("23A")).toBe("403,000.00");
    expect(standardInputTax(25_000_000)).toBe(1_750_000);
    expect(o.txtlessStdTaxSched4).toBe("17,500.00");
    expect(parseMoney(o.txtTotalInputTaxnotDirectSched4!)).toBe(ratable(25_000_000, 169_012_344, 999_999));
    expect(n("23B")).toBe(o.txtTotal20BSched4);
    expect(parseMoney(n("23B")!)).toBe(300_000 + ratable(25_000_000, 169_012_344, 999_999) - 1_750_000);
    expect(parseMoney(n("23C")!)).toBe(150_000 + ratable(12_000_000, 169_012_344, 777_777));
    // an untouched Schedule 4 leaves 23B at 0 (BIR sets it only from the Schedule 4 OK button)
    const untouched = computeForm(FORM_2550Q, { ...state, txtinputtaxSched4: "0.00", txtInputTaxnotDirectSched4: "0.00" }, groups);
    expect(untouched[`${P}txtTax23B`]).toBe("0.00");
    expect(untouched.txtTotal20BSched4).toBe("0.00");
    expect(untouched.txtlessStdTaxSched4).toBe("17,500.00");
    expect(parseMoney(n("24")!)).toBe(parseMoney(n("22")!) - parseMoney(n("23F")!));
    expect(parseMoney(n("25")!)).toBe(parseMoney(n("19B")!) - parseMoney(n("24")!));
  });

  it("credits 26B–D (applied + prior two months), 26E (amended only), 26H, 27, 28D, 29", () => {
    expect(n("26B")).toBe("5,000.00");
    expect(n("26C")).toBe("2,500.00");
    expect(n("26D")).toBe("12,500.00");
    expect(n("26E")).toBe("750.00");
    expect(n("26H")).toBe("22,950.00");
    expect(n("28D")).toBe("1,623.45");
    expect(parseMoney(n("29")!)).toBe(parseMoney(n("25")!) - 2_295_000 + 162_345);
    const notAmended = computeForm(FORM_2550Q, { ...state, [`${P}AmendedRtnY`]: "false", [`${P}AmendedRtnN`]: "true" }, groups);
    expect(notAmended[`${P}txtTax26E`]).toBe("0.00");
    expect(notAmended[`${P}txtTax26H`]).toBe("22,200.00");
  });

  it("emits the ATC picker boxes and the schedules' row checkboxes", () => {
    expect(pickList2550Q()).toHaveLength(43);
    expect(pickIndex2550Q(groups)).toEqual([0, 1, 32]);
    const rec = formRecords(FORM_2550Q, state, groups);
    expect(rec.filter((r) => r.key.startsWith("AtcCode") && r.value === "true").map((r) => r.key)).toEqual(["AtcCode1", "AtcCode2", "AtcCode33"]);
    const map = new Map(rec.map((r) => [r.key, r.value]));
    expect(map.get("chxSched21")).toBe("false");
    expect(map.get("chxSched80")).toBe("false");
    expect(map.get(`${P}txtOutputTax3`)).toBe("6,666.67");
  });

  it("flags rows out of BIR's ATC-list order, codes not on the list, and empty schedule rows", () => {
    expect(validate2550Q(state, groups)).toEqual([]);
    const bad = validate2550Q(state, { atc: [atc("VB100", "1.00"), atc("VB010", "1.00"), atc("ZZ999", "0.00")], sched2: [{ txtAmt: "2,000,000.00" }] });
    expect(bad.map((p) => p.id)).toEqual(expect.arrayContaining([`${P}txtAtcCde2`, `${P}txtAtcCde3`, `${P}txtAmountSales3`, "txtDatePurchased0", "txtAmt0"]));
  });
});

describe.skipIf(!hasForm("2550Q"))("native 2550Q matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("BIR rebuilds every schedule and its own compute functions reproduce every native value", async () => {
    const escaped = new Set(FORM_2550Q.field.filter((f) => f.escaped).map((f) => f.id));
    const native = new Map(formRecords(FORM_2550Q, state, groups).map((r) => [r.key, escaped.has(r.key) ? legacyUnescape(r.value) : r.value]));
    const { page, error } = await oracle.openSaved(FORM_2550Q, state, "84653210700000-2550Q-122023Q2.xml", groups);
    const legacy: Array<[string, string]> = await page.evaluate(() => {
      const w = window as unknown as Record<string, (...a: unknown[]) => void>;
      for (let x = 1; x <= 3; x++) w.getRequiredWithheld!(x);
      w.totalAmountandOutputTax!();
      w.getSched1Modal!();
      for (let i = 0; i < 2; i++) w.getInputTaxCompute!(i);
      w.getSched2Modal!();
      w.getInputTaxCompute3A!(0);
      w.computeSumTax3B!();
      w.getSched3Modal!();
      w.compute16B!();
      w.changedTxtTax16A!();
      for (const letter of ["E", "G", "I", "K", "N"]) w.compute21TransactionbyRow!(letter);
      w.compute20F!();
      w.compute21P!();
      w.valuesSched4and5!();
      w.computeInputTaxSched4!();
      w.getSched4Modal!();
      w.computeInputTaxSched5!();
      w.getSched5Modal!();
      for (const s of ["", "Sch7", "Sch8"]) w[`computeSumWithheldApp${s}`]!();
      for (const s of [6, 7, 8]) w[`getSched${s}Modal`]!();
      w.computePenalties!();
      const form = document.getElementById("frmMain") as HTMLFormElement;
      return (Array.from(form.elements) as HTMLInputElement[])
        .filter((el) => el.id && ["text", "select-one", "radio", "checkbox"].includes(el.type))
        .map((el) => [el.id, el.type === "radio" || el.type === "checkbox" ? String(el.checked) : el.value] as [string, string]);
    });
    await page.close();
    const money = /^-?[\d,]*\.\d\d$/;
    const diff: string[] = [];
    for (const [key, value] of new Map(legacy)) {
      const mine = native.get(key);
      if (mine === undefined) continue;
      const equal = money.test(mine) && money.test(value) ? parseMoney(mine) === parseMoney(value) : mine === value;
      if (!equal) diff.push(`${key}: native ${mine} vs BIR ${value}`);
    }
    expect(diff).toEqual([]);
    const got = new Map(legacy);
    expect(got.get(`${P}txtAtcCde3`)).toBe("VS010");
    expect(got.get("txtDescription1")).toBe("AIRCON UNITS");
    expect(got.get("txtNameAgentSch80")).toBe("CITY OF MANILA");
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with populated schedules (parityCheck)", async () => {
    const r = await parityCheck(oracle, FORM_2550Q, state, "84653210700000-2550Q-122023Q2.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count);
  }, 120_000);
});
