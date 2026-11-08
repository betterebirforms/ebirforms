import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, formRecords, type FormState } from "@/form/schema.ts";
import { FORM_1701Qv2018, graduated1701Qv2018, validate1701Qv2018, year1701Qv2018 } from "@/form/form1701qv2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1701q:";
const t = (...id: string[]): FormState => Object.fromEntries(id.map((i) => [`${P}${i}`, "true"]));
const amount = (o: Record<string, string>): FormState => Object.fromEntries(Object.entries(o).map(([k, v]) => [`${P}${k}`, v]));

// taxpayer: single proprietor, II012 (graduated), OSD; spouse: single proprietor, II015 (8%)
const graduatedOsd: FormState = {
  [`${P}txtYear`]: "2025",
  ...t("DateQuarter_2", "optType_1", "optATC_1", "optMethodOfDeduction:_2", "optSpouseType_1", "optSpouseATC_5"),
  ...amount({
    txt36A: "1,000,000.50", txt42A: "100,000.00", txt55A: "10,000.25", txt57A: "5,000.30", txt64A: "100.50",
    txt47B: "600,000.00", txt52B: "250,000.00", txt58B: "1,000.00",
  }),
};

describe("1701Qv2018 compute", () => {
  it("graduated + OSD: whole-peso rounding at every step, 2023+ table; spouse on 8%", () => {
    const o = computeAll(FORM_1701Qv2018, graduatedOsd);
    expect(o[`${P}optTaxRate_1`]).toBe("true"); // fixed by II012
    expect(o[`${P}optSpouseTaxRate_2`]).toBe("true"); // fixed by II015
    expect(o[`${P}txt38A`]).toBe("1,000,001.00"); // Math.round(1,000,000.50)
    expect(o[`${P}txt40A`]).toBe("400,000.00"); // round(400,000.20)
    expect(o[`${P}txt41A`]).toBe("600,001.00");
    expect(o[`${P}txt45A`]).toBe("700,001.00");
    expect(o[`${P}txt46A`]).toBe("82,500.00"); // (700,001 − 400,000) × 20% + 22,500 = 82,500.20 → 82,500
    expect(o[`${P}txt62A`]).toBe("15,001.00"); // round(15,000.55)
    expect(o[`${P}txt63A`]).toBe("67,499.00");
    expect(o[`${P}txt67A`]).toBe("101.00"); // round(100.50)
    expect(o[`${P}txt68A`]).toBe("67,600.00");
    expect(o[`${P}txt26A`]).toBe("82,500.00");
    expect(o[`${P}txt30A`]).toBe("67,600.00");
    // spouse, 8%: 600,000 − 250,000 reduction = 350,000 × 8% = 28,000
    expect(o[`${P}txt53B`]).toBe("350,000.00");
    expect(o[`${P}txt54B`]).toBe("28,000.00");
    expect(o[`${P}txt63B`]).toBe("27,000.00");
    expect(o[`${P}txt26B`]).toBe("28,000.00");
    expect(o[`${P}txt30B`]).toBe("27,000.00");
    expect(o[`${P}txt40B`]).toBe("0.00"); // Schedule I closed for an 8% filer
    expect(o[`${P}txt31`]).toBe("94,600.00");
  });

  it("the TRAIN tables by year (2018–2022, 2023+, pre-2018)", () => {
    const g = (pesos: number, year: string) => graduated1701Qv2018(pesos * 100, year) / 100;
    expect(g(250000, "2020")).toBe(0);
    expect(g(400000, "2020")).toBe(30000);
    expect(g(800000, "2020")).toBe(130000);
    expect(g(2000000, "2020")).toBe(490000);
    expect(g(8000000, "2020")).toBe(2410000);
    expect(g(9000000, "2020")).toBe(2760000);
    expect(g(400000, "2023")).toBe(22500);
    expect(g(8000000, "2023")).toBe(2202500);
    expect(g(250001, "2023")).toBe(0); // 0.15 → rounds to 0
    expect(g(250004, "2023")).toBe(1); // 0.60 → 1
    expect(g(500000, "2017")).toBe(125000);
    expect(g(9999, "2017")).toBe(500); // 499.95 → 500
  });

  it("BIR bug: the spouse's OSD puts 40% into the itemized taxpayer's item 40 (41 still uses itemized)", () => {
    const o = computeAll(FORM_1701Qv2018, {
      [`${P}txtYear`]: "2020",
      ...t("optType_2", "optATC_2", "optMethodOfDeduction:_1", "optSpouseType_1", "optSpouseATC_1", "optSpouseMethod:_2"),
      ...amount({ txt36A: "500,000.00", txt37A: "100,000.00", txt39A: "50,000.00", txt36B: "300,000.00", txt37B: "9,999.00" }),
    });
    expect(o[`${P}txt40A`]).toBe("200,000.00"); // the bug
    expect(o[`${P}txt41A`]).toBe("350,000.00"); // 400,000 − 50,000 (itemized)
    expect(o[`${P}txt46A`]).toBe("20,000.00");
    expect(o[`${P}txt37B`]).toBe("0.00"); // OSD: cost of sales is disabled and zeroed
    expect(o[`${P}txt40B`]).toBe("120,000.00");
    expect(o[`${P}txt41B`]).toBe("180,000.00");
    expect(o[`${P}txt46B`]).toBe("0.00");
  });

  it("estate forces II012 + graduated and clears the spouse; II011 zeroes every spouse amount", () => {
    const estate = computeAll(FORM_1701Qv2018, {
      ...t("optType_3", "optATC_4", "optTaxRate_2", "optSpouseATC_1"),
      ...amount({ txtSpouseName: "DELA CRUZ, MARIA", txtSpouseBranchCode: "", txt36A: "300,000.00", txt47A: "9.00" }),
    });
    expect(estate[`${P}optATC_1`]).toBe("true");
    expect(estate[`${P}optATC_4`]).toBe("false");
    expect(estate[`${P}optTaxRate_1`]).toBe("true");
    expect(estate[`${P}optTaxRate_2`]).toBe("false");
    expect(estate[`${P}txt47A`]).toBe("0.00");
    expect(estate[`${P}txtSpouseName`]).toBe("");
    expect(estate[`${P}txtSpouseBranchCode`]).toBe("00000");
    expect(estate[`${P}optSpouseATC_1`]).toBe("false");

    const comp = computeAll(FORM_1701Qv2018, {
      ...t("optType_1", "optATC_4", "optSpouseType_3", "optSpouseTaxRate_1"),
      ...amount({ txt36B: "300,000.00", txt58B: "1,000.00", txt64B: "50.00" }),
    });
    expect(comp[`${P}optSpouseATC_4`]).toBe("true");
    expect(comp[`${P}optSpouseTaxRate_1`]).toBe("false");
    for (const n of [36, 58, 62, 63, 64, 67, 68, 26, 30]) expect(comp[`${P}txt${n}B`]).toBe("0.00");
  });

  it("item 52: above ₱250,000 → 0; II016 → 0", () => {
    const base = { ...t("optType_1", "optATC_4"), ...amount({ txt47A: "1,000,000.00", txt52A: "250,000.01" }) };
    expect(computeAll(FORM_1701Qv2018, base)[`${P}txt52A`]).toBe("0.00");
    expect(computeAll(FORM_1701Qv2018, base)[`${P}txt54A`]).toBe("80,000.00");
    const mixed = computeAll(FORM_1701Qv2018, { ...base, ...t("optATC_6"), [`${P}optATC_4`]: "false", [`${P}txt52A`]: "100,000.00" });
    expect(mixed[`${P}txt52A`]).toBe("0.00");
  });

  it("item 1: blank → this year; future → blank, and the blank year falls to the pre-TRAIN table", () => {
    const now = new Date().getFullYear();
    expect(year1701Qv2018("")).toBe(String(now));
    expect(year1701Qv2018("2024.4")).toBe("2024");
    expect(year1701Qv2018(String(now + 1))).toBe("");
    const o = computeAll(FORM_1701Qv2018, { ...graduatedOsd, [`${P}txtYear`]: String(now + 1) });
    expect(o[`${P}txtYear`]).toBe("");
    expect(o[`${P}txt46A`]).toBe("189,000.00"); // pre-TRAIN: (700,001 − 500,000) × 32% + 125,000 = 189,000.32
  });

  it("saves the address as one key and the page-2 header with the surname only", () => {
    const record = formRecords(FORM_1701Qv2018, { [`${P}txtTaxpayerName`]: "dela cruz, juan", [`${P}txtAddress`]: "1 rizal st., ", [`${P}txtAddress2`]: "quezon city" });
    const get = (key: string) => record.find((r) => r.key === key)?.value;
    expect(get(`${P}txtAddress`)).toBe("1%20RIZAL%20ST.%2C%20QUEZON%20CITY");
    expect(get(`${P}txtTaxpayerName`)).toBe("DELA%20CRUZ%2C%20JUAN");
    expect(get(`${P}txtPg2TaxpayerName`)).toBe("DELA CRUZ");
    expect(get(`${P}txtCurrentPage`)).toBe("1");
  });

  it("validates quarter, item 7/8 and the method of deduction", () => {
    const id = validate1701Qv2018({ ...t("optTaxRate_1") }).map((p) => p.id);
    expect(id).toEqual(expect.arrayContaining([`${P}DateQuarter_1`, `${P}optType_1`, `${P}optATC_1`, `${P}optMethodOfDeduction:_1`]));
    expect(validate1701Qv2018(graduatedOsd).map((p) => p.id)).not.toContain(`${P}optMethodOfDeduction:_1`);
  });
});

describe.skipIf(!hasForm("1701Qv2018"))("native 1701Qv2018 matches BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  const identity: FormState = {
    ...amount({
      txtTIN1: "846", txtTIN2: "532", txtTIN3: "107", txtBranchCode: "00000", txtRDOCode: "043", txtTaxpayerName: "DELA CRUZ, JUAN",
      txtAddress: "1 RIZAL ST., QUEZON CITY", txtZipCode: "1100", txtBirthMonth: "01", txtBirthDay: "15", txtBirthYear: "1980",
      txtCitizenship: "FILIPINO", txtSpouseTIN1: "123", txtSpouseTIN2: "456", txtSpouseTIN3: "789", txtSpouseBranchCode: "00000",
      txtSpouseRDOCode: "043", txtSpouseName: "DELA CRUZ, MARIA", txtSpouseCitizenship: "FILIPINO", txtLOB: "RETAIL", txtTelno: "1234567",
    }),
  };
  const state: FormState = {
    ...identity,
    ...graduatedOsd,
    ...t("AmendedRtn_1"),
    ...amount({ txt59A: "250.00", txt61Desc: "carry-over", txt61B: "0.75", txt65B: "20.49", txt66B: "0.51" }),
  };

  it("BIR reopens the save and shows the same chain", async () => {
    const { value, error } = await oracle.openSaved(FORM_1701Qv2018, state, "84653210700000-1701Qv2018-2025Q2.xml");
    expect(await value(`${P}txt46A`)).toBe("82,500.00");
    expect(await value(`${P}txt54B`)).toBe("28,000.00");
    expect(await value(`${P}txt68A`)).toBe("67,350.00"); // 82,500 − round(15,250.55) + 101
    expect(await value(`${P}txtAddress`)).toBe("1 RIZAL ST., QUEZON CITY");
    expect(error).toEqual([]);
  }, 120_000);

  it("BIR's own Schedule I / II chain (disabled on reload) gives the native values, both columns", async () => {
    for (const s of [state, { ...state, ...t("optSpouseATC_1", "optSpouseMethod:_1", "optSpouseTaxRate_1"), [`${P}optSpouseATC_5`]: "false", [`${P}optSpouseTaxRate_2`]: "false", ...amount({ txt36B: "300,000.00", txt37B: "20,000.50", txt39B: "10,000.00", txt42B: "1,000.00" }) }]) {
      const { page, error } = await oracle.openSaved(FORM_1701Qv2018, s, "84653210700000-1701Qv2018-2025Q2-chain.xml");
      await page.evaluate("for (const p of ['taxpayer', 'taxspouse']) { computetxt38(p); computetxt40(p); computetxt49(p); }");
      const native = computeAll(FORM_1701Qv2018, s);
      for (const n of [38, 40, 41, 45, 46, 49, 51, 53, 54, 62, 63, 67, 68, 26, 28, 30]) {
        for (const c of ["A", "B"]) expect(await page.locator(`[id="${P}txt${n}${c}"]`).inputValue(), `${n}${c}`).toBe(native[`${P}txt${n}${c}`]);
      }
      expect(await page.locator(`[id="${P}txt31"]`).inputValue()).toBe(native[`${P}txt31`]);
      expect(error).toEqual([]);
      await page.close();
    }
  }, 120_000);

  it("graduated/OSD taxpayer + 8% spouse, credits with centavos: 1:1 after BIR recomputes", async () => {
    const r = await parityCheck(oracle, FORM_1701Qv2018, state, "84653210700000-1701Qv2018-2025Q2-parity.xml");
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count);
  }, 120_000);

  it("itemized taxpayer + OSD spouse (the item-40 bug), 2020 table: 1:1", async () => {
    const itemized: FormState = {
      ...identity,
      [`${P}txtYear`]: "2020",
      ...t("DateQuarter_3", "AmendedRtn_2", "optType_2", "optATC_2", "optMethodOfDeduction:_1", "optSpouseType_2", "optSpouseATC_2", "optSpouseMethod:_2"),
      ...amount({
        txt36A: "500,000.00", txt37A: "100,000.00", txt39A: "50,000.00", txt42A: "12,345.67", txt43Desc: "interest", txt43A: "1,000.40",
        txt36B: "300,000.00", txt44B: "50,000.00", txt56A: "3,000.00", txt57B: "999.99", txt60A: "10.10",
      }),
    };
    const r = await parityCheck(oracle, FORM_1701Qv2018, itemized, "84653210700000-1701Qv2018-2020Q3-parity.xml");
    expect(parityProblem(r)).toEqual([]);
    expect(r.equal_count).toBe(r.key_count);
  }, 120_000);
});
