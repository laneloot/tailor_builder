"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAppSettings = getAppSettings;
exports.getPublicAppSettings = getPublicAppSettings;
exports.getAdminAppSettings = getAdminAppSettings;
exports.updateAppSettings = updateAppSettings;
exports.getAIModelSettings = getAIModelSettings;
exports.updateAIModelSettings = updateAIModelSettings;
exports.getProviderApiKey = getProviderApiKey;
exports.getOutputStorageSettings = getOutputStorageSettings;
exports.isProviderEnabled = isProviderEnabled;
exports.getDefaultEnabledProvider = getDefaultEnabledProvider;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const outputStorage_1 = require("../utils/outputStorage");
const DATA_DIR = process.env.TAILOR_DATA_DIR
    ? path_1.default.resolve(process.env.TAILOR_DATA_DIR)
    : path_1.default.join(__dirname, '../../data');
const CONFIG_DIR = path_1.default.join(DATA_DIR, 'config');
const CONFIG_FILE = path_1.default.join(CONFIG_DIR, 'ai-models.json');
const DEFAULT_SETTINGS = {
    openaiEnabled: true,
    claudeEnabled: true,
    openrouterEnabled: true,
    defaultMode: 'preview',
    defaultTheme: 'light',
    defaultResumeSelection: 'single',
    defaultGroupId: '',
    defaultProfileId: '',
    defaultResumeDocxEnabled: true,
    defaultCoverLetterDocxEnabled: true,
    outputBaseDir: outputStorage_1.DEFAULT_GENERATED_RESUMES_DIR,
    outputPathTemplate: outputStorage_1.DEFAULT_OUTPUT_PATH_TEMPLATE,
    googleSheetsSources: [],
    apiKeys: {
        openai: { activeKeyId: '', entries: [] },
        claude: { activeKeyId: '', entries: [] },
        openrouter: { activeKeyId: '', entries: [] },
    },
};
function cloneDefaultSettings() {
    return {
        ...DEFAULT_SETTINGS,
        googleSheetsSources: [...DEFAULT_SETTINGS.googleSheetsSources],
        apiKeys: {
            openai: {
                activeKeyId: DEFAULT_SETTINGS.apiKeys.openai.activeKeyId,
                entries: [...DEFAULT_SETTINGS.apiKeys.openai.entries],
            },
            claude: {
                activeKeyId: DEFAULT_SETTINGS.apiKeys.claude.activeKeyId,
                entries: [...DEFAULT_SETTINGS.apiKeys.claude.entries],
            },
            openrouter: {
                activeKeyId: DEFAULT_SETTINGS.apiKeys.openrouter.activeKeyId,
                entries: [...DEFAULT_SETTINGS.apiKeys.openrouter.entries],
            },
        },
    };
}
function hasOwnProperty(source, key) {
    return Object.prototype.hasOwnProperty.call(source, key);
}
function normalizeThemeMode(value, fallback) {
    return value === 'light' || value === 'dark' ? value : fallback;
}
function normalizeDefaultMode(value, fallback) {
    return value === 'preview' || value === 'generate' ? value : fallback;
}
function normalizeDefaultResumeSelection(value, fallback) {
    return value === 'single' || value === 'all' || value === 'group' ? value : fallback;
}
function getEnvironmentApiKey(provider) {
    if (provider === 'openai') {
        return process.env.OPENAI_API_KEY?.trim() || '';
    }
    if (provider === 'claude') {
        return process.env.ANTHROPIC_API_KEY?.trim() || '';
    }
    return process.env.OPENROUTER_API_KEY?.trim() || '';
}
function normalizeApiKeyName(value, fallback) {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function createApiKeyEntry(value, name, createdAt) {
    return {
        id: (0, crypto_1.randomUUID)(),
        name,
        value,
        createdAt: createdAt || new Date().toISOString(),
    };
}
function normalizeProviderKeyStore(input, fallback, _provider, strict = false) {
    if (typeof input === 'string') {
        const value = input.trim();
        if (!value) {
            if (strict) {
                throw new Error('Stored API key values cannot be empty');
            }
            return { activeKeyId: '', entries: [] };
        }
        const entry = createApiKeyEntry(value, 'Primary key');
        return {
            activeKeyId: entry.id,
            entries: [entry],
        };
    }
    const source = typeof input === 'object' && input !== null ? input : {};
    if (strict && hasOwnProperty(source, 'entries') && !Array.isArray(source.entries)) {
        throw new Error('Stored API key entries must be an array');
    }
    const rawEntries = Array.isArray(source.entries) ? source.entries : fallback.entries;
    const entries = rawEntries
        .map((entry, index) => {
        if (typeof entry === 'string') {
            const value = entry.trim();
            if (!value) {
                if (strict) {
                    throw new Error(`Stored API key entry ${index + 1} cannot be empty`);
                }
                return null;
            }
            return createApiKeyEntry(value, `Key ${index + 1}`);
        }
        if (typeof entry !== 'object' || entry === null) {
            if (strict) {
                throw new Error(`Stored API key entry ${index + 1} is invalid`);
            }
            return null;
        }
        const raw = entry;
        const value = typeof raw.value === 'string' ? raw.value.trim() : '';
        if (!value) {
            if (strict) {
                throw new Error(`Stored API key entry ${index + 1} is missing a value`);
            }
            return null;
        }
        return {
            id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : (0, crypto_1.randomUUID)(),
            name: normalizeApiKeyName(raw.name, `Key ${index + 1}`),
            value,
            createdAt: typeof raw.createdAt === 'string' && raw.createdAt.trim()
                ? raw.createdAt.trim()
                : new Date().toISOString(),
        };
    })
        .filter((entry) => Boolean(entry));
    if (strict && hasOwnProperty(source, 'activeKeyId') && typeof source.activeKeyId !== 'string') {
        throw new Error('Stored active API key id must be a string');
    }
    const activeKeyId = typeof source.activeKeyId === 'string' ? source.activeKeyId.trim() : fallback.activeKeyId;
    const hasActiveEntry = entries.some((entry) => entry.id === activeKeyId);
    if (strict && activeKeyId && !hasActiveEntry) {
        throw new Error('Stored active API key id does not match any saved key');
    }
    return {
        activeKeyId: entries.length === 0 ? '' : hasActiveEntry ? activeKeyId : entries[0].id,
        entries,
    };
}
function normalizeProviderKeyStores(input, fallback, strict = false) {
    if (strict && typeof input !== 'undefined' && (typeof input !== 'object' || input === null)) {
        throw new Error('Stored API keys must be an object');
    }
    const source = typeof input === 'object' && input !== null
        ? input
        : {};
    return {
        openai: normalizeProviderKeyStore(source.openai, fallback.openai, 'openai', strict),
        claude: normalizeProviderKeyStore(source.claude, fallback.claude, 'claude', strict),
        openrouter: normalizeProviderKeyStore(source.openrouter, fallback.openrouter, 'openrouter', strict),
    };
}
function normalizeGoogleSheetSourceName(value, fallback) {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function normalizeGoogleSheetsSources(input, fallback, strict = false) {
    if (strict && typeof input !== 'undefined' && !Array.isArray(input)) {
        throw new Error('Stored Google Sheets sources must be an array');
    }
    const rawEntries = Array.isArray(input) ? input : fallback;
    const seenIds = new Set();
    return rawEntries
        .map((entry, index) => {
        if (typeof entry !== 'object' || entry === null) {
            if (strict) {
                throw new Error(`Stored Google Sheets source ${index + 1} is invalid`);
            }
            return null;
        }
        const raw = entry;
        const sheetId = typeof raw.sheetId === 'string' ? raw.sheetId.trim() : '';
        if (!sheetId) {
            if (strict) {
                throw new Error(`Stored Google Sheets source ${index + 1} is missing a sheetId`);
            }
            return null;
        }
        const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : (0, crypto_1.randomUUID)();
        if (seenIds.has(id)) {
            if (strict) {
                throw new Error(`Stored Google Sheets source ${index + 1} has a duplicate id`);
            }
            return null;
        }
        seenIds.add(id);
        const createdAt = typeof raw.createdAt === 'string' && raw.createdAt.trim()
            ? raw.createdAt.trim()
            : new Date().toISOString();
        const updatedAt = typeof raw.updatedAt === 'string' && raw.updatedAt.trim()
            ? raw.updatedAt.trim()
            : createdAt;
        return {
            id,
            name: normalizeGoogleSheetSourceName(raw.name, `Google Sheet ${index + 1}`),
            sheetId,
            createdAt,
            updatedAt,
        };
    })
        .filter((entry) => Boolean(entry));
}
function normalizeSettings(input, fallback = DEFAULT_SETTINGS, strict = false) {
    if (strict && (typeof input !== 'object' || input === null)) {
        throw new Error('Settings file must contain a JSON object');
    }
    const source = typeof input === 'object' && input !== null ? input : {};
    return {
        openaiEnabled: typeof source.openaiEnabled === 'boolean'
            ? source.openaiEnabled
            : strict && hasOwnProperty(source, 'openaiEnabled')
                ? (() => { throw new Error('openaiEnabled must be a boolean'); })()
                : fallback.openaiEnabled,
        claudeEnabled: typeof source.claudeEnabled === 'boolean'
            ? source.claudeEnabled
            : strict && hasOwnProperty(source, 'claudeEnabled')
                ? (() => { throw new Error('claudeEnabled must be a boolean'); })()
                : fallback.claudeEnabled,
        openrouterEnabled: typeof source.openrouterEnabled === 'boolean'
            ? source.openrouterEnabled
            : strict && hasOwnProperty(source, 'openrouterEnabled')
                ? (() => { throw new Error('openrouterEnabled must be a boolean'); })()
                : fallback.openrouterEnabled,
        defaultMode: typeof source.defaultMode === 'undefined'
            ? fallback.defaultMode
            : source.defaultMode === 'preview' || source.defaultMode === 'generate'
                ? source.defaultMode
                : strict
                    ? (() => { throw new Error('defaultMode must be "preview" or "generate"'); })()
                    : normalizeDefaultMode(source.defaultMode, fallback.defaultMode),
        defaultTheme: typeof source.defaultTheme === 'undefined'
            ? fallback.defaultTheme
            : source.defaultTheme === 'light' || source.defaultTheme === 'dark'
                ? source.defaultTheme
                : strict
                    ? (() => { throw new Error('defaultTheme must be "light" or "dark"'); })()
                    : normalizeThemeMode(source.defaultTheme, fallback.defaultTheme),
        defaultResumeSelection: typeof source.defaultResumeSelection === 'undefined'
            ? fallback.defaultResumeSelection
            : source.defaultResumeSelection === 'single'
                || source.defaultResumeSelection === 'all'
                || source.defaultResumeSelection === 'group'
                ? source.defaultResumeSelection
                : strict
                    ? (() => { throw new Error('defaultResumeSelection must be "single", "all", or "group"'); })()
                    : normalizeDefaultResumeSelection(source.defaultResumeSelection, fallback.defaultResumeSelection),
        defaultGroupId: typeof source.defaultGroupId === 'string'
            ? source.defaultGroupId.trim()
            : strict && hasOwnProperty(source, 'defaultGroupId')
                ? (() => { throw new Error('defaultGroupId must be a string'); })()
                : fallback.defaultGroupId,
        defaultProfileId: typeof source.defaultProfileId === 'string'
            ? source.defaultProfileId.trim()
            : strict && hasOwnProperty(source, 'defaultProfileId')
                ? (() => { throw new Error('defaultProfileId must be a string'); })()
                : fallback.defaultProfileId,
        defaultResumeDocxEnabled: typeof source.defaultResumeDocxEnabled === 'boolean'
            ? source.defaultResumeDocxEnabled
            : strict && hasOwnProperty(source, 'defaultResumeDocxEnabled')
                ? (() => { throw new Error('defaultResumeDocxEnabled must be a boolean'); })()
                : fallback.defaultResumeDocxEnabled,
        defaultCoverLetterDocxEnabled: typeof source.defaultCoverLetterDocxEnabled === 'boolean'
            ? source.defaultCoverLetterDocxEnabled
            : strict && hasOwnProperty(source, 'defaultCoverLetterDocxEnabled')
                ? (() => { throw new Error('defaultCoverLetterDocxEnabled must be a boolean'); })()
                : fallback.defaultCoverLetterDocxEnabled,
        outputBaseDir: typeof source.outputBaseDir === 'undefined'
            ? (0, outputStorage_1.normalizeOutputBaseDir)(fallback.outputBaseDir)
            : typeof source.outputBaseDir === 'string' && source.outputBaseDir.trim()
                ? (0, outputStorage_1.normalizeOutputBaseDir)(source.outputBaseDir)
                : strict
                    ? (() => { throw new Error('outputBaseDir must be a non-empty string'); })()
                    : (0, outputStorage_1.normalizeOutputBaseDir)(fallback.outputBaseDir),
        outputPathTemplate: typeof source.outputPathTemplate === 'undefined'
            ? (0, outputStorage_1.validateOutputPathTemplate)((0, outputStorage_1.normalizeOutputPathTemplate)(fallback.outputPathTemplate))
            : typeof source.outputPathTemplate === 'string' && source.outputPathTemplate.trim()
                ? (0, outputStorage_1.validateOutputPathTemplate)(source.outputPathTemplate)
                : strict
                    ? (() => { throw new Error('outputPathTemplate must be a non-empty string'); })()
                    : (0, outputStorage_1.validateOutputPathTemplate)((0, outputStorage_1.normalizeOutputPathTemplate)(fallback.outputPathTemplate)),
        googleSheetsSources: normalizeGoogleSheetsSources(source.googleSheetsSources, fallback.googleSheetsSources, strict),
        apiKeys: normalizeProviderKeyStores(source.apiKeys, fallback.apiKeys, strict),
    };
}
function assertAtLeastOneProviderEnabled(settings) {
    if (!settings.openaiEnabled && !settings.claudeEnabled && !settings.openrouterEnabled) {
        throw new Error('At least one AI model must remain enabled');
    }
}
function toPublicSettings(settings) {
    return {
        openaiEnabled: settings.openaiEnabled,
        claudeEnabled: settings.claudeEnabled,
        openrouterEnabled: settings.openrouterEnabled,
        defaultMode: settings.defaultMode,
        defaultTheme: settings.defaultTheme,
        defaultResumeSelection: settings.defaultResumeSelection,
        defaultGroupId: settings.defaultGroupId,
        defaultProfileId: settings.defaultProfileId,
        defaultResumeDocxEnabled: settings.defaultResumeDocxEnabled,
        defaultCoverLetterDocxEnabled: settings.defaultCoverLetterDocxEnabled,
        googleSheetsSources: settings.googleSheetsSources,
    };
}
function toPublicSettingsWithDerived(settings) {
    return {
        ...toPublicSettings(settings),
        outputPathUsesJobTitle: (0, outputStorage_1.outputPathTemplateUsesJobTitle)(settings.outputPathTemplate),
    };
}
function maskApiKey(value) {
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    if (trimmed.length <= 8) {
        return `${trimmed.slice(0, 2)}...${trimmed.slice(-2)}`;
    }
    return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}
function getStoredActiveApiKey(store) {
    if (!store.entries.length)
        return null;
    return store.entries.find((entry) => entry.id === store.activeKeyId) ?? store.entries[0] ?? null;
}
function toAdminSettings(settings) {
    return {
        ...toPublicSettingsWithDerived(settings),
        outputBaseDir: settings.outputBaseDir,
        outputPathTemplate: settings.outputPathTemplate,
        outputPathPreview: (0, outputStorage_1.buildOutputPathPreview)(settings.outputPathTemplate),
        apiKeys: {
            openai: toAdminProviderKeyState('openai', settings.apiKeys.openai),
            claude: toAdminProviderKeyState('claude', settings.apiKeys.claude),
            openrouter: toAdminProviderKeyState('openrouter', settings.apiKeys.openrouter),
        },
    };
}
function toAdminProviderKeyState(provider, store) {
    const activeStoredEntry = getStoredActiveApiKey(store);
    const environmentValue = getEnvironmentApiKey(provider);
    const environmentPreview = maskApiKey(environmentValue);
    if (activeStoredEntry) {
        return {
            configured: true,
            activeSource: 'stored',
            activeKeyId: activeStoredEntry.id,
            activePreview: maskApiKey(activeStoredEntry.value),
            environmentPreview,
            entries: store.entries.map((entry) => ({
                id: entry.id,
                name: entry.name,
                preview: maskApiKey(entry.value),
                isActive: entry.id === activeStoredEntry.id,
                createdAt: entry.createdAt,
            })),
        };
    }
    if (environmentValue) {
        return {
            configured: true,
            activeSource: 'environment',
            activeKeyId: null,
            activePreview: environmentPreview,
            environmentPreview,
            entries: [],
        };
    }
    return {
        configured: false,
        activeSource: 'none',
        activeKeyId: null,
        activePreview: null,
        environmentPreview: null,
        entries: [],
    };
}
async function ensureConfigDir() {
    try {
        await promises_1.default.access(CONFIG_DIR);
    }
    catch {
        await promises_1.default.mkdir(CONFIG_DIR, { recursive: true });
    }
}
async function readSettingsFile() {
    try {
        const raw = await promises_1.default.readFile(CONFIG_FILE, 'utf-8');
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch (error) {
            throw new Error(`Settings file "${CONFIG_FILE}" contains invalid JSON: ${error instanceof Error ? error.message : 'Unknown parse error'}`);
        }
        const settings = normalizeSettings(parsed, cloneDefaultSettings(), true);
        assertAtLeastOneProviderEnabled(settings);
        return settings;
    }
    catch (error) {
        if (error?.code === 'ENOENT') {
            return cloneDefaultSettings();
        }
        throw error;
    }
}
async function readSettings() {
    return readSettingsFile();
}
async function writeSettings(settings) {
    const normalized = normalizeSettings(settings, cloneDefaultSettings(), true);
    assertAtLeastOneProviderEnabled(normalized);
    await ensureConfigDir();
    await promises_1.default.writeFile(CONFIG_FILE, JSON.stringify(normalized, null, 2));
    return normalized;
}
function applyApiKeyUpdate(current, update) {
    if (typeof update === 'undefined') {
        return current;
    }
    if (typeof update === 'string') {
        const value = update.trim();
        if (!value) {
            return { activeKeyId: '', entries: [] };
        }
        const entry = createApiKeyEntry(value, 'Primary key');
        return {
            activeKeyId: entry.id,
            entries: [entry],
        };
    }
    const removeIds = new Set((update.removeIds ?? []).filter((id) => typeof id === 'string' && id.trim().length > 0));
    const retainedEntries = current.entries.filter((entry) => !removeIds.has(entry.id));
    const addedEntries = (update.add ?? [])
        .map((entry, index) => {
        const value = typeof entry?.value === 'string' ? entry.value.trim() : '';
        if (!value)
            return null;
        return {
            clientId: typeof entry?.clientId === 'string' ? entry.clientId.trim() : '',
            stored: createApiKeyEntry(value, normalizeApiKeyName(entry?.name, `Key ${retainedEntries.length + index + 1}`)),
        };
    })
        .filter((entry) => Boolean(entry));
    const entries = [...retainedEntries, ...addedEntries.map((entry) => entry.stored)];
    if (entries.length === 0 || update.useEnvironmentFallback) {
        return { activeKeyId: '', entries };
    }
    const requestedActiveKeyId = typeof update.activeKeyId === 'string' ? update.activeKeyId.trim() : current.activeKeyId;
    const matchingNewEntry = addedEntries.find((entry) => entry.clientId && entry.clientId === requestedActiveKeyId);
    const activeKeyId = entries.some((entry) => entry.id === requestedActiveKeyId)
        ? requestedActiveKeyId
        : matchingNewEntry?.stored.id || entries[0].id;
    return {
        activeKeyId,
        entries,
    };
}
async function getAppSettings() {
    return readSettings();
}
async function getPublicAppSettings() {
    return toPublicSettingsWithDerived(await readSettings());
}
async function getAdminAppSettings() {
    return toAdminSettings(await readSettings());
}
async function updateAppSettings(input) {
    const current = await readSettings();
    const nextBase = normalizeSettings({
        ...current,
        ...input,
        apiKeys: current.apiKeys,
    }, current);
    const next = {
        ...nextBase,
        apiKeys: {
            openai: applyApiKeyUpdate(current.apiKeys.openai, input.apiKeys?.openai),
            claude: applyApiKeyUpdate(current.apiKeys.claude, input.apiKeys?.claude),
            openrouter: applyApiKeyUpdate(current.apiKeys.openrouter, input.apiKeys?.openrouter),
        },
    };
    assertAtLeastOneProviderEnabled(next);
    const shouldValidateOutputDir = typeof input.outputBaseDir !== 'undefined' ||
        current.outputBaseDir !== next.outputBaseDir;
    if (shouldValidateOutputDir) {
        await (0, outputStorage_1.ensureWritableOutputDir)(next.outputBaseDir);
    }
    const saved = await writeSettings(next);
    return toAdminSettings(saved);
}
async function getAIModelSettings() {
    const settings = await readSettings();
    return {
        openaiEnabled: settings.openaiEnabled,
        claudeEnabled: settings.claudeEnabled,
        openrouterEnabled: settings.openrouterEnabled,
    };
}
async function updateAIModelSettings(input) {
    const updated = await updateAppSettings(input);
    return {
        openaiEnabled: updated.openaiEnabled,
        claudeEnabled: updated.claudeEnabled,
        openrouterEnabled: updated.openrouterEnabled,
    };
}
async function getProviderApiKey(provider) {
    const settings = await readSettings();
    const activeStoredKey = getStoredActiveApiKey(settings.apiKeys[provider]);
    if (activeStoredKey?.value.trim()) {
        const resolved = activeStoredKey.value.trim();
        console.log(`[AI_KEY_DEBUG] provider=${provider} source=stored key=${maskApiKey(resolved) ?? 'missing'}`);
        return resolved;
    }
    const environmentKey = getEnvironmentApiKey(provider);
    console.log(`[AI_KEY_DEBUG] provider=${provider} source=environment key=${maskApiKey(environmentKey) ?? 'missing'}`);
    return environmentKey;
}
async function getOutputStorageSettings() {
    const settings = await readSettings();
    return {
        outputBaseDir: settings.outputBaseDir,
        outputPathTemplate: settings.outputPathTemplate,
    };
}
function isProviderEnabled(provider, settings) {
    if (provider === 'openai')
        return settings.openaiEnabled;
    if (provider === 'claude')
        return settings.claudeEnabled;
    return settings.openrouterEnabled;
}
function getDefaultEnabledProvider(settings) {
    if (settings.openaiEnabled)
        return 'openai';
    if (settings.claudeEnabled)
        return 'claude';
    return 'openrouter';
}
//# sourceMappingURL=aiModelConfig.js.map