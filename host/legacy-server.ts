// Legacy-form host (Node): serves BIR's recovered pages same-origin, injects the compatibility shim,
// and answers the shim's synchronous filesystem/helper calls. Used by the Vite dev server and tests;
// the Tauri build speaks the same protocol from Rust (src-tauri/src/legacy.rs).
//
//   GET  /legacy/<path>        overlay read (data root first, then the recovered original); .hta → text/html + shim
//   GET  /legacy/BIRForms.hta  302 → "/" (the forms' "Main Menu" goes back to our shell)
//   POST /__vfs                {op, …} → JSON. Paths are install-root relative, like the original's CWD.
//
// Writes only ever land in the data root; the recovered original is read-only.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, normalize, resolve, sep } from "node:path";
import { validateTin } from "../src/lib/tin.ts";
import { decodeCp1252, encodeCp1252 } from "../src/lib/cp1252.ts";
import { parseSavefile, serializeSavefile, withoutSecret } from "../src/lib/savefile.ts";
import { patchedJqueryFor, patchForm, patchScript } from "./form-patch.ts";

export interface LegacyHostOption {
  original_dir: string;
  data_dir: string;
  /** Shim script URL injected into every .hta page. */
  shim_url: string;
  /** Required on every /__vfs call so other local pages cannot drive the filesystem. */
  token: string;
}

/** 1×1 fully transparent PNG, for print images BIR never shipped. */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const MIME: Record<string, string> = {
  hta: "text/html; charset=utf-8",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  xml: "text/xml; charset=windows-1252",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  ico: "image/x-icon",
  txt: "text/plain; charset=windows-1252",
};

export type VfsRequest =
  | { op: "read"; path: string }
  | { op: "write"; path: string; text: string; append?: boolean }
  | { op: "stat"; path: string }
  | { op: "list"; path: string }
  | { op: "mkdir"; path: string }
  | { op: "copy"; from: string; to: string; overwrite?: boolean }
  | { op: "move"; from: string; to: string }
  | { op: "delete"; path: string }
  | { op: "rmdir"; path: string }
  | { op: "run"; command: string; argument: string[] }
  | { op: "dispatch"; tin: string; form_code: string }
  | { op: "send"; path: string; email: string; folder: string; tin: string; form_code: string };

export interface VfsEntry {
  name: string;
  size: number;
  modified_ms: number;
}

/** The package version, from the Release Notes BIR ships (first `vX.X.X.X`); "" if not found. */
function detectVersion(original_dir: string): string {
  for (const rel of ["_installer/Release Notes.txt", "Release Notes 7.9.6.1.txt"]) {
    try {
      const m = /v(\d+\.\d+\.\d+(?:\.\d+)?)/.exec(readFileSync(join(original_dir, rel), "latin1"));
      if (m) return m[1]!;
    } catch {
      /* try the next */
    }
  }
  return "";
}

export function createLegacyHost(option: LegacyHostOption) {
  const original = resolve(option.original_dir);
  const data = resolve(option.data_dir);
  const version = detectVersion(original);
  mkdirSync(data, { recursive: true });
  for (const d of ["savefile", "profile", "IAF_RDO_Copy"]) mkdirSync(join(data, d), { recursive: true });

  /** Map an install-root-relative or Windows-absolute path onto [data, original] candidates. */
  const locate = (raw: string): { rel: string; data: string; original: string } => {
    // the shim maps the fake install root (C:\eBIRForms\) away; anything still absolute is outside the sandbox
    const p = raw.replaceAll("\\", "/").replace(/^\.?\/+/, "");
    if (/^[A-Za-z]:/.test(p)) throw new Error(`absolute path outside the install root: ${raw}`);
    const rel = normalize(p).replaceAll("\\", "/").replace(/^(\.\.\/)+/, "");
    const d = resolve(data, rel);
    const o = resolve(original, rel);
    if (!(d === data || d.startsWith(data + sep)) || !(o === original || o.startsWith(original + sep))) {
      throw new Error(`path escapes the install root: ${raw}`);
    }
    return { rel, data: d, original: o };
  };
  const readable = (raw: string): string | null => {
    const l = locate(raw);
    if (existsSync(l.data)) return l.data;
    if (existsSync(l.original)) return l.original;
    return null;
  };

  const listDir = (raw: string) => {
    const l = locate(raw);
    const file = new Map<string, VfsEntry>();
    const folder = new Set<string>();
    for (const root of [l.original, l.data]) {
      if (!existsSync(root) || !statSync(root).isDirectory()) continue;
      for (const e of readdirSync(root, { withFileTypes: true })) {
        if (e.isDirectory()) folder.add(e.name);
        else if (e.name !== ".gitkeep") {
          const s = statSync(join(root, e.name));
          file.set(e.name, { name: e.name, size: s.size, modified_ms: s.mtimeMs });
        }
      }
    }
    return { file: [...file.values()], folder: [...folder] };
  };

  const runHelper = (command: string, argument: string[]): { exit_code: number; note?: string } => {
    const exe = command.replaceAll("\\", "/").split("/").pop()!.toLowerCase();
    if (exe === "chkt.exe") return { exit_code: validateTin(argument[0] ?? "") };
    if (exe === "encrypt.exe") return { exit_code: 1, note: "Encrypt.exe port pending (ROADMAP P2)" };
    if (exe === "ebfsftp.exe" || exe === "cftpsend.exe") return { exit_code: 1, note: "uploads go through the host's send op, never BIR's binaries" };
    return { exit_code: 1, note: `unknown helper ${exe}` };
  };

  const vfs = (req: VfsRequest): unknown => {
    switch (req.op) {
      case "read": {
        const p = readable(req.path);
        if (!p || statSync(p).isDirectory()) return { ok: false, error: "File not found" };
        return { ok: true, text: decodeCp1252(readFileSync(p)) };
      }
      case "write": {
        const l = locate(req.path);
        mkdirSync(dirname(l.data), { recursive: true });
        let text = req.text;
        // the original saved the user's eBIRForms-Online password in plaintext; we never persist it
        if (/^savefile\//i.test(l.rel) && text.includes("ebirOnline")) text = serializeSavefile(withoutSecret(parseSavefile(text)));
        const prior = req.append && existsSync(l.data) ? readFileSync(l.data) : null;
        const byte = encodeCp1252(text);
        writeFileSync(l.data, prior ? Buffer.concat([prior, byte]) : byte);
        return { ok: true };
      }
      case "stat": {
        const p = readable(req.path);
        if (!p) return { ok: true, kind: "none" };
        const s = statSync(p);
        return { ok: true, kind: s.isDirectory() ? "folder" : "file", size: s.size, modified_ms: s.mtimeMs };
      }
      case "list":
        return { ok: true, ...listDir(req.path) };
      case "mkdir":
        mkdirSync(locate(req.path).data, { recursive: true });
        return { ok: true };
      case "copy": {
        const from = readable(req.from);
        if (!from) return { ok: false, error: "File not found" };
        const to = locate(req.to);
        const target = req.to.endsWith("/") ? join(to.data, from.split(sep).pop()!) : to.data;
        if (existsSync(target) && req.overwrite === false) return { ok: false, error: "File already exists" };
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(from, target);
        return { ok: true };
      }
      case "move": {
        const from = locate(req.from);
        if (!existsSync(from.data)) return { ok: false, error: "File not found" }; // only user data can move
        const to = locate(req.to);
        mkdirSync(dirname(to.data), { recursive: true });
        renameSync(from.data, to.data);
        return { ok: true };
      }
      case "delete": {
        const l = locate(req.path);
        if (existsSync(l.data)) rmSync(l.data);
        return { ok: true };
      }
      case "rmdir": {
        const l = locate(req.path);
        if (l.data !== data && existsSync(l.data)) rmSync(l.data, { recursive: true });
        return { ok: true };
      }
      case "run":
        return { ok: true, ...runHelper(req.command, req.argument) };
      // BIR's dispatcher + SFTP upload are native (src-tauri/src/dispatch.rs, host.rs send_op). The dev server never
      // contacts BIR: mode "0" sends every Submit down BIR's own offline final-copy branch.
      case "dispatch":
        return { ok: true, mode: "0", note: "online submission runs in the packaged desktop app, not the dev server" };
      case "send":
        return { ok: true, exit_code: 1, note: "online submission runs in the packaged desktop app, not the dev server" };
    }
  };

  const shimTag = `<script src="${option.shim_url}" data-token="${option.token}"></script>`;
  const injectShim = (html: string) => {
    // must run before any page script; put it right after <head> (or at the very top)
    const at = html.search(/<head[^>]*>/i);
    if (at < 0) return shimTag + html;
    const end = html.indexOf(">", at) + 1;
    return html.slice(0, end) + shimTag + html.slice(end);
  };

  return async function handle(req: IncomingMessage, res: ServerResponse, next?: () => void): Promise<void> {
    const url = new URL(req.url ?? "/", "http://host");
    try {
      if (url.pathname === "/__vfs" && req.method === "POST") {
        if (req.headers["x-ebf-token"] !== option.token) {
          res.writeHead(403).end();
          return;
        }
        const chunk: Buffer[] = [];
        for await (const c of req) chunk.push(c as Buffer);
        const body = JSON.parse(Buffer.concat(chunk).toString("utf8")) as VfsRequest;
        let result: unknown;
        try {
          result = vfs(body);
        } catch (e) {
          result = { ok: false, error: (e as Error).message };
        }
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(result));
        return;
      }
      if (url.pathname === "/__repin" && req.method === "POST") {
        for await (const _ of req) void _;
        // host-key pins belong to the packaged app's SFTP upload (src-tauri/src/host.rs)
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: "Online submission runs in the packaged desktop app, not the dev server." }));
        return;
      }
      if (url.pathname === "/__close") {
        // a browser tab can't be closed by the page; the shim then returns to BIR's main screen
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: "no app window" }));
        return;
      }
      if (url.pathname === "/__print") {
        // the packaged app prints natively (src-tauri); in a browser the shim falls back to window.print()
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: "native print unavailable" }));
        return;
      }
      if (url.pathname === "/__offline") {
        res.writeHead(404, { "cache-control": "no-store" }).end(); // where the shim sends BIR's network calls
        return;
      }
      if (url.pathname === "/__status") {
        const has_form = existsSync(join(original, "forms", "BIR-Form0605.hta"));
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ ok: true, has_form }));
        return;
      }
      if (url.pathname === "/__import" && req.method === "POST") {
        // the packaged app imports in Rust (src-tauri/src/package.rs); in dev, run the extractor instead
        for await (const _ of req) void _;
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: "In development, run: npm run extract -- <package.zip>" }));
        return;
      }
      if (url.pathname.startsWith("/legacy/")) {
        const rel = decodeURIComponent(url.pathname.slice("/legacy/".length));
        // BIRForms.hta is BIR's real main screen; it renders 1:1 through the same shim the forms use.
        // (It used to 302 to the React shell — removed when the shell became the served HTA itself.)
        const p = readable(rel);
        if (!p || statSync(p).isDirectory()) {
          // several forms reference scripts/images that were never shipped (WL bug 19). Return an empty
          // 200 for a missing script so it loads as a no-op instead of logging a 404 on every form open.
          if (/\.js$/i.test(rel)) {
            res.writeHead(200, { "content-type": MIME.js! }).end(`/* ${rel} not shipped by BIR; served empty */`);
            return;
          }
          if (/\.(png|jpg|jpeg|gif)$/i.test(rel)) {
            // a few print images were never shipped (e.g. 1707Av2021); a 1×1 transparent PNG avoids a
            // broken-image icon in the print view
            res.writeHead(200, { "content-type": "image/png" }).end(TRANSPARENT_PNG);
            return;
          }
          res.writeHead(404).end();
          return;
        }
        const ext = p.split(".").pop()!.toLowerCase();
        if (ext === "vbs") {
          // the shim re-implements eBIRTools.vbs; a browser would otherwise parse VBScript as JS
          res.writeHead(200, { "content-type": MIME.js! }).end("/* eBIRTools.vbs is provided by legacy-shim.js */");
          return;
        }
        const byte = readFileSync(p);
        if (ext === "hta" || ext === "html" || ext === "htm") {
          const html = byte.toString("utf8").replace(/^﻿/, "");
          // only top-level .hta pages get the shim; .html files are fragments forms pull in with $.load()
          res.writeHead(200, { "content-type": MIME.hta!, "cache-control": "no-store" }).end(ext === "hta" ? injectShim(patchForm(rel, html)) : html);
          return;
        }
        if (ext === "js") {
          // replace BIR's vulnerable jQuery/jQuery-UI with the vendored patched versions (WL bug 7)
          const patched = patchedJqueryFor(rel);
          const text = patched && existsSync(patched) ? readFileSync(patched, "utf8") : patchScript(rel, byte.toString("utf8"), version);
          res.writeHead(200, { "content-type": MIME.js! }).end(text);
          return;
        }
        res.writeHead(200, { "content-type": MIME[ext] ?? "application/octet-stream" }).end(byte);
        return;
      }
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" }).end((e as Error).message);
      return;
    }
    if (next) next();
    else res.writeHead(404).end();
  };
}
