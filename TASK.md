# TASK: make the shell 1:1 with BIR's real eBIRForms (serve BIRForms.hta)

Branch: parity-1to1 (everything still uncommitted). Goal from the user (2026-11-07): "the UI as well and window,
XP-like UI, 1:1, everything the same just again, optimized and no bugs."

## Decisions (user, 2026-11-07)
0. **Frame = two child webviews, not an iframe** (user chose this over the goal's "same-origin iframe" wording,
   2026-11-07): native print prints the top document, and an iframe would clip multi-page forms.
1. Serve BIR's real main screen (`BIRForms.hta`) through the host + shim, not a React re-skin.
2. Keep our fixes. The look is 1:1; the behaviour is optimized. Security holes stay fixed.
3. Faux-XP title bar.

## DONE (gate exit 0: 614 passed / 85 skipped; Rust 28 passed / 2 ignored)
1. **Faux-XP frame + entry.** `src-tauri/src/lib.rs`: a frameless window with a `caption` child webview
   (`caption.html`, `src/caption/`) and a `content` child webview, both resized on `Resized`, maximized after
   attach. Print targets `content`; `/__close` closes the window.
   - Not an iframe: native print prints the top document only.
   - `src/App.tsx` is now just the import screen plus `location.replace('/legacy/BIRForms.hta')`.
   - The dead launcher, submit and settings code was removed.
2. **Submit → dispatcher.** In `public/legacy-shim.js`:
   - The `conService` and `checkNetConnection` replacements trigger the dispatch op after the confirm.
   - `RenameAndSendFile` calls the send op, and confirms before re-pinning a changed host key.
   - Host ops are in `src-tauri/src/host.rs`. The Node host returns mode "0".
3. **Saved-returns sort.** `fixSavedReturnSort` (TS + Rust) keys on `dtCreated` rearranged to yyyy/mm/dd.
   - Do not use `ts`: BIR has reused it by that line.
   - Also fixed Delete: shim File/Folder `toString` returns `Path`.
4. **XP polish + playtest.** A Luna control theme in the shim. A WebKit playtest on the headless Rust host
   (`cargo run --example host -- dist vendor/original <data> <port>`) ran the full Submit against a stand-in
   dispatcher and docker `atmoz/sftp`. Details are in CHANGELOG.

5. **Print + save sweep (2026-11-07, goal "finish the Mac app").** `fixRestoreAfterPrint` (TS + Rust) — long
   forms print every page (1702Qv2018C 2 → 5 pages in the real sheet). `test/save-sweep.test.ts` (`EBF_SAVE=1`)
   84/84 on Node + Rust hosts.

## OPEN (needs the user)
- **Signing/notarization:** needs an Apple "Developer ID Application" certificate + notary credentials; this Mac
  only has "DRIA Dev" and "bygelo".
- **Native forms are no longer reachable from the UI.** BIR's Fill-up opens BIR's legacy page. Routing the main
  screen's Fill-up/View to the 82 native forms is a decision: they are 1:1, so it is a speed/robustness win, not a
  visible one.
- **Proxy has no UI** (`data/settings/submit.json` by hand). The manual SFTP-settings path is gone.
- Caption controls pass the real-window self-test (`EBF_SELFTEST=1 npm run tauri dev`). The one gap is a physical
  mouse drag.
- **Live filing** to BIR with a real TIN: never done, irreversible, the user's call.
- 1700/1701 legacy native rewrites (XL).

## Gotchas
- Reap the browser lane and kill dev servers before gating:
  `node ~/.agents/skills/test-browser/scripts/reap.mjs --kill`.
- When running the 0605 e2e against the Rust host (`EBIRFORMS_HOST_URL`), start that host with
  `EBF_DISPATCH_HOST=127.0.0.1:9`. Otherwise Submit asks BIR's real dispatcher.
- Never screenshot the whole screen while the user works. Capture the app window by ID
  (`screencapture -l <CGWindowID>`).
