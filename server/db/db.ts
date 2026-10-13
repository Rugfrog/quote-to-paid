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
  return db;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Booleans are stored as 0/1 in SQLite. */
export const bool = (v: boolean | undefined) => (v === undefined ? undefined : v ? 1 : 0);
