# Rejected roadmap ideas

Ideas considered and killed, with the reason, so they are not re-proposed. Append-only.

| Idea | Why rejected | Date |
|---|---|---|
| Run the original `BIRForms.exe` under Wine/CrossOver on macOS | It is what people already do and it is the pain: IE engine quirks, VBScript, no Apple Silicon native, no fix for the app's own bugs. We rebuild, not wrap. | 2026-10-17 |
| Electron instead of Tauri | 150+ MB bundle for a forms app; Tauri uses the system WKWebView on macOS and keeps native helpers in Rust. Revisit only if WKWebView blocks a form we cannot rewrite. | 2026-10-17 |
| Commit the recovered BIR forms/assets to this repo | BIR's code and artwork are not ours to redistribute. The repo ships the extractor; each user rebuilds from their own installer. | 2026-10-17 |
| Change BIR's cross-field money summation to exact decimal | The forms add peso fields in float (WL bug 12). Fixing the summation changes computed tax output; BIR's server validates against its own computation, so a "more correct" total could be *rejected* as a mismatch. We reproduce BIR's arithmetic exactly and only fixed the clearly-broken silent-zero. A real decimal engine belongs in the P3 rewritten forms, validated against BIR, not retrofitted into their JS. | 2026-10-17 |
| Strip BIR's dead code from the recovered tree | Rollbase/cFTPSend/Blowfish/etc are dead (WL bug 20). We don't edit BIR's recovered files; changes are served as mods (mod/). Rewriting their tree would break the "rebuilt from your own installer, byte-for-byte" guarantee and the extractor's verifiability. The P3 rewritten forms carry none of it. | 2026-10-17 |
| Add an integrity layer to the final-copy encryption | The AES-CBC format has no MAC (native §). BIR decrypts these files with the exact fixed-key/IV scheme; adding integrity would make BIR's reader reject them. The port must stay byte-compatible. | 2026-10-17 |
| Friendlier, non-1:1 input screens in the desktop app (r/taxPH: Real-Ask2969, Double-Technician-91) | The user chose "1:1, everything the same" on 2026-11-07, and 1:1 is the proposal's main evidence to BIR. A different input UI is a web-version question (ROADMAP P4 triage). | 2026-11-08 |
| Release a public beta or announce a web launch date before BIR replies | The TOSA warnings on r/taxPH and the proposal's promise ("not released until the Bureau says how"). Building is fine; publishing waits. Reversed on 2026-11-09: the user released it as open source (r/taxPH suggested it), with Submit sending nothing to BIR. Online submission followed on 2026-11-13 as an opt-in beta (user decision). | 2026-11-08 |
| Ship BIR's own form pages in the web version | It is the derivative-work case the TOSA names; the web version uses the native rewritten forms only. Reversed on 2026-11-12: BIR's forms and artwork may be bundled (NOTICE.md), and the user chose to make the web version look like BIR's app. It shows BIR's page layouts with none of BIR's code; the rebuilt forms do the work. | 2026-11-08 |
| Resend or mass-email BIR / RDOs to speed up a reply | Gets the address filtered and damages track A and any later TSP application. One email per office; follow up once, citing ticket 20261107_00563_E. | 2026-11-08 |
| Google Drive sign-in inside a mod or the app | A Google token would sit inside BIR's page or the app, and a mod would need open internet access to use it. Choosing a save folder that Drive for desktop syncs gives the same result for every cloud service (ROADMAP Next). | 2026-11-09 |

**Reversed 2026-10-26:** "Commit the recovered BIR forms/assets" is no longer rejected. BIR's forms and artwork are
government works (RA 8293 §176.1, no copyright), so the repo and app may use them; see NOTICE.md. BIR's native
helpers and the secrets embedded in them stay out (AGENTS.md).
