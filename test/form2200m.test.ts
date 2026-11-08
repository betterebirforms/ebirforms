import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { atcPickList } from "@/form/atc.ts";
import { dynamicTax, FIXED_ATC, FORM_2200M, validate2200M } from "@/form/form2200m.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityProblem } from "./parity.ts";
import { allPageParityCheck } from "./parity-page.ts";

const P = "frm2200M:";
const d = (col: string) => `${P}txtsched1${col}`;

const input: FormState = {
  [`${P}amendedRtn_1`]: "true",
  [`${P}amendedRtn_2`]: "false",
  [`${P}chkPymntManner_1`]: "true",
  [`${P}optTreaty_1`]: "true",
  [`${P}lstTaxTreaty`]: "1",
  [`${P}txtPlaceofRem`]: "toledo city",
  // the fixed rows' hard-coded rate engine
  [`${P}txtA1`]: "1,000.00", // J1 = A1 × P10/MT
  [`${P}txtK1`]: "50.00",
  [`${P}txtG2`]: "12,345.67", // J2 = G2 × 2% = 246.9134
  [`${P}txtC2`]: "9,999.00", // never computed: F2 stays 0.00
  [`${P}txtC3`]: "100,000.25", // F3 = C3 × 2% = 2,000.005
  [`${P}txtG3`]: "5,000.00", // never computed: J3 stays 0.00
  [`${P}txtC4`]: "1,234.56",
  [`${P}txtC5`]: "55,555.55", // F5 = C5 × 3% = 1,666.6665
  [`${P}txtK5`]: "10.00",
  [`${P}txtC6`]: "8,000.00", // row 6 (0%) has no compute: L6 = K6
  [`${P}txtK6`]: "75.00",
  [`${P}txtTax18A`]: "1,000.00",
  [`${P}txtTax20`]: "500.00",
  [`${P}txtTax22A`]: "100.00",
  [`${P}txtTax22B`]: "20.00",
  [`${P}txtTax22C`]: "5.00",
  [`${P}PayPenalties`]: "true",
  [`${P}txtTax24A`]: "5,000.00",
};
const row = (atc: string, desc: string, cell: Record<string, string>) => ({ [d("Atc")]: atc, [d("Desc")]: desc, [d("PlaceOfExtract")]: "surigao", ...cell });
const groups: GroupState = {
  sched1: [
    row("xm060", "nickel", { [d("C")]: "10,000.00", [d("E")]: "2.00", [d("G")]: "20,000.50", [d("I")]: "2.00" }),
    row("XM061", "zinc ore", { [d("A")]: "10.00", [d("C")]: "3,333.33", [d("E")]: "3.00", [d("K")]: "1.00" }),
  ],
};

describe("2200M compute (fixed-row rate engine, added rows, items 17–25)", () => {
  it("per-commodity rates: coal per MT on A, XM020 on final G, XM030/040/050 on provisional C, XM051 none", () => {
    const o = computeForm(FORM_2200M, input, groups);
    expect(o[`${P}txtJ1`]).toBe("10,000.00");
    expect(o[`${P}txtL1`]).toBe("10,050.00");
    expect(o[`${P}txtF2`]).toBe("0.00");
    expect(o[`${P}txtJ2`]).toBe("246.91");
    expect(o[`${P}txtF3`]).toBe("2,000.01"); // 100,000.25 × 0.02 through formatCurrency's +0.50000000001
    expect(o[`${P}txtJ3`]).toBe("0.00");
    expect(o[`${P}txtF4`]).toBe("24.69");
    expect(o[`${P}txtF5`]).toBe("1,666.67");
    expect(o[`${P}txtL5`]).toBe("1,676.67");
    expect(o[`${P}txtF6`]).toBe("0.00");
    expect(o[`${P}txtL6`]).toBe("75.00");
    expect(o[`${P}txtPlaceOfExtract1`]).toBe("toledo city"); // A1 ≠ 0
    expect(o[`${P}txtPlaceOfExtract3`] ?? "").toBe(""); // A3 = 0
    expect(computeForm(FORM_2200M, { ...input, [`${P}txtPlaceOfExtract3`]: "typed" })[`${P}txtPlaceOfExtract3`]).toBe("");
  });

  it("added rows: F = C × E ÷ 100, J = G × I ÷ 100, L = F + J + K; Σ L → total → 17 → chain", () => {
    expect(dynamicTax(3333.33, 3)).toBe(10000); // 99.9999 → 100.00
    const o = computeForm(FORM_2200M, input, groups);
    const rec = new Map(formRecords(FORM_2200M, input, groups).map((r) => [r.key, r.value]));
    expect(rec.get(`${d("F")}0`)).toBe("200.00");
    expect(rec.get(`${d("J")}0`)).toBe("400.01");
    expect(rec.get(`${d("L")}0`)).toBe("600.01");
    expect(rec.get(`${d("L")}1`)).toBe("101.00");
    expect(rec.get(`${d("Atc")}0`)).toBe("XM060"); // capital() upper-cases every text field
    expect(rec.get(`${P}sched1Chk1`)).toBe("false");
    // 10,050 + 246.91 + 2,000.01 + 24.69 + 1,676.67 + 75 + 600.01 + 101
    expect(o[`${P}totalTaxDue`]).toBe("14,774.29");
    expect(o[`${P}txtTax17`]).toBe("14,774.29");
    expect(o[`${P}txtTax18C`]).toBe("1,000.00");
    expect(o[`${P}txtTax19`]).toBe("13,774.29");
    expect(o[`${P}txtTax21`]).toBe("13,274.29");
    expect(o[`${P}txtTax22D`]).toBe("125.00");
    expect(o[`${P}txtTax23`]).toBe("13,399.29");
    expect(o[`${P}txtTax24B`]).toBe("125.00");
    expect(o[`${P}txtTax24C`]).toBe("5,125.00");
    expect(o[`${P}txtTax25`]).toBe("8,274.29");
  });

  it("gates: an original return zeroes 20, unticked penalties leave 24B 0.00, treaty No resets the list", () => {
    const o = computeForm(FORM_2200M, { ...input, [`${P}amendedRtn_1`]: "false", [`${P}amendedRtn_2`]: "true", [`${P}PayPenalties`]: "false", [`${P}optTreaty_1`]: "false", [`${P}optTreaty_2`]: "true" }, groups);
    expect(o[`${P}txtTax20`]).toBe("0.00");
    expect(o[`${P}txtTax24B`]).toBe("0.00");
    expect(o[`${P}lstTaxTreaty`]).toBe("0");
    expect(o[`${P}txtTax25`]).toBe("8,899.29"); // 13,774.29 + 125 − 5,000
  });

  it("the fixed rows' rates agree with BIR's atcCodes.xml list, except XM051 (listed 2%, printed 0% and never computed)", () => {
    // 2200M has no loadATC: its six rows hard-code the rates; atc-list.json is only a cross-check here
    const listed = new Map(atcPickList("2200M", "").map((e) => [e.atc_code, e.rate]));
    expect(FIXED_ATC.map((c) => listed.get(c))).toEqual(["<!--10.00/null-->", "2.0", "2.0", "2.0", "3.0", "2.0"]);
    const o = computeForm(FORM_2200M, { [`${P}txtA1`]: "1.00", [`${P}txtG2`]: "100.00", [`${P}txtC3`]: "100.00", [`${P}txtC4`]: "100.00", [`${P}txtC5`]: "100.00", [`${P}txtC6`]: "100.00", [`${P}txtG6`]: "100.00" });
    expect([1, 2, 3, 4, 5, 6].map((i) => o[`${P}txtL${i}`])).toEqual(["10.00", "2.00", "2.00", "2.00", "3.00", "0.00"]);
  });

  it("isValidDataOnSched1: XM prefix, and ATC + description on rows after the first", () => {
    expect(validate2200M(input, groups).filter((p) => p.id.includes("sched1"))).toEqual([]);
    const bad = validate2200M(input, { sched1: [row("XP010", "x", {}), row("", "", {}), row("XM1", "", {})] });
    expect(bad.map((p) => p.id).filter((id) => id.includes("sched1"))).toEqual([`${d("Atc")}0`, `${d("Atc")}1`, `${d("Desc")}2`]);
  });
});

describe.skipIf(!hasForm("2200M"))("native 2200M matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  const state: FormState = {
    ...input,
    [`${P}txtMonth1`]: "06", [`${P}txtDate`]: "30", [`${P}txtForYr`]: "2017",
    [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
    [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN", [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY",
  };
  const file = "84653210700000-2200M-06302017.xml";
  // A filer reopening the return opens Schedule 1, tabs through it and clicks OK (BIR's reload never re-opens it).
  const reopenSchedule = `showSched1();
    var box = document.getElementById('modalSched1').getElementsByTagName('input');
    for (var pass = 0; pass < 2; pass++) for (var i = 0; i < box.length; i++)
      if (box[i].type === 'text' && !box[i].disabled) box[i].dispatchEvent(new FocusEvent('blur'));
    sched1OK();`;

  it("reopens with every added row rebuilt from its sched1Chk box and item 17 = the schedule total", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_2200M, state, file, groups);
    expect(await value(`${d("Atc")}1`)).toBe("XM061");
    expect(await value(`${d("L")}1`)).toBe("101.00");
    expect(await value(`${d("J")}0`)).toBe("400.01");
    expect(await page.locator(`[id="${d("Atc")}2"]`).count()).toBe(0);
    expect(await value(`${P}totalTaxDue`)).toBe("14,774.29");
    expect(await value(`${P}txtTax17`)).toBe("14,774.29");
    expect(await value(`${P}txtTax25`)).toBe("8,274.29");
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("is 1:1 with BIR's form after BIR recomputes Schedule 1 (fixed-row engine, added rows, chain)", async () => {
    const r = await allPageParityCheck(oracle, FORM_2200M, state, file, groups, reopenSchedule, "#formPaper, #modalSched1");
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBeGreaterThan(150);
  }, 120_000);
});
