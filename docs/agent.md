# Using eBIRForms with an AI agent (MCP)

eBIRForms has a small server that lets an AI agent, like Claude or Codex, fill BIR returns with the app's own
computations. It speaks the Model Context Protocol (MCP), the standard way agents connect to tools.

This is a first version, a foundation. It works on the rebuilt forms, which give the same numbers as BIR's own forms
(all 84 are checked field by field).

## What an agent can do

| Tool | What it does |
|---|---|
| `list_form` | Lists the forms it can fill |
| `describe_form` | One form's fields: id, label, kind, required, computed, and schedule rows |
| `fill_form` | Computes a return without saving it: every computed amount, BIR's validation problems, and the file name |
| `save_return` | Saves the return as a **draft** in the eBIRForms app, where it opens from BIR's main screen |
| `list_return` / `read_return` | Lists the saved returns, and reads one's values |
| `list_profile` | Lists the taxpayer profiles saved in the app |

## What it will never do

- **File with BIR.** Nothing here sends anything anywhere. The server has no network code.
- **Make a final copy.** It saves drafts only. You open the draft in the app, check it, and make the final copy yourself.
- **Change a final copy**, or replace a draft unless the agent passes `overwrite: true`.
- **Touch other files.** It reads and writes only the app's `profile/` and `savefile/` folders, and refuses any
  file name that isn't one plain `.xml` name.

An agent can still make mistakes with your numbers. Review every return before you file it.

## Set it up

You need Node.js 20 or newer and a copy of this repository.

```sh
npm ci
npm run build:mcp        # writes dist-mcp/ebirforms-mcp.mjs, one file with no dependencies
```

Then add it to your agent:

| Agent | How |
|---|---|
| Claude Code | `claude mcp add ebirforms -- node /full/path/to/dist-mcp/ebirforms-mcp.mjs` |
| Claude Desktop | In `claude_desktop_config.json`, under `mcpServers`: `"ebirforms": { "command": "node", "args": ["/full/path/to/dist-mcp/ebirforms-mcp.mjs"] }` |
| Codex CLI | In `~/.codex/config.toml`: `[mcp_servers.ebirforms]`, `command = "node"`, `args = ["/full/path/to/dist-mcp/ebirforms-mcp.mjs"]` |

It uses the desktop app's data folder, so drafts appear in the app:

| System | Folder |
|---|---|
| macOS | `~/Library/Application Support/ph.advo.ebirforms/data/` |
| Windows | `%APPDATA%\ph.advo.ebirforms\data\` |
| Linux | `~/.local/share/ph.advo.ebirforms/data/` |

To use another folder (for testing), pass `--data <folder>` or set `EBF_DATA_DIR`.

## Try it

Ask your agent: "Using eBIRForms, fill a 0605 for TIN 846-532-107-00000, return period 15 October 2026, basic tax
1,234.50, and tell me the total." It should call `describe_form`, then `fill_form`, and report the total from
`frm0605:txtTax21`.

## For developers

- The tools are plain functions in `mcp/tool.ts`; `mcp/main.ts` is the MCP layer (JSON-RPC over stdio, written
  by hand so the server has no runtime dependency). Tests: `test/mcp.test.ts`.
- To add a tool, add a function and a `TOOL` entry with a plain description, then a test. Keep the rules above:
  no network, drafts only, the app's folders only.
- Next steps are on the [roadmap](../ROADMAP.md): the same tools inside the running app (so an agent sees what is
  on screen), and in the web version.
