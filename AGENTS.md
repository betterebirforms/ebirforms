# AGENTS.md — ebirforms

Cross-tool agent guidance for working **on** this repo. Claude Code reads it via `@AGENTS.md` in `CLAUDE.md`.
Canonical — edit this file, never `CLAUDE.md`.

## What this is

A cross-platform (macOS-first) rebuild of the Philippine BIR **Offline eBIRForms Package**, recovered by
decompiling `BIRForms.exe` v7.9.6.2. The original is an MFC host around an IE/MSHTML HTA app (VBScript +
jQuery 1.7, ActiveX file access) plus native Windows helpers for encryption and SFTP submission.
We keep the forms' computations and the savefile format compatible, and replace everything Windows-only.

## Layout

| Path | What |
|---|---|
| `tool/extract.mjs` | Rebuilds BIR's tree from the user's own installer/zip into `vendor/original/` |
| `asset/bir/` | **Committed** BIR artwork: banner + per-form page barcodes + `barcode.json` (`npm run asset` regenerates) |
| `vendor/original/` | **Gitignored.** Recovered BIR code + `_installer/` native payload + `_manifest.json` |
| `src/` | Vite + React first-run import (strict TS); `caption.html` + `src/caption/` = the faux-XP caption webview |
| `src-tauri/` | Tauri v2 desktop host (Rust) — replaces BIRForms.exe and the helper exes |
| `src/form/` | Native forms: `form<code>.ts` schemas; `entry/<CODE>.ts` registers a form (never edit `registry.ts` for a new one) |
| `src/form/export.ts` | Export adapters: the eBIRForms savefile (name + records, BIR's own) and the TSP slot (refuses until BIR issues a layout) |
| `src/form/template/`, `upper-case.json` | **Captured** from BIR's forms (do not hand-edit): each form's blank save, and what BIR upper-cases |
| `test/` | vitest — the gate. `test/parity.ts` is the 1:1 check; `test/parity.test.ts` the scoreboard + BIR-defect ledger |
| `docs/analysis/` | Reverse-engineering findings (web layer, native layer) |

## Rules

- BIR's forms, form pages, artwork, images and reference data **may** be used, committed and bundled (docs/development.md
  "Legal"). Copy what you need into `asset/bir/` (or next to the code that uses it); `vendor/original/` itself stays
  gitignored as the extractor's output. Tests that read the full tree still use `it.skipIf(!existsSync(...))`.
- Two hard lines, for security not copyright: never commit BIR's native helpers (`_installer/*.exe`, `*.dll`,
  `*.pdb`, `proxy.ini`), and never commit or print the SFTP credentials or the `Encrypt.exe` passphrase embedded in them.
- Never execute BIR's binaries, with one exception: on Windows, a *scratch copy* of a pure helper (`chkt.exe`,
  `Encrypt.exe`) may be run as a **test oracle** to generate golden vectors (`test/fixture/`). Never `BIRForms.exe`,
  the HTA, or anything that touches the network.
- Never print credentials found in BIR's binaries — reference them by file:offset and kind only.
- Naming follows `docs/CONVENTIONS.md` (singular everywhere). BIR's own identifiers and file formats are
  external — keep them verbatim.
- Peso arithmetic never uses binary floats (see CONVENTIONS "Money").
- "Done" means `npm run gate` exit 0 (typecheck + vitest), read fresh. A native form is done only when it is 1:1
  (`EBF_PARITY=<CODE>` equal == key, 0 page error) — method and bar in `docs/rewrite-playbook.md`.
- A serve-time compat fix for BIR's pages goes in `public/legacy-shim.js` (every form) or BOTH `host/form-patch.ts`
  and `src-tauri/src/codec.rs` with a Rust test — the dev and packaged hosts must serve identical pages.
- Docs: `README.md` and this file are STATE (replace in place). `CHANGELOG.md` is LOG (append, latest first), written for users: plain words, short bullets, no em dashes, no file paths or internal names; technical detail goes in the commit message.
  `ROADMAP.md` is the tiered plan; killed ideas go to `docs/roadmap-rejected.md`.

## Commands

```sh
npm run extract -- ~/Downloads/Offline_eBIRForms_Package_v7.9.6.2.zip   # needs innoextract on PATH
npm run dev          # Vite on 127.0.0.1:10900
npm run tauri dev    # desktop window
npm run gate         # typecheck + tests
npm run build:web    # the web version (native forms only, OPFS, offline) → dist-web/; not published
npm run package      # this platform's package (macOS DMG / Windows setup.exe / Linux AppImage+deb) with BIR's forms → dist-package/
npm run check:roundtrip   # web savefile → BIR's own form page, field by field
EBF_NAME=1 npx vitest run test/export-name.test.ts   # every native savefile name == BIR's createXMLFileName
```
