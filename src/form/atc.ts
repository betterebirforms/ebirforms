// Native ATC (Alphanumeric Tax Code) reference — the statutory withholding rate per BIR tax code, extracted from
// the recovered xml/atcCodes.xml by tool/atc-extract.mjs. This is the shared rate source the ATC-schedule
// withholding forms (1600/1601E/1601EQ/1601FQ/1600VT/1600PT/…) auto-fill from when a code is picked, so a native
// rewrite no longer has to hard-code per-row rates. DST codes (form 2000) carry a human-readable `formula`
// instead of a numeric `rate` (the DST rate engine is separate — see docs/analysis/form-triage.md).

import atcCodes from "./atc-codes.json";
import atcList from "./atc-list.json";

export interface AtcInfo {
  /** Human-readable nature-of-payment description. */
  desc: string;
  /** Withholding percentage (e.g. 5 for 5%), or null for DST codes whose rate is a formula. */
  rate: number | null;
  /** DST rate formula string (e.g. "P2.00/P200"), or null for percentage-rate codes. */
  formula: string | null;
  /** Form codes this ATC appears on. */
  form: string[];
}

const table = atcCodes as Record<string, AtcInfo>;

/** Full reference entry for an ATC code (e.g. "WI160"), or undefined if unknown. */
export const atcInfo = (code: string): AtcInfo | undefined => table[code];

/** The numeric withholding rate (%) for an ATC code, or null if unknown / formula-based (DST). */
export const atcRate = (code: string): number | null => table[code]?.rate ?? null;

/** Every ATC code that belongs to a given form code (e.g. "1601EQ"). */
export const atcForForm = (formCode: string): string[] =>
  Object.keys(table).filter((code) => table[code]!.form.includes(formCode));

/** One entry of a form's ATC pick list: the code and BIR's rate string verbatim (e.g. "20.0"). */
export interface AtcPick {
  atc_code: string;
  rate: string;
}

const pickTable = atcList as Record<string, Record<string, string[][]>>;

/** A form's ATC pick list in BIR's own order, duplicates kept (list position i+1 = the legacy `AtcCd<i+1>`).
 *  `category` is the withholding-agent kind: "P" private, "G" government. Empty for forms not extracted. */
export const atcPickList = (formCode: string, category: string): AtcPick[] =>
  (pickTable[formCode]?.[category] ?? []).map(([atc_code = "", rate = ""]) => ({ atc_code, rate }));

/** One schedule row's ATC, as the native form holds it: the code and the rate string the row was filled with. */
export interface AtcRowKey {
  atc_code: string;
  rate: string;
}

/** For each schedule row, the 0-based pick-list position whose picker checkbox it came from, or -1 when the code is
 *  not on the list (or every entry for it is already taken). BIR's lists repeat a code (at another rate, or — for
 *  forms whose loadATC substring-matches a longer form code — verbatim), so a row takes the first unused entry whose
 *  rate matches, else the first unused entry for its code. Shared by every ATC-picker form (1601E/EQ/F/FQ, 1600, 1600WP). */
export function atcPickIndex(list: AtcPick[], row: AtcRowKey[]): number[] {
  const used = new Set<number>();
  return row.map((r) => {
    const code = r.atc_code.trim();
    const rate = parseFloat(r.rate);
    const free = (j: number) => !used.has(j) && list[j]!.atc_code === code;
    let j = list.findIndex((e, k) => free(k) && parseFloat(e.rate) === rate);
    if (j < 0) j = list.findIndex((_, k) => free(k));
    if (j >= 0) used.add(j);
    return j;
  });
}

/** The picker checkbox records for a form: one `<stem><j+1>` per pick-list entry, "true" for the entries a row
 *  came from. The legacy reload re-checks these and rebuilds its ATC rows from them, in LIST order. */
export const atcPickRecord = (stem: string, list: AtcPick[], index: number[]): Array<{ key: string; value: string }> => {
  const picked = new Set(index);
  return list.map((_, j) => ({ key: `${stem}${j + 1}`, value: String(picked.has(j)) }));
};

/** True when the rows' pick-list positions are strictly ascending — the only order the legacy picker can rebuild. */
export const atcInListOrder = (index: number[]): boolean => index.every((j, k) => k === 0 || j > index[k - 1]!);
