# Changelog

Append-only, latest first. What changed and why; current state lives in README.md.

## 2026-11-08 — logo: BIR's eagle, traced

- The logo, app icons and avatar are now a close crop of BIR's own seal: the eagle's head, the sun's rays and the red
  swirl, traced from `img/bir.png` (`asset/brand/seal/source/`). The white gaps at the bottom and top right are filled
  red, and the band's star is dropped so the icon still reads at 32 px. Replaces the geometric seal and the 50
  rejected geometric icons (`asset/brand/icon50/`, removed).

## 2026-11-08 — every platform; BIR's 7.9.6.2.1 contents; new logo

- `npm run package` builds the current platform's package: macOS universal DMG, Windows x64 NSIS installer, Linux
  AppImage + deb. CI downloads BIR's official 7.9.6.2.1 zip once, stages its forms, and builds all three (first run:
  all jobs green; Windows/Linux packages built, not yet launched on those systems). A `v*` tag drafts a release.
- BIR's 7.9.6.2.1 is the v7.9.6.2 package of RMC No. 104-2026 (24 Sep 2026): 0605 ATC MC350/MC351 and tax type MA
  (Micro Taxpayer Abatement), plus fixes to 1601-FQ, 1603Qv2018, 1702Qv2018C and 1801v2018. The app serves those
  pages as shipped, and the native forms are 1:1 with them (parity: 0605 96/96, 1601FQ 168/168, 1603Qv2018 77/77,
  1702Qv2018C 112/112, 1801v2018 212/212).
- New logo (`asset/brand/logo.svg`): the seal simplified — scalloped edge, blue band with three stars, sun rays, red
  and gold sweeps, a form where the seal has its column; app icons regenerated. 50 geometric alternatives in
  `asset/brand/icon50/` (`generate.py` rebuilds them).

## 2026-11-08 — short README

- README cut to what a downloader needs: download link, compatibility (macOS 12+, Apple Silicon + Intel, BIR
  v7.9.6.2 / 7.9.6.2.1, Windows-compatible savefiles), install steps including macOS 15's Open Anyway, links.
  Build, test, environment, architecture and legal detail moved to `docs/development.md`.

## 2026-11-08 — merged to main; two 1700 defects reported; DMG signing wired

- `parity-1to1` fast-forwarded into `main`: all 84 forms native and 1:1.
- `docs/bir/defect-report.md` gains D15 (1700's reopen resets a joint return's spouse branch code to `000`,
  `BIR-Form1700.hta:6372`) and D16 (1700's BI10 after a reopen: 1,695 instead of 2,090, `adjustSummation` at `:13144`).
  Both are reported only; the native form keeps BIR's own save.
- `npm run package` signs the DMG, notarizes it and staples the ticket when `APPLE_SIGNING_IDENTITY` names a
  Developer ID Application certificate and notary credentials are set (Tauri signs and notarizes the app from the
  same variables). Untested: this Mac holds only self-signed identities, so the DMG built today stays ad-hoc signed.
- The two merged agent worktrees (1700, 1701) and their branches are removed.

## 2026-11-08 — what BIR's "7.9.6.2.1" changes

- Today's download, `Offline_eBIRForms_Package_v7.9.6.2.1.zip` (18,485,242 bytes; inner installer
  `Offline_eBIRForms_Package_v7.9.6.2 1.exe`, built 2026-10-09), is **byte-identical** to the package this repo was
  first extracted from on 2026-10-17: `diff -rq` of the two extracted trees finds 0 differences over 468 files. Every
  parity and name scoreboard has therefore run against it.
- Nothing inside says 7.9.6.2.1. The main screen (`<title>`, `VERSION="7.9.6.2"`), `BIRForms.exe`'s version resource
  (7, 9, 6, 2) and the installer's release notes (latest entry v7.9.6.2) all say 7.9.6.2. The ".1" exists only in
  the zip's name, and the inner `…v7.9.6.2 1.exe` reads like a duplicate-file suffix. No 7.9.6.2 package without the
  ".1" survives on this machine, so a diff against an earlier upload isn't possible.
- The release notes' last two entries are covered here. v7.9.6.2 fixed 1702Qv2018C's Schedule 1 10A/10B rates and
  Schedule 3 item 6, and 1702Qv2018C is 1:1 against this tree. v7.9.6.1 added 0605's MC350/MC351 (tax type MA) and
  fixed "1603Qv2018: missing Percentage Divisor (D) in Schedule 1". That is the same bug the native 1603Qv2018 had
  until today, so the native form now matches BIR's fix.
- The package and the app report the zip's name, 7.9.6.2.1 (`_package.json`).

## 2026-11-08 — macOS package, Windows round trip, export adapters

- **Package like BIR's** (`npm run package`): a universal (x86_64 + arm64) DMG of the shareable build with BIR's
  7.9.6.2.1 forms inside, `Offline_eBIRForms_Package_v7.9.6.2.1_macOS_universal.dmg` (25.8 MB). The staging tool
  leaves out every BIR helper and the VBScript that calls them (0 in the DMG, 0 forbidden strings in the binary).
  The app serves the bundled forms until the user imports a package of their own. Unsigned and not notarized.
- **Windows round trip, run on this Mac** (`npm run check:roundtrip`): a return typed into the web version, its
  OPFS bytes opened by BIR's own form page, every field compared. 0605 and 1701Qv2018 pass with 0 differences.
- **Export adapters** (`src/form/export.ts`): the savefile adapter (Save now goes through it) and a TSP slot that
  refuses until BIR issues a form's data layout and certification code. Checking the adapter's names against BIR's
  `createXMLFileName` in BIR's own pages found 16 of 82 forms naming files differently. The worst case: 0605, 2000
  and the 2200 family left out the time, so a second 0605 saved the same day overwrote the first. All 82 now match.
  The new reopen check also found two bugs. A fresh 1603Qv2018 computed Schedule 1 as 0.00 (its 65%/35% and
  75%/25% are fixed text on BIR's page). A reopened 2200Av2020 dropped the TIN it writes on each page. Both are
  fixed, and parity still holds on both forms.
- **Own 1701A draft** made for the BIR application (step 4). It is not final and not submitted; amounts are still blank.
## 2026-11-08 — 1700 (pre-2013 layout) native and 1:1

- `src/form/form1700.ts` + `src/form/entry/1700.ts`: the four-page purely-compensation ITR, modelled on BIR's own
  reload (initializeControls' employer-box clears, disableSingle, processJointFiling, sleeptime's maxlength-12 sweep,
  processTaxReturn1/2). Scoreboard `EBF_PARITY=1700`: 311 key / 311 equal / 0 bir_defect / 0 page error.
- The eight modals use BIR's measured layouts (the Repository copy keeps the temp ids; counters = row count; the
  employer rows start at item 4 and carry their two checkboxes). `test/form1700.test.ts` proves a joint return with
  every modal populated, on the reload and with all pages shown and blurred.
- Page 3: item 21 sums only the page fields (the `summationIteration*` targets BIR names were never declared, so
  its modal subtotal functions throw before reaching item 21); BI10 = fields + rows (measured live: 2,090).
- BIR's temp → Repository modal copy relied on IE serializing live input values into innerHTML. WebKit does not,
  so a reopen showed blank rows; `fixIeLiveInnerHtmlCopy` (`host/form-patch.ts` + `codec.rs`, 1700 only) routes it
  through `window.__ebfLiveHtml` (`public/legacy-shim.js`).
- BIR defects: a joint return's spouse branch code is reset to 000 on every reopen (ledgered in
  `test/parity.test.ts`); after a reopen, a blur on a page-3 Part I field halves the B1/B2 rows' share of BI10.
- `test/oracle.ts`: a blur alert that races the page close no longer surfaces as an unhandled rejection.
## 2026-11-08 — 1701 (2013 layout) native and 1:1; with 1700, all 84 forms are native

- **1701 is native and 1:1**: `EBF_PARITY=1701` 1321 equal / 1321 keys, 0 BIR defect, 0 page error. 1701A
  (195/195) and 1701v2018 (838/838) re-measured after the serve-time selector fix in 8c5361e.
- **Design:** the native form runs BIR's own page script. About 140 enable / reset / compute functions depend on click
  and blur order, so no closed formula was written. `tool/port1701.mjs` transpiles the HTA's functions and inline
  handlers onto a measured mini-DOM (`form1701-dom.ts` + `page/1701.json`). `form1701-sim.ts` replays a filer:
  controls clicked, text typed (onchange) and blurred, twice. It then saves the enabled-state lists as `saveXML`
  does and reopens on a fresh page, as loadData and the page's onload amount re-format do.
- **The mini-DOM matches `legacy-shim.js`'s IE `getElementById`.** BIR asks for item 109's radio by its NAME
  (`rdoPg4Pt7I109CompensationATC`). Its split id lists end in `""`, which the shim resolves to
  `<HTA:APPLICATION id="Form1701">`; that is why `txtEnabledInputsOnValidation` reopens as ",". Sched 1's amounts
  compute on `onchange` only, so the sim fires change before blur.
- `test/form1701.test.ts`: compute checks (business itemized / OSD, compensation, joint mixed + spouse OSD on the
  2013 graduated table) and 6 oracle round trips, each checked on page 1 and on every page.
  `allPageParityCheck` gained a `save_bare` flag (1701 and 1702EX save amounts bare).
- Not modelled (v1): the add-more modals (`txtCtrmodal*` stay 0) and the Part IX per-activity attachments.

## 2026-11-08 — web version checked in real Safari

- Ran `dist-web` in real **Safari 26.5.2** through safaridriver. A 0605 typed into the form computes 21 = 1,025.50
  live, saves to OPFS, shows in the saved-returns list, and reopens with 19 and 21 intact. With the server killed,
  the form still renders 43 fields and the list still shows the saved return. The run made 133 requests, 0 of them
  with the TIN. Safari did not grant `persist()` outside a Home Screen install, as expected. The first run after
  enabling automation found no saved file; two reruns passed, and that first failure was not reproduced.

## 2026-11-08 — BIR proposal sent; the BIR track and r/taxPH asks roadmapped

- **Proposal sent to BIR** on 2026-11-07 22:34 +0800 (contact_us@bir.gov.ph, PDF attached); auto-ack ticket
  20261107_00563_E. State in `docs/bir-accreditation.md` step 6.
- **ROADMAP P4** (10 rows): a build with no BIR server or secrets (Cargo feature `bir-submit`, off), the final copy
  without Encrypt.exe in that build (found while grounding: `host.rs:292–306` reads its passphrase even offline),
  a source bundle for BIR's engineers, the defect report and private security disclosure the proposal promises,
  Legal / Save-as-PDF print checks (r/taxPH), the native form screen (found while grounding: 82 schemas, no
  renderer), the local-first web version (build, don't publish), waitlist count, owner steps. Triage: XML exporter,
  friendlier input UI, decompilation exposure.
- **Rejected** (`docs/roadmap-rejected.md`): non-1:1 desktop input screens, a public beta before BIR answers, BIR
  pages in the web version, resending or mass-emailing BIR.
- **Shareable build (ROADMAP P4, done).** Cargo feature `bir-submit` (default on) gates `crypto.rs`, `dispatch.rs`,
  `submit.rs`, their 11 crates, the host's `dispatch`/`send`/`repin` ops, Encrypt.exe use, and the importer's
  recognition of Encrypt.exe / ebfSFTP.exe. Without it Submit answers mode "0" ("Online submission isn't available
  in this build") and the final copy stays a plain read-only savefile. `npm run check:share`: 0 forbidden strings in
  the shareable binary vs 7 in the default one. `npm run bundle:review` packs the shareable tree for BIR's engineers
  (665 files; the unpacked bundle passes `npm run gate` and `cargo test`).
- **Fix:** `test/capture-template.test.ts` read `vendor/original` while collecting even when skipped, so any checkout
  without BIR's package failed the gate (found by gating the review bundle). Both reads are guarded now.
- **Drafted for BIR:** `docs/bir/defect-report.md` (24 defects) and a private security disclosure (gitignored).
  r/taxPH post edits: `docs/bir/reddit-edits.md` (for the owner to paste).
- **Reopen, profiles, menu:** `/form` lists the saved returns (each reopens in its native form, via `reopenSavefile`, byte-identical for 81/82 forms in `test/reopen.test.ts`) and a taxpayer-profile picker. The desktop app has a **Go** menu (BIR Main Screen ⌘⇧M / Native Forms ⌘⇧F). The 1701Q parity fixture typed through the screen saves byte-identical to the parity reference.
- **Web version, offline and private:** a service worker precaches the build, imports open in the form, and TIN-bearing file names stay in the URL fragment. The first check had leaked them in a query string; this fixes it. The web download is byte-identical to the desktop save.
- **Final copy in the app window:** `EBF_FINALTEST=1` drives BIR's 0605 Final Copy inside the real shareable app. Both copies are plain XML with flag 3. The web version's savefile also opens with every value in BIR's own 0605 page.
- **Shareable final copy, clicked through:** BIR's own 0605 final-copy flow passes on the headless shareable Rust host.
- **Web version, built and not published:** `npm run build:web` (Vite `--mode web` → `dist-web/`) ships only the native forms, storing returns in the browser's OPFS (`src/lib/web-store.ts`) and downloading the savefile on every save. Checked in Chromium and WebKit: the download is correct and no request carries the TIN. Nothing is deployed, and it waits for BIR's answer.
- **Native form screen:** `/form` lists the 82 native forms and `/form/<CODE>` opens one in `FormView`, which was built but never routed after the main screen moved to BIR's own page. The savefile takes the TIN typed on the form when there is no profile. The save message no longer says the file "uploads to BIR". Checked: 0605 saved through the browser matches `formRecords` record for record.
- **Print check** (`test/print-check.test.ts`, opt-in `EBF_PRINT=1`): 1701Q and 2551Q on A4, Legal and long bond (8.5×13 in), 0 pages cut off. The PDF alone couldn't go red (Chromium shrinks to fit), so the test also measures the layout at the printable width. BIR's forms are 127–171 px too wide and print at a scale of 0.81–0.85. The test fails below 0.75; red-green proven with `EBF_PRINT_INJECT=1` (0.30).
- **Web version blueprint** (`docs/brainstorm/ebirforms-web/`, checker PASS): on-device PWA, native forms only,
  OPFS + export as storage because Safari has no folder picker (caniuse, re-checked); v1 = 1701Q savefile that
  opens in eBIRForms, r/taxPH waitlist, free. Found RaketTax (₱299/quarter, prepare-only, not accredited) and 11
  certified TSPs (RMC 020-2026); PhilForms' ₱299/month needs repricing (philforms `docs/bir-tsp-positioning.md`).
- r/taxPH re-read (226↑, 31K views): 5 new comments, plus two OP replies that contradict the proposal (ADMU
  partnership; "encryption and upload helpers rewritten") — `docs/bir/reddit-feedback.md` items 6–7.

## 2026-11-07 — printing long forms prints every page; Save swept across all 84 forms

- **Print prints all pages.** The packaged app's print is a macOS sheet that returns at once, but BIR's code
  restores the one-page layout on the line after `window.print()` (IE blocked there). 1701MS, 1702Qv2018C (×2) and
  2200Pv2020 therefore printed page 1 only. `fixRestoreAfterPrint` (TS `host/form-patch.ts` + Rust `codec.rs`,
  identical output on all 84 forms) defers that line to the shim's `__ebfAfterPrint`, which runs it on the first
  input after the sheet closes (at once when no sheet opened). Real window, 1702Qv2018C: BIR's sequence → sheet
  "All 2 Pages" (page 2 a fragment); patched → "All 5 Pages".
- **Save/reopen sweep** (`test/save-sweep.test.ts`, opt-in `EBF_SAVE=1`, Node host or `EBIRFORMS_HOST_URL` for the
  Rust host): every form opened under a profile, Save pressed (btnSave, or File→Save's `saveXML(false)` where BIR
  disables btnSave on a blank form), the written file reopened. 84/84 pass on both hosts: 56 write and reopen with
  the TIN restored, 28 refuse a blank form with BIR's own message (e.g. "Please select quarter in Item 2."), 0 page
  errors except the ledgered 1602Qv2018 row-15 throw.
- Debug switches: `EBF_RUST_HOST=<data dir>` runs the real window on the Rust host over `dist/`;
  `EBF_PRINTTEST='forms/<page>.hta|<js>'` opens a form and runs its print.

## 2026-11-07 — the window is eBIRForms on XP: Luna frame, BIR's main screen, BIR's own Submit button files

- **Faux-XP window.** The Tauri window is frameless (`decorations(false)`) with two child webviews
  (`tauri` feature `unstable`): a 30 px Luna caption (`caption.html`, `src/caption/` — BIR's title and icon,
  minimize / maximize-restore / close, double-click to maximize, drag region, inactive tint) above the content
  webview. It opens maximized, as `BIRForms.hta` declares (`WINDOWSTATE="maximize"`; the builder flag was ignored
  for a frameless macOS window, so it maximizes after the webviews attach). Not an iframe: native print
  (`/__print`) prints the top document, and an iframe would have clipped multi-page forms. You confirmed two
  webviews over the goal's "same-origin iframe" wording. Capability: the caption
  webview alone gets window controls; BIR's pages get no IPC.
- **App entry.** `/` now only does the first-run import and then hands off to `/legacy/BIRForms.hta`. Removed the
  React launcher, saved-returns list, profile editor, Submission settings and submit dialog (`src/App.tsx`
  547 → ~85 lines) and the dead `/__submit` route and `vfs.ts` submit exports.
- **BIR's own Submit button files.** The shim replaces `conService` and `checkNetConnection` and implements
  `RenameAndSendFile`. The host asks BIR's dispatcher (`dispatch.rs`), keeps the decrypted login, and uploads with
  the host key pinned (`host.rs` `dispatch_op` / `send_op`). The page only learns `mode`. The dispatcher is asked
  after the user confirms "Are you sure you want to submit?"; BIR asked before. Mode "0" (unreachable or closed)
  now really takes BIR's offline final-copy branch, with an honest notice; BIR hard-wired it unreachable. A changed
  SSH key asks before re-pinning. `Encrypt.exe` runs as the native port (in place). The dev host answers mode "0"
  and never contacts BIR.
- **Exit quits.** `window.close()` (BIR's Exit) posts `/__close`, which closes the app window; the dev browser goes
  back to the main screen.
- **Main-screen fixes, served patched (TS + Rust):** saved returns sort newest-first by real date (WL bug 14). The
  key is rearranged from `dtCreated`; a first version keyed on `ts`, which BIR has already reused for the return
  period by then, and dropped every row's `<tr>` (caught live). **Delete was broken in WebKit:** the row's radio id
  is `"" + File` (IE: the `Path`), it was `[object Object]`, so `DeleteFile` hit nothing. The shim's File/Folder
  objects now stringify to `Path`.
- **XP controls.** The shim restyles BIR's text fields, selects and buttons as Luna (square 1 px #7F9DB9 fields,
  blue combo button, cream gradient buttons, Tahoma) at zero specificity, so BIR's own CSS still wins.
- **Playtest (WebKit, packaged Rust host via `cargo run --example host`):** main screen 0 page errors, RDO 139,
  formType 80. 0605 → Validate → Submit → stand-in dispatcher (hit once, after the confirm) → local SFTP (docker
  `atmoz/sftp`): "Submit Successful", the uploaded bytes equal the local encrypted copy, `txtFinalFlag=1`,
  no `ebirOnline*` persisted, host key pinned. Saved-returns order and Delete were verified live. The desktop window
  was launched, measured maximized (1754×1129 on 1800×1169) and captured.
- **Caption self-test in the real window** (`EBF_SELFTEST=1 npm run tauri dev`, debug builds only). It clicks the
  real caption buttons inside the caption webview, and Rust reads the window state back after each step:
  - Maximize restores, and pressing it again re-maximizes. Title double-click does the same, both ways.
  - Minimize minimizes.
  - `start_dragging` (the drag region's IPC) returns ok.
  - Close exits the app.
  - The one thing not covered is a physical mouse drag.
- `test/form1702mx.test.ts` compute block: 30 s budget. The pure-CPU replays (up to 4.8 s alone) timed out at
  random under the gate's parallel WebKit load.

## 2026-11-07 — the shell is BIR's real main screen again (1:1), not the React redesign

- **Removed the `BIRForms.hta` → "/" 302 redirect** in both hosts (`host/legacy-server.ts`, `src-tauri/src/host.rs`
  `legacy()`). BIR's authentic main screen now renders through the same shim + patch path the forms use — the
  XP-era Profile block, File/Help top-nav, "Government Property Not For Sale", BIR seal watermark. Verified live:
  RDO dropdown 139 options, formType 80 forms, Scan/Submit/Fill-up/View/Delete, no console errors.
- Reverses the deliberate "React main shell" shortcut (ROADMAP) for the one surface where we had redrawn BIR's UI
  instead of reproducing it. Decision (user): serve the real screen, keep our correctness fixes under a 1:1 look,
  faux-XP window chrome. **Remaining**: faux-XP title bar + app entry rewire, wire Submit → the native dispatcher,
  port the saved-returns real-date sort into the HTA. See `TASK.md`.
- Test: `test/main-screen.test.ts` (serves 200 + shim + BIR markup, not 302). Gate green (reap the browser lane +
  dev server before gating or WebKit form tests flake under contention).

## 2026-11-07 — online submission resolves BIR's upload target itself (dispatcher ported from PhilForms)

- **`src-tauri/src/dispatch.rs`** — the step eBIRForms does before the SFTP upload, natively: ask BIR's
  `tinDispatcherSFTP.php` (plain HTTP, backup `ws1.birgovph.com`) for the per-return server + login, read the
  `{mode,server,SSLPort,port,username,password}` body **as data** (`parse_dispatch`, never `eval`), and decrypt
  `server`/`username`/`password` the way ebfSFTP.exe does (base64 → salt[32]‖iv[16]‖ct, PBKDF2-HMAC-SHA1 100000,
  AES-256-CBC/PKCS7). Ported from PhilForms `src/platform/ebir-submit.js`.
- **ebfSFTP passphrase read at runtime**, never stored — the one user-heap string in the user's own imported
  `ebfSFTP.exe` that decrypts the committed DEV/UAT hostname oracle (`UAT_HOST_BLOB`) back to a `*.birgovph.com`
  host. Same discipline as `Encrypt.exe` (`crypto.rs`). Env overrides `EBF_SFTP_PASSPHRASE` / `EBF_SFTP_EXE` aid tests.
- **`host.rs submit`** now resolves the upload target from the dispatcher when no host is supplied, falling back to
  the manual Submission-settings path; the folder comes from `ftp_folder_of` (PROD = form code, bar ten legacy codes).
- New deps: `cbc`, `sha1`, `hmac`, `pbkdf2` (hmac feature), `base64`. New crates mod in `lib.rs`.
- Tests: 7 `dispatch::tests` — sftp round-trip + wrong-passphrase, JS-literal parse without eval, decrypt-or-closed,
  **backup-host fallback**, empty-passphrase refuses before any network call, legacy folder map, and
  `reads_the_real_ebfsftp_passphrase` (proves the reader finds the passphrase in the real ebfSFTP.exe when present).
  Whole Rust lib suite 26 pass / 2 ignored (the live-SFTP + real-installer-import e2es); TS gate 611 pass.
- **Not done:** nothing has contacted `birgovph.com` or uploaded to BIR. The dispatcher → decrypt → SFTP chain is
  proven only against local stand-ins. A live filing with a real TIN is the only remaining proof. The two legacy
  ITRs 1700 (pre-2013) and 1701 remain un-rewritten; the current editions (1700v2018, 1701v2018) are already 1:1.

## 2026-10-27 — 82 of 84 forms native, every one 1:1; strict-mode 1707v2021

- **Ten more forms rewritten 1:1** (`EBF_PARITY=1`: 82/82 forms, `equal + bir_defect == key`, 0 page errors):
  **1700v2018** (188 keys — taxpayer/spouse Part V.A graduated and V.B 25%-flat chains, the year-dependent
  `computeTaxDue` table, the item-29 zeroing validations, the Part VI "add more" employers pop-up), **1701v2018**
  (838 keys — the full TRAIN mixed-income ITR by simulation: every page reviewed per filer scenario, Part XI
  attachments rebuilt), **1701MS** (201 keys — the Ease-of-Paying-Taxes mixed-income edition: Part III/IV
  graduated + 8% + special/exempt regimes, the item-30 one-negative rule), **1702MX** (1,040 keys — the 2013
  corporate ITR with Schedules 1-14, seven add-more modals, the special-rate drop-down whose 5%/30% auto-pick
  never fires because `0.05 × 100 === 5` is false in float), **2200S** (118 — sweetened beverages at the constant
  6.00/12.00/0.00 rates: atcCodes.xml has no `==year` rows for the XB codes), **2200Cv2018** (181 — coffee: column
  H = 5% of excise gross receipts, column I dead at 0.00 through the empty `vatColumnI` span, a BIR bug on both
  engines), **2200T** (pre-2020 tobacco; the scoreboard's `txtDate` now replicates `init()`'s re-stamp of the
  period to today on every reopen), and the **1702MXv2018 / v2018Cxx** variants (588 each).
- **BIR defects found and replicated** (each named where it is modelled): 1700v2018's misplaced `.toFixed(0)` —
  44A rounds the subtrahend while 44B rounds the difference; 1701MS's `init()` re-stamps the period with today's
  date on every reopen; 1702MX's special-rate pick compares a number against the option's string value; 1702MX's
  `computePg9Sc13I19I` is called before it exists (a handler abort on IE too); 2200Cv2018's VAT column multiplies
  by an attribute-less span. `disablePartVCSpouse` in 1700v2018's HTA dereferences non-existent lowercase ids
  (a page error on IE radio clicks, not hit by the reload).
- **Strict-mode follow-up closed:** `EBF_PARITY_STRICT=1 EBF_PARITY=1707v2021` is fully equal (143/143) — an
  installment sale saves `txtPg1P2I13AppTaxRate` as "0.00" because BIR's own `round(this)` blur rewrites the ""
  that `transactionType()` assigns.
- **WebKit-vs-IE serve fixes, both hosts with Rust tests** (`host/form-patch.ts` + `src-tauri/src/codec.rs`):
  1700v2018's `loadData` strips the savefile wrapper with `.replaceAll("<DIV>", "")` — WebKit's lower-case tags
  made the lookup miss, add a phantom pop-up row and abort the load (now case-insensitive, and the 12-space
  record separator splits off with the newline); the Part VI modal's two empty tables get IE's TBODY; 1701v2018's
  `hideCurrentPage` keeps jQuery 1.7's empty set for an empty-id selector.
- **Scoreboard: 82 of 84 forms native and 1:1.** Remaining: 1700 and 1701, the two largest legacy ITRs —
  fully mapped in [form-triage](docs/analysis/form-triage.md#remaining-2) but not yet rewritten.

## 2026-10-26 — 1:1 parity with BIR's own forms; 72 native forms

- **What "1:1" means, measured:** `test/parity.ts` saves a native fill, reopens it in BIR's own form, lets BIR's
  code recompute (every live input blurred), and diffs the savefile records key by key. `EBF_PARITY=1` scores every
  native form → `bench/result/parity.json`. Baseline over the 43 forms then native: **72.9% of keys equal, 7/43
  forms 1:1** — "oracle-proven" had only checked hand-picked fields.
- **BIR save templates** (`src/form/template/*.json`, all 84, `test/capture-template.test.ts`): each form's blank
  save with defaults and radio group names. `formRecords` overlays native values on it, so runtime keys (padded
  rows, picker lists, `j_id*`, empty eBIRForms-Online fields) and defaults (`"-"`, `"1"`) come out as BIR writes
  them. Unset fields keep BIR's default; choosing a radio unchecks its siblings. FormView now groups radios by BIR's
  name — pairs like `optAmend:Y`/`:N` had been rendered as two groups, so both could be ticked.
- **Upper-casing measured, not grepped** (`src/form/upper-case.json`): BIR's `capital` sweep (string-util.js
  declares it twice; the no-argument one wins) upper-cases all text on 47 forms; a `capitalize(this)` blur
  upper-cases named fields on 13; 24 leave text as typed. A grep had matched `capitalize(` and missed sweeps hung on
  hidden pop-up fields (2552v2018's `txtLOB`).
- **WebKit vs IE7 compat, once for every form and both hosts:** JScript `Date#getYear` and argument-less
  `Number#toLocaleString` in `public/legacy-shim.js`; IE `childNodes` counts (1702-RT family), case-insensitive
  `<DIV>` row counts (1621, 1801v2018: reopening had silently dropped rows) and 2200Av2020's table-cell `value`, in
  `host/form-patch.ts` AND `src-tauri/src/codec.rs`. Fixes that first landed on the Node host only were ported.
- **29 new native forms**, each 1:1: 1600VTv2018, 1600PTv2018, 2550Qv2024, 2550Q, 2550M, 1702RTv2018C, 1702RTv2018,
  1702RT, 1801v2018, 1801, 1701Qv2018, 1702Qv2018C, 1604Ev2018, 1707v2021, 1707v2018, 2552v2018, 2000v2018, 2000,
  2000OTv2018, 1702EXv2018C, 1702EXv2018, 1702EX, 2200Av2020, 2200A, 2200AN, 2200Mv2018, 2200M, 2200Pv2020, 2200P.
  All 43 earlier forms brought to 1:1 (ATC picker keys for 1601E/F/EQ, 1600, 1600WP, 2551M; reload-time zeroing,
  BIR's formats like a bare `"0"`, 2550DS's reopen crashing without a profile file).
- Exceptions are ledgered with a reason in `test/parity.test.ts`, never counted as equal: 4 keys where BIR's own
  reload changes BIR's own save (1707A, 1702RT, 1702EX, 2000v2018) and 5 page errors BIR's own code throws
  (1800v2018 compute recursion, 1602Qv2018 row-15 blur).
- Also: forms register via `src/form/entry/<CODE>.ts`; ATC pick lists for every form code; vitest `fsModuleCache`
  off (it hid newly registered forms); `docs/rewrite-playbook.md` is the per-form method and bar.
- Scoreboard: **72/72 forms 1:1, 11,283/11,287 keys equal + 4 ledgered.** Gate: 521 passed / 85 skipped across 82
  files; `gate:rust` 19 passed.
- Not done: 12 forms (1700, 1700v2018, 1701, 1701v2018, 1701MS, 1702MX ×4, 2200S, 2200T, 2200Cv2018) — partial work
  in agent worktrees, see form-triage. Under `EBF_PARITY_STRICT`, 1707v2021's installment rate saves `""` where BIR's
  blur leaves `0.00`. The scoreboard's random fill leaves schedules empty; populated schedules are covered per form.

## 2026-10-26 — BIR's banner and page barcodes bundled into the native forms

- `tool/asset-extract.mjs` (`npm run asset`) copies BIR's seal-and-name banner and all 149 per-page form barcodes
  from the recovered tree into the committed `asset/bir/` (1.5 MB). `barcode.json` maps form code → barcode
  pages in page order, read from each form page's own `<img>` tags (159 references, 51 forms). The file names
  don't reliably encode the page, and BIR's casing differs from the files (`1702EX_p1` vs `1702Ex_p1`,
  `1702EXv2018V2` vs `…v2`), so the manifest stores the on-disk names.
- `src/lib/bir-asset.ts` + FormView: every native form now opens under BIR's banner. The 19 native forms BIR prints
  a barcode on also show their page-1 barcode, e.g. "1601-FQ 01/18 P1". Checked in WebKit, light and dark.
- `test/bir-asset.test.ts`: every manifest entry resolves to a bundled file. It caught the directory-casing bug.

## 2026-10-26 — BIR forms and artwork may now be used and bundled

- Reversed the 2026-10-17 rule that kept BIR's forms and artwork out of the repo and app. They are government
  works with no copyright (RA 8293 §176.1), so the repo and app may use them; README "Legal" states the policy
  and its two legal limits (for-profit use needs BIR's approval; non-BIR parts keep their licenses).
- Still excluded, for security: BIR's native helpers and the SFTP credentials / Encrypt.exe passphrase in them.
  `vendor/original/` stays gitignored as extractor output; copy usable assets into `asset/bir/`.

## 2026-10-26 — 1601FQ (quarterly final-WHT) native; 43 forms

- **43rd native form: 1601FQ** (quarterly remittance of final income taxes withheld), the first form whose reload
  depends on an **ATC picker**. The legacy form was driven live in WebKit (pick, fill, save) to read its real
  savefile. Part II is two tables in one index space (rows 1–6 compute, 7+ "other tax"). Reload rebuilds the rows
  from one `AtcCd<i>` checkbox per pick-list entry. Schedule I is 5 static treaty rows gated on item 13.
- `src/form/atc-list.json` + `atcPickList(form, category)` add per-form ATC lists in BIR's own order, duplicates
  kept. The same code recurs at different rates, so the deduplicated `atc-codes.json` can't recover a list
  position. That also means `atcRate()` is wrong for such codes (documented in form-triage).
- New schema hook `FormSchema.extra_record` adds derived savefile records that are neither fields nor rows.
- `test/form1601fq.test.ts`: compute, the treaty gate, (code, rate) → list position, validation, and an oracle
  round-trip. A negative control (AtcCd emitted all-false) makes the oracle fail, so the derivation is load-bearing.
- Gate: 177 passed / 1 skipped across 52 files.

## 2026-10-18 — 1602Qv2018 (quarterly final-WHT) native; 42 forms

- **42nd native form: 1602Qv2018** (quarterly remittance of final income taxes withheld) — the last clean
  FIXED-schedule form (no dynamic rows, no reload reconstruction). Three fixed schedules (amount × rate/100)
  feed `14/15/16 → 17`, then `22=18+19+20+21 ; 23=17−22 ; 27=24+25+26 ; 28=23+27`. A BIR data-wiring bug found
  and documented: Sched1 rows 1–12 read their rate from empty `<font>` elements (never populated) so they
  auto-compute 0.00 (`formatCurrency(NaN)`); row 15 passes a literal as an element id. Only the two BSP rows
  (amount × rate% × BSP factor) and Schedules 2/3 (editable rate inputs) compute. The `OptTaxWithheld1 = No`
  path, which zeros all schedules on load, is mirrored with gates. `test/form1602qv2018.test.ts` (compute Yes +
  No-gate paths; oracle round-trip).
- Gate: 168 passed / 1 skipped across 50 files.

## 2026-10-18 — ATC reference infrastructure (unblocks the withholding ATC tier)

- The remaining form tier is dominated by **ATC-schedule withholding forms** (1601FQ, 1600VT/PT, 2550 VAT, …)
  whose per-row rate is auto-filled from BIR's ATC (Alphanumeric Tax Code) reference when a code is picked.
  Investigated the three apparent "next" candidates and confirmed all need this shared dependency:
  1601FQ (three dynamic ATC-modal tables), 1600VTv2018 (ATC rate + a cross-form reference bug), DST 2000
  (a per-document rate *engine*). Rather than hard-code rates per form, built the shared source:
  - `tool/atc-extract.mjs` parses the recovered `xml/atcCodes.xml` (1087 records) → `src/form/atc-codes.json`
    (488 distinct codes: desc, numeric `rate` for withholding codes, `formula` string for DST codes, and the
    form list each belongs to).
  - `src/form/atc.ts` — typed loader: `atcRate(code)`, `atcInfo(code)`, `atcForForm(formCode)`.
  - `test/atc.test.ts` proves the lookups (WV010→5%, WI160→2%, DST DS101→formula "P2.00/P200", form membership).
  This is the foundation the ATC-modal rewrites build on; DST's formula codes still need a separate rate engine.
- Gate: 172 passed / 1 skipped across 51 files.

## 2026-10-18 — 2552 (percentage tax on shares/IPO) native + filtered aggregates; 41 forms

- **41st native form: 2552** (percentage tax on sale/IPO of shares). Its `tblTaxTrans` schedule buckets rows by
  rate (0.6/4/2/1 %) AND by a Primary/Secondary transaction radio into fixed cells — which needed a new reusable
  schema primitive: **`GroupAgg.where`**, a row predicate (with form-state access) that restricts an aggregate's
  sum. Each rate bucket is now a filtered total; the Primary/Secondary split rides on the existing `gate`. Chain
  `15 = Σ cells ; 16C = 16A+16B ; 17 = 15−16C ; 18D = 18A+18B+18C ; 19 = 17+18D`. On reload the legacy rebuilds the
  schedule (counting `txtTaxableBase`) and re-runs getTaxTrans; the chain round-trips. `test/form2552.test.ts`
  (compute: Primary + Secondary routing; oracle: re-bucket + round-trip). Part III and the detail modal
  (both non-tax) are documented as not-yet-modelled.
- Gate: 165 passed / 1 skipped across 49 files.

## 2026-10-18 — 1601C (monthly compensation WHT) native; 40 forms

- **40th native form: 1601C** (monthly remittance of income tax withheld on compensation, pre-TRAIN) — the most
  structurally involved form yet: item 19/26 is fed by BOTH a **fixed 3-row radio sub-section** (each row branched
  on a Month/Year radio) AND a **dynamic modal Section A** (reconstructed by counting `checkSectionADelete` markers,
  then loadData fills rows by id; per-row M/Y branch via `row_compute`). The two modal columns combine through two
  aggregates summed into `txtDvTotalAmount7a7b`. Chain `17=15−(16A+16B+16C) ; 20=18+19 ; 22=21A+21B ; 23=20−22 ;
  24D=24A+24B+24C ; 25=23+24D`, with item 21A gated on an amended return. `test/form1601c.test.ts` (compute: both
  branches + gate; oracle: modal reconstructs, chain round-trips).
- Gate: 162 passed / 1 skipped across 48 files.

## 2026-10-17 — 2551M (monthly percentage tax) native; 39 forms

- **39th native form: 2551M** (monthly percentage tax, pre-TRAIN) — the first form with **two different dynamic
  schedules reconstructed by two different mechanisms**: the ATC tax table (per-row tax = base × rate/100 via a
  `row_compute`, summed to `txtTotalTaxDue`) is the 1601EQ class — its scalar total round-trips but the ATC grid
  repaints only from the AtcCode modal, documented as a caveat — while the tax-credit Schedule I (Σ applied →
  `txt20A`) reconstructs cleanly by counting `txtPeriodCovered` occurrences. Scalar chain `21=20A+20B ;
  22=totalTaxDue−21 ; 23D=penalties ; 24=22+23D`. `test/form2551m.test.ts` (compute + oracle: credit schedule
  reconstructs, ATC total round-trips).
- Confirmed by scanning every remaining `.hta`: the scalar/fixed/radio-gated-scalar tier is exhausted — all 45
  remaining forms carry ≥1 dynamic schedule. Scoped the next candidates in form-triage.md (2552 transaction-type
  bucketing, 1601C modal + radio sub-schedule, 1707v2018/v2021 ITR-class).
- Gate: 159 passed / 1 skipped across 47 files.

## 2026-10-17 — 1800v2018 (TRAIN donor's tax) native; 38 forms

- **38th native form: 1800 v2018** (donor's tax under TRAIN) — flat **6%** on net gifts above a ₱250,000 annual
  exemption, the TRAIN successor to the pre-TRAIN graduated/30%-stranger `form1800.ts`. Three dynamic schedules
  reconstructed by **field-occurrence splitting** (`j % 2 != 0`, no checkbox marker): schedule A personal-property
  FMV → PersonalProperties, schedule B-2 real-property FMV → RealProperties, schedule B-1 descriptive-only.
  Oracle-proven (all three schedules reconstruct; FMV column totals round-trip). `test/form1800v2018.test.ts`.
- Two legacy footguns found, modelled, and documented (audit-status addendum): (a) the deduction inputs carry
  `id=txtDeductionAmount28..32` but `name=DeductionAmt1..5` — `compute33` reads them by name and only works via
  IE's getElementById-matches-name quirk; saveXML writes by id, so the native form uses the real ids. (b) the
  250k exemption is subtracted with **no floor**, so sub-250k net gifts yield a *negative* tax due — a BIR defect,
  replicated byte-for-byte (both paths unit-tested) since BIR's server parses our file.
- Gate: 156 passed / 1 skipped across 46 files.

## 2026-10-17 — third schedule kind handled (1601EQ); 9 native forms, all patterns solved

- The ATC-derived dynamic schedule (1601EQ) now works: its computed total (txtTax19) round-trips through the
  legacy form, and the ATC detail rows are serialized into the savefile for BIR. The one limitation — the legacy
  form's ATC-detail DISPLAY doesn't rebuild from a reopened file — is a limitation of the original form itself
  (populateAtcPart2 only runs via the ATC picker). Verified by `test/form1601eq.test.ts`.
- **All three schedule reconstruction kinds now have working native forms**: static-row (1600/1600WP),
  dynamic-modal (1601F), ATC-derived (1601EQ). 9 native forms; 78 tests.

## 2026-10-17 — dynamic-modal schedule cracked (1601F); 8 native forms

- The **hardest schedule kind** now round-trips. 1601F's Schedule I is a dynamic-modal table the legacy form
  reconstructs asynchronously: it counts `chxSchedI<i>` markers in the saved file, creates that many (0-indexed)
  rows, then loadData fills them. The repeating-group framework emits exactly that (marker + row fields), and
  the oracle confirms the legacy form rebuilds Schedule I and recomputes the total (`test/form1601f.test.ts`).
- This unblocks the async-schedule withholding family. Both schedule kinds — static-row (1600/1600WP) and
  dynamic-modal (1601F) — are now proven. 8 native forms; 76 tests pass.

## 2026-10-17 — first heavy form wired end-to-end (1600WP + schedule framework)

- The repeating-schedule framework is now **wired to a real heavy form**. `computeForm`/`formRecords` integrate
  group schedules into a form's compute + serialization. **1600WP** (Percentage Tax on Winnings) is rewritten
  natively with its variable payee schedule: per-row withheld = amount × rate ÷ 100, summed into txtTax12, then
  14=12−13, 15D=15A+B+C, 16=15D+14.
- **Proven end-to-end** (`test/form1600wp.test.ts`): a native-saved file with schedule rows loads into the
  legacy 1600WP, which reconstructs the rows and recomputes the identical totals (txtTax12=2,000, txtTax16=1,830.60).
- Five native forms now; the dynamic-schedule tier is unblocked. 70 tests pass.

## 2026-10-17 — fourth native form (1601E)

- **1601E rewritten natively**: 15C=15A+15B, 16=14−15C, 17D=17A+17B+17C, 18=16+17D. Oracle test passes.
  Four native forms now (0605, 0619E, 0619F, 1601E); the field-extractor + oracle tooling makes each new
  remittance/payment form quick. Schedule-based forms remain the next tier (ROADMAP P3).

## 2026-10-17 — third native form (0619F); schedule tier identified

- **0619F rewritten natively** (`form0619f.ts`): compute 15=13+14, 18D=18A+18B+18C, 17=15−16, 19=17+18D.
  Oracle test passes; usable in-app. Three native forms now (0605, 0619E, 0619F).
- Scoping note: the remittance/payment forms are quick with the field-extractor + oracle tooling. The heavy
  forms (1601C, 1701, 1702) use dynamic schedules with running sums — they need a repeating-row abstraction
  in the schema, now tracked as the next framework increment in ROADMAP P3.

## 2026-10-17 — second native form (0619E) + scalable rewrite tooling

- `tool/form-fields.mjs --json` extracts a legacy form's save-order field list (kind, escaped, secret) to
  `src/form/fields/<code>.json`; `schema.buildSchema` merges it with a hand-authored compute graph + validation.
- `test/oracle.ts`: a reusable "native save → legacy form loads → values + totals match" harness.
- **0619E rewritten natively** (`form0619e.ts`): compute 16=14−15, 17D=17A+17B+17C, 18=16+17D (exact centavo).
  Oracle test passes. `FormView` is now generic (schema-driven) + a `registry` — both 0605 and 0619E are
  usable in-app via "rewritten ✦".
- 58 tests pass; 84/84 legacy sweep clean. Audit #22: 2/84 forms rewritten, tooling in place.

## 2026-10-17 — first form rewritten natively (0605); the P3 pattern, proven

- `src/form/`: the P3 model — a form is DATA (a typed schema + exact-centavo compute graph + validation),
  not inline IE JavaScript. `money.ts` is integer-centavo money (fixes float drift properly, in our code).
- **0605 rewritten natively** (`form0605.ts` + `FormView.tsx`): renders with no IE engine, computes
  20D/21 live and exact, validates (required + TIN check), and is usable in the app via "rewritten ✦".
- **Proven byte-compatible:** `test/form0605.test.ts` saves a file with the native schema, opens it in the
  legacy 0605 (the oracle) in WebKit, and asserts the same field values, `&`/`<` preserved, and the same
  computed totals (20D 35.75, 21 1,035.75). 55 tests pass; 84/84 legacy sweep still clean.
- Audit #22 moves from "strategy" to "pattern shipped, 1/84 forms done."

## 2026-10-17 — jQuery upgraded (real CVE fix); zero failed requests

- **jQuery (7):** measured first — jQuery 3.7.1 + jQuery UI 1.13.3 break 0 real forms (the 2 that fail are
  BIR's hidden test forks), the `.show('blind')` pickers work, and the 0605 e2e passes. So the host now serves
  the vendored patched libs in place of BIR's 1.7.1/1.8.18, closing CVE-2020-11022/11023. Not a deferral.
- **Missing assets (19):** a missing image now serves a 1×1 transparent PNG; the sweep has **zero failed
  requests** across all 84 forms.
- jQuery/UI vendored under `host/asset/` (embedded in the Rust binary); TS+Rust parity; 84/84 sweep clean.

## 2026-10-17 — the four deferred audit items, fixed

- **Slow form open (15):** BIR's reference loaders re-read `response.innerHTML` (the whole 150 KB+ ATC/RDO
  DOM) once per record. `fixSlowReferenceParse` + a per-tick shim memoizer cache it. Measured with the new
  `bench/form-open.mjs`: 1601F 2.23 s → 1.59 s, 1702MX 1.63 s → 0.78 s, 1701 0.81 s — every form under 2 s.
- **tax-rate-helper window.onload clobber (17):** now `addEventListener("load", …)`.
- **Missing-script 404s (19):** the host serves an empty 200 for a never-shipped `.js`.
- **printme() $(this.id) no-op (21):** `$(this.id)` → `$(this)` so print-only buttons are hidden.
- All at TS+Rust parity, unit-tested; 84/84 sweep still clean. `docs/analysis/audit-status.md` now shows 18 fixed.

## 2026-10-17 — more audited bugs fixed; honest status for all 22

- Fixed: TCT path-injection in 1606/1706 (`fixTctFilenameInjection`) and the silent zeroing of >12-digit
  amounts (`fixSilentAmountZeroing`, applied to the shared `string-util*.js`). Both at TS+Rust parity, tested.
- `docs/analysis/audit-status.md`: every issue from the audit mapped to fixed / mitigated / deferred / rejected,
  with the reason. Three items moved to `docs/roadmap-rejected.md` because "fixing" them would change BIR's tax
  math or break byte-compatibility with BIR's own reader — reproducing BIR exactly is the correct behaviour.
- Corrected an earlier overstatement that the project was "complete": the port fixes every safe, high-value bug
  and documents the rest honestly; a few items are genuinely deferred (print polish, loader-speed benchmark) and
  the Mac build has been produced by CI but not yet run on a Mac.

## 2026-10-17 — online submission (user-supplied credentials)

- `src-tauri/src/crypto.rs`: Encrypt.exe ported to Rust, byte-exact vs the real binary (IV is AES_K(16×0x00),
  a correction to the static analysis). Passphrase read at runtime from the user's own Encrypt.exe.
- `src-tauri/src/submit.rs`: native SFTP (russh, ring backend) with trust-on-first-use host-key pinning,
  password in memory only, HTTP-CONNECT proxy, folder defaulting to the form code. Proven against a live
  atmoz/sftp server; a tampered host key is refused, a wrong password is a clean Auth error.
- `host.rs` `/__submit`: reads a final copy, encrypts it, uploads it, pins the host key. Verified end to end —
  the packaged app's uploaded file decrypts back to the exact plaintext.
- Shell: Submission settings (host/port/user/proxy; password never stored) and a “Submit online” action on
  final copies, with a host-key-change confirm/re-pin flow.
- The port never reverse-engineers BIR's embedded SFTP credentials — the user supplies them.

## 2026-10-17 — final copy, print path, and more of BIR's bugs fixed

- Submit / Final Copy produces a locked final copy offline via BIR's own unreachable branch; BIR's pages
  can no longer reach the network (the original sent the TIN to an HTTP dispatcher and eval'd the reply).
- IE gave every element `disabled`; without it the ATC and Tax Type pickers never opened in WebKit.
- Fixed in every form at serve time: names/addresses mangled on save (always-true `||` exclusion),
  1701A never recognising its own final copies.
- Printing routes through the host (`/__print` → Tauri native print); needs confirming on a Mac.
- `bench/host-parity.mjs`: the Node and Rust hosts serve all 84 form pages byte-identically.

## 2026-10-17 — every form loads on the macOS engine; the packaged app is self-sufficient

- Legacy-form host (`host/legacy-server.ts`, Rust twin `src-tauri/src/host.rs`) + `public/legacy-shim.js`:
  BIR's 84 form pages run unmodified in WebKit. Sweep: 84/84 load with zero page errors, 82 prefill the
  taxpayer (the two that don't are hidden BIR test forks). 0605 fill → save → reopen passes on both hosts.
- Bugs in BIR's code found by the sweep and fixed at serve time: infinite mutual recursion in the
  1702RTv2018/1702RTv2018C compute graph (every `compute*` now refuses re-entry); forms relying on IE's
  name-matching, case-insensitive `getElementById`.
- Reference data: `atcCodes.xml` duplicates indexes 984 and 1027 (WC230, WV040 never shown) and
  `treatyCodes.xml` lists Vietnam past its declared count — the original silently hides all three.
- TIN check digit verified against 4,013 outputs of the real `chkt.exe`; corrected the legacy-range rule.
- In-app import: the Rust host unpacks BIR's official zip itself — Inno Setup's single LZMA2 chunk, the
  inverse of Inno's x86 CALL/JMP filter (byte-exact vs innoextract), then the PE resources.
- React shell replaces `BIRForms.hta`: first-run import, profiles with live TIN validation, a form
  launcher hiding superseded editions, saved returns sorted by real date.

## 2026-10-17 — repo created, eBIRForms v7.9.6.2 recovered

- Decompiled `Offline_eBIRForms_Package_v7.9.6.2` (Inno Setup 5.5.7 installer → `BIRForms.exe`, an MFC host
  whose 464 `RT_HTML` resources are bitwise-NOT encoded; resource 129 is a UTF-16 manifest mapping
  resource id `130 + i` to path `i`). 469 manifest entries → 468 files (85 form `.hta`, 61 help `.hta`,
  JS/VBScript runtime, XML reference data, page images).
- `tool/extract.mjs`: dependency-free Node extractor (zip → innoextract → PE resource walk → NOT decode),
  byte-identical to the 7z + Python reference path. Recovered BIR code lands in gitignored `vendor/original/`.
- Scaffolded the house spine (Vite + React + strict TS shell, Tauri v2 desktop, vitest gate, port block 10900).
