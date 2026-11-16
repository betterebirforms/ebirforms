// What BIR's Submit does before the upload (the desktop's src-tauri/src/dispatch.rs, same rules): ask BIR's
// dispatcher where this return goes. Its answer is a JavaScript object literal read here as data, never run. The
// server, username and password in it are encrypted the way ebfSFTP.exe decrypts them:
//   base64 -> salt[32] | iv[16] | ciphertext, key = PBKDF2-HMAC-SHA1(passphrase, salt, 100000, 32), AES-256-CBC, PKCS7.
// The ebfSFTP passphrase is BIR's: it is read at run time from the user's own ebfSFTP.exe, never stored here.

import { find } from "./cipher.ts";

/** How the key importer recognises ebfSFTP.exe (a .NET image that names itself). */
export const SFTP_MARK = new TextEncoder().encode("ebfSFTP");
/** BIR's DEV/UAT upload host in ebfSFTP's format: decrypting it to a *.birgovph.com name identifies the passphrase. */
export const UAT_HOST_BLOB = "25s+rBZx/AO+YuDjzPzIBx81hOVx4fhdnOHNysmXar3RpmRnduhtuxoasmUEANldVjKUeaebvHyefVvj5aJQ/+hCjBdF+xwd7GFdWWSbqL8=";
/** enviService.getCurrVer() in the package our forms were made from. */
export const EBIR_VERSION = "7.9.6.0";

const u16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u32 = (b: Uint8Array, at: number) => (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;

/** Every string in a .NET assembly's user-string heap (#US), in order (ECMA-335 II.24.2.4). */
export function userStringOf(image: Uint8Array): string[] {
  const root = find(image, new TextEncoder().encode("BSJB"));
  if (root < 0 || root + 16 > image.length) return [];
  let at = root + 16 + u32(image, root + 12);
  if (at + 4 > image.length) return [];
  const streamCount = u16(image, at + 2);
  at += 4;
  for (let s = 0; s < streamCount && at + 8 <= image.length; s++) {
    const offset = u32(image, at);
    const size = u32(image, at + 4);
    const nameStart = at + 8;
    let end = image.indexOf(0, nameStart);
    if (end < 0) end = image.length;
    const name = new TextDecoder("latin1").decode(image.subarray(nameStart, end));
    at = nameStart + Math.ceil((end - nameStart + 1) / 4) * 4;
    if (name !== "#US") continue;
    const base = root + offset;
    const out: string[] = [];
    let p = 1; // entry 0 is the empty string
    while (p < size && base + p < image.length) {
      let length = image[base + p]!;
      if ((length & 0x80) === 0) p += 1;
      else if ((length & 0xc0) === 0x80) {
        length = ((length & 0x3f) << 8) | image[base + p + 1]!;
        p += 2;
      } else {
        length = ((length & 0x1f) << 24) | (image[base + p + 1]! << 16) | (image[base + p + 2]! << 8) | image[base + p + 3]!;
        p += 4;
      }
      if (length === 0) break;
      const char = (length & ~1) / 2; // UTF-16LE plus a trailing 1-byte flag
      if (base + p + char * 2 > image.length) break;
      out.push(new TextDecoder("utf-16le").decode(image.subarray(base + p, base + p + char * 2)));
      p += length;
    }
    return out;
  }
  return [];
}

function fromBase64(text: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(text.trim()), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** ebfSFTP's Decrypt. Throws a plain-words error when the text is not one of its blobs. */
export async function sftpDecrypt(text: string, passphrase: string): Promise<string> {
  const raw = fromBase64(text);
  if (!raw || raw.length < 64) throw new Error("connection detail not in the expected form");
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-1", salt: raw.slice(0, 32), iterations: 100_000 },
    base,
    { name: "AES-CBC", length: 256 },
    false,
    ["decrypt"],
  );
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv: raw.slice(32, 48) }, key, raw.slice(48));
  } catch {
    throw new Error("connection detail this app cannot read");
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(plain);
}

/** The ebfSFTP passphrase inside an ebfSFTP.exe image, proven by decrypting BIR's UAT host blob; or null. */
export async function passphraseFromSftpExe(image: Uint8Array): Promise<string | null> {
  for (const text of userStringOf(image)) {
    if (text.length < 6 || text.length > 100) continue;
    try {
      if ((await sftpDecrypt(UAT_HOST_BLOB, text)).toLowerCase().endsWith(".birgovph.com")) return text;
    } catch {
      /* not it */
    }
  }
  return null;
}

/** The dispatcher's answer as data: `key: "value"`, `key: 'value'` or `key: 123` pairs, never evaluated. */
export function parseDispatch(body: string): Record<string, string> | null {
  const text = body.trim().slice(0, 8192);
  if (!text.includes("mode")) return null;
  const out: Record<string, string> = {};
  for (const m of text.matchAll(/([A-Za-z]+)[ '"]*:[ ]*(?:"([^"]*)"|'([^']*)'|(\d+))/g)) out[m[1]!] = m[2] ?? m[3] ?? m[4]!;
  return "mode" in out ? out : null;
}

export interface Connection {
  mode: string;
  host: string;
  port: number;
  user: string;
  password: string;
}

export const CLOSED = "BIR did not open online filing for this TIN and form just now";

export async function connectionFromAnswer(answer: Record<string, string>, passphrase: string): Promise<Connection> {
  const mode = answer.mode ?? "";
  if (!mode || mode === "0") throw new Error(CLOSED);
  const port = Number(answer.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("connection detail not in the expected form");
  return {
    mode,
    host: await sftpDecrypt(answer.server ?? "", passphrase),
    port,
    user: await sftpDecrypt(answer.username ?? "", passphrase),
    password: await sftpDecrypt(answer.password ?? "", passphrase),
  };
}

/** enviService.getFtpFolder in PROD: the form code, except these older codes. */
export function ftpFolderOf(code: string): string {
  const old: Record<string, string> = {
    "1700": "1700v2013",
    "1701": "1701v2013",
    "1701Q": "1701Qv2008",
    "1702EX": "1702EXv2013",
    "1702MX": "1702MXv2013",
    "1702Q": "1702Qv2008",
    "1702RT": "1702RTv2013",
    "1707A": "1707Av2015",
    "2200A": "2200Av2013",
    "2200T": "2200Tv2013",
  };
  return old[code] ?? code;
}

/** Ask each dispatcher host in turn (`get(hostIndex)` does the network) until one opens filing. */
export async function dispatch(passphrase: string, get: (hostIndex: number) => Promise<string | null>, hostCount = 2): Promise<Connection> {
  let answer: Record<string, string> | null = null;
  for (let h = 0; h < hostCount; h++) {
    const body = await get(h).catch(() => null);
    answer = body == null ? null : parseDispatch(body);
    if (answer && answer.mode !== "0") break;
  }
  if (!answer) throw new Error(CLOSED);
  return connectionFromAnswer(answer, passphrase);
}
