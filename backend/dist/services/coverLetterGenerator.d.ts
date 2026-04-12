import { Profile } from '../types/profile';
import type { GeneratedPathInfo } from './generatedPath';
/**
 * Save cover letter as PDF in the same directory as the resume.
 * Path: {profile}/{count+1}_{company}/{role}/{profile}_cover_letter.pdf
 */
export declare function saveCoverLetter(profile: Profile, content: string, pathInfo: GeneratedPathInfo): Promise<string>;
/**
 * Save cover letter as DOCX in the same directory as the resume.
 * Path: {profile}/{date}/{company}/{role}/{profile}_cover_letter.docx
 */
export declare function saveCoverLetterDOCX(profile: Profile, content: string, pathInfo: GeneratedPathInfo): Promise<string>;
//# sourceMappingURL=coverLetterGenerator.d.ts.map