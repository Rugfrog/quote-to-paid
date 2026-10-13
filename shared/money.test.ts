import { describe, expect, it } from 'vitest';
import {
  calculateTotals,
  depositAmount,
  lineTotal,
  parsePoundsToPence,
  parseQuantity,
  penceToInput,
  percentOf,
  quantityToInput,
  roundHalfUp,
} from './money';

describe('roundHalfUp', () => {
  it('rounds halves up, away from zero', () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(2.4999)).toBe(2);
    expect(roundHalfUp(-2.5)).toBe(-3);
  });
  it('is not fooled by floating-point noise', () => {
    // 1.005 * 100 = 100.49999999999999 in floating point
    expect(roundHalfUp(1.005 * 100)).toBe(101);
  });
});

describe('lineTotal', () => {
  it('multiplies quantity (hundredths) by unit price (pence)', () => {
    expect(lineTotal(1200, 1200)).toBe(14400); // 12 m² at £12.00 = £144.00
    expect(lineTotal(1250, 1500)).toBe(18750); // 12.5 m² at £15.00 = £187.50
  });
  it('rounds fractional pence half-up', () => {
    expect(lineTotal(333, 1000)).toBe(3330); // 3.33 × £10
    expect(lineTotal(150, 333)).toBe(500); // 1.5 × £3.33 = 499.5p → 500p
    expect(lineTotal(250, 1)).toBe(3); // 2.5 × 1p = 2.5p → 3p
  });
});

describe('percentOf / VAT', () => {
  it('works out 20% VAT', () => {
    expect(percentOf(10000, 2000)).toBe(2000);
    expect(percentOf(12345, 2000)).toBe(2469); // 2469.0
    expect(percentOf(12347, 2000)).toBe(2469); // 2469.4 → 2469
    expect(percentOf(12348, 2000)).toBe(2470); // 2469.6 → 2470
    expect(percentOf(2, 2500)).toBe(1); // 0.5p → 1p
  });
});

describe('calculateTotals', () => {
  const lines = [
    { quantityX100: 1200, unitPricePence: 3200 }, // £384.00
    { quantityX100: 1200, unitPricePence: 1500 }, // £180.00
    { quantityX100: 100, unitPricePence: 4500 }, // £45.00
  ];

  it('adds lines, then VAT once on the subtotal', () => {
    expect(calculateTotals({ lines, vatRegistered: true, vatRateBp: 2000 })).toEqual({
      subtotalPence: 60900,
      vatPence: 12180,
      totalPence: 73080,
      unpricedLines: 0,
    });
  });

  it('charges no VAT when the business is not VAT registered', () => {
    const t = calculateTotals({ lines, vatRegistered: false, vatRateBp: 2000 });
    expect(t.vatPence).toBe(0);
    expect(t.totalPence).toBe(60900);
  });

  it('leaves "check price" lines out and counts them', () => {
    const t = calculateTotals({
      lines: [...lines, { quantityX100: 100, unitPricePence: null }],
      vatRegistered: true,
      vatRateBp: 2000,
    });
    expect(t.subtotalPence).toBe(60900);
    expect(t.unpricedLines).toBe(1);
  });

  it('total always equals subtotal + VAT', () => {
    for (let i = 0; i < 500; i++) {
      const random = Array.from({ length: 1 + (i % 7) }, (_, j) => ({
        quantityX100: ((i * 37 + j * 11) % 2000) + 1,
        unitPricePence: ((i * 53 + j * 29) % 50000) + 1,
      }));
      const t = calculateTotals({ lines: random, vatRegistered: true, vatRateBp: 2000 });
      expect(t.totalPence).toBe(t.subtotalPence + t.vatPence);
      expect(Number.isInteger(t.vatPence)).toBe(true);
    }
  });

  it('handles an empty quote', () => {
    expect(calculateTotals({ lines: [], vatRegistered: true, vatRateBp: 2000 }).totalPence).toBe(0);
  });
});

describe('depositAmount', () => {
  it('takes a percentage of the gross total', () => {
    expect(depositAmount(73080, 2500)).toBe(18270);
    expect(depositAmount(10001, 2500)).toBe(2500); // 2500.25 → 2500
  });
});

describe('parsing what people type', () => {
  it('parses pounds into pence without floating point', () => {
    expect(parsePoundsToPence('12')).toBe(1200);
    expect(parsePoundsToPence('12.5')).toBe(1250);
    expect(parsePoundsToPence('£1,234.56')).toBe(123456);
    expect(parsePoundsToPence('0.07')).toBe(7);
    expect(parsePoundsToPence('19.99')).toBe(1999);
    expect(parsePoundsToPence('abc')).toBeNull();
    expect(parsePoundsToPence('1.234')).toBeNull();
    expect(parsePoundsToPence('-5')).toBeNull();
    expect(parsePoundsToPence('')).toBeNull();
  });

  it('round-trips pence to input text', () => {
    expect(penceToInput(123456)).toBe('1234.56');
    expect(penceToInput(5)).toBe('0.05');
    expect(parsePoundsToPence(penceToInput(98765))).toBe(98765);
  });

  it('parses quantities into hundredths', () => {
    expect(parseQuantity('12')).toBe(1200);
    expect(parseQuantity('12.5')).toBe(1250);
    expect(parseQuantity('0.25')).toBe(25);
    expect(parseQuantity('1.234')).toBeNull();
    expect(quantityToInput(1250)).toBe('12.5');
    expect(quantityToInput(1200)).toBe('12');
    expect(quantityToInput(25)).toBe('0.25');
  });
});
