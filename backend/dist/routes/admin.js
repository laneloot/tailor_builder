"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const aiModelConfig_1 = require("../services/aiModelConfig");
const googleSheets_1 = require("../services/googleSheets");
const nativeDirectoryPicker_1 = require("../services/nativeDirectoryPicker");
const router = (0, express_1.Router)();
// Login
router.post('/login', (req, res) => {
    const { password } = req.body;
    if (!password) {
        res.status(400).json({ error: 'Password is required' });
        return;
    }
    if (!(0, auth_1.validatePassword)(password)) {
        res.status(401).json({ error: 'Invalid password' });
        return;
    }
    const token = (0, auth_1.generateToken)();
    res.json({ token, message: 'Login successful' });
});
// Logout
router.post('/logout', auth_1.authMiddleware, (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        (0, auth_1.invalidateToken)(token);
    }
    res.json({ message: 'Logout successful' });
});
// Verify token
router.get('/verify', auth_1.authMiddleware, (req, res) => {
    res.json({ valid: true });
});
// Get admin settings (protected)
router.get(['/settings', '/ai-models'], auth_1.authMiddleware, async (_req, res) => {
    try {
        const settings = await (0, aiModelConfig_1.getAdminAppSettings)();
        res.json(settings);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to load settings' });
    }
});
router.post('/browse-output-directory', auth_1.authMiddleware, async (req, res) => {
    try {
        const currentPath = typeof req.body?.currentPath === 'string' ? req.body.currentPath : undefined;
        const result = await (0, nativeDirectoryPicker_1.openNativeDirectoryPicker)(currentPath);
        res.json(result);
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to open native folder picker',
        });
    }
});
router.post('/google-sheets/range', auth_1.authMiddleware, async (req, res) => {
    try {
        const result = await (0, googleSheets_1.fetchGoogleSheetsRange)(req.body ?? {});
        res.json(result);
    }
    catch (error) {
        const statusCode = error instanceof googleSheets_1.GoogleSheetsRequestError ? error.statusCode : 500;
        res.status(statusCode).json({
            error: error instanceof Error ? error.message : 'Failed to fetch Google Sheets data',
        });
    }
});
router.put('/google-sheets/range', auth_1.authMiddleware, async (req, res) => {
    try {
        const result = await (0, googleSheets_1.updateGoogleSheetsRange)(req.body ?? {});
        res.json(result);
    }
    catch (error) {
        const statusCode = error instanceof googleSheets_1.GoogleSheetsRequestError ? error.statusCode : 500;
        res.status(statusCode).json({
            error: error instanceof Error ? error.message : 'Failed to update Google Sheets data',
        });
    }
});
// Update admin settings (protected)
router.put(['/settings', '/ai-models'], auth_1.authMiddleware, async (req, res) => {
    try {
        const settings = await (0, aiModelConfig_1.updateAppSettings)(req.body ?? {});
        res.json(settings);
    }
    catch (error) {
        res.status(400).json({
            error: error instanceof Error ? error.message : 'Failed to update settings',
        });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map