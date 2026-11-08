import type { NativeForm } from "../registry.ts";
import { FORM_2200P, RATE_2200P, validate2200P } from "../form2200p.ts";

const P = "frm2200P:";
const tax = (item: string, label: string): [string, string] => [`${P}txtTax${item}`, `${item} — ${label}`];
const col: Record<string, string> = {
  PlaceOfRemoval: "Place of removal", Locally: "Locally manufactured / produced", Imported: "Imported", TaxRem: "Total taxable removals",
  TaxPaid: "Tax-paid imported stocks", Underbond: "Under bond", Exports: "Exports", Others: "Others (special law / international agreement)",
  Conditional: "Total tax-paid / exempt / conditional tax-free removals", BasicTaxDue: "Basic excise tax due",
};

const entry: NativeForm = {
  schema: FORM_2200P,
  validate: validate2200P,
  label: {
    [`${P}txtMonth1`]: "1 — Date: month (MM)", [`${P}txtDate`]: "day (DD)", [`${P}txtForYr`]: "year (YYYY)",
    [`${P}amendedRtn_1`]: "2 — Amended return: Yes", [`${P}amendedRtn_2`]: "No", [`${P}txtSheets`]: "3 — No. of sheets attached",
    [`${P}txtBranchCode`]: "Branch code", [`${P}txtRDOCode`]: "5 — RDO code", [`${P}txtLineBus`]: "6 — Line of business",
    [`${P}taxpayerName`]: "7 — Taxpayer name", [`${P}txtTelNum`]: "8 — Telephone", [`${P}txtAddress`]: "9 — Registered address",
    [`${P}txtZipCode`]: "ZIP", [`${P}txtPlaceofProd`]: "10 — Place of production", [`${P}txtPlaceofRem`]: "11 — Place of removal",
    [`${P}optTreaty_1`]: "12 — Tax treaty / special rate: Yes", [`${P}optTreaty_2`]: "No", [`${P}lstTaxTreaty`]: "specify",
    [`${P}chkPymntManner_1`]: "Part II — Payment upon actual removal", [`${P}chkPymntManner_2`]: "Prepayment / advance deposit",
    [`${P}txtOthMannerofPymnt`]: "Others — specify",
    ...Object.fromEntries([
      tax("16", "Total excise tax due (Schedule 1)"), tax("17A", "Tax paid in return previously filed"), tax("17B", "Other credits"),
      tax("17C", "Total credits"), tax("18", "Tax still due"), tax("19", "Paid in the return being amended"), tax("20", "Net tax due"),
      tax("21A", "Surcharge"), tax("21B", "Interest"), tax("21C", "Compromise"), tax("21D", "Total penalties"),
      tax("22", "Total amount payable"), tax("23A", "Tax payment / deposit"), tax("23B", "Penalties paid"), tax("23C", "Total payment"),
      tax("24", "Balance / (excess)"),
    ]),
    [`${P}PayPenalties`]: "23B — Pay the penalties too",
    [`${P}totalTaxDue`]: "Schedule 1 — total basic excise tax due",
    ...Object.fromEntries(RATE_2200P.flatMap(([atc, rate], row) => Object.entries(col).map(([c, label]) => [`${P}txt${c}${row}`, `${atc} (P${rate.toFixed(2)}) — ${label}`]))),
    [`${P}txtsched1Atc`]: "ATC (XP…)", [`${P}txtsched1Desc`]: "Description", [`${P}txtsched1UnitOfMeasure`]: "Unit of measure",
    [`${P}txtsched1AppRate`]: "Applicable rate",
    ...Object.fromEntries(Object.entries(col).map(([c, label]) => [`${P}txtsched1${c}`, label])),
  },
  // createXMLFileName: month + day + year, e.g. "06302019"
  periodName: (s, hhmmss) => `${s[`${P}txtMonth1`] ?? ""}${s[`${P}txtDate`] ?? ""}${s[`${P}txtForYr`] ?? ""}${hhmmss}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}taxpayerName`]: "fn", [`${P}txtLineBus`]: "lob", [`${P}txtAddress`]: "regAddr",
    [`${P}txtZipCode`]: "zip", [`${P}txtTelNum`]: "telNo",
    // No email: loadData always overwrites txtEmail with the profile's email (globalEmail).
  },
};
export default entry;
