//! Rebuild BIR's form tree from the user's own copy of the official package, with no external tools.
//!
//! zip → Inno Setup 5.5 installer → the one LZMA2 solid chunk ("zlb\x1a") → undo Inno's x86
//! CALL/JMP filter → BIRForms.exe → RT_HTML resources (bitwise NOT; #129 is the UTF-16 manifest,
//! path i lives at id 130 + i). Mirrors tool/extract.mjs. Nothing BIR ships is executed.

use std::collections::BTreeMap;
use std::io::{Cursor, Read};

const RT_HTML: u32 = 23;
const MANIFEST_ID: u32 = 129;
const FIRST_PAYLOAD_ID: u32 = 130;

pub type Tree = BTreeMap<String, Vec<u8>>;

fn u16le(b: &[u8], at: usize) -> Result<u16, String> {
    b.get(at..at + 2).map(|s| u16::from_le_bytes([s[0], s[1]])).ok_or_else(|| format!("truncated PE at {at:#x}"))
}
fn u32le(b: &[u8], at: usize) -> Result<u32, String> {
    b.get(at..at + 4)
        .map(|s| u32::from_le_bytes([s[0], s[1], s[2], s[3]]))
        .ok_or_else(|| format!("truncated PE at {at:#x}"))
}

/// RT_HTML resources of a PE, keyed by numeric id.
pub fn html_resource(pe: &[u8]) -> Result<BTreeMap<u32, &[u8]>, String> {
    if u16le(pe, 0)? != 0x5a4d {
        return Err("not a PE file (no MZ)".into());
    }
    let nt = u32le(pe, 0x3c)? as usize;
    if u32le(pe, nt)? != 0x4550 {
        return Err("not a PE file (no PE signature)".into());
    }
    let section_count = u16le(pe, nt + 6)? as usize;
    let optional_size = u16le(pe, nt + 20)? as usize;
    let optional = nt + 24;
    let directory = optional + if u16le(pe, optional)? == 0x20b { 112 } else { 96 };
    let resource_rva = u32le(pe, directory + 16)?;
    if resource_rva == 0 {
        return Err("PE has no resource directory".into());
    }
    let mut section = Vec::new();
    for i in 0..section_count {
        let at = optional + optional_size + i * 40;
        section.push((u32le(pe, at + 12)?, u32le(pe, at + 8)?.max(u32le(pe, at + 16)?), u32le(pe, at + 20)?));
    }
    let offset_of = |rva: u32| -> Result<usize, String> {
        section
            .iter()
            .find(|(va, size, _)| rva >= *va && rva < va + size)
            .map(|(va, _, raw)| (rva - va + raw) as usize)
            .ok_or_else(|| format!("rva {rva:#x} outside every section"))
    };
    let root = offset_of(resource_rva)?;
    let entry = |dir: usize| -> Result<Vec<(u32, bool, usize)>, String> {
        let count = u16le(pe, root + dir + 12)? as usize + u16le(pe, root + dir + 14)? as usize;
        (0..count)
            .map(|i| {
                let e = root + dir + 16 + i * 8;
                let target = u32le(pe, e + 4)?;
                Ok((u32le(pe, e)?, target & 0x8000_0000 != 0, (target & 0x7fff_ffff) as usize))
            })
            .collect()
    };
    let mut out = BTreeMap::new();
    for (type_id, is_dir, type_at) in entry(0)? {
        if type_id != RT_HTML || !is_dir {
            continue;
        }
        for (id, id_is_dir, id_at) in entry(type_at)? {
            let leaf = if id_is_dir { entry(id_at)?.first().copied().map(|l| l.2) } else { Some(id_at) };
            let Some(leaf) = leaf else { continue };
            let rva = u32le(pe, root + leaf)?;
            let size = u32le(pe, root + leaf + 4)? as usize;
            let start = offset_of(rva)?;
            out.insert(id, pe.get(start..start + size).ok_or("resource data out of bounds")?);
        }
    }
    Ok(out)
}

/// BIRForms.exe → its embedded file tree.
pub fn unpack_form(pe: &[u8]) -> Result<Tree, String> {
    let html = html_resource(pe)?;
    let manifest = html.get(&MANIFEST_ID).ok_or("manifest resource 129 missing — not an eBIRForms BIRForms.exe")?;
    let utf16: Vec<u16> = manifest.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
    let text = String::from_utf16_lossy(&utf16);
    let text = text.trim_start_matches('\u{feff}').trim_end_matches('\0').trim_matches('|');
    let mut tree = Tree::new();
    for (i, rel) in text.split('|').skip(1).enumerate() {
        let rel = rel.replace('\\', "/");
        if rel.split('/').any(|s| s == ".." || s.is_empty()) || rel.contains(':') {
            return Err(format!("manifest path escapes the tree: {rel}"));
        }
        let data = html.get(&(FIRST_PAYLOAD_ID + i as u32)).map(|d| d.iter().map(|b| !b).collect()).unwrap_or_default();
        tree.entry(rel).or_insert(data); // BIRForms.hta is listed twice, byte-identical
    }
    Ok(tree)
}

/// Inverse of Inno Setup 5.2+'s TransformCallInstructions (per 64 KiB block, offsets from file start).
pub fn inno_unfilter(buf: &mut [u8]) {
    const BLOCK: usize = 0x10000;
    let mut start = 0;
    while start < buf.len() {
        let block_len = BLOCK.min(buf.len() - start);
        if block_len >= 5 {
            let size = block_len - 4;
            let mut i = 0;
            while i < size {
                let p = start + i;
                if buf[p] == 0xe8 || buf[p] == 0xe9 {
                    i += 1;
                    let p = p + 1;
                    if buf[p + 3] == 0x00 || buf[p + 3] == 0xff {
                        let addr = (start + i + 4) as u32;
                        let rel = (buf[p] as u32 | (buf[p + 1] as u32) << 8 | (buf[p + 2] as u32) << 16).wrapping_sub(addr);
                        if rel & 0x80_0000 != 0 {
                            buf[p + 3] = !buf[p + 3];
                        }
                        buf[p] = rel as u8;
                        buf[p + 1] = (rel >> 8) as u8;
                        buf[p + 2] = (rel >> 16) as u8;
                    }
                    i += 4;
                } else {
                    i += 1;
                }
            }
        }
        start += BLOCK;
    }
}

fn find(hay: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    hay.get(from..)?.windows(needle.len()).position(|w| w == needle).map(|p| p + from)
}

/// Extent of a PE image laid out from `at` (headers + every section's raw data).
fn pe_extent(b: &[u8]) -> Option<usize> {
    let nt = u32le(b, 0x3c).ok()? as usize;
    let count = u16le(b, nt + 6).ok()? as usize;
    let first = nt + 24 + u16le(b, nt + 20).ok()? as usize;
    let sections = (0..count)
        .map(|i| {
            let at = first + i * 40;
            Some(u32le(b, at + 20).ok()? as usize + u32le(b, at + 16).ok()? as usize)
        })
        .try_fold(0usize, |m, e| e.map(|e| m.max(e)))?;
    // Free Pascal builds (Encrypt.exe) append a COFF symbol table + string table after the sections
    let symbol_at = u32le(b, nt + 12).ok()? as usize;
    let symbol_count = u32le(b, nt + 16).ok()? as usize;
    if symbol_at == 0 || symbol_count == 0 {
        return Some(sections);
    }
    let strings_at = symbol_at + symbol_count * 18;
    Some(sections.max(strings_at + 4)) // string-table length is read once the bytes are available
}

/// Full extent including a COFF string table, whose size is only known from the image itself.
fn pe_extent_full(image: &[u8]) -> Option<usize> {
    let base = pe_extent(image)?;
    let nt = u32le(image, 0x3c).ok()? as usize;
    let symbol_at = u32le(image, nt + 12).ok()? as usize;
    let symbol_count = u32le(image, nt + 16).ok()? as usize;
    if symbol_at == 0 || symbol_count == 0 {
        return Some(base);
    }
    let strings_at = symbol_at + symbol_count * 18;
    Some(base.max(strings_at + u32le(image, strings_at).ok()? as usize))
}

/// How the importer recognises BIR's submission helpers. The shareable build (no `bir-submit`) carries neither
/// marker, so it never imports Encrypt.exe or ebfSFTP.exe (ROADMAP P4).
#[cfg(feature = "bir-submit")]
const ENCRYPT_MARK: Option<&[u8]> = Some(crate::crypto::SYMBOL);
#[cfg(feature = "bir-submit")]
const SFTP_MARK: Option<&[u8]> = Some(crate::dispatch::SFTP_MARK);
#[cfg(not(feature = "bir-submit"))]
const ENCRYPT_MARK: Option<&[u8]> = None;
#[cfg(not(feature = "bir-submit"))]
const SFTP_MARK: Option<&[u8]> = None;

/// What an installer yields: BIRForms.exe plus the native helpers submission needs.
pub struct Payload {
    pub birforms: Vec<u8>,
    /// Encrypt.exe — holds the final-copy encryption passphrase (read at runtime, never shipped).
    pub encrypt: Option<Vec<u8>>,
    /// ebfSFTP.exe — holds the passphrase that decrypts the dispatcher's SFTP credentials.
    pub ebfsftp: Option<Vec<u8>>,
}

/// Inno Setup installer → BIRForms.exe and helpers, identified by content rather than name.
pub fn installer_payload(setup: &[u8]) -> Result<Payload, String> {
    if find(setup, b"Inno Setup Setup Data", 0).is_none() {
        return Err("not an Inno Setup installer".into());
    }
    let (mut birforms, mut encrypt, mut ebfsftp) = (None, None, None);
    let mut at = 0;
    while let Some(chunk) = find(setup, b"zlb\x1a", at) {
        at = chunk + 4;
        let Some(&props) = setup.get(chunk + 4) else { break };
        if props > 40 {
            continue; // not an LZMA2 properties byte
        }
        let mut data = Vec::new();
        let mut input = Cursor::new(&setup[chunk + 5..]);
        if lzma_rs::lzma2_decompress(&mut input, &mut data).is_err() && data.is_empty() {
            continue;
        }
        let mut mz = 0;
        while let Some(m) = find(&data, b"MZ\x90\x00", mz) {
            mz = m + 1;
            let mut head = data[m..(m + 4096).min(data.len())].to_vec();
            inno_unfilter(&mut head);
            let Some(extent) = pe_extent(&head) else { continue };
            if m + extent > data.len() {
                continue;
            }
            let mut exe = data[m..m + extent].to_vec();
            inno_unfilter(&mut exe);
            // re-cut once the COFF string table's length is readable (the call filter never touches it
            // differently: Inno filters the whole file from offset 0, so unfilter the full span again)
            if let Some(full) = pe_extent_full(&exe).filter(|&f| f > extent && m + f <= data.len()) {
                exe = data[m..m + full].to_vec();
                inno_unfilter(&mut exe);
            }
            if birforms.is_none() && html_resource(&exe).map(|r| r.contains_key(&MANIFEST_ID)).unwrap_or(false) {
                birforms = Some(exe);
            } else if encrypt.is_none() && ENCRYPT_MARK.is_some_and(|mark| find(&exe, mark, 0).is_some()) {
                encrypt = Some(exe);
            } else if ebfsftp.is_none() && SFTP_MARK.is_some_and(|mark| find(&exe, b"BSJB", 0).is_some() && find(&exe, mark, 0).is_some()) {
                ebfsftp = Some(exe);
            }
        }
    }
    Ok(Payload {
        birforms: birforms.ok_or("no BIRForms.exe found inside the installer")?,
        encrypt,
        ebfsftp,
    })
}

/// The official download (zip), the installer, or BIRForms.exe itself → the form tree.
pub fn import(input: &[u8]) -> Result<Tree, String> {
    if input.starts_with(b"PK\x03\x04") {
        let mut archive = zip::ZipArchive::new(Cursor::new(input)).map_err(|e| format!("zip: {e}"))?;
        for i in 0..archive.len() {
            let mut f = archive.by_index(i).map_err(|e| format!("zip: {e}"))?;
            if f.name().to_ascii_lowercase().ends_with(".exe") {
                let mut exe = Vec::with_capacity(f.size() as usize);
                f.read_to_end(&mut exe).map_err(|e| format!("zip: {e}"))?;
                return import(&exe);
            }
        }
        return Err("the zip holds no installer .exe".into());
    }
    if html_resource(input).map(|r| r.contains_key(&MANIFEST_ID)).unwrap_or(false) {
        return unpack_form(input); // BIRForms.exe alone: forms work, submission needs the full package
    }
    let payload = installer_payload(input)?;
    #[cfg_attr(not(feature = "bir-submit"), allow(unused_mut))]
    let mut tree = unpack_form(&payload.birforms)?;
    // same layout as tool/extract.mjs: the native payload under _installer/
    #[cfg(feature = "bir-submit")]
    {
        if let Some(e) = payload.encrypt {
            tree.insert("_installer/Encrypt.exe".into(), e);
        }
        if let Some(e) = payload.ebfsftp {
            tree.insert("_installer/ebfSFTP.exe".into(), e);
        }
    }
    #[cfg(not(feature = "bir-submit"))]
    let _ = (payload.encrypt, payload.ebfsftp);
    Ok(tree)
}

#[cfg(test)]
mod test {
    use super::*;

    #[test]
    fn unfilter_leaves_non_call_bytes_alone() {
        let mut b = vec![0x90u8; 64];
        let before = b.clone();
        inno_unfilter(&mut b);
        assert_eq!(b, before);
    }

    #[test]
    fn unfilter_rebases_a_call() {
        // encoded CALL at offset 0: target rel 0x10 encoded as 0x10 + (0 + 1 + 4)
        let mut b = vec![0xe8, 0x15, 0x00, 0x00, 0x00, 0x90, 0x90, 0x90, 0x90, 0x90];
        inno_unfilter(&mut b);
        assert_eq!(&b[..5], &[0xe8, 0x10, 0x00, 0x00, 0x00]);
    }

    /// EBIRFORMS_PACKAGE=…/Offline_eBIRForms_Package_v7.9.6.2.zip cargo test -- --ignored
    #[test]
    #[ignore]
    #[cfg(feature = "bir-submit")]
    fn imports_the_real_package() {
        let path = std::env::var("EBIRFORMS_PACKAGE").expect("set EBIRFORMS_PACKAGE");
        let tree = import(&std::fs::read(path).unwrap()).unwrap();
        assert_eq!(tree.len(), 470); // 468 + the two helpers submission needs
        let encrypt = &tree["_installer/Encrypt.exe"];
        assert_eq!(encrypt, &std::fs::read("../vendor/original/_installer/Encrypt.exe").unwrap());
        assert_eq!(&tree["_installer/ebfSFTP.exe"], &std::fs::read("../vendor/original/_installer/ebfSFTP.exe").unwrap());
        assert!(String::from_utf8_lossy(&tree["forms/BIR-Form0605.hta"]).contains("BIR Form No. 0605"));
    }
}
