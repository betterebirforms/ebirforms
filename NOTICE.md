# Notice

The MIT License in `LICENSE` covers the code written for this project. It does not cover the material below.

## BIR material

These come from the Bureau of Internal Revenue's Offline eBIRForms Package and are works of the Government of the
Philippines:

- BIR's forms, form pages, artwork and reference data (`asset/bir/`, `src/form/template/`, `src/form/upper-case.json`,
  and the form pages bundled into the downloadable packages)
- the logic of BIR's form pages, which the native forms reproduce (for example `src/form/form1701-bir.ts`)
- the logo in `asset/brand/`, adapted from BIR's seal

Under Republic Act No. 8293 (Intellectual Property Code), Section 176.1, no copyright subsists in works of the
Government of the Philippines, but prior approval of the government agency is required for exploitation of such works
for profit. This project is free and non-commercial. If you reuse this material for profit, get BIR's approval first.

BIR's own programs (`BIRForms.exe`, its helpers and libraries) are not in this repository or in its packages.

## Not affiliated

eBIRForms is unofficial. It is not made, endorsed or supported by the Bureau of Internal Revenue. Check every return
before you file it; the filer is responsible for what is filed.

## Third-party software

The packages include open-source libraries (Tauri, React and others) under their own licenses, listed in
`package-lock.json` and `src-tauri/Cargo.lock`.
