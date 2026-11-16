import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, computeForm, formRecords, groupsFromSavefile, type FormState, type GroupRow, type GroupState } from "@/form/schema.ts";
import { FORM_1601Cv2018, validate1601Cv2018 } from "@/form/form1601cv2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1601c:";
const S = "frm1601c:sched1:";

describe("1601Cv2018 compute graph", () => {
  it("21=15+…+20, 22=14−21, 31=27−30, 35=32+33+34, 36=31+35", () => {
    const out = computeAll(FORM_1601Cv2018, {
      [`${P}txtTax14`]: "5,000.00",
      [`${P}txtTax15`]: "100.00",
      [`${P}txtTax16`]: "200.00",
      [`${P}txtTax17`]: "50.00",
      [`${P}txtTax25`]: "10.00",
      [`${P}txtTax26`]: "20.00",
      [`${P}txtTax28`]: "5.00",
      [`${P}txtTax29`]: "5.00",
      [`${P}txtTax32`]: "1.10",
      [`${P}txtTax33`]: "2.20",
      [`${P}txtTax34`]: "0.30",
    });
    expect(out[`${P}txtTax21`]).toBe("350.00"); // 100+200+50
    expect(out[`${P}txtTax22`]).toBe("4,650.00"); // 5000−350
    expect(out[`${P}txtTax27`]).toBe("30.00"); // 10+20
    expect(out[`${P}txtTax30`]).toBe("10.00"); // 5+5
    expect(out[`${P}txtTax31`]).toBe("20.00"); // 30−10
    expect(out[`${P}txtTax35`]).toBe("3.60"); // 1.10+2.20+0.30
    expect(out[`${P}txtTax36`]).toBe("23.60"); // 20+3.60
  });
});

describe.skipIf(!hasForm("1601Cv2018"))("native 1601Cv2018 is byte-compatible with the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("legacy 1601Cv2018 shows the same values and computed totals", async () => {
    const state: FormState = {
      [`${P}txtMonth`]: "10",
      [`${P}txtYear`]: "2026",
      [`${P}txtTIN1`]: "846",
      [`${P}txtTIN2`]: "532",
      [`${P}txtTIN3`]: "107",
      [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043",
      [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
      [`${P}txtTax14`]: "5,000.00",
      [`${P}txtTax15`]: "100.00",
      [`${P}txtTax16`]: "200.00",
      [`${P}txtTax17`]: "50.00",
      [`${P}txtTax25`]: "10.00",
      [`${P}txtTax28`]: "5.00",
      [`${P}txtTax29`]: "5.00",
      [`${P}txtTax32`]: "1.10",
      [`${P}txtTax33`]: "2.20",
      [`${P}txtTax34`]: "0.30",
    };
    expect(validate1601Cv2018(state)).toEqual([]);
    const { value, error } = await oracle.openSaved(FORM_1601Cv2018, state, "84653210700000-1601Cv2018-102026.xml", { sched1: [{ [`${S}txtShouldTaxDue`]: "20.00" }] }); // item 26 is the schedule total (computeSchedule1)
    expect(await value(`${P}txtTax21`)).toBe("350.00");
    expect(await value(`${P}txtTax36`)).toBe("23.60");
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR's form, items 18-20 included in 21 (computeTxt21)", async () => {
    const state: FormState = {
      [`${P}txtMonth`]: "09", [`${P}txtYear`]: "2026", [`${P}TaxWithheld_1`]: "true", [`${P}AmendedRtn_2`]: "true",
      [`${P}CatAgent_P`]: "true", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107",
      [`${P}txtBranchCode`]: "00000", [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
      [`${P}txtTax14`]: "500,000.00", [`${P}txtTax15`]: "100.00", [`${P}txtTax16`]: "200.00", [`${P}txtTax17`]: "50.00",
      [`${P}txtTax18`]: "1,000.00", [`${P}txtTax19`]: "2,000.00", [`${P}txtTax20`]: "3,000.00",
      [`${P}txtTax23`]: "40,000.00", [`${P}txtTax25`]: "60,000.00", [`${P}txtTax32`]: "100.00",
    };
    const o = computeAll(FORM_1601Cv2018, state);
    expect(o[`${P}txtTax21`]).toBe("6,350.00");
    expect(o[`${P}txtTax24`]).toBe("453,650.00");
    const r = await parityCheck(oracle, FORM_1601Cv2018, state, "84653210700000-1601Cv2018-092026.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});

// Schedule 1 (prior-month adjustments): BIR's "Add" / "Delete" rows, 0-indexed, 3 on the blank page
const sched1: GroupRow[] = [
  { chkScheduleDelete: "false", [`${S}txtMonthYear`]: "08/2026", [`${S}txtDatePaid`]: "09/10/2026", [`${S}txtBankCode`]: "BDO", [`${S}txtNumber`]: "R123", [`${S}txtTaxPaid`]: "1,000.00", [`${S}txtShouldTaxDue`]: "1,500.50" },
  { chkScheduleDelete: "false", [`${S}txtMonthYear`]: "07/2026", [`${S}txtDatePaid`]: "08/10/2026", [`${S}txtBankCode`]: "LBP", [`${S}txtNumber`]: "R124", [`${S}txtTaxPaid`]: "2,000.00", [`${S}txtShouldTaxDue`]: "1,800.25" },
  { chkScheduleDelete: "false", [`${S}txtMonthYear`]: "06/2026", [`${S}txtDatePaid`]: "07/10/2026", [`${S}txtBankCode`]: "BPI", [`${S}txtNumber`]: "R125", [`${S}txtTaxPaid`]: "0.00", [`${S}txtShouldTaxDue`]: "300.00" },
  { chkScheduleDelete: "false", [`${S}txtMonthYear`]: "05/2026", [`${S}txtDatePaid`]: "06/10/2026", [`${S}txtBankCode`]: "MBT", [`${S}txtNumber`]: "R126", [`${S}txtTaxPaid`]: "50.00", [`${S}txtShouldTaxDue`]: "75.10" },
];
const filed: FormState = {
  [`${P}txtMonth`]: "09", [`${P}txtYear`]: "2026", [`${P}TaxWithheld_1`]: "true", [`${P}AmendedRtn_2`]: "true", [`${P}CatAgent_P`]: "true",
  [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000", [`${P}txtRDOCode`]: "043",
  [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN", [`${P}txtTax14`]: "5,000.00", [`${P}txtTax15`]: "100.00", [`${P}txtTax25`]: "10.00",
};

describe("1601Cv2018 Schedule 1 (Add / Delete rows)", () => {
  const record = (rows: GroupRow[]) => formRecords(FORM_1601Cv2018, filed, { sched1: rows });
  const value = (rows: GroupRow[], key: string) => record(rows).find((r) => r.key === key)?.value;
  it("adjustment = should have paid - paid per row; the total is the schedule total and item 26", () => {
    expect(value(sched1, `${S}txtAdjustments0`)).toBe("500.50");
    expect(value(sched1, `${S}txtAdjustments1`)).toBe("-199.75"); // BIR shows a negative adjustment with its minus sign
    expect(value(sched1, `${S}txtAdjustments3`)).toBe("25.10");
    expect(value(sched1, `${S}txtTotal1`)).toBe("625.85");
    expect(value(sched1, `${P}txtTax26`)).toBe("625.85");
    expect(computeForm(FORM_1601Cv2018, filed, { sched1 })[`${P}txtTax27`]).toBe("635.85"); // 25 + 26
  });
  it("rows past the 3 on the blank page are saved after them; fewer rows drop the template rows", () => {
    const key = record(sched1).map((r) => r.key);
    expect(key).toContain("chkScheduleDelete3");
    expect(value(sched1, `${S}txtMonthYear3`)).toBe("05/2026");
    const one = record(sched1.slice(0, 1)).map((r) => r.key);
    expect(one).toContain(`${S}txtMonthYear0`);
    expect(one).not.toContain(`${S}txtMonthYear1`);
    expect(one).not.toContain("chkScheduleDelete2");
    expect(record([]).map((r) => r.key)).toContain(`${S}txtMonthYear2`); // untouched: BIR's blank 3 rows
  });
  it("reads the rows back from the savefile", () => {
    const back = groupsFromSavefile(FORM_1601Cv2018, { record: record(sched1), trailer_year: 2014, is_final_copy: false }, "1601Cv2018");
    expect(back.sched1?.length).toBe(4);
    expect(back.sched1?.[3]?.[`${S}txtBankCode`]).toBe("MBT");
  });
});

describe.skipIf(!hasForm("1601Cv2018"))("native 1601Cv2018 Schedule 1 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("is 1:1 with BIR: four rows (one added), a negative adjustment, item 26 fed", async () => {
    const groups: GroupState = { sched1 };
    const r = await parityCheck(oracle, FORM_1601Cv2018, filed, "84653210700000-1601Cv2018-092026.xml", groups);
    expect(r.missing.filter((k) => /sched1|chkSchedule/.test(k))).toEqual([]);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
  it("is 1:1 with BIR: two rows (one dropped from BIR's 3)", async () => {
    const r = await parityCheck(oracle, FORM_1601Cv2018, filed, "84653210700000-1601Cv2018-092026.xml", { sched1: sched1.slice(0, 2) });
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
