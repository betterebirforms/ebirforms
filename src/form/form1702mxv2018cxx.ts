// BIR Form 1702-MX, "v2018Cxx": a test fork of 1702MXv2018C that BIR ships but never lists in its menu. Its
// reachable compute functions, onchange / onblur wiring and save keys are identical to v2018C's (diffed function by
// function and element by element), so it is the same model. BIR's own Cxx form names its savefiles
// "-1702MXv2018C-" (createXMLFileName), not "-1702MXv2018Cxx-".
import template from "./template/1702MXv2018Cxx.json";
import { make1702MX2018, validate1702MX } from "./form1702mxv2018c.ts";
import type { FormState, GroupState, Problem } from "./schema.ts";

export const FORM_1702MXv2018Cxx = make1702MX2018("1702MXv2018Cxx", "2018Cxx", template as Array<[string, string, string?]>);
export const validate1702MXv2018Cxx = (state: FormState, groups: GroupState = {}): Problem[] => validate1702MX(FORM_1702MXv2018Cxx, state, groups);
