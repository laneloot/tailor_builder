"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const googleSheets_1 = require("../integrations/googleSheets");
const router = (0, express_1.Router)();
router.post('/', async (req, res) => {
    try {
        const result = await (0, googleSheets_1.fetchGoogleSheetsRange)(req.body ?? {});
        res.json(result);
    }
    catch (error) {
        const statusCode = error instanceof googleSheets_1.GoogleSheetsRequestError ? error.statusCode : 500;
        res.status(statusCode).json({
            error: error instanceof Error ? error.message : 'Failed to import Google Sheets data',
        });
    }
});
exports.default = router;
//# sourceMappingURL=import.js.map