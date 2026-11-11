// The agent API: what an AI agent (Claude, Codex, any MCP client) may do with eBIRForms, as plain functions.
// mcp/main.ts serves these over the Model Context Protocol (stdio); tests call them directly (test/mcp.test.ts).
//
// It works on the rebuilt forms (src/form/, 1:1 with BIR's computations) and on the desktop app's own folders, so a
// return an agent saves opens in BIR's main screen like any other. What it will never do: make a final copy, submit
// to BIR, or touch anything outside the app's `profile/` and `savefile/` folders.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { NATIVE_FORM } from "@/form/registry.ts";
import { computeForm, reopenSavefile, type FormState, type GroupState } from "@/form/schema.ts";
import { SAVEFILE_ADAPTER, savefileName } from "@/form/export.ts";
import { parseSavefile, profileFromSavefile, readSavefile, type Profile } from "@/lib/savefile.ts";

/** The desktop app's data folder (Tauri's app data dir for ph.advo.ebirforms, then `data/`). */
export function defaultDataDir(): string {
  if (process.env.EBF_DATA_DIR) return process.env.EBF_DATA_DIR;
  const id = "ph.advo.ebirforms";
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", id, "data");
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), id, "data");
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), id, "data");
}

export class ToolError extends Error {}

/** A file name the agent passes: one file, in the folder, nothing else. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.xml$/;
function safeName(name: unknown): string {
  if (typeof name !== "string" || !SAFE_NAME.test(name) || name.includes("..")) throw new ToolError(`not a plain .xml file name: ${String(name)}`);
  return name;
}

function form(code: unknown) {
  const def = typeof code === "string" ? NATIVE_FORM[code] : undefined;
  if (!def) throw new ToolError(`unknown form ${String(code)}; call list_form for the codes`);
  return def;
}

const listXml = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((n) => SAFE_NAME.test(n)).sort() : []);

function readProfile(data: string, tin: string | undefined): Partial<Profile> {
  if (!tin) return {};
  const name = safeName(`${tin.replace(/\D/g, "")}.xml`);
  const path = join(data, "profile", name);
  if (!existsSync(path)) throw new ToolError(`no profile ${name}; call list_profile`);
  return profileFromSavefile(readSavefile(readFileSync(path)));
}

/** The form with the profile prefilled where the agent gave no value (BIR's forms prefill the same fields). */
function withProfile(code: string, value: FormState, profile: Partial<Profile>): FormState {
  const def = form(code);
  const out: FormState = {};
  for (const [id, key] of Object.entries(def.prefill)) {
    const v = profile[key];
    if (typeof v === "string" && v) out[id] = v;
  }
  return { ...out, ...value };
}

function checkInput(code: string, value: unknown, group: unknown): { state: FormState; groups: GroupState; unknown: string[] } {
  const def = form(code);
  const state: FormState = {};
  const unknown: string[] = [];
  const known = new Set(def.schema.field.map((f) => f.id));
  for (const [k, v] of Object.entries((value ?? {}) as Record<string, unknown>)) {
    if (!known.has(k)) unknown.push(k);
    else state[k] = String(v);
  }
  const groups: GroupState = {};
  const names = new Set((def.schema.group ?? []).map((g) => g.name));
  for (const [k, rows] of Object.entries((group ?? {}) as Record<string, unknown>)) {
    if (!names.has(k) || !Array.isArray(rows)) unknown.push(`group:${k}`);
    else groups[k] = rows.map((r) => Object.fromEntries(Object.entries(r as Record<string, unknown>).map(([a, b]) => [a, String(b)])));
  }
  return { state, groups, unknown };
}

// ── the tools ──

export function list_form() {
  return Object.entries(NATIVE_FORM).map(([code, def]) => ({ form_code: code, title: def.schema.title, field_count: def.schema.field.length, has_schedule: Boolean(def.schema.group?.length) }));
}

export function describe_form(arg: { form_code: string }) {
  const def = form(arg.form_code);
  return {
    form_code: arg.form_code,
    title: def.schema.title,
    note: "Values are strings, as BIR's forms store them. Money is like 1234.50. Computed fields are filled for you; don't send them.",
    field: def.schema.field
      .filter((f) => !f.secret)
      .map((f) => ({
        id: f.id,
        label: def.label[f.id] ?? f.id.replace(/^[^:]+:/, "").replace(/^(txt|opt|chk|sel|cmb|rdo|item)/, ""),
        kind: f.kind,
        ...(f.required ? { required: true } : {}),
        ...(f.compute && !f.is_editable ? { computed: true } : {}),
        ...(f.gate ? { conditional: true } : {}),
        ...(Object.prototype.hasOwnProperty.call(def.prefill, f.id) ? { from_profile: def.prefill[f.id] } : {}),
      })),
    group: (def.schema.group ?? []).map((g) => ({ name: g.name, first_index: g.first_index, row: g.row.map((r) => ({ stem: r.id, kind: r.kind, ...(r.row_compute ? { computed: true } : {}) })) })),
  };
}

/** Compute a return without saving it: every computed amount, BIR's validation problems, and the file name. */
export function fill_form(arg: { form_code: string; value?: Record<string, unknown>; group?: Record<string, unknown>; tin?: string }, data = defaultDataDir()) {
  const def = form(arg.form_code);
  const { state, groups, unknown } = checkInput(arg.form_code, arg.value, arg.group);
  const profile = readProfile(data, arg.tin);
  const input = withProfile(arg.form_code, state, profile);
  const computed = computeForm(def.schema, input, groups);
  const problem = def.validate(computed, groups).map((p) => ({ id: p.id, message: p.message }));
  return {
    form_code: arg.form_code,
    computed: Object.fromEntries(Object.entries(computed).filter(([, v]) => v !== "" && v !== undefined)),
    problem,
    unknown_field: unknown,
    savefile_name: savefileName({ form_code: arg.form_code, state: input, groups, profile }),
  };
}

/** Save a return as a DRAFT in the desktop app's savefile folder (never a final copy). Refuses to overwrite unless asked. */
export function save_return(
  arg: { form_code: string; value?: Record<string, unknown>; group?: Record<string, unknown>; tin?: string; overwrite?: boolean },
  data = defaultDataDir(),
) {
  const filled = fill_form(arg, data);
  if (filled.unknown_field.length) throw new ToolError(`unknown field(s): ${filled.unknown_field.join(", ")}; call describe_form`);
  const { state, groups } = checkInput(arg.form_code, arg.value, arg.group);
  const profile = readProfile(data, arg.tin);
  const file = SAVEFILE_ADAPTER.build({ form_code: arg.form_code, state: withProfile(arg.form_code, state, profile), groups, profile, is_final_copy: false });
  if (!/^\d{9}/.test(file.name)) throw new ToolError("the return has no TIN: pass `tin` (a saved profile) or fill the form's TIN fields");
  const dir = join(data, "savefile");
  const path = join(dir, safeName(file.name));
  if (existsSync(path)) {
    // a final copy: BIR's trailer mark, its final flag, or not plain XML at all (BIR encrypts some final copies)
    const old = readFileSync(path, "latin1");
    const is_final = !old.startsWith("<?xml") || parseSavefile(old).is_final_copy || /txtFinalFlag=[123]txtFinalFlag=/.test(old);
    if (is_final) throw new ToolError(`${file.name} is a final copy; it can't be changed`);
    if (!arg.overwrite) throw new ToolError(`${file.name} exists; pass overwrite: true to replace the draft`);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, file.byte);
  return { saved: file.name, folder: dir, problem: filled.problem, note: "Saved as a draft. Open it in eBIRForms to review, then make the final copy and file it yourself." };
}

export function list_return(_arg: object = {}, data = defaultDataDir()) {
  return listXml(join(data, "savefile"));
}

/** A saved return's values, reopened the way the app reopens it. */
export function read_return(arg: { name: string }, data = defaultDataDir()) {
  const name = safeName(arg.name);
  const path = join(data, "savefile", name);
  if (!existsSync(path)) throw new ToolError(`no saved return ${name}; call list_return`);
  const file = readSavefile(readFileSync(path));
  const code = Object.keys(NATIVE_FORM)
    .filter((c) => name.slice(name.indexOf("-") + 1).startsWith(`${NATIVE_FORM[c]!.name_code ?? c}-`))
    .sort((a, b) => b.length - a.length)[0];
  if (!code) return { name, form_code: null, is_final_copy: file.is_final_copy, note: "not a form the rebuild knows" };
  const { state, groups } = reopenSavefile(NATIVE_FORM[code]!.schema, file, code);
  return { name, form_code: code, is_final_copy: file.is_final_copy, value: state, group: groups };
}

export function list_profile(_arg: object = {}, data = defaultDataDir()) {
  return listXml(join(data, "profile")).map((n) => {
    const p = profileFromSavefile(readSavefile(readFileSync(join(data, "profile", n))));
    return { tin: n.replace(/\.xml$/, ""), name: p.fn, rdo: p.rdo };
  });
}

/** Tool descriptions and input schemas, as MCP lists them. */
export const TOOL = [
  { name: "list_form", fn: list_form, description: "List the BIR forms eBIRForms can fill (form code, title).", input: {} },
  {
    name: "describe_form",
    fn: describe_form,
    description: "The fields of one BIR form: id, label, kind, required, computed, and schedule rows. Call before fill_form.",
    input: { form_code: { type: "string", description: "e.g. 1701Qv2018, 0605, 2551Q" } },
    required: ["form_code"],
  },
  {
    name: "fill_form",
    fn: fill_form,
    description:
      "Compute a return without saving: BIR's own computations (1:1 with the official forms), its validation problems, and the file name it would save under.",
    input: {
      form_code: { type: "string" },
      value: { type: "object", description: "field id → value (strings). Leave computed fields out." },
      group: { type: "object", description: "schedule name → list of rows (stem → value)" },
      tin: { type: "string", description: "A saved taxpayer profile's TIN (list_profile); prefills name, TIN, RDO, address" },
    },
    required: ["form_code"],
  },
  {
    name: "save_return",
    fn: save_return,
    description:
      "Save the return as a DRAFT in the eBIRForms app, where it opens from BIR's main screen. Never a final copy, never submitted. Refuses to overwrite a draft unless overwrite is true, and never touches a final copy.",
    input: { form_code: { type: "string" }, value: { type: "object" }, group: { type: "object" }, tin: { type: "string" }, overwrite: { type: "boolean" } },
    required: ["form_code"],
  },
  { name: "list_return", fn: list_return, description: "List the returns saved in the eBIRForms app.", input: {} },
  { name: "read_return", fn: read_return, description: "Read a saved return's values.", input: { name: { type: "string", description: "a file name from list_return" } }, required: ["name"] },
  { name: "list_profile", fn: list_profile, description: "List the taxpayer profiles saved in the eBIRForms app (TIN, name, RDO).", input: {} },
] as const;
