import type { NativeForm } from "../registry.ts";
import { entryShape1707 } from "../form1707v2018.ts";
import { FORM_1707V2021, validate1707v2021 } from "../form1707v2021.ts";

const shape = entryShape1707("2021");
export default { schema: FORM_1707V2021, validate: validate1707v2021, label: shape.label, periodName: shape.periodName, prefill: shape.prefill } satisfies NativeForm;
