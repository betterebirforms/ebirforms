// 1701A's "(add more...)" pop-ups: Part IV.A item 42 (other taxable income) and Part IV.B item 51 (other non-taxable).
import { describe, expect, it } from "vitest";
import { computeAll, formRecords, type FormState, type GroupRow } from "@/form/schema.ts";
import { FORM_1701A } from "@/form/form1701a.ts";
import { hasForm, startOracle } from "./oracle.ts";
import { parityCheck, parityProblem } from "./parity.ts";
const P = "frm1701A:";

const row = (side: "A" | "B", desc: string, taxpayer: string, spouse: string): GroupRow => ({
  [`${P}txtmodalPartIV${side}Desc_{i}C1`]: desc, [`${P}txtmodalPartIV${side}_{i}C2`]: taxpayer, [`${P}txtmodalPartIV${side}_{i}C3`]: spouse,
});
const rowA: GroupRow[] = [row("A", "royalty", "100.00", "0.00"), row("A", "GIFT", "250.50", "7.00"), row("A", "Prize", "10.25", "0.00")];
const rowB: GroupRow[] = [row("B", "Rebate", "1,000.00", "0.00"), row("B", "Refund", "2,345.67", "0.00")];
const id: FormState = {
  [`${P}txtMonth`]: "12", [`${P}txtYear`]: "2023", [`${P}txtTIN1`]: "846", [`${P}txtTIN2`]: "532", [`${P}txtTIN3`]: "107", [`${P}txtBranchCode`]: "00000",
  [`${P}txtRDOCode`]: "043", [`${P}txtTaxpayerName`]: "DELA CRUZ, JUAN", [`${P}txtAddress`]: "1 RIZAL ST., QUEZON CITY", [`${P}txtZipCode`]: "1100",
  [`${P}txtBirthDate`]: "01/15/1980", [`${P}txtCitizenship`]: "FILIPINO", [`${P}optAmendedReturn_2`]: "true", [`${P}optShortPeriod_2`]: "true",
  [`${P}optCivilStatus_1`]: "true", [`${P}optTaxType_1`]: "true", [`${P}optATC_1`]: "true", [`${P}optForeignTaxCredits_2`]: "true",
};
const graduated: FormState = { ...id, [`${P}optTaxRate_1`]: "true", [`${P}txt36A`]: "900,000.00", [`${P}txt41Desc`]: "RENTAL", [`${P}txt41A`]: "30,000.00", [`${P}txt42Desc`]: "ROYALTY", [`${P}txt42A`]: "100.00" };
const eight: FormState = { ...id, [`${P}optTaxRate_2`]: "true", [`${P}txt47A`]: "900,000.00", [`${P}txt50Desc`]: "INTEREST", [`${P}txt50A`]: "5,000.00", [`${P}txt51Desc`]: "REBATE", [`${P}txt51A`]: "1,000.00" };

// Harness artifact, not a form difference: BIR copies the pop-up between its tables with innerHTML. IE writes a typed
// value into it; WebKit writes the value ATTRIBUTE, so after loadData fills the rows (the property) the copy holds the
// blanks. The counter, the totals and every box the rows feed are still compared.
const cell = (side: "A" | "B", n: number): string[] => Array.from({ length: n }, (_, i) => [`${P}txtmodalPartIV${side}Desc_${i + 1}C1`, `${P}txtmodalPartIV${side}_${i + 1}C2`, `${P}txtmodalPartIV${side}_${i + 1}C3`]).flat();

describe("1701A (add more...) pop-ups", () => {
  it("item 42 reads OTHERS and the pop-up's whole-peso column totals; the chain follows (44 = 41 + 42 + 43)", () => {
    const o = computeAll(FORM_1701A, graduated);
    expect([o[`${P}txt42Desc`], o[`${P}txt42A`], o[`${P}txt44A`]]).toEqual(["ROYALTY", "100.00", "30,100.00"]);
    const at = (k: string) => formRecords(FORM_1701A, graduated, { partIVA: rowA }).find((r) => r.key === k)?.value;
    expect([at(`${P}txt42Desc`), at(`${P}txt42A`), at(`${P}txt42B`), at(`${P}txt44A`), at(`${P}txt44B`)]).toEqual(["OTHERS", "361.00", "7.00", "30,361.00", "7.00"]);
    expect([at(`${P}txtmodalPartIVA_C1`), at(`${P}txtmodalPartIVA_C2`), at(`${P}txtCtrmodalPartIVA`)]).toEqual(["361.00", "7.00", "3"]);
    expect([at(`${P}txtmodalPartIVADesc_2C1`), at(`${P}txtmodalPartIVA_2C2`), at(`${P}txtmodalPartIVA_2C3`), at(`${P}txtmodalPartIVADesc_1C1`)]).toEqual(["GIFT", "250.50", "7.00", "ROYALTY"]);
  });
  it("item 51 likewise, on the 8% path; the other item's pop-up is untouched", () => {
    const at = (k: string) => formRecords(FORM_1701A, eight, { partIVB: rowB }).find((r) => r.key === k)?.value;
    expect([at(`${P}txt51Desc`), at(`${P}txt51A`), at(`${P}txt52A`), at(`${P}txtCtrmodalPartIVB`), at(`${P}txtCtrmodalPartIVA`)]).toEqual(["OTHERS", "3,346.00", "8,346.00", "2", "0"]);
  });
  it.skipIf(!hasForm("1701A"))("is 1:1 with BIR: item 42's pop-up with three rows (graduated), and item 51's with two (8%)", async () => {
    const oracle = await startOracle();
    try {
      const a = await parityCheck(oracle, FORM_1701A, graduated, "84653210700000-1701A-122023.xml", { partIVA: rowA });
      expect(parityProblem(a, cell("A", rowA.length))).toEqual([]);
      const b = await parityCheck(oracle, FORM_1701A, eight, "84653210700000-1701A-122023.xml", { partIVB: rowB });
      expect(parityProblem(b, cell("B", rowB.length))).toEqual([]);
    } finally {
      await oracle.stop();
    }
  }, 120_000);
});
