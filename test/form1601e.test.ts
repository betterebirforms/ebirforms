import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1601E, pickIndex1601E, pickList1601E, validate1601E } from "@/form/form1601e.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1601E:";
const row = (code: string, rate: string, base: string) => ({ [`${P}txtAtcCd`]: code, [`${P}txtTaxRate`]: rate, [`${P}txtTaxBase`]: base });

const identity: FormState = {
  [`${P}txtYear`]: "2026",
  [`${P}txtTIN1`]: "846",
  [`${P}txtTIN2`]: "532",
  [`${P}txtTIN3`]: "107",
  [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043",
  [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN & SONS",
};
const state: FormState = {
  ...identity,
  [`${P}j_id201`]: "10",
  [`${P}j_id217:_1`]: "true", // amended → 15A open
  [`${P}j_id252:_1`]: "true", // any taxes withheld: Yes
  [`${P}j_id392:_1`]: "true", // private agent
  [`${P}j_id398:_1`]: "true", // special law: Yes → "N/A" on the picker
  [`${P}j_id402`]: "1",
  [`${P}txtTax15A`]: "100.00",
  [`${P}txtTax15B`]: "50.50",
  [`${P}txtTax17A`]: "10.10",
  [`${P}txtTax17B`]: "20.20",
  [`${P}txtTax17C`]: "0.30",
};
// In BIR's list order. WC158 and WC010 recur on the private list (its 1601EQ half), so the SECOND WC010 row maps to
// entry 145, not 1; "N/A" is the treaty entry enableSelTreaty appends at 205.
const groups: GroupState = {
  atc: [row("WC010", " 10.0", "10,000.00"), row("WC158", " 1.0", "123,456.78"), row("WI160", " 2.0", "5,000.00"), row("WC010", " 10.0", "1,000.00"), row("N/A", "3.00", "2,000.00")],
};

describe("1601E compute graph (exact centavo)", () => {
  it("Part II rows → 14; 15C = 15A+15B, 16 = 14−15C, 17D = 17A+17B+17C, 18 = 16+17D", () => {
    const out = computeForm(FORM_1601E, state, groups);
    expect(out[`${P}txtTax14`]).toBe("2,494.57"); // 1,000 + 1,234.57 + 100 + 100 + 60
    expect(out[`${P}txtTax15C`]).toBe("150.50");
    expect(out[`${P}txtTax16`]).toBe("2,344.07");
    expect(out[`${P}txtTax17D`]).toBe("30.60");
    expect(out[`${P}txtTax18`]).toBe("2,374.67");
  });

  it("15A is zeroed on an original return; the special-law select resets when item 13 is No", () => {
    const out = computeAll(FORM_1601E, { ...state, [`${P}j_id217:_1`]: "false", [`${P}j_id217:_2`]: "true", [`${P}j_id398:_1`]: "false" });
    expect(out[`${P}txtTax15A`]).toBe("0.00");
    expect(out[`${P}txtTax15C`]).toBe("50.50");
    expect(out[`${P}j_id402`]).toBe("");
  });

  it("maps rows to picker entries (duplicates included) and writes one AtcCode box per entry", () => {
    expect(pickList1601E(state)).toHaveLength(205); // 204 private entries (1601E + 1601EQ records) + N/A
    expect(pickList1601E({ [`${P}j_id392:_2`]: "true" })).toHaveLength(174);
    expect(pickIndex1601E(state, groups)).toEqual([0, 10, 58, 144, 204]);
    const box = formRecords(FORM_1601E, state, groups).filter((r) => r.key.startsWith("AtcCode"));
    expect(box).toHaveLength(205);
    expect(box.filter((r) => r.value === "true").map((r) => r.key)).toEqual(["AtcCode1", "AtcCode11", "AtcCode59", "AtcCode145", "AtcCode205"]);
    expect(validate1601E(state, groups)).toEqual([]);
  });

  it("flags an unlisted ATC, rows out of BIR's list order, and rows with item 4 = No", () => {
    const bad = validate1601E({ ...state, [`${P}j_id252:_1`]: "false" }, { atc: [row("WI160", "2.0", "1.00"), row("WC010", "10.0", "1.00"), row("ZZ999", "1.0", "1.00")] });
    expect(bad.map((p) => p.id)).toEqual([`${P}j_id252:_1`, `${P}txtAtcCd3`, `${P}txtAtcCd1`]);
  });
});

describe.skipIf(!hasForm("1601E"))("native 1601E is 1:1 with the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("legacy rebuilds Part II from the AtcCode boxes and recomputes the same totals", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1601E, state, "84653210700000-1601E-102026.xml", groups);
    for (const i of [1, 11, 59, 145, 205]) expect(await page.locator(`[id="AtcCode${i}"]`).isChecked()).toBe(true);
    expect(await value(`${P}txtAtcCd4`)).toBe("WC010");
    expect(await value(`${P}txtTaxbeWithHeld2`)).toBe("1,234.57");
    expect(await value(`${P}txtTaxpayerName`)).toBe("DELA CRUZ, JUAN & SONS");
    expect(error).toEqual([]);
    await page.close();
  }, 120_000);

  it("a populated save reopened and recomputed in BIR's form is 1:1", async () => {
    const r = await parityCheck(oracle, FORM_1601E, state, "84653210700000-1601E-102026-parity.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count);
  }, 120_000);
});
