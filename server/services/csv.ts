import { parsePoundsToPence } from '../../shared/money';
import { UNITS } from '../../shared/schemas';

/** Minimal CSV parser: handles quoted fields, escaped quotes ("") and commas/newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.replace(/^﻿/, ''); // Excel adds a byte-order mark

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const UNIT_ALIASES: Record<string, (typeof UNITS)[number]> = {
  m2: 'm2', 'm²': 'm2', sqm: 'm2', 'sq m': 'm2', 'square metre': 'm2', 'per m2': 'm2',
  m: 'm', metre: 'm', meter: 'm', lm: 'm', 'linear metre': 'm',
  each: 'each', ea: 'each', no: 'each', unit: 'each',
  day: 'day', days: 'day',
  hour: 'hour', hr: 'hour', hours: 'hour',
  item: 'item', job: 'item', 'lump sum': 'item',
};

export interface ImportRow {
  line: number;
  category: string;
  name: string;
  description: string;
  unit: string;
  unit_price_pence: number | null;
  error?: string;
}

/**
 * Turn CSV text into price list rows. Expects a header row containing at least
 * "name", "unit" and "price"; "category" and "description" are optional.
 */
export function parsePriceListCsv(text: string): { rows: ImportRow[]; error?: string } {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], error: 'The file needs a header row and at least one item.' };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const idx = {
    category: col('category', 'group', 'section'),
    name: col('name', 'item', 'description of work', 'title'),
    description: col('description', 'details', 'notes'),
    unit: col('unit', 'units', 'per'),
    price: col('price', 'unit price', 'rate', 'cost', 'price (£)', 'price £'),
  };
  if (idx.name < 0 || idx.unit < 0 || idx.price < 0) {
    return { rows: [], error: 'The first row must include columns called “name”, “unit” and “price”.' };
  }

  const rows = table.slice(1).map((cells, i): ImportRow => {
    const get = (j: number) => (j >= 0 ? (cells[j] ?? '').trim() : '');
    const rawUnit = get(idx.unit).toLowerCase();
    const unit = UNIT_ALIASES[rawUnit] ?? '';
    const price = parsePoundsToPence(get(idx.price));
    const row: ImportRow = {
      line: i + 2,
      category: get(idx.category) || 'General',
      name: get(idx.name),
      description: get(idx.description),
      unit,
      unit_price_pence: price,
    };
    if (!row.name) row.error = 'Missing a name';
    else if (row.name.length > 120) row.error = 'Name is too long';
    else if (!unit) row.error = `Unit “${get(idx.unit)}” not recognised (use m², m, each, day, hour or item)`;
    else if (price === null) row.error = `Price “${get(idx.price)}” isn’t a valid amount`;
    return row;
  });
  return { rows };
}
