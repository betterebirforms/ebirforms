# Changelog

What changed in each version, newest first. For the technical detail behind any entry, see the git history and
the `docs/` folder.

## Unreleased

- On the 2200-A (2013 edition), Schedule 1 takes a calculator's total only when you press Compute, Clear or delete its last row, as in BIR's app. Print shows BIR's legal paper notice first, and "You are advised to print this computation" prints the calculator the same way.
- On the 2200-A (2013 edition), a calculator's Print now checks the table first and prints the calculator with your TIN and the date computed, and a volume over twelve digits is refused as in BIR's app.
- On the web version, the 2200-A (2013 edition) Schedule 1 calculators now work like BIR's app: each Calculator link opens its calculator, rows can be added, deleted and cleared, Compute fills the Schedule 1 box with BIR's own arithmetic and alerts, and the rows save and reopen in the same file.
- Fixed: on the web version, the 1700's "(add more...)" for Part IV employers hid the whole form. It now opens the table of employers, and a row's amounts open once its employer's name and TIN are in, as in BIR's app.
- On the web version, the 1701 (2018) attachments show their tax regime ticked and greyed, as BIR's app sets it.
- On the 2000 (2018), DS112 is listed twice as in BIR's app, and picking the pre-need plans entry fills its own rate.
- On the 1702-RT, "(To Schedule 7 Item 4)" now takes you back up the page.
- On the web version, the tables of extra rows now show BIR's drop-downs and ticks: treaty codes and ATCs on the 1602 and 1601-F (picking an ATC fills its rate), the ATC list on the 2000 (2018), PS or CS on the 1700, 1701, 1702-EX and 1702-RT, the class and RDO lists on the 1801 (2018), and Taxpayer or Spouse on the 1700 and 1700 (2018).
- On the 1700 and 1700 (2018), unticking an employer row empties it as BIR's app does, and its boxes stay greyed until Taxpayer or Spouse is ticked.
- On the 1701, 1700, 1700 (2018) and 1701-A, each "(add more...)" link turns on only when BIR's app turns it on.
- On the web version, the Close, OK, Cancel, Clear and Print buttons inside BIR's pop-ups now work, and Clear resets the pop-up's boxes the way BIR's app does. The 2552's tax pop-up opens its rows.
- On the web version, attachments now also work on the three 2018 editions of the 1702-MX, and save the same file as BIR's app.
- On the web version, the "(add more...)" and "Add" links that open a table of extra rows now work on the 1700, 1701, 1701-A, 1702-RT, 1702-EX, 1707, 1707-A (2021), 2552 (2018), 1601-C (2018), 1702-Q (2018), 2200-A (2020) and 2550-Q (2024), including the tables inside 1701 attachments. The rows feed the form and save as BIR's app saves them.
- On the 1707 and 2552 (2018), "(Add More...)" turns on once the rows before it are filled, as in BIR's app. On the 1702-Q (2018), Delete clears the ticked rows of Schedule 4.
- On the 1702-RT and 1702-EX (all editions), each "(Add more...)" link turns on when BIR's does, and amounts typed in their tables save as BIR's app writes them.
- The 1702-RT's pop-up tables now keep what was typed in them when a saved return is reopened.
- On the web version, attachments now work on the 1701 (both editions) and the 1702-MX (2013): add an exempt or special-rate attachment, fill its pages, go between attachments, delete one, and go back to the main pages. They save the same file as BIR's app.
- The rebuilt 1701 and 1702-MX (2013) forms now save attachments too, so a return with attachments made here opens the same in BIR's app.
- On the web version, the 2200-T's Schedule 1 opens only once its manner of payment is ticked, as in BIR's app.
- On the web version, reopening a 2550-DS keeps item 22D as saved, as BIR's app does.
- Fixed: on the web version, ticking an item 4 choice on the 1701 hid the whole form.
- On the web version, the last schedules work: the 1602's Sections B and C (they open only when BIR's app allows), the 2552's transactions not subject to tax, the 1707-A's extra rows and its Read CSV File, the 1700's tax table, and the 1602-Q's schedule links. The 2552 and 1707-A save these rows the way BIR's app does.
- On the web version, BIR's "From item" and "To item" links go to the right page, and the second page of the 2551-Q, 1602-Q and 2200-AN now shows. A table's Add, Delete and More buttons open that table for editing.
- On the web version, a form's pop-ups open as in BIR's app: schedules, lists and sections show and close the same way, and OK copies your choice into the form.
- On the web version, the ATC lists work: Add ATC on the 1600, 1600-VT, 1600-PT, 1601-E, 1601-F, 1601-EQ and 1601-FQ, Schedule 1 on the 2550-M and 2550-Q, items 14 to 18 on the 2551 and 2553, and the ATC on the 0605, 1702-Q and 2000-OT. Picks past the rows on the page go under Other Selected ATC, as in BIR's app.
- The 0605 on the web version now asks for the Tax Type (item 8) and the ATC (item 6) and saves them, as BIR's app does.
- On a phone, the web version's home screen and help pages fit the screen at a readable size, with bigger menus and boxes. A form keeps BIR's page shrunk to fit, and a Zoom in button shows it at full size.
- On the web version, Help works: Help > a tax type > a form opens BIR's own help page for that form, from the home screen and from every form. A form asks first, as in BIR's app, since leaving it loses what you have not saved. For the few forms where BIR's package has no help page, it says so.
- The README (English, Filipino and Cebuano) now shows the web version up front, explains how filing works in the app and on the web, and has a clearer Support section. The release page no longer says the app can't file returns.

## v0.2.0 (16 November 2026)

- Sending to BIR (beta) is now on by default. When the app starts with an internet connection, it downloads BIR's official package once and keeps the two files sending needs. You can turn sending off in Go > Send Returns to BIR (beta). Your return is filed only when BIR's confirmation email arrives, so keep that email.
- On the web version, Validate now works as in BIR's app: when the return passes, its boxes lock and Edit, Print and Submit / Final Copy turn on. Edit opens the boxes again. Before, Edit stayed greyed out, so the "Click on Edit" message pointed at a button that did nothing.
- On the web version, Print and File > Print Preview now work. They show the form as BIR's app prints it, with the signature box and payment details, and File > Print sends it to your printer or a PDF. Forms that BIR prints on legal or A4 paper say so first, as in BIR's app.
- On the web version, Submit / Final Copy now makes BIR's final copy: the same locked file BIR's eBIRForms makes when there is no internet. A web page cannot send a return to BIR, so it then tells you how to file it: open it in the desktop app or BIR's Windows app and click Submit / Final Copy there, or print it. A final copy opens locked again later. Sending a final copy made on the web from BIR's app has not been tried end to end yet.
- The web version's home screen has a Go menu, as in the desktop app. Show Saved Returns says where your returns are kept. Send Returns to BIR explains that sending needs the desktop app or BIR's app.
- When a required box is empty, the message now names it in words ("Return Period Month is required") instead of by an internal name, and the cursor goes to that box.
- On the web version, profiles and returns that still have the old 3-digit branch code in their file name (000) can be updated to 5 digits (00000), so BIR's current eBIRForms lists them too. The home screen says how many there are and offers "Update to 5 digits". It asks first, renames each file, sets the branch code inside it to match, and never overwrites a file. A final copy is renamed only, so what you filed stays as it was.
- On the web version, a return added with "Add a savefile from eBIRForms" now shows in the list when its file name has a 3-digit branch code (000) and your profile has 5 digits (00000). Before, the list stayed empty.
- On the web version, adding a return that belongs to another taxpayer now tells you whose TIN it is. If no taxpayer is on screen yet, it shows that return's taxpayer.
- On the web version, a new "Saved profiles" list lets you pick a taxpayer instead of typing the TIN.
- On the web version, the home screen now says how many profiles and returns are stored, and tells you to use Chrome or Edge if your browser cannot use a folder (Brave, Firefox, Safari).
- On the web version, picking the "savefile" or "profile" folder itself is refused with a note to pick the folder that holds both.
- On the web version, boxes that BIR greys out on a new form start greyed out too, and open on the same choice as in BIR's app. For example, "No. of Installment" on 0605 opens only when you tick Installment.
- On the web version, BIR's pages now match BIR's app more closely: rows are as compact as in BIR's app (they were taller, so long forms ran further down the page), and choices BIR ticks on a new form, like "Amended Return? No", show ticked.
- On the web version with dark mode turned on, BIR's pages are readable again: labels are black and what you type shows in black on the white boxes, as in BIR's app. Before, the labels faded into the grey and typed text was white on white.

## v0.1.9 (14 November 2026)

- On the web version in Chrome or Edge, you can keep your profiles and returns in a folder on your computer instead of the browser: click "Use a folder on this computer" on the home screen and pick your eBIRForms folder. A folder that Google Drive or Dropbox syncs works too, and so does a copy of the Windows app's eBIRForms folder. What the browser already held is copied in, and nothing in the folder is overwritten.
- Sending to BIR copes better with a weak connection. It no longer waits forever on a line that went quiet, and it tries again by itself up to three times while nothing has been sent yet. If the line drops in the middle of sending, it tells you BIR may or may not have your return and to wait for BIR's email before sending again, instead of saying it was not sent.
- You can now support the project: Support > Donate in the app, a button on the web version's home screen, and a link in the README. It opens our Ko-fi page, which takes PayPal and cards.

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
