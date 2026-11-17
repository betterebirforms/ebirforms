import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, attachmentCopy, type FormState } from "@/form/schema.ts";
import { FORM_1701 } from "@/form/form1701.ts";
import { attachmentCount, simulate } from "@/form/form1701-sim.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { allPageParityCheck } from "./parity-page.ts";
import { parityProblem } from "./parity.ts";
import { bizItemized, id } from "./form1701-case.ts";

// BIR's Part IX attachments (Part X on the form): a copy of its page 1m-5m block per exempt (EX) or special-rate (SP)
// activity, built by addAttachment. frm1701:txtAttachmentTypes ("EX2,SP1") is what BIR saves to rebuild them on reload.
const of = (o: Record<string, string>): FormState => Object.fromEntries(Object.entries(o).map(([k, v]) => [id(k), v]));
const calc = (s: FormState) => computeForm(FORM_1701, s);
const v = (o: FormState, k: string) => o[id(k)];

const yes = of({ rdoPg1Pt1I22IncomeExemptYes: "true", rdoPg1Pt1I22IncomeExemptNo: "false", rdoPg1Pt1I23IncomeSpecialYes: "true", rdoPg1Pt1I23IncomeSpecialNo: "false" });
/** two exempt copies and one special-rate copy, the filer's own (taxpayer column C1) figures in each */
const withCopy: FormState = {
  ...bizItemized,
  ...yes,
  ...of({
    txtAttachmentTypes: "EX2,SP1",
    txtPg1mScAI1InvestmentPromotionC1EX1: "BOI", txtPg1mScAI2LegalBasisC1EX1: "RA 7916", txtPg1mScAI3RegisteredActivityC1EX1: "MANUFACTURING",
    txtPg2mScDI1TotalSalesC1EX1: "400,000.00", txtPg2mScDI4LessSalesReturnsC1EX1: "10,000.00",
    txtPg2mScF1I1MerchandiseInventoryC1EX1: "20,000.00", txtPg2mScF1I2AddPurchaseofMerchandiseC1EX1: "100,000.00", txtPg2mScF1I4LessMerchandiseInventoryC1EX1: "5,000.00",
    txtPg3mScHI1AdvertisingC1EX1: "3,000.00", txtPg3mScHI13FuelC1EX1: "2,500.00",
    txtPg2mScDI1TotalSalesC1EX2: "250,000.00", txtPg3mScHI8CommunicationC1EX2: "1,200.00",
    txtPg1mScAI1InvestmentPromotionC1SP1: "PEZA", txtPg1mScAI4ISpecialTaxRateC1SP1: "5",
    txtPg2mScDI1TotalSalesC1SP1: "600,000.00", txtPg2mScDI4LessSalesReturnsC1SP1: "20,000.00",
    txtPg3mScHI7CommissionsC1SP1: "7,000.00", txtPg5mScJI2TaxPaymentsC1SP1: "4,000.00",
  }),
};

describe("1701 attachments (BIR's addAttachment copies of the page 1m-5m block)", () => {
  it("counts the copies from BIR's EX/SP counter, capped at the modelled maximum", () => {
    expect(attachmentCount("")).toEqual({ EX: 0, SP: 0 });
    expect(attachmentCount("EX2,SP1")).toEqual({ EX: 2, SP: 1 });
    expect(attachmentCount("EX9,SP0")).toEqual({ EX: 5, SP: 0 });
    expect(attachmentCopy(FORM_1701.attachment!, { [id("txtAttachmentTypes")]: "EX2,SP1" })).toEqual(["EX1", "EX2", "SP1"]);
  });

  it("models 5 copies of 348 boxes per kind", () => {
    const copy = FORM_1701.field.filter((f) => /(EX|SP)\d$/.test(f.id));
    expect(copy.length).toBe(2 * 5 * 348);
    expect(FORM_1701.field.some((f) => f.id === id("txtPg1mTIN1EX5"))).toBe(true);
  });

  it("a blank form has no copy records; a form with copies saves BIR's block once per copy, before the source block", () => {
    const blank = formRecords(FORM_1701, bizItemized).map((r) => r.key);
    expect(blank.filter((k) => /(EX|SP)\d$/.test(k))).toEqual([]);
    const key = formRecords(FORM_1701, withCopy).map((r) => r.key);
    expect(key.filter((k) => /EX1$/.test(k)).length).toBe(348);
    expect(key.filter((k) => /EX2$/.test(k)).length).toBe(348);
    expect(key.filter((k) => /SP1$/.test(k)).length).toBe(348);
    expect(key.length).toBe(blank.length + 3 * 348);
    // block A (332 boxes per copy) sits right before the source block, EX1, EX2, SP1 in that order
    const first = key.indexOf(id("txtPg1mTIN1EX1"));
    expect(key[first - 1]).toBe("attachmentTotal");
    expect(key[first + 332]).toBe(id("txtPg1mTIN1EX2"));
    expect(key[first + 664]).toBe(id("txtPg1mTIN1SP1"));
    expect(key[first + 996]).toBe(id("txtPg1mTIN1TYPE"));
  }, 60_000); // whole-form computes with five copies: past vitest's 5 s default on a loaded machine (13.5 s seen)

  it("runs BIR's handlers over the copies; the only script errors are BIR's own (the oracle's page errors too)", () => {
    // BIR's disableLinkIfEmpty -> isAmountValid asks getSpouseIDviaTaxfilerID for a copy's box, gets "" and reads
    // removeCommaParenthesis("") off <HTA:APPLICATION>: it throws in BIR's page as well and aborts that handler
    const sim = simulate((k) => withCopy[k] ?? "");
    expect(sim.fault.filter((f) => !/reading 'toString'/.test(f.message))).toEqual([]);
  });

  it("computes each copy by BIR's own page script: Schedules D, F1, H and B, the exempt copy's 0.0 rate", () => {
    const o = calc(withCopy);
    expect(v(o, "txtAttachmentTypes")).toBe("EX2,SP1");
    expect(v(o, "txtPg2mScDI5NetSalesC1EX1")).toBe("390000"); // 400,000 - 10,000 returns
    expect(v(o, "txtPg2mScDI5NetSalesC1EX2")).toBe("250000");
    expect(v(o, "txtPg2mScDI5NetSalesC1SP1")).toBe("580000");
    expect(v(o, "txtPg1mScAI4ISpecialTaxRateC1EX1")).toBe("0.0"); // the exempt rule locks Schedule A item 4 at 0.0
    expect(v(o, "rdoPg1mSpecialRateSP1")).toBe("true");
  });

  it("with no counter nothing of the copies is saved and the main form is the form without attachments", () => {
    const o = calc({ ...withCopy, ...of({ txtAttachmentTypes: "" }) });
    expect(v(o, "txtAttachmentTypes")).toBe("");
    expect(v(o, "txtPg2Pt4I66TotalTaxableC1")).toBe(v(calc(bizItemized), "txtPg2Pt4I66TotalTaxableC1"));
  });
});

const PAGE = "[id^=Page][id$=Content]";
// IE's jQuery 1.7 tolerated what the oracle's jQuery rejects: `$("#")` (hideCurrentPage's first call) and the
// `[id="#"attachmentEX]` selector of addFocusBlurEvent (presentation only). The oracle page gets BIR's page with
// those two spots neutral; nothing else of BIR's code is touched.
const IE_TOLERANT: Array<[string, string]> = [
  ['var currentAttachmentPage = "";', 'var currentAttachmentPage = "Page1mXContent";'],
  ["function addFocusBlurEvent(tableID) {", "function addFocusBlurEvent(tableID) { return;"],
];
/** BIR's reload clones the 348-box block through innerHTML once per copy (seconds each), so wait for it; then what a
 *  filer does in BIR: each copy viewed (TYPE = the copy, the page boxes locked) and every enabled box of it left, twice;
 *  then Back to Main Form */
const VIEW_COPY = (ex: number, sp: number) => `(async () => {
  const w = window;
  for (let i = 0; i < 600 && !(w.totalEXArray && w.totalEXArray.length === ${ex} && w.totalSPArray.length === ${sp} && w.isReload === false); i++) await new Promise((r) => setTimeout(r, 100));
  const cur = document.getElementById('frm1701:txtCurrentPage');
  for (let pass = 0; pass < 2; pass++)
    for (const c of [...w.totalEXArray, ...w.totalSPArray]) {
      w.TYPE = c;
      cur.disabled = true;
      w.isOnAttachment = true;
      for (const el of Array.from(document.getElementById(c).querySelectorAll('input[type=text]'))) if (!el.disabled) el.dispatchEvent(new FocusEvent('blur'));
    }
  w.processBack();
})()`;

describe.skipIf(!hasForm("1701"))("native 1701 attachments are 1:1 with BIR's form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
    const open = oracle.browser.newPage.bind(oracle.browser);
    oracle.browser.newPage = (async (...arg: Parameters<typeof open>) => {
      const page = await open(...arg);
      await page.route(/BIR-Form1701\.hta/, async (route) => {
        const res = await route.fetch();
        let body = await res.text();
        for (const [from, to] of IE_TOLERANT) body = body.replace(from, to);
        await route.fulfill({ response: res, body });
      });
      return page;
    }) as typeof oracle.browser.newPage;
  }, 120_000);
  afterAll(() => oracle?.stop());
  const file = (s: FormState) => `84653210700000-1701-12${s[id("txtPg1I1Year")] ?? ""}.xml`;

  const cases: Array<[string, FormState, number, number]> = [
    ["one exempt copy", { ...withCopy, ...of({ txtAttachmentTypes: "EX1,SP0" }) }, 1, 0],
    ["two exempt copies and one special-rate copy", withCopy, 2, 1],
  ];
  for (const [name, state, ex, sp] of cases)
    it(`reloads in BIR and saves the same: ${name}`, async () => {
      const r = await allPageParityCheck(oracle, FORM_1701, state, file(state), {}, VIEW_COPY(ex, sp), PAGE, true);
      // BIR defect: a copy box that has no spouse partner makes removeCommaParenthesis("") read <HTA:APPLICATION>.value; it
      // throws in BIR and aborts that blur handler, which the native run reproduces (the sim lists them as faults too)
      r.page_error = r.page_error.filter((e) => !/senderValue\.toString/.test(e));
      expect(parityProblem(r)).toEqual([]);
    }, 300_000);
});
