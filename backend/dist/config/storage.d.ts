export declare const DEFAULT_GENERATED_RESUMES_DIR: string;
export declare const DEFAULT_OUTPUT_PATH_TEMPLATE = "/{{profile name}}/{{date}}/{{company name}}/{{job title}}";
export declare const OUTPUT_PATH_TOKENS: readonly [{
    readonly token: "{{date}}";
    readonly description: "Current date as YYYY-MM-DD";
}, {
    readonly token: "{{profile name}}";
    readonly description: "Selected profile name";
}, {
    readonly token: "{{company name}}";
    readonly description: "Company name";
}, {
    readonly token: "{{job title}}";
    readonly description: "Role / job title";
}];
type OutputPathVariables = {
    date: string;
    profileName: string;
    companyName: string;
    jobTitle: string;
};
export declare function sanitizePathSegment(value: string): string;
export declare function normalizeOutputBaseDir(value: unknown): string;
export declare function validateOutputBaseDir(value: unknown): string;
export declare function ensureWritableOutputDir(value: string): Promise<string>;
export declare function normalizeOutputPathTemplate(value: unknown): string;
export declare function validateOutputPathTemplate(value: unknown): string;
export declare function renderOutputPathTemplate(template: string, variables: OutputPathVariables): string;
export declare function buildOutputPathPreview(template: string): string;
export declare function outputPathTemplateUsesJobTitle(template: string): boolean;
export declare function resolveStoredFilePath(baseDir: string, relativePathValue: string): string | null;
export {};
//# sourceMappingURL=storage.d.ts.map