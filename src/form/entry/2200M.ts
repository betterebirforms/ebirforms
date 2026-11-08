import type { NativeForm } from "../registry.ts";
import { FORM_2200M, validate2200M } from "../form2200m.ts";

const P = "frm2200M:";
const tax = (item: string, label: string): [string, string] => [`${P}txtTax${item}`, `${item} — ${label}`];
const col: Record<string, string> = {
  A: "Volume removed — taxable (A)", B: "Volume removed — exempt (B)", C: "Provisional value — taxable (C)", D: "Provisional value — exempt (D)",
  E: "Provisional rate % (E)", F: "Provisional tax due (F)", G: "Final value — taxable (G)", H: "Final value — exempt (H)",
  I: "Final rate % (I)", J: "Final tax due (J)", K: "Adjustment per final (K)", L: "Total tax due (L = F + J + K)",
};

const entry: NativeForm = {
  schema: FORM_2200M,
  validate: validate2200M,
  label: {
    [`${P}txtMonth1`]: "1 — Date: month (MM)", [`${P}txtDate`]: "day (DD)", [`${P}txtForYr`]: "year (YYYY)",
    [`${P}amendedRtn_1`]: "2 — Amended return: Yes", [`${P}amendedRtn_2`]: "No",
    [`${P}quarterlyRtn_1`]: "3 — Quarterly return: Yes", [`${P}quarterlyRtn_2`]: "No", [`${P}txtSheets`]: "4 — No. of sheets attached",
    [`${P}txtBranchCode`]: "Branch code", [`${P}txtRDOCode`]: "6 — RDO code", [`${P}txtLineBus`]: "7 — Line of business",
    [`${P}txtTaxpayerName`]: "8 — Taxpayer name", [`${P}txtTelNum`]: "9 — Telephone", [`${P}txtAddress`]: "10 — Registered address",
    [`${P}txtZipCode`]: "ZIP", [`${P}txtPlaceofProd`]: "11 — Place of production", [`${P}txtPlaceofRem`]: "12 — Place of removal",
    [`${P}optTreaty_1`]: "13 — Tax treaty / special rate: Yes", [`${P}optTreaty_2`]: "No", [`${P}lstTaxTreaty`]: "specify",
    [`${P}chkPymntManner_1`]: "Part II — Payment upon actual removal", [`${P}chkPymntManner_2`]: "Prepayment / advance deposit",
    [`${P}txtOthMannerofPymnt`]: "Others — specify",
    ...Object.fromEntries([
      tax("17", "Total excise tax due (Schedule 1)"), tax("18A", "Tax paid in return previously filed"), tax("18B", "Other credits"),
      tax("18C", "Total credits"), tax("19", "Tax still due"), tax("20", "Paid in the return being amended"), tax("21", "Net tax due"),
      tax("22A", "Surcharge"), tax("22B", "Interest"), tax("22C", "Compromise"), tax("22D", "Total penalties"),
      tax("23", "Total amount payable"), tax("24A", "Tax payment / deposit"), tax("24B", "Penalties paid"), tax("24C", "Total payment"),
      tax("25", "Balance / (excess)"),
    ]),
    [`${P}PayPenalties`]: "24B — Pay the penalties too",
    [`${P}totalTaxDue`]: "Schedule 1 — total tax due",
    [`${P}txtsched1Atc`]: "ATC (XM…)", [`${P}txtsched1Desc`]: "Description", [`${P}txtsched1PlaceOfExtract`]: "Place of extraction",
    ...Object.fromEntries(Object.entries(col).map(([c, label]) => [`${P}txtsched1${c}`, label])),
  },
  // createXMLFileName: month + day + year (+ BIR's HHMMSS stamp), e.g. "06302017"
  periodName: (s, hhmmss) => `${s[`${P}txtMonth1`] ?? ""}${s[`${P}txtDate`] ?? ""}${s[`${P}txtForYr`] ?? ""}${hhmmss}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}txtTaxpayerName`]: "fn", [`${P}txtLineBus`]: "lob", [`${P}txtAddress`]: "regAddr",
    [`${P}txtZipCode`]: "zip", [`${P}txtTelNum`]: "telNo",
    // No email: loadData always overwrites txtEmail with the profile's email (globalEmail).
  },
};
export default entry;
