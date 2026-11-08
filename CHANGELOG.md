# Changelog

What changed in each version, newest first. For the technical detail behind any entry, see the git history and
the `docs/` folder.

## Unreleased

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
