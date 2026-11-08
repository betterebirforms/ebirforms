// BIR Form 2552 (Percentage Tax Return on sale/barter/exchange/IPO of shares through a local exchange), P3.
// One tax-computation schedule (tblTaxTrans, un-prefixed 1-indexed rows) where each transaction's tax is
// txtTaxDue = txtTaxableBase × selTaxRate/100. getTaxTrans() buckets the rows by rate AND by a Primary/Secondary
// transaction radio into fixed cells (replicated here with FILTERED group aggregates + gates):
//   rate 0.6% → 12D / 12B base  (IPO, always)
//   rate 4% / 2% / 1% → 13D/13G/13J (Primary) or 14D/14G/14J (Secondary), with matching base cells.
// Chain: 15 = 12D+13D+13G+13J+14D+14G+14J ; 16C = 16A+16B ; 17 = 15 − 16C ; 18D = 18A+18B+18C ; 19 = 17 + 18D.
// On reload the legacy rebuilds tblTaxTrans (counting txtTaxableBase occurrences) and re-runs getTaxTrans, so the
// bucket cells and the chain round-trip exactly.
// SCOPE: Part III (tblTransaction — transactions NOT subject to tax) and the per-row detail modal are
// supplementary, non-tax schedules and are not modelled here; the tax return itself is complete and oracle-proven.

import fieldJson from "./fields/2552.json";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormState, type GroupRow, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";

const P = "frm2552:";
type Read = (id: string) => string;
const m = (r: Read, id: string): number => parseMoney(r(`${P}${id}`));
const rateIs = (rate: string) => (row: GroupRow) => row.selTaxRate === rate;

export const TAXTRANS_2552: GroupSpec = {
  name: "taxTrans",
  first_index: 1, // tblTaxTrans data rows are 1-indexed (two structural rows bound the data range)
  row: [
    { id: "txtDate", kind: "text" },
    { id: "txtSeller", kind: "text" },
    { id: "txtBuyer", kind: "text" },
    { id: "txtIssuingCorp", kind: "text" },
    { id: "txtNumberShares", kind: "text" },
    { id: "txtTaxableBase", kind: "money" }, // the reload counts this occurrence
    { id: "selTaxRate", kind: "text" }, // "0.6" | "4" | "2" | "1"
    { id: "txtTaxDue", kind: "money", row_compute: (read) => parseMoney((parseMoney(read("txtTaxableBase")) / 100) * ((parseFloat(read("selTaxRate")) || 0) / 100)) },
  ],
  total: [
    { into: `${P}_r06due`, of: "txtTaxDue", where: rateIs("0.6") },
    { into: `${P}_r06base`, of: "txtTaxableBase", where: rateIs("0.6") },
    { into: `${P}_r4due`, of: "txtTaxDue", where: rateIs("4") },
    { into: `${P}_r4base`, of: "txtTaxableBase", where: rateIs("4") },
    { into: `${P}_r2due`, of: "txtTaxDue", where: rateIs("2") },
    { into: `${P}_r2base`, of: "txtTaxableBase", where: rateIs("2") },
    { into: `${P}_r1due`, of: "txtTaxDue", where: rateIs("1") },
    { into: `${P}_r1base`, of: "txtTaxableBase", where: rateIs("1") },
  ],
};

const primary = { on: `${P}OptTransaction1`, equals: "true" } as const;
const secondary = { on: `${P}OptTransaction2`, equals: "true" } as const;

const moneyField = new Set(
  ["txt15", "txt16A", "txt16B", "txt16C", "txt17", "txt18A", "txt18B", "txt18C", "txt18D", "txt19",
    "txtTaxDue12D", "txtTaxDue13D", "txtTaxDue13G", "txtTaxDue13J", "txtTaxDue14D", "txtTaxDue14G", "txtTaxDue14J",
    "txtTaxBase12B", "txtTaxBase13B", "txtTaxBase13E", "txtTaxBase13H", "txtTaxBase14B", "txtTaxBase14E", "txtTaxBase14H"].map((s) => `${P}${s}`),
);
const scalarField = (fieldJson as FieldJson[]).map((f) => (moneyField.has(f.id) ? { ...f, kind: "money" as const } : f));

const override: Record<string, Partial<FieldSpec>> = {
  [`${P}txtTIN1`]: { required: true },
  [`${P}txtTIN2`]: { required: true },
  [`${P}txtTIN3`]: { required: true },
  [`${P}txtBranchCode`]: { required: true },
  [`${P}txtRDOCode`]: { required: true },
  [`${P}txtNameStockBrocker`]: { required: true },
  [`${P}txtForYr`]: { required: true },
  // IPO (0.6%) bucket — always, independent of the transaction type
  [`${P}txtTaxDue12D`]: { kind: "money", compute: (r) => m(r, "_r06due") },
  [`${P}txtTaxBase12B`]: { kind: "money", compute: (r) => m(r, "_r06base") },
  // Primary transaction cells (gated on OptTransaction1)
  [`${P}txtTaxDue13D`]: { kind: "money", gate: primary, compute: (r) => m(r, "_r4due") },
  [`${P}txtTaxBase13B`]: { kind: "money", gate: primary, compute: (r) => m(r, "_r4base") },
  [`${P}txtTaxDue13G`]: { kind: "money", gate: primary, compute: (r) => m(r, "_r2due") },
  [`${P}txtTaxBase13E`]: { kind: "money", gate: primary, compute: (r) => m(r, "_r2base") },
  [`${P}txtTaxDue13J`]: { kind: "money", gate: primary, compute: (r) => m(r, "_r1due") },
  [`${P}txtTaxBase13H`]: { kind: "money", gate: primary, compute: (r) => m(r, "_r1base") },
  // Secondary transaction cells (gated on OptTransaction2)
  [`${P}txtTaxDue14D`]: { kind: "money", gate: secondary, compute: (r) => m(r, "_r4due") },
  [`${P}txtTaxBase14B`]: { kind: "money", gate: secondary, compute: (r) => m(r, "_r4base") },
  [`${P}txtTaxDue14G`]: { kind: "money", gate: secondary, compute: (r) => m(r, "_r2due") },
  [`${P}txtTaxBase14E`]: { kind: "money", gate: secondary, compute: (r) => m(r, "_r2base") },
  [`${P}txtTaxDue14J`]: { kind: "money", gate: secondary, compute: (r) => m(r, "_r1due") },
  [`${P}txtTaxBase14H`]: { kind: "money", gate: secondary, compute: (r) => m(r, "_r1base") },
  [`${P}txt15`]: {
    kind: "money",
    compute: (r) => m(r, "txtTaxDue12D") + m(r, "txtTaxDue13D") + m(r, "txtTaxDue13G") + m(r, "txtTaxDue13J") + m(r, "txtTaxDue14D") + m(r, "txtTaxDue14G") + m(r, "txtTaxDue14J"),
  },
  [`${P}txt16C`]: { kind: "money", compute: (r) => m(r, "txt16A") + m(r, "txt16B") },
  [`${P}txt17`]: { kind: "money", compute: (r) => m(r, "txt15") - m(r, "txt16C") },
  [`${P}txt18D`]: { kind: "money", compute: (r) => m(r, "txt18A") + m(r, "txt18B") + m(r, "txt18C") },
  [`${P}txt19`]: { kind: "money", compute: (r) => m(r, "txt17") + m(r, "txt18D") },
  // item 19's overpayment choice (refund / TCC / carry over) is live only while 19 is negative: computetxt17and19
  // unchecks all three otherwise
  ...Object.fromEntries([1, 2, 3].map((n) => [`${P}txt19ifoverpay:_${n}`, { gate: { when: (r: Read) => m(r, "txt19") < 0 } }])),
};

export const FORM_2552 = buildSchema("2552", "Percentage Tax Return — Shares of Stock / IPO", scalarField, override);
FORM_2552.group = [TAXTRANS_2552];
// each tblTaxTrans row's delete-selection checkbox, which saveXML writes (unchecked) along with the row
FORM_2552.extra_record = (_state, groups) =>
  (groups.taxTrans ?? []).map((_, i) => ({ key: `chkTaxTrans${TAXTRANS_2552.first_index + i}`, value: "false" }));

export function validate2552(state: FormState, groups: GroupState = {}): Problem[] {
  const problem = validateRequired(FORM_2552, state);
  // loadTaxRateValues: a row's rate list offers 6/10 of 1% only under 10A (LSE-traded, the "PayPenalties" box) and
  // 4 / 2 / 1% only under 10B (IPO primary / secondary). Any other rate reloads as no rate at all.
  const lse = state[`${P}PayPenalties`] === "true";
  const ipo = state[`${P}OptTransaction1`] === "true" || state[`${P}OptTransaction2`] === "true";
  (groups.taxTrans ?? []).forEach((row, i) => {
    const rate = row.selTaxRate ?? "";
    if (!((rate === "0.6" && lse) || (["4", "2", "1"].includes(rate) && ipo)))
      problem.push({ id: `selTaxRate${i + 1}`, message: `Row ${i + 1}: 6/10 of 1% needs item 10A; 4 / 2 / 1% need item 10B.` });
  });
  const tin = `${state[`${P}txtTIN1`] ?? ""}${state[`${P}txtTIN2`] ?? ""}${state[`${P}txtTIN3`] ?? ""}`;
  if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtTIN1`, message: "The TIN's check digit doesn't match." });
  return problem;
}
