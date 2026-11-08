// BIR Form 1707 (Capital Gains Tax Return for Onerous Transfer of Shares of Stock Not Traded Through the Local
// Stock Exchange), the TRAIN editions — v2018 (January 2018, superseded) and v2021 (April 2021). The two HTAs
// carry the same script apart from the differences listed below, so one builder serves both (`make1707T`).
//
//   • Page 1: date of transaction (1), amended (2), ATC individual / corporation (3) — a corporation must also pick
//     domestic / foreign in a pop-up (`rdoCorpo*`, cleared when the individual ATC is clicked), sellers (6) and
//     buyers (7) as dynamic tables (`frm1707:txtPg1I6Seller{Name,Addr,TIN}<i>`, 0-based, 3 rows in the blank form,
//     "Add Seller" appends more; the reload rebuilds them by splitting the file on the key stem), tax relief (8),
//     and the description of the transaction (9): cash / installment / foreclosure / others.
//   • Part IV (page 2): Schedule 1 (installment sale: 9 items, live only for an installment sale), Schedule 2
//     (shares sold: 4 rows, live otherwise) and Schedule 3 (allowable expenses: 4 rows, live otherwise). When all
//     4 rows of Schedule 2 / 3 are full, "Add More" opens a pop-up whose first row is row 4 and that holds the
//     overflow (`frm1707:txtPg2Pt4S2_<n>Col1..4` / `txtPg2Pt4S3_<n>Col1..2`); row 4 then reads "OTHERS" and
//     carries the pop-up subtotal. Modelled as the groups `sched2more` / `sched3more` (= rows 4…N).
//   • pageOneComputation: 10 = Sched 2 total ; 11 = Sched 3 total ; 12 = 10 − 11 ;
//     13 (tax due, cash / foreclosure [/ others]) = 12 × rate, "0" when 12 < 0 ;
//     14 (installment) = Sched 1 item 7 = item 5 × item 6 ÷ 100 ; 16 = (14 or 13) − 15 ; 17D = 17A+17B+17C ;
//     18 = 16 + 17D — EXCEPT (BIR quirk, kept) 18 = 17D when 16 < 0 and 17D > 0.
//
// Edition differences (both replicated):
//   v2018: every result goes through `.toFixed(0)` — BIR's 2018 1707 rounds every computed amount (and each step of
//          the Schedule 2/3 running totals) to whole pesos. The rate is hard-coded: 15%, but 5% / 10% (FLAT on the
//          whole net gain, not a bracket — BIR bug) for a foreign corporation at ≤ / > ₱100,000; "Others" forces
//          13 to 0.00. Schedule 1 item 6 (rate) is typed by the user. The row-1 tax base input's id is
//          `txtPg2P4Sch2TaxBaseSellPrice1:test` (BIR typo; saveXML writes the id, so that is the savefile key).
//   v2021: `.toFixed(2)`; item 13 is a read-only applicable-rate field forced to 15.00 (and Sched 1 item 6 to 15.00
//          on an installment sale, "" otherwise), and "Others" is now taxed too. Schedule 2 shares use
//          roundSharesNum ("1,234.000"). BIR bug: row 1's shares input is `type="number"`, which saveXML skips, so
//          that value is never saved (the template has no key for it) and the reopened form leaves rows 2–4 locked.
//
// Reload (loadData): radios / values by id, then isAmended (15 reset unless amended), availTaxRelief (8A reset
// unless Yes) and transactionType (Sched 1 reset unless installment, else Sched 2 + 3 reset). Before that it adds
// `Pg2Pt4S2PopLength` / `Pg2Pt4S3PopLength` pop-up rows so their `txtPg2Pt4S2_<n>Col*` values load by id, and
// loadToArray re-reads them; row 4's "OTHERS" + subtotal are plain fields. Oracle-proven, pop-ups included.

import { fixed, numWithComma as nwc } from "./bir-arith.ts";
import { parseMoney } from "./money.ts";
import { buildSchema, validate as validateRequired, type FieldJson, type FieldSpec, type FormSchema, type FormState, type GroupSpec, type GroupState, type Problem } from "./schema.ts";
import type { SaveRecord } from "@/lib/savefile.ts";
import { TinStatus, validateTin } from "@/lib/tin.ts";
import fieldJson from "./fields/1707v2018.json";
import template from "./template/1707v2018.json";

export const P = "frm1707:";
type Read = (id: string) => string;
export type Edition = "2018" | "2021";
const ROW = [1, 2, 3, 4];

const upper = (_r: Read, v: string): string => v.trim().toUpperCase(); // capitalize(this) on blur

/** roundSharesNum (v2021): "1234.5" → "1,234.500"; a non-number other than "OTHERS" → "0.000". */
export function roundShares(value: string): string {
  const num = value.replace(/\$|,/g, "");
  const int = num.indexOf(".") > 0 ? num.split(".")[0]! : num;
  if (int.length > 12) return "0.000";
  if (isNaN(Number(num))) return num === "OTHERS" ? value : "0.000";
  return parseFloat(num).toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export interface Form1707T {
  schema: FormSchema;
  validate: (state: FormState, groups?: GroupState) => Problem[];
  /** BIR's own pageOneComputation chain from the raw inputs, as the strings BIR leaves in each field. */
  chain: (r: Read) => Record<string, string>;
}

export function make1707T(form_code: string, edition: Edition, json: FieldJson[], saved: Array<[string, string, string?]>): Form1707T {
  const v2021 = edition === "2021";
  const fix = v2021 ? 2 : 0;
  const base1 = v2021 ? `${P}txtPg2P4Sch2TaxBaseSellPrice1` : "txtPg2P4Sch2TaxBaseSellPrice1:test";
  const taxBase = (i: number) => (i === 1 ? base1 : `${P}txtPg2P4Sch2TaxBaseSellPrice${i}`);
  const is = (r: Read, id: string) => r(`${P}${id}`) === "true";
  const inst = (r: Read) => is(r, "rdoPg1I9TransDescInstallment");
  const amount = (r: Read, id: string) => r(id) || "0.00"; // round(this) leaves "0.00" in an emptied amount
  const s2more = (r: Read) => parseMoney(r(`${P}_s2moreBase`)) > 0;
  const s3more = (r: Read) => parseMoney(r(`${P}_s3moreBase`)) > 0;
  const subTotal = (agg: string) => fixed(nwc(agg || "0.00"), fix); // Sum_Pg2Pt4S2/S3: formatCurrency(total.toFixed)
  const rate1 = (r: Read): string => {
    if (!inst(r)) return v2021 ? "" : "0.00";
    if (v2021) return "15.00";
    const v = amount(r, `${P}txtPg2P4Sch1I6ApplcRate`);
    return nwc(v) >= 100 ? "0.00" : v; // checkRate: a rate ≥ 100 resets to 0.00
  };

  const chain = (r: Read): Record<string, string> => {
    const out: Record<string, string> = {};
    const installment = inst(r);
    const cash = is(r, "rdoPg1I9TransDescCash");
    const foreclosure = is(r, "rdoPg1I9TransDescForeclosure");
    const others = is(r, "rdoPg1I9TransDescOthers");
    // Schedule 1 item 7
    const i5 = installment ? amount(r, `${P}txtPg2P4Sch1I5InstallmentAmt`) : "0.00";
    out.i7 = fixed(nwc(i5) * 1 * nwc(rate1(r)) / 100, fix);
    // Schedule 2 / 3 running totals (pageTwoSched2Comp / 3Comp: each step through toFixed)
    let t2 = "0.00";
    let t3 = "0.00";
    for (const i of ROW) {
      const b2 = installment ? "0.00" : i === 4 && s2more(r) ? subTotal(r(`${P}_s2moreBase`)) : amount(r, taxBase(i));
      const b3 = installment ? "0.00" : i === 4 && s3more(r) ? subTotal(r(`${P}_s3moreBase`)) : amount(r, `${P}txtPg2P4Sch3Amount${i}`);
      t2 = fixed(nwc(t2) * 1 + nwc(b2) * 1, fix);
      t3 = fixed(nwc(t3) * 1 + nwc(b3) * 1, fix);
    }
    out.t2 = t2;
    out.t3 = t3;
    out.i10 = fixed(nwc(t2) * 1, fix);
    out.i11 = fixed(nwc(t3) * 1, fix);
    out.i12 = fixed(nwc(out.i10) * 1 - nwc(out.i11) * 1, fix);
    let i13 = "0.00";
    let i14 = "0.00";
    if (cash || foreclosure || (v2021 && others)) {
      const net = nwc(out.i12);
      let rate = v2021 ? Number(v2021Rate(r)) / 100 : 0.15;
      if (!v2021 && is(r, "rdoPg1I3ATCCorp") && is(r, "rdoCorpoForeign")) rate = net <= 100000 ? 0.05 : 0.1;
      i13 = fixed(net * rate, fix);
      if (net * 1 < 0) i13 = "0"; // BIR assigns the number 0, so the field reads "0", not "0.00"
      i14 = "0.00";
    }
    if (installment) {
      i14 = fixed(nwc(out.i7) * 1, fix);
      i13 = "0.00";
    }
    if (others) {
      if (!v2021) i13 = "0.00";
      i14 = "0.00";
    }
    out.i13 = i13;
    out.i14 = i14;
    const i15 = is(r, "rdoPg1I2AmendedYes") ? amount(r, `${P}txtPg1P2I15TaxPaidInPrevRtrn`) : "0.00";
    out.i16 = fixed(nwc(installment ? i14 : i13) * 1 - nwc(i15) * 1, fix);
    const pen = (id: string) => nwc(amount(r, `${P}txtPg1P2I17${id}`)) * 1;
    out.i17 = fixed(pen("Surcharge") + pen("Interest") + pen("Compromise"), fix);
    out.i18 = nwc(out.i17) > 0 && nwc(out.i16) < 0 ? fixed(nwc(out.i17) * 1, fix) : fixed(nwc(out.i16) * 1 + nwc(out.i17) * 1, fix);
    return out;
  };
  // v2021 item 13 rate: transactionType forces 15.00 (read-only) unless installment
  const v2021Rate = (r: Read): string => (inst(r) ? "" : "15.00");
  const fromChain = (key: string): Partial<FieldSpec> => ({ kind: "money", compute: (r) => parseMoney(chain(r)[key]!), derive: (r, v) => (chain(r)[key] === "0" ? "0" : v) });

  // keep only what BIR's saveXML writes; the seller / buyer rows and the pop-up bookkeeping are modelled apart
  const savedKey = new Set(saved.map(([key]) => key));
  const apart = /^(chk(Seller|Buyer)Delete\d+|frm1707:txtPg1I[67](Seller|Buyer)(Name|Addr|TIN)\d+|Pg2Pt4S[23](SubTotal|PopLength))$/;
  const money = new Set([
    ...["I10TaxBase", "I11AllowExpnse", "I12NetCptalChnged", "I13TaxDueForTrans", "I14TaxDuePmtPriod", "I15TaxPaidInPrevRtrn", "I16TaxPayable",
      "I17Surcharge", "I17Interest", "I17Compromise", "I17TotPenalties", "I18TotAmtPyable"].map((s) => `${P}txtPg1P2${s}`),
    ...["I1SellPrice", "I2CostExpense", "I3AssumMortgage", "I5InstallmentAmt", "I7PeriodTaxDue", "I9TotCollection", ...(v2021 ? [] : ["I6ApplcRate"])].map((s) => `${P}txtPg2P4Sch1${s}`),
    ...ROW.flatMap((i) => [taxBase(i), `${P}txtPg2P4Sch3Amount${i}`, ...(v2021 ? [] : [`${P}txtPg2P4Sch2NoOfShares${i}`])]),
    `${P}txtPg2P4Sch2TotAmount`, `${P}txtPg2P4Sch3TotAmount`,
  ]);
  // saveXML escape()s only the name and the first address line (the scaffold also flags Address2 / email)
  const escapedKey = new Set([`${P}ProfileName`, `${P}ProfileAddress1`]);
  const scalar = json
    .filter((f) => savedKey.has(f.id) && !apart.test(f.id))
    .map((f): FieldJson => ({ id: f.id, kind: money.has(f.id) ? "money" : f.kind, ...(escapedKey.has(f.id) ? { escaped: true } : {}), ...(f.secret ? { secret: true } : {}) }));

  const notInstallment = (reset: string) => (r: Read, v: string) => (inst(r) ? reset : v);
  const installmentOnly: FieldSpec["gate"] = { on: `${P}rdoPg1I9TransDescInstallment`, equals: "true" };
  const override: Record<string, Partial<FieldSpec>> = {
    [`${P}txtPg1I1Month`]: { required: true },
    [`${P}txtPg1I1Day`]: { required: true },
    [`${P}txtPg1I1Year`]: { required: true },
    [`${P}txtPg1TIN1`]: { required: true },
    [`${P}txtPg1TIN2`]: { required: true },
    [`${P}txtPg1TIN3`]: { required: true },
    [`${P}txtPg1TIN4`]: { required: true },
    [`${P}ProfileName`]: { required: true, derive: upper },
    [`${P}ProfileAddress1`]: { required: true, derive: upper }, // the reload upper-cases both address lines
    [`${P}ProfileAddress2`]: { derive: upper },
    [`${P}ProfileZipCode`]: { required: true },
    [`${P}ProfileContactNum`]: { required: true },
    // resetCorpoButton: clicking the individual ATC clears the domestic / foreign choice
    [`${P}rdoCorpoDomestic`]: { derive: (r, v) => (is(r, "rdoPg1I3ATCIndiv") ? "false" : v) },
    [`${P}rdoCorpoForeign`]: { derive: (r, v) => (is(r, "rdoPg1I3ATCIndiv") ? "false" : v) },
    [`${P}txtPg1I8TaxReliefSpec`]: { gate: { on: `${P}rdoPg1I8TaxReliefYes`, equals: "true" }, derive: upper },
    [`${P}txtPg1I9TransDescSpec`]: { gate: { on: `${P}rdoPg1I9TransDescOthers`, equals: "true" }, derive: upper },
    [`${P}txtPg1P2I10TaxBase`]: fromChain("i10"),
    [`${P}txtPg1P2I11AllowExpnse`]: fromChain("i11"),
    [`${P}txtPg1P2I12NetCptalChnged`]: fromChain("i12"),
    [`${P}txtPg1P2I13TaxDueForTrans`]: fromChain("i13"),
    [`${P}txtPg1P2I14TaxDuePmtPriod`]: fromChain("i14"),
    [`${P}txtPg1P2I15TaxPaidInPrevRtrn`]: { gate: { on: `${P}rdoPg1I2AmendedYes`, equals: "true" } },
    [`${P}txtPg1P2I16TaxPayable`]: fromChain("i16"),
    [`${P}txtPg1P2I17TotPenalties`]: fromChain("i17"),
    [`${P}txtPg1P2I18TotAmtPyable`]: fromChain("i18"),
    // page 2's header mirrors page 1 (loadBGData fills every TIN<n> by name; the load copies the name to RegName)
    ...Object.fromEntries([1, 2, 3, 4].map((n) => [`${P}txtPg2TinC${n}`, { derive: (r: Read, v: string) => r(`${P}txtPg1TIN${n}`) || v }])),
    [`${P}txtPg2RegisteredName`]: { derive: (r, v) => r(`${P}ProfileName`) || v },
    // Schedule 1 — live only for an installment sale (disableSchedOne resets it otherwise)
    ...Object.fromEntries(["I1SellPrice", "I2CostExpense", "I3AssumMortgage", "I5InstallmentAmt", "I8DateCollection", "I9TotCollection"].map((s) => [`${P}txtPg2P4Sch1${s}`, { gate: installmentOnly }])),
    [`${P}txtPg2P4Sch1I4NumInstallments`]: { gate: installmentOnly, derive: (r, v) => (inst(r) ? v : "0") },
    // v2021: transactionType assigns the number 15 ("15"; page 2 is never blurred by the reload) — v2018: typed by the user
    [`${P}txtPg2P4Sch1I6ApplcRate`]: v2021 ? { compute: () => 1500, derive: (r) => (inst(r) ? "15" : "") } : { kind: "money", derive: (r) => rate1(r) },
    [`${P}txtPg2P4Sch1I7PeriodTaxDue`]: { kind: "money", compute: (r) => parseMoney(chain(r).i7!) },
    [`${P}txtPg2P4Sch2TotAmount`]: { kind: "money", compute: (r) => parseMoney(chain(r).t2!) },
    [`${P}txtPg2P4Sch3TotAmount`]: { kind: "money", compute: (r) => parseMoney(chain(r).t3!) },
  };
  // v2021: transactionType() assigns "" on an installment sale, but the field is on page 1, so the blur
  // sweep still fires its round(this), which rewrites "" to "0.00" (isNaN("") is false → floor(""*100)=0)
  if (v2021) override[`${P}txtPg1P2I13AppTaxRate`] = { compute: () => 1500, derive: (r, v) => (inst(r) ? "0.00" : v) };
  // Schedules 2 / 3 — reset by disableSchedTwo / Three on an installment sale; row 4 shows "OTHERS" + the pop-up total
  for (const i of ROW) {
    const other = (more: (r: Read) => boolean) => (r: Read, v: string) => (i === 4 && more(r) ? "OTHERS" : v);
    const shares = `${P}txtPg2P4Sch2NoOfShares${i}`;
    override[`${P}txtPg2P4Sch2NameOfCorpStock${i}`] = { derive: (r, v) => notInstallment("")(r, other(s2more)(r, upper(r, v))) };
    override[`${P}txtPg2P4Sch2StockCertNo${i}`] = { derive: (r, v) => notInstallment("")(r, other(s2more)(r, upper(r, v))) };
    override[shares] = {
      ...(v2021 ? {} : { kind: "money" as const }),
      derive: (r, v) => notInstallment("0.00")(r, other(s2more)(r, v2021 && v !== "" && nwc(v) ? roundShares(v) : v)),
    };
    override[taxBase(i)] = { kind: "money", derive: (r, v) => notInstallment("0.00")(r, i === 4 && s2more(r) ? subTotal(r(`${P}_s2moreBase`)) : v) };
    override[`${P}txtPg2P4Sch3Particulars${i}`] = { derive: (r, v) => notInstallment("")(r, other(s3more)(r, upper(r, v))) };
    override[`${P}txtPg2P4Sch3Amount${i}`] = { kind: "money", derive: (r, v) => notInstallment("0.00")(r, i === 4 && s3more(r) ? subTotal(r(`${P}_s3moreBase`)) : v) };
  }

  const schema = buildSchema(form_code, v2021 ? "Capital Gains Tax — Shares Not Traded (2021)" : "Capital Gains Tax — Shares Not Traded (2018)", scalar, override);
  const party = (name: string, item: "6Seller" | "7Buyer"): GroupSpec => ({
    name,
    first_index: 0,
    row: [
      { id: `${P}txtPg1I${item}Name`, kind: "text", derive: upper },
      { id: `${P}txtPg1I${item}Addr`, kind: "text", derive: upper },
      { id: `${P}txtPg1I${item}TIN`, kind: "text" },
    ],
  });
  const more2: GroupSpec = {
    name: "sched2more",
    first_index: 1,
    row: [
      { id: `${P}txtPg2Pt4S2_{i}Col1`, kind: "text", derive: upper },
      { id: `${P}txtPg2Pt4S2_{i}Col2`, kind: v2021 ? "text" : "money", ...(v2021 ? { derive: (_r: Read, v: string) => (v !== "" ? roundShares(v) : v) } : {}) },
      { id: `${P}txtPg2Pt4S2_{i}Col3`, kind: "text", derive: upper },
      { id: `${P}txtPg2Pt4S2_{i}Col4`, kind: "money" },
    ],
    total: { into: `${P}_s2moreBase`, of: `${P}txtPg2Pt4S2_{i}Col4` },
  };
  const more3: GroupSpec = {
    name: "sched3more",
    first_index: 1,
    row: [
      { id: `${P}txtPg2Pt4S3_{i}Col1`, kind: "text", derive: upper },
      { id: `${P}txtPg2Pt4S3_{i}Col2`, kind: "money" },
    ],
    total: { into: `${P}_s3moreBase`, of: `${P}txtPg2Pt4S3_{i}Col2` },
  };
  schema.group = [party("seller", "6Seller"), party("buyer", "7Buyer"), more2, more3];
  // the blank form ships 3 seller / buyer rows (in the template); addSeller / addBuyer rows past them carry their own
  // delete checkbox, and an Add-More pop-up records its row count and subtotal (Save_Pg2Pt4S2/S3PopTable)
  schema.extra_record = (state, groups): SaveRecord[] => {
    const record: SaveRecord[] = [];
    for (const [name, box] of [["seller", "chkSellerDelete"], ["buyer", "chkBuyerDelete"]] as const) {
      (groups[name] ?? []).forEach((_, i) => i >= 3 && record.push({ key: `${box}${i}`, value: "false" }));
    }
    if (state[`${P}rdoPg1I9TransDescInstallment`] !== "true") {
      for (const [name, n] of [["sched2more", 2], ["sched3more", 3]] as const) {
        const row = groups[name] ?? [];
        if (row.length === 0) continue;
        record.push({ key: `Pg2Pt4S${n}SubTotal`, value: subTotal(state[`${P}_s${n}moreBase`] ?? "") }, { key: `Pg2Pt4S${n}PopLength`, value: String(row.length) });
      }
    }
    return record;
  };

  const validate = (state: FormState, groups: GroupState = {}): Problem[] => {
    const problem = validateRequired(schema, state);
    const tin = `${state[`${P}txtPg1TIN1`] ?? ""}${state[`${P}txtPg1TIN2`] ?? ""}${state[`${P}txtPg1TIN3`] ?? ""}`;
    if (tin.length === 9 && validateTin(tin) !== TinStatus.Valid) problem.push({ id: `${P}txtPg1TIN1`, message: "The TIN's check digit doesn't match." });
    if ((state[`${P}txtPg1I1Month`] ?? "00") === "00") problem.push({ id: `${P}txtPg1I1Month`, message: "Select the month of the transaction (item 1)." });
    const yes = (id: string) => state[`${P}${id}`] === "true";
    if (!yes("rdoPg1I3ATCIndiv") && !yes("rdoPg1I3ATCCorp")) problem.push({ id: `${P}rdoPg1I3ATCIndiv`, message: "Choose the ATC (item 3)." });
    if (yes("rdoPg1I3ATCCorp") && !yes("rdoCorpoDomestic") && !yes("rdoCorpoForeign")) problem.push({ id: `${P}rdoCorpoDomestic`, message: "Say whether the corporation is domestic or foreign." });
    if (!state[`${P}rdoPg1Pt1I5RDO`] || state[`${P}rdoPg1Pt1I5RDO`] === "000") problem.push({ id: `${P}rdoPg1Pt1I5RDO`, message: "Enter a valid RDO code (item 5)." });
    for (const [name, label] of [["seller", "Seller"], ["buyer", "Buyer"]] as const) {
      const row = groups[name] ?? [];
      const item = name === "seller" ? "6Seller" : "7Buyer";
      if (!row.some((x) => (x[`${P}txtPg1I${item}Name`] ?? "").trim())) problem.push({ id: `${P}txtPg1I${item}Name0`, message: `${label}'s information needs at least one row.` });
      row.forEach((x, i) => {
        const filled = [x[`${P}txtPg1I${item}Name`], x[`${P}txtPg1I${item}Addr`], x[`${P}txtPg1I${item}TIN`]].map((s) => (s ?? "").trim() !== "");
        if (filled.some(Boolean) && !filled.every(Boolean)) problem.push({ id: `${P}txtPg1I${item}Name${i}`, message: `Complete ${label.toLowerCase()} row ${i + 1} (name, address and TIN).` });
        const t = (x[`${P}txtPg1I${item}TIN`] ?? "").trim();
        if (t && (!/^\d+$/.test(t) || t.length <= 11)) problem.push({ id: `${P}txtPg1I${item}TIN${i}`, message: `${label} row ${i + 1}: the TIN needs at least 12 digits (BIR clears a non-numeric TIN).` });
      });
    }
    if (yes("rdoPg1I8TaxReliefYes") && !(state[`${P}txtPg1I8TaxReliefSpec`] ?? "").trim()) problem.push({ id: `${P}txtPg1I8TaxReliefSpec`, message: "Specify the tax relief (item 8A)." });
    if (!["Cash", "Installment", "Foreclosure", "Others"].some((k) => yes(`rdoPg1I9TransDesc${k}`))) problem.push({ id: `${P}rdoPg1I9TransDescCash`, message: "Choose the description of the transaction (item 9)." });
    if (yes("rdoPg1I9TransDescOthers") && !(state[`${P}txtPg1I9TransDescSpec`] ?? "").trim()) problem.push({ id: `${P}txtPg1I9TransDescSpec`, message: "Specify the transaction (item 9)." });
    if (!v2021 && yes("rdoPg1I9TransDescInstallment") && nwc(state[`${P}txtPg2P4Sch1I6ApplcRate`] || "0") >= 100) problem.push({ id: `${P}txtPg2P4Sch1I6ApplcRate`, message: "Tax rate should be below 100." });
    for (const [name, n] of [["sched2more", 2], ["sched3more", 3]] as const) {
      const row = groups[name] ?? [];
      if (row.length === 1) problem.push({ id: `Pg2Pt4S${n}PopLength`, message: `Schedule ${n}: put a single fourth line in row 4; "Add More" is for two or more.` });
      if (row.length && yes("rdoPg1I9TransDescInstallment")) problem.push({ id: `Pg2Pt4S${n}PopLength`, message: `Schedule ${n} is reset for an installment sale; clear its Add-More rows.` });
      const amt = n === 2 ? `${P}txtPg2Pt4S2_{i}Col4` : `${P}txtPg2Pt4S3_{i}Col2`;
      row.forEach((x, i) => {
        const v = parseMoney(x[amt] ?? "");
        if (v <= 0) problem.push({ id: amt.replace("{i}", String(i + 1)), message: `Schedule ${n} pop-up row ${i + 1} needs an amount.` });
        else if (!v2021 && v % 100 !== 0) problem.push({ id: amt.replace("{i}", String(i + 1)), message: `Schedule ${n} pop-up row ${i + 1}: BIR's 2018 form drops centavos here (toComma); enter whole pesos.` });
      });
    }
    if (!yes("rdoPg1I9TransDescInstallment")) {
      for (const i of ROW) {
        const name = (state[`${P}txtPg2P4Sch2NameOfCorpStock${i}`] ?? "").trim();
        const cert = (state[`${P}txtPg2P4Sch2StockCertNo${i}`] ?? "").trim();
        const base = parseMoney(state[taxBase(i)] ?? "");
        const share = nwc(state[`${P}txtPg2P4Sch2NoOfShares${i}`] || "0");
        if (i === 4 && (groups.sched2more ?? []).length > 1) continue;
        if (((name === "" || cert === "") && (share !== 0 || base !== 0)) || ((name !== "" || cert !== "") && (!share || base === 0))) {
          problem.push({ id: `${P}txtPg2P4Sch2NameOfCorpStock${i}`, message: `Complete Schedule 2 row ${i} (name, certificate no., shares, selling price).` });
        }
        const part = (state[`${P}txtPg2P4Sch3Particulars${i}`] ?? "").trim();
        const amt = parseMoney(state[`${P}txtPg2P4Sch3Amount${i}`] ?? "");
        if (i === 4 && (groups.sched3more ?? []).length > 1) continue;
        if ((amt === 0 && part !== "") || (amt !== 0 && part === "")) problem.push({ id: `${P}txtPg2P4Sch3Particulars${i}`, message: `Complete Schedule 3 row ${i} (particulars and amount).` });
      }
    }
    return problem;
  };

  return { schema, validate, chain };
}

export const F1707V2018 = make1707T("1707v2018", "2018", fieldJson as FieldJson[], template as Array<[string, string, string?]>);
export const FORM_1707V2018 = F1707V2018.schema;
export const validate1707v2018 = (state: FormState, groups: GroupState = {}): Problem[] => F1707V2018.validate(state, groups);

/** The NativeForm label / prefill / period maps, shared by both editions. */
export function entryShape1707(edition: Edition) {
  const v2021 = edition === "2021";
  const n = (item: number) => String(v2021 && item >= 13 ? item + 1 : item); // v2021 inserts item 13 (rate) and renumbers
  const label: Record<string, string> = {
    [`${P}txtPg1I1Month`]: "1 — Date of transaction (MM)", [`${P}txtPg1I1Day`]: "DD", [`${P}txtPg1I1Year`]: "YYYY",
    [`${P}rdoPg1I2AmendedYes`]: "2 — Amended return: Yes", [`${P}rdoPg1I2AmendedNo`]: "2 — Amended return: No",
    [`${P}rdoPg1I3ATCIndiv`]: "3 — ATC II 030 (individual)", [`${P}rdoPg1I3ATCCorp`]: "3 — ATC IC 110 (corporation)",
    [`${P}rdoCorpoDomestic`]: "Corporation: domestic", [`${P}rdoCorpoForeign`]: "Corporation: foreign",
    [`${P}txtPg1I4NoOfSheets`]: "4 — No. of sheets attached", [`${P}txtPg1TIN1`]: "TIN", [`${P}txtPg1TIN4`]: "Branch code",
    [`${P}rdoPg1Pt1I5RDO`]: "5 — RDO code of the seller", [`${P}ProfileName`]: "Taxpayer / seller name", [`${P}ProfileAddress1`]: "Registered address",
    [`${P}ProfileAddress2`]: "Registered address (cont.)", [`${P}ProfileZipCode`]: "ZIP", [`${P}ProfileContactNum`]: "Contact number",
    [`${P}txtPg1I6SellerName`]: "6 — Seller's name", [`${P}txtPg1I6SellerAddr`]: "Address", [`${P}txtPg1I6SellerTIN`]: "TIN",
    [`${P}txtPg1I7BuyerName`]: "7 — Buyer's name", [`${P}txtPg1I7BuyerAddr`]: "Address", [`${P}txtPg1I7BuyerTIN`]: "TIN",
    [`${P}rdoPg1I8TaxReliefYes`]: "8 — Tax relief: Yes", [`${P}rdoPg1I8TaxReliefNo`]: "8 — Tax relief: No", [`${P}txtPg1I8TaxReliefSpec`]: "8A — Specify",
    [`${P}rdoPg1I9TransDescCash`]: "9 — Cash sale", [`${P}rdoPg1I9TransDescInstallment`]: "9 — Installment sale (Schedule 1)",
    [`${P}rdoPg1I9TransDescForeclosure`]: "9 — Foreclosure sale", [`${P}rdoPg1I9TransDescOthers`]: "9 — Others", [`${P}txtPg1I9TransDescSpec`]: "Specify",
    [`${P}txtPg1P2I10TaxBase`]: "10 — Tax base (Schedule 2)", [`${P}txtPg1P2I11AllowExpnse`]: "11 — Allowable expenses (Schedule 3)",
    [`${P}txtPg1P2I12NetCptalChnged`]: "12 — Net capital gain", [`${P}txtPg1P2I13TaxDueForTrans`]: `${n(13)} — Tax due (cash / foreclosure${v2021 ? " / others" : ""})`,
    [`${P}txtPg1P2I14TaxDuePmtPriod`]: `${n(14)} — Tax due this period (installment)`, [`${P}txtPg1P2I15TaxPaidInPrevRtrn`]: `${n(15)} — Tax paid in return previously filed`,
    [`${P}txtPg1P2I16TaxPayable`]: `${n(16)} — Tax payable / (overpayment)`, [`${P}txtPg1P2I17Surcharge`]: `${n(17)}A — Surcharge`,
    [`${P}txtPg1P2I17Interest`]: `${n(17)}B — Interest`, [`${P}txtPg1P2I17Compromise`]: `${n(17)}C — Compromise`,
    [`${P}txtPg1P2I17TotPenalties`]: `${n(17)}D — Total penalties`, [`${P}txtPg1P2I18TotAmtPyable`]: `${n(18)} — Total amount payable / (overpayment)`,
    [`${P}txtPg2P4Sch1I1SellPrice`]: "Sched 1 — 1 Selling price", [`${P}txtPg2P4Sch1I2CostExpense`]: "2 — Cost and expenses",
    [`${P}txtPg2P4Sch1I3AssumMortgage`]: "3 — Mortgage assumed", [`${P}txtPg2P4Sch1I4NumInstallments`]: "4 — No. of installments",
    [`${P}txtPg2P4Sch1I5InstallmentAmt`]: "5 — Installment collected", [`${P}txtPg2P4Sch1I6ApplcRate`]: "6 — Applicable rate %",
    [`${P}txtPg2P4Sch1I7PeriodTaxDue`]: "7 — Tax due this period", [`${P}txtPg2P4Sch1I8DateCollection`]: "8 — Date of collection",
    [`${P}txtPg2P4Sch1I9TotCollection`]: "9 — Total collections to date",
    [`${P}txtPg2P4Sch2TotAmount`]: "Sched 2 — Total (to item 10)", [`${P}txtPg2P4Sch3TotAmount`]: "Sched 3 — Total (to item 11)",
    [`${P}txtPg2Pt4S2_{i}Col1`]: "Corporation", [`${P}txtPg2Pt4S2_{i}Col2`]: "No. of shares", [`${P}txtPg2Pt4S2_{i}Col3`]: "Certificate no.",
    [`${P}txtPg2Pt4S2_{i}Col4`]: "Selling price / FMV", [`${P}txtPg2Pt4S3_{i}Col1`]: "Particulars", [`${P}txtPg2Pt4S3_{i}Col2`]: "Amount",
  };
  if (v2021) label[`${P}txtPg1P2I13AppTaxRate`] = "13 — Applicable tax rate %";
  for (const i of ROW) {
    label[`${P}txtPg2P4Sch2NameOfCorpStock${i}`] = `Sched 2 row ${i} — Corporation`;
    label[`${P}txtPg2P4Sch2NoOfShares${i}`] = "No. of shares";
    label[`${P}txtPg2P4Sch2StockCertNo${i}`] = "Certificate no.";
    label[i === 1 && !v2021 ? "txtPg2P4Sch2TaxBaseSellPrice1:test" : `${P}txtPg2P4Sch2TaxBaseSellPrice${i}`] = "Selling price / FMV";
    label[`${P}txtPg2P4Sch3Particulars${i}`] = `Sched 3 row ${i} — Particulars`;
    label[`${P}txtPg2P4Sch3Amount${i}`] = "Amount";
  }
  const prefill = {
    [`${P}txtPg1TIN1`]: "tin1", [`${P}txtPg1TIN2`]: "tin2", [`${P}txtPg1TIN3`]: "tin3", [`${P}txtPg1TIN4`]: "tin4",
    // No email: loadData always overwrites item 9 with the profile's email (globalEmail), whatever the file says.
    [`${P}rdoPg1Pt1I5RDO`]: "rdo", [`${P}ProfileName`]: "fn", [`${P}ProfileAddress1`]: "regAddr", [`${P}ProfileZipCode`]: "zip",
    [`${P}ProfileContactNum`]: "telNo", [`${P}txtLOB`]: "lob",
  } as const;
  // createXMLFileName: month + day + year, e.g. "06152023"
  const periodName = (s: FormState) => `${s[`${P}txtPg1I1Month`] ?? ""}${s[`${P}txtPg1I1Day`] ?? ""}${s[`${P}txtPg1I1Year`] ?? ""}`;
  return { label, prefill, periodName };
}
