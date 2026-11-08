import type { NativeForm } from "../registry.ts";
import { FORM_2200AV2020, OTHER_ROW, SCHED1_ROW, validate2200Av2020 } from "../form2200av2020.ts";

const P = "frm2200Av2020:";

const form: NativeForm = {
  schema: FORM_2200AV2020,
  validate: validate2200Av2020,
  label: {
    [`${P}txtDateMonth`]: "1 — Date, month (MM)", [`${P}txtDateDay`]: "day (DD)", [`${P}txtDateYear`]: "year (YYYY)",
    [`${P}amendedRtn_1`]: "2 — Amended return: Yes", [`${P}amendedRtn_2`]: "2 — Amended return: No", [`${P}txtSheets`]: "3 — No. of sheets attached",
    [`${P}rdoCode`]: "5 — RDO code", [`${P}registeredName`]: "6 — Taxpayer / registered name", [`${P}registeredAddress`]: "7 — Registered address",
    [`${P}zipCode`]: "7A — ZIP code", [`${P}phoneNumber`]: "8 — Telephone", [`${P}txtEmail`]: "9 — Email address",
    [`${P}prodRegion`]: "10 — Place of production: region", [`${P}prodProvince`]: "10 — province", [`${P}prodCity`]: "10 — city / municipality",
    [`${P}remRegion`]: "11 — Place of removal: region", [`${P}remProvince`]: "11 — province", [`${P}remCity`]: "11 — city / municipality",
    [`${P}optTreaty_1`]: "12 — Availing of tax relief: Yes", [`${P}optTreaty_2`]: "12 — Availing of tax relief: No", [`${P}treatyY`]: "12A — Tax relief (specify)",
    [`${P}optPayment_1`]: "13 — Payment on actual removal", [`${P}optPayment_2`]: "14 — Prepayment / advance deposit", [`${P}optPayment_3`]: "15 — Other similar schemes",
    [`${P}paymentOther`]: "15 — Scheme (specify)",
    [`${P}txtExciseDue`]: "16 — Total excise tax due (Schedule 1)", [`${P}txtLess_Balance`]: "17A — Balance carried over from previous return",
    [`${P}txtLess_Excise`]: "17B — Creditable excise tax", [`${P}txtLess_Tot`]: "17C — Total tax credits",
    [`${P}txtNetTaxDue`]: "18 — Net tax due / (overpayment)", [`${P}txtPrevReturn`]: "19 — Payment on returns previously filed (amended)",
    [`${P}txtStillDue`]: "20 — Tax still due / (overpayment)", [`${P}txtPen_Surcharge`]: "21A — Surcharge", [`${P}txtPen_Interest`]: "21B — Interest",
    [`${P}txtPen_Compromise`]: "21C — Compromise", [`${P}txtPen_Tot`]: "21D — Total penalties", [`${P}txtAmtPayable`]: "22 — Amount payable / (overpayment)",
    [`${P}txtPay_TaxPayment`]: "23A — Tax payment / deposit", [`${P}txtPay_Penalties`]: "23B — Penalties (from 21D)", [`${P}txtPay_Tot`]: "23C — Total payments made today",
    [`${P}txtBalance`]: "24 — Balance carried over to next return", [`${P}txtSched1_TotalDue`]: "Schedule 1 — Total excise tax due",
    ...Object.fromEntries(
      SCHED1_ROW.flatMap(([stem, atc, effective, rate]) => {
        const row = `${atc} (eff. ${effective}, rate ${rate})`;
        return [
          [`${P}txtSched1_${stem}_Export`, `${row} — export volume`],
          [`${P}txtSched1_${stem}_Taxable`, `${row} — taxable volume / NRP`],
          [`${P}txtSched1_${stem}_Due`, `${row} — basic excise tax due`],
        ];
      }),
    ),
    ...Object.fromEntries(
      OTHER_ROW.flatMap((i) => [
        [`${P}txtSched1_xa_others${i}_Atc`, `Others row ${i} — ATC (XA + 3 digits)`],
        [`${P}txtSched1_xa_others${i}_Desc`, `Others row ${i} — description`],
        [`${P}txtSched1_xa_others${i}_Bracket`, `Others row ${i} — tax bracket / unit of measure`],
        [`${P}txtSched1_xa_others${i}_Rate`, `Others row ${i} — applicable tax rate`],
        [`${P}txtSched1_xa_others${i}_Export`, `Others row ${i} — export`],
        [`${P}txtSched1_xa_others${i}_Taxable`, `Others row ${i} — taxable`],
        [`${P}txtSched1_xa_others${i}_Due`, `Others row ${i} — basic excise tax due`],
      ]),
    ),
  },
  periodName: (s) => `${s[`${P}txtDateMonth`] ?? ""}${s[`${P}txtDateDay`] ?? ""}${s[`${P}txtDateYear`] ?? ""}`,
  prefill: {
    [`${P}tinA`]: "tin1", [`${P}tinB`]: "tin2", [`${P}tinC`]: "tin3", [`${P}branchCode`]: "tin4",
    [`${P}rdoCode`]: "rdo", [`${P}registeredName`]: "fn", [`${P}registeredAddress`]: "regAddr", [`${P}zipCode`]: "zip", [`${P}phoneNumber`]: "telNo",
  },
};
export default form;
