import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { AIProvider } from '../types/template';
import {
  buildOutputPathPreview,
  DEFAULT_OUTPUT_PATH_TEMPLATE,
  DEFAULT_GENERATED_RESUMES_DIR,
  ensureWritableOutputDir,
  normalizeOutputBaseDir,
  normalizeOutputPathTemplate,
  outputPathTemplateUsesJobTitle,
  validateOutputPathTemplate,
} from '../utils/outputStorage';
export type DefaultMode = 'preview' | 'generate';
export type ThemeMode = 'light' | 'dark';
export type DefaultResumeSelection = 'single' | 'all' | 'group';

type ApiKeyEntry = {
  id: string;
  name: string;
  value: string;
  createdAt: string;
};

type ProviderKeyStore = {
  activeKeyId: string;
  entries: ApiKeyEntry[];
};

type ProviderKeyStores = Record<AIProvider, ProviderKeyStore>;

type ApiKeyUpdate = {
  activeKeyId?: string;
  add?: Array<{
    clientId?: string;
    name?: string;
    value: string;
  }>;
  removeIds?: string[];
  useEnvironmentFallback?: boolean;
};

type GoogleSheetSource = {
  id: string;
  name: string;
  sheetId: string;
  createdAt: string;
  updatedAt: string;
};

type AppSettings = {
  openaiEnabled: boolean;
  claudeEnabled: boolean;
  openrouterEnabled: boolean;
  defaultMode: DefaultMode;
  defaultTheme: ThemeMode;
  defaultResumeSelection: DefaultResumeSelection;
  defaultGroupId: string;
  defaultProfileId: string;
  defaultResumeDocxEnabled: boolean;
  defaultCoverLetterDocxEnabled: boolean;
  outputBaseDir: string;
  outputPathTemplate: string;
  googleSheetsSources: GoogleSheetSource[];
  apiKeys: ProviderKeyStores;
};

export type AIModelSettings = Pick<AppSettings, 'openaiEnabled' | 'claudeEnabled' | 'openrouterEnabled'>;

export type PublicAppSettings = AIModelSettings & Pick<
  AppSettings,
  | 'defaultMode'
  | 'defaultTheme'
  | 'defaultResumeSelection'
  | 'defaultGroupId'
  | 'defaultProfileId'
  | 'defaultResumeDocxEnabled'
  | 'defaultCoverLetterDocxEnabled'
  | 'googleSheetsSources'
>;
export type PublicAppSettingsWithDerived = PublicAppSettings & {
  outputPathUsesJobTitle: boolean;
};

export type AdminAppSettings = PublicAppSettingsWithDerived & {
  outputBaseDir: string;
  outputPathTemplate: string;
  outputPathPreview: string;
  apiKeys: {
    [K in AIProvider]: {
      configured: boolean;
      activeSource: 'stored' | 'environment' | 'none';
      activeKeyId: string | null;
      activePreview: string | null;
      environmentPreview: string | null;
      entries: Array<{
        id: string;
        name: string;
        preview: string | null;
        isActive: boolean;
        createdAt: string;
      }>;
    };
  };
};

export type AppSettingsUpdate = Partial<PublicAppSettings> & {
  outputBaseDir?: string;
  outputPathTemplate?: string;
  apiKeys?: Partial<Record<AIProvider, ApiKeyUpdate | string>>;
};

const DATA_DIR = process.env.TAILOR_DATA_DIR
  ? path.resolve(process.env.TAILOR_DATA_DIR)
  : path.join(__dirname, '../../data');
const CONFIG_DIR = path.join(DATA_DIR, 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'ai-models.json');

const DEFAULT_SETTINGS: AppSettings = {
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
  outputBaseDir: DEFAULT_GENERATED_RESUMES_DIR,
  outputPathTemplate: DEFAULT_OUTPUT_PATH_TEMPLATE,
  googleSheetsSources: [],
  apiKeys: {
    openai: { activeKeyId: '', entries: [] },
    claude: { activeKeyId: '', entries: [] },
    openrouter: { activeKeyId: '', entries: [] },
  },
};

function normalizeThemeMode(value: unknown, fallback: ThemeMode): ThemeMode {
  return value === 'light' || value === 'dark' ? value : fallback;
}

function normalizeDefaultMode(value: unknown, fallback: DefaultMode): DefaultMode {
  return value === 'preview' || value === 'generate' ? value : fallback;
}

function normalizeDefaultResumeSelection(
  value: unknown,
  fallback: DefaultResumeSelection
): DefaultResumeSelection {
  return value === 'single' || value === 'all' || value === 'group' ? value : fallback;
}

function getEnvironmentApiKey(provider: AIProvider): string {
  if (provider === 'openai') {
    return process.env.OPENAI_API_KEY?.trim() || '';
  }
  if (provider === 'claude') {
    return process.env.ANTHROPIC_API_KEY?.trim() || '';
  }
  return process.env.OPENROUTER_API_KEY?.trim() || '';
}

function normalizeApiKeyName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function createApiKeyEntry(value: string, name: string, createdAt?: string): ApiKeyEntry {
  return {
    id: randomUUID(),
    name,
    value,
    createdAt: createdAt || new Date().toISOString(),
  };
}

function normalizeProviderKeyStore(input: unknown, fallback: ProviderKeyStore, provider: AIProvider): ProviderKeyStore {
  if (typeof input === 'string') {
    const value = input.trim();
    if (!value) {
      return { activeKeyId: '', entries: [] };
    }
    const entry = createApiKeyEntry(value, 'Primary key');
    return {
      activeKeyId: entry.id,
      entries: [entry],
    };
  }

  const source = typeof input === 'object' && input !== null ? input as Partial<ProviderKeyStore> & {
    entries?: unknown;
    activeKeyId?: unknown;
  } : {};

  const rawEntries: unknown[] = Array.isArray(source.entries) ? source.entries : fallback.entries;
  const entries = rawEntries
    .map((entry, index) => {
      if (typeof entry === 'string') {
        const value = entry.trim();
        if (!value) return null;
        return createApiKeyEntry(value, `Key ${index + 1}`);
      }
      if (typeof entry !== 'object' || entry === null) {
        return null;
      }
      const raw = entry as Partial<ApiKeyEntry>;
      const value = typeof raw.value === 'string' ? raw.value.trim() : '';
      if (!value) return null;
      return {
        id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : randomUUID(),
        name: normalizeApiKeyName(raw.name, `Key ${index + 1}`),
        value,
        createdAt: typeof raw.createdAt === 'string' && raw.createdAt.trim()
          ? raw.createdAt.trim()
          : new Date().toISOString(),
      } satisfies ApiKeyEntry;
    })
    .filter((entry): entry is ApiKeyEntry => Boolean(entry));

  const activeKeyId = typeof source.activeKeyId === 'string' ? source.activeKeyId.trim() : fallback.activeKeyId;
  const hasActiveEntry = entries.some((entry) => entry.id === activeKeyId);

  return {
    activeKeyId: entries.length === 0 ? '' : hasActiveEntry ? activeKeyId : entries[0].id,
    entries,
  };
}

function normalizeProviderKeyStores(input: unknown, fallback: ProviderKeyStores): ProviderKeyStores {
  const source = typeof input === 'object' && input !== null
    ? input as Partial<Record<AIProvider, unknown>>
    : {};

  return {
    openai: normalizeProviderKeyStore(source.openai, fallback.openai, 'openai'),
    claude: normalizeProviderKeyStore(source.claude, fallback.claude, 'claude'),
    openrouter: normalizeProviderKeyStore(source.openrouter, fallback.openrouter, 'openrouter'),
  };
}

function normalizeGoogleSheetSourceName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeGoogleSheetsSources(input: unknown, fallback: GoogleSheetSource[]): GoogleSheetSource[] {
  const rawEntries = Array.isArray(input) ? input : fallback;
  const seenIds = new Set<string>();

  return rawEntries
    .map((entry, index) => {
      if (typeof entry !== 'object' || entry === null) {
        return null;
      }

      const raw = entry as Partial<GoogleSheetSource>;
      const sheetId = typeof raw.sheetId === 'string' ? raw.sheetId.trim() : '';
      if (!sheetId) {
        return null;
      }

      const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : randomUUID();
      if (seenIds.has(id)) {
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
      } satisfies GoogleSheetSource;
    })
    .filter((entry): entry is GoogleSheetSource => Boolean(entry));
}

function normalizeSettings(input: unknown, fallback: AppSettings = DEFAULT_SETTINGS): AppSettings {
  const source = typeof input === 'object' && input !== null ? input as Partial<AppSettings> & {
    apiKeys?: unknown;
    defaultProfileId?: unknown;
  } : {};

  return {
    openaiEnabled: typeof source.openaiEnabled === 'boolean' ? source.openaiEnabled : fallback.openaiEnabled,
    claudeEnabled: typeof source.claudeEnabled === 'boolean' ? source.claudeEnabled : fallback.claudeEnabled,
    openrouterEnabled: typeof source.openrouterEnabled === 'boolean'
      ? source.openrouterEnabled
      : fallback.openrouterEnabled,
    defaultMode: normalizeDefaultMode(source.defaultMode, fallback.defaultMode),
    defaultTheme: normalizeThemeMode(source.defaultTheme, fallback.defaultTheme),
    defaultResumeSelection: normalizeDefaultResumeSelection(
      source.defaultResumeSelection,
      fallback.defaultResumeSelection
    ),
    defaultGroupId: typeof source.defaultGroupId === 'string' ? source.defaultGroupId.trim() : fallback.defaultGroupId,
    defaultProfileId: typeof source.defaultProfileId === 'string'
      ? source.defaultProfileId.trim()
      : fallback.defaultProfileId,
    defaultResumeDocxEnabled: typeof source.defaultResumeDocxEnabled === 'boolean'
      ? source.defaultResumeDocxEnabled
      : fallback.defaultResumeDocxEnabled,
    defaultCoverLetterDocxEnabled: typeof source.defaultCoverLetterDocxEnabled === 'boolean'
      ? source.defaultCoverLetterDocxEnabled
      : fallback.defaultCoverLetterDocxEnabled,
    outputBaseDir: normalizeOutputBaseDir(source.outputBaseDir ?? fallback.outputBaseDir),
    outputPathTemplate: validateOutputPathTemplate(
      normalizeOutputPathTemplate(source.outputPathTemplate ?? fallback.outputPathTemplate)
    ),
    googleSheetsSources: normalizeGoogleSheetsSources(source.googleSheetsSources, fallback.googleSheetsSources),
    apiKeys: normalizeProviderKeyStores(source.apiKeys, fallback.apiKeys),
  };
}

function ensureAtLeastOneProviderEnabled(settings: AppSettings): AppSettings {
  if (settings.openaiEnabled || settings.claudeEnabled || settings.openrouterEnabled) {
    return settings;
  }

  return {
    ...settings,
    openaiEnabled: true,
  };
}

function toPublicSettings(settings: AppSettings): PublicAppSettings {
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

function toPublicSettingsWithDerived(settings: AppSettings): PublicAppSettingsWithDerived {
  return {
    ...toPublicSettings(settings),
    outputPathUsesJobTitle: outputPathTemplateUsesJobTitle(settings.outputPathTemplate),
  };
}

function maskApiKey(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}...${trimmed.slice(-2)}`;
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

function getStoredActiveApiKey(store: ProviderKeyStore): ApiKeyEntry | null {
  if (!store.entries.length) return null;
  return store.entries.find((entry) => entry.id === store.activeKeyId) ?? store.entries[0] ?? null;
}

function toAdminSettings(settings: AppSettings): AdminAppSettings {
  return {
    ...toPublicSettingsWithDerived(settings),
    outputBaseDir: settings.outputBaseDir,
    outputPathTemplate: settings.outputPathTemplate,
    outputPathPreview: buildOutputPathPreview(settings.outputPathTemplate),
    apiKeys: {
      openai: toAdminProviderKeyState('openai', settings.apiKeys.openai),
      claude: toAdminProviderKeyState('claude', settings.apiKeys.claude),
      openrouter: toAdminProviderKeyState('openrouter', settings.apiKeys.openrouter),
    },
  };
}

function toAdminProviderKeyState(provider: AIProvider, store: ProviderKeyStore): AdminAppSettings['apiKeys'][AIProvider] {
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

async function ensureConfigDir(): Promise<void> {
  try {
    await fs.access(CONFIG_DIR);
  } catch {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  }
}

async function readSettingsFile(): Promise<AppSettings> {
  await ensureConfigDir();
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    const settings = ensureAtLeastOneProviderEnabled(normalizeSettings(parsed));
    await fs.writeFile(CONFIG_FILE, JSON.stringify(settings, null, 2));
    return settings;
  } catch {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));
    return DEFAULT_SETTINGS;
  }
}

async function readSettings(): Promise<AppSettings> {
  return readSettingsFile();
}

async function writeSettings(settings: AppSettings): Promise<AppSettings> {
  const normalized = ensureAtLeastOneProviderEnabled(normalizeSettings(settings));
  await ensureConfigDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(normalized, null, 2));
  return normalized;
}

function applyApiKeyUpdate(current: ProviderKeyStore, update: ApiKeyUpdate | string | undefined): ProviderKeyStore {
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

  const removeIds = new Set((update.removeIds ?? []).filter((id): id is string => typeof id === 'string' && id.trim().length > 0));
  const retainedEntries = current.entries.filter((entry) => !removeIds.has(entry.id));
  const addedEntries = (update.add ?? [])
    .map((entry, index) => {
      const value = typeof entry?.value === 'string' ? entry.value.trim() : '';
      if (!value) return null;
      return {
        clientId: typeof entry?.clientId === 'string' ? entry.clientId.trim() : '',
        stored: createApiKeyEntry(value, normalizeApiKeyName(entry?.name, `Key ${retainedEntries.length + index + 1}`)),
      };
    })
    .filter((entry): entry is { clientId: string; stored: ApiKeyEntry } => Boolean(entry));

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

export async function getAppSettings(): Promise<AppSettings> {
  return readSettings();
}

export async function getPublicAppSettings(): Promise<PublicAppSettingsWithDerived> {
  return toPublicSettingsWithDerived(await readSettings());
}

export async function getAdminAppSettings(): Promise<AdminAppSettings> {
  return toAdminSettings(await readSettings());
}

export async function updateAppSettings(input: AppSettingsUpdate): Promise<AdminAppSettings> {
  const current = await readSettings();
  const nextBase = normalizeSettings(
    {
      ...current,
      ...input,
      apiKeys: current.apiKeys,
    },
    current
  );

  const next: AppSettings = {
    ...nextBase,
    apiKeys: {
      openai: applyApiKeyUpdate(current.apiKeys.openai, input.apiKeys?.openai),
      claude: applyApiKeyUpdate(current.apiKeys.claude, input.apiKeys?.claude),
      openrouter: applyApiKeyUpdate(current.apiKeys.openrouter, input.apiKeys?.openrouter),
    },
  };

  if (!next.openaiEnabled && !next.claudeEnabled && !next.openrouterEnabled) {
    throw new Error('At least one AI model must remain enabled');
  }

  const shouldValidateOutputDir =
    typeof input.outputBaseDir !== 'undefined' ||
    current.outputBaseDir !== next.outputBaseDir;

  if (shouldValidateOutputDir) {
    await ensureWritableOutputDir(next.outputBaseDir);
  }

  const saved = await writeSettings(next);
  return toAdminSettings(saved);
}

export async function getAIModelSettings(): Promise<AIModelSettings> {
  const settings = await readSettings();
  return {
    openaiEnabled: settings.openaiEnabled,
    claudeEnabled: settings.claudeEnabled,
    openrouterEnabled: settings.openrouterEnabled,
  };
}

export async function updateAIModelSettings(input: Partial<AIModelSettings>): Promise<AIModelSettings> {
  const updated = await updateAppSettings(input);
  return {
    openaiEnabled: updated.openaiEnabled,
    claudeEnabled: updated.claudeEnabled,
    openrouterEnabled: updated.openrouterEnabled,
  };
}

export async function getProviderApiKey(provider: AIProvider): Promise<string> {
  const settings = await readSettings();
  const activeStoredKey = getStoredActiveApiKey(settings.apiKeys[provider]);
  if (activeStoredKey?.value.trim()) {
    const resolved = activeStoredKey.value.trim();
    console.log(
      `[AI_KEY_DEBUG] provider=${provider} source=stored key=${maskApiKey(resolved) ?? 'missing'}`
    );
    return resolved;
  }

  const environmentKey = getEnvironmentApiKey(provider);
  console.log(
    `[AI_KEY_DEBUG] provider=${provider} source=environment key=${maskApiKey(environmentKey) ?? 'missing'}`
  );
  return environmentKey;
}

export async function getOutputStorageSettings(): Promise<Pick<AppSettings, 'outputBaseDir' | 'outputPathTemplate'>> {
  const settings = await readSettings();
  return {
    outputBaseDir: settings.outputBaseDir,
    outputPathTemplate: settings.outputPathTemplate,
  };
}

export function isProviderEnabled(provider: AIProvider, settings: AIModelSettings): boolean {
  if (provider === 'openai') return settings.openaiEnabled;
  if (provider === 'claude') return settings.claudeEnabled;
  return settings.openrouterEnabled;
}

export function getDefaultEnabledProvider(settings: AIModelSettings): AIProvider {
  if (settings.openaiEnabled) return 'openai';
  if (settings.claudeEnabled) return 'claude';
  return 'openrouter';
}
