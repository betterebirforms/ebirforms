import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { parseResource, unpackForm } from "../tool/extract.mjs";

// Smallest PE32 that carries an RT_HTML directory: one .rsrc section, ids 129 (manifest) + 130/131.
function buildPe(entry: Array<[number, Buffer]>): Buffer {
  const rsrc_rva = 0x1000;
  const dir = (count: number) => {
    const b = Buffer.alloc(16 + count * 8);
    b.writeUInt16LE(count, 14);
    return b;
  };
  const type_dir = dir(1);
  const id_dir = dir(entry.length);
  const lang_dir = entry.map(() => dir(1));
  const data_entry = entry.map(() => Buffer.alloc(16));
  let at = type_dir.length + id_dir.length;
  const lang_at = lang_dir.map((d) => ((at += d.length), at - d.length));
  const data_at = data_entry.map((d) => ((at += d.length), at - d.length));
  const payload_at = entry.map(([, data]) => ((at += data.length), at - data.length));
  type_dir.writeUInt32LE(23, 16);
  type_dir.writeUInt32LE((0x80000000 | type_dir.length) >>> 0, 20);
  entry.forEach(([id, data], i) => {
    id_dir.writeUInt32LE(id, 16 + i * 8);
    id_dir.writeUInt32LE((0x80000000 | lang_at[i]!) >>> 0, 20 + i * 8);
    lang_dir[i]!.writeUInt32LE(0, 16);
    lang_dir[i]!.writeUInt32LE(data_at[i]!, 20);
    data_entry[i]!.writeUInt32LE(rsrc_rva + payload_at[i]!, 0);
    data_entry[i]!.writeUInt32LE(data.length, 4);
  });
  const rsrc = Buffer.concat([type_dir, id_dir, ...lang_dir, ...data_entry, ...entry.map(([, d]) => d)]);

  const header = Buffer.alloc(0x200);
  header.writeUInt16LE(0x5a4d, 0);
  header.writeUInt32LE(0x80, 0x3c);
  header.writeUInt32LE(0x4550, 0x80);
  header.writeUInt16LE(1, 0x86); // one section
  header.writeUInt16LE(224, 0x94); // PE32 optional header size
  const optional = 0x98;
  header.writeUInt16LE(0x10b, optional);
  header.writeUInt32LE(rsrc_rva, optional + 96 + 16); // data directory[2] = resource
  header.writeUInt32LE(rsrc.length, optional + 96 + 20);
  const section = optional + 224;
  header.write(".rsrc", section, "ascii");
  header.writeUInt32LE(rsrc.length, section + 8);
  header.writeUInt32LE(rsrc_rva, section + 12);
  header.writeUInt32LE(rsrc.length, section + 16);
  header.writeUInt32LE(0x200, section + 20);
  return Buffer.concat([header, rsrc]);
}

const invert = (b: Buffer) => Buffer.from(b.map((x) => x ^ 0xff));

describe("tool/extract", () => {
  const manifest = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("{GUID}|BIRForms.hta|forms\\BIR-Form0605.hta|", "utf16le")]);
  const shell = Buffer.from("<html>shell</html>");
  const form = Buffer.from("﻿<title>BIR Form No. 0605</title>");
  const pe = buildPe([
    [129, manifest],
    [130, invert(shell)],
    [131, invert(form)],
  ]);

  it("walks the PE resource tree", () => {
    const html = parseResource(pe).get(23);
    expect([...html.keys()]).toEqual([129, 130, 131]);
  });

  it("maps manifest index i to resource 130 + i and undoes the NOT encoding", () => {
    const file = unpackForm(pe);
    expect(file.map((f: { path: string }) => f.path)).toEqual(["BIRForms.hta", "forms/BIR-Form0605.hta"]);
    expect(file[0].data.equals(shell)).toBe(true);
    expect(file[1].data.equals(form)).toBe(true);
  });

  it("rejects a non-PE input", () => {
    expect(() => parseResource(Buffer.from("not a pe"))).toThrow(/MZ/);
  });

  // Runs only on a machine that has extracted a real package (vendor/ is gitignored).
  const real = "vendor/original/_installer/BIRForms.exe";
  it.skipIf(!existsSync(real))("recovers the real v7.9.6.x package: 469 manifest entry, every form decodes to HTML", () => {
    const file = unpackForm(readFileSync(real));
    expect(file.length).toBe(469);
    const form = file.filter((f: { path: string }) => /^forms\/.*\.hta$/.test(f.path));
    expect(form.length).toBeGreaterThan(80);
    for (const f of form) expect(f.data.toString("utf8")).toMatch(/<title>\s*BIR Form No\./i);
  });
});
