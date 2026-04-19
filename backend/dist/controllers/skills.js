"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listSkills = listSkills;
exports.confirmSkill = confirmSkill;
exports.createSkill = createSkill;
exports.updateSkillHandler = updateSkillHandler;
exports.deleteSkillHandler = deleteSkillHandler;
const skillsDatabase_1 = require("../database/skillsDatabase");
const pdfGenerator_1 = require("../generators/pdfGenerator");
const claude_1 = require("../services/claude");
function parseSkillValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function sendSkillError(res, error, fallbackMessage) {
    if (error instanceof skillsDatabase_1.SkillDatabaseError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
    }
    console.error(fallbackMessage, error);
    res.status(500).json({ error: fallbackMessage });
}
function refreshCachesForType(type) {
    (0, claude_1.refreshSkillCaches)();
    if (type === 'hard') {
        (0, pdfGenerator_1.refreshAllowedTechSkills)();
    }
}
function listSkills(req, res) {
    try {
        const { type } = req.query;
        if (!(0, skillsDatabase_1.isSkillType)(type)) {
            res.status(400).json({ error: 'Skill type is required' });
            return;
        }
        res.json({ skills: (0, skillsDatabase_1.readSkills)(type) });
    }
    catch (error) {
        sendSkillError(res, error, 'Failed to read skills');
    }
}
function confirmSkill(req, res) {
    try {
        const { type, skill } = req.body;
        if (!(0, skillsDatabase_1.isSkillType)(type) || !parseSkillValue(skill)) {
            res.status(400).json({ error: 'Skill type and value are required' });
            return;
        }
        const result = (0, skillsDatabase_1.addSkill)(type, parseSkillValue(skill));
        if (result.added) {
            refreshCachesForType(type);
        }
        res.json(result);
    }
    catch (error) {
        sendSkillError(res, error, 'Failed to confirm skill');
    }
}
function createSkill(req, res) {
    try {
        const { type, skill } = req.body;
        if (!(0, skillsDatabase_1.isSkillType)(type) || !parseSkillValue(skill)) {
            res.status(400).json({ error: 'Skill type and value are required' });
            return;
        }
        const result = (0, skillsDatabase_1.addSkill)(type, parseSkillValue(skill));
        if (result.added) {
            refreshCachesForType(type);
        }
        res.json(result);
    }
    catch (error) {
        sendSkillError(res, error, 'Failed to add skill');
    }
}
function updateSkillHandler(req, res) {
    try {
        const { type, original, skill } = req.body;
        if (!(0, skillsDatabase_1.isSkillType)(type) || !parseSkillValue(original) || !parseSkillValue(skill)) {
            res.status(400).json({ error: 'Skill type, original value, and new value are required' });
            return;
        }
        const result = (0, skillsDatabase_1.updateSkill)(type, parseSkillValue(original), parseSkillValue(skill));
        refreshCachesForType(type);
        res.json(result);
    }
    catch (error) {
        sendSkillError(res, error, 'Failed to update skill');
    }
}
function deleteSkillHandler(req, res) {
    try {
        const { type, skill } = req.body;
        if (!(0, skillsDatabase_1.isSkillType)(type) || !parseSkillValue(skill)) {
            res.status(400).json({ error: 'Skill type and value are required' });
            return;
        }
        const result = (0, skillsDatabase_1.deleteSkill)(type, parseSkillValue(skill));
        refreshCachesForType(type);
        res.json(result);
    }
    catch (error) {
        sendSkillError(res, error, 'Failed to delete skill');
    }
}
//# sourceMappingURL=skills.js.map