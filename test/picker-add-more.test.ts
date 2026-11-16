// BIR turns on 1707's and 2552's "(Add More...)" only once the schedule's fixed rows are all filled in
// (Check_Pg2Pt4S2 / Check_Pg2Pt4S3, Check_Pg2Pt5AddMore), or once its pop-up already holds rows.
import { describe, expect, it } from "vitest";
import { BUTTON_GROUP } from "../src/form/picker.ts";
import type { FormState } from "../src/form/schema.ts";

const rows = (n: number, row: (i: number) => FormState): FormState => Object.assign({}, ...Array.from({ length: n }, (_, i) => row(i + 1)));

describe.each(["1707v2018", "1707v2021"])("%s Part IV Add More", (code) => {
  const sch2 = BUTTON_GROUP[code]!.btnPg2Pt4Sch2More!.on!;
  const sch3 = BUTTON_GROUP[code]!.btnPg2Pt4Sch3More!.on!;
  const full2 = rows(4, (i) => ({ [`frm1707:txtPg2P4Sch2NameOfCorpStock${i}`]: `CORP ${i}`, [`frm1707:txtPg2P4Sch2NoOfShares${i}`]: "100.00", [`frm1707:txtPg2P4Sch2StockCertNo${i}`]: `C${i}`, [`frm1707:txtPg2P4Sch2TaxBaseSellPrice${i}`]: "1000.00" }));
  it("Schedule 2: off on a blank form, on once rows 1 to 4 are filled, off when one amount is zero", () => {
    expect(sch2({}, {})).toBe(false);
    expect(sch2({}, full2)).toBe(true);
    expect(sch2({}, { ...full2, "frm1707:txtPg2P4Sch2NoOfShares3": "0.00" })).toBe(false);
    expect(sch2({}, { ...full2, "frm1707:txtPg2P4Sch2StockCertNo4": " " })).toBe(true); // BIR does not trim the cert no.
    expect(sch2({ sched2more: [{}] }, {})).toBe(true);
  });
  it("Schedule 3: on once rows 1 to 4 have particulars and an amount", () => {
    const full3 = rows(4, (i) => ({ [`frm1707:txtPg2P4Sch3Particulars${i}`]: `P${i}`, [`frm1707:txtPg2P4Sch3Amount${i}`]: "5.00" }));
    expect(sch3({}, full3)).toBe(true);
    expect(sch3({}, { ...full3, "frm1707:txtPg2P4Sch3Particulars2": "  " })).toBe(false);
  });
});

describe("2552v2018 Part V Add More", () => {
  const sch1 = BUTTON_GROUP["2552v2018"]!.btnPg2Pt5Sch1More!.on!;
  const full = rows(5, (i) => ({
    ...Object.fromEntries(["Date", "Seller", "Buyer", "Corp"].map((c) => [`frm2552:txtPg2Pt5Sch1${c}${i}`, c === "Date" ? "01/01/2018" : `${c} ${i}`])),
    [`frm2552:txtPg2Pt5Sch1NumShares${i}`]: "10.00", [`frm2552:txtPg2Pt5Sch1TaxBase${i}`]: "1000.00", [`frm2552:txtPg2Pt5Sch1TaxRate${i}`]: "6/10 of 1%",
  }));
  it("off on a blank form, on once rows 1 to 5 are full, off when a tax base is zero", () => {
    expect(sch1({}, {})).toBe(false);
    expect(sch1({}, full)).toBe(true);
    expect(sch1({}, { ...full, "frm2552:txtPg2Pt5Sch1TaxBase5": "0.00" })).toBe(false);
  });
});
