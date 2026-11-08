import type { NativeForm } from "../registry.ts";
import { FORM_1702MXv2018C, validate1702MXv2018C } from "../form1702mxv2018c.ts";
import { label1702MX, periodName1702MX, prefill1702MX } from "../form1702mx-label.ts";

const form: NativeForm = {
  schema: FORM_1702MXv2018C,
  validate: (state, groups) => validate1702MXv2018C(state, groups),
  label: label1702MX,
  periodName: periodName1702MX,
  prefill: prefill1702MX,
};
export default form;
