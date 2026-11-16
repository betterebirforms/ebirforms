import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_2550DS } from "@/form/form2550ds.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2550ds:";

const input: FormState = {
  [`${P}grossSaleForTheQuarter`]: "1,000,000.00", [`${P}lessGrossSaleSubjectedToWithHoldingTax`]: "100,000.00",
  [`${P}vatPaidInReturn`]: "10,000.00", [`${P}excessPaymentCarriedOver`]: "5,000.00",
  [`${P}advancePaymentOrDepositMadeThisQuarter`]: "2,000.00", [`${P}otherPaymentCreditAmount`]: "3,000.00",
  [`${P}addPenaltiesSurcharge`]: "1,000.00", [`${P}addPenaltiesInterest`]: "500.00",
};

describe("2550DS compute", () => {
  it("balance → vatPayable → credits → stillPayable → total", () => {
    const o = computeAll(FORM_2550DS, input);
    expect(o[`${P}vatRate`]).toBe("12.00%"); // BIR's fixed, disabled rate text
    expect(o[`${P}balanceSubjectToVAT`]).toBe("900,000.00");
    expect(o[`${P}vatPayable`]).toBe("108,000.00"); // 900,000 × 12%
    expect(o[`${P}totalPaymentsCredits`]).toBe("20,000.00");
    expect(o[`${P}vatStillPayable`]).toBe("88,000.00");
    expect(o[`${P}addPenaltiesTotal`]).toBe("1,500.00");
    expect(o[`${P}totalAmountPayable`]).toBe("89,500.00");
  });
  it("rounds vatPayable round-half-up", () => {
    const o = computeAll(FORM_2550DS, { [`${P}grossSaleForTheQuarter`]: "333,333.33" });
    expect(o[`${P}vatPayable`]).toBe("40,000.00"); // 333,333.33 × 0.12 = 39,999.9996 → 40,000.00
  });
});

const row = (description: string, amount: string) => ({ "frm2550ds:totalTaxPayableNo22DDescription": description, "frm2550ds:totalTaxPayableNo22DAmount": amount });
const specify = (...r: Array<[string, string]>): GroupState => ({ specify22D: r.map(([d, a]) => row(d, a)) });

describe("2550DS item 22D pop-up (closeModalNo22D)", () => {
  it("2+ rows: description VARIOUS, amount and result are the sum, credits follow", () => {
    const g = specify(["TAX CREDIT CERTIFICATE", "1,000.50"], ["EXCESS", "250.25"]);
    const o = computeForm(FORM_2550DS, { ...input, [`${P}otherPaymentCreditAmount`]: "9.00" }, g);
    expect(o[`${P}otherPaymentCreditSpecify`]).toBe("VARIOUS");
    expect(o[`${P}otherPaymentCreditAmount`]).toBe("1,250.75");
    expect(o.resultOtherCreditsNo22D).toBe("1,250.75");
    expect(o[`${P}totalPaymentsCredits`]).toBe("18,250.75"); // 10,000 + 5,000 + 2,000 + 1,250.75
  });
  it("1 row: its own description, amount = that row", () => {
    const o = computeForm(FORM_2550DS, input, specify(["TCC", "400.00"]));
    expect(o[`${P}otherPaymentCreditSpecify`]).toBe("TCC");
    expect(o[`${P}otherPaymentCreditAmount`]).toBe("400.00");
  });
  it("no rows: item 22D stays as typed and the pop-up result is 0.00", () => {
    const o = computeForm(FORM_2550DS, { ...input, [`${P}otherPaymentCreditSpecify`]: "OTHER" }, {});
    expect(o[`${P}otherPaymentCreditSpecify`]).toBe("OTHER");
    expect(o[`${P}otherPaymentCreditAmount`]).toBe("3,000.00");
    expect(o.resultOtherCreditsNo22D).toBe("0.00");
  });
  it("saves 0-indexed row inputs (upper-cased) plus item 22D and the result", () => {
    const rec = new Map(formRecords(FORM_2550DS, input, specify(["tcc", "1,000.00"], ["excess", "5.00"])).map((r) => [r.key, r.value]));
    expect(rec.get(`${P}totalTaxPayableNo22DDescription0`)).toBe("TCC");
    expect(rec.get(`${P}totalTaxPayableNo22DAmount1`)).toBe("5.00");
    expect(rec.get(`${P}otherPaymentCreditSpecify`)).toBe("VARIOUS");
    expect(rec.get(`${P}otherPaymentCreditAmount`)).toBe("1,005.00");
    expect(rec.get("resultOtherCreditsNo22D")).toBe("1,005.00");
    expect([...rec.keys()].some((k) => k.startsWith("_22D"))).toBe(false);
  });
});

const state: FormState = {
  ...input,
  [`${P}paymentValueAddedTax`]: "true", [`${P}calendarNo1`]: "true", [`${P}selectedMonthNo2`]: "12", [`${P}txtYearNo2`]: "2025",
  [`${P}OptQuarter3`]: "true", [`${P}amendedReturnNo5`]: "true",
  [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}branchCode`]: "00000", [`${P}rdoCode`]: "043",
  [`${P}taxpayerName`]: "DELA CRUZ, JUAN", [`${P}address`]: "1 RIZAL ST., QUEZON CITY", [`${P}telephoneNum`]: "0281234567",
};

// the pop-up rows exist only once BIR's pop-up has been opened, so a reloaded page has no such element
const ROW_KEY = [0, 1].flatMap((i) => [`${P}totalTaxPayableNo22DDescription${i}`, `${P}totalTaxPayableNo22DAmount${i}`]);

// The reload used to abort before loading anything: sleeptime() calls loadBGXML("profile/<TIN>.xml") first, and when
// that file is missing its catch writes to a #msg element this form doesn't have (BIR bug), throwing out of the
// whole reload. BIR's app (and ours) never opens a return without the taxpayer's profile, which the oracle now writes.
describe.skipIf(!hasForm("2550DS"))("native 2550DS matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("is 1:1 with BIR's form", async () => {
    const r = await parityCheck(oracle, FORM_2550DS, state, "84653210700000-2550DS-Q32025.xml");
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
  // BIR never rebuilds the pop-up rows on reload, so only item 22D and the result are compared after it; the rows'
  // own inputs are checked against BIR's showModalNo22D / addColNo22D / closeModalNo22D below.
  it("pop-up rows: BIR's own pop-up flow saves what the native group saves", async () => {
    const g = specify(["tcc", "1,000.50"], ["excess payment", "250.25"]);
    const withRow: FormState = { ...state, [`${P}otherPaymentCreditAmount`]: "0.00" };
    const r = await parityCheck(oracle, FORM_2550DS, withRow, "84653210700000-2550DS-Q32025.xml", g);
    expect(parityProblem(r, ROW_KEY)).toEqual([]);
    const native = new Map(formRecords(FORM_2550DS, withRow, g).map((x) => [x.key, x.value]));
    const { page } = await oracle.openSaved(FORM_2550DS, withRow, "84653210700000-2550DS-Q32025.xml", g);
    const legacy: Array<[string, string]> = await page.evaluate(() => {
      const w = window as unknown as Record<string, () => void>;
      const box = (id: string) => document.getElementById(`frm2550ds:${id}`) as HTMLInputElement;
      w.showModalNo22D!();
      box("totalTaxPayableNo22DDescription0").value = "TCC";
      box("totalTaxPayableNo22DAmount0").value = "1,000.50";
      w.addColNo22D!();
      box("totalTaxPayableNo22DDescription1").value = "EXCESS PAYMENT";
      box("totalTaxPayableNo22DAmount1").value = "250.25";
      w.computeOtherCreditsNo22D!();
      w.closeModalNo22D!();
      const form = document.getElementById("frmMain") as HTMLFormElement;
      return (Array.from(form.elements) as HTMLInputElement[]).filter((el) => el.id && el.type === "text" && /22D|otherPaymentCredit/.test(el.id)).map((el) => [el.id, el.value] as [string, string]);
    });
    await page.close();
    const mine = (key: string) => native.get(key);
    for (const [key, value] of legacy) expect([key, mine(key)]).toEqual([key, value]);
    expect(legacy.map(([k]) => k)).toEqual(expect.arrayContaining([`${P}totalTaxPayableNo22DAmount1`, `${P}otherPaymentCreditSpecify`]));
  }, 120_000);
});

describe("2550DS item 22D reload", () => {
  it("a reopened file keeps item 22D and drops the rows, as BIR's loadData does", async () => {
    const { groupsFromSavefile } = await import("../src/form/schema.ts");
    const { FORM_2550DS } = await import("../src/form/form2550ds.ts");
    const file = {
      name: "x",
      record: [
        { key: "frm2550ds:otherPaymentCreditSpecify", value: "VARIOUS" },
        { key: "frm2550ds:totalTaxPayableNo22DDescription0", value: "A" },
        { key: "frm2550ds:totalTaxPayableNo22DAmount0", value: "1.00" },
      ],
    };
    expect(groupsFromSavefile(FORM_2550DS, file as never, "2550DS").specify22D).toBeUndefined();
    // the same file reads the row when the group is reloaded (the file shape is right)
    const reloaded = { ...FORM_2550DS, group: (FORM_2550DS.group ?? []).map((g) => ({ ...g, not_reloaded: false })) };
    expect(groupsFromSavefile(reloaded, file as never, "2550DS").specify22D?.length).toBe(1);
  });
});
