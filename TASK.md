# TASK (session state)

Goal (2026-11-11, user /goal): fix current issues (issue #1 Mac pop-ups), apply email+reddit feedback, in-app updater
(Sparkle-like), more mod capabilities w/ harness+docs, foundations of an API/MCP interface for agents, security
hardening, all platforms, foundations for a web version on GitHub Pages.

Already done: issue #1 commented; replies sent to the three people who emailed (promised a fix).
Root cause #1: wry 0.57 macOS UI delegate lacks runJavaScriptAlert/Confirm/TextInputPanel -> alert no-op,
confirm()=false in 1 ms (measured with scratchpad/wk.swift). Every BIR alert/confirm silent on Mac.

Feedback to apply: legal-size print + PDF right-edge cropping (Reddit); Submit must say plainly it does NOT
file with BIR (one emailer thought they had filed); Linux users want web version (Reddit).

| # | Workstream | Status |
|---|---|---|
| A | Mac JS dialogs: src-tauri/src/mac_dialog.rs + EBF_DIALOGTEST selftest (measured confirm=true ms=6411) | done |
| B | Updater: update.rs + menu "Check for Updates…", package.mjs signs, tool/latest-json.mjs, CI secrets TODO, key ~/.tauri/ebirforms-updater.key | done (secrets set; not yet exercised in a real release) |
| C | Security: Host allow-list (rebinding) + PAGE_CSP both hosts, tests; sweep 84/0 errors same as before | done |
| D | Mods: Go > Mods screen (src/ModScreen.tsx), POST /__mod both hosts + tests, npm run mod:check harness + test, README | done |
| E | MCP: mcp/tool.ts + mcp/main.ts (hand-rolled stdio), npm run build:mcp, test/mcp.test.ts, docs/agent.md | done |
| F | Feedback: legal print, PDF crop, Submit notice wording | done (Submit wording + test; print measured 0 clipped pages on A4/Legal/long bond in a Chromium proxy, not the real macOS print sheet) |
| G | Web on GitHub Pages: base path, workflow (manual deploy; roadmap gate = BIR reply) | done (EBF_WEB_BASE, per-form index pages, pages.yml manual, bench/web-pages.mjs 6/6) |
| H | Docs (README x3/CHANGELOG/ROADMAP/AGENTS/architecture/release-note), gate + gate:rust, release v0.1.2 (ask) | done; v0.1.2 released (run 43032200921, mac on macos-15-intel after arm64 capacity cancels), live EBF_UPDATETEST found=0.1.2 bytes=30151543 verified=true; issue #1 closed; emailer follow-ups sent. gate 0 (839 pass), gate:rust 0 (34 pass), host-parity 169/169, mod:check 0/0 |

## 2026-11-12 follow-up
- v0.1.2 regression: tauri-plugin-dialog's init script replaced window.confirm/alert in every webview (confirm returned a Promise). Fixed in v0.1.3 (rfd, plugin removed, test guards it).
- DIALOGTEST shown=true confirm=true: macOS local 4051 ms, Windows CI 6033 ms, Ubuntu 22.04/24.04 CI 3958/3964 ms, Ubuntu 24.04 Docker 3975 ms.
- Update install measured on Mac: released v0.1.2 -> v0.1.3, bundle replaced, relaunched. Windows/Linux install untested.
- CI: mac on macos-15-intel; apt via .github/script/apt-install.sh (DNS fallback).
- Corrections sent: issue #1 comment, emailer emails. Reddit Linux-link reply: user to post.
- v0.1.4 released (one prompt at a time). update.yml from v0.1.3: Windows after=0.1.4, Linux AppImage sha == v0.1.4 and relaunched. Mac v0.1.2->v0.1.3 measured locally. .deb v0.1.3->v0.1.4 measured in the update workflow (pkexec approved by a CI-only polkit rule; a real user types their password).
- Real macOS print sheet, 1701Q, Destination Paper Size US Legal, Save as PDF: 612x1008 pt pages, right edge (barcode, borders) intact.
- 2026-11-12 MCP end to end: headless Claude (Sonnet, MCP-only tools) filled 1603 Q3 2026 from a plain request, saved the draft 12345678900000-1603-2026Q3.xml, read it back (tax 15,000.00, correct) and passed on BIR's TIN check-digit warning. 10 turns, $0.09. Direct protocol checks: overwrite refused, `../../etc/passwd` refused.
- 2026-11-12 Security: cargo audit 7 -> 1 (rsa RUSTSEC-2023-0071: russh 0.65.1 still pins rsa =0.10.0-rc.18 though rsa 0.10.0 is patched; not reachable here, the client holds no RSA private key; recorded in src-tauri/.cargo/audit.toml until russh moves). SFTP upload test passes against a local atmoz/sftp server. Released in v0.1.5; update from v0.1.4 measured on Windows, AppImage and .deb (update.yml) and on this Mac (Install and Restart: bundle 0.1.4 -> 0.1.5 in 25 s, relaunched).
- 2026-11-12 v0.1.6 then v0.1.7: Submit is now one question + one plain answer (nothing sent, NOT filed, file on paper or copy into C:\eBIRForms\savefile and Submit in BIR's Windows app); Go > Show Saved Returns. BIR's guard skips final flag 3, so such a copy should be submittable there (unverified on Windows). v0.1.5 -> v0.1.6 updates measured on Windows, AppImage, .deb.
- 2026-11-12 Web version live: https://betterebirforms.github.io/ebirforms/ (pages workflow; bench 6/6 on the live site via EBF_PAGES_ORIGIN).
- 2026-11-12 Emailed the second emailer: what Submit Final Copy does and how to file. Reddit Linux-link reply: user to post (no browser access to their Reddit login).
- 2026-11-12 Update v0.1.6 -> v0.1.7 measured in CI: Windows 0.1.7, AppImage sha f5e40042936fc53f == v0.1.7, .deb 0.1.7.

## 2026-11-12 Web version looks like the desktop app (user chose "Screens + forms")
Goal: betterebirforms.github.io/ebirforms looks like the actual app. (1) Main screen = BIR's main screen (XP caption,
File/Help, seal background, Profile, List of BIR Forms + Fill-up, saved-returns table). (2) Each form shown in BIR's own
page layout (layout only, never BIR's scripts), our native engine bound to the same field ids. Reverses ROADMAP
rejected item "Serving BIR's own pages from the web" for layout only (user decision 2026-11-12). Few forms first, user checks.
Done: dialog.yml submit-mode screenshots (run 43136063700, c17a4b9): Windows and Ubuntu 22.04 both show "Make a final copy of this return?" then "Nothing was sent to BIR. Your return is NOT filed yet." in the real window.
Done: capture (test/capture-layout.test.ts: all sheets incl. @import and
script-inserted rules, body/html mapped into the shadow root, url() made absolute per sheet), layouts for main, 0605,
1701Qv2018; LayoutView (fields, pages, File menu, Validate/Save; profile fields greyed when filled); MainLayout (profile,
List of BIR Forms + the 5 native forms BIR's list lacks = 84, Fill-up with BIR's checks, saved list, View/Delete/Download,
Add a savefile). All 85 layouts captured locally (37 MB; only main's are precached, 3.4 MB; a form's layout is cached
on first open); test/layout.test.ts 255/255. bench/web-pages 13/13; web-roundtrip 2/2; gate exit 0.
Date defaults: BIR's init() fills 128 keys in 60 forms from today's date; the templates had frozen Oct 2026. Measured
under 6 clocks (EBF_CAPTURE_CLOCK -> src/form/template-clock.json), applied by liveTemplate (src/form/clock.ts) in
schema.ts and the 12 forms that walk their own template; test/clock.test.ts; parity on the touched forms 9/9.
User chose to publish all 84 (2026-11-12). Left: ATC / tax type pickers (0605's schema has no ATC fields at all);
schedules; the layout is 800 px wide (no phone fit); XP caption bar not added.
- 2026-11-12 Web pop-ups (user: start now): LayoutView edits schedule rows (groups were read-only on the web), "Add more"/btnModal<X> opens the row editor (BIR's heading, column labels from its table), on-page row boxes are live, locked boxes show the saved value. FormSchema.typed: 1702-MX family keeps typed amounts as addCommas1702MX ("1,000"), from BIR's source. Links: 260 page, 38 pop-up, 130 nothing (mostly notes pointing at their own page; about 15 pop-ups of schedules the engine does not model). bench/web-pages 20/20, web-roundtrip 2/2, gate exit 0.
