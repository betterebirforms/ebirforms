# AGENTS.md: ebirforms

Cross-tool agent guidance for working **on** this repo. Claude Code reads it via `@AGENTS.md` in `CLAUDE.md`.
Canonical: edit this file, never `CLAUDE.md`. Humans start at `CONTRIBUTING.md`; the same rules apply.

## What this is

A cross-platform (macOS-first) rebuild of the Philippine BIR **Offline eBIRForms Package**, recovered by
decompiling `BIRForms.exe` v7.9.6.2. The original is an MFC host around an IE/MSHTML HTA app (VBScript +
jQuery 1.7, ActiveX file access) plus native Windows helpers for encryption and SFTP submission.
We keep the forms' computations and the savefile format compatible, and replace everything Windows-only.
Three layers stay apart (docs/architecture.md): BIR's original (never edited), mods on top of it, the 1:1 rebuild.

## Layout

| Path | What |
|---|---|
| `tool/extract.mjs` | Rebuilds BIR's tree from the user's own installer/zip into `vendor/original/` |
| `asset/bir/` | **Committed** BIR artwork: banner + per-form page barcodes + `barcode.json` (`npm run asset` regenerates). `layout/`: BIR's page layouts for the web version, captured with no BIR code (`EBF_CAPTURE_LAYOUT`) |
| `vendor/original/` | **Gitignored.** Recovered BIR code + `_installer/` native payload + `_manifest.json` |
| `src/` | Vite + React first-run import (strict TS); `caption.html` + `src/caption/` = the faux-XP caption webview |
| `src-tauri/` | Tauri v2 desktop host (Rust): replaces BIRForms.exe and the helper exes |
| `mod/` | Every serve-time change to BIR's pages, one JSON file each, kind = folder (`mod/README.md`). Read by `host/mod.ts` and `src-tauri/src/bir_mod.rs` (embedded by `build.rs`) |
| `public/legacy-shim.js` | What IE gave BIR's pages (ActiveX FSO, VBScript helpers, IE DOM quirks), injected into every page |
| `src/form/` | Native forms: `form<code>.ts` schemas; `entry/<CODE>.ts` registers a form (never edit `registry.ts` for a new one). `LayoutView.tsx` / `MainLayout.tsx`: the web version's BIR-look screens, driven by the engine by BIR's field ids |
| `src/form/export.ts` | Export adapters: the eBIRForms savefile (name + records, BIR's own) and the TSP slot (refuses until BIR issues a layout) |
| `src/form/template/`, `upper-case.json` | **Captured** from BIR's forms (do not hand-edit): each form's blank save, and what BIR upper-cases |
| `mcp/` | The agent server (MCP over stdio): `tool.ts` is what an agent may do (drafts only, never a final copy or a submit), `main.ts` serves it. `npm run build:mcp` → `dist-mcp/`; setup in `docs/agent.md` |
| `src-tauri/src/update.rs`, `mac_dialog.rs` | In-app updates (signed `latest.json` from GitHub releases, Rust-only) and the macOS `alert`/`confirm`/`prompt` panels wry lacks |
| `test/` | vitest, the gate. `test/parity.ts` is the 1:1 check; `test/parity.test.ts` the scoreboard + BIR-defect ledger |
| `docs/` | `architecture.md` (how it fits), `development.md` (commands), `rewrite-playbook.md` (the 1:1 method). `docs/analysis/` web/native-layer findings and `docs/bir/` are private (gitignored); `form-triage.md` is public |

## Rules

- BIR's forms, form pages, artwork, images and reference data **may** be used, committed and bundled (NOTICE.md). Copy what you need into `asset/bir/` (or next to the code that uses it); `vendor/original/` itself stays
  gitignored as the extractor's output. Tests that read the full tree still use `it.skipIf(!existsSync(...))`.
- Two hard lines, for security not copyright: never commit BIR's native helpers (`_installer/*.exe`, `*.dll`,
  `*.pdb`, `proxy.ini`), and never commit or print the SFTP credentials or the `Encrypt.exe` passphrase embedded in them.
- Never execute BIR's binaries, with one exception: on Windows, a *scratch copy* of a pure helper (`chkt.exe`,
  `Encrypt.exe`) may be run as a **test oracle** to generate golden vectors (`test/fixture/`). Never `BIRForms.exe`,
  the HTA, or anything that touches the network.
- Never print credentials found in BIR's binaries: reference them by file:offset and kind only.
- The updater's signing key lives outside the repo (`~/.tauri/`, and the `TAURI_SIGNING_*` secrets). Never commit or print it.
- Both hosts answer only `127.0.0.1`/`localhost`/`[::1]` and serve BIR's pages under one CSP (`PAGE_CSP`, kept equal by `test/host-security.test.ts`). Change both or neither.
- Naming follows `docs/CONVENTIONS.md` (singular everywhere). BIR's own identifiers and file formats are
  external: keep them verbatim.
- Peso arithmetic never uses binary floats (see CONVENTIONS "Money").
- "Done" means `npm run gate` exit 0 (typecheck + vitest), read fresh. A native form is done only when it is 1:1
  (`EBF_PARITY=<CODE>` equal == key, 0 page error). Method and bar: `docs/rewrite-playbook.md`.
- A serve-time change to BIR's pages is a mod: one file in `mod/<kind>/` with a plain `title` + `about` and a test
  (`mod/README.md`). Never edit `vendor/original/`. Both hosts must serve identical pages (`bench/host-parity.mjs`).
  Only the shim and the jQuery swap live outside `mod/`; a change there goes in `public/legacy-shim.js`, or in BOTH
  `host/` and `src-tauri/` with a test on each side.
- Docs: `README.md` and this file are STATE (replace in place). `CHANGELOG.md` is LOG (append under Unreleased, latest first), written for users: plain words, short bullets, no em dashes, no file paths or internal names; technical detail goes in the commit message.
  `ROADMAP.md` is the plan (Now / Next / Later, each row with a "Done when"); killed ideas go to
  `docs/roadmap-rejected.md`. Write every doc for humans: short sentences, no em dashes (CONTRIBUTING "Writing").
  `npm run check:doc` (in the gate) enforces links, no em dashes, real `npm run` names and every env var
  documented in `docs/development.md`; the doc map is CONTRIBUTING "Which doc to update".

## Commands

```sh
npm run extract -- ~/Downloads/Offline_eBIRForms_Package_v7.9.6.2.1.zip   # needs innoextract on PATH
npm run dev          # Vite on 127.0.0.1:10900
npm run tauri dev    # desktop window
npm run gate         # typecheck + tests
npm run gate:rust    # cargo test (also checks every built-in mod parses and compiles)
node bench/host-parity.mjs   # Node and Rust hosts serve all 169 pages/scripts identically (both running)
npm run build:web    # the web version (native forms only, OPFS, offline) → dist-web/; not published
EBF_WEB_BASE=/ebirforms/ npm run build:web && node bench/web-pages.mjs   # the GitHub Pages build, checked as Pages serves it
npm run mod:check    # every mod: valid, portable to the Rust engine, dry-run against BIR's tree
npm run build:mcp    # the agent server → dist-mcp/ebirforms-mcp.mjs
npm run package      # this platform's package (macOS DMG / Windows setup.exe / Linux AppImage+deb) with BIR's forms → dist-package/
npm run check:roundtrip   # web savefile → BIR's own form page, field by field
EBF_NAME=1 npx vitest run test/export-name.test.ts   # every native savefile name == BIR's createXMLFileName
```
