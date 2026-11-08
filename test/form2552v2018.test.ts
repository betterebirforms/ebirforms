import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_2552V2018, validate2552v2018 } from "@/form/form2552v2018.ts";
import { parseMoney } from "@/form/money.ts";
import { legacyUnescape } from "@/lib/savefile.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm2552:";
const base: FormState = {
  [`${P}txtPg1I1Month`]: "03", [`${P}txtPg1I1Day`]: "31", [`${P}txtPg1I1Year`]: "2022",
  [`${P}rdoPg1I2AmendedYes`]: "true", [`${P}rdoPg1I2AmendedNo`]: "false",
  [`${P}txtPg1TIN1`]: "846", [`${P}txtPg1TIN2`]: "532", [`${P}txtPg1TIN3`]: "107", [`${P}txtPg1TIN4`]: "00000",
  [`${P}txtPg1I5RDO`]: "043", [`${P}rdoPg1Pt1I5RDO`]: "043", [`${P}txtPg1Pt1I6Name`]: "ACME SECURITIES INC.",
  [`${P}txtPg1Pt1I7RegisteredAddress`]: "1 ayala ave., makati", [`${P}txPg1I7ZipCode`]: "1226", [`${P}txtPg1Pt1I8ContactNumber`]: "0281234567",
  [`${P}rdoPg1I10TaxReliefYes`]: "false", [`${P}rdoPg1I10TaxReliefNo`]: "true",
  [`${P}txtPg1P2I17TaxPaidInPrevRtrn`]: "100.40", [`${P}txtPg1P2I18CredTaxWthhld`]: "50.30",
  [`${P}txtPg1P2I21Surcharge`]: "25.00", [`${P}txtPg1P2I22Interest`]: "10.45", [`${P}txtPg1P2I23Compromise`]: "0.00",
  // Part IV / VI (information only)
  [`${P}txtPg2P4I1TransClass`]: "stock dividend", [`${P}txtPg2P4I1Amount`]: "12,345.67",
  [`${P}txtPg2Pt6Date1`]: "03/15/2022", [`${P}txtPg2Pt6Seller1`]: "seller a", [`${P}txtPg2Pt6Buyer1`]: "BUYER A", [`${P}txtPg2Pt6Corp1`]: "XYZ CORP", [`${P}txtPg2Pt6NumShares1`]: "1,000.00",
};
const kind = (k: "LSE" | "Primary" | "Secondary"): FormState =>
  Object.fromEntries(["LSE", "Primary", "Secondary"].map((x) => [`${P}rdoPg1I11Transaction${x}`, String(x === k)]));
const row = (s: number, i: number, date: string, seller: string, buyer: string, corp: string, shares: string, taxBase: string, rate?: string): FormState => ({
  [`${P}txtPg2Pt5Sch${s}Date${i}`]: date, [`${P}txtPg2Pt5Sch${s}Seller${i}`]: seller, [`${P}txtPg2Pt5Sch${s}Buyer${i}`]: buyer,
  [`${P}txtPg2Pt5Sch${s}Corp${i}`]: corp, [`${P}txtPg2Pt5Sch${s}NumShares${i}`]: shares, [`${P}txtPg2Pt5Sch${s}TaxBase${i}`]: taxBase,
  ...(rate === undefined ? {} : { [`${P}txtPg2Pt5Sch${s}TaxRate${i}`]: rate }),
});
const rows = (s: number, rate?: string): FormState => ({
  ...row(s, 1, "03/01/2022", "seller one", "BUYER ONE", "ABC CORP", "1,000.00", "100,000.55", rate),
  ...row(s, 2, "03/02/2022", "SELLER TWO", "BUYER TWO", "DEF INC", "2,000.00", "250,083.33", rate),
  ...row(s, 3, "03/03/2022", "SELLER THREE", "BUYER THREE", "GHI CORP", "500.00", "75,000.00", rate),
  ...row(s, 4, "03/04/2022", "SELLER FOUR", "BUYER FOUR", "JKL CORP", "800.00", "80,000.00", rate),
});
const pop = (s: number, n: number, shares: string, taxBase: string, rate?: string) => ({
  [`${P}txtPg2Pt5Sch${s}_{i}Col1`]: `03/2${n}/2022`, [`${P}txtPg2Pt5Sch${s}_{i}Col2`]: `pop seller ${n}`, [`${P}txtPg2Pt5Sch${s}_{i}Col3`]: `POP BUYER ${n}`,
  [`${P}txtPg2Pt5Sch${s}_{i}Col4`]: `POP CORP ${n}`, [`${P}txtPg2Pt5Sch${s}_{i}Col5`]: shares, [`${P}txtPg2Pt5Sch${s}_{i}Col6`]: taxBase,
  ...(rate === undefined ? {} : { [`${P}txtPg2Pt5Sch${s}_{i}Col7`]: rate }),
});
const lse: FormState = { ...base, ...kind("LSE"), ...rows(1), ...rows(2, "4.00") /* dead: Schedule 2 is reset for an LSE sale */ };
const primary: FormState = {
  ...base, ...kind("Primary"), [`${P}txtPg1Pt1I12NumOfShare`]: "1,000,000", [`${P}txtPg1Pt1I12TotShare`]: "4,000,000",
  ...rows(2, "4.00"), ...row(2, 5, "03/05/2022", "SELLER FIVE", "BUYER FIVE", "MNO CORP", "100.00", "9,999.00", "2.00"),
};
const groups: GroupState = {
  sched1more: [pop(1, 1, "300.00", "30,000.00"), pop(1, 2, "200.00", "20,083.00"), pop(1, 3, "100.00", "10,000.00")],
  sched3more: [pop(3, 1, "300.00", "30,000.00", "1.00"), pop(3, 2, "200.00", "20,000.00", "2.00")],
};
/** Only the pop-up of the schedule item 11 picked (validate rejects the others' rows). */
const live = (s: number): GroupState => ({ [`sched${s}more`]: groups[`sched${s}more`] ?? [] });
const secondary: FormState = { ...base, ...kind("Secondary"), [`${P}txtPg1Pt1I12NumOfShare`]: "500", [`${P}txtPg1Pt1I12TotShare`]: "9,000", ...rows(3, "1.00") };

describe("2552v2018 compute (Schedules 1/2/3 by item 11, whole-peso toFixed(0) chain)", () => {
  it("LSE sale: Schedule 1 at 0.6% per row in whole pesos, row 5 = pop-up subtotal → 13; 16, 19, 20, 24, 25", () => {
    const o = computeForm(FORM_2552V2018, lse, groups);
    expect(o[`${P}txtPg2Pt5Sch1TaxDue1`]).toBe("600.00"); // 100,000.55 × 0.6 ÷ 100 = 600.0033 → toFixed(0)
    expect(o[`${P}txtPg2Pt5Sch1TaxDue2`]).toBe("1,500.00"); // 1,500.49998
    expect(o[`${P}txtPg2Pt5Sch1TaxRate1`]).toBe("6/10 of 1%");
    // pop-up rows: 180, 120.498 → 120, 60 → subtotal 360 into row 5
    expect(o[`${P}txtPg2Pt5Sch1Seller5`]).toBe("OTHERS");
    expect(o[`${P}txtPg2Pt5Sch1TaxBase5`]).toBe("OTHERS");
    expect(o[`${P}txtPg2Pt5Sch1TaxDue5`]).toBe("360.00");
    expect(o[`${P}txtPg2Pt5Sch1TaxDueTot`]).toBe("3,390.00");
    expect(o[`${P}txtPg1P2I13TaxDue`]).toBe("3,390.00");
    expect(o[`${P}txtPg1P2I14TaxDue`]).toBe("0.00");
    expect(o[`${P}txtPg2Pt5Sch2TaxBase1`]).toBe("0.00"); // reset: Schedule 2 is not live
    expect(o[`${P}txtPg2Pt5Sch2Seller1`]).toBe("");
    expect(o[`${P}txtPg1P2I16TotTaxDue`]).toBe("3,390.00");
    expect(o[`${P}txtPg1P2I19TotTaxCredPmnt`]).toBe("151.00"); // 100.40 + 50.30 = 150.70 → toFixed(0)
    expect(o[`${P}txtPg1P2I20TotTaxStllDueOvrPmnt`]).toBe("3,239.00");
    expect(o[`${P}txtPg1P2I24TotPenalties`]).toBe("35.00"); // 35.45 → 35
    expect(o[`${P}txtPg1P2I25TotAmntPyable`]).toBe("3,274.00");
    expect(o[`${P}txtPg1Pt1I12NumOfShare`] ?? "").toBe(""); // kindOfTransaction clears 12A/12B for an LSE sale
    expect(o[`${P}txtPg1Pt1I7RegisteredAddress`]).toBe("1 AYALA AVE., MAKATI");
    expect(o[`${P}txtPg2P4I1TransClass`]).toBe("STOCK DIVIDEND");
    expect(validate2552v2018(lse, live(1))).toEqual([]);
    expect(validate2552v2018(lse, groups).map((p) => p.id)).toEqual(["Pg2Pt5Sch3PopLength"]);
  });

  it("primary offering: Schedule 2 at the typed rates → 14; secondary: Schedule 3 (+ pop-up at its own rates) → 15", () => {
    const p = computeForm(FORM_2552V2018, primary, groups);
    expect(p[`${P}txtPg2Pt5Sch2TaxDue1`]).toBe("4,000.00"); // 4,000.022
    expect(p[`${P}txtPg2Pt5Sch2TaxDue2`]).toBe("10,003.00"); // 10,003.3332
    expect(p[`${P}txtPg2Pt5Sch2TaxDue5`]).toBe("200.00"); // 9,999 × 2% = 199.98
    expect(p[`${P}txtPg1P2I14TaxDue`]).toBe("20,403.00");
    expect(p[`${P}txtPg1P2I13TaxDue`]).toBe("0.00");
    expect(p[`${P}txtPg2Pt5Sch1TaxDue5`]).toBe("0.00"); // Schedule 1's pop-up is dead too
    expect(p[`${P}txtPg1Pt1I12NumOfShare`]).toBe("1,000,000");
    const rec = new Map(formRecords(FORM_2552V2018, primary, groups).map((r) => [r.key, r.value]));
    expect(rec.get("Pg2Pt5Sch1PopLength")).toBe(""); // enableSchedule clears the other schedules' PopLength
    const s = computeForm(FORM_2552V2018, secondary, groups);
    expect(s[`${P}txtPg2Pt5Sch3TaxDue5`]).toBe("700.00"); // 300 + 400
    expect(s[`${P}txtPg2Pt5Sch3TaxRate5`]).toBe("OTHERS");
    expect(s[`${P}txtPg1P2I15TaxDue`]).toBe("5,751.00"); // 1,000 + 2,501 + 750 + 800 + 700 (each rounded)
  });

  it("an overpayment keeps the refund / TCC choice; otherwise BIR unchecks it; 25 = 24 when 20 < 0", () => {
    const over = { ...lse, [`${P}txtPg1P2I18CredTaxWthhld`]: "10,000.00", [`${P}rdoPg1OverpaymentRefund`]: "true", [`${P}rdoPg1OverpaymentTaxCredCert`]: "false" };
    const o = computeForm(FORM_2552V2018, over, groups);
    expect(o[`${P}txtPg1P2I20TotTaxStllDueOvrPmnt`]).toBe("-6,710.00");
    expect(o[`${P}txtPg1P2I25TotAmntPyable`]).toBe("35.00");
    expect(o[`${P}rdoPg1OverpaymentRefund`]).toBe("true");
    expect(computeForm(FORM_2552V2018, { ...lse, [`${P}rdoPg1OverpaymentRefund`]: "true" }, groups)[`${P}rdoPg1OverpaymentRefund`]).toBe("false");
    const notAmended = computeForm(FORM_2552V2018, { ...lse, [`${P}rdoPg1I2AmendedYes`]: "false", [`${P}rdoPg1I2AmendedNo`]: "true" }, groups);
    expect(notAmended[`${P}txtPg1P2I17TaxPaidInPrevRtrn`]).toBe("0.00");
    expect(notAmended[`${P}txtPg1P2I19TotTaxCredPmnt`]).toBe("50.00");
  });

  it("saves the pop-up rows (tax due computed, Schedule 1 rate literal), PopLength and SubTotal", () => {
    const rec = new Map(formRecords(FORM_2552V2018, lse, groups).map((r) => [r.key, r.value]));
    expect(rec.get(`${P}txtPg2Pt5Sch1_2Col8`)).toBe("120.00");
    expect(rec.get(`${P}txtPg2Pt5Sch1_2Col7`)).toBe("6/10 of 1%");
    expect(rec.get(`${P}txtPg2Pt5Sch1_1Col2`)).toBe("POP SELLER 1");
    expect(rec.get("Pg2Pt5Sch1PopLength")).toBe("3");
    expect(rec.get("Pg2Pt5Sch1SubTotal")).toBe("360.00");
    expect(rec.get(`${P}txtPg1Pt1I6Name`)).toBe("ACME%20SECURITIES%20INC.");
  });

  it("validates item 11, 12A/B, overpayment choice, incomplete rows and the pop-up's whole numbers", () => {
    expect(validate2552v2018(primary, {})).toEqual([]);
    const bad = validate2552v2018({ ...primary, [`${P}txtPg1Pt1I12TotShare`]: "", ...row(2, 3, "", "", "", "", "0.00", "5.00", "4.00"), [`${P}txtPg2P4I2Amount`]: "1.00" }, {
      sched2more: [pop(2, 1, "1.00", "10.50", "4.00")],
    });
    expect(bad.map((p) => p.id)).toEqual(expect.arrayContaining([
      `${P}txtPg1Pt1I12NumOfShare`, `${P}txtPg2Pt5Sch2Date3`, `${P}txtPg2P4I2TransClass`, "Pg2Pt5Sch2PopLength", `${P}txtPg2Pt5Sch2_1Col6`,
    ]));
    expect(validate2552v2018({ ...base }, {}).map((p) => p.id)).toContain(`${P}rdoPg1I11TransactionLSE`);
  });
});

describe.skipIf(!hasForm("2552v2018"))("native 2552v2018 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  const file = "84653210700000-2552v2018-03312022.xml";

  for (const [name, state, s] of [["LSE", lse, 1], ["primary", primary, 2], ["secondary", secondary, 3]] as const) {
    const groups = live(s);
    it(`${name}: BIR rebuilds Schedule ${s} (and its pop-up) on reopen and its own compute reproduces every native value`, async () => {
      const escaped = new Set(FORM_2552V2018.field.filter((f) => f.escaped).map((f) => f.id));
      const native = new Map(formRecords(FORM_2552V2018, state, groups).map((r) => [r.key, escaped.has(r.key) ? legacyUnescape(r.value) : r.value]));
      const { page, error } = await oracle.openSaved(FORM_2552V2018, state, file, groups);
      const legacy: Array<[string, string]> = await page.evaluate((s) => {
        const w = window as unknown as Record<string, (...a: unknown[]) => void>;
        const sch = `Sch${s}`;
        // the pop-up's own blur handlers, then every live row's (row 5 holds the pop-up subtotal when "OTHERS")
        if ((document.getElementById(`Pg2Pt5${sch}PopTable1st`) as HTMLTableElement).rows.length) w.Sum_Pg2Pt5AddMore!(sch);
        for (let i = 1; i <= 5; i++) {
          if ((document.getElementById(`frm2552:txtPg2Pt5${sch}TaxBase${i}`) as HTMLInputElement).value !== "OTHERS") w.pageTwoComputation!(sch, String(i));
        }
        w.totTaxDueComp!(sch);
        const form = document.getElementById("frmMain") as HTMLFormElement;
        return (Array.from(form.elements) as HTMLInputElement[])
          .filter((e) => e.id && ["text", "select-one", "radio", "checkbox"].includes(e.type))
          .map((e) => [e.id, e.type === "radio" || e.type === "checkbox" ? String(e.checked) : e.value] as [string, string]);
      }, s);
      await page.close();
      const money = /^-?[\d,]*\.\d\d$/;
      const diff: string[] = [];
      for (const [key, value] of new Map(legacy)) {
        const mine = native.get(key);
        if (mine === undefined) continue;
        const equal = money.test(mine) && money.test(value) ? parseMoney(mine) === parseMoney(value) : mine === value;
        if (!equal) diff.push(`${key}: native ${mine} vs BIR ${value}`);
      }
      expect(diff).toEqual([]);
      expect(new Map(legacy).get(`frm2552:txtPg2Pt5Sch${s}Seller1`)).toBe("SELLER ONE");
      expect(error).toEqual([]);
    }, 120_000);
  }

  it("is 1:1 with populated schedules for every kind of transaction (parityCheck)", async () => {
    const over = { ...lse, [`${P}txtPg1P2I18CredTaxWthhld`]: "10,000.00", [`${P}rdoPg1OverpaymentTaxCredCert`]: "true" };
    for (const [state, s] of [[lse, 1], [primary, 2], [secondary, 3], [over, 1]] as const) {
      const r = await parityCheck(oracle, FORM_2552V2018, state, file, live(s));
      expect(parityProblem(r)).toEqual([]);
      expect(r.equal_count).toBe(r.key_count);
    }
  }, 120_000);
});
