// BIR Form 2550DS-old — an earlier revision of the VAT Return on Digital Services. Identical prefix, fields,
// and compute graph to 2550DS, so it reuses makeDS / validateDS. (The legacy save even names it "-2550DS-".)
import fieldJson from "./fields/2550DS-old.json";
import { makeDS, validateDS } from "./form2550ds.ts";
import { type FieldJson, type FormState, type Problem } from "./schema.ts";

export const FORM_2550DS_OLD = makeDS("2550DS-old", fieldJson as FieldJson[]);
export const validate2550DSOld = (state: FormState): Problem[] => validateDS(FORM_2550DS_OLD, state);
