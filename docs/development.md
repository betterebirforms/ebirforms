# Development

How to build, test and package eBIRForms. New here? Start with [CONTRIBUTING.md](../CONTRIBUTING.md) for setup and
the repo layout, and [architecture.md](architecture.md) for how it fits together.

## Everyday commands

```sh
npm run dev          # BIR's main screen and forms on http://127.0.0.1:10900
npm run tauri dev    # the desktop window, over the dev server
npm run gate         # typecheck + tests: must pass before every pull request
npm run gate:rust    # the Rust tests (server, import, mods, TIN check digit)
npm run doctor       # checks your tools; add --gate or --build to go further
```

## Tests

`npm run gate` runs `tsc` and vitest. Tests that need BIR's package skip themselves when `vendor/original/` is
missing, so the gate passes on a fresh clone; run `npm run extract` to run them all.

Some checks are too slow for the gate and run on request:

```sh
# 1:1 scoreboard: every rebuilt form against BIR's own form → bench/result/parity.json
EBF_PARITY=1 npx vitest run test/parity.test.ts          # or EBF_PARITY=1701Q for one form
# every rebuilt form's savefile name against BIR's own → bench/result/name.json
EBF_NAME=1 npx vitest run test/export-name.test.ts
# save and reopen all 84 of BIR's forms
EBF_SAVE=1 npx vitest run test/save-sweep.test.ts
# print every page on A4, Legal and long bond
EBF_PRINT=1 npx vitest run test/print-check.test.ts
# a web-version savefile, opened in BIR's own form page
npm run check:roundtrip
# open all 84 forms in WebKit → bench/result/sweep-webkit.json
npm run bench:sweep
# how fast forms open
npm run bench:open
```

### Both servers serve the same page

The desktop app serves BIR's pages from Rust, `npm run dev` from Node. To check they match on every page and
script, start both and compare:

```sh
npm run build        # the Rust host serves the built dist/ folder
npm run dev &
cargo run --manifest-path src-tauri/Cargo.toml --example host -- dist vendor/original <any empty folder> 10907 &
node bench/host-parity.mjs     # identical 169 / 169
```

The Rust host reads your own mods only when `EBF_MOD_DIR` is set; the dev server reads `.mod/`. To compare a
mod of yours, point both at the same folder (`EBF_MOD_DIR=.mod`).

### After BIR releases a new package

```sh
npm run extract -- ~/Downloads/<new package>.zip
npm run asset                                              # BIR's banner and barcodes → asset/bir/
EBF_CAPTURE=1 npx vitest run test/capture-template.test.ts      # each form's blank save
EBF_CAPTURE_UPPER=1 npx vitest run test/capture-template.test.ts  # which fields BIR upper-cases
EBF_PARITY=1 npx vitest run test/parity.test.ts            # are the rebuilt forms still 1:1?
```

## Packaging

```sh
npm run package      # this computer's package, with BIR's forms inside → dist-package/
                     #   macOS: universal .dmg, Windows: setup.exe, Linux: .AppImage and .deb
npm run build:web    # the web version (rebuilt forms only, works offline) → dist-web/; not published
npm run build:share  # the desktop app without online submission
npm run check:share  # proves that build has no BIR server names or secrets in it
```

The macOS download opens on a window that shows how to install and first open the app. Edit
`asset/brand/dmg/background.html`, then run `npm run asset:dmg` (macOS only) to redraw it. The Windows installer's
side picture and banner come from `asset/brand/installer/`; redraw them with `npm run asset:nsis`.

The release page text (install steps for each system) is `.github/release-note.md`. CI puts it on every release. Its Windows pictures
(`asset/brand/release/`) are real SmartScreen screenshots from GitHub's Windows Server 2025 runner, and its Linux one is Ubuntu 24.04's
Files app.

The macOS package is signed, notarized and stapled when `APPLE_SIGNING_IDENTITY` names a Developer ID Application
certificate and `APPLE_ID` / `APPLE_PASSWORD` / `APPLE_TEAM_ID` (or `APPLE_API_KEY` / `APPLE_API_ISSUER` /
`APPLE_API_KEY_PATH`) are set. Without them it is built unsigned.

A `v*` tag builds all three platforms in CI (`.github/workflows/build.yml`) and publishes the release.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `VITE_DEV_SERVER_PORT` | `10900` | Dev server port (the desktop app's server uses 10907) |
| `EBIRFORMS_ORIGINAL_DIR` | `vendor/original` | Where `npm run extract` puts BIR's package |
| `EBIRFORMS_DATA_DIR` | `.data` | Dev data: saved returns and profiles |
| `EBIRFORMS_MOD_DIR` | `.mod` | Dev folder for your own [mods](../mod/README.md) and their on/off switches |
| `EBF_MOD_DIR` | (none) | The same, for the Rust host run with `--example host` |
| `EBIRFORMS_GOLDEN_SAVEFILE` | (none) | A real savefile to round-trip byte for byte |
| `EBIRFORMS_HOST_URL` / `EBIRFORMS_HOST_DATA` | (none) | Run the 0605 end-to-end test against another server, such as the desktop app's |
| `EBF_PARITY` | (none) | Run the 1:1 scoreboard: `1` for every form, or a list of form codes |
| `EBF_PARITY_STRICT` | (none) | Treat an empty box and `0.00` as different, as BIR's Validate does |
| `EBF_CAPTURE` / `EBF_CAPTURE_UPPER` | (none) | Re-capture each form's blank save / upper-casing from BIR's forms |

### Test and debug switches

Off unless set. The desktop-window ones work only in a debug build (`npm run tauri dev`).

| Variable | What it does |
|---|---|
| `EBF_SAVE` | Run the save-and-reopen sweep over all 84 of BIR's forms |
| `EBF_PRINT` / `EBF_PRINT_INJECT` | Run the paper-size print check / make it fail on purpose, to prove it can |
| `EBF_NAME` | Compare every rebuilt form's savefile name with BIR's |
| `EBIRFORMS_URL` | Server the benches use (default `http://127.0.0.1:10900`) |
| `EBIRFORMS_PROFILE` | Profile the form sweep opens forms with (default `profile/84653210700000.xml`) |
| `EBIRFORMS_PACKAGE` | BIR's zip, for the Rust import test (`cargo test -- --ignored`) |
| `EBIRFORMS_SFTP` | `host:port` of a local SFTP server, for the Rust upload test |
| `EBF_DISPATCH_HOST` | Where the Rust host asks for BIR's upload target. Set `127.0.0.1:9` in tests so nothing reaches BIR |
| `EBF_SFTP_EXE` / `EBF_SFTP_PASSPHRASE` | Point the full build at a test copy of BIR's SFTP helper, or give its passphrase directly (tests only) |
| `EBF_TOKEN` | Fixed page token for the Rust host run with `--example host` |
| `EBF_RUST_HOST` | Desktop window on the Rust host over `dist/`, with this data folder, instead of the dev server |
| `EBF_SELFTEST` | Press the title bar's buttons in the real window and check the window state after each |
| `EBF_GOTEST` | Run the Go menu's two items in the real window |
| `EBF_PRINTTEST` | `forms/<page>.hta\|<js>`: open a page and run its print in the real window |
| `EBF_FINALTEST` | With `EBF_RUST_HOST`: click through 0605's Final Copy in the real window |

## Working in parallel

Several forms or features can be built at once in git worktrees. Symlink `vendor/` and `node_modules/` from the main
checkout, merge `main` before the final gate, and run one vitest process at a time (the WebKit tests are heavy).
