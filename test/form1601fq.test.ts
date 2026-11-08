import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1601FQ, pickIndex1601FQ, pickList1601FQ, validate1601FQ } from "@/form/form1601fq.ts";
import { hasForm, startOracle } from "./oracle.ts";

const P = "frm1601FQ:";
const row = (code: string, rate: string, base: string) => ({ [`${P}txtAtcCode`]: code, [`${P}txtTaxRate`]: rate, [`${P}txtTaxBase`]: base });

const state: FormState = {
  [`${P}OptQuarter3`]: "true",
  [`${P}AmendedRtn_2`]: "true",
  [`${P}TaxWithheld_1`]: "true",
  [`${P}CatAgent_P`]: "true",
  [`${P}SpecialTax_1`]: "true",
  txtAmtIncomePay0: "10000.00",
  txtRate0: "15.00",
  [`${P}txtTax24`]: "100.00",
  [`${P}txtTax28`]: "50.00",
};
// 6 compute-table rows + 2 "other" rows. WI350 at 20% and WC212 at 25% are the SECOND entries for those codes on
// BIR's private list (the first are 30%), so they must map to AtcCd33 / AtcCd30, not AtcCd9 / AtcCd16.
const groups: GroupState = {
  atc: [
    row("WI226", "20.0", "1000.00"),
    row("WI240", "10.0", "2000.00"),
    row("WI250", "20.0", "3000.00"),
    row("WI260", "20.0", "4000.00"),
    row("WI310", "8.0", "5000.00"),
    row("WI350", "20.0", "6000.00"),
  ],
  other: [row("WI340", "25.0", "7000.00"), row("WC212", "25.0", "8000.00")],
};

describe("1601FQ compute (Part II compute + other tables, treaty Schedule I)", () => {
  it("Part II rows → 20 (all) and other-tax (rows 7+); Schedule I → 21; 22/26/27/31/32 chain", () => {
    const o = computeForm(FORM_1601FQ, state, groups);
    expect(o[`${P}txtTotalOtherTax`]).toBe("3,750.00"); // 1,750 + 2,000
    expect(o[`${P}txtTax20`]).toBe("7,150.00"); // 200+200+600+800+400+1,200 + 3,750
    expect(o.txtReqWithheld0).toBe("1,500.00"); // 10,000 × 15%
    expect(o.txtDvTotalSchedI).toBe("1,500.00");
    expect(o[`${P}txtTax21`]).toBe("1,500.00");
    expect(o[`${P}txtTax22`]).toBe("8,650.00");
    expect(o[`${P}txtTax26`]).toBe("100.00");
    expect(o[`${P}txtTax27`]).toBe("8,550.00");
    expect(o[`${P}txtTax31`]).toBe("50.00");
    expect(o[`${P}txtTax32`]).toBe("8,600.00");
  });

  it("item 13 = No zeroes Schedule I (disableSelTreaty), so 21 is 0", () => {
    const o = computeForm(FORM_1601FQ, { ...state, [`${P}SpecialTax_1`]: "false", [`${P}SpecialTax_2`]: "true" }, groups);
    expect(o.txtAmtIncomePay0).toBe("0.00");
    expect(o.txtReqWithheld0).toBe("0.00");
    expect(o[`${P}txtTax21`]).toBe("0.00");
    expect(o[`${P}txtTax22`]).toBe("7,150.00");
  });

  it("maps each row to its pick-list entry by (code, rate) and serializes one AtcCd per entry", () => {
    expect(pickList1601FQ(state)).toHaveLength(41); // 40 private entries + the treaty "N/A"
    expect(pickList1601FQ({ ...state, [`${P}CatAgent_P`]: "false", [`${P}CatAgent_G`]: "true", [`${P}SpecialTax_1`]: "false" })).toHaveLength(39);
    expect(pickIndex1601FQ(state, groups)).toEqual([0, 1, 2, 3, 4, 32, 6, 29]);
    const record = formRecords(FORM_1601FQ, state, groups).filter((r) => r.key.startsWith("AtcCd"));
    expect(record).toHaveLength(41);
    expect(record.filter((r) => r.value === "true").map((r) => r.key)).toEqual(["AtcCd1", "AtcCd2", "AtcCd3", "AtcCd4", "AtcCd5", "AtcCd7", "AtcCd30", "AtcCd33"]);
  });

  it("flags an ATC that is not on the list, and other-tax rows before the compute table is full", () => {
    const problem = validate1601FQ(state, { atc: [row("ZZ999", "5.0", "1.00")], other: [row("WI340", "25.0", "1.00")] });
    expect(problem.map((p) => p.id)).toEqual(expect.arrayContaining([`${P}txtAtcCode1`, `${P}txtTotalOtherTax`]));
  });
});

describe.skipIf(!hasForm("1601FQ"))("native 1601FQ matches the legacy form (three-table reload probe)", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("legacy rebuilds both Part II tables from AtcCd, refills Schedule I, and recomputes the chain", async () => {
    const full: FormState = {
      ...state,
      [`${P}txtYear`]: "2026",
      [`${P}txtTIN1`]: "846",
      [`${P}txtTIN2`]: "532",
      [`${P}txtTIN3`]: "107",
      [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043",
      [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
    };
    const { page, value, error } = await oracle.openSaved(FORM_1601FQ, full, "84653210700000-1601FQ-2026Q3.xml", groups);
    // the picker boxes came back checked at the right list positions (incl. the duplicate-code entries)
    for (const i of [1, 7, 30, 33]) expect(await page.locator(`[id="AtcCd${i}"]`).isChecked()).toBe(true);
    for (const i of [9, 16]) expect(await page.locator(`[id="AtcCd${i}"]`).isChecked()).toBe(false);
    // getATCCode rebuilt 6 compute rows + 2 "other" rows (ids 7, 8) and loadDataWithATC refilled them
    expect(await value(`${P}txtAtcCode6`)).toBe("WI350");
    expect(await value(`${P}txtAtcCode8`)).toBe("WC212");
    expect(await value(`${P}txtTaxbeWithHeld8`)).toBe("2,000.00");
    expect(await value(`${P}txtTotalOtherTax`)).toBe("3,750.00");
    expect(await value(`${P}txtTax20`)).toBe("7,150.00");
    // Schedule I (static rows) refilled; the reload's getReqWithheldCompute recomputes 21 and the chain
    expect(await value("txtReqWithheld0")).toBe("1,500.00");
    expect(await value(`${P}txtTax21`)).toBe("1,500.00");
    expect(await value(`${P}txtTax27`)).toBe("8,550.00");
    expect(await value(`${P}txtTax32`)).toBe("8,600.00");
    expect(error).toEqual([]);
  }, 120_000);
});
