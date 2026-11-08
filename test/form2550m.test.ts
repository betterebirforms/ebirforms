import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_2550M, perLife, pickIndex2550M, pickList2550M, ratable, standardInputTax, validate2550M, x12 } from "@/form/form2550m.ts";
import { parseMoney } from "@/form/money.ts";
import { legacyUnescape } from "@/lib/savefile.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm2550m:";
const state: FormState = {
  [`${P}RtnYear`]: "05",
  [`${P}txtYear`]: "2023",
  [`${P}OptAmendedYN1`]: "true",
  [`${P}txtTIN1`]: "846",
  [`${P}txtTIN2`]: "532",
  [`${P}txtTIN3`]: "107",
  [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043",
  [`${P}txtTaxPayerName`]: "DELA CRUZ, JUAN",
  [`${P}txtLineBus`]: "RETAIL",
  [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}OptSpecialTax2`]: "true",
  [`${P}txtTax13A`]: "250,000.00",
  [`${P}txtTax14`]: "30,000.00",
  [`${P}txtTax15`]: "120,000.00",
  [`${P}txtTax17A`]: "4,000.00",
  [`${P}txtTax17B`]: "1,000.00",
  [`${P}txtTax17C`]: "500.00",
  [`${P}txtTax17D`]: "250.00",
  [`${P}txtTax17E`]: "100.00",
  [`${P}txtTax18E`]: "300,000.05",
  [`${P}txtTax18G`]: "80,000.00",
  [`${P}txtTax18I`]: "40,000.00",
  [`${P}txtTax18K`]: "20,000.00",
  [`${P}txtTax18M`]: "15,000.00",
  [`${P}txtTax18N`]: "5,000.00",
  [`${P}txtTax20D`]: "300.00",
  [`${P}txtTax20E`]: "200.00",
  [`${P}txtTax23D`]: "750.00",
  [`${P}txtTax23E`]: "150.00",
  [`${P}txtTax23F`]: "50.00",
  [`${P}txtTax25A`]: "500.00",
  [`${P}txtTax25B`]: "123.45",
  [`${P}txtTax25C`]: "1,000.00",
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
    { txtDatePurchased: "05/10/2023", txtDescription: "LAPTOPS", txtAmt: "400,000.00" },
    { txtDatePurchased: "05/20/2023", txtDescription: "AIRCON UNITS", txtAmt: "150,000.03" },
  ],
  sched3A: [{ txtDatePurchased3A: "05/01/2023", txtDescription3A: "TRUCK", txtAmt3A: "2,000,000.00", txtEstLife3A: "60", txtRecogLife3A: "60" }],
  sched3B: [
    { txtDatePurchased3B: "01/15/2023", txtDescription3B: "GENERATOR", txtAmt3B: "1,500,000.00", txtBalInputTaxPrevious3B: "170,000.00", txtEstLife3B: "60", txtRecogLife3B: "57" },
  ],
  sched6: [{ txtPeriodCovered: "05/31/2023", txtNameAgent: "ACME CORP", txtIncomePayment: "100,000.00", txtTotalWithheld: "5,000.00", txtAppliedCurr: "4,000.00" }],
  sched7: [
    { txtPeriodCoveredSch7: "05/31/2023", txtNameMillerSch7: "VICTORIAS MILLING", txtNameTaxPayerSch7: "DELA CRUZ", txtORNumSch7: "OR123", txtAmountPaidSch7: "2,500.00", txtAppliedCurrSch7: "2,000.00" },
  ],
  sched8: [{ txtPeriodCoveredSch8: "05/15/2023", txtNameAgentSch8: "CITY OF MANILA", txtIncomePaymentSch8: "250,000.00", txtTotalWithheldSch8: "12,500.00", txtAppliedCurrSch8: "10,000.00" }],
};

describe("2550M compute (Schedule 1 ATC sales, input-tax schedules, output − input chain)", () => {
  const o = computeForm(FORM_2550M, state, groups);
  const n = (item: string) => o[`${P}txtTax${item}`];

  it("Schedule 1 → 12A/12B; 13B; 16A/16B", () => {
    expect(o["frm2550M:txtmodaltxtTotal12A"]).toBe("1,290,123.44");
    expect(n("12B")).toBe("154,814.82"); // 120,000 + 28,148.15 + 6,666.67
    expect(n("13B")).toBe("30,000.00");
    expect(n("16A")).toBe("1,690,123.44");
    expect(n("16B")).toBe("184,814.82");
  });

  it("purchases: 17F, 18A–D (Schedules 2/3A), 18F/H/J/L/O = 12%, 18P, 19", () => {
    expect(n("17F")).toBe("5,850.00");
    expect(n("18A")).toBe("550,000.03");
    expect(n("18B")).toBe("66,000.00");
    expect(n("18C")).toBe("2,000,000.00");
    expect(n("18D")).toBe("240,000.00");
    expect(n("18F")).toBe("36,000.01");
    expect(n("18P")).toBe("3,010,000.08");
    expect(n("19")).toBe("365,250.01");
  });

  it("Schedule 3: BIR computes the allowable input tax ÷ recognized life → 20A", () => {
    expect(perLife(24_000_000, "60")).toBe(400_000);
    expect(perLife(17_000_000, "57")).toBe(298_246); // 2,982.4561 → 2,982.46
    expect(groups.sched3A && formRecords(FORM_2550M, state, groups).find((r) => r.key === "txtAllowInputTax3A0")?.value).toBe("4,000.00");
    expect(o.txtmodalTotalBalanceSched3A).toBe("236,000.00");
    expect(o.txtmodalTotalBalanceSched3B).toBe("167,017.54");
    expect(n("20A")).toBe("403,017.54");
  });

  it("deductions 20B (Schedule 4), 20C (Schedule 5), 20F; 21; 22", () => {
    expect(o.txtlessStdTaxSched4).toBe("17,500.00");
    expect(o.txtTaxableSaleSched4).toBe("250,000.00");
    expect(o.txtTotalSaleSched4).toBe("1,690,123.44");
    expect(parseMoney(n("20B")!)).toBe(300_000 + ratable(25_000_000, 169_012_344, 999_999) - standardInputTax(25_000_000));
    expect(parseMoney(n("20C")!)).toBe(150_000 + ratable(12_000_000, 169_012_344, 777_777));
    expect(parseMoney(n("21")!)).toBe(parseMoney(n("19")!) - parseMoney(n("20F")!));
    expect(parseMoney(n("22")!)).toBe(parseMoney(n("16B")!) - parseMoney(n("21")!));
    // untouched Schedules 4/5 keep BIR's blank copies and leave 20B/20C at 0
    const untouched = computeForm(FORM_2550M, { ...state, txtinputtaxSched4: "0.00", txtInputTaxnotDirectSched4: "0.00", txtinputtaxSched5: "0.00", txtAmountInputnotDirectSched5: "0.00" }, groups);
    expect(untouched[`${P}txtTax20B`]).toBe("0.00");
    expect(untouched[`${P}txtTax20C`]).toBe("0.00");
    expect(untouched.txtTaxableSaleSched4).toBe("0.00");
    expect(untouched.txtlessStdTaxSched4).toBe("17,500.00");
  });

  it("credits 23A–C (applied this month), 23D (amended only), 23G, 24, 25D, 26", () => {
    expect(n("23A")).toBe("4,000.00");
    expect(o.txtmodalTotal23A).toBe("5,000.00"); // Σ tax withheld (shown, not credited)
    expect(n("23B")).toBe("2,000.00");
    expect(n("23C")).toBe("10,000.00");
    expect(n("23G")).toBe("16,950.00");
    expect(n("25D")).toBe("1,623.45");
    expect(parseMoney(n("26")!)).toBe(parseMoney(n("22")!) - 1_695_000 + 162_345);
    const notAmended = computeForm(FORM_2550M, { ...state, [`${P}OptAmendedYN1`]: "false", [`${P}OptAmendedYN2`]: "true" }, groups);
    expect(notAmended[`${P}txtTax23D`]).toBe("0.00");
    expect(notAmended[`${P}txtTax23G`]).toBe("16,200.00");
  });

  it("emits the ATC picker boxes and the schedules' row checkboxes; validates", () => {
    expect(pickList2550M()).toHaveLength(36);
    expect(pickIndex2550M(groups)).toEqual([0, 1, 32]);
    const rec = formRecords(FORM_2550M, state, groups);
    expect(rec.filter((r) => r.key.startsWith("AtcCode") && r.value === "true").map((r) => r.key)).toEqual(["AtcCode1", "AtcCode2", "AtcCode33"]);
    expect(new Map(rec.map((r) => [r.key, r.value])).get("chxSched3B0")).toBe("false");
    expect(validate2550M(state, groups)).toEqual([]);
    const bad = validate2550M(state, { atc: [atc("VS010", "1.00"), atc("VB010", "1.00")], sched2: [{ txtAmt: "2,000,000.00" }], sched3A: [{ txtRecogLife3A: "0" }] });
    expect(bad.map((p) => p.id)).toEqual(expect.arrayContaining([`${P}txtAtcCde2`, "txtDatePurchased0", "txtAmt0", "txtmodalTotalAmt", "txtRecogLife3A0"]));
  });
});

describe.skipIf(!hasForm("2550M"))("native 2550M matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("BIR rebuilds every schedule and its own compute functions reproduce every native value", async () => {
    const escaped = new Set(FORM_2550M.field.filter((f) => f.escaped).map((f) => f.id));
    const native = new Map(formRecords(FORM_2550M, state, groups).map((r) => [r.key, escaped.has(r.key) ? legacyUnescape(r.value) : r.value]));
    const { page, error } = await oracle.openSaved(FORM_2550M, state, "84653210700000-2550M-052023.xml", groups);
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
      w.compute13B!();
      w.compute16A!();
      w.changedTxtTax13A!();
      for (const letter of ["E", "G", "I", "K", "N"]) w.compute18TransactionbyRow!(letter);
      w.compute17F!();
      w.compute18P!();
      // showSched4/5 copy the sales figures in before computing (their modal never opens here)
      const el = (id: string) => document.getElementById(id) as HTMLInputElement;
      el("txtTaxableSaleSched4").value = el("frm2550m:txtTax13A").value;
      el("txtTotalSaleSched4").value = el("frm2550m:txtTax16A").value;
      w.computeInputTaxSched4!();
      w.getSched4Modal!();
      el("txtTotSaleSched5").value = el("frm2550m:txtTax15").value;
      el("txtSumTotalSaleSched5").value = el("frm2550m:txtTax16A").value;
      w.computeInputTaxSched5!();
      w.getSched5Modal!();
      for (const s of ["", "Sch7", "Sch8"]) w[`computeSumWithheldApp${s}`]!();
      for (const s of [6, 7, 8]) w[`getSched${s}Modal`]!();
      w.computePenalties!();
      const form = document.getElementById("frmMain") as HTMLFormElement;
      return (Array.from(form.elements) as HTMLInputElement[])
        .filter((e) => e.id && ["text", "select-one", "radio", "checkbox"].includes(e.type))
        .map((e) => [e.id, e.type === "radio" || e.type === "checkbox" ? String(e.checked) : e.value] as [string, string]);
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
    expect(got.get("txtAllowInputTax3B0")).toBe("2,982.46");
    expect(got.get("txtNameAgentSch80")).toBe("CITY OF MANILA");
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with populated schedules (parityCheck)", async () => {
    const r = await parityCheck(oracle, FORM_2550M, state, "84653210700000-2550M-052023.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count);
  }, 120_000);
});
