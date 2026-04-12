import { AIProvider } from '../types/template';
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
    apiKeys: ProviderKeyStores;
};
export type AIModelSettings = Pick<AppSettings, 'openaiEnabled' | 'claudeEnabled' | 'openrouterEnabled'>;
export type PublicAppSettings = AIModelSettings & Pick<AppSettings, 'defaultMode' | 'defaultTheme' | 'defaultResumeSelection' | 'defaultGroupId' | 'defaultProfileId' | 'defaultResumeDocxEnabled' | 'defaultCoverLetterDocxEnabled'>;
export type AdminAppSettings = PublicAppSettings & {
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
export declare function getAppSettings(): Promise<AppSettings>;
export declare function getPublicAppSettings(): Promise<PublicAppSettings>;
export declare function getAdminAppSettings(): Promise<AdminAppSettings>;
export declare function updateAppSettings(input: AppSettingsUpdate): Promise<AdminAppSettings>;
export declare function getAIModelSettings(): Promise<AIModelSettings>;
export declare function updateAIModelSettings(input: Partial<AIModelSettings>): Promise<AIModelSettings>;
export declare function getProviderApiKey(provider: AIProvider): Promise<string>;
export declare function getOutputStorageSettings(): Promise<Pick<AppSettings, 'outputBaseDir' | 'outputPathTemplate'>>;
export declare function isProviderEnabled(provider: AIProvider, settings: AIModelSettings): boolean;
export declare function getDefaultEnabledProvider(settings: AIModelSettings): AIProvider;
export {};
//# sourceMappingURL=aiModelConfig.d.ts.map