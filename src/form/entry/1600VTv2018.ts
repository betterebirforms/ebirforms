import type { NativeForm } from "../registry.ts";
import { entryShape, FORM_1600VTV2018, validate1600VTv2018 } from "../form1600vtv2018.ts";

const shape = entryShape("frm1600VT:");
export default { schema: FORM_1600VTV2018, validate: validate1600VTv2018, label: shape.label, periodName: shape.periodName, prefill: shape.prefill } satisfies NativeForm;
