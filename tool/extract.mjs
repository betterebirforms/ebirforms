#!/usr/bin/env node
// Rebuild the Offline eBIRForms source tree from the user's own copy of BIR's software.
//
//   node tool/extract.mjs <Offline_eBIRForms_Package_*.exe | *.zip | BIRForms.exe> [out=vendor/original]
//
// Pipeline: zip → Inno Setup installer (innoextract on PATH) → app/BIRForms.exe →
// RT_HTML resources. Every payload resource is bitwise-NOT encoded; resource 129 is a
// plain UTF-16 manifest "{GUID}|path|path|…" where path index i is resource id 130 + i.
// Nothing BIR ships is ever executed.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const RT_HTML = 23;
const MANIFEST_ID = 129;
const FIRST_PAYLOAD_ID = 130;

export function parseResource(buf) {
  if (buf.readUInt16LE(0) !== 0x5a4d) throw new Error("not a PE file (no MZ)");
  const pe = buf.readUInt32LE(0x3c);
  if (buf.readUInt32LE(pe) !== 0x4550) throw new Error("not a PE file (no PE signature)");
  const section_count = buf.readUInt16LE(pe + 6);
  const optional_size = buf.readUInt16LE(pe + 20);
  const optional = pe + 24;
  const magic = buf.readUInt16LE(optional);
  const directory = optional + (magic === 0x20b ? 112 : 96);
  const resource_rva = buf.readUInt32LE(directory + 2 * 8);
  if (!resource_rva) throw new Error("PE has no resource directory");

  const section = [];
  const section_table = optional + optional_size;
  for (let i = 0; i < section_count; i++) {
    const at = section_table + i * 40;
    section.push({
      virtual_address: buf.readUInt32LE(at + 12),
      virtual_size: buf.readUInt32LE(at + 8),
      raw_size: buf.readUInt32LE(at + 16),
      raw_offset: buf.readUInt32LE(at + 20),
    });
  }
  const offsetOf = (rva) => {
    const s = section.find((x) => rva >= x.virtual_address && rva < x.virtual_address + Math.max(x.virtual_size, x.raw_size));
    if (!s) throw new Error(`rva 0x${rva.toString(16)} outside every section`);
    return rva - s.virtual_address + s.raw_offset;
  };
  const root = offsetOf(resource_rva);

  const readName = (at) => {
    const length = buf.readUInt16LE(root + at);
    return buf.subarray(root + at + 2, root + at + 2 + length * 2).toString("utf16le");
  };
  const readDirectory = (at) => {
    const named = buf.readUInt16LE(root + at + 12);
    const numbered = buf.readUInt16LE(root + at + 14);
    const entry = [];
    for (let i = 0; i < named + numbered; i++) {
      const e = root + at + 16 + i * 8;
      const name = buf.readUInt32LE(e);
      const target = buf.readUInt32LE(e + 4);
      entry.push({
        key: name & 0x80000000 ? readName(name & 0x7fffffff) : name,
        is_directory: Boolean(target & 0x80000000),
        offset: target & 0x7fffffff,
      });
    }
    return entry;
  };

  // type → id → language → data
  const resource = new Map();
  for (const type of readDirectory(0)) {
    if (!type.is_directory) continue;
    const by_id = new Map();
    for (const id of readDirectory(type.offset)) {
      const language = id.is_directory ? readDirectory(id.offset)[0] : id;
      if (!language || language.is_directory) continue;
      const data_rva = buf.readUInt32LE(root + language.offset);
      const data_size = buf.readUInt32LE(root + language.offset + 4);
      const start = offsetOf(data_rva);
      by_id.set(id.key, buf.subarray(start, start + data_size));
    }
    resource.set(type.key, by_id);
  }
  return resource;
}

const invert = (data) => {
  const out = Buffer.allocUnsafe(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] ^ 0xff;
  return out;
};

export function unpackForm(exe) {
  const resource = parseResource(exe);
  const html = resource.get(RT_HTML) ?? resource.get("HTML");
  if (!html) throw new Error("BIRForms.exe has no RT_HTML resources");
  const manifest_raw = html.get(MANIFEST_ID);
  if (!manifest_raw) throw new Error(`manifest resource ${MANIFEST_ID} missing`);
  const path = new TextDecoder("utf-16le")
    .decode(manifest_raw)
    .replace(/^﻿/, "")
    .replace(/\0+$/, "")
    .replace(/^\|+|\|+$/g, "")
    .split("|")
    .slice(1);
  const file = [];
  path.forEach((rel, i) => {
    const data = html.get(FIRST_PAYLOAD_ID + i);
    file.push({ path: rel.replaceAll("\\", "/"), resource_id: FIRST_PAYLOAD_ID + i, data: data ? invert(data) : Buffer.alloc(0) });
  });
  return file;
}

function findFile(root, name) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const p = join(root, entry.name);
    if (entry.isDirectory()) {
      const hit = findFile(p, name);
      if (hit) return hit;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) return p;
  }
  return null;
}

function stageInstaller(input, work) {
  const lower = input.toLowerCase();
  if (lower.endsWith(".zip")) {
    // Windows ships bsdtar (reads zip); a Git-Bash GNU tar on PATH would read "F:" as a host
    if (process.platform === "win32") execFileSync(join(process.env.SystemRoot ?? "C:\Windows", "System32", "tar.exe"), ["-xf", input, "-C", work]);
    else execFileSync("unzip", ["-q", input, "-d", work]);
    const setup = readdirSync(work).find((n) => n.toLowerCase().endsWith(".exe"));
    if (!setup) throw new Error("zip holds no installer .exe");
    return stageInstaller(join(work, setup), work);
  }
  const buf = readFileSync(input);
  if (buf.includes(Buffer.from("Inno Setup Setup Data"))) {
    const inno = join(work, "inno");
    mkdirSync(inno, { recursive: true });
    try {
      execFileSync("innoextract", ["--silent", "-d", inno, input], { stdio: "inherit" });
    } catch {
      throw new Error("innoextract failed or is not on PATH (macOS: brew install innoextract; Windows: scoop install innoextract)");
    }
    return join(inno, "app");
  }
  return null; // already BIRForms.exe
}

function main() {
  const [input, out_arg] = process.argv.slice(2);
  if (!input) {
    console.error("usage: node tool/extract.mjs <installer.exe|package.zip|BIRForms.exe> [out=vendor/original]");
    process.exit(2);
  }
  const out = resolve(out_arg ?? "vendor/original");
  const work = mkdtempSync(join(tmpdir(), "ebirforms-"));
  try {
    const app = stageInstaller(resolve(input), work);
    const exe_path = app ? findFile(app, "BIRForms.exe") : resolve(input);
    if (!exe_path) throw new Error("installer holds no BIRForms.exe");
    const file = unpackForm(readFileSync(exe_path));

    rmSync(out, { recursive: true, force: true });
    const seen = new Set();
    for (const f of file) {
      let dst = resolve(out, f.path);
      if (!dst.startsWith(out + sep)) throw new Error(`manifest path escapes output: ${f.path}`);
      if (seen.has(dst)) continue; // BIRForms.hta is listed twice, byte-identical
      seen.add(dst);
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, f.data);
    }
    // keep the on-disk installer payload too (native helpers, xml, release notes)
    if (app) {
      const native = join(out, "_installer");
      for (const entry of readdirSync(app, { withFileTypes: true })) {
        if (entry.isFile()) {
          mkdirSync(native, { recursive: true });
          copyFileSync(join(app, entry.name), join(native, entry.name));
        }
      }
    }
    const index = file.map((f) => ({ path: f.path, resource_id: f.resource_id, byte: f.data.length }));
    writeFileSync(join(out, "_manifest.json"), JSON.stringify({ source: basename(input), file: index }, null, 2));
    console.log(`extracted ${seen.size} file (${file.length} manifest entry) → ${out}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
