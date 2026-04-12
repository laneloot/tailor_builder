import { Profile } from '../types/profile';
export interface GeneratedPathInfo {
    relativeBase: string;
    absoluteDir: string;
    profileSlug: string;
    companyFolderName: string;
    roleSlug: string;
}
export declare function getGeneratedOutputPath(profile: Profile, companyName: string, role: string): Promise<GeneratedPathInfo>;
export declare function getGeneratedFilePath(relativePathValue: string): Promise<string | null>;
//# sourceMappingURL=generatedPath.d.ts.map