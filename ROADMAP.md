# Roadmap

What we plan to build, in order. Gaps are listed as gaps. Ideas we decided against are in
[docs/roadmap-rejected.md](docs/roadmap-rejected.md), and what already shipped is in [CHANGELOG.md](CHANGELOG.md).

Want to take something? Open an issue saying which row, so two people don't build the same thing.
[CONTRIBUTING.md](CONTRIBUTING.md) has the setup.

## Where we are

- All 84 of BIR's forms run on macOS, Windows and Linux, inside BIR's own main screen.
- All 84 are also rebuilt in TypeScript, and each rebuilt form saves the same file as BIR's (1:1, measured).
- Every change we make to BIR's pages is a separate, switchable [mod](mod/README.md).
- The downloads have no online submission. A web version is built but not published.

## How the work is split

The project keeps three things apart (see [docs/architecture.md](docs/architecture.md)):

1. **BIR's original pages**: never edited.
2. **Mods**: our changes to BIR's pages, one file each, switchable.
3. **The rebuild**: our own forms, 1:1 with BIR's.

Each part of the plan below says which layer it touches.

## Now

| Item | Why | Layer | Done when |
|---|---|---|---|
| Signed macOS app | macOS warns on every first open | app | The `.dmg` opens with no warning. Needs an Apple Developer ID (owner) |
| Try the Windows and Linux packages on real machines | On GitHub's test machines the Windows installer gets past SmartScreen, installs and opens BIR's main screen, and the Linux `.deb` and AppImage (made runnable and double-clicked in the Files app) open it on Ubuntu 22.04 and 24.04. No one has filled a return in them yet | app | A return is filled, saved, printed and reopened on Windows 11 and Ubuntu 22.04 |
| Block BIR's pages from going online | Any mod's script can send page data to any website today, because BIR's pages run with no content security policy | app + mods | BIR's pages can reach only the app's own server, and a mod that needs the internet says so with a `network` key that the user has to approve |
| Send BIR our list of bugs in its package | We offered BIR a list of the bugs we found, and private notes on the security ones | none | Sent to BIR. The security notes go to BIR only, never in this repo |
| Hear back from BIR | We have asked BIR how it wants this app released | none | BIR replies. No public beta or web launch before that |

## Next: the desktop app

| Item | Why | Layer | Done when |
|---|---|---|---|
| A mods screen | Today mods are switched by editing `mod.json` | app + mods | A settings page lists every mod (from `GET /__mod`) with an on/off switch and its plain-words description |
| Split the shim into mods | `public/legacy-shim.js` is one 650-line file; contributors can't tell its parts apart or switch one off | mods | Each Internet Explorer feature (file access, VBScript helpers, print) is its own mod, and the 84/84 sweep still passes |
| The jQuery swap as a mod | It is the one security change that isn't switchable yet | mods | `security/jquery-upgrade` replaces the code in `host/form-patch.ts` and `host.rs` |
| Open the rebuilt forms from BIR's main screen | The rebuilt forms are 1:1 but only reachable at `/form`; Fill-up still opens BIR's page | rebuild | Fill-up and View open the rebuilt form, with a switch back to BIR's page |
| Old editions open and print only | People reopen old returns, but shouldn't file new ones on superseded forms | rebuild | Superseded forms (`src/lib/catalog.ts`) open saved returns and print, and refuse a new return |
| Version messages shown as text | BIR's version check puts its message into the page as HTML | mods | A `<script>` in the message shows as text |
| Choose where returns are saved | People asked for Google Drive. Saving into a folder that Google Drive, Dropbox, iCloud or OneDrive already syncs covers all of them, with no cloud login inside the app | app | A "Save returns in" setting moves saved returns and profiles to a folder you pick, and BIR's forms save and reopen there |
| A small API for mods | A mod can't ask the app for anything: no file picker, no profile, no settings | app + mods | A mod can ask for a file picker or the profile, each one only after the user allows it, through one documented call |
| Proxy setting in the app | Today it is a hand-edited file | app | A setting in the app, saved where the full build reads it |
| Keyboard and screen reader | Tab order and labels were never checked | rebuild | The rebuilt 1701Q can be filled with the keyboard only and read by VoiceOver |

## Next: improvements, kept switchable

The desktop app stays 1:1 with BIR by default. Improvements come as mods (for BIR's pages) or as options on the
rebuilt forms, each one off or on by choice, so the 1:1 version is always one switch away.

| Item | Why | Layer | Done when |
|---|---|---|---|
| Options for the rebuilt forms | The rebuild has no way to ship a change that isn't 1:1 | rebuild | A rebuilt form can carry an option (like a mod) that is off by default, and the parity test runs with every option off |
| First `improve/` mods | Show how an improvement is added on top of BIR's page | mods | One shipped `improve/` mod, off by default, with a test |

## Later: mobile and web (a rebuild)

BIR's pages need a desktop browser engine and file access, so they can't run on a phone or a public website.
Mobile and web are built on **the rebuilt forms only** (layer 3), which are plain TypeScript and already run in a
browser. This is a new app around the same forms, not a port of BIR's pages.

| Item | Why | Done when |
|---|---|---|
| Publish the web version | People asked for a website (r/taxPH). It is built (`npm run build:web`), works offline and stores returns in the browser | (1) BIR has answered. (2) It is hosted with no server-side storage. (3) A saved file still opens in BIR's own app |
| Input screens that fit a phone | BIR's form layouts are made for a wide screen and a mouse | The rebuilt forms render as a one-column, touch-friendly flow on a 375 px wide screen, saving the same file |
| Mobile app (iOS and Android) | Filing from a phone | A Tauri mobile build (or an installable web app) fills, saves and exports a 1701Q on an iPhone and an Android phone |
| Save to the user's own storage | Returns should stay with the user, not on our servers | Export and import of savefiles through the phone's Files app or the browser's download, plus an optional folder the user picks |
| PDF on the device | Printing from a phone usually means PDF | A rebuilt form exports a PDF that matches BIR's printed layout on A4, Legal and long bond |

## Waiting on BIR

| Item | Why | Done when |
|---|---|---|
| BIR's file format for tax software providers (TSPs: companies BIR lets file returns for taxpayers) | BIR certifies third-party filing software (its eTSPCert program) and gives each form's data layout only to enrolled providers | The empty TSP export slot in `src/form/export.ts` is filled from BIR's layout |
| Online submission in the download | Filing needs BIR's permission and a live test with a real TIN | BIR agrees, and one real return is filed and acknowledged |

## Not doing

- Running BIR's Windows program under Wine or CrossOver.
- Rebuilding the parts of BIR's package that no longer work or are never used: an old USB-stick relay between
  BIR offices, an old upload tool, and two unused code libraries.
- Storing or sending the user's eBIRForms Online password.
- Changing the desktop app's screens away from 1:1 by default. A different look is an option you switch on.
- Serving BIR's own pages from the web or mobile version.
- A public beta or web launch date before BIR answers.
