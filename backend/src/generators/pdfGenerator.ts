import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Profile } from '../types/profile';
import { TailoredContent, Template } from '../types/template';
import type { GeneratedPathInfo } from '../utils/generatedPath';
import { getGeneratedFilePath } from '../utils/generatedPath';
import { readHardSkillPriorityMap, readSkills } from '../database/skillsDatabase';
const MAX_ROLE_BRIEF_LENGTH = 1200;
const A4_PRINTABLE_WIDTH_PX = 698; // A4 width (8.27in) minus 0.5in margins on both sides at 96 DPI
const A4_PRINTABLE_HEIGHT_PX = 1026; // A4 height (11.69in) minus 0.5in margins top/bottom at 96 DPI
const SOFT_SKILL_SIGNALS = [
  'communication',
  'collaboration',
  'mindset',
  'mentality',
  'ownership',
  'autonomy',
  'independent',
  'self-directed',
  'adapt',
  'ambiguity',
  'passion',
  'attention to detail',
  'team player',
  'cross-functional',
  'stakeholder',
  'leadership',
  'problem-solving',
  'product-minded',
  'driving clarity',
  'transparency',
];
const LANGUAGE_SKILLS = new Set([
  'python',
  'javascript',
  'typescript',
  'java',
  'go',
  'golang',
  'rust',
  'ruby',
  'php',
  'c++',
  'c#',
  'kotlin',
  'swift',
  'scala',
  'sql',
  'html',
  'css',
  'elixir',
  'bash',
]);
const FRAMEWORK_SKILLS = new Set([
  'react',
  'react.js',
  'reactjs',
  'next',
  'next.js',
  'nextjs',
  'node',
  'node.js',
  'nodejs',
  'vue',
  'vue.js',
  'vuejs',
  'express',
  'express.js',
  'expressjs',
  'angular',
  'angular.js',
  'angularjs',
  'nest',
  'nestjs',
  'nest.js',
  'nuxt',
  'nuxt.js',
  'nuxtjs',
  'django',
  'flask',
  'fastapi',
  'fastify',
  'laravel',
  'rails',
  'spring',
  'spring boot',
  'springboot',
  'tensorflow',
  'pytorch',
  'torch',
  'keras',
  'scikit-learn',
  'sklearn',
  'pandas',
  'numpy',
  'redux',
  'react router',
  'tailwind',
  'tailwindcss',
  'mui',
  'material ui',
  'sass',
  'scss',
  'svelte',
  'svelte.js',
  'sveltejs',
  'ember',
  'ember.js',
  'emberjs',
  'jquery',
  'jquery.js',
  'jqueryjs',
  'bootstrap',
  'graphql',
  'swr',
  'flutter',
  'react native',
  'reactnative',
  '.net',
  'dotnet',
  'asp.net',
  'aspnet',
]);
const OTHER_TECH_SKILLS = new Set([
  'docker',
  'kubernetes',
  'k8s',
  'kube',
  'aws',
  'gcp',
  'azure',
  'git',
  'nginx',
  'redis',
  'celery',
  'postgres',
  'postgresql',
  'psql',
  'mongo',
  'mongodb',
  'mysql',
  'nosql',
  'openapi',
  'restful api',
  'rest api',
  'rest',
  'jwt',
  'oauth',
  'jest',
  'mocha',
  'chai',
  'ci/cd',
  'github actions',
  'gitlab ci',
  'vercel',
  'netlify',
  'figma',
  'sketch',
  'unix/linux',
  'linux',
  'rdbms/sql',
  'rdbms',
  'webpack',
  'vite',
  'gatsby',
  'eslint',
  'openai api',
  'llm',
  'terraform',
  'ansible',
  'jenkins',
  'kafka',
  'rabbitmq',
  'airflow',
  'dbt',
  'snowflake',
  'dynamodb',
]);

// Register Handlebars helpers
Handlebars.registerHelper('join', function(array: string[], separator: string) {
  if (!Array.isArray(array)) return '';
  return array.join(separator || ', ');
});

Handlebars.registerHelper('formatDate', function(date: string) {
  return date; // Keep as is for now
});

function normalizeSkills(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of skills) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

function trimIncompleteEnd(s: string): string {
  return s.trim().replace(/,+\s*$/, '').replace(/\s+(and|or)\s*$/i, '').trim();
}

function clampRoleBrief(description: string): string {
  const clean = description.trim().replace(/\s+/g, ' ');
  if (clean.length <= MAX_ROLE_BRIEF_LENGTH) return trimIncompleteEnd(clean);
  const truncated = clean.slice(0, MAX_ROLE_BRIEF_LENGTH);
  let result: string;
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? ')
  );
  if (lastSentenceEnd >= MAX_ROLE_BRIEF_LENGTH - 80) {
    result = truncated.slice(0, lastSentenceEnd + 1).trim();
  } else {
    const lastComma = truncated.lastIndexOf(', ');
    if (lastComma >= MAX_ROLE_BRIEF_LENGTH - 50) {
      result = truncated.slice(0, lastComma).trim();
    } else {
      const lastSpace = truncated.trimEnd().lastIndexOf(' ');
      result = lastSpace > 0 && lastSpace >= MAX_ROLE_BRIEF_LENGTH - 40
        ? truncated.slice(0, lastSpace).trim()
        : truncated.trimEnd();
    }
  }
  return trimIncompleteEnd(result);
}

function normalizeExperienceDescriptions<T extends { experience?: Array<{ description?: string }> }>(data: T): T {
  const experience = Array.isArray(data.experience)
    ? data.experience.map((entry) => ({
      ...entry,
      description: clampRoleBrief(entry.description ?? ''),
    }))
    : data.experience;

  return {
    ...data,
    experience,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getBoldKeywordPool(data: {
  hardSkills?: string[];
  skills?: string[];
  softSkills?: string[];
}): string[] {
  const all = [...(data.hardSkills ?? []), ...(data.skills ?? []), ...(data.softSkills ?? [])]
    .map((s) => s.trim())
    .filter((s) => s.length >= 3)
    .filter((s) => !/[<>]/.test(s));
  const seen = new Set<string>();
  return all.filter((s) => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.length - a.length);
}

function boldKeywordsInText(text: string, keywords: string[]): string {
  let out = text;
  for (const keyword of keywords) {
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])(${escapeRegExp(keyword)})(?=[^A-Za-z0-9_]|$)`, 'gi');
    out = out.replace(pattern, (match, left, term) => `${left}<strong>${term}</strong>`);
  }
  return out;
}

function applyKeywordBolding<T extends {
  summary?: string;
  experience?: Array<{ description?: string; achievements?: string[] }>;
  hardSkills?: string[];
  skills?: string[];
  softSkills?: string[];
}>(data: T): T {
  const keywords = getBoldKeywordPool(data);
  if (keywords.length === 0) return data;

  const experience = Array.isArray(data.experience)
    ? data.experience.map((entry) => ({
      ...entry,
      description: entry.description ? boldKeywordsInText(entry.description, keywords) : entry.description,
      achievements: Array.isArray(entry.achievements)
        ? entry.achievements.map((a) => boldKeywordsInText(a, keywords))
        : entry.achievements,
    }))
    : data.experience;

  const hardSkills = Array.isArray(data.hardSkills)
    ? data.hardSkills.map((skill) => `<strong>${skill}</strong>`)
    : data.hardSkills;
  const skills = Array.isArray(data.skills)
    ? data.skills.map((skill) => `<strong>${skill}</strong>`)
    : data.skills;
  const softSkills = Array.isArray(data.softSkills)
    ? data.softSkills.map((skill) => `<strong>${skill}</strong>`)
    : data.softSkills;

  return {
    ...data,
    summary: data.summary ? boldKeywordsInText(data.summary, keywords) : data.summary,
    experience,
    hardSkills,
    skills,
    softSkills,
  };
}

function decodeAllowedTags(html: string): string {
  return html
    .replace(/&lt;(\/?)strong&gt;/gi, '<$1strong>')
    .replace(/&lt;(\/?)b&gt;/gi, '<$1b>');
}

const JOB_TITLE_EXCLUSIONS = new Set([
  'full stack developer', 'fullstack developer', 'full-stack developer',
  'frontend developer', 'front-end developer', 'frotnend developer',
  'backend developer', 'back-end developer',
  'full stack engineer', 'frontend engineer', 'backend engineer',
  'software developer', 'software engineer',
]);

function capitalizeHardSkill(s: string): string {
  if (!s || s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function normalizeHardSkillAlias(skill: string): string {
  return skill.trim().toLowerCase().replace(/\s+/g, ' ');
}

const ALLOWED_TECH_SKILLS = new Set<string>();
let hardSkillPriorityMap = readHardSkillPriorityMap();

function loadAllowedTechSkills() {
  ALLOWED_TECH_SKILLS.clear();
  for (const skill of readSkills('hard')) {
    ALLOWED_TECH_SKILLS.add(normalizeHardSkillAlias(skill));
  }
  hardSkillPriorityMap = readHardSkillPriorityMap();
}

loadAllowedTechSkills();

export function refreshAllowedTechSkills() {
  loadAllowedTechSkills();
}


const MAX_SOFT_SKILL_LENGTH = 30;
const SOFT_SKILL_CONDENSE: Array<{ patterns: string[]; key: string }> = [
  { patterns: ['excellent communication', 'communication and collaboration', 'communication skills'], key: 'Communication' },
  { patterns: ['collaboration', 'collaborative'], key: 'Collaboration' },
  { patterns: ['cross-functional', 'cross functional'], key: 'Cross-functional' },
  { patterns: ['problem-solving', 'problem solving'], key: 'Problem-solving' },
  { patterns: ['ownership', 'high ownership'], key: 'Ownership' },
  { patterns: ['autonomy', 'self-directed', 'independent'], key: 'Autonomy' },
  { patterns: ['transparency', 'transparent'], key: 'Transparency' },
  { patterns: ['reliability', 'reliable'], key: 'Reliability' },
  { patterns: ['supportive', 'support'], key: 'Supportive' },
  { patterns: ['passionate', 'passion'], key: 'Passion' },
  { patterns: ['mentorship', 'mentor', 'help fellow'], key: 'Mentorship' },
  { patterns: ['adaptability', 'adapt'], key: 'Adaptability' },
  { patterns: ['eager to learn', 'lifelong learning'], key: 'Eager to learn' },
  { patterns: ['accountability', 'accountable'], key: 'Accountability' },
  { patterns: ['attention to detail', 'detail-oriented'], key: 'Attention to detail' },
  { patterns: ['team player', 'we are one team'], key: 'Team player' },
  { patterns: ['diverse', 'diversity'], key: 'Diversity' },
  { patterns: ['innovative', 'innovation', 'great ideas'], key: 'Innovation' },
];

function condenseSoftSkill(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length <= MAX_SOFT_SKILL_LENGTH) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  const lower = trimmed.toLowerCase();
  for (const { patterns, key } of SOFT_SKILL_CONDENSE) {
    if (patterns.some((p) => lower.includes(p))) return key;
  }
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1) : trimmed;
}

function isTechnicalSkill(skill: string): boolean {
  const normalized = skill.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 50 || /[.!?]/.test(normalized)) return false;

  const lower = normalized.toLowerCase();
  if (JOB_TITLE_EXCLUSIONS.has(lower)) return false;
  // Exclude soft skills (communication, collaboration, ownership, etc.)
  if (SOFT_SKILL_SIGNALS.some((signal) => lower.includes(signal))) return false;

  const allowedKey = normalizeHardSkillAlias(normalized);
  if (!ALLOWED_TECH_SKILLS.has(allowedKey)) return false;

  // If whitelisted, treat as technical
  return true;
}

function prioritizeSoftSkills(skills: string[]): string[] {
  const prioritized = skills.filter((skill) =>
    SOFT_SKILL_SIGNALS.some((signal) => skill.toLowerCase().includes(signal))
  );
  const remainder = skills.filter((skill) =>
    !SOFT_SKILL_SIGNALS.some((signal) => skill.toLowerCase().includes(signal))
  );
  return [...prioritized, ...remainder];
}

function sortHardSkillsByPriority(skills: string[]): string[] {
  return [...normalizeSkills(skills)].sort((a, b) => {
    const aPriority = hardSkillPriorityMap.get(normalizeHardSkillAlias(a)) ?? Number.MAX_SAFE_INTEGER;
    const bPriority = hardSkillPriorityMap.get(normalizeHardSkillAlias(b)) ?? Number.MAX_SAFE_INTEGER;

    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }

    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
}

type SkillsData = {
  hardSkills?: string[];
  softSkills?: string[];
  skills?: string[];
};

function applySkillsLimit<T extends SkillsData>(data: T): T {
  const MAX_SOFT_SKILLS = 10;

  const combinedHardRaw = data.hardSkills ?? data.skills ?? [];
  const hardLimited = sortHardSkillsByPriority(combinedHardRaw);

  const softRaw = prioritizeSoftSkills(normalizeSkills(data.softSkills));
  const softCondensed = softRaw.slice(0, MAX_SOFT_SKILLS).map(condenseSoftSkill);
  const softSeen = new Set<string>();
  // const softLimited = softCondensed.filter((s) => {
  //   const key = s.toLowerCase();
  //   if (softSeen.has(key)) return false;
  //   softSeen.add(key);
  //   return true;
  // });

  const softLimited = data.softSkills ?? []

  return {
    ...data,
    hardSkills: hardLimited,
    softSkills: softLimited,
    skills: hardLimited,
  } as T;
}

function sanitizeFilename(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function getResumeTitle(profile: Profile): string {
  const profileTitle = profile.title?.trim();
  if (profileTitle) return profileTitle;
  const lastRole = profile.experience?.[0]?.title?.trim();
  return lastRole || 'Professional';
}

/** Sanitize title for ATS: remove hyphens, periods, commas, and other symbols */
function sanitizeTitleForATS(title: string): string {
  return title
    .replace(/[-.,;:'"()\[\]\/\\@#$%&*+=<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function prepareResumeRenderData(
  profile: Profile,
  tailoredContent?: TailoredContent,
  companyName?: string,
  role?: string
) {
  const data = {
    ...profile,
    companyName: companyName || '',
    role: role || '',
    title: sanitizeTitleForATS(getResumeTitle(profile)),
    ...(tailoredContent && {
      summary: tailoredContent.summary,
      experience: tailoredContent.experience,
      skills: tailoredContent.skills || [],
      hardSkills: tailoredContent.hardSkills || [],
      softSkills: tailoredContent.softSkills || [],
      strengths: tailoredContent.strengths
    })
  };
  return normalizeExperienceDescriptions(applySkillsLimit(data));
}

export async function generateResumePDF(
  profile: Profile,
  template: Template,
  tailoredContent: TailoredContent | undefined,
  pathInfo: GeneratedPathInfo,
  companyName?: string,
  role?: string
): Promise<string> {
  const renderData = prepareResumeRenderData(
    profile,
    tailoredContent,
    companyName,
    role
  );

  // Compile and render template
  const compiledTemplate = Handlebars.compile(template.htmlContent);
  const html = compiledTemplate(renderData);

  // Add CSS if separate
  const fullHtml = template.cssContent
    ? `<style>${template.cssContent}</style>${html}`
    : html;

  // Generate PDF with Puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: A4_PRINTABLE_WIDTH_PX,
      height: A4_PRINTABLE_HEIGHT_PX,
      deviceScaleFactor: 1,
    });
    await page.emulateMediaType('print');
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

    const pdfFilename = `${pathInfo.profileSlug}.pdf`;
    const relativePath = `${pathInfo.storagePathBase}/${pdfFilename}`;
    const filepath = path.join(pathInfo.absoluteDir, pdfFilename);
    const finalPdf = Buffer.from(await page.pdf({
      format: 'A4',
      margin: {
        top: '0.4in',
        right: '0.5in',
        bottom: '0.3in',
        left: '0.5in'
      },
      printBackground: true
    }));

    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, finalPdf);

    return relativePath;
  } finally {
    await browser.close();
  }
}

export async function generatePreviewHTML(
  profile: Profile,
  template: Template,
  tailoredContent?: TailoredContent
): Promise<string> {
  const renderData = prepareResumeRenderData(profile, tailoredContent);

  // Compile and render template
  const compiledTemplate = Handlebars.compile(template.htmlContent);
  const html = compiledTemplate(renderData);

  // Add CSS if separate
  return template.cssContent 
    ? `<style>${template.cssContent}</style>${html}`
    : html;
}

/** Sample profile for template preview */
const SAMPLE_PROFILE: Profile = {
  id: 'preview',
  name: 'Jane Smith',
  title: 'Senior Software Engineer',
  totalYearsExperience: 5,
  contact: {
    phone: '+1 (555) 123-4567',
    email: 'jane.smith@email.com',
    linkedin: 'linkedin.com/in/janesmith',
    location: 'San Francisco, CA',
  },
  summary: 'Experienced software engineer with 5+ years building scalable web applications. Strong focus on clean code and team collaboration.',
  experience: [
    {
      title: 'Senior Software Engineer',
      company: 'Tech Corp',
      startDate: '01/2021',
      endDate: 'Present',
      location: 'San Francisco, CA',
      description: 'Lead development of customer-facing platforms.',
      achievements: ['Reduced load time by 40%', 'Mentored 3 junior engineers'],
    },
    {
      title: 'Software Engineer',
      company: 'Startup Inc',
      startDate: '06/2019',
      endDate: '12/2020',
      location: 'Remote',
      description: 'Full-stack development for SaaS product.',
      achievements: ['Built REST APIs', 'Implemented CI/CD pipeline'],
    },
  ],
  strengths: [
    { title: 'Problem Solving', description: 'Analytical approach to complex challenges.' },
    { title: 'Communication', description: 'Clear technical documentation and presentations.' },
  ],
  skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Python'],
  education: [
    {
      degree: 'B.S. Computer Science',
      institution: 'State University',
      startDate: '2015',
      endDate: '2019',
      location: 'Boston, MA',
    },
  ],
  createdAt: '',
  updatedAt: '',
};

export function generateTemplatePreviewHTML(template: Template): string {
  const renderData = prepareResumeRenderData(SAMPLE_PROFILE);
  const compiledTemplate = Handlebars.compile(template.htmlContent);
  const html = compiledTemplate(renderData);
  const fullHtml = template.cssContent
    ? `<style>${template.cssContent}</style>${html}`
    : html;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:8px;background:#f3f4f6;">${fullHtml}</body></html>`;
}

export async function getGeneratedPDFPath(filename: string): Promise<string | null> {
  return getGeneratedFilePath(filename);
}
