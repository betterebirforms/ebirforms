// savefile/<TIN9><BRANCH 3–5>-<FORMCODE>-<PERIOD>[V<n>].xml  (docs/analysis/web-layer.md §2.2)

export interface ReturnFile {
  file_name: string;
  tin: string;
  branch_code: string;
  form_code: string;
  period: string;
  /** Amended-return number; 0 for the original filing. */
  amendment: number;
}

const NAME = /^(\d{9})(\d{3,5})-([0-9A-Za-z]+)-([0-9_A-Za-z]+?)(?:V(\d+))?\.xml$/;

export function parseReturnFile(file_name: string): ReturnFile | null {
  const m = NAME.exec(file_name.replace(/ /g, ""));
  if (!m) return null;
  return { file_name, tin: m[1]!, branch_code: m[2]!, form_code: m[3]!, period: m[4]!, amendment: m[5] ? Number(m[5]) : 0 };
}

/** The HTA a savefile reopens in. 1702MXv2018Cxx (a BIR test fork) writes the 1702MXv2018C code. */
export const pageForReturn = (r: ReturnFile) => `forms/BIR-Form${r.form_code}.hta?xmlFileName=savefile/${encodeURIComponent(r.file_name)}`;

/** Human period: MMYYYY → 10/2026, YYYYQ → 2026 Q3, MMDDYYYY[HHMMSS] → 10/15/2026, YYYY → 2026. */
export function describePeriod(period: string): string {
  const p = period.split("_")[0]!;
  if (/^\d{6}$/.test(p)) return `${p.slice(0, 2)}/${p.slice(2)}`;
  if (/^\d{4}[1-4]$/.test(p)) return `${p.slice(0, 4)} Q${p[4]}`;
  if (/^\d{6}[1-4]$/.test(p)) return `${p.slice(2, 6)} Q${p[6]} (FY end ${p.slice(0, 2)})`;
  if (/^\d{8}(\d{6})?$/.test(p)) return `${p.slice(0, 2)}/${p.slice(2, 4)}/${p.slice(4, 8)}`;
  if (/^\d{4}$/.test(p)) return p;
  return period;
}
