import { Profile } from '../types/profile';
import type { AIProvider, JobAnalysis, TailoredContent } from '../types/template';
export declare function refreshSkillCaches(): void;
declare const DEFAULT_PROVIDER: AIProvider;
type CompletionResponseFormat = 'json' | 'text';
type AnthropicCacheTtl = '5m' | '1h';
export declare function resolveAIProvider(model?: string): AIProvider;
export declare function createTextCompletion(prompt: string, provider?: AIProvider, maxTokens?: number, temperature?: number, responseFormat?: CompletionResponseFormat, modelName?: string): Promise<string>;
export declare function resolvePromptExecutionConfig(promptId: string, fallbackProvider: AIProvider): Promise<{
    provider: AIProvider;
    modelName?: string;
}>;
export declare function shouldUseAnthropicOptimizationsForPrompt(promptId: string, requestedProvider: AIProvider): Promise<boolean>;
export declare function createPromptCompletion(input: {
    promptId: string;
    prompt: string;
    promptValues?: Record<string, string>;
    fallbackProvider?: AIProvider;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: CompletionResponseFormat;
    anthropicCacheTtl?: AnthropicCacheTtl;
}): Promise<string>;
export declare function canUseAnthropicBatchForPrompt(promptId: string, fallbackProvider: AIProvider): Promise<boolean>;
export declare function batchCreatePromptCompletions(input: {
    promptId: string;
    items: Array<{
        customId: string;
        values: Record<string, string>;
    }>;
    fallbackProvider?: AIProvider;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: CompletionResponseFormat;
    anthropicCacheTtl?: AnthropicCacheTtl;
}): Promise<Map<string, {
    content?: string;
    error?: string;
}>>;
export declare function analyzeJobDescription(jobDescription: string, provider?: AIProvider): Promise<JobAnalysis>;
export declare function buildAnalyzeJobDescriptionPromptValues(jobDescription: string): Record<string, string>;
export declare function parseJobAnalysisContent(content: string, jobDescription: string): JobAnalysis;
export declare function batchAnalyzeJobDescriptions(input: {
    items: Array<{
        customId: string;
        jobDescription: string;
    }>;
    provider?: AIProvider;
    anthropicCacheTtl?: AnthropicCacheTtl;
}): Promise<Map<string, {
    analysis?: JobAnalysis;
    error?: string;
}>>;
export declare function buildTailorResumePromptValues(profile: Profile, jobAnalysis: JobAnalysis): Record<string, string>;
export declare function parseTailoredResumeContent(content: string, profile: Profile, jobAnalysis: JobAnalysis): TailoredContent;
export declare function tailorResume(profile: Profile, jobAnalysis: JobAnalysis, provider?: AIProvider): Promise<TailoredContent>;
/**
 * Generate a cover letter body when no job description is provided.
 * Returns only the body text (no salutation or sign-off).
 */
export declare function generateCoverLetter(profile: Profile, companyName: string, role: string, provider?: AIProvider): Promise<string>;
export declare function extractTemplateFromPDF(pdfText: string, templateName: string, provider?: AIProvider): Promise<{
    html: string;
    css: string;
    sections: string[];
}>;
export declare function extractProfileFromResume(resumeText: string, provider?: AIProvider): Promise<Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>>;
export { DEFAULT_PROVIDER };
//# sourceMappingURL=claude.d.ts.map