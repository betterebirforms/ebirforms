// Labels, period name and profile prefill shared by the 1702-MX 2018 editions (all use the frm1702MX: prefix).
import type { Profile } from "@/lib/savefile.ts";
import type { FormState } from "./schema.ts";

const P = "frm1702MX:";

/** BIR's savefile period segment: createXMLFileName joins item 2's month and its 2-digit year ("12" + "25"). */
export const periodName1702MX = (s: FormState): string => `${s[`${P}ddlPg1I2Date`] || "12"}${s[`${P}txtPg1I2YearEnd`] || "25"}`;

export const prefill1702MX: Record<string, keyof Profile> = {
  [`${P}txtPg1Pt1I6TINC1`]: "tin1", [`${P}txtPg1Pt1I6TINC2`]: "tin2", [`${P}txtPg1Pt1I6TINC3`]: "tin3", [`${P}txtPg1Pt1I6TINC4`]: "tin4",
  [`${P}txtPg1Pt1I7RDO`]: "rdo", [`${P}drpPg1Pt1I7RDO`]: "rdo", [`${P}txtPg1Pt1I9RegisteredName`]: "fn",
  [`${P}txtPg1Pt1I10RegisteredAddress`]: "regAddr", [`${P}txtZIP`]: "zip", [`${P}txtPg1Pt1I11ContactNumber`]: "telNo",
};

const col = { A: "exempt", B: "special rate", C: "regular rate", D: "total" } as const;
const each = (stem: string, text: string, cols = "ABCD") =>
  Object.fromEntries([...cols].map((c) => [`${P}${stem}${c}`, `${text} (${col[c as keyof typeof col]})`]));

export const label1702MX: Record<string, string> = {
  [`${P}rdoPg1I1Calendar`]: "1 — Calendar", [`${P}rdoPg1I1Fiscal`]: "1 — Fiscal",
  [`${P}ddlPg1I2Date`]: "2 — Year ended: month", [`${P}txtPg1I2YearEnd`]: "2 — Year ended (YY)",
  [`${P}rdoPg1I3AmendedYes`]: "3 — Amended return: yes", [`${P}rdoPg1I3AmendedNo`]: "3 — Amended return: no",
  [`${P}rdoPg1I4ShortPeriodYes`]: "4 — Short period: yes", [`${P}rdoPg1I4ShortPeriodNo`]: "4 — Short period: no",
  [`${P}chkPg1I5ATCR1`]: "5 — ATC IC055 MCIT (set from item 10)", [`${P}chkPg1I5ATCR2`]: "5 — Other ATC", [`${P}drpPg1I5ATCR2`]: "5 — Other ATC code",
  [`${P}txtPg1Pt1I7RDO`]: "7 — RDO code", [`${P}drpPg1Pt1I7RDO`]: "7 — RDO",
  [`${P}txtPg1Pt1I9RegisteredName`]: "8 — Registered name", [`${P}txtPg1Pt1I10RegisteredAddress`]: "9 — Registered address", [`${P}txtZIP`]: "9A — ZIP",
  [`${P}txtPg1Pt1I8`]: "10 — Date of incorporation (MM/DD/YYYY)", [`${P}txtPg1Pt1I11ContactNumber`]: "11 — Contact number",
  [`${P}rdoPg1Pt1I13MethodOfDeducItemized`]: "13 — Itemized deductions", [`${P}rdoPg1Pt1I13MethodOfDeducOptional`]: "13 — Optional standard deduction (40%)",
  [`${P}txtPg1Pt2I14TotalIncome`]: "14 — Total tax due", [`${P}txtPg1Pt2I15LessTotalTax`]: "15 — Tax credits/payments",
  [`${P}txtPg1Pt2I16NetTaxPayable`]: "16 — Net tax payable / (overpayment)", [`${P}txtPg1Pt2I17`]: "17 — Surcharge",
  [`${P}txtPg1Pt2I18`]: "18 — Interest", [`${P}txtPg1Pt2I19`]: "19 — Compromise", [`${P}txtPg1Pt2I20TotalPenalties`]: "20 — Total penalties",
  [`${P}txtPg1Pt2I21TotalAmount`]: "21 — Total amount payable / (overpayment)", [`${P}rdoPg1Pt2I21Refund`]: "To be refunded",
  [`${P}rdoPg1Pt2I21IssueTCC`]: "To be issued a TCC", [`${P}rdoPg1Pt2I21CarriedOver`]: "To be carried over",
  [`${P}txtPg1P2I23NumOfAttachments`]: "22 — Number of attachments",
  [`${P}InstAPg2Part4`]: "Part IV A — one activity under exempt / special", [`${P}InstBPg2Part4`]: "Part IV B — two or more activities (Part V attachments)",
  ...each("txtPg2Pt4I31C", "Sch 1.1 — IPA / implementing agency", "ABC"), ...each("txtPg2Pt4I32C", "Sch 1.2 — Legal basis", "ABC"),
  ...each("txtPg2Pt4I33C", "Sch 1.3 — Registered activity", "ABC"), [`${P}txtPg2Pt4I34SpecialTaxRate`]: "Sch 1.4 — Special tax rate (%)",
  ...each("txtPg2Pt4I35C", "Sch 1.5 — Effectivity from (MM/DD/YYYY)", "ABC"), ...each("txtPg2Pt4I36C", "Sch 1.6 — Expiration to (MM/DD/YYYY)", "ABC"),
  ...each("txtPg2Sc2Itm1", "Sch 2.1 — Sales/receipts/revenues/fees"), ...each("txtPg2Sc2Itm2", "Sch 2.2 — Less: returns, allowances, discounts"),
  ...each("txtPg2Sc2Itm3", "Sch 2.3 — Net sales"), ...each("txtPg2Sc2Itm4", "Sch 2.4 — Less: cost of sales/services"),
  ...each("txtPg2Sc2Itm5", "Sch 2.5 — Gross income from operation"), ...each("txtPg2Sc2Itm6", "Sch 2.6 — Add: other taxable income"),
  ...each("txtPg2Sc2Itm7", "Sch 2.7 — Total taxable income"), ...each("txtPg2Sc2Itm8", "Sch 2.8 — Ordinary allowable deductions"),
  ...each("txtPg2Sc2Itm9", "Sch 2.9 — Special allowable deductions"), ...each("txtPg2Sc2It10", "Sch 2.10 — NOLCO", "BCD"),
  ...each("txtPg2Sc2It11", "Sch 2.11 — Total itemized deductions"), ...each("txtPg2Sc2It12", "Sch 2.12 — OSD (40% of 7)", "CD"),
  ...each("txtPg2Sc2It13", "Sch 2.13 — Net taxable income / (loss)"), ...each("txtPg2Sc2It14", "Sch 2.14 — Income tax rate (%)", "BC"),
  ...each("txtPg2Sc2It15", "Sch 2.15 — Income tax due other than MCIT", "BCD"), ...each("txtPg2Sc2It16", "Sch 2.16 — Less: share of other agency", "BD"),
  ...each("txtPg2Sc2It17", "Sch 2.17 — Net income tax due", "BCD"), ...each("txtPg2Sc2It18", "Sch 2.18 — MCIT (2% of gross income)", "CD"),
  ...each("txtPg2Sc2It19", "Sch 2.19 — Total income tax due", "BCD"),
  ...each("txtPg2Sc3It20", "Sch 3.20 — Prior year's excess credits"), ...each("txtPg2Sc3It21", "Sch 3.21 — MCIT payments, prior quarters", "CD"),
  ...each("txtPg2Sc3It22", "Sch 3.22 — Regular-rate payments, prior quarters"), ...each("txtPg2Sc3It23", "Sch 3.23 — Excess MCIT applied (Sch 9)", "CD"),
  ...each("txtPg2Sc3It24", "Sch 3.24 — CWT, prior quarters (2307)"), ...each("txtPg2Sc3It25", "Sch 3.25 — CWT, 4th quarter (2307)"),
  ...each("txtPg2Sc3It26", "Sch 3.26 — Foreign tax credits"), ...each("txtPg2Sc3It27", "Sch 3.27 — Tax paid in return previously filed"),
  ...each("txtPg2Sc3It28", "Sch 3.28 — Special-rate payments, prior quarters"), ...each("txtPg2Sc3It29", "Sch 3.29 — Special tax credits"),
  [`${P}txtPg2Sc3It30`]: "Sch 3.30 — Other credit (description)", ...each("txtPg2Sc3It30", "Sch 3.30 — Other credit"),
  [`${P}txtPg2Sc3It31`]: "Sch 3.31 — Other credit (description)", ...each("txtPg2Sc3It31", "Sch 3.31 — Other credit"),
  ...each("txtPg2Sc3It32", "Sch 3.32 — Total tax credits/payments"), ...each("txtPg2Sc3It33", "Sch 3.33 — Net tax payable / (overpayment)"),
  [`${P}drpPg3Sc1I11CB`]: "Sch 4 — Special tax rate", [`${P}txtPg3Sc4Itm1A`]: "Sch 4.1 — Regular tax otherwise due (exempt)", [`${P}txtPg3Sc4Itm1B`]: "Sch 4.1 — Regular tax otherwise due (special rate)",
  ...each("txtPg2Sc4Itm2", "Sch 4.2 — Tax relief on special deductions"), ...each("txtPg2Sc4Itm7", "Sch 4.7 — Total tax relief availment"),
  ...each("txtPg3Sc5Itm18", "Sch 5.18 — Total ordinary allowable deductions"), ...each("txtPg6Sc6I5C", "Sch 6.5 — Total special allowable deductions"),
  [`${P}txtPg3IShed78D`]: "Sch 7.8 — Total NOLCO (regular)", [`${P}txtPg3IShed88D`]: "Sch 8.8 — Total NOLCO (special)",
  [`${P}txtPg7Sc9I4`]: "Sch 9.4 — Total excess MCIT applied",
  ...each("txtPg4Sc10Itm1", "Sch 10.1 — Net income / (loss) per books"), ...each("txtPg2Sc2Itm10", "Sch 10.10 — Net taxable income / (loss)"),
};
