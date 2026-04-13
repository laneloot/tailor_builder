import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { analyzeJobDescription, tailorResume, generateCoverLetter, resolveAIProvider, addTechSkill, addSoftSkill, refreshSkillCaches } from '../services/claude';
import { generateResumePDF, generatePreviewHTML, getGeneratedPDFPath, refreshAllowedTechSkills } from '../services/pdfGenerator';
import { generateResumeDOCX } from '../services/docxGenerator';
import { saveCoverLetter, saveCoverLetterDOCX } from '../services/coverLetterGenerator';
import { getGeneratedOutputPath } from '../services/generatedPath';
import { getTemplateById, createDefaultTemplate } from '../services/templateExtractor';
import { getAIModelSettings, getDefaultEnabledProvider, getPublicAppSettings, isProviderEnabled } from '../services/aiModelConfig';
import { Profile } from '../types/profile';
import { AIProvider, GenerateResumeRequest, TailoredContent } from '../types/template';

const router = Router();
const PROFILES_DIR = path.join(__dirname, '../../data/profiles');

const TECH_SKILLS_PATH = path.join(__dirname, '../../skill_data/tech_skills.txt');
const SOFT_SKILLS_PATH = path.join(__dirname, '../../skill_data/soft_skills.txt');

const getSkillsPath = (type: 'hard' | 'soft') => (type === 'hard' ? TECH_SKILLS_PATH : SOFT_SKILLS_PATH);

const readSkillsFile = async (type: 'hard' | 'soft') => {
  const filePath = getSkillsPath(type);
  const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
  return content
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const writeSkillsFile = async (type: 'hard' | 'soft', skills: string[]) => {
  const filePath = getSkillsPath(type);
  const payload = skills.length ? `${skills.join('\n')}\n` : '';
  await fs.writeFile(filePath, payload, 'utf-8');
};

function shouldGenerateCoverLetterDocx(value: unknown): boolean {
  return typeof value === 'boolean' ? value : true;
}

function resolveGenerationRole(role: unknown, analysis?: import('../types/template').JobAnalysis): string {
  if (typeof role === 'string' && role.trim()) {
    return role.trim();
  }
  return analysis?.jobTitle?.trim() || '';
}

// Get enabled AI models
router.get('/models', async (req: Request, res: Response) => {
  try {
    const settings = await getPublicAppSettings();
    res.json(settings);
  } catch {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Confirm and persist a new skill
router.post('/skills/confirm', async (req: Request, res: Response) => {
  try {
    const { type, skill } = req.body as { type?: 'hard' | 'soft'; skill?: string };
    if (!type || !skill || !skill.trim()) {
      res.status(400).json({ error: 'Skill type and value are required' });
      return;
    }

    const cleaned = skill.trim();
    const filePath = type === 'hard'
      ? path.join(__dirname, '../../skill_data/tech_skills.txt')
      : path.join(__dirname, '../../skill_data/soft_skills.txt');

    const existing = (await fs.readFile(filePath, 'utf-8'))
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);

    const exists = existing.some((item) => item.toLowerCase() === cleaned.toLowerCase());
    if (!exists) {
      await fs.appendFile(filePath, `\n${cleaned}`);
      if (type === 'hard') {
        addTechSkill(cleaned);
        refreshAllowedTechSkills();
      } else {
        addSoftSkill(cleaned);
      }
    }

    res.json({ added: !exists, skill: cleaned, type });
  } catch (error) {
    console.error('Error confirming skill:', error);
    res.status(500).json({ error: 'Failed to confirm skill' });
  }
});


// List skills
router.get('/skills', async (req: Request, res: Response) => {
  try {
    const type = req.query.type as 'hard' | 'soft' | undefined;
    if (type !== 'hard' && type !== 'soft') {
      res.status(400).json({ error: 'Skill type is required' });
      return;
    }
    const skills = await readSkillsFile(type);
    res.json({ skills });
  } catch (error) {
    console.error('Error reading skills:', error);
    res.status(500).json({ error: 'Failed to read skills' });
  }
});

// Add skill
router.post('/skills', async (req: Request, res: Response) => {
  try {
    const { type, skill } = req.body as { type?: 'hard' | 'soft'; skill?: string };
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
    refreshSkillCaches();
    if (type === 'hard') {
      refreshAllowedTechSkills();
    }
    res.json({ added: true, skill: cleaned, type });
  } catch (error) {
    console.error('Error adding skill:', error);
    res.status(500).json({ error: 'Failed to add skill' });
  }
});

// Update skill
router.put('/skills', async (req: Request, res: Response) => {
  try {
    const { type, original, skill } = req.body as { type?: 'hard' | 'soft'; original?: string; skill?: string };
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
    refreshSkillCaches();
    if (type === 'hard') {
      refreshAllowedTechSkills();
    }
    res.json({ updated: true, skill: cleaned, type });
  } catch (error) {
    console.error('Error updating skill:', error);
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

// Delete skill
router.delete('/skills', async (req: Request, res: Response) => {
  try {
    const { type, skill } = req.body as { type?: 'hard' | 'soft'; skill?: string };
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
    refreshSkillCaches();
    if (type === 'hard') {
      refreshAllowedTechSkills();
    }
    res.json({ deleted: true, skill: cleaned, type });
  } catch (error) {
    console.error('Error deleting skill:', error);
    res.status(500).json({ error: 'Failed to delete skill' });
  }
});

// Analyze job description
router.post('/analyze', async (req: Request, res: Response) => {
  try {
    const { jobDescription, model } = req.body as { jobDescription?: string; model?: AIProvider | string };

    if (!jobDescription || jobDescription.trim().length < 50) {
      res.status(400).json({ error: 'Job description must be at least 50 characters' });
      return;
    }

    const settings = await getAIModelSettings();
    const requestedProvider = resolveAIProvider(model);
    const provider = isProviderEnabled(requestedProvider, settings)
      ? requestedProvider
      : getDefaultEnabledProvider(settings);
    const analysis = await analyzeJobDescription(jobDescription, provider);
    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing job description:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to analyze job description' 
    });
  }
});

// Load all non-disabled profiles
async function loadAllProfiles(profileIds?: string[]): Promise<Profile[]> {
  const selectedIds = Array.isArray(profileIds)
    ? new Set(profileIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))
    : null;
  const files = await fs.readdir(PROFILES_DIR);
  const profiles: Profile[] = [];
  for (const file of files) {
    if (file.endsWith('.json')) {
      try {
        const content = await fs.readFile(path.join(PROFILES_DIR, file), 'utf-8');
        const profile = JSON.parse(content) as Profile;
        if (profile.disabled) continue;
        if (selectedIds && !selectedIds.has(profile.id)) continue;
        profiles.push(profile);
      } catch {
        // Skip invalid profile files
      }
    }
  }
  return profiles.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

// Generate for all profiles at once
router.post('/generate-all', async (req: Request, res: Response) => {
  try {
    const {
      templateId,
      jobDescription,
      jobAnalysis,
      companyName,
      role,
      model,
      profileIds,
      format = 'both',
      includeCoverLetterDocx,
    } = req.body;

    const settings = await getAIModelSettings();
    const appSettings = await getPublicAppSettings();
    const selectedModel = resolveAIProvider(model);
    if (!isProviderEnabled(selectedModel, settings)) {
      res.status(400).json({ error: `Selected AI model '${selectedModel}' is disabled by admin` });
      return;
    }
    if (!companyName?.trim()) {
      res.status(400).json({ error: 'Company name is required' });
      return;
    }

    const profiles = await loadAllProfiles(profileIds);
    if (profiles.length === 0) {
      res.status(400).json({ error: 'No matching profiles available. Add profiles in Admin or update group members.' });
      return;
    }

    await createDefaultTemplate();

    let analysis: import('../types/template').JobAnalysis | undefined;
    const trimmedJobDescription = jobDescription?.trim();
    if (trimmedJobDescription && trimmedJobDescription.length > 50) {
      analysis = jobAnalysis || await analyzeJobDescription(trimmedJobDescription, selectedModel);
    }
    const resolvedRole = resolveGenerationRole(role, analysis);
    if (appSettings.outputPathUsesJobTitle && !resolvedRole) {
      res.status(400).json({ error: 'Role is required' });
      return;
    }

    const results: { profileId: string; profileName: string; pdf?: string; docx?: string; coverLetterPdf?: string; coverLetterDocx?: string }[] = [];
    const unconfirmedHardMap = new Map<string, string>();
    const unconfirmedSoftMap = new Map<string, string>();
    const formatNorm = (format as string) === 'both' ? 'both' : format === 'docx' ? 'docx' : 'pdf';
    const generateCoverLetterDocx = shouldGenerateCoverLetterDocx(includeCoverLetterDocx);

    for (const profile of profiles) {
      if (!profile) continue;
      const profileTemplateId = profile.preferredTemplate ?? templateId ?? 'default';
      let template = await getTemplateById(profileTemplateId);
      if (!template || template.disabled) template = await getTemplateById('default');
      if (!template || template.disabled) {
        res.status(500).json({ error: 'Default template not available' });
        return;
      }

      let tailoredContent;
      if (analysis) {
        tailoredContent = await tailorResume(profile, analysis, selectedModel);
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
      let coverLetterBody: string;
      if (tailoredContent?.coverLetter?.trim()) {
        coverLetterBody = tailoredContent.coverLetter.trim();
      } else {
        coverLetterBody = await generateCoverLetter(profile, companyName.trim(), resolvedRole, selectedModel);
      }
      const pathInfo = await getGeneratedOutputPath(profile, companyName.trim(), resolvedRole);
      const coverLetterPdfPath = await saveCoverLetter(profile, coverLetterBody, pathInfo);
      const coverLetterDocxPath = generateCoverLetterDocx
        ? await saveCoverLetterDOCX(profile, coverLetterBody, pathInfo)
        : undefined;

      const entry: (typeof results)[0] = {
        profileId: profile.id,
        profileName: profile.name,
        coverLetterPdf: coverLetterPdfPath,
        coverLetterDocx: coverLetterDocxPath,
      };
      if (formatNorm === 'both') {
        const [pdfFilename, docxFilename] = await Promise.all([
          generateResumePDF(profile, template, tailoredContent, pathInfo, companyName.trim(), resolvedRole),
          generateResumeDOCX(profile, tailoredContent, pathInfo, companyName.trim(), resolvedRole)
        ]);
        entry.pdf = pdfFilename;
        entry.docx = docxFilename;
      } else {
        const filename = formatNorm === 'docx'
          ? await generateResumeDOCX(profile, tailoredContent, pathInfo, companyName.trim(), resolvedRole)
          : await generateResumePDF(profile, template, tailoredContent, pathInfo, companyName.trim(), resolvedRole);
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
  } catch (error) {
    console.error('Error generating resumes for all profiles:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate resumes'
    });
  }
});

// Preview resumes for all profiles
router.post('/preview-all', async (req: Request, res: Response) => {
  try {
    const {
      templateId,
      jobDescription,
      jobAnalysis,
      model,
      profileIds,
    } = req.body as {
      templateId?: string;
      jobDescription?: string;
      jobAnalysis?: import('../types/template').JobAnalysis;
      model?: AIProvider | string;
      profileIds?: string[];
    };

    const settings = await getAIModelSettings();
    const appSettings = await getPublicAppSettings();
    const selectedModel = resolveAIProvider(model);
    if (!isProviderEnabled(selectedModel, settings)) {
      res.status(400).json({ error: `Selected AI model '${selectedModel}' is disabled by admin` });
      return;
    }

    const profiles = await loadAllProfiles(profileIds);
    if (profiles.length === 0) {
      res.status(400).json({ error: 'No matching profiles available. Add profiles in Admin or update group members.' });
      return;
    }

    await createDefaultTemplate();

    let analysis: import('../types/template').JobAnalysis | undefined;
    const trimmedJobDescription = jobDescription?.trim();
    if (trimmedJobDescription && trimmedJobDescription.length > 50) {
      analysis = jobAnalysis || await analyzeJobDescription(trimmedJobDescription, selectedModel);
    }

    const previews: Array<{
      profileId: string;
      profileName: string;
      html: string;
      tailoredContent?: TailoredContent;
    }> = [];
    const unconfirmedHardMap = new Map<string, string>();
    const unconfirmedSoftMap = new Map<string, string>();

    for (const profile of profiles) {
      if (!profile) continue;
      const profileTemplateId = profile.preferredTemplate ?? templateId ?? 'default';
      let template = await getTemplateById(profileTemplateId);
      if (!template || template.disabled) template = await getTemplateById('default');
      if (!template || template.disabled) {
        res.status(500).json({ error: 'Default template not available' });
        return;
      }

      let tailoredContent: TailoredContent | undefined;
      if (analysis) {
        tailoredContent = await tailorResume(profile, analysis, selectedModel);
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

      const html = await generatePreviewHTML(profile, template, tailoredContent);
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
  } catch (error) {
    console.error('Error previewing resumes for all profiles:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to preview resumes'
    });
  }
});

// Generate tailored resume (single profile)
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const {
      profileId,
      templateId,
      jobDescription,
      jobAnalysis,
      companyName,
      role,
      model,
      format = 'pdf',
      includeCoverLetterDocx,
    }: GenerateResumeRequest = req.body;
    const settings = await getAIModelSettings();
    const appSettings = await getPublicAppSettings();
    const selectedModel = resolveAIProvider(model);
    if (!isProviderEnabled(selectedModel, settings)) {
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
    const profilePath = path.join(PROFILES_DIR, `${profileId}.json`);
    let profile: Profile;
    try {
      const content = await fs.readFile(profilePath, 'utf-8');
      profile = JSON.parse(content);
    } catch {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    if (profile.disabled) {
      res.status(400).json({ error: 'Selected profile is disabled' });
      return;
    }

    // Ensure built-in templates exist, then load requested template
    await createDefaultTemplate();
    let template = await getTemplateById(templateId || 'default');
    if (!template) {
      template = await getTemplateById('default');
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
    let tailoredContent = (req.body as GenerateResumeRequest).tailoredContent as TailoredContent | undefined;
    let analysis = jobAnalysis;
    if (!tailoredContent && jobDescription && jobDescription.trim().length > 50) {
      // Analyze job if not already analyzed
      analysis = jobAnalysis || await analyzeJobDescription(jobDescription, selectedModel);
      tailoredContent = await tailorResume(profile, analysis, selectedModel);
    }
    const resolvedRole = resolveGenerationRole(role, analysis);
    if (appSettings.outputPathUsesJobTitle && !resolvedRole) {
      res.status(400).json({ error: 'Role is required' });
      return;
    }

    const generateBoth = (format as string) === 'both';
    const generateCoverLetterDocx = shouldGenerateCoverLetterDocx(includeCoverLetterDocx);

    // Get cover letter body: from tailored content or generate when no job description
    let coverLetterBody: string;
    if (tailoredContent?.coverLetter?.trim()) {
      coverLetterBody = tailoredContent.coverLetter.trim();
    } else {
      coverLetterBody = await generateCoverLetter(
        profile,
        companyName.trim(),
        resolvedRole,
        selectedModel
      );
    }

    const pathInfo = await getGeneratedOutputPath(
      profile,
      companyName.trim(),
      resolvedRole
    );
    const coverLetterPdfPath = await saveCoverLetter(profile, coverLetterBody, pathInfo);
    const coverLetterDocxPath = generateCoverLetterDocx
      ? await saveCoverLetterDOCX(profile, coverLetterBody, pathInfo)
      : undefined;

    if (generateBoth) {
      const [pdfFilename, docxFilename] = await Promise.all([
        generateResumePDF(profile, template, tailoredContent, pathInfo, companyName.trim(), resolvedRole),
        generateResumeDOCX(profile, tailoredContent, pathInfo, companyName.trim(), resolvedRole),
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
    } else {
      const formatNorm = format === 'docx' ? 'docx' : 'pdf';
      const filename =
        formatNorm === 'docx'
          ? await generateResumeDOCX(profile, tailoredContent, pathInfo, companyName.trim(), resolvedRole)
          : await generateResumePDF(profile, template, tailoredContent, pathInfo, companyName.trim(), resolvedRole);

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
  } catch (error) {
    console.error('Error generating resume:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate resume'
    });
  }
});

// Preview resume HTML
router.post('/preview', async (req: Request, res: Response) => {
  try {
    const { profileId, templateId, jobDescription, jobAnalysis, tailoredContent: manualTailoredContent, model }: GenerateResumeRequest = req.body;
    const settings = await getAIModelSettings();
    const selectedModel = resolveAIProvider(model);
    if (!isProviderEnabled(selectedModel, settings)) {
      res.status(400).json({ error: `Selected AI model '${selectedModel}' is disabled by admin` });
      return;
    }

    if (!profileId) {
      res.status(400).json({ error: 'Profile ID is required' });
      return;
    }

    // Load profile
    const profilePath = path.join(PROFILES_DIR, `${profileId}.json`);
    let profile: Profile;
    try {
      const content = await fs.readFile(profilePath, 'utf-8');
      profile = JSON.parse(content);
    } catch {
      res.status(404).json({ error: 'Profile not found' });
      return;
    }
    if (profile.disabled) {
      res.status(400).json({ error: 'Selected profile is disabled' });
      return;
    }

    // Ensure built-in templates exist, then load requested template
    await createDefaultTemplate();
    let template = await getTemplateById(templateId || 'default');
    if (!template) {
      template = await getTemplateById('default');
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
      const analysis = jobAnalysis || await analyzeJobDescription(jobDescription, selectedModel);
      tailoredContent = await tailorResume(profile, analysis, selectedModel);
    }

    // Generate HTML preview
    const html = await generatePreviewHTML(profile, template, tailoredContent);

    res.json({ html, tailored: !!tailoredContent, tailoredContent });
  } catch (error) {
    console.error('Error generating preview:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to generate preview' 
    });
  }
});

// Download generated resume (PDF or DOCX)
router.get('/download/:filename(*)', async (req: Request<{ filename: string }>, res: Response) => {
  try {
    const filepath = await getGeneratedPDFPath(req.params.filename);
    if (!filepath) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const ext = path.extname(req.params.filename).toLowerCase();
    const contentType =
      ext === '.docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf';

    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(req.params.filename)}"`);
    res.setHeader('Content-Type', contentType);
    res.download(filepath);
  } catch (error) {
    res.status(500).json({ error: 'Failed to download file' });
  }
});

export default router;
