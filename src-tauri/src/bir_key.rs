//! The two keys sending a return needs, from BIR's own official package, fetched on the user's machine when they turn
//! sending on. Our downloads never carry BIR's helpers or the keys inside them (AGENTS.md); this downloads BIR's zip
//! from BIR's site, keeps only Encrypt.exe (the final-copy key) and ebfSFTP.exe (the key that opens the dispatcher's
//! answer) under the app's data folder, and checks both. They are read as data and never run.

use crate::{crypto, dispatch, package};
use std::fs;
use std::path::{Path, PathBuf};

/// BIR's official Offline eBIRForms Package, the same file the downloads bundle forms from (.github/workflows/build.yml).
pub const BIR_ZIP_URL: &str = "https://bir-cdn.bir.gov.ph/BIR/pdf/Offline_eBIRForms_Package_v7.9.6.2.1.zip";
/// Larger than this is not BIR's package (7.9.6.2.1 is 18,485,242 bytes).
const MAX_BYTES: u64 = 200 * 1024 * 1024;

pub fn dir(data: &Path) -> PathBuf {
    data.join("bir-key")
}

/// Both helpers are present and each yields its key.
pub fn ready(data: &Path) -> bool {
    let d = dir(data);
    let enc = fs::read(d.join("Encrypt.exe")).ok();
    let sftp = fs::read(d.join("ebfSFTP.exe")).ok();
    matches!((enc, sftp), (Some(e), Some(s)) if check(&e, &s).is_ok())
}

/// Encrypt.exe must name its passphrase; ebfSFTP.exe's passphrase must decrypt BIR's UAT host blob to a BIR host.
fn check(encrypt: &[u8], sftp: &[u8]) -> Result<(), String> {
    crypto::passphrase_from_encrypt_exe(encrypt).ok_or("BIR's Encrypt.exe did not have the key we expected")?;
    dispatch::passphrase_from_sftp_exe(sftp).ok_or("BIR's ebfSFTP.exe did not have the key we expected")?;
    Ok(())
}

/// BIR's zip → the two helpers, checked, written to `bir-key/`.
pub fn keep_from_zip(data: &Path, zip: &[u8]) -> Result<(), String> {
    let mut tree = package::import(zip)?;
    let encrypt = tree.remove("_installer/Encrypt.exe").ok_or("BIR's package had no Encrypt.exe")?;
    let sftp = tree.remove("_installer/ebfSFTP.exe").ok_or("BIR's package had no ebfSFTP.exe")?;
    check(&encrypt, &sftp)?;
    let d = dir(data);
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    fs::write(d.join("Encrypt.exe"), encrypt).map_err(|e| e.to_string())?;
    fs::write(d.join("ebfSFTP.exe"), sftp).map_err(|e| e.to_string())
}

/// Download BIR's zip over HTTPS (blocking; call off the UI thread) and keep the keys.
pub fn fetch(data: &Path) -> Result<(), String> {
    let _ = rustls::crypto::ring::default_provider().install_default(); // as tauri-plugin-updater does
    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (eBIRForms)")
        .timeout(std::time::Duration::from_secs(900))
        .build()
        .map_err(|e| e.to_string())?;
    let reply = client.get(BIR_ZIP_URL).send().map_err(|e| format!("could not reach BIR's site: {e}"))?;
    if !reply.status().is_success() {
        return Err(format!("BIR's site answered {}", reply.status()));
    }
    if reply.content_length().is_some_and(|n| n > MAX_BYTES) {
        return Err("BIR's file was larger than its package should be".into());
    }
    let body = reply.bytes().map_err(|e| format!("the download from BIR's site stopped: {e}"))?;
    if body.len() as u64 > MAX_BYTES {
        return Err("BIR's file was larger than its package should be".into());
    }
    keep_from_zip(data, &body)
}

#[cfg(test)]
mod test {
    use super::*;

    /// Needs BIR's zip on disk: EBIRFORMS_PACKAGE=~/Downloads/Offline_eBIRForms_Package_v7.9.6.2.1.zip
    #[test]
    fn keeps_both_keys_from_birs_zip() {
        let Ok(path) = std::env::var("EBIRFORMS_PACKAGE") else { return };
        let dir_ = std::env::temp_dir().join(format!("ebf-bir-key-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir_);
        assert!(!ready(&dir_));
        keep_from_zip(&dir_, &fs::read(path).unwrap()).unwrap();
        assert!(ready(&dir_));
        let kept: Vec<_> = fs::read_dir(dir(&dir_)).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert_eq!(kept.len(), 2, "only the two helpers, nothing else of BIR's");
        let _ = fs::remove_dir_all(&dir_);
    }

    #[test]
    fn refuses_what_is_not_birs_package() {
        let dir_ = std::env::temp_dir().join(format!("ebf-bir-key-bad-{}", std::process::id()));
        assert!(keep_from_zip(&dir_, b"not a zip").is_err());
        assert!(!ready(&dir_));
        assert!(check(b"x", b"y").is_err());
    }

    /// The compiled code (this test binary links all of it) carries neither key: both come from BIR's files at
    /// runtime. Needs BIR's helpers in vendor/original (gitignored); prints nothing about the keys.
    #[test]
    fn the_binary_carries_no_key() {
        let (Ok(enc), Ok(sftp)) = (
            fs::read("../vendor/original/_installer/Encrypt.exe"),
            fs::read("../vendor/original/_installer/ebfSFTP.exe"),
        ) else { return };
        let key = [
            crypto::passphrase_from_encrypt_exe(&enc).unwrap(),
            dispatch::passphrase_from_sftp_exe(&sftp).unwrap().into_bytes(),
        ];
        let bin = fs::read(std::env::current_exe().unwrap()).unwrap();
        for (i, k) in key.iter().enumerate() {
            assert!(k.len() >= 8);
            assert!(!bin.windows(k.len()).any(|w| w == k.as_slice()), "key {i} found in the binary");
        }
    }

    /// LIVE, opt-in: downloads BIR's zip from BIR's site. EBF_LIVE_FETCH=1 cargo test -- --ignored live_fetch
    #[test]
    #[ignore]
    fn live_fetch() {
        let dir_ = std::env::temp_dir().join(format!("ebf-bir-key-live-{}", std::process::id()));
        fetch(&dir_).unwrap();
        assert!(ready(&dir_));
        let _ = fs::remove_dir_all(&dir_);
    }
}
