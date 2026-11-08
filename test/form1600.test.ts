import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1600, pickIndex1600, pickList1600, validate1600 } from "@/form/form1600.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1600:";
const row = (code: string, rate: string, base: string) => ({ [`${P}txtAtcCd`]: code, [`${P}txtTaxRate`]: rate, [`${P}txtTaxBase`]: base });
const payee = (tin: string, name: string, atc: string, nature: string, amount: string, rate: string) => ({
  [`${P}dtSched:txtTin`]: tin,
  [`${P}dtSched:txtFullname`]: name,
  [`${P}dtSched:drpAtcCode:{i}`]: atc,
  [`${P}dtSched:naturePayment`]: nature,
  [`${P}dtSched:amount`]: amount,
  [`${P}dtSched:txtRatePercent`]: rate,
});

const state: FormState = {
  [`${P}j_id201`]: "10",
  [`${P}txtYear`]: "2026",
  [`${P}j_id217:_1`]: "true", // amended → 15 open
  [`${P}j_id252:_1`]: "true",
  [`${P}txtTIN1`]: "846",
  [`${P}txtTIN2`]: "532",
  [`${P}txtTIN3`]: "107",
  [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043",
  [`${P}txtPayerName`]: "DELA CRUZ, JUAN & SONS",
  [`${P}txtLineBus`]: "RETAIL STORE",
  [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}j_id392:_1`]: "true", // private
  [`${P}rdTreaty:_1`]: "true", // special law → "N/A" on both pickers
  [`${P}selTreaty`]: "1",
  [`${P}txtTax15`]: "100.00",
  [`${P}txtTax17A`]: "10.10",
  [`${P}txtTax17B`]: "20.20",
  [`${P}txtTax17C`]: "0.30",
};
// Part II in BIR's private-list order; WB080 recurs (3% then 1%), so the 1% row is entry 11. N/A is entry 15.
const groups: GroupState = {
  atc: [row("WV040", " 12.0", "10,000.00"), row("WB080", " 3.0", "2,000.00"), row("WB080", " 1.0", "1,234.50"), row("N/A", "5.00", "4,000.00")],
  dtSched: [
    payee("123456789000", "SANTOS TRADING", "WV040", "VAT ON GOVERNMENT PURCHASES ", "10,000.00", " 12.0"),
    payee("987654321000", "REYES AND CO", "WB080", "PERCENTAGE TAX ", "2,000.00", " 3.0"),
  ],
};

describe("1600 compute (Part II ATC table + Schedule II)", () => {
  it("Part II → 14; 16 = 14 − 15; 17D; 18 = 16 + 17D; Schedule II → its own total", () => {
    const out = computeForm(FORM_1600, state, groups);
    expect(out[`${P}txtTax14`]).toBe("1,472.35"); // 1,200 + 60 + 12.35 (12.345 rounds up) + 200
    expect(out[`${P}txtTax16`]).toBe("1,372.35");
    expect(out[`${P}txtTax17D`]).toBe("30.60");
    expect(out[`${P}txtTax18`]).toBe("1,402.95");
    expect(out[`${P}dtSched:TotaltaxWithheld`]).toBe("1,260.00");
  });

  it("15 is zeroed on an original return", () => {
    const out = computeForm(FORM_1600, { ...state, [`${P}j_id217:_1`]: "false", [`${P}j_id217:_2`]: "true" }, groups);
    expect(out[`${P}txtTax15`]).toBe("0.00");
    expect(out[`${P}txtTax16`]).toBe("1,472.35");
  });

  it("picker = 1600 records minus 1600WP's; one AtcCode box and one SchedIIAtcCde radio per entry", () => {
    expect(pickList1600(state)).toHaveLength(15); // 14 private + N/A
    expect(pickList1600({ [`${P}j_id392:_2`]: "true" })).toHaveLength(69);
    expect(pickIndex1600(state, groups)).toEqual([0, 6, 10, 14]);
    const record = formRecords(FORM_1600, state, groups);
    expect(record.filter((r) => r.key.startsWith("AtcCode") && r.value === "true").map((r) => r.key)).toEqual(["AtcCode1", "AtcCode7", "AtcCode11", "AtcCode15"]);
    expect(record.filter((r) => r.key.startsWith("SchedIIAtcCde"))).toHaveLength(15);
    expect(record).toContainEqual({ key: `${P}dtSched:drpAtcCode:2`, value: "WB080" });
    expect(record).toContainEqual({ key: "hPartIITableSize", value: "4" });
    expect(validate1600(state, groups)).toEqual([]);
  });

  it("flags a 1600WP-only ATC, an incomplete payee row, and item 4 = No", () => {
    const bad = validate1600({ ...state, [`${P}j_id252:_1`]: "false" }, { atc: [row("WB193", "4.0", "1.00")], dtSched: [payee("123-456", "", "ZZ", "", "0.00", "1.0"), payee("123456789000", "A & B", "WV040", "VAT ", "1.00", " 12.0")] });
    expect(bad.map((p) => p.id)).toEqual([`${P}j_id252:_1`, `${P}txtAtcCd1`, `${P}dtSched:txtTin1`, `${P}dtSched:txtFullname1`, `${P}dtSched:drpAtcCode:1`, `${P}dtSched:amount1`, `${P}dtSched:txtFullname2`]);
  });
});

describe.skipIf(!hasForm("1600"))("native 1600 is 1:1 with the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("legacy rebuilds Part II from the AtcCode boxes and refills Schedule II", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1600, state, "84653210700000-1600-102026.xml", groups);
    for (const i of [1, 7, 11, 15]) expect(await page.locator(`[id="AtcCode${i}"]`).isChecked()).toBe(true);
    expect(await value(`${P}txtAtcCd4`)).toBe("N/A");
    expect(await value(`${P}txtTaxbeWithHeld3`)).toBe("12.35");
    expect(await value(`${P}txtTax14`)).toBe("1,472.35");
    expect(await value(`${P}dtSched:txtFullname2`)).toBe("REYES AND CO");
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("a populated save reopened and recomputed in BIR's form is 1:1", async () => {
    const r = await parityCheck(oracle, FORM_1600, state, "84653210700000-1600-102026-parity.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count);
  }, 120_000);
});
