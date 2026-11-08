// Peso money as integer centavos — exact, unlike BIR's float arithmetic (WL bug 12). Parsing and the
// "1,234.50" display match BIR's NumWithComma + formatCurrency so a rewritten form stays byte-compatible
// with the savefile BIR reads. Used by the natively-rewritten forms (P3).

export type Centavo = number;

/** "1,234.50" / "-5" / "(1,234.50)" / "" → centavos. Mirrors NumWithComma + formatCurrency's round-half-up.
 *  Accounting-style parentheses (used by the 1707 family's `valForCompute`) are read as negative. */
export function parseMoney(input: string | number): Centavo {
  let s = String(input).trim();
  const paren = s.startsWith("(") && s.endsWith(")");
  if (paren) s = s.slice(1, -1);
  const raw = s.replace(/[$,]/g, "").trim();
  if (raw === "" || raw === "-") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  // BIR rounds with Math.floor(|n|*100 + 0.50000000001), sign kept separately
  const cents = Math.floor(Math.abs(n) * 100 + 0.50000000001);
  return paren || n < 0 ? -cents : cents;
}

/** Centavos → "1,234.50", comma-grouped, matching BIR's formatCurrency. */
export function formatMoney(cents: Centavo): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  const peso = Math.floor(abs / 100).toString();
  const cen = (abs % 100).toString().padStart(2, "0");
  const grouped = peso.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}.${cen}`;
}

/** Centavos → accounting style, negatives in parentheses: "1,234.50" / "(1,234.50)". Matches the 1707
 *  family's `roundAmount`, which renders a leading "-" as "(…)". */
export function formatMoneyParen(cents: Centavo): string {
  return cents < 0 ? `(${formatMoney(-cents)})` : formatMoney(cents);
}

/** Exact sum, in centavos. */
export const addMoney = (...amount: Centavo[]): Centavo => amount.reduce((a, b) => a + b, 0);
