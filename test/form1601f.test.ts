import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1601F, pickIndex1601F, pickList1601F, validate1601F } from "@/form/form1601f.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1601F:";
const row = (code: string, rate: string, base: string) => ({ [`${P}txtAtcCode`]: code, [`${P}txtTaxRate`]: rate, [`${P}txtTaxBase`]: base });
const sched = (treaty: string, atc: string, amount: string, rate: string) => ({ drpTreatyCode: treaty, drpATCCode: atc, txtAmtIncomePay: amount, txtRate: rate });

const state: FormState = {
  [`${P}j_id201`]: "10",
  [`${P}txtYear`]: "2026",
  [`${P}AmendedRtn_1`]: "true", // amended → 17 open
  [`${P}TaxWithheld_1`]: "true",
  [`${P}txtTIN1`]: "846",
  [`${P}txtTIN2`]: "532",
  [`${P}txtTIN3`]: "107",
  [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043",
  [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN & SONS",
  [`${P}txtLineBus`]: "RETAIL STORE",
  [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}CatAgent_P`]: "true",
  [`${P}SpecialTax_1`]: "true",
  [`${P}drpSpecialTax`]: "2", // international tax treaty
  [`${P}txtTax17`]: "50.00",
  [`${P}txtTax19A`]: "10.10",
  [`${P}txtTax19B`]: "20.20",
  [`${P}txtTax19C`]: "0.30",
};
// Part II in BIR's private-list order. WC212 at 25% and WI350 at 20% are the SECOND entries for those codes
// (the first are 30%), so they map to AtcCd48 / AtcCd51.
const groups: GroupState = {
  atc: [row("WI202", " 10.0", "1,000.00"), row("WI224", " 20.0", "2,000.00"), row("WC212", " 25.0", "3,000.00"), row("WI350", " 20.0", "1,234.55")],
  schedI: [sched("JP", "WI202", "10,000.00", "10.00"), sched("NA", "NA", "5,000.00", "15.00")],
};

describe("1601F compute (Part II ATC table + Schedule I)", () => {
  it("Part II → 14; Schedule I → txtDvTotalSchedI → 15; 16=14+15; 18=16−17; 20=18+19D", () => {
    const out = computeForm(FORM_1601F, state, groups);
    expect(out[`${P}txtTax14`]).toBe("1,496.91"); // 100 + 400 + 750 + 246.91
    expect(out.txtDvTotalSchedI).toBe("1,750.00"); // 1,000 + 750
    expect(out[`${P}txtTax15`]).toBe("1,750.00");
    expect(out[`${P}txtTax16`]).toBe("3,246.91");
    expect(out[`${P}txtTax18`]).toBe("3,196.91");
    expect(out[`${P}txtTax19D`]).toBe("30.60");
    expect(out[`${P}txtTax20`]).toBe("3,227.51");
  });

  it("17 is zeroed on an original return", () => {
    const out = computeForm(FORM_1601F, { ...state, [`${P}AmendedRtn_1`]: "false", [`${P}AmendedRtn_2`]: "true" }, groups);
    expect(out[`${P}txtTax17`]).toBe("0.00");
    expect(out[`${P}txtTax18`]).toBe("3,246.91");
  });

  it("maps Part II rows to picker entries and writes one AtcCd box per entry; no Schedule I size field", () => {
    expect(pickList1601F(state)).toHaveLength(58); // 1601F + 1601FQ private records
    expect(pickList1601F({ [`${P}CatAgent_G`]: "true" })).toHaveLength(72);
    expect(pickIndex1601F(state, groups)).toEqual([0, 2, 47, 50]);
    const record = formRecords(FORM_1601F, state, groups);
    expect(record.filter((r) => r.key.startsWith("AtcCd") && r.value === "true").map((r) => r.key)).toEqual(["AtcCd1", "AtcCd3", "AtcCd48", "AtcCd51"]);
    expect(record.some((r) => r.key === "hSchedISize")).toBe(false);
    expect(record).toContainEqual({ key: "drpTreatyCode0", value: "JP" });
    expect(record).toContainEqual({ key: "chxSchedI1", value: "false" });
    expect(validate1601F(state, groups)).toEqual([]);
  });

  it("flags N/A in Part II, Schedule I without treaty relief, and incomplete Schedule I rows", () => {
    const bad = validate1601F({ ...state, [`${P}SpecialTax_1`]: "false", [`${P}SpecialTax_2`]: "true" }, { atc: [row("N/A", "0.0", "1.00")], schedI: [sched("-", "ZZ999", "0.00", "1.00")] });
    expect(bad.map((p) => p.id)).toEqual([`${P}txtAtcCode1`, `${P}SpecialTax_1`, "drpTreatyCode0", "drpATCCode0", "txtAmtIncomePay0"]);
  });
});

describe.skipIf(!hasForm("1601F"))("native 1601F is 1:1 with the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("the legacy 1601F rebuilds Part II from AtcCd and Schedule I from its markers, and recomputes the chain", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1601F, state, "84653210700000-1601F-102026.xml", groups);
    for (const i of [1, 3, 48, 51]) expect(await page.locator(`[id="AtcCd${i}"]`).isChecked()).toBe(true);
    expect(await value(`${P}txtAtcCode4`)).toBe("WI350");
    expect(await value(`${P}txtTaxbeWithHeld4`)).toBe("246.91");
    expect(await value("drpTreatyCode0")).toBe("JP");
    expect(await value("txtReqWithheld1")).toBe("750.00");
    expect(await value(`${P}txtTax15`)).toBe("1,750.00");
    expect(await value(`${P}txtTax20`)).toBe("3,227.51");
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("a populated save reopened and recomputed in BIR's form is 1:1", async () => {
    const r = await parityCheck(oracle, FORM_1601F, state, "84653210700000-1601F-102026-parity.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count);
  }, 120_000);
});
