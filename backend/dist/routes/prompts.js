"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const promptService_1 = require("../services/promptService");
const aiModelCatalog_1 = require("../services/aiModelCatalog");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware);
router.get('/', async (_req, res) => {
    try {
        const prompts = await (0, promptService_1.listPrompts)();
        res.json(prompts);
    }
    catch (error) {
        console.error('Error fetching prompts:', error);
        res.status(500).json({ error: 'Failed to fetch prompts' });
    }
});
router.post('/validate', async (req, res) => {
    try {
        const validation = await (0, promptService_1.validatePromptDraft)(req.body);
        res.json(validation);
    }
    catch (error) {
        console.error('Error validating prompt draft:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to validate prompt',
        });
    }
});
router.post('/preview', async (req, res) => {
    try {
        const preview = await (0, promptService_1.previewPrompt)(req.body);
        res.json(preview);
    }
    catch (error) {
        console.error('Error generating prompt preview:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to generate prompt preview',
        });
    }
});
router.get('/models', (_req, res) => {
    res.json((0, aiModelCatalog_1.listAIModelOptions)());
});
router.get('/:id', async (req, res) => {
    try {
        const prompt = await (0, promptService_1.getPromptById)(req.params.id);
        if (!prompt) {
            res.status(404).json({ error: 'Prompt not found' });
            return;
        }
        res.json(prompt);
    }
    catch (error) {
        console.error('Error fetching prompt:', error);
        res.status(500).json({ error: 'Failed to fetch prompt' });
    }
});
router.post('/', async (req, res) => {
    try {
        const prompt = await (0, promptService_1.createPrompt)(req.body);
        res.status(201).json(prompt);
    }
    catch (error) {
        console.error('Error creating prompt:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to create prompt',
        });
    }
});
router.put('/:id', async (req, res) => {
    try {
        const prompt = await (0, promptService_1.updatePrompt)(req.params.id, req.body);
        if (!prompt) {
            res.status(404).json({ error: 'Prompt not found' });
            return;
        }
        res.json(prompt);
    }
    catch (error) {
        console.error('Error updating prompt:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to update prompt',
        });
    }
});
router.delete('/:id', async (req, res) => {
    try {
        const deleted = await (0, promptService_1.deletePrompt)(req.params.id);
        if (!deleted) {
            res.status(404).json({ error: 'Prompt not found' });
            return;
        }
        res.json({ message: 'Prompt deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting prompt:', error);
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to delete prompt',
        });
    }
});
exports.default = router;
//# sourceMappingURL=prompts.js.map