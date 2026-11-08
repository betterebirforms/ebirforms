import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, rowFieldId, type FormState, type GroupRow, type GroupState } from "@/form/schema.ts";
import { FORM_2200A, pct, rateFor, roundDown, validate2200A, vol, woc } from "@/form/form2200a.ts";
import { parseMoney } from "@/form/money.ts";
import { legacyUnescape } from "@/lib/savefile.ts";
import { hasForm, startOracle, type Oracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2200A:";
/** A calculator row from its entered columns: calc("XA061", { 2: "WINE", 3: "20", … }). */
const calc = (name: string, col: Record<number, string>): GroupRow => Object.fromEntries(Object.entries(col).map(([k, v]) => [`${P}Cal${name}_{i}_Col${k}`, v]));
const other = (cell: Record<string, string>): GroupRow => Object.fromEntries(Object.entries(cell).map(([k, v]) => [`${P}sched1${k}`, v]));

const identity: FormState = {
  [`${P}txtMonth1`]: "03", [`${P}txtDate`]: "15", [`${P}txtForYr`]: "2018",
  [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043", [`${P}txtTaxPayerName`]: "DELA CRUZ, JUAN", [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}txtZipCode`]: "1100", [`${P}txtContactNum`]: "0281234567", [`${P}txtLineBus`]: "DISTILLER", [`${P}txtPSIC`]: "1101",
  [`${P}txt12optRegion`]: "130000000", [`${P}txt12optProvince`]: "133900000", [`${P}txt12optCity`]: "133902000",
  [`${P}txt13optRegion1`]: "130000000", [`${P}txt13optProvince1`]: "133900000", [`${P}txt13optCity1`]: "133901000",
};
// every calculator BIR's reload can rebuild (XA035/XA036 bottle + bulk, the four wines, XA055), two rows typed
// straight in (XA056, XA057), XA090's entered due, three Others rows (one an XA035 percentage)
const groups: GroupState = {
  calcXA035Bottle: [calc("XA035Bottle", { 2: "brandy 750", 3: "10", 4: "12", 6: "350.75", 7: "40" }), calc("XA035Bottle", { 2: "GIN 1L", 3: "5", 4: "6", 6: "199.99", 7: "35.5" })],
  calcXA035Bulk: [calc("XA035Bulk", { 2: "BULK RUM", 3: "10,000.00", 4: "45" })],
  calcXA036Bottle: [calc("XA036Bottle", { 2: "BRANDY 750", 3: "10", 4: "12", 6: "0.75", 7: "40" })],
  calcXA036Bulk: [calc("XA036Bulk", { 2: "BULK RUM", 3: "1,000.5", 4: "45" })],
  calcXA061: [calc("XA061", { 2: "CHAMPAGNE", 3: "20", 4: "12", 6: "0.75" })],
  calcXA062: [calc("XA062", { 2: "VINTAGE", 3: "3", 4: "6", 6: "1.5" })],
  calcXA070: [calc("XA070", { 2: "TABLE WINE", 3: "100", 4: "24", 6: "0.33" })],
  calcXA080: [calc("XA080", { 2: "PORT", 3: "7", 4: "12", 6: "0.7" })],
  calcXA055: [calc("XA055", { 2: "LAGER", 3: "50", 4: "24", 6: "0.33" })],
  other: [
    other({ Atc: "xa035", Desc: "LIQUEUR", TaxBracket: "NRP PER PROOF", AppRate: "15.00%", Taxable: "1,000.00" }),
    other({ Atc: "XA099", Desc: "SOJU", TaxBracket: "PER LITER", AppRate: "12.34", Exempt: "3.00", Taxable: "55.55" }),
    other({ Atc: "XA098", Desc: "MEAD", TaxBracket: "PER LITER", AppRate: "5.00", Taxable: "10.00" }),
  ],
};
const state: FormState = {
  ...identity,
  [`${P}amendedRtn_1`]: "true", [`${P}amendedRtn_2`]: "false", [`${P}txtSheets`]: "2",
  [`${P}optTreaty_1`]: "true", [`${P}optTreaty_2`]: "false", [`${P}lstTaxTreaty`]: "2",
  [`${P}chkPymntManner_1`]: "true",
  [`${P}xa1_exempt1`]: "100.00", [`${P}xa2_exempt1`]: "5.00",
  [`${P}xa3_taxable2`]: "1,234.56", [`${P}xa3_taxable3`]: "100.10",
  [`${P}xa2_exempt5`]: "1.00", [`${P}xa2_taxable5`]: "2.00", [`${P}xa2_exciseTaxDue5`]: "500.00",
  [`${P}txtTax19A`]: "1,000.00", [`${P}txtTax21`]: "500.00",
  [`${P}txtTax23A`]: "100.00", [`${P}txtTax23B`]: "50.00", [`${P}txtTax23C`]: "25.00", [`${P}txtTax25A`]: "185,357.27",
};

describe("2200A helpers (string-util2014.js) and the year → rate table", () => {
  it("roundDownComputation truncates after toPrecision(14); setPercentage / xa036VolumeChecker / formatCurrencyWOC", () => {
    expect(roundDown(4259.787)).toBe("4,259.78");
    expect(roundDown(120 * 350.75 * 0.8)).toBe("33,672.00"); // 33672.000000000004 → toPrecision(14)
    expect(roundDown(-12.345)).toBe("-12.34");
    expect(pct("40")).toBe("40.00%");
    expect(pct("35.567")).toBe("35.56%");
    expect(pct("101")).toBe("0.00%");
    expect(vol(0.75 * 0.8)).toBe("0.600");
    expect(vol("1,000.5")).toBe("1,000.500");
    expect(woc("1200.7")).toBe("1,200");
  });
  it("rates by year; a second XA055 / XA056 rate in 2013–2016; 2019+ escalates the 2018 specific rates by 4% a year", () => {
    expect(rateFor("XA036", 2016)).toBe(20.8);
    expect(rateFor("XA055", 2013, 1)).toBe(15.49);
    expect(rateFor("XA056", 2016, 1)).toBe(23.14);
    expect(rateFor("XA056", 2017, 1)).toBeNaN();
    expect(rateFor("XA036", 2019)).toBe(22.5 * 1.04); // 23.400000000000002, unrounded
    expect(rateFor("XA035", 2020)).toBe(0.2); // ad valorem: not escalated
    expect(rateFor("XA061", 2012)).toBeNaN();
  });
});

describe("2200A calculators → Schedule 1 → item 18 → Part II", () => {
  const o = computeForm(FORM_2200A, state, groups);
  const v = (id: string) => o[`${P}${id}`];
  const records = new Map(formRecords(FORM_2200A, state, groups).map((r) => [r.key, legacyUnescape(r.value)]));
  const at = (name: string, i: number, col: number) => records.get(rowFieldId(`${P}Cal${name}_{i}_Col${col}`, i));
  it("calculator rows: bottles, proof, tax base; sub-totals; XA035 / XA036 combine bottle + bulk", () => {
    expect([at("XA035Bottle", 1, 5), at("XA035Bottle", 1, 7), at("XA035Bottle", 1, 8), at("XA035Bottle", 1, 9)]).toEqual(["120", "40.00%", "0.80", "33,672.00"]);
    expect(at("XA035Bottle", 2, 9)).toBe("4,259.78"); // 4,259.787 truncated
    expect(at("XA035Bottle", 1, 2)).toBe("BRANDY 750"); // capitalize()
    expect([at("XA036Bottle", 1, 9), at("XA036Bottle", 1, 10)]).toEqual(["0.600", "72.00"]);
    expect([at("XA036Bulk", 1, 3), at("XA036Bulk", 1, 6)]).toEqual(["1,000.500", "900.45"]);
    expect(records.get("CalcSubTotalXA035Bottle")).toBe("37,931.78");
    expect(records.get("CalcSubTotalXA035")).toBe("46,931.78");
    expect(records.get("CalcSubTotalXA036")).toBe("972.45");
    expect(records.get(`${P}txtCtrmodalCalculatorXA035Bottle`)).toBe("2");
    expect(records.get(`${P}txtCtrmodalCalculatorXA057`)).toBe("0");
  });
  it("row dues at the 2018 rates (truncated), the calculators' totals as the taxable", () => {
    expect(v("xa1_taxable1")).toBe("46,931.78");
    expect(v("xa1_exciseTaxDue1")).toBe("9,386.35");
    expect(v("xa1_exciseTaxDue2")).toBe("21,880.12"); // 22.50 × 972.45 = 21,880.125
    expect([1, 2, 3, 4].map((i) => v(`xa2_exciseTaxDue${i}`))).toEqual(["54,748.80", "22,994.82", "28,908.00", "4,292.40"]);
    expect([1, 2, 3].map((i) => v(`xa3_exciseTaxDue${i}`))).toEqual(["9,678.24", "30,172.64", "3,410.40"]);
    expect([0, 1, 2].map((i) => records.get(`${P}sched1ExciseTaxDue${i}`))).toEqual(["150.00", "685.48", "50.00"]);
    expect(records.get(`${P}sched1Atc0`)).toBe("XA035");
  });
  it("the total sums the UNROUNDED products: 186,857.27, not the 186,857.25 the shown dues add to", () => {
    expect(v("totalTaxDue")).toBe("186,857.27");
    expect(v("txtTax18")).toBe("186,857.27");
  });
  it("Part II chain, penalties flag, and the prepayment gates", () => {
    expect([v("txtTax19B"), v("txtTax19C"), v("txtTax20"), v("txtTax22")]).toEqual(["0.00", "1,000.00", "185,857.27", "185,357.27"]);
    expect([v("txtTax23D"), v("txtTax24"), v("chkPenalties"), v("txtTax25B"), v("txtTax25C"), v("txtTax26")]).toEqual(["175.00", "185,532.27", "true", "175.00", "185,532.27", "0.00"]);
    const pre = computeForm(FORM_2200A, { ...state, [`${P}chkPymntManner_1`]: "false", [`${P}chkPymntManner_2`]: "true", [`${P}chkPymntManner_3`]: "true", [`${P}txt17OthMannerofPymnt`]: " bonded " }, groups);
    expect([pre[`${P}txtTax18`], pre[`${P}txtTax23A`], pre[`${P}txtTax23D`], pre[`${P}chkPenalties`]]).toEqual(["0.00", "0.00", "0.00", "false"]);
    expect(pre[`${P}txt17OthMannerofPymnt`]).toBe("BONDED");
    expect(computeForm(FORM_2200A, { ...state, [`${P}amendedRtn_1`]: "false", [`${P}amendedRtn_2`]: "true" }, groups)[`${P}txtTax21`]).toBe("0.00");
  });
  it("2013–2016: the inserted second-rate row is saved and taxed at its own rate", () => {
    const y2016 = { ...state, [`${P}txtForYr`]: "2016", [`${P}xa3_taxableXA0562`]: "1,000.00" };
    const r = new Map(formRecords(FORM_2200A, y2016, groups).map((x) => [x.key, legacyUnescape(x.value)]));
    expect(r.get(`${P}xa3_exciseTaxDueXA0562`)).toBe("23,140.00");
    expect(r.has(`${P}xa3_taxableXA0552`)).toBe(false); // XA055 has a second rate only in 2013
    expect(new Map(formRecords(FORM_2200A, state, groups).map((x) => [x.key, x.value])).has(`${P}xa3_taxableXA0562`)).toBe(false);
  });
  it("escape()s every text value but BIR's verbatim list", () => {
    const raw = new Map(formRecords(FORM_2200A, state, groups).map((x) => [x.key, x.value]));
    expect(raw.get(`${P}txtTax18`)).toBe("186%2C857.27");
    expect(raw.get(`${P}txtTax22`)).toBe("185,357.27"); // verbatim
    expect(raw.get(`${P}sched1Desc0`)).toBe("LIQUEUR");
    expect(raw.get(rowFieldId(`${P}CalXA035Bottle_{i}_Col2`, 1))).toBe("BRANDY%20750");
  });
  it("validates sched1OK's XA035/XA036 pairing, the Others rows and the date", () => {
    const id = (s: FormState, g: GroupState = groups) => validate2200A(computeForm(FORM_2200A, s, g), g).map((p) => p.id);
    expect(id(state)).toEqual([]);
    expect(id(state, { ...groups, calcXA036Bottle: [], calcXA036Bulk: [] })).toEqual([`${P}xa1_taxable2`]);
    expect(id(state, { ...groups, other: [...groups.other!, other({ Atc: "XA", Desc: "X" })] })).toEqual([`${P}sched1Atc3`]);
    expect(id({ ...state, [`${P}txtForYr`]: "2012" })).toEqual([`${P}txtForYr`]);
  });
});

/** Open the native save in BIR's form, reveal Schedule 1 and every calculator, wipe every computed cell, blur EVERY
 *  input (BIR's compute* rebuild the calculator columns and sub-totals, computeSched1Alcohol the dues and the
 *  total), press BIR's OK (sched1OK → item 18 → compute20 … compute26), and diff against the native save. */
async function fullRecompute(oracle: Oracle, s: FormState, g: GroupState) {
  const native = formRecords(FORM_2200A, s, g).map((r) => ({ key: r.key, value: legacyUnescape(r.value) }));
  const used = Object.entries(g).filter(([name, rows]) => name.startsWith("calc") && rows.length > 0).map(([name]) => name.slice(4));
  const { page, error } = await oracle.openSaved(FORM_2200A, s, "84653210700000-2200A-03152018.xml", g);
  const legacy: Array<[string, string]> = await page.evaluate((used) => {
    for (const id of ["modalSched1", ...used.map((u) => `Calculator${u}`)]) (document.getElementById(id) as HTMLElement).style.display = "block";
    const all = Array.from((document.getElementById("frmMain") as HTMLFormElement).elements) as HTMLInputElement[];
    // (xa2_exciseTaxDue5 is XA090's ENTERED due, so it is not wiped)
    const wipe = /exciseTaxDue[1-4]$|totalTaxDue$|txtTax18$|_Col(5|8|9|10)$|^frm2200A:CalXA0(61|62|70|80|55)_\d+_Col7$/;
    for (const el of all) if (wipe.test(el.id) || used.some((u) => el.id === `CalcSubTotal${u}`)) el.value = "9.99";
    // BIR's reload never re-runs an Others row's ATC onchange (checkATCValue), so an XA035 row's rate keeps the plain
    // setApplicableTaxrate blur, which zeroes "15.00%". Fire the ATC change the user made when entering the row.
    for (const el of all) if (/sched1Atc\d+$/.test(el.id)) el.dispatchEvent(new Event("change"));
    for (let pass = 0; pass < 2; pass++) for (const el of all) if (!el.disabled && el.type === "text" && el.offsetParent !== null) el.dispatchEvent(new FocusEvent("blur"));
    (window as unknown as { sched1OK: () => void }).sched1OK();
    return all.filter((el) => el.id && ["text", "select-one", "radio", "checkbox"].includes(el.type)).map((el): [string, string] => [el.id, el.type === "radio" || el.type === "checkbox" ? String(el.checked) : el.value]);
  }, used);
  await page.close();
  const bir = new Map(legacy);
  const diff = native.filter((r) => bir.get(r.key) !== r.value).map((r) => `${r.key}: native ${JSON.stringify(r.value)} vs BIR ${JSON.stringify(bir.get(r.key) ?? null)}`);
  const missing = [...bir.keys()].filter((k) => !native.some((r) => r.key === k));
  return { diff, missing, error };
}

describe.skipIf(!hasForm("2200A"))("native 2200A is 1:1 with BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("BIR's reload rebuilds the Others rows and every calculator it can, and refills every cell", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_2200A, state, "84653210700000-2200A-03152018.xml", groups);
    const count = await page.evaluate(() => ["XA035Bottle", "XA035Bulk", "XA036Bottle", "XA036Bulk", "XA061", "XA062", "XA070", "XA080", "XA055"].map((c) => document.querySelectorAll(`#divCalculator${c} > div`).length));
    expect(count).toEqual([2, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(await page.evaluate(() => (document.getElementById("frm2200AadditionalSched1") as HTMLTableElement).rows.length)).toBe(3);
    for (const r of formRecords(FORM_2200A, state, groups)) if (/_Col|sched1|xa\d_|CalcSubTotal|txtTax/.test(r.key) && !/Chk|_Col1$/.test(r.key)) expect(await value(r.key), r.key).toBe(legacyUnescape(r.value));
    expect(error).toEqual([]);
  }, 120_000);
  it("BIR's own calculator, schedule and Part II computes (every modal revealed, every input blurred, OK) land on the native save", async () => {
    expect(await fullRecompute(oracle, state, groups)).toEqual({ diff: [], missing: [], error: [] });
  }, 120_000);
  it("parityCheck: all calculators BIR rebuilds, Others rows, amended, relief, penalties (its reload reruns setATCSchedule1)", async () => {
    const r = await parityCheck(oracle, FORM_2200A, state, "84653210700000-2200A-03152018.xml", groups);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
  it("parityCheck: a 2019 return (escalated rates) and a prepayment with 'others' stamped today (BIR re-dates prepayments on reopen)", async () => {
    const y2019 = await parityCheck(oracle, FORM_2200A, { ...state, [`${P}txtForYr`]: "2019", [`${P}txtTax25A`]: "0.00" }, "84653210700000-2200A-03152019.xml", groups);
    expect(parityProblem(y2019)).toEqual([]);
    const now = new Date();
    const today = { [`${P}txtMonth1`]: String(now.getMonth() + 1).padStart(2, "0"), [`${P}txtDate`]: String(now.getDate()).padStart(2, "0"), [`${P}txtForYr`]: String(now.getFullYear()) };
    const pre: FormState = { ...state, ...today, [`${P}chkPymntManner_1`]: "false", [`${P}chkPymntManner_2`]: "true", [`${P}chkPymntManner_3`]: "true", [`${P}txt17OthMannerofPymnt`]: "BONDED", [`${P}txtTax25A`]: "0.00" };
    expect(parityProblem(await parityCheck(oracle, FORM_2200A, pre, "84653210700000-2200A-prepay.xml", {}))).toEqual([]);
  }, 120_000);
  it("BIR reload bugs: the 2016 second-rate XA056 row comes back empty; XA056's calculator rows are rebuilt with XA0552's count", async () => {
    const y2016: FormState = { ...state, [`${P}txtForYr`]: "2016", [`${P}xa3_taxableXA0562`]: "1,000.00", [`${P}txtTax25A`]: "0.00" };
    const r = await parityCheck(oracle, FORM_2200A, y2016, "84653210700000-2200A-03152016.xml", groups);
    const lost = [`${P}xa3_taxableXA0562`, `${P}xa3_exciseTaxDueXA0562`];
    expect(r.diff.map((d) => d.key)).toEqual(expect.arrayContaining(lost));
    // the reload inserts the row AFTER loading, so it is blank, and setATCSchedule1 re-totals without it
    const total = [`${P}totalTaxDue`, `${P}txtTax18`, `${P}txtTax20`, `${P}txtTax22`, `${P}txtTax24`, `${P}txtTax26`];
    expect(parityProblem(r, [...lost, ...total])).toEqual([]);
    const calcBug = await parityCheck(oracle, FORM_2200A, state, "84653210700000-2200A-calc.xml", { ...groups, calcXA056: [calc("XA056", { 2: "STOUT", 3: "2", 4: "24", 6: "0.33" })] });
    const rows = Array.from({ length: 7 }, (_, k) => rowFieldId(`${P}CalXA056_{i}_Col${k + 1}`, 1));
    expect(calcBug.extra).toEqual(rows); // XA0552 has 0 rows, so XA056's row is never rebuilt…
    const phantom = rows.map((k) => k.replace("XA056", "XA057"));
    expect(calcBug.missing).toEqual(phantom); // …and XA057 gets XA056's count: an empty phantom row BIR then saves
    expect(parityProblem(calcBug, [...rows, ...phantom])).toEqual([]);
  }, 120_000);
});
