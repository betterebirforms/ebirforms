//! The web version's key importer: BIR's official zip -> the two helpers sending needs, found by content, exactly as
//! the desktop does (the same package.rs, included by path so there is one copy). Nothing in them is run; the
//! browser reads their keys as data (src/submit/key.ts).

#[allow(dead_code)]
#[path = "../../src-tauri/src/package.rs"]
mod package;

/// The markers package.rs looks for (the desktop's crypto.rs and dispatch.rs; checked equal in test/submit-key.test.ts).
mod crypto {
    pub const SYMBOL: &[u8] = b"PH4SSPHR4553:c=s'";
}
mod dispatch {
    pub const SFTP_MARK: &[u8] = b"ebfSFTP";
}

use std::io::{Cursor, Read};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct Helper {
    encrypt: Vec<u8>,
    sftp: Vec<u8>,
}

#[wasm_bindgen]
impl Helper {
    /// Encrypt.exe
    #[wasm_bindgen(getter)]
    pub fn encrypt(&self) -> Vec<u8> {
        self.encrypt.clone()
    }
    /// ebfSFTP.exe
    #[wasm_bindgen(getter)]
    pub fn sftp(&self) -> Vec<u8> {
        self.sftp.clone()
    }
}

/// BIR's installer is about 100 MB; anything past this is not it.
const MAX_INSTALLER: u64 = 512 * 1024 * 1024;

/// BIR's zip, or the installer inside it -> its Encrypt.exe and ebfSFTP.exe. Only the installer is unpacked (not the
/// forms), so the browser holds as little as it can.
pub fn helper(input: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
    if input.starts_with(b"PK\x03\x04") {
        let mut archive = zip::ZipArchive::new(Cursor::new(input)).map_err(|e| format!("zip: {e}"))?;
        for i in 0..archive.len() {
            let mut f = archive.by_index(i).map_err(|e| format!("zip: {e}"))?;
            if f.name().map(|n| n.to_ascii_lowercase().ends_with(".exe")).unwrap_or(false) {
                let mut exe = Vec::new();
                (&mut f).take(MAX_INSTALLER + 1).read_to_end(&mut exe).map_err(|e| format!("zip: {e}"))?;
                if exe.len() as u64 > MAX_INSTALLER {
                    return Err("the installer inside the zip is too large".into());
                }
                return helper(&exe);
            }
        }
        return Err("the zip holds no installer .exe".into());
    }
    let payload = package::installer_payload(input)?;
    Ok((
        payload.encrypt.ok_or("BIR's package had no Encrypt.exe")?,
        payload.ebfsftp.ok_or("BIR's package had no ebfSFTP.exe")?,
    ))
}

#[wasm_bindgen]
pub fn helper_of(input: &[u8]) -> Result<Helper, JsError> {
    helper(input).map(|(encrypt, sftp)| Helper { encrypt, sftp }).map_err(|e| JsError::new(&e))
}
