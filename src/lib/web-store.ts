// The web version's storage: the browser's Origin Private File System, on this device only. Same paths and
// same cp1252 bytes as the desktop host writes (`savefile/<name>.xml`), so an exported file is an eBIRForms
// savefile. Nothing here touches the network. Safari can delete site storage after 7 days without a visit
// unless the site is on the Home Screen, so the exported file — not OPFS — is the user's real copy.
import type { VfsEntry } from "../../host/legacy-server.ts";
import { decodeCp1252, encodeCp1252 } from "./cp1252.ts";
import { parseSavefile, serializeSavefile, withoutSecret } from "./savefile.ts";

const part = (path: string) => path.split("/").filter((p) => p && p !== "." && p !== "..");

async function folderOf(path: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
  let dir = await navigator.storage.getDirectory();
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
  } else await writeInWorker(path, byte);
  void webPersist();
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
