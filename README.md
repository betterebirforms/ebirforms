<p align="center">
  <img src="asset/brand/logo.png" width="128" alt="eBIRForms logo">
</p>

<h1 align="center">eBIRForms</h1>

<p align="center">
  BIR's Offline eBIRForms Package, rebuilt to run natively on <b>macOS, Windows and Linux</b>.<br>
  All 84 BIR tax forms, offline, with savefiles that open in BIR's own app.
</p>

<p align="center">
  <a href="https://github.com/betterebirforms/ebirforms/releases/latest"><img src="https://img.shields.io/badge/download-latest-1F4FB8" alt="Download"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-14286B" alt="Platforms: macOS, Windows, Linux">
  <img src="https://img.shields.io/badge/BIR%20package-v7.9.6.2.1-C8102E" alt="BIR package v7.9.6.2.1">
  <img src="https://img.shields.io/badge/forms-84-F4B400" alt="84 forms">
  <img src="https://img.shields.io/badge/status-beta-555" alt="Status: beta">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2EA44F" alt="License: MIT"></a>
</p>

<p align="center">
  <b>English</b> · <a href="README.fil.md">Filipino</a> · <a href="README.ceb.md">Cebuano</a>
</p>

<p align="center">
  <img src="asset/brand/device.webp" width="100%" alt="eBIRForms on a Mac, a Windows PC and a Linux laptop">
</p>

> Unofficial. Not affiliated with or endorsed by the Bureau of Internal Revenue (BIR).

## Download

Get the file for your computer from the **[latest release](https://github.com/betterebirforms/ebirforms/releases/latest)**.

| Your computer | File |
|---|---|
| Mac (Apple Silicon or Intel) | `Offline_eBIRForms_Package_v7.9.6.2.1_macOS_universal.dmg` |
| Windows 10 or 11 (64-bit) | `Offline_eBIRForms_Package_v7.9.6.2.1_Windows_x64_setup.exe` |
| Linux (64-bit) | `..._Linux_x86_64.AppImage` or `..._Linux_amd64.deb` |

## Compatibility

| Item | Supported |
|---|---|
| BIR package | v7.9.6.2.1 (BIR Revenue Memorandum Circular No. 104-2026): all 84 forms, including the new 0605 codes for micro taxpayers |
| macOS | 12 Monterey or later |
| Windows | 10 or 11, 64-bit |
| Linux | Ubuntu 22.04 or later, or equivalent |
| Savefiles | Same format as BIR's Windows app, so a file opens in either |
| Online Submit (sending the return to BIR from inside the app) | Not in the download build |
| Status | Beta |

## Install

- **Mac:** open the `.dmg` and drag **eBIRForms** to Applications. The first time you open it, macOS blocks it
  because the app is not notarized. Click **Done**, then go to **System Settings > Privacy & Security** and click
  **Open Anyway**. On macOS 12 to 14, right-click the app and choose **Open** instead.
- **Windows:** run the setup `.exe`. If SmartScreen appears, click **More info**, then **Run anyway**.
- **Linux:** make the `.AppImage` executable (`chmod +x`) and run it, or install the `.deb` with
  `sudo apt install ./..._amd64.deb`.

Then fill in your profile, pick a form, click **Fill-up**, and **Save**, the same as in BIR's app.

## Links

- Problems or questions: [Issues](https://github.com/betterebirforms/ebirforms/issues)
- What changed: [CHANGELOG.md](CHANGELOG.md)
- Help build it: [CONTRIBUTING.md](CONTRIBUTING.md) (setup, how the repo is laid out, the rules)
- Change how a form behaves, or switch our fixes off: [mods](mod/README.md)
- What's planned, including mobile and web: [ROADMAP.md](ROADMAP.md)
- How it works: [docs/architecture.md](docs/architecture.md)

BIR's forms are works of the Philippine Government (the Intellectual Property Code, RA 8293 §176.1). The logo is adapted from BIR's seal.

Code: [MIT License](LICENSE). BIR's forms and artwork are not covered by it; see [NOTICE.md](NOTICE.md).
