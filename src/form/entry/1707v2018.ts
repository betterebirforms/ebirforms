import type { NativeForm } from "../registry.ts";
import { entryShape1707, FORM_1707V2018, validate1707v2018 } from "../form1707v2018.ts";

const shape = entryShape1707("2018");
export default { schema: FORM_1707V2018, validate: validate1707v2018, label: shape.label, periodName: shape.periodName, prefill: shape.prefill } satisfies NativeForm;
