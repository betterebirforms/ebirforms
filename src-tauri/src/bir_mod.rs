//! The mod engine (packaged app). A mod is one JSON file under the repo's mod/<kind>/ that changes BIR's pages as
//! they are served; BIR's files on disk are never edited. host/mod.ts is the Node twin and must give the same
//! output for the same mod. The file format is documented in mod/README.md.
//!
//! Built-in mods are embedded at build time (build.rs → OUT_DIR/mod.json). The user's own mods and on/off
//! switches are read from a folder on every page load, so a change takes effect on the next reload.
use regex::{Captures, Regex, RegexBuilder};
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const EMBEDDED: &str = include_str!(concat!(env!("OUT_DIR"), "/mod.json"));

#[derive(Deserialize, Clone, Default)]
pub struct Rule {
    find: Option<String>,
    text: Option<String>,
    to: Option<String>,
    #[serde(default)]
    once: bool,
    #[serde(default)]
    repeat: bool,
    #[serde(default)]
    nocase: bool,
    guard: Option<String>,
    empty: Option<String>,
    inject: Option<String>,
}

#[derive(Deserialize, Clone)]
struct ModFile {
    #[serde(default)]
    title: String,
    #[serde(default)]
    about: String,
    on: Option<bool>,
    file: String,
    form: Option<Vec<String>>,
    #[serde(rename = "if")]
    cond: Option<String>,
    #[serde(default)]
    rule: Vec<Rule>,
}

#[derive(Clone)]
enum Source {
    BuiltIn,
    User(PathBuf),
}

#[derive(Clone)]
pub struct Mod {
    pub id: String,
    body: ModFile,
    pub on: bool,
    source: Source,
}

/// Built-in files: relative path → text.
fn embedded() -> &'static BTreeMap<String, String> {
    static FILE: OnceLock<BTreeMap<String, String>> = OnceLock::new();
    FILE.get_or_init(|| serde_json::from_str::<Vec<(String, String)>>(EMBEDDED).expect("embedded mod.json").into_iter().collect())
}

fn parse(id: String, text: &str, source: Source) -> Option<Mod> {
    if !id.contains('/') {
        return None; // top-level JSON (the on/off switches) is not a mod; mods live in a kind folder
    }
    match serde_json::from_str::<ModFile>(text) {
        Ok(body) => Some(Mod { on: body.on != Some(false), id, body, source }),
        Err(e) => {
            eprintln!("[mod] skipped {id}: {e}");
            None
        }
    }
}

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entry) = std::fs::read_dir(dir) else { return };
    for e in entry.flatten() {
        let p = e.path();
        if p.is_dir() {
            walk(&p, out);
        } else if p.extension().is_some_and(|x| x == "json") {
            out.push(p);
        }
    }
}

#[derive(Deserialize, Default)]
struct Switch {
    #[serde(default)]
    on: Vec<String>,
    #[serde(default)]
    off: Vec<String>,
}

/// The mods in effect, sorted by id: the built-in ones, then the user's own from `user_dir` (a user mod with a
/// built-in's id replaces it), then the on/off switches in `user_dir/mod.json`.
pub fn mod_list(user_dir: Option<&Path>) -> Vec<Mod> {
    let mut by_id: BTreeMap<String, Mod> = BTreeMap::new();
    for (path, text) in embedded() {
        if let Some(id) = path.strip_suffix(".json") {
            if let Some(m) = parse(id.to_string(), text, Source::BuiltIn) {
                by_id.insert(m.id.clone(), m);
            }
        }
    }
    if let Some(dir) = user_dir {
        let mut file = Vec::new();
        walk(dir, &mut file);
        for path in file {
            let Ok(rel) = path.strip_prefix(dir) else { continue };
            let id = rel.to_string_lossy().replace('\\', "/");
            let Some(id) = id.strip_suffix(".json") else { continue };
            let Ok(text) = std::fs::read_to_string(&path) else { continue };
            if let Some(m) = parse(id.to_string(), &text, Source::User(dir.to_path_buf())) {
                by_id.insert(m.id.clone(), m);
            }
        }
        let switch: Switch = std::fs::read_to_string(dir.join("mod.json")).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        for id in switch.on {
            if let Some(m) = by_id.get_mut(&id) {
                m.on = true;
            }
        }
        for id in switch.off {
            if let Some(m) = by_id.get_mut(&id) {
                m.on = false;
            }
        }
    }
    by_id.into_values().collect()
}

/// Switch one mod on or off by writing `dir/mod.json` (the Mods screen, `POST /__mod`); the mod's own file is never
/// touched. Err if no mod has that id. Identical to `setModSwitch` in host/mod.ts.
pub fn set_switch(dir: &Path, id: &str, on: bool) -> Result<(), String> {
    if !mod_list(Some(dir)).iter().any(|m| m.id == id) {
        return Err(format!("no mod {id}"));
    }
    let mut sw: Switch = std::fs::read_to_string(dir.join("mod.json")).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
    sw.on.retain(|x| x != id);
    sw.off.retain(|x| x != id);
    if on { sw.on.push(id.to_string()) } else { sw.off.push(id.to_string()) }
    sw.on.sort();
    sw.off.sort();
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(&serde_json::json!({ "on": sw.on, "off": sw.off })).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("mod.json"), text + "\n").map_err(|e| e.to_string())
}

fn regex(pattern: &str, nocase: bool) -> Option<Regex> {
    static CACHE: OnceLock<Mutex<HashMap<(String, bool), Regex>>> = OnceLock::new();
    let mut cache = CACHE.get_or_init(Default::default).lock().unwrap();
    if let Some(r) = cache.get(&(pattern.to_string(), nocase)) {
        return Some(r.clone());
    }
    match RegexBuilder::new(pattern).case_insensitive(nocase).build() {
        Ok(r) => {
            cache.insert((pattern.to_string(), nocase), r.clone());
            Some(r)
        }
        Err(e) => {
            eprintln!("[mod] bad regex {pattern:?}: {e}");
            None
        }
    }
}

/// `$1`–`$9` → group, `$$` → `$`, any other `$` stays. Identical in host/mod.ts.
fn expand(to: &str, c: &Captures) -> String {
    let mut out = String::new();
    let mut it = to.chars().peekable();
    while let Some(ch) = it.next() {
        if ch == '$' {
            match it.peek() {
                Some('$') => {
                    it.next();
                    out.push('$');
                }
                Some(d) if d.is_ascii_digit() => {
                    let n = d.to_digit(10).unwrap() as usize;
                    it.next();
                    out.push_str(c.get(n).map_or("", |m| m.as_str()));
                }
                _ => out.push('$'),
            }
        } else {
            out.push(ch);
        }
    }
    out
}

/// Rename `function NAME(` to `NAME__body` and declare a re-entry-guarded NAME in its place.
fn guard_reentry(html: String, name: &str) -> String {
    let Some(one) = regex(&format!(r"function\s+{name}\s*\(\s*\)\s*\{{"), false) else { return html };
    let Some(m) = one.find(&html).map(|m| m.range()) else { return html };
    let guard = format!(
        "function {name}() {{ if ({name}.__busy) return; {name}.__busy = true; try {{ return {name}__body.apply(this, arguments); }} finally {{ {name}.__busy = false; }} }}\nfunction {name}__body() {{"
    );
    let mut out = html;
    out.replace_range(m, &guard);
    out
}

struct Ctx<'a> {
    version: &'a str,
    name: &'a str,
    page: bool,
}

impl Mod {
    /// The script an `inject` rule names, relative to this mod's file.
    fn script(&self, inject: &str) -> Option<String> {
        if inject.contains("..") {
            return None;
        }
        let folder = self.id.rsplit_once('/').map_or("", |(d, _)| d);
        let rel = format!("{folder}/{inject}");
        match &self.source {
            Source::BuiltIn => embedded().get(&rel).cloned(),
            Source::User(dir) => std::fs::read_to_string(dir.join(rel)).ok(),
        }
    }

    fn rule(&self, rule: &Rule, text: String, ctx: &Ctx) -> String {
        let fill = |to: &str| to.replace("{version}", ctx.version).replace("{name}", ctx.name);
        if rule.to.as_deref().is_some_and(|t| t.contains("{version}")) && ctx.version.is_empty() {
            return text;
        }
        if let Some(empty) = &rule.empty {
            return fill(empty);
        }
        if let Some(pattern) = &rule.guard {
            let Some(decl) = regex(&format!(r"function\s+({pattern})\s*\(\s*\)\s*\{{"), false) else { return text };
            let name: BTreeSet<String> = decl.captures_iter(&text).map(|c| c[1].to_string()).collect();
            return name.iter().fold(text, |t, n| guard_reentry(t, n));
        }
        if let Some(inject) = &rule.inject {
            if !ctx.page {
                return text;
            }
            let Some(script) = self.script(inject) else { return text };
            let tag = format!("<script>\n{script}\n</script>");
            return match text.to_ascii_lowercase().rfind("</body>") {
                Some(at) => format!("{}{}{}", &text[..at], tag, &text[at..]),
                None => text + &tag,
            };
        }
        let to = fill(rule.to.as_deref().unwrap_or(""));
        if let Some(lit) = &rule.text {
            return if rule.once { text.replacen(lit.as_str(), &to, 1) } else { text.replace(lit.as_str(), &to) };
        }
        if let Some(pattern) = &rule.find {
            let Some(re) = regex(pattern, rule.nocase) else { return text };
            let step = |s: &str| {
                let limit = if rule.once { 1 } else { 0 };
                re.replacen(s, limit, |c: &Captures| expand(&to, c)).into_owned()
            };
            let mut out = step(&text);
            if rule.repeat {
                let mut prev = text;
                while out != prev {
                    prev = out;
                    out = step(&prev);
                }
            }
            return out;
        }
        text
    }

    /// Does this mod apply to this file?
    pub fn matches(&self, rel_path: &str, text: &str) -> bool {
        static FORM: OnceLock<Regex> = OnceLock::new();
        let code = FORM.get_or_init(|| RegexBuilder::new(r"BIR-Form([^/.]+)\.hta$").case_insensitive(true).build().unwrap()).captures(rel_path).map(|c| c[1].to_string());
        let ok = match self.body.file.as_str() {
            "form" => code.is_some(),
            "main" => rel_path.eq_ignore_ascii_case("BIRForms.hta"),
            pattern => regex(pattern, true).is_some_and(|r| r.is_match(rel_path)),
        };
        if !ok {
            return false;
        }
        if let Some(form) = &self.body.form {
            if !code.is_some_and(|c| form.contains(&c)) {
                return false;
            }
        }
        self.body.cond.as_deref().map_or(true, |c| text.contains(c))
    }

    /// Run this mod's rules on a text, ignoring which files it is meant for.
    pub fn run(&self, text: String, version: &str, rel_path: &str) -> String {
        let ctx = Ctx { version, name: rel_path.rsplit('/').next().unwrap_or(rel_path), page: rel_path.to_ascii_lowercase().ends_with(".hta") };
        self.body.rule.iter().fold(text, |t, r| self.rule(r, t, &ctx))
    }
}

/// Apply every switched-on mod that matches this file, in id order.
pub fn apply(list: &[Mod], rel_path: &str, text: String, version: &str) -> String {
    list.iter().fold(text, |t, m| if m.on && m.matches(rel_path, &t) { m.run(t, version, rel_path) } else { t })
}

/// What `GET /__mod` answers: the mods in effect, without their rules.
pub fn summary(list: &[Mod]) -> Value {
    Value::Array(
        list.iter()
            .map(|m| {
                let source = match m.source {
                    Source::BuiltIn => "built-in",
                    Source::User(_) => "user",
                };
                json!({ "id": m.id, "kind": m.id.split('/').next().unwrap_or(""), "title": m.body.title, "about": m.body.about, "on": m.on, "source": source })
            })
            .collect(),
    )
}

#[cfg(test)]
mod test {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("ebf-mod-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn every_built_in_mod_parses_and_compiles() {
        let list = mod_list(None);
        assert!(list.len() >= 20, "{}", list.len());
        for m in &list {
            assert!(!m.body.title.is_empty() && !m.body.about.is_empty(), "{} needs a title and about", m.id);
            for r in &m.body.rule {
                if let Some(p) = &r.find {
                    assert!(regex(p, r.nocase).is_some(), "{}: {p}", m.id);
                }
            }
        }
    }

    #[test]
    fn mods_screen_switch_writes_mod_json() {
        let dir = tmp("switch");
        let _ = std::fs::remove_dir_all(&dir);
        assert!(set_switch(&dir, "fix/print-button-hide", false).is_ok());
        assert!(!mod_list(Some(&dir)).iter().find(|m| m.id == "fix/print-button-hide").unwrap().on);
        assert!(set_switch(&dir, "fix/print-button-hide", true).is_ok());
        assert!(mod_list(Some(&dir)).iter().find(|m| m.id == "fix/print-button-hide").unwrap().on);
        assert!(set_switch(&dir, "fix/no-such-mod", true).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn user_mod_adds_switches_and_overrides() {
        let dir = tmp("user");
        std::fs::create_dir_all(dir.join("improve")).unwrap();
        std::fs::write(dir.join("improve/hello.json"), r#"{"title":"t","about":"a","file":"form","form":["0605"],"rule":[{"inject":"hello.js"},{"find":"(x)(y)","to":"$2$1$$"}]}"#).unwrap();
        std::fs::write(dir.join("improve/hello.js"), "window.hello = 1;").unwrap();
        let list = mod_list(Some(&dir));
        let page = apply(&list, "forms/BIR-Form0605.hta", "<body>xy</body>".into(), "");
        assert_eq!(page, "<body>yx$<script>\nwindow.hello = 1;\n</script></body>");
        assert_eq!(apply(&list, "forms/BIR-Form1601E.hta", "<body>xy</body>".into(), ""), "<body>xy</body>");
        // switch it off, and switch a built-in off
        std::fs::write(dir.join("mod.json"), r#"{"off":["improve/hello","fix/print-button-hide"]}"#).unwrap();
        let list = mod_list(Some(&dir));
        assert_eq!(apply(&list, "forms/BIR-Form0605.hta", "<body>xy $(this.id)</body>".into(), ""), "<body>xy $(this.id)</body>");
        assert_eq!(summary(&list).as_array().unwrap().iter().filter(|m| m["on"] == false).count(), 2);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
