# Development

Moved from the README. How to build, test and package eBIRForms for macOS, and how it works.

## What the original turned out to be

`BIRForms.exe` is an HtaEdit stub. It NOT-decodes 468 embedded files into `%TEMP%` and launches `mshta.exe`:
85 form pages (IE7-mode HTML, JScript and VBScript), ActiveX `FileSystemObject` storage, and four native
helpers (`Encrypt.exe`, `chkt.exe`, `ebfSFTP.exe` with WinSCP)..

## Development

Requirements: Node 22+, Rust (stable), and `innoextract` for the dev extractor (`brew install innoextract`;
on Windows, `scoop install innoextract`).

```sh
npm install
npx playwright install webkit      # for the end-to-end tests and form sweep
cp .env.example .env
npm run extract -- ~/Downloads/Offline_eBIRForms_Package_v7.9.6.2.zip   # → vendor/original (gitignored)
npm run dev          # shell + legacy forms on http://127.0.0.1:10900
npm run tauri dev    # desktop window over the dev server
npm run gate         # typecheck + vitest (incl. 0605 end-to-end in WebKit)
npm run gate:rust    # cargo test (import pipeline, codec, TIN vectors)
npm run bench:sweep  # open all 84 forms in WebKit → bench/result/sweep-webkit.json
npm run asset        # refresh asset/bir/ (BIR banner + page barcodes) from vendor/original
npx tauri build      # packaged app (.dmg on macOS)
npm run package      # universal DMG with BIR's forms bundled, shareable build → dist-package/
                     # signed + notarized + stapled when APPLE_SIGNING_IDENTITY (Developer ID Application) and
                     # APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID (or APPLE_API_KEY/_ISSUER/_KEY_PATH) are set
npm run check:roundtrip   # web version's savefile, opened by BIR's own form page, field by field

# 1:1 scoreboard: every native form vs BIR's own form → bench/result/parity.json (not part of the gate)
EBF_PARITY=1 npx vitest run test/parity.test.ts
# every native savefile name vs BIR's own createXMLFileName → bench/result/name.json
EBF_NAME=1 npx vitest run test/export-name.test.ts
# re-capture BIR's per-form save templates / upper-casing after importing a newer package
EBF_CAPTURE=1 npx vitest run test/capture-template.test.ts
EBF_CAPTURE_UPPER=1 npx vitest run test/capture-template.test.ts
```

How to rewrite a form and the 1:1 bar: [docs/rewrite-playbook.md](rewrite-playbook.md).

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `VITE_DEV_SERVER_PORT` | `10900` | Vite dev server (block 10900–10999; the packaged host uses 10907) |
| `EBIRFORMS_ORIGINAL_DIR` | `vendor/original` | Where the dev extractor writes the recovered tree |
| `EBIRFORMS_DATA_DIR` | `.data` | Dev data root (savefile/, profile/) |
| `EBIRFORMS_GOLDEN_SAVEFILE` | — | Optional: a real savefile, round-trip tested byte-for-byte |
| `EBIRFORMS_HOST_URL` / `EBIRFORMS_HOST_DATA` | — | Run the 0605 end-to-end test against another host (e.g. the packaged app) |
| `EBF_PARITY` | — | Run the 1:1 scoreboard: `1` for every native form, or a comma list of form codes |
| `EBF_PARITY_STRICT` | — | Scoreboard treats an empty box and `0.00` as different (BIR's Validate does) |
| `EBF_CAPTURE` / `EBF_CAPTURE_UPPER` | — | Re-capture `src/form/template/*.json` / `src/form/upper-case.json` from BIR's forms (`1` or a code list) |

## Architecture

```
Tauri v2 window ──► http://127.0.0.1:10907  (src-tauri/src/host.rs; dev: host/legacy-server.ts in Vite)
                     ├─ /            first-run import (src/App.tsx), then → /legacy/BIRForms.hta (BIR's main screen)
                     ├─ /caption.html  the Luna caption strip (its own child webview above the content)
                     ├─ /legacy/…    BIR's form pages + injected public/legacy-shim.js (+ host/form-patch.ts fixes)
                     ├─ /__vfs       sync filesystem protocol: data root over the imported original
                     ├─ /__import    official zip → Inno LZMA2 → x86 un-filter → PE resources (package.rs)
                     ├─ /__vfs dispatch/send  BIR's Submit: dispatcher (dispatch.rs) → SFTP, host-key pinned (submit.rs)
                     └─ /__print /__close  native print of the content webview; BIR's Exit closes the window
```

BIR's upload login comes from BIR's dispatcher per return and lives only in the host's memory; the page never
sees it. The ebfSFTP and `Encrypt.exe` passphrases are read at runtime from the user's own imported installer;
neither is in this repo.

The shim gives the unmodified forms what `mshta` used to: ActiveX `FileSystemObject`, `WScript.Shell`
and `XMLDOM`, JScript `Enumerator`, the VBScript helpers, and IE's `getElementById` semantics.

## Legal

The native rewrite (`src/`, `src-tauri/`, `host/`, `tool/`, `test/`) is original work by Mar Angelo Revelo.

BIR's forms, form layouts, artwork and reference data are works of the Philippine Government. Under RA 8293
§176.1 no copyright subsists in them, so this project uses them freely, in the repository and in the app. The law
keeps two limits: exploiting a government work **for profit** needs BIR's prior approval (§176.1), and the parts of
the original package BIR did not author (the HtaEdit stub, WinSCP, jQuery) keep their own licenses.

The app bundles BIR's banner and every form's page barcodes (`asset/bir/`, refreshed by `npm run asset`); the
native forms show them. BIR's legacy form pages are still imported from the user's copy of the official download. This project is not affiliated with or endorsed by the Bureau of Internal Revenue.
