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
- 2026-11-12 Security: cargo audit 7 -> 1 (rsa RUSTSEC-2023-0071 left: no upstream fix, only in the bir-submit build). SFTP upload test passes against a local atmoz/sftp server. Released in v0.1.5; update from v0.1.4 measured on Windows, AppImage and .deb (update.yml) and on this Mac (Install and Restart: bundle 0.1.4 -> 0.1.5 in 25 s, relaunched).
