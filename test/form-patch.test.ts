import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import {
  fixMalformedIdSelector,
  fixAlwaysTrueExclusion,
  fixFinalCopyTrailer,
  fixIeChildNodeCount,
  fixIeTdValueExpando,
  fixOnloadClobber,
  fixSilentAmountZeroing,
  fixTctFilenameInjection,
  fixUpperCaseInnerHtmlMatch,
  fixEmptyIdSelector,
  fixSavedReturnSort,
  fixRestoreAfterPrint,
  guardReentry,
  patchedJqueryFor,
  patchForm,
  patchScript,
} from "../host/form-patch.ts";
import { existsSync as exists, readFileSync as read } from "node:fs";

describe("serve-time fixes for BIR's form code", () => {
  it("lists saved returns newest-first by real date (WL bug 14), not by an mm/dd/yyyy string", () => {
    const line = `returnsList[i] = dtCreated + "<tr><td>`;
    const fixed = patchForm("BIRForms.hta", line);
    expect(fixed).toBe(fixSavedReturnSort(line));
    expect(patchForm("forms/BIR-Form0605.hta", line)).toBe(line);
    // run the patched key builder: Dec 2023 must sort below Jan 2025, and the key is still 19 chars
    // by this line BIR has reused `ts` for the return period (live main screen: "105638"), so only dtCreated is reliable
    const key = (yyyy: number, mm: string, dd: string, ts: string) =>
      new Function("dtCreated", "ts", "const returnsList = []; const i = 0; " + fixed + '</td>"; return returnsList[0];')(`${mm}/${dd}/${yyyy} ${ts}`, "105638") as string;
    const row = [key(2023, "12", "31", "10:00:00"), key(2025, "01", "02", "09:00:00")].sort().reverse();
    expect(row[0]!.slice(0, 19)).toBe("2025/01/02 09:00:00");
    expect(row[0]!.substring(19)).toBe("<tr><td></td>");
  });

  it("defers the layout restore until the non-blocking macOS print sheet is dismissed (all pages print)", () => {
    const html = "function printPages() {\n  showAllPages();\n  window.print();\n  // back to one page\n  restoreOriginalState();\n}";
    const fixed = patchForm("forms/BIR-Form1702Qv2018C.hta", html);
    expect(fixRestoreAfterPrint(fixed)).toBe(fixed); // idempotent: the deferred form no longer matches
    expect(fixed).toContain("window.__ebfAfterPrint(function () { restoreOriginalState(); });");
    expect(fixed).not.toMatch(/window\.print\(\);\s*\/\/ back to one page\s*restoreOriginalState\(\);/);
    // run it: with no sheet open the restore is immediate; with a sheet it waits for the next input
    const call: string[] = [];
    const run = (sheetOpen: boolean) => {
      const listener: Array<() => void> = [];
      const window = {
        print: () => call.push("print"),
        __ebfAfterPrint: (restore: () => void) => (sheetOpen ? listener.push(restore) : restore()),
      };
      new Function("window", "showAllPages", "restoreOriginalState", fixed + "; printPages();")(
        window,
        () => call.push("show"),
        () => call.push("restore"),
      );
      return listener;
    };
    run(false);
    expect(call).toEqual(["show", "print", "restore"]);
    call.length = 0;
    const pending = run(true);
    expect(call).toEqual(["show", "print"]);
    pending[0]!();
    expect(call).toEqual(["show", "print", "restore"]);
  });

  it("turns the always-true name/address exclusion into the intended &&", () => {
    const bug = `if (elem[i].id !== 'frm:Name1' || elem[i].id !== 'frm:Name2'\n\t\t|| elem[i].id !== 'frm:Addr1') {`;
    expect(fixAlwaysTrueExclusion(bug)).toBe(`if (elem[i].id !== 'frm:Name1' && elem[i].id !== 'frm:Name2'\n\t\t&& elem[i].id !== 'frm:Addr1') {`);
    // a legitimate || between different tests is left alone
    const ok = `if (elem[i].type == 'text' || elem[i].type == 'select-one')`;
    expect(fixAlwaysTrueExclusion(ok)).toBe(ok);
  });

  it("makes a 2014-trailer form recognise its own final copies", () => {
    const form = `<span id='xmlClose'>All Rights Reserved BIR 2014.</span> if (x.indexOf("All Rights Reserved BIR 2012.0") >= 0)`;
    expect(fixFinalCopyTrailer(form)).toContain('"All Rights Reserved BIR 2014.0"');
    const old = `<span id='xmlClose'>All Rights Reserved BIR 2012.</span> x.indexOf("All Rights Reserved BIR 2012.0")`;
    expect(fixFinalCopyTrailer(old)).toBe(old);
  });

  it("counts saved schedule rows case-insensitively (IE's innerHTML was <DIV>, WebKit's is <div>)", () => {
    const bug = "var countSched1 = (response.innerHTML.match(/<DIV>frm1801v2018:sched1Exc_[0-9]+/g) || []).length;";
    const fixed = fixUpperCaseInnerHtmlMatch(bug);
    expect(fixed).toBe("var countSched1 = (response.innerHTML.match(/<DIV>frm1801v2018:sched1Exc_[0-9]+/gi) || []).length;");
    const count = new Function("response", `${fixed} return countSched1;`);
    expect(count({ innerHTML: "<div>frm1801v2018:sched1Exc_1=1frm1801v2018:sched1Exc_1=</div><div>frm1801v2018:sched1Exc_2=" })).toBe(2);
    // a `.search("<DIV>")` string test (1702Q) is not a match literal and is left alone
    const other = `if(gOthersValue.search("<DIV>") >=0 ){`;
    expect(fixUpperCaseInnerHtmlMatch(other)).toBe(other);
  });

  it("guards re-entry without touching the function body", () => {
    const out = guardReentry("function computeA() { computeA(); }", "computeA");
    const run = new Function(`${out}; computeA(); return computeA.__busy;`);
    expect(run()).toBe(false); // terminated instead of overflowing
  });

  it("sanitizes the TCT field where it builds a filename, but not where it is displayed", () => {
    expect(fixTctFilenameInjection(`"_" + d.getElementById('frm1606:txtTCT').value.replace(/-/g, '')`)).toBe(
      `"_" + d.getElementById('frm1606:txtTCT').value.replace(/[^A-Za-z0-9]/g, '')`,
    );
    expect(fixTctFilenameInjection(`"_"+d.getElementById('frm1706:txtTCT').value`)).toBe(
      `"_"+d.getElementById('frm1706:txtTCT').value.replace(/[^A-Za-z0-9]/g, '')`,
    );
    // a validation/display read (not filename context) is left alone
    const display = `if (d.getElementById('frm1606:txtTCT').value == "") {`;
    expect(fixTctFilenameInjection(display)).toBe(display);
  });

  it("makes round() truncate a >12-digit amount instead of zeroing it", () => {
    const source = `\tif (parts[0].length > 12) {\n\t\t\treturn false;\n\t\t} else {\n\t\t\treturn true;\n\t\t}\n\t\tif (num.length > 12) {\n\t\t\treturn false;\n\t\t}`;
    const fixed = fixSilentAmountZeroing(source);
    expect(fixed).not.toContain("return false;");
    expect(patchScript("js/string-util.js", source)).toBe(fixed);
    expect(patchScript("js/string-util2014.js", source)).toBe(fixed);
    expect(patchScript("js/aes.js", source)).toBe(source); // only the money files
  });

  it("the patched string-util.js no longer zeroes a 13-digit amount (runs round)", () => {
    const file = "vendor/original/js/string-util.js";
    if (!exists(file)) return;
    const patched = patchScript("js/string-util.js", read(file, "utf8"));
    // evaluate round + its helper in isolation and feed a 13-digit integer amount
    const run = new Function(`${patched.match(/function isAmountWithinAllowedPrecision[\s\S]*?\n}/)![0]}\n${patched.match(/function round\(number, dec\)[\s\S]*?\n}/)![0]}\nconst f={value:"1234567890123"};round(f);return f.value;`);
    const out = run() as string;
    expect(out).not.toBe("0.00");
    expect(out.replace(/[,.]/g, "")).toContain("123456789012"); // truncated to 12 digits, not zeroed
  });

  it("routes repeated innerHTML reference reads through the memoizer (speed, WL bug 15)", () => {
    const slow = `var atc = String(response.innerHTML).split('atc'+i+':');`;
    expect(patchForm("forms/BIR-Form1601F.hta", slow)).toBe(`var atc = String(window.__ebfInnerHTML(response)).split('atc'+i+':');`);
    // a set, or a non-split read, is untouched
    const set = `response.innerHTML = fileContents;`;
    expect(patchForm("forms/BIR-Form1601F.hta", set)).toBe(set);
  });

  it("fixes the print-view $(this.id) no-op selector (WL bug 21)", () => {
    expect(patchForm("forms/BIR-Form0605.hta", "$(this.id).addClass('x');")).toBe("$(this).addClass('x');");
  });

  it("stops tax-rate-helper from clobbering window.onload (WL bug 17)", () => {
    expect(fixOnloadClobber("window.onload = updateFromXML;")).toBe('window.addEventListener("load", updateFromXML);');
    expect(patchScript("js/tax-rate-helper.js", "window.onload = updateFromXML;")).toBe('window.addEventListener("load", updateFromXML);');
    expect(patchScript("js/aes.js", "window.onload = x;")).toBe("window.onload = x;");
  });

  it("routes BIR's vulnerable jQuery/jQuery-UI to the patched versions (WL bug 7)", () => {
    expect(patchedJqueryFor("jq/jquery-1.7.1.min.js")).toContain("jquery-3.7.1");
    expect(patchedJqueryFor("js/lib/jquery-1.11.0.js")).toContain("jquery-3.7.1");
    expect(patchedJqueryFor("jq/jquery-ui-1.8.18.custom.min.js")).toContain("jquery-ui-1.13.3");
    expect(patchedJqueryFor("js/string-util.js")).toBeNull();
  });

  it("only patches form pages", () => {
    expect(patchForm("js/string-util.js", "a || b")).toBe("a || b");
  });

  it("gives the 1702-RT family IE's element-only childNodes count (MSHTML compatibility)", () => {
    const modal = "if (checkrow.childNodes.length == 4) {} else if (row.childNodes.length == 5) {} for (var i = 0; i < currentRow.childNodes.length; i++) {}";
    expect(fixIeChildNodeCount(modal)).toBe("if (checkrow.children.length == 4) {} else if (row.children.length == 5) {} for (var i = 0; i < currentRow.childNodes.length; i++) {}");
    expect(patchForm("forms/BIR-Form1702RT.hta", modal)).toContain("checkrow.children.length == 4");
    expect(patchForm("forms/BIR-Form2551M.hta", modal)).toBe(modal); // scoped to the 1702-RT family
    // IE's Date#getYear is not a per-form rewrite any more: public/legacy-shim.js provides it to every form
    expect(patchForm("forms/BIR-Form1702RT.hta", "x.getYear()")).toBe("x.getYear()");
  });

  it("keeps jQuery 1.7's empty set for an empty-id selector in 1701v2018 (jQuery 3 throws on a bare \"#\")", () => {
    const hide = `$("#" + attachmentPage).hide("blind");`;
    const fixed = fixEmptyIdSelector(hide);
    expect(fixed).toBe(`$(attachmentPage === "" ? [] : "#" + attachmentPage).hide("blind");`);
    const sel = new Function("$", "attachmentPage", `return ${fixed.replace(".hide(\"blind\");", "")};`);
    expect(sel((x: unknown) => x, "")).toEqual([]);
    expect(sel((x: unknown) => x, "Page1mEX1Content")).toBe("#Page1mEX1Content");
    expect(sel((x: unknown) => x, 0)).toBe("#0"); // only the empty string changes
    expect(patchForm("forms/BIR-Form1701v2018.hta", hide)).toBe(fixed);
    expect(patchForm("forms/BIR-Form1701A.hta", hide)).toBe(hide); // scoped to the form that needs it
  });

  it("gives 2200Av2020's rate cells IE's attribute-as-property `td.value` (MSHTML compatibility)", () => {
    const read = "var atr = NumWithComma(d.getElementById('frm2200Av2020:txtSched1'+year+'ATR').value);";
    const fixed = "var atr = NumWithComma(d.getElementById('frm2200Av2020:txtSched1'+year+'ATR').getAttribute('value'));";
    expect(fixIeTdValueExpando(read)).toBe(fixed);
    expect(patchForm("forms/BIR-Form2200Av2020.hta", read)).toBe(fixed);
    const input = "var x = NumWithComma(d.getElementById('frm2200Av2020:txtSched1'+year+'Taxable').value);";
    expect(fixIeTdValueExpando(input)).toBe(input); // real <input>s keep .value
  });

  it("drops the 1701 family's malformed `[id=\"#\"' + tableID + ']` selector part, as BIR's jQuery 1.7.1 did", () => {
    const src = `$('input[maxlength="12"][id="#"' + tableID + '][type=text]').blur(f); $('input[type="text"][id="#"' + tableID + ']').focus(g);`;
    expect(fixMalformedIdSelector(src)).toBe(`$('input[maxlength="12"][type=text]').blur(f); $('input[type="text"]').focus(g);`);
    expect(patchForm("forms/BIR-Form1701.hta", src)).toBe(fixMalformedIdSelector(src));
  });

  const dir = "vendor/original/forms";
  it.skipIf(!existsSync(dir))("fixes the name mangling in the 1702RT family and 1702Qv2018C, and 1701A's trailer", () => {
    const changed = (code: string) => {
      const html = readFileSync(`${dir}/BIR-Form${code}.hta`, "utf8");
      return patchForm(`forms/BIR-Form${code}.hta`, html) !== html;
    };
    for (const code of ["1702RT", "1702RTv2018", "1702RTv2018C", "1702Qv2018C", "1701A"]) expect(changed(code), code).toBe(true);
    const all = readdirSync(dir).filter((f) => f.endsWith(".hta"));
    const after = all.map((f) => patchForm(`forms/${f}`, readFileSync(`${dir}/${f}`, "utf8")));
    for (const html of after) expect(html).not.toMatch(/elem\[i\]\.id\s*!==?\s*'[^']+'\s*\|\|\s*elem\[i\]\.id\s*!==?/);
  });
});
import { fixStaleVersion } from "../host/form-patch.ts";
describe("version fix (WL bug 18)", () => {
  it("replaces the stale currVer with the real package version", () => {
    expect(fixStaleVersion("var currVer = '7.9.6.0';", "7.9.6.2")).toBe("var currVer = '7.9.6.2';");
    expect(fixStaleVersion("var currVer = '7.9.6.0';", "")).toBe("var currVer = '7.9.6.0';"); // no version → unchanged
  });
});
import { isDeadScript, patchScript as ps } from "../host/form-patch.ts";
describe("dead-code removal (WL bug 20)", () => {
  it("serves verified-dead libraries empty, keeps live ones", () => {
    expect(isDeadScript("js/blowfish.js")).toBe(true);
    expect(isDeadScript("js/lz-string-1.3.4.js")).toBe(true);
    expect(isDeadScript("js/aes.js")).toBe(false); // aes is reachable; left intact
    expect(ps("js/blowfish.js", "function Blowfish(k){...}")).not.toContain("function Blowfish");
    expect(ps("js/aes.js", "live();")).toBe("live();");
  });
});

// Same inputs and outputs as `ports_the_webkit_compat_rewrites` in src-tauri/src/codec.rs, so both hosts are held to one result.
describe("1700 reopen compat mods (compat/load-data-div, empty-table-body, live-inner-html)", () => {
  it("1700 (2018) strips <DIV> case-insensitively and splits saved records on any whitespace", () => {
    const out = patchForm(
      "forms/BIR-Form1700v2018.hta",
      'response = response.replaceAll("<DIV>", "").replaceAll("</DIV>",""); var loadElements = response.split("\\n");',
    );
    expect(out).toBe(
      'response = response.replace(/<DIV>/gi, "").replace(/<\\/DIV>/gi, ""); var loadElements = response.replace(/\\r/g, "").split(/\\n\\s*/);',
    );
  });

  it("1700 (2018) gets a <tbody> in an empty table, other forms do not", () => {
    const table = '<table id="t" class="tblForm"> </table>';
    expect(patchForm("forms/BIR-Form1700v2018.hta", table)).toBe('<table id="t" class="tblForm"><tbody></tbody> </table>');
    expect(patchForm("forms/BIR-Form2551M.hta", table)).toBe(table);
  });

  it("1700 copies typed values with the pop-up rows, other forms are untouched", () => {
    const copy = '$("#" + mainTable.id).html(function () { return $("#" + tempTable.id).html(); });';
    expect(patchForm("forms/BIR-Form1700.hta", copy)).toBe(
      '$("#" + mainTable.id).html(function () { return window.__ebfLiveHtml(tempTable); });',
    );
    expect(patchForm("forms/BIR-Form1701.hta", copy)).toBe(copy);
  });
});

import { fixSlowReferenceParse } from "../host/form-patch.ts";
describe("speed/reference-parse (WL bug 15)", () => {
  it("routes the per-record innerHTML split through the shim's memoizer, and nothing else", () => {
    expect(fixSlowReferenceParse("var a = String(response.innerHTML).split('atc' + i + ':');")).toBe(
      "var a = String(window.__ebfInnerHTML(response)).split('atc' + i + ':');",
    );
    expect(fixSlowReferenceParse("response.innerHTML = x;")).toBe("response.innerHTML = x;");
  });
});
