import type { NativeForm } from "../registry.ts";
import { FORM_1702RTv2018C, P, validate1702RTv2018C } from "../form1702rtv2018c.ts";
import { label1702RT2018, periodName1702RT, prefill1702RT2018 } from "../form1702rt-label.ts";

const form: NativeForm = {
  schema: FORM_1702RTv2018C,
  validate: (state) => validate1702RTv2018C(state),
  label: { ...label1702RT2018, [`${P}Pg2Pt4I40IncomeTaxRate`]: "40 — Income tax rate (%)", [`${P}txtPg2Pt4I42MinimumCorporate`]: "42 — MCIT (2% of gross income)" },
  periodName: periodName1702RT,
  prefill: prefill1702RT2018,
};
export default form;
