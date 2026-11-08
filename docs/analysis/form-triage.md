# Form rewrite-complexity triage

Working notes from rebuilding the forms. Every form is now rebuilt and 1:1; the method that came out of these
notes is in [../rewrite-playbook.md](../rewrite-playbook.md). Kept for the details of how each hard form works.

Classification of the legacy forms (`vendor/original/forms/BIR-Form<CODE>.hta`) by how hard a native P3
rewrite is, to pick the next targets in increasing-difficulty order. Buckets:

- **SCALAR**: compute graph reads only fixed field ids; no table. Easiest.
- **FIXED-SCHEDULE**: a schedule with a known, fixed number of rows (e.g. `Sched1Tax1..5`, `while(x<19)`).
- **DYNAMIC-SCHEDULE**: rows added at runtime (`insertRow`/`addRow`, modal ATC pickers). Harder.
- **RADIO-GATED**: the tax base or key values branch on a selected radio/option. Harder.

Signal: a `compute*` fn that sums a table whose rows come from a row-builder ⇒ dynamic; branches on `.checked` ⇒ radio-gated.

## Done (84): every one 1:1 with BIR's own form

0605 · 0619E · 0619F · 1601E · 1600WP · 1600 · 1601Cv2018 · 1601F · 1601EQ · 0620 · 1603Qv2018 · 2553 · 2551 · 1603 · 1604F · 2551Qv2018 · 1604C · 1604CF · 1704 · 2550DS · 2200ANv2018 · 1707A · 1707Av2021 · 2550DS-old · 1602 · 2000OT · 1604E · 2200Tv2020 · 1706 · 1606 · 1702Q · 1702Qv2008C · 1701Q · 1701A · 1621 · 1707 · 1800 · 1800v2018 · 2551M · 1601C · 2552 · 1602Qv2018 · 1601FQ · 1600PTv2018 · 1600VTv2018 · 1604Ev2018 · 1701Qv2018 · 1702EX · 1702EXv2018 · 1702EXv2018C · 1702Qv2018C · 1702RT · 1702RTv2018 · 1702RTv2018C · 1707v2018 · 1707v2021 · 1801 · 1801v2018 · 2000 · 2000OTv2018 · 2000v2018 · 2200A · 2200AN · 2200Av2020 · 2200M · 2200Mv2018 · 2200P · 2200Pv2020 · 2550M · 2550Q · 2550Qv2024 · 2552v2018 · 1700v2018 · 1701MS · 1701v2018 · 1702MX · 1702MXv2018 · 1702MXv2018C · 1702MXv2018Cxx · 2200S · 2200T (pre-2020) · 2200Cv2018 · 1701 · 1700

"1:1" is measured, not claimed: `test/parity.ts` saves a native fill, reopens it in BIR's form, lets BIR's code
recompute, and diffs the records (`EBF_PARITY=1` scoreboard, 84/84). The method is in `docs/rewrite-playbook.md`.
The only exceptions are ledgered in `test/parity.test.ts` with a reason: 4 keys where BIR's own reload changes
BIR's own save (1707A, 1702RT, 1702EX, 2000v2018) and 5 page errors BIR's own code throws (1800v2018, 1602Qv2018).

## Remaining (0)

All 84 forms are native and 1:1. 1701 v1 leaves out its add-more pop-ups and per-activity attachments (below).

### 1701: how the native form works (done; scoreboard 1321/1321, 0 page error)

No closed formula: ~140 mutually-calling enable / reset / compute functions whose result depends on click and
blur order. So the native form RUNS BIR's page script: `tool/port1701.mjs port` transpiles it into
`src/form/form1701-bir.ts` (generated, `@ts-nocheck`: 136 functions + 177 main-page inline handlers, free names →
fields of the sim) over a measured mini-DOM (`src/form/form1701-dom.ts` + the captured blank page
`src/form/page/1701.json`, written by `tool/port1701.mjs page` from `tool/port1701-capture.js` run in the oracle:
every input's type / name / class / maxlength / disabled / value / handlers / ancestors, table rows, handler text). `src/form/form1701-sim.ts` replays a
filer (controls clicked, text typed → onchange → onblur, twice), saves (`txtDisabledOnSave` / `txtEnabledOnSave`
built as `saveXML` does), then reopens on a fresh page (loadData, `disableEnableFieldsOnReload`, the onload amount
re-format, blur twice), the oracle harness's own sequence. The mini-DOM also replays `public/legacy-shim.js`'s
IE `getElementById` (name fallback: BIR asks for `rdoPg4Pt7I109CompensationATC`, a radio NAME; `""` → the first
unnamed element, `<HTA:APPLICATION id="Form1701">`, which is how `txtEnabledInputsOnValidation` comes out ",").
Not modelled (v1): the add-more modals (`txtCtrmodal*` stay 0, each schedule's fixed rows only) and the Part IX
per-activity attachments. Test: `test/form1701.test.ts` (compute + 6 oracle round trips, page 1 and every page).

### 1701 map (the 2013 layout, `frm1701:`, 1,321 template keys)

Measured in WebKit (blank reopen + clicked scenarios), not guessed:

- **Pages.** 12 main pages (`#Page<N>Content`) + 5 per-activity attachment page templates (`Page1m..5mTYPEContent`, ids
  suffixed `TYPE`, cloned to `EX<n>` / `SP<n>` by `addAttachment`) + 31 add-more modals (`txtCtrmodal*` counters).
  P1 items 1–40 (Part I 1–24, Part II 26–32 = totals pulled from P3, CTC 34–37, Part III payments 38–40) ·
  P2 Part IV 41–67 (`…C1` taxpayer / `…C2` spouse) · P3 Part V 68–85 + Part VI 86–94 (tax relief) ·
  P4 Part VII spouse 95–111, 7A dependents (4 rows), 7B address, Part VIII auditor 112–118 · P5 Sched 1 (employers,
  `rdoPg5Sc1I<n>Taxpayer/Spouse`), 2 (sales), 3 (other income), 4A · P6 Sched 4B/4C, 5, 6 start · P7 Sched 6 cont. ·
  P8 Sched 7, 8A/8B, 8A1/8B1 (NOLCO) · P9 Sched 9 (credits), 10 (balance sheet) · P10 Sched 11A/B (reconciliation) ·
  P11 Sched 12A/B (final-tax / exempt income) · P12 Part IX (per-regime consolidation from the attachments).
- **Money** is whole pesos: every compute writes `NegativeValue(formatCurrencyWOC(Math.round(x)))` ("1,234",
  negatives "(1,234)"). `saveXML` writes every maxlength-12/15 input BARE (commas stripped, "(1,234)" → "-1234"),
  like 1702EX, so `test/parity.ts` reads 1701 through the same transform (`SAVE_BARE`). Escaped: the three name
  parts, item 17 business, item 10 address.
- **The reload rebuilds no computation.** `loadData` re-adds modal rows from the counters and attachments from
  `txtAttachmentTypes`, loads every value, then `disableEnableFieldsOnReload` restores the ENABLED STATE from two
  saved keys, `txtDisabledOnSave` / `txtEnabledOnSave` (id lists `saveXML` builds from the live DOM). So the native
  save decides which inputs BIR's reopened form leaves live; the harness blurs exactly those.
- **What a page-1 blur recomputes.** Item 1's year blur runs `computeQualifiedDependents` → item 46 (25,000 per
  qualified dependent) and the whole chain `computePage2Part4` ×2 → `computePage3Part6` → `computePage3Part5` ×2 →
  `computePage1Part2` (26 = 72A+72B, 27 = 76A+76B, 28, 30, 32), plus `computeSchedule8A8B`, `computePg12Pt9I8`. So
  even the page-1 scoreboard checks the Part IV/V/VI chain.
- **Blur handlers** (inline `onblur`, pages 5–12): `setToZeroIfEmpty` then a schedule compute (`computePg5Sc2/3/4A`,
  `computePg6Sc4B/4C/5`, `summation('Page7Content,Page6Content', …)` + `moveValueToItem57` for Sched 6,
  `computePg8Sc7/8A/8B/8A1/8B1` + NOLCO validation, `computePg9Sc9/10`, `computePg10Sc11A`, Sched 12 summations),
  then the main chain. `summation(container, idSubstrings, out)` sums every `<input>` of the container whose id
  CONTAINS a substring, DOM order and container membership matter (measured per container).
- **Enabled state** (`disabledFields`, `disableATCTaxFiler/Spouse`, `methodOfDeductionsTriggers`): item 4 ATC
  (compensation / business / mixed), item 20 itemized / OSD (OSD disables Sched 4–8 of that column), civil status /
  item 15 / item 16 joint (spouse column `name="frm1701:Spouse"`), and row-by-row enabling (`enableNextRow`: a
  schedule's next row opens once the previous one is filled).

1700 (pre-2013 layout) is native and 1:1 (`src/form/form1700.ts`; scoreboard 311/311). Its own test also proves a joint
return with all eight modals populated (employer rows from item 4, item-12 OTHERS, page 3's A1-A4 and B1-B2), on the
reload and with every page shown and blurred. Two BIR defects, both reasoned in `test/form1700.test.ts`: the reload
resets a joint return's spouse branch code to 000 (ledgered), and after a reopen a blur on any page-3 Part I field
halves the B1/B2 rows' share of BI10 (the temp tables are cleared; live, the rows count twice and BI10 self-includes).
The temp → Repository modal copy needs IE's innerHTML value serialization; `fixIeLiveInnerHtmlCopy` (host + codec)
routes it through `window.__ebfLiveHtml` (legacy-shim).

`EBF_PARITY_STRICT` follow-up: done, 1707v2021 is fully equal under strict mode (143/143) after saving
`txtPg1P2I13AppTaxRate` as "0.00" on an installment sale (BIR's own round(this) blur rewrites "").

## Next targets: cleanest remaining (from the triage)

| rank | CODE | bucket | note |
|---|---|---|---|
| - | 1602Qv2018 | FIXED-SCHEDULE | **DONE** (`form1602qv2018.ts`): sched1/2/3 (amt×rate) → 14/15/16; 17–28 chain. The last clean fixed-schedule form; no remaining non-dynamic forms. Found a BIR bug: Sched1 rows 1–12 read their rate from empty `<font>` elements (`fntSched1TaxRate{i}` never populated) → the rate is undefined → `formatCurrency(NaN)` = 0.00; row 15 passes a literal as an element id. Only BSP rows 13–14 and Sched2/3 (editable rates) compute. Also an `OptTaxWithheld1=No` path zeros all schedules (gated). Oracle round-trip proven. |

The schema now supports **multi-condition (AND) gates** and **gate-over-compute** (`FieldSpec.gate` accepts an
array; a closed gate overrides `compute`). This unblocks the 11 RADIO-GATED forms, e.g. 2551Qv2018's 8%
option zeroes the whole return, and item 16 needs taxRate1 AND an amended return.

Honorable mentions: 1601C, 1600PTv2018 / 1600VTv2018.

**Formatter (resolved):** the **1707 family** uses `roundAmount`, which renders negatives as accounting
parentheses `(123.45)` (its `preciseCompute` already rounds to 2dp, so rounding matches `formatCurrency`).
Supported now via `formatMoneyParen` + `FormSchema.format` and `parseMoney`'s parentheses parsing, set
`FORM.format = formatMoneyParen` (see `form1707a.ts`). So 1707 and 1707v2018/v2021 are unblocked.

## Watch-outs

- **Variant clusters** share structure, rewriting a base form yields its `v2018`/`v2021`/`C`/`Cxx`
  variants cheaply: 1707A↔1707Av2021, the 1702MX cluster, the 1702EX cluster, 1702Q↔1702Qv2008C.
- **Zero-compute forms** (2200Cv2018, 2200Tv2020) have *no* `compute*` fns, verify there is truly no
  derived field before treating as pure data entry.
- **The hard tail** (DYNAMIC-SCHEDULE 40, RADIO-GATED 11): the big ITRs (1700/1701/1702 clusters, up to
  188 compute fns), VAT (2550 cluster), DST (2000 cluster), excise (2200 cluster), estate/donor
  (1800/1801). These need the dynamic-schedule GroupSpec and/or richer radio-gated compute modelling.

## Deep-probe findings (scoped for a focused effort, not safe one-turn ships)

- **1701A** (TRAIN self-employed/professional individual ITR): tractable `txt{N}A/B` fields (taxpayer/spouse),
  but **year-dependent dual graduated tables**: 2018–2022 rates (250–400k ×20% …) AND 2023+ rates (×15% …) are
  both coded in `computeTxt46`, branched at runtime; plus an 8% path (`txt56`), OSD, and an `addRow` credit
  schedule. `txt20 = optTaxRate_1 ? graduated(txt46) : 8%(txt56)`. Needs year-branch + both tables.
- **1700 / 1701 / 1701v2018 / 1702RT / 1702EX / 1702MX (and v2018/C variants)**: the big verbose ITRs -
  `Pg#Pt#I##…` field names, 30–188 compute fns, heavy dynamic schedules. Each is a dedicated multi-session RE job.
- **1702Q / 1702Qv2008C** (corporate quarterly ITR), **IMPLEMENTED** (`form1702q.ts`, shared `makeQ`). Notes kept
  for reference: ~20 scalar computes over A/B/C columns, no dynamic rows, two conditionals:
  - OSD vs itemized: radio `1702q:OptMethodDeduct_1` (note the **bare `1702q:` prefix**, not `frm1702q:`).
    Itemized → `22B = 20C − 21C` (21C entered); OSD → `21C = 20C × 0.4; 22B = 20C − 21C`.
  - MCIT: `29A = max(txt26B normal tax, txt28 MCIT)`; MCIT `txt28 = txtMinCorpIncomeTax = (txt1st+txt2nd+txt3rd quarter gross) × 2%` (a fixed 3-field Schedule 1, not dynamic).
  - Cross-column flow: `20B = 19A + 18B`, `20C = 19B + 18C`, `26A/B = 24A/B × 25A/B% ÷ 100`, `30 = 29C + 29D`,
    `32 = 30 − 31H`, `34 = 32 + 33D`. Replicate verbatim; the letters are the form's flow, not tax regimes.
- **1621** (quarterly WHT on decedent's deposit): single dynamic Schedule 1, now buildable with the extended
  GroupSpec (`row_compute` can read the form-level `txtTaxRate`; `{i}` id-template handles the middle-index
  `txtSched1_{i}_Withdrawn`/`_Withheld` naming). Remaining to resolve before building: (a) the rate semantics -
  `Withheld = Withdrawn × percentStringToFloat(txtTaxRate)` with a comment "0.06 = 6%", so confirm whether the
  field stores `0.06` or `6`, **RESOLVED:** `txtTaxRate` default is `"6.0 %"` and `percentStringToFloat` returns
  `num/100`, so `Withheld = Withdrawn × 6%`; (b) a left-in debug `alert()` in the compute loop (a BIR bug -
  harmless under the oracle's auto-accept but note it); (c) **the reload reconstruction is the open blocker** -
  loadData shows no visible Schedule-1 row-rebuild loop, marker count, or size field (only `addRow_TaxWithheld`,
  the UI add handler, and `count_TaxWithheld` incremented there). Needs an oracle probe of a real saved file to
  see whether/how the rows repaint before building (1601FQ-class reconstruction risk). Then the clean Part-2 chain:
  `Remittance_Tot = Remittance_1+2+Prev; StillDue = TaxWithheld − Remittance_Tot; Pen_Tot = Surcharge+Interest+Compromise;
  StillDue_tot = StillDue ≥ 0 ? StillDue + Pen_Tot : Pen_Tot` (penalty-offset quirk).
  But `txtTaxWithheld`/`txtTaxBase` come from a **DYNAMIC Schedule 1** (`txtSched1_{x}_Withdrawn/_Withheld`, rows via
  insertRow) where per-row `Withheld = Withdrawn × txtTaxRate%` and the rate is a **form-level** field, needs a
  row_compute that can read form state (a small GroupSpec extension) plus reload-reconstruction (1601FQ-class risk).

## Next-candidate deep probes (2026-10-17: after 1800v2018; scoped, NOT yet built)

Confirmed by scanning every remaining `.hta`: **the scalar / fixed-schedule / radio-gated-scalar tier is
exhausted at 38 done.** No cheap variant remains, each candidate below is a dedicated dynamic-schedule build.

- **2552** (percentage tax on shares / IPO), **DONE** (`form2552.ts`). The tax schedule `tblTaxTrans` (per-row
  `txtTaxDue = txtTaxableBase × selTaxRate/100`) buckets rows by rate (0.6/4/2/1) AND by a Primary/Secondary
  transaction radio into fixed cells `txtTaxDue12D / 13D / 13G / 13J / 14D / 14G / 14J` + base cells. This drove a
  reusable schema feature: **`GroupAgg.where`**: a row predicate (with form access) that restricts an aggregate's
  sum, so each rate bucket is a filtered total and the Primary/Secondary split is handled with `gate`. Chain
  `15 = Σ cells ; 16C = 16A+16B ; 17 = 15 − 16C ; 18D = 18A+18B+18C ; 19 = 17 + 18D`. On reload the legacy rebuilds
  tblTaxTrans (counting `txtTaxableBase`) and re-runs getTaxTrans, so the chain round-trips (oracle-proven).
  Part III (`tblTransaction`, non-tax) and the per-row detail modal are supplementary and not yet modelled.
- **2551M** (monthly percentage tax, 4129 lines), **DONE** (`form2551m.ts`). Two dynamic schedules: the ATC tax
  table (un-prefixed 1-indexed `txtTaxableAmount/txtTaxRate/txtTaxDue`, `txtTaxDue = base × rate/100` via
  `row_compute`, Σ → `txtTotalTaxDue`) reconstructed by counting `txtTaxableAmount`, the 1601EQ class, so its
  scalar total round-trips but the ATC grid repaints only from the AtcCode modal (documented caveat); and the
  tax-credit Schedule I (`frm2551m:`-prefixed 0-indexed, Σ `txtApplied` → `txt20A`) reconstructed cleanly by
  counting `txtPeriodCovered`. Scalar chain `21 = 20A+20B ; 22 = totalTaxDue − 21 ; 23D = penalties ;
  24 = 22 + 23D`. No 8%-option gate (that is a TRAIN-era 2551Q feature; 2551M predates it). Oracle-proven
  (credit schedule reconstructs, ATC total round-trips).
- **1601C** (monthly WHT on compensation, 4513 lines), **DONE** (`form1601c.ts`). A dynamic modal
  `tbllistSectionA` (reconstructed by counting `checkSectionADelete{i}` markers, 0-indexed, then loadData fills
  by id; per-row M/Y branch via `row_compute` routing `ShouldTaxDue − TaxPaid` into `TxtCurrentYear`/`TxtFromYearEnd`,
  combined into `txtDvTotalAmount7a7b` via two column aggregates summed) PLUS a fixed 3-row radio sub-section
  (`…Radio1..3`, each branched on `SelMonthYear{i}_1`) giving `summationTax7a`. `txtTax19 = 26 = summationTax7a
  + txtDvTotalAmount7a7b`; chain `17 = 15 − (16A+16B+16C) ; 20 = 18+19 ; 22 = 21A+21B ; 23 = 20−22 ;
  24D = 24A+24B+24C ; 25 = 23+24D`; amended gate on `txtTax21A`. Oracle-proven (modal reconstructs, chain round-trips).
- **1707v2018 / 1707v2021**: NOT cheap siblings of 1707: 7846 / 8076 lines (vs 1707's 5151), with Sched1/2/3/9,
  Part IV, tax-relief + treaty. Major multi-schedule ITR-class forms; each a dedicated multi-session job.
- **2000 / 2000v2018 / 2000OTv2018 (DST)**: AVOID as a quick target: the DST tax is a per-document-type **rate
  engine** (`computeSched1TaxDue` reads per-ATC `Sched1AtcBase/CompType/Constaxdue/Minimum/Maximum` metadata +
  per-code special cases like DS105) sourced from external ATC-reference XML, plus a Section A prior-payment
  schedule. Faithful modelling needs the ATC rate-reference data, a dedicated data-wiring effort, not a one-turn ship.
- **1600VTv2018 / 1600PTv2018** (VAT / percentage-tax withholding), the next honorable-mention targets but
  1601FQ-class: TWO ATC tables (`tblPartIIComputeTax` → `txtTaxbeWithHeld{i}` → txt14, and `tblPartIIOtherTax`
  → `txtTotalOtherTax`) feeding a verbose `txtPg1P2…` page-1 chain with a penalty-offset at item 27 (same quirk as
  1621). Note a BIR cross-form-reference bug: `txt16 = txt14 − frm1601E:txtTax15C` (a field from a *different* form,
  so it reads 0). A dedicated two-table build.

## Bucket totals (42 remaining)

**The scalar / fixed-schedule / radio-gated-scalar tier is EXHAUSTED at 34 done.** Every remaining form has
≥1 **dynamic (runtime add-row) schedule** and so needs the GroupSpec + FormView ScheduleTable treatment plus
per-form reload reconstruction (1601FQ-class risk), a dedicated effort each, not a safe one-turn autonomous ship:
- **1707**: two dynamic schedules reconstructed by **marker counting** (`chxSched1<i>`/`chxSched2<i>`, first_index 0,
  no size field, now supported via optional `GroupSpec.size_field`). Sched 1 → base (`txtTax = Σ txtSched1TaxableBase`),
  Sched 2 → `txtLess`; `netCap = base − less`; bracket `computeNetCap` is `>100k → (netCap−100k)×10% + 5000 ; else ×5%`.
  **BLOCKER:** the live tax-due path is ambiguous, `computeNetCap`'s caller is commented out (`//computeNetCap(...)`),
  and `txtTaxDue2 = txt17Total` via another path, plus a `TaxRelief_IS` treaty radio gates `txtTaxPayable`. Needs
  runtime tracing (or an oracle probe of a saved file) to confirm which path actually fires before modelling.
- **1800**: donor's tax (pre-TRAIN), **DONE** (`form1800.ts`): two dynamic schedules (stranger/relative), flat-30% + graduated.
- **1800v2018**: donor's tax (TRAIN), **DONE** (`form1800v2018.ts`): flat **6%** on net gifts above a ₱250,000
  annual exemption. THREE dynamic schedules reconstructed by **field-occurrence splitting** (`j % 2 != 0`, no
  checkbox marker): schedA personal-property FMV → PersonalProperties, schedB2 real-property FMV → RealProperties,
  schedB1 descriptive-only (no total). Two wrinkles handled: (a) deduction inputs carry `id=txtDeductionAmount28..32`
  but `name=DeductionAmt1..5`, legacy reads by name via IE's getElementById-name quirk, saveXML writes by id, so
  the keys are the ids; (b) compute targets are **out of DOM dependency order** (page-1 TotalNetGifts/DonorTaxDue
  depend on schedule-page inputs) so each compute derives from base inputs, not sibling computed fields.
  BIR defect replicated + flagged: the 250k exemption is subtracted with **no floor**, so sub-250k net gifts yield a
  negative tax due. Oracle-proven (schedule reconstruction + column-total round-trip).
- **1801** (estate tax), the largest form. **Fully mapped for a dedicated build:** 5 dynamic schedules
  (Sched1 real property, Sched1X, Sched2, Sched3, Sched4 deductions) each with **Exclusive/Conjugal** columns →
  10 column totals (`totalSch1AmountExc/Conj`, …). Feeds: `txt17 = Sched1`, `txt19 = Sched1X`, `txt18 = Sched2 + Sched3`
  (combined), `txt20 = Sched4`; `17C/18C/19C/20C = Exc + Conj`. Gross estate `txt21 = 17+18+19+20`; deductions
  `txt23..27`; net estate `txt28 = 23c − (24+25+26+27a+27b)`, `txt30 = 28 − 29`. Estate tax `txt31` is the pre-TRAIN
  graduated table (0 under 200k; 5% / 8%+15000 / 11%+135000 / 15%+465000 / 20%+1215000 at 500k/2M/5M/10M);
  `33 = 31 − 32C`; `35 = 33 + 34D`. Markers are **UPPERCASE** `chxSched1/1X/2/3/4` (unlike 1800's lowercase).
  Further complexity found: there is also a **Schedule 5** (`txtSc5TotalConjugal` → `txt22A` deductions), and the
  row field naming is **inconsistent across schedules** (`txtSched1…` vs `txtSch1…` vs `txtSc5…`), every
  schedule's row stems must be read individually. A focused multi-session job; do NOT one-shot (wrong estate return).
- **1707v2018 / 1707v2021**: share the `frm1707:` prefix with 1707 but mix 0.05/0.1 (old) and 0.15 (TRAIN) rates;
  the live rate path is ambiguous, needs an oracle probe like 1707's before building.
- **1601FQ**: **DONE** (`form1601fq.ts`). Probing the live legacy form corrected the earlier read. There are
  two Part II tables, not three dynamic ones, plus a STATIC Schedule I:
  - **Part II** (compute table + "other tax" table) shares ONE index space: getATCCode puts the first 6 checked picks
    in rows 1–6 and the rest in 7+ (`txtAtcCode/txtTaxBase/txtTaxRate/txtTaxbeWithHeld<i>`). Σ all → 20; Σ 7+ → `txtTotalOtherTax`.
  - The ATC picker serializes one `AtcCd<i>` checkbox per list entry, and the reload rebuilds Part II from those
    boxes. Without them the rows never come back (verified by a negative control). BIR's list keeps duplicate codes
    at different rates (private list: WC212 30%/25%, WI350 30%/20%), so the native save matches each row by
    (code, rate) to a list position. The list order comes from `src/form/atc-list.json` (legacy order, by substring
    filter and P/G category; `tool/atc-extract.mjs`). The new schema hook `FormSchema.extra_record` emits the boxes.
  - **Schedule I** (treaty / special law) is 5 static rows (0–4), live only when item 13 = Yes. `disableSelTreaty`
    zeroes them, so they are gated. Item 21 is derived from the row inputs because Schedule I sits after 21 in the DOM.
  - Chain `22 = 20+21 ; 26 = 23+24+25 ; 27 = 22−26 ; 31 = 28+29+30 ; 32 = 27+31`. Oracle-proven (both tables
    rebuilt, duplicate-code picks land at AtcCd30/33, Schedule I and the chain recompute on reload, 0 page errors).
  - **Caveat for other ATC forms:** `atc-codes.json` keeps the FIRST rate per code (`atcRate("WI350")` = 30), which
    is wrong wherever a form lists the same code at two rates. Forms with a positional picker need `atc-list.json`.
- **2550M / 2550Q / 2550Qv2024**: VAT: ~12 add-row sales/purchase ATC schedules + output−input chain.
- **2000 / 2000v2018 / 2000OTv2018**: DST: dynamic ATC rate-table (per-document-type rate/const/min/max switch).
- **2200A/M/P/S/T / 2200ANv2018-era old**: excise: dynamic per-commodity ATC schedules.
- **1700 / 1701 / 1701v2018 / 1702RT / 1702EX / 1702MX (+v2018/C)**: the big verbose ITRs (`Pg#Pt#I##`, dynamic).

Recommended approach for the dynamic tier: proven GroupSpec (1601F/1600WP/1600/1601EQ) handles a single ATC
schedule cleanly; multi-schedule + modal-reconstruction forms need a focused per-form session with oracle
verification of the reload path.

## ATC reference infrastructure (2026-10-18): the withholding-tier enabler

Built `tool/atc-extract.mjs` → `src/form/atc-codes.json` (488 codes) + `src/form/atc.ts` (`atcRate`/`atcInfo`/
`atcForForm`) + `test/atc.test.ts`. This is the shared rate source the ATC-schedule withholding forms auto-fill
from. With it, the blocker on 1601FQ / 1600VT / 1600PT / 2550 shifts from "where do the rates come from" (solved)
to "model the ATC-modal reconstruction" (the remaining per-form work). **DST (2000 family) is still separate** -
its ATC codes carry a human-readable `formula` (e.g. "P2.00/P200"), not a numeric rate, so it needs a dedicated
DST rate engine, not this table.

~~Next concrete build: 1601FQ~~ (done, see above). Earlier note, kept for history: **1601FQ**: Schedule I is a clean marker-reconstructed group (`chxSchedI`, user-entered
amount/rate → reqWithheld); the two Part II ATC tables now have their rates from `atcRate()`, leaving the
`getATCCode` modal reconstruction (<7 vs ≥7 checked → compute vs other table, row padding to 6) as the work.
