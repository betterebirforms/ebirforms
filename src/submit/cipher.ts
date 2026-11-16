// Encrypt.exe in the browser (the desktop's src-tauri/src/crypto.rs, same format): zlib, then Rijndael-256-key CBC
// keyed by SHA-256(passphrase), IV = AES_K(16 x 0x00), no padding; a final partial block is `P xor AES_K(CV)`.
// WebCrypto has AES-CBC only with PKCS7 padding, so full blocks are plain CBC with the padding block cut off, and a
// single-block AES_K(x) is CBC of x with a zero IV.
//
// The passphrase is BIR's: it is read at run time from the user's own Encrypt.exe and never stored in this repo.

/** The `.stabstr` symbol that precedes the passphrase in Encrypt.exe; also how the key importer recognises it. */
export const ENCRYPT_SYMBOL = new TextEncoder().encode("PH4SSPHR4553:c=s'");

export function find(hay: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

/** The passphrase constant inside an Encrypt.exe image, or null. */
export function passphraseFromEncryptExe(exe: Uint8Array): Uint8Array | null {
  const at = find(exe, ENCRYPT_SYMBOL);
  if (at < 0) return null;
  const start = at + ENCRYPT_SYMBOL.length;
  const end = exe.indexOf(0x27, start); // the closing '
  return end < 0 ? null : exe.slice(start, end);
}

const ZERO = new Uint8Array(16);
const buf = (b: Uint8Array) => b as Uint8Array<ArrayBuffer>;

export interface EbfCipher {
  key: CryptoKey;
  iv: Uint8Array;
}

/** AES_K of one block. */
async function block(key: CryptoKey, x: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: ZERO }, key, buf(x))).slice(0, 16);
}

export async function ebfCipher(passphrase: Uint8Array): Promise<EbfCipher> {
  const digest = await crypto.subtle.digest("SHA-256", buf(passphrase));
  const key = await crypto.subtle.importKey("raw", digest, "AES-CBC", false, ["encrypt", "decrypt"]);
  return { key, iv: await block(key, ZERO) }; // DCPcrypt zero-fills a nil IV, then encrypts it
}

const xor = (a: Uint8Array, b: Uint8Array) => a.map((x, i) => x ^ b[i]!);

export async function encrypt(c: EbfCipher, plain: Uint8Array): Promise<Uint8Array> {
  const full = plain.length - (plain.length % 16);
  const out = new Uint8Array(plain.length);
  let cv = c.iv;
  if (full) {
    const body = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: buf(c.iv) }, c.key, buf(plain.subarray(0, full)))).subarray(0, full);
    out.set(body);
    cv = body.slice(full - 16);
  }
  if (full < plain.length) out.set(xor(plain.subarray(full), await block(c.key, cv)), full);
  return out;
}

export async function decrypt(c: EbfCipher, data: Uint8Array): Promise<Uint8Array> {
  const full = data.length - (data.length % 16);
  const out = new Uint8Array(data.length);
  let cv = c.iv;
  if (full) {
    // append a block that decrypts to a whole PKCS7 padding block, so WebCrypto accepts the unpadded body
    const last = data.subarray(full - 16, full);
    const pad = await block(c.key, xor(new Uint8Array(16).fill(16), last));
    const joined = new Uint8Array(full + 16);
    joined.set(data.subarray(0, full));
    joined.set(pad, full);
    out.set(new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv: buf(c.iv) }, c.key, joined)));
    cv = last;
  }
  if (full < data.length) out.set(xor(data.subarray(full), await block(c.key, cv)), full);
  return out;
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const reply = new Response(new Blob([buf(data)]).stream().pipeThrough(stream));
  return new Uint8Array(await reply.arrayBuffer());
}

/** What Encrypt.exe does to a final copy: compress (zlib, with header), then encrypt. */
export const encryptFile = async (c: EbfCipher, plain: Uint8Array) => encrypt(c, await pipe(plain, new CompressionStream("deflate")));

/** The inverse, for tests and for reading back a copy we made. */
export const decryptFile = async (c: EbfCipher, data: Uint8Array) => pipe(await decrypt(c, data), new DecompressionStream("deflate"));
