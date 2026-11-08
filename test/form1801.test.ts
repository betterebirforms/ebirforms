import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { estateTax1801, FORM_1801, validate1801 } from "@/form/form1801.ts";
import { legacyUnescape } from "@/lib/savefile.ts";
import { hasForm, startOracle, type Oracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1801:";
const real = (td: string, loc: string, cls: string, exc: string, conj: string) => ({
  txtOCTSched1: `OCT-${td}`, txtSched1TaxDeclaration: td, txtSched1Location: loc, txtClass: cls, txtArea: "250",
  txtZV: "900,000.00", txtFMV: "1,000,000.00", txtFMVConjugal: conj, txtFMVExclusive: exc,
});
const realX = (td: string, loc: string, exc: string, conj: string) => ({
  txtOCTSched1X: `TCT-${td}`, txtSched1XTaxDeclaration: td, txtSched1XLocation: loc, txtClassX: "RES", txtAreaX: "120",
  txtZVX: "400,000.00", txtFMVX: "450,000.00", txtFMVConjugalX: conj, txtFMVExclusiveX: exc,
});

// every schedule populated, both columns
const groups: GroupState = {
  sched1: [
    real("TD-001", "QUEZON CITY", "RES", "1,000,000.00", "2,000,000.00"),
    real("TD-002", "makati", "COM", "0.00", "500,000.50"),
    real("TD-003", "BATANGAS", "AGR", "250,000.00", "0.00"),
  ],
  sched1X: [realX("TD-101", "PASIG", "100,000.00", "200,000.00"), realX("TD-102", "TAGUIG", "50,000.25", "0.00")],
  sched2: [
    { txtNameCorp: "ABC CORP.", txtStockCert: "SC-1", txtShares: "1000", txtFMVS: "300.00", txtFMVConjugal2: "0.00", txtFMVExclusive2: "300,000.00" },
    { txtNameCorp: "XYZ INC.", txtStockCert: "SC-2", txtShares: "2000", txtFMVS: "200.00", txtFMVConjugal2: "400,000.00", txtFMVExclusive2: "0.00" },
  ],
  sched3: [
    { txtParticulars: "CASH IN BANK", txtFMVExclusive3: "10,000.00", txtFMVConjugal3: "20,000.00" },
    { txtParticulars: "JEWELRY", txtFMVExclusive3: "5,000.00", txtFMVConjugal3: "0.00" },
    { txtParticulars: "vehicle", txtFMVExclusive3: "0.00", txtFMVConjugal3: "15,000.00" },
  ],
  sched4: [
    { txtParticulars4: "TRANSFER IN CONTEMPLATION OF DEATH", txtFMVExclusive4: "60,000.00", txtFMVConjugal4: "0.00" },
    { txtParticulars4: "REVOCABLE TRANSFER", txtFMVExclusive4: "0.00", txtFMVConjugal4: "90,000.00" },
  ],
};
// Schedule 5: the txtSc5Conjugal<n> ids sit under EXCLUSIVE (→ 22A), txtSc5Exclusive<n> under CONJUGAL (→ 22B)
const sched5: FormState = Object.fromEntries([
  ...["100,000.00", "20,000.00", "30,000.00", "0.00", "10,000.00", "0.00", "5,000.00", "1,000.00"].map((v, i) => [`${P}txtSc5Conjugal${i + 1}`, v]),
  ...["100,000.00", "0.00", "50,000.00", "25,000.00", "0.00", "40,000.00", "0.00", "2,000.00"].map((v, i) => [`${P}txtSc5Exclusive${i + 1}`, v]),
  [`${P}txtSc5Desc8`, "BANK CHARGES"],
]);
const identity: FormState = {
  [`${P}txtDateMonth`]: "12", [`${P}txtDateDay`]: "15", [`${P}txtDateYear`]: "2017",
  [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000", [`${P}txtRDOCode`]: "043",
  [`${P}txtTINE1`]: "123", [`${P}txtTINE2`]: "456", [`${P}txtTINE3`]: "789", [`${P}txtBranchCodeE`]: "00000",
  [`${P}txtTaxpayer`]: "DELA CRUZ, JUAN", [`${P}txtExecutor`]: "DELA CRUZ, MARIA", [`${P}txtResidence`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}txtAddress`]: "2 MABINI ST., MANILA", [`${P}txtZip`]: "1100", [`${P}txtTelephone`]: "0281234567", [`${P}txtRAddress`]: "2 MABINI ST., MANILA",
};
const state: FormState = {
  ...identity, ...sched5,
  [`${P}amendedRtn_1`]: "true", [`${P}amendedRtn_2`]: "false",
  [`${P}optTreaty:_1`]: "true", [`${P}optTreaty:_2`]: "false", [`${P}lstTaxTreaty`]: "2",
  [`${P}Notice:_1`]: "true", [`${P}Judicially:_2`]: "true", [`${P}Return:_1`]: "true", [`${P}PayTax:_2`]: "true",
  [`${P}txt24`]: "1,000,000.00", [`${P}txt25`]: "1,000,000.00", [`${P}txt26`]: "200,000.00",
  [`${P}txtOthers27a`]: "RA 4917 BENEFITS", [`${P}txt27A`]: "50,000.00", [`${P}txt29`]: "1,504,000.25",
  [`${P}txt32A`]: "1,000.00", [`${P}txt32B`]: "500.00",
  [`${P}txtSurcharge`]: "1,000.00", [`${P}txtInterest`]: "300.00", [`${P}txtCompromise`]: "200.00",
};

describe("1801 compute (pre-TRAIN graduated estate tax)", () => {
  const o = computeForm(FORM_1801, state, groups);
  const v = (id: string) => o[`${P}${id}`];

  it("schedules → items 17–20 by column (18 = Schedules 2 + 3), gross estate 21", () => {
    expect([v("totalSch1AmountExc"), v("totalSch1AmountConj")]).toEqual(["1,250,000.00", "2,500,000.50"]);
    expect([v("txt17A"), v("txt17B"), v("txt17C")]).toEqual(["1,250,000.00", "2,500,000.50", "3,750,000.50"]);
    expect([v("txt18A"), v("txt18B"), v("txt18C")]).toEqual(["315,000.00", "435,000.00", "750,000.00"]);
    expect([v("txt19A"), v("txt19B"), v("txt19C")]).toEqual(["150,000.25", "200,000.00", "350,000.25"]);
    expect([v("txt20A"), v("txt20B"), v("txt20C")]).toEqual(["60,000.00", "90,000.00", "150,000.00"]);
    expect([v("txt21A"), v("txt21B"), v("txt21C")]).toEqual(["1,775,000.25", "3,225,000.50", "5,000,000.75"]);
  });

  it("Schedule 5 → 22 (swapped ids, header-true columns); 23; net estate 28; 30; graduated 31; 33; 35", () => {
    expect([v("txtSc5TotalConjugal"), v("txtSc5TotalExclusive")]).toEqual(["166,000.00", "217,000.00"]);
    expect([v("txt22A"), v("txt22B"), v("txt22C")]).toEqual(["166,000.00", "217,000.00", "383,000.00"]);
    expect([v("txt23A"), v("txt23B"), v("txt23C")]).toEqual(["1,609,000.25", "3,008,000.50", "4,617,000.75"]);
    expect(v("txt28")).toBe("2,367,000.75");
    expect(v("txt30")).toBe("863,000.50");
    expect(v("txt31")).toBe("44,040.04"); // 15,000 + (863,000.50 − 500,000) × 8%
    expect(v("txt32C")).toBe("1,500.00");
    expect(v("txt33")).toBe("42,540.04");
    expect(v("txtTotalPenalties")).toBe("1,500.00");
    expect(v("txt35")).toBe("44,040.04");
  });

  it("the graduated table at every bracket edge (compute31)", () => {
    const tax = (peso: number) => estateTax1801(Math.round(peso * 100));
    expect(tax(199_999.99)).toBe(0);
    expect(tax(200_000)).toBe(0);
    expect(tax(500_000)).toBe(1_500_000); // 15,000
    expect(tax(500_000.01)).toBe(1_500_000); // + 0.0008 rounds away
    expect(tax(2_000_000)).toBe(13_500_000); // 135,000
    expect(tax(5_000_000)).toBe(46_500_000); // 465,000
    expect(tax(10_000_000)).toBe(121_500_000); // 1,215,000
    expect(tax(12_345_678.9)).toBe(168_413_578); // 1,215,000 + 2,345,678.90 × 20%
  });

  it("item 32B is zeroed unless amended; item 15 = No resets the treaty picker to \"0\"; row markers save \"false\"", () => {
    const no = computeForm(FORM_1801, { ...state, [`${P}amendedRtn_1`]: "false", [`${P}amendedRtn_2`]: "true", [`${P}optTreaty:_1`]: "false", [`${P}optTreaty:_2`]: "true" }, groups);
    expect(no[`${P}txt32B`]).toBe("0.00");
    expect(no[`${P}txt32C`]).toBe("1,000.00");
    expect(no[`${P}lstTaxTreaty`]).toBe("0");
    const record = new Map(formRecords(FORM_1801, state, groups).map((r) => [r.key, r.value]));
    expect(["chxSched10", "chxSched12", "chxSched1X1", "chxSched21", "chxSched32", "chxSched41"].map((k) => record.get(k))).toEqual(Array(6).fill("false"));
    expect(record.get("txtSched1Location1")).toBe("MAKATI"); // capital() on every compute35
    expect(legacyUnescape(record.get(`${P}txtTaxpayer`) ?? "")).toBe("DELA CRUZ, JUAN");
  });

  it("validates BIR's row rules, item 26 cap, item 27 pairs, treaty and executor TIN", () => {
    expect(validate1801(state, groups)).toEqual([]);
    const id = (s: FormState, g: GroupState = groups) => validate1801(s, g).map((p) => p.id);
    expect(id({ ...state, [`${P}txt26`]: "500,000.01" })).toEqual([`${P}txt26`]);
    expect(id({ ...state, [`${P}txt27B`]: "1.00" })).toEqual([`${P}txtOthers27b`]);
    expect(id({ ...state, [`${P}lstTaxTreaty`]: "0" })).toEqual([`${P}lstTaxTreaty`]);
    expect(id({ ...state, [`${P}txtTINE1`]: "846", [`${P}txtTINE2`]: "532", [`${P}txtTINE3`]: "107" })).toEqual([`${P}txtTINE1`]);
    expect(id(state, { ...groups, sched1: [{ ...groups.sched1![0]!, txtClass: "" }] })).toEqual(["txtSched1TaxDeclaration0"]);
    expect(id(state, { ...groups, sched3: [{ txtParticulars: "X", txtFMVExclusive3: "0.00", txtFMVConjugal3: "0.00" }] })).toEqual(["txtParticulars0"]);
  });
});

/** Open the native save in BIR's form, show every schedule modal, blur every input as a user would, press each
 *  modal's OK and the Validate button's compute sequence, and diff BIR's final values against the native save.
 *  parityCheck only blurs the main page, where items 17–23 are never recomputed; this runs BIR's own sums. */
async function fullRecompute(oracle: Oracle, s: FormState, g: GroupState) {
  const native = formRecords(FORM_1801, s, g).map((r) => ({ ...r, value: FORM_1801.field.find((f) => f.id === r.key)?.escaped ? legacyUnescape(r.value) : r.value }));
  const { page, error } = await oracle.openSaved(FORM_1801, s, "84653210700000-1801-12152017.xml", g);
  const legacy: Array<[string, string]> = await page.evaluate(() => {
    const w = window as unknown as Record<string, () => void>;
    for (const id of ["modalSched1", "modalSched1X", "modalSched2and3", "modalSched4", "modalSched5"]) (document.getElementById(id) as HTMLElement).style.display = "block";
    const all = Array.from((document.getElementById("frmMain") as HTMLFormElement).elements) as HTMLInputElement[];
    for (let pass = 0; pass < 2; pass++) for (const el of all) if (!el.disabled && el.type === "text" && el.offsetParent !== null) el.dispatchEvent(new FocusEvent("blur"));
    for (const f of ["getSched1Modal", "getSched1XModal", "getSched2Modal", "getSched3Modal", "addsched2and3", "getSched4Modal", "getSched5Modal", "computeGrossEstateTotalA", "computeGrossEstateTotalB"]) w[f]!();
    for (const f of ["compute17c", "compute18c", "compute19c", "compute20c", "compute21c", "compute22c", "compute23a", "compute23b", "compute23c", "compute28", "compute30", "compute31", "compute32C", "compute33", "compute35"]) w[f]!();
    return all.filter((el) => el.id && ["text", "select-one", "radio", "checkbox"].includes(el.type)).map((el): [string, string] => [el.id, el.type === "radio" || el.type === "checkbox" ? String(el.checked) : el.value]);
  });
  await page.close();
  const bir = new Map(legacy);
  const diff = native.filter((r) => bir.get(r.key) !== r.value).map((r) => `${r.key}: native ${JSON.stringify(r.value)} vs BIR ${JSON.stringify(bir.get(r.key) ?? null)}`);
  const missing = [...bir.keys()].filter((k) => !native.some((r) => r.key === k));
  return { diff, missing, error };
}

describe.skipIf(!hasForm("1801"))("native 1801 is 1:1 with BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());

  it("BIR's reload counts each schedule's chxSched markers and rebuilds and refills every row", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_1801, state, "84653210700000-1801-12152017.xml", groups);
    const count = await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown[]>;
      return ["sched1ToCommit", "sched1XToCommit", "sched2ToCommit", "sched3ToCommit", "sched4ToCommit"].map((k) => w[k]!.length);
    });
    expect(count).toEqual([3, 2, 2, 3, 2]);
    expect(await value("txtSched1TaxDeclaration2")).toBe("TD-003");
    expect(await value("txtFMVConjugal1")).toBe("500,000.50");
    expect(await value("txtFMVExclusiveX1")).toBe("50,000.25");
    expect(await value("txtNameCorp1")).toBe("XYZ INC.");
    expect(await value("txtFMVConjugal32")).toBe("15,000.00");
    expect(await value("txtParticulars41")).toBe("REVOCABLE TRANSFER");
    expect(await value(`${P}txt17B`)).toBe("2,500,000.50");
    expect(await value(`${P}lstTaxTreaty`)).toBe("2");
    expect(error).toEqual([]);
  }, 120_000);

  it("BIR's own schedule sums, modal OK handlers and compute17c…compute35 land on the native save", async () => {
    expect(await fullRecompute(oracle, state, groups)).toEqual({ diff: [], missing: [], error: [] });
    // top bracket, not amended (32B zeroed), no treaty
    const big: FormState = {
      ...state, [`${P}amendedRtn_1`]: "false", [`${P}amendedRtn_2`]: "true", [`${P}optTreaty:_1`]: "false", [`${P}optTreaty:_2`]: "true",
      [`${P}txt24`]: "0.00", [`${P}txt25`]: "0.00", [`${P}txt29`]: "0.00",
    };
    const bigGroup: GroupState = { ...groups, sched2: [{ ...groups.sched2![0]!, txtFMVExclusive2: "12,345,678.90" }, groups.sched2![1]!] };
    expect(await fullRecompute(oracle, big, bigGroup)).toEqual({ diff: [], missing: [], error: [] });
  }, 120_000);

  it("parityCheck: every schedule populated in both columns, amended, treaty, penalties", async () => {
    const r = await parityCheck(oracle, FORM_1801, state, "84653210700000-1801-12152017.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.key_count).toBe(111 + 3 * 10 + 2 * 10 + 2 * 7 + 3 * 4 + 2 * 4);
  }, 120_000);

  it("parityCheck: an estate under the ₱200k exemption, not amended, no treaty", async () => {
    const small: GroupState = { sched1: [], sched1X: [], sched2: [], sched3: [groups.sched3![0]!], sched4: [] };
    const s: FormState = { ...identity, [`${P}amendedRtn_2`]: "true", [`${P}txt32B`]: "9,999.00", [`${P}txtSurcharge`]: "100.00" };
    const r = await parityCheck(oracle, FORM_1801, s, "84653210700000-1801-12152017.xml", small);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
