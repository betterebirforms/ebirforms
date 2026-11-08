# Rewriting a BIR form 1:1

How to rewrite one legacy form natively so it is **1:1** with BIR's own form, and how that is proven.

## What 1:1 means (the bar)

A native rewrite is 1:1 when a native fill, saved and reopened in BIR's own form (`vendor/original/forms/
BIR-Form<CODE>.hta`, served by the oracle in WebKit), then recomputed by BIR's own code (every live input
blurred, as a user tabbing through), yields **the same savefile records the native form wrote**. That means every
key BIR's `saveXML` writes and every value, with money compared to the centavo. `test/parity.ts` measures it:

```ts
const r = await parityCheck(oracle, FORM_X, state, "84653210700000-X-parity.xml", groups);
expect(parityProblem(r /*, allow */)).toEqual([]);
```

- `EBF_PARITY=1 npx vitest run test/parity.test.ts` scores every registered native form with a seeded random fill
  and empty schedules → `bench/result/parity.json`. `EBF_PARITY=<CODE>` scores one form.
- That random fill doesn't populate schedules, so each form's own test must ALSO run `parityCheck` with populated
  schedule rows and realistic codes, and assert `parityProblem(...)` is empty.
- `allow` is for a key whose difference is deliberate or a harness artifact, never for a bug. Each allowed key needs
  a one-line reason in the test. Example: blurring a date field fires a BIR validation that rewrites it.
- Where BIR's OWN reload changes BIR's OWN save, keep BIR's save format and add the key to the `BIR_DEFECT` ledger
  in `test/parity.test.ts`; a page error BIR's own code throws goes in `BIR_PAGE_ERROR` (exact message). Both are
  counted separately on the scoreboard, never as equal.
- `parityCheck` blurs only the visible page. For hidden pages, pop-ups and modal OK buttons use `test/parity-page.ts`
  (shows hidden pages, optional pre-click) or reveal them and call BIR's own compute/OK functions in the test, as
  `test/form1801v2018.test.ts` does.
- `EBF_PARITY_STRICT=1` also separates an empty box from `0.00` (BIR's Validate treats `0.00` as filled in).

## The machinery you get for free

- **Save template** (`src/form/template/<CODE>.json`, all 84 captured by `EBF_CAPTURE=1 npx vitest run
  test/capture-template.test.ts`): BIR's blank-form save, with every key in DOM order, its default, and each radio's group
  name. `formRecords` overlays native values onto it. Unset fields keep BIR's default. Scalar keys BIR never saves
  are dropped. Schedule rows and `extra_record` output past the template are appended. Choosing one radio unchecks
  its siblings. So you do NOT hand-model padding rows, `j_id*`, `responsetext`, or the empty eBIRForms-Online fields.
- **Field list**: `node tool/form-fields.mjs <CODE> --json > src/form/fields/<CODE>.json`, a regex scaffold.
  The template is the authority on which keys exist.
- **Schema** (`src/form/schema.ts`): `FieldSpec` (`compute`, `gate`, `required`, `escaped`, `secret`), `GroupSpec`
  (dynamic rows: `row` sub-fields with `row_compute`, `size_field`, `first_index`, `total`/`GroupAgg.where`, `{i}`
  id templates), `FormSchema.extra_record` (derived records, e.g. 1601FQ's `AtcCd<i>` picker boxes), `format`
  (`formatMoneyParen` for the 1707 family). `computeAll` runs ONE pass in field (DOM) order. A compute that reads
  a field later in the DOM must derive from that field's inputs (see 1601FQ item 21, 1800v2018).
- **ATC lists**: `atcPickList(form, "P"|"G")` gives BIR's own picker order with duplicates kept, for every form code
  in BIR's table (`tool/atc-extract.mjs`). Check the form's own `loadATC` `indexOf` string: BIR matches by substring,
  so 1601E's list also carries every 1601EQ record. `atcRate()` keeps only the FIRST rate per code, so don't use it
  where a form lists one code at two rates.
- **Upper-casing** (`src/form/upper-case.json`, measured by `EBF_CAPTURE_UPPER`): per form, `"all"` (BIR's
  `capital` sweep — string-util.js declares it twice and the no-argument one wins) or the exact ids a
  `capitalize(this)` blur upper-cases. Applied automatically on save; don't hand-model it.
- **WebKit vs IE7 compat** lives outside the forms: `public/legacy-shim.js` gives every form JScript's
  `Date#getYear` and argument-less `Number#toLocaleString`; per-form serve-time fixes (IE `childNodes` counts,
  case-insensitive `<DIV>` matches, table-cell `value`) go in BOTH `host/form-patch.ts` and
  `src-tauri/src/codec.rs` with a Rust test, so the packaged app serves the same page as the dev host.
- **Registering**: add `src/form/entry/<CODE>.ts` that default-exports the `NativeForm` (schema, validate, label,
  periodName, prefill). Do not edit `registry.ts`. Vitest's `fsModuleCache` is off on purpose: it cached
  `registry.ts` with its entry glob pre-expanded, which hid new forms.

## Method that works

1. Read the legacy form: `compute*`, `loadData`/`loadXML` (what the reload rebuilds and from which keys),
   `saveXML`, the radio `onclick`s that zero fields, and BIR's own bugs. **Replicate BIR's bugs** where they change saved
   values (the server checks BIR's arithmetic), and name them in a comment.
2. When the code is ambiguous, drive the real form instead of guessing. Load it in WebKit, click and fill, call its
   functions, read the DOM or its save. See the 1601FQ entry in `docs/analysis/form-triage.md`.
3. Write `src/form/form<code>.ts` + `test/form<code>.test.ts`: compute unit tests, an oracle round-trip, and a
   populated-schedule `parityCheck` that is 1:1.
4. `npm run gate` must exit 0 (`npm run gate:rust` too if `codec.rs` changed).

Parallel rewrites run in git worktrees: symlink `vendor/` and `node_modules/` from the main checkout (both are in
`.git/info/exclude`), merge the integration branch before the final gate, and run one vitest process at a time.

Superseded editions (`superseded_by` in `src/lib/catalog.ts`) are held to the same bar. Users reopen old returns in them.
