import type { NativeForm } from "../registry.ts";
import { FORM_2200S, validate2200S } from "../form2200s.ts";

const P = "frm2200S:";
const form: NativeForm = {
  schema: FORM_2200S,
  validate: (state, groups) => validate2200S(state, groups),
  label: {
    [`${P}txtMonth1`]: "Period month (MM)", [`${P}txtDate`]: "Period day (DD)", [`${P}txtForYr`]: "Period year (YYYY)",
    [`${P}txtTIN1`]: "TIN", [`${P}txtRDOCode`]: "RDO code", [`${P}taxpayerName`]: "Taxpayer name",
    [`${P}txtTax16`]: "16 — Total excise tax due on removals", [`${P}txtTax17A`]: "17A — Tax credit (previous payments)",
    [`${P}txtTax17C`]: "17C — Total tax credit", [`${P}txtTax18`]: "18 — Tax still due / (overpayment)",
    [`${P}txtTax19`]: "19 — Less: foreign tax credit (amended)", [`${P}txtTax20`]: "20 — Tax payable / (overpayment)",
    [`${P}txtTax21D`]: "21D — Total penalties", [`${P}txtTax22`]: "22 — Total amount payable",
    [`${P}txtTax23C`]: "23C — Total remitted", [`${P}txtTax24`]: "24 — Balance / (overremittance)",
    [`${P}totalTaxDue`]: "Schedule 1 — Total basic excise tax due",
  },
  periodName: (s, hhmmss) => `${s[`${P}txtMonth1`] ?? ""}${s[`${P}txtDate`] ?? ""}${s[`${P}txtForYr`] ?? ""}${hhmmss}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}taxpayerName`]: "fn", [`${P}txtAddress`]: "regAddr", [`${P}txtZipCode`]: "zip",
    [`${P}txtTelNum`]: "telNo", [`${P}txtLineBus`]: "lob",
  },
};
export default form;
