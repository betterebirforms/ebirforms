import type { NativeForm } from "../registry.ts";
import { FORM_1702RTv2018, validate1702RTv2018 } from "../form1702rtv2018.ts";
import { label1702RT2018, periodName1702RT, prefill1702RT2018 } from "../form1702rt-label.ts";

const P = "frm1702RT:";
const form: NativeForm = {
  schema: FORM_1702RTv2018,
  validate: (state) => validate1702RTv2018(state),
  label: { ...label1702RT2018, [`${P}txtPg2Pt4I41IncomeTaxDue`]: "41 — Regular income tax (30%)", [`${P}txtPg2Pt4I42MinimumCorporate`]: "42 — MCIT (2% of 33)" },
  periodName: periodName1702RT,
  prefill: prefill1702RT2018,
};
export default form;
