import type { NativeForm } from "../registry.ts";
import { FORM_1702EXv2018, validate1702EXv2018 } from "../form1702exv2018.ts";
import { label1702EX2018, periodName1702EX, prefill1702EX2018 } from "../form1702ex-label.ts";

const P = "frm1702EX:";
const form: NativeForm = {
  schema: FORM_1702EXv2018,
  validate: (state, groups) => validate1702EXv2018(state, groups),
  label: {
    ...label1702EX2018,
    [`${P}txtPg2Pt5I52RegularIncomeOtherwiseDue`]: "52 — Regular income tax otherwise due (39 × 30% through 2020)",
    [`${P}txtPg2Pt5I53SpecialAllowableItemizedDeduc`]: "53 — Special allowable itemized deductions (36 × 30% through 2020)",
  },
  periodName: periodName1702EX,
  prefill: prefill1702EX2018,
};
export default form;
