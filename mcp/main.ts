// eBIRForms MCP server: lets an AI agent fill BIR returns with the app's own 1:1 computations, over stdio.
//   npm run build:mcp            → dist-mcp/ebirforms-mcp.mjs (one file, plain Node 20+)
//   claude mcp add ebirforms -- node /path/to/dist-mcp/ebirforms-mcp.mjs
// Read docs/agent.md. The protocol layer is hand-written (JSON-RPC 2.0, newline-delimited) so the server has no
// runtime dependency. Logs go to stderr; stdout carries protocol messages only.
import { createInterface } from "node:readline";
import { TOOL, ToolError, defaultDataDir } from "./tool.ts";

const VERSION = "0.1.0";
const data = process.argv.includes("--data") ? process.argv[process.argv.indexOf("--data") + 1]! : defaultDataDir();

type Message = { jsonrpc: "2.0"; id?: number | string | null; method?: string; params?: Record<string, unknown> };

const send = (msg: object) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...msg }) + "\n");

export function answer(msg: Message): object | null {
  const { id, method, params = {} } = msg;
  if (id === undefined) return null; // a notification (e.g. notifications/initialized): no reply
  switch (method) {
    case "initialize":
      return {
        id,
        result: {
          protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "ebirforms", version: VERSION },
          instructions:
            "Fills Philippine BIR tax returns with eBIRForms' own computations (1:1 with BIR's official forms). " +
            "Start with list_form and describe_form. fill_form computes without saving; save_return saves a draft into the eBIRForms app. " +
            "Nothing here files with BIR: the taxpayer reviews the draft in the app and files it themselves.",
        },
      };
    case "ping":
      return { id, result: {} };
    case "tools/list":
      return {
        id,
        result: {
          tools: TOOL.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: { type: "object", properties: t.input, ...("required" in t ? { required: t.required } : {}) },
          })),
        },
      };
    case "tools/call": {
      const tool = TOOL.find((t) => t.name === params.name);
      if (!tool) return { id, error: { code: -32602, message: `unknown tool ${String(params.name)}` } };
      try {
        const out = (tool.fn as (a: unknown, d: string) => unknown)(params.arguments ?? {}, data);
        return { id, result: { content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: Array.isArray(out) ? { item: out } : out } };
      } catch (e) {
        // a mistake the agent can fix is a tool result, not a protocol error
        const text = e instanceof ToolError ? e.message : `internal error: ${(e as Error).message}`;
        return { id, result: { content: [{ type: "text", text }], isError: true } };
      }
    }
    default:
      return { id, error: { code: -32601, message: `method not found: ${method}` } };
  }
}

if (process.argv[1] && /ebirforms-mcp|mcp[/\\]main/.test(process.argv[1])) {
  console.error(`ebirforms MCP ${VERSION}: data folder ${data}`);
  const rl = createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let msg: Message;
    try {
      msg = JSON.parse(line) as Message;
    } catch {
      send({ id: null, error: { code: -32700, message: "parse error" } });
      return;
    }
    const reply = answer(msg);
    if (reply) send(reply);
  });
}
