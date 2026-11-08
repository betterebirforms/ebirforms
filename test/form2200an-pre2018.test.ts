import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupRow, type GroupState } from "@/form/schema.ts";
import { FORM_2200AN_PRE2018, LIST1, LIST2, list1Due, list2Due, otherDue, outOfBracket, validate2200AnPre2018 } from "@/form/form2200an-pre2018.ts";
import { atcPickList } from "@/form/atc.ts";
import { parseMoney } from "@/form/money.ts";
import { legacyUnescape } from "@/lib/savefile.ts";
import { hasForm, startOracle, type Oracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2200AN:";
const x1 = (col: string, i: number) => `${P}listSched1x1${col}${i}`;
const x2 = (col: string, i: number) => (col === "C" ? `${P}${i}` : `${P}listSched1x2${col}${i}`);
const row = (cell: Record<string, string>): GroupRow => Object.fromEntries(Object.entries(cell).map(([k, v]) => [`${P}sched1${k}`, v]));

const identity: FormState = {
  [`${P}txtMonth1`]: "03", [`${P}txtDate`]: "15", [`${P}txtForYr`]: "2017",
  [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043", [`${P}txtLineBus`]: "CAR DEALER", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN",
  [`${P}txtTelNum`]: "0281234567", [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY", [`${P}txtZipCode`]: "1100",
  frm2200ANoptRegion: "130000000", frm2200ANoptProvince: "133900000", frm2200ANoptCity: "133902000", [`${P}txtPlaceofProd`]: "binondo plant",
  frm2200ANoptRegion1: "130000000", frm2200ANoptProvince1: "133900000", frm2200ANoptCity1: "133901000", [`${P}txtPlaceofRem`]: "TONDO DEPOT",
};
// list 1: three bracketed codes, a min = 0 bracket (BIR's dangling-else → 0), an out-of-bracket row (E reset), a
// hybrid (XG065), a float per-unit rounding; list 2: two goods; Others: three rows (the reload rebuilds rows 1–2)
const sched1: FormState = {
  [x1("C", 1)]: "2.00", [x1("E", 1)]: "1,600,000.00", [x1("B", 1)]: "1.00", [x1("D", 1)]: "750,000.00",
  [x1("C", 2)]: "3.00", [x1("E", 2)]: "4,500,000.00",
  [x1("C", 3)]: "1.00", [x1("E", 3)]: "3,000,000.00",
  [x1("C", 0)]: "5.00", [x1("E", 0)]: "2,000,000.00",
  [x1("C", 5)]: "1.00", [x1("E", 5)]: "500,000.00",
  [x1("C", 22)]: "2.00", [x1("E", 22)]: "1,600,000.00",
  [x1("C", 9)]: "3.00", [x1("E", 9)]: "2,000,000.01",
  [x2("B", 0)]: "4.00", [x2("C", 0)]: "10.00", [x2("D", 0)]: "500.00", [x2("E", 0)]: "12,345.67",
  [x2("C", 2)]: "1.00", [x2("E", 2)]: "1,000,000.05",
};
const groups: GroupState = {
  other: [
    row({ Atc: "XG130", Other: "watches", TaxRate: "15.00", ExemptA: "1.00", TaxableA: "4.00", ExemptB: "200.00", TaxableB: "10,000.00" }),
    row({ Atc: "XG131", Other: "BAGS", TaxRate: "12.50", TaxableA: "9.00", TaxableB: "3,333.33" }),
    row({ Atc: "XG132", Other: "ART", TaxRate: "7.00", TaxableB: "100.00" }),
  ],
};
const state: FormState = {
  ...identity, ...sched1,
  [`${P}amendedRtn_1`]: "true", [`${P}amendedRtn_2`]: "false", [`${P}txtSheets`]: "1",
  [`${P}optTreaty_1`]: "true", [`${P}optTreaty_2`]: "false", [`${P}lstTaxTreaty`]: "1",
  [`${P}chkPymntManner_1`]: "true",
  [`${P}txtTax17A`]: "10,000.00", [`${P}txtTax19`]: "2,392.80",
  [`${P}txtTax21A`]: "100.00", [`${P}txtTax21B`]: "50.00", [`${P}txtTax21C`]: "25.00", [`${P}PayPenalties`]: "true",
  [`${P}txtTax23A`]: "2,400,000.00",
};

describe("2200AN (pre-2018) Schedule 1 rate engine", () => {
  it("lists match BIR's loadATC (atcCodes.xml entries containing '2200AN', by category)", () => {
    expect(LIST1.map(([atc, , rate]) => [atc, rate])).toEqual(atcPickList("2200AN", "1").map((e) => [e.atc_code, e.rate]));
    expect(LIST2.map(([atc, , rate]) => [atc, rate])).toEqual(atcPickList("2200AN", "2").map((e) => [e.atc_code, e.rate]));
  });
  it("bracketed rows: (rate × (E/C − min) + constant).toFixed(2) per unit × C", () => {
    expect(list1Due(1, "2.00", "1,600,000.00")).toBe(10_400_000);
    expect(list1Due(2, "3.00", "4,500,000.00")).toBe(81_600_000);
    expect(list1Due(3, "1.00", "3,000,000.00")).toBe(105_200_000); // top bracket: max 0 = no ceiling
    expect(list1Due(9, "3.00", "2,000,000.01")).toBe(7_599_999); // per unit 25,333.334 → 25,333.33, × 3
  });
  it("BIR's dangling else: a min = 0 bracket (and XG055 / XG068) always computes 0.00; XG065 taxes the value", () => {
    expect(list1Due(0, "5.00", "2,000,000.00")).toBe(0);
    expect(list1Due(16, "1.00", "900,000.00")).toBe(0); // XG055
    expect(list1Due(25, "1.00", "900,000.00")).toBe(0); // XG068
    expect(list1Due(22, "2.00", "1,600,000.00")).toBe(16_000_000); // XG065 10%
  });
  it("E/C outside the price bracket resets E and taxes nothing; zero units or value tax nothing", () => {
    expect(outOfBracket(5, "1.00", "500,000.00")).toBe(true); // 500k ≤ min 600k
    expect(outOfBracket(1, "1.00", "1,100,000.01")).toBe(true); // > max 1.1M
    expect(outOfBracket(1, "1.00", "1,100,000.00")).toBe(false); // the bracket is (min, max]
    expect(list1Due(5, "1.00", "500,000.00")).toBe(0);
    expect(list1Due(1, "0", "1,600,000.00")).toBe(0);
    expect(list1Due(1, "2.00", "0.00")).toBe(0);
  });
  it("list 2 and Others: (rate% × value).toFixed(2)", () => {
    expect(list2Due(0, "12,345.67")).toBe(246_913);
    expect(list2Due(1, "0.00")).toBe(0);
    expect(otherDue("12.50", "3,333.33")).toBe(41_667); // 416.66625 → 416.67
  });
});

describe("2200AN (pre-2018) Schedule 1 → 16 → Part III", () => {
  const o = computeForm(FORM_2200AN_PRE2018, state, groups);
  const v = (id: string) => o[`${P}${id}`];
  it("every row's Due, the out-of-bracket E reset and the schedule total", () => {
    expect([1, 2, 3, 0, 5, 22, 9].map((i) => o[x1("Due", i)])).toEqual(["104,000.00", "816,000.00", "1,052,000.00", "0.00", "0.00", "160,000.00", "75,999.99"]);
    expect(o[x1("E", 5)]).toBe("0.00");
    expect([0, 1, 2].map((i) => o[x2("Due", i)])).toEqual(["2,469.13", "0.00", "200,000.01"]);
    expect(v("totalTaxDue")).toBe("2,412,392.80");
    expect(v("txtTax16")).toBe("2,412,392.80");
  });
  it("the payable chain 17C → 24", () => {
    expect(v("txtTax17B")).toBe("0.00");
    expect(v("txtTax17C")).toBe("10,000.00");
    expect(v("txtTax18")).toBe("2,402,392.80");
    expect(v("txtTax20")).toBe("2,400,000.00");
    expect(v("txtTax21D")).toBe("175.00");
    expect(v("txtTax22")).toBe("2,400,175.00");
    expect(v("txtTax23B")).toBe("175.00");
    expect(v("txtTax23C")).toBe("2,400,175.00");
    expect(v("txtTax24")).toBe("0.00");
    const plain = computeForm(FORM_2200AN_PRE2018, { ...state, [`${P}amendedRtn_1`]: "false", [`${P}amendedRtn_2`]: "true", [`${P}PayPenalties`]: "false", [`${P}optTreaty_1`]: "false", [`${P}optTreaty_2`]: "true" }, groups);
    expect(plain[`${P}txtTax19`]).toBe("0.00");
    expect(plain[`${P}txtTax23B`]).toBe("0.00");
    expect(plain[`${P}lstTaxTreaty`]).toBe("0");
  });
  it("Others rows save with their delete-marker checkboxes (the reload counts them), upper-cased", () => {
    const record = new Map(formRecords(FORM_2200AN_PRE2018, state, groups).map((r) => [r.key, r.value]));
    expect([0, 1, 2].map((i) => record.get(`${P}sched1Chk${i}`))).toEqual(["false", "false", "false"]);
    expect(record.get(`${P}sched1Other0`)).toBe("WATCHES");
    expect([0, 1, 2].map((i) => record.get(`${P}sched1ExciseTaxDue${i}`))).toEqual(["1,500.00", "416.67", "7.00"]);
    expect(record.get(`${P}txtPlaceofProd`)).toBe("BINONDO PLANT");
  });
  it("validates the Others ATC prefix, incomplete added rows and a positive item 24", () => {
    const o2 = (s: FormState, g: GroupState = groups) => validate2200AnPre2018(computeForm(FORM_2200AN_PRE2018, s, g), g).map((p) => p.id);
    expect(o2(state)).toEqual([]);
    expect(o2(state, { other: [...groups.other!, row({ Atc: "AB123", TaxRate: "1.00", TaxableB: "0.00" })] })).toEqual([`${P}sched1Atc3`]);
    expect(o2(state, { other: [...groups.other!, row({ Atc: "XG140" })] })).toEqual([`${P}sched1TaxRate3`]);
    expect(o2({ ...state, [`${P}txtTax23A`]: "0.00" })).toEqual([`${P}txtTax23A`]);
  });
});

/** Equal, or the same amount: blurring an untouched unit cell makes BIR's round() turn its "0" default into "0.00". */
const NUMBER = /^-?[\d,]*(\.\d+)?$/;
const sameAmount = (a: string, b: string | undefined) => a === b || (b !== undefined && a !== "" && NUMBER.test(a) && NUMBER.test(b) && parseMoney(a) === parseMoney(b));

/** Open the native save in BIR's form, reveal the Schedule 1 modal, wipe every computed schedule cell, blur EVERY
 *  input (BIR's computeSched1BasicExcisetax / …2 / computeExciseDueSched1 rebuild the dues and the total), press
 *  BIR's own OK (sched1OK: item 16 and the Part III chain), and diff against the native save. */
async function fullRecompute(oracle: Oracle, s: FormState, g: GroupState) {
  const native = formRecords(FORM_2200AN_PRE2018, s, g);
  const escaped = new Set(FORM_2200AN_PRE2018.field.filter((f) => f.escaped).map((f) => f.id));
  const { page, error } = await oracle.openSaved(FORM_2200AN_PRE2018, s, "84653210700000-2200AN-03152017.xml", g);
  const legacy: Array<[string, string]> = await page.evaluate(() => {
    (document.getElementById("modalSched1") as HTMLElement).style.display = "block";
    const all = Array.from((document.getElementById("frmMain") as HTMLFormElement).elements) as HTMLInputElement[];
    for (const el of all) if (/Due\d+$|totalTaxDue$|txtTax16$/.test(el.id)) el.value = "9.99";
    for (let pass = 0; pass < 2; pass++) for (const el of all) if (!el.disabled && el.type === "text" && el.offsetParent !== null) el.dispatchEvent(new FocusEvent("blur"));
    (window as unknown as { sched1OK: () => void }).sched1OK();
    return all.filter((el) => el.id && ["text", "select-one", "radio", "checkbox"].includes(el.type)).map((el): [string, string] => [el.id, el.type === "radio" || el.type === "checkbox" ? String(el.checked) : el.value]);
  });
  await page.close();
  const bir = new Map(legacy);
  const diff = native
    .map((r) => ({ key: r.key, value: escaped.has(r.key) ? legacyUnescape(r.value) : r.value }))
    .filter((r) => !sameAmount(r.value, bir.get(r.key)))
    .map((r) => `${r.key}: native ${JSON.stringify(r.value)} vs BIR ${JSON.stringify(bir.get(r.key) ?? null)}`);
  const missing = [...bir.keys()].filter((k) => !native.some((r) => r.key === k));
  return { diff, missing, error };
}

describe.skipIf(!hasForm("2200AN"))("native 2200AN (pre-2018) is 1:1 with BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("BIR's reload rebuilds the 3 Others rows and refills every list cell", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_2200AN_PRE2018, state, "84653210700000-2200AN-03152017.xml", groups);
    expect(await page.evaluate(() => (document.getElementById("frm2200ANadditionalSched1") as HTMLTableElement).rows.length)).toBe(3);
    const record = formRecords(FORM_2200AN_PRE2018, state, groups).filter((r) => /listSched1|sched1(?!Chk)|^frm2200AN:\d$|totalTaxDue|txtTax\d/.test(r.key));
    expect(record.length).toBe(26 * 5 + 3 * 5 + 3 * 8 + 1 + 16); // lists, Others rows, total, items 16–24
    for (const r of record) expect(await value(r.key), r.key).toBe(r.value);
    expect(await value("frm2200ANoptCity")).toBe("133902000");
    expect(await value("frm2200ANoptCity1")).toBe("133901000");
    expect(error).toEqual([]);
  }, 120_000);
  it("BIR's own schedule computes and OK (modal revealed, every input blurred) land on the native save", async () => {
    expect(await fullRecompute(oracle, state, groups)).toEqual({ diff: [], missing: [], error: [] });
  }, 120_000);
  it("parityCheck: populated lists 1 and 2, three Others rows, amended, relief, penalties paid", async () => {
    const r = await parityCheck(oracle, FORM_2200AN_PRE2018, state, "84653210700000-2200AN-03152017.xml", groups);
    expect(parityProblem(r)).toEqual([]);
    expect(r.key_count).toBe(209 + 2 * 9); // the template plus the two rebuilt Others rows
  }, 120_000);
});
