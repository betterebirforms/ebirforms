import type { NativeForm } from "../registry.ts";
import { FORM_1702EXv2018C, validate1702EXv2018C } from "../form1702exv2018c.ts";
import { label1702EX2018, periodName1702EX, prefill1702EX2018 } from "../form1702ex-label.ts";

const form: NativeForm = {
  schema: FORM_1702EXv2018C,
  validate: (state, groups) => validate1702EXv2018C(state, groups),
  label: label1702EX2018,
  periodName: periodName1702EX,
  prefill: prefill1702EX2018,
};
export default form;
