<p align="center">
  <img src="asset/brand/logo.png" width="128" alt="eBIRForms logo">
</p>

<h1 align="center">eBIRForms</h1>

<p align="center">
  Ang Offline eBIRForms Package ng BIR, ginawang muli para tumakbo nang native sa <b>macOS, Windows at Linux</b>.<br>
  Lahat ng 84 na tax form ng BIR, offline, at ang mga savefile ay nabubuksan din sa sariling app ng BIR.
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
  <a href="README.md">English</a> · <b>Filipino</b> · <a href="README.ceb.md">Cebuano</a>
</p>

<p align="center">
  <img src="asset/brand/device.webp" width="100%" alt="eBIRForms sa Mac, Windows PC at Linux laptop">
</p>

> Hindi opisyal. Walang kaugnayan sa, at hindi inendorso ng, Bureau of Internal Revenue (BIR).

## I-download

Kunin ang file para sa iyong computer sa **[pinakabagong release](https://github.com/betterebirforms/ebirforms/releases/latest)**.

| Iyong computer | File |
|---|---|
| Mac (Apple Silicon o Intel) | `Offline_eBIRForms_Package_v7.9.6.2.1_macOS_universal.dmg` |
| Windows 10 o 11 (64-bit) | `Offline_eBIRForms_Package_v7.9.6.2.1_Windows_x64_setup.exe` |
| Linux (64-bit) | `..._Linux_x86_64.AppImage` o `..._Linux_amd64.deb` |

## Compatibility

| Bahagi | Suportado |
|---|---|
| BIR package | v7.9.6.2.1 (BIR Revenue Memorandum Circular Blg. 104-2026): lahat ng 84 na form, kasama ang mga bagong code ng 0605 para sa micro taxpayers |
| macOS | 12 Monterey o mas bago |
| Windows | 10 o 11, 64-bit |
| Linux | Ubuntu 22.04 o mas bago, o katumbas |
| Mga savefile | Parehong format ng Windows app ng BIR, kaya nabubuksan ang file sa alinman |
| Online Submit | Wala sa download build. **Ang Submit ay nagla-lock at nagse-save lang ng return sa computer mo. Walang naipapadala sa BIR.** Para mag-file: i-print at i-file sa papel, o kopyahin ito (Go > Show Saved Returns) sa sariling eBIRForms app ng BIR sa Windows at i-submit doon |
| Updates | Tumitingin ang app ng bagong bersyon pagbukas (mula v0.1.2). **Updates > Check for Updates** para tumingin ngayon |
| Status | Beta |

## Pag-install

- **Mac:** buksan ang `.dmg` at i-drag ang **eBIRForms** sa Applications. Sa unang pagbukas, haharangin ito ng macOS
  dahil hindi pa notarized ang app. I-click ang **Done**, pumunta sa **System Settings > Privacy & Security**, at
  i-click ang **Open Anyway**, pagkatapos ang kulay-abong **Open Anyway** (hindi ang asul) at ang password ng Mac mo. Sa macOS 12 hanggang 14, i-right-click ang app at piliin ang **Open**.
- **Windows:** patakbuhin ang setup `.exe`. Kung lumabas ang SmartScreen, i-click ang **More info**, tapos
  **Run anyway**.
- **Linux:** gawing executable ang `.AppImage` (`chmod +x`) at patakbuhin ito, o i-install ang `.deb` gamit ang
  `sudo apt install ./..._amd64.deb`.

May mga larawan ng bawat hakbang sa [download page](https://github.com/betterebirforms/ebirforms/releases/latest).

Pagkatapos, punan ang iyong profile, pumili ng form, i-click ang **Fill-up**, at **Save**, gaya ng sa app ng BIR.

## Mga link

- Problema o tanong: [Issues](https://github.com/betterebirforms/ebirforms/issues)
- Mga pagbabago: [CHANGELOG.md](CHANGELOG.md)
- Tumulong sa pagbuo: [CONTRIBUTING.md](CONTRIBUTING.md) (setup, ayos ng repo, mga patakaran)
- Baguhin ang kilos ng isang form, o patayin ang aming mga ayos: [mods](mod/README.md), o **Go > Mods** sa app
- Hayaang mag-fill at mag-save ng draft ang isang AI agent (Claude, Codex): [docs/agent.md](docs/agent.md)
- Mga plano, kasama ang mobile at web: [ROADMAP.md](ROADMAP.md)
- Paano ito gumagana: [docs/architecture.md](docs/architecture.md)

Ang mga form ng BIR ay gawa ng Pamahalaan ng Pilipinas (ang Intellectual Property Code, RA 8293 §176.1). Ang logo ay hango sa selyo ng BIR.

Code: [MIT License](LICENSE). Hindi sakop nito ang mga form at artwork ng BIR; tingnan ang [NOTICE.md](NOTICE.md).
