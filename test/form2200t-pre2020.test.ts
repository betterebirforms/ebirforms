import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, rowFieldId, type FormState, type GroupRow, type GroupState } from "@/form/schema.ts";
import { FORM_2200T_PRE2020, appRate, productRate, quantity, trunc2, validate2200TPre2020 } from "@/form/form2200t-pre2020.ts";
import { legacyUnescape } from "@/lib/savefile.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
import { allPageParityCheck } from "./parity-page.ts";
const P = "frm2200T:";
/** A calculator row from its entered columns: calc("XT40", { 2: "BRAND", 3: "2", … }). */
const calc = (name: string, col: Record<number, string>): GroupRow =>
  Object.fromEntries(Object.entries(col).map(([k, v]) => [k === "1" ? `${P}chk${name}Delete_{i}C1` : `${P}txt${name}_{i}C${k}`, v]));
const other = (cell: Record<string, string>): GroupRow => Object.fromEntries(Object.entries(cell).map(([k, v]) => [k === "Chk" ? `${P}sched1Chk` : `${P}txtsched1${k}`, v]));

const identity: FormState = {
  [`${P}txtMonth1`]: "03", [`${P}txtDate`]: "15", [`${P}txtForYr`]: "2018",
  [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043", [`${P}taxpayerName`]: "DELA CRUZ, JUAN", [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}txtZipCode`]: "1100", [`${P}txtTelNum`]: "0281234567", [`${P}txtLineBus`]: "TOBACCO MANUFACTURER", [`${P}txtPSIC`]: "1200",
  frm2200ToptRegion: "130000000", frm2200ToptProvince: "133900000", frm2200ToptCity: "133902000",
  frm2200ToptRegion1: "130000000", frm2200ToptProvince1: "133900000", frm2200ToptCity1: "133901000",
};
// every calculator, three Others rows (one an XT035 percentage), product and inspection rows typed straight in
const groups: GroupState = {
  calcXT35: [calc("XT35", { 2: "corona", 3: "1,000", 4: "12.345" }), calc("XT35", { 2: "PANATELA", 3: "250", 4: "30.50" })],
  calcXT36: [calc("XT36", { 2: "CORONA", 3: "1000" }), calc("XT36", { 2: "PANATELA", 3: "250.6" })],
  calcXT40: [calc("XT40", { 2: "HAND ROLLED", 3: "2", 4: "50", 6: "20" })],
  calcXT140: [calc("XT140", { 2: "BRAND A", 3: "10", 4: "500", 6: "20" }), calc("XT140", { 2: "BRAND B", 3: "1", 4: "50", 6: "10" })],
  calcXT150: [calc("XT150", { 2: "BRAND C", 3: "3", 4: "500", 6: "20" })],
  other: [
    other({ Atc: "XT035", Desc: "LITTLE CIGAR", TaxBracket: "NRP", AppTaxRate: "15", Exempt: "10.00", Taxable: "1,000.00" }),
    other({ Atc: "XT999", Desc: "SNUFF", TaxBracket: "PER KG", AppTaxRate: "12.345", Taxable: "55.55" }),
    other({ Atc: "XT998", Desc: "CUT RAG", TaxBracket: "PER KG", AppTaxRate: "3", Taxable: "10.00" }),
  ],
};
const state: FormState = {
  ...identity,
  [`${P}amendedRtn_1`]: "true", [`${P}amendedRtn_2`]: "false",
  [`${P}optTreaty_1`]: "true", [`${P}optTreaty_2`]: "false", [`${P}lstTaxTreaty`]: "2",
  [`${P}chkPymntManner_1`]: "true",
  [`${P}txtProExempt0`]: "5.00", [`${P}txtProTaxable0`]: "1,234.56", [`${P}txtProTaxable3`]: "100.10",
  [`${P}txtInsTaxable0`]: "1,500.00", [`${P}txtInsTaxable1`]: "333.33", [`${P}txtInsExempt2`]: "1.00", [`${P}txtInsTaxable5`]: "77.77",
  [`${P}txtTax17A`]: "1,000.00", [`${P}txtTax19`]: "500.00",
  [`${P}txtTax21A`]: "100.00", [`${P}txtTax21B`]: "50.00", [`${P}txtTax21C`]: "25.00", [`${P}txtTax23A`]: "4,149,537.31",
};

describe("2200T helpers and the year → rate table", () => {
  it("roundDownWithAlert / setToZeroIfEmpty / setApplicableTaxrate", () => {
    expect(trunc2("12.345")).toBe("12.34");
    expect(trunc2("1234")).toBe("1,234.00");
    expect(quantity("250.6")).toBe("251");
    expect(quantity("-3")).toBe("0");
    expect(quantity("")).toBe("0");
    expect(appRate("12.345")).toBe("12.34");
    expect(appRate("1000")).toBe("0.00");
  });
  it("2013–2017 from atcCodes.xml; later years compound by 4% from changeTaxRatePerYear's bases (XT010's 2.81 — BIR's bug)", () => {
    expect(productRate("2015")).toEqual(["1.89", "1.89", "1.89", "1.62", "0.20", "5.41", "18.00", "21.00", "28.00"]);
    expect(productRate("2018")).toEqual(["2.92", "2.92", "2.92", "1.82", "0.2", "6.08", "31.20", "31.20", "31.20"]);
    expect(productRate("2019")[0]).toBe((2.81 * 1.04 * 1.04).toFixed(2));
    expect(productRate("")[6]).toBe("30.00"); // a blank year: the loop never runs
  });
});

describe("2200T calculators → Schedule 1 → item 16 → Part II", () => {
  const o = computeForm(FORM_2200T_PRE2020, state, groups);
  const v = (id: string) => o[`${P}${id}`];
  const records = new Map(formRecords(FORM_2200T_PRE2020, state, groups).map((r) => [r.key, legacyUnescape(r.value)]));
  const at = (name: string, i: number, col: number) => records.get(rowFieldId(`${P}txt${name}_{i}C${col}`, i));
  it("calculator rows and totals, which become the product rows' taxable", () => {
    expect([at("XT35", 1, 3), at("XT35", 1, 4), at("XT35", 1, 5), at("XT35", 1, 2)]).toEqual(["1,000", "12.34", "12,340.00", "CORONA"]);
    expect(records.get(`${P}txtXT35Total`)).toBe("19,965.00"); // 12,340 + 250 × 30.50
    expect(records.get(`${P}txtXT36Total`)).toBe("1,251");
    expect([at("XT140", 1, 5), at("XT140", 1, 7)]).toEqual(["5,000", "100,000"]);
    expect(records.get(`${P}txtXT140Total`)).toBe("100,500");
    expect(records.get(`${P}txtCtrmodalCalculatorXT140`)).toBe("2");
    expect([v("txtProTaxable4"), v("txtProTaxable5"), v("txtProTaxable6"), v("txtProTaxable7"), v("txtProTaxable8")]).toEqual(["19,965.00", "1,251.00", "2,000.00", "100,500.00", "30,000.00"]);
  });
  it("row dues at 2018's rates (truncated), inspection fees, Others (XT035 as a percentage)", () => {
    expect(v("txtProBasicTaxDue0")).toBe("3,604.91"); // 2.92 × 1,234.56 = 3,604.9152
    expect(v("txtProBasicTaxDue3")).toBe("182.18");
    expect(v("txtProBasicTaxDue4")).toBe("3,993.00");
    expect(v("txtProBasicTaxDue5")).toBe("7,606.08");
    expect(v("txtProBasicTaxDue7")).toBe("3,135,600.00");
    expect([0, 1, 5].map((i) => v(`txtInsBasicTaxDue${i}`))).toEqual(["750.00", "33.33", "2.33"]);
    expect([0, 1, 2].map((i) => records.get(`${P}txtsched1BasicTaxDue${i}`))).toEqual(["150.00", "685.48", "30.00"]);
    expect(records.get(`${P}txtsched1AppTaxRate0`)).toBe("15.00%");
    expect(records.get(`${P}txtsched1AppTaxRate1`)).toBe("12.34");
  });
  it("the total, item 16 and the Part II chain", () => {
    expect(v("totalTaxDue")).toBe("4,151,037.31");
    expect(v("txtTax16")).toBe(v("totalTaxDue"));
    expect([v("txtTax17C"), v("txtTax18"), v("txtTax20"), v("txtTax21D"), v("txtTax22")]).toEqual(["1,000.00", "4,150,037.31", "4,149,537.31", "175.00", "4,149,712.31"]);
    expect([v("PayPenalties"), v("txtTax23B"), v("txtTax23C"), v("txtTax24")]).toEqual(["true", "175.00", "4,149,712.31", "0.00"]);
  });
  it("prepayment zeroes item 16 and the penalties; an original return zeroes item 19; no relief clears 14A", () => {
    const pre = computeForm(FORM_2200T_PRE2020, { ...state, [`${P}chkPymntManner_1`]: "false", [`${P}chkPymntManner_2`]: "true", [`${P}chkPymntManner_3`]: "true", [`${P}txtOthMannerofPymnt`]: "BONDED" }, groups);
    expect([pre[`${P}txtTax16`], pre[`${P}txtTax21A`], pre[`${P}txtTax21D`], pre[`${P}PayPenalties`], pre[`${P}txtOthMannerofPymnt`]]).toEqual(["0.00", "0.00", "0.00", "false", "BONDED"]);
    const orig = computeForm(FORM_2200T_PRE2020, { ...state, [`${P}amendedRtn_1`]: "false", [`${P}amendedRtn_2`]: "true", [`${P}optTreaty_1`]: "false", [`${P}optTreaty_2`]: "true" }, groups);
    expect([orig[`${P}txtTax19`], orig[`${P}lstTaxTreaty`], orig[`${P}chkPymntManner_3`]]).toEqual(["0.00", "0", "false"]);
  });
  it("validates sched1OK's XT035/XT036 pairing, the Others rows, unique rates and the calculators", () => {
    const id = (s: FormState, g: GroupState = groups) => validate2200TPre2020(computeForm(FORM_2200T_PRE2020, { [`${P}txtEmailAddress`]: "juan@example.com", ...s }, g), g).map((p) => p.id);
    expect(id(state)).toEqual([]);
    expect(id(state, { ...groups, calcXT36: [] })).toEqual([`${P}txtProTaxable5`]);
    expect(id(state, { ...groups, other: [...groups.other!, other({ Atc: "XT", Desc: "X" })] })).toEqual([`${P}txtsched1Atc3`]);
    expect(id(state, { ...groups, other: [other({ Atc: "XT020", Desc: "X", TaxBracket: "Y", AppTaxRate: "1.82", Taxable: "1.00" })] })).toEqual([`${P}txtsched1AppTaxRate0`]);
    expect(id(state, { ...groups, calcXT40: [calc("XT40", { 2: "X", 3: "0", 4: "5", 6: "5" })] })).toEqual([`${P}txtXT40_1C3`]);
    expect(id({ ...state, [`${P}txtForYr`]: "2012" })).toEqual([`${P}txtForYr`]);
  });
});

/** BIR's Schedule 1 modal and every calculator, shown so the harness blurs (recomputes) every cell in them. */
const MODAL = "#modalSched1, [id^=modalCalculatorXT]";

describe.skipIf(!hasForm("2200T"))("native 2200T is 1:1 with BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("BIR's reload rebuilds every calculator row and Others row and refills every cell", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_2200T_PRE2020, state, "84653210700000-2200T-03152018.xml", groups);
    const count = await page.evaluate(() => ["XT35", "XT36", "XT40", "XT140", "XT150"].map((c) => (document.getElementById(`tblCalculator${c}`) as HTMLTableElement).rows.length));
    expect(count).toEqual([2, 2, 1, 2, 1]);
    expect(await page.evaluate(() => (document.getElementById("frm2200TadditionalSched1") as HTMLTableElement).rows.length)).toBe(3);
    for (const r of formRecords(FORM_2200T_PRE2020, state, groups)) if (/_\d+C[2-7]$|sched1|txt(Pro|Ins)|Total|txtTax/.test(r.key) && !/Chk|C1$/.test(r.key)) expect(await value(r.key), r.key).toBe(legacyUnescape(r.value));
    expect(error).toEqual([]);
  }, 120_000);
  it("is 1:1 with Schedule 1 and every calculator revealed and recomputed by BIR (2018 rates, amended, relief, penalties)", async () => {
    const r = await allPageParityCheck(oracle, FORM_2200T_PRE2020, state, "84653210700000-2200T-03152018.xml", groups, undefined, MODAL);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
  it("is 1:1 for a 2015 return (atcCodes.xml rates) and a 2021 one (four years of 4%)", async () => {
    for (const y of ["2015", "2021"]) {
      const r = await allPageParityCheck(oracle, FORM_2200T_PRE2020, { ...state, [`${P}txtForYr`]: y }, `84653210700000-2200T-0315${y}.xml`, groups, undefined, MODAL);
      expect(parityProblem(r), y).toEqual([]);
    }
  }, 120_000);
  it("is 1:1 for a prepayment with 'others' (dated today: BIR re-dates a prepayment on reopen) and the plain parityCheck", async () => {
    const now = new Date();
    const today = { [`${P}txtMonth1`]: String(now.getMonth() + 1).padStart(2, "0"), [`${P}txtDate`]: String(now.getDate()).padStart(2, "0"), [`${P}txtForYr`]: String(now.getFullYear()) };
    const pre: FormState = { ...state, ...today, [`${P}chkPymntManner_1`]: "false", [`${P}chkPymntManner_2`]: "true", [`${P}chkPymntManner_3`]: "true", [`${P}txtOthMannerofPymnt`]: "BONDED", [`${P}txtTax23A`]: "9,999.99" };
    expect(parityProblem(await parityCheck(oracle, FORM_2200T_PRE2020, pre, "84653210700000-2200T-prepay.xml", {}))).toEqual([]);
    expect(parityProblem(await parityCheck(oracle, FORM_2200T_PRE2020, state, "84653210700000-2200T-plain.xml", groups))).toEqual([]);
  }, 120_000);
});
