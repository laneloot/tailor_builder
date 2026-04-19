import { AIProvider } from '../types/template';
export type StoredApiKeyRow = {
    id: string;
    provider: AIProvider;
    name: string;
    keyValue: string;
    isActive: boolean;
    createdAt: string;
};
export type StoredGoogleSheetRow = {
    id: string;
    name: string;
    sheetId: string;
    createdAt: string;
    updatedAt: string;
};
export declare function ensureSettingsDatabase(): void;
export declare function readStoredApiKeys(): StoredApiKeyRow[];
export declare function replaceStoredApiKeys(rows: StoredApiKeyRow[]): void;
export declare function countStoredApiKeys(): number;
export declare function readStoredGoogleSheetRows(): StoredGoogleSheetRow[];
export declare function replaceStoredGoogleSheetRows(rows: StoredGoogleSheetRow[]): void;
export declare function countStoredGoogleSheetRows(): number;
//# sourceMappingURL=settingsDatabase.d.ts.map