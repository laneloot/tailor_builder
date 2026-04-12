"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const claude_1 = require("../services/claude");
const pdfGenerator_1 = require("../services/pdfGenerator");
const docxGenerator_1 = require("../services/docxGenerator");
const coverLetterGenerator_1 = require("../services/coverLetterGenerator");
const generatedPath_1 = require("../services/generatedPath");
const templateExtractor_1 = require("../services/templateExtractor");
const aiModelConfig_1 = require("../services/aiModelConfig");
const router = (0, express_1.Router)();
const PROFILES_DIR = path_1.default.join(__dirname, '../../data/profiles');
const TECH_SKILLS_PATH = path_1.default.join(__dirname, '../../skill_data/tech_skills.txt');
const SOFT_SKILLS_PATH = path_1.default.join(__dirname, '../../skill_data/soft_skills.txt');
const getSkillsPath = (type) => (type === 'hard' ? TECH_SKILLS_PATH : SOFT_SKILLS_PATH);
const readSkillsFile = async (type) => {
    const filePath = getSkillsPath(type);
    const content = await promises_1.default.readFile(filePath, 'utf-8').catch(() => '');
    return content
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
};
const writeSkillsFile = async (type, skills) => {
    const filePath = getSkillsPath(type);
    const payload = skills.length ? `${skills.join('\n')}\n` : '';
    await promises_1.default.writeFile(filePath, payload, 'utf-8');
};
function shouldGenerateCoverLetterDocx(value) {
    return typeof value === 'boolean' ? value : true;
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
router.post('/skills/confirm', async (req, res) => {
    try {
        const { type, skill } = req.body;
        if (!type || !skill || !skill.trim()) {
            res.status(400).json({ error: 'Skill type and value are required' });
            return;
        }
        const cleaned = skill.trim();
        const filePath = type === 'hard'
            ? path_1.default.join(__dirname, '../../skill_data/tech_skills.txt')
            : path_1.default.join(__dirname, '../../skill_data/soft_skills.txt');
        const existing = (await promises_1.default.readFile(filePath, 'utf-8'))
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean);
        const exists = existing.some((item) => item.toLowerCase() === cleaned.toLowerCase());
        if (!exists) {
            await promises_1.default.appendFile(filePath, `\n${cleaned}`);
            if (type === 'hard') {
                (0, claude_1.addTechSkill)(cleaned);
                (0, pdfGenerator_1.refreshAllowedTechSkills)();
            }
            else {
                (0, claude_1.addSoftSkill)(cleaned);
            }
        }
        res.json({ added: !exists, skill: cleaned, type });
    }
    catch (error) {
        console.error('Error confirming skill:', error);
        res.status(500).json({ error: 'Failed to confirm skill' });
    }
});
// List skills
router.get('/skills', async (req, res) => {
    try {
        const type = req.query.type;
        if (type !== 'hard' && type !== 'soft') {
            res.status(400).json({ error: 'Skill type is required' });
            return;
        }
        const skills = await readSkillsFile(type);
        res.json({ skills });
    }
    catch (error) {
        console.error('Error reading skills:', error);
        res.status(500).json({ error: 'Failed to read skills' });
    }
});
// Add skill
router.post('/skills', async (req, res) => {
    try {
        const { type, skill } = req.body;
        if (!type || !skill || !skill.trim()) {
            res.status(400).json({ error: 'Skill type and value are required' });
            return;
        }
        const cleaned = skill.trim();
        const skills = await readSkillsFile(type);
        const exists = skills.some((item) => item.toLowerCase() === cleaned.toLowerCase());
        if (exists) {
            res.json({ added: false, skill: cleaned, type });
            return;
        }
        skills.push(cleaned);
        await writeSkillsFile(type, skills);
        (0, claude_1.refreshSkillCaches)();
        if (type === 'hard') {
            (0, pdfGenerator_1.refreshAllowedTechSkills)();
        }
        res.json({ added: true, skill: cleaned, type });
    }
    catch (error) {
        console.error('Error adding skill:', error);
        res.status(500).json({ error: 'Failed to add skill' });
    }
});
// Update skill
router.put('/skills', async (req, res) => {
    try {
        const { type, original, skill } = req.body;
        if (!type || !original || !skill || !skill.trim()) {
            res.status(400).json({ error: 'Skill type, original value, and new value are required' });
            return;
        }
        const cleaned = skill.trim();
        const originalKey = original.trim().toLowerCase();
        const skills = await readSkillsFile(type);
        const index = skills.findIndex((item) => item.toLowerCase() === originalKey);
        if (index === -1) {
            res.status(404).json({ error: 'Skill not found' });
            return;
        }
        const duplicate = skills.some((item, idx) => idx !== index && item.toLowerCase() === cleaned.toLowerCase());
        if (duplicate) {
            res.status(409).json({ error: 'Skill already exists' });
            return;
        }
        skills[index] = cleaned;
        await writeSkillsFile(type, skills);
        (0, claude_1.refreshSkillCaches)();
        if (type === 'hard') {
            (0, pdfGenerator_1.refreshAllowedTechSkills)();
        }
        res.json({ updated: true, skill: cleaned, type });
    }
    catch (error) {
        console.error('Error updating skill:', error);
        res.status(500).json({ error: 'Failed to update skill' });
    }
});
// Delete skill
router.delete('/skills', async (req, res) => {
    try {
        const { type, skill } = req.body;
        if (!type || !skill || !skill.trim()) {
            res.status(400).json({ error: 'Skill type and value are required' });
            return;
        }
        const cleaned = skill.trim();
        const skills = await readSkillsFile(type);
        const next = skills.filter((item) => item.toLowerCase() !== cleaned.toLowerCase());
        if (next.length === skills.length) {
            res.status(404).json({ error: 'Skill not found' });
            return;
        }
        await writeSkillsFile(type, next);
        (0, claude_1.refreshSkillCaches)();
        if (type === 'hard') {
            (0, pdfGenerator_1.refreshAllowedTechSkills)();
        }
        res.json({ deleted: true, skill: cleaned, type });
    }
    catch (error) {
        console.error('Error deleting skill:', error);
        res.status(500).json({ error: 'Failed to delete skill' });
    }
});
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
        const settings = await (0, aiModelConfig_1.getAIModelSettings)();
        const selectedModel = (0, claude_1.resolveAIProvider)(model);
        if (!(0, aiModelConfig_1.isProviderEnabled)(selectedModel, settings)) {
            res.status(400).json({ error: `Selected AI model '${selectedModel}' is disabled by admin` });
            return;
        }
        if (!companyName?.trim()) {
            res.status(400).json({ error: 'Company name is required' });
            return;
        }
        if (!role?.trim()) {
            res.status(400).json({ error: 'Role is required' });
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
        const results = [];
        const unconfirmedHardMap = new Map();
        const unconfirmedSoftMap = new Map();
        const formatNorm = format === 'both' ? 'both' : format === 'docx' ? 'docx' : 'pdf';
        const generateCoverLetterDocx = shouldGenerateCoverLetterDocx(includeCoverLetterDocx);
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
            let coverLetterBody;
            if (tailoredContent?.coverLetter?.trim()) {
                coverLetterBody = tailoredContent.coverLetter.trim();
            }
            else {
                coverLetterBody = await (0, claude_1.generateCoverLetter)(profile, companyName.trim(), role.trim(), selectedModel);
            }
            const pathInfo = await (0, generatedPath_1.getGeneratedOutputPath)(profile, companyName.trim(), role.trim());
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
                    (0, pdfGenerator_1.generateResumePDF)(profile, template, tailoredContent, pathInfo, companyName.trim(), role.trim()),
                    (0, docxGenerator_1.generateResumeDOCX)(profile, tailoredContent, pathInfo, companyName.trim(), role.trim())
                ]);
                entry.pdf = pdfFilename;
                entry.docx = docxFilename;
            }
            else {
                const filename = formatNorm === 'docx'
                    ? await (0, docxGenerator_1.generateResumeDOCX)(profile, tailoredContent, pathInfo, companyName.trim(), role.trim())
                    : await (0, pdfGenerator_1.generateResumePDF)(profile, template, tailoredContent, pathInfo, companyName.trim(), role.trim());
                entry[formatNorm] = filename;
            }
            results.push(entry);
        }
        res.json({
            generated: results.length,
            results,
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
        if (!role || !role.trim()) {
            res.status(400).json({ error: 'Role is required' });
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
        if (!tailoredContent && jobDescription && jobDescription.trim().length > 50) {
            // Analyze job if not already analyzed
            const analysis = jobAnalysis || await (0, claude_1.analyzeJobDescription)(jobDescription, selectedModel);
            tailoredContent = await (0, claude_1.tailorResume)(profile, analysis, selectedModel);
        }
        const generateBoth = format === 'both';
        const generateCoverLetterDocx = shouldGenerateCoverLetterDocx(includeCoverLetterDocx);
        // Get cover letter body: from tailored content or generate when no job description
        let coverLetterBody;
        if (tailoredContent?.coverLetter?.trim()) {
            coverLetterBody = tailoredContent.coverLetter.trim();
        }
        else {
            coverLetterBody = await (0, claude_1.generateCoverLetter)(profile, companyName.trim(), role.trim(), selectedModel);
        }
        const pathInfo = await (0, generatedPath_1.getGeneratedOutputPath)(profile, companyName.trim(), role.trim());
        const coverLetterPdfPath = await (0, coverLetterGenerator_1.saveCoverLetter)(profile, coverLetterBody, pathInfo);
        const coverLetterDocxPath = generateCoverLetterDocx
            ? await (0, coverLetterGenerator_1.saveCoverLetterDOCX)(profile, coverLetterBody, pathInfo)
            : undefined;
        if (generateBoth) {
            const [pdfFilename, docxFilename] = await Promise.all([
                (0, pdfGenerator_1.generateResumePDF)(profile, template, tailoredContent, pathInfo, companyName.trim(), role.trim()),
                (0, docxGenerator_1.generateResumeDOCX)(profile, tailoredContent, pathInfo, companyName.trim(), role.trim()),
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
            });
        }
        else {
            const formatNorm = format === 'docx' ? 'docx' : 'pdf';
            const filename = formatNorm === 'docx'
                ? await (0, docxGenerator_1.generateResumeDOCX)(profile, tailoredContent, pathInfo, companyName.trim(), role.trim())
                : await (0, pdfGenerator_1.generateResumePDF)(profile, template, tailoredContent, pathInfo, companyName.trim(), role.trim());
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
                format: formatNorm
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