<img src="asset/brand/logo.png" width="104" align="right" alt="">

# eBIRForms

BIR's **Offline eBIRForms Package**, rebuilt to run natively on macOS, Windows and Linux. Unofficial; not affiliated
with the BIR.

## Download

**[Latest release →](https://github.com/betterebirforms/ebirforms/releases/latest)**

| Your computer | File |
|---|---|
| Mac (Apple Silicon or Intel) | `Offline_eBIRForms_Package_v7.9.6.2.1_macOS_universal.dmg` |
| Windows 10 / 11 (64-bit) | `Offline_eBIRForms_Package_v7.9.6.2.1_Windows_x64_setup.exe` |
| Linux (64-bit) | `…_Linux_x86_64.AppImage` or `…_Linux_amd64.deb` |

## Compatibility

| | |
|---|---|
| BIR package | v7.9.6.2.1 (RMC No. 104-2026) — all 84 forms included, incl. 0605's MC350/MC351 and tax type MA |
| macOS | 12 Monterey or later |
| Windows | 10 or 11, 64-bit |
| Linux | Ubuntu 22.04 or later, or equivalent |
| Savefiles | Same format as BIR's Windows app; open them on either |
| Online Submit | Not in the download build |
| Status | Beta |

## Install

- **Mac:** open the `.dmg` and drag **eBIRForms** to Applications. On first launch macOS blocks it (not notarized):
  click **Done**, then **System Settings → Privacy & Security → Open Anyway**. (macOS 12–14: right-click → **Open**.)
- **Windows:** run the setup `.exe`. If SmartScreen appears, click **More info → Run anyway**.
- **Linux:** `chmod +x` the `.AppImage` and run it, or `sudo apt install ./…_amd64.deb`.

Then fill in your profile, pick a form, **Fill-up**, **Save** — same as BIR's app.

## Links

- Problems or questions: [Issues](https://github.com/betterebirforms/ebirforms/issues)
- What changed: [CHANGELOG.md](CHANGELOG.md)
- Building from source: [docs/development.md](docs/development.md)

BIR's forms are works of the Philippine Government (RA 8293 §176.1). The logo is inspired by, not copied from, BIR's seal.
