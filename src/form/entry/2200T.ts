import type { NativeForm } from "../registry.ts";
import { CALC, FORM_2200T_PRE2020, INSPECTION, PRODUCT, calcCell, validate2200TPre2020 } from "../form2200t-pre2020.ts";

const P = "frm2200T:";
const CALC_COL: Record<string, string[]> = {
  XT35: ["", "Brand / description", "Quantity (cigars)", "NRP per cigar", "Tax base"],
  XT36: ["", "Brand / description", "Quantity (cigars)"],
  XT40: ["", "Brand / description", "No. of master cases", "Packs per master case", "Total packs", "Sticks per pack", "Total sticks"],
};

const form: NativeForm = {
  schema: FORM_2200T_PRE2020,
  validate: validate2200TPre2020,
  label: {
    [`${P}txtMonth1`]: "1 — Date, month (MM)", [`${P}txtDate`]: "day (DD)", [`${P}txtForYr`]: "year (YYYY) — sets Schedule 1's rates",
    [`${P}amendedRtn_1`]: "2 — Amended return: Yes", [`${P}amendedRtn_2`]: "2 — Amended return: No", [`${P}txtSheets`]: "3 — No. of sheets attached",
    [`${P}txtRDOCode`]: "5 — RDO code", [`${P}taxpayerName`]: "6 — Taxpayer / registered name", [`${P}txtAddress`]: "7 — Registered address",
    [`${P}txtZipCode`]: "7A — ZIP code", [`${P}txtTelNum`]: "8 — Contact number", [`${P}txtLineBus`]: "9 — Line of business",
    [`${P}txtPSIC`]: "10 — PSIC", [`${P}txtEmailAddress`]: "11 — Email address",
    frm2200ToptRegion: "12 — Place of production: region", frm2200ToptProvince: "12 — province", frm2200ToptCity: "12 — city / municipality",
    frm2200ToptRegion1: "13 — Place of removal: region", frm2200ToptProvince1: "13 — province", frm2200ToptCity1: "13 — city / municipality",
    [`${P}optTreaty_1`]: "14 — Availing of tax relief: Yes", [`${P}optTreaty_2`]: "14 — Availing of tax relief: No", [`${P}lstTaxTreaty`]: "14A — Tax relief",
    [`${P}chkPymntManner_1`]: "15 — Payment on actual removal", [`${P}chkPymntManner_2`]: "16 — Prepayment / advance deposit",
    [`${P}chkPymntManner_3`]: "17 — Others", [`${P}txtOthMannerofPymnt`]: "17 — Other manner of payment (specify)",
    [`${P}txtTax16`]: "16 — Total excise tax due (Schedule 1)", [`${P}txtTax17A`]: "17A — Excise tax paid in previous return / advance deposit",
    [`${P}txtTax17B`]: "17B — Other credits", [`${P}txtTax17C`]: "17C — Total tax credits", [`${P}txtTax18`]: "18 — Tax still due",
    [`${P}txtTax19`]: "19 — Payment on return previously filed (amended)", [`${P}txtTax20`]: "20 — Tax still due / (overpayment)",
    [`${P}txtTax21A`]: "21A — Surcharge", [`${P}txtTax21B`]: "21B — Interest", [`${P}txtTax21C`]: "21C — Compromise", [`${P}txtTax21D`]: "21D — Total penalties",
    [`${P}txtTax22`]: "22 — Total amount payable", [`${P}txtTax23A`]: "23A — Tax payment / deposit", [`${P}PayPenalties`]: "23B — Penalties paid",
    [`${P}txtTax23B`]: "23B — Penalties", [`${P}txtTax23C`]: "23C — Total payments made today", [`${P}txtTax24`]: "24 — Balance",
    ...Object.fromEntries(
      PRODUCT.flatMap(([atc, desc], i) => [
        [`${P}txtProExempt${i}`, `${atc} ${desc} — export / exempt`],
        [`${P}txtProTaxable${i}`, `${atc} ${desc} — taxable${CALC.some((c) => c.row === i) ? " (or its calculator's total)" : ""}`],
        [`${P}txtProBasicTaxDue${i}`, `${atc} ${desc} — basic excise tax due`],
      ]),
    ),
    ...Object.fromEntries(
      INSPECTION.flatMap(([atc, desc, unit, rate], i) => [
        [`${P}txtInsExempt${i}`, `${atc} ${desc} (₱${rate} ${unit}) — exempt`],
        [`${P}txtInsTaxable${i}`, `${atc} ${desc} (₱${rate} ${unit}) — taxable`],
        [`${P}txtInsBasicTaxDue${i}`, `${atc} ${desc} — fee due`],
      ]),
    ),
    [`${P}totalTaxDue`]: "Schedule 1 — Total tax due (to item 16)",
    [`${P}txtsched1Atc`]: "Others — ATC (XT…)", [`${P}txtsched1Desc`]: "Description", [`${P}txtsched1TaxBracket`]: "Tax bracket / unit",
    [`${P}txtsched1AppTaxRate`]: "Applicable rate (XT035: a percentage)", [`${P}txtsched1Exempt`]: "Export / exempt", [`${P}txtsched1Taxable`]: "Taxable",
    [`${P}txtsched1BasicTaxDue`]: "Basic excise tax due",
    ...Object.fromEntries(
      CALC.flatMap((c) => {
        const col = CALC_COL[c.name] ?? CALC_COL.XT40!;
        return [
          [`${P}txt${c.name}Total`, `${c.name} calculator — total tax base`],
          ...col.slice(1).map((label, k) => [calcCell(c.name, k + 2), `${c.name} calculator — ${label}`]),
        ];
      }),
    ),
  },
  periodName: (s, hhmmss) => `${s[`${P}txtMonth1`] ?? ""}${s[`${P}txtDate`] ?? ""}${s[`${P}txtForYr`] ?? ""}${hhmmss}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}taxpayerName`]: "fn", [`${P}txtAddress`]: "regAddr", [`${P}txtZipCode`]: "zip",
    [`${P}txtTelNum`]: "telNo", [`${P}txtLineBus`]: "lob",
  },
};
export default form;
