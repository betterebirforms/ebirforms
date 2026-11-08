import type { NativeForm } from "../registry.ts";
import { FORM_1702MXv2018, validate1702MXv2018 } from "../form1702mxv2018.ts";
import { label1702MX, periodName1702MX, prefill1702MX } from "../form1702mx-label.ts";

const form: NativeForm = {
  schema: FORM_1702MXv2018,
  validate: (state, groups) => validate1702MXv2018(state, groups),
  label: { ...label1702MX, "frm1702MX:txtPg2Sc2It18C": "Sch 2.18 — MCIT (2% of 7C, computed)" },
  periodName: periodName1702MX,
  prefill: prefill1702MX,
};
export default form;
