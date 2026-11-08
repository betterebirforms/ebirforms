// BIR Form 1707 v2021 (Capital Gains Tax Return — shares not traded through the LSE, April 2021 ENCS), P3.
// Same script as v2018 bar the rate field, the 2-decimal rounding and the shares formatting — see the shared builder
// `make1707T` in form1707v2018.ts for the structure, the chain and BIR's bugs.

import { make1707T } from "./form1707v2018.ts";
import type { FieldJson, FormState, GroupState, Problem } from "./schema.ts";
import fieldJson from "./fields/1707v2021.json";
import template from "./template/1707v2021.json";

export const F1707V2021 = make1707T("1707v2021", "2021", fieldJson as FieldJson[], template as Array<[string, string, string?]>);
export const FORM_1707V2021 = F1707V2021.schema;
export const validate1707v2021 = (state: FormState, groups: GroupState = {}): Problem[] => F1707V2021.validate(state, groups);
