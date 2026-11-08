import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1707V2021, validate1707v2021 } from "@/form/form1707v2021.ts";
import { roundShares } from "@/form/form1707v2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1707:";
const base: FormState = {
  [`${P}txtPg1I1Month`]: "06", [`${P}txtPg1I1Day`]: "15", [`${P}txtPg1I1Year`]: "2023",
  [`${P}rdoPg1I2AmendedYes`]: "true", [`${P}rdoPg1I2AmendedNo`]: "false",
  [`${P}rdoPg1I3ATCIndiv`]: "false", [`${P}rdoPg1I3ATCCorp`]: "true", [`${P}rdoCorpoDomestic`]: "false", [`${P}rdoCorpoForeign`]: "true",
  [`${P}txtPg1TIN1`]: "846", [`${P}txtPg1TIN2`]: "532", [`${P}txtPg1TIN3`]: "107", [`${P}txtPg1TIN4`]: "00000",
  [`${P}rdoPg1Pt1I5RDO`]: "043", [`${P}ProfileName`]: "ACME HOLDINGS INC.", [`${P}ProfileAddress1`]: "1 rizal st., quezon city",
  [`${P}ProfileZipCode`]: "1100", [`${P}ProfileContactNum`]: "0281234567",
  [`${P}rdoPg1I8TaxReliefYes`]: "true", [`${P}rdoPg1I8TaxReliefNo`]: "false", [`${P}txtPg1I8TaxReliefSpec`]: "rp-us tax treaty",
  [`${P}txtPg1P2I15TaxPaidInPrevRtrn`]: "1,000.00",
  [`${P}txtPg1P2I17Surcharge`]: "500.00", [`${P}txtPg1P2I17Interest`]: "123.45", [`${P}txtPg1P2I17Compromise`]: "1,000.00",
};
const tx = (kind: "Cash" | "Installment" | "Foreclosure" | "Others"): FormState =>
  Object.fromEntries(["Cash", "Installment", "Foreclosure", "Others"].map((k) => [`${P}rdoPg1I9TransDesc${k}`, String(k === kind)]));
const sched2 = (i: number, name: string, shares: string, cert: string, price: string): FormState => ({
  [`${P}txtPg2P4Sch2NameOfCorpStock${i}`]: name, [`${P}txtPg2P4Sch2NoOfShares${i}`]: shares,
  [`${P}txtPg2P4Sch2StockCertNo${i}`]: cert, [`${P}txtPg2P4Sch2TaxBaseSellPrice${i}`]: price,
});
const sched3 = (i: number, part: string, amt: string): FormState => ({ [`${P}txtPg2P4Sch3Particulars${i}`]: part, [`${P}txtPg2P4Sch3Amount${i}`]: amt });
const cash: FormState = {
  ...base, ...tx("Cash"),
  ...sched2(1, "alpha corp", "1,000", "1001", "100,000.50"), ...sched2(2, "BETA CORP", "2,500.5", "1002", "250,000.25"),
  ...sched2(3, "GAMMA INC", "750", "1003", "75,000.00"),
  ...sched3(1, "broker's fee", "10,000.00"), ...sched3(2, "DOCUMENTARY STAMP", "5,000.25"), ...sched3(3, "NOTARIAL FEE", "2,500.00"),
};
const groups: GroupState = {
  seller: [
    { [`${P}txtPg1I6SellerName`]: "acme holdings inc.", [`${P}txtPg1I6SellerAddr`]: "1 RIZAL ST., QUEZON CITY", [`${P}txtPg1I6SellerTIN`]: "846532107000" },
    { [`${P}txtPg1I6SellerName`]: "DELA CRUZ, JUAN", [`${P}txtPg1I6SellerAddr`]: "2 MABINI ST., MANILA", [`${P}txtPg1I6SellerTIN`]: "123456789000" },
    { [`${P}txtPg1I6SellerName`]: "SANTOS, MARIA", [`${P}txtPg1I6SellerAddr`]: "3 LUNA ST., PASIG", [`${P}txtPg1I6SellerTIN`]: "234567890000" },
    { [`${P}txtPg1I6SellerName`]: "REYES, PEDRO", [`${P}txtPg1I6SellerAddr`]: "4 BONIFACIO ST., TAGUIG", [`${P}txtPg1I6SellerTIN`]: "345678901000" },
  ],
  buyer: [{ [`${P}txtPg1I7BuyerName`]: "BUYER CORP", [`${P}txtPg1I7BuyerAddr`]: "5 AYALA AVE., MAKATI", [`${P}txtPg1I7BuyerTIN`]: "456789012000" }],
  // the Add-More pop-ups: row 1 is the schedule's row 4, the rest overflow
  sched2more: [
    { [`${P}txtPg2Pt4S2_{i}Col1`]: "DELTA CORP", [`${P}txtPg2Pt4S2_{i}Col2`]: "500", [`${P}txtPg2Pt4S2_{i}Col3`]: "1004", [`${P}txtPg2Pt4S2_{i}Col4`]: "50,000.00" },
    { [`${P}txtPg2Pt4S2_{i}Col1`]: "epsilon inc", [`${P}txtPg2Pt4S2_{i}Col2`]: "300", [`${P}txtPg2Pt4S2_{i}Col3`]: "1005", [`${P}txtPg2Pt4S2_{i}Col4`]: "30,000.10" },
    { [`${P}txtPg2Pt4S2_{i}Col1`]: "ZETA CORP", [`${P}txtPg2Pt4S2_{i}Col2`]: "200", [`${P}txtPg2Pt4S2_{i}Col3`]: "1006", [`${P}txtPg2Pt4S2_{i}Col4`]: "20,000.00" },
  ],
  sched3more: [
    { [`${P}txtPg2Pt4S3_{i}Col1`]: "TRANSFER FEE", [`${P}txtPg2Pt4S3_{i}Col2`]: "1,000.00" },
    { [`${P}txtPg2Pt4S3_{i}Col1`]: "COURIER", [`${P}txtPg2Pt4S3_{i}Col2`]: "500.50" },
  ],
};
const installment: FormState = {
  ...base, ...tx("Installment"), [`${P}rdoPg1I2AmendedYes`]: "false", [`${P}rdoPg1I2AmendedNo`]: "true",
  [`${P}txtPg2P4Sch1I1SellPrice`]: "1,000,000.00", [`${P}txtPg2P4Sch1I2CostExpense`]: "600,000.00", [`${P}txtPg2P4Sch1I3AssumMortgage`]: "0.00",
  [`${P}txtPg2P4Sch1I4NumInstallments`]: "4", [`${P}txtPg2P4Sch1I5InstallmentAmt`]: "250,000.33", [`${P}txtPg2P4Sch1I8DateCollection`]: "06/15/2023",
  [`${P}txtPg2P4Sch1I9TotCollection`]: "250,000.33",
  // typed but dead on an installment sale: transactionType's disableSchedTwo / Three reset them
  ...sched2(1, "ALPHA CORP", "1,000", "1001", "100,000.50"), ...sched3(1, "BROKER'S FEE", "10,000.00"),
};

describe("1707v2021 compute (Schedule 1/2/3, 15% on cash / foreclosure / others, installment)", () => {
  it("cash sale: Schedule 2/3 (with Add-More pop-ups) → 10, 11, 12; 13 = 12 × 15%; 16 = 13 − 15; 18 = 16 + 17D", () => {
    const o = computeForm(FORM_1707V2021, cash, groups);
    expect(o[`${P}txtPg2P4Sch2NameOfCorpStock4`]).toBe("OTHERS");
    expect(o[`${P}txtPg2P4Sch2TaxBaseSellPrice4`]).toBe("100,000.10");
    expect(o[`${P}txtPg2P4Sch2TotAmount`]).toBe("525,000.85");
    expect(o[`${P}txtPg2P4Sch3Particulars4`]).toBe("OTHERS");
    expect(o[`${P}txtPg2P4Sch3TotAmount`]).toBe("19,000.75");
    expect(o[`${P}txtPg1P2I10TaxBase`]).toBe("525,000.85");
    expect(o[`${P}txtPg1P2I11AllowExpnse`]).toBe("19,000.75");
    expect(o[`${P}txtPg1P2I12NetCptalChnged`]).toBe("506,000.10");
    expect(o[`${P}txtPg1P2I13AppTaxRate`]).toBe("15.00");
    // BIR's float: 506000.1 × 0.15 = 75900.01499… → toFixed(2) "75900.01" (exact half-up would give .02)
    expect(o[`${P}txtPg1P2I13TaxDueForTrans`]).toBe("75,900.01");
    expect(o[`${P}txtPg1P2I14TaxDuePmtPriod`]).toBe("0.00");
    expect(o[`${P}txtPg1P2I16TaxPayable`]).toBe("74,900.01");
    expect(o[`${P}txtPg1P2I17TotPenalties`]).toBe("1,623.45");
    expect(o[`${P}txtPg1P2I18TotAmtPyable`]).toBe("76,523.46");
    expect(o[`${P}txtPg2P4Sch1I6ApplcRate`]).toBe("");
    expect(o[`${P}txtPg1I8TaxReliefSpec`]).toBe("RP-US TAX TREATY");
    expect(o[`${P}txtPg2P4Sch2NoOfShares2`]).toBe("2,500.500"); // roundSharesNum
    expect(validate1707v2021(cash, groups)).toEqual([]);
  });

  it("foreclosure and others are taxed at the same 15% (v2021 dropped the 2018 foreign-corporation 5%/10%)", () => {
    for (const kind of ["Foreclosure", "Others"] as const) {
      const o = computeForm(FORM_1707V2021, { ...cash, ...tx(kind), [`${P}txtPg1I9TransDescSpec`]: "dacion en pago" }, groups);
      expect(o[`${P}txtPg1P2I13TaxDueForTrans`]).toBe("75,900.01");
      expect(o[`${P}txtPg1I9TransDescSpec`]).toBe(kind === "Others" ? "DACION EN PAGO" : "");
    }
  });

  it("a net capital LOSS leaves item 13 at the literal \"0\" BIR assigns; 18 = 17D when 16 < 0 and there are penalties", () => {
    const o = computeForm(FORM_1707V2021, { ...cash, ...sched3(1, "BROKER'S FEE", "900,000.00") }, groups);
    expect(o[`${P}txtPg1P2I12NetCptalChnged`]).toBe("-383,999.90");
    expect(o[`${P}txtPg1P2I13TaxDueForTrans`]).toBe("0");
    expect(o[`${P}txtPg1P2I16TaxPayable`]).toBe("-1,000.00");
    expect(o[`${P}txtPg1P2I18TotAmtPyable`]).toBe("1,623.45");
  });

  it("installment sale: Schedule 1 item 7 = 5 × 15% → 14; Schedules 2/3 reset; 15 reset when not amended", () => {
    const o = computeForm(FORM_1707V2021, installment, groups);
    expect(o[`${P}txtPg2P4Sch1I6ApplcRate`]).toBe("15");
    // transactionType() assigns "", but the page-1 blur sweep re-runs the field's round(this),
    // which rewrites "" to "0.00" — BIR's own save carries "0.00" (EBF_PARITY_STRICT finding)
    expect(o[`${P}txtPg1P2I13AppTaxRate`]).toBe("0.00");
    expect(o[`${P}txtPg2P4Sch1I7PeriodTaxDue`]).toBe("37,500.05");
    expect(o[`${P}txtPg1P2I14TaxDuePmtPriod`]).toBe("37,500.05");
    expect(o[`${P}txtPg1P2I13TaxDueForTrans`]).toBe("0.00");
    expect(o[`${P}txtPg1P2I15TaxPaidInPrevRtrn`]).toBe("0.00");
    expect(o[`${P}txtPg1P2I16TaxPayable`]).toBe("37,500.05");
    expect(o[`${P}txtPg2P4Sch2TaxBaseSellPrice1`]).toBe("0.00");
    expect(o[`${P}txtPg2P4Sch2NameOfCorpStock1`]).toBe("");
    expect(o[`${P}txtPg2P4Sch2TotAmount`]).toBe("0.00");
    expect(o[`${P}txtPg1P2I10TaxBase`]).toBe("0.00");
    // the pop-ups are ignored too (no PopLength / SubTotal written)
    const rec = new Map(formRecords(FORM_1707V2021, installment, groups).map((r) => [r.key, r.value]));
    expect(rec.get("Pg2Pt4S2PopLength")).toBe("");
    // and when it is not an installment sale Schedule 1 is reset
    const c = computeForm(FORM_1707V2021, { ...installment, ...tx("Cash") }, {});
    expect(c[`${P}txtPg2P4Sch1I5InstallmentAmt`]).toBe("0.00");
    expect(c[`${P}txtPg2P4Sch1I4NumInstallments`]).toBe("0");
    expect(c[`${P}txtPg2P4Sch1I8DateCollection`]).toBe("");
    expect(c[`${P}txtPg2P4Sch1I7PeriodTaxDue`]).toBe("0.00");
  });

  it("saves what BIR's saveXML writes: seller rows past 3 with their delete box, pop-up rows, PopLength / SubTotal; no row-1 shares key", () => {
    const rec = new Map(formRecords(FORM_1707V2021, cash, groups).map((r) => [r.key, r.value]));
    expect(rec.get(`${P}txtPg1I6SellerName0`)).toBe("ACME HOLDINGS INC.");
    expect(rec.get(`${P}txtPg1I6SellerName3`)).toBe("REYES, PEDRO");
    expect(rec.get("chkSellerDelete3")).toBe("false");
    expect(rec.get(`${P}txtPg1I7BuyerName1`)).toBe(""); // the blank form's 3 rows stay
    expect(rec.get(`${P}txtPg2Pt4S2_2Col1`)).toBe("EPSILON INC");
    expect(rec.get(`${P}txtPg2Pt4S2_2Col2`)).toBe("300.000");
    expect(rec.get("Pg2Pt4S2PopLength")).toBe("3");
    expect(rec.get("Pg2Pt4S2SubTotal")).toBe("100,000.10");
    expect(rec.get("Pg2Pt4S3PopLength")).toBe("2");
    expect(rec.get(`${P}txtPg2P4Sch2NoOfShares1`)).toBeUndefined(); // type="number": BIR never saves it
    expect(rec.get(`${P}ProfileName`)).toBe("ACME%20HOLDINGS%20INC.");
    expect(rec.get(`${P}txtPg2TinC1`)).toBe("846");
    expect(rec.get(`${P}txtPg2RegisteredName`)).toBe("ACME HOLDINGS INC.");
    expect(roundShares("1234567.5")).toBe("1,234,567.500");
    expect(roundShares("OTHERS")).toBe("OTHERS");
  });

  it("validates the BIR rules (item 9, corporation type, sellers, schedules, single-row pop-up)", () => {
    const bad = validate1707v2021({ ...cash, ...tx("Others"), [`${P}rdoCorpoForeign`]: "false", ...sched2(2, "BETA CORP", "0", "1002", "250,000.25") }, {
      seller: [{ [`${P}txtPg1I6SellerName`]: "X", [`${P}txtPg1I6SellerTIN`]: "12-34" }], sched3more: [{ [`${P}txtPg2Pt4S3_{i}Col2`]: "5.00" }],
    });
    expect(bad.map((p) => p.id)).toEqual(expect.arrayContaining([
      `${P}rdoCorpoDomestic`, `${P}txtPg1I9TransDescSpec`, `${P}txtPg1I6SellerName0`, `${P}txtPg1I6SellerTIN0`, `${P}txtPg1I7BuyerName0`,
      `${P}txtPg2P4Sch2NameOfCorpStock2`, "Pg2Pt4S3PopLength",
    ]));
  });
});

describe.skipIf(!hasForm("1707v2021"))("native 1707v2021 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  it("BIR rebuilds the seller / buyer rows and Schedules 2/3 on reopen and recomputes the same chain", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1707V2021, cash, "84653210700000-1707v2021-06152023.xml", groups);
    expect(await value(`${P}txtPg1I6SellerName3`)).toBe("REYES, PEDRO");
    expect(await value(`${P}txtPg1I6SellerTIN3`)).toBe("345678901000");
    expect(await value(`${P}txtPg2P4Sch2NameOfCorpStock4`)).toBe("OTHERS");
    expect(await value(`${P}txtPg2P4Sch2TaxBaseSellPrice4`)).toBe("100,000.10");
    expect(await value(`${P}txtPg2P4Sch3Amount2`)).toBe("5,000.25");
    // BIR's own compute, run as a user would trigger it
    await page.evaluate(() => {
      const w = window as unknown as Record<string, () => void>;
      w.pageTwoSched2Comp!();
      w.pageTwoSched3Comp!();
    });
    expect(await value(`${P}txtPg1P2I12NetCptalChnged`)).toBe("506,000.10");
    expect(await value(`${P}txtPg1P2I13TaxDueForTrans`)).toBe("75,900.01");
    expect(await value(`${P}txtPg1P2I18TotAmtPyable`)).toBe("76,523.46");
    // the Add-More pop-ups come back too: loadData adds PopLength rows, loads them by id, loadToArray re-reads them
    expect(await page.evaluate(() => document.getElementById("Pg2Pt4S2PopTable1st")!.querySelectorAll("tr").length)).toBe(3);
    expect(await value(`${P}txtPg2Pt4S2_2Col1`)).toBe("EPSILON INC");
    expect(await value(`${P}txtPg2Pt4S3_2Col2`)).toBe("500.50");
    await page.close();
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with populated schedules — cash sale (parityCheck)", async () => {
    const r = await parityCheck(oracle, FORM_1707V2021, cash, "84653210700000-1707v2021-06152023.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count);
  }, 120_000);

  it("is 1:1 — installment sale, and others with a net loss (parityCheck)", async () => {
    const a = await parityCheck(oracle, FORM_1707V2021, installment, "84653210700000-1707v2021-06152023.xml", { seller: groups.seller!, buyer: groups.buyer! });
    expect(parityProblem(a)).toEqual([]);
    const loss = { ...cash, ...tx("Others"), [`${P}txtPg1I9TransDescSpec`]: "DACION EN PAGO", ...sched3(1, "BROKER'S FEE", "900,000.00") };
    const b = await parityCheck(oracle, FORM_1707V2021, loss, "84653210700000-1707v2021-06152023.xml", groups);
    expect(parityProblem(b)).toEqual([]);
  }, 120_000);
});
