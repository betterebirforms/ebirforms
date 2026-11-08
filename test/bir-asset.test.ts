import { describe, expect, it } from "vitest";
import barcodeJson from "../asset/bir/barcode.json";
import { barcodeUrl, birHeaderUrl } from "@/lib/bir-asset.ts";
import { NATIVE_FORM } from "@/form/registry.ts";

const manifest = barcodeJson as Record<string, string[]>;

describe("bundled BIR artwork (asset/bir)", () => {
  it("ships the banner and a form's page barcodes in page order", () => {
    expect(birHeaderUrl).toMatch(/header\.png$/);
    expect(barcodeUrl("1601FQ")).toEqual([expect.stringMatching(/1601FQ_p1\.png$/), expect.stringMatching(/1601FQ_p2\.png$/)]);
    expect(barcodeUrl("1702EX")).toHaveLength(7); // the <img> says 1702EX_p1, the file is 1702Ex_p1 — matched exactly
    expect(barcodeUrl("0605")).toEqual([]); // BIR never printed a barcode on 0605
  });

  it("every manifest entry resolves to a bundled file", () => {
    for (const [code, page] of Object.entries(manifest)) expect(barcodeUrl(code), code).toHaveLength(page.length);
  });

  it("covers every native form that BIR prints a barcode on", () => {
    const withBarcode = Object.keys(NATIVE_FORM).filter((code) => manifest[code]);
    expect(withBarcode.length).toBeGreaterThanOrEqual(19); // a floor, not a count: every new native rewrite adds one
    for (const code of withBarcode) expect(barcodeUrl(code).length, code).toBeGreaterThan(0);
  });
});
