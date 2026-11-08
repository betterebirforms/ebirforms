## What this changes

<!-- In plain words: what a user notices, then why. -->

## Layer

<!-- Which part does this touch? See docs/architecture.md. -->

- [ ] A mod (`mod/`)
- [ ] A rebuilt form (`src/form/`)
- [ ] The app (`src-tauri/`, `host/`, `src/`)
- [ ] Docs only

## Checks

- [ ] `npm run gate` passes
- [ ] `npm run gate:rust` passes (if `src-tauri/` or `mod/` changed)
- [ ] A rebuilt form is still 1:1: `EBF_PARITY=<CODE> npx vitest run test/parity.test.ts` (if a form changed)
- [ ] One plain-words line in `CHANGELOG.md` under Unreleased
- [ ] No BIR programs (`.exe`, `.dll`, `.pdb`, `proxy.ini`), no secrets, no real TINs or returns
