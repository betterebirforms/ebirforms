import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1707V2018, validate1707v2018 } from "@/form/form1707v2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1707:";
const BASE1 = "txtPg2P4Sch2TaxBaseSellPrice1:test"; // BIR's typo'd id for Schedule 2 row 1's selling price
const base: FormState = {
  [`${P}txtPg1I1Month`]: "09", [`${P}txtPg1I1Day`]: "30", [`${P}txtPg1I1Year`]: "2019",
  [`${P}rdoPg1I2AmendedYes`]: "true", [`${P}rdoPg1I2AmendedNo`]: "false",
  [`${P}rdoPg1I3ATCIndiv`]: "true", [`${P}rdoPg1I3ATCCorp`]: "false", [`${P}rdoCorpoForeign`]: "true", // cleared: individual ATC
  [`${P}txtPg1TIN1`]: "846", [`${P}txtPg1TIN2`]: "532", [`${P}txtPg1TIN3`]: "107", [`${P}txtPg1TIN4`]: "00000",
  [`${P}rdoPg1Pt1I5RDO`]: "043", [`${P}ProfileName`]: "DELA CRUZ, JUAN", [`${P}ProfileAddress1`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}ProfileZipCode`]: "1100", [`${P}ProfileContactNum`]: "0281234567",
  [`${P}txtPg1P2I15TaxPaidInPrevRtrn`]: "1,000.40",
  [`${P}txtPg1P2I17Surcharge`]: "500.00", [`${P}txtPg1P2I17Interest`]: "123.45", [`${P}txtPg1P2I17Compromise`]: "1,000.00",
};
const tx = (kind: "Cash" | "Installment" | "Foreclosure" | "Others"): FormState =>
  Object.fromEntries(["Cash", "Installment", "Foreclosure", "Others"].map((k) => [`${P}rdoPg1I9TransDesc${k}`, String(k === kind)]));
const foreignCorp: FormState = { [`${P}rdoPg1I3ATCIndiv`]: "false", [`${P}rdoPg1I3ATCCorp`]: "true", [`${P}rdoCorpoDomestic`]: "false", [`${P}rdoCorpoForeign`]: "true" };
const sched2 = (i: number, name: string, shares: string, cert: string, price: string): FormState => ({
  [`${P}txtPg2P4Sch2NameOfCorpStock${i}`]: name, [`${P}txtPg2P4Sch2NoOfShares${i}`]: shares,
  [`${P}txtPg2P4Sch2StockCertNo${i}`]: cert, [i === 1 ? BASE1 : `${P}txtPg2P4Sch2TaxBaseSellPrice${i}`]: price,
});
const sched3 = (i: number, part: string, amt: string): FormState => ({ [`${P}txtPg2P4Sch3Particulars${i}`]: part, [`${P}txtPg2P4Sch3Amount${i}`]: amt });
const cash: FormState = {
  ...base, ...tx("Cash"),
  ...sched2(1, "ALPHA CORP", "1,000.00", "1001", "100,000.50"), ...sched2(2, "beta corp", "2,500.00", "1002", "250,000.25"),
  ...sched2(3, "GAMMA INC", "750.00", "1003", "75,000.00"),
  ...sched3(1, "BROKER'S FEE", "10,000.00"), ...sched3(2, "DOCUMENTARY STAMP", "5,000.25"), ...sched3(3, "NOTARIAL FEE", "2,500.00"),
};
const groups: GroupState = {
  seller: [
    { [`${P}txtPg1I6SellerName`]: "dela cruz, juan", [`${P}txtPg1I6SellerAddr`]: "1 RIZAL ST., QUEZON CITY", [`${P}txtPg1I6SellerTIN`]: "846532107000" },
    { [`${P}txtPg1I6SellerName`]: "SANTOS, MARIA", [`${P}txtPg1I6SellerAddr`]: "3 LUNA ST., PASIG", [`${P}txtPg1I6SellerTIN`]: "234567890000" },
  ],
  buyer: [
    { [`${P}txtPg1I7BuyerName`]: "BUYER CORP", [`${P}txtPg1I7BuyerAddr`]: "5 AYALA AVE., MAKATI", [`${P}txtPg1I7BuyerTIN`]: "456789012000" },
    { [`${P}txtPg1I7BuyerName`]: "B2 CORP", [`${P}txtPg1I7BuyerAddr`]: "6 PASEO, MAKATI", [`${P}txtPg1I7BuyerTIN`]: "456789013000" },
    { [`${P}txtPg1I7BuyerName`]: "B3 CORP", [`${P}txtPg1I7BuyerAddr`]: "7 PASEO, MAKATI", [`${P}txtPg1I7BuyerTIN`]: "456789014000" },
    { [`${P}txtPg1I7BuyerName`]: "B4 CORP", [`${P}txtPg1I7BuyerAddr`]: "8 PASEO, MAKATI", [`${P}txtPg1I7BuyerTIN`]: "456789015000" },
    { [`${P}txtPg1I7BuyerName`]: "B5 CORP", [`${P}txtPg1I7BuyerAddr`]: "9 PASEO, MAKATI", [`${P}txtPg1I7BuyerTIN`]: "456789016000" },
  ],
  sched2more: [
    { [`${P}txtPg2Pt4S2_{i}Col1`]: "DELTA CORP", [`${P}txtPg2Pt4S2_{i}Col2`]: "500.00", [`${P}txtPg2Pt4S2_{i}Col3`]: "1004", [`${P}txtPg2Pt4S2_{i}Col4`]: "50,000.00" },
    { [`${P}txtPg2Pt4S2_{i}Col1`]: "EPSILON INC", [`${P}txtPg2Pt4S2_{i}Col2`]: "300.00", [`${P}txtPg2Pt4S2_{i}Col3`]: "1005", [`${P}txtPg2Pt4S2_{i}Col4`]: "30,001.00" },
  ],
  sched3more: [
    { [`${P}txtPg2Pt4S3_{i}Col1`]: "TRANSFER FEE", [`${P}txtPg2Pt4S3_{i}Col2`]: "1,000.00" },
    { [`${P}txtPg2Pt4S3_{i}Col1`]: "courier", [`${P}txtPg2Pt4S3_{i}Col2`]: "501.00" },
  ],
};
const installment: FormState = {
  ...base, ...tx("Installment"), [`${P}rdoPg1I2AmendedYes`]: "false", [`${P}rdoPg1I2AmendedNo`]: "true",
  [`${P}txtPg2P4Sch1I1SellPrice`]: "1,000,000.00", [`${P}txtPg2P4Sch1I2CostExpense`]: "600,000.00",
  [`${P}txtPg2P4Sch1I4NumInstallments`]: "4", [`${P}txtPg2P4Sch1I5InstallmentAmt`]: "250,003.33", [`${P}txtPg2P4Sch1I6ApplcRate`]: "15.00",
  [`${P}txtPg2P4Sch1I8DateCollection`]: "09/30/2019", [`${P}txtPg2P4Sch1I9TotCollection`]: "250,003.33",
  ...sched2(1, "ALPHA CORP", "1,000.00", "1001", "100,000.50"), // dead on an installment sale
};
const one = (s: FormState) => computeForm(FORM_1707V2018, s, groups);

describe("1707v2018 compute (whole-peso toFixed(0) chain; 15% / foreign corporation 5% or 10%; installment)", () => {
  it("cash sale, individual: Schedules 2/3 (pop-ups) → 10/11/12 in whole pesos; 13 = 12 × 15%; 16; 17D; 18", () => {
    const o = one(cash);
    expect(o[`${P}rdoCorpoForeign`]).toBe("false"); // resetCorpoButton
    expect(o[`${P}txtPg2P4Sch2TaxBaseSellPrice4`]).toBe("80,001.00");
    expect(o[`${P}txtPg2P4Sch2NameOfCorpStock2`]).toBe("BETA CORP");
    // running total, each step through toFixed(0): 100,000.50 → 100,001 ; +250,000.25 → 350,001 ; +75,000 ; +80,001
    expect(o[`${P}txtPg2P4Sch2TotAmount`]).toBe("505,002.00");
    expect(o[`${P}txtPg2P4Sch3TotAmount`]).toBe("19,001.00"); // 10,000 → 15,000 (5,000.25 rounds away) → 17,500 → 19,001
    expect(o[`${P}txtPg1P2I10TaxBase`]).toBe("505,002.00");
    expect(o[`${P}txtPg1P2I12NetCptalChnged`]).toBe("486,001.00");
    expect(o[`${P}txtPg1P2I13TaxDueForTrans`]).toBe("72,900.00"); // 72,900.15 → toFixed(0)
    expect(o[`${P}txtPg1P2I16TaxPayable`]).toBe("71,900.00"); // 72,900 − 1,000.40 → 71,899.60 → 71,900
    expect(o[`${P}txtPg1P2I17TotPenalties`]).toBe("1,623.00");
    expect(o[`${P}txtPg1P2I18TotAmtPyable`]).toBe("73,523.00");
    expect(validate1707v2018(cash, groups)).toEqual([]);
  });

  it("foreign corporation: a FLAT 5% (≤ ₱100,000) or 10% (> ₱100,000) on the whole net gain — BIR's 2018 rate bug", () => {
    expect(one({ ...cash, ...foreignCorp })[`${P}txtPg1P2I13TaxDueForTrans`]).toBe("48,600.00"); // 486,001 × 10%
    const small = one({ ...cash, ...foreignCorp, ...sched3(1, "BROKER'S FEE", "496,000.00") });
    expect(small[`${P}txtPg1P2I12NetCptalChnged`]).toBe("1.00");
    expect(small[`${P}txtPg1P2I13TaxDueForTrans`]).toBe("0.00"); // 1 × 5% = 0.05 → toFixed(0)
    const domestic = one({ ...cash, ...foreignCorp, [`${P}rdoCorpoDomestic`]: "true", [`${P}rdoCorpoForeign`]: "false" });
    expect(domestic[`${P}txtPg1P2I13TaxDueForTrans`]).toBe("72,900.00");
  });

  it("foreclosure is taxed like cash; others is forced to 0.00; a net loss leaves the literal \"0\"", () => {
    expect(one({ ...cash, ...tx("Foreclosure") })[`${P}txtPg1P2I13TaxDueForTrans`]).toBe("72,900.00");
    const others = one({ ...cash, ...tx("Others"), [`${P}txtPg1I9TransDescSpec`]: "dacion" });
    expect(others[`${P}txtPg1P2I13TaxDueForTrans`]).toBe("0.00");
    expect(others[`${P}txtPg1I9TransDescSpec`]).toBe("DACION");
    expect(others[`${P}txtPg1P2I18TotAmtPyable`]).toBe("1,623.00"); // 16 = −1,000 < 0 with penalties → 17D
    const loss = one({ ...cash, ...sched3(1, "BROKER'S FEE", "900,000.00") });
    expect(loss[`${P}txtPg1P2I13TaxDueForTrans`]).toBe("0");
  });

  it("installment: Schedule 1 item 7 = 5 × typed rate ÷ 100 (whole pesos) → 14; rate ≥ 100 resets to 0.00", () => {
    const o = one(installment);
    expect(o[`${P}txtPg2P4Sch1I7PeriodTaxDue`]).toBe("37,500.00"); // 37,500.4995 → 37,500
    expect(o[`${P}txtPg1P2I14TaxDuePmtPriod`]).toBe("37,500.00");
    expect(o[`${P}txtPg1P2I13TaxDueForTrans`]).toBe("0.00");
    expect(o[`${P}txtPg1P2I15TaxPaidInPrevRtrn`]).toBe("0.00");
    expect(o[`${P}txtPg1P2I16TaxPayable`]).toBe("37,500.00");
    expect(o[BASE1]).toBe("0.00");
    const high = one({ ...installment, [`${P}txtPg2P4Sch1I6ApplcRate`]: "150.00" });
    expect(high[`${P}txtPg2P4Sch1I6ApplcRate`]).toBe("0.00");
    expect(high[`${P}txtPg2P4Sch1I7PeriodTaxDue`]).toBe("0.00");
    expect(validate1707v2018({ ...installment, [`${P}txtPg2P4Sch1I6ApplcRate`]: "150.00" }, groups).map((p) => p.id)).toContain(`${P}txtPg2P4Sch1I6ApplcRate`);
    expect(one({ ...installment, ...tx("Cash") })[`${P}txtPg2P4Sch1I6ApplcRate`]).toBe("0.00");
  });

  it("saves the typo'd row-1 key, row-1 shares, buyer rows past 3 and the pop-ups; v2018 pop-up amounts must be whole pesos", () => {
    const rec = new Map(formRecords(FORM_1707V2018, cash, groups).map((r) => [r.key, r.value]));
    expect(rec.get(BASE1)).toBe("100,000.50");
    expect(rec.get(`${P}txtPg2P4Sch2NoOfShares1`)).toBe("1,000.00");
    expect(rec.get(`${P}txtPg1I7BuyerName4`)).toBe("B5 CORP");
    expect(rec.get("chkBuyerDelete4")).toBe("false");
    expect(rec.get(`${P}txtPg1I6SellerName0`)).toBe("DELA CRUZ, JUAN");
    expect(rec.get("Pg2Pt4S2SubTotal")).toBe("80,001.00");
    expect(rec.get(`${P}txtPg2Pt4S3_2Col1`)).toBe("COURIER");
    const bad = validate1707v2018(cash, { ...groups, sched3more: [{ [`${P}txtPg2Pt4S3_{i}Col1`]: "A", [`${P}txtPg2Pt4S3_{i}Col2`]: "1.50" }, { [`${P}txtPg2Pt4S3_{i}Col1`]: "B", [`${P}txtPg2Pt4S3_{i}Col2`]: "2.00" }] });
    expect(bad.map((p) => p.id)).toEqual([`${P}txtPg2Pt4S3_1Col2`]);
  });
});

describe.skipIf(!hasForm("1707v2018"))("native 1707v2018 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  const file = "84653210700000-1707v2018-09302019.xml";

  it("BIR rebuilds sellers / buyers, Schedules 2/3 and both pop-ups on reopen and recomputes the same chain", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1707V2018, { ...cash, ...foreignCorp }, file, groups);
    expect(await value(`${P}txtPg1I7BuyerName4`)).toBe("B5 CORP");
    expect(await value(BASE1)).toBe("100,000.50");
    expect(await value(`${P}txtPg2P4Sch2NameOfCorpStock4`)).toBe("OTHERS");
    expect(await value(`${P}txtPg2Pt4S2_2Col4`)).toBe("30,001.00");
    expect(await value(`${P}txtPg2Pt4S3_2Col1`)).toBe("COURIER");
    await page.evaluate(() => {
      const w = window as unknown as Record<string, () => void>;
      w.pageTwoSched2Comp!();
      w.pageTwoSched3Comp!();
    });
    expect(await value(`${P}txtPg2P4Sch2TotAmount`)).toBe("505,002.00");
    expect(await value(`${P}txtPg1P2I13TaxDueForTrans`)).toBe("48,600.00");
    expect(await value(`${P}txtPg1P2I18TotAmtPyable`)).toBe("49,223.00");
    await page.close();
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with populated schedules — cash (individual, foreign corporation) and others (parityCheck)", async () => {
    for (const s of [cash, { ...cash, ...foreignCorp }, { ...cash, ...tx("Others"), [`${P}txtPg1I9TransDescSpec`]: "DACION" }]) {
      const r = await parityCheck(oracle, FORM_1707V2018, s, file, groups);
      expect(parityProblem(r)).toEqual([]);
      expect(r.equal_count).toBe(r.key_count);
    }
  }, 120_000);

  it("is 1:1 — installment sale and a net loss (parityCheck)", async () => {
    const a = await parityCheck(oracle, FORM_1707V2018, installment, file, { seller: groups.seller!, buyer: groups.buyer! });
    expect(parityProblem(a)).toEqual([]);
    const b = await parityCheck(oracle, FORM_1707V2018, { ...cash, ...sched3(1, "BROKER'S FEE", "900,000.00") }, file, groups);
    expect(parityProblem(b)).toEqual([]);
  }, 120_000);
});
