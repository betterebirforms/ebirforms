import type { NativeForm } from "../registry.ts";
import { entryShape } from "../form1600vtv2018.ts";
import { FORM_1600PTV2018, validate1600PTv2018 } from "../form1600ptv2018.ts";

const shape = entryShape("frm1600PT:");
export default { schema: FORM_1600PTV2018, validate: validate1600PTv2018, label: shape.label, periodName: shape.periodName, prefill: shape.prefill } satisfies NativeForm;
