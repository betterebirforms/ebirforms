import type { NativeForm } from "../registry.ts";
import { FORM_2200CV2018, validate2200Cv2018 } from "../form2200cv2018.ts";

const P = "frm2200C:";
const form: NativeForm = {
  schema: FORM_2200CV2018,
  validate: (state) => validate2200Cv2018(state),
  label: {
    [`${P}txtPg1I1Month`]: "Period month (MM)", [`${P}txtPg1I1Day`]: "Period day (DD)", [`${P}txtPg1I1Year`]: "Period year (YYYY)",
    [`${P}txtPg1TIN1`]: "TIN", [`${P}txtPg1I6RDO`]: "RDO code", [`${P}txtPg1Pt1I7RegisteredName`]: "Registered name",
    [`${P}rdoPg1Pt2MOPPaymentActual`]: "13 — Payment on actual performance of services",
    [`${P}rdoPg1Pt2MOPPrepayment`]: "14 — Prepayment / advance deposit",
    [`${P}rdoPg1Pt2MOPOther`]: "15 — Other similar schemes",
    [`${P}txtPg1P3I16ExciseTaxDue`]: "16 — Total excise tax due", [`${P}txtPg1P3I17CTotal`]: "17C — Total (17A + 17B)",
    [`${P}txtPg1P3I18NetTaxDue`]: "18 — Net tax due", [`${P}txtPg1P3I20TaxStillDue`]: "20 — Tax still due",
    [`${P}txtPg1P3I21DTotPenalties`]: "21D — Total penalties", [`${P}txtPg1P3I22AmountPayable`]: "22 — Total amount payable",
    [`${P}txtPg1P3I23CTotPmntMade`]: "23C — Total payments made", [`${P}txtPg1P3I24BalToCarryOver`]: "24 — Balance to be carried over",
    [`${P}ACexciseTotal`]: "Part V — Total excise (column H)",
  },
  periodName: (s) => `${s[`${P}txtPg1I1Month`] ?? ""}${s[`${P}txtPg1I1Day`] ?? ""}${s[`${P}txtPg1I1Year`] ?? ""}`,
  prefill: {
    [`${P}txtPg1TIN1`]: "tin1", [`${P}txtPg1TIN2`]: "tin2", [`${P}txtPg1TIN3`]: "tin3", [`${P}txtPg1TIN4`]: "tin4",
    [`${P}txtPg1I6RDO`]: "rdo", [`${P}txtPg1Pt1I7RegisteredName`]: "fn", [`${P}txtPg1Pt1I8RegisteredAddress`]: "regAddr",
    [`${P}txPg1I8ZipCode`]: "zip", [`${P}txtPg1Pt1I9ContactNumber`]: "telNo", [`${P}txtLOB`]: "lob",
    [`${P}txtPg2TinC1`]: "tin1", [`${P}txtPg2TinC2`]: "tin2", [`${P}txtPg2TinC3`]: "tin3", [`${P}txtPg2TinC4`]: "tin4",
    [`${P}txtPg2RegisteredName`]: "fn",
  },
};
export default form;
