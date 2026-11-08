// BIR Form 1702-RT, 2018 layout, superseded edition (1702RTv2018). Same 258 save keys and DOM order as the current
// 1702RTv2018C, so it is the shared builder with edition "2018" (see form1702rtv2018c.ts): a fixed 30% rate (item 40
// is "30%", not editable), 41 = 39 × 30%, 42 = 33 × 2% while IC055 is ticked, 57 = 35 × 30%, and Sch IV C8 clamped at 0.
import template from "./template/1702RTv2018.json";
import { make1702RT2018, validate1702RT } from "./form1702rtv2018c.ts";
import type { FormState, GroupState, Problem } from "./schema.ts";

export const FORM_1702RTv2018 = make1702RT2018("1702RTv2018", "2018", template as Array<[string, string, string?]>);

export const validate1702RTv2018 = (state: FormState, groups: GroupState = {}): Problem[] => validate1702RT(FORM_1702RTv2018, "2018", state, groups);
