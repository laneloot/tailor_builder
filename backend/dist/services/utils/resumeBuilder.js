"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeDuplicateSubstrings = removeDuplicateSubstrings;
exports.ensureMinTechSkills = ensureMinTechSkills;
function removeDuplicateSubstrings(skills) {
    return skills.filter((skill) => {
        return !skills.some((other) => other !== skill && other.toLowerCase().includes(skill.toLowerCase()));
    });
}
function ensureMinTechSkills(hardSkills, supplementTechSkills, maxNum) {
    const missingCount = maxNum - hardSkills.length;
    // If missing skills, supplement them from the available list
    if (missingCount > 0) {
        const additionalSkills = supplementTechSkills.slice(0, missingCount);
        return [...hardSkills, ...additionalSkills];
    }
    return hardSkills; // Return the original array if it already has 20 or more skills
}
// Example usage:
let finalResult = {
    hardSkills: ['aaa', 'bbb']
};
//# sourceMappingURL=resumeBuilder.js.map