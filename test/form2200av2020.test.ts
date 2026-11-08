import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, formRecords, type FormState } from "@/form/schema.ts";
import { blockNegative, FORM_2200AV2020, rowDue, SCHED1_ROW, validate2200Av2020 } from "@/form/form2200av2020.ts";
import { legacyUnescape } from "@/lib/savefile.ts";
import { hasForm, startOracle, type Oracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm2200Av2020:";
const s1 = (stem: string, col: string) => `${P}txtSched1_${stem}_${col}`;
const other = (i: number, col: string) => `${P}txtSched1_xa_others${i}_${col}`;

const identity: FormState = {
  [`${P}txtDateMonth`]: "03", [`${P}txtDateDay`]: "15", [`${P}txtDateYear`]: "2024",
  [`${P}tinA`]: "846", [`${P}tinB`]: "532", [`${P}tinC`]: "107", [`${P}branchCode`]: "00000",
  [`${P}rdoCode`]: "043", [`${P}registeredName`]: "DELA CRUZ, JUAN", [`${P}registeredAddress`]: "1 RIZAL ST., QUEZON CITY",
  [`${P}zipCode`]: "1100", [`${P}phoneNumber`]: "0281234567",
  [`${P}prodRegion`]: "130000000", [`${P}prodProvince`]: "133900000", [`${P}prodCity`]: "133902000",
  [`${P}remRegion`]: "130000000", [`${P}remProvince`]: "133900000", [`${P}remCity`]: "133901000",
};
// Schedule 1: six ATCs (incl. the taxRate.xml 0.21 override, the 0.0 "taxed as distilled spirits" row, float
// half-centavo products and a blocked negative), all three Others rows, then the whole Part III chain
const sched1: FormState = {
  [s1("1A_2020B", "Export")]: "10.00", [s1("1A_2020B", "Taxable")]: "1,000,003.50",
  [s1("1A_2021", "Taxable")]: "2.25",
  [s1("1B_2022", "Export")]: "1,200.00", [s1("1B_2022", "Taxable")]: "2,750.25",
  [s1("2A_2020A", "Taxable")]: "0.50",
  [s1("2C_2021", "Export")]: "-5.00", [s1("2C_2021", "Taxable")]: "100.00",
  [s1("2D_2020", "Export")]: "50.00", [s1("2D_2020", "Taxable")]: "800.00",
  [s1("3B_2024", "Taxable")]: "12,345.67",
  [other(1, "Atc")]: "123", [other(1, "Desc")]: "fruit wine", [other(1, "Bracket")]: "per liter", [other(1, "Rate")]: "10.00",
  [other(1, "Taxable")]: "1,000.00", [other(1, "Due")]: "10,000.00",
  [other(2, "Atc")]: "456", [other(2, "Desc")]: "CIDER", [other(2, "Bracket")]: "PER PROOF LITER", [other(2, "Rate")]: "5%",
  [other(2, "Export")]: "300.00", [other(2, "Taxable")]: "2,000.00", [other(2, "Due")]: "100.00",
  [other(3, "Atc")]: "789", [other(3, "Desc")]: "SAKE", [other(3, "Bracket")]: "NRP", [other(3, "Rate")]: "0.25",
  [other(3, "Taxable")]: "400.00", [other(3, "Due")]: "100.05",
};
const state: FormState = {
  ...identity, ...sched1,
  [`${P}amendedRtn_1`]: "true", [`${P}amendedRtn_2`]: "false", [`${P}txtSheets`]: "2",
  [`${P}optTreaty_1`]: "true", [`${P}optTreaty_2`]: "false", [`${P}treatyY`]: "RA 9178",
  [`${P}optPayment_3`]: "true", [`${P}paymentOther`]: "bonded warehouse",
  [`${P}txtLess_Balance`]: "1,000.00", [`${P}txtLess_Excise`]: "500.00", [`${P}txtPrevReturn`]: "2,000.00",
  [`${P}txtPen_Surcharge`]: "100.00", [`${P}txtPen_Interest`]: "50.25", [`${P}txtPen_Compromise`]: "25.00",
  [`${P}txtPay_TaxPayment`]: "896,338.65",
};

describe("2200Av2020 per-commodity rate engine (computeField)", () => {
  it("Due = (ATR × Taxable).toFixed(2) on the binary float, rates from taxRate.xml", () => {
    expect(SCHED1_ROW).toHaveLength(60);
    expect(rowDue("0.21", "1,000,003.50")).toBe(21_000_073); // 210,000.735 → float …0.73
    expect(rowDue("0.22", "2.25")).toBe(49); // 0.495 is 0.49499… as a float: BIR saves 0.49, not half-up 0.50
    expect(rowDue("921.15", "0.50")).toBe(46_057); // 460.575 → 460.57
    expect(rowDue("0.0", "800.00")).toBe(0); // XA090 2020: "taxed as distilled spirits"
    expect(rowDue("52.00", "")).toBe(0);
    const rate = Object.fromEntries(SCHED1_ROW.map(([stem, , , r]) => [stem, r]));
    expect(rate["1A_2020B"]).toBe("0.21"); // HTML says 22%; taxRate.xml (loaded on every open) sets 0.21
    expect([rate["1A_2022"], rate["1A_2023"], rate["1A_2024"]]).toEqual(["0.22", "0.22", "0.22"]); // XML targets the 2021 id 4×
  });
  it("blockNegativeNumber zeroes '-5.00' but not the comma'd '-1,234.00' (a NaN comparison)", () => {
    expect(blockNegative("-5.00")).toBe("0.00");
    expect(blockNegative("-1,234.00")).toBe("-1,234.00");
    expect(rowDue("53.00", "-5.00")).toBe(0);
    expect(rowDue("53.00", "-1,000.00")).toBe(-5_300_000);
  });
});

describe("2200Av2020 Schedule 1 → item 16 → Part III (calculate_Sched1_TotalDue, calculate_Part3)", () => {
  const o = computeAll(FORM_2200AV2020, state);
  const v = (id: string) => o[`${P}${id}`];
  it("each row's Due, the schedule total (fixed + Others rows) and item 16", () => {
    expect(o[s1("1A_2020B", "Due")]).toBe("210,000.73");
    expect(o[s1("1A_2021", "Due")]).toBe("0.49");
    expect(o[s1("1B_2022", "Due")]).toBe("143,013.00");
    expect(o[s1("2A_2020A", "Due")]).toBe("460.57");
    expect(o[s1("2C_2021", "Export")]).toBe("0.00"); // blocked negative
    expect(o[s1("2C_2021", "Due")]).toBe("5,300.00");
    expect(o[s1("2D_2020", "Due")]).toBe("0.00");
    expect(o[s1("3B_2024", "Due")]).toBe("530,863.81");
    expect(o[s1("1A_2020", "Due")]).toBe("0.00");
    expect(v("txtSched1_TotalDue")).toBe("899,838.65"); // 889,638.60 fixed + 10,200.05 Others
    expect(v("txtExciseDue")).toBe("899,838.65");
  });
  it("the payable chain 17C → 24", () => {
    expect(v("txtLess_Tot")).toBe("1,500.00");
    expect(v("txtNetTaxDue")).toBe("898,338.65");
    expect(v("txtStillDue")).toBe("896,338.65");
    expect(v("txtPen_Tot")).toBe("175.25");
    expect(v("txtAmtPayable")).toBe("896,513.90");
    expect(v("txtPay_Penalties")).toBe("175.25");
    expect(v("txtPay_Tot")).toBe("896,513.90");
    expect(v("txtBalance")).toBe("0.00");
  });
  it("gates: item 19 on an original return, 12A without relief, the scheme text without option 15", () => {
    const orig = computeAll(FORM_2200AV2020, {
      ...state, [`${P}amendedRtn_1`]: "false", [`${P}amendedRtn_2`]: "true", [`${P}optTreaty_1`]: "false", [`${P}optTreaty_2`]: "true",
      [`${P}optPayment_3`]: "false", [`${P}optPayment_2`]: "true",
    });
    expect(orig[`${P}txtPrevReturn`]).toBe("0.00");
    expect(orig[`${P}txtStillDue`]).toBe("898,338.65");
    expect(orig[`${P}treatyY`]).toBe("");
    expect(orig[`${P}paymentOther`]).toBe("");
  });
  it("validates BIR's validateForm rules and the Others-row checks", () => {
    expect(validate2200Av2020(computeAll(FORM_2200AV2020, state))).toEqual([]);
    const id = (s: FormState) => validate2200Av2020(computeAll(FORM_2200AV2020, s)).map((p) => p.id);
    expect(id({ ...state, [`${P}txtPay_TaxPayment`]: "0.00" })).toEqual([`${P}txtPay_TaxPayment`]); // insufficient fund
    expect(id({ ...state, [`${P}txtDateYear`]: "2019" })).toEqual([`${P}txtDateYear`]);
    expect(id({ ...state, [other(2, "Atc")]: "45" })).toEqual([other(2, "Atc")]);
    expect(id({ ...state, [other(3, "Rate")]: "" })).toEqual([other(3, "Rate")]);
    expect(id({ ...state, [`${P}optPayment_3`]: "false" })).toEqual([`${P}optPayment_1`]);
  });
  it("saves the three Others rows in place, as typed (this form's capital() calls upper-case nothing — measured)", () => {
    const record = new Map(formRecords(FORM_2200AV2020, state).map((r) => [r.key, r.value]));
    expect(record.get(other(1, "Desc"))).toBe("fruit wine");
    expect(record.get(other(1, "Bracket"))).toBe("per liter");
    expect(record.get(other(3, "Due"))).toBe("100.05");
    expect(record.get(`${P}paymentOther`)).toBe("bonded warehouse");
  });
});

/** Open the native save in BIR's form, reveal pages 2 and 3 (Schedule 1), blur EVERY input as a user tabbing through
 *  all pages does (BIR's computeField recomputes every row's Due from ITS rate cells), fire the Others rows' onchange
 *  (computeOthers), and return the keys whose value BIR ends with differs from the native save. parityCheck blurs
 *  only the visible page 1, so it never runs BIR's per-row rate engine; this does. */
async function fullRecompute(oracle: Oracle, s: FormState) {
  const native = formRecords(FORM_2200AV2020, s);
  const escaped = new Set(FORM_2200AV2020.field.filter((f) => f.escaped).map((f) => f.id));
  const { page, error } = await oracle.openSaved(FORM_2200AV2020, s, "84653210700000-2200Av2020-03152024.xml");
  const legacy: Array<[string, string]> = await page.evaluate(() => {
    for (const p of ["Page2Content", "Page3Content"]) (document.getElementById(p) as HTMLElement).style.display = "block";
    const all = Array.from((document.getElementById("frmMain") as HTMLFormElement).elements) as HTMLInputElement[];
    // wipe every computed Schedule 1 cell first, so what survives is BIR's own arithmetic, not the reloaded save
    for (const el of all) if (/txtSched1_(?!xa_others).*_Due$|txtSched1_TotalDue$|txtExciseDue$/.test(el.id)) el.value = "9.99";
    for (let pass = 0; pass < 2; pass++)
      for (const el of all) {
        if (el.disabled || el.type !== "text" || el.offsetParent === null) continue;
        el.dispatchEvent(new FocusEvent("blur"));
        if (el.id.includes("_xa_others")) el.dispatchEvent(new Event("change"));
      }
    return all.filter((el) => el.id && ["text", "select-one", "radio", "checkbox"].includes(el.type)).map((el): [string, string] => [el.id, el.type === "radio" || el.type === "checkbox" ? String(el.checked) : el.value]);
  });
  await page.close();
  const bir = new Map(legacy);
  const diff = native
    .map((r) => ({ key: r.key, value: escaped.has(r.key) ? legacyUnescape(r.value) : r.value }))
    .filter((r) => bir.get(r.key) !== r.value)
    .map((r) => `${r.key}: native ${JSON.stringify(r.value)} vs BIR ${JSON.stringify(bir.get(r.key) ?? null)}`);
  const missing = [...bir.keys()].filter((k) => !native.some((r) => r.key === k));
  return { diff, missing, error };
}

describe.skipIf(!hasForm("2200Av2020"))("native 2200Av2020 is 1:1 with BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());
  it("every Schedule 1 cell, all three Others rows and Part III reopen as saved", async () => {
    const { page, value, error } = await oracle.openSaved(FORM_2200AV2020, state, "84653210700000-2200Av2020-03152024.xml");
    const record = formRecords(FORM_2200AV2020, state).filter((r) => r.key.includes("txtSched1_") && !r.key.endsWith("_Check"));
    expect(record.length).toBe(60 * 3 + 3 * 7 + 1);
    for (const r of record) expect(await value(r.key), r.key).toBe(r.value);
    expect(await value(`${P}txtExciseDue`)).toBe("899,838.65");
    expect(await value(`${P}txtBalance`)).toBe("0.00");
    expect(await value(`${P}prodCity`)).toBe("133902000");
    expect(await value(`${P}remCity`)).toBe("133901000");
    expect(await page.evaluate(() => (document.getElementById("frm2200Av2020:txtSched1_1A_2020B_ATR") as HTMLElement).getAttribute("value"))).toBe("0.21");
    expect(error).toEqual([]);
  }, 120_000);
  it("BIR's own rate engine (every page revealed, every input blurred) lands on the native save", async () => {
    expect(await fullRecompute(oracle, state)).toEqual({ diff: [], missing: [], error: [] });
    // every one of the 60 rows at once, each with a different taxable amount (and a comma'd negative BIR keeps)
    const every: FormState = { ...identity, [`${P}optPayment_1`]: "true" };
    SCHED1_ROW.forEach(([stem], i) => {
      every[s1(stem, "Export")] = `${i}.00`;
      every[s1(stem, "Taxable")] = `${(1000 + i * 137).toLocaleString("en-US")}.${String((i * 7) % 100).padStart(2, "0")}`;
    });
    every[s1("3B_2023", "Taxable")] = "-1,000.00";
    expect(await fullRecompute(oracle, every)).toEqual({ diff: [], missing: [], error: [] });
  }, 120_000);
  it("parityCheck: populated Schedule 1 and Others rows, amended, relief, other scheme", async () => {
    const r = await parityCheck(oracle, FORM_2200AV2020, state, "84653210700000-2200Av2020-03152024.xml");
    expect(parityProblem(r)).toEqual([]);
    expect(r.key_count).toBe(274);
  }, 120_000);
});
