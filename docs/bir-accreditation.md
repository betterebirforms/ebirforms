# BIR accreditation — the plan

STATE doc: replace in place as steps land. Started 2026-11-07, after the r/taxPH post drew TOSA warnings.

## Two tracks

| Track | What | Who publishes | Docs |
|---|---|---|---|
| **A — BIR adopts the Mac version** | Offer the macOS build + source to BIR free; BIR reviews, signs and publishes it next to the Windows package | BIR | `bir/proposal.md`, `bir/rdo-email.md` |
| **B — TSP certification** | Certify a filing solution under RMO 8-2019 (ebirforms, or later PhilForms as its own applicant) | the TSP | below, `bir/letter-of-intent.md` |

A comes first: it is what Mac users asked for, and BIR being the publisher removes the TOSA problem. The proposal
names B as the fallback. PhilForms stays separate and is mentioned once, as a future TSP applicant.

## The route for track B: eTSPCert under RMO 8-2019

BIR certifies third-party filing software through the **Electronic Tax Software Provider Certification
(eTSPCert) System**, governed by **RMO No. 8-2019** (Dec 11, 2018) and announced in **RMC No. 98-2018**.
Taxpayers who file through a certified Tax Software Provider (TSP) "are considered compliant with the mandate
to use the eBIRForms" (RMC 98-2018). Certified TSPs are named in BIR's own filing circulars; RMC 34-2025
Annex B lists eTax PH, Anantaks and TaxWhizPH; RMC 020-2026 Annex A (2026-03-16) lists 11, incl. Taxumo and
JuanTax (16 forms). Uncertified competitor in the same lane: RaketTax (prepare-only; its bookkeepers file via
eBIRForms). Blueprint: `brainstorm/ebirforms-web/`.

| Fact | Source |
|---|---|
| Who may apply: an individual or non-individual TSP **registered with BIR** | RMO 8-2019 §V.2 |
| What is certified: the **output**, as XML in BIR's file structures, **per BIR form** | §V.8, §V.9 |
| How: enrol in eTSPCert → application → BIR issues the **TSP Tool** + **SFTP credentials** → submit test XML; **90 days** to finish | §VI.1–3 |
| Documents (individual): **Sworn Application (Annex D)** + **Non-Disclosure Agreement (Annex E)** | §VI.2.1 |
| Documents (corporation): the same + **Board Resolution** naming up to 3 officers | §VI.2.1, §V.6 |
| BIR checks the applicant's **own eFiling/ePayment compliance** for the latest taxable year | §VI.2.2.iii |
| Must **partner with an Authorized Agent Bank (AAB)** and accept BIR's TSP **TOSA** | §V.4 (§V.11 for ePayment) |
| Must comply with the **Data Privacy Act (RA 10173)**; liable for breaches | §V.13, §V.14 |
| After certification: notify BIR within **30 days** of any upgrade; re-test within **60 days** of a new eBIRForms version; submit a **client list** | §V.16–19 |
| Revocable for misrepresentation, TOSA violations, or not re-testing | §V.18 |
| Reviewers: Collection Programs Division (Collection Service) for documents; Taxpayer Service Systems Division (ISPMS) for testing | §VI.2.2, §VI.3.2 |
| Last application window: **Oct 16–30, 2026** — closed; next window not announced | BIR advisory, seen only as a search snippet of a CPA firm's 2026-05-28 Facebook repost — **verify with BIR** |
| General contact: (02) 8538-3200, contact_us@bir.gov.ph | bir.gov.ph/contactus |

## What this means for ebirforms

The certified route **replaces** the parts of ebirforms that the TOSA warnings are about. Under eTSPCert BIR
issues the TSP its own SFTP login and its own TSP Tool, so nothing needs to come out of BIR's binaries.

| Today | Under certification |
|---|---|
| Submit asks BIR's eBIRForms dispatcher and decrypts the login from the user's `ebfSFTP.exe` (`dispatch.rs`, `host.rs` `dispatch_op` / `send_op`) | **Remove from any build that leaves this machine.** BIR-issued TSP credentials + TSP Tool instead |
| Final copies encrypted with the passphrase read from `Encrypt.exe` (`crypto.rs`) | The TSP Tool does "loading, validation, preparing, encrypting, compressing and submitting" (§IV.12) |
| BIR's own pages, patched at serve time (`public/legacy-shim.js`, `host/form-patch.ts`, `codec.rs`) | Not what gets certified. The **82 native 1:1 forms** (`src/form/`) are the product; the output becomes BIR's XML |
| eBIRForms savefile format | BIR's per-form **XML file structure** (downloaded from eTSPCert / ebirforms.bir.gov.ph per the 2013 TSP job aid) |
| Personal project, no entity | A **BIR-registered TSP**: Mar as an individual, or the PhilForms entity |

Open unknowns — ask BIR, do not guess:
1. Does the **TSP Tool** run on macOS, or is it Windows-only like eBIRForms?
2. Is the **AAB partnership** (§V.4) required for e-filing-only certification, or only with ePayment (§V.11)?
3. Which forms are open for certification today (**Annex A**), and is 1701Q / 2551Q / 1701A / 0605 among them?
4. When is the **next application window**?
5. Will BIR accept a **source-code review** and a private security disclosure alongside the application?

## Steps

| # | Step | Owner | State |
|---|---|---|---|
| 1 | Stop distribution: no downloads, no beta, post edited to "not released" | Mar | in progress (Reddit edit drafted) |
| 2 | Pull the dispatcher / `ebfSFTP.exe` / `Encrypt.exe` paths out of any shareable build (feature flag or branch) | code | **done 2026-11-08**: `npm run build:share`, `npm run check:share`, `npm run bundle:review` (ROADMAP P4) |
| 3 | Decide the applicant: individual TSP (Mar's TIN, needs a business registration covering software services) or PhilForms as a non-individual TSP (can name 3 representatives) | Mar + Ateneo | not started |
| 4 | Make sure the applicant's **own** returns are e-filed and paid for the latest taxable year (§VI.2.2.iii) | Mar | **checked 2026-11-08**: registered as a sole proprietor (RDO 039, COR OCN dated 2026-10-13), **8% option**, so no 2551Q (COR reminder 4) and no 0605 registration fee (RA 11976, RMC 14-2024). Nothing is due yet: no Q4 1701Q; the first return is the **TY2026 1701A, due 2027-04-15** (Oct 13 – Dec 31 income). A draft is saved in the desktop app (8%, ATC II015; validates clean, opens in BIR's 1701A page with 0 errors; not a final copy, not filed) — gross sales still to enter. TY2025: EO 98 TIN only, no business returns due. Also due: register books of accounts before that first deadline |
| 5 | Ateneo legal office: TOSA exposure from the reverse-engineering so far, Data Privacy Act posture, NDA review | Mar | not started |
| 6 | Track A: send `bir/proposal.md` to the National Office (contact_us@bir.gov.ph + printed letter to the Commissioner) and `bir/rdo-email.md` to your own RDO + 2–3 others | Mar | **National Office: sent 2026-11-07 22:34 +0800** to contact_us@bir.gov.ph with the PDF; BIR auto-ack ticket **20261107_00563_E** (22:35). RDO emails: not sent — send ~2026-11-21 if no reply, quoting the ticket. **Checked 2026-11-08:** only the auto-ack so far |
| 6b | Track B: send the letter of intent (`bir/letter-of-intent.md`) if BIR points to TSP certification instead | Mar | drafted, not sent |
| 7 | Privately disclose the security findings to BIR — never publicly | Mar | drafted: `bir/private/security-disclosure.md` (gitignored); defect report `bir/defect-report.md`; both sent only when BIR asks |
| 8 | Enrol in eTSPCert when the window opens; file Annex D + Annex E (+ Board Resolution) | Mar | waiting on window |
| 9 | Build the XML exporter for the first forms from the native schemas; pass BIR's TSP Tool tests within 90 days | code | adapter slot built 2026-11-08 (`src/form/export.ts` `TSP_LAYOUT`, refuses until filled); the savefile adapter matches BIR's names on 82/82 forms; layouts blocked: per BIR's TSP job aid (2013, pp. 16, 37–42) the XML schema + Data Layout Guide download only after a TSP login, the account is activated at the RDO (TSP application form, BIR registration, fee), and the instructions for appending the certification code arrive by email after a successful Test Forms upload. Needs steps 3 and 8 first |
| 10 | Pick an AAB partner if required (answer to unknown 2) | Mar | blocked |

## Reddit thread (r/taxPH 1xpx665)

All 32 comments reviewed (2026-11-07): `bir/reddit-feedback.md`. They back both tracks: pitch it to BIR (3 people), get eTSP certified (2), and an endorsed version is what people wait for.
