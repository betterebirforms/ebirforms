// BIR Form 1600-PT (Monthly Remittance Return of Other Percentage Taxes Withheld, v2018), P3. Its script is 1600-VT's
// byte-for-byte apart from the prefix, so it is built by the same `make1600T` (see form1600vtv2018.ts for the
// Part II / page-1 chain / Schedule 1 / reload notes). Its ATC list repeats WB080, WB082 and WB084 at 3% and 1%, so
// the AtcCode<i> boxes are matched on (code, rate). Private agents get only those six PG entries; government agents
// get all 31.

import fieldJson from "./fields/1600PTv2018.json";
import template from "./template/1600PTv2018.json";
import { make1600T, type CategoryTag } from "./form1600vtv2018.ts";
import type { FieldJson, FormState, GroupState, Problem } from "./schema.ts";

// atcCodes.xml order for 1600PTv2018: WB030…WB070 (G ×4), WB080…WB084 at 3%/1% (PG ×6), WB090…WB110 (G ×21)
export const ORDER_1600PT: CategoryTag[] = [...Array<CategoryTag>(4).fill("G"), ...Array<CategoryTag>(6).fill("PG"), ...Array<CategoryTag>(21).fill("G")];
export const F1600PT = make1600T("1600PTv2018", "Monthly Remittance of Other Percentage Taxes Withheld", "frm1600PT:", fieldJson as FieldJson[], template as Array<[string, string, string?]>, ORDER_1600PT);
export const FORM_1600PTV2018 = F1600PT.schema;
export const validate1600PTv2018 = (state: FormState, groups: GroupState = {}): Problem[] => F1600PT.validate(state, groups);
