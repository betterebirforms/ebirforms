use std::path::{Path, PathBuf};

/// Every file under the repo's mod/ folder (relative path, text), so the packaged app carries the built-in mods
/// (src/bir_mod.rs reads them from OUT_DIR/mod.json).
fn mod_file(root: &Path, dir: &Path, out: &mut Vec<(String, String)>) {
    let Ok(entry) = std::fs::read_dir(dir) else { return };
    let mut entry: Vec<PathBuf> = entry.filter_map(|e| e.ok().map(|e| e.path())).collect();
    entry.sort();
    for path in entry {
        if path.is_dir() {
            mod_file(root, &path, out);
        } else if path.extension().is_some_and(|e| e == "json" || e == "js") {
            let rel = path.strip_prefix(root).unwrap().to_string_lossy().replace('\\', "/");
            out.push((rel, std::fs::read_to_string(&path).expect("mod file is UTF-8")));
        }
    }
}

fn json_string(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

fn main() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../mod");
    println!("cargo:rerun-if-changed={}", root.display());
    let mut file = Vec::new();
    mod_file(&root, &root, &mut file);
    assert!(!file.is_empty(), "no built-in mods found in {}: the app would serve BIR's pages unfixed", root.display());
    let body: Vec<String> = file.iter().map(|(p, t)| format!("[{},{}]", json_string(p), json_string(t))).collect();
    let out = PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("mod.json");
    std::fs::write(out, format!("[{}]", body.join(","))).unwrap();
    tauri_build::build()
}
