import type { NativeForm } from "../registry.ts";
import { excisePage1Label, excisePage1Prefill } from "../excise-part3.ts";
import { FORM_2200PV2020, validate2200Pv2020 } from "../form2200pv2020.ts";

const P = "frm2200P:";
const s1 = (stem: string, label: string): [string, string] => [`${P}txtSched1${stem}`, label];

const entry: NativeForm = {
  schema: FORM_2200PV2020,
  validate: validate2200Pv2020,
  label: {
    ...excisePage1Label(P),
    ...Object.fromEntries([
      s1("ATC", "ATC (XP…)"), s1("Description", "Description"), s1("UnitOfMeasure", "Unit of measure"), s1("ApplicableRate", "Applicable rate"),
      s1("PlaceOfRemoval", "Place of removal"), s1("LocalManuProd", "Locally manufactured / produced"), s1("Imported", "Imported"),
      s1("TotTaxRemovals", "Total taxable removals"), s1("TaxPaidImported", "Tax-paid imported stocks"), s1("UnderBond", "Under bond"),
      s1("Exports", "Exports"), s1("Others", "Others (special law / international agreement)"),
      s1("TotTaxPaid", "Total tax-paid / exempt / conditional tax-free removals"), s1("BasicExciseTaxDue", "Basic excise tax due"),
    ]),
    [`${P}txtSched1TotalTaxDue`]: "Schedule 1 — total basic excise tax due",
  },
  // createXMLFileName: month + day + year, e.g. "06302026"
  periodName: (s) => `${s[`${P}txtPg1I1Month`] ?? ""}${s[`${P}txtPg1I1Day`] ?? ""}${s[`${P}txtPg1I1Year`] ?? ""}`,
  prefill: excisePage1Prefill(P),
};
export default entry;
