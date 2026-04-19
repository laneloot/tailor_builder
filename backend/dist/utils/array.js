"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveCaseInsensitiveMatches = moveCaseInsensitiveMatches;
exports.uniqueCaseInsensitive = uniqueCaseInsensitive;
function moveCaseInsensitiveMatches(referenceValues, candidateValues, matchedValues) {
    const referenceSet = new Set(referenceValues.map((item) => item.toLowerCase()));
    for (let index = candidateValues.length - 1; index >= 0; index -= 1) {
        if (referenceSet.has(candidateValues[index].toLowerCase())) {
            matchedValues.push(candidateValues[index]);
            candidateValues.splice(index, 1);
        }
    }
}
function uniqueCaseInsensitive(values) {
    const seen = new Set();
    return values.filter((item) => {
        const key = item.toLowerCase();
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
//# sourceMappingURL=array.js.map