// The local host's security headers and DNS-rebinding guard. The Rust host has the same checks
// (src-tauri/src/host.rs: answers_only_to_this_machine, bir_pages_cannot_reach_the_network); this keeps the two equal.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { localHost, PAGE_CSP } from "../host/legacy-server";

describe("local host security", () => {
  it("answers only to this machine", () => {
    for (const ok of ["127.0.0.1:10907", "localhost:10900", "LOCALHOST", "[::1]:10907", "127.0.0.1"]) expect(localHost(ok), ok).toBe(true);
    for (const bad of ["evil.example:10907", "127.0.0.1.evil.example", "localhost.evil.example:10907", "192.168.1.5:10907", "", undefined])
      expect(localHost(bad), String(bad)).toBe(false);
  });

  it("keeps BIR's pages off the network", () => {
    expect(PAGE_CSP).toContain("connect-src 'self'");
    expect(PAGE_CSP).toContain("form-action 'self'");
    expect(PAGE_CSP).not.toMatch(/https?:/);
  });

  it("sends the same policy as the Rust host", () => {
    const rust = readFileSync("src-tauri/src/host.rs", "utf8");
    const m = rust.match(/pub const PAGE_CSP: &str = "([\s\S]*?)";/);
    expect(m).not.toBeNull();
    const rust_csp = (m?.[1] ?? "").replace(/\\\n/g, "");
    expect(rust_csp).toBe(PAGE_CSP);
  });
});

describe("BIR's pages keep the browser's own alert() and confirm()", () => {
  // tauri-plugin-dialog injects a script into every webview that makes confirm() async (a Promise, always "yes")
  // and alert() an IPC call BIR's pages may not make. v0.1.2 shipped it; .github/workflows/dialog.yml checks the window.
  it("the desktop app does not use tauri-plugin-dialog", () => {
    const cargo = readFileSync("src-tauri/Cargo.toml", "utf8").replace(/#.*$/gm, "");
    expect(cargo).not.toMatch(/tauri-plugin-dialog/);
    expect(readFileSync("src-tauri/src/lib.rs", "utf8")).not.toMatch(/tauri_plugin_dialog/);
  });
});
