import { Profile } from '../types/profile';
import { AIProvider, JobAnalysis, TailoredContent } from '../types/template';
export declare function addTechSkill(skill: string): boolean;
export declare function addSoftSkill(skill: string): boolean;
export declare function refreshSkillCaches(): void;
declare const DEFAULT_PROVIDER: AIProvider;
export declare function resolveAIProvider(model?: string): AIProvider;
export declare function analyzeJobDescription(jobDescription: string, provider?: AIProvider): Promise<JobAnalysis>;
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