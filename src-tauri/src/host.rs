//! Loopback HTTP host for the packaged app — the Rust twin of host/legacy-server.ts, same protocol:
//!
//!   GET  /, /assets/…          the built shell (dist/), index.html gets the per-run token
//!   GET  /legacy/<path>        overlay read: data root, then the imported original; .hta → shim + patches
//!   POST /__vfs                {op, …} → JSON, x-ebf-token required
//!   GET  /__status             {has_form}
//!   POST /__import             body = the official zip / installer / BIRForms.exe → rebuilds `original/`
//!
//! Writes only land in the data root. Bound to 127.0.0.1 only.

use crate::{bir_mod, codec, package};
#[cfg(feature = "bir-submit")]
use crate::{crypto, dispatch, submit};
use serde_json::{json, Value};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;
use tiny_http::{Header, Method, Request, Response, Server};

/// The built shell (Tauri embeds dist/ in the binary): path → (bytes, mime).
pub type AssetFn = Box<dyn Fn(&str) -> Option<(Vec<u8>, String)> + Send>;

pub struct Host {
    pub asset: AssetFn,
    /// Where an imported package lives (`POST /__import` replaces it). Writable.
    pub original: PathBuf,
    /// The BIR tree a packaged build ships with (`npm run package` → Resources/bir). Read-only; served only while
    /// nothing has been imported into `original`.
    pub shipped: Option<PathBuf>,
    pub data: PathBuf,
    /// The user's own mods and on/off switches (mod/README.md). Kept apart from `data`, which BIR's pages write to.
    pub mod_dir: Option<PathBuf>,
    pub token: String,
    /// Native print of the main window (WKWebView has no working window.print()).
    pub print: Box<dyn Fn() -> Result<(), String> + Send>,
    /// BIR's Exit (`window.close()` in an HTA quit eBIRForms): close the app window.
    pub close: Box<dyn Fn() -> Result<(), String> + Send>,
    /// BIR's decrypted connection per TIN/form from the dispatcher. Never sent to a page.
    #[cfg(feature = "bir-submit")]
    pub conn: std::sync::Mutex<std::collections::BTreeMap<String, dispatch::Connection>>,
}

/// What the shareable build says when BIR's Submit button is pressed.
#[cfg(not(feature = "bir-submit"))]
const NO_SUBMIT: &str = "Online submission isn't available in this build. Your final copy is saved; file it through BIR's eBIRForms or eFPS.";

type Reply = Response<std::io::Cursor<Vec<u8>>>;

fn header(k: &str, v: &str) -> Header {
    Header::from_bytes(k.as_bytes(), v.as_bytes()).expect("valid header")
}

fn mime(ext: &str) -> &'static str {
    match ext {
        "hta" | "html" | "htm" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json",
        "xml" => "text/xml; charset=windows-1252",
        "txt" => "text/plain; charset=windows-1252",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn bytes(status: u16, content_type: &str, body: Vec<u8>) -> Reply {
    Response::from_data(body)
        .with_status_code(status)
        .with_header(header("content-type", content_type))
        .with_header(header("cache-control", "no-store"))
}

/// What BIR's pages may load and reach: only this host. BIR's own scripts are inline and use eval, so those stay;
/// everything that could carry a return off the machine (fetch/XHR, form posts, frames, plugins) is limited to
/// 'self'. The shim already redirects BIR's XHR to /__offline; this also covers fetch, <img>, <form> and any mod.
pub const PAGE_CSP: &str = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; \
img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' blob: data:; object-src 'none'; \
base-uri 'self'; form-action 'self'";

/// The page headers every BIR page gets (both hosts send the same; test/host-security.test.ts and the Rust test).
fn page(body: Vec<u8>, content_type: &str) -> Reply {
    bytes(200, content_type, body)
        .with_header(header("content-security-policy", PAGE_CSP))
        .with_header(header("x-content-type-options", "nosniff"))
        .with_header(header("referrer-policy", "no-referrer"))
}

/// DNS rebinding guard: a request is served only if it names this machine (`127.0.0.1`, `localhost` or `[::1]`,
/// any port). Without it, a website whose name points at 127.0.0.1 could read the token from `/` and then the
/// user's profiles and returns, since its pages would count as same-origin.
pub fn local_host(value: Option<&str>) -> bool {
    let Some(v) = value else { return false };
    let name = if v.starts_with('[') { v.split(']').next().map(|h| format!("{h}]")).unwrap_or_default() } else { v.split(':').next().unwrap_or("").to_string() };
    matches!(name.to_ascii_lowercase().as_str(), "127.0.0.1" | "localhost" | "[::1]")
}

fn json_reply(v: Value) -> Reply {
    bytes(200, "application/json", v.to_string().into_bytes())
}

/// Install-root-relative path → a clean relative path, refusing anything that escapes.
fn clean(raw: &str) -> Result<PathBuf, String> {
    let p = raw.replace('\\', "/");
    let p = p.trim_start_matches("./").trim_start_matches('/');
    if p.len() >= 2 && p.as_bytes()[1] == b':' {
        return Err(format!("absolute path outside the install root: {raw}"));
    }
    let mut out = PathBuf::new();
    for c in Path::new(p).components() {
        match c {
            Component::Normal(s) => out.push(s),
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            _ => return Err(format!("path escapes the install root: {raw}")),
        }
    }
    Ok(out)
}

fn modified_ms(m: &fs::Metadata) -> f64 {
    m.modified().ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}

impl Host {
    /// The BIR tree being served: an imported package wins over the shipped one.
    pub fn base(&self) -> &Path {
        let form = |p: &Path| p.join("forms/BIR-Form0605.hta").exists();
        match &self.shipped {
            Some(s) if !form(&self.original) && form(s) => s,
            _ => &self.original,
        }
    }

    fn readable(&self, rel: &Path) -> Option<PathBuf> {
        [self.data.join(rel), self.base().join(rel)].into_iter().find(|p| p.exists())
    }

    pub fn has_form(&self) -> bool {
        self.base().join("forms/BIR-Form0605.hta").exists()
    }

    fn vfs(&self, req: &Value) -> Result<Value, String> {
        let s = |k: &str| req.get(k).and_then(Value::as_str).unwrap_or("");
        match s("op") {
            "read" => {
                let rel = clean(s("path"))?;
                match self.readable(&rel).filter(|p| p.is_file()) {
                    Some(p) => Ok(json!({ "ok": true, "text": codec::decode_cp1252(&fs::read(p).map_err(|e| e.to_string())?) })),
                    None => Ok(json!({ "ok": false, "error": "File not found" })),
                }
            }
            "write" => {
                let rel = clean(s("path"))?;
                let target = self.data.join(&rel);
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                let mut text = s("text").to_string();
                if rel.starts_with("savefile") && text.contains("ebirOnline") {
                    text = codec::strip_secret(&text);
                }
                let mut byte = if req.get("append").and_then(Value::as_bool) == Some(true) && target.exists() {
                    fs::read(&target).map_err(|e| e.to_string())?
                } else {
                    Vec::new()
                };
                byte.extend(codec::encode_cp1252(&text));
                fs::write(&target, byte).map_err(|e| e.to_string())?;
                Ok(json!({ "ok": true }))
            }
            "stat" => {
                let rel = clean(s("path"))?;
                Ok(match self.readable(&rel).and_then(|p| fs::metadata(p).ok()) {
                    None => json!({ "ok": true, "kind": "none" }),
                    Some(m) => json!({ "ok": true, "kind": if m.is_dir() { "folder" } else { "file" }, "size": m.len(), "modified_ms": modified_ms(&m) }),
                })
            }
            "list" => {
                let rel = clean(s("path"))?;
                let mut file = std::collections::BTreeMap::new();
                let mut folder = std::collections::BTreeSet::new();
                for root in [self.base().join(&rel), self.data.join(&rel)] {
                    let Ok(entry) = fs::read_dir(&root) else { continue };
                    for e in entry.flatten() {
                        let name = e.file_name().to_string_lossy().to_string();
                        let Ok(m) = e.metadata() else { continue };
                        if m.is_dir() {
                            folder.insert(name);
                        } else if name != ".gitkeep" {
                            file.insert(name.clone(), json!({ "name": name, "size": m.len(), "modified_ms": modified_ms(&m) }));
                        }
                    }
                }
                Ok(json!({ "ok": true, "file": file.into_values().collect::<Vec<_>>(), "folder": folder }))
            }
            "mkdir" => {
                fs::create_dir_all(self.data.join(clean(s("path"))?)).map_err(|e| e.to_string())?;
                Ok(json!({ "ok": true }))
            }
            "copy" => {
                let Some(from) = self.readable(&clean(s("from"))?) else { return Ok(json!({ "ok": false, "error": "File not found" })) };
                let mut to = self.data.join(clean(s("to"))?);
                if s("to").ends_with('/') {
                    to = to.join(from.file_name().unwrap_or_default());
                }
                if to.exists() && req.get("overwrite").and_then(Value::as_bool) == Some(false) {
                    return Ok(json!({ "ok": false, "error": "File already exists" }));
                }
                if let Some(parent) = to.parent() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                fs::copy(from, to).map_err(|e| e.to_string())?;
                Ok(json!({ "ok": true }))
            }
            "move" => {
                let from = self.data.join(clean(s("from"))?);
                if !from.exists() {
                    return Ok(json!({ "ok": false, "error": "File not found" }));
                }
                let to = self.data.join(clean(s("to"))?);
                if let Some(parent) = to.parent() {
                    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                }
                fs::rename(from, to).map_err(|e| e.to_string())?;
                Ok(json!({ "ok": true }))
            }
            "delete" => {
                let p = self.data.join(clean(s("path"))?);
                if p.is_file() {
                    fs::remove_file(p).map_err(|e| e.to_string())?;
                }
                Ok(json!({ "ok": true }))
            }
            "rmdir" => {
                let rel = clean(s("path"))?;
                let p = self.data.join(&rel);
                if rel.as_os_str().len() > 0 && p.is_dir() {
                    fs::remove_dir_all(p).map_err(|e| e.to_string())?;
                }
                Ok(json!({ "ok": true }))
            }
            "dispatch" => Ok(self.dispatch_op(s("tin"), s("form_code"))),
            "send" => Ok(self.send_op(req)),
            "run" => {
                let command = s("command").replace('\\', "/").to_ascii_lowercase();
                let exe = command.rsplit('/').next().unwrap_or("");
                let arg0 = req.get("argument").and_then(|a| a.get(0)).and_then(Value::as_str).unwrap_or("");
                Ok(match exe {
                    "chkt.exe" => json!({ "ok": true, "exit_code": codec::validate_tin(arg0) }),
                    "encrypt.exe" => match self.encrypt_in_place(arg0) {
                        Ok(()) => json!({ "ok": true, "exit_code": 0 }),
                        Err(e) => json!({ "ok": true, "exit_code": 1, "note": e }),
                    },
                    // the shim sends through the "send" op; BIR's own exes are never run
                    "ebfsftp.exe" | "cftpsend.exe" => json!({ "ok": true, "exit_code": 1, "note": "BIR's uploaders are replaced by the send op" }),
                    other => json!({ "ok": true, "exit_code": 1, "note": format!("unknown helper {other}") }),
                })
            }
            other => Err(format!("unknown op {other}")),
        }
    }

    fn import(&self, body: &[u8]) -> Result<Value, String> {
        let tree = package::import(body)?;
        let staging = self.original.with_extension("importing");
        let _ = fs::remove_dir_all(&staging);
        for (rel, data) in &tree {
            let p = staging.join(clean(rel)?);
            if let Some(parent) = p.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(p, data).map_err(|e| e.to_string())?;
        }
        let _ = fs::remove_dir_all(&self.original);
        fs::rename(&staging, &self.original).map_err(|e| e.to_string())?;
        Ok(json!({ "ok": true, "file_count": tree.len() }))
    }

    #[cfg(feature = "bir-submit")]
    fn known_hosts_path(&self) -> PathBuf {
        self.data.join("known_hosts.json")
    }

    /// The package version from BIR's Release Notes (first `vX.X.X.X`); "" if not found. (WL bug 18)
    fn package_version(&self) -> String {
        use std::sync::OnceLock;
        static RE: OnceLock<regex::Regex> = OnceLock::new();
        let re = RE.get_or_init(|| regex::Regex::new(r"v(\d+\.\d+\.\d+(?:\.\d+)?)").unwrap());
        // a packaged build records the version BIR announces in its own name (stage-package.mjs)
        if let Ok(text) = fs::read(self.base().join("_package.json")) {
            if let Some(v) = serde_json::from_slice::<Value>(&text).ok().and_then(|v| v["bir_version"].as_str().map(str::to_string)) {
                return v;
            }
        }
        for rel in ["_installer/Release Notes.txt", "Release Notes 7.9.6.1.txt"] {
            if let Ok(text) = fs::read(self.base().join(rel)) {
                if let Some(m) = re.captures(&String::from_utf8_lossy(&text)) {
                    return m[1].to_string();
                }
            }
        }
        String::new()
    }

    #[cfg(feature = "bir-submit")]
    fn load_known_hosts(&self) -> submit::KnownHost {
        fs::read(self.known_hosts_path()).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
    }

    #[cfg(feature = "bir-submit")]
    /// The ebfSFTP passphrase, read at runtime from the user's own imported ebfSFTP.exe (never stored),
    /// exactly as `crypto::passphrase_from_encrypt_exe` reads Encrypt.exe. An env override aids testing.
    fn sftp_passphrase(&self) -> Result<String, String> {
        if let Ok(p) = std::env::var("EBF_SFTP_PASSPHRASE") {
            if !p.is_empty() {
                return Ok(p);
            }
        }
        let exe = std::env::var("EBF_SFTP_EXE")
            .map(PathBuf::from)
            .unwrap_or_else(|_| self.original.join("_installer/ebfSFTP.exe"));
        let image = fs::read(&exe).map_err(|_| {
            "This copy of the package has no ebfSFTP.exe, so it can't ask BIR where to upload. Re-import from the full official installer (.zip), not BIRForms.exe alone — or set the connection details by hand.".to_string()
        })?;
        dispatch::passphrase_from_sftp_exe(&image)
            .ok_or_else(|| "could not read the SFTP passphrase from ebfSFTP.exe".to_string())
    }

    /// A path as BIR's pages pass it to a helper exe: relative ("IAF_RDO_Copy/x.xml") or under the shim's fake
    /// install root ("C:\\eBIRForms\\IAF_RDO_Copy\\x.xml").
    fn rel_of(raw: &str) -> String {
        let p = raw.trim().trim_matches('"').replace('\\', "/");
        let low = p.to_ascii_lowercase();
        match low.strip_prefix("c:/ebirforms/") {
            Some(_) => p["c:/ebirforms/".len()..].to_string(),
            None => p,
        }
    }

    #[cfg(feature = "bir-submit")]
    fn encrypt_cipher(&self) -> Result<crypto::EbfCipher, String> {
        let exe = fs::read(self.original.join("_installer/Encrypt.exe")).map_err(|_| {
            "This copy of the package has no Encrypt.exe. Re-import from the full official installer (.zip), not BIRForms.exe alone.".to_string()
        })?;
        let passphrase = crypto::passphrase_from_encrypt_exe(&exe).ok_or("could not read the encryption passphrase from Encrypt.exe")?;
        Ok(crypto::EbfCipher::new(&passphrase))
    }

    #[cfg(feature = "bir-submit")]
    /// What Encrypt.exe does to a final copy in IAF_RDO_Copy: compress + encrypt the file in place.
    fn encrypt_in_place(&self, raw: &str) -> Result<(), String> {
        let rel = clean(&Self::rel_of(raw))?;
        let p = self.data.join(&rel);
        let plain = fs::read(&p).map_err(|_| format!("{} not found", rel.display()))?;
        let cipher = self.encrypt_cipher()?;
        fs::write(&p, crypto::encrypt_file(&cipher, &plain)).map_err(|e| e.to_string())
    }

    #[cfg(feature = "bir-submit")]
    /// Optional HTTP proxy from settings/submit.json (`proxy_host`, `proxy_port`), like BIR's proxy.ini.
    fn proxy(&self) -> Option<(String, u16)> {
        let v: Value = serde_json::from_slice(&fs::read(self.data.join("settings/submit.json")).ok()?).ok()?;
        let host = v.get("proxy_host").and_then(Value::as_str).unwrap_or("").trim().to_string();
        if host.is_empty() {
            return None;
        }
        Some((host, v.get("proxy_port").and_then(Value::as_u64).unwrap_or(8080) as u16))
    }

    #[cfg(feature = "bir-submit")]
    fn runtime() -> Result<tokio::runtime::Runtime, String> {
        tokio::runtime::Builder::new_current_thread().enable_all().build().map_err(|e| e.to_string())
    }

    #[cfg(feature = "bir-submit")]
    fn conn_key(tin: &str, form_code: &str) -> String {
        let tin9: String = tin.chars().filter(char::is_ascii_digit).take(9).collect();
        format!("{tin9}/{form_code}")
    }

    #[cfg(feature = "bir-submit")]
    /// `conService.initConConfig(tin, form)`: ask BIR's dispatcher where this return goes. The decrypted login stays
    /// here; the page only learns `mode` ("0" = online filing not open → BIR's own offline final-copy path).
    fn dispatch_op(&self, tin: &str, form_code: &str) -> Value {
        let closed = |note: String| json!({ "ok": true, "mode": "0", "note": note });
        let tin9: String = tin.chars().filter(char::is_ascii_digit).collect();
        if tin9.len() < 9 || form_code.is_empty() || !form_code.chars().all(|c| c.is_ascii_alphanumeric()) {
            return closed("no TIN or form code to ask BIR about".into());
        }
        let passphrase = match self.sftp_passphrase() {
            Ok(p) => p,
            Err(e) => return closed(e),
        };
        // EBF_DISPATCH_HOST points tests (and a UAT run) at a stand-in; nothing else picks the host
        let host: Vec<String> = match std::env::var("EBF_DISPATCH_HOST") {
            Ok(h) if !h.trim().is_empty() => h.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect(),
            _ => dispatch::DISPATCH_HOST.iter().map(|x| x.to_string()).collect(),
        };
        let host_ref: Vec<&str> = host.iter().map(String::as_str).collect();
        let proxy = self.proxy();
        let runtime = match Self::runtime() {
            Ok(r) => r,
            Err(e) => return closed(e),
        };
        let answer = runtime.block_on(dispatch::dispatch(&tin9[..9], form_code, dispatch::EBIR_VERSION, &passphrase, &host_ref, |url| {
            let proxy = proxy.clone();
            async move { dispatch::http_get(&url, proxy.as_ref().map(|(h, p)| (h.as_str(), *p)), 8000).await }
        }));
        match answer {
            Ok(conn) => {
                let mode = conn.mode.clone();
                self.conn.lock().unwrap().insert(Self::conn_key(tin, form_code), conn);
                json!({ "ok": true, "mode": mode })
            }
            Err(e) => closed(e),
        }
    }

    #[cfg(feature = "bir-submit")]
    /// `RenameAndSendFile` (eBIRTools.vbs) + ebfSFTP.exe: rename the encrypted copy to `<name>#<email>#.xml` and upload
    /// it to BIR's folder over SFTP with the dispatcher's login. The SSH host key is pinned on first use and a changed
    /// key is refused (ebfSFTP accepted any). exit_code 0 = sent, as the VBS returned.
    fn send_op(&self, req: &Value) -> Value {
        let s = |k: &str| req.get(k).and_then(Value::as_str).unwrap_or("").to_string();
        let fail = |note: String| json!({ "ok": true, "exit_code": 1, "note": note });
        let rel = match clean(&Self::rel_of(&s("path"))) {
            Ok(r) => r,
            Err(e) => return fail(e),
        };
        let email = s("email");
        if email.chars().any(|c| matches!(c, '#' | '/' | '\\' | ':' | '"')) {
            return fail("that email address cannot be part of a file name".into());
        }
        let src = self.data.join(&rel);
        let stem = src.file_stem().and_then(|x| x.to_str()).unwrap_or("return").to_string();
        let name = if email.is_empty() { format!("{stem}.xml") } else { format!("{stem}#{email}#.xml") };
        let dest = src.with_file_name(&name);
        if src.is_file() && src != dest {
            if let Err(e) = fs::rename(&src, &dest) {
                return fail(e.to_string());
            }
        }
        let data = match fs::read(&dest) {
            Ok(d) => d,
            Err(_) => return fail(format!("{} not found", rel.display())),
        };
        let form_code = s("form_code");
        let Some(conn) = self.conn.lock().unwrap().get(&Self::conn_key(&s("tin"), &form_code)).cloned() else {
            return fail("BIR's dispatcher has not opened online filing for this return".into());
        };
        let folder: String = s("folder").trim_matches('/').to_string();
        let folder = if !folder.is_empty() && folder.chars().all(|c| c.is_ascii_alphanumeric() || c == '/') {
            folder
        } else {
            dispatch::ftp_folder_of(&form_code)
        };
        let target = submit::SubmitTarget {
            host: conn.host,
            port: conn.port,
            user: conn.user,
            password: conn.password,
            folder,
            form_code,
            proxy: self.proxy(),
        };
        let mut known = self.load_known_hosts();
        let runtime = match Self::runtime() {
            Ok(r) => r,
            Err(e) => return fail(e),
        };
        match runtime.block_on(submit::upload(&target, &name, &data, &known)) {
            Ok(done) => {
                if known.insert(target.host.clone(), done.host_fingerprint.clone()).as_ref() != Some(&done.host_fingerprint) {
                    let _ = fs::write(self.known_hosts_path(), serde_json::to_vec_pretty(&known).unwrap_or_default());
                }
                json!({ "ok": true, "exit_code": 0, "remote_path": done.remote_path })
            }
            Err(submit::SubmitError::HostKeyChanged { host, pinned, seen }) => json!({
                "ok": true, "exit_code": 1, "note": "BIR's upload server presented a different SSH key",
                "host_key_changed": { "host": host, "pinned": pinned, "seen": seen }
            }),
            Err(e) => fail(e.to_string()),
        }
    }

    /// Shareable build (no `bir-submit`): never asks BIR's dispatcher. mode "0" sends BIR's page down its own
    /// offline final-copy path, as when online filing is closed.
    #[cfg(not(feature = "bir-submit"))]
    fn dispatch_op(&self, _tin: &str, _form_code: &str) -> Value {
        json!({ "ok": true, "mode": "0", "available": false, "note": NO_SUBMIT })
    }

    #[cfg(not(feature = "bir-submit"))]
    fn send_op(&self, _req: &Value) -> Value {
        json!({ "ok": true, "exit_code": 1, "note": NO_SUBMIT })
    }

    /// Shareable build: the final copy stays a plain, read-only savefile; Encrypt.exe is never read.
    #[cfg(not(feature = "bir-submit"))]
    fn encrypt_in_place(&self, raw: &str) -> Result<(), String> {
        let rel = clean(&Self::rel_of(raw))?;
        if self.data.join(&rel).is_file() { Ok(()) } else { Err(format!("{} not found", rel.display())) }
    }

    #[cfg(not(feature = "bir-submit"))]
    fn repin(&self, _req: &Value) -> Result<Value, String> {
        Err(NO_SUBMIT.into())
    }

    #[cfg(feature = "bir-submit")]
    /// Replace the stored pin for a host (the user explicitly accepted a new key).
    fn repin(&self, req: &Value) -> Result<Value, String> {
        let host = req.get("host").and_then(Value::as_str).unwrap_or("").to_string();
        let fingerprint = req.get("fingerprint").and_then(Value::as_str).unwrap_or("").to_string();
        if host.is_empty() || fingerprint.is_empty() {
            return Err("host and fingerprint required".into());
        }
        let mut known = self.load_known_hosts();
        known.insert(host, fingerprint);
        fs::write(self.known_hosts_path(), serde_json::to_vec_pretty(&known).unwrap_or_default()).map_err(|e| e.to_string())?;
        Ok(json!({ "ok": true }))
    }

    fn handle(&self, req: &mut Request) -> Reply {
        let url = req.url().to_string();
        let path = url.split('?').next().unwrap_or("/").to_string();
        let token_ok = req.headers().iter().any(|h| h.field.equiv("x-ebf-token") && h.value.as_str() == self.token);
        let host = req.headers().iter().find(|h| h.field.equiv("host")).map(|h| h.value.as_str().to_string());
        if !local_host(host.as_deref()) {
            return bytes(421, "text/plain", b"this server only answers to 127.0.0.1".to_vec());
        }
        let mut body = Vec::new();
        if *req.method() == Method::Post {
            let _ = req.as_reader().read_to_end(&mut body);
        }

        match (req.method(), path.as_str()) {
            (Method::Post, p) if p.starts_with("/__") && !token_ok => bytes(403, "text/plain", b"forbidden".to_vec()),
            (Method::Post, "/__vfs") => {
                let reply = serde_json::from_slice::<Value>(&body)
                    .map_err(|e| e.to_string())
                    .and_then(|r| self.vfs(&r))
                    .unwrap_or_else(|e| json!({ "ok": false, "error": e }));
                json_reply(reply)
            }
            (Method::Post, "/__import") => json_reply(self.import(&body).unwrap_or_else(|e| json!({ "ok": false, "error": e }))),
            (Method::Post, "/__repin") => {
                let reply = serde_json::from_slice::<Value>(&body).map_err(|e| e.to_string()).and_then(|r| self.repin(&r)).unwrap_or_else(|e| json!({ "ok": false, "error": e }));
                json_reply(reply)
            }
            (Method::Post, "/__mod") => {
                // the Mods screen's on/off switch: writes mod.json in the user's mod folder
                let v: Value = serde_json::from_slice(&body).unwrap_or(Value::Null);
                let reply = match (self.mod_dir.as_deref(), v["id"].as_str(), v["on"].as_bool()) {
                    (Some(dir), Some(id), Some(on)) => bir_mod::set_switch(dir, id, on).map(|_| json!({ "ok": true })),
                    _ => Err("no such mod, or no mod folder".to_string()),
                };
                json_reply(reply.unwrap_or_else(|e| json!({ "ok": false, "error": e })))
            }
            (Method::Post, "/__print") => json_reply(match (self.print)() {
                Ok(()) => json!({ "ok": true }),
                Err(e) => json!({ "ok": false, "error": e }),
            }),
            (Method::Post, "/__close") => json_reply(match (self.close)() {
                Ok(()) => json!({ "ok": true }),
                Err(e) => json!({ "ok": false, "error": e }),
            }),
            (_, "/__offline") => bytes(404, "text/plain", Vec::new()), // where the shim sends BIR's network calls
            (Method::Get, "/__mod") => json_reply(json!({ "ok": true, "mod": bir_mod::summary(&bir_mod::mod_list(self.mod_dir.as_deref())) })),
            (Method::Get, "/__status") => json_reply(json!({ "ok": true, "has_form": self.has_form() })),
            (Method::Get, p) if p.starts_with("/legacy/") => self.legacy(&p["/legacy/".len()..]),
            (Method::Get, p) => self.shell(p),
            _ => bytes(405, "text/plain", Vec::new()),
        }
    }

    fn legacy(&self, raw: &str) -> Reply {
        let rel_str = percent_decode(raw);
        // BIRForms.hta is BIR's real main screen; it renders 1:1 through the same shim the forms use
        // (it used to 302 to the React shell — removed when the shell became the served HTA itself).
        let Ok(rel) = clean(&rel_str) else { return bytes(400, "text/plain", Vec::new()) };
        let Some(p) = self.readable(&rel).filter(|p| p.is_file()) else {
            // several forms reference scripts BIR never shipped (WL bug 19); serve an empty 200 so a missing
            // script is a no-op, not a 404 on every form open
            let low = rel_str.to_ascii_lowercase();
            if low.ends_with(".js") {
                return bytes(200, mime("js"), format!("/* {rel_str} not shipped by BIR; served empty */").into_bytes());
            }
            if low.ends_with(".png") || low.ends_with(".jpg") || low.ends_with(".jpeg") || low.ends_with(".gif") {
                return bytes(200, "image/png", transparent_png()); // a few print images were never shipped
            }
            return bytes(404, "text/plain", Vec::new());
        };
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
        if ext == "vbs" {
            return bytes(200, mime("js"), b"/* eBIRTools.vbs is provided by legacy-shim.js */".to_vec());
        }
        let Ok(data) = fs::read(&p) else { return bytes(500, "text/plain", Vec::new()) };
        if ext == "hta" {
            let html = String::from_utf8_lossy(&data).trim_start_matches('\u{feff}').to_string();
            let html = bir_mod::apply(&bir_mod::mod_list(self.mod_dir.as_deref()), &rel_str, html, "");
            // data-submit: whether this build can send a return to BIR at all (the downloads can't)
            let tag = format!(r#"<script src="/legacy-shim.js" data-token="{}" data-submit="{}"></script>"#, self.token, if cfg!(feature = "bir-submit") { 1 } else { 0 });
            let html = match html.to_ascii_lowercase().find("<head") {
                Some(at) => {
                    let end = html[at..].find('>').map(|e| at + e + 1).unwrap_or(at);
                    format!("{}{}{}", &html[..end], tag, &html[end..])
                }
                None => format!("{tag}{html}"),
            };
            return page(html.into_bytes(), mime("hta"));
        }
        if ext == "js" {
            // replace BIR's vulnerable jQuery/jQuery-UI with vendored patched versions (WL bug 7)
            let lower = rel_str.to_ascii_lowercase();
            if let Some(patched) = patched_jquery(&lower) {
                return bytes(200, mime("js"), patched.to_vec());
            }
            return bytes(200, mime("js"), bir_mod::apply(&bir_mod::mod_list(self.mod_dir.as_deref()), &rel_str, String::from_utf8_lossy(&data).into_owned(), &self.package_version()).into_bytes());
        }
        bytes(200, mime(&ext), data)
    }

    fn shell(&self, raw: &str) -> Reply {
        let rel = percent_decode(raw);
        let rel = rel.trim_start_matches('/');
        let found = if rel.is_empty() { None } else { (self.asset)(rel) };
        let (data, mime_type, is_index) = match found {
            Some((d, m)) => (d, m, false),
            None => match (self.asset)("index.html") {
                Some((d, m)) => (d, m, true), // SPA fallback
                None => return bytes(404, "text/plain", b"shell missing".to_vec()),
            },
        };
        if is_index || rel == "index.html" {
            let html = String::from_utf8_lossy(&data).replacen("<head>", &format!(r#"<head><meta name="ebf-token" content="{}" />"#, self.token), 1);
            return page(html.into_bytes(), mime("html"));
        }
        bytes(200, &mime_type, data)
    }

    /// Serve forever on 127.0.0.1:port (blocking; run on its own thread).
    pub fn serve(self, server: Server) {
        for mut req in server.incoming_requests() {
            let reply = self.handle(&mut req);
            let _ = req.respond(reply);
        }
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// Vendored patched jQuery (3.7.1) and jQuery UI (1.13.3), embedded in the binary; replace BIR's vulnerable copies.
const JQUERY: &[u8] = include_bytes!("../../host/asset/jquery-3.7.1.min.js");
const JQUERY_UI: &[u8] = include_bytes!("../../host/asset/jquery-ui-1.13.3.min.js");

/// 1×1 transparent PNG for print images BIR never shipped.
fn transparent_png() -> Vec<u8> {
    const B64: &[u8] = b"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    // tiny inline base64 decode (no extra dep; input is a fixed constant)
    const T: [i8; 123] = {
        let mut t = [-1i8; 123];
        let mut i = 0;
        while i < 64 {
            let c = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"[i];
            t[c as usize] = i as i8;
            i += 1;
        }
        t
    };
    let mut out = Vec::new();
    let (mut acc, mut bits) = (0u32, 0u32);
    for &c in B64 {
        if c == b'=' {
            break;
        }
        acc = (acc << 6) | T[c as usize] as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    out
}

fn patched_jquery(rel_lower: &str) -> Option<&'static [u8]> {
    let name = rel_lower.rsplit('/').next().unwrap_or("");
    if name.starts_with("jquery-ui") && name.ends_with(".js") {
        Some(JQUERY_UI)
    } else if name.starts_with("jquery-") && name.as_bytes().get(7).is_some_and(u8::is_ascii_digit) && name.ends_with(".js") {
        Some(JQUERY)
    } else {
        None
    }
}

pub fn random_token() -> String {
    let mut b = [0u8; 16];
    getrandom::getrandom(&mut b).expect("OS randomness");
    b.iter().map(|x| format!("{x:02x}")).collect()
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn answers_only_to_this_machine() {
        for ok in ["127.0.0.1:10907", "localhost:10907", "LOCALHOST", "[::1]:10907", "127.0.0.1"] {
            assert!(local_host(Some(ok)), "{ok}");
        }
        // a rebinding attacker's name, a lookalike, a LAN name, and no Host header at all
        for bad in ["evil.example:10907", "127.0.0.1.evil.example", "localhost.evil.example:10907", "192.168.1.5:10907", ""] {
            assert!(!local_host(Some(bad)), "{bad}");
        }
        assert!(!local_host(None));
    }

    #[test]
    fn bir_pages_cannot_reach_the_network() {
        assert!(PAGE_CSP.contains("connect-src 'self'"));
        assert!(PAGE_CSP.contains("form-action 'self'"));
        assert!(PAGE_CSP.contains("object-src 'none'"));
        assert!(!PAGE_CSP.contains("http"), "no outside origin is allowed");
    }

    #[test]
    fn clean_refuses_escapes() {
        assert_eq!(clean("savefile/a.xml").unwrap(), PathBuf::from("savefile/a.xml"));
        assert_eq!(clean("forms/../xml/rdo.xml").unwrap(), PathBuf::from("xml/rdo.xml"));
        assert_eq!(clean("../../etc/passwd").unwrap(), PathBuf::from("etc/passwd"));
        assert!(clean("C:/Windows/x").is_err());
    }

    #[test]
    fn percent_decodes_paths() {
        assert_eq!(percent_decode("img/a%20b.png"), "img/a b.png");
        assert_eq!(percent_decode("x%2"), "x%2");
    }
}

/// The shareable build answers BIR's Submit without touching the network or BIR's helpers (ROADMAP P4).
#[cfg(all(test, not(feature = "bir-submit")))]
mod shareable_test {
    use super::*;

    #[test]
    fn shipped_tree_serves_until_an_import_and_import_never_touches_it() {
        let root = std::env::temp_dir().join(format!("ebf-shipped-{}", random_token()));
        let shipped = root.join("Resources/bir");
        fs::create_dir_all(shipped.join("forms")).unwrap();
        fs::write(shipped.join("forms/BIR-Form0605.hta"), "shipped").unwrap();
        fs::write(shipped.join("_package.json"), r#"{"bir_version":"7.9.6.2.1"}"#).unwrap();
        let mut h = host(root.join("data"));
        h.original = root.join("original");
        assert!(!h.has_form(), "no shipped tree, nothing imported");
        h.shipped = Some(shipped.clone());
        assert!(h.has_form());
        assert_eq!(h.base(), shipped.as_path());
        assert_eq!(h.package_version(), "7.9.6.2.1");
        // an import lands in `original` and wins from then on; the shipped tree is untouched
        fs::create_dir_all(h.original.join("forms")).unwrap();
        fs::write(h.original.join("forms/BIR-Form0605.hta"), "imported").unwrap();
        assert_eq!(h.base(), h.original.as_path());
        assert_eq!(fs::read_to_string(shipped.join("forms/BIR-Form0605.hta")).unwrap(), "shipped");
        let _ = fs::remove_dir_all(&root);
    }

    fn host(data: PathBuf) -> Host {
        Host {
            asset: Box::new(|_| None),
            original: data.join("original"),
            shipped: None,
            data,
            mod_dir: None,
            token: "t".into(),
            print: Box::new(|| Ok(())),
            close: Box::new(|| Ok(())),
        }
    }

    #[test]
    fn submit_is_closed_and_final_copy_stays_plain() {
        let dir = std::env::temp_dir().join(format!("ebf-share-{}", std::process::id()));
        fs::create_dir_all(dir.join("IAF_RDO_Copy")).unwrap();
        fs::write(dir.join("IAF_RDO_Copy/r.xml"), b"<div>k=v</div>").unwrap();
        let h = host(dir.clone());
        let d = h.dispatch_op("123456789000", "1701Q");
        assert_eq!(d["mode"], "0");
        assert!(d["note"].as_str().unwrap().contains("isn't available in this build"));
        assert_eq!(h.send_op(&json!({ "path": "IAF_RDO_Copy/r.xml" }))["exit_code"], 1);
        h.encrypt_in_place("C:\\eBIRForms\\IAF_RDO_Copy\\r.xml").unwrap();
        assert_eq!(fs::read(dir.join("IAF_RDO_Copy/r.xml")).unwrap(), b"<div>k=v</div>"); // not encrypted
        assert!(h.encrypt_in_place("IAF_RDO_Copy/missing.xml").is_err());
        assert!(h.repin(&json!({ "host": "x", "fingerprint": "y" })).is_err());
        let _ = fs::remove_dir_all(dir);
    }
}

#[cfg(test)]
mod png_test {
    #[test]
    fn transparent_png_is_a_valid_png() {
        let png = super::transparent_png();
        assert_eq!(&png[..8], &[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG magic
        assert!(png.len() > 60 && png.len() < 100);
    }
}
