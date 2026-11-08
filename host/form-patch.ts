// Serve-time fixes for bugs in BIR's own form code. Applied to the page text as it is served —
// the recovered original on disk is never modified. Each entry names the bug and how it was found.

/** Rename `function NAME(` to `NAME__body` and declare a re-entry-guarded NAME in the same scope. */
export function guardReentry(html: string, name: string): string {
  const decl = new RegExp(String.raw`function\s+${name}\s*\(\s*\)\s*\{`);
  const m = decl.exec(html);
  if (!m) return html;
  const guard =
    `function ${name}() { if (${name}.__busy) return; ${name}.__busy = true; ` +
    `try { return ${name}__body.apply(this, arguments); } finally { ${name}.__busy = false; } }\n` +
    `function ${name}__body() {`;
  return html.slice(0, m.index) + guard + html.slice(m.index + m[0].length);
}

/** Guard every zero-argument `function compute*()`: only a real cycle has a function on the stack twice. */
export function guardAllCompute(html: string): string {
  const name = new Set([...html.matchAll(/function\s+(compute\w*)\s*\(\s*\)\s*\{/g)].map((m) => m[1]!));
  let out = html;
  for (const n of name) out = guardReentry(out, n);
  return out;
}

/**
 * `id !== A || id !== B` is always true. BIR meant "every field except the names/addresses", so names like
 * "ABC (PHILS.) INC." were saved as "ABC -PHILS. INC." (NumWithParenthesis). A bug wherever it appears.
 */
export function fixAlwaysTrueExclusion(html: string): string {
  return html.replace(/(elem\[i\]\.id\s*!==?\s*'[^']+'\s*)\|\|(?=\s*elem\[i\]\.id\s*!==?\s*')/g, "$1&&");
}

/** A form writing the 2014 trailer must also recognise its own final copies (1701A checked for 2012). */
export function fixFinalCopyTrailer(html: string): string {
  if (!html.includes("All Rights Reserved BIR 2014.</span>")) return html;
  return html.replaceAll('"All Rights Reserved BIR 2012.0"', '"All Rights Reserved BIR 2014.0"');
}

/**
 * 1606/1706 build the savefile name from the TCT field, stripping only "-" (`_` + value). A TCT with
 * "/" or ".." steered the write path (WL security 5). The host sandbox already refuses traversal, but we
 * also sanitize at the source: in filename context, keep only alphanumerics.
 */
export function fixTctFilenameInjection(html: string): string {
  return html.replace(
    /("_" ?\+ ?(?:d|document)\.getElementById\(['"]frm(?:1606|1706):txtTCT['"]\)\.value)(\.replace\(\/-\/g, ?['"]['"]\))?/g,
    "$1.replace(/[^A-Za-z0-9]/g, '')",
  );
}

/**
 * js/string-util.js `round()` silently sets an amount to "0.00" when it exceeds 12 integer digits (WL bug 12) —
 * even though its own code already truncates to 12 digits for the within-precision path. `isAmountWithinAllowedPrecision`
 * (used only by round) returns false for >12 digits, routing to the zero. Make it always accept, so round
 * truncates to 12 digits (BIR's evident intent) rather than zeroing. Only affects the >₱1-trillion case a real
 * return never produces; still, losing the whole figure to 0 is strictly worse than capping it.
 */
export function fixSilentAmountZeroing(text: string): string {
  return text.replace(/(length > 12\)\s*\{\s*)return false;/g, "$1return true;");
}

/** 0605's print view does `$(this.id).addClass(...)` — an invalid selector, so print-only buttons were never
 *  hidden (WL bug 21). `this.id` is a string; it must be `$(this)`. */
export function fixThisIdSelector(html: string): string {
  return html.replace(/\$\(this\.id\)/g, "$(this)");
}

/** tax-rate-helper.js does `window.onload = updateFromXML`, clobbering any other load handler (WL bug 17).
 *  Add a listener instead so it composes with the form's own bootstrap. */
export function fixOnloadClobber(text: string): string {
  return text.replace(/window\.onload\s*=\s*(\w+)\s*;/g, 'window.addEventListener("load", $1);');
}

/**
 * BIR ships jQuery 1.7.1/1.11.0 and jQuery UI 1.8.18 — all vulnerable to CVE-2020-11022/11023 (WL bug 7).
 * These requests are served the vendored patched versions instead: jQuery 3.7.1 and jQuery UI 1.13.3, which
 * the forms run on cleanly (verified: 84/84 load, the `.show('blind')` pickers work, 0605 e2e passes).
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

/** environment.js hardcodes a stale `currVer` (7.9.6.0 vs the real 7.9.6.2) — WL bug 18. Replace it with the
 *  version actually detected from the imported package, so it never goes stale again. */
export function fixStaleVersion(text: string, version: string): string {
  return version ? text.replace(/var\s+currVer\s*=\s*'[^']*';/, `var currVer = '${version}';`) : text;
}

/** Libraries BIR ships and loads on every form but never calls (WL bug 20) — verified: `Blowfish` appears only
 *  as its own definition, LZString has zero call sites. Served empty to cut dead weight and attack surface. */
const DEAD_SCRIPT = /\/(blowfish|lz-string-[\d.]+)\.js$/i;
export const isDeadScript = (rel_path: string) => DEAD_SCRIPT.test(rel_path);

/** Serve-time fixes for BIR's shared scripts, applied by relative path. `version` is the real package version. */
export function patchScript(rel_path: string, text: string, version = ""): string {
  if (isDeadScript(rel_path)) return `/* ${rel_path.split("/").pop()}: dead code (never called by any form), served empty */`;
  if (/js\/string-util(2014)?\.js$/i.test(rel_path)) return fixSilentAmountZeroing(text);
  if (/js\/tax-rate-helper\.js$/i.test(rel_path)) return fixOnloadClobber(text);
  if (/js\/environment\.js$/i.test(rel_path)) return fixStaleVersion(text, version);
  return text;
}

/**
 * BIR's reference loaders read `String(response.innerHTML).split('atc'+i+':')` once per record (WL bug 15) —
 * O(records × filesize), because `.innerHTML` re-serializes the whole hidden-div DOM each time. Route these
 * read-only reads through the shim's per-tick memoizer. 1601F drops from ~2.2 s to well under 2 s.
 */
export function fixSlowReferenceParse(html: string): string {
  return html.replace(/String\((\w+)\.innerHTML\)\.split\(/g, "String(window.__ebfInnerHTML($1)).split(");
}

/**
 * MSHTML compatibility, not a BIR bug. In IE7 mode `childNodes` skips whitespace-only text, so the 1702-RT modal
 * code identifies a table row's layout by `row.childNodes.length == 4 / 5` (its <td> count). WebKit counts the
 * whitespace too, no branch matches, and the Schedule II item 4 modal never rebuilds its rows on reload. Count the
 * element children, as IE did (the `<` loops that index into childNodes are left alone).
 */
export function fixIeChildNodeCount(html: string): string {
  return html.replace(/\b(checkrow|currentRow|row)\.childNodes\.length(\s*==\s*[45]\b)/g, "$1.children.length$2");
}

/**
 * IE serialized `innerHTML` with UPPER-case tag names; WebKit writes them lower-case. 1621 and 1801v2018 count a
 * schedule's saved rows with `response.innerHTML.match(/<DIV>key_[0-9]+/g)`, which in WebKit matches nothing, so
 * reopening a return rebuilt only the minimum rows (5 / 2) and silently dropped the rest (found by the 1801v2018
 * populated-schedule parity test). Make exactly those `<DIV>` match literals case-insensitive.
 */
export function fixUpperCaseInnerHtmlMatch(html: string): string {
  return html.replace(/(\.match\(\/<DIV>[^/\n]*\/)g\)/g, "$1gi)");
}

/**
 * Compatibility with the jQuery the host serves (3.7.1 for BIR's 1.7.1, PATCHED_JQUERY), not a BIR bug. jQuery 1.7
 * took `$("#" + id)` with an empty id as an id lookup that finds nothing (an empty set); jQuery 3 throws "Syntax
 * error, unrecognized expression: #". 1701v2018's hideCurrentPage does exactly that on the first addAttachment
 * (no attachment page shown yet), and loadData re-adds the saved attachments first — so reopening a return with
 * Part XI attachments threw inside loadData and loaded nothing at all (found by its populated-attachment parity
 * test). Keep 1.7's empty set for exactly the empty-string case; every other value builds the same selector.
 */
export function fixEmptyIdSelector(html: string): string {
  return html.replace(/\$\("#" \+ (\w+)\)/g, '$($1 === "" ? [] : "#" + $1)');
}

/**
 * MSHTML compatibility, not a BIR bug. IE7 mode exposes every markup attribute as a DOM property, so
 * 2200Av2020's `computeField` reads each Schedule 1 rate from `<td id="…_ATR" value="0.21">` as `td.value`
 * (tax-rate-helper.js refreshes the attribute from xml/taxRate.xml with setAttribute). A WebKit <td> has no
 * `value` property, so the read gave undefined, NumWithComma threw, and no row's excise due was ever computed
 * (found by the 2200Av2020 populated-schedule parity test). Read the attribute, as IE did.
 */
export function fixIeTdValueExpando(html: string): string {
  return html.replace(/(\.getElementById\('[^'()]*'\s*\+\s*\w+\s*\+\s*'ATR'\))\.value\b/g, "$1.getAttribute('value')");
}

/**
 * MSHTML compatibility, not a BIR bug. IE serialized `innerHTML` with UPPER-case tag names, so 1700v2018's
 * loadData strips its savefile wrapper with `.replaceAll("<DIV>", "").replaceAll("</DIV>","")`. WebKit writes
 * `<div>`, the strip matched nothing, and the first lookup still carried the `<div>` prefix: it called
 * addRow_schedule1 (a phantom pop-up row), threw on the still-missing element, and the return loaded EMPTY
 * (found by the 1700v2018 parity run). Make exactly those literals case-insensitive.
 */
export function fixIeLoadDataDiv(html: string): string {
  return html
    .replaceAll('.replaceAll("<DIV>", "")', '.replace(/<DIV>/gi, "")')
    .replaceAll('.replaceAll("</DIV>","")', '.replace(/<\\/DIV>/gi, "")')
    // IE's innerHTML round-trip drops the insignificant whitespace between the savefile's <div> records, so
    // split("\n") yields clean `<DIV>key=…` lines; WebKit keeps the 12-space record separator, and both the
    // getElementById lookups AND the `loadElement[1].split(loadElement[0])` value reads see `            key`.
    // Split the leading separator off with the newline, exactly where IE's parser had none.
    .replace('var loadElements = response.split("\\n");', 'var loadElements = response.replace(/\\r/g, "").split(/\\n\\s*/);');
}

/**
 * MSHTML compatibility, not a BIR bug. IE (≤ 7 mode) gave every table it parsed a TBODY, even an empty one — the
 * reason jQuery 1.x's `support.tbody` probe exists ("IE will insert them into empty tables"). 1700v2018's Part VI
 * "add more" employers pop-up appends its rows with `$("#tblSchedule1Page2Part6EmployersInfo tbody").append(…)` into
 * two tables that are empty in the markup (one is `<table …> </table>`, the other only holds stray `</td></tr>` end
 * tags, which a parser drops). WebKit creates no TBODY there, so nothing was appended, `addRow_schedule1` threw, and
 * reopening a return with more than four employers silently stopped loading at the first pop-up row (found by the
 * 1700v2018 populated-schedule parity test). Give exactly those empty tables the TBODY IE gave them.
 */
export function fixIeEmptyTableBody(html: string): string {
  return html.replace(/(<table\b[^>]*>)(\s*(?:<\/t[dr]>\s*)*<\/table>)/gi, "$1<tbody></tbody>$2");
}

/**
 * MSHTML compatibility, not a BIR bug. IE (≤ 7 mode) serialized an input's live value into `innerHTML`; WebKit
 * serializes only the markup attribute. 1700's seven "add more" pop-ups keep their rows by copying the temp
 * table into a Repository table with `$("#" + mainTable.id).html(function () { return $("#" + tempTable.id).html(); })`
 * — and the reload rebuilds the temp rows, fills them, copies them, then clears the temp table. Under WebKit the
 * copy carried only the blank markup values, so every reopened pop-up row came back empty (found by the 1700
 * populated-modal parity test). Serialize the live state, as IE did (`__ebfLiveHtml`, public/legacy-shim.js).
 */
export function fixIeLiveInnerHtmlCopy(html: string): string {
  return html.replace(/return \$\("#" \+ (tempTable|mainTable)\.id\)\.html\(\);/g, "return window.__ebfLiveHtml($1);");
}

/**
 * jQuery 1.7.1 compatibility, not a BIR bug in its own engine. The 1701 family's `addFocusBlurEvent(tableID)` builds
 * `$('input[type="text"][id="#"' + tableID + ']')` — a malformed attribute. BIR's jQuery 1.7.1 (qSA and Sizzle path
 * alike) drops it and matches every `input[type="text"]` (measured: the same 1212 / 842 / 312 elements as the
 * selectors without it); the patched jQuery 3.7.1 we serve throws "Syntax error", so every `addRow` died after
 * inserting its first cell and the 1701 reload stopped rebuilding its schedules. Drop the attribute, as 1.7.1 did.
 */
export function fixMalformedIdSelector(html: string): string {
  return html.replaceAll(`[id="#"' + tableID + ']`, "");
}

type Patch = (html: string) => string;

const PATCH: Record<string, Patch[]> = {
  // Infinite mutual recursion on load (IE: "Out of stack space"; WebKit: "Maximum call stack size exceeded"):
  // computeP1Pt2I16 → P2Pt4I55 → I43 → I42 → I41 → I39 → I37 → I33 → I31 → I29 → P1Pt2I21 → I20 → I16.
  // and a second cycle P2Pt4I43 → I42 → I41 → I39 → I37 → I33 → P4Sc3AI8TotalNOLCO → AI4C6 → Pg4Sc3I3NetOperatingLoss → I43.
  // …and more. Found by bench/sweep-forms.mjs. One pass settles every value, so every compute* refuses re-entry.
  // IE's Date#getYear lives in public/legacy-shim.js (every form, both hosts).
  "1702RTv2018": [guardAllCompute, fixIeChildNodeCount],
  "1702RTv2018C": [guardAllCompute, fixIeChildNodeCount],
  "1702RT": [fixIeChildNodeCount],
  "1700v2018": [fixIeEmptyTableBody],
  "1700": [fixIeLiveInnerHtmlCopy],
  "1701v2018": [fixEmptyIdSelector],
};

/** Fixes for patterns that are bugs wherever they appear. */
const EVERY_FORM: Patch[] = [
  fixAlwaysTrueExclusion, fixFinalCopyTrailer, fixTctFilenameInjection, fixSlowReferenceParse, fixThisIdSelector, fixUpperCaseInnerHtmlMatch, fixIeTdValueExpando, fixIeLoadDataDiv,
  fixRestoreAfterPrint, fixMalformedIdSelector,
];

/**
 * WL bug 14: BIRForms.hta lists saved returns newest-first by sorting strings that start with the file's
 * `mm/dd/yyyy hh:mm:ss` date — so December 2023 sorted above January 2025. Key on `yyyy/mm/dd hh:mm:ss`
 * instead: the same 19 characters (the list strips `substring(19)`), and the displayed date is unchanged.
 * Rearranged from `dtCreated` itself: by this line BIR has reused `ts` (and `mm`/`dd`) for the return period.
 */
export function fixSavedReturnSort(html: string): string {
  return html.replace(
    `returnsList[i] = dtCreated + "<tr>`,
    `returnsList[i] = dtCreated.substr(6, 4) + '/' + dtCreated.substr(0, 5) + dtCreated.substr(10) + "<tr>`,
  );
}

/**
 * MSHTML compatibility. IE's `window.print()` returned after printing, so 1701MS and 1702Qv2018C call
 * `restoreOriginalState()` (hide pages 2–3) and 2200Pv2020 widens Schedule 1 back to 1600 px on the next line. The
 * packaged app's print is a non-blocking sheet, so that line would run before the pages are laid out and print
 * page 1 only. Defer it to the shim's `__ebfAfterPrint`, which runs it once the sheet is gone.
 */
export function fixRestoreAfterPrint(html: string): string {
  return html.replace(
    /window\.print\(\);((?:\s*\/\/[^\n]*\n)*\s*)(restoreOriginalState\(\);|\$\('#schedule1'\)\.css\(\{'width': '1600px'\}\);\s*\$\('#Page2Content'\)\.css\(\{'width': '1600px'\}\);)/g,
    "window.print();$1window.__ebfAfterPrint(function () { $2 });",
  );
}

export function patchForm(rel_path: string, html: string): string {
  if (/^BIRForms\.hta$/i.test(rel_path)) return fixSavedReturnSort(html);
  const code = /BIR-Form([^/.]+)\.hta$/i.exec(rel_path)?.[1];
  if (!code) return html;
  return [...EVERY_FORM, ...(PATCH[code] ?? [])].reduce((h, p) => p(h), html);
}
