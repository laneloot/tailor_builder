
export function removeDuplicateSubstrings(skills: string[]): string[] {
  return skills.filter((skill) => {
    return !skills.some(
      (other) => other !== skill && other.toLowerCase().includes(skill.toLowerCase())
    );
  });
}