import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { atcPickList } from "@/form/atc.ts";
import { basicTaxDue, FORM_2200P, RATE_2200P, validate2200P } from "@/form/form2200p.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityProblem } from "./parity.ts";
import { allPageParityCheck } from "./parity-page.ts";

const P = "frm2200P:";
const d = (col: string) => `${P}txtsched1${col}`;

const input: FormState = {
  [`${P}amendedRtn_1`]: "true",
  [`${P}amendedRtn_2`]: "false",
  [`${P}chkPymntManner_1`]: "true",
  [`${P}optTreaty_1`]: "false",
  [`${P}optTreaty_2`]: "true",
  [`${P}txtPlaceofRem`]: "bataan refinery",
  // XP010 lubricating oils, P4.50/L
  [`${P}txtLocally0`]: "1,000.50",
  [`${P}txtImported0`]: "200.25",
  [`${P}txtTaxPaid0`]: "10.00",
  [`${P}txtExports0`]: "5.00",
  // XP060 unleaded premium, P4.35/L — imported only, so no place of removal is copied
  [`${P}txtImported5`]: "3,333.33",
  // XP120 jet fuel, P3.67/L
  [`${P}txtLocally13`]: "12,345.67",
  // XP170 asphalt, P0.56/kg
  [`${P}txtLocally20`]: "999.99",
  // XP140 diesel at P0.00
  [`${P}txtLocally16`]: "50,000.00",
  [`${P}txtTax17A`]: "1,000.00",
  [`${P}txtTax19`]: "250.00",
  [`${P}txtTax21A`]: "100.00",
  [`${P}txtTax21B`]: "10.00",
  [`${P}txtTax21C`]: "1.00",
  [`${P}PayPenalties`]: "true",
  [`${P}txtTax23A`]: "60,000.00",
};
const row = (atc: string, rate: string, cell: Record<string, string>) => ({
  [d("Atc")]: atc, [d("Desc")]: "blend", [d("UnitOfMeasure")]: "liter", [d("AppRate")]: rate, [d("PlaceOfRemoval")]: "subic", ...cell,
});
const groups: GroupState = {
  sched1: [
    row("xp230", "2.50", { [d("Locally")]: "400.00", [d("Imported")]: "0.10", [d("Underbond")]: "3.00" }),
    row("XP240", "1.25", { [d("Imported")]: "333.33", [d("Others")]: "1.00" }),
  ],
};

describe("2200P compute (per-commodity rates, added rows, items 16–24)", () => {
  it("the fixed rows' rates are BIR's atcCodes.xml rates (2200P has no loadATC; the rows hard-code them)", () => {
    const listed = new Map([...atcPickList("2200P", ""), ...atcPickList("2200P", "P")].map((e) => [e.atc_code, parseFloat(e.rate.replace(/^<!--P/, ""))]));
    expect(RATE_2200P.map(([atc, rate]) => [atc, listed.get(atc)])).toEqual(RATE_2200P);
  });

  it("per row: TaxRem = Locally + Imported, Conditional = Σ tax-paid columns, BasicTaxDue = TaxRem × rate", () => {
    const o = computeForm(FORM_2200P, input, groups);
    expect(o[`${P}txtTaxRem0`]).toBe("1,200.75");
    expect(o[`${P}txtConditional0`]).toBe("15.00");
    expect(o[`${P}txtBasicTaxDue0`]).toBe("5,403.38"); // 1,200.75 × 4.5 = 5,403.375
    expect(o[`${P}txtPlaceOfRemoval0`]).toBe("bataan refinery");
    expect(o[`${P}txtPlaceOfRemoval5`] ?? "").toBe(""); // Locally = 0
    expect(o[`${P}txtBasicTaxDue5`]).toBe("14,499.99"); // 3,333.33 × 4.35 = 14,499.9855
    expect(o[`${P}txtBasicTaxDue13`]).toBe("45,308.61"); // 12,345.67 × 3.67 = 45,308.6089
    expect(o[`${P}txtBasicTaxDue20`]).toBe("559.99"); // 999.99 × 0.56 = 559.9944
    expect(o[`${P}txtBasicTaxDue16`]).toBe("0.00");
    expect(basicTaxDue(100, 0.05)).toBe(5); // P1.00 of processed gas at P0.05
  });

  it("added rows use their typed rate; Σ BasicTaxDue → total → 16 → chain", () => {
    const rec = new Map(formRecords(FORM_2200P, input, groups).map((r) => [r.key, r.value]));
    expect(rec.get(`${d("TaxRem")}0`)).toBe("400.10");
    expect(rec.get(`${d("BasicTaxDue")}0`)).toBe("1,000.25");
    expect(rec.get(`${d("Conditional")}0`)).toBe("3.00");
    expect(rec.get(`${d("BasicTaxDue")}1`)).toBe("416.66"); // 333.33 × 1.25 = 416.6625
    expect(rec.get(`${d("Atc")}0`)).toBe("XP230"); // capital()
    const o = computeForm(FORM_2200P, input, groups);
    // 5,403.38 + 14,499.99 + 45,308.61 + 559.99 + 1,000.25 + 416.66
    expect(o[`${P}totalTaxDue`]).toBe("67,188.88");
    expect(o[`${P}txtTax16`]).toBe("67,188.88");
    expect(o[`${P}txtTax17C`]).toBe("1,000.00");
    expect(o[`${P}txtTax18`]).toBe("66,188.88");
    expect(o[`${P}txtTax20`]).toBe("65,938.88");
    expect(o[`${P}txtTax21D`]).toBe("111.00");
    expect(o[`${P}txtTax22`]).toBe("66,049.88");
    expect(o[`${P}txtTax23B`]).toBe("111.00");
    expect(o[`${P}txtTax23C`]).toBe("60,111.00");
    expect(o[`${P}txtTax24`]).toBe("5,938.88");
  });

  it("gates: an original return zeroes 19; unticked penalties leave 23B 0.00", () => {
    const o = computeForm(FORM_2200P, { ...input, [`${P}amendedRtn_1`]: "false", [`${P}amendedRtn_2`]: "true", [`${P}PayPenalties`]: "false" }, groups);
    expect(o[`${P}txtTax19`]).toBe("0.00");
    expect(o[`${P}txtTax23B`]).toBe("0.00");
    expect(o[`${P}txtTax24`]).toBe("6,299.88"); // 66,188.88 + 111 − 60,000
  });

  it("isValidDataOnSched1: XP prefix, and ATC + rate on rows after the first", () => {
    expect(validate2200P(input, groups).filter((p) => p.id.includes("sched1"))).toEqual([]);
    const bad = validate2200P(input, { sched1: [row("XM010", "1.00", {}), row("", "1.00", {}), row("XP9", "0.00", {})] });
    expect(bad.map((p) => p.id).filter((id) => id.includes("sched1"))).toEqual([`${d("Atc")}0`, `${d("Atc")}1`, `${d("AppRate")}2`]);
  });
});

describe.skipIf(!hasForm("2200P"))("native 2200P matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  const state: FormState = {
    ...input,
    [`${P}txtMonth1`]: "06", [`${P}txtDate`]: "30", [`${P}txtForYr`]: "2019",
    [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
    [`${P}txtRDOCode`]: "043", [`${P}taxpayerName`]: "DELA CRUZ, JUAN", [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY",
  };
  const file = "84653210700000-2200P-06302019.xml";
  // A filer reopening the return opens Schedule 1, tabs through it and clicks OK (BIR's reload never re-opens it).
  const reopenSchedule = `showSched1();
    var box = document.getElementById('modalSched1').getElementsByTagName('input');
    for (var pass = 0; pass < 2; pass++) for (var i = 0; i < box.length; i++)
      if (box[i].type === 'text' && !box[i].disabled) box[i].dispatchEvent(new FocusEvent('blur'));
    sched1OK();`;

  it("reopens with every added row rebuilt from its sched1Chk box and item 16 = the schedule total", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_2200P, state, file, groups);
    expect(await value(`${d("Atc")}1`)).toBe("XP240");
    expect(await value(`${d("BasicTaxDue")}1`)).toBe("416.66");
    expect(await value(`${P}txtBasicTaxDue13`)).toBe("45,308.61");
    expect(await page.locator(`[id="${d("Atc")}2"]`).count()).toBe(0);
    expect(await value(`${P}totalTaxDue`)).toBe("67,188.88");
    expect(await value(`${P}txtTax16`)).toBe("67,188.88");
    expect(await value(`${P}txtTax24`)).toBe("5,938.88");
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("BIR reload bug (not replicated): a Prepayment return reopens with item 1 overwritten to today, month + 1", async () => {
    const prepay = { ...state, [`${P}chkPymntManner_1`]: "false", [`${P}chkPymntManner_2`]: "true" };
    const { page, value, error } = await oracle.openSaved(FORM_2200P, prepay, file, {});
    const now = new Date();
    // loadData replays chkPymntManner_2's onclick → dateMonthYear(): selectedIndex = getMonth() + 1 (options start at "01")
    const next = now.getMonth() === 11 ? "" : String(now.getMonth() + 2).padStart(2, "0");
    expect(await value(`${P}txtMonth1`)).toBe(next);
    expect(await value(`${P}txtForYr`)).toBe(String(now.getFullYear()));
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("is 1:1 with BIR's form after BIR recomputes Schedule 1 (rate engine, added rows, chain)", async () => {
    const r = await allPageParityCheck(oracle, FORM_2200P, state, file, groups, reopenSchedule, "#formPaper, #modalSched1");
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBeGreaterThan(340);
  }, 120_000);
});
