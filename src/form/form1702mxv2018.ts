// BIR Form 1702-MX, the 2018 (TRAIN) edition, superseded by 1702MXv2018C. Same 588 save keys as the current edition;
// the model is form1702mxv2018c.ts's with the v2018 hooks (`edition === "2018"`): 15C and the MCIT (18C = 2% of 7C)
// recomputed by BIR itself, the special-rate tax 15B picked by rate (10% → 13B, 5% → 7B, 2% or 3B ≥ 7B → 1B, else 7B),
// Sch 4 items 1–2 derived from 13A/13B and 9A–C × 14C, 33D re-summed from 33A–C, 10C restored under OSD, 9C / 9D
// zeroed under OSD, Sch 8 cleared when 7B is not a loss, and 14C's onchange throwing (computePg2Sc2It14C is undefined).
import template from "./template/1702MXv2018.json";
import { make1702MX2018, validate1702MX } from "./form1702mxv2018c.ts";
import type { FormState, GroupState, Problem } from "./schema.ts";

export const FORM_1702MXv2018 = make1702MX2018("1702MXv2018", "2018", template as Array<[string, string, string?]>);
export const validate1702MXv2018 = (state: FormState, groups: GroupState = {}): Problem[] => validate1702MX(FORM_1702MXv2018, state, groups);
