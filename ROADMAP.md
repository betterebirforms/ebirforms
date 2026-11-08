# ROADMAP

Living document. Edited honestly — gaps are gaps, not "opportunities."

Evidence for every item is in [`docs/analysis/web-layer.md`](docs/analysis/web-layer.md) (WL §) and
[`docs/analysis/native-layer.md`](docs/analysis/native-layer.md) (NL §). Killed ideas: [`docs/roadmap-rejected.md`](docs/roadmap-rejected.md).

## Where we are

All 84 of BIR's form pages load error-free in WebKit (the macOS engine) behind the compatibility shim, and 82
prefill the taxpayer from our profile, on both the Node dev host and the packaged app's Rust host. The app is
BIR's own main screen in a faux-XP (Luna) window. The packaged app imports BIR's official zip itself (no
innoextract). BIR's own Submit button files through the dispatcher → Encrypt.exe-compatible encryption → SFTP
(P2). 83 of the 84 forms are rewritten natively and 1:1 with BIR's own form (P3), but the main screen still opens
BIR's pages, not the native forms. Not yet: the last 2 native rewrites, routing the main screen to the native
forms, submission against BIR's production server, and a signed + notarized release build (CI builds the .dmg;
this Mac has no "Developer ID Application" identity, so an unsigned build needs right-click → Open). Print
prints every page; Save/reopen is swept 84/84.

## Strategy

1. **Compatibility first.** Run BIR's own form pages, unmodified, in the system webview behind a shim
   (ActiveX FSO / WScript.Shell / XMLDOM / `Enumerator` / the VBScript helpers) backed by a virtual
   filesystem. That gives every form on macOS quickly, and it becomes the **test oracle**.
2. **Rewrite underneath.** Persistence, reference data, money math, crypto, submission and the main shell
   are rewritten natively, and stay compatible with existing `savefile/` and `profile/` files in both directions.
3. **Re-implement forms one by one** as typed schemas (fields + compute graph + validation), checked against
   the legacy form on golden savefiles. Superseded forms become open/print-only.

## P0 — runs on a Mac

| Item | What it closes | Effort | Status | Benchmark |
|---|---|---|---|---|
| Extractor `tool/extract.mjs` | Recover the tree from the user's own installer, no 7z or Windows needed | S | **done** | `test/extract.test.ts` (synthetic PE + real package: 469 entry) |
| Savefile + profile codec | Read/write BIR's not-quite-XML `<div>k=v k=</div>` format, cp1252, trailer, final flag, `escape()` fields (WL §2.2–2.3) | M | **done** | `test/savefile.test.ts` round-trip + spec edge cases |
| Reference data → JSON | ATC/RDO/city/province/region/tax-type/treaty from the pseudo-XML; exact form filtering instead of substring (WL §2.4) | S | **done** | `test/reference.test.ts` (counts 1087 ATC, 138 RDO… on the real tree) |
| TIN check digit (`chkt.exe`) | Native check-digit validation (NL §3) | S | **done** | `test/tin.test.ts` |
| Legacy-form host + compat shim | `ActiveXObject` FSO/Shell/XMLDOM, `Enumerator`, VBS helpers, IE `getElementById`, CWD-relative paths, sync VFS (WL §1.3, §6.1) | L | **done** | `test/legacy-0605.test.ts` (Node + Rust host); `npm run bench:sweep` 84/84 clean |
| Data root | App data dir (`~/Library/Application Support/ph.advo.ebirforms/data`) instead of CWD-relative paths (WL bug 16) | S | **done** | 0605 e2e against the Rust host writes there |
| ~~React main shell~~ → **BIR's real main screen in a faux-XP window** | The React shell was the one surface where we redrew BIR's UI. Reversed 2026-11-07 (user: "1:1, everything the same"): `BIRForms.hta` serves through the host + shim inside a frameless window with a Luna caption webview; first-run import stays React; BIR's controls restyled as XP Luna; main-screen bugs fixed served-patched (WL bug 14 sort; Delete's `[object Object]` path) | M | **done** | `test/main-screen.test.ts`; WebKit playtest on the packaged host (0 page errors, sort + Delete live); desktop window measured maximized; caption self-test (`EBF_SELFTEST=1`) passes max/restore/dblclick/minimize/drag-IPC/close |
| In-app package import (Rust) | zip → Inno LZMA2 chunk → undo the x86 call filter → PE resources; no innoextract on a Mac | M | **done** | `cargo test -- --ignored` on the real zip (468 file); UI import run on the release build |
| macOS build in CI | `.app`/`.dmg` for Apple Silicon + Intel; signing + notarization need an Apple Developer ID (none on this machine — blocked on you) | S | wired, unsigned | `.github/workflows/build.yml` green on `macos-latest` |

## P1 — every form, and the bugs users feel

Status of every audited issue: [docs/analysis/audit-status.md](docs/analysis/audit-status.md).

| Item | What it closes | Effort | Status | Benchmark |
|---|---|---|---|---|
| All 79 menu forms through the shim | Every live form opens/saves/prints in WKWebView | L | load + prefill **done** (84/84); **save/reopen swept 84/84** (`EBF_SAVE=1 test/save-sweep.test.ts`, Node + Rust host: 56 write a file and reopen clean, 28 refuse a blank form with BIR's own required-field message, 0 page errors outside the BIR-defect ledger) | `npm run bench:sweep`, `EBF_SAVE=1` |
| Final copy when BIR is unreachable | BIR's offline branch (`txtFinalFlag=3`), which BIR hard-wired unreachable, is taken when the dispatcher answers mode "0" or not at all, with an honest notice; resubmit later from the reopened return | S | **done** | `test/legacy-0605.test.ts` (dev host = mode "0") validate → final copy → read-only |
| IE `disabled` on every element | ATC / Tax Type pickers are `<a>` links gated on `.disabled == false` — never opened in WebKit | S | **done** | same test drives both pickers by click |
| Host parity | Node dev host and Rust host serve identical pages | S | **done** | `bench/host-parity.mjs` 84/84 |
| Print / PDF | `window.print()` / `execCommand('print')` → native print via `/__print` in the packaged app | M | **done on a real Mac** — the sheet is non-blocking, so the 4 restore-after-print sites (1701MS, 1702Qv2018C ×2, 2200Pv2020) are deferred to `__ebfAfterPrint` (`fixRestoreAfterPrint`, TS + Rust). 1702Qv2018C: BIR's sequence printed 2 pages (page 1 + a fragment), patched prints all 5 | printed page images match original layout |
| Fix: names altered on save | Always-true `id !== A \|\| id !== B` applied `NumWithParenthesis` to names/addresses (WL bug 11) | S | **done** (`form-patch`, TS + Rust) | `test/form-patch.test.ts` |
| Fix: 1701A final copy never final | 2014 trailer vs 2012 check (WL bug 10) | S | **done** (`form-patch`, TS + Rust) | `test/form-patch.test.ts` |
| Fix: amounts >12 digits → 0.00 | `round()` silently zeroed a >12-digit amount (WL bug 12) | M | **done** — `fixSilentAmountZeroing` truncates to 12 digits instead | `test/form-patch.test.ts` (runs patched `round`) |
| Fix: `&`/`<` corrupted on reload | Parse raw bytes, never via innerHTML (WL bug 13) | S | **done** | `test/savefile.test.ts` round-trip |
| Fix: infinite compute cycles in 1702RTv2018/C | IE died with "Out of stack space" on load | S | **done** (`host/form-patch.ts`, `codec.rs`) | sweep: 0 errors |
| Surface hidden reference rows | Duplicate ATC indexes 984/1027 hide WC230 + WV040; treaty45 Vietnam sits past the declared count | S | **done** in `src/lib/reference.ts`; forms still use BIR's loader | `test/reference.test.ts` |
| Fix: slow form open | O(N×filesize) reference parsing (WL bug 15) | M | **done** — cached innerHTML; every form < 2 s (1601F 2.23→1.59 s) | `npm run bench:open` |
| Never persist `ebirOnlineSecret` | User's eBIRForms-Online password written in plaintext (WL security 2) | S | **done** (both hosts) | `test/savefile.test.ts`, `codec.rs` test |
| Sanitise TCT → filename | Path injection in 1606/1706 (WL security 5) | S | **done** (`fixTctFilenameInjection`) — host sandbox also contains it | `test/form-patch.test.ts` |

## P2 — submission (needs an owner decision first, see below)

| Item | What it closes | Effort | Status | Benchmark |
|---|---|---|---|---|
| Encrypt.exe-compatible encryption | zlib-9 + AES-256-CBC (IV = AES_K(0)), byte-exact (NL §2) | M | **done** (`crypto.rs`) | matches real Encrypt.exe on 11 samples; uploaded file decrypts back |
| Native SFTP submit | russh/russh-sftp, host-key pinned, no creds in argv, HTTP-CONNECT proxy (NL §4) | L | **done** (`submit.rs`, `host.rs`) | integration test on a live SFTP server; full e2e via packaged app |
| Dispatcher without `eval` | `JSON`/strict parse of the dispatcher response, HTTPS where BIR offers it (WL security 1) | S | **done** (`dispatch.rs` `parse_dispatch`) — the `{mode,server,…}` body is read key-by-key as data, never executed | `parses_a_js_object_literal_without_eval` |
| Dispatcher-resolved upload target | eBIRForms' Submit asks BIR where to upload (`tinDispatcherSFTP.php`) and decrypts the answer with ebfSFTP's passphrase; without it the user must type the server by hand (WL §4) | M | **done** (`dispatch.rs`), driven by **BIR's own Submit button** (shim `conService`/`RenameAndSendFile` → host `dispatch`/`send` ops) — ported from PhilForms; passphrase read at runtime from the user's own ebfSFTP.exe, never stored | 7 `dispatch::tests` incl. `reads_the_real_ebfsftp_passphrase` + backup-host fallback |
| Correct per-form upload folder | Resend `""` folder + missing 2200*v20xx PROD folders (WL bugs 8, 9) | S | **done** — folder defaults to the form code | `submit.rs` test |
| Version / broadcast as text | No HTML injection from the version check | S | todo | `<script>` in message renders as text |

**Credentials:** BIR's Submit button gets the per-return server and login from BIR's own `tinDispatcherSFTP.php`,
exactly as eBIRForms does. The host asks only after the user confirms the submit, decrypts the answer with the
ebfSFTP passphrase read at runtime from the user's own imported `ebfSFTP.exe` (never stored), and keeps the login in
memory; the page only learns `mode`. The SSH host key is pinned trust-on-first-use (a changed key asks first), and
the final-copy passphrase comes from the user's own `Encrypt.exe`. The manual "Submission settings" path went with
the React shell (2026-11-07); only an optional proxy remains, in `data/settings/submit.json`, with no UI. The
encrypted DEV/UAT *hostname* blob (`UAT_HOST_BLOB`) committed in `dispatch.rs` is a known-plaintext oracle for
identifying the passphrase string, not a credential. **Still unproven against BIR's real production server.**
`birgovph.com` has never been contacted and no return has been uploaded to BIR. The full chain (BIR's Submit
button → dispatcher → decrypt → encrypt → SFTP) is proven in WebKit against a local stand-in dispatcher and a
local SFTP server. The one remaining test is a live filing with a real TIN.

## P3 — rewrite the forms properly

| Item | What it closes | Effort | Status |
|---|---|---|---|
| Form schema + compute graph | Typed field list, computations and validations as data | L | **done** — `src/form/schema.ts` + money.ts; 0605 proven | `test/form0605.test.ts` |
| Rewrite current forms by usage | 84 native, every one **1:1** with BIR's own form (`test/parity.ts`: native save → BIR reopen + recompute → same records). Remaining: none. 1701 does not yet model its add-more pop-ups or per-activity attachments, see [form-triage](docs/analysis/form-triage.md) | XL | 83/84 | `EBF_PARITY=1` scoreboard: 82/82 1:1 (last full run); 1700 alone (`EBF_PARITY=1700`): 311/311 |
| Schedule support | **all three schedule kinds now have working native forms**: static-row (1600/1600WP), dynamic-modal async (1601F), and ATC-derived (1601EQ — total round-trips, detail serialized for BIR). The framework covers every schedule pattern in the 84 | L | **done** | oracle round-trips |
| Superseded forms → open/print-only | Older editions kept for reopening old returns only (WL §4.4) | M | todo |
| Accessibility + keyboard flow | Tab order, labels, VoiceOver | M | todo |
| Brand pass | Own icon + UI identity (placeholder icon today) | S | todo |

## P4 — the BIR track and the r/taxPH asks (added 2026-11-08)

Sources: [`docs/bir-accreditation.md`](docs/bir-accreditation.md) (tracks A/B), the proposal sent to BIR on
2026-11-07 (ticket 20261107_00563_E, [`docs/bir/proposal.md`](docs/bir/proposal.md)), and all r/taxPH comments
([`docs/bir/reddit-feedback.md`](docs/bir/reddit-feedback.md)). Ordered by leverage: the first three must land
before BIR's engineers see any code, because the proposal promises them.

| Item | What it closes | Surface | Effort | Status | Benchmark (tier) |
|---|---|---|---|---|---|
| **Build the app without BIR's servers or secrets** | The r/taxPH TSP warning (KindaBreathing) and proposal §4.2: a shareable build must not ask `tinDispatcherSFTP.php`, read the `ebfSFTP.exe` / `Encrypt.exe` passphrases, or upload. Today `lib.rs:2–6` always compiles `crypto`/`dispatch`/`submit`, and `host.rs:203–204` always serves the `dispatch`/`send` ops. Gate them behind a Cargo feature `bir-submit`, off in the shareable build; Submit then says "Online submission isn't available in this build, file through eBIRForms or eFPS" | `npm run build:share` (shareable); check: `npm run check:share` | M | **done 2026-11-08**: Cargo feature `bir-submit` (default on) gates `crypto`/`dispatch`/`submit`, their 11 crates, the host ops and the importer's helper detection; shareable binary 0 forbidden strings vs 7 in the default build; `cargo test` 28 pass (default) / 16 pass (shareable, incl. `shareable_test`) | T3: `cargo build --release --no-default-features` exits 0, and `strings` of the binary finds 0 hits for `tinDispatcher` / `birgovph` / `_installer/ebfSFTP.exe`; the `dispatch` op returns the "not available" message |
| ↳ Final copy without Encrypt.exe in that build | **Surfaced while grounding the row above:** the final copy also calls `encrypt_cipher()` (`host.rs:292–306`), which reads Encrypt.exe's passphrase, even with no submission. The shareable build must keep the final copy as a read-only plain savefile and say it was not submitted | same build, Final Copy button | S | **done 2026-11-08** (`encrypt_in_place` stub keeps the file plain; `shareable_test`); clicked through 2026-11-08 on the shareable Rust host (`cargo build --no-default-features --example host`): BIR's own 0605 Validate → Submit / Final Copy in WebKit (`EBIRFORMS_HOST_URL=… npx vitest run test/legacy-0605.test.ts`, 2/2) gives a plain-XML final copy, flag 3, that reopens read-only. **And in the real app window** (shareable debug build, `EBF_FINALTEST=1 EBF_RUST_HOST=<data>`): BIR's 0605 Final Copy button → `savefile/` and `IAF_RDO_Copy/` both plain XML, `txtFinalFlag=3`, no `ebirOnline` keys | T3: in the shareable build, final-copy 0605 → the file in `IAF_RDO_Copy` is a readable savefile with the final flag set, and no Encrypt.exe read happens (rename `_installer/Encrypt.exe`; final copy still succeeds) |
| **Source bundle for BIR's engineers** | Proposal §4.1 ("full source, under an NDA"). One command that packs only the shareable tree: no `vendor/`, no `_installer/`, no `dispatch.rs` / `submit.rs`, no captured BIR outputs that embed secrets | `npm run bundle:review` → `dist/ebirforms-review-<sha>.tar.gz` | S | **done 2026-11-08** (`tool/bundle-review.mjs`): 665 files kept, 40 excluded, 0 forbidden paths; unpacked bundle `npm ci` + `npm run gate` exit 0 (395 pass), `cargo test` 16 pass | T3: `tar tzf` on the bundle lists 0 paths matching `vendor/\|_installer\|dispatch.rs\|submit.rs`; `tar xzf` + `npm ci && npm run gate` inside it exits 0 |
| **Defect report BIR can act on** | Proposal §4.3. Every "fixed" row in `docs/analysis/audit-status.md` and the P1 table becomes one entry: form, how to reproduce on the stock Windows package, BIR's file + line, our fix | `docs/bir/defect-report.md` (sent only when BIR asks) | S | **drafted 2026-11-08**: 16 form defects (D15/D16 from the 1700 rewrite) + 10 shell defects, covering audit #8–19, #21 and the addendum; not sent | T3: every P1 "Fix:" row and every audit-status "fixed" row has an entry (count match), and a `grep` for the credential kinds in AGENTS.md finds nothing |
| **Private security disclosure** | Proposal §4.4: the security findings in BIR's package, referenced **by file:offset and kind only** (AGENTS.md) | `docs/bir/private/security-disclosure.md`, gitignored, sent to BIR's security contact only | S | **drafted 2026-11-08**: 11 findings by file:offset/kind; gitignored; 0 secrets shared with Encrypt.exe/ebfSFTP.exe (only the public INI key name `ProxyPassword`) | T3: `git check-ignore` confirms the file is ignored; a script reads the real secrets from `vendor/original/_installer` and asserts none appears in the file |
| **Legal paper and Save as PDF without a cropped right edge** | yunaheart: under Parallels, Save as PDF cut off the right side, and printing on legal paper needed expert help. Print is done (P1), but no test covers paper size or clipping | Print in the app → macOS print dialog → Paper Size: Legal → PDF ▸ Save as PDF | S | **checked in Chromium, red-green proven 2026-11-08**: `EBF_PRINT=1 npx vitest run test/print-check.test.ts`. 1701Q and 2551Q on A4, Legal (612×1008 pt) and long bond (612×936 pt): 0 pages cut off. **Finding:** BIR's forms are 127–171 px wider than the printable width, so they print shrunk to fit at a scale of 0.81–0.85 (`bench/result/print-check.json`). The test fails below 0.75 (assumed floor); `EBF_PRINT_INJECT=1` scores 0.30 → red. Still by hand: the macOS print sheet itself | T3: print 1701Q and 2551Q to PDF on Legal and on A4; `pdfinfo` shows 612×1008 pt for Legal; render with `pdftoppm` and confirm the form's right border falls inside the page (rightmost non-white column < page width − margin), for every page |
| **Native form screen** | **Surfaced while grounding the web version:** 82 native forms exist as schemas (`src/form/`), but nothing renders them; the main screen still opens BIR's pages. Prerequisite for the web version and for "routing the main screen to the native forms" (Where we are) | `/form/<CODE>` route, e.g. `/form/1701Q` | L | **done 2026-11-08**: `/form` lists the 82 native forms, the saved returns (each opens in its form) and a taxpayer-profile picker; `/form/<CODE>` opens one. Desktop menu **Go → Native Forms / BIR Main Screen** (⌘⇧F / ⌘⇧M), checked in the app window with `EBF_GOTEST=1` (the handler, not a mouse click). The **1701Q parity fixture typed through the screen saves byte-identical** to the parity reference (170 records; 46A 82,500.00 · 54B 28,000.00 · 68A 67,350.00, as BIR's form shows). The spouse TIN was swapped for a valid one, because the screen enforces BIR's check digit. Reopening a saved return gives the same bytes for 81/82 forms (`test/reopen.test.ts`; 1621 is a known gap: its first save writes the tax rate without applying it) | T3: `npm run dev`, open `/form/1701Q`, fill the parity fixture's inputs by hand, save; the saved file equals the parity test's expected records (`EBF_PARITY=1701Q`) |
| **Local-first web version** | Humble-Box-7571 (website/PWA), Artistic-Health7526 (keep profiles and savefiles local or in the user's own folder/Drive), title "web version next". Native forms only, never BIR's pages or BIR's servers. **Build, don't publish** until BIR answers the proposal; design in `/brainstorm` | Static PWA build: OPFS working copy + `persist()` + Home Screen install; export/import eBIRForms savefiles as the backup; "Choose folder" only in Chromium (Safari has no folder picker on macOS or iOS, caniuse 2026-11-08). Blueprint: `docs/brainstorm/ebirforms-web/` | L | **built, not published (2026-11-08)**: `npm run build:web` → `dist-web/` (native forms only). OPFS store `src/lib/web-store.ts` (with a worker fallback for Safari before 26), `persist()`, a download on every save, import → open in the form, offline after the first visit (`public-web/sw.js` precaches the build), and a Home Screen manifest. Savefile names, which hold the TIN, travel in the URL `#fragment`, which is never sent. Measured with `vite preview` in Chromium and WebKit 27.2: save, reopen (21 = 1,025.50), import, offline (43 fields), **0 requests with the TIN, 0 off-site**, and the download is **byte-identical to the desktop save**. The web download opened in **BIR's own 0605 page** (WebKit, dev host) shows every value (TIN, name, 19/20A/21, period), with 0 errors and 0 dialogs. **Real Safari 26.5.2** (safaridriver, 2026-11-08): save → listed → reopen (19 = 1,000.00, 21 = 1,025.50), offline with the server killed (43 fields, 1 saved return listed), 133 requests, 0 with the TIN; `persist()` not granted outside a Home Screen install, as documented. Needs a person: BIRForms.exe on Windows (AGENTS.md forbids an agent running it), publishing (after BIR answers) | T3: `npm run build && npx vite preview`; in Safari and Chrome, save a 1701Q → export the savefile → it reopens in the desktop app and in eBIRForms on Windows; Playwright's request log shows 0 requests with a body containing the TIN |
| **Install it like BIR's package** | The Windows package is one installer with BIR's forms inside; ours needed a separate import of BIR's zip. Owner ask 2026-11-08: "bundle it properly as if it was like a ebirforms package with universal installer", on BIR's new 7.9.6.2.1 | `npm run package` → `dist-package/Offline_eBIRForms_Package_v<bir>_macOS_universal.dmg` | M | **built 2026-11-08** (shareable build, BIR 7.9.6.2.1): 25,844,003-byte DMG, binary x86_64 + arm64; `tool/stage-package.mjs` stages 459 BIR files (57.3 MB) and refuses BIR's helpers (`_installer`, `*.exe/dll/pdb`, `*.vbs`, `proxy.ini`): 0 in the DMG, 0 forbidden strings in the binary; the app serves the bundled tree until the user imports one (`Host.shipped`, Rust test). The 7.9.6.2.1 zip is byte-identical to the tree extracted on 2026-10-17, and its contents still say 7.9.6.2 (measured 2026-11-08). Launched: `/__status` `has_form: true` with no import, 0605 and 1701Q pages 200, version 7.9.6.2.1. **Unsigned, not notarized**: `tool/package.mjs` signs, notarizes and staples when given a Developer ID Application certificate + notary credentials (untested — this Mac has only self-signed identities); needs the owner's Apple Developer Program enrolment | T3: mount the DMG, `lipo -archs` shows both, `find` finds 0 helper files; open the app with an empty data dir and 0605 opens without an import |
| **Windows round trip, run here** | The web version's savefile must open in BIR's eBIRForms. BIRForms.exe only hosts BIR's HTA pages, and those pages' loadXML is what reads a savefile, so the trip runs on this Mac | `npm run check:roundtrip` (`test/web-roundtrip.test.ts`) | S | **done 2026-11-08**: 0605 and 1701Qv2018 typed into `dist-web` (real OPFS), the stored bytes opened by BIR's own page: 0 errors, 0 field differences; 1701Q byte-identical to the desktop save. Red-green: a changed 19 fails it. 2/2 in 7.6 s. A person on Windows is still the last check | T1 (escalated: it is the compatibility promise): the test |
| **Export adapters (savefile now, BIR's TSP format when issued)** | Track B needs the native forms to export what BIR asks for. The savefile adapter is the one BIR's pages read; the TSP slot takes BIR's per-form Data Layout and certification code once issued, and refuses until then. **Found while building it:** 16 of 82 forms named their savefile differently from BIR's `createXMLFileName` (0605/2000/2200* dropped the time, so two 0605s saved the same day overwrote each other; 1800v2018 and 1602Qv2018 dropped the month/quarter; names read raw input, not the saved defaults); 1603Qv2018 computed Schedule 1 as 0.00 until a reopen; a reopened 2200Av2020 lost its TIN | `src/form/export.ts` (`SAVEFILE_ADAPTER`, `TSP_ADAPTER`, `TSP_LAYOUT`); Save uses it | M | **done 2026-11-08**: all four bugs fixed; 82/82 names equal BIR's (`EBF_NAME=1`); 82/82 export → reopen → export byte-identical (gate); parity unchanged on the touched forms. TSP layouts: 0 (blocked on eTSPCert) | T1 (escalated: a wrong name is a lost or overwritten return): `test/export.test.ts` (gate) + `EBF_NAME=1 npx vitest run test/export-name.test.ts` |
| Make the r/taxPH post match the proposal | `docs/bir/reddit-feedback.md` problems 1–3, 5–7: the body still says "first release", "download the app", "Submit works"; "That's gone" about HTTP is half true; the PhilForms comment claims an ADMU partnership and links a paid trial; a reply says the encryption/upload helpers were rewritten. BIR now has the proposal and may read the thread | Reddit edits, exact text in `docs/bir/reddit-edits.md` | S | drafted, owner applies | T3: every checkbox in `reddit-edits.md` ticked, and the live post contains none of "first release", "download the app", "That's gone", "ADMU", "philforms.com/pricing" |
| Waitlist count | The post's EDIT promises an update to people who email "eBIRForms Mac". Evidence of demand for BIR | Gmail query `subject:"eBIRForms Mac"` (polkadoc token) → a dated count in `docs/bir/reddit-feedback.md`; no addresses committed | S | **counted 2026-11-08: 1** exact-subject email (3 senders mention eBIRForms) — re-count before the alpha | T3: the count line exists with a date; `grep -E "@[a-z]" docs/bir/reddit-feedback.md` finds only the OP's address |
| BIR owner steps (track A follow-up, applicant registration, own returns filed, legal review) | Not code; tracked as steps 3–10 in `docs/bir-accreditation.md`. Next: RDO emails on ~2026-11-21 if BIR hasn't replied, citing the ticket | `docs/bir-accreditation.md` | — | governance | T3: each step's State column shows a date or "blocked on" |

**Triage (needs information before it can be planned):**
- **TSP layouts for eTSPCert (track B, step 9).** The adapter slot exists (`TSP_LAYOUT`, `TSP_CERTIFICATION` in
  `src/form/export.ts`); BIR's per-form Data Layout Guides come only after enrolling in eTSPCert, and the next window
  isn't announced. Unblocks when BIR answers the proposal or opens a window.
- **Friendlier input screens (Real-Ask2969, Double-Technician-91).** The desktop app is 1:1 by decision
  (2026-11-07), so this only applies to the web version: brainstorm it there.
- **Whether a code review would itself expose the decompilation.** Needs the legal review (bir-accreditation step 5)
  before the source bundle is sent.

## What we explicitly are NOT going to do

- Wrap the original exe in Wine/CrossOver.
- Re-create the dead RDO→RDC→Project USB relay, cFTPSend, Rollbase upload or the unused Blowfish/Rijndael/LZString code (WL bug 20).
- Store or transmit the user's eBIRForms Online password.
- Change the desktop app's input screens away from 1:1 (decided 2026-11-07; a friendlier UI is a web-version question).
- Publish a beta or a web launch date before BIR answers the proposal (ticket 20261107_00563_E).
- Serve BIR's own form pages from the web version; it uses the native forms only.
