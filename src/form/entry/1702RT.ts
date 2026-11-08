import type { NativeForm } from "../registry.ts";
import { FORM_1702RT, validate1702RT } from "../form1702rt.ts";
import { periodName1702RT } from "../form1702rt-label.ts";

const P = "frm1702RT:";
const form: NativeForm = {
  schema: FORM_1702RT,
  validate: (state) => validate1702RT(state),
  label: {
    [`${P}txtPg1Pt1I8`]: "8 — Date of incorporation (MM/DD/YYYY)", [`${P}txtPg1Pt1I9Name`]: "9 — Registered name",
    [`${P}txtPg1Pt1I10Address`]: "10 — Registered address", [`${P}txtPg1Pt1I7RDO`]: "7 — RDO code",
    [`${P}rdoPg1Pt1I15ItemizedDeduction`]: "15 — Itemized deductions", [`${P}rdoPg1Pt1I15OptionalStandard`]: "15 — Optional standard deduction (40%)",
    [`${P}txtPg1Pt2I16IncomeTax`]: "16 — Tax due", [`${P}txtPg1Pt2I17TotalTaxCredits`]: "17 — Tax credits/payments",
    [`${P}txtPg1Pt2I18NetTax`]: "18 — Net tax payable", [`${P}txtPg1Pt2I19TotalPenalties`]: "19 — Total penalties",
    [`${P}txtPg1Pt2I20TotalAmount`]: "20 — Total amount payable / (overpayment)",
    [`${P}txtPg2Pt4I34TotalGross`]: "34 — Total gross income", [`${P}txtPg2Pt4I40NetTaxable`]: "40 — Net taxable income",
    [`${P}txtPg2Pt4I42IncomeTaxDue`]: "42 — Regular income tax (30%)", [`${P}txtPg2Pt4I43MinimumCorporate`]: "43 — MCIT (2% of 34)",
    [`${P}txtPg2Pt4I44TotalIncomeTax`]: "44 — Income tax due", [`${P}txtPg2Pt4I46NetTax`]: "46 — Net tax payable",
    [`${P}txtPg2Pt4I47Surcharge`]: "47 — Surcharge", [`${P}txtPg2Pt4I48Interest`]: "48 — Interest", [`${P}txtPg2Pt4I49Compromise`]: "49 — Compromise",
    [`${P}txtPg2Pt4I51TotalAmount`]: "51 — Total amount payable",
  },
  periodName: periodName1702RT,
  prefill: {
    [`${P}txtPg1Pt1I6TIN1`]: "tin1", [`${P}txtPg1Pt1I6TIN2`]: "tin2", [`${P}txtPg1Pt1I6TIN3`]: "tin3", [`${P}txtPg1Pt1I6TIN4`]: "tin4",
    [`${P}txtPg1Pt1I7RDO`]: "rdo", [`${P}drpPg1Pt1I7RDOCode`]: "rdo", [`${P}txtPg1Pt1I9Name`]: "fn", [`${P}txtPg1Pt1I10Address`]: "regAddr",
    [`${P}txtZIP`]: "zip", [`${P}txtPg1Pt1I11Contact`]: "telNo", [`${P}txtPg1Pt1I13Business`]: "lob",
  },
};
export default form;
