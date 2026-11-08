import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1601EQ, pickIndex1601EQ, pickList1601EQ, validate1601EQ } from "@/form/form1601eq.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1601EQ:";
const row = (code: string, rate: string, base: string) => ({ [`${P}txtAtcCd`]: code, [`${P}txtTaxRate`]: rate, [`${P}txtTaxBase`]: base });

const state: FormState = {
  [`${P}txtYear`]: "2026",
  [`${P}optQuarter:3`]: "true",
  [`${P}optAmend:N`]: "true",
  [`${P}optWithheld:Y`]: "true",
  [`${P}optCategory:P`]: "true",
  [`${P}txtTIN1`]: "846",
  [`${P}txtTIN2`]: "532",
  [`${P}txtTIN3`]: "107",
  [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043",
  [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN & SONS",
  [`${P}txtLineBus`]: "RETAIL STORE",
  [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}txtTax20`]: "100.00",
  [`${P}txtTax23`]: "50.25",
  [`${P}txtTax26`]: "1.10",
  [`${P}txtTax27`]: "2.20",
  [`${P}txtTax28`]: "0.30",
};
// 6 compute-table rows + 2 "other" rows (7, 8), in BIR's private-list order
const groups: GroupState = {
  atc: [
    row("WI010", " 5.0", "10,000.00"),
    row("WI011", " 10.0", "20,000.00"),
    row("WI100", " 5.0", "3,000.00"),
    row("WI120", " 2.0", "4,000.00"),
    row("WI158", " 1.0", "123,456.78"),
    row("WI160", " 2.0", "6,000.00"),
  ],
  other: [row("WC010", " 10.0", "7,000.00"), row("WC158", " 1.0", "8,000.00")],
};

describe("1601EQ compute + schedule serialization", () => {
  it("rows → 19 (all) and other-tax (7+); 24 = 20..23; 25 = 19−24; 29 = 26..28; 30 = 25+29", () => {
    const out = computeForm(FORM_1601EQ, state, groups);
    expect(out[`${P}txtTotalOtherTax`]).toBe("780.00"); // 700 + 80
    expect(out[`${P}txtTax19`]).toBe("4,864.57"); // 500 + 2,000 + 150 + 80 + 1,234.57 + 120 + 780
    expect(out[`${P}txtTax24`]).toBe("150.25");
    expect(out[`${P}txtTax25`]).toBe("4,714.32");
    expect(out[`${P}txtTax29`]).toBe("3.60");
    expect(out[`${P}txtTax30`]).toBe("4,717.92");
  });

  it("maps rows to picker entries, writes one AtcCode box per entry, and BIR's validated hPartIITableSize", () => {
    expect(pickList1601EQ(state)).toHaveLength(111);
    expect(pickList1601EQ({ [`${P}optCategory:G`]: "true" })).toHaveLength(96);
    expect(pickIndex1601EQ(state, groups)).toEqual([0, 1, 18, 20, 32, 33, 51, 77]);
    const record = formRecords(FORM_1601EQ, state, groups);
    const box = record.filter((r) => r.key.startsWith("AtcCode"));
    expect(box).toHaveLength(111);
    expect(box.filter((r) => r.value === "true").map((r) => r.key)).toEqual(["AtcCode1", "AtcCode2", "AtcCode19", "AtcCode21", "AtcCode33", "AtcCode34", "AtcCode52", "AtcCode78"]);
    expect(record).toContainEqual({ key: "hPartIITableSize", value: "7" });
    expect(record).toContainEqual({ key: `${P}txtTaxbeWithHeld8`, value: "80.00" });
    expect(record).toContainEqual({ key: `${P}txtLineBus`, value: "RETAIL STORE" });
    expect(validate1601EQ(state, groups)).toEqual([]);
  });

  it("writes both address lines into the one txtAddress key, as saveXML does", () => {
    const record = formRecords(FORM_1601EQ, { ...state, [`${P}txtAddress2`]: "BLDG 2" }, groups);
    expect(record).toContainEqual({ key: `${P}txtAddress`, value: "1%20RIZAL%20ST.%2C%20QUEZON%20CITYBLDG%202" });
    expect(record).toContainEqual({ key: `${P}txtAddress2`, value: "" });
  });

  it("flags other rows before the compute table is full, unlisted ATCs, and a misplaced overpayment option", () => {
    const bad = validate1601EQ(state, { atc: [row("ZZ999", "1.0", "1.00")], other: [row("WC010", "10.0", "1.00")] });
    expect(bad.map((p) => p.id)).toEqual([`${P}txtTotalOtherTax`, `${P}txtAtcCd1`, `${P}ifRefund`]); // 30 < 0 here: pick one option
    expect(validate1601EQ({ ...state, [`${P}ifRefund`]: "true" }, groups).map((p) => p.id)).toEqual([`${P}ifRefund`]);
    const refund = { ...state, [`${P}txtTax22`]: "99,999.00" }; // 30 < 0
    expect(validate1601EQ(refund, groups).map((p) => p.id)).toEqual([`${P}ifRefund`]);
    expect(validate1601EQ({ ...refund, [`${P}ifCarriedOver`]: "true" }, groups)).toEqual([]);
  });
});

describe.skipIf(!hasForm("1601EQ"))("native 1601EQ is 1:1 with the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("legacy rebuilds both Part II tables from the AtcCode boxes", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1601EQ, state, "84653210700000-1601EQ-20263.xml", groups);
    for (const i of [1, 19, 52, 78]) expect(await page.locator(`[id="AtcCode${i}"]`).isChecked()).toBe(true);
    expect(await value(`${P}txtAtcCd8`)).toBe("WC158");
    expect(await value(`${P}txtTaxbeWithHeld5`)).toBe("1,234.57");
    expect(await value(`${P}txtTotalOtherTax`)).toBe("780.00");
    expect(await value(`${P}txtTax19`)).toBe("4,864.57");
    expect(await value(`${P}txtTax30`)).toBe("4,717.92");
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("a populated save reopened and recomputed in BIR's form is 1:1", async () => {
    const r = await parityCheck(oracle, FORM_1601EQ, state, "84653210700000-1601EQ-20263-parity.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count);
  }, 120_000);
});
