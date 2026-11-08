import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeForm, type FormState, type GroupState } from "@/form/schema.ts";
import { FORM_1700V2018 } from "@/form/form1700v2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { allPageParityCheck } from "./parity-page.ts";
import { parityProblem } from "./parity.ts";
const P = "frm1700:";

const base: FormState = {
  [`${P}txtPg1I1Year`]: "2024",
  [`${P}txtPg1I4TIN1`]: "846", [`${P}txtPg1I4TIN2`]: "532", [`${P}txtPg1I4TIN3`]: "107", [`${P}txtPg1I4BranchCode`]: "000",
  [`${P}txtRDOCode`]: "043", [`${P}txtPg1I7TaxpayerName`]: "DELA CRUZ, JUAN",
  [`${P}rdoPg1I2AmendedNo`]: "true", [`${P}rdoPg1I6TaxpayerTypeE`]: "true", [`${P}rdoPg1I15CivilStatusS`]: "true",
  // three employers on Schedule 1's main rows, all the taxpayer's
  [`${P}rdoPg2I1PartVIEmployeeT`]: "true", [`${P}txtPg2ISched1c_1REG`]: "300,000.00", [`${P}txtPg2ISched1e_1TW`]: "15,000.00",
  [`${P}rdoPg2I2PartVIEmployeeT`]: "true", [`${P}txtPg2ISched1c_2REG`]: "200,000.00", [`${P}txtPg2ISched1e_2TW`]: "10,000.00",
  [`${P}rdoPg2I3PartVIEmployeeT`]: "true", [`${P}txtPg2ISched1c_3REG`]: "100,000.00", [`${P}txtPg2ISched1e_3TW`]: "5,000.00",
};

describe("1700v2018 compute", () => {
  it("part V.A chain: 44=42−43, 46=44+45, 47=graduated(46) → 26; 58=54..57 → 27; 59=(47)−58 → 28; 30=28−29; 35=30+34", () => {
    const o = computeForm(FORM_1700V2018, base);
    expect(o[`${P}txtPg2I42A`]).toBe("600,000.00"); // item 5c: 300k+200k+100k
    expect(o[`${P}txtPg2I54A`]).toBe("30,000.00");
    expect(o[`${P}txtPg2I47A`]).toBe("62,500.00"); // (600k−400k)×20% + 22500
    expect(o[`${P}txtPg1I26A`]).toBe("62,500.00");
    expect(o[`${P}txtPg2I58A`]).toBe("30,000.00");
    expect(o[`${P}txtPg1I27A`]).toBe("30,000.00");
    expect(o[`${P}txtPg2I59A`]).toBe("32,500.00");
    expect(o[`${P}txtPg1I28A`]).toBe("32,500.00");
    expect(o[`${P}txtPg1I29A`]).toBe("0.00");
    expect(o[`${P}txtPg1I30A`]).toBe("32,500.00");
    expect(o[`${P}txtPg1I36`]).toBe("32,500.00");
  });

  it("computeTaxDue is year-dependent: the 2018–2022 and 2023+ tables differ; an out-of-range year pays nothing", () => {
    const y = (year: string) => computeForm(FORM_1700V2018, { ...base, [`${P}txtPg1I1Year`]: year })[`${P}txtPg2I47A`];
    expect(y("2019")).toBe("80,000.00"); // (600k−400k)×25% + 30000
    expect(y("2024")).toBe("62,500.00"); // (600k−400k)×20% + 22500
    expect(y("2023")).toBe("62,500.00"); // the 2023+ table
    expect(y("")).toBe("0.00"); // BIR reads "" as 0 → no band matches
  });

  it("44A rounds the SUBTRAHEND (misplaced .toFixed(0)) while 44B rounds the difference", () => {
    const a = computeForm(FORM_1700V2018, { ...base, [`${P}txtPg2I43A`]: "100.50" });
    expect(a[`${P}txtPg2I44A`]).toBe("599,899.00"); // 600000 − 101
    const b = computeForm(FORM_1700V2018, {
      ...base, [`${P}rdoPg1I15CivilStatusM`]: "true", [`${P}rdoPg1I16SpouseHasIncomeY`]: "true", [`${P}rdoPg1I17FilingStatusJ`]: "true",
      [`${P}rdoPg1I20SpouseTaxpayerTypeE`]: "true", [`${P}txtPg2I42B`]: "", [`${P}txtPg2I43B`]: "100.50",
    });
    expect(b[`${P}txtPg2I44B`]).toBe("-101.00"); // (0 − 100.50).toFixed(0) — the spouse bucket is empty here
  });

  it("item 29 zeroes when it exceeds 26×50%, when 26 > 0 and 28 ≤ 0, and the 27-check", () => {
    const big = computeForm(FORM_1700V2018, { ...base, [`${P}txtPg1I29A`]: "50,000.00" });
    expect(big[`${P}txtPg1I29A`]).toBe("0.00"); // 50000 > 92500×50%
    const overpaid = computeForm(FORM_1700V2018, { ...base, [`${P}txtPg2I55A`]: "200,000.00", [`${P}txtPg1I29A`]: "5,000.00" });
    expect(overpaid[`${P}txtPg2I58A`]).toBe("230,000.00");
    expect(overpaid[`${P}txtPg1I28A`]).toBe("-167,500.00"); // 62,500 − 230,000
    expect(overpaid[`${P}txtPg1I29A`]).toBe("0.00"); // 26 > 0 and 28 ≤ 0
    expect(overpaid[`${P}txtPg1I30A`]).toBe("-167,500.00");
    expect(overpaid[`${P}txtPg1I35A`]).toBe("-167,500.00"); // 34 = 0 → 35 = 30
  });

  it("a negative 30 with credits yields 34 alone (computePg1I35's third branch)", () => {
    const o = computeForm(FORM_1700V2018, { ...base, [`${P}txtPg2I55A`]: "200,000.00", [`${P}txtPg1I31A`]: "3,000.00" });
    expect(o[`${P}txtPg1I34A`]).toBe("3,000.00");
    expect(o[`${P}txtPg1I35A`]).toBe("3,000.00");
  });

  it("the 25% flat path: 50=48−49, 52=50+51, 53=52×25% → 26; item 59 uses 53", () => {
    const o = computeForm(FORM_1700V2018, {
      ...base, [`${P}rdoPg1I6TaxpayerTypeN`]: "true", [`${P}rdoPg1I6TaxpayerTypeE`]: "false",
      [`${P}txtPg2ISched1d_1CIFR`]: "400,000.00", [`${P}txtPg2I49A`]: "10,000.00", [`${P}txtPg2I51A`]: "2,000.00",
    });
    expect(o[`${P}txtPg2I48A`]).toBe("400,000.00"); // item 5d
    expect(o[`${P}txtPg2I50A`]).toBe("390,000.00");
    expect(o[`${P}txtPg2I52A`]).toBe("392,000.00");
    expect(o[`${P}txtPg2I53A`]).toBe("98,000.00");
    expect(o[`${P}txtPg1I26A`]).toBe("98,000.00");
    expect(o[`${P}txtPg1I29A`]).toBe("0.00"); // N zeroes item 29A
  });

  it("BIR's reload zeroings: REG cells die without an E radio, CIFR without an N, whatever the saved amounts", () => {
    const o = computeForm(FORM_1700V2018, { ...base, [`${P}rdoPg1I6TaxpayerTypeE`]: "false" });
    expect(o[`${P}txtPg2ISched1c_1REG`]).toBe("0.00");
    expect(o[`${P}txtPg2ISched1d_1CIFR`]).toBe("0.00");
    expect(o[`${P}txtPg2ISched1e_1TW`]).toBe("15,000.00"); // TW is never zeroed
  });
});

describe.skipIf(!hasForm("1700v2018"))("native 1700v2018 matches the legacy form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => { oracle = await startOracle(); }, 120_000);
  afterAll(() => oracle?.stop());

  it("legacy reloads the Part VI pop-up rows and copies their Subtotals into item 4", async () => {
    // the pop-up's row 1 holds the original item-4 entry; a second employer was added
    const rows: GroupState = {
      sched1more: [
        {
          [`${P}rdoPg2I4_{i}PartVIEmployeeT`]: "true", [`${P}rdoPg2I4_{i}PartVIEmployeeS`]: "false",
          [`${P}txtPg2I4_{i}PartVIEmployerName1`]: "ACME CORP.", [`${P}txtPg2I4_{i}PartVIEmployerTIN1`]: "123",
          [`${P}txtPg2I4_{i}PartVIEmployerTIN2`]: "456", [`${P}txtPg2I4_{i}PartVIEmployerTIN3`]: "789",
          [`${P}txtPg2I4_{i}PartVIEmployerBranchCode`]: "000",
          [`${P}txtPg2ISched1c_4_{i}REG`]: "150,000.00", [`${P}txtPg2ISched1e_4_{i}TW`]: "7,500.00",
        },
        {
          [`${P}rdoPg2I4_{i}PartVIEmployeeT`]: "true", [`${P}rdoPg2I4_{i}PartVIEmployeeS`]: "false",
          [`${P}txtPg2I4_{i}PartVIEmployerName1`]: "BETA INC.", [`${P}txtPg2I4_{i}PartVIEmployerTIN1`]: "987",
          [`${P}txtPg2I4_{i}PartVIEmployerTIN2`]: "654", [`${P}txtPg2I4_{i}PartVIEmployerTIN3`]: "321",
          [`${P}txtPg2I4_{i}PartVIEmployerBranchCode`]: "000",
          [`${P}txtPg2ISched1c_4_{i}REG`]: "50,000.00", [`${P}txtPg2ISched1e_4_{i}TW`]: "2,500.00",
        },
      ],
    };
    const { value, error } = await oracle.openSaved(FORM_1700V2018, base, "84653210700000-1700v2018-2024.xml", rows);
    expect(await value(`${P}txtPg2I4_1PartVIEmployerName1`)).toBe("ACME CORP.");
    expect(await value(`${P}txtPg2I4_2PartVIEmployerName1`)).toBe("BETA INC.");
    expect(await value(`${P}txtPg2Pt6I4SubtotalC`)).toBe("200,000.00");
    // computeSched1I5 (from the main Schedule-1 blurs) copies the Subtotals into item 4 and rewrote it to OTHERS
    expect(await value(`${P}txtPg2ISched1c_4REG`)).toBe("200,000.00");
    expect(await value(`${P}txtPg2I4PartVIEmployerName1`)).toBe("OTHERS");
    expect(await value(`${P}txtPg2I42A`)).toBe("800,000.00"); // item 5c: 600k main + 200k pop-up
    expect(error).toEqual([]);
  }, 120_000);

  it("is 1:1 with BIR's form (Schedule 1 populated, pop-up rows, married filing jointly with a spouse path)", async () => {
    const joint: FormState = {
      ...base,
      [`${P}rdoPg1I15CivilStatusS`]: "false", [`${P}rdoPg1I15CivilStatusM`]: "true",
      [`${P}rdoPg1I16SpouseHasIncomeY`]: "true", [`${P}rdoPg1I17FilingStatusJ`]: "true",
      [`${P}rdoPg1I20SpouseTaxpayerTypeN`]: "true",
      [`${P}txtPg1I21SpouseName`]: "DELA CRUZ, MARIA", [`${P}txtPg1I18STIN1`]: "123", [`${P}txtPg1I18STIN2`]: "456",
      [`${P}txtPg1I18STIN3`]: "789", [`${P}txtPg1I18SBranchCode`]: "000",
      [`${P}txtPg2ISched1d_3CIFR`]: "80,000.00",
      [`${P}txtPg2I49B`]: "5,000.00",
    };
    const rows: GroupState = {
      sched1more: [
        {
          [`${P}rdoPg2I4_{i}PartVIEmployeeT`]: "true", [`${P}rdoPg2I4_{i}PartVIEmployeeS`]: "false",
          [`${P}txtPg2I4_{i}PartVIEmployerName1`]: "ACME CORP.", [`${P}txtPg2I4_{i}PartVIEmployerTIN1`]: "123",
          [`${P}txtPg2I4_{i}PartVIEmployerTIN2`]: "456", [`${P}txtPg2I4_{i}PartVIEmployerTIN3`]: "789",
          [`${P}txtPg2I4_{i}PartVIEmployerBranchCode`]: "000",
          [`${P}txtPg2ISched1c_4_{i}REG`]: "150,000.00", [`${P}txtPg2ISched1e_4_{i}TW`]: "7,500.00",
        },
      ],
    };
    const r = await allPageParityCheck(oracle, FORM_1700V2018, joint, "84653210700000-1700v2018-2024.xml", rows);
    expect(parityProblem(r)).toEqual([]);
  }, 120_000);
});
