import type { NativeForm } from "../registry.ts";
import { CALC, FORM_2200A, validate2200A } from "../form2200a.ts";

const P = "frm2200A:";
const row = (stem: string, atc: string): Array<[string, string]> => [
  [`${P}${stem.replace("%", "exempt")}`, `${atc} — export / exempt`],
  [`${P}${stem.replace("%", "taxable")}`, `${atc} — taxable (or its calculator's total)`],
  [`${P}${stem.replace("%", "exciseTaxDue")}`, `${atc} — basic excise tax due`],
];
const CALC_COL: Record<string, string[]> = {
  XA035Bottle: ["", "Description", "Cases", "Bottles per case", "Total bottles", "NRP per bottle", "Alcohol strength (%)", "Proof", "Tax base"],
  XA035Bulk: ["", "Description", "NRP", "Alcohol strength (%)", "Proof", "Tax base"],
  XA036Bottle: ["", "Description", "Cases", "Bottles per case", "Total bottles", "Bottle content (L)", "Alcohol strength (%)", "Proof", "Proof liters per bottle", "Tax base"],
  XA036Bulk: ["", "Description", "Content (L)", "Alcohol strength (%)", "Proof", "Tax base"],
  other: ["", "Description", "No. of cases", "Bottles per case", "Total bottles", "Volume content (L)", "Tax base"],
};

const form: NativeForm = {
  schema: FORM_2200A,
  validate: validate2200A,
  label: {
    [`${P}txtMonth1`]: "1 — Date, month (MM)", [`${P}txtDate`]: "day (DD)", [`${P}txtForYr`]: "year (YYYY) — sets Schedule 1's rates",
    [`${P}amendedRtn_1`]: "2 — Amended return: Yes", [`${P}amendedRtn_2`]: "2 — Amended return: No", [`${P}txtSheets`]: "3 — No. of sheets attached",
    [`${P}txtRDOCode`]: "5 — RDO code", [`${P}txtTaxPayerName`]: "6 — Taxpayer / registered name", [`${P}txtAddress`]: "7 — Registered address",
    [`${P}txtZipCode`]: "7A — ZIP code", [`${P}txtContactNum`]: "8 — Contact number", [`${P}txtLineBus`]: "9 — Line of business",
    [`${P}txtPSIC`]: "10 — PSIC", [`${P}txtEmailAddress`]: "11 — Email address",
    [`${P}txt12optRegion`]: "12 — Place of production: region", [`${P}txt12optProvince`]: "12 — province", [`${P}txt12optCity`]: "12 — city / municipality",
    [`${P}txt13optRegion1`]: "13 — Place of removal: region", [`${P}txt13optProvince1`]: "13 — province", [`${P}txt13optCity1`]: "13 — city / municipality",
    [`${P}optTreaty_1`]: "14 — Availing of tax relief: Yes", [`${P}optTreaty_2`]: "14 — Availing of tax relief: No", [`${P}lstTaxTreaty`]: "14A — Tax relief",
    [`${P}chkPymntManner_1`]: "15 — Payment on actual removal", [`${P}chkPymntManner_2`]: "16 — Prepayment / advance deposit",
    [`${P}chkPymntManner_3`]: "17 — Others", [`${P}txt17OthMannerofPymnt`]: "17 — Other manner of payment (specify)",
    [`${P}txtTax18`]: "18 — Total excise tax due (Schedule 1)", [`${P}txtTax19A`]: "19A — Excise tax paid in previous return",
    [`${P}txtTax19B`]: "19B — Other credits", [`${P}txtTax19C`]: "19C — Total tax credits", [`${P}txtTax20`]: "20 — Tax still due",
    [`${P}txtTax21`]: "21 — Payment on return previously filed (amended)", [`${P}txtTax22`]: "22 — Tax still due / (overpayment)",
    [`${P}txtTax23A`]: "23A — Surcharge", [`${P}txtTax23B`]: "23B — Interest", [`${P}txtTax23C`]: "23C — Compromise", [`${P}txtTax23D`]: "23D — Total penalties",
    [`${P}txtTax24`]: "24 — Total amount payable", [`${P}txtTax25A`]: "25A — Tax payment / deposit", [`${P}chkPenalties`]: "25B — Penalties paid",
    [`${P}txtTax25B`]: "25B — Penalties", [`${P}txtTax25C`]: "25C — Total payments made today", [`${P}txtTax26`]: "26 — Balance",
    ...Object.fromEntries([
      ...row("xa1_%1", "XA035 distilled spirits, ad valorem (NRP per proof)"), ...row("xa1_%2", "XA036 distilled spirits, specific (per proof liter)"),
      ...row("xa2_%1", "XA061 sparkling wine ≤ ₱500"), ...row("xa2_%2", "XA062 sparkling wine > ₱500"), ...row("xa2_%3", "XA070 still wine ≤ 14%"),
      ...row("xa2_%4", "XA080 still wine 14–25%"), ...row("xa2_%5", "XA090 fortified wine > 25% (due entered)"),
      ...row("xa3_%1", "XA055 fermented liquor ≤ ₱50.60/L"), ...row("xa3_%XA0552", "XA055 second 2013 rate"),
      ...row("xa3_%2", "XA056 fermented liquor > ₱50.60/L"), ...row("xa3_%XA0562", "XA056 second rate (2013–2016)"),
      ...row("xa3_%3", "XA057 microbrewery"),
    ]),
    [`${P}totalTaxDue`]: "Schedule 1 — Total tax due (to item 18)",
    [`${P}sched1Atc`]: "Others — ATC (XA…)", [`${P}sched1Desc`]: "Description", [`${P}sched1TaxBracket`]: "Tax bracket / unit",
    [`${P}sched1AppRate`]: "Applicable rate (XA035: a percentage)", [`${P}sched1Exempt`]: "Export / exempt", [`${P}sched1Taxable`]: "Taxable",
    [`${P}sched1ExciseTaxDue`]: "Basic excise tax due",
    ...Object.fromEntries(
      CALC.flatMap((c) => {
        const col = CALC_COL[c.name] ?? CALC_COL.other!;
        return [
          [`CalcSubTotal${c.name}`, `Calculator ${c.name} — total tax base`],
          ...col.slice(1).map((label, k) => [`${P}Cal${c.name}_{i}_Col${k + 2}`, `${c.name} calculator — ${label}`]),
        ];
      }),
    ),
  },
  periodName: (s, hhmmss) => `${s[`${P}txtMonth1`] ?? ""}${s[`${P}txtDate`] ?? ""}${s[`${P}txtForYr`] ?? ""}${hhmmss}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}txtTaxPayerName`]: "fn", [`${P}txtAddress`]: "regAddr", [`${P}txtZipCode`]: "zip",
    [`${P}txtContactNum`]: "telNo", [`${P}txtLineBus`]: "lob",
  },
};
export default form;
