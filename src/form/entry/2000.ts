import type { NativeForm } from "../registry.ts";
import { FORM_2000, SECTION_C, validate2000 } from "../form2000.ts";
import { DST_ATC } from "../dst.ts";

const P = "frm2000:";
const item = (n: string, label: string): [string, string] => [`${P}txt${n}`, `${n} — ${label}`];
const tax = (n: string, label: string): [string, string] => [`${P}txtTax${n}`, `${n} — ${label}`];

const entry: NativeForm = {
  schema: FORM_2000,
  validate: validate2000,
  label: {
    [`${P}txtMonth1`]: "1 — Date (MM)", [`${P}txtDate`]: "1 — Day (DD)", [`${P}txtForYr`]: "1 — Year (YYYY, up to 2017)",
    [`${P}AmendedRtn_1`]: "Yes", [`${P}AmendedRtn_2`]: "No", [`${P}txtSheets`]: "No. of sheets attached", [`${P}txtATC`]: "4 — ATC",
    [`${P}txtBranchCode`]: "Branch code", [`${P}txtRDOCode`]: "RDO code", [`${P}txtLineBus`]: "Line of business",
    [`${P}txtTaxpayerName`]: "Taxpayer name", [`${P}txtTelNum`]: "Telephone", [`${P}txtAddress`]: "Registered address", [`${P}txtZipCode`]: "ZIP",
    [`${P}optSection:_1`]: "Section A — constructive affixture", [`${P}optSection:_2`]: "Section B — metering machine user",
    [SECTION_C]: "Section C — loose documentary stamps (collection agents)",
    ...Object.fromEntries([
      item("12A", "Nature of transaction"), item("12B", "Tax base"), item("12C", "Tax rate"), item("12D", "Tax due"),
      item("12E", "One party"), item("12F", "The other party"), item("12G", "TIN (one party)"), item("12H", "TIN (other party)"),
      item("13A", "Last purchase date (MM/DD/YYYY)"), item("13B", "Last purchase amount"), item("13C", "Beginning balance"),
      item("13D", "Less: consumed (Schedule 1)"), item("13E", "Balance before this purchase"), item("13F", "Machine brand"),
      item("13G", "Serial number"), item("13H", "BIR permit number"), item("13I", "Account number"),
      item("14A", "RDO code"), item("14B", "Date of remittance"), item("14C", "Inclusive dates from"), item("14D", "To"), item("14E", "Amount"),
      tax("15", "Total amount of documentary stamps"), tax("16", "Less: paid in the return amended"), tax("17", "Tax still due"),
      tax("18A", "Surcharge"), tax("18B", "Interest"), tax("18C", "Compromise"), tax("18D", "Total penalties"), tax("19", "Total amount payable"),
    ]),
    [`${P}txtSumTaxDue`]: "Schedule 1 — total tax due",
    ...Object.fromEntries(DST_ATC.map((a, i) => [`AtcCode${i + 1}`, `${a.atc_code} — ${a.description.replace(/&gt;/g, ">")}`])),
    txtDateFrom: "Period from", txtDateTo: "Period to", txtAtcCode: "ATC", txtTaxBase: "Tax base", txtTaxRate: "Tax rate", txtTaxDue: "Tax due",
  },
  // createXMLFileName: month + day + year (+ BIR's save time, which a native save leaves out)
  periodName: (s, hhmmss) => `${s[`${P}txtMonth1`] ?? ""}${s[`${P}txtDate`] ?? ""}${s[`${P}txtForYr`] ?? ""}${hhmmss}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}txtTaxpayerName`]: "fn", [`${P}txtLineBus`]: "lob", [`${P}txtAddress`]: "regAddr",
    [`${P}txtZipCode`]: "zip", [`${P}txtTelNum`]: "telNo",
  },
};
export default entry;
