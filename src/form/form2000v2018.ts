// BIR Form 2000 (Monthly Documentary Stamp Tax Declaration / Return, TRAIN edition "2000v2018"), P3.
//   • Schedule 1 (tax due by document type): rows chkSchedule1Delete<i> / drpATCCode<i> / frm2000:sched1:txtTaxBase<i> /
//     txtTaxRate<i> / txtTaxDue<i>, indexed from 0 (BIR's blank form starts with 3). The tax due is BIR's per-ATC
//     rate engine (dst.ts `taxDue2000v2018`); Σ → frm2000:sched1:txtTotalDue1 → item 14.
//   • Schedule 2 (loose stamps bought), 3 (eDST payments), 4 (remittances): payment rows; Σ → 15B / 15C / 19. Item 13's
//     mode of affixture enables them (processModeAffixture): mode 1 (eDST) → Schedule 3, mode 2 (constructive /
//     loose stamps) → Schedules 2 + 4, mode 3 → Schedule 4. A disabled schedule's rows are blanked (date "", receipt
//     "", amount 0.00) and its total is 0 — on the reload too, so they are blanked here.
// Chain: 15D = 15A+15B+15C ; 16 (computeTax16) ; 17D = 17A+17B+17C ; 18 = 16 + 17D.
//
// BIR behaviours replicated because they change saved values:
//   • Item 16 for mode 2 is max(14 − (15A + 15B), 0); for modes 1 / 3 (or none) it is 14 − 15A − 15B − 15C, NEGATED
//     when positive ("ensure negative value for item 16 if needed"), i.e. −|14 − 15D|.
//   • 15A (eDST payments) is enabled only on an amended return, but processAmended never clears it, so whatever it
//     holds still counts in 15D / 16.
//   • js/string-util.js defines capital() twice; the second (no-argument) one wins, so the name fields' onblur
//     `capital(this)` upper-cases EVERY text input but txtEmail. The only such field a filer can reach is the other
//     party's name (items 11–12, live for creditor / debtor), so choosing one of those upper-cases the whole save.
//   • The DS106 / DS130–DS132 pop-up answers are single form-level fields (numOfDays, numOfMonths, numOfMonths131,
//     numOfMonths132): every row of that code shares them.
// BIR quirks NOT replicated (they don't change a correct save): the reload copies the FIRST `frm2000:modLabel` text
// into all four pop-up labels (allow-listed in the parity test); DS131/DS132's pop-up "Yes" throws.

import fieldJson from "./fields/2000v2018.json";
import { ATC_CHOICE_2000V2018, rateText2000v2018, taxDue2000v2018, type DstModal } from "./dst.ts";
import { formatMoney, parseMoney, type Centavo } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2000:";
const S1 = `${P}sched1:`;
type Read = (id: string) => string;
const m = (r: Read, id: string): Centavo => parseMoney(r(id));
const on = (r: Read, id: string): boolean => r(id) === "true";

/** Choosing creditor / debtor (item 10) opens items 11–12, whose blur runs BIR's capital() over every text input. */
const isUpperCased = (r: Read): boolean => on(r, `${P}optParty_1`) || on(r, `${P}optParty_2`);
const upper = (r: Read, v: string): string => (isUpperCased(r) ? v.toUpperCase() : v);

/** The pop-up answers, read from the form (they are ordinary saved fields). */
export const modal2000v2018 = (r: Read): DstModal => ({
  ds106_short_term: on(r, "ds106modYes"),
  day_count: r(`${P}numOfDays`) || "0",
  ds130_short_term: on(r, "ds130modYes"),
  month_count_130: r(`${P}numOfMonths`) || "0",
  month_count_131: r(`${P}numOfMonths131`) || "0",
  month_count_132: r(`${P}numOfMonths132`) || "0",
});

const atcOf = (r: Read): string => (r("drpATCCode") || "-").trim();
const engine = (r: Read) => taxDue2000v2018(atcOf(r), m(r, `${S1}txtTaxBase`), r(`${S1}txtTaxRate`), modal2000v2018(r));

export const SCHED1_2000V2018: GroupSpec = {
  name: "sched1",
  first_index: 0,
  row: [
    { id: "chkSchedule1Delete", kind: "checkbox", derive: () => "false" },
    { id: "drpATCCode", kind: "select", derive: (_r, v) => v.trim() || "-" },
    // DS130–DS132 range checks reset an out-of-range base to 0.00
    { id: `${S1}txtTaxBase`, kind: "money", derive: (r, v) => formatMoney(engine(r).tax_base ?? parseMoney(v)) },
    {
      id: `${S1}txtTaxRate`,
      kind: "text",
      // the rate text BIR writes when the ATC is picked, unless the row carries one (DS112's pre-need entry, or a
      // rate a filer typed where BIR enables the box); DS131's blur then rewrites it
      derive: (r, v) => upper(r, engine(r).rate_text ?? (v || rateText2000v2018(atcOf(r), false, modal2000v2018(r)))),
    },
    // the engine's figure; DS010 (typed) and the cases BIR leaves alone keep the cell's value
    { id: `${S1}txtTaxDue`, kind: "money", derive: (r, v) => formatMoney(engine(r).tax_due ?? parseMoney(v)) },
  ],
  total: { into: `${S1}txtTotalDue1`, of: `${S1}txtTaxDue` },
};

/** A payment schedule that item 13 enables; disabled, its rows are blanked like disableScheduleN does. */
const paymentSchedule = (n: 2 | 3 | 4, live: (r: Read) => boolean, cell: Array<[string, "text" | "money"]>, total: string, of: string): GroupSpec => ({
  name: `sched${n}`,
  first_index: 0,
  row: [
    { id: `chkSchedule${n}Delete`, kind: "checkbox", derive: () => "false" },
    ...cell.map(([stem, kind]): GroupSpec["row"][number] => ({
      id: `${P}sched${n}:${stem}`,
      kind,
      derive: (r, v) => (!live(r) ? (kind === "money" ? "0.00" : "") : kind === "money" ? formatMoney(parseMoney(v)) : upper(r, v)),
    })),
  ],
  total: { into: `${P}sched${n}:${total}`, of: `${P}sched${n}:${of}` },
});
const mode = (n: number) => (r: Read) => on(r, `${P}optMode_${n}`);
const PAYMENT: Array<[string, "text" | "money"]> = [["txtPaymentDate", "text"], ["txtReceipt", "text"], ["txtAmountPaid", "money"]];
export const SCHED2_2000V2018 = paymentSchedule(2, mode(2), PAYMENT, "txtTotalPayment1", "txtAmountPaid");
export const SCHED3_2000V2018 = paymentSchedule(3, mode(1), PAYMENT, "txtTotalPayment1", "txtAmountPaid");
export const SCHED4_2000V2018 = paymentSchedule(
  4,
  (r) => mode(2)(r) || mode(3)(r),
  [["txtRCOCode", "text"], ["txtRemittanceDate", "text"], ["txtBank", "text"], ["txtAmountRemitted", "money"], ["txtNumberFrom", "text"], ["txtNumberTo", "text"]],
  "txtTotalRemittance1",
  "txtAmountRemitted",
);

// ---- page 1 chain ----
const t = (r: Read, item: string): Centavo => m(r, `${P}txtTax${item}`);
const s15B = (r: Read) => m(r, `${P}sched2:txtTotalPayment1`);
const s15C = (r: Read) => m(r, `${P}sched3:txtTotalPayment1`);
const s15D = (r: Read) => t(r, "15A") + s15B(r) + s15C(r);
/** computeTax16. */
export const item16 = (r: Read): Centavo => {
  const due = m(r, `${S1}txtTotalDue1`);
  if (mode(2)(r)) return Math.max(due - (t(r, "15A") + s15B(r)), 0);
  const x = due - s15D(r);
  return x > 0 ? -x : x;
};
const s17D = (r: Read) => t(r, "17A") + t(r, "17B") + t(r, "17C");

/** Schedule rows (managed by the groups) and submission / eBIRForms-Online state (BIR's defaults stand). */
const ROW = /^(chkSchedule\dDelete\d+|drpATCCode\d+|frm2000:sched\d:txt(?!Total)\w+\d+)$/;
const DROP = new Set([
  "txtFinalFlag", "txtEnroll", "txtEmail", "driveSelectTPExport",
  "ebirOnlineConfirmUsername", "ebirOnlineConfirmPassword", "ebirOnlineUsername", "ebirOnlinePassword", "ebirOnlineSecret",
]);
const TOTAL = new Set([`${S1}txtTotalDue1`, `${P}sched2:txtTotalPayment1`, `${P}sched3:txtTotalPayment1`, `${P}sched4:txtTotalRemittance1`]);
const scalarField = (fieldJson as FieldJson[])
  .filter((f) => !DROP.has(f.id) && !ROW.test(f.id))
  .map((f) => (TOTAL.has(f.id) ? { ...f, kind: "money" as const } : f));

const c = (fn: (r: Read) => Centavo): Partial<FieldSpec> => ({ compute: fn });
const upperText: Record<string, Partial<FieldSpec>> = Object.fromEntries(
  // derive_default too: an unset text keeps BIR's default, but capital() upper-cases that as well (the pop-up labels)
  scalarField.filter((f) => f.kind === "text").map((f) => [f.id, { derive: (r: Read, v: string) => upper(r, v), ...(!f.escaped && { derive_default: upper }) }]),
);
/** Page 2's header repeats the TIN and name (loadBGData copies them from the profile). */
const copy = (from: string): Partial<FieldSpec> => ({ derive: (r, v) => upper(r, r(`${P}${from}`) || v) });

export const FORM_2000V2018 = buildSchema("2000v2018", "Monthly Documentary Stamp Tax Declaration / Return", scalarField, {
  ...upperText,
  [`${P}txtYear`]: { required: true },
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtTaxpayerName`]: { required: true, derive: (r, v) => upper(r, v) },
  [`${P}txtTax14`]: c((r) => m(r, `${S1}txtTotalDue1`)),
  [`${P}txtTax15B`]: c(s15B),
  [`${P}txtTax15C`]: c(s15C),
  [`${P}txtTax15D`]: c(s15D),
  [`${P}txtTax16`]: c(item16),
  [`${P}txtTax17D`]: c(s17D),
  [`${P}txtTax18`]: c((r) => item16(r) + s17D(r)),
  [`${P}txtTax19`]: c((r) => m(r, `${P}sched4:txtTotalRemittance1`)),
  [`${P}txtPg2TIN1`]: copy("txtTIN1"),
  [`${P}txtPg2TIN2`]: copy("txtTIN2"),
  [`${P}txtPg2TIN3`]: copy("txtTIN3"),
  [`${P}txtPg2BranchCode`]: copy("txtBranchCode"),
  [`${P}txtPg2TaxpayerName`]: copy("txtTaxpayerName"),
});
FORM_2000V2018.group = [SCHED1_2000V2018, SCHED2_2000V2018, SCHED3_2000V2018, SCHED4_2000V2018];

const DATE = /^\d{2}\/\d{2}\/\d{4}$/;

export function validate2000v2018(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2000V2018, state);
  const r: Read = (id) => state[id] ?? "";
  const tin = `${r(`${P}txtTIN1`)}${r(`${P}txtTIN2`)}${r(`${P}txtTIN3`)}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  if ((state[`${P}txtRDOCode`] ?? "000") === "000") problem.push({ id: `${P}txtRDOCode`, message: "Choose the RDO code (item 6)." });
  if ((state[`${P}txtMonth`] ?? "00") === "00") problem.push({ id: `${P}txtMonth`, message: "Choose the month (item 1)." });
  const year = parseInt(r(`${P}txtYear`), 10);
  if (year < 2018) problem.push({ id: `${P}txtYear`, message: "Returns before 2018 are filed on the old 2000 form." });
  if (![1, 2, 3].some((n) => on(r, `${P}optParty_${n}`))) problem.push({ id: `${P}optParty_1`, message: "Select an option in item 10." });
  if ((on(r, `${P}optParty_1`) || on(r, `${P}optParty_2`)) && !r(`${P}txtOtherTIN`).trim()) problem.push({ id: `${P}txtOtherTIN`, message: "Enter the other party's TIN (item 12)." });
  if (![1, 2, 3].some((n) => on(r, `${P}optMode_${n}`))) problem.push({ id: `${P}optMode_1`, message: "Select the mode of affixture (item 13)." });
  if (parseMoney(r(`${P}txtTax15A`)) !== 0 && !on(r, `${P}AmendedRtn_1`)) problem.push({ id: `${P}txtTax15A`, message: "Item 15A applies only to an amended return." });
  const modal = modal2000v2018(r);
  (groups.sched1 ?? []).forEach((row, i) => {
    const code = (row.drpATCCode ?? "-").trim() || "-";
    const base = parseMoney(row[`${S1}txtTaxBase`] ?? "");
    if (!ATC_CHOICE_2000V2018.includes(code)) problem.push({ id: `drpATCCode${i}`, message: `Schedule 1 row ${i + 1}: ${code} is not a DST ATC.` });
    const result = taxDue2000v2018(code, base, row[`${S1}txtTaxRate`] ?? "", modal);
    if (result.is_error) problem.push({ id: `drpATCCode${i}`, message: `Schedule 1 row ${i + 1}: BIR's form cannot compute DS125 (its code throws); its tax due stays 0.00.` });
    if (result.tax_base === 0) problem.push({ id: `${S1}txtTaxBase${i}`, message: `Schedule 1 row ${i + 1}: the tax base is outside ${code}'s range (BIR resets it to 0.00).` });
  });
  const checkDate = (name: string, stem: string, label: string) =>
    (groups[name] ?? []).forEach((row, i) => {
      if (!DATE.test((row[stem] ?? "").trim())) problem.push({ id: `${stem}${i}`, message: `${label} row ${i + 1}: enter the date (MM/DD/YYYY).` });
    });
  if (mode(2)(r)) checkDate("sched2", `${P}sched2:txtPaymentDate`, "Schedule 2");
  if (mode(1)(r)) checkDate("sched3", `${P}sched3:txtPaymentDate`, "Schedule 3");
  if (mode(2)(r) || mode(3)(r)) checkDate("sched4", `${P}sched4:txtRemittanceDate`, "Schedule 4");
  return problem;
}
