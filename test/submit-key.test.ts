// The web version's key importer: BIR's real zip unpacked in WASM gives the same helpers as the extractor's tree.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { keyFromHelper, keyFromPackage } from "../src/submit/key.ts";

const wasm = () => readFileSync("src/submit/pkg/ebf_package_bg.wasm");
const helper = "vendor/original/_installer";

describe("BIR's keys on the web", () => {
  it("the WASM build carries the same markers as the desktop", () => {
    const lib = readFileSync("wasm/src/lib.rs", "utf8");
    expect(readFileSync("src-tauri/src/crypto.rs", "utf8")).toContain(`pub const SYMBOL: &[u8] = b"PH4SSPHR4553:c=s'";`);
    expect(lib).toContain(`pub const SYMBOL: &[u8] = b"PH4SSPHR4553:c=s'";`);
    expect(readFileSync("src-tauri/src/dispatch.rs", "utf8")).toContain(`pub const SFTP_MARK: &[u8] = b"ebfSFTP";`);
    expect(lib).toContain(`pub const SFTP_MARK: &[u8] = b"ebfSFTP";`);
    expect(lib).toContain(`#[path = "../../src-tauri/src/package.rs"]`);
  });

  it("refuses files that are not BIR's helpers", async () => {
    await expect(keyFromHelper(new Uint8Array(100), new Uint8Array(100))).rejects.toThrow("Encrypt.exe");
    await expect(keyFromPackage(new TextEncoder().encode("PK\x03\x04 not a zip"), wasm())).rejects.toThrow();
  });

  it.skipIf(!existsSync(`${helper}/Encrypt.exe`))("reads both keys from the helpers in an eBIRForms folder", async () => {
    const k = await keyFromHelper(new Uint8Array(readFileSync(`${helper}/Encrypt.exe`)), new Uint8Array(readFileSync(`${helper}/ebfSFTP.exe`)));
    expect(k.encrypt.length).toBeGreaterThan(0);
    expect(k.sftp.length).toBeGreaterThan(0);
  }, 60_000);

  // EBIRFORMS_PACKAGE=<BIR's Offline_eBIRForms_Package_v7.9.6.2.1.zip>
  const zip = process.env.EBIRFORMS_PACKAGE ?? "";
  it.skipIf(!zip || !existsSync(`${helper}/Encrypt.exe`))("unpacks BIR's real zip to the same keys", async () => {
    const fromZip = await keyFromPackage(new Uint8Array(readFileSync(zip)), wasm());
    const fromTree = await keyFromHelper(new Uint8Array(readFileSync(`${helper}/Encrypt.exe`)), new Uint8Array(readFileSync(`${helper}/ebfSFTP.exe`)));
    expect(fromZip).toEqual(fromTree);
  }, 300_000);
});
