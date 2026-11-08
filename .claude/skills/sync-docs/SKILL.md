---
name: sync-docs
description: "Sync ebirforms' docs after a batch of work: route each change to the right doc (CONTRIBUTING.md \"Which doc to update\"), write it for humans (plain words, no em dashes, changelog without file paths), and finish with npm run check:doc and npm run gate. This repo's version of the global /sync-docs; use it for \"/sync-docs\", \"sync the docs\", \"update the docs\" in ebirforms."
---

# /sync-docs for ebirforms

The general method (discover, plan, write, verify; STATE docs are replaced in place, LOG docs only grow) is the
global sync-docs skill. This file is what is specific to this repo. Where they differ, this file wins.

## 1. Find what changed

```sh
git status --short
git log --oneline origin/main..HEAD
git diff --stat origin/main...
```

Read the diff, not only the file names. List each change as one line: what a user or contributor notices.

## 2. Route each change

The map is the "Which doc to update" table in `CONTRIBUTING.md`. Read it first; it is the source of truth. The usual
cases:

| The change | Update |
|---|---|
| Anything a user notices | `CHANGELOG.md`, one plain line under `## Unreleased` |
| A new or changed mod (`mod/`) | the mod's own `title` + `about`; `mod/README.md` only if the format or folders changed |
| A new command, test switch or env var | `docs/development.md` (commands, the Settings table or "Test and debug switches") |
| A new layer, server route or data location | `docs/architecture.md` |
| Setup, repo layout or a rule | `CONTRIBUTING.md` and `AGENTS.md` (same rules, two readers) |
| Download, install or compatibility | `README.md`, `README.fil.md`, `README.ceb.md`, all three |
| A roadmap item started, landed or agreed | `ROADMAP.md`: remove landed rows (the changelog has them) |
| An idea turned down | `docs/roadmap-rejected.md`, with the reason |
| How forms are rebuilt or checked | `docs/rewrite-playbook.md` |
| BIR material or third-party code added | `NOTICE.md` |

`docs/analysis/` (except `form-triage.md`), `docs/bir/` and `docs/brainstorm/` are private and gitignored. Never link
to them from a tracked doc; `check:doc` fails if you do.

## 3. Write for humans

- Lead with what the user notices, then the reason. Short sentences.
- No em dashes anywhere (docs, templates, mod descriptions). Use a period, comma or colon.
- `CHANGELOG.md`: no file paths, function names or test commands. Those go in the commit message.
- STATE docs (`README*`, `CONTRIBUTING.md`, `AGENTS.md`, `ROADMAP.md`, `docs/*.md`) carry no dates and no
  "shipped" narrative. History goes to `CHANGELOG.md`.
- Numbers you state must be measured. Say which ones you did not re-run.
- Singular names (`docs/CONVENTIONS.md`). BIR's own names stay as BIR wrote them.

## 4. Verify

```sh
npm run check:doc   # links (no missing or gitignored targets), no em dashes, real npm scripts,
                    # every env var the code reads listed in docs/development.md, Unreleased on top
npm run gate        # typecheck + all tests (includes check:doc)
npm run gate:rust   # if src-tauri/ or mod/ changed
```

If `check:doc` reports an undocumented env var, add a row to `docs/development.md` saying what it does, after
confirming the code really reads it.

## 5. Report

A table of the docs changed and why, the check results with their numbers, and what was not checked. Don't commit
unless the user asks.
