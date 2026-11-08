import type { NativeForm } from "../registry.ts";
import { FORM_1801V2018, validate1801v2018 } from "../form1801v2018.ts";

const P = "frm1801v2018:";

const form: NativeForm = {
  schema: FORM_1801V2018,
  validate: validate1801v2018,
  label: {
    [`${P}txtDateMonth`]: "1 — Date of death, month (MM)", [`${P}txtDateDay`]: "day (DD)", [`${P}txtDateYear`]: "year (YYYY)",
    [`${P}txtRDOCode_1`]: "6 — RDO code", [`${P}registeredName_1`]: "7 — Decedent's name", [`${P}registeredAddress_1`]: "8 — Residence of decedent",
    [`${P}categoryNonResident_1`]: "9 — Non-resident alien: Yes", [`${P}categoryNonResident_2`]: "9 — Non-resident alien: No",
    [`${P}adminName`]: "10 — Executor / administrator", [`${P}telephoneNumber`]: "12 — Telephone",
    [`${P}txtTaxableEstate`]: "16 — Net taxable estate", [`${P}txtTaxRate`]: "17 — Tax rate", [`${P}txtEstTaxDue`]: "18 — Estate tax due (6%)",
    [`${P}txtCredits_ForeignEst`]: "19A — Foreign estate tax paid", [`${P}txtCredits_TaxPrev`]: "19B — Tax paid in return previously filed",
    [`${P}txtCredits_Tot`]: "19C — Total tax credits", [`${P}txtTaxPayable`]: "20 — Tax payable",
    [`${P}txtInstallment`]: "21 — Installment amount", [`${P}txtTaxPayable_1st`]: "22 — Tax payable (this installment)",
    [`${P}txtPen_Surcharge`]: "23A — Surcharge", [`${P}txtPen_Interest`]: "23B — Interest", [`${P}txtPen_Compromise`]: "23C — Compromise",
    [`${P}txtPen_Tot`]: "23D — Total penalties", [`${P}txtTotPayable`]: "24 — Total amount payable",
    [`${P}txtGrossEst_C`]: "34 — Gross estate", [`${P}txtOrdDed_C`]: "35 — Ordinary deductions",
    [`${P}txtStandardDed_C`]: "37A — Standard deduction (≤ ₱5M)", [`${P}txtFamDed_C`]: "37B — Family home (≤ ₱10M)",
    [`${P}txtOtherDed_C`]: "37C — Other special deductions", [`${P}txtNetEst_C`]: "38 — Net estate",
    [`${P}txtShareSpouse_C`]: "39 — Share of surviving spouse", [`${P}txtNetTaxEst_C`]: "40 — Net taxable estate",
  },
  periodName: (s) => `${s[`${P}txtDateMonth`] ?? ""}${s[`${P}txtDateDay`] ?? ""}${s[`${P}txtDateYear`] ?? ""}`,
  prefill: {
    [`${P}tinA_1`]: "tin1", [`${P}tinB_1`]: "tin2", [`${P}tinC_1`]: "tin3", [`${P}branchCode_1`]: "tin4",
    [`${P}txtRDOCode_1`]: "rdo", [`${P}registeredName_1`]: "fn", [`${P}registeredAddress_1`]: "regAddr", [`${P}telephoneNumber`]: "telNo",
  },
};
export default form;
