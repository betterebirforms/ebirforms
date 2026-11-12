// BIR Form 1702-EX, 2018 layout, superseded edition (1702EXv2018). Same 187 save keys and DOM order as the current
// 1702EXv2018C, so it is the shared builder with edition "2018" (see form1702exv2018c.ts): item 40 is disabled and
// refilled from taxRate.xml ("0") on every load, so 41 = 39 × 0 = 0; Part V is computed — 52 = 39 × r and
// 53 = 36 × r, with r = 30% when `YearEnd.value <= 20` (2018–2020, or an empty year) and item 40 ("0") after.
import frozen from "./template/1702EXv2018.json";
import { liveTemplate } from "./clock.ts";

const template = liveTemplate("1702EXv2018", frozen as Array<[string, string, string?]>);
import { make1702EX2018, validate1702EX2018 } from "./form1702exv2018c.ts";
import type { FormState, GroupState, Problem } from "./schema.ts";

export const FORM_1702EXv2018 = make1702EX2018("1702EXv2018", "2018", template as Array<[string, string, string?]>);

export const validate1702EXv2018 = (state: FormState, groups: GroupState = {}): Problem[] => validate1702EX2018(FORM_1702EXv2018, "2018", state, groups);
