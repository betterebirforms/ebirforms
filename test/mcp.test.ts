// The agent API (mcp/tool.ts) and its MCP protocol layer (mcp/main.ts), on a throwaway data folder.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { answer } from "../mcp/main.ts";
import { describe_form, fill_form, list_form, list_profile, list_return, read_return, save_return, ToolError } from "../mcp/tool.ts";
import { NATIVE_FORM } from "@/form/registry.ts";

const data = mkdtempSync(join(tmpdir(), "ebf-mcp-"));
afterAll(() => rmSync(data, { recursive: true, force: true }));
const TIN = { "frm0605:txtTIN1": "846", "frm0605:txtTIN2": "532", "frm0605:txtTIN3": "107", "frm0605:txtBranchCode": "00000" };
const PERIOD = { "frm0605:txtReturnPeriodMonth": "10", "frm0605:txtReturnPeriodDay": "15", "frm0605:txtReturnPeriodYear": "2026" };

describe("agent API", () => {
  it("lists every rebuilt form and describes one", () => {
    expect(list_form()).toHaveLength(Object.keys(NATIVE_FORM).length);
    const d = describe_form({ form_code: "0605" });
    expect(d.field.find((f) => f.id === "frm0605:txtTax21")?.computed).toBe(true);
    expect(() => describe_form({ form_code: "9999" })).toThrow(ToolError);
  });

  it("computes with BIR's own rules and flags unknown fields", () => {
    const r = fill_form({ form_code: "0605", value: { ...TIN, ...PERIOD, "frm0605:txtTax19": "1234.50", "frm0605:nope": "1" } }, data);
    expect(r.computed["frm0605:txtTax21"]).toBe("1,234.50");
    expect(r.unknown_field).toEqual(["frm0605:nope"]);
    expect(r.savefile_name).toMatch(/^84653210700000-0605-/);
  });

  it("saves a draft the app can reopen, and guards what it writes", () => {
    // 0605's file name ends with the time of saving: freeze the clock so both saves name the same file
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 11, 9, 30, 0));
    const arg = { form_code: "0605", value: { ...TIN, ...PERIOD, "frm0605:txtTax19": "1234.50" } };
    const saved = save_return(arg, data);
    expect(list_return({}, data)).toEqual([saved.saved]);
    const back = read_return({ name: saved.saved }, data);
    expect(back.form_code).toBe("0605");
    expect(back.is_final_copy).toBe(false);
    expect(back.value?.["frm0605:txtTax19"]).toBe("1234.50");
    // no silent overwrite; a final copy is never changed; no TIN, no save; one plain file name only
    expect(() => save_return(arg, data)).toThrow(/exists/);
    const path = join(data, "savefile", saved.saved);
    writeFileSync(path, readFileSync(path, "latin1") + "0", "latin1");
    expect(() => save_return({ ...arg, overwrite: true }, data)).toThrow(/final copy/);
    expect(() => save_return({ form_code: "0605", value: { "frm0605:txtTax19": "1" } }, data)).toThrow(/no TIN/);
    vi.useRealTimers();
    for (const name of ["../profile/x.xml", "/etc/passwd.xml", "a/b.xml", "x.txt"]) expect(() => read_return({ name }, data)).toThrow(ToolError);
  });

  it("lists profiles", () => {
    mkdirSync(join(data, "profile"), { recursive: true });
    expect(list_profile({}, data)).toEqual([]);
  });
});

describe("MCP protocol", () => {
  it("initializes, lists tools, and turns a tool mistake into an error result", () => {
    const init = answer({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }) as { result: { serverInfo: { name: string } } };
    expect(init.result.serverInfo.name).toBe("ebirforms");
    expect(answer({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    const list = answer({ jsonrpc: "2.0", id: 2, method: "tools/list" }) as { result: { tools: { name: string }[] } };
    expect(list.result.tools.map((t) => t.name)).toContain("save_return");
    const bad = answer({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "describe_form", arguments: { form_code: "nope" } } }) as { result: { isError: boolean } };
    expect(bad.result.isError).toBe(true);
    const none = answer({ jsonrpc: "2.0", id: 4, method: "nope" }) as { error: { code: number } };
    expect(none.error.code).toBe(-32601);
  });
});
