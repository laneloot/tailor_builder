"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JOB_FILTER_MIN_CONTENT_LENGTH = exports.JOB_FILTER_PROMPT_ID = exports.JOB_FILTER_PROVIDER = void 0;
exports.stringifySalary = stringifySalary;
exports.getEmptyJobFilterAnalysis = getEmptyJobFilterAnalysis;
exports.normalizeJobFilterAnalysis = normalizeJobFilterAnalysis;
exports.evaluateJobFilterAnalysis = evaluateJobFilterAnalysis;
exports.buildJobFilterPrompt = buildJobFilterPrompt;
exports.evaluateJobContentAgainstFilter = evaluateJobContentAgainstFilter;
const json_1 = require("../utils/json");
const claude_1 = require("./claude");
const promptService_1 = require("./promptService");
exports.JOB_FILTER_PROVIDER = 'openrouter';
exports.JOB_FILTER_PROMPT_ID = 'filter-google-sheet-job';
exports.JOB_FILTER_MIN_CONTENT_LENGTH = 50;
function normalizeText(value) {
    if (typeof value === 'string') {
        return value.replace(/\s+/g, ' ').trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }
    return '';
}
function formatSalaryFromParts(parts) {
    const { min, max, period } = parts;
    const range = min && max ? `${min} - ${max}` : min || max;
    if (!range) {
        return period;
    }
    return period ? `${range} / ${period}` : range;
}
function stringifySalary(value) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return normalizeText(value);
    }
    if (!value || typeof value !== 'object') {
        return '';
    }
    const salary = value;
    const raw = normalizeText(salary.raw);
    if (raw) {
        return raw;
    }
    return formatSalaryFromParts({
        min: normalizeText(salary.min),
        max: normalizeText(salary.max),
        period: normalizeText(salary.period),
    });
}
function getEmptyJobFilterAnalysis() {
    return {
        jobType: '',
        onsiteInterview: '',
        companyCategory: '',
        seniority: '',
        clearanceRequired: '',
        salary: '',
        region: '',
        usState: '',
    };
}
function normalizeJobFilterAnalysis(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Job filter response must be a JSON object.');
    }
    const source = payload;
    return {
        jobType: normalizeText(source.job_type ?? source.jobType),
        onsiteInterview: normalizeText(source.onsite_interview ?? source.onsiteInterview),
        companyCategory: normalizeText(source.company_category ?? source.companyCategory),
        seniority: normalizeText(source.seniority),
        clearanceRequired: normalizeText(source.clearance_required ?? source.clearanceRequired),
        salary: stringifySalary(source.salary),
        region: normalizeText(source.region),
        usState: normalizeText(source.us_state ?? source.usState),
    };
}
function normalizeRuleValue(value) {
    return value.trim().toLowerCase();
}
function evaluateJobFilterAnalysis(analysis) {
    const jobType = normalizeRuleValue(analysis.jobType);
    if (jobType === 'hybrid') {
        return { result: 'Fail', reason: 'hybrid' };
    }
    if (jobType === 'on_site') {
        return { result: 'Fail', reason: 'on_site' };
    }
    if (jobType === 'not_specified') {
        return { result: 'Fail', reason: 'job_type_not_specified' };
    }
    if (normalizeRuleValue(analysis.onsiteInterview) === 'yes') {
        return { result: 'Fail', reason: 'onsite_interview' };
    }
    const companyCategory = normalizeRuleValue(analysis.companyCategory);
    if (companyCategory === 'healthcare') {
        return { result: 'Fail', reason: 'healthcare' };
    }
    if (companyCategory === 'fintech') {
        return { result: 'Fail', reason: 'fintech' };
    }
    if (companyCategory === 'defense_military') {
        return { result: 'Fail', reason: 'defense_military' };
    }
    const seniority = normalizeRuleValue(analysis.seniority);
    if (seniority === 'intern') {
        return { result: 'Fail', reason: 'intern' };
    }
    if (seniority === 'junior') {
        return { result: 'Fail', reason: 'junior' };
    }
    if (seniority === 'lead') {
        return { result: 'Fail', reason: 'lead' };
    }
    if (seniority === 'principal') {
        return { result: 'Fail', reason: 'principal' };
    }
    if (seniority === 'director') {
        return { result: 'Fail', reason: 'director' };
    }
    if (seniority === 'vp') {
        return { result: 'Fail', reason: 'vp' };
    }
    if (seniority === 'manager') {
        return { result: 'Fail', reason: 'manager' };
    }
    const clearanceRequired = normalizeRuleValue(analysis.clearanceRequired);
    if (clearanceRequired !== 'none' && clearanceRequired !== 'not_specified') {
        return { result: 'Fail', reason: 'clearance_required' };
    }
    if (normalizeRuleValue(analysis.region) === 'not_us') {
        return { result: 'Fail', reason: 'not_us' };
    }
    return { result: 'Pass', reason: null };
}
async function buildJobFilterPrompt(jobContent, jobLink = '') {
    const normalizedContent = jobContent.trim();
    if (!normalizedContent) {
        throw new Error('Job content is required.');
    }
    const normalizedLink = jobLink.trim();
    return (0, promptService_1.renderPrompt)(exports.JOB_FILTER_PROMPT_ID, {
        jobContent: normalizedContent,
        jobDescription: normalizedContent,
        jobLink: normalizedLink,
    });
}
async function evaluateJobContentAgainstFilter(input) {
    const jobContent = normalizeText(input.jobContent);
    if (jobContent.length < exports.JOB_FILTER_MIN_CONTENT_LENGTH) {
        return getEmptyJobFilterAnalysis();
    }
    const prompt = await buildJobFilterPrompt(jobContent, input.jobLink);
    const responseText = await (0, claude_1.createPromptCompletion)({
        promptId: exports.JOB_FILTER_PROMPT_ID,
        prompt,
        fallbackProvider: input.provider || exports.JOB_FILTER_PROVIDER,
        maxTokens: 500,
        temperature: 0,
        responseFormat: 'json',
    });
    const responseJson = JSON.parse((0, json_1.extractJSON)(responseText));
    return normalizeJobFilterAnalysis(responseJson);
}
//# sourceMappingURL=jobFilter.js.map