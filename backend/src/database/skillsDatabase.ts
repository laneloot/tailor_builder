import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { DatabaseSync } from 'node:sqlite';

export type SkillType = 'hard' | 'soft';

export type SkillMutationResult = {
  skill: string;
  type: SkillType;
};

export type AddSkillResult = SkillMutationResult & {
  added: boolean;
};

export type UpdateSkillResult = SkillMutationResult & {
  updated: boolean;
};

export type DeleteSkillResult = SkillMutationResult & {
  deleted: boolean;
};

type SkillRow = {
  id: string;
  type: SkillType;
  value: string;
  normalizedValue: string;
  createdAt: string;
  updatedAt: string;
};

type RawSkillRow = {
  id: string;
  type: SkillType;
  value: string;
  normalizedValue: string;
  createdAt: string;
  updatedAt: string;
};

export class SkillDatabaseError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'SkillDatabaseError';
  }
}

const DB_DIR = path.join(__dirname, '../../db');
const DATABASE_FILE = path.join(DB_DIR, 'skills.sqlite');
const SCHEMA_FILE = path.join(DB_DIR, '002_skills_schema.sql');
const SEED_FILES: Record<SkillType, string> = {
  hard: path.join(__dirname, '../../skill_data/tech_skills.txt'),
  soft: path.join(__dirname, '../../skill_data/soft_skills.txt'),
};

let database: DatabaseSync | null = null;
let schemaInitialized = false;
let seedInitialized = false;

function cleanSkill(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSkillValue(value: string): string {
  return value.trim().toLowerCase();
}

function mapSkillRow(row: RawSkillRow): SkillRow {
  return {
    id: row.id,
    type: row.type,
    value: row.value,
    normalizedValue: row.normalizedValue,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function readSeedSkills(type: SkillType): string[] {
  if (!fs.existsSync(SEED_FILES[type])) {
    return [];
  }

  const seen = new Set<string>();
  const skills: string[] = [];
  const content = fs.readFileSync(SEED_FILES[type], 'utf8');

  for (const rawSkill of content.split(/\r?\n/)) {
    const skill = cleanSkill(rawSkill);
    if (!skill) continue;

    const key = normalizeSkillValue(skill);
    if (seen.has(key)) continue;

    seen.add(key);
    skills.push(skill);
  }

  return skills;
}

function seedSkillsIfEmpty(db: DatabaseSync): void {
  if (seedInitialized) {
    return;
  }

  const row = db.prepare('SELECT COUNT(*) AS count FROM skills').get() as { count: number };
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
    for (const type of ['hard', 'soft'] as const) {
      for (const skill of readSeedSkills(type)) {
        insert.run(randomUUID(), type, skill, normalizeSkillValue(skill), now, now);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  seedInitialized = true;
}

function getDatabase(): DatabaseSync {
  if (!database) {
    fs.mkdirSync(DB_DIR, { recursive: true });
    database = new DatabaseSync(DATABASE_FILE);
    database.exec('PRAGMA foreign_keys = ON;');
  }

  if (!schemaInitialized) {
    const schemaSql = fs.readFileSync(SCHEMA_FILE, 'utf8');
    database.exec(schemaSql);
    schemaInitialized = true;
  }

  seedSkillsIfEmpty(database);
  return database;
}

function withTransaction<T>(work: (db: DatabaseSync) => T): T {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');

  try {
    const result = work(db);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function getSkillByNormalizedValue(db: DatabaseSync, type: SkillType, normalizedValue: string): SkillRow | null {
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
  `).get(type, normalizedValue) as RawSkillRow | undefined;

  return row ? mapSkillRow(row) : null;
}

export function ensureSkillsDatabase(): void {
  getDatabase();
}

export function isSkillType(value: unknown): value is SkillType {
  return value === 'hard' || value === 'soft';
}

export function readSkills(type: SkillType): string[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT value
    FROM skills
    WHERE type = ?
    ORDER BY value COLLATE NOCASE ASC
  `).all(type) as Array<{ value: string }>;

  return rows.map((row) => row.value);
}

export function addSkill(type: SkillType, skill: string): AddSkillResult {
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
    `).run(randomUUID(), type, cleaned, normalizedValue, now, now);

    return { added: true, skill: cleaned, type };
  });
}

export function updateSkill(type: SkillType, original: string, skill: string): UpdateSkillResult {
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

export function deleteSkill(type: SkillType, skill: string): DeleteSkillResult {
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
