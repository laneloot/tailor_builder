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
class SkillDatabaseError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'SkillDatabaseError';
    }
}
exports.SkillDatabaseError = SkillDatabaseError;
const DATA_DIR = process.env.TAILOR_DATA_DIR
    ? path_1.default.resolve(process.env.TAILOR_DATA_DIR)
    : path_1.default.join(__dirname, '../../data');
const SKILLS_DIR = path_1.default.join(DATA_DIR, 'skills');
const SKILLS_FILE = path_1.default.join(SKILLS_DIR, 'skills.json');
function cleanSkill(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function normalizeSkillValue(value) {
    return value.trim().toLowerCase();
}
function normalizeSkillList(input) {
    const source = Array.isArray(input) ? input : [];
    const seen = new Set();
    const skills = [];
    for (const item of source) {
        const skill = cleanSkill(item);
        if (!skill)
            continue;
        const key = normalizeSkillValue(skill);
        if (seen.has(key))
            continue;
        seen.add(key);
        skills.push(skill);
    }
    return skills.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}
function normalizeStore(input) {
    const source = typeof input === 'object' && input !== null
        ? input
        : {};
    return {
        hard: normalizeSkillList(source.hard),
        soft: normalizeSkillList(source.soft),
    };
}
function ensureSkillsFile() {
    fs_1.default.mkdirSync(SKILLS_DIR, { recursive: true });
    if (!fs_1.default.existsSync(SKILLS_FILE)) {
        writeStore({ hard: [], soft: [] });
    }
}
function readStore() {
    ensureSkillsFile();
    try {
        const parsed = JSON.parse(fs_1.default.readFileSync(SKILLS_FILE, 'utf8'));
        return normalizeStore(parsed);
    }
    catch {
        return { hard: [], soft: [] };
    }
}
function writeStore(store) {
    fs_1.default.mkdirSync(SKILLS_DIR, { recursive: true });
    fs_1.default.writeFileSync(SKILLS_FILE, `${JSON.stringify(normalizeStore(store), null, 2)}\n`, 'utf8');
}
function findSkillIndex(skills, skill) {
    const normalized = normalizeSkillValue(skill);
    return skills.findIndex((item) => normalizeSkillValue(item) === normalized);
}
function ensureSkillsDatabase() {
    ensureSkillsFile();
}
function isSkillType(value) {
    return value === 'hard' || value === 'soft';
}
function readSkills(type) {
    return readStore()[type];
}
function addSkill(type, skill) {
    const cleaned = cleanSkill(skill);
    if (!cleaned) {
        throw new SkillDatabaseError('Skill type and value are required', 400);
    }
    const store = readStore();
    if (findSkillIndex(store[type], cleaned) !== -1) {
        return { added: false, skill: cleaned, type };
    }
    store[type].push(cleaned);
    writeStore(store);
    return { added: true, skill: cleaned, type };
}
function updateSkill(type, original, skill) {
    const cleanedOriginal = cleanSkill(original);
    const cleaned = cleanSkill(skill);
    if (!cleanedOriginal || !cleaned) {
        throw new SkillDatabaseError('Skill type, original value, and new value are required', 400);
    }
    const store = readStore();
    const originalIndex = findSkillIndex(store[type], cleanedOriginal);
    if (originalIndex === -1) {
        throw new SkillDatabaseError('Skill not found', 404);
    }
    const duplicateIndex = findSkillIndex(store[type], cleaned);
    if (duplicateIndex !== -1 && duplicateIndex !== originalIndex) {
        throw new SkillDatabaseError('Skill already exists', 409);
    }
    store[type][originalIndex] = cleaned;
    writeStore(store);
    return { updated: true, skill: cleaned, type };
}
function deleteSkill(type, skill) {
    const cleaned = cleanSkill(skill);
    if (!cleaned) {
        throw new SkillDatabaseError('Skill type and value are required', 400);
    }
    const store = readStore();
    const index = findSkillIndex(store[type], cleaned);
    if (index === -1) {
        throw new SkillDatabaseError('Skill not found', 404);
    }
    store[type].splice(index, 1);
    writeStore(store);
    return { deleted: true, skill: cleaned, type };
}
//# sourceMappingURL=skillsDatabase.js.map