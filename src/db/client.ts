import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(here, './schema.sql');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const path = process.env.OHZ_DB_PATH ?? './ohz.db';
  db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}

export function initSchema(): void {
  const sql = readFileSync(SCHEMA_PATH, 'utf8');
  getDb().exec(sql);
}
