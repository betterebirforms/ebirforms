// BIR reference data (xml/*.xml) — pseudo-XML records "<div>atc5:WB040~DESC~2.0~G~~~~~~1600atc5:</div>"
// (docs/analysis/web-layer.md §2.4). The original re-scanned the whole file once per entry (O(N × filesize))
// and filtered forms by substring, so "1600" matched "1600WP". This is one linear pass with exact form codes.

export interface ReferenceRow {
  /** `~`-separated fields, the trailing form list removed. */
  field: string[];
  /** Exact form codes this row applies to (empty = no list in the source). */
  form: string[];
}

const FORM_CODE = /^\d{4}[A-Z0-9-]*$/;

/** Parse every `<div>{prefix}{n}:VALUE{prefix}{n}:</div>` record, in index order. */
export function parseReference(text: string, prefix: string): ReferenceRow[] {
  const row: Array<[number, ReferenceRow]> = [];
  const re = new RegExp(String.raw`<div>${prefix}(\d+):([\s\S]*?)</div>`, "g");
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const terminator = `${prefix}${m[1]}:`;
    const body = m[2]!.endsWith(terminator) ? m[2]!.slice(0, -terminator.length) : m[2]!;
    const field = body.split("~");
    const last = field.pop() ?? "";
    const part = last.split("|");
    const form = part.filter((p) => FORM_CODE.test(p));
    const rest = part.filter((p) => !FORM_CODE.test(p));
    if (rest.length) field.push(rest.join("|"));
    else if (!form.length) field.push(last);
    row.push([Number(m[1]), { field, form }]);
  }
  return row.sort((a, b) => a[0] - b[0]).map(([, r]) => r);
}

export const appliesTo = (row: ReferenceRow, form_code: string) => row.form.includes(form_code);

export interface Atc {
  atc_code: string;
  description: string;
  rate_percent: string;
  kind: string;
  form: string[];
}
export const parseAtc = (text: string): Atc[] =>
  parseReference(text, "atc").map(({ field, form }) => ({
    atc_code: field[0] ?? "",
    description: (field[1] ?? "").replace(/\s{2,}/g, " ").trim(),
    rate_percent: field[2] ?? "",
    kind: field[3] ?? "",
    form,
  }));

export interface Rdo {
  rdo_code: string;
  name: string;
  form: string[];
}
export const parseRdo = (text: string): Rdo[] =>
  parseReference(text, "rdo").map(({ field, form }) => ({ rdo_code: field[0] ?? "", name: field[2] ?? "", form }));

export interface Region {
  region_code: string;
  name: string;
}
export const parseRegion = (text: string): Region[] =>
  parseReference(text, "region").map(({ field }) => ({ region_code: field[0] ?? "", name: (field[1] ?? "").replace(/\s{2,}/g, " ") }));

export interface Province {
  region_code: string;
  province_code: string;
  name: string;
}
export const parseProvince = (text: string): Province[] =>
  parseReference(text, "province").map(({ field }) => ({
    region_code: field[0] ?? "",
    province_code: field[1] ?? "",
    name: field[2] ?? "",
  }));

export interface City {
  region_code: string;
  province_code: string;
  city_code: string;
  name: string;
}
export const parseCity = (text: string): City[] =>
  parseReference(text, "city").map(({ field }) => ({
    region_code: field[0] ?? "",
    province_code: field[1] ?? "",
    city_code: field[2] ?? "",
    name: field[3] ?? "",
  }));

export interface CodeName {
  code: string;
  name: string;
  form: string[];
}
export const parseTaxType = (text: string): CodeName[] =>
  parseReference(text, "taxTypeCode").map(({ field, form }) => ({ code: field[0] ?? "", name: field[1] ?? "", form }));
export const parseTreaty = (text: string): CodeName[] =>
  parseReference(text, "treaty").map(({ field, form }) => ({ code: field[0] ?? "", name: field[1] ?? "", form }));

/** The declared `{prefix}Count` header, used to check nothing was dropped. */
export function declaredCount(text: string, prefix: string): number | null {
  const m = new RegExp(String.raw`<div>${prefix}Count[=:](\d+)${prefix}Count[=:]</div>`).exec(text);
  return m ? Number(m[1]) : null;
}
