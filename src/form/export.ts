// The exporters: one adapter per output format, over every native form. Each adapter turns a form's state into a
// named file. Two formats exist:
//   savefile — eBIRForms' own XML (cp1252), the file BIR's pages open, amend, finalise and submit. Its records are
//              the 1:1 ones (formRecords) and its name is the one BIR's createXMLFileName gives (test/export-name).
//   tsp      — BIR's per-form "XML BIR Form" for certified Tax Software Providers (RMO 8-2019). BIR publishes its
//              structure only to an enrolled TSP (the per-form Data Layout Guide), and a certified file carries the
//              certification code BIR's Test Forms issues. Until a layout is registered in TSP_LAYOUT the adapter
//              refuses; it never guesses a structure BIR hasn't published.
import { NATIVE_FORM } from "./registry.ts";
import { computeForm, formRecords, type FormSchema, type FormState, type GroupState } from "./schema.ts";
import { encodeCp1252 } from "@/lib/cp1252.ts";
import { serializeSavefile, type Profile, type SaveRecord } from "@/lib/savefile.ts";

export interface ExportInput {
  form_code: string;
  state: FormState;
  groups?: GroupState;
  /** The active taxpayer profile; its TIN wins over the TIN typed on the form. */
  profile?: Partial<Profile>;
  is_final_copy?: boolean;
  /** The clock for forms whose name carries the time of saving (0605, 2000, 2200*). */
  now?: Date;
}
export interface ExportFile {
  name: string;
  text: string;
  byte: Uint8Array;
}
export interface ExportAdapter {
  id: "savefile" | "tsp";
  label: string;
  isAvailable: (form_code: string) => boolean;
  build: (input: ExportInput) => ExportFile;
}
export class ExportUnavailable extends Error {}

const two = (n: number) => String(n).padStart(2, "0");
/** BIR's getHHMMSS: local hours, minutes, seconds. */
export const hhmmss = (now: Date) => `${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;

/** The values a save writes, by key: what BIR's page shows after loading it, so what its createXMLFileName reads.
 *  A period field the user left blank keeps BIR's own default here (the template's month/year), as on BIR's page. */
const savedValue = (schema: FormSchema, state: FormState, groups: GroupState): FormState => {
  const out: FormState = {};
  for (const r of formRecords(schema, state, groups)) if (!(r.key in out)) out[r.key] = r.value;
  return { ...computeForm(schema, state, groups), ...out };
};

/** The savefile name BIR's createXMLFileName gives: <TIN><branch>-<form>-<period>.xml. The period is read from the
 *  computed form, as BIR reads the shown fields (2200S/T derive their date from the prepayment). */
export function savefileName({ form_code, state, groups = {}, profile = {}, now = new Date() }: ExportInput): string {
  const def = NATIVE_FORM[form_code];
  if (!def) throw new ExportUnavailable(`${form_code} isn't a native form`);
  const tin = (key: "tin1" | "tin2" | "tin3" | "tin4") =>
    profile[key] || (Object.entries(def.prefill).find(([, k]) => k === key)?.[0] ?? "").replace(/.+/, (id) => state[id] ?? "");
  return `${tin("tin1")}${tin("tin2")}${tin("tin3")}${tin("tin4")}-${def.name_code ?? form_code}-${def.periodName(savedValue(def.schema, state, groups), hhmmss(now))}.xml`;
}

/** The eBIRForms savefile: the 1:1 records under BIR's own name. */
export const SAVEFILE_ADAPTER: ExportAdapter = {
  id: "savefile",
  label: "eBIRForms savefile (.xml)",
  isAvailable: (form_code) => form_code in NATIVE_FORM,
  build: (input) => {
    const def = NATIVE_FORM[input.form_code];
    if (!def) throw new ExportUnavailable(`${input.form_code} isn't a native form`);
    const text = serializeSavefile({ record: formRecords(def.schema, input.state, input.groups ?? {}), trailer_year: 2012, is_final_copy: input.is_final_copy ?? false });
    return { name: savefileName(input), text, byte: encodeCp1252(text) };
  },
};

/** One form's TSP structure, transcribed from BIR's Data Layout Guide for that form. It builds from the savefile
 *  records (the proven 1:1 values), so a layout only maps and orders them. */
export interface TspLayout {
  form_code: string;
  /** The Data Layout Guide's own version or date, as BIR prints it. */
  layout_version: string;
  build: (record: SaveRecord[], certification_code: string) => { name: string; text: string };
}
/** Registered layouts. Empty: BIR gives the Data Layout Guides only to an enrolled TSP (docs/bir-accreditation.md). */
export const TSP_LAYOUT: Record<string, TspLayout> = {};

export const TSP_ADAPTER: ExportAdapter = {
  id: "tsp",
  label: "BIR TSP XML (certified)",
  isAvailable: (form_code) => form_code in TSP_LAYOUT,
  build: (input) => {
    const layout = TSP_LAYOUT[input.form_code];
    const def = NATIVE_FORM[input.form_code];
    if (!layout || !def) throw new ExportUnavailable(`no TSP data layout for ${input.form_code}: BIR issues it to an enrolled TSP (eTSPCert, RMO 8-2019)`);
    const code = tspCertification(input.form_code);
    if (!code) throw new ExportUnavailable(`no TSP certification code for ${input.form_code}: BIR's Test Forms issues one per form`);
    const { name, text } = layout.build(formRecords(def.schema, input.state, input.groups ?? {}), code);
    return { name, text, byte: new TextEncoder().encode(text) };
  },
};

/** The certification code BIR issued for a form (one per form per TSP). None until certified. */
export const TSP_CERTIFICATION: Record<string, string> = {};
export const tspCertification = (form_code: string): string | undefined => TSP_CERTIFICATION[form_code];

export const EXPORT_ADAPTER: Record<ExportAdapter["id"], ExportAdapter> = { savefile: SAVEFILE_ADAPTER, tsp: TSP_ADAPTER };
