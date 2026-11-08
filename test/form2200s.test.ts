import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupRow, type GroupState } from "@/form/schema.ts";
import { FORM_2200S, validate2200S } from "@/form/form2200s.ts";
import { legacyUnescape } from "@/lib/savefile.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { allPageParityCheck } from "./parity-page.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2200S:";

const row = (o: { Atc?: string; Desc?: string; TaxBracket?: string; AppTaxRate?: string; SalesValue?: string; VolumeRemovals?: string }): GroupRow => ({
  [`${P}sched1Chk`]: "false", [`${P}txtsched1Atc`]: o.Atc ?? "XB", [`${P}txtsched1Desc`]: o.Desc ?? "",
  [`${P}txtsched1TaxBracket`]: o.TaxBracket ?? "", [`${P}txtsched1AppTaxRate`]: o.AppTaxRate ?? "0.00",
  [`${P}txtsched1SalesValue`]: o.SalesValue ?? "0.00", [`${P}txtsched1VolumeRemovals`]: o.VolumeRemovals ?? "0.00",
});

const state: FormState = {
  [`${P}txtMonth1`]: "03", [`${P}txtDate`]: "15", [`${P}txtForYr`]: "2021",
  [`${P}amendedRtn_2`]: "true", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "000",
  [`${P}txtRDOCode`]: "043", [`${P}taxpayerName`]: "DELA CRUZ, JUAN", [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}txtZipCode`]: "1100", [`${P}txtTelNum`]: "0281234567", [`${P}txtLineBus`]: "BEVERAGE DEALER", [`${P}txtPSIC`]: "46311",
  [`${P}optTreaty_2`]: "true", [`${P}chkPymntManner_1`]: "true",
  // row 0 = XB010 sweetened juice drinks, row 8 = XB090 high-fructose corn syrup at 12.00
  [`${P}txtVolumeRemovals0`]: "1,234.56", [`${P}txtSalesValue0`]: "50,000.00",
  [`${P}txtVolumeRemovals8`]: "100.10", [`${P}txtSalesValue8`]: "9,000.00",
  [`${P}txtVolumeRemovals9`]: "77.77",
  [`${P}txtTax17A`]: "1,000.00", [`${P}txtTax23A`]: "14,108.56",
};
const groups: GroupState = { other: [row({ Atc: "XB020", Desc: "TEA", TaxBracket: " liter ", AppTaxRate: "3.25", VolumeRemovals: "2,000.00", SalesValue: "80,000.00" })] };

describe("2200S compute (sweetened beverages, constant rates)", () => {
  it("row due = rate × volume; the rate table is 6.00 with 12.00 and 0.00 at the tail; 16 = Σ dues", () => {
    const o = computeForm(FORM_2200S, state, groups);
    expect(o[`${P}txtBasicTaxDue0`]).toBe("7,407.36"); // 6.00 × 1,234.56
    expect(o[`${P}txtBasicTaxDue8`]).toBe("1,201.20"); // 12.00 × 100.10
    expect(o[`${P}txtBasicTaxDue9`]).toBe("0.00"); // XB100 is rated 0.00
    expect(o[`${P}otherDueTotal`]).toBe("6,500.00"); // others: 3.25 × 2,000
    expect(o[`${P}totalTaxDue`]).toBe("15,108.56");
    expect(o[`${P}txtTax16`]).toBe("15,108.56"); // sched1OK copies the schedule total
    expect(o[`${P}txtTax17C`]).toBe("1,000.00");
    expect(o[`${P}txtTax18`]).toBe("14,108.56");
    expect(o[`${P}txtTax20`]).toBe("14,108.56");
    expect(o[`${P}txtTax21D`]).toBe("0.00");
    expect(o[`${P}txtTax22`]).toBe("14,108.56");
    expect(o[`${P}txtTax23C`]).toBe("14,108.56");
    expect(o[`${P}txtTax24`]).toBe("0.00");
  });

  it("the rate table is year-independent (no atcCodes.xml ==year rows for the XB codes)", () => {
    const y = (year: string) => computeForm(FORM_2200S, { ...state, [`${P}txtForYr`]: year }, groups)[`${P}totalTaxDue`];
    expect(y("2018")).toBe("15,108.56");
    expect(y("2030")).toBe("15,108.56");
  });

  it("a prepayment zeroes 16, disables 21A–C and re-dates the return to today", () => {
    const now = new Date();
    const today = { [`${P}txtMonth1`]: String(now.getMonth() + 1).padStart(2, "0"), [`${P}txtDate`]: String(now.getDate()).padStart(2, "0"), [`${P}txtForYr`]: String(now.getFullYear()) };
    const o = computeForm(FORM_2200S, { ...state, ...today, [`${P}chkPymntManner_1`]: "false", [`${P}chkPymntManner_2`]: "true", [`${P}txtTax23A`]: "9,999.99" }, groups);
    expect(o[`${P}txtTax16`]).toBe("0.00");
    expect(o[`${P}txtTax21D`]).toBe("0.00");
    expect(o[`${P}txtTax24`]).toBe("-10,999.99"); // 17A's credit carries into the prepayment too
  });

  it("validates the Others rows, the payment manner and the prepayment date", () => {
    const id = (s: FormState, g: GroupState = groups) => validate2200S(computeForm(FORM_2200S, s, g), g).map((p) => p.id);
    expect(id(state)).toEqual([]);
    expect(id(state, { ...groups, other: [...groups.other!, row({ Atc: "XB", Desc: "X" })] })).toEqual([`${P}txtsched1Atc1`]);
    expect(id(state, { ...groups, other: [row({ Atc: "XB010", Desc: "X", TaxBracket: "Y", AppTaxRate: "6.00", VolumeRemovals: "1.00" })] })).toEqual([`${P}txtsched1AppTaxRate0`]);
    expect(id({ ...state, [`${P}chkPymntManner_1`]: "false" })).toEqual([`${P}chkPymntManner_1`]);
    expect(id({ ...state, [`${P}txtForYr`]: "1899" })).toEqual([`${P}txtForYr`]);
  });
});

/** BIR's Schedule 1 modal, shown so the harness blurs (recomputes) every cell in it. */
const MODAL = "#modalSched1";

describe.skipIf(!hasForm("2200S"))("native 2200S is 1:1 with BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("BIR's reload rebuilds the Others rows and refills every schedule cell", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_2200S, state, "84653210700000-2200S-03152021.xml", groups);
    expect(await page.evaluate(() => (document.getElementById("frm2200SadditionalSched1") as HTMLTableElement).rows.length)).toBe(1);
    for (const r of formRecords(FORM_2200S, state, groups))
      if (/Sched1|Removals|SalesValue|BasicTaxDue|totalTaxDue|txtTax/.test(r.key) && !/Chk/.test(r.key)) expect(await value(r.key), r.key).toBe(legacyUnescape(r.value));
    expect(error).toEqual([]);
  }, 120_000);
  it("is 1:1 with Schedule 1 revealed and recomputed by BIR", async () => {
    const r = await allPageParityCheck(oracle, FORM_2200S, state, "84653210700000-2200S-03152021.xml", groups, undefined, MODAL);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
  it("is 1:1 for a prepayment (dated today: BIR re-dates a prepayment on reopen) and the plain parityCheck", async () => {
    const now = new Date();
    const today = { [`${P}txtMonth1`]: String(now.getMonth() + 1).padStart(2, "0"), [`${P}txtDate`]: String(now.getDate()).padStart(2, "0"), [`${P}txtForYr`]: String(now.getFullYear()) };
    const pre: FormState = { ...state, ...today, [`${P}chkPymntManner_1`]: "false", [`${P}chkPymntManner_2`]: "true", [`${P}txtOthMannerofPymnt`]: "BONDED", [`${P}txtTax23A`]: "9,999.99" };
    expect(parityProblem(await parityCheck(oracle, FORM_2200S, pre, "84653210700000-2200S-prepay.xml", {}))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_2200S, state, "84653210700000-2200S-plain.xml", groups))).toEqual([]);
  }, 120_000);
});
