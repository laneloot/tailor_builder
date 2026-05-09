import { PromptCreateInput, PromptPreviewInput, PromptPreviewResult, PromptRecord, PromptSummary, PromptUpdateInput, PromptValidation, PromptVariableDefinition } from '../types/prompt';
export declare function extractPromptVariables(content: string): string[];
export declare function validatePromptContent(content: string, allowedVariables: PromptVariableDefinition[]): PromptValidation;
export type RenderedPromptSegment = {
    text: string;
    variableName?: string;
};
export declare function listPrompts(): Promise<PromptSummary[]>;
export declare function getPromptById(id: string): Promise<PromptRecord | null>;
export declare function createPrompt(input: PromptCreateInput): Promise<PromptRecord>;
export declare function updatePrompt(id: string, input: PromptUpdateInput): Promise<PromptRecord | null>;
export declare function deletePrompt(id: string): Promise<boolean>;
export declare function previewPrompt(input: PromptPreviewInput): Promise<PromptPreviewResult>;
export declare function validatePromptDraft(input: PromptPreviewInput): Promise<PromptValidation>;
export declare function renderPrompt(id: string, values: Record<string, string>): Promise<string>;
export declare function renderPromptSegments(id: string, values: Record<string, string>): Promise<RenderedPromptSegment[]>;
//# sourceMappingURL=promptService.d.ts.map