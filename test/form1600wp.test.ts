import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1600WP, pickIndex1600WP, schedWithheld1600WP, validate1600WP } from "@/form/form1600wp.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1600WP:";
const row = (code: string, rate: string, base: string) => ({ [`${P}txtAtcCode`]: code, [`${P}txtTaxRate`]: rate, [`${P}txtTaxBase`]: base });
const payee = (tin: string, name: string, atc: string, nature: string, amount: string, rate: string) => ({
  [`${P}dtSched:txtTin`]: tin,
  [`${P}dtSched:txtFullname`]: name,
  [`${P}dtSched:drpAtcCode`]: atc,
  [`${P}dtSched:naturePayment`]: nature,
  [`${P}dtSched:amount`]: amount,
  [`${P}dtSched:txtRatePercent`]: rate,
});

const state: FormState = {
  [`${P}DateWithholdingMonth`]: "10",
  [`${P}DateWithholdingDay`]: "15",
  [`${P}DateWithholdingYear`]: "2026",
  [`${P}AmendedReturn_1`]: "true", // amended → 13 open
  [`${P}AnyTaxHeld_1`]: "true",
  [`${P}CategoryAgent_P`]: "true",
  [`${P}txtTIN1`]: "846",
  [`${P}txtTIN2`]: "532",
  [`${P}txtTIN3`]: "107",
  [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043",
  [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN & SONS",
  [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}txtTax13`]: "200.00",
  [`${P}txtTax15A`]: "10.10",
  [`${P}txtTax15B`]: "20.20",
  [`${P}txtTax15C`]: "0.30",
};
const groups: GroupState = {
  atc: [row("WB193", " 4.0", "10,000.00"), row("WB194", " 10.0", "1,234.55")],
  dtSched: [
    payee("111222333000", "WINNER A CO.", "WB193", "PRIZES ", "10,000.00", " 4.0"),
    payee("444555666000", "WINNER B", "WB194", "WINNINGS ", "1,234.55", " 10.0"),
  ],
};

describe("1600WP compute (Part II ATC table + Schedule II)", () => {
  it("Part II → 12; 14 = 12 − 13; 15D; 16 = 15D + 14; Schedule II → its own total", () => {
    const out = computeForm(FORM_1600WP, state, groups);
    expect(out[`${P}txtTax12`]).toBe("523.46"); // 400 + 123.455 → 123.46
    expect(out[`${P}txtTax14`]).toBe("323.46");
    expect(out[`${P}txtTax15D`]).toBe("30.60");
    expect(out[`${P}txtTax16`]).toBe("354.06");
    expect(out[`${P}dtSched:TotaltaxWithheld`]).toBe("523.45"); // BIR's toFixed: 1234.55 × 0.1 = 123.4549… → 123.45
  });

  it("replicates computeDtShedTaxWithheld's rate-fraction rounding: 0.5% withholds at 1%", () => {
    expect(schedWithheld1600WP("10,000.00", "0.5")).toBe(10_000); // 10,000 × 0.01, not × 0.005
    expect(schedWithheld1600WP("10,000.00", " 4.0")).toBe(40_000);
    expect(schedWithheld1600WP("", " 4.0")).toBe(0);
  });

  it("13 is zeroed on an original return", () => {
    const out = computeForm(FORM_1600WP, { ...state, [`${P}AmendedReturn_1`]: "false", [`${P}AmendedReturn_2`]: "true" }, groups);
    expect(out[`${P}txtTax13`]).toBe("0.00");
    expect(out[`${P}txtTax14`]).toBe("523.46");
  });

  it("writes the AtcCd boxes and the SchedIIAtcCde radios; flags unlisted ATCs and garbling names", () => {
    expect(pickIndex1600WP(state, groups)).toEqual([0, 1]);
    const record = formRecords(FORM_1600WP, state, groups);
    expect(record.filter((r) => /^(AtcCd|SchedIIAtcCde)\d/.test(r.key))).toEqual([
      { key: "AtcCd1", value: "true" },
      { key: "AtcCd2", value: "true" },
      { key: "SchedIIAtcCde1", value: "false" },
      { key: "SchedIIAtcCde2", value: "false" },
    ]);
    expect(validate1600WP(state, groups)).toEqual([]);
    const government = { ...state, [`${P}CategoryAgent_P`]: "false", [`${P}CategoryAgent_G`]: "true" };
    const bad = validate1600WP(government, { atc: [row("WB193", "4.0", "1.00")], dtSched: [payee("111-222", "A & B", "WB193", "X", "1.00", "4.0")] });
    expect(bad.map((p) => p.id)).toEqual([`${P}txtAtcCode1`, `${P}dtSched:txtTin1`, `${P}dtSched:txtFullname1`, `${P}dtSched:drpAtcCode1`]);
  });
});

describe.skipIf(!hasForm("1600WP"))("native 1600WP is 1:1 with the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("the legacy 1600WP rebuilds Part II from AtcCd and refills Schedule II", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1600WP, state, "84653210700000-1600WP-102026.xml", groups);
    expect(await page.locator('[id="AtcCd2"]').isChecked()).toBe(true);
    expect(await value(`${P}txtAtcCode2`)).toBe("WB194");
    expect(await value(`${P}txtTaxbeWithHeld2`)).toBe("123.46");
    expect(await value(`${P}dtSched:txtFullname1`)).toBe("WINNER A CO.");
    expect(await value(`${P}txtTax12`)).toBe("523.46");
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("a populated save reopened and recomputed in BIR's form is 1:1", async () => {
    const r = await parityCheck(oracle, FORM_1600WP, state, "84653210700000-1600WP-102026-parity.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count);
  }, 120_000);
});
