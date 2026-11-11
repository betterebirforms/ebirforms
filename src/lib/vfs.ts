// Async client for the legacy host's /__vfs protocol (the same one the form shim uses synchronously).
import type { VfsEntry, VfsRequest } from "../../host/legacy-server.ts";
import { decodeCp1252 } from "./cp1252.ts";
import { webList, webRead, webRemove, webWrite } from "./web-store.ts";

/** The web build (`npm run build:web`): no host, storage on this device (OPFS). */
export const IS_WEB = import.meta.env.MODE === "web";

const token = () => document.querySelector<HTMLMetaElement>('meta[name="ebf-token"]')?.content ?? "";

async function call<T>(req: VfsRequest): Promise<T> {
  const res = await fetch("/__vfs", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ebf-token": token() },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(`/__vfs ${req.op} → HTTP ${res.status}`);
  const body = (await res.json()) as T & { ok: boolean; error?: string };
  if (!body.ok) throw new Error(body.error ?? `${req.op} failed`);
  return body;
}

export const listFolder = (path: string) =>
  IS_WEB ? webList(path) : call<{ file: VfsEntry[]; folder: string[] }>({ op: "list", path });
export const readText = async (path: string) => (IS_WEB ? webRead(path) : (await call<{ text: string }>({ op: "read", path })).text);
/** `text` is a JS string; the host (or OPFS on the web) stores it as cp1252 bytes, like the original's FSO. */
export const writeText = (path: string, text: string) => (IS_WEB ? webWrite(path, text) : call<object>({ op: "write", path, text }));
export const removeFile = (path: string) => (IS_WEB ? webRemove(path) : call<object>({ op: "delete", path }));
export { decodeCp1252 };

export async function hostStatus(): Promise<{ has_form: boolean }> {
  const res = await fetch("/__status", { cache: "no-store" });
  return (await res.json()) as { has_form: boolean };
}

/** Send the official eBIRForms download (zip, installer or BIRForms.exe) to the host to rebuild the forms. */
export async function importPackage(file: Blob): Promise<number> {
  const res = await fetch("/__import", { method: "POST", headers: { "x-ebf-token": token() }, body: file });
  const body = (await res.json()) as { ok: boolean; file_count?: number; error?: string };
  if (!body.ok) throw new Error(body.error ?? "import failed");
  return body.file_count ?? 0;
}

/** One mod as `GET /__mod` lists it (host/mod.ts modSummary). */
export interface ModSummary {
  id: string;
  kind: string;
  title: string;
  about: string;
  on: boolean;
  source: "built-in" | "user";
}

export async function listMods(): Promise<ModSummary[]> {
  const res = await fetch("/__mod", { cache: "no-store" });
  return ((await res.json()) as { mod: ModSummary[] }).mod;
}

/** Switch a mod on or off (writes mod.json in the user's mod folder); takes effect on the next page load. */
export async function setMod(id: string, on: boolean): Promise<void> {
  const res = await fetch("/__mod", { method: "POST", headers: { "content-type": "application/json", "x-ebf-token": token() }, body: JSON.stringify({ id, on }) });
  const body = (await res.json()) as { ok: boolean; error?: string };
  if (!body.ok) throw new Error(body.error ?? "could not switch the mod");
}
