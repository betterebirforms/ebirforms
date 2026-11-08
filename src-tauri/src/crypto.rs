//! Encrypt.exe, natively (docs/analysis/native-layer.md §2): zlib (level 9, with header), then DCPcrypt
//! Rijndael in CBC mode keyed by SHA-256(passphrase) → AES-256, IV = AES_K(16 × 0x00), no padding; a final
//! partial block is `P xor AES_K(CV)`. Verified against the real Encrypt.exe (test/fixture/encrypt/).
//!
//! The passphrase is BIR's and is never stored in this repo: it is read at runtime from the user's own
//! imported Encrypt.exe, located by its Free Pascal debug-symbol name.

use aes::cipher::{generic_array::GenericArray, BlockDecrypt, BlockEncrypt, KeyInit};
use aes::Aes256;
use flate2::{write::ZlibEncoder, Compression};
use sha2::{Digest, Sha256};
use std::io::Write;

/// The `.stabstr` symbol that precedes the passphrase in Encrypt.exe; also how the importer recognises it.
pub const SYMBOL: &[u8] = b"PH4SSPHR4553:c=s'";

/// The passphrase constant from an Encrypt.exe image (its `.stabstr` names it).
pub fn passphrase_from_encrypt_exe(exe: &[u8]) -> Option<Vec<u8>> {
    let at = exe.windows(SYMBOL.len()).position(|w| w == SYMBOL)? + SYMBOL.len();
    let end = exe[at..].iter().position(|&b| b == b'\'')? + at;
    Some(exe[at..end].to_vec())
}

pub struct EbfCipher {
    aes: Aes256,
    iv: [u8; 16],
}

impl EbfCipher {
    pub fn new(passphrase: &[u8]) -> Self {
        let key = Sha256::digest(passphrase);
        let aes = Aes256::new(GenericArray::from_slice(&key));
        let mut iv = GenericArray::clone_from_slice(&[0u8; 16]); // DCPcrypt zero-fills a nil IV, then encrypts it
        aes.encrypt_block(&mut iv);
        EbfCipher { aes, iv: iv.into() }
    }

    fn e(&self, block: &[u8; 16]) -> [u8; 16] {
        let mut b = GenericArray::clone_from_slice(block);
        self.aes.encrypt_block(&mut b);
        b.into()
    }

    pub fn encrypt(&self, plain: &[u8]) -> Vec<u8> {
        let mut out = Vec::with_capacity(plain.len());
        let mut cv = self.iv;
        let mut chunks = plain.chunks_exact(16);
        for p in &mut chunks {
            let mut x = [0u8; 16];
            for i in 0..16 {
                x[i] = p[i] ^ cv[i];
            }
            cv = self.e(&x);
            out.extend_from_slice(&cv);
        }
        let tail = chunks.remainder();
        if !tail.is_empty() {
            let k = self.e(&cv);
            out.extend(tail.iter().zip(k).map(|(p, k)| p ^ k));
        }
        out
    }

    #[cfg_attr(not(test), allow(dead_code))]
    pub fn decrypt(&self, cipher: &[u8]) -> Vec<u8> {
        let mut out = Vec::with_capacity(cipher.len());
        let mut cv = self.iv;
        let mut chunks = cipher.chunks_exact(16);
        for c in &mut chunks {
            let mut b = GenericArray::clone_from_slice(c);
            self.aes.decrypt_block(&mut b);
            out.extend(b.iter().zip(cv).map(|(d, v)| d ^ v));
            cv.copy_from_slice(c);
        }
        let tail = chunks.remainder();
        if !tail.is_empty() {
            let k = self.e(&cv);
            out.extend(tail.iter().zip(k).map(|(c, k)| c ^ k));
        }
        out
    }
}

/// What Encrypt.exe does to a final copy: compress, then encrypt.
pub fn encrypt_file(cipher: &EbfCipher, plain: &[u8]) -> Vec<u8> {
    let mut z = ZlibEncoder::new(Vec::new(), Compression::best());
    z.write_all(plain).expect("in-memory write");
    cipher.encrypt(&z.finish().expect("in-memory zlib"))
}

/// Inverse, for tests and for reading back our own submissions.
#[cfg_attr(not(test), allow(dead_code))]
pub fn decrypt_file(cipher: &EbfCipher, data: &[u8]) -> Result<Vec<u8>, String> {
    let z = cipher.decrypt(data);
    let mut out = Vec::new();
    flate2::read::ZlibDecoder::new(&z[..]).read_to_end_into(&mut out).map_err(|e| format!("zlib: {e}"))?;
    Ok(out)
}

#[cfg_attr(not(test), allow(dead_code))]
trait ReadToEndInto {
    fn read_to_end_into(self, out: &mut Vec<u8>) -> std::io::Result<usize>;
}
impl<R: std::io::Read> ReadToEndInto for R {
    fn read_to_end_into(mut self, out: &mut Vec<u8>) -> std::io::Result<usize> {
        self.read_to_end(out)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use std::fs;

    #[test]
    fn cbc_round_trips_every_tail_length() {
        let c = EbfCipher::new(b"test passphrase");
        for n in [0usize, 1, 15, 16, 17, 31, 32, 33, 100] {
            let p: Vec<u8> = (0..n as u8).collect();
            assert_eq!(c.decrypt(&c.encrypt(&p)), p, "length {n}");
            assert_eq!(c.encrypt(&p).len(), n);
        }
    }

    /// Needs the user's own Encrypt.exe (vendor/original/_installer, gitignored) for the passphrase.
    #[test]
    fn matches_the_real_encrypt_exe() {
        let Ok(exe) = fs::read("../vendor/original/_installer/Encrypt.exe") else { return };
        let pass = passphrase_from_encrypt_exe(&exe).expect("passphrase symbol in Encrypt.exe");
        let c = EbfCipher::new(&pass);
        let dir = "../test/fixture/encrypt";
        let mut checked = 0;
        for e in fs::read_dir(dir).unwrap().flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            let Some(stem) = name.strip_suffix(".enc") else { continue };
            let theirs = fs::read(e.path()).unwrap();
            let plain = fs::read(format!("{dir}/{stem}.plain")).unwrap();
            // their ciphertext decrypts and inflates to the original…
            assert_eq!(decrypt_file(&c, &theirs).unwrap(), plain, "{stem}: decrypt");
            // …and re-encrypting their zlib stream gives their exact bytes (the cipher is byte-exact)
            assert_eq!(c.encrypt(&c.decrypt(&theirs)), theirs, "{stem}: cipher");
            // our own output (different deflate encoder) still decrypts to the original
            assert_eq!(decrypt_file(&c, &encrypt_file(&c, &plain)).unwrap(), plain, "{stem}: ours");
            checked += 1;
        }
        assert!(checked >= 10);
    }
}

#[cfg(test)]
mod end_to_end {
    use super::*;
    /// Decrypts a file our packaged app actually uploaded to a live SFTP server and checks it inflates
    /// back to the exact plaintext final copy. Fixtures are produced by the manual e2e in the session;
    /// runs only when they and the user's Encrypt.exe are present.
    #[test]
    fn uploaded_file_round_trips_to_the_original() {
        let (Ok(enc), Ok(plain), Ok(exe)) = (
            std::fs::read("../test/fixture/uploaded.enc"),
            std::fs::read("../test/fixture/uploaded.plain"),
            std::fs::read("../vendor/original/_installer/Encrypt.exe"),
        ) else {
            return;
        };
        let cipher = EbfCipher::new(&passphrase_from_encrypt_exe(&exe).unwrap());
        assert_eq!(decrypt_file(&cipher, &enc).unwrap(), plain);
    }
}
