import type { NativeForm } from "../registry.ts";
import { FORM_2200AN_PRE2018, LIST1, LIST2, validate2200AnPre2018 } from "../form2200an-pre2018.ts";

const P = "frm2200AN:";

const form: NativeForm = {
  schema: FORM_2200AN_PRE2018,
  validate: validate2200AnPre2018,
  label: {
    [`${P}txtMonth1`]: "1 — Date, month (MM)", [`${P}txtDate`]: "day (DD)", [`${P}txtForYr`]: "year (YYYY)",
    [`${P}amendedRtn_1`]: "2 — Amended return: Yes", [`${P}amendedRtn_2`]: "2 — Amended return: No", [`${P}txtSheets`]: "3 — No. of sheets attached",
    [`${P}txtRDOCode`]: "5 — RDO code", [`${P}txtLineBus`]: "6 — Line of business", [`${P}txtTaxpayerName`]: "7 — Taxpayer / registered name",
    [`${P}txtTelNum`]: "8 — Telephone", [`${P}txtAddress`]: "9 — Registered address", [`${P}txtZipCode`]: "10 — ZIP code",
    frm2200ANoptRegion: "11 — Place of production: region", frm2200ANoptProvince: "11 — province", frm2200ANoptCity: "11 — city / municipality",
    [`${P}txtPlaceofProd`]: "11 — Place of production (details)",
    frm2200ANoptRegion1: "12 — Place of removal: region", frm2200ANoptProvince1: "12 — province", frm2200ANoptCity1: "12 — city / municipality",
    [`${P}txtPlaceofRem`]: "12 — Place of removal (details)",
    [`${P}optTreaty_1`]: "13 — Availing of tax relief: Yes", [`${P}optTreaty_2`]: "13 — Availing of tax relief: No", [`${P}lstTaxTreaty`]: "13A — Tax relief",
    [`${P}chkPymntManner_1`]: "14 — Payment on actual removal", [`${P}chkPymntManner_2`]: "15 — Prepayment / advance deposit / others",
    [`${P}txtOthMannerofPymnt`]: "15 — Other manner of payment (specify)",
    [`${P}txtTax16`]: "16 — Total excise tax due (Schedule 1)", [`${P}txtTax17A`]: "17A — Tax paid in return previously filed",
    [`${P}txtTax17B`]: "17B — Other credits", [`${P}txtTax17C`]: "17C — Total tax credits", [`${P}txtTax18`]: "18 — Tax still due",
    [`${P}txtTax19`]: "19 — Payment on return previously filed (amended)", [`${P}txtTax20`]: "20 — Tax still due / (overpayment)",
    [`${P}txtTax21A`]: "21A — Surcharge", [`${P}txtTax21B`]: "21B — Interest", [`${P}txtTax21C`]: "21C — Compromise", [`${P}txtTax21D`]: "21D — Total penalties",
    [`${P}txtTax22`]: "22 — Total amount payable", [`${P}txtTax23A`]: "23A — Tax payment / deposit", [`${P}PayPenalties`]: "23B — Pay the penalties",
    [`${P}txtTax23B`]: "23B — Penalties", [`${P}txtTax23C`]: "23C — Total payments", [`${P}txtTax24`]: "24 — Balance to be carried over",
    [`${P}totalTaxDue`]: "Schedule 1 — Total tax due",
    ...Object.fromEntries(
      LIST1.flatMap(([atc, desc, rate], i) => {
        const row = `${atc} ${desc} (${rate}%)`;
        return [
          [`${P}listSched1x1B${i}`, `${row} — exempt units`], [`${P}listSched1x1C${i}`, `${row} — taxable units`],
          [`${P}listSched1x1D${i}`, `${row} — exempt value`], [`${P}listSched1x1E${i}`, `${row} — taxable value`],
          [`${P}listSched1x1Due${i}`, `${row} — basic excise tax due`],
        ];
      }),
    ),
    ...Object.fromEntries(
      LIST2.flatMap(([atc, desc, rate], i) => {
        const row = `${atc} ${desc} (${rate}%)`;
        return [
          [`${P}listSched1x2B${i}`, `${row} — exempt units`], [`${P}${i}`, `${row} — taxable units`],
          [`${P}listSched1x2D${i}`, `${row} — exempt value`], [`${P}listSched1x2E${i}`, `${row} — taxable value`],
          [`${P}listSched1x2Due${i}`, `${row} — basic excise tax due`],
        ];
      }),
    ),
    [`${P}sched1Atc`]: "ATC (XG…)", [`${P}sched1Other`]: "Description", [`${P}sched1TaxRate`]: "Tax rate (%)",
    [`${P}sched1ExemptA`]: "Exempt units", [`${P}sched1TaxableA`]: "Taxable units", [`${P}sched1ExemptB`]: "Exempt value",
    [`${P}sched1TaxableB`]: "Taxable value", [`${P}sched1ExciseTaxDue`]: "Basic excise tax due",
  },
  periodName: (s, hhmmss) => `${s[`${P}txtMonth1`] ?? ""}${s[`${P}txtDate`] ?? ""}${s[`${P}txtForYr`] ?? ""}${hhmmss}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}txtTaxpayerName`]: "fn", [`${P}txtAddress`]: "regAddr", [`${P}txtZipCode`]: "zip",
    [`${P}txtTelNum`]: "telNo", [`${P}txtLineBus`]: "lob",
  },
};
export default form;
