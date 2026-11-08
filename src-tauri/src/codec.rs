//! Rust ports of src/lib/{cp1252,tin,savefile}.ts and host/form-patch.ts — the pieces the host needs.
//! The TypeScript versions are the reference; tests here pin the same vectors.


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

/// Every switched-on built-in mod (mod/, src/bir_mod.rs) applied to a page; the host also passes the user's mod folder.
#[cfg(test)]
fn patch_form(rel_path: &str, html: String) -> String {
    crate::bir_mod::apply(&crate::bir_mod::mod_list(None), rel_path, html, "")
}

/// Every switched-on built-in mod applied to one of BIR's shared scripts. `version` is the installed package version.
#[cfg(test)]
fn patch_script(rel_path: &str, text: String, version: &str) -> String {
    crate::bir_mod::apply(&crate::bir_mod::mod_list(None), rel_path, text, version)
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
