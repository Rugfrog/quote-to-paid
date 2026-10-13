import type { DB } from '../db/db';

export type DocKind = 'quote' | 'job' | 'invoice';

const TABLE: Record<DocKind, string> = { quote: 'quotes', job: 'jobs', invoice: 'invoices' };

/**
 * Take the next number for a document (Q-0001, J-0001, INV-0001) and move the counter on.
 * Call inside a transaction with the insert, so two documents never share a number.
 */
export function takeNextRef(db: DB, kind: DocKind): { number: number; ref: string } {
  const row = db
    .prepare(`SELECT ${kind}_prefix AS prefix, ${kind}_next AS next FROM business WHERE id = 1`)
    .get() as { prefix: string; next: number };
  // Never reuse a number already taken (e.g. if someone lowered the counter by hand).
  const max = (db.prepare(`SELECT COALESCE(MAX(number), 0) AS max FROM ${TABLE[kind]}`).get() as { max: number }).max;
  let number = Math.max(row.next, max + 1);
  let ref = formatRef(row.prefix, number);
  while (db.prepare(`SELECT 1 FROM ${TABLE[kind]} WHERE ref = ?`).get(ref)) {
    number++;
    ref = formatRef(row.prefix, number);
  }
  db.prepare(`UPDATE business SET ${kind}_next = ? WHERE id = 1`).run(number + 1);
  return { number, ref };
}

export function formatRef(prefix: string, number: number): string {
  return `${prefix}${String(number).padStart(4, '0')}`;
}

/** The lowest starting number allowed in settings (one past the highest number used). */
export function minimumNext(db: DB, kind: DocKind): number {
  return (db.prepare(`SELECT COALESCE(MAX(number), 0) + 1 AS n FROM ${TABLE[kind]}`).get() as { n: number }).n;
}
