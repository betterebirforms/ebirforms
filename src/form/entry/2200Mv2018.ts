import type { NativeForm } from "../registry.ts";
import { excisePage1Label, excisePage1Prefill } from "../excise-part3.ts";
import { FORM_2200MV2018, validate2200Mv2018 } from "../form2200mv2018.ts";

const P = "frm2200M:";
const s1 = (stem: string, label: string): [string, string] => [`${P}txtSched1_${stem}`, label];

const entry: NativeForm = {
  schema: FORM_2200MV2018,
  validate: validate2200Mv2018,
  label: {
    ...excisePage1Label(P),
    ...Object.fromEntries([
      s1("description", "Description"), s1("PlaceOfRemoval", "Place of removal"), s1("VOMRITaxableA", "Volume removed — taxable (A)"),
      s1("VOMRIExemptB", "Volume removed — exempt (B)"), s1("LocallyExtractedRateC", "Locally extracted — taxable (C)"),
      s1("LocallyExtractedRateD", "Locally extracted — exempt (D)"), s1("LocallyExtractedTaxRateE", "Tax rate (E)"),
      s1("LocallyExtractedTaxDueF", "Tax due (F)"), s1("ImportedTaxableG", "Imported — taxable (G)"), s1("ImportedExemptH", "Imported — exempt (H)"),
      s1("ImportedTaxRate", "Imported tax rate"), s1("ImportedTaxDue", "Imported tax due"), s1("TaxDueAdjustment", "Tax due adjustment"),
      s1("TotalTaxDue", "Total tax due"),
    ]),
    [`${P}TotalExciseTaxDue`]: "Schedule 1 — total excise tax due (column F)",
  },
  // createXMLFileName: month + day + year, e.g. "06302026"
  periodName: (s) => `${s[`${P}txtPg1I1Month`] ?? ""}${s[`${P}txtPg1I1Day`] ?? ""}${s[`${P}txtPg1I1Year`] ?? ""}`,
  prefill: excisePage1Prefill(P),
};
export default entry;
