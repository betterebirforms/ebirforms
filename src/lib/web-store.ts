// The web version's storage: the browser's Origin Private File System, on this device only, or a folder the user
// picked (Chrome and Edge: their eBIRForms folder, maybe one a sync app like Google Drive keeps). Same paths and
// same cp1252 bytes as the desktop host writes (`profile/<TIN>.xml`, `savefile/<name>.xml`), so a picked
// C:\eBIRForms works as is. Nothing here touches the network. Safari can delete site storage after 7 days without
// a visit unless the site is on the Home Screen, so the exported file, not OPFS, is the user's real copy there.
import type { VfsEntry } from "../../host/legacy-server.ts";
import { decodeCp1252, encodeCp1252 } from "./cp1252.ts";
import { parseSavefile, serializeSavefile, withoutSecret } from "./savefile.ts";

const part = (path: string) => path.split("/").filter((p) => p && p !== "." && p !== "..");

// ---- the picked folder: its handle lives in IndexedDB, so it survives a reload; the browser may ask again for access

type Permission = "granted" | "denied" | "prompt";
interface PickedHandle extends FileSystemDirectoryHandle {
  queryPermission(o: { mode: "readwrite" }): Promise<Permission>;
  requestPermission(o: { mode: "readwrite" }): Promise<Permission>;
}
const DB = "ebirforms-web", STORE = "setting", KEY = "folder";

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

let picked: PickedHandle | null | undefined; // undefined = not read from IndexedDB yet

async function pickedFolder(): Promise<PickedHandle | null> {
  if (picked === undefined) picked = await idb<PickedHandle | undefined>("readonly", (s) => s.get(KEY)).then((h) => h ?? null, () => null);
  return picked;
}

/** True where the browser can hand a page a real folder (Chrome, Edge); Safari and Firefox keep OPFS only. */
export const canPickFolder = () => typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

/** The folder in use, if any, and whether this visit may read and write it yet. */
export async function webFolder(): Promise<{ name: string; permission: Permission } | null> {
  const h = await pickedFolder();
  return h ? { name: h.name, permission: await h.queryPermission({ mode: "readwrite" }) } : null;
}

/** Ask again for the picked folder (the browser needs a click for this). */
export async function webReconnect(): Promise<boolean> {
  const h = await pickedFolder();
  return !!h && (await h.requestPermission({ mode: "readwrite" })) === "granted";
}

/**
 * Let the user choose their eBIRForms folder (the one holding `profile` and `savefile`). Profiles and returns kept
 * in this browser are copied into it, never over a file it already has. Returns how many were copied.
 */
export async function webPickFolder(): Promise<number> {
  const pick = (window as unknown as { showDirectoryPicker(o: object): Promise<PickedHandle> }).showDirectoryPicker;
  const h = await pick({ id: "ebirforms", mode: "readwrite" });
  let copied = 0;
  const from = await navigator.storage.getDirectory();
  for (const sub of ["profile", "savefile"]) {
    let src: FileSystemDirectoryHandle;
    try {
      src = await from.getDirectoryHandle(sub);
    } catch {
      continue;
    }
    const dst = await h.getDirectoryHandle(sub, { create: true });
    for await (const f of (src as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
      if (f.kind !== "file") continue;
      try {
        await dst.getFileHandle(f.name);
        continue; // the folder's own copy wins
      } catch {
        /* not there yet */
      }
      const w = await (await dst.getFileHandle(f.name, { create: true })).createWritable();
      await w.write(await (f as FileSystemFileHandle).getFile());
      await w.close();
      copied++;
    }
  }
  await idb("readwrite", (s) => s.put(h, KEY));
  picked = h;
  return copied;
}

/** Go back to this browser's own storage. The folder and its files stay as they are. */
export async function webForgetFolder(): Promise<void> {
  await idb("readwrite", (s) => s.delete(KEY));
  picked = null;
}

/** Where profiles and returns live now. A picked folder the browser hasn't re-allowed is an error, never a quiet switch to OPFS. */
async function storeRoot(): Promise<FileSystemDirectoryHandle> {
  const h = await pickedFolder();
  if (!h) return navigator.storage.getDirectory();
  if ((await h.queryPermission({ mode: "readwrite" })) !== "granted")
    throw new Error(`This page needs permission again to use your folder "${h.name}". Click "Allow access" on the home page.`);
  return h;
}

async function folderOf(path: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  let dir = await storeRoot();
  for (const name of path) dir = await dir.getDirectoryHandle(name, { create });
  return dir;
}

async function fileOf(path: string, create: boolean): Promise<FileSystemFileHandle> {
  const p = part(path);
  const name = p.pop();
  if (!name) throw new Error(`bad path: ${path}`);
  return (await folderOf(p, create)).getFileHandle(name, { create });
}

/** Like the desktop host: a savefile never keeps the eBIRForms-Online password fields. */
const clean = (path: string, text: string) =>
  /^savefile\//i.test(path) && text.includes("ebirOnline") ? serializeSavefile(withoutSecret(parseSavefile(text))) : text;

// Safari before 26 has no createWritable on OPFS files, only createSyncAccessHandle inside a worker.
const SYNC_WRITER = `onmessage = async (e) => {
  try {
    let dir = await navigator.storage.getDirectory();
    const p = e.data.path.slice();
    const name = p.pop();
    for (const d of p) dir = await dir.getDirectoryHandle(d, { create: true });
    const h = await (await dir.getFileHandle(name, { create: true })).createSyncAccessHandle();
    h.truncate(0); h.write(e.data.byte, { at: 0 }); h.flush(); h.close();
    postMessage({ ok: true });
  } catch (err) { postMessage({ ok: false, error: String(err) }); }
};`;

function writeInWorker(path: string, byte: Uint8Array): Promise<void> {
  const url = URL.createObjectURL(new Blob([SYNC_WRITER], { type: "text/javascript" }));
  const worker = new Worker(url);
  return new Promise<void>((done, fail) => {
    worker.onmessage = (e: MessageEvent<{ ok: boolean; error?: string }>) => (e.data.ok ? done() : fail(new Error(e.data.error)));
    worker.onerror = (e) => fail(new Error(e.message));
    worker.postMessage({ path: part(path), byte });
  }).finally(() => {
    worker.terminate();
    URL.revokeObjectURL(url);
  });
}

export async function webWrite(path: string, text: string): Promise<object> {
  const byte = encodeCp1252(clean(path, text));
  const handle = await fileOf(path, true);
  if ("createWritable" in handle) {
    const writer = await handle.createWritable();
    await writer.write(byte as Uint8Array<ArrayBuffer>);
    await writer.close();
  } else if (await pickedFolder()) throw new Error("This browser cannot write to the picked folder.");
  else await writeInWorker(path, byte);
  if (!(await pickedFolder())) void webPersist();
  return {};
}

export async function webReadByte(path: string): Promise<Uint8Array> {
  return new Uint8Array(await (await (await fileOf(path, false)).getFile()).arrayBuffer());
}

export const webRead = async (path: string) => decodeCp1252(await webReadByte(path));

export async function webList(path: string): Promise<{ file: VfsEntry[]; folder: string[] }> {
  const file: VfsEntry[] = [];
  const folder: string[] = [];
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await folderOf(part(path), false);
  } catch {
    return { file, folder };
  }
  for await (const handle of (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values()) {
    if (handle.kind === "directory") folder.push(handle.name);
    else {
      const f = await (handle as FileSystemFileHandle).getFile();
      file.push({ name: handle.name, size: f.size, modified_ms: f.lastModified });
    }
  }
  return { file, folder };
}

export async function webRemove(path: string): Promise<object> {
  const p = part(path);
  const name = p.pop();
  if (name) await (await folderOf(p, false)).removeEntry(name);
  return {};
}

/** Ask the browser not to evict this site's storage. Safari grants it to Home Screen apps; returns the answer. */
export async function webPersist(): Promise<boolean> {
  try {
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

/** Hand the user the savefile as a download — the copy that survives cleared site data. */
export const webExport = async (path: string) => download(part(path).pop() ?? "savefile.xml", await webReadByte(path));

/** Download a savefile straight from memory — used when this browser has no usable storage (private browsing). */
export const webDownload = (name: string, text: string) => download(name, encodeCp1252(clean(`savefile/${name}`, text)));

function download(name: string, byte: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([byte as BlobPart], { type: "application/xml" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Bring an eBIRForms savefile (from Windows, or an earlier export) into this device's storage. */
export async function webImport(file: File): Promise<string> {
  const path = `savefile/${file.name.replace(/[\\/]/g, "_")}`;
  await webWrite(path, decodeCp1252(new Uint8Array(await file.arrayBuffer())));
  return path;
}
