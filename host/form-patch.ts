// Serve-time changes to BIR's pages. The changes themselves are mods: one JSON file each under mod/, read by
// this host (host/mod.ts) and the packaged app (src-tauri/src/bir_mod.rs). BIR's files on disk are never edited.
// The named exports below run a single mod's rules and exist for tests and older call sites.
import { applyMod, guardReentry, modList, modMatches, runMod, type Mod } from "./mod.ts";

export { guardReentry };

/** Apply every switched-on mod to a page (.hta). `user_dir` is the user's mod folder (own mods + on/off switches). */
export function patchForm(rel_path: string, html: string, user_dir?: string): string {
  return applyMod(modList(user_dir), rel_path, html);
}

/** Apply every switched-on mod to one of BIR's shared scripts. `version` is the installed package version. */
export function patchScript(rel_path: string, text: string, version = "", user_dir?: string): string {
  return applyMod(modList(user_dir), rel_path, text, version);
}

function builtIn(id: string): Mod {
  const m = modList().find((x) => x.id === id);
  if (!m) throw new Error(`built-in mod ${id} is missing from mod/`);
  return m;
}

/** One mod's rules, keeping its `if` condition but not its file scope. */
const one = (id: string) => (text: string) => {
  const m = builtIn(id);
  return m.if !== undefined && !text.includes(m.if) ? text : runMod(m, text);
};

export const fixAlwaysTrueExclusion = one("fix/name-with-bracket");
export const fixFinalCopyTrailer = one("fix/final-copy-trailer");
export const fixSilentAmountZeroing = one("fix/amount-over-12-digit");
export const fixThisIdSelector = one("fix/print-button-hide");
export const fixOnloadClobber = one("fix/onload-clobber");
export const fixSavedReturnSort = one("fix/saved-return-sort");
export const guardAllCompute = one("fix/compute-loop");
export const fixTctFilenameInjection = one("security/tct-file-name");
export const fixSlowReferenceParse = one("speed/reference-parse");
export const fixIeChildNodeCount = one("compat/child-node-count");
export const fixUpperCaseInnerHtmlMatch = one("compat/upper-case-div");
export const fixIeTdValueExpando = one("compat/td-value");
export const fixIeLoadDataDiv = one("compat/load-data-div");
export const fixIeEmptyTableBody = one("compat/empty-table-body");
export const fixIeLiveInnerHtmlCopy = one("compat/live-inner-html");
export const fixEmptyIdSelector = one("compat/empty-id-selector");
export const fixMalformedIdSelector = one("compat/malformed-id-selector");
export const fixRestoreAfterPrint = one("compat/print-sheet");

export const fixStaleVersion = (text: string, version: string) => runMod(builtIn("fix/stale-version"), text, version);

const dead = () => builtIn("remove/dead-script");
export const isDeadScript = (rel_path: string) => modMatches(dead(), rel_path, "");

/**
 * Not a mod (yet): BIR ships jQuery 1.7.1/1.11.0 and jQuery UI 1.8.18, all open to CVE-2020-11022/11023. These
 * requests get the vendored patched versions instead (3.7.1 / 1.13.3; all 84 forms run on them). The compat mods
 * empty-id-selector and malformed-id-selector exist because of this swap.
 */
export const PATCHED_JQUERY: Record<string, string> = {
  jquery: "host/asset/jquery-3.7.1.min.js",
  "jquery-ui": "host/asset/jquery-ui-1.13.3.min.js",
};
export function patchedJqueryFor(rel_path: string): string | null {
  if (/\/jquery-ui[^/]*\.js$/i.test(rel_path)) return PATCHED_JQUERY["jquery-ui"]!;
  if (/\/jquery-\d[^/]*\.js$/i.test(rel_path)) return PATCHED_JQUERY["jquery"]!;
  return null;
}
