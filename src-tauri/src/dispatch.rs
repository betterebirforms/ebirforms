//! Online-submission dispatcher — what eBIRForms' Submit does before the SFTP upload, natively
//! (docs/analysis/native-layer.md §4; ported from PhilForms `src/platform/ebir-submit.js`).
//!
//! eBIRForms does not ship the upload server's address or login. It asks BIR's dispatcher for them per
//! return, over plain HTTP:
//!     GET http://birgovph.com/tinDispatcherSFTP.php?t=<TIN9>&f=<form code>&v=<package version>
//! (backup ws1.birgovph.com). The body is a JavaScript object literal `{mode, server, SSLPort, port,
//! username, password}`. The original `eval()`s it; here it is read as DATA only — never executed. `server`,
//! `username` and `password` are encrypted the way ebfSFTP.exe decrypts them:
//!     base64 → salt[32] ‖ iv[16] ‖ ciphertext, key = PBKDF2-HMAC-SHA1(passphrase, salt, 100000, 32),
//!     AES-256-CBC, PKCS7.
//! `mode` "0" (or no answer) means online filing is not open for that TIN/form just now.
//!
//! The ebfSFTP passphrase is BIR's and is NEVER stored in this repo. It is read at runtime from the user's
//! own imported ebfSFTP.exe (a .NET assembly) — the one user-heap string that decrypts the DEV/UAT host blob
//! eBIRForms ships (`UAT_HOST_BLOB`) back to a *.birgovph.com host identifies it. That blob is an encrypted
//! test-server hostname, not a credential: it is only a known-plaintext oracle for picking the right string.
//! This module reads secrets out of BIR's binary exactly as crypto.rs does for Encrypt.exe, and nothing else.

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use aes::Aes256;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use std::collections::BTreeMap;

type CbcDec = cbc::Decryptor<Aes256>;
#[cfg_attr(not(test), allow(dead_code))]
type CbcEnc = cbc::Encryptor<Aes256>;

/// DEV/UAT upload host eBIRForms ships, in ebfSFTP's format (string-util.js). Decrypting it with the right
/// passphrase yields a `*.birgovph.com` host; that is how `passphrase_from_sftp_exe` recognises the passphrase.
/// How the importer recognises ebfSFTP.exe (a .NET image that names itself).
pub const SFTP_MARK: &[u8] = b"ebfSFTP";
pub const UAT_HOST_BLOB: &str =
    "25s+rBZx/AO+YuDjzPzIBx81hOVx4fhdnOHNysmXar3RpmRnduhtuxoasmUEANldVjKUeaebvHyefVvj5aJQ/+hCjBdF+xwd7GFdWWSbqL8=";

pub const DISPATCH_HOST: [&str; 2] = ["birgovph.com", "ws1.birgovph.com"];
/// enviService.getCurrVer() in the package our maps were made from.
pub const EBIR_VERSION: &str = "7.9.6.0";

fn u16le(b: &[u8], off: usize) -> usize {
    (b[off] as usize) | ((b[off + 1] as usize) << 8)
}
fn u32le(b: &[u8], off: usize) -> usize {
    (b[off] as usize)
        | ((b[off + 1] as usize) << 8)
        | ((b[off + 2] as usize) << 16)
        | ((b[off + 3] as usize) << 24)
}
fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}

/// Every string in a .NET assembly's user-string heap (#US), in order (ECMA-335 II.24.2.4).
pub fn user_strings_of(image: &[u8]) -> Vec<String> {
    let Some(root) = find(image, b"BSJB") else { return Vec::new() };
    if root + 16 > image.len() {
        return Vec::new();
    }
    let version_length = u32le(image, root + 12);
    let mut at = root + 16 + version_length;
    if at + 4 > image.len() {
        return Vec::new();
    }
    let stream_count = u16le(image, at + 2);
    at += 4;
    for _ in 0..stream_count {
        if at + 8 > image.len() {
            break;
        }
        let stream_offset = u32le(image, at);
        let size = u32le(image, at + 4);
        let name_start = at + 8;
        let end = image[name_start..]
            .iter()
            .position(|&b| b == 0)
            .map(|p| p + name_start)
            .unwrap_or(image.len());
        let name = String::from_utf8_lossy(&image[name_start..end]).to_string();
        // name is zero-terminated then padded to a 4-byte boundary
        at = name_start + ((end - name_start + 1).div_ceil(4)) * 4;
        if name != "#US" {
            continue;
        }
        let base = root + stream_offset;
        let mut out = Vec::new();
        let mut p = 1usize; // entry 0 is the empty string
        while p < size && base + p < image.len() {
            let mut length = image[base + p] as usize;
            if length & 0x80 == 0 {
                p += 1;
            } else if length & 0xc0 == 0x80 {
                length = ((length & 0x3f) << 8) | image[base + p + 1] as usize;
                p += 2;
            } else {
                length = ((length & 0x1f) << 24)
                    | ((image[base + p + 1] as usize) << 16)
                    | ((image[base + p + 2] as usize) << 8)
                    | image[base + p + 3] as usize;
                p += 4;
            }
            if length == 0 {
                break;
            }
            // a user string is UTF-16LE plus a trailing 1-byte flag; `length & !1` drops the flag
            let chars = (length & !1) / 2;
            if base + p + chars * 2 > image.len() {
                break;
            }
            let units: Vec<u16> = (0..chars)
                .map(|i| u16le(image, base + p + i * 2) as u16)
                .collect();
            out.push(String::from_utf16_lossy(&units));
            p += length;
        }
        return out;
    }
    Vec::new()
}

/// The ebfSFTP passphrase inside an ebfSFTP.exe image, proven by decrypting BIR's UAT host blob; or None.
pub fn passphrase_from_sftp_exe(image: &[u8]) -> Option<String> {
    for text in user_strings_of(image) {
        if text.len() < 6 || text.len() > 100 {
            continue;
        }
        if let Ok(host) = sftp_decrypt(UAT_HOST_BLOB, &text) {
            if host.to_ascii_lowercase().ends_with(".birgovph.com") {
                return Some(text);
            }
        }
    }
    None
}

/// ebfSFTP's Decrypt: base64 → salt[32] ‖ iv[16] ‖ ciphertext, PBKDF2-HMAC-SHA1(100000) key, AES-256-CBC, PKCS7.
pub fn sftp_decrypt(text: &str, passphrase: &str) -> Result<String, String> {
    let raw = B64
        .decode(text.trim().as_bytes())
        .map_err(|_| "not base64".to_string())?;
    if raw.len() < 64 {
        return Err("connection detail not in the expected form".into());
    }
    let mut key = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<sha1::Sha1>(passphrase.as_bytes(), &raw[0..32], 100_000, &mut key);
    let iv: [u8; 16] = raw[32..48].try_into().unwrap();
    let dec = CbcDec::new(&key.into(), &iv.into());
    let plain = dec
        .decrypt_padded_vec_mut::<Pkcs7>(&raw[48..])
        .map_err(|_| "connection detail this host cannot read".to_string())?;
    String::from_utf8(plain).map_err(|_| "connection detail was not text".into())
}

/// ebfSFTP's Encrypt (unused by BIR; here for tests and a local stand-in dispatcher).
#[cfg_attr(not(test), allow(dead_code))]
pub fn sftp_encrypt(text: &str, passphrase: &str, salt: [u8; 32], iv: [u8; 16]) -> String {
    let mut key = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<sha1::Sha1>(passphrase.as_bytes(), &salt, 100_000, &mut key);
    let enc = CbcEnc::new(&key.into(), &iv.into());
    let body = enc.encrypt_padded_vec_mut::<Pkcs7>(text.as_bytes());
    let mut out = Vec::with_capacity(48 + body.len());
    out.extend_from_slice(&salt);
    out.extend_from_slice(&iv);
    out.extend_from_slice(&body);
    B64.encode(out)
}

/// The dispatcher's answer as data. It is a JS object literal; its keys are read without running it.
pub fn parse_dispatch(body: &str) -> Option<BTreeMap<String, String>> {
    let text = body.trim();
    if !text.contains("mode") {
        return None;
    }
    // key:value pairs — key optionally quoted; value "…", '…' or a bare integer
    let mut out = BTreeMap::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        // read a key: [A-Za-z]+ possibly wrapped in quotes, followed by optional ws then ':'
        if bytes[i].is_ascii_alphabetic() {
            let ks = i;
            while i < bytes.len() && bytes[i].is_ascii_alphabetic() {
                i += 1;
            }
            let key = &text[ks..i];
            let mut j = i;
            while j < bytes.len() && (bytes[j] == b' ' || bytes[j] == b'\'' || bytes[j] == b'"') {
                j += 1;
            }
            if j < bytes.len() && bytes[j] == b':' {
                j += 1;
                while j < bytes.len() && bytes[j] == b' ' {
                    j += 1;
                }
                if j < bytes.len() && (bytes[j] == b'"' || bytes[j] == b'\'') {
                    let q = bytes[j];
                    j += 1;
                    let vs = j;
                    while j < bytes.len() && bytes[j] != q {
                        j += 1;
                    }
                    out.insert(key.to_string(), text[vs..j].to_string());
                    i = (j + 1).min(bytes.len());
                    continue;
                } else if j < bytes.len() && bytes[j].is_ascii_digit() {
                    let vs = j;
                    while j < bytes.len() && bytes[j].is_ascii_digit() {
                        j += 1;
                    }
                    out.insert(key.to_string(), text[vs..j].to_string());
                    i = j;
                    continue;
                }
            }
        }
        i += 1;
    }
    if out.contains_key("mode") {
        Some(out)
    } else {
        None
    }
}

/// BIR's connection details for one return, decrypted.
#[derive(Clone, Debug, PartialEq)]
pub struct Connection {
    pub mode: String,
    pub host: String,
    pub port: u16,
    pub user: String,
    pub password: String,
}

/// Turn a parsed dispatcher answer into decrypted connection details. "0"/missing mode = online filing closed.
pub fn connection_from_answer(
    answer: &BTreeMap<String, String>,
    passphrase: &str,
) -> Result<Connection, String> {
    let mode = answer.get("mode").cloned().unwrap_or_default();
    if mode.is_empty() || mode == "0" {
        return Err("BIR did not open online filing for this TIN and form just now".into());
    }
    let port: u16 = answer
        .get("port")
        .and_then(|p| p.parse().ok())
        .filter(|&p| p >= 1)
        .ok_or("connection detail not in the expected form")?;
    Ok(Connection {
        mode,
        host: sftp_decrypt(answer.get("server").map(String::as_str).unwrap_or(""), passphrase)?,
        port,
        user: sftp_decrypt(answer.get("username").map(String::as_str).unwrap_or(""), passphrase)?,
        password: sftp_decrypt(answer.get("password").map(String::as_str).unwrap_or(""), passphrase)?,
    })
}

/// enviService.getFtpFolder in PROD (ftpTargetFolder.PROD): the form code, except these older codes.
pub fn ftp_folder_of(code: &str) -> String {
    match code {
        "1700" => "1700v2013",
        "1701" => "1701v2013",
        "1701Q" => "1701Qv2008",
        "1702EX" => "1702EXv2013",
        "1702MX" => "1702MXv2013",
        "1702Q" => "1702Qv2008",
        "1702RT" => "1702RTv2013",
        "1707A" => "1707Av2015",
        "2200A" => "2200Av2013",
        "2200T" => "2200Tv2013",
        other => other,
    }
    .to_string()
}

/// One dispatcher round-trip over plain HTTP: ask each host in turn until one opens filing. `get` does the
/// network (injected so tests never reach BIR); it returns the raw response body for a URL, or None.
pub async fn dispatch<F, Fut>(
    tin: &str,
    code: &str,
    version: &str,
    passphrase: &str,
    hosts: &[&str],
    mut get: F,
) -> Result<Connection, String>
where
    F: FnMut(String) -> Fut,
    Fut: std::future::Future<Output = Option<String>>,
{
    if passphrase.is_empty() {
        return Err("Submitting to BIR is not set up: ebfSFTP.exe was not imported".into());
    }
    let mut answer = None;
    for base in hosts {
        let url = format!(
            "http://{base}/tinDispatcherSFTP.php?t={}&f={}&v={}",
            urlenc(tin),
            urlenc(code),
            urlenc(version)
        );
        answer = get(url).await.and_then(|body| parse_dispatch(&body[..body.len().min(8192)]));
        if let Some(a) = &answer {
            if a.get("mode").map(|m| m != "0").unwrap_or(false) {
                break;
            }
        }
    }
    let answer = answer.ok_or("BIR did not open online filing for this TIN and form just now")?;
    connection_from_answer(&answer, passphrase)
}

fn urlenc(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// A plain-HTTP/1.0 GET over TCP (optionally through an HTTP proxy), returning the response body.
/// eBIRForms calls the dispatcher over plain HTTP; this is the only outbound call it makes.
pub async fn http_get(url: &str, proxy: Option<(&str, u16)>, timeout_ms: u64) -> Option<String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let rest = url.strip_prefix("http://")?;
    let slash = rest.find('/').unwrap_or(rest.len());
    let host = &rest[..slash];
    let path = if slash < rest.len() { &rest[slash..] } else { "/" };
    let (hostname, port) = match host.rsplit_once(':') {
        Some((h, p)) => (h, p.parse().unwrap_or(80)),
        None => (host, 80u16),
    };
    let request = match proxy {
        Some(_) => format!("GET {url} HTTP/1.0\r\nHost: {hostname}\r\nConnection: close\r\n\r\n"),
        None => format!("GET {path} HTTP/1.0\r\nHost: {hostname}\r\nConnection: close\r\n\r\n"),
    };
    let dest = match proxy {
        Some((ph, pp)) => (ph.to_string(), pp),
        None => (hostname.to_string(), port),
    };
    let fut = async {
        let mut stream = tokio::net::TcpStream::connect((dest.0.as_str(), dest.1)).await.ok()?;
        stream.write_all(request.as_bytes()).await.ok()?;
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await.ok()?;
        let text = String::from_utf8_lossy(&buf);
        let body = text.split_once("\r\n\r\n").map(|(_, b)| b).unwrap_or("");
        Some(body.to_string())
    };
    tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), fut).await.ok().flatten()
}

#[cfg(test)]
mod tests {
    use super::*;

    const PASS: &str = "test-passphrase-123";

    fn enc(text: &str) -> String {
        sftp_encrypt(text, PASS, [7u8; 32], [9u8; 16])
    }

    #[test]
    fn sftp_round_trips() {
        let blob = enc("sftp.example.com");
        assert_eq!(sftp_decrypt(&blob, PASS).unwrap(), "sftp.example.com");
        assert!(sftp_decrypt(&blob, "wrong-passphrase").is_err());
    }

    #[test]
    fn parses_a_js_object_literal_without_eval() {
        let body = "{mode:'1',server:'AAAA',SSLPort:'443',port:'22',username:'BBBB',password:'CCCC'}";
        let a = parse_dispatch(body).unwrap();
        assert_eq!(a.get("mode").unwrap(), "1");
        assert_eq!(a.get("port").unwrap(), "22");
        assert_eq!(a.get("server").unwrap(), "AAAA");
        // closed / junk
        assert_eq!(parse_dispatch("{mode:'0'}").unwrap().get("mode").unwrap(), "0");
        assert!(parse_dispatch("not a dispatcher answer").is_none());
    }

    #[test]
    fn connection_decrypts_or_reports_closed() {
        let mut a = BTreeMap::new();
        a.insert("mode".into(), "1".into());
        a.insert("server".into(), enc("127.0.0.1"));
        a.insert("port".into(), "2222".into());
        a.insert("username".into(), enc("filer"));
        a.insert("password".into(), enc("secret"));
        let c = connection_from_answer(&a, PASS).unwrap();
        assert_eq!(c.host, "127.0.0.1");
        assert_eq!(c.port, 2222);
        assert_eq!(c.user, "filer");
        assert_eq!(c.password, "secret");

        let mut closed = BTreeMap::new();
        closed.insert("mode".into(), "0".into());
        assert!(connection_from_answer(&closed, PASS).is_err());
    }

    #[tokio::test]
    async fn dispatch_tries_backup_then_decrypts() {
        let body = format!(
            "{{mode:'1',server:'{}',port:'2222',username:'{}',password:'{}'}}",
            enc("10.0.0.5"),
            enc("u"),
            enc("p")
        );
        // primary returns a closed answer, backup opens filing
        let get = |url: String| {
            let body = body.clone();
            async move {
                if url.contains("ws1.birgovph.com") {
                    Some(body)
                } else {
                    Some("{mode:'0'}".to_string())
                }
            }
        };
        let c = dispatch("123456788", "0619E", EBIR_VERSION, PASS, &DISPATCH_HOST, get)
            .await
            .unwrap();
        assert_eq!(c.host, "10.0.0.5");
        assert_eq!(c.port, 2222);
    }

    #[test]
    fn no_passphrase_is_a_clear_error() {
        // dispatch with an empty passphrase must refuse before any network call
        let got = tokio::runtime::Builder::new_current_thread()
            .build()
            .unwrap()
            .block_on(dispatch("123456788", "0619E", EBIR_VERSION, "", &DISPATCH_HOST, |_| async {
                panic!("must not reach the network without a passphrase")
            }));
        assert!(got.is_err());
    }

    #[test]
    fn ftp_folder_maps_legacy_codes() {
        assert_eq!(ftp_folder_of("1701"), "1701v2013");
        assert_eq!(ftp_folder_of("0619E"), "0619E");
    }

    /// Needs the user's own ebfSFTP.exe (gitignored). Proves the passphrase reader finds the real one.
    #[test]
    fn reads_the_real_ebfsftp_passphrase() {
        let Ok(exe) = std::fs::read("../vendor/original/_installer/ebfSFTP.exe") else { return };
        let pass = passphrase_from_sftp_exe(&exe).expect("passphrase that decrypts the UAT host");
        let host = sftp_decrypt(UAT_HOST_BLOB, &pass).unwrap();
        assert!(host.to_ascii_lowercase().ends_with(".birgovph.com"));
    }

    /// LIVE, opt-in: asks BIR's real dispatcher (plain HTTP, the TIN in the query, as BIR's app does), decrypts the
    /// answer, then opens TCP to the upload host and reads only its SSH banner. No login, no upload, nothing filed.
    /// Prints the mode, whether the host is a birgovph.com name, the port and the banner; never the host, user or
    /// password. EBF_LIVE_TIN=<9+ digits> EBF_LIVE_FORM=1701Q cargo test --manifest-path src-tauri/Cargo.toml
    ///   -- --ignored --nocapture live_dispatch_probe
    #[test]
    #[ignore]
    fn live_dispatch_probe() {
        use tokio::io::AsyncReadExt;
        let tin: String = std::env::var("EBF_LIVE_TIN").expect("EBF_LIVE_TIN").chars().filter(char::is_ascii_digit).collect();
        let form = std::env::var("EBF_LIVE_FORM").unwrap_or_else(|_| "1701Q".into());
        let exe = std::fs::read("../vendor/original/_installer/ebfSFTP.exe").expect("vendor/original/_installer/ebfSFTP.exe");
        let pass = passphrase_from_sftp_exe(&exe).expect("passphrase");
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(async {
            let answered = std::rc::Rc::new(std::cell::RefCell::new(Vec::<String>::new()));
            let got = dispatch(&tin[..9], &form, EBIR_VERSION, &pass, &DISPATCH_HOST, |url| {
                let host = url.split('/').nth(2).unwrap_or("").to_string();
                let answered = answered.clone();
                async move {
                    let body = http_get(&url, None, 8000).await;
                    answered.borrow_mut().push(format!("{host}: {}", match &body {
                        None => "no answer".to_string(),
                        Some(b) => match parse_dispatch(b) {
                            Some(a) => format!("mode={:?}, fields={:?}", a.get("mode"), a.keys().collect::<Vec<_>>()),
                            None => format!("not a dispatcher answer ({} bytes)", b.len()),
                        },
                    }));
                    body
                }
            })
            .await;
            for a in answered.borrow().iter() {
                println!("dispatcher {a}");
            }
            let conn = match got {
                Ok(c) => c,
                Err(e) => return println!("RESULT dispatch: {e}"),
            };
            let is_bir = conn.host.to_ascii_lowercase().ends_with("birgovph.com");
            let kind = if conn.host.parse::<std::net::IpAddr>().is_ok() { "an IP address".to_string() } else {
                format!("a name ending .{}", conn.host.rsplit('.').take(2).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("."))
            };
            println!("RESULT host is {kind}");
            println!("RESULT dispatch ok: mode={} port={} host_is_birgovph={is_bir} user_len={} pass_len={}",
                conn.mode, conn.port, conn.user.len(), conn.password.len());
            let addr = format!("{}:{}", conn.host, conn.port);
            match tokio::time::timeout(std::time::Duration::from_secs(10), tokio::net::TcpStream::connect(&addr)).await {
                Ok(Ok(mut s)) => {
                    let mut buf = [0u8; 128];
                    let n = tokio::time::timeout(std::time::Duration::from_secs(10), s.read(&mut buf)).await.ok().and_then(Result::ok).unwrap_or(0);
                    println!("RESULT ssh banner: {:?}", String::from_utf8_lossy(&buf[..n]).trim());
                }
                Ok(Err(e)) => println!("RESULT tcp connect failed: {e}"),
                Err(_) => println!("RESULT tcp connect timed out"),
            }
        });
    }
}
