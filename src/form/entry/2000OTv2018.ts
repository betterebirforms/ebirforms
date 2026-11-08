import type { NativeForm } from "../registry.ts";
import { FORM_2000OTV2018, validate2000OTv2018 } from "../form2000otv2018.ts";

const P = "frm2000OT:";
const A = `${P}sched1A:`;
const B = `${P}sched1B:`;
const tax = (item: string, label: string): [string, string] => [`${P}txtTax${item}`, `${item} — ${label}`];

const entry: NativeForm = {
  schema: FORM_2000OTV2018,
  validate: validate2000OTv2018,
  label: {
    [`${P}txtTransactionDate`]: "1 — Date of transaction (MM/DD/YYYY)",
    [`${P}AmendedRtn_1`]: "Yes", [`${P}AmendedRtn_2`]: "No",
    [`${P}ATC_1`]: "3 — DO 102 (shares of stock)", [`${P}ATC_2`]: "3 — DO 122 (real property)", [`${P}ATC_3`]: "3 — DO 125 (stock without par value)",
    [`${P}txtSheets`]: "No. of sheets attached", [`${P}txtBranchCode`]: "Branch code", [`${P}txtRDOCode`]: "RDO code",
    [`${P}txtTaxpayerName`]: "Taxpayer name", [`${P}txtAddress`]: "Registered address", [`${P}txtAddress2`]: "Registered address (cont.)",
    [`${P}txtZipCode`]: "ZIP", [`${P}txtTelNum`]: "Telephone", [`${P}txtLineBus`]: "Line of business",
    [`${P}optParty_1`]: "11 — Seller / transferor", [`${P}optParty_2`]: "11 — Buyer / transferee",
    [`${P}txtOtherName`]: "11A — Other party's name", [`${P}txtOtherName2`]: "11A — Other party's name (cont.)", [`${P}txtOtherTIN`]: "11B — Other party's TIN",
    [`${P}rbTransNature_1`]: "12 — Shares of stock", [`${P}rbTransNature_2`]: "12 — Real property (capital asset)",
    [`${P}rbTransNature_3`]: "12 — Real property (ordinary asset)", [`${P}txtRealLocation`]: "13 — Location of the real property",
    ...Object.fromEntries([
      tax("14", "Tax base — shares (Schedule 1B)"), tax("15", "Tax base — real property (Schedule 2)"), tax("16", "Tax rate"),
      tax("17", "Tax due"), tax("18", "Tax paid in the return amended"), tax("19", "Tax still due / (overpayment)"),
      tax("20A", "Surcharge"), tax("20B", "Interest"), tax("20C", "Compromise"), tax("20D", "Total penalties"), tax("21", "Total amount payable"),
    ]),
    [`${A}txtOCTNo`]: "OCT / TCT / CCT no.", [`${A}txtTaxDecNo`]: "Tax declaration no.", [`${A}txtLoc`]: "Location",
    [`${A}txtLot`]: "Lot no.", [`${A}txtClassification`]: "Classification", [`${A}txtArea`]: "Area",
    [`${A}txtFMVCol1`]: "FMV per tax declaration", [`${A}txtFMVCol2`]: "FMV per BIR zonal value", [`${A}txtFMVSubTot`]: "FMV (higher)",
    [`${B}txtNameOfCorpStock`]: "Name of corporation", [`${B}txtNoOfSharesSold`]: "No. of shares", [`${B}txtStockCertNo`]: "Stock certificate no.",
    [`${B}txtParValOfShares`]: "Par value of shares", [`${B}txtDSTPaid`]: "DST paid on original issue",
    [`${P}Sched2:txtGrossSellingPrice`]: "Sched 2 — Gross selling price", [`${P}Sched2:txtTotalFairMarket`]: "Sched 2 — Total FMV (Schedule 1A)",
    [`${P}Sched2:txtOthers`]: "Sched 2 — Other base (specify)", [`${P}Sched2:txtOthersAmount`]: "Sched 2 — Other base amount",
    [`${P}Sched2:txtTaxableBase`]: "Sched 2 — Taxable base",
  },
  // createXMLFileName: the transaction date without slashes, e.g. "05312024"
  periodName: (s) => (s[`${P}txtTransactionDate`] ?? "").replace(/\//g, ""),
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}txtTaxpayerName`]: "fn", [`${P}txtLineBus`]: "lob", [`${P}txtAddress`]: "regAddr",
    [`${P}txtZipCode`]: "zip", [`${P}txtTelNum`]: "telNo",
  },
};
export default entry;
