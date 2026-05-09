import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import {
  analyzeJobDescription,
  batchAnalyzeJobDescriptions,
  batchCreatePromptCompletions,
  buildTailorResumePromptValues,
  canUseAnthropicBatchForPrompt,
  generateCoverLetter,
  parseTailoredResumeContent,
  resolveAIProvider,
  tailorResume,
} from '../services/claude';
import { generateResumePDF, generatePreviewHTML, getGeneratedPDFPath } from '../generators/pdfGenerator';
import { generateResumeDOCX } from '../generators/docxGenerator';
import { saveCoverLetter, saveCoverLetterDOCX } from '../generators/coverLetterGenerator';
import { getGeneratedOutputPath } from '../utils/generatedPath';
import { getTemplateById, createDefaultTemplate } from '../extractors/templateExtractor';
import { getAIModelSettings, getDefaultEnabledProvider, getPublicAppSettings, isProviderEnabled } from '../config/aiModelConfig';
import { confirmSkill, createSkill, deleteSkillHandler, listSkills, updateSkillHandler } from '../controllers/skills';
import { Profile } from '../types/profile';
import { AIProvider, GenerateResumeRequest, JobAnalysis, TailoredContent } from '../types/template';

const router = Router();
const PROFILES_DIR = path.join(__dirname, '../../data/profiles');

function shouldGenerateCoverLetterDocx(value: unknown): boolean {
  return typeof value === 'boolean' ? value : true;
}

function resolveGenerationRole(role: unknown, analysis?: import('../types/template').JobAnalysis): string {
  if (typeof role === 'string' && role.trim()) {
    return role.trim();
  }
  return analysis?.jobMeta?.title?.trim() || '';
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
router.post('/skills/confirm', confirmSkill);


// List skills
router.get('/skills', listSkills);

// Add skill
router.post('/skills', createSkill);

// Update skill
router.put('/skills', updateSkillHandler);

// Delete skill
router.delete('/skills', deleteSkillHandler);

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

router.post('/analyze-multi-job', async (req: Request, res: Response) => {
  try {
    const {
      jobs,
      model,
    } = req.body as {
      jobs?: Array<{
        companyName?: string;
        jobDescription?: string;
        sourceRowNumber?: number;
      }>;
      model?: AIProvider | string;
    };

    if (!Array.isArray(jobs) || jobs.length === 0) {
      res.status(400).json({ error: 'At least one job is required' });
      return;
    }

    const settings = await getAIModelSettings();
    const requestedProvider = resolveAIProvider(model);
    const provider = isProviderEnabled(requestedProvider, settings)
      ? requestedProvider
      : getDefaultEnabledProvider(settings);

    const validJobs: Array<{
      customId: string;
      companyName: string;
      jobDescription: string;
      sourceRowNumber?: number;
    }> = [];
    const failures: Array<{
      companyName: string;
      sourceRowNumber?: number;
      error: string;
    }> = [];

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

    const analysesByCustomId = await batchAnalyzeJobDescriptions({
      items: validJobs.map((job) => ({
        customId: job.customId,
        jobDescription: job.jobDescription,
      })),
      provider,
      anthropicCacheTtl: '1h',
    });

    const analyses: Array<{
      companyName: string;
      sourceRowNumber?: number;
      jobDescription: string;
      analysis: JobAnalysis;
    }> = [];

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
  } catch (error) {
    console.error('Error analyzing multiple job descriptions:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to analyze job descriptions',
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

function collectUnconfirmedSkillMaps(
  content: TailoredContent | undefined,
  hardMap: Map<string, string>,
  softMap: Map<string, string>
): void {
  if (!content) return;

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

function toAnthropicBatchCustomId(profileId: string, index: number): string {
  const sanitized = profileId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || `profile_${index + 1}`;
  return `resume_${index + 1}_${sanitized}`.slice(0, 64);
}

type TailorBatchItem<TMeta> = {
  customId: string;
  profile: Profile;
  analysis: JobAnalysis;
  meta: TMeta;
};

async function tailorResumesForBatchItems<TMeta>(
  items: TailorBatchItem<TMeta>[],
  provider: AIProvider
): Promise<{
  tailoredByCustomId: Map<string, TailoredContent>;
  failures: Array<{ customId: string; profileId: string; profileName: string; error: string; meta: TMeta }>;
  unconfirmedHardSkills: string[];
  unconfirmedSoftSkills: string[];
}> {
  const tailoredByCustomId = new Map<string, TailoredContent>();
  const failures: Array<{ customId: string; profileId: string; profileName: string; error: string; meta: TMeta }> = [];
  const itemByCustomId = new Map(items.map((item) => [item.customId, item] as const));
  const unconfirmedHardMap = new Map<string, string>();
  const unconfirmedSoftMap = new Map<string, string>();

  const shouldUseAnthropicBatch = items.length > 1
    && await canUseAnthropicBatchForPrompt('tailor-resume', provider);

  if (shouldUseAnthropicBatch) {
    const batchResults = await batchCreatePromptCompletions({
      promptId: 'tailor-resume',
      items: items.map((item) => ({
        customId: item.customId,
        values: buildTailorResumePromptValues(item.profile, item.analysis),
      })),
      fallbackProvider: provider,
      maxTokens: 11000,
      temperature: 0.2,
      responseFormat: 'json',
      anthropicCacheTtl: '1h',
    });

    for (const [customId, result] of batchResults.entries()) {
      const item = itemByCustomId.get(customId);
      if (!item) continue;

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
        const tailored = parseTailoredResumeContent(result.content, item.profile, item.analysis);
        tailoredByCustomId.set(customId, tailored);
        collectUnconfirmedSkillMaps(tailored, unconfirmedHardMap, unconfirmedSoftMap);
      } catch (error) {
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
  } else {
    for (const item of items) {
      try {
        const tailored = await tailorResume(item.profile, item.analysis, provider);
        tailoredByCustomId.set(item.customId, tailored);
        collectUnconfirmedSkillMaps(tailored, unconfirmedHardMap, unconfirmedSoftMap);
      } catch (error) {
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

async function tailorResumesForProfiles(
  profiles: Profile[],
  analysis: JobAnalysis,
  provider: AIProvider
): Promise<{
  tailoredByProfileId: Map<string, TailoredContent>;
  failures: Array<{ profileId: string; profileName: string; error: string }>;
  unconfirmedHardSkills: string[];
  unconfirmedSoftSkills: string[];
}> {
  const items = profiles.map((profile, index) => ({
    customId: toAnthropicBatchCustomId(profile.id, index),
    profile,
    analysis,
    meta: { profileId: profile.id },
  }));
  const batchResult = await tailorResumesForBatchItems(items, provider);
  const tailoredByProfileId = new Map<string, TailoredContent>();

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

    // Load setting
    const settings = await getAIModelSettings();
    const appSettings = await getPublicAppSettings();
    const selectedModel = resolveAIProvider(model);


    // Validate
    if (!isProviderEnabled(selectedModel, settings)) {
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

    await createDefaultTemplate();

    let analysis: JobAnalysis | undefined;

    const trimmedJobDescription = jobDescription?.trim();

    if (trimmedJobDescription && trimmedJobDescription.length > 50) {
      analysis = jobAnalysis || await analyzeJobDescription(trimmedJobDescription, selectedModel);
    }

    const resolvedRole = resolveGenerationRole(role, analysis);
    if (appSettings.outputPathUsesJobTitle && !resolvedRole) {
      res.status(400).json({ error: 'Role is required' });
      return;
    }

    const normalizedCompanyName = companyName.trim();
    const results: { profileId: string; profileName: string; pdf?: string; docx?: string; coverLetterPdf?: string; coverLetterDocx?: string }[] = [];
    const failures: Array<{ profileId: string; profileName: string; companyName: string; error: string }> = [];
    const unconfirmedHardMap = new Map<string, string>();
    const unconfirmedSoftMap = new Map<string, string>();
    const formatNorm = (format as string) === 'both' ? 'both' : format === 'docx' ? 'docx' : 'pdf';
    const generateCoverLetterDocx = shouldGenerateCoverLetterDocx(includeCoverLetterDocx);
    const shouldUseBulkTailoring = analysis
      ? await canUseAnthropicBatchForPrompt('tailor-resume', selectedModel)
      : false;
    const bulkTailoring = shouldUseBulkTailoring && analysis
      ? await tailorResumesForProfiles(profiles, analysis, selectedModel)
      : null;

    for (const profile of profiles) {
      if (!profile) continue;
      try {
        const profileTemplateId = profile.preferredTemplate ?? templateId ?? 'default';
        let template = await getTemplateById(profileTemplateId);
        if (!template || template.disabled) template = await getTemplateById('default');
        if (!template || template.disabled) {
          throw new Error('Default template not available');
        }

        const batchFailure = bulkTailoring?.failures.find((item) => item.profileId === profile.id);
        if (batchFailure) {
          throw new Error(batchFailure.error);
        }

        let tailoredContent: TailoredContent | undefined;
        if (analysis) {
          tailoredContent = bulkTailoring
            ? bulkTailoring.tailoredByProfileId.get(profile.id)
            : await tailorResume(profile, analysis, selectedModel);
        }
        collectUnconfirmedSkillMaps(tailoredContent, unconfirmedHardMap, unconfirmedSoftMap);

        let coverLetterBody: string;
        if (tailoredContent?.coverLetter?.trim()) {
          coverLetterBody = tailoredContent.coverLetter.trim();
        } else {
          coverLetterBody = await generateCoverLetter(profile, normalizedCompanyName, resolvedRole, selectedModel);
        }
        const pathInfo = await getGeneratedOutputPath(profile, normalizedCompanyName, resolvedRole);
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
            generateResumePDF(profile, template, tailoredContent, pathInfo, normalizedCompanyName, resolvedRole),
            generateResumeDOCX(profile, tailoredContent, pathInfo, normalizedCompanyName, resolvedRole)
          ]);
          entry.pdf = pdfFilename;
          entry.docx = docxFilename;
        } else {
          const filename = formatNorm === 'docx'
            ? await generateResumeDOCX(profile, tailoredContent, pathInfo, normalizedCompanyName, resolvedRole)
            : await generateResumePDF(profile, template, tailoredContent, pathInfo, normalizedCompanyName, resolvedRole);
          entry[formatNorm] = filename;
        }
        results.push(entry);
      } catch (profileError) {
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
  } catch (error) {
    console.error('Error generating resumes for all profiles:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate resumes'
    });
  }
});

router.post('/generate-multi-job', async (req: Request, res: Response) => {
  try {
    const {
      templateId,
      jobs,
      model,
      profileIds,
      format = 'both',
      includeCoverLetterDocx,
    } = req.body as {
      templateId?: string;
      jobs?: Array<{
        companyName?: string;
        role?: string;
        jobDescription?: string;
        jobAnalysis?: JobAnalysis;
        sourceRowNumber?: number;
      }>;
      model?: AIProvider | string;
      profileIds?: string[];
      format?: 'pdf' | 'docx' | 'both';
      includeCoverLetterDocx?: boolean;
    };

    const settings = await getAIModelSettings();
    const appSettings = await getPublicAppSettings();
    const selectedModel = resolveAIProvider(model);

    if (!isProviderEnabled(selectedModel, settings)) {
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

    await createDefaultTemplate();

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

    const batchItems: TailorBatchItem<{ jobIndex: number }>[] = [];
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

    const formatNorm = (format as string) === 'both' ? 'both' : format === 'docx' ? 'docx' : 'pdf';
    const generateCoverLetterDocx = shouldGenerateCoverLetterDocx(includeCoverLetterDocx);
    const results: Array<{
      profileId: string;
      profileName: string;
      companyName: string;
      role: string;
      pdf?: string;
      docx?: string;
      coverLetterPdf?: string;
      coverLetterDocx?: string;
    }> = [];
    const failures: Array<{ profileId: string; profileName: string; companyName: string; error: string }> = [];
    const failedCompanies = new Set<string>();
    const unconfirmedHardMap = new Map<string, string>();
    const unconfirmedSoftMap = new Map<string, string>();

    for (const [jobIndex, job] of normalizedJobs.entries()) {
      for (const profile of profiles) {
        try {
          const profileTemplateId = profile.preferredTemplate ?? templateId ?? 'default';
          let template = await getTemplateById(profileTemplateId);
          if (!template || template.disabled) template = await getTemplateById('default');
          if (!template || template.disabled) {
            throw new Error('Default template not available');
          }

          let tailoredContent: TailoredContent | undefined;
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
              : await tailorResume(profile, job.analysis, selectedModel);
          }
          collectUnconfirmedSkillMaps(tailoredContent, unconfirmedHardMap, unconfirmedSoftMap);

          let coverLetterBody: string;
          if (tailoredContent?.coverLetter?.trim()) {
            coverLetterBody = tailoredContent.coverLetter.trim();
          } else {
            coverLetterBody = await generateCoverLetter(profile, job.companyName, job.role, selectedModel);
          }

          const pathInfo = await getGeneratedOutputPath(profile, job.companyName, job.role);
          const coverLetterPdfPath = await saveCoverLetter(profile, coverLetterBody, pathInfo);
          const coverLetterDocxPath = generateCoverLetterDocx
            ? await saveCoverLetterDOCX(profile, coverLetterBody, pathInfo)
            : undefined;

          const entry: (typeof results)[0] = {
            profileId: profile.id,
            profileName: profile.name,
            companyName: job.companyName,
            role: job.role,
            coverLetterPdf: coverLetterPdfPath,
            coverLetterDocx: coverLetterDocxPath,
          };

          if (formatNorm === 'both') {
            const [pdfFilename, docxFilename] = await Promise.all([
              generateResumePDF(profile, template, tailoredContent, pathInfo, job.companyName, job.role),
              generateResumeDOCX(profile, tailoredContent, pathInfo, job.companyName, job.role),
            ]);
            entry.pdf = pdfFilename;
            entry.docx = docxFilename;
          } else {
            const filename = formatNorm === 'docx'
              ? await generateResumeDOCX(profile, tailoredContent, pathInfo, job.companyName, job.role)
              : await generateResumePDF(profile, template, tailoredContent, pathInfo, job.companyName, job.role);
            entry[formatNorm] = filename;
          }

          results.push(entry);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to generate resume';
          console.error(
            `Error generating resume for profile ${profile.id} (${profile.name}) at ${job.companyName}:`,
            error
          );
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
  } catch (error) {
    console.error('Error generating resumes for multiple jobs:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate resumes for multiple jobs',
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

    let analysis: JobAnalysis | undefined;
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
    const shouldUseBulkTailoring = analysis
      ? await canUseAnthropicBatchForPrompt('tailor-resume', selectedModel)
      : false;
    const bulkTailoring = shouldUseBulkTailoring && analysis
      ? await tailorResumesForProfiles(profiles, analysis, selectedModel)
      : null;

    if (bulkTailoring && bulkTailoring.failures.length > 0) {
      throw new Error(
        `Failed to tailor ${bulkTailoring.failures.length} profile(s): ${bulkTailoring.failures
          .slice(0, 3)
          .map((item) => `${item.profileName}: ${item.error}`)
          .join(' | ')}${bulkTailoring.failures.length > 3 ? ' | ...' : ''}`
      );
    }

    for (const profile of profiles) {
      if (!profile) continue;
      const profileTemplateId = profile.preferredTemplate ?? templateId ?? 'default';
      let template = await getTemplateById(profileTemplateId);
      if (!template || template.disabled) template = await getTemplateById('default');
      if (!template || template.disabled) {
        res.status(500).json({ error: 'Default template not available' });
        return;
      }

      const tailoredContent = analysis
        ? bulkTailoring
          ? bulkTailoring.tailoredByProfileId.get(profile.id)
          : await tailorResume(profile, analysis, selectedModel)
        : undefined;
      collectUnconfirmedSkillMaps(tailoredContent, unconfirmedHardMap, unconfirmedSoftMap);

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
      unconfirmedHardSkills: bulkTailoring?.unconfirmedHardSkills ?? Array.from(unconfirmedHardMap.values()),
      unconfirmedSoftSkills: bulkTailoring?.unconfirmedSoftSkills ?? Array.from(unconfirmedSoftMap.values()),
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
    const unconfirmedHardSkills = tailoredContent?.unconfirmedHardSkills ?? [];
    const unconfirmedSoftSkills = tailoredContent?.unconfirmedSoftSkills ?? [];

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
        unconfirmedHardSkills,
        unconfirmedSoftSkills,
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
        format: formatNorm,
        unconfirmedHardSkills,
        unconfirmedSoftSkills,
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
