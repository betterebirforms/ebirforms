// TIN check digit — a native port of BIR's chkt.exe (docs/analysis/native-layer.md §3).
// Verified against 4,013 outputs of the real chkt.exe (test/fixture/tin-vector.json).

export const enum TinStatus {
  Valid = 0,
  BadCheckDigit = 1,
  NotNineDigit = 2,
}

const digitRoot = (n: number): number => {
  while (n >= 10) n = [...String(n)].reduce((s, d) => s + Number(d), 0);
  return n;
};

/** Check digit for the first 8 digits of a TIN. */
export function checkDigit(first8: string): number {
  let weight = 256;
  let offset = 8;
  let total = 0;
  for (const ch of first8.slice(0, 8)) {
    total += digitRoot(((Number(ch) + offset) % 10) * weight);
    offset -= 1;
    weight /= 2;
  }
  const r = Number(String(total).padStart(2, "0")[1]);
  return r === 0 ? 0 : 10 - r;
}

export function validateTin(input: string): TinStatus {
  const tin = input.replace(/^ +| +$/g, "");
  if (!/^\d{9}$/.test(tin)) return TinStatus.NotNineDigit;
  if (Number(tin[8]) === checkDigit(tin)) return TinStatus.Valid;
  // Legacy range 900000005–905180008 was issued with the check digit shifted up by one (mod 10).
  // Derived from chkt.exe's output, not its disassembly: a stored 0 is valid when the digit is 9.
  const n = Number(tin);
  if (n > 900000004 && n < 905180009 && (Number(tin[8]) + 9) % 10 === checkDigit(tin)) return TinStatus.Valid;
  return TinStatus.BadCheckDigit;
}

/** User-facing message; the original collapsed every code to this one string. */
export function tinMessage(status: TinStatus): string | null {
  if (status === TinStatus.Valid) return null;
  return status === TinStatus.NotNineDigit ? "A TIN is 9 digits." : "This TIN's check digit doesn't match — please re-check it.";
}
