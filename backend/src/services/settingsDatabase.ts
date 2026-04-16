import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { AIProvider } from '../types/template';

export type StoredApiKeyRow = {
  id: string;
  provider: AIProvider;
  name: string;
  keyValue: string;
  isActive: boolean;
  createdAt: string;
};

export type StoredGoogleSheetRow = {
  id: string;
  name: string;
  sheetId: string;
  createdAt: string;
  updatedAt: string;
};

const CONFIG_DIR = path.join(__dirname, '../../data/config');
const DATABASE_FILE = path.join(CONFIG_DIR, 'settings.sqlite');
const SCHEMA_FILE = path.join(__dirname, '../../db/001_initial_schema.sql');

let database: DatabaseSync | null = null;
let schemaInitialized = false;

function getDatabase(): DatabaseSync {
  if (!database) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    database = new DatabaseSync(DATABASE_FILE);
    database.exec('PRAGMA foreign_keys = ON;');
  }

  if (!schemaInitialized) {
    const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
    database.exec(schemaSql);
    schemaInitialized = true;
  }

  return database;
}

function withTransaction<T>(work: () => T): T {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');

  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function ensureSettingsDatabase(): void {
  getDatabase();
}

export function readStoredApiKeys(): StoredApiKeyRow[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      id,
      provider,
      name,
      key_value AS keyValue,
      is_active AS isActive,
      created_at AS createdAt
    FROM api_keys
    ORDER BY provider ASC, created_at ASC, id ASC
  `).all() as Array<{
    id: string;
    provider: AIProvider;
    name: string;
    keyValue: string;
    isActive: number;
    createdAt: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    provider: row.provider,
    name: row.name,
    keyValue: row.keyValue,
    isActive: row.isActive === 1,
    createdAt: row.createdAt,
  }));
}

export function replaceStoredApiKeys(rows: StoredApiKeyRow[]): void {
  withTransaction(() => {
    const db = getDatabase();
    db.exec('DELETE FROM api_keys');

    if (rows.length === 0) {
      return;
    }

    const insert = db.prepare(`
      INSERT INTO api_keys (id, provider, name, key_value, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const row of rows) {
      insert.run(
        row.id,
        row.provider,
        row.name,
        row.keyValue,
        row.isActive ? 1 : 0,
        row.createdAt
      );
    }
  });
}

export function countStoredApiKeys(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) AS count FROM api_keys').get() as { count: number };
  return row.count;
}

export function readStoredGoogleSheetRows(): StoredGoogleSheetRow[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      id,
      name,
      sheet_id AS sheetId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM google_sheet_ids
    ORDER BY updated_at DESC, created_at DESC, id ASC
  `).all() as Array<{
    id: string;
    name: string;
    sheetId: string;
    createdAt: string;
    updatedAt: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sheetId: row.sheetId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export function replaceStoredGoogleSheetRows(rows: StoredGoogleSheetRow[]): void {
  withTransaction(() => {
    const db = getDatabase();
    db.exec('DELETE FROM google_sheet_ids');

    if (rows.length === 0) {
      return;
    }

    const insert = db.prepare(`
      INSERT INTO google_sheet_ids (id, name, sheet_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const row of rows) {
      insert.run(row.id, row.name, row.sheetId, row.createdAt, row.updatedAt);
    }
  });
}

export function countStoredGoogleSheetRows(): number {
  const db = getDatabase();
  const row = db.prepare('SELECT COUNT(*) AS count FROM google_sheet_ids').get() as { count: number };
  return row.count;
}
