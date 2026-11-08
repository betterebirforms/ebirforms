# TASK: repo arranged for contributors, mods, roadmap (goal set 2026-11-08)

Goal (user, verbatim): "make sure our repo is properly arranged, good to contirbute to / featureset wise and also
maintianing the original code or 1:1 rebuild code separate? and modularized/hotswappable to teh improvements like
how lua can just add onto the orignal code easily, hotswappable modes/modificaitons/improvements/removements, etc.
and also possible mobile/web support in the future again will be a rebuild but should be in our roadmap
and fully improve the /sync-docs of this app, i want everything to be readable by human and workable by others,
proper contributor docs, and setup fo teh repo overall"

## Plan
1. **Mod system** (`mod/`): every serve-time change to BIR's pages is one JSON file, kind = folder
   (fix / compat / security / speed / remove). Both hosts read the SAME files, ending the TS + Rust duplicate.
   - TS engine `host/mod.ts`; Rust engine `src-tauri/src/bir_mod.rs`; Rust embeds `mod/` via build.rs.
   - Hot-swap: user mods in `<data>/mod/`, on/off in `<data>/mod.json`, re-read on every page load.
   - `inject` rule lets a mod add its own script to BIR's pages (the "Lua" hook).
   - `host/form-patch.ts` keeps its exported names as thin wrappers so tests keep working.
   - `GET /__mod` lists mods (both hosts).
2. Docs: CONTRIBUTING.md, docs/architecture.md (three layers: BIR original / mods + shim / 1:1 rebuild),
   mod/README.md, .github issue + PR templates, development.md + README + AGENTS.md synced, plain language.
3. ROADMAP: mobile + web rebuild tier; mod settings screen; shim split into mods.
4. Gate: `npm run gate` + `npm run gate:rust` exit 0.

## Status
- [x] mod system, docs, roadmap, gate, /sync-docs run + repo skill (.claude/skills/sync-docs), doc check (`npm run check:doc`), newcomer review fixed. Fresh-copy run 2026-11-09 (CONTRIBUTING steps verbatim): install, BIR zip download + extract (468 file), dev server, worked mod example on and off in 0605, gate 826 passed / 89 skipped, Rust 30 passed, check:doc 5 passed.
  Gate 828 passed / 87 skipped; Rust 30 passed. 1601F open re-measured 2026-11-09: 1.14-1.20 s on, 1.37-1.53 s off.
  Uncommitted, awaiting the user.

## Older open items (from the 1:1 shell task, still true)
- Signing/notarization needs an Apple Developer ID certificate.
- Native forms are not reachable from BIR's main screen (Fill-up opens BIR's page).
- Proxy has no UI. Live filing to BIR never done (the user's call).

## Gotchas
- Reap the browser lane and kill dev servers before gating:
  `node ~/.agents/skills/test-browser/scripts/reap.mjs --kill`.
- Rust e2e against BIR's Submit: start the host with `EBF_DISPATCH_HOST=127.0.0.1:9`.
