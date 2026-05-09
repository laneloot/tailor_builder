import type { AIProvider } from '../types/template';
export type AIModelOption = {
    id: string;
    label: string;
    provider: AIProvider;
    modelName: string;
    description: string;
};
export declare const DEFAULT_OPENAI_MODEL: string;
export declare const DEFAULT_OPENROUTER_MODEL: string;
export declare const DEFAULT_CLAUDE_MODEL: string;
export declare function listAIModelOptions(): AIModelOption[];
export declare function getAIModelOptionById(id: string): AIModelOption | null;
export declare function normalizePromptModelSelection(provider: unknown, modelName: unknown): {
    provider: AIProvider;
    modelName: string;
} | null;
//# sourceMappingURL=aiModelCatalog.d.ts.map