// BIR Form 1702Qv2008C — an earlier revision of the quarterly corporate income tax return. Identical prefix
// (frm1702q:), fields, and compute graph to 1702Q, so it reuses makeQ / validateQ.
import fieldJson from "./fields/1702Qv2008C.json";
import { makeQ, validateQ } from "./form1702q.ts";
import { type FieldJson, type FormState, type Problem } from "./schema.ts";

export const FORM_1702Qv2008C = makeQ("1702Qv2008C", fieldJson as FieldJson[], true);
export const validate1702Qv2008C = (state: FormState): Problem[] => validateQ(FORM_1702Qv2008C, state);
