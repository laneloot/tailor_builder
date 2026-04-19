"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGeneratedOutputPath = getGeneratedOutputPath;
exports.getGeneratedFilePath = getGeneratedFilePath;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const outputStorage_1 = require("./outputStorage");
const aiModelConfig_1 = require("../config/aiModelConfig");
function getCurrentDateFolder() {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}
async function getGeneratedOutputPath(profile, companyName, role) {
    const { outputBaseDir, outputPathTemplate } = await (0, aiModelConfig_1.getOutputStorageSettings)();
    const profileSlug = (0, outputStorage_1.sanitizePathSegment)(profile.name) || 'unknown';
    const companyFolderName = (0, outputStorage_1.sanitizePathSegment)(companyName || 'unknown') || 'unknown';
    const roleSlug = (0, outputStorage_1.sanitizePathSegment)(role || 'resume') || 'resume';
    const relativeBase = (0, outputStorage_1.renderOutputPathTemplate)(outputPathTemplate, {
        date: getCurrentDateFolder(),
        profileName: profile.name || 'unknown',
        companyName: companyName || 'unknown',
        jobTitle: role || 'resume',
    });
    if (!outputBaseDir) {
        throw new Error('Output base directory is not configured.');
    }
    const absoluteDir = path_1.default.join(outputBaseDir, ...relativeBase.split('/'));
    const storagePathBase = relativeBase;
    return { relativeBase, absoluteDir, storagePathBase, profileSlug, companyFolderName, roleSlug };
}
async function getGeneratedFilePath(relativePathValue) {
    const normalizedValue = relativePathValue.replace(/\\/g, '/').trim();
    if (!normalizedValue) {
        return null;
    }
    const { outputBaseDir } = await (0, aiModelConfig_1.getOutputStorageSettings)();
    const resolved = (0, outputStorage_1.resolveStoredFilePath)(outputBaseDir, normalizedValue);
    if (!resolved) {
        return null;
    }
    try {
        await promises_1.default.access(resolved);
        return resolved;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=generatedPath.js.map