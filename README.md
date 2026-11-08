# ebirforms

A cross-platform, **macOS-first** rebuild of the Philippine BIR **Offline eBIRForms Package**, the
Windows-only app taxpayers use to fill in and submit BIR returns. It was recovered by decompiling
`BIRForms.exe` v7.9.6.2, and it fixes the original's bugs instead of wrapping it in Wine.

> **Status: beta.** All 84 BIR form pages load error-free in WebKit (the macOS engine) and prefill from
> your taxpayer profile. Filling, computing, saving, final copies and **online submission** work; saved
> returns stay compatible with the Windows app. Submission is proven end-to-end against a local SFTP server
> but has **not** been tested against BIR's production server. See [ROADMAP.md](ROADMAP.md).
>
> **Looks like eBIRForms on Windows XP:** a Luna-framed window around BIR's own main screen and form pages, served
> 1:1, with XP-styled controls. The original's bugs are fixed underneath (see CHANGELOG).
>
> **Native forms:** all 84 forms are rewritten natively (no IE engine), and every one is **1:1** with BIR's
> own form: a native save, reopened and recomputed by BIR's own code, gives back the same savefile records. The app
> currently runs BIR's own pages from the main screen; the native forms are the tested, 1:1 rewrite underneath.

## Using the app

1. Install the `.dmg` and open **eBIRForms**. The package build (`npm run package`) is one universal DMG
   (Apple Silicon + Intel) with BIR's forms already inside, like BIR's own package. It is the shareable build: no
   Online Submit. It is unsigned unless built with an Apple Developer ID (below), so macOS asks for a right-click → Open the first time.
2. The plain build instead asks on first launch for BIR's official **Offline eBIRForms Package** (the Windows `.zip`)
   and unpacks BIR's forms from it itself; nothing is installed or run. Either build takes a newer BIR package
   through the same import.
3. You get BIR's own main screen. Enter your profile, pick a form, **Fill-up**, and save, exactly as on Windows.
4. **Submit / Final Copy** works like the original. After you confirm, the app asks BIR's dispatcher where the
   return goes, then encrypts it and uploads it over SFTP. BIR's login stays inside the app, and BIR's server key
   is pinned on first use. If BIR can't be reached, the return is saved as a final copy; open it again later and
   Submit to send it. An optional HTTP proxy goes in `data/settings/submit.json` (`proxy_host`, `proxy_port`).

Returns live in `~/Library/Application Support/ph.advo.ebirforms/data/savefile/`, in the same format the
Windows app uses, so files can move between the two in either direction.

## What the original turned out to be

`BIRForms.exe` is an HtaEdit stub. It NOT-decodes 468 embedded files into `%TEMP%` and launches `mshta.exe`:
85 form pages (IE7-mode HTML, JScript and VBScript), ActiveX `FileSystemObject` storage, and four native
helpers (`Encrypt.exe`, `chkt.exe`, `ebfSFTP.exe` with WinSCP). Full findings:
[web layer](docs/analysis/web-layer.md) · [native layer](docs/analysis/native-layer.md).

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

How to rewrite a form and the 1:1 bar: [docs/rewrite-playbook.md](docs/rewrite-playbook.md).

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
