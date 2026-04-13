const DEFAULT_LOCAL_API_BASE = 'http://localhost:3001/api';
const FALLBACK_API_BASE = 'http://100.1.12.1:3001/api';
const CONFIGURED_API_BASE = process.env.NEXT_PUBLIC_API_URL || DEFAULT_LOCAL_API_BASE;
let resolvedApiBase = CONFIGURED_API_BASE;

function getBrowserMatchedApiBase(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const configuredUrl = new URL(CONFIGURED_API_BASE);
    configuredUrl.hostname = window.location.hostname;
    return configuredUrl.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function buildApiBaseCandidates(): string[] {
  const browserMatchedApiBase = getBrowserMatchedApiBase();
  const candidates = [resolvedApiBase];

  if (browserMatchedApiBase) {
    candidates.push(browserMatchedApiBase);
  }

  candidates.push(CONFIGURED_API_BASE);

  if (!CONFIGURED_API_BASE.includes('100.1.12.1')) {
    candidates.push(FALLBACK_API_BASE);
  }
  return [...new Set(candidates)];
}

function getCurrentApiBase(): string {
  return resolvedApiBase;
}

export function getApiOrigin(): string {
  return getCurrentApiBase().replace(/\/api$/, '');
}

// Auth helpers
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem('adminToken');
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem('adminToken', token);
  } catch {
    // Ignore storage errors (private mode / blocked storage)
  }
}

export function removeToken(): void {
  try {
    localStorage.removeItem('adminToken');
  } catch {
    // Ignore storage errors
  }
}

function getAuthHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Generic fetch wrapper
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    ...getAuthHeaders(),
    ...options.headers,
  };

  // Don't set Content-Type for FormData
  if (!(options.body instanceof FormData)) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  let lastConnectionError: Error | null = null;

  for (const apiBase of buildApiBaseCandidates()) {
    const url = `${apiBase}${endpoint}`;
    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(error.error || 'Request failed');
      }

      resolvedApiBase = apiBase;
      return response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isConnectionIssue =
        message.includes('fetch') ||
        message.includes('Failed to fetch') ||
        message.includes('NetworkError');

      if (!isConnectionIssue) {
        throw error;
      }

      lastConnectionError = error instanceof Error ? error : new Error(message);
    }
  }

  throw lastConnectionError ?? new Error('Unable to connect to backend');
}

export type AIProvider = 'openai' | 'claude' | 'openrouter';
export type DefaultMode = 'preview' | 'generate';
export type ThemeMode = 'light' | 'dark';
export type DefaultResumeSelection = 'single' | 'all' | 'group';
export type OutputStorageMode = 'single' | 'multi';

export interface GoogleSheetSource {
  id: string;
  name: string;
  sheetId: string;
  createdAt: string;
  updatedAt: string;
}

// Admin API
export interface PublicAppSettings {
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
  outputStorageMode: OutputStorageMode;
  outputPathUsesJobTitle: boolean;
  googleSheetsSources: GoogleSheetSource[];
}

export type AIModelSettings = PublicAppSettings;

export interface AdminApiKeyEntry {
  id: string;
  name: string;
  preview: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AdminApiKeyProviderSettings {
  configured: boolean;
  activeSource: 'stored' | 'environment' | 'none';
  activeKeyId: string | null;
  activePreview: string | null;
  environmentPreview: string | null;
  entries: AdminApiKeyEntry[];
}

export interface AdminAppSettings extends PublicAppSettings {
  outputBaseDir: string;
  outputPathTemplate: string;
  outputPathPreview: string;
  apiKeys: Record<AIProvider, AdminApiKeyProviderSettings>;
}

function normalizeGoogleSheetSources(value: unknown): GoogleSheetSource[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is GoogleSheetSource => typeof entry === 'object' && entry !== null)
    .map((entry) => ({
      id: typeof entry.id === 'string' ? entry.id : '',
      name: typeof entry.name === 'string' ? entry.name : '',
      sheetId: typeof entry.sheetId === 'string' ? entry.sheetId : '',
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
      updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : '',
    }))
    .filter((entry) => entry.id && entry.name && entry.sheetId);
}

function normalizePublicAppSettings(value: unknown): PublicAppSettings {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Partial<PublicAppSettings>;

  return {
    openaiEnabled: typeof source.openaiEnabled === 'boolean' ? source.openaiEnabled : true,
    claudeEnabled: typeof source.claudeEnabled === 'boolean' ? source.claudeEnabled : true,
    openrouterEnabled: typeof source.openrouterEnabled === 'boolean' ? source.openrouterEnabled : true,
    defaultMode: source.defaultMode === 'generate' ? 'generate' : 'preview',
    defaultTheme: source.defaultTheme === 'dark' ? 'dark' : 'light',
    defaultResumeSelection:
      source.defaultResumeSelection === 'all' || source.defaultResumeSelection === 'group'
        ? source.defaultResumeSelection
        : 'single',
    defaultGroupId: typeof source.defaultGroupId === 'string' ? source.defaultGroupId : '',
    defaultProfileId: typeof source.defaultProfileId === 'string' ? source.defaultProfileId : '',
    defaultResumeDocxEnabled:
      typeof source.defaultResumeDocxEnabled === 'boolean' ? source.defaultResumeDocxEnabled : true,
    defaultCoverLetterDocxEnabled:
      typeof source.defaultCoverLetterDocxEnabled === 'boolean' ? source.defaultCoverLetterDocxEnabled : true,
    outputStorageMode: source.outputStorageMode === 'multi' ? 'multi' : 'single',
    outputPathUsesJobTitle:
      typeof source.outputPathUsesJobTitle === 'boolean' ? source.outputPathUsesJobTitle : true,
    googleSheetsSources: normalizeGoogleSheetSources(source.googleSheetsSources),
  };
}

function normalizeAdminAppSettings(value: unknown): AdminAppSettings {
  const source = (typeof value === 'object' && value !== null ? value : {}) as Partial<AdminAppSettings>;

  return {
    ...normalizePublicAppSettings(source),
    outputBaseDir: typeof source.outputBaseDir === 'string' ? source.outputBaseDir : '',
    outputPathTemplate: typeof source.outputPathTemplate === 'string' ? source.outputPathTemplate : '',
    outputPathPreview: typeof source.outputPathPreview === 'string' ? source.outputPathPreview : '',
    apiKeys:
      typeof source.apiKeys === 'object' && source.apiKeys !== null
        ? source.apiKeys as Record<AIProvider, AdminApiKeyProviderSettings>
        : {
            openai: {
              configured: false,
              activeSource: 'none',
              activeKeyId: null,
              activePreview: null,
              environmentPreview: null,
              entries: [],
            },
            claude: {
              configured: false,
              activeSource: 'none',
              activeKeyId: null,
              activePreview: null,
              environmentPreview: null,
              entries: [],
            },
            openrouter: {
              configured: false,
              activeSource: 'none',
              activeKeyId: null,
              activePreview: null,
              environmentPreview: null,
              entries: [],
            },
          },
  };
}

export interface ApiKeyProviderUpdate {
  activeKeyId?: string;
  add?: Array<{
    clientId?: string;
    name?: string;
    value: string;
  }>;
  removeIds?: string[];
  useEnvironmentFallback?: boolean;
}

export interface AdminAppSettingsUpdate extends Partial<PublicAppSettings> {
  outputBaseDir?: string;
  outputPathTemplate?: string;
  apiKeys?: Partial<Record<AIProvider, ApiKeyProviderUpdate | string>>;
}

export interface BrowseOutputDirectoryResponse {
  selectedPath: string | null;
}

export interface GoogleSheetTab {
  title: string;
  index: number;
  sheetId: number;
}

export interface GoogleSheetColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

export interface GoogleSheetBorder {
  style: string;
  color: GoogleSheetColor;
}

export interface GoogleSheetTextFormat {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  fontSize: number | null;
  fontFamily: string | null;
  foregroundColor: GoogleSheetColor | null;
}

export interface GoogleSheetCellFormat {
  backgroundColor: GoogleSheetColor | null;
  textFormat: GoogleSheetTextFormat | null;
  horizontalAlignment: string | null;
  verticalAlignment: string | null;
  wrapStrategy: string | null;
  borders: {
    top: GoogleSheetBorder | null;
    right: GoogleSheetBorder | null;
    bottom: GoogleSheetBorder | null;
    left: GoogleSheetBorder | null;
  };
}

export interface GoogleSheetCell {
  value: string;
  format: GoogleSheetCellFormat | null;
}

export interface GoogleSheetMergeRange {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

export interface GoogleSheetsRangeRequest {
  sheetId: string;
  tabName?: string;
  fromRow?: number;
  toRow?: number;
  fromCol?: number;
  toCol?: number;
}

export interface GoogleSheetsUpdateRangeRequest extends GoogleSheetsRangeRequest {
  values: string[][];
}

export interface GoogleSheetsRangeResponse {
  spreadsheetId: string;
  spreadsheetTitle: string;
  tabs: GoogleSheetTab[];
  selectedTab?: string;
  range?: {
    fromRow: number;
    toRow: number;
    fromCol: number;
    toCol: number;
    a1Notation: string;
  };
  cells?: GoogleSheetCell[][];
  rowHeights?: number[];
  columnWidths?: number[];
  merges?: GoogleSheetMergeRange[];
  values?: string[][];
  totalRows?: number;
  totalColumns?: number;
}

export interface GoogleSheetsUpdateRangeResponse {
  spreadsheetId: string;
  spreadsheetTitle: string;
  selectedTab: string;
  updatedRange: string;
  updatedRows: number;
  updatedColumns: number;
  updatedCells: number;
}

export const adminApi = {
  login: (password: string) =>
    apiFetch<{ token: string; message: string }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () =>
    apiFetch<{ message: string }>('/admin/logout', {
      method: 'POST',
    }),

  verify: () =>
    apiFetch<{ valid: boolean }>('/admin/verify'),

  getSettings: async () =>
    normalizeAdminAppSettings(await apiFetch<AdminAppSettings>('/admin/settings')),

  browseOutputDirectory: (currentPath?: string) =>
    apiFetch<BrowseOutputDirectoryResponse>('/admin/browse-output-directory', {
      method: 'POST',
      body: JSON.stringify({ currentPath }),
    }),

  fetchGoogleSheetRange: (data: GoogleSheetsRangeRequest) =>
    apiFetch<GoogleSheetsRangeResponse>('/admin/google-sheets/range', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateGoogleSheetRange: (data: GoogleSheetsUpdateRangeRequest) =>
    apiFetch<GoogleSheetsUpdateRangeResponse>('/admin/google-sheets/range', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateSettings: async (data: AdminAppSettingsUpdate) =>
    normalizeAdminAppSettings(await apiFetch<AdminAppSettings>('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    })),

  getAIModels: async () =>
    normalizeAdminAppSettings(await apiFetch<AdminAppSettings>('/admin/ai-models')),

  updateAIModels: async (data: AdminAppSettingsUpdate) =>
    normalizeAdminAppSettings(await apiFetch<AdminAppSettings>('/admin/ai-models', {
      method: 'PUT',
      body: JSON.stringify(data),
    })),
};

export const importApi = {
  fetchGoogleSheetRange: (data: GoogleSheetsRangeRequest) =>
    apiFetch<GoogleSheetsRangeResponse>('/import', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Profile types
export interface Contact {
  phone: string;
  email: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  location: string;
}

export interface Experience {
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  location: string;
  description: string;
  achievements: string[];
}

export interface Strength {
  title: string;
  description: string;
}

export interface Education {
  degree: string;
  institution: string;
  startDate: string;
  endDate: string;
  location: string;
}

export interface Profile {
  id: string;
  name: string;
  title: string;
  totalYearsExperience?: number;
  preferredTemplate?: string;
  outputDirectory?: string;
  disabled?: boolean;
  contact: Contact;
  summary: string;
  experience: Experience[];
  strengths: Strength[];
  skills?: string[];
  hardSkills?: string[];
  softSkills?: string[];
  education: Education[];
  certifications?: Array<{
    name: string;
    issuer: string;
    date: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id: string;
  name: string;
  profileIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProfileDTO {
  name?: string;
  title?: string;
  totalYearsExperience?: number;
  outputDirectory?: string;
  contact?: Partial<Contact>;
  summary?: string;
  experience?: Partial<Experience>[];
  strengths?: Partial<Strength>[];
  skills?: string[];
  hardSkills?: string[];
  softSkills?: string[];
  education?: Partial<Education>[];
  preferredTemplate?: string;
  disabled?: boolean;
}

// Template types
export interface ManualTemplateConfigStored {
  name: string;
  description?: string;
  columns: 1 | 2;
  accentColor?: string;
  bodyColor?: string;
  bodyFontSizePt?: number;
  titleFontSizePt?: number;
  sectionOrder?: string[];
  leftSectionOrder?: string[];
  rightSectionOrder?: string[];
  nameStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: string };
  headerTitleStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: string };
  contactStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: string };
  sectionStyles?: Record<string, Record<string, { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: string }>>;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  disabled?: boolean;
  htmlContent: string;
  cssContent: string;
  sections: string[];
  createdAt: string;
  updatedAt: string;
  manualConfig?: ManualTemplateConfigStored;
}

export type PromptResponseFormat = 'json' | 'text';

export interface PromptVariableDefinition {
  name: string;
  description?: string;
  sampleValue?: string;
}

export interface PromptValidation {
  usedVariables: string[];
  unknownVariables: string[];
}

export interface PromptSummary {
  id: string;
  name: string;
  description: string;
  responseFormat: PromptResponseFormat;
  allowedVariables: PromptVariableDefinition[];
  validation: PromptValidation;
  isBuiltIn: boolean;
  usage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptRecord extends PromptSummary {
  content: string;
}

export interface PromptPreviewResult {
  renderedContent: string;
  sampleValues: Record<string, string>;
  validation: PromptValidation;
}

// Job Analysis types
export interface JobAnalysis {
  requiredSkills: string[];
  preferredSkills: string[];
  keywords: string[];
  experienceLevel: string;
  keyResponsibilities: string[];
  industryTerms: string[];
  softSkills: string[];
  certifications: string[];
  jobTitle: string;
  companyInfo?: string;
}

export interface TailoredExperience {
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  location: string;
  description: string;
  achievements: string[];
}

export interface TailoredStrength {
  title: string;
  description: string;
}

export interface TailoredContent {
  title: string;
  summary: string;
  experience: TailoredExperience[];
  skills: string[];
  hardSkills: string[];
  softSkills: string[];
  requiredSkills?: string[];
  preferredSkills?: string[];
  strengths: TailoredStrength[];
  unconfirmedHardSkills?: string[];
  unconfirmedSoftSkills?: string[];
  coverLetter?: string;
}

// Profiles API
export const profilesApi = {
  getAll: (options?: { includeDisabled?: boolean }) =>
    apiFetch<Profile[]>(
      options?.includeDisabled ? '/profiles?includeDisabled=true' : '/profiles'
    ),

  getById: (id: string) => apiFetch<Profile>(`/profiles/${id}`),

  create: (data: CreateProfileDTO) =>
    apiFetch<Profile>('/profiles', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Partial<CreateProfileDTO>) =>
    apiFetch<Profile>(`/profiles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<{ message: string }>(`/profiles/${id}`, {
      method: 'DELETE',
    }),

  uploadResume: (file: File) => {
    const formData = new FormData();
    formData.append('resume', file);
    return apiFetch<Profile>('/profiles/upload', {
      method: 'POST',
      body: formData,
    });
  },
};

// Groups API
export const groupsApi = {
  getAll: () => apiFetch<Group[]>('/groups'),

  create: (data: { name: string; profileIds: string[] }) =>
    apiFetch<Group>('/groups', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: { name?: string; profileIds?: string[] }) =>
    apiFetch<Group>(`/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<{ message: string }>(`/groups/${id}`, {
      method: 'DELETE',
    }),
};

// Templates API
export const templatesApi = {
  getAll: (options?: { includeDisabled?: boolean }) =>
    apiFetch<Template[]>(
      options?.includeDisabled ? '/templates?includeDisabled=true' : '/templates'
    ),

  getById: (id: string) => apiFetch<Template>(`/templates/${id}`),

  update: (id: string, data: { disabled?: boolean; name?: string; description?: string }) =>
    apiFetch<Template>(`/templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  upload: async (file: File, name: string): Promise<Template> => {
    const formData = new FormData();
    formData.append('pdf', file);
    formData.append('name', name);

    return apiFetch<Template>('/templates/upload', {
      method: 'POST',
      body: formData,
    });
  },

  uploadJson: async (file: File): Promise<Template> => {
    const formData = new FormData();
    formData.append('template', file);

    return apiFetch<Template>('/templates/upload-json', {
      method: 'POST',
      body: formData,
    });
  },

  delete: (id: string) =>
    apiFetch<{ message: string }>(`/templates/${id}`, {
      method: 'DELETE',
    }),

  updateManual: (id: string, config: {
    name: string;
    description?: string;
    columns?: 1 | 2;
    accentColor?: string;
    bodyColor?: string;
    bodyFontSizePt?: number;
    titleFontSizePt?: number;
    sectionOrder?: string[];
    leftSectionOrder?: string[];
    rightSectionOrder?: string[];
    nameStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold' };
    headerTitleStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold' };
    contactStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold' };
    titleStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold' };
    subTitleStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold' };
    paragraphStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold' };
    sectionStyles?: Record<string, Record<string, { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: string }>>;
  }) =>
    apiFetch<Template>(`/templates/${id}/update-manual`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  createManual: (config: {
    name: string;
    description?: string;
    columns?: 1 | 2;
    accentColor?: string;
    bodyColor?: string;
    bodyFontSizePt?: number;
    titleFontSizePt?: number;
    sectionOrder?: string[];
    leftSectionOrder?: string[];
    rightSectionOrder?: string[];
    nameStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold' };
    headerTitleStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold' };
    contactStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold' };
    titleStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold' };
    subTitleStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold' };
    paragraphStyle?: { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: 'normal' | 'bold' };
    sectionStyles?: Record<string, Record<string, { color?: string; fontSizePt?: number; fontFamily?: string; fontWeight?: string }>>;
  }) =>
    apiFetch<Template>('/templates/create-manual', {
      method: 'POST',
      body: JSON.stringify(config),
    }),
};

export const promptsApi = {
  getAll: () => apiFetch<PromptSummary[]>('/prompts'),

  getById: (id: string) => apiFetch<PromptRecord>(`/prompts/${id}`),

  create: (data: {
    name: string;
    description?: string;
    content: string;
    responseFormat?: PromptResponseFormat;
    allowedVariables?: PromptVariableDefinition[];
  }) =>
    apiFetch<PromptRecord>('/prompts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (
    id: string,
    data: {
      name?: string;
      description?: string;
      content: string;
      responseFormat?: PromptResponseFormat;
      allowedVariables?: PromptVariableDefinition[];
    }
  ) =>
    apiFetch<PromptRecord>(`/prompts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<{ message: string }>(`/prompts/${id}`, {
      method: 'DELETE',
    }),

  validateDraft: (data: {
    id?: string;
    content?: string;
    allowedVariables?: PromptVariableDefinition[];
    sampleValues?: Record<string, string>;
  }) =>
    apiFetch<PromptValidation>('/prompts/validate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  previewDraft: (data: {
    id?: string;
    content?: string;
    allowedVariables?: PromptVariableDefinition[];
    sampleValues?: Record<string, string>;
  }) =>
    apiFetch<PromptPreviewResult>('/prompts/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// Resume API
export const resumeApi = {
  getModels: async () => normalizePublicAppSettings(await apiFetch<PublicAppSettings>('/resume/models')),

  analyze: (jobDescription: string, model: AIProvider) =>
    apiFetch<JobAnalysis>('/resume/analyze', {
      method: 'POST',
      body: JSON.stringify({ jobDescription, model }),
    }),

  generate: (data: {
    profileId: string;
    templateId: string;
    jobDescription?: string;
    jobAnalysis?: JobAnalysis;
    tailoredContent?: TailoredContent;
    companyName: string;
    role: string;
    model: AIProvider;
    format?: 'pdf' | 'docx' | 'both';
    includeCoverLetterDocx?: boolean;
  }) =>
    apiFetch<
      | { filename: string; downloadUrl: string; tailored: boolean; format?: 'pdf' | 'docx' }
      | {
          pdf: { filename: string; downloadUrl: string };
          docx: { filename: string; downloadUrl: string };
          coverLetter?: {
            pdf: { filename: string; downloadUrl: string };
            docx?: { filename: string; downloadUrl: string };
          };
          tailored: boolean;
        }
    >(
      '/resume/generate',
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),

  generateAll: (data: {
    templateId?: string;
    jobDescription?: string;
    jobAnalysis?: JobAnalysis;
    companyName: string;
    role: string;
    model: AIProvider;
    profileIds?: string[];
    format?: 'pdf' | 'docx' | 'both';
    includeCoverLetterDocx?: boolean;
  }) =>
    apiFetch<{
      generated: number;
      results: Array<{
        profileId: string;
        profileName: string;
        pdf?: string;
        docx?: string;
        coverLetterPdf?: string;
        coverLetterDocx?: string;
      }>;
      tailored: boolean;
      unconfirmedHardSkills?: string[];
      unconfirmedSoftSkills?: string[];
    }>('/resume/generate-all', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  confirmSkill: (data: { type: 'hard' | 'soft'; skill: string }) =>
    apiFetch<{ added: boolean; skill: string; type: 'hard' | 'soft' }>('/resume/skills/confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listSkills: (type: 'hard' | 'soft') =>
    apiFetch<{ skills: string[] }>(`/resume/skills?type=${type}`),

  addSkill: (data: { type: 'hard' | 'soft'; skill: string }) =>
    apiFetch<{ added: boolean; skill: string; type: 'hard' | 'soft' }>('/resume/skills', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSkill: (data: { type: 'hard' | 'soft'; original: string; skill: string }) =>
    apiFetch<{ updated: boolean; skill: string; type: 'hard' | 'soft' }>('/resume/skills', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteSkill: (data: { type: 'hard' | 'soft'; skill: string }) =>
    apiFetch<{ deleted: boolean; skill: string; type: 'hard' | 'soft' }>('/resume/skills', {
      method: 'DELETE',
      body: JSON.stringify(data),
    }),

  preview: (data: {
    profileId: string;
    templateId: string;
    jobDescription?: string;
    jobAnalysis?: JobAnalysis;
    tailoredContent?: TailoredContent;
    model: AIProvider;
  }) =>
    apiFetch<{ html: string; tailored: boolean; tailoredContent?: TailoredContent }>('/resume/preview', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  previewAll: (data: {
    templateId?: string;
    jobDescription?: string;
    jobAnalysis?: JobAnalysis;
    model: AIProvider;
    profileIds?: string[];
  }) =>
    apiFetch<{
      previews: Array<{
        profileId: string;
        profileName: string;
        html: string;
        tailoredContent?: TailoredContent;
      }>;
      tailored: boolean;
      unconfirmedHardSkills?: string[];
      unconfirmedSoftSkills?: string[];
    }>('/resume/preview-all', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getDownloadUrl: (filename: string) =>
    `${getCurrentApiBase()}/resume/download/${filename}`,
};
