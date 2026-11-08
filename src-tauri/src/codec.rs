//! Rust ports of src/lib/{cp1252,tin,savefile}.ts and host/form-patch.ts — the pieces the host needs.
//! The TypeScript versions are the reference; tests here pin the same vectors.

use regex::Regex;
use std::sync::OnceLock;

const HIGH: [char; 32] = [
    '€', '\u{81}', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', '\u{8d}', 'Ž', '\u{8f}', '\u{90}', '‘', '’', '“',
    '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', '\u{9d}', 'ž', 'Ÿ',
];

pub fn decode_cp1252(byte: &[u8]) -> String {
    byte.iter().map(|&b| if (0x80..=0x9f).contains(&b) { HIGH[(b - 0x80) as usize] } else { b as char }).collect()
}

/// Characters outside cp1252 become "?", as the original's ANSI write would.
pub fn encode_cp1252(text: &str) -> Vec<u8> {
    text.chars()
        .map(|c| {
            if let Some(i) = HIGH.iter().position(|&h| h == c) {
                0x80 + i as u8
            } else if (c as u32) < 0x80 || (0xa0..=0xff).contains(&(c as u32)) {
                c as u8
            } else {
                b'?'
            }
        })
        .collect()
}

fn digit_root(mut n: u32) -> u32 {
    while n >= 10 {
        n = n.to_string().bytes().map(|d| (d - b'0') as u32).sum();
    }
    n
}

pub fn check_digit(first8: &[u8]) -> u32 {
    let (mut weight, mut offset, mut total) = (256u32, 8u32, 0u32);
    for &ch in first8.iter().take(8) {
        total += digit_root((((ch - b'0') as u32 + offset) % 10) * weight);
        offset -= 1;
        weight /= 2;
    }
    // chkt.exe takes the 2nd character of the zero-padded total: units below 100, tens at 100+
    let r = (format!("{total:02}").as_bytes()[1] - b'0') as u32;
    if r == 0 {
        0
    } else {
        10 - r
    }
}

/// chkt.exe exit codes: 0 valid, 1 bad check digit, 2 not 9 digits.
pub fn validate_tin(input: &str) -> i32 {
    let tin = input.trim_matches(' ');
    if tin.len() != 9 || !tin.bytes().all(|b| b.is_ascii_digit()) {
        return 2;
    }
    let b = tin.as_bytes();
    let stored = (b[8] - b'0') as u32;
    let cd = check_digit(b);
    if stored == cd {
        return 0;
    }
    let n: u32 = tin.parse().unwrap_or(0);
    if n > 900_000_004 && n < 905_180_009 && (stored + 9) % 10 == cd {
        return 0;
    }
    1
}

/// The key of one savefile record body "KEY=VALUEKEY=".
fn record_key(body: &str) -> Option<&str> {
    let mut from = 0;
    while let Some(i) = body[from..].find('=').map(|i| i + from) {
        let key = &body[..i];
        if i > 0 && body.len() >= i + 1 + key.len() + 1 && body.ends_with(&format!("{key}=")) {
            return Some(key);
        }
        from = i + 1;
    }
    None
}

/// Drop every `ebirOnline*` record — the original wrote the user's eBIRForms-Online password into savefiles.
pub fn strip_secret(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(open) = rest.find("<div>") {
        let Some(close) = rest[open..].find("</div>").map(|c| c + open) else { break };
        let body = &rest[open + 5..close];
        out.push_str(&rest[..open]);
        if !record_key(body).is_some_and(|k| k.to_ascii_lowercase().contains("ebironline")) {
            out.push_str(&rest[open..close + 6]);
        }
        rest = &rest[close + 6..];
    }
    out.push_str(rest);
    out
}

/// host/form-patch.ts fixAlwaysTrueExclusion: `id !== A || id !== B` → `&&` (names were mangled on save).
fn fix_always_true_exclusion(html: String) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(elem\[i\]\.id\s*!==?\s*'[^']+'\s*)\|\|(\s*elem\[i\]\.id\s*!==?\s*')").unwrap());
    let mut out = html;
    loop {
        // no lookahead in this regex engine: chains A || B || C overlap, so repeat until stable
        let next = re.replace_all(&out, "$1&&$2").into_owned();
        if next == out {
            return out;
        }
        out = next;
    }
}

/// host/form-patch.ts fixFinalCopyTrailer: a 2014-trailer form must recognise its own final copies.
fn fix_final_copy_trailer(html: String) -> String {
    if !html.contains("All Rights Reserved BIR 2014.</span>") {
        return html;
    }
    html.replace("\"All Rights Reserved BIR 2012.0\"", "\"All Rights Reserved BIR 2014.0\"")
}

/// host/form-patch.ts fixTctFilenameInjection: 1606/1706 build the savefile name from the TCT field;
/// in filename context keep only alphanumerics (the host sandbox already refuses traversal).
fn fix_tct_filename_injection(html: String) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r#"("_" ?\+ ?(?:d|document)\.getElementById\(['"]frm(?:1606|1706):txtTCT['"]\)\.value)(\.replace\(/-/g, ?['"]['"]\))?"#).unwrap()
    });
    re.replace_all(&html, "$1.replace(/[^A-Za-z0-9]/g, '')").into_owned()
}

/// host/form-patch.ts fixSilentAmountZeroing: make round() truncate a >12-digit amount instead of zeroing it.
fn fix_silent_amount_zeroing(text: String) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(length > 12\)\s*\{\s*)return false;").unwrap());
    re.replace_all(&text, "${1}return true;").into_owned()
}

/// host/form-patch.ts fixOnloadClobber: tax-rate-helper.js replaces window.onload; add a listener instead.
fn fix_onload_clobber(text: String) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"window\.onload\s*=\s*(\w+)\s*;").unwrap());
    re.replace_all(&text, r#"window.addEventListener("load", $1);"#).into_owned()
}

/// host/form-patch.ts patchScript: serve-time fixes for BIR's shared scripts.
pub fn patch_script(rel_path: &str, text: String, version: &str) -> String {
    static SU: OnceLock<Regex> = OnceLock::new();
    static TR: OnceLock<Regex> = OnceLock::new();
    static EN: OnceLock<Regex> = OnceLock::new();
    static DEAD: OnceLock<Regex> = OnceLock::new();
    // WL bug 20: libraries BIR ships but never calls (Blowfish, LZString) — served empty
    if DEAD.get_or_init(|| Regex::new(r"/(blowfish|lz-string-[\d.]+)\.js$").unwrap()).is_match(rel_path) {
        let name = rel_path.rsplit('/').next().unwrap_or(rel_path);
        return format!("/* {name}: dead code (never called by any form), served empty */");
    }
    if SU.get_or_init(|| Regex::new(r"js/string-util(2014)?\.js$").unwrap()).is_match(rel_path) {
        return fix_silent_amount_zeroing(text);
    }
    if TR.get_or_init(|| Regex::new(r"js/tax-rate-helper\.js$").unwrap()).is_match(rel_path) {
        return fix_onload_clobber(text);
    }
    // WL bug 18: replace environment.js's stale hardcoded currVer with the real package version
    if !version.is_empty() && EN.get_or_init(|| Regex::new(r"js/environment\.js$").unwrap()).is_match(rel_path) {
        let re = Regex::new(r"var\s+currVer\s*=\s*'[^']*';").unwrap();
        return re.replace(&text, format!("var currVer = '{version}';").as_str()).into_owned();
    }
    text
}

/// host/form-patch.ts fixSlowReferenceParse: route repeated `String(x.innerHTML).split(` reads through the memoizer.
/// host/form-patch.ts fixIeChildNodeCount: IE7 `childNodes` skips whitespace text, so the 1702-RT modal code's
/// `row.childNodes.length == 4/5` (a <td> count) only matches if we count element children, as IE did.
fn fix_ie_child_node_count(html: String) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"\b(checkrow|currentRow|row)\.childNodes\.length(\s*==\s*[45]\b)").unwrap());
    re.replace_all(&html, "$1.children.length$2").into_owned()
}

/// host/form-patch.ts fixUpperCaseInnerHtmlMatch: IE serialized innerHTML with upper-case tags, WebKit lower-case,
/// so `innerHTML.match(/<DIV>key_[0-9]+/g)` (1621, 1801v2018 row counts) must match case-insensitively.
fn fix_upper_case_inner_html_match(html: String) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(\.match\(/<DIV>[^/\n]*/)g\)").unwrap());
    re.replace_all(&html, "${1}gi)").into_owned()
}

/// host/form-patch.ts fixIeTdValueExpando: IE7 exposes markup attributes as properties, so 2200Av2020 reads each
/// Schedule 1 rate as `td.value`; a WebKit <td> has no `value` property. Read the attribute, as IE did.
fn fix_ie_td_value_expando(html: String) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(\.getElementById\('[^'()]*'\s*\+\s*\w+\s*\+\s*'ATR'\))\.value\b").unwrap());
    re.replace_all(&html, "${1}.getAttribute('value')").into_owned()
}

/// host/form-patch.ts fixIeLoadDataDiv: IE serialized innerHTML with UPPER-case tags, so 1700v2018's loadData
/// strips its savefile wrapper with `.replaceAll("<DIV>", "")`; WebKit writes `<div>`, the strip matched nothing,
/// and the first lookup (still carrying the `<div>` prefix) added a phantom pop-up row and threw, loading the
/// return empty. Make exactly those literals case-insensitive.
fn fix_ie_load_data_div(html: String) -> String {
    html.replace(".replaceAll(\"<DIV>\", \"\")", ".replace(/<DIV>/gi, \"\")")
        .replace(".replaceAll(\"</DIV>\",\"\")", ".replace(/<\\/DIV>/gi, \"\")")
        // IE's innerHTML round-trip drops the whitespace between the savefile's <div> records, so split("\n")
        // yields clean `<DIV>key=…` lines; WebKit keeps the 12-space record separator on every line.
        .replace("var loadElements = response.split(\"\\n\");", "var loadElements = response.replace(/\\r/g, \"\").split(/\\n\\s*/);")
}

/// host/form-patch.ts fixMalformedIdSelector: the 1701 family's `addFocusBlurEvent` selector carries a malformed
/// `[id="#"' + tableID + ']`, which BIR's jQuery 1.7.1 drops (matching every text input) and jQuery 3.7.1 throws on.
fn fix_malformed_id_selector(html: String) -> String {
    html.replace("[id=\"#\"' + tableID + ']", "")
}

fn fix_slow_reference_parse(html: String) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"String\((\w+)\.innerHTML\)\.split\(").unwrap());
    re.replace_all(&html, "String(window.__ebfInnerHTML($1)).split(").into_owned()
}

/// host/form-patch.ts fixIeEmptyTableBody: IE (≤ 7 mode) gave every parsed table a TBODY, even an empty one.
/// 1700v2018's Part VI "add more" pop-up appends rows with jQuery into two tables that are empty in the markup;
/// WebKit creates no TBODY there, so nothing was appended and the pop-up rows never rebuilt on reload.
fn fix_ie_empty_table_body(html: String) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(<table\b[^>]*>)(\s*(?:</t[dr]>\s*)*</table>)").unwrap());
    re.replace_all(&html, "${1}<tbody></tbody>${2}").into_owned()
}

/// host/form-patch.ts fixIeLiveInnerHtmlCopy: IE serialized an input's live value into innerHTML; 1700's "add more"
/// pop-ups copy their rows temp → Repository with `.html()`, so under WebKit every reopened row came back blank.
fn fix_ie_live_inner_html_copy(html: String) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r##"return \$\("#" \+ (tempTable|mainTable)\.id\)\.html\(\);"##).unwrap());
    re.replace_all(&html, "return window.__ebfLiveHtml(${1});").into_owned()
}

/// host/form-patch.ts fixEmptyIdSelector: jQuery 1.7 gave `$("#" + id)` with an empty id an empty set, the served
/// jQuery 3 throws; 1701v2018's hideCurrentPage hits it on the first addAttachment of a reload.
fn fix_empty_id_selector(html: String) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new("\\$\\(\"#\" \\+ (\\w+)\\)").unwrap());
    re.replace_all(&html, "$$(${1} === \"\" ? [] : \"#\" + ${1})").into_owned()
}

/// host/form-patch.ts fixRestoreAfterPrint: IE's print blocked, the packaged app's is a sheet — defer the line that
/// undoes the print layout (1701MS, 1702Qv2018C, 2200Pv2020) to the shim's `__ebfAfterPrint`.
fn fix_restore_after_print(html: String) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        Regex::new(r"window\.print\(\);((?:\s*//[^\n]*\n)*\s*)(restoreOriginalState\(\);|\$\('#schedule1'\)\.css\(\{'width': '1600px'\}\);\s*\$\('#Page2Content'\)\.css\(\{'width': '1600px'\}\);)").unwrap()
    });
    re.replace_all(&html, "window.print();${1}window.__ebfAfterPrint(function () { ${2} });").into_owned()
}

/// host/form-patch.ts fixSavedReturnSort (WL bug 14): the main screen sorted saved returns by an `mm/dd/yyyy`
/// string; key on `yyyy/mm/dd` (same 19 chars, display unchanged), rearranged from `dtCreated` — BIR reuses `ts`.
fn fix_saved_return_sort(html: String) -> String {
    html.replacen(
        r#"returnsList[i] = dtCreated + "<tr>"#,
        r#"returnsList[i] = dtCreated.substr(6, 4) + '/' + dtCreated.substr(0, 5) + dtCreated.substr(10) + "<tr>"#,
        1,
    )
}

/// host/form-patch.ts patchForm: the main screen's fix, or fixes for every form, then the compute-cycle guard.
pub fn patch_form(rel_path: &str, html: String) -> String {
    if rel_path.eq_ignore_ascii_case("BIRForms.hta") {
        return fix_saved_return_sort(html);
    }
    static FORM: OnceLock<Regex> = OnceLock::new();
    static DECL: OnceLock<Regex> = OnceLock::new();
    let form = FORM.get_or_init(|| Regex::new(r"BIR-Form([^/.]+)\.hta$").unwrap());
    let Some(code) = form.captures(rel_path).map(|c| c[1].to_string()) else { return html };
    let html = html.replace("$(this.id)", "$(this)"); // WL bug 21: invalid print-view selector
    let html = fix_restore_after_print(fix_ie_load_data_div(fix_ie_td_value_expando(fix_upper_case_inner_html_match(fix_slow_reference_parse(fix_tct_filename_injection(fix_final_copy_trailer(fix_always_true_exclusion(html))))))));
    let html = fix_malformed_id_selector(html);
    if code == "1700v2018" {
        return fix_ie_empty_table_body(html);
    }
    if code == "1701v2018" {
        return fix_empty_id_selector(html);
    }
    if code == "1700" {
        return fix_ie_live_inner_html_copy(html);
    }
    if !matches!(code.as_str(), "1702RT" | "1702RTv2018" | "1702RTv2018C") {
        return html;
    }
    let html = fix_ie_child_node_count(html);
    if code == "1702RT" {
        return html;
    }
    let decl = DECL.get_or_init(|| Regex::new(r"function\s+(compute\w*)\s*\(\s*\)\s*\{").unwrap());
    let mut name: Vec<String> = decl.captures_iter(&html).map(|c| c[1].to_string()).collect();
    name.dedup();
    let mut out = html;
    for n in name {
        let one = Regex::new(&format!(r"function\s+{n}\s*\(\s*\)\s*\{{")).unwrap();
        if let Some(m) = one.find(&out) {
            let guard = format!(
                "function {n}() {{ if ({n}.__busy) return; {n}.__busy = true; try {{ return {n}__body.apply(this, arguments); }} finally {{ {n}.__busy = false; }} }}\nfunction {n}__body() {{"
            );
            out.replace_range(m.range(), &guard);
        }
    }
    out
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn ports_the_webkit_compat_rewrites() {
        let rt = patch_form("forms/BIR-Form1702RT.hta", "if (row.childNodes.length == 4) {}".into());
        assert_eq!(rt, "if (row.children.length == 4) {}");
        let other = patch_form("forms/BIR-Form2551M.hta", "if (row.childNodes.length == 4) {}".into());
        assert_eq!(other, "if (row.childNodes.length == 4) {}");
        let div = patch_form("forms/BIR-Form1621.hta", "var n = x.innerHTML.match(/<DIV>txtSched1_[0-9]+/g);".into());
        assert_eq!(div, "var n = x.innerHTML.match(/<DIV>txtSched1_[0-9]+/gi);");
        let empty = r##"$("#" + attachmentPage).hide("blind");"##;
        assert_eq!(patch_form("forms/BIR-Form1701v2018.hta", empty.into()), r##"$(attachmentPage === "" ? [] : "#" + attachmentPage).hide("blind");"##);
        assert_eq!(patch_form("forms/BIR-Form1701A.hta", empty.into()), empty);
        let atr = patch_form("forms/BIR-Form2200Av2020.hta", "var atr = NumWithComma(d.getElementById('frm2200Av2020:txtSched1'+year+'ATR').value);".into());
        assert_eq!(atr, "var atr = NumWithComma(d.getElementById('frm2200Av2020:txtSched1'+year+'ATR').getAttribute('value'));");
        let input = patch_form("forms/BIR-Form2200Av2020.hta", "var x = d.getElementById('frm2200Av2020:txtSched1'+year+'Taxable').value;".into());
        assert_eq!(input, "var x = d.getElementById('frm2200Av2020:txtSched1'+year+'Taxable').value;");
        let strip = patch_form("forms/BIR-Form1700v2018.hta", "response = response.replaceAll(\"<DIV>\", \"\").replaceAll(\"</DIV>\",\"\"); var loadElements = response.split(\"\\n\");".into());
        assert_eq!(strip, "response = response.replace(/<DIV>/gi, \"\").replace(/<\\/DIV>/gi, \"\"); var loadElements = response.replace(/\\r/g, \"\").split(/\\n\\s*/);");
        let tbody = patch_form("forms/BIR-Form1700v2018.hta", r#"<table id="t" class="tblForm"> </table>"#.into());
        assert_eq!(tbody, r#"<table id="t" class="tblForm"><tbody></tbody> </table>"#);
        let tbody_other = patch_form("forms/BIR-Form2551M.hta", r#"<table id="t" class="tblForm"> </table>"#.into());
        assert_eq!(tbody_other, r#"<table id="t" class="tblForm"> </table>"#);
        let copy = r##"$("#" + mainTable.id).html(function () { return $("#" + tempTable.id).html(); });"##;
        assert_eq!(patch_form("forms/BIR-Form1700.hta", copy.into()), r##"$("#" + mainTable.id).html(function () { return window.__ebfLiveHtml(tempTable); });"##);
        assert_eq!(patch_form("forms/BIR-Form1701.hta", copy.into()), copy);
        let sel = patch_form("forms/BIR-Form1701.hta", "$('input[maxlength=\"12\"][id=\"#\"' + tableID + '][type=text]').blur(f);".into());
        assert_eq!(sel, "$('input[maxlength=\"12\"][type=text]').blur(f);");
    }

    #[test]
    fn defers_the_layout_restore_after_print() {
        let a = "window.print();\n\n        // Restore the original state after printing\n        restoreOriginalState();";
        assert_eq!(
            patch_form("forms/BIR-Form1702Qv2018C.hta", a.into()),
            "window.print();\n\n        // Restore the original state after printing\n        window.__ebfAfterPrint(function () { restoreOriginalState(); });"
        );
        let b = "window.print();\n            $('#schedule1').css({'width': '1600px'});\n            $('#Page2Content').css({'width': '1600px'});";
        assert_eq!(
            patch_form("forms/BIR-Form2200Pv2020.hta", b.into()),
            "window.print();\n            window.__ebfAfterPrint(function () { $('#schedule1').css({'width': '1600px'});\n            $('#Page2Content').css({'width': '1600px'}); });"
        );
        let plain = "onclick='window.print();' />";
        assert_eq!(patch_form("forms/BIR-Form0605.hta", plain.into()), plain);
    }

    #[test]
    fn sorts_saved_returns_by_real_date() {
        let line = r#"returnsList[i] = dtCreated + "<tr><td>"#;
        assert_eq!(patch_form("BIRForms.hta", line.into()), r#"returnsList[i] = dtCreated.substr(6, 4) + '/' + dtCreated.substr(0, 5) + dtCreated.substr(10) + "<tr><td>"#);
        assert_eq!(patch_form("forms/BIR-Form0605.hta", line.into()), line);
    }

    #[test]
    fn cp1252_round_trip() {
        let s = "Ñoño — €5";
        assert_eq!(decode_cp1252(&encode_cp1252(s)), s);
        assert_eq!(encode_cp1252("漢"), b"?");
    }

    #[test]
    fn tin_agrees_with_chkt_exe_vectors() {
        let raw = std::fs::read_to_string("../test/fixture/tin-vector.json").unwrap();
        let vector: Vec<(String, i32)> = serde_json::from_str(&raw).unwrap();
        let bad: Vec<_> = vector.iter().filter(|(t, rc)| validate_tin(t) != *rc).collect();
        assert!(bad.is_empty(), "{bad:?}");
        assert!(vector.len() > 4000);
    }

    #[test]
    fn strips_the_online_password() {
        let s = "<?xml version='1.0'?>\t<div>a=1a=</div>\t<div>ebirOnlineSecret=pwebirOnlineSecret=</div>\t<div>b=2b=</div>\tAll Rights Reserved BIR 2012.";
        let out = strip_secret(s);
        assert!(!out.contains("ebirOnline"));
        assert!(out.contains("<div>a=1a=</div>") && out.contains("<div>b=2b=</div>"));
    }

    #[test]
    fn fixes_always_true_exclusion_chains() {
        let bug = "if (elem[i].id !== 'a' || elem[i].id !== 'b' || elem[i].id !== 'c') {".to_string();
        let out = patch_form("forms/BIR-Form1702Qv2018C.hta", bug);
        assert_eq!(out, "if (elem[i].id !== 'a' && elem[i].id !== 'b' && elem[i].id !== 'c') {");
        let ok = "if (elem[i].type == 'text' || elem[i].type == 'select-one')".to_string();
        assert_eq!(patch_form("forms/BIR-Form0605.hta", ok.clone()), ok);
    }

    #[test]
    fn sanitizes_tct_filename_but_not_display() {
        let bug = r#""_" + d.getElementById('frm1606:txtTCT').value.replace(/-/g, '')"#.to_string();
        let out = patch_form("forms/BIR-Form1606.hta", bug);
        assert_eq!(out, r#""_" + d.getElementById('frm1606:txtTCT').value.replace(/[^A-Za-z0-9]/g, '')"#);
        let display = r#"if (d.getElementById('frm1606:txtTCT').value == "") {"#.to_string();
        assert_eq!(patch_form("forms/BIR-Form1606.hta", display.clone()), display);
    }

    #[test]
    fn money_fix_only_touches_string_util() {
        let src = "if (num.length > 12) {\n\t\t\treturn false;\n\t\t}".to_string();
        assert!(!patch_script("js/string-util.js", src.clone(), "").contains("return false"));
        assert!(!patch_script("js/string-util2014.js", src.clone(), "").contains("return false"));
        assert_eq!(patch_script("js/aes.js", src.clone(), ""), src);
    }

    #[test]
    fn guards_compute_cycles_only_in_affected_forms() {
        let html = "function computeA() { computeB(); }\nfunction computeB() { computeA(); }".to_string();
        let patched = patch_form("forms/BIR-Form1702RTv2018.hta", html.clone());
        assert!(patched.contains("computeA__body") && patched.contains("computeB__body"));
        assert_eq!(patch_form("forms/BIR-Form0605.hta", html.clone()), html);
    }
}
