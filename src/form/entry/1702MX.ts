import type { NativeForm } from "../registry.ts";
import { FORM_1702MX, P, validate1702MXOld } from "../form1702mx.ts";
import { periodName1702MX } from "../form1702mx-label.ts";

const form: NativeForm = {
  schema: FORM_1702MX,
  validate: (state, groups) => validate1702MXOld(state, groups),
  label: {
    [`${P}txtPg1Pt1I6TINC1`]: "TIN", [`${P}txtPg1Pt1I7RDO`]: "RDO code",
    [`${P}txtPg1Pt1I9RegisteredName`]: "Registered name", [`${P}txtPg1Pt1I10RegisteredAddress`]: "Registered address",
    [`${P}txtPg1Pt1I8`]: "8 — Date of incorporation (MM/DD/YYYY)",
    [`${P}rdoPg1Pt1I13MethodOfDeducItemized`]: "13 — Itemized deduction", [`${P}rdoPg1Pt1I13MethodOfDeducOptional`]: "13 — Optional standard deduction (40%)",
    [`${P}txtPg1Pt2I16TotalIncome`]: "16 — Total income", [`${P}txtPg1Pt2I17LessTotalTax`]: "17 — Less: itemized / OSD",
    [`${P}txtPg1Pt2I18NetTaxPayable`]: "18 — Net taxable income", [`${P}txtPg1Pt2I19TotalPenalties`]: "19 — Total penalties",
    [`${P}txtPg1Pt2I20TotalAmount`]: "20 — Total amount payable / (overpayment)",
    [`${P}rdoPg1Pt2I21Refund`]: "21 — Refund", [`${P}rdoPg1Pt2I21IssueTCC`]: "21 — Issue a Tax Credit Certificate",
    [`${P}rdoPg1Pt2I21CarriedOver`]: "21 — Carry over to next taxable year",
  },
  periodName: periodName1702MX,
  prefill: {
    [`${P}txtPg1Pt1I6TINC1`]: "tin1", [`${P}txtPg1Pt1I6TINC2`]: "tin2", [`${P}txtPg1Pt1I6TINC3`]: "tin3", [`${P}txtPg1Pt1I6TINC4`]: "tin4",
    [`${P}txtPg1Pt1I7RDO`]: "rdo", [`${P}drpPg1Pt1I7RDO`]: "rdo", [`${P}txtPg1Pt1I9RegisteredName`]: "fn",
    [`${P}txtPg1Pt1I10RegisteredAddress`]: "regAddr", [`${P}txtZIP`]: "zip", [`${P}txtPg1Pt1I11ContactNumber`]: "telNo",
    [`${P}txtPg1Pt1I13MainLine`]: "lob",
  },
};
export default form;
