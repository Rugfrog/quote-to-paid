import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type DB = Database.Database;

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '..', '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const DEFAULT_DB_PATH = path.join(DATA_DIR, 'app.db');

/** Open (and create if needed) the database, applying the schema. Use ':memory:' in tests. */
export function openDb(dbPath: string = process.env.DB_PATH ?? DEFAULT_DB_PATH): DB {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
  migrate(db);
  return db;
}

/** Columns added after a table was first created. CREATE TABLE IF NOT EXISTS won't add them to old databases. */
const ADDED_COLUMNS: { table: string; column: string; definition: string }[] = [
  { table: 'quotes', column: 'brief', definition: "TEXT NOT NULL DEFAULT ''" },
];

function migrate(db: Database.Database): void {
  for (const { table, column, definition } of ADDED_COLUMNS) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Booleans are stored as 0/1 in SQLite. */
export const bool = (v: boolean | undefined) => (v === undefined ? undefined : v ? 1 : 0);
