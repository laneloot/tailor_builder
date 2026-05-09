import type { AIProvider } from '../types/template';
export declare const JOB_FILTER_PROVIDER: AIProvider;
export declare const JOB_FILTER_PROMPT_ID = "filter-google-sheet-job";
export declare const JOB_FILTER_MIN_CONTENT_LENGTH = 50;
export type JobFilterAnalysis = {
    jobType: string;
    onsiteInterview: string;
    companyCategory: string;
    seniority: string;
    clearanceRequired: string;
    salary: string;
    region: string;
    usState: string;
};
export type JobFilterDecision = {
    result: 'Pass' | 'Fail';
    reason: string | null;
};
export declare function stringifySalary(value: unknown): string;
export declare function getEmptyJobFilterAnalysis(): JobFilterAnalysis;
export declare function normalizeJobFilterAnalysis(payload: unknown): JobFilterAnalysis;
export declare function evaluateJobFilterAnalysis(analysis: JobFilterAnalysis): JobFilterDecision;
export declare function buildJobFilterPrompt(jobContent: string, jobLink?: string): Promise<string>;
export declare function evaluateJobContentAgainstFilter(input: {
    jobContent: string;
    jobLink?: string;
    provider?: AIProvider;
}): Promise<JobFilterAnalysis>;
//# sourceMappingURL=jobFilter.d.ts.map