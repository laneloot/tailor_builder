"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
const GROUPS_DIR = path_1.default.join(__dirname, '../../data/groups');
async function ensureGroupsDir() {
    try {
        await promises_1.default.access(GROUPS_DIR);
    }
    catch {
        await promises_1.default.mkdir(GROUPS_DIR, { recursive: true });
    }
}
function normalizeProfileIds(input) {
    if (!Array.isArray(input))
        return [];
    const seen = new Set();
    const ids = [];
    for (const item of input) {
        if (typeof item !== 'string')
            continue;
        const id = item.trim();
        if (!id || seen.has(id))
            continue;
        seen.add(id);
        ids.push(id);
    }
    return ids;
}
function normalizeGroupPayload(input, existing) {
    return {
        name: typeof input.name === 'string' && input.name.trim()
            ? input.name.trim()
            : (existing?.name ?? 'Untitled Group'),
        profileIds: normalizeProfileIds(input.profileIds ?? existing?.profileIds ?? []),
    };
}
router.get('/', async (_req, res) => {
    try {
        await ensureGroupsDir();
        const files = await promises_1.default.readdir(GROUPS_DIR);
        const groups = [];
        for (const file of files) {
            if (!file.endsWith('.json'))
                continue;
            try {
                const content = await promises_1.default.readFile(path_1.default.join(GROUPS_DIR, file), 'utf-8');
                groups.push(JSON.parse(content));
            }
            catch {
                // Skip invalid files
            }
        }
        groups.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        res.json(groups);
    }
    catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});
router.get('/:id', async (req, res) => {
    try {
        const filePath = path_1.default.join(GROUPS_DIR, `${req.params.id}.json`);
        const content = await promises_1.default.readFile(filePath, 'utf-8');
        res.json(JSON.parse(content));
    }
    catch {
        res.status(404).json({ error: 'Group not found' });
    }
});
router.post('/', async (req, res) => {
    try {
        await ensureGroupsDir();
        const input = req.body;
        const normalized = normalizeGroupPayload(input);
        if (!normalized.name) {
            res.status(400).json({ error: 'Group name is required' });
            return;
        }
        const now = new Date().toISOString();
        const group = {
            ...normalized,
            id: (0, uuid_1.v4)(),
            createdAt: now,
            updatedAt: now,
        };
        const filePath = path_1.default.join(GROUPS_DIR, `${group.id}.json`);
        await promises_1.default.writeFile(filePath, JSON.stringify(group, null, 2));
        res.status(201).json(group);
    }
    catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ error: 'Failed to create group' });
    }
});
router.put('/:id', async (req, res) => {
    try {
        await ensureGroupsDir();
        const filePath = path_1.default.join(GROUPS_DIR, `${req.params.id}.json`);
        const existingContent = await promises_1.default.readFile(filePath, 'utf-8');
        const existing = JSON.parse(existingContent);
        const normalized = normalizeGroupPayload(req.body, existing);
        const updated = {
            ...normalized,
            id: existing.id,
            createdAt: existing.createdAt,
            updatedAt: new Date().toISOString(),
        };
        await promises_1.default.writeFile(filePath, JSON.stringify(updated, null, 2));
        res.json(updated);
    }
    catch {
        res.status(404).json({ error: 'Group not found' });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const filePath = path_1.default.join(GROUPS_DIR, `${req.params.id}.json`);
        await promises_1.default.unlink(filePath);
        res.json({ message: 'Group deleted successfully' });
    }
    catch {
        res.status(404).json({ error: 'Group not found' });
    }
});
exports.default = router;
//# sourceMappingURL=groups.js.map