"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillDatabaseError = void 0;
exports.ensureSkillsDatabase = ensureSkillsDatabase;
exports.isSkillType = isSkillType;
exports.readSkills = readSkills;
exports.addSkill = addSkill;
exports.updateSkill = updateSkill;
exports.deleteSkill = deleteSkill;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const node_sqlite_1 = require("node:sqlite");
class SkillDatabaseError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'SkillDatabaseError';
    }
}
exports.SkillDatabaseError = SkillDatabaseError;
const DB_DIR = path_1.default.join(__dirname, '../../db');
const DATABASE_FILE = path_1.default.join(DB_DIR, 'skills.sqlite');
const SCHEMA_FILE = path_1.default.join(DB_DIR, '002_skills_schema.sql');
const SEED_FILES = {
    hard: path_1.default.join(__dirname, '../../skill_data/tech_skills.txt'),
    soft: path_1.default.join(__dirname, '../../skill_data/soft_skills.txt'),
};
let database = null;
let schemaInitialized = false;
let seedInitialized = false;
function cleanSkill(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function normalizeSkillValue(value) {
    return value.trim().toLowerCase();
}
function mapSkillRow(row) {
    return {
        id: row.id,
        type: row.type,
        value: row.value,
        normalizedValue: row.normalizedValue,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
function readSeedSkills(type) {
    if (!fs_1.default.existsSync(SEED_FILES[type])) {
        return [];
    }
    const seen = new Set();
    const skills = [];
    const content = fs_1.default.readFileSync(SEED_FILES[type], 'utf8');
    for (const rawSkill of content.split(/\r?\n/)) {
        const skill = cleanSkill(rawSkill);
        if (!skill)
            continue;
        const key = normalizeSkillValue(skill);
        if (seen.has(key))
            continue;
        seen.add(key);
        skills.push(skill);
    }
    return skills;
}
function seedSkillsIfEmpty(db) {
    if (seedInitialized) {
        return;
    }
    const row = db.prepare('SELECT COUNT(*) AS count FROM skills').get();
    if (row.count > 0) {
        seedInitialized = true;
        return;
    }
    const now = new Date().toISOString();
    const insert = db.prepare(`
    INSERT OR IGNORE INTO skills (id, type, value, normalized_value, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
    db.exec('BEGIN IMMEDIATE');
    try {
        for (const type of ['hard', 'soft']) {
            for (const skill of readSeedSkills(type)) {
                insert.run((0, crypto_1.randomUUID)(), type, skill, normalizeSkillValue(skill), now, now);
            }
        }
        db.exec('COMMIT');
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
    seedInitialized = true;
}
function getDatabase() {
    if (!database) {
        fs_1.default.mkdirSync(DB_DIR, { recursive: true });
        database = new node_sqlite_1.DatabaseSync(DATABASE_FILE);
        database.exec('PRAGMA foreign_keys = ON;');
    }
    if (!schemaInitialized) {
        const schemaSql = fs_1.default.readFileSync(SCHEMA_FILE, 'utf8');
        database.exec(schemaSql);
        schemaInitialized = true;
    }
    seedSkillsIfEmpty(database);
    return database;
}
function withTransaction(work) {
    const db = getDatabase();
    db.exec('BEGIN IMMEDIATE');
    try {
        const result = work(db);
        db.exec('COMMIT');
        return result;
    }
    catch (error) {
        db.exec('ROLLBACK');
        throw error;
    }
}
function getSkillByNormalizedValue(db, type, normalizedValue) {
    const row = db.prepare(`
    SELECT
      id,
      type,
      value,
      normalized_value AS normalizedValue,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM skills
    WHERE type = ? AND normalized_value = ?
  `).get(type, normalizedValue);
    return row ? mapSkillRow(row) : null;
}
function ensureSkillsDatabase() {
    getDatabase();
}
function isSkillType(value) {
    return value === 'hard' || value === 'soft';
}
function readSkills(type) {
    const db = getDatabase();
    const rows = db.prepare(`
    SELECT value
    FROM skills
    WHERE type = ?
    ORDER BY value COLLATE NOCASE ASC
  `).all(type);
    return rows.map((row) => row.value);
}
function addSkill(type, skill) {
    const cleaned = cleanSkill(skill);
    if (!cleaned) {
        throw new SkillDatabaseError('Skill type and value are required', 400);
    }
    return withTransaction((db) => {
        const normalizedValue = normalizeSkillValue(cleaned);
        const existing = getSkillByNormalizedValue(db, type, normalizedValue);
        if (existing) {
            return { added: false, skill: cleaned, type };
        }
        const now = new Date().toISOString();
        db.prepare(`
      INSERT INTO skills (id, type, value, normalized_value, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run((0, crypto_1.randomUUID)(), type, cleaned, normalizedValue, now, now);
        return { added: true, skill: cleaned, type };
    });
}
function updateSkill(type, original, skill) {
    const cleanedOriginal = cleanSkill(original);
    const cleaned = cleanSkill(skill);
    if (!cleanedOriginal || !cleaned) {
        throw new SkillDatabaseError('Skill type, original value, and new value are required', 400);
    }
    return withTransaction((db) => {
        const originalNormalizedValue = normalizeSkillValue(cleanedOriginal);
        const existing = getSkillByNormalizedValue(db, type, originalNormalizedValue);
        if (!existing) {
            throw new SkillDatabaseError('Skill not found', 404);
        }
        const nextNormalizedValue = normalizeSkillValue(cleaned);
        const duplicate = getSkillByNormalizedValue(db, type, nextNormalizedValue);
        if (duplicate && duplicate.id !== existing.id) {
            throw new SkillDatabaseError('Skill already exists', 409);
        }
        db.prepare(`
      UPDATE skills
      SET value = ?, normalized_value = ?, updated_at = ?
      WHERE id = ?
    `).run(cleaned, nextNormalizedValue, new Date().toISOString(), existing.id);
        return { updated: true, skill: cleaned, type };
    });
}
function deleteSkill(type, skill) {
    const cleaned = cleanSkill(skill);
    if (!cleaned) {
        throw new SkillDatabaseError('Skill type and value are required', 400);
    }
    return withTransaction((db) => {
        const existing = getSkillByNormalizedValue(db, type, normalizeSkillValue(cleaned));
        if (!existing) {
            throw new SkillDatabaseError('Skill not found', 404);
        }
        db.prepare('DELETE FROM skills WHERE id = ?').run(existing.id);
        return { deleted: true, skill: cleaned, type };
    });
}
//# sourceMappingURL=skillsDatabase.js.map