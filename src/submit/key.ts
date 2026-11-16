// The two keys sending needs, from BIR's own helpers, as the desktop keeps them (src-tauri/src/bir_key.rs):
// Encrypt.exe's passphrase (the final copy's cipher) and ebfSFTP.exe's (opens the dispatcher's answer). The web
// version finds the helpers in the user's eBIRForms folder (C:\eBIRForms holds both), or unpacks them from BIR's
// official zip in this browser (WASM, the desktop's package.rs). They are read as data and never run. Only the two
// passphrases are kept, in this browser's IndexedDB, never in the picked folder (a sync app would copy them).
import init, { helper_of } from "./pkg/ebf_package.js";
import { passphraseFromEncryptExe } from "./cipher.ts";
import { passphraseFromSftpExe } from "./dispatch.ts";

export interface BirKey {
  encrypt: Uint8Array;
  sftp: string;
}

export async function keyFromHelper(encryptExe: Uint8Array, sftpExe: Uint8Array): Promise<BirKey> {
  const encrypt = passphraseFromEncryptExe(encryptExe);
  if (!encrypt) throw new Error("BIR's Encrypt.exe did not have the key we expected");
  const sftp = await passphraseFromSftpExe(sftpExe);
  if (!sftp) throw new Error("BIR's ebfSFTP.exe did not have the key we expected");
  return { encrypt, sftp };
}

let ready: Promise<unknown> | null = null;

/** BIR's zip (or its installer) -> the keys. `wasm` lets tests hand in the module bytes; the page loads its URL. */
export async function keyFromPackage(input: Uint8Array, wasm?: BufferSource): Promise<BirKey> {
  ready ??= wasm ? init({ module_or_path: wasm }) : import("./pkg/ebf_package_bg.wasm?url").then((m: { default: string }) => init({ module_or_path: m.default }));
  await ready;
  const helper = helper_of(input);
  try {
    return await keyFromHelper(helper.encrypt, helper.sftp);
  } finally {
    helper.free();
  }
}

// ---- kept in this browser

const DB = "ebirforms-key", STORE = "key", KEY = "bir";

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((done, fail) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => fail(open.error);
    open.onsuccess = () => {
      const req = run(open.result.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => (open.result.close(), done(req.result as T));
      req.onerror = () => (open.result.close(), fail(req.error));
    };
  });
}

export const loadKey = () => idb<BirKey | undefined>("readonly", (s) => s.get(KEY)).then((k) => k ?? null, () => null);
export const saveKey = (k: BirKey) => idb("readwrite", (s) => s.put(k, KEY));
export const forgetKey = () => idb("readwrite", (s) => s.delete(KEY));
