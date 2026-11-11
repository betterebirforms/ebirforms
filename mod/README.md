# Mods

A **mod** is a small change to BIR's form pages, applied while the app serves the page. BIR's own files are never
edited. Every fix, compatibility change, speed-up or removal we make to BIR's pages is a mod, and each one is a
single file in this folder.

Because mods are separate files, you can:

- **read** what we changed in BIR's pages, one change per file, in plain words;
- **switch** any of them off to see BIR's original behaviour;
- **add** your own without rebuilding the app, and see it on the next page reload.

## Folders

The folder is the mod's kind.

| Folder | What goes in it | Example |
|---|---|---|
| `fix/` | A bug in BIR's own code | `fix/name-with-bracket`: names with brackets were changed on save |
| `compat/` | Something that worked in Internet Explorer but not in today's browsers | `compat/print-sheet`: long forms printed only page 1 |
| `security/` | Closes a security hole | `security/tct-file-name`: a land title number could change where a file is saved |
| `speed/` | Makes a page faster | `speed/reference-parse`: 1601F opens in about 1.2 s instead of 1.4 s |
| `remove/` | Takes out something unused | `remove/dead-script`: two libraries no form ever calls |
| `improve/` | Adds something BIR's app never had | (none yet) |

## A mod file

```json
{
  "title": "Names and addresses with brackets save correctly",
  "about": "What was wrong, what this changes, in words a taxpayer can follow.",
  "on": true,
  "file": "form",
  "rule": [{ "find": "(a)\\|\\|(b)", "to": "$1&&$2" }]
}
```

| Key | Required | Meaning |
|---|---|---|
| `title` | yes | One line, what the user notices. |
| `about` | yes | Plain words: what was wrong and what the mod does. No em dashes. |
| `on` | no | `false` ships the mod switched off. Default `true`. |
| `file` | yes | `"form"` = every form page, `"main"` = BIR's main screen, anything else = a regular expression on the file's path (case does not matter), such as `"js/string-util(2014)?\\.js$"`. |
| `form` | no | Only these form codes, e.g. `["1700v2018"]`. |
| `if` | no | Only when the file contains this exact text. |
| `rule` | yes | The changes, run in order. |

Each rule does one thing:

| Rule | Does |
|---|---|
| `{ "text": "old", "to": "new" }` | Replace exact text, every match. Add `"once": true` for the first match only. |
| `{ "find": "regex", "to": "new" }` | Replace a regular expression. `$1` to `$9` are its groups, `$$` is a `$`. Add `"once"`, `"nocase"`, or `"repeat": true` (run again until nothing changes). |
| `{ "guard": "compute\\w*" }` | Stop functions with these names from calling themselves in a loop. |
| `{ "empty": "/* {name} served empty */" }` | Replace the whole file. |
| `{ "inject": "my-script.js" }` | Add your own script to the end of the page. Works on pages (`.hta`) only, not on scripts. The `.js` file must be in the mod's own folder. |

In `to` and `empty`, `{version}` becomes the installed BIR package version and `{name}` the file's name.

**Write regular expressions both engines accept.** The same file runs in JavaScript (`host/mod.ts`) and Rust
(`src-tauri/src/bir_mod.rs`). Avoid lookahead (`(?=`), lookbehind and backreferences; use groups and
`"repeat": true` instead. Don't escape `/`.

## Add your own mod (no rebuild)

Put it in your own mod folder, in a kind subfolder:

| Where | Folder |
|---|---|
| Desktop app on macOS | `~/Library/Application Support/ph.advo.ebirforms/mod/` |
| Desktop app on Windows | `%APPDATA%\ph.advo.ebirforms\mod\` |
| Desktop app on Linux | `~/.local/share/ph.advo.ebirforms/mod/` |
| `npm run dev` and `npm run tauri dev` | `.mod/` in the repo (gitignored). The dev window uses the dev server, so it reads `.mod/` too |

A worked example. Create `.mod/improve/hello.json`:

```json
{
  "title": "Hello",
  "about": "Writes a line to the console when 0605 opens.",
  "file": "form",
  "form": ["0605"],
  "rule": [{ "inject": "hello.js" }]
}
```

and `.mod/improve/hello.js`:

```js
console.log("hello from my mod");
```

Run `npm run dev`, open 0605 from BIR's main screen, and look in the browser console. Open
`http://127.0.0.1:10900/__mod` to see `improve/hello` listed with `"on": true`. Edit either file and reload the
page; there is no restart.

A file with the same name as a built-in mod (`.mod/fix/print-button-hide.json`) replaces it. A file that isn't
valid JSON is skipped with a warning in the console, so a broken mod can't stop the app.

A mod you add runs inside BIR's pages with full access to them. Only add mods you have read.

### Check a mod before you use it

```sh
npm run mod:check                      # the built-in mods, then .mod/
npm run mod:check -- path/to/my-mods   # a folder of your own
```

It checks every file (valid JSON, the required keys, plain-words `about`), every rule (one action each, a regular
expression both engines accept, an `inject` script that exists), and then does a dry run on BIR's real pages: which
files the mod applies to and how many each rule changed. A rule that changes nothing is flagged, because it usually
means the pattern is off. It needs BIR's forms for the dry run (`npm run extract`, or `--bir <folder>`).

### What a mod can't do

BIR's pages are served with a content security policy: they, and every mod in them, can load and send data only
to the app itself. A mod can't send a return to a website or load a script from the internet. Put everything a mod
needs in its own folder and `inject` it.

## Switch mods on and off

In the desktop app, open **Go > Mods**. Every mod is listed by kind with its plain-words description and an on/off
switch. A change applies the next time a form opens.

The switches are saved in a `mod.json` in your mod folder. You can also write it by hand (`.mod/mod.json` in development):

```json
{ "off": ["fix/print-button-hide"], "on": ["improve/something-shipped-off"] }
```

`GET /__mod` lists every mod in effect, with its title, kind, source (built-in or user) and whether it is on.
`POST /__mod` with `{"id": "fix/print-button-hide", "on": false}` and the page token switches one; it is what the
Mods screen calls.

## Add a built-in mod (a pull request)

1. Write the file in the right folder here. Name it after what it fixes, in kebab-case, singular
   (`fix/name-with-bracket.json`).
2. Add a test that shows BIR's code before and after. `test/form-patch.test.ts` has examples, and every mod is
   checked by `test/mod.test.ts` and `src-tauri/src/bir_mod.rs`.
3. Run `npm run gate` and `npm run gate:rust`. Optional: to check both servers give the same page, follow
   "Both servers serve the same page" in [docs/development.md](../docs/development.md).
4. Add one line to `CHANGELOG.md` under Unreleased, in plain words.

## What is not a mod yet

- `public/legacy-shim.js`: the layer that gives BIR's pages what Internet Explorer had (ActiveX file access,
  VBScript helpers). Mods can call into it, as `compat/live-inner-html` does.
- The jQuery swap (BIR's old jQuery is served as 3.7.1, `host/form-patch.ts`), and the empty stand-ins for files
  BIR never shipped.

Moving these into mods is on the [roadmap](../ROADMAP.md).
