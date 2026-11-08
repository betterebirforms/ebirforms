// 1604-E v2018 (annual information return, expanded WHT) — see src/form/form1604ev2018.ts.
import type { NativeForm } from "../registry.ts";
import { FORM_1604Ev2018, SCHED_ROW_1604EV2018, validate1604Ev2018 } from "../form1604ev2018.ts";

const P = "frm1604e:";
const label: Record<string, string> = {
  [`${P}txtYear`]: "1 — For the year (YYYY)",
  [`${P}AmendedRtn_1`]: "2 — Amended return: Yes", [`${P}AmendedRtn_2`]: "2 — Amended return: No",
  [`${P}txtSheets`]: "3 — Number of sheets attached",
  [`${P}txtRDOCode`]: "5 — RDO code", [`${P}txtWthhldngAgntsNme`]: "6 — Withholding agent's name",
  [`${P}txtAddress`]: "7 — Registered address", [`${P}txtAddress2`]: "7 — Registered address (cont.)", [`${P}txtZipCode`]: "7A — ZIP code",
  [`${P}WthldngAgntCtgry_1`]: "8 — Category: Private", [`${P}WthldngAgntCtgry_2`]: "8 — Category: Government",
  [`${P}TpWthldngAgnt_1`]: "9 — Top withholding agent: Yes", [`${P}TpWthldngAgnt_2`]: "9 — Top withholding agent: No",
  [`${P}txtTelNum`]: "10 — Contact number", txtEmail: "11 — Email address",
  [`${P}txtSched1TaxWithheldTtl`]: "Schedule 1 — total tax withheld", [`${P}txtSched1PenaltiesTtl`]: "Schedule 1 — total penalties",
  [`${P}txtSched1TotRemAmtTtl`]: "Schedule 1 — total amount remitted",
  [`${P}txtSched2TaxWithheldTtl`]: "Schedule 2 — total tax withheld", [`${P}txtSched2PenaltiesTtl`]: "Schedule 2 — total penalties",
  [`${P}txtSched2TotRemAmtTtl`]: "Schedule 2 — total amount remitted",
  [`${P}txtLineBus`]: "Line of business",
};
for (const s of [1, 2] as const) {
  for (let i = 1; i <= SCHED_ROW_1604EV2018[s]; i++) {
    label[`${P}txtSched${s}RemDate${i}`] = `Schedule ${s} row ${i} — date of remittance (MM/DD/YYYY)`;
    label[`${P}txtSched${s}BankCode${i}`] = `Schedule ${s} row ${i} — drawee bank / bank code / agency`;
    label[`${P}txtSched${s}TRANo${i}`] = `Schedule ${s} row ${i} — TRA / eROR / eAR number`;
    label[`${P}txtSched${s}TaxWithheld${i}`] = `Schedule ${s} row ${i} — tax withheld`;
    label[`${P}txtSched${s}Penalties${i}`] = `Schedule ${s} row ${i} — penalties`;
    label[`${P}txtSched${s}TotRemAmt${i}`] = `Schedule ${s} row ${i} — total amount remitted`;
  }
}

const form: NativeForm = {
  schema: FORM_1604Ev2018,
  validate: validate1604Ev2018,
  label,
  periodName: (s) => `${s[`${P}txtYear`] ?? ""}`,
  prefill: {
    [`${P}txtTIN1`]: "tin1", [`${P}txtTIN2`]: "tin2", [`${P}txtTIN3`]: "tin3", [`${P}txtBranchCode`]: "tin4",
    [`${P}txtRDOCode`]: "rdo", [`${P}txtWthhldngAgntsNme`]: "fn", [`${P}txtLineBus`]: "lob", [`${P}txtAddress`]: "regAddr",
    [`${P}txtZipCode`]: "zip", [`${P}txtTelNum`]: "telNo",
  },
};
export default form;
