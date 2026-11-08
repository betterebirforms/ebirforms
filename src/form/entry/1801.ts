import type { NativeForm } from "../registry.ts";
import { FORM_1801, validate1801 } from "../form1801.ts";

const P = "frm1801:";

const form: NativeForm = {
  schema: FORM_1801,
  validate: validate1801,
  label: {
    [`${P}txtDateMonth`]: "1 — Date of death, month (MM)", [`${P}txtDateDay`]: "day (DD)", [`${P}txtDateYear`]: "year (YYYY)",
    [`${P}txtRDOCode`]: "RDO code", [`${P}txtTaxpayer`]: "Decedent's name", [`${P}txtExecutor`]: "Executor / administrator",
    [`${P}txtResidence`]: "Residence of decedent", [`${P}txtRAddress`]: "Executor's address",
    [`${P}txt17C`]: "17 — Real property (Schedule 1)", [`${P}txt18C`]: "18 — Personal property (Schedules 2 + 3)",
    [`${P}txt19C`]: "19 — Real property (Schedule 1X)", [`${P}txt20C`]: "20 — Taxable transfers (Schedule 4)",
    [`${P}txt21C`]: "21 — Gross estate", [`${P}txt22C`]: "22 — Deductions (Schedule 5)", [`${P}txt23C`]: "23 — Estate after deductions",
    [`${P}txt24`]: "24 — Family home", [`${P}txt25`]: "25 — Standard deduction", [`${P}txt26`]: "26 — Medical expenses (≤ ₱500k)",
    [`${P}txt27A`]: "27A — Other deduction", [`${P}txt27B`]: "27B — Other deduction", [`${P}txt28`]: "28 — Net estate",
    [`${P}txt29`]: "29 — Share of surviving spouse", [`${P}txt30`]: "30 — Net taxable estate",
    [`${P}txt31`]: "31 — Estate tax due (graduated)", [`${P}txt32A`]: "32A — Foreign estate tax credit",
    [`${P}txt32B`]: "32B — Tax paid on the return previously filed", [`${P}txt32C`]: "32C — Total tax credits",
    [`${P}txt33`]: "33 — Tax payable", [`${P}txtSurcharge`]: "34A — Surcharge", [`${P}txtInterest`]: "34B — Interest",
    [`${P}txtCompromise`]: "34C — Compromise", [`${P}txtTotalPenalties`]: "34D — Total penalties", [`${P}txt35`]: "35 — Total amount payable",
  },
  periodName: (s) => `${s[`${P}txtDateMonth`] ?? ""}${s[`${P}txtDateDay`] ?? ""}${s[`${P}txtDateYear`] ?? ""}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}txtTaxpayer`]: "fn", [`${P}txtResidence`]: "regAddr", [`${P}txtZip`]: "zip", [`${P}txtTelephone`]: "telNo",
  },
};
export default form;
