import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { applyMod, modList } from "../host/mod.ts";

describe("compat/attachment-hidden-input (1702-MX attachments)", () => {
  const list = modList();
  const line = 'newAttachment = newAttachment.replace(new RegExp("type=hidden", "g"), "type=text");';

  it.each(["1702MX", "1702MXv2018", "1702MXv2018C", "1702MXv2018Cxx"])("%s: the hidden-to-text rewrite matches a quoted type=\"hidden\"", (code) => {
    const out = applyMod(list, `forms/BIR-Form${code}.hta`, line);
    expect(out).toContain('new RegExp("type=\\"?hidden\\"?", "g")');
    // run the rewritten call on what WebKit and what IE write back
    const re = new RegExp('type="?hidden"?', "g");
    expect('<input type="hidden" id="a">'.replace(re, "type=text")).toBe('<input type=text id="a">');
    expect("<input type=hidden id=a>".replace(re, "type=text")).toBe("<input type=text id=a>");
  });

  it("leaves other forms alone", () => {
    expect(applyMod(list, "forms/BIR-Form1701.hta", line)).toBe(line);
  });

  it.skipIf(!existsSync("vendor/original/forms/BIR-Form1702MX.hta"))("BIR's page carries the line this mod rewrites", async () => {
    const { readFileSync } = await import("node:fs");
    for (const code of ["1702MX", "1702MXv2018", "1702MXv2018C", "1702MXv2018Cxx"]) {
      const page = readFileSync(`vendor/original/forms/BIR-Form${code}.hta`, "latin1");
      expect(applyMod(list, `forms/BIR-Form${code}.hta`, page)).not.toContain('new RegExp("type=hidden", "g")');
    }
  });
});
