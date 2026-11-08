import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_2550QV2024, item26, ratable, returnPeriod2550Qv2024, sched1Allowed, validate2550Qv2024, x12 } from "@/form/form2550qv2024.ts";
import { parseMoney } from "@/form/money.ts";
import { legacyUnescape } from "@/lib/savefile.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm2550qv2024:";
const state: FormState = {
  [`${P}calendarNo1`]: "true",
  [`${P}selectedMonthNo2`]: "12",
  [`${P}txtYearNo2`]: "2026",
  [`${P}OptQuarter3`]: "true",
  [`${P}amendedReturnYesNo5`]: "true",
  [`${P}OptShortPrd2`]: "true",
  [`${P}txtTIN1`]: "846",
  [`${P}txtTIN2`]: "532",
  [`${P}txtTIN3`]: "107",
  [`${P}branchCode`]: "00000",
  [`${P}txtRDOCode`]: "043",
  [`${P}taxpayerName`]: "DELA CRUZ, JUAN",
  [`${P}taxpayerAddress`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}taxPayerClassification2`]: "true",
  [`${P}specialRateYn`]: "true",
  [`${P}vatPaidReturn`]: "1,000.00",
  [`${P}surcharge`]: "250.00",
  [`${P}interest`]: "120.50",
  [`${P}compromise`]: "0.00",
  [`${P}vatableSales`]: "1,234,567.89",
  [`${P}zeroRatedSales`]: "200,000.00",
  [`${P}exemptSales`]: "500,000.00",
  [`${P}lessOutputVat`]: "1,500.00",
  [`${P}addOutputVat`]: "700.00",
  [`${P}inputTaxCarried`]: "5,000.00",
  [`${P}transitionalInputTax`]: "300.00",
  [`${P}presumptiveInputTax`]: "200.00",
  [`${P}domesticPurchase`]: "400,000.05",
  [`${P}servicesPurchase`]: "50,000.00",
  [`${P}importPurchase`]: "80,000.00",
  [`${P}domesticPurchaseNoTax`]: "10,000.00",
  [`${P}vatExemptImports`]: "5,000.00",
  [`${P}sched2InputTaxDirect`]: "1,200.00",
  [`${P}sched2AmountInputTax`]: "33,333.33",
  [`${P}vatRefund`]: "100.00",
  [`${P}inputVatUnpaid`]: "50.00",
  [`${P}addInputVat`]: "25.00",
};
const spec = (n: number, desc: string, amount: string) => ({ [`${P}totalTaxPayableNo${n}Description`]: desc, [`${P}totalTaxPayableNo${n}Amount`]: amount });
const groups: GroupState = {
  sched1: [
    {
      txtDatePurchase1: "03/15/2021", txtSourceCode1: "D", txtDescription1: "DELIVERY TRUCK", txtAmountPurchase1: "1,000,000.00",
      txtInputTax1: "120,000.00", txtEstimatedLife1: "60", txtRecognizedLife1: "60",
    },
    {
      txtDatePurchase1: "11/02/2021", txtSourceCode1: "I", txtDescription1: "GENERATOR SET", txtAmountPurchase1: "833,333.42",
      txtInputTax1: "100,000.01", txtEstimatedLife1: "36", txtRecognizedLife1: "36",
    },
  ],
  sched3: [
    { txtDateCovered3: "07/01/2026", txtDateCovered3To: "07/31/2026", txtNameWithHoldingAgent3: "ACME CORP", txtIncomePayment3: "100,000.00", txtTotalTaxWithHeld3: "5,000.00" },
    { txtDateCovered3: "08/01/2026", txtDateCovered3To: "09/30/2026", txtNameWithHoldingAgent3: "CITY OF MANILA", txtIncomePayment3: "60,000.00", txtTotalTaxWithHeld3: "3,000.00" },
  ],
  sched4: [
    { txtDate4: "07/01/2026", txtDate4To: "07/15/2026", txtNameOfMiller4: "VICTORIAS MILLING", txtNameOfTaxpayer4: "DELA CRUZ", txtOfficialReceiptNumber4: "OR123", txtAmountPaid4: "2,000.00" },
    { txtDate4: "08/01/2026", txtDate4To: "08/15/2026", txtNameOfMiller4: "HAWAIIAN PHILIPPINE", txtNameOfTaxpayer4: "DELA CRUZ", txtOfficialReceiptNumber4: "OR456", txtAmountPaid4: "1,500.00" },
  ],
  specify19: [spec(19, "TAX CREDIT CERTIFICATE", "400.00"), spec(19, "EXCESS PAYMENT", "100.00")],
  specify42: [spec(42, "INPUT TAX ON STOCKS", "800.00")],
  specify47: [spec(47, "IMPORTED SERVICES", "10,000.00"), spec(47, "LEASE", "2,500.00")],
  specify56: [spec(56, "ADJUSTMENT", "60.00")],
};

describe("2550Qv2024 compute (output − input VAT chain, schedules, credits)", () => {
  const o = computeForm(FORM_2550QV2024, state, groups);
  const n = (id: string) => o[`${P}${id}`];

  it("output tax: 31B = 34B = 31A × 12% (BIR float, half-up), 34A, 37", () => {
    expect(x12(parseMoney("1,234,567.89"))).toBe(14_814_815); // 148,148.1468 → 148,148.15
    expect(n("outputVatSales")).toBe("148,148.15");
    expect(n("outputTaxDue")).toBe("148,148.15");
    expect(n("totalSales")).toBe("1,934,567.89");
    expect(n("totalAdjOutput")).toBe("147,348.15"); // 148,148.15 − 1,500 + 700
  });

  it("Schedule 1: allowed = input tax ÷ recognized life × 3 → 39 (Σ input tax) and 52 (Σ balance)", () => {
    expect(sched1Allowed(12_000_000, "60")).toBe(600_000);
    expect(sched1Allowed(10_000_001, "36")).toBe(833_333); // 8,333.334166 → 8,333.33
    expect(o.txtTotalAmountOfBalanceofInputTaxFromPrevious).toBe("220,000.01");
    expect(o.sched1TotalBalPrev).toBe("220,000.01");
    expect(o.txtTotalAmountOfBalanceofInputTaxToBeCarried).toBe("205,666.68"); // 114,000 + 91,666.68
    expect(n("inputTaxDeferred")).toBe("220,000.01");
    expect(n("importCapitalInputTax")).toBe("205,666.68");
  });

  it("input tax: 43, 44B–47B, 50A/B, 51 (item 42/47 from their modal rows)", () => {
    expect(n("otherSpecify42")).toBe("800.00");
    expect(n("total43")).toBe("226,300.01"); // 5,000 + 220,000.01 + 300 + 200 + 800
    expect(n("domesticInputTax")).toBe("48,000.01"); // 400,000.05 × 12% = 48,000.006
    expect(n("serviceInputTax")).toBe("6,000.00");
    expect(n("importInputTax")).toBe("9,600.00");
    expect(n("otherSpecify47")).toBe("12,500.00");
    expect(o.otherSpecify47B).toBe("1,500.00");
    expect(n("totalCurPurchase")).toBe("557,500.05");
    expect(n("totalCurInputTax")).toBe("65,100.01");
    expect(n("totalAvailInputTax")).toBe("291,400.02");
  });

  it("Schedule 2 → 53; deductions 57/59; 60; 61 = 15", () => {
    const r = ratable(50_000_000, 193_456_789, 3_333_333);
    expect(n("sched2VatExemptSale")).toBe("500,000.00");
    expect(n("sched2TotalSales")).toBe("1,934,567.89");
    expect(parseMoney(n("sched2TotalRatable")!)).toBe(r);
    expect(n("sched2TotalRatable")).toBe("8,615.19"); // 500,000 / 1,934,567.89 × 33,333.33
    expect(n("inputTaxAttr")).toBe("9,815.19");
    expect(n("totalDeductions")).toBe("215,691.87"); // 205,666.68 + 9,815.19 + 100 + 50 + 60
    expect(n("adjDeductions")).toBe("215,716.87");
    expect(n("totalAllowInputTax")).toBe("75,683.15");
    expect(n("netVatPayable")).toBe("71,665.00");
    expect(n("excessInputTax")).toBe("71,665.00");
  });

  it("page 1 credits: 16 (Sched 3), 17 (Sched 4), 18 (amended only), 19 (modal) → 20, 21, 25, 26", () => {
    expect(n("creditableVat")).toBe("8,000.00");
    expect(n("advVatPayment")).toBe("3,500.00");
    expect(n("otherCreditsNo19")).toBe("500.00");
    expect(o.resultOtherCreditsNo19).toBe("500.00");
    expect(n("totalTaxCredits")).toBe("13,000.00");
    expect(n("excessCredits")).toBe("58,665.00");
    expect(n("penalties")).toBe("370.50");
    expect(n("totalPayable")).toBe("59,035.50");
    const notAmended = computeForm(FORM_2550QV2024, { ...state, [`${P}amendedReturnYesNo5`]: "false", [`${P}amendedReturnNo5`]: "true" }, groups);
    expect(notAmended[`${P}vatPaidReturn`]).toBe("0.00");
    expect(notAmended[`${P}totalTaxCredits`]).toBe("12,000.00");
  });

  it("compute26 drops a negative 21 once there is a penalty, but keeps it when there is none", () => {
    expect(item26(-50_000, 10_000)).toBe(10_000);
    expect(item26(-50_000, 0)).toBe(-50_000);
    expect(item26(50_000, 10_000)).toBe(60_000);
  });

  it("item 4 is changeYear's string: calendar unpadded, fiscal padded and starting the year before", () => {
    expect(returnPeriod2550Qv2024(state)).toEqual(["7/01/2026", "9/30/2026"]);
    const q = (k: number, extra: FormState = {}) => returnPeriod2550Qv2024({ ...state, [`${P}OptQuarter3`]: "false", [`${P}OptQuarter${k}`]: "true", ...extra });
    expect(q(1)).toEqual(["1/01/2026", "3/31/2026"]);
    expect(q(4)).toEqual(["10/01/2026", "12/31/2026"]);
    const fiscal = { [`${P}calendarNo1`]: "false", [`${P}fiscalNo1`]: "true", [`${P}selectedMonthNo2`]: "06" };
    expect(q(1, fiscal)).toEqual(["07/01/2025", "09/30/2025"]);
    expect(q(3, fiscal)).toEqual(["01/01/2026", "03/31/2026"]);
    expect(q(2, { ...fiscal, [`${P}selectedMonthNo2`]: "08" })).toEqual(["12/01/2025", "02/28/2026"]);
    expect(returnPeriod2550Qv2024({ ...state, [`${P}OptQuarter3`]: "false" })).toEqual(["", ""]);
  });

  it("saves the derived records: item 4, (Specify) descriptions, page-2 header", () => {
    const rec = new Map(formRecords(FORM_2550QV2024, state, groups).map((r) => [r.key, r.value]));
    expect(rec.get(`${P}RtnPeriodFromNo4`)).toBe("7/01/2026");
    expect(rec.get(`${P}addSpecifyNo19`)).toBe("VARIOUS");
    expect(rec.get(`${P}addSpecifyNo42`)).toBe("INPUT TAX ON STOCKS");
    expect(rec.get(`${P}totalTaxPayableNo47Description1`)).toBe("LEASE");
    expect(rec.get(`${P}Pg2TaxPayer`)).toBe("DELA CRUZ");
    expect(rec.get(`${P}txtPg2TIN3`)).toBe("107");
    expect(rec.get("txtBalanceInputTax11")).toBe("91,666.68");
    expect(rec.get("txtDateCovered3To1")).toBe("09/30/2026");
  });

  it("validates schedule dates, source codes and (Specify) rows", () => {
    expect(validate2550Qv2024(state, groups)).toEqual([]);
    const bad: GroupState = {
      sched1: [{ ...groups.sched1![0]!, txtDatePurchase1: "01/15/2022", txtSourceCode1: "X" }],
      sched3: [{ ...groups.sched3![0]!, txtDateCovered3: "06/30/2026" }],
      specify19: [spec(19, "", "0.00")],
    };
    expect(validate2550Qv2024(state, bad).map((p) => p.id)).toEqual(
      expect.arrayContaining(["txtDatePurchase10", "txtSourceCode10", "txtDateCovered30", `${P}totalTaxPayableNo19Description0`]),
    );
  });
});

// Keys whose difference after BIR reopens the native save is BIR's reload, not the native save:
const ALLOW = [
  // the "(Specify)" modal rows: loadSpecify<N> refills only the JS array; the rows are painted when the modal opens
  ...[19, 42, 47, 56].flatMap((n) => [0, 1].flatMap((i) => [`${P}totalTaxPayableNo${n}Description${i}`, `${P}totalTaxPayableNo${n}Amount${i}`])),
  // loadSched3/4 split on "txtDateCovered3"/"txtDate4", which also match "…To": row 1's From shows row 0's To date
  "txtDateCovered31",
  "txtDate41",
];

describe.skipIf(!hasForm("2550Qv2024"))("native 2550Qv2024 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("BIR's own compute functions, run over the reopened save, reproduce every native value", async () => {
    const escaped = new Set(FORM_2550QV2024.field.filter((f) => f.escaped).map((f) => f.id));
    const native = new Map(formRecords(FORM_2550QV2024, state, groups).map((r) => [r.key, escaped.has(r.key) ? legacyUnescape(r.value) : r.value]));
    const { page, error } = await oracle.openSaved(FORM_2550QV2024, state, "84653210700000-2550Qv2024-122026Q3.xml", groups);
    const legacy: Array<[string, string]> = await page.evaluate(() => {
      const w = window as unknown as Record<string, () => void>;
      for (const fn of ["changeYear", "computeSched1", "computeSched3", "computeSched4", "compute31AB", "compute34AB", "computeVATExemptSale",
        "compute44AB", "compute45AB", "compute46AB", "compute47AB", "compute43AB", "computeAmountInputTax", "compute57AB",
        "compute61AB", "compute20", "compute25"]) w[fn]!();
      // paint item 19's modal rows from the reloaded array. (Not 47: showModalNo47 tests addSpecifyNo42 for
      // "VARIOUS" — a BIR copy-paste bug — so reopening a VARIOUS item 47 overwrites its row 0 with the total.)
      w.showModalNo19!();
      const form = document.getElementById("frmMain") as HTMLFormElement;
      return (Array.from(form.elements) as HTMLInputElement[])
        .filter((el) => el.id && ["text", "select-one", "radio", "checkbox"].includes(el.type))
        .map((el) => [el.id, el.type === "radio" || el.type === "checkbox" ? String(el.checked) : el.value] as [string, string]);
    });
    await page.close();
    const diff: string[] = [];
    for (const [key, value] of new Map(legacy)) {
      const mine = native.get(key);
      if (mine === undefined) continue;
      const money = /^-?[\d,]*\.\d\d$/;
      const equal = money.test(mine) && money.test(value) ? parseMoney(mine) === parseMoney(value) : mine === value;
      if (!equal) diff.push(`${key}: native ${mine} vs BIR ${value}`);
    }
    // only BIR's split bug on the Schedule 3/4 From dates remains (see ALLOW)
    expect(diff).toEqual(["txtDateCovered31: native 08/01/2026 vs BIR 07/31/2026", "txtDate41: native 08/01/2026 vs BIR 07/15/2026"]);
    expect(new Map(legacy).get(`${P}totalTaxPayableNo19Description1`)).toBe("EXCESS PAYMENT");
    expect(new Map(legacy).get(`${P}totalTaxPayableNo19Amount0`)).toBe("400.00");
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with populated schedules (parityCheck)", async () => {
    const r = await parityCheck(oracle, FORM_2550QV2024, state, "84653210700000-2550Qv2024-122026Q3.xml", groups);
    expect(parityProblem(r, ALLOW)).toEqual([]);
    expect(r.diff.map((d) => d.key)).toEqual(["txtDateCovered31", "txtDate41"]);
    expect(r.extra).toHaveLength(12); // 6 modal rows × (description, amount)
    expect(r.equal_count).toBe(r.key_count - 14);
  }, 120_000);

  it("item 4 matches BIR's changeYear for every calendar/fiscal × month × quarter", async () => {
    const { page } = await oracle.openSaved(FORM_2550QV2024, state, "84653210700000-2550Qv2024-122026Q3.xml", groups);
    const combo: Array<[string, string, number]> = [];
    for (const kind of ["calendarNo1", "fiscalNo1"]) for (let m = 1; m <= 12; m++) for (let q = 1; q <= 4; q++) combo.push([kind, String(m).padStart(2, "0"), q]);
    const legacy = await page.evaluate((combo) => {
      const el = (id: string) => document.getElementById(`frm2550qv2024:${id}`) as HTMLInputElement;
      return combo.map(([kind, month, q]) => {
        el(kind).checked = true;
        el("selectedMonthNo2").value = month;
        el("txtYearNo2").value = "2026";
        for (let k = 1; k <= 4; k++) el(`OptQuarter${k}`).checked = k === q;
        (window as unknown as { changeYear: () => void }).changeYear();
        return [el("RtnPeriodFromNo4").value, el("RtnPeriodToNo4").value];
      });
    }, combo);
    await page.close();
    const native = combo.map(([kind, month, q]) =>
      returnPeriod2550Qv2024({
        [`${P}${kind}`]: "true", [`${P}${kind === "fiscalNo1" ? "calendarNo1" : "fiscalNo1"}`]: "false",
        [`${P}selectedMonthNo2`]: month, [`${P}txtYearNo2`]: "2026", [`${P}OptQuarter${q}`]: "true",
      }),
    );
    expect(native).toEqual(legacy);
  }, 120_000);
});
