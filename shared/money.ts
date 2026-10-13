/**
 * All money maths lives here so the screen, PDFs and customer pages always agree.
 *
 * Rules:
 *  - Money is integer pence.
 *  - Percentages are basis points (2000 = 20%).
 *  - Quantities are integer hundredths (12.5 m² is stored as 1250).
 *  - VAT is calculated once per document on the net subtotal, rounded half-up
 *    (HMRC allows rounding at invoice level).
 */

/** Round to the nearest whole number, halves away from zero (0.5 → 1, -0.5 → -1). */
export function roundHalfUp(value: number): number {
  // The small epsilon guards against floating-point results like 2.4999999999.
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) + 1e-9);
}

/** Line total in pence for a quantity (hundredths) at a unit price (pence). */
export function lineTotal(quantityX100: number, unitPricePence: number): number {
  return roundHalfUp((quantityX100 * unitPricePence) / 100);
}

/** A percentage (basis points) of an amount in pence, rounded half-up. */
export function percentOf(amountPence: number, rateBp: number): number {
  return roundHalfUp((amountPence * rateBp) / 10000);
}

export interface TotalsInput {
  lines: { quantityX100: number; unitPricePence: number | null }[];
  vatRegistered: boolean;
  vatRateBp: number;
}

export interface Totals {
  subtotalPence: number;
  vatPence: number;
  totalPence: number;
  /** Lines without a price yet ("check price") are left out of the totals. */
  unpricedLines: number;
}

export function calculateTotals({ lines, vatRegistered, vatRateBp }: TotalsInput): Totals {
  let subtotalPence = 0;
  let unpricedLines = 0;
  for (const line of lines) {
    if (line.unitPricePence === null) {
      unpricedLines++;
      continue;
    }
    subtotalPence += lineTotal(line.quantityX100, line.unitPricePence);
  }
  const vatPence = vatRegistered ? percentOf(subtotalPence, vatRateBp) : 0;
  return { subtotalPence, vatPence, totalPence: subtotalPence + vatPence, unpricedLines };
}

/** Deposit in pence for a gross total and a deposit percentage (basis points). */
export function depositAmount(totalPence: number, depositBp: number): number {
  return percentOf(totalPence, depositBp);
}

/**
 * Parse money typed by a person ("£1,250.5", "12", "0.99") into pence.
 * Uses string maths, never floats. Returns null if it isn't a valid amount.
 */
export function parsePoundsToPence(input: string): number | null {
  const cleaned = input.trim().replace(/^£/, '').replace(/,/g, '').trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const pounds = Number(match[1]);
  const pence = Number((match[2] ?? '').padEnd(2, '0'));
  const result = pounds * 100 + pence;
  return Number.isSafeInteger(result) ? result : null;
}

/** Pence → "12.50" (no £ sign), for editable inputs. */
export function penceToInput(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** Parse a quantity like "12.5" into hundredths (1250). Up to 2 decimal places. */
export function parseQuantity(input: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** Hundredths → "12.5" (trailing zeros removed). */
export function quantityToInput(quantityX100: number): string {
  const whole = Math.floor(quantityX100 / 100);
  const frac = quantityX100 % 100;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}

/** Basis points → "20" or "12.5" for display/editing. */
export function bpToPercent(bp: number): string {
  return quantityToInput(bp);
}

/** "20" / "12.5" → basis points. */
export function percentToBp(input: string): number | null {
  return parseQuantity(input.replace(/%$/, ''));
}
