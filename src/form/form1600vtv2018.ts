// BIR Form 1600-VT (Monthly Remittance Return of Value-Added Tax Withheld, v2018), P3 — and the shared builder
// `make1600T` for its twin 1600-PT (Other Percentage Taxes Withheld, form1600ptv2018.ts). The two HTAs carry the
// same script byte-for-byte apart from the form prefix, so one builder serves both.
//
//   • Part II (items 13–17 + "other selected ATC"): rows built at runtime by getATCCode from the ATC picker's
//     checked `AtcCode<i>` boxes, in pick-list order. With < 6 picks every row goes in the compute table (1–5,
//     padded to 5); with ≥ 6 the first 5 fill the compute table and the rest the hidden "other" table, whose
//     indices start at 6 (iCtr2 = otherTable.rows.length + 4) — ONE index space for both
//     (frm1600XX:txtAtcCd / txtPg1P2TaxBase / txtPg1P2TaxRate / txtPg1P2TaxWithheld<i>).
//     Per row getRequiredWithheld: withheld = base × rate ÷ 100. computeTotalOtherWithheldTax: Σ rows 6+ →
//     txtTotalOtherTax.
//   • pageOneComputation: 18 = Σ withheld 1–5 + other ; 21 = 19 + 20 ; 22 = 18 − 21 ; 26 = 23 + 24 + 25 ;
//     27 = 22 + 26 — EXCEPT (BIR quirk, replicated) when 22 < 0 and 26 > 0, 27 = 26: an overremittance is
//     dropped, not netted against the penalties.
//   • Schedule 1 (page 2): 5 static rows, pageTwoComputation: withheld = income payment × rate ÷ 100,
//     totTaxWithheldAndRemitted = Σ. It does NOT feed page 1.
//   • isAmended: item 19 is live only on an amended return (else reset to 0.00); availTaxRelief: 12A only when
//     item 12 = Yes (else "").
// BIR dead code, not replicated because it never runs: computeofTotalWithheldTax writes txtTax14 / txtTax16 from
// `frm1601E:txtTax15C` — a field of a DIFFERENT form, and none of those elements exist here; nothing calls it.
// Reload: loadData restores the radios (the category radio's onclick builds the picker), the AtcCode boxes, then
// getATCCode rebuilds that many rows and loadDataATCRow refills them by id. So a native save emits AtcCode<i> per
// pick-list entry (extra_record), matched on (code, rate) because 1600-PT lists WB080/WB082/WB084 twice (3% / 1%).

import { atcPickList, type AtcPick } from "./atc.ts";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import type { SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";
import fieldJson from "./fields/1600VTv2018.json";
import template from "./template/1600VTv2018.json";

type Read = (id: string) => string;
/** The compute table holds the first 5 picks; getATCCode routes the 6th onward to the "other" table. */
export const COMPUTE_ROW_COUNT = 5;
const SCHED_ROW = [1, 2, 3, 4, 5];
const rate = (s: string): number => parseFloat(String(s).replace(/,/g, "")) || 0;
const pct = (cents: number, r: string): number => Math.round((cents * rate(r)) / 100);

/** ATC category tags (atcCodes.xml field 4) in BIR's own file order for one form. loadATC keeps that order and
 *  getPrivate/GovernmentWithholdingAgentATC filter it to P|PG or G|PG. atc-list.json buckets entries by the raw tag
 *  (each bucket in file order), which loses the interleave — this restores it. Checked against the XML in tests. */
export type CategoryTag = "P" | "G" | "PG";

/** The ATC picker's list for an agent category ("P" private / "G" government), in BIR's order, duplicates kept. */
export function pickList1600T(form_code: string, order: CategoryTag[], category: "P" | "G" | ""): AtcPick[] {
  if (!category) return [];
  const bucket: Record<CategoryTag, AtcPick[]> = { P: atcPickList(form_code, "P"), G: atcPickList(form_code, "G"), PG: atcPickList(form_code, "PG") };
  const next: Record<CategoryTag, number> = { P: 0, G: 0, PG: 0 };
  const list: AtcPick[] = [];
  for (const tag of order) {
    const entry = bucket[tag][next[tag]++];
    if (entry && (tag === "PG" || tag === category)) list.push(entry);
  }
  return list;
}

export interface Form1600T {
  schema: FormSchema;
  /** The ATC list for this return's item-10 category (empty until a category is chosen). */
  pickList: (state: FormState) => AtcPick[];
  /** For each Part II row (compute then other), its 0-based pick-list position, or -1 if not on the list. */
  pickIndex: (state: FormState, groups: GroupState) => number[];
  validate: (state: FormState, groups?: GroupState) => Problem[];
}

/** Shared builder: `prefix` is BIR's element prefix ("frm1600VT:"), `order` the category interleave of its list. */
export function make1600T(form_code: string, title: string, prefix: string, json: FieldJson[], saved: Array<[string, string, string?]>, order: CategoryTag[]): Form1600T {
  const P = prefix;
  const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
  const category = (state: FormState): "P" | "G" | "" =>
    state[`${P}rdoPg1I10CategoryofWthholdAgentPriv`] === "true" ? "P" : state[`${P}rdoPg1I10CategoryofWthholdAgentGovt`] === "true" ? "G" : "";

  const partIIRow = (): GroupSpec["row"] => [
    { id: `${P}txtAtcCd`, kind: "text" },
    { id: `${P}txtPg1P2TaxBase`, kind: "money" },
    { id: `${P}txtPg1P2TaxRate`, kind: "text" }, // BIR's list rate string, e.g. "12.0"
    { id: `${P}txtPg1P2TaxWithheld`, kind: "money", row_compute: (read) => pct(parseMoney(read(`${P}txtPg1P2TaxBase`)), read(`${P}txtPg1P2TaxRate`)) },
  ];
  const computeGroup: GroupSpec = { name: "atc", first_index: 1, row: partIIRow(), total: { into: `${P}_tmpComputeTax`, of: `${P}txtPg1P2TaxWithheld` } };
  const otherGroup: GroupSpec = { name: "other", first_index: COMPUTE_ROW_COUNT + 1, row: partIIRow(), total: { into: `${P}txtTotalOtherTax`, of: `${P}txtPg1P2TaxWithheld` } };

  // keep only what BIR's saveXML writes (the regex scaffold also picks up commented-out and signatory inputs)
  const savedKey = new Set(saved.map(([key]) => key));
  const money = new Set([
    "txtTotalOtherTax", "txtPg1P2I18TotTaxWithheld", "txtPg1P2I19TaxRemittedInRtrn", "txtPg1P2I20OthrPymntsMade", "txtPg1P2I21TotTaxPymntsMade",
    "txtPg1P2I22TaxStillDueOverremit", "txtPg1P2I23Surcharge", "txtPg1P2I24Interest", "txtPg1P2I25Compromise", "txtPg1P2I26TotPenalties",
    "txtPg1P2I27TotAmtStillDueOverremit", "Pg2Sc1TotTxWthhldAndRmtted",
    ...SCHED_ROW.flatMap((i) => [`Pg2Sc1AmtOfIncPmt${i}`, `Pg2Sc1AmtOfTxWthhld${i}`]),
  ].map((id) => `${P}${id}`));
  // saveXML escape()s only the agent's name and the first address line (the scaffold also flags Address2 / Email)
  const escapedKey = new Set([`${P}txtPg1Pt1I7WithholdingAgentsName`, `${P}txtPg1Pt1I8RegisteredAddress`]);
  const scalar = json
    .filter((f) => savedKey.has(f.id))
    .map((f): FieldJson => ({ id: f.id, kind: money.has(f.id) ? "money" : f.kind, ...(escapedKey.has(f.id) ? { escaped: true } : {}), ...(f.secret ? { secret: true } : {}) }));

  // Schedule 1 (page 2). The rate stays text: BIR's checkRate resets a rate ≥ 100 to 0.00, which validate mirrors.
  const schedWithheld = (r: Read, i: number): number => pct(m(r, `Pg2Sc1AmtOfIncPmt${i}`), r(`${P}Pg2Sc1TaxRate${i}`));
  const schedOverride: Record<string, Partial<FieldSpec>> = Object.fromEntries(SCHED_ROW.map((i) => [`${P}Pg2Sc1AmtOfTxWthhld${i}`, { compute: (r: Read) => schedWithheld(r, i) }]));

  const amended = { on: `${P}rdoPg1I2AmendedYes`, equals: "true" };
  const schema = buildSchema(form_code, title, scalar, {
    [`${P}txtPg1I1Year`]: { required: true },
    [`${P}txtPg1TIN1`]: { required: true },
    [`${P}txtPg1TIN2`]: { required: true },
    [`${P}txtPg1TIN3`]: { required: true },
    [`${P}txtPg1TIN4`]: { required: true },
    [`${P}txtPg1I6RDO`]: { required: true },
    [`${P}txtPg1Pt1I7WithholdingAgentsName`]: { required: true },
    [`${P}txtPg1Pt1I8RegisteredAddress`]: { required: true },
    [`${P}txPg1I8ZipCode`]: { required: true },
    [`${P}txtPg1Pt1I9ContactNumber`]: { required: true },
    [`${P}txtPg1Pt1I12TaxReliefSpec`]: { gate: { on: `${P}rdoPg1I12TaxReliefYes`, equals: "true" } },
    [`${P}txtPg1P2I18TotTaxWithheld`]: { compute: (r) => m(r, "_tmpComputeTax") + m(r, "txtTotalOtherTax") },
    [`${P}txtPg1P2I19TaxRemittedInRtrn`]: { gate: amended },
    [`${P}txtPg1P2I21TotTaxPymntsMade`]: { compute: (r) => m(r, "txtPg1P2I19TaxRemittedInRtrn") + m(r, "txtPg1P2I20OthrPymntsMade") },
    [`${P}txtPg1P2I22TaxStillDueOverremit`]: { compute: (r) => m(r, "txtPg1P2I18TotTaxWithheld") - m(r, "txtPg1P2I21TotTaxPymntsMade") },
    [`${P}txtPg1P2I26TotPenalties`]: { compute: (r) => m(r, "txtPg1P2I23Surcharge") + m(r, "txtPg1P2I24Interest") + m(r, "txtPg1P2I25Compromise") },
    [`${P}txtPg1P2I27TotAmtStillDueOverremit`]: {
      compute: (r) => {
        const due = m(r, "txtPg1P2I22TaxStillDueOverremit");
        const penalty = m(r, "txtPg1P2I26TotPenalties");
        return due < 0 && penalty > 0 ? penalty : due + penalty; // BIR quirk: overremittance dropped when penalised
      },
    },
    ...schedOverride,
    [`${P}Pg2Sc1TotTxWthhldAndRmtted`]: { compute: (r) => SCHED_ROW.reduce((s, i) => s + schedWithheld(r, i), 0) },
  });
  schema.group = [computeGroup, otherGroup];

  const pickList = (state: FormState) => pickList1600T(form_code, order, category(state));
  const pickIndex = (state: FormState, groups: GroupState): number[] => {
    const list = pickList(state);
    const used = new Set<number>();
    const row: GroupRow[] = [...(groups.atc ?? []), ...(groups.other ?? [])];
    return row.map((r) => {
      const code = (r[`${P}txtAtcCd`] ?? "").trim();
      const want = rate(r[`${P}txtPg1P2TaxRate`] ?? "");
      const free = (j: number) => !used.has(j) && list[j]!.atc_code === code;
      let j = list.findIndex((e, k) => free(k) && rate(e.rate) === want);
      if (j < 0) j = list.findIndex((_, k) => free(k));
      if (j >= 0) used.add(j);
      return j;
    });
  };
  // one AtcCode<i> checkbox per pick-list entry, checked for the entries the Part II rows came from
  schema.extra_record = (state, groups): SaveRecord[] => {
    const picked = new Set(pickIndex(state, groups));
    return pickList(state).map((_, j) => ({ key: `AtcCode${j + 1}`, value: String(picked.has(j)) }));
  };

  const validate = (state: FormState, groups: GroupState = {}): Problem[] => {
    const problem = validateRequired(schema, state);
    const tin = `${state[`${P}txtPg1TIN1`] ?? ""}${state[`${P}txtPg1TIN2`] ?? ""}${state[`${P}txtPg1TIN3`] ?? ""}`;
    if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1TIN1`, message: "The TIN's check digit doesn't match." });
    if (state[`${P}txtPg1I1Month`] === "00" || !state[`${P}txtPg1I1Month`]) problem.push({ id: `${P}txtPg1I1Month`, message: "Select the month (item 1)." });
    // without a category BIR builds no picker, and its reload (getATCCode) then drops every Part II row
    if (!category(state)) problem.push({ id: `${P}rdoPg1I10CategoryofWthholdAgentPriv`, message: "Select the category of withholding agent (item 10)." });
    if (state[`${P}rdoPg1I12TaxReliefYes`] === "true" && !(state[`${P}txtPg1Pt1I12TaxReliefSpec`] ?? "").trim()) {
      problem.push({ id: `${P}txtPg1Pt1I12TaxReliefSpec`, message: "Specify the tax relief (item 12A)." });
    }
    const row = [...(groups.atc ?? []), ...(groups.other ?? [])];
    if (row.length > 0 && state[`${P}rdoPg1I3TaxWithheldYes`] !== "true") problem.push({ id: `${P}rdoPg1I3TaxWithheldYes`, message: "Part II ATC rows need item 3 (any taxes withheld) = Yes." });
    if (state[`${P}rdoPg1I3TaxWithheldYes`] === "true" && row.length === 0) problem.push({ id: `${P}txtAtcCd1`, message: "Fill up Part II when item 3 is Yes." });
    // the legacy only opens the "other" table once the compute table is full; earlier rows would be lost on reload
    if ((groups.other ?? []).length > 0 && (groups.atc ?? []).length < COMPUTE_ROW_COUNT) {
      problem.push({ id: `${P}txtTotalOtherTax`, message: `Fill all ${COMPUTE_ROW_COUNT} Part II rows before adding other ATCs.` });
    }
    pickIndex(state, groups).forEach((j, k) => {
      if (j < 0) problem.push({ id: `${P}txtAtcCd${k + 1}`, message: `ATC in Part II row ${k + 1} is not on this return's ATC list (or is listed twice).` });
    });
    row.forEach((r, k) => {
      if (parseMoney(r[`${P}txtPg1P2TaxBase`] ?? "") === 0) problem.push({ id: `${P}txtPg1P2TaxBase${k + 1}`, message: `Enter the tax base for ${r[`${P}txtAtcCd`] ?? "row " + (k + 1)}.` });
    });
    for (const i of SCHED_ROW) {
      if (rate(state[`${P}Pg2Sc1TaxRate${i}`] ?? "") >= 100) problem.push({ id: `${P}Pg2Sc1TaxRate${i}`, message: "Tax rate should be below 100." });
    }
    return problem;
  };

  return { schema, pickList, pickIndex, validate };
}

// atcCodes.xml order for 1600VTv2018: WV010 WV020 (G), WV110…WV024 (PG ×8), WV080 (P), WV090 (G), WV100 (PG)
export const ORDER_1600VT: CategoryTag[] = ["G", "G", "PG", "PG", "PG", "PG", "PG", "PG", "PG", "PG", "P", "G", "PG"];
export const F1600VT = make1600T("1600VTv2018", "Monthly Remittance of VAT Withheld", "frm1600VT:", fieldJson as FieldJson[], template as Array<[string, string, string?]>, ORDER_1600VT);
export const FORM_1600VTV2018 = F1600VT.schema;
export const validate1600VTv2018 = (state: FormState, groups: GroupState = {}): Problem[] => F1600VT.validate(state, groups);

/** The NativeForm label / prefill maps, shared by both entries (prefix differs). */
export function entryShape(P: string) {
  const label: Record<string, string> = {
    [`${P}txtPg1I1Month`]: "1 — Month (MM)", [`${P}txtPg1I1Year`]: "1 — Year (YY)",
    [`${P}rdoPg1I2AmendedYes`]: "2 — Amended return: Yes", [`${P}rdoPg1I2AmendedNo`]: "2 — Amended return: No",
    [`${P}rdoPg1I3TaxWithheldYes`]: "3 — Any taxes withheld: Yes", [`${P}rdoPg1I3TaxWithheldNo`]: "3 — Any taxes withheld: No",
    [`${P}txtPg1I4NoOfSheets`]: "4 — No. of sheets attached",
    [`${P}txtPg1TIN1`]: "5 — TIN", [`${P}txtPg1TIN4`]: "5 — Branch code", [`${P}txtPg1I6RDO`]: "6 — RDO code",
    [`${P}txtPg1Pt1I7WithholdingAgentsName`]: "7 — Withholding agent's name", [`${P}txtPg1Pt1I8RegisteredAddress`]: "8 — Registered address",
    [`${P}txPg1I8ZipCode`]: "8A — ZIP", [`${P}txtPg1Pt1I9ContactNumber`]: "9 — Contact number",
    [`${P}rdoPg1I10CategoryofWthholdAgentPriv`]: "10 — Private", [`${P}rdoPg1I10CategoryofWthholdAgentGovt`]: "10 — Government",
    [`${P}txtPg1Pt1I11Email`]: "11 — Email",
    [`${P}rdoPg1I12TaxReliefYes`]: "12 — Tax relief: Yes", [`${P}rdoPg1I12TaxReliefNo`]: "12 — Tax relief: No", [`${P}txtPg1Pt1I12TaxReliefSpec`]: "12A — Specify",
    [`${P}txtAtcCd`]: "ATC", [`${P}txtPg1P2TaxBase`]: "Tax base", [`${P}txtPg1P2TaxRate`]: "Rate %", [`${P}txtPg1P2TaxWithheld`]: "Tax withheld",
    [`${P}txtTotalOtherTax`]: "Other selected ATC (rows 6+)",
    [`${P}txtPg1P2I18TotTaxWithheld`]: "18 — Total taxes withheld", [`${P}txtPg1P2I19TaxRemittedInRtrn`]: "19 — Remitted in return previously filed",
    [`${P}txtPg1P2I20OthrPymntsMade`]: "20 — Other payments made", [`${P}txtPg1P2I21TotTaxPymntsMade`]: "21 — Total tax payments made",
    [`${P}txtPg1P2I22TaxStillDueOverremit`]: "22 — Tax still due / (overremittance)", [`${P}txtPg1P2I23Surcharge`]: "23 — Surcharge",
    [`${P}txtPg1P2I24Interest`]: "24 — Interest", [`${P}txtPg1P2I25Compromise`]: "25 — Compromise", [`${P}txtPg1P2I26TotPenalties`]: "26 — Total penalties",
    [`${P}txtPg1P2I27TotAmtStillDueOverremit`]: "27 — Total amount still due / (overremittance)",
    [`${P}Pg2Sc1TotTxWthhldAndRmtted`]: "Schedule 1 — Total taxes withheld and remitted",
  };
  const prefill = {
    [`${P}txtPg1TIN1`]: "tin1", [`${P}txtPg1TIN2`]: "tin2", [`${P}txtPg1TIN3`]: "tin3", [`${P}txtPg1TIN4`]: "tin4",
    // page 2's header TIN / name mirror page 1 (loadBGData fills every TIN<n> by name; init copies the name to RegName).
    // No email: loadData always overwrites item 11 with the profile's email (globalEmail), whatever the file says.
    [`${P}txtPg2TinC1`]: "tin1", [`${P}txtPg2TinC2`]: "tin2", [`${P}txtPg2TinC3`]: "tin3", [`${P}txtPg2TinC4`]: "tin4",
    [`${P}txtPg1I6RDO`]: "rdo", [`${P}rdoPg1Pt1I6RDO`]: "rdo", [`${P}txtPg1Pt1I7WithholdingAgentsName`]: "fn", [`${P}txtPg2RegisteredName`]: "fn",
    [`${P}txtPg1Pt1I8RegisteredAddress`]: "regAddr", [`${P}txPg1I8ZipCode`]: "zip", [`${P}txtPg1Pt1I9ContactNumber`]: "telNo", [`${P}txtLOB`]: "lob",
  } as const;
  const periodName = (s: FormState) => `${s[`${P}txtPg1I1Month`] ?? ""}20${s[`${P}txtPg1I1Year`] ?? ""}`;
  return { label, prefill, periodName };
}
