import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupRow, type GroupState } from "@/form/schema.ts";
import { FORM_1801V2018, validate1801v2018 } from "@/form/form1801v2018.ts";
import { hasForm, startOracle, type Oracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1801v2018:";
/** One schedule row from short stems: row("sched3", { Particulars: "X", Exc: "1.00" }). */
const row = (sched: string, cell: Record<string, string>): GroupRow =>
  Object.fromEntries(Object.entries(cell).map(([k, v]) => [k === "Class" && sched.startsWith("sched1") ? `${P}${sched}Class_{i}'` : `${P}${sched}${k}_{i}`, v]));

const identity: FormState = {
  [`${P}txtDateMonth`]: "03", [`${P}txtDateDay`]: "15", [`${P}txtDateYear`]: "2024",
  [`${P}tinA_1`]: "846", [`${P}tinB_1`]: "532", [`${P}tinC_1`]: "107", [`${P}branchCode_1`]: "00000",
  [`${P}txtRDOCode_1`]: "043", [`${P}registeredName_1`]: "DELA CRUZ, JUAN", [`${P}registeredAddress_1`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}adminName`]: "DELA CRUZ, MARIA", [`${P}txtTINE1`]: "123", [`${P}txtTINE2`]: "456", [`${P}txtTINE3`]: "789", [`${P}txtBranchCodeE`]: "00000",
  [`${P}telephoneNumber`]: "0281234567",
};

// every schedule populated, both columns, three rows where BIR's reload must rebuild past its 2-row minimum
const groups: GroupState = {
  sched1: [
    row("sched1", { Oct: "TCT-001", Td: "TD-1", Loc: "QUEZON CITY", Lot: "LOT 1", Area: "200 SQM", Class: "RR", Fmv: "1,000,000.00", Zonal: "1,200,000.00", Exc: "1,200,000.00", Conj: "0.00" }),
    row("sched1", { Oct: "TCT-002", Td: "TD-2", Loc: "makati", Lot: "LOT 2", Area: "150 SQM", Class: "CR", Fmv: "3,000,000.00", Zonal: "2,500,000.00", Exc: "0.00", Conj: "3,000,000.00" }),
    row("sched1", { Oct: "OCT-003", Td: "TD-3", Loc: "BATANGAS", Lot: "LOT 3", Area: "1 HA", Class: "A", Fmv: "750,000.00", Zonal: "600,000.00", Exc: "500,000.00", Conj: "250,000.33" }),
  ],
  sched1A: [
    row("sched1A", { Oct: "TCT-100", Td: "TD-100", Loc: "PASIG", Area: "300 SQM", Class: "RR", Fmv: "8,000,000.00", Zonal: "7,500,000.00", Exc: "200,000.00", Conj: "8,000,000.00" }),
  ],
  sched2: [
    row("sched2", { Corp: "ABC CORP.", Class: "Listed", Stock: "COMMON", Shares: "1000", FmvPerShare: "150.00", Exc: "150,000.00", Conj: "0.00" }),
    row("sched2", { Corp: "XYZ INC.", Class: "Not Listed", Stock: "PREFERRED", Shares: "500", FmvPerShare: "200.00", Exc: "0.00", Conj: "100,000.00" }),
  ],
  sched2A: [
    row("sched2A", { Particulars: "CASH IN BANK", Exc: "50,000.00", Conj: "450,000.17" }),
    row("sched2A", { Particulars: "VEHICLE", Exc: "0.00", Conj: "800,000.00" }),
    row("sched2A", { Particulars: "JEWELRY", Exc: "25,000.00", Conj: "0.00" }),
  ],
  sched3: [
    row("sched3", { Particulars: "TRANSFER IN CONTEMPLATION OF DEATH", Exc: "100,000.00", Conj: "0.00" }),
    row("sched3", { Particulars: "REVOCABLE TRANSFER", Exc: "0.00", Conj: "60,000.00" }),
  ],
  sched4: [
    row("sched4", { Name: "JUAN'S STORE", Address: "QUEZON CITY", Rdo: "043", Exc: "300,000.00", Conj: "0.00" }),
    row("sched4", { Name: "DELA CRUZ TRADING", Address: "MANILA", Rdo: "030", Exc: "0.00", Conj: "700,000.00" }),
    row("sched4", { Name: "FARM", Address: "batangas", Rdo: "059", Exc: "10,000.00", Conj: "40,000.00" }),
  ],
};
const sched5: FormState = {
  [`${P}sched5EstateExc`]: "10,000.00", [`${P}sched5EstateConj`]: "200,000.00",
  [`${P}sched5InsolventExc`]: "5,000.00", [`${P}sched5InsolventConj`]: "15,000.00",
  [`${P}sched5UnpaidExc`]: "20,000.00", [`${P}sched5UnpaidConj`]: "120,000.00",
  [`${P}sched5LossesExc`]: "0.00", [`${P}sched5LossesConj`]: "30,000.00",
  [`${P}sched5VanishingExc`]: "40,000.00", [`${P}sched5VanishingConj`]: "0.00",
  [`${P}sched5TransferExc`]: "0.00", [`${P}sched5TransferConj`]: "25,000.00",
  [`${P}sched5Others_Specify`]: "FUNERAL", [`${P}sched5OthersExc`]: "1,000.00", [`${P}sched5OthersConj`]: "9,000.00",
};
const state: FormState = {
  ...identity, ...sched5,
  [`${P}amendedRtn_1`]: "true", [`${P}amendedRtn_2`]: "false",
  [`${P}categoryNonResident_1`]: "false", [`${P}categoryNonResident_2`]: "true",
  [`${P}optTreaty_1`]: "true", [`${P}optTreaty_2`]: "false", [`${P}treatyY`]: "RP-US",
  [`${P}instGranted_1`]: "true", [`${P}instGranted_2`]: "false", [`${P}freq_Mon`]: "true", [`${P}txtInstallmentYear`]: "2",
  [`${P}txtCredits_ForeignEst`]: "1,000.00", [`${P}txtCredits_TaxPrev`]: "500.00", [`${P}txtInstallment`]: "10,000.00",
  [`${P}txtPen_Surcharge`]: "1,000.00", [`${P}txtPen_Interest`]: "500.00", [`${P}txtPen_Compromise`]: "200.00",
  [`${P}txtStandardDed_C`]: "5,000,000.00", [`${P}txtFamDed_C`]: "4,000,000.00",
  [`${P}txtOtherDed_Specify`]: "RA 4917 BENEFITS", [`${P}txtOtherDed_C`]: "100,000.00",
};

describe("1801v2018 compute (TRAIN: 6% of the net taxable estate)", () => {
  const o = computeForm(FORM_1801V2018, state, groups);
  const v = (id: string) => o[`${P}${id}`];

  it("schedules → items 29–33 by column, gross estate 34", () => {
    expect([v("sched1Exc_Total"), v("sched1Conj_Total")]).toEqual(["1,700,000.00", "3,250,000.33"]);
    expect([v("txtRealProp_A"), v("txtRealProp_B"), v("txtRealProp_C")]).toEqual(["1,700,000.00", "3,250,000.33", "4,950,000.33"]);
    expect([v("txtFam_A"), v("txtFam_B"), v("txtFam_C")]).toEqual(["200,000.00", "8,000,000.00", "8,200,000.00"]);
    // item 31 = Schedule 2 (stock) + Schedule 2A (other personal property)
    expect([v("txtPersonalProp_A"), v("txtPersonalProp_B"), v("txtPersonalProp_C")]).toEqual(["225,000.00", "1,350,000.17", "1,575,000.17"]);
    expect([v("txtTaxable_A"), v("txtTaxable_B")]).toEqual(["100,000.00", "60,000.00"]);
    expect([v("txtBusiness_A"), v("txtBusiness_B")]).toEqual(["310,000.00", "740,000.00"]);
    expect([v("txtGrossEst_A"), v("txtGrossEst_B"), v("txtGrossEst_C")]).toEqual(["2,535,000.00", "13,400,000.50", "15,935,000.50"]);
  });

  it("Schedule 5 → 35; 36 = 34 − 35; special deductions 37; net estate 38; spouse share 39; net taxable 40", () => {
    expect([v("sched5Exc_Total"), v("sched5Conj_Total")]).toEqual(["76,000.00", "399,000.00"]);
    expect([v("txtOrdDed_A"), v("txtOrdDed_B"), v("txtOrdDed_C")]).toEqual(["76,000.00", "399,000.00", "475,000.00"]);
    expect([v("txtEstAfterDed_A"), v("txtEstAfterDed_B"), v("txtEstAfterDed_C")]).toEqual(["2,459,000.00", "13,001,000.50", "15,460,000.50"]);
    expect(v("txtTotalDed_C")).toBe("9,100,000.00");
    expect(v("txtNetEst_C")).toBe("6,360,000.50");
    expect(v("txtShareSpouse_C")).toBe("6,500,500.25"); // 36B ÷ 2
    expect(v("txtNetTaxEst_C")).toBe("-140,499.75");
    expect(v("txtTaxableEstate")).toBe("-140,499.75");
    expect(v("txtEstTaxDue")).toBe("0.00"); // computeNo18: no tax on a negative estate
  });

  it("6% estate tax, credits, installment, penalties, total payable", () => {
    const big = computeForm(FORM_1801V2018, { ...state, [`${P}txtFamDed_C`]: "0.00", [`${P}txtStandardDed_C`]: "1,000,000.00" }, groups);
    const b = (id: string) => big[`${P}${id}`];
    expect(b("txtTaxableEstate")).toBe("7,859,500.25"); // 15,460,000.50 − 1,000,000 − 0 − 100,000 − 6,500,500.25
    // × 6% = 471,570.015 exactly, but the float is 471570.01499… so BIR's toFixed(2) gives .01, not half-up .02
    expect(b("txtEstTaxDue")).toBe("471,570.01");
    expect(b("txtCredits_Tot")).toBe("1,500.00");
    expect(b("txtTaxPayable")).toBe("470,070.01");
    expect(b("txtTaxPayable_1st")).toBe("460,070.01");
    expect(b("txtPen_Tot")).toBe("1,700.00");
    expect(b("txtTotPayable")).toBe("461,770.01");
  });

  it("an overpayment with penalties pays the penalties alone (calculate_Part2's 22 < 0 && 23D > 0 branch)", () => {
    expect(v("txtTaxPayable")).toBe("-1,500.00");
    expect(v("txtTaxPayable_1st")).toBe("-11,500.00");
    expect(v("txtTotPayable")).toBe("1,700.00");
    const noPen = computeForm(FORM_1801V2018, { ...state, [`${P}txtPen_Surcharge`]: "0.00", [`${P}txtPen_Interest`]: "0.00", [`${P}txtPen_Compromise`]: "0.00" }, groups);
    expect(noPen[`${P}txtTotPayable`]).toBe("-11,500.00");
  });

  it("replicates BIR's float rounding (its formatCurrency is toFixed(2)) in items 39 and 18", () => {
    // 36B = 1,000.01 → 1000.01 / 2 = 500.00499999… → "500.00" (round-half-up on the decimal would give 500.01)
    const share = computeForm(FORM_1801V2018, {}, { sched2A: [row("sched2A", { Conj: "1,000.01" })] });
    expect(share[`${P}txtShareSpouse_C`]).toBe("500.00");
    expect(share[`${P}txtNetTaxEst_C`]).toBe("500.01");
    // 16 = 123,456.75 → × 0.06 = 7407.404999… → "7,407.40" (exact decimal half-up: 7,407.41)
    const tax = computeForm(FORM_1801V2018, {}, { sched2A: [row("sched2A", { Exc: "123,456.75" })] });
    expect(tax[`${P}txtTaxableEstate`]).toBe("123,456.75");
    expect(tax[`${P}txtEstTaxDue`]).toBe("7,407.40");
  });

  it("copies the item 5/7 TIN and name onto the Part IV header; upper-cases text; an untouched RDO saves \"000\"", () => {
    expect([v("tinA_2"), v("tinB_2"), v("tinC_2"), v("branchCode_2"), v("registeredName_2")]).toEqual(["846", "532", "107", "00000", "DELA CRUZ, JUAN"]);
    const record = new Map(formRecords(FORM_1801V2018, state, { ...groups, sched4: [row("sched4", { Name: "x", Exc: "1.00" })] }).map((r) => [r.key, r.value]));
    expect(record.get(`${P}sched4Rdo_1`)).toBe("000");
    expect(record.get(`${P}sched4Name_1`)).toBe("X");
    expect(record.get(`${P}sched1Class_3'`)).toBe("A"); // BIR's apostrophe-suffixed select id
    expect(record.get(`${P}sched1Loc_2`)).toBe("MAKATI");
  });

  it("validates BIR's item 37A/37B caps, item 9, item 15D and incomplete schedule rows", () => {
    expect(validate1801v2018(state, groups)).toEqual([]);
    const id = (s: FormState, g: GroupState = groups) => validate1801v2018(s, g).map((p) => p.id);
    expect(id({ ...state, [`${P}txtStandardDed_C`]: "5,000,000.01" })).toEqual([`${P}txtStandardDed_C`]);
    expect(id({ ...state, [`${P}categoryNonResident_1`]: "true", [`${P}categoryNonResident_2`]: "false", [`${P}txtStandardDed_C`]: "500,000.01" })).toEqual([`${P}txtStandardDed_C`]);
    expect(id({ ...state, [`${P}txtFamDed_C`]: "10,000,000.01" })).toEqual([`${P}txtFamDed_C`]);
    expect(id({ ...state, [`${P}freq_Mon`]: "false" })).toEqual([`${P}freq_Mon`]);
    expect(id(state, { ...groups, sched3: [row("sched3", { Exc: "5.00" })] })).toEqual([`${P}sched3Particulars_1`]);
    // a "0.00" cell is neither blank nor filled (validateForm skips it)
    expect(id(state, { ...groups, sched3: [row("sched3", { Particulars: "X", Exc: "5.00", Conj: "0.00" })] })).toEqual([]);
  });
});

/** Open the native save in BIR's form, reveal page 2 (Part IV + schedules), blur EVERY input as a user tabbing
 *  through both pages does, and return the keys whose value BIR ends with differs from the native save. parityCheck
 *  blurs only the visible page 1, so it never runs BIR's Part IV / schedule computes; this does. */
async function fullRecompute(oracle: Oracle, s: FormState, g: GroupState) {
  const native = formRecords(FORM_1801V2018, s, g);
  const { page, error } = await oracle.openSaved(FORM_1801V2018, s, "84653210700000-1801v2018-03152024.xml", g);
  const legacy: Array<[string, string]> = await page.evaluate(() => {
    (document.getElementById("Page2Content") as HTMLElement).style.display = "block";
    const all = Array.from((document.getElementById("frmMain") as HTMLFormElement).elements) as HTMLInputElement[];
    for (let pass = 0; pass < 2; pass++) for (const el of all) if (!el.disabled && el.type === "text" && el.offsetParent !== null) el.dispatchEvent(new FocusEvent("blur"));
    return all.filter((el) => el.id && ["text", "select-one", "radio", "checkbox"].includes(el.type)).map((el): [string, string] => [el.id, el.type === "radio" || el.type === "checkbox" ? String(el.checked) : el.value]);
  });
  await page.close();
  const bir = new Map(legacy);
  const diff = native.filter((r) => bir.get(r.key) !== r.value).map((r) => `${r.key}: native ${JSON.stringify(r.value)} vs BIR ${JSON.stringify(bir.get(r.key) ?? null)}`);
  const missing = [...bir.keys()].filter((k) => !native.some((r) => r.key === k));
  return { diff, missing, error };
}

describe.skipIf(!hasForm("1801v2018"))("native 1801v2018 is 1:1 with BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());

  it("BIR's reload rebuilds every schedule (3 rows past its 2-row minimum) and refills every cell", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1801V2018, state, "84653210700000-1801v2018-03152024.xml", groups);
    const count = await page.evaluate(() => {
      const w = window as unknown as Record<string, number>;
      return [w.count_RealProp, w.count_Fam, w.count_Stock, w.count_Other, w.count_Transfer, w.count_Business];
    });
    expect(count).toEqual([3, 2, 2, 3, 2, 3]);
    expect(await value(`${P}sched1Oct_3`)).toBe("OCT-003");
    expect(await value(`${P}sched1Class_3'`)).toBe("A");
    expect(await value(`${P}sched1Conj_3`)).toBe("250,000.33");
    expect(await value(`${P}sched1AConj_1`)).toBe("8,000,000.00");
    expect(await value(`${P}sched2Class_2`)).toBe("Not Listed");
    expect(await value(`${P}sched2AParticulars_3`)).toBe("JEWELRY");
    expect(await value(`${P}sched3Conj_2`)).toBe("60,000.00");
    expect(await value(`${P}sched4Rdo_3`)).toBe("059");
    expect(await value(`${P}sched4Conj_3`)).toBe("40,000.00");
    expect(await value(`${P}sched5Conj_Total`)).toBe("399,000.00");
    expect(error).toEqual([]);
  }, 120_000);

  it("BIR's own Part IV + schedule computes (page 2 revealed, every input blurred) land on the native save", async () => {
    const r = await fullRecompute(oracle, state, groups);
    expect(r).toEqual({ diff: [], missing: [], error: [] });
    // a positive estate: BIR's computeNo18 at 6%, with both float-rounded items
    const taxed = { ...state, [`${P}txtFamDed_C`]: "0.00", [`${P}txtStandardDed_C`]: "1,000,000.00" };
    expect(await fullRecompute(oracle, taxed, groups)).toEqual({ diff: [], missing: [], error: [] });
    const edge = { ...identity, [`${P}categoryNonResident_1`]: "true", [`${P}categoryNonResident_2`]: "false" };
    expect(await fullRecompute(oracle, edge, { sched2A: [row("sched2A", { Particulars: "A", Exc: "123,456.75", Conj: "1,000.01" })] })).toEqual({ diff: [], missing: [], error: [] });
  }, 120_000);

  it("parityCheck: every schedule populated in both columns, amended + installment, overpaid with penalties", async () => {
    const r = await parityCheck(oracle, FORM_1801V2018, state, "84653210700000-1801v2018-03152024.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.key_count).toBeGreaterThan(212); // the template's 212 plus the rebuilt rows 3
  }, 120_000);

  it("parityCheck: a taxed estate (positive net taxable estate), non-resident, no installment", async () => {
    const taxed: FormState = {
      ...state, [`${P}txtFamDed_C`]: "0.00", [`${P}txtStandardDed_C`]: "500,000.00",
      [`${P}categoryNonResident_1`]: "true", [`${P}categoryNonResident_2`]: "false",
      [`${P}instGranted_1`]: "false", [`${P}instGranted_2`]: "true", [`${P}freq_Mon`]: "false", [`${P}txtInstallment`]: "0.00",
    };
    const r = await parityCheck(oracle, FORM_1801V2018, taxed, "84653210700000-1801v2018-03152024.xml", groups);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
