"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const claude_1 = require("../services/claude");
const pdfGenerator_1 = require("../generators/pdfGenerator");
const docxGenerator_1 = require("../generators/docxGenerator");
const coverLetterGenerator_1 = require("../generators/coverLetterGenerator");
const generatedPath_1 = require("../utils/generatedPath");
const templateExtractor_1 = require("../extractors/templateExtractor");
const aiModelConfig_1 = require("../config/aiModelConfig");
const skills_1 = require("../controllers/skills");
const router = (0, express_1.Router)();
const PROFILES_DIR = path_1.default.join(__dirname, '../../data/profiles');
function shouldGenerateCoverLetterDocx(value) {
    return typeof value === 'boolean' ? value : true;
}
function resolveGenerationRole(role, analysis) {
    if (typeof role === 'string' && role.trim()) {
        return role.trim();
    }
    return analysis?.jobMeta?.title?.trim() || '';
}
// Get enabled AI models
router.get('/models', async (req, res) => {
    try {
        const settings = await (0, aiModelConfig_1.getPublicAppSettings)();
        res.json(settings);
    }
    catch {
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});
// Confirm and persist a new skill
router.post('/skills/confirm', skills_1.confirmSkill);
// List skills
router.get('/skills', skills_1.listSkills);
// Add skill
router.post('/skills', skills_1.createSkill);
// Update skill
router.put('/skills', skills_1.updateSkillHandler);
// Delete skill
router.delete('/skills', skills_1.deleteSkillHandler);
// Analyze job description
router.post('/analyze', async (req, res) => {
    try {
        const { jobDescription, model } = req.body;
        if (!jobDescription || jobDescription.trim().length < 50) {
            res.status(400).json({ error: 'Job description must be at least 50 characters' });
            return;
        }
        const settings = await (0, aiModelConfig_1.getAIModelSettings)();
        const requestedProvider = (0, claude_1.resolveAIProvider)(model);
        const provider = (0, aiModelConfig_1.isProviderEnabled)(requestedProvider, settings)
            ? requestedProvider
            : (0, aiModelConfig_1.getDefaultEnabledProvider)(settings);
        const analysis = await (0, claude_1.analyzeJobDescription)(jobDescription, provider);
        res.json(analysis);
    }
    catch (error) {
        console.error('Error analyzing job description:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to analyze job description'
        });
    }
});
router.post('/analyze-multi-job', async (req, res) => {
    try {
        const { jobs, model, } = req.body;
        if (!Array.isArray(jobs) || jobs.length === 0) {
            res.status(400).json({ error: 'At least one job is required' });
            return;
        }
        const settings = await (0, aiModelConfig_1.getAIModelSettings)();
        const requestedProvider = (0, claude_1.resolveAIProvider)(model);
        const provider = (0, aiModelConfig_1.isProviderEnabled)(requestedProvider, settings)
            ? requestedProvider
            : (0, aiModelConfig_1.getDefaultEnabledProvider)(settings);
        const validJobs = [];
        const failures = [];
        for (const [index, job] of jobs.entries()) {
            const companyName = typeof job.companyName === 'string' ? job.companyName.trim() : '';
            const jobDescription = typeof job.jobDescription === 'string' ? job.jobDescription.trim() : '';
            if (!companyName) {
                failures.push({
                    companyName: `Job ${index + 1}`,
                    sourceRowNumber: job.sourceRowNumber,
                    error: 'Company name is required',
                });
                continue;
            }
            if (jobDescription.length < 50) {
                failures.push({
                    companyName,
                    sourceRowNumber: job.sourceRowNumber,
                    error: 'Job description must be at least 50 characters',
                });
                continue;
            }
            validJobs.push({
                customId: `job_${index + 1}`,
                companyName,
                jobDescription,
                sourceRowNumber: job.sourceRowNumber,
            });
        }
        const analysesByCustomId = await (0, claude_1.batchAnalyzeJobDescriptions)({
            items: validJobs.map((job) => ({
                customId: job.customId,
                jobDescription: job.jobDescription,
            })),
            provider,
            anthropicCacheTtl: '1h',
        });
        const analyses = [];
        for (const job of validJobs) {
            const result = analysesByCustomId.get(job.customId);
            if (!result?.analysis) {
                failures.push({
                    companyName: job.companyName,
                    sourceRowNumber: job.sourceRowNumber,
                    error: result?.error || 'Analysis failed',
                });
                continue;
            }
            analyses.push({
                companyName: job.companyName,
                sourceRowNumber: job.sourceRowNumber,
                jobDescription: job.jobDescription,
                analysis: result.analysis,
            });
        }
        res.json({
            provider,
            analyzed: analyses.length,
            analyses,
            failed: failures.length,
            failures,
        });
    }
    catch (error) {
        console.error('Error analyzing multiple job descriptions:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to analyze job descriptions',
        });
    }
});
// Load all non-disabled profiles
async function loadAllProfiles(profileIds) {
    const selectedIds = Array.isArray(profileIds)
        ? new Set(profileIds.filter((id) => typeof id === 'string' && id.trim().length > 0))
        : null;
    const files = await promises_1.default.readdir(PROFILES_DIR);
    const profiles = [];
    for (const file of files) {
        if (file.endsWith('.json')) {
            try {
                const content = await promises_1.default.readFile(path_1.default.join(PROFILES_DIR, file), 'utf-8');
                const profile = JSON.parse(content);
                if (profile.disabled)
                    continue;
                if (selectedIds && !selectedIds.has(profile.id))
                    continue;
                profiles.push(profile);
            }
            catch {
                // Skip invalid profile files
            }
        }
    }
    return profiles.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
function collectUnconfirmedSkillMaps(content, hardMap, softMap) {
    if (!content)
        return;
    for (const skill of content.unconfirmedHardSkills ?? []) {
        const key = skill.trim().toLowerCase();
        if (key && !hardMap.has(key)) {
            hardMap.set(key, skill.trim());
        }
    }
    for (const skill of content.unconfirmedSoftSkills ?? []) {
        const key = skill.trim().toLowerCase();
        if (key && !softMap.has(key)) {
            softMap.set(key, skill.trim());
        }
    }
}
function toAnthropicBatchCustomId(profileId, index) {
    const sanitized = profileId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || `profile_${index + 1}`;
    return `resume_${index + 1}_${sanitized}`.slice(0, 64);
}
async function tailorResumesForBatchItems(items, provider) {
    const tailoredByCustomId = new Map();
    const failures = [];
    const itemByCustomId = new Map(items.map((item) => [item.customId, item]));
    const unconfirmedHardMap = new Map();
    const unconfirmedSoftMap = new Map();
    const shouldUseAnthropicBatch = items.length > 1
        && await (0, claude_1.canUseAnthropicBatchForPrompt)('tailor-resume', provider);
    if (shouldUseAnthropicBatch) {
        const batchResults = await (0, claude_1.batchCreatePromptCompletions)({
            promptId: 'tailor-resume',
            items: items.map((item) => ({
                customId: item.customId,
                values: (0, claude_1.buildTailorResumePromptValues)(item.profile, item.analysis),
            })),
            fallbackProvider: provider,
            maxTokens: 11000,
            temperature: 0.2,
            responseFormat: 'json',
            anthropicCacheTtl: '1h',
        });
        for (const [customId, result] of batchResults.entries()) {
            const item = itemByCustomId.get(customId);
            if (!item)
                continue;
            if (!result.content) {
                failures.push({
                    customId,
                    profileId: item.profile.id,
                    profileName: item.profile.name,
                    error: result.error || 'Tailoring request failed',
                    meta: item.meta,
                });
                continue;
            }
            try {
                const tailored = (0, claude_1.parseTailoredResumeContent)(result.content, item.profile, item.analysis);
                tailoredByCustomId.set(customId, tailored);
                collectUnconfirmedSkillMaps(tailored, unconfirmedHardMap, unconfirmedSoftMap);
            }
            catch (error) {
                failures.push({
                    customId,
                    profileId: item.profile.id,
                    profileName: item.profile.name,
                    error: error instanceof Error ? error.message : 'Failed to parse tailored resume response',
                    meta: item.meta,
                });
            }
        }
        for (const item of items) {
            if (tailoredByCustomId.has(item.customId) || failures.some((failure) => failure.customId === item.customId)) {
                continue;
            }
            failures.push({
                customId: item.customId,
                profileId: item.profile.id,
                profileName: item.profile.name,
                error: 'No Anthropic batch result returned for this request',
                meta: item.meta,
            });
        }
    }
    else {
        for (const item of items) {
            try {
                const tailored = await (0, claude_1.tailorResume)(item.profile, item.analysis, provider);
                tailoredByCustomId.set(item.customId, tailored);
                collectUnconfirmedSkillMaps(tailored, unconfirmedHardMap, unconfirmedSoftMap);
            }
            catch (error) {
                failures.push({
                    customId: item.customId,
                    profileId: item.profile.id,
                    profileName: item.profile.name,
                    error: error instanceof Error ? error.message : 'Failed to tailor resume',
                    meta: item.meta,
                });
            }
        }
    }
    return {
        tailoredByCustomId,
        failures,
        unconfirmedHardSkills: Array.from(unconfirmedHardMap.values()),
        unconfirmedSoftSkills: Array.from(unconfirmedSoftMap.values()),
    };
}
async function tailorResumesForProfiles(profiles, analysis, provider) {
    const items = profiles.map((profile, index) => ({
        customId: toAnthropicBatchCustomId(profile.id, index),
        profile,
        analysis,
        meta: { profileId: profile.id },
    }));
    const batchResult = await tailorResumesForBatchItems(items, provider);
    const tailoredByProfileId = new Map();
    for (const item of items) {
        const tailored = batchResult.tailoredByCustomId.get(item.customId);
        if (tailored) {
            tailoredByProfileId.set(item.profile.id, tailored);
        }
    }
    return {
        tailoredByProfileId,
        failures: batchResult.failures.map((failure) => ({
            profileId: failure.profileId,
            profileName: failure.profileName,
            error: failure.error,
        })),
        unconfirmedHardSkills: batchResult.unconfirmedHardSkills,
        unconfirmedSoftSkills: batchResult.unconfirmedSoftSkills,
    };
}
// Generate for all profiles at once
router.post('/generate-all', async (req, res) => {
    try {
        const { templateId, jobDescription, jobAnalysis, companyName, role, model, profileIds, format = 'both', includeCoverLetterDocx, } = req.body;
        // Load setting
        const settings = await (0, aiModelConfig_1.getAIModelSettings)();
        const appSettings = await (0, aiModelConfig_1.getPublicAppSettings)();
        const selectedModel = (0, claude_1.resolveAIProvider)(model);
        // Validate
        if (!(0, aiModelConfig_1.isProviderEnabled)(selectedModel, settings)) {
            res.status(400).json({ error: `Selected AI model '${selectedModel}' is disabled by admin` });
            return;
        }
        if (!companyName?.trim()) {
            res.status(400).json({ error: 'Company name is required' });
            return;
        }
        // Load profiles
        const profiles = await loadAllProfiles(profileIds);
        if (profiles.length === 0) {
            res.status(400).json({ error: 'No matching profiles available. Add profiles in Admin or update group members.' });
            return;
        }
        await (0, templateExtractor_1.createDefaultTemplate)();
        let analysis;
        const trimmedJobDescription = jobDescription?.trim();
        if (trimmedJobDescription && trimmedJobDescription.length > 50) {
            analysis = jobAnalysis || await (0, claude_1.analyzeJobDescription)(trimmedJobDescription, selectedModel);
        }
        const resolvedRole = resolveGenerationRole(role, analysis);
        if (appSettings.outputPathUsesJobTitle && !resolvedRole) {
            res.status(400).json({ error: 'Role is required' });
            return;
        }
        const normalizedCompanyName = companyName.trim();
        const results = [];
        const failures = [];
        const unconfirmedHardMap = new Map();
        const unconfirmedSoftMap = new Map();
        const formatNorm = format === 'both' ? 'both' : format === 'docx' ? 'docx' : 'pdf';
        const generateCoverLetterDocx = shouldGenerateCoverLetterDocx(includeCoverLetterDocx);
        const shouldUseBulkTailoring = analysis
            ? await (0, claude_1.canUseAnthropicBatchForPrompt)('tailor-resume', selectedModel)
            : false;
        const bulkTailoring = shouldUseBulkTailoring && analysis
            ? await tailorResumesForProfiles(profiles, analysis, selectedModel)
            : null;
        for (const profile of profiles) {
            if (!profile)
                continue;
            try {
                const profileTemplateId = profile.preferredTemplate ?? templateId ?? 'default';
                let template = await (0, templateExtractor_1.getTemplateById)(profileTemplateId);
                if (!template || template.disabled)
                    template = await (0, templateExtractor_1.getTemplateById)('default');
                if (!template || template.disabled) {
                    throw new Error('Default template not available');
                }
                const batchFailure = bulkTailoring?.failures.find((item) => item.profileId === profile.id);
                if (batchFailure) {
                    throw new Error(batchFailure.error);
                }
                let tailoredContent;
                if (analysis) {
                    tailoredContent = bulkTailoring
                        ? bulkTailoring.tailoredByProfileId.get(profile.id)
                        : await (0, claude_1.tailorResume)(profile, analysis, selectedModel);
                }
                collectUnconfirmedSkillMaps(tailoredContent, unconfirmedHardMap, unconfirmedSoftMap);
                let coverLetterBody;
                if (tailoredContent?.coverLetter?.trim()) {
                    coverLetterBody = tailoredContent.coverLetter.trim();
                }
                else {
                    coverLetterBody = await (0, claude_1.generateCoverLetter)(profile, normalizedCompanyName, resolvedRole, selectedModel);
                }
                const pathInfo = await (0, generatedPath_1.getGeneratedOutputPath)(profile, normalizedCompanyName, resolvedRole);
                const coverLetterPdfPath = await (0, coverLetterGenerator_1.saveCoverLetter)(profile, coverLetterBody, pathInfo);
                const coverLetterDocxPath = generateCoverLetterDocx
                    ? await (0, coverLetterGenerator_1.saveCoverLetterDOCX)(profile, coverLetterBody, pathInfo)
                    : undefined;
                const entry = {
                    profileId: profile.id,
                    profileName: profile.name,
                    coverLetterPdf: coverLetterPdfPath,
                    coverLetterDocx: coverLetterDocxPath,
                };
                if (formatNorm === 'both') {
                    const [pdfFilename, docxFilename] = await Promise.all([
                        (0, pdfGenerator_1.generateResumePDF)(profile, template, tailoredContent, pathInfo, normalizedCompanyName, resolvedRole),
                        (0, docxGenerator_1.generateResumeDOCX)(profile, tailoredContent, pathInfo, normalizedCompanyName, resolvedRole)
                    ]);
                    entry.pdf = pdfFilename;
                    entry.docx = docxFilename;
                }
                else {
                    const filename = formatNorm === 'docx'
                        ? await (0, docxGenerator_1.generateResumeDOCX)(profile, tailoredContent, pathInfo, normalizedCompanyName, resolvedRole)
                        : await (0, pdfGenerator_1.generateResumePDF)(profile, template, tailoredContent, pathInfo, normalizedCompanyName, resolvedRole);
                    entry[formatNorm] = filename;
                }
                results.push(entry);
            }
            catch (profileError) {
                const message = profileError instanceof Error ? profileError.message : 'Failed to generate resume';
                console.error(`Error generating resume for profile ${profile.id} (${profile.name}) at ${normalizedCompanyName}:`, profileError);
                failures.push({
                    profileId: profile.id,
                    profileName: profile.name,
                    companyName: normalizedCompanyName,
                    error: message,
                });
            }
        }
        res.json({
            generated: results.length,
            results,
            failed: failures.length,
            failures,
            failedCompanies: failures.length > 0 ? [normalizedCompanyName] : [],
            tailored: !!analysis,
            unconfirmedHardSkills: bulkTailoring?.unconfirmedHardSkills ?? Array.from(unconfirmedHardMap.values()),
            unconfirmedSoftSkills: bulkTailoring?.unconfirmedSoftSkills ?? Array.from(unconfirmedSoftMap.values()),
        });
    }
    catch (error) {
        console.error('Error generating resumes for all profiles:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate resumes'
        });
    }
});
router.post('/generate-multi-job', async (req, res) => {
    try {
        const { templateId, jobs, model, profileIds, format = 'both', includeCoverLetterDocx, } = req.body;
        const settings = await (0, aiModelConfig_1.getAIModelSettings)();
        const appSettings = await (0, aiModelConfig_1.getPublicAppSettings)();
        const selectedModel = (0, claude_1.resolveAIProvider)(model);
        if (!(0, aiModelConfig_1.isProviderEnabled)(selectedModel, settings)) {
            res.status(400).json({ error: `Selected AI model '${selectedModel}' is disabled by admin` });
            return;
        }
        if (!Array.isArray(jobs) || jobs.length === 0) {
            res.status(400).json({ error: 'At least one job is required' });
            return;
        }
        const profiles = await loadAllProfiles(profileIds);
        if (profiles.length === 0) {
            res.status(400).json({ error: 'No matching profiles available. Add profiles in Admin or update group members.' });
            return;
        }
        await (0, templateExtractor_1.createDefaultTemplate)();
        const normalizedJobs = jobs.map((job, index) => {
            const normalizedCompanyName = typeof job.companyName === 'string' ? job.companyName.trim() : '';
            const trimmedJobDescription = typeof job.jobDescription === 'string' ? job.jobDescription.trim() : '';
            if (!normalizedCompanyName) {
                throw new Error(`Job ${index + 1} is missing a company name`);
            }
            const analysis = job.jobAnalysis;
            const resolvedRole = resolveGenerationRole(job.role, analysis);
            if (appSettings.outputPathUsesJobTitle && !resolvedRole) {
                throw new Error(`Job ${index + 1} (${normalizedCompanyName}) is missing a role`);
            }
            return {
                companyName: normalizedCompanyName,
                role: resolvedRole,
                jobDescription: trimmedJobDescription,
                analysis,
                sourceRowNumber: job.sourceRowNumber,
            };
        });
        const batchItems = [];
        for (const [jobIndex, job] of normalizedJobs.entries()) {
            if (!job.analysis) {
                continue;
            }
            for (const [profileIndex, profile] of profiles.entries()) {
                batchItems.push({
                    customId: toAnthropicBatchCustomId(`${profile.id}_${jobIndex + 1}`, jobIndex * profiles.length + profileIndex),
                    profile,
                    analysis: job.analysis,
                    meta: { jobIndex },
                });
            }
        }
        const bulkTailoring = batchItems.length > 0
            ? await tailorResumesForBatchItems(batchItems, selectedModel)
            : null;
        const formatNorm = format === 'both' ? 'both' : format === 'docx' ? 'docx' : 'pdf';
        const generateCoverLetterDocx = shouldGenerateCoverLetterDocx(includeCoverLetterDocx);
        const results = [];
        const failures = [];
        const failedCompanies = new Set();
        const unconfirmedHardMap = new Map();
        const unconfirmedSoftMap = new Map();
        for (const [jobIndex, job] of normalizedJobs.entries()) {
            for (const profile of profiles) {
                try {
                    const profileTemplateId = profile.preferredTemplate ?? templateId ?? 'default';
                    let template = await (0, templateExtractor_1.getTemplateById)(profileTemplateId);
                    if (!template || template.disabled)
                        template = await (0, templateExtractor_1.getTemplateById)('default');
                    if (!template || template.disabled) {
                        throw new Error('Default template not available');
                    }
                    let tailoredContent;
                    if (job.analysis) {
                        const customId = batchItems.find((item) => item.profile.id === profile.id && item.meta.jobIndex === jobIndex)?.customId;
                        const batchFailure = customId
                            ? bulkTailoring?.failures.find((failure) => failure.customId === customId)
                            : undefined;
                        if (batchFailure) {
                            throw new Error(batchFailure.error);
                        }
                        tailoredContent = customId
                            ? bulkTailoring?.tailoredByCustomId.get(customId)
                            : await (0, claude_1.tailorResume)(profile, job.analysis, selectedModel);
                    }
                    collectUnconfirmedSkillMaps(tailoredContent, unconfirmedHardMap, unconfirmedSoftMap);
                    let coverLetterBody;
                    if (tailoredContent?.coverLetter?.trim()) {
                        coverLetterBody = tailoredContent.coverLetter.trim();
                    }
                    else {
                        coverLetterBody = await (0, claude_1.generateCoverLetter)(profile, job.companyName, job.role, selectedModel);
                    }
                    const pathInfo = await (0, generatedPath_1.getGeneratedOutputPath)(profile, job.companyName, job.role);
                    const coverLetterPdfPath = await (0, coverLetterGenerator_1.saveCoverLetter)(profile, coverLetterBody, pathInfo);
                    const coverLetterDocxPath = generateCoverLetterDocx
                        ? await (0, coverLetterGenerator_1.saveCoverLetterDOCX)(profile, coverLetterBody, pathInfo)
                        : undefined;
                    const entry = {
                        profileId: profile.id,
                        profileName: profile.name,
                        companyName: job.companyName,
                        role: job.role,
                        coverLetterPdf: coverLetterPdfPath,
                        coverLetterDocx: coverLetterDocxPath,
                    };
                    if (formatNorm === 'both') {
                        const [pdfFilename, docxFilename] = await Promise.all([
                            (0, pdfGenerator_1.generateResumePDF)(profile, template, tailoredContent, pathInfo, job.companyName, job.role),
                            (0, docxGenerator_1.generateResumeDOCX)(profile, tailoredContent, pathInfo, job.companyName, job.role),
                        ]);
                        entry.pdf = pdfFilename;
                        entry.docx = docxFilename;
                    }
                    else {
                        const filename = formatNorm === 'docx'
                            ? await (0, docxGenerator_1.generateResumeDOCX)(profile, tailoredContent, pathInfo, job.companyName, job.role)
                            : await (0, pdfGenerator_1.generateResumePDF)(profile, template, tailoredContent, pathInfo, job.companyName, job.role);
                        entry[formatNorm] = filename;
                    }
                    results.push(entry);
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : 'Failed to generate resume';
                    console.error(`Error generating resume for profile ${profile.id} (${profile.name}) at ${job.companyName}:`, error);
                    failures.push({
                        profileId: profile.id,
                        profileName: profile.name,
                        companyName: job.companyName,
                        error: message,
                    });
                    failedCompanies.add(job.companyName);
                }
            }
        }
        res.json({
            generated: results.length,
            failed: failures.length,
            results,
            failures,
            failedCompanies: Array.from(failedCompanies),
            tailored: batchItems.length > 0,
            unconfirmedHardSkills: bulkTailoring?.unconfirmedHardSkills ?? Array.from(unconfirmedHardMap.values()),
            unconfirmedSoftSkills: bulkTailoring?.unconfirmedSoftSkills ?? Array.from(unconfirmedSoftMap.values()),
        });
    }
    catch (error) {
        console.error('Error generating resumes for multiple jobs:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate resumes for multiple jobs',
        });
    }
});
// Preview resumes for all profiles
router.post('/preview-all', async (req, res) => {
    try {
        const { templateId, jobDescription, jobAnalysis, model, profileIds, } = req.body;
        const settings = await (0, aiModelConfig_1.getAIModelSettings)();
        const appSettings = await (0, aiModelConfig_1.getPublicAppSettings)();
        const selectedModel = (0, claude_1.resolveAIProvider)(model);
        if (!(0, aiModelConfig_1.isProviderEnabled)(selectedModel, settings)) {
            res.status(400).json({ error: `Selected AI model '${selectedModel}' is disabled by admin` });
            return;
        }
        const profiles = await loadAllProfiles(profileIds);
        if (profiles.length === 0) {
            res.status(400).json({ error: 'No matching profiles available. Add profiles in Admin or update group members.' });
            return;
        }
        await (0, templateExtractor_1.createDefaultTemplate)();
        let analysis;
        const trimmedJobDescription = jobDescription?.trim();
        if (trimmedJobDescription && trimmedJobDescription.length > 50) {
            analysis = jobAnalysis || await (0, claude_1.analyzeJobDescription)(trimmedJobDescription, selectedModel);
        }
        const previews = [];
        const unconfirmedHardMap = new Map();
        const unconfirmedSoftMap = new Map();
        const shouldUseBulkTailoring = analysis
            ? await (0, claude_1.canUseAnthropicBatchForPrompt)('tailor-resume', selectedModel)
            : false;
        const bulkTailoring = shouldUseBulkTailoring && analysis
            ? await tailorResumesForProfiles(profiles, analysis, selectedModel)
            : null;
        if (bulkTailoring && bulkTailoring.failures.length > 0) {
            throw new Error(`Failed to tailor ${bulkTailoring.failures.length} profile(s): ${bulkTailoring.failures
                .slice(0, 3)
                .map((item) => `${item.profileName}: ${item.error}`)
                .join(' | ')}${bulkTailoring.failures.length > 3 ? ' | ...' : ''}`);
        }
        for (const profile of profiles) {
            if (!profile)
                continue;
            const profileTemplateId = profile.preferredTemplate ?? templateId ?? 'default';
            let template = await (0, templateExtractor_1.getTemplateById)(profileTemplateId);
            if (!template || template.disabled)
                template = await (0, templateExtractor_1.getTemplateById)('default');
            if (!template || template.disabled) {
                res.status(500).json({ error: 'Default template not available' });
                return;
            }
            const tailoredContent = analysis
                ? bulkTailoring
                    ? bulkTailoring.tailoredByProfileId.get(profile.id)
                    : await (0, claude_1.tailorResume)(profile, analysis, selectedModel)
                : undefined;
            collectUnconfirmedSkillMaps(tailoredContent, unconfirmedHardMap, unconfirmedSoftMap);
            const html = await (0, pdfGenerator_1.generatePreviewHTML)(profile, template, tailoredContent);
            previews.push({
                profileId: profile.id,
                profileName: profile.name,
                html,
                tailoredContent,
            });
        }
        res.json({
            previews,
            tailored: !!analysis,
            unconfirmedHardSkills: bulkTailoring?.unconfirmedHardSkills ?? Array.from(unconfirmedHardMap.values()),
            unconfirmedSoftSkills: bulkTailoring?.unconfirmedSoftSkills ?? Array.from(unconfirmedSoftMap.values()),
        });
    }
    catch (error) {
        console.error('Error previewing resumes for all profiles:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to preview resumes'
        });
    }
});
// Generate tailored resume (single profile)
router.post('/generate', async (req, res) => {
    try {
        const { profileId, templateId, jobDescription, jobAnalysis, companyName, role, model, format = 'pdf', includeCoverLetterDocx, } = req.body;
        const settings = await (0, aiModelConfig_1.getAIModelSettings)();
        const appSettings = await (0, aiModelConfig_1.getPublicAppSettings)();
        const selectedModel = (0, claude_1.resolveAIProvider)(model);
        if (!(0, aiModelConfig_1.isProviderEnabled)(selectedModel, settings)) {
            res.status(400).json({ error: `Selected AI model '${selectedModel}' is disabled by admin` });
            return;
        }
        if (!profileId) {
            res.status(400).json({ error: 'Profile ID is required' });
            return;
        }
        if (!companyName || !companyName.trim()) {
            res.status(400).json({ error: 'Company name is required' });
            return;
        }
        // Load profile
        const profilePath = path_1.default.join(PROFILES_DIR, `${profileId}.json`);
        let profile;
        try {
            const content = await promises_1.default.readFile(profilePath, 'utf-8');
            profile = JSON.parse(content);
        }
        catch {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }
        if (profile.disabled) {
            res.status(400).json({ error: 'Selected profile is disabled' });
            return;
        }
        // Ensure built-in templates exist, then load requested template
        await (0, templateExtractor_1.createDefaultTemplate)();
        let template = await (0, templateExtractor_1.getTemplateById)(templateId || 'default');
        if (!template) {
            template = await (0, templateExtractor_1.getTemplateById)('default');
        }
        if (!template) {
            res.status(500).json({ error: 'Default template not available' });
            return;
        }
        if (template.disabled) {
            res.status(400).json({ error: 'Selected template is disabled' });
            return;
        }
        // If job description provided, tailor the resume (unless overridden by manual edits)
        let tailoredContent = req.body.tailoredContent;
        let analysis = jobAnalysis;
        if (!tailoredContent && jobDescription && jobDescription.trim().length > 50) {
            // Analyze job if not already analyzed
            analysis = jobAnalysis || await (0, claude_1.analyzeJobDescription)(jobDescription, selectedModel);
            tailoredContent = await (0, claude_1.tailorResume)(profile, analysis, selectedModel);
        }
        const resolvedRole = resolveGenerationRole(role, analysis);
        if (appSettings.outputPathUsesJobTitle && !resolvedRole) {
            res.status(400).json({ error: 'Role is required' });
            return;
        }
        const generateBoth = format === 'both';
        const generateCoverLetterDocx = shouldGenerateCoverLetterDocx(includeCoverLetterDocx);
        const unconfirmedHardSkills = tailoredContent?.unconfirmedHardSkills ?? [];
        const unconfirmedSoftSkills = tailoredContent?.unconfirmedSoftSkills ?? [];
        // Get cover letter body: from tailored content or generate when no job description
        let coverLetterBody;
        if (tailoredContent?.coverLetter?.trim()) {
            coverLetterBody = tailoredContent.coverLetter.trim();
        }
        else {
            coverLetterBody = await (0, claude_1.generateCoverLetter)(profile, companyName.trim(), resolvedRole, selectedModel);
        }
        const pathInfo = await (0, generatedPath_1.getGeneratedOutputPath)(profile, companyName.trim(), resolvedRole);
        const coverLetterPdfPath = await (0, coverLetterGenerator_1.saveCoverLetter)(profile, coverLetterBody, pathInfo);
        const coverLetterDocxPath = generateCoverLetterDocx
            ? await (0, coverLetterGenerator_1.saveCoverLetterDOCX)(profile, coverLetterBody, pathInfo)
            : undefined;
        if (generateBoth) {
            const [pdfFilename, docxFilename] = await Promise.all([
                (0, pdfGenerator_1.generateResumePDF)(profile, template, tailoredContent, pathInfo, companyName.trim(), resolvedRole),
                (0, docxGenerator_1.generateResumeDOCX)(profile, tailoredContent, pathInfo, companyName.trim(), resolvedRole),
            ]);
            res.json({
                pdf: { filename: pdfFilename, downloadUrl: `/api/resume/download/${pdfFilename}` },
                docx: { filename: docxFilename, downloadUrl: `/api/resume/download/${docxFilename}` },
                coverLetter: {
                    pdf: { filename: coverLetterPdfPath, downloadUrl: `/api/resume/download/${coverLetterPdfPath}` },
                    ...(coverLetterDocxPath
                        ? {
                            docx: {
                                filename: coverLetterDocxPath,
                                downloadUrl: `/api/resume/download/${coverLetterDocxPath}`,
                            },
                        }
                        : {}),
                },
                tailored: !!tailoredContent,
                unconfirmedHardSkills,
                unconfirmedSoftSkills,
            });
        }
        else {
            const formatNorm = format === 'docx' ? 'docx' : 'pdf';
            const filename = formatNorm === 'docx'
                ? await (0, docxGenerator_1.generateResumeDOCX)(profile, tailoredContent, pathInfo, companyName.trim(), resolvedRole)
                : await (0, pdfGenerator_1.generateResumePDF)(profile, template, tailoredContent, pathInfo, companyName.trim(), resolvedRole);
            res.json({
                filename,
                downloadUrl: `/api/resume/download/${filename}`,
                coverLetter: {
                    pdf: { filename: coverLetterPdfPath, downloadUrl: `/api/resume/download/${coverLetterPdfPath}` },
                    ...(coverLetterDocxPath
                        ? {
                            docx: {
                                filename: coverLetterDocxPath,
                                downloadUrl: `/api/resume/download/${coverLetterDocxPath}`,
                            },
                        }
                        : {}),
                },
                tailored: !!tailoredContent,
                format: formatNorm,
                unconfirmedHardSkills,
                unconfirmedSoftSkills,
            });
        }
    }
    catch (error) {
        console.error('Error generating resume:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate resume'
        });
    }
});
// Preview resume HTML
router.post('/preview', async (req, res) => {
    try {
        const { profileId, templateId, jobDescription, jobAnalysis, tailoredContent: manualTailoredContent, model } = req.body;
        const settings = await (0, aiModelConfig_1.getAIModelSettings)();
        const selectedModel = (0, claude_1.resolveAIProvider)(model);
        if (!(0, aiModelConfig_1.isProviderEnabled)(selectedModel, settings)) {
            res.status(400).json({ error: `Selected AI model '${selectedModel}' is disabled by admin` });
            return;
        }
        if (!profileId) {
            res.status(400).json({ error: 'Profile ID is required' });
            return;
        }
        // Load profile
        const profilePath = path_1.default.join(PROFILES_DIR, `${profileId}.json`);
        let profile;
        try {
            const content = await promises_1.default.readFile(profilePath, 'utf-8');
            profile = JSON.parse(content);
        }
        catch {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }
        if (profile.disabled) {
            res.status(400).json({ error: 'Selected profile is disabled' });
            return;
        }
        // Ensure built-in templates exist, then load requested template
        await (0, templateExtractor_1.createDefaultTemplate)();
        let template = await (0, templateExtractor_1.getTemplateById)(templateId || 'default');
        if (!template) {
            template = await (0, templateExtractor_1.getTemplateById)('default');
        }
        if (!template) {
            res.status(500).json({ error: 'Default template not available' });
            return;
        }
        if (template.disabled) {
            res.status(400).json({ error: 'Selected template is disabled' });
            return;
        }
        // If job description provided, tailor the resume (unless overridden by manual edits)
        let tailoredContent = manualTailoredContent;
        if (!tailoredContent && jobDescription && jobDescription.trim().length > 50) {
            const analysis = jobAnalysis || await (0, claude_1.analyzeJobDescription)(jobDescription, selectedModel);
            tailoredContent = await (0, claude_1.tailorResume)(profile, analysis, selectedModel);
        }
        // Generate HTML preview
        const html = await (0, pdfGenerator_1.generatePreviewHTML)(profile, template, tailoredContent);
        res.json({ html, tailored: !!tailoredContent, tailoredContent });
    }
    catch (error) {
        console.error('Error generating preview:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate preview'
        });
    }
});
// Download generated resume (PDF or DOCX)
router.get('/download/:filename(*)', async (req, res) => {
    try {
        const filepath = await (0, pdfGenerator_1.getGeneratedPDFPath)(req.params.filename);
        if (!filepath) {
            res.status(404).json({ error: 'File not found' });
            return;
        }
        const ext = path_1.default.extname(req.params.filename).toLowerCase();
        const contentType = ext === '.docx'
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/pdf';
        res.setHeader('Content-Disposition', `attachment; filename="${path_1.default.basename(req.params.filename)}"`);
        res.setHeader('Content-Type', contentType);
        res.download(filepath);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to download file' });
    }
});
exports.default = router;
//# sourceMappingURL=resume.js.map