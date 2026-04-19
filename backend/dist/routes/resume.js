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
                let tailoredContent;
                if (analysis) {
                    tailoredContent = await (0, claude_1.tailorResume)(profile, analysis, selectedModel);
                }
                if (tailoredContent) {
                    for (const skill of tailoredContent.unconfirmedHardSkills ?? []) {
                        const key = skill.trim().toLowerCase();
                        if (key && !unconfirmedHardMap.has(key)) {
                            unconfirmedHardMap.set(key, skill.trim());
                        }
                    }
                    for (const skill of tailoredContent.unconfirmedSoftSkills ?? []) {
                        const key = skill.trim().toLowerCase();
                        if (key && !unconfirmedSoftMap.has(key)) {
                            unconfirmedSoftMap.set(key, skill.trim());
                        }
                    }
                }
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
            unconfirmedHardSkills: Array.from(unconfirmedHardMap.values()),
            unconfirmedSoftSkills: Array.from(unconfirmedSoftMap.values()),
        });
    }
    catch (error) {
        console.error('Error generating resumes for all profiles:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to generate resumes'
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
            let tailoredContent;
            if (analysis) {
                tailoredContent = await (0, claude_1.tailorResume)(profile, analysis, selectedModel);
            }
            if (tailoredContent) {
                for (const skill of tailoredContent.unconfirmedHardSkills ?? []) {
                    const key = skill.trim().toLowerCase();
                    if (key && !unconfirmedHardMap.has(key)) {
                        unconfirmedHardMap.set(key, skill.trim());
                    }
                }
                for (const skill of tailoredContent.unconfirmedSoftSkills ?? []) {
                    const key = skill.trim().toLowerCase();
                    if (key && !unconfirmedSoftMap.has(key)) {
                        unconfirmedSoftMap.set(key, skill.trim());
                    }
                }
            }
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
            unconfirmedHardSkills: Array.from(unconfirmedHardMap.values()),
            unconfirmedSoftSkills: Array.from(unconfirmedSoftMap.values()),
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