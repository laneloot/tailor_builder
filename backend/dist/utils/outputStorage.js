"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OUTPUT_PATH_TOKENS = exports.DEFAULT_OUTPUT_PATH_TEMPLATE = exports.DEFAULT_GENERATED_RESUMES_DIR = void 0;
exports.sanitizePathSegment = sanitizePathSegment;
exports.normalizeOutputBaseDir = normalizeOutputBaseDir;
exports.validateOutputBaseDir = validateOutputBaseDir;
exports.ensureWritableOutputDir = ensureWritableOutputDir;
exports.normalizeOutputPathTemplate = normalizeOutputPathTemplate;
exports.validateOutputPathTemplate = validateOutputPathTemplate;
exports.renderOutputPathTemplate = renderOutputPathTemplate;
exports.buildOutputPathPreview = buildOutputPathPreview;
exports.outputPathTemplateUsesJobTitle = outputPathTemplateUsesJobTitle;
exports.resolveStoredFilePath = resolveStoredFilePath;
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
exports.DEFAULT_GENERATED_RESUMES_DIR = path_1.default.join(__dirname, '..', '..', '..', 'generated');
exports.DEFAULT_OUTPUT_PATH_TEMPLATE = '/{{profile name}}/{{date}}/{{company name}}/{{job title}}';
exports.OUTPUT_PATH_TOKENS = [
    { token: '{{date}}', description: 'Current date as YYYY-MM-DD' },
    { token: '{{profile name}}', description: 'Selected profile name' },
    { token: '{{company name}}', description: 'Company name' },
    { token: '{{job title}}', description: 'Role / job title' },
];
const OUTPUT_TOKEN_ALIASES = {
    date: 'date',
    profile: 'profileName',
    'profile name': 'profileName',
    company: 'companyName',
    'company name': 'companyName',
    role: 'jobTitle',
    'job title': 'jobTitle',
};
function sanitizePathSegment(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}
function expandUserPath(input) {
    if (input === '~')
        return os_1.default.homedir();
    if (input.startsWith('~/') || input.startsWith('~\\')) {
        return path_1.default.join(os_1.default.homedir(), input.slice(2));
    }
    return input;
}
function normalizeOutputBaseDir(value) {
    const candidate = typeof value === 'string' && value.trim()
        ? expandUserPath(value.trim())
        : exports.DEFAULT_GENERATED_RESUMES_DIR;
    return path_1.default.resolve(candidate);
}
function validateOutputBaseDir(value) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error('Output base directory is required');
    }
    const normalized = normalizeOutputBaseDir(value);
    if (!path_1.default.isAbsolute(normalized)) {
        throw new Error('Output base directory must be an absolute path');
    }
    return normalized;
}
async function ensureWritableOutputDir(value) {
    const normalized = validateOutputBaseDir(value);
    await promises_1.default.mkdir(normalized, { recursive: true });
    await promises_1.default.access(normalized, fs_1.constants.W_OK);
    return normalized;
}
function normalizeOutputPathTemplate(value) {
    const trimmed = typeof value === 'string' && value.trim()
        ? value.trim()
        : exports.DEFAULT_OUTPUT_PATH_TEMPLATE;
    const withForwardSlashes = trimmed.replace(/\\/g, '/');
    const withLeadingSlash = withForwardSlashes.startsWith('/')
        ? withForwardSlashes
        : `/${withForwardSlashes}`;
    const compact = withLeadingSlash.replace(/\/{2,}/g, '/');
    if (compact.length > 1 && compact.endsWith('/')) {
        return compact.slice(0, -1);
    }
    return compact;
}
function validateOutputPathTemplate(value) {
    const normalized = normalizeOutputPathTemplate(value);
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length === 0) {
        throw new Error('Output path template must contain at least one folder segment');
    }
    for (const segment of segments) {
        if (segment === '.' || segment === '..') {
            throw new Error('Output path template cannot contain "." or ".." segments');
        }
        for (const match of segment.matchAll(/\{\{\s*([^}]+)\s*\}\}/g)) {
            const tokenKey = match[1]?.trim().toLowerCase() || '';
            if (!OUTPUT_TOKEN_ALIASES[tokenKey]) {
                throw new Error(`Unsupported output path token "{{${match[1]}}}"`);
            }
        }
    }
    return normalized;
}
function resolveTemplateToken(rawToken, variables) {
    const key = rawToken.trim().toLowerCase();
    const variableName = OUTPUT_TOKEN_ALIASES[key];
    if (!variableName) {
        throw new Error(`Unsupported output path token "{{${rawToken}}}"`);
    }
    return variables[variableName];
}
function renderOutputPathTemplate(template, variables) {
    const normalizedTemplate = validateOutputPathTemplate(template);
    const renderedSegments = normalizedTemplate
        .split('/')
        .filter(Boolean)
        .map((segment) => {
        const withTokenValues = segment.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, rawToken) => resolveTemplateToken(rawToken, variables));
        const sanitized = sanitizePathSegment(withTokenValues);
        return sanitized || 'unknown';
    });
    if (renderedSegments.length === 0) {
        throw new Error('Output path template did not produce a valid folder path');
    }
    return renderedSegments.join('/');
}
function buildOutputPathPreview(template) {
    return `/${renderOutputPathTemplate(template, {
        date: '2026-04-10',
        profileName: 'Jane Doe',
        companyName: 'Acme Inc',
        jobTitle: 'Senior Engineer',
    })}`;
}
function outputPathTemplateUsesJobTitle(template) {
    return /\{\{\s*(job title|role)\s*\}\}/i.test(normalizeOutputPathTemplate(template));
}
function resolveStoredFilePath(baseDir, relativePathValue) {
    const normalizedBaseDir = path_1.default.resolve(baseDir);
    const normalizedRelativePath = relativePathValue
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean);
    if (normalizedRelativePath.length === 0) {
        return null;
    }
    const resolvedPath = path_1.default.resolve(normalizedBaseDir, ...normalizedRelativePath);
    if (resolvedPath !== normalizedBaseDir && !resolvedPath.startsWith(`${normalizedBaseDir}${path_1.default.sep}`)) {
        return null;
    }
    return resolvedPath;
}
//# sourceMappingURL=outputStorage.js.map