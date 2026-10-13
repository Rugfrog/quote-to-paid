import { describe, expect, it } from 'vitest';
import { contrastRatio, readableOnWhite } from './colour';
import {
  formatAgo,
  formatDate,
  formatDateLong,
  formatMoney,
  formatPhone,
  formatPostcode,
  formatSortCode,
  isValidPostcode,
  isValidUkPhone,
} from './format';

describe('UK formats', () => {
  const now = new Date(2026, 9, 13, 12, 0); // Tue 13 Oct 2026

  it('formats money in pounds', () => {
    expect(formatMoney(123456)).toBe('£1,234.56');
    expect(formatMoney(5)).toBe('£0.05');
  });

  it('formats dates like "Tue 13 Oct"', () => {
    expect(formatDate('2026-10-13', now)).toBe('Tue 13 Oct');
    expect(formatDate('2025-12-25', now)).toBe('Thu 25 Dec 2025');
    expect(formatDateLong('2026-10-13')).toBe('Tue 13 Oct 2026');
  });

  it('says how long ago', () => {
    expect(formatAgo(new Date(2026, 9, 13, 8), now)).toBe('today');
    expect(formatAgo('2026-10-12', now)).toBe('yesterday');
    expect(formatAgo('2026-10-10', now)).toBe('3 days ago');
  });

  it('checks and tidies UK postcodes', () => {
    for (const ok of ['HD1 2AB', 'hd92qa', 'SW1A 1AA', 'M1 1AE', 'B33 8TH', 'CR2 6XH', 'DN55 1PT', 'W1A 0AX', 'EC1A 1BB']) {
      expect(isValidPostcode(ok), ok).toBe(true);
    }
    for (const bad of ['HD1', '12345', 'HD1 2CI', 'QQ1 1AA', '']) expect(isValidPostcode(bad), bad).toBe(false);
    expect(formatPostcode('hd92qa')).toBe('HD9 2QA');
  });

  it('checks and tidies UK phone numbers', () => {
    expect(isValidUkPhone('07700 900123')).toBe(true);
    expect(isValidUkPhone('+44 7700 900123')).toBe(true);
    expect(isValidUkPhone('01484 123456')).toBe(true);
    expect(isValidUkPhone('123')).toBe(false);
    expect(formatPhone('07700900123')).toBe('07700 900123');
  });

  it('formats sort codes', () => {
    expect(formatSortCode('123456')).toBe('12-34-56');
  });
});

describe('brand colours', () => {
  it('darkens light brand colours until text is readable on white', () => {
    const yellow = readableOnWhite('#ffd400');
    expect(contrastRatio(yellow, '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(readableOnWhite('#2d6a4f')).toBe('#2d6a4f'); // already fine
  });
});
