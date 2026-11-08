# How eBIRForms is built

BIR's Offline eBIRForms Package is an old Internet Explorer app: 84 form pages that only run on Windows, plus a
few Windows-only helper programs (for encryption, the TIN check and uploading). This project runs those same
pages on macOS, Windows and Linux, and rebuilds each form in modern code next to them.

## Three layers, kept apart

```
3. The rebuild          src/form/                        84 forms in TypeScript
                            │  each one checked 1:1 against layers 1 + 2
2. Our changes          mod/  and  public/legacy-shim.js  served on top of BIR's pages
                            │  applied while serving, never written to disk
1. BIR's original       vendor/original/  and  asset/bir/  never edited
```

| Layer | Rule | Where |
|---|---|---|
| **1. BIR's original** | Never edited, ever. It is what BIR shipped, byte for byte. | `vendor/original/` (from `npm run extract`), BIR's artwork in `asset/bir/` |
| **2. Our changes to BIR's pages** | Applied while a page is served, never written to disk. Every change is a [mod](../mod/README.md) you can read and switch off. | `mod/` (the changes), `public/legacy-shim.js` (Internet Explorer features for today's browsers), `host/` and `src-tauri/src/bir_mod.rs` (the engines) |
| **3. The rebuild** | Must give the same saved file as BIR's own form, field by field (1:1). Improvements here wait until the rebuild is the default (see the roadmap). | `src/form/` |

So a contributor can always answer "is this BIR's or ours?" by the folder: `vendor/original` is BIR's, `mod/` is
ours on top of BIR's, `src/form/` is ours from scratch.

## What runs when you open a form

```
desktop window (Tauri, the framework that turns a web page into a desktop app)
   │
   ▼
local web server on 127.0.0.1         src-tauri/src/host.rs   (in development: host/legacy-server.ts in Vite)
   ├─ /                    first-run import screen (src/App.tsx), then BIR's main screen
   ├─ /legacy/<page>       BIR's page  ──►  mods applied  ──►  shim added  ──►  your webview
   ├─ /__vfs               file access for the shim: your data folder over BIR's tree
   ├─ /__mod               the mods in effect
   ├─ /__import            unpacks BIR's official zip (src-tauri/src/package.rs)
   └─ /__print, /__close   native print, and BIR's Exit button closing the window
```

- **Two servers, one behaviour.** The packaged app serves pages from Rust; `npm run dev` serves them from Node.
  Both read the same `mod/` files, and `bench/host-parity.mjs` checks they serve every page and script
  identically.
- **The shim** (`public/legacy-shim.js`) gives BIR's unmodified pages what Internet Explorer used to give them:
  reading and writing files (ActiveX), BIR's small VBScript helpers, reading XML, and a few old Internet Explorer
  behaviours the pages depend on.
- **The window** is frameless, with a Windows XP style title bar (`caption.html`, `src/caption/`) as its own small
  webview above BIR's page.

## Where your data lives

| What | Where (desktop app) |
|---|---|
| Saved returns and profiles | `<app data>/data/savefile/`, `<app data>/data/profile/` (BIR's own folder names and file format) |
| An imported BIR package | `<app data>/original/` |
| Your own mods and switches | `<app data>/mod/` |

`<app data>` is `~/Library/Application Support/ph.advo.ebirforms` on macOS, `%APPDATA%\ph.advo.ebirforms` on
Windows and `~/.local/share/ph.advo.ebirforms` on Linux.

## Online submission

The downloadable app is built without it (`--no-default-features`). The full build (the Rust build option `bir-submit`)
does what BIR's app does: asks BIR's dispatcher where to upload (`dispatch.rs`), encrypts the final copy the way
`Encrypt.exe` does (`crypto.rs`), and uploads over SFTP with the server's key pinned (`submit.rs`). The
passphrases come from the user's own copy of BIR's helpers at runtime and are never in this repo. It has never
been run against BIR's real server.

## The web version

`npm run build:web` builds a browser version with the rebuilt forms only (layer 3). It never loads BIR's pages and
stores returns in the browser (`src/lib/web-store.ts`). It is built and tested, not published.
