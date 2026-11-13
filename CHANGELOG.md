# Changelog

What changed in each version, newest first. For the technical detail behind any entry, see the git history and
the `docs/` folder.

## Unreleased

## v0.1.8 (13 November 2026)

- The app's data folder has a new name (io.github.betterebirforms.ebirforms). Your saved returns, profile and settings move there by themselves the first time this version starts.
- On a Mac, yes or no questions (updates, sending to BIR) now show a proper dialog and wait for your answer.
- The Mods screen is readable in dark mode, and each mod has a clear on/off switch.
- New, in beta: the app can send your return to BIR. It is off until you turn it on in Go > Send Returns to BIR (beta). The first time, it downloads BIR's official package from BIR's website. Your return is filed only when BIR's confirmation email arrives, so keep that email. No return sent by this app has been confirmed by BIR yet.
- After a successful Submit, the app reminds you that BIR's confirmation email is your proof of filing.
- Submit's message and the README now say that opening a saved return in BIR's Windows app and submitting it there has not been tested end to end yet.
- On the web version's form pages, the "To Schedule" and "From Part" notes and the page links now take you to that page.
- On the web version's form pages, "Add more" opens the schedule so you can add, change and remove its lines, and the totals on the page update. This works on the 1702-MX forms and 2550-Q (2024) so far.
- On the 1702-MX forms, an amount you type is kept in whole pesos (1,000), as BIR's own form keeps it, instead of 1,000.00.
- On a phone, the web version shrinks BIR's pages to fit the screen instead of cutting off their right side.
- A new form now starts on today's month and year, as BIR's own forms do. Before, some forms opened on October 2026 whatever the date (60 forms, including 1601-C, 0619-E, 2550M and the annual returns).
- The web version now looks like eBIRForms: BIR's main screen with your profile, the List of BIR Forms, Fill-up and your saved returns. Every form also shows BIR's own form page, filled and computed by our engine.
- A web version you can open without installing anything: https://betterebirforms.github.io/ebirforms/. It has the forms we rebuilt, works offline, and keeps your returns in your browser.

## v0.1.7 (12 November 2026)

- Submit now shows two short messages instead of three long ones: a question, then one plain answer. It says nothing was sent to BIR, the return is not filed yet, and the two ways to file it.
- New menu item: Go > Show Saved Returns opens the folder with your saved returns, so you can copy one to BIR's own app on Windows.

## v0.1.6 (12 November 2026)

- Clearer Submit messages. They now say what Submit Final Copy does (checks the return, locks it, saves it on your computer), that nothing is filed, and the ways to file it: on paper, from BIR's own app on Windows, or through eFPS. The old wording pointed to "eBIRForms online", which confused people.

## v0.1.5 (12 November 2026)

- Safer import of BIR's download: a damaged or fake zip can no longer make the app reserve huge amounts of memory. Updated the zip and encryption libraries to versions with known security problems fixed.

## v0.1.4 (12 November 2026)

- The app shows one update message at a time. Before, opening the app and choosing Check for Updates could show two, and one could stay on screen after the update.

## v0.1.3 (12 November 2026)

- BIR's pop-up messages work again on every computer. In version 0.1.2, the part we added for update messages took over BIR's pop-ups: questions answered "yes" by themselves, and messages may not have shown. Please update.
- We now test BIR's pop-ups on Windows and Linux machines, not just on the Mac.

## v0.1.2 (11 November 2026)

- Mac: BIR's pop-up messages show again. Before, Submit / Final Copy did nothing, and validation errors and "saved" messages were hidden.
- Submit now says plainly that this version does not file returns with BIR. It offers to make the final copy, then tells you nothing was sent.
- The app updates itself. It checks for a new version when it opens, and the new **Updates** menu checks now. Updates are signed, so only ours install. You can turn the check off or skip a version. This version is the last one you need to download by hand.
- A new **Mods** screen (**Go > Mods**) lists every change we make to BIR's forms, with a switch for each.
- Mod makers get a checker that tests a mod against BIR's real forms before you install it.
- AI agents (like Claude or Codex) can now fill and save returns through a small, local agent server. It only saves drafts. It never makes a final copy, never files, and never changes a final copy.
- Safer: BIR's pages can no longer send anything to other websites, and the app's local server only answers your own computer.
- The web version can now be hosted on GitHub Pages and works offline there. It is not published yet.

## v0.1.1 (9 November 2026)

- Linux: the title bar is its normal height again. Before, it filled the top half of the window and pushed BIR's main screen down.
- The download page now explains how to install on Windows, Mac and Linux, with pictures of each step.
- The Windows installer shows the eBIRForms name and logo.
- The Mac download now shows, in its own window, how to install the app and how to open it the first time,
  since macOS asks you to confirm an app that Apple has not signed.
- Every change we make to BIR's forms is now a separate file you can read, and switch off to get BIR's original
  behaviour back. You can also add your own changes without rebuilding the app (see the mods guide in the repo).
- New guide for contributors, with setup steps, how the project is laid out, and the rules.
- The roadmap is rewritten in plain words, and now plans the mobile and web versions.
- New GitHub profile picture: the "e" from BIR's eBIRForms logo, in a blue, red and gold gradient. The app icon is still the eagle.
- The README now opens with a picture of eBIRForms running on a Mac, a Windows PC and a Linux laptop.

## v0.1.0 (8 November 2026)

The first public release.

### What you can do

- Fill in, save, print and reopen **all 84 forms** from BIR's Offline eBIRForms Package, on a Mac, Windows or Linux.
- Get the **same numbers BIR's own forms give**. Every form was checked field by field against BIR's original.
- Share saved returns with Windows users. Files saved here open in BIR's own eBIRForms, and the other way around.
- Use the app without first downloading BIR's package. BIR's forms (version 7.9.6.2.1) come inside it.

### Downloads

| System | File |
|---|---|
| macOS 12 or newer (Apple Silicon and Intel) | `.dmg` |
| Windows (64-bit) | `setup.exe` |
| Linux | `.AppImage` or `.deb` |

### Good to know

- **Online submission is not included.** Submit gives you a locked final copy, the same file BIR's own app makes
  when it can't reach BIR.
- **The macOS app is not signed yet**, so macOS will warn you the first time. Open it from
  System Settings > Privacy & Security > Open Anyway.
- **The Windows and Linux versions have not been tried on those systems yet.** They build without errors, but no
  one has opened them there.
- Two mistakes in BIR's own 1700 form are kept as they are, so your file matches what BIR expects. Both are
  written up in our defect report for BIR.

### Also in this release

- The app looks like the original: BIR's main screen inside a Windows XP style window.
- Printing a long form now prints every page, not just the first.
- New logo, taken from BIR's seal.
- README in English, Filipino and Cebuano.
- The code is under the MIT License. BIR's forms and artwork are not; see `NOTICE.md`.

## Before the first release

How the project got here. None of these were released on their own.

### 8 November 2026

- All 84 forms rebuilt and matching BIR's.
- Checked the web version in Safari. It works with no internet, and your TIN is never sent anywhere.
- Sent a proposal to BIR (7 November).
- Made a version that leaves out everything used to reach BIR's servers, so it can be shared safely. This is the
  version you download.
- Fixed 16 forms that named saved files differently from BIR. On 0605, 2000 and the 2200 forms, a second return
  saved the same day replaced the first one.
- Fixed 1603Q showing 0.00 on a new return, and 2200A losing the TIN on reopen.

### 7 November 2026

- Brought back BIR's real main screen instead of a redesigned one, inside a window that looks like Windows XP.
- BIR's own Submit button works again in the full version.
- Exit closes the app. Delete removes the saved return. Saved returns are listed newest first.
- Every form saves and reopens correctly. Tested all 84.

### 26 to 27 October 2026

- 82 of the 84 forms rebuilt, each one matching BIR's.
- A test now compares every saved field against BIR's own form, so "matching" is measured, not guessed.
- BIR's banner and form barcodes shown on the rebuilt forms.
- Decided that BIR's forms and artwork may be included, since they are government works.

### 17 to 18 October 2026

- Started the project by unpacking BIR's eBIRForms package.
- Got all 84 of BIR's forms running on a Mac, with no errors.
- Fixed BIR bugs that broke forms outside Windows, mangled names and addresses on save, and slowed forms down.
- Replaced an old version of jQuery that had a known security hole.
- Rebuilt the first forms (0605, 0619E, 0619F, 1601E, then more) so their math no longer depends on old
  Windows code.
