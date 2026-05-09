export type SkillType = 'hard' | 'soft';
export type SkillMutationResult = {
    skill: string;
    type: SkillType;
};
export type HardSkillRecord = {
    skill: string;
    priority: number;
};
export type AddSkillResult = SkillMutationResult & {
    added: boolean;
};
export type UpdateSkillResult = SkillMutationResult & {
    updated: boolean;
};
export type DeleteSkillResult = SkillMutationResult & {
    deleted: boolean;
};
export declare class SkillDatabaseError extends Error {
    readonly statusCode: number;
    constructor(message: string, statusCode: number);
}
export declare function ensureSkillsDatabase(): void;
export declare function isSkillType(value: unknown): value is SkillType;
export declare function readSkills(type: SkillType): string[];
export declare function readHardSkillRecords(): HardSkillRecord[];
export declare function readHardSkillPriorityMap(): Map<string, number>;
export declare function addSkill(type: SkillType, skill: string): AddSkillResult;
export declare function updateSkill(type: SkillType, original: string, skill: string): UpdateSkillResult;
export declare function deleteSkill(type: SkillType, skill: string): DeleteSkillResult;
//# sourceMappingURL=skillsDatabase.d.ts.map