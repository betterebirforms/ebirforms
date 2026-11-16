import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, groupsFromSavefile, type FormState, type GroupState } from "@/form/schema.ts";
import type { Savefile } from "@/lib/savefile.ts";
import { FORM_2552, validate2552 } from "@/form/form2552.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2552:";

const rows = [
  { txtTaxableBase: "1,000,000.00", selTaxRate: "4" },
  { txtTaxableBase: "500,000.00", selTaxRate: "2" },
  { txtTaxableBase: "200,000.00", selTaxRate: "0.6" }, // IPO
];
const base: FormState = { [`${P}txt16A`]: "1,000.00", [`${P}txt18A`]: "200.00" };

describe("2552 compute (rate × transaction-type bucketing)", () => {
  it("Primary transaction routes 4/2/1% buckets to the 13-cells; 0.6% IPO always to 12D", () => {
    const o = computeForm(FORM_2552, { ...base, [`${P}OptTransaction1`]: "true" }, { taxTrans: rows });
    expect(o[`${P}txtTaxDue12D`]).toBe("1,200.00"); // 200,000 × 0.6%
    expect(o[`${P}txtTaxDue13D`]).toBe("40,000.00"); // 1,000,000 × 4%
    expect(o[`${P}txtTaxDue13G`]).toBe("10,000.00"); // 500,000 × 2%
    expect(o[`${P}txtTaxDue13J`]).toBe("0.00");
    expect(o[`${P}txtTaxDue14D`]).toBe("0.00"); // Secondary cells gated off
    expect(o[`${P}txtTaxBase13B`]).toBe("1,000,000.00");
    expect(o[`${P}txt15`]).toBe("51,200.00"); // 1,200 + 40,000 + 10,000
    expect(o[`${P}txt16C`]).toBe("1,000.00");
    expect(o[`${P}txt17`]).toBe("50,200.00");
    expect(o[`${P}txt19`]).toBe("50,400.00"); // 50,200 + 200 penalty
  });

  it("Secondary transaction routes the same buckets to the 14-cells instead", () => {
    const o = computeForm(FORM_2552, { ...base, [`${P}OptTransaction2`]: "true" }, { taxTrans: rows });
    expect(o[`${P}txtTaxDue14D`]).toBe("40,000.00");
    expect(o[`${P}txtTaxDue14G`]).toBe("10,000.00");
    expect(o[`${P}txtTaxDue13D`]).toBe("0.00"); // Primary cells gated off
    expect(o[`${P}txtTaxDue12D`]).toBe("1,200.00"); // IPO still always
    expect(o[`${P}txt15`]).toBe("51,200.00");
  });
});

describe.skipIf(!hasForm("2552"))("native 2552 matches the legacy form (dynamic reload probe)", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("legacy rebuilds tblTaxTrans, re-buckets via getTaxTrans, and the chain round-trips", async () => {
    const full: FormState = {
      ...base, [`${P}OptTransaction1`]: "true", [`${P}txtForYr`]: "2017", [`${P}txtMonth1`]: "01", [`${P}txtDate`]: "15",
      [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043", [`${P}txtNameStockBrocker`]: "DELA CRUZ SECURITIES",
    };
    const { value, error } = await oracle.openSaved(FORM_2552, full, "84653210700000-2552-012017.xml", { taxTrans: rows });
    // getTaxTrans re-buckets the rebuilt rows on reload, so the computed cells and the chain round-trip.
    expect(await value(`${P}txtTaxDue13D`)).toBe("40,000.00");
    expect(await value(`${P}txtTaxDue12D`)).toBe("1,200.00");
    expect(await value(`${P}txt15`)).toBe("51,200.00");
    expect(await value(`${P}txt19`)).toBe("50,400.00");
    expect(error).toEqual([]);
  }, 120_000);

  const identity: FormState = {
    [`${P}txtForYr`]: "2017", [`${P}txtMonth1`]: "01", [`${P}txtDate`]: "15",
    [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
    [`${P}txtRDOCode`]: "043", [`${P}txtNameStockBrocker`]: "DELA CRUZ SECURITIES",
  };
  it("is 1:1 with BIR's form (transaction rows populated)", async () => {
    const state: FormState = { ...base, ...identity, [`${P}PayPenalties`]: "true", [`${P}OptTransaction1`]: "true", [`${P}txt19ifoverpay:_2`]: "true" };
    expect(validate2552(state, { taxTrans: rows })).toEqual([]);
    expect(validate2552({ ...state, [`${P}PayPenalties`]: "false" }, { taxTrans: rows }).map((p) => p.id)).toEqual(["selTaxRate3"]);
    // 19 is payable, so computetxt17and19 unchecks the overpayment choice; so do we
    expect(computeForm(FORM_2552, state, { taxTrans: rows })[`${P}txt19ifoverpay:_2`]).toBe("false");
    const r = await parityCheck(oracle, FORM_2552, state, "84653210700000-2552-012017.xml", { taxTrans: rows });
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);

  it("is 1:1 on an overpayment (19 < 0): the refund / TCC / carry-over choice is kept", async () => {
    const state: FormState = {
      ...base, ...identity, [`${P}PayPenalties`]: "true", [`${P}OptTransaction2`]: "true", [`${P}txt16A`]: "60,000.00",
      [`${P}txt19ifoverpay:_1`]: "false", [`${P}txt19ifoverpay:_2`]: "true", [`${P}txt19ifoverpay:_3`]: "false",
    };
    const o = computeForm(FORM_2552, state, { taxTrans: rows });
    expect(o[`${P}txt19`]).toBe("-8,600.00");
    expect(o[`${P}txt19ifoverpay:_2`]).toBe("true");
    const r = await parityCheck(oracle, FORM_2552, state, "84653210700000-2552-012017.xml", { taxTrans: rows });
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});

// Part III: transactions not subject to tax (tblTransaction rows + the modalTransactionNoTax pop-up rows)
const partIII = [
  { txtTranClassPartIII: "Sale to the exchange", txtAmountInvolvePartIII: "75,000.50" },
  { txtTranClassPartIII: "Transfer by succession", txtAmountInvolvePartIII: "12,000.00" },
];
const noTax = [
  { txtDateNoTax: "01/15/2017", txtSellerNoTax: "JUAN DELA CRUZ", txtBuyerNoTax: "MARIA SANTOS", txtIssuingCorpNoTax: "ABC CORP", txtNumberSharesNoTax: "500" },
  { txtSellerNoTax: "PEDRO REYES", txtBuyerNoTax: "ANA LIM", txtIssuingCorpNoTax: "XYZ INC", txtNumberSharesNoTax: "20" },
];

describe("2552 Part III (not subject to tax) records", () => {
  const state: FormState = { [`${P}txtForYr`]: "2017", [`${P}txtMonth1`]: "01", [`${P}txtDate`]: "15" };
  it("writes BIR's keys per row, in BIR's cell order, with BIR's defaults", () => {
    const rec = formRecords(FORM_2552, state, { partIII, noTax });
    const v = (k: string) => rec.find((r) => r.key === k)?.value;
    expect(v("chkTaxTransPartIII1")).toBe("false");
    expect(v("txtTranClassPartIII2")).toBe("TRANSFER BY SUCCESSION"); // upper-cased like BIR's other text
    expect(v("txtAmountInvolvePartIII1")).toBe("75,000.50");
    expect(v("chkTaxTransModal2")).toBe("false");
    expect(v("txtDateNoTax1")).toBe("01/15/2017");
    expect(v("txtDateNoTax2")).toBe("01/15/2017"); // BIR fills the return period
    expect(v("txtNumberSharesNoTax2")).toBe("20");
    const keys = rec.map((r) => r.key);
    expect(keys.indexOf("chkTaxTransModal1")).toBeLessThan(keys.indexOf("txtDateNoTax1"));
    expect(keys.indexOf("txtDateNoTax1")).toBeLessThan(keys.indexOf("txtNumberSharesNoTax1"));
    expect(keys.indexOf("txtAmountInvolvePartIII2")).toBeLessThan(keys.indexOf("chkTaxTransModal1"));
  });
  it("reopens a native save with the same rows", () => {
    const rec = formRecords(FORM_2552, state, { partIII, noTax });
    const file = { name: "x", record: rec } as unknown as Savefile;
    const back = groupsFromSavefile(FORM_2552, file, "2552");
    expect(back.partIII!.map((r) => r.txtAmountInvolvePartIII)).toEqual(["75,000.50", "12,000.00"]);
    expect(back.noTax!.map((r) => r.txtSellerNoTax)).toEqual(["JUAN DELA CRUZ", "PEDRO REYES"]);
  });
});

describe.skipIf(!hasForm("2552"))("native 2552 Part III is 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("BIR's page rebuilds the Part III rows and the pop-up rows from a native save", async () => {
    const state: FormState = {
      [`${P}txtForYr`]: "2017", [`${P}txtMonth1`]: "01", [`${P}txtDate`]: "15", [`${P}OptTransaction1`]: "true", [`${P}PayPenalties`]: "true",
      [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
      [`${P}txtRDOCode`]: "043", [`${P}txtNameStockBrocker`]: "DELA CRUZ SECURITIES",
    };
    const r = await parityCheck(oracle, FORM_2552, state, "84653210700000-2552-012017.xml", { taxTrans: rows, partIII, noTax });
    expect(parityProblem(r)).toEqual([]);
    expect(r.extra).toEqual([]);
    expect(r.missing).toEqual([]);
  }, 120_000);
});
