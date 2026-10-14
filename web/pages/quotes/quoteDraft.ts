import { calculateTotals, depositAmount, parsePoundsToPence, parseQuantity, penceToInput, quantityToInput, bpToPercent, percentToBp } from '../../../shared/money';
import type { QuoteDetail, Unit } from '../../types';

/** A line as edited on screen: numbers are kept as typed text until saved. */
export interface EditLine {
  key: string;
  description: string;
  qtyText: string;
  unit: Unit;
  priceText: string;
  price_item_id: number | null;
}

export interface EditOption {
  key: string;
  name: string;
  recommended: boolean;
  lines: EditLine[];
}

export interface QuoteDraft {
  title: string;
  intro_notes: string;
  exclusionsText: string;
  validityText: string;
  depositText: string;
  options: EditOption[];
}

let counter = 0;
export const newKey = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`;

export function draftFromDetail(d: QuoteDetail): QuoteDraft {
  return {
    title: d.quote.title,
    intro_notes: d.quote.intro_notes,
    exclusionsText: d.quote.exclusions.join('\n'),
    validityText: String(d.quote.validity_days),
    depositText: bpToPercent(d.quote.deposit_bp),
    options: d.options.map((o) => ({
      key: newKey(),
      name: o.name,
      recommended: o.recommended,
      lines: o.lines.map((l) => ({
        key: newKey(),
        description: l.description,
        qtyText: quantityToInput(l.quantity_x100),
        unit: l.unit,
        priceText: l.unit_price_pence === null ? '' : penceToInput(l.unit_price_pence),
        price_item_id: l.price_item_id,
      })),
    })),
  };
}

/** Line numbers for totals: unparseable quantities count as 0, empty prices as "check price". */
export function lineNumbers(l: EditLine) {
  const qty = parseQuantity(l.qtyText) ?? 0;
  const price = l.priceText.trim() === '' ? null : parsePoundsToPence(l.priceText);
  return { qty, price };
}

/** Same calculation the server and PDF use. */
export function optionTotals(option: EditOption, vatRegistered: boolean, vatRateBp: number, depositBp: number) {
  const totals = calculateTotals({
    lines: option.lines.map((l) => {
      const { qty, price } = lineNumbers(l);
      return { quantityX100: qty, unitPricePence: price };
    }),
    vatRegistered,
    vatRateBp,
  });
  return { ...totals, depositPence: depositAmount(totals.totalPence, depositBp) };
}

/** Turn the draft into the API body, or field errors keyed by line. */
export function draftToBody(d: QuoteDraft) {
  const errors: Record<string, string> = {};
  const validity = /^\d+$/.test(d.validityText.trim()) ? Number(d.validityText) : NaN;
  if (!(validity >= 1 && validity <= 365)) errors.validity = 'Enter a number of days (1–365)';
  const deposit = percentToBp(d.depositText.trim() || '0');
  if (deposit === null || deposit > 10000) errors.deposit = 'Enter a percentage, e.g. 25';

  const options = d.options.map((o) => ({
    name: o.name.trim(),
    recommended: o.recommended,
    lines: o.lines.map((l) => {
      const qty = parseQuantity(l.qtyText);
      const priceText = l.priceText.trim();
      const price = priceText === '' ? null : parsePoundsToPence(priceText);
      if (!qty) errors[`${l.key}.qty`] = 'Enter a quantity';
      if (priceText !== '' && price === null) errors[`${l.key}.price`] = 'Enter a price like 12.50';
      if (!l.description.trim()) errors[`${l.key}.description`] = 'Add a description';
      return {
        description: l.description.trim(),
        quantity_x100: qty ?? 1,
        unit: l.unit,
        unit_price_pence: price,
        price_item_id: l.price_item_id,
        needs_price: price === null,
      };
    }),
  }));

  return {
    errors,
    body: {
      title: d.title.trim(),
      intro_notes: d.intro_notes.trim(),
      exclusions: d.exclusionsText.split('\n').map((s) => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean),
      validity_days: Number.isFinite(validity) ? validity : 30,
      deposit_bp: deposit ?? 0,
      options,
    },
  };
}
