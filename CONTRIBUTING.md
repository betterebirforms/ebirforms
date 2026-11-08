# Contributing

Thanks for helping. This project rebuilds BIR's Offline eBIRForms Package so it runs on macOS, Windows and Linux.
Two words used below: a rebuilt form is **1:1** when it gives the same saved file as BIR's, field by field, and
**the gate** is `npm run gate`, the typecheck and tests every change must pass.

You don't need to know tax law or Rust to help: reporting a form that computes differently from BIR's, writing a
mod, or improving a translation all count.

## Ways to help

| You want to | Start here |
|---|---|
| Report a bug or a form that differs from BIR's | [Open an issue](https://github.com/betterebirforms/ebirforms/issues/new/choose) |
| Fix or improve how a BIR page behaves | Write a [mod](mod/README.md): one JSON file, no rebuild needed to try it |
| Work on a rebuilt form | [docs/rewrite-playbook.md](docs/rewrite-playbook.md) |
| Work on the app itself (window, import, print) | [docs/architecture.md](docs/architecture.md), then `src-tauri/` and `host/` |
| Improve the README in Filipino or Cebuano | `README.fil.md`, `README.ceb.md` |
| Pick something from the plan | [ROADMAP.md](ROADMAP.md) |

## Set up

To write a mod or work on a rebuilt form you need:

- Node 22.18 or newer.
- `innoextract`, to unpack BIR's installer: `brew install innoextract`, `sudo apt install innoextract`, or
  `scoop install innoextract`.

To work on the desktop app (`npm run tauri dev`, `npm run gate:rust`) you also need:

- Rust (stable, from [rustup](https://rustup.rs)).
- The desktop app's build tools: on macOS, `xcode-select --install`; on Windows, the Visual Studio C++ build
  tools; on Ubuntu, `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`.
  Details: [Tauri's prerequisites](https://v2.tauri.app/start/prerequisites/).

```sh
git clone https://github.com/betterebirforms/ebirforms.git && cd ebirforms
npm install
npx playwright install webkit
cp .env.example .env
# BIR's package: https://bir-cdn.bir.gov.ph/BIR/pdf/Offline_eBIRForms_Package_v7.9.6.2.1.zip
npm run extract -- ~/Downloads/Offline_eBIRForms_Package_v7.9.6.2.1.zip
npm run dev          # http://127.0.0.1:10900 in your browser
npm run tauri dev    # or the desktop window
```

`npm run doctor` checks your tools if something doesn't start. More commands are in
[docs/development.md](docs/development.md).

## How the repo is laid out

The one thing to know: **BIR's code, our changes to it, and our rebuild live in separate places.**

| Folder | What | Whose |
|---|---|---|
| `vendor/original/` | BIR's package, unpacked by `npm run extract`. Gitignored, never edited. | BIR's |
| `asset/bir/` | BIR's banner and form barcodes, used by the rebuilt forms | BIR's |
| `mod/` | Every change we make to BIR's pages, one file each | ours, on top of BIR's |
| `public/legacy-shim.js` | Gives BIR's pages what Internet Explorer had | ours, on top of BIR's |
| `src/form/` | The 84 forms rebuilt in TypeScript, each 1:1 with BIR's | ours |
| `src/` (rest) | The first-run import screen, the title bar, shared code | ours |
| `host/` | The development server, and the mod engine in TypeScript | ours |
| `src-tauri/` | The desktop app in Rust: server, import, print, mod engine | ours |
| `test/` | The tests (vitest). `npm run gate` runs them | ours |
| `tool/` | Scripts: unpack BIR's package, package the app | ours |
| `bench/` | Measurements that aren't part of the gate (speed, host parity, scoreboards) | ours |
| `docs/` | How things work and why | ours |

[docs/architecture.md](docs/architecture.md) explains how a page gets from BIR's files to your screen.

## Before you open a pull request

1. `npm run gate` passes (typecheck and tests). If you touched `src-tauri/` or `mod/`, `npm run gate:rust` too.
2. A rebuilt form is done only when it is 1:1 with BIR's (gives the same saved file, field by field): `EBF_PARITY=<CODE> npx vitest run test/parity.test.ts`
   shows every field equal and no page errors.
3. One line in `CHANGELOG.md` under **Unreleased**, written for users (see "Writing" below).
4. Fill in the pull request template. CI runs the gate on every pull request.

## Rules

These keep the project safe to share. A pull request that breaks one can't be merged.

- **Never commit BIR's programs or their secrets.** No `.exe`, `.dll`, `.pdb` or `proxy.ini` from BIR's
  installer, and never the SFTP login or the `Encrypt.exe` passphrase inside them. Refer to them by file and
  offset only. BIR's forms, pages, artwork and reference data are fine to use (see [NOTICE.md](NOTICE.md)).
- **Never run BIR's programs.** The one exception: on Windows, a scratch copy of `chkt.exe` or `Encrypt.exe` may be
  run to make test data. Never `BIRForms.exe`, and nothing that goes online.
- **Never edit BIR's files.** Change a page with a mod in `mod/`.
- **Rebuilt forms stay 1:1.** They copy BIR's arithmetic, bugs included, because BIR's server checks it. A bug that
  changes saved values is written up in a comment, not fixed.
- **No floating point for pesos.** Use integer centavos (`src/form/money.ts`).
- **Names are singular**, collections too: `form: Form[]`, not `forms`. BIR's own names stay as BIR wrote them.
  Details: [docs/CONVENTIONS.md](docs/CONVENTIONS.md).
- **Both servers serve the same page.** A change to how BIR's pages are served goes in `mod/` (both servers read it)
  or in both `host/` and `src-tauri/`, with a test on each side.

## Writing

Docs, mod descriptions and the changelog are read by taxpayers as well as developers.

- Short sentences and plain words. Say what the user notices first, the technical reason second.
- No em dashes. Use a period, a comma or a colon.
- The changelog says what changed for users. File paths, function names and test commands go in the commit
  message, not the changelog.

`npm run check:doc` (also part of `npm run gate`) fails when a doc drifts from the code: a broken or private link,
an em dash, an `npm run` command that doesn't exist, or a setting the code reads that `docs/development.md` doesn't
list. After a batch of work, run `/sync-docs` in Claude Code (this repo's version is
`.claude/skills/sync-docs/SKILL.md`), or update the docs below by hand, then run `npm run check:doc`.

### Which doc to update

"Current" docs describe the project as it is now and are edited in place. "Log" docs only grow.

| Doc | Kind | Update it when |
|---|---|---|
| `README.md`, `README.fil.md`, `README.ceb.md` | current | What a user downloads, installs or needs changes. Keep the three in step |
| `CHANGELOG.md` | log | Every pull request: one plain line under Unreleased |
| `ROADMAP.md` | current | A planned item starts, lands (remove it), or a new one is agreed |
| `docs/roadmap-rejected.md` | log | An idea is turned down, with the reason |
| `CONTRIBUTING.md`, `AGENTS.md` | current | Setup, layout or a rule changes. `AGENTS.md` is the same rules for AI coding agents |
| `docs/architecture.md` | current | A layer, a server route or where data lives changes |
| `docs/development.md` | current | A command, test switch or setting is added or changed |
| `docs/rewrite-playbook.md` | current | The way forms are rebuilt or checked changes |
| `mod/README.md` | current | The mod file format or the mod folders change |
| `NOTICE.md` | current | What BIR material or third-party code is included changes |

## Commits

One change per commit, with a message that says what it does and why, in the present tense
("Long forms print every page; the line after print() now waits for the sheet to close"). Work on a branch and
open a pull request against `main`.

## Questions

Open an issue, or start a discussion on the pull request. This project is not affiliated with BIR; please don't
send BIR questions about it.
