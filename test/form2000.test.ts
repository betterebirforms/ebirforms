import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, formRecords, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_2000, pickIndex2000, SECTION_C, validate2000 } from "@/form/form2000.ts";
import { amount12D2000, DST_ATC, natureCell2000, rateCell2000, sched1Due2000 } from "@/form/dst.ts";
import { formatMoney, parseMoney } from "@/form/money.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm2000:";
const entry = (code: string, k = 0) => DST_ATC.filter((a) => a.atc_code === code)[k]!;
const a12 = (code: string, base: string, k = 0) => {
  const a = entry(code, k);
  const r = amount12D2000(code, natureCell2000(a), rateCell2000(a), parseMoney(base));
  return r.tax_due === null ? null : formatMoney(r.tax_due);
};
const row = (code: string, base: string, k = 0) => {
  const r = sched1Due2000(code, rateCell2000(entry(code, k)), parseMoney(base));
  return { due: r.tax_due === null ? null : formatMoney(r.tax_due), ...(r.item_12d !== undefined && { item_12d: formatMoney(r.item_12d) }) };
};

describe("2000 rate engine — Section A item 12D (computeAmount12D)", () => {
  it("per-P200 / per-P4 / percentage codes", () => {
    expect(a12("DS101", "100,000.00")).toBe("1,000.00");
    expect(a12("DS102", "12,345.67")).toBe("92.59");
    expect(a12("DS103", "1,000.00")).toBe("750.00");
    expect(a12("DS110", "1,001.00")).toBe("125.13");
    expect(a12("DS112", "20,000.00", 0)).toBe("100.00"); // capital of annuities (by 12A)
    expect(a12("DS112", "20,000.00", 1)).toBe("40.00"); // pre-need plans
    expect(a12("DS124", "1,000.00")).toBe("150.00");
    expect(a12("DS125", "1,000.00")).toBe("500.00");
  });
  it("brackets and constants (min/max): DS109 also rewrites 12C, DS117 at exactly P100 changes nothing", () => {
    expect(amount12D2000("DS109", "", "", 65_000_000)).toEqual({ tax_due: 10_000, rate_text: "Exceed P500,000 but does not exceed P750,000 - P100" });
    expect(a12("DS117", "99.99")).toBe("0.00");
    expect(a12("DS117", "100.00")).toBeNull();
    expect(a12("DS117", "100.01")).toBe("2.00");
    expect(a12("DS120", "2,500.00")).toBe("7.00");
    expect(a12("DS121", "7,500.00")).toBe("50.00");
  });
  it("charters read the base as months: exactly 6 → constant, more → + step, fewer → 0.00 (BIR bug)", () => {
    expect(a12("DS130", "6.00")).toBe("1,000.00");
    expect(a12("DS131", "9.00")).toBe("2,600.00");
    expect(a12("DS132", "3.00")).toBe("0.00");
  });
  it("DS115 / DS126 have no case (12D is typed); an empty 12C makes a positive base 0.00", () => {
    expect(a12("DS115", "500.00")).toBeNull();
    expect(a12("DS126", "500.00")).toBeNull();
    expect(amount12D2000("", "", "", 50_000).tax_due).toBe(0);
    expect(amount12D2000("", "", "", 0).tax_due).toBeNull();
  });
});

describe("2000 rate engine — Section B Schedule 1 rows (computeSched1TaxDue)", () => {
  it("parseFloat of the rate cell: \" 75% \" → base × 75 (DS103), × 15 (DS124), × 50 (DS125); per-P200 codes are typed", () => {
    expect(row("DS103", "10.00")).toEqual({ due: "750.00" });
    expect(row("DS124", "10.00")).toEqual({ due: "150.00" });
    expect(row("DS125", "10.00")).toEqual({ due: "500.00" });
    expect(row("DS101", "10,000.00")).toEqual({ due: null });
  });
  it("flat constants and brackets; nothing for a zero base", () => {
    expect(row("DS105", "7.00")).toEqual({ due: "3.00" }); // flat, unlike Section A's × 3
    expect(row("DS114", "7.00")).toEqual({ due: "30.00" });
    expect(row("DS115", "200.01")).toEqual({ due: "30.00" });
    expect(row("DS117", "2,500.00")).toEqual({ due: "16.00" }); // 1 + 1.5 × 10
    expect(row("DS117", "1,000.00")).toEqual({ due: "1.00" });
    expect(row("DS120", "2,000.00")).toEqual({ due: "0.00" });
    expect(row("DS120", "2,000.01")).toEqual({ due: null });
    expect(row("DS121", "5,000.00")).toEqual({ due: "40.00" });
    expect(row("DS121", "7,500.00")).toEqual({ due: "50.00" }); // the second switch's P20 / P5,000 wins
    expect(row("DS121", "4,000.00")).toEqual({ due: "0.00" });
    expect(row("DS105", "0.00")).toEqual({ due: null });
  });
  it("DS130–DS132 rows write Section A's 12D instead of their own tax due (BIR bug)", () => {
    expect(row("DS130", "8.00")).toEqual({ due: null, item_12d: "1,200.00" });
    expect(row("DS132", "6.00")).toEqual({ due: null, item_12d: "3,000.00" });
  });
});

const identity: FormState = {
  [`${P}txtMonth1`]: "06",
  [`${P}txtDate`]: "30",
  [`${P}txtForYr`]: "2017",
  [`${P}txtTIN1`]: "846",
  [`${P}txtTIN2`]: "532",
  [`${P}txtTIN3`]: "107",
  [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043",
  [`${P}txtTaxpayerName`]: "Dela Cruz, Juan",
  [`${P}txtLineBus`]: "Lending",
  [`${P}txtAddress`]: "1 Rizal St., Quezon City",
  [`${P}txtZipCode`]: "1100",
  [`${P}txtTelNum`]: "0281234567",
  [`${P}txtTax18A`]: "100.00",
  [`${P}txtTax18B`]: "20.50",
  [`${P}txtTax18C`]: "1,000.00",
};
const at = (code: string, k = 0) => `AtcCode${DST_ATC.indexOf(entry(code, k)) + 1}`;
const sectionA = (code: string, base: string, extra: FormState = {}, k = 0): FormState => ({
  ...identity, [`${P}optSection:_1`]: "true", [at(code, k)]: "true", [`${P}txt12B`]: base,
  [`${P}txt12E`]: "Acme Lending Corp.", [`${P}txt12F`]: "Santos, Maria", [`${P}txt12G`]: "123456789", [`${P}txt12H`]: "987-654-321", ...extra,
});
const sectionB: FormState = {
  ...identity, [`${P}optSection:_1`]: "false", [`${P}optSection:_2`]: "true", [`${P}AmendedRtn_1`]: "true", [`${P}txtTax16`]: "250.00",
  [`${P}txt13A`]: "05/31/2017", [`${P}txt13B`]: "50,000.00", [`${P}txt13C`]: "12,345.67", [`${P}txt13F`]: "Pitney", [`${P}txt13G`]: "0012345", [`${P}txt13H`]: "778899", [`${P}txt13I`]: "A-1",
  [`${P}txtTax15`]: "40,000.00",
};
const s1 = (code: string, base: string, due = "0.00", k = 0) => ({ txtDateFrom: "06/01/2017", txtDateTo: "06/30/2017", txtAtcCode: code, txtTaxBase: base, txtTaxDue: due, txtTaxRate: rateCell2000(entry(code, k)) });
// list order (the reload rebuilds rows in Sched1AtcCode order)
const sectionBGroups: GroupState = {
  sched1: [s1("DS101", "100,000.00", "1,000.00"), s1("DS103", "10.00"), s1("DS105", "7.00"), s1("DS112", "20,000.00", "40.00", 1), s1("DS117", "2,500.00"), s1("DS121", "7,500.00"), s1("DS130", "8.00", "1,200.00")],
};

describe("2000 form (sections → items 15–19)", () => {
  it("Section A: the picked ATC fills txtATC / 12A / 12C; 12D → 15; 17 = 15 − 16; 19 = 17 + 18D; Section B blanked", () => {
    const o = computeForm(FORM_2000, { ...sectionA("DS121", "17,777.77"), [`${P}txt13B`]: "5.00", [`${P}txtTax16`]: "9.00" });
    expect(o[`${P}txtATC`]).toBe("DS121");
    expect(o[`${P}txt12A`]).toBe("MORTGAGES, PLEDGES AND DEED OF TRUST ");
    expect(o[`${P}txt12C`]).toBe(" 1ST P5000.0 = P40.0 IN EXCESS P20.0/P5000.0 ");
    expect(o[`${P}txt12D`]).toBe("91.11");
    expect(o[`${P}txtTax15`]).toBe("91.11");
    expect(o[`${P}txtTax16`]).toBe("0.00"); // not amended
    expect(o[`${P}txtTax18D`]).toBe("1,120.50");
    expect(o[`${P}txtTax19`]).toBe("1,211.61");
    expect(o[`${P}txt13B`]).toBe("0.00");
    expect(o[`${P}txt12H`]).toBe(""); // blockLetterInt drops a TIN with dashes
  });
  it("Section B: Schedule 1 → 13D / txtSumTaxDue; 13E = 13B + 13C − 13D; 15 typed; a DS130 row writes 12D", () => {
    const o = computeForm(FORM_2000, sectionB, sectionBGroups);
    expect(o[`${P}txtSumTaxDue`]).toBe("3,059.00"); // typed 1,000 + 10 × 75 + 3 + typed 40 + 16 + 50 + typed 1,200
    expect(o[`${P}txt13D`]).toBe(o[`${P}txtSumTaxDue`]);
    expect(o[`${P}txt13E`]).toBe(formatMoney(5_000_000 + 1_234_567 - parseMoney(o[`${P}txtSumTaxDue`]!)));
    expect(o[`${P}txt12D`]).toBe("1,200.00");
    expect(o[`${P}txtTax15`]).toBe("40,000.00");
    expect(o[`${P}txtTax17`]).toBe("39,750.00");
    expect(o[`${P}txtATC`] ?? "").toBe(""); // unset: BIR's blank default
    expect(o[`${P}txt13G`]).toBe("12345"); // parseFloat(…).toFixed(0) drops the leading zeros
    expect(o[`${P}txt13I`]).toBe(""); // not a number
  });
  it("saves the Sched1AtcCode boxes for the rows, and the two optSection:_2 radios per occurrence", () => {
    expect(pickIndex2000(sectionBGroups)).toEqual([0, 2, 4, 12, 17, 21, 25]);
    const record = formRecords(FORM_2000, sectionB, sectionBGroups);
    expect(record.filter((r) => r.key.startsWith("Sched1AtcCode") && r.value === "true").map((r) => r.key)).toEqual(["Sched1AtcCode1", "Sched1AtcCode3", "Sched1AtcCode5", "Sched1AtcCode13", "Sched1AtcCode18", "Sched1AtcCode22", "Sched1AtcCode26"]);
    expect(record.filter((r) => r.key === `${P}optSection:_2`).map((r) => r.value)).toEqual(["true", "false"]);
    const c = formRecords(FORM_2000, { ...identity, [SECTION_C]: "true", [`${P}txt14A`]: "043" });
    expect(c.filter((r) => r.key.startsWith(`${P}optSection`)).map((r) => r.value)).toEqual(["false", "false", "true"]);
    expect(c.some((r) => r.key === SECTION_C)).toBe(false);
  });
  it("validates", () => {
    expect(validate2000(sectionA("DS101", "1.00"))).toEqual([]);
    expect(validate2000(sectionB, sectionBGroups)).toEqual([]);
    const id = validate2000({ ...identity, [`${P}txtForYr`]: "2018" }, { sched1: [s1("DS103", "1.00"), s1("DS101", "1.00")] }).map((p) => p.id);
    expect(id).toEqual(expect.arrayContaining([`${P}txtForYr`, "AtcCode1", "txtAtcCode1", "txtAtcCode2"]));
  });
});

describe.skipIf(!hasForm("2000"))("native 2000 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());
  const BASE = ["0.00", "0.01", "1.00", "6.00", "8.00", "99.99", "100.00", "100.01", "200.00", "200.01", "1,000.00", "1,000.01", "2,000.00", "2,000.01", "2,345.67", "5,000.00", "5,000.01", "100,000.00", "100,000.01", "300,000.00", "500,000.01", "750,000.00", "1,000,000.00", "1,000,000.01", "987,654.32"];

  it("BIR's own computeAmount12D agrees with the native engine for every ATC radio across bracket edges", async () => {
    const { page, error } = await oracle.openSaved(FORM_2000, identity, "84653210700000-2000-sweepA.xml");
    const got = await page.evaluate((base) => {
      const el = (id: string) => document.getElementById(id) as HTMLInputElement;
      const w = window as unknown as Record<string, () => void> & { round: (e: HTMLInputElement, n: number) => void };
      window.alert = () => undefined;
      const out: Array<{ i: number; base: string; nature: string; rate: string; due: string; tax15: string }> = [];
      for (let i = 1; i <= 28; i++)
        for (const b of base) {
          el(`AtcCode${i}`).checked = true;
          w.getATCCode!();
          el("frm2000:txt12B").value = b;
          el("frm2000:txt12D").value = "9.99"; // sentinel for "left alone"
          w.round(el("frm2000:txt12B"), 2);
          w.computeAmount12D!();
          w.computeSectionATaxDue!();
          out.push({ i, base: b, nature: el("frm2000:txt12A").value, rate: el("frm2000:txt12C").value, due: el("frm2000:txt12D").value, tax15: el("frm2000:txtTax15").value });
        }
      return out;
    }, BASE);
    await page.close();
    const mismatch: string[] = [];
    for (const g of got) {
      const a = DST_ATC[g.i - 1]!;
      const n = amount12D2000(a.atc_code, natureCell2000(a), rateCell2000(a), parseMoney(g.base));
      const due = n.tax_due === null ? "9.99" : formatMoney(n.tax_due);
      // capital() (run by computeAmountOfCompensation) upper-cases every text input, "&gt;" included
      const want = { nature: natureCell2000(a).toUpperCase(), rate: (n.rate_text ?? rateCell2000(a)).toUpperCase(), due, tax15: due };
      if (g.nature !== want.nature || g.rate !== want.rate || g.due !== want.due || g.tax15 !== want.tax15) mismatch.push(`${a.atc_code}#${g.i} ${g.base}: BIR ${JSON.stringify(g)} vs native ${JSON.stringify(want)}`);
    }
    expect(mismatch).toEqual([]);
    expect(got).toHaveLength(28 * BASE.length);
    expect(error).toEqual([]);
  }, 180_000);

  it("BIR's own computeSched1TaxDue agrees with the native Section B row engine for every ATC", async () => {
    const { page, error } = await oracle.openSaved(FORM_2000, { ...identity, [`${P}optSection:_1`]: "false", [`${P}optSection:_2`]: "true" }, "84653210700000-2000-sweepB.xml");
    const got = await page.evaluate((base) => {
      const el = (id: string) => document.getElementById(id) as HTMLInputElement;
      const w = window as unknown as Record<string, (i?: number) => void> & { round: (e: HTMLInputElement, n: number) => void };
      window.alert = () => undefined; // DS120 alerts "less than 2000"
      for (let j = 1; j <= 28; j++) el(`Sched1AtcCode${j}`).checked = true;
      w.getSched1ATCCode!();
      const out: Array<{ i: number; base: string; rate: string; due: string; d12: string }> = [];
      for (let i = 1; i <= 28; i++)
        for (const b of base) {
          el(`txtTaxBase${i}`).value = b;
          el(`txtTaxDue${i}`).value = "9.99";
          el("frm2000:txt12D").value = "8.88";
          w.round(el(`txtTaxBase${i}`), 2);
          w.computeSched1TaxDue!(i);
          out.push({ i, base: b, rate: el(`txtTaxRate${i}`).value, due: el(`txtTaxDue${i}`).value, d12: el("frm2000:txt12D").value });
        }
      return out;
    }, BASE);
    await page.close();
    const mismatch: string[] = [];
    for (const g of got) {
      const a = DST_ATC[g.i - 1]!;
      const n = sched1Due2000(a.atc_code, rateCell2000(a), parseMoney(g.base));
      const want = { rate: rateCell2000(a), due: n.tax_due === null ? "9.99" : formatMoney(n.tax_due), d12: n.item_12d === undefined ? "8.88" : formatMoney(n.item_12d) };
      if (g.rate !== want.rate || g.due !== want.due || g.d12 !== want.d12) mismatch.push(`${a.atc_code}#${g.i} ${g.base}: BIR ${JSON.stringify(g)} vs native ${JSON.stringify(want)}`);
    }
    expect(mismatch).toEqual([]);
    expect(error.filter((e) => !/alert/i.test(e))).toEqual([]);
  }, 180_000);

  it("is 1:1 with Section A returns (parityCheck), several document types", async () => {
    const scenario: Array<[string, FormState]> = [
      ["a1", sectionA("DS121", "17,777.77", { [`${P}AmendedRtn_1`]: "true", [`${P}txtTax16`]: "50.00" })],
      ["a2", sectionA("DS109", "650,000.00")],
      ["a3", sectionA("DS112", "20,000.00", {}, 1)],
      ["a4", sectionA("DS115", "500.00", { [`${P}txt12D`]: "30.00" })], // no case: typed 12D
      ["a5", sectionA("DS130", "9.00")],
      ["a6", sectionA("DS102", "1,234,567.89", { [`${P}txt14A`]: "043", [`${P}txt14E`]: "1,000.00" })],
    ];
    for (const [name, s] of scenario) {
      const r = await parityCheck(oracle, FORM_2000, s, `84653210700000-2000-0630${name}.xml`);
      expect(parityProblem(r), name).toEqual([]);
    }
  }, 240_000);

  it("is 1:1 with a populated Section B Schedule 1, except what BIR's own reload breaks", async () => {
    // BIR reload bugs: both `optSection:_2` radios load the FIRST saved value, so Section C's radio ends up checked and
    // Section B's not; loadDataSections then re-enables Section A, whose 12B blur runs computeSectionATaxDue and
    // overwrites the typed item 15 with 12D (and 17 / 19 follow).
    const allow = [`${P}optSection:_2`, `${P}txtTax15`, `${P}txtTax17`, `${P}txtTax19`];
    const r = await parityCheck(oracle, FORM_2000, sectionB, "84653210700000-2000-0630b.xml", sectionBGroups);
    expect(parityProblem(r, allow)).toEqual([]);
    // item 15 after BIR's reopen is 12D (the DS130 row's figure): the reload defect, not a native one
    expect(r.diff.find((d) => d.key === `${P}txtTax15`)?.legacy).toBe("1,200.00");
  }, 180_000);

  it("Section C: only the radio is lost on BIR's reload", async () => {
    // BIR reload bug: Section C's radio reloads from the first `optSection:_2` record (Section B's, "false"), and
    // loadData never unchecks a radio, so the HTML default (Section A, `optSection:_1`) comes back checked
    const s: FormState = { ...identity, [SECTION_C]: "true", [`${P}txt14A`]: "043", [`${P}txt14B`]: "06/30/2017", [`${P}txt14E`]: "5,000.00", [`${P}txtTax18A`]: "0.00" };
    const r = await parityCheck(oracle, FORM_2000, s, "84653210700000-2000-0630c.xml");
    expect(parityProblem(r, [`${P}optSection:_1`, `${P}optSection:_2`])).toEqual([]);
  }, 120_000);
});
