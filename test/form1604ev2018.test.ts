import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeAll, formRecords, type FormState } from "@/form/schema.ts";
import { FORM_1604Ev2018, validate1604Ev2018 } from "@/form/form1604ev2018.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";

const P = "frm1604e:";
const remit = (s: number, i: number, date: string, bank: string, tra: string, tax: string, pen: string): FormState => ({
  [`${P}txtSched${s}RemDate${i}`]: date,
  [`${P}txtSched${s}BankCode${i}`]: bank,
  [`${P}txtSched${s}TRANo${i}`]: tra,
  [`${P}txtSched${s}TaxWithheld${i}`]: tax,
  [`${P}txtSched${s}Penalties${i}`]: pen,
});

const schedule: FormState = {
  ...remit(1, 1, "01/10/2025", "LBP-001", "TRA0001", "12,345.67", "0.00"),
  ...remit(1, 2, "04/10/2025", "DBP-002", "TRA0002", "8,000.00", "250.50"),
  ...remit(1, 4, "10/10/2025", "BPI-004", "TRA0004", "1,000.01", "0.99"),
  ...remit(2, 1, "02/10/2025", "LBP-101", "EROR101", "500.00", "25.00"),
  ...remit(2, 7, "08/10/2025", "MBTC-107", "EROR107", "70,000.00", "0.00"),
  ...remit(2, 12, "12/10/2025", "BDO-112", "EAR112", "999,999.99", "0.01"),
};

describe("1604Ev2018 compute (two static remittance schedules)", () => {
  it("per row TotRemAmt = TaxWithheld + Penalties; column totals per schedule", () => {
    const o = computeAll(FORM_1604Ev2018, schedule);
    expect(o[`${P}txtSched1TotRemAmt2`]).toBe("8,250.50");
    expect(o[`${P}txtSched1TotRemAmt3`]).toBe("0.00");
    expect(o[`${P}txtSched1TaxWithheldTtl`]).toBe("21,345.68");
    expect(o[`${P}txtSched1PenaltiesTtl`]).toBe("251.49");
    expect(o[`${P}txtSched1TotRemAmtTtl`]).toBe("21,597.17");
    expect(o[`${P}txtSched2TaxWithheldTtl`]).toBe("1,070,499.99");
    expect(o[`${P}txtSched2PenaltiesTtl`]).toBe("25.01");
    expect(o[`${P}txtSched2TotRemAmtTtl`]).toBe("1,070,525.00");
  });

  it("item 1 is saved the way validateYear leaves it: blank/pre-2018 → 2018, future → this year", () => {
    const now = String(new Date().getFullYear());
    expect(computeAll(FORM_1604Ev2018, {})[`${P}txtYear`]).toBe("2018");
    expect(computeAll(FORM_1604Ev2018, { [`${P}txtYear`]: "2016" })[`${P}txtYear`]).toBe("2018");
    expect(computeAll(FORM_1604Ev2018, { [`${P}txtYear`]: "2025" })[`${P}txtYear`]).toBe("2025");
    expect(computeAll(FORM_1604Ev2018, { [`${P}txtYear`]: "2999" })[`${P}txtYear`]).toBe(now);
  });

  it("saves the address as one key, escapes the line of business, and mirrors the page-2 header", () => {
    const record = formRecords(FORM_1604Ev2018, {
      [`${P}txtTIN1`]: "846", [`${P}txtWthhldngAgntsNme`]: "DELA CRUZ & SONS",
      [`${P}txtAddress`]: "1 RIZAL ST., ", [`${P}txtAddress2`]: "QUEZON CITY", [`${P}txtLineBus`]: "RETAIL & TRADE",
    });
    const get = (key: string) => record.find((r) => r.key === key)?.value;
    expect(get(`${P}txtAddress`)).toBe("1%20RIZAL%20ST.%2C%20QUEZON%20CITY");
    expect(get(`${P}txtAddress2`)).toBe("");
    expect(get(`${P}txtWthhldngAgntsNme`)).toBe("DELA%20CRUZ%20%26%20SONS");
    expect(get(`${P}txtLineBus`)).toBe("RETAIL%20%26%20TRADE");
    expect(get(`${P}txtPg2TIN1`)).toBe("846");
    expect(get(`${P}txtPg2TaxpayerName`)).toBe("DELA CRUZ & SONS"); // saveXML writes the page-2 name raw
    expect(get(`${P}txtCurrentPage`)).toBe("1");
  });

  it("validates the category / top-agent options and remittance dates", () => {
    const id = validate1604Ev2018({ ...schedule, [`${P}txtSched1RemDate3`]: "13/40/2017" }).map((p) => p.id);
    expect(id).toEqual(expect.arrayContaining([`${P}WthldngAgntCtgry_1`, `${P}TpWthldngAgnt_1`, `${P}txtSched1RemDate3`]));
    expect(id).not.toContain(`${P}txtSched1RemDate1`);
  });
});

describe.skipIf(!hasForm("1604Ev2018"))("native 1604Ev2018 matches BIR's own form", () => {
  let oracle: Awaited<ReturnType<typeof startOracle>>;
  beforeAll(async () => {
    oracle = await startOracle();
  }, 120_000);
  afterAll(() => oracle?.stop());

  const state: FormState = {
    ...schedule,
    [`${P}txtYear`]: "2025",
    [`${P}AmendedRtn_1`]: "true",
    [`${P}txtSheets`]: "2",
    [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
    [`${P}txtRDOCode`]: "043", [`${P}txtWthhldngAgntsNme`]: "DELA CRUZ, JUAN & SONS",
    [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY", [`${P}txtZipCode`]: "1100", [`${P}txtTelNum`]: "0281234567",
    [`${P}WthldngAgntCtgry_2`]: "true", [`${P}TpWthldngAgnt_1`]: "true", [`${P}txtLineBus`]: "RETAIL",
  };

  it("BIR reloads the schedules and recomputes the same totals", async () => {
    const { value, error } = await oracle.openSaved(FORM_1604Ev2018, state, "84653210700000-1604Ev2018-2025.xml");
    expect(await value(`${P}txtSched1TotRemAmt2`)).toBe("8,250.50");
    expect(await value(`${P}txtSched2TaxWithheldTtl`)).toBe("1,070,499.99");
    expect(await value(`${P}txtAddress`)).toBe("1 RIZAL ST., QUEZON CITY");
    expect(error).toEqual([]);
  }, 120_000);

  it("a populated save reopened and recomputed in BIR's form is 1:1", async () => {
    const r = await parityCheck(oracle, FORM_1604Ev2018, state, "84653210700000-1604Ev2018-2025-parity.xml");
    // BIR reload bug: the page-2 name is saved raw and loadData reads it back through .html(), so "&" → "&amp;"
    expect(parityProblem(r, [`${P}txtPg2TaxpayerName`])).toEqual([]);
    expect(r.equal_count).toBe(r.key_count - 1);
  }, 120_000);
});
