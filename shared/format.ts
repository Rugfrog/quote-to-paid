/** UK formatting helpers used on screen, in PDFs and in messages. */

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

/** 123456 → "£1,234.56" */
export function formatMoney(pence: number): string {
  return gbp.format(pence / 100);
}

/** 123400 → "£1,234" (drops ".00" — for big dashboard numbers). */
export function formatMoneyShort(pence: number): string {
  if (pence % 100 === 0) {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      maximumFractionDigits: 0,
    }).format(pence / 100);
  }
  return formatMoney(pence);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Accepts "2026-10-13", a full ISO timestamp or a Date. Date-only strings are read as local dates. */
export function toDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  return new Date(value);
}

/** "Tue 13 Oct" (adds the year if it isn't this year: "Tue 13 Oct 2025"). */
export function formatDate(value: string | Date, now: Date = new Date()): string {
  const d = toDate(value);
  const base = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** "Tue 13 Oct 2026", always with the year — for documents. */
export function formatDateLong(value: string | Date): string {
  const d = toDate(value);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Tue 13 Oct, 2:05pm" */
export function formatDateTime(value: string | Date, now: Date = new Date()): string {
  const d = toDate(value);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const time = `${h % 12 === 0 ? 12 : h % 12}:${m}${h < 12 ? 'am' : 'pm'}`;
  return `${formatDate(d, now)}, ${time}`;
}

/** "today", "yesterday", "3 days ago", "2 weeks ago". */
export function formatAgo(value: string | Date, now: Date = new Date()): string {
  const d = toDate(value);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return formatDate(d, now);
}

/** Local date as "YYYY-MM-DD". */
export function isoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(date: string | Date, days: number): Date {
  const d = toDate(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Full UK postcode check (also allows the special GIR 0AA). Case and spacing are ignored. */
const POSTCODE_RE = /^(GIR ?0AA|[A-PR-UWYZ]([0-9]{1,2}|[A-HK-Y][0-9]{1,2}|[0-9][A-HJKPSTUW]|[A-HK-Y][0-9][ABEHMNPRV-Y]) ?[0-9][ABD-HJLNP-UW-Z]{2})$/i;

export function isValidPostcode(input: string): boolean {
  return POSTCODE_RE.test(input.trim());
}

/** "hd12ab" → "HD1 2AB" */
export function formatPostcode(input: string): string {
  const compact = input.replace(/\s+/g, '').toUpperCase();
  if (compact.length < 5) return compact;
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

/** UK phone: digits, spaces, +, brackets, hyphens; 10–11 digits once tidied (or +44…). */
export function isValidUkPhone(input: string): boolean {
  const digits = input.replace(/[\s()-]/g, '');
  return /^(\+44\d{9,10}|0\d{9,10})$/.test(digits);
}

/** "07700900123" → "07700 900123" */
export function formatPhone(input: string): string {
  const digits = input.replace(/[\s()-]/g, '');
  if (/^07\d{9}$/.test(digits)) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (/^01\d{9}$/.test(digits)) return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (/^0[23]\d{9}$/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
  return input.trim();
}

/** Units as shown to people. */
export const UNIT_LABELS: Record<string, string> = {
  m2: 'm²',
  m: 'm',
  each: 'each',
  day: 'day',
  hour: 'hour',
  item: 'item',
};

export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}

/** Sort code "112233" → "11-22-33" */
export function formatSortCode(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length !== 6) return input;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
}
