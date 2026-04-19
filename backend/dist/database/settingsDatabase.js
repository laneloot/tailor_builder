"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureSettingsDatabase = ensureSettingsDatabase;
exports.readStoredApiKeys = readStoredApiKeys;
exports.replaceStoredApiKeys = replaceStoredApiKeys;
exports.countStoredApiKeys = countStoredApiKeys;
exports.readStoredGoogleSheetRows = readStoredGoogleSheetRows;
exports.replaceStoredGoogleSheetRows = replaceStoredGoogleSheetRows;
exports.countStoredGoogleSheetRows = countStoredGoogleSheetRows;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const node_sqlite_1 = require("node:sqlite");
const CONFIG_DIR = path_1.default.join(__dirname, '../../data/config');
const DATABASE_FILE = path_1.default.join(CONFIG_DIR, 'settings.sqlite');
const SCHEMA_FILE = path_1.default.join(__dirname, '../../db/001_initial_schema.sql');
let database = null;
let schemaInitialized = false;
function getDatabase() {
    if (!database) {
        fs_1.default.mkdirSync(CONFIG_DIR, { recursive: true });
        database = new node_sqlite_1.DatabaseSync(DATABASE_FILE);
        database.exec('PRAGMA foreign_keys = ON;');
    }
    if (!schemaInitialized) {
        const schemaSql = fs_1.default.readFileSync(SCHEMA_FILE, 'utf8');
        database.exec(schemaSql);
        schemaInitialized = true;
    }
    return database;
}
function withTransaction(work) {
    const db = getDatabase();
    db.exec('BEGIN IMMEDIATE');
    try {
        const result = work();
        db.exec('COMMIT');
        return result;
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}
function ensureSettingsDatabase() {
    getDatabase();
}
function readStoredApiKeys() {
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
  `).all();
    return rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        name: row.name,
        keyValue: row.keyValue,
        isActive: row.isActive === 1,
        createdAt: row.createdAt,
    }));
}
function replaceStoredApiKeys(rows) {
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
            insert.run(row.id, row.provider, row.name, row.keyValue, row.isActive ? 1 : 0, row.createdAt);
        }
    });
}
function countStoredApiKeys() {
    const db = getDatabase();
    const row = db.prepare('SELECT COUNT(*) AS count FROM api_keys').get();
    return row.count;
}
function readStoredGoogleSheetRows() {
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
  `).all();
    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        sheetId: row.sheetId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    }));
}
function replaceStoredGoogleSheetRows(rows) {
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
function countStoredGoogleSheetRows() {
    const db = getDatabase();
    const row = db.prepare('SELECT COUNT(*) AS count FROM google_sheet_ids').get();
    return row.count;
}
//# sourceMappingURL=settingsDatabase.js.map