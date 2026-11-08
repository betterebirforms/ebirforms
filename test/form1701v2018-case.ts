// 1701v2018 fill cases shared by its tests.
import type { FormState } from "@/form/schema.ts";
import { P } from "@/form/form1701v2018.ts";

export const id = (s: string) => `${P}${s}`;
const on = (...k: string[]): FormState => Object.fromEntries(k.map((x) => [id(x), "true"]));
const amt = (o: Record<string, string>): FormState => Object.fromEntries(Object.entries(o).map(([k, v]) => [id(k), v]));

export const identity: FormState = amt({
  txtPg1I4TIN1: "846", txtPg1I4TIN2: "532", txtPg1I4TIN3: "107", txtPg1I4BranchCode: "00000", txtPg1I5RDOCode: "043",
  txtPg1I8TaxpayerName: "DELA CRUZ, JUAN", txtPg1I9Address: "1 RIZAL ST., QUEZON CITY", txtPg1I9AZipCode: "1100",
  txtPg1I15TelNum: "0281234567", txtLineBus: "RETAIL", txtPg1I10BirthDate: "01/15/1980", txtPg1I12Citizenship: "FILIPINO",
});

/** Single sole proprietor, graduated rates with itemized deductions (Sched 4/5/6 populated), 2023 table. */
export const gradItemized: FormState = {
  ...identity,
  ...amt({ txtPg1I1Year: "2023" }),
  ...on("rdoPg1I16CivilStatusS", "rdoPg1I6TaxpayerTypeS", "rdoPg1I7ATC_II012", "rdoPg1I21AMethodDeductionI", "rdoPg1I19IncomeExemptNo", "rdoPg1I20IncomeSpecialNo"),
  ...amt({
    txtPg2IShed3_8A: "2,500,000.00", txtPg2IShed3_9A: "100,000.00", txtPg2IShed3_11A: "900,000.00",
    txtPg2IShed3_19Desc: "RENTAL", txtPg2IShed3_19A: "60,000.00", txtPg2IShed3_21A: "5,000.40",
    txtPg3IShed4_1A: "50,000.00", txtPg3IShed4_5A: "120,000.00", txtPg3IShed4_13A: "300,000.00",
    txtPg3IShed4_17dDesc: "REPAIRS", txtPg3IShed4_17dA: "15,000.50",
    txtPg3IShed5_1Desc: "TRAINING", txtPg3IShed5_1Legal: "RA 10771", txtPg3IShed5_1Amt: "20,000.00",
    txtPg3IShed6_4Year: "2021", txtPg3IShed6_4A: "80,000.00", txtPg3IShed6_4B: "10,000.00", txtPg3IShed6_4D: "30,000.00",
    txtPg4IPart7_1A: "1,000.00", txtPg4IPart7_3A: "25,000.00", txtPg4IPart7_4A: "12,345.67",
    txtPg1I27A: "500.00", txtPg1I28A: "1,000.00",
    txtPg4IPart9_1A: "1,000,000.00", txtPg4IPart9_2Particulars: "NON-DEDUCTIBLE", txtPg4IPart9_2A: "1,000.00",
    txtPg4IPart9_6Particulars: "EXEMPT", txtPg4IPart9_6A: "2,000.00",
  }),
};

/** Single professional on the 8% option (II017), 2022: the ₱250,000 reduction, other non-operating income. */
export const eightPct: FormState = {
  ...identity,
  ...amt({ txtPg1I1Year: "2022" }),
  ...on("rdoPg1I16CivilStatusS", "rdoPg1I6TaxpayerTypeP", "rdoPg1I7ATC_II017", "rdoPg1I19IncomeExemptNo", "rdoPg1I20IncomeSpecialNo"),
  ...amt({
    txtPg3IShed3_26A: "1,800,000.00", txtPg3IShed3_27Desc: "INTEREST", txtPg3IShed3_27A: "50,000.25", txtPg3IShed3_29A: "250,000.00",
    txtPg4IPart7_2A: "30,000.00", txtPg4IPart7_3A: "40,000.00", txtPg1I29A: "1,000.00",
  }),
};

/** Mixed income (sole proprietor + employee, II013) on graduated rates with OSD, 2023; compensation from employer 1. */
export const mixedOsd: FormState = {
  ...identity,
  ...amt({ txtPg1I1Year: "2023" }),
  ...on("rdoPg1I16CivilStatusLS", "rdoPg1I6TaxpayerTypeS", "rdoPg1I6TaxpayerTypeC", "rdoPg1I7ATC_II013", "rdoPg1I21AMethodDeductionO", "rdoPg1I19IncomeExemptNo", "rdoPg1I20IncomeSpecialNo", "chkPg2IShed1a_1Taxpayer"),
  ...amt({
    txtPg2IShed1a_1TPName: "ACME CORP.", txtPg2IShed1a_TIN1: "123", txtPg2IShed1a_TIN2: "456", txtPg2IShed1a_TIN3: "789", txtPg2IShed1a_BranchCode: "00000",
    txtPg2IShed1c_1CI: "600,000.00", txtPg2IShed1c_1TW: "30,000.00", txtPg2IShed1c_3ACI: "600,000.00", txtPg2IShed1c_3ATW: "30,000.00",
    txtPg2IShed2_5A: "90,000.00",
    txtPg2IShed3_8A: "900,000.00", txtPg2IShed3_9A: "12,500.00", txtPg2IShed3_20Desc: "DIVIDENDS", txtPg2IShed3_20A: "7,500.00",
    txtPg4IPart7_3A: "5,000.00",
    txtPg1I25A: "1,000.00",
  }),
};

/** Married, joint filing, 2024: taxpayer mixed income on 8% (II016), spouse sole proprietor graduated itemized (II012)
 *  with a NOLCO row and a current-year operating loss; the spouse is overpaid (refund). */
export const joint: FormState = {
  ...identity,
  ...amt({ txtPg1I1Year: "2024" }),
  ...on(
    "rdoPg1I16CivilStatusM", "rdoPg1I17SpouseIncomeYes", "rdoPg1I18FilingStatusJ", "rdoPg1I6TaxpayerTypeS", "rdoPg1I6TaxpayerTypeC", "rdoPg1I7ATC_II016",
    "rdoPg1I19IncomeExemptNo", "rdoPg1I20IncomeSpecialNo", "chkPg2IShed1a_1Taxpayer", "chkPg2IShed2a_2Spouse",
    "rdoPg2I3SpouseTypeS", "rdoPg2I4ATC_II012", "rdoPg2I8ForeignTaxCreditsYes", "rdoPg2I10IncomeExemptNo", "rdoPg2I11IncomeSpecialNo", "rdoPg2I12AMethodDeductionI",
    "rdoPg1OverpaymentRefund",
  ),
  ...amt({
    txtPg2I9ForeignTaxNumber: "FTN-2024-01",
    txtPg2I1TIN1: "123", txtPg2I1TIN2: "456", txtPg2I1TIN3: "789", txtPg2I1BranchCode: "00000", txtPg2I2SpouseRDOCode: "043",
    txtPg2I5SpouseName: "DELA CRUZ, MARIA", txtPg2I6TelNum: "09171234567", txtPg2I7Citizenship: "FILIPINO",
    txtPg2IShed1a_1TPName: "ACME CORP.", txtPg2IShed1a_TIN1: "111", txtPg2IShed1a_TIN2: "222", txtPg2IShed1a_TIN3: "333", txtPg2IShed1a_BranchCode: "00000",
    txtPg2IShed1c_1CI: "420,000.00", txtPg2IShed1c_1TW: "12,000.00", txtPg2IShed1c_3ACI: "420,000.00", txtPg2IShed1c_3ATW: "12,000.00",
    txtPg2IShed2a_2SName: "BETA INC.", txtPg2IShed2a_TIN1: "444", txtPg2IShed2a_TIN2: "555", txtPg2IShed2a_TIN3: "666", txtPg2IShed2a_BranchCode: "00000",
    txtPg2IShed1c_2CI: "300,000.00", txtPg2IShed1c_2TW: "9,000.00",
    txtPg2IShed2_5A: "60,000.00",
    txtPg3IShed3_26A: "700,000.00", txtPg3IShed3_27Desc: "INTEREST", txtPg3IShed3_27A: "20,000.00",
    txtPg2IShed3_8B: "1,200,000.00", txtPg2IShed3_9B: "700,000.00", txtPg2IShed3_11B: "100,000.00", txtPg2IShed3_19Desc: "RENTAL", txtPg2IShed3_19B: "30,000.00",
    txtPg3IShed4_8B: "250,000.00", txtPg3IShed4_13B: "300,000.00", txtPg3IShed4_15B: "45,000.75",
    txtPg3IShed5_4Desc: "SENIOR CITIZEN DISCOUNT", txtPg3IShed5_4Legal: "RA 9994", txtPg3IShed5_4Amt: "10,000.00",
    txtPg3IShed6_1B: "400,000.00", txtPg3IShed6_2B: "450,000.00",
    txtPg4IShed6_9Year: "2022", txtPg4IShed6_9A: "40,000.00", txtPg4IShed6_9D: "15,000.00",
    txtPg4IPart7_3A: "8,000.00", txtPg4IPart7_3B: "90,000.00", txtPg4IPart7_4B: "1,500.00",
    txtPg1I27A: "200.00", txtPg1I27B: "300.00",
    txtPg4IPart9_1B: "50,000.00",
  }),
};

/** A BOI-registered sole proprietor with income exempt (19) and at a special rate (20), Part X option 2 ("per
 *  activity"): one exempt and one special-rate attachment (Part XI), consolidated into Part X; Part VIII relief. */
export const withAttachment: FormState = {
  ...gradItemized,
  ...on("rdoPg1I19IncomeExemptYes", "rdoPg1I20IncomeSpecialYes", "rdoPg1mOption2"),
  [id("rdoPg1I19IncomeExemptNo")]: "false", [id("rdoPg1I20IncomeSpecialNo")]: "false", [id("rdoPg1mOption1")]: "false",
  ...amt({
    txtPg1mI1ASchdA: "BOI", txtPg1mI2ASchdA: "RA 11534", txtPg1mI3ASchdA: "MANUFACTURING", txtPg1mI5ASchdA: "01/01/2020", txtPg1mI6ASchdA: "12/31/2026",
    txtPg1mI1BSchdA: "PEZA", txtPg1mI2BSchdA: "RA 7916", txtPg1mI3BSchdA: "EXPORT", txtPg1mI4BSchdA: "5.00", txtPg1mI5BSchdA: "06/01/2019", txtPg1mI6BSchdA: "05/31/2029",
    txtPg1mI16BSchdB: "300,000.00", txtPg1mI7BSchdB: "20,000.00", txtPg1mI16ASchdB: "150,000.00", txtPg1mI7ASchdB: "10,000.00",
    txtPg4IPart7_8A: "2,500.00",
  }),
};
const ex = (k: string) => id(`${k}EX{i}`);
const sp = (k: string) => id(`${k}SP{i}`);
export const attachmentGroups = {
  exempt: [
    {
      [ex("txtPg3mSchedA_1A")]: "BOI", [ex("txtPg3mSchedA_2A")]: "RA 11534", [ex("txtPg3mSchedA_3A")]: "MANUFACTURING", [ex("txtPg3mSchedA_4A")]: "0.00",
      [ex("txtPg3mSchedA_5A")]: "01/01/2020", [ex("txtPg3mSchedA_6A")]: "12/31/2026",
      [ex("txtPg3mSchedB_1A")]: "900,000.00", [ex("txtPg3mSchedB_2A")]: "50,000.00", [ex("txtPg3mSchedB_4A")]: "300,000.00",
      [ex("txtPg3mSchedB_10")]: "SCRAP SALES", [ex("txtPg3mSchedB_10A")]: "12,000.00",
      [ex("txtPg3mSchedC_1A")]: "20,000.00", [ex("txtPg4mSchedC_13A")]: "150,000.50", [ex("txtPg4mSchedC_17d")]: "SUPPLIES", [ex("txtPg4mSchedC_17dA")]: "7,000.00",
      [ex("txtPg4mSchedD1_1")]: "TRAINING", [ex("txtPg4mSchedD1_1ALB")]: "RA 10771", [ex("txtPg4mSchedD1_1A")]: "5,000.00",
    },
  ],
  special: [
    {
      [sp("txtPg3mSchedA_1A")]: "PEZA", [sp("txtPg3mSchedA_3A")]: "EXPORT", [sp("txtPg3mSchedA_4A")]: "5.00",
      [sp("txtPg3mSchedB_1A")]: "2,000,000.00", [sp("txtPg3mSchedB_2A")]: "100,000.00", [sp("txtPg3mSchedB_4A")]: "1,200,000.00",
      [sp("txtPg3mSchedB_11")]: "INTEREST", [sp("txtPg3mSchedB_11A")]: "8,000.00", [sp("txtPg3mSchedB_14A")]: "5",
      [sp("txtPg3mSchedC_2A")]: "40,000.00", [sp("txtPg4mSchedC_5A")]: "60,000.00",
    },
    { [sp("txtPg3mSchedA_1A")]: "PEZA", [sp("txtPg3mSchedB_1A")]: "500,000.00", [sp("txtPg3mSchedB_14A")]: "5.125", [sp("txtPg4mSchedC_9A")]: "10,000.00" },
  ],
};

/** Compensation income only (filer type C → ATC II011): Sched 2's tax on taxable compensation is the tax due. */
export const compensation: FormState = {
  ...identity,
  ...amt({ txtPg1I1Year: "2019" }),
  ...on("rdoPg1I16CivilStatusW", "rdoPg1I6TaxpayerTypeC", "rdoPg1I19IncomeExemptNo", "rdoPg1I20IncomeSpecialNo", "chkPg2IShed1a_1Taxpayer"),
  ...amt({
    txtPg2IShed1a_1TPName: "GAMMA CO.", txtPg2IShed1a_TIN1: "777", txtPg2IShed1a_TIN2: "888", txtPg2IShed1a_TIN3: "999", txtPg2IShed1a_BranchCode: "00000",
    txtPg2IShed1c_1CI: "1,000,000.00", txtPg2IShed1c_1TW: "100,000.00", txtPg2IShed1c_3ACI: "1,000,000.00", txtPg2IShed1c_3ATW: "100,000.00",
    txtPg2IShed2_5A: "90,000.00", txtPg4ISc6_2A: "0.00",
  }),
};
