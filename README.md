<img src="asset/brand/avatar.png" width="96" align="right" alt="">

# eBIRForms for macOS

BIR's **Offline eBIRForms Package**, rebuilt to run natively on a Mac. Unofficial; not affiliated with the BIR.

## Download

**[Latest release →](https://github.com/betterebirforms/ebirforms/releases/latest)** — `Offline_eBIRForms_Package_v7.9.6.2.1_macOS_universal.dmg`

## Compatibility

| | |
|---|---|
| macOS | 12 Monterey or later |
| Mac | Apple Silicon and Intel (one universal app) |
| BIR package | v7.9.6.2 / 7.9.6.2.1 — all 84 forms, already included |
| Savefiles | Same format as eBIRForms on Windows; open them on either |
| Online Submit | Not in the download build |
| Status | Beta |

## Install

1. Open the `.dmg` and drag **eBIRForms** to Applications.
2. Open it. macOS blocks the first launch because the app isn't notarized: click **Done**, then go to
   **System Settings → Privacy & Security** and click **Open Anyway**.
   (macOS 12–14: right-click the app → **Open** instead.)
3. Fill in your profile, pick a form, **Fill-up**, **Save** — same as on Windows.

Your returns are saved in `~/Library/Application Support/ph.advo.ebirforms/data/savefile/`.

## Links

- Problems or questions: [Issues](https://github.com/betterebirforms/ebirforms/issues)
- What changed: [CHANGELOG.md](CHANGELOG.md)
- Building from source: [docs/development.md](docs/development.md)

BIR's forms and artwork are works of the Philippine Government (RA 8293 §176.1). The rest is original work.
