"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractPromptVariables = extractPromptVariables;
exports.validatePromptContent = validatePromptContent;
exports.listPrompts = listPrompts;
exports.getPromptById = getPromptById;
exports.createPrompt = createPrompt;
exports.updatePrompt = updatePrompt;
exports.deletePrompt = deletePrompt;
exports.previewPrompt = previewPrompt;
exports.validatePromptDraft = validatePromptDraft;
exports.renderPrompt = renderPrompt;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const PROMPTS_DIR = path_1.default.join(__dirname, '../../data/prompts');
const CUSTOM_PROMPT_PREFIX = 'custom-';
const META_SUFFIX = '.meta.json';
const TEXT_SUFFIX = '.txt';
const VARIABLE_PATTERN = /\[\[\s*([a-zA-Z0-9_.-]+)\s*\]\]/g;
const BUILT_IN_PROMPTS = [
    {
        id: 'analyze-job-description',
        name: 'Analyze Job Description',
        description: 'Extracts structured ATS keywords, role metadata, and soft-skill signals from a raw job description.',
        usage: 'Live prompt used by the resume analysis flow.',
        responseFormat: 'json',
        allowedVariables: [
            {
                name: 'jobDescription',
                description: 'Raw job description text pasted by the user.',
                sampleValue: `Senior Software Engineer

We are looking for a backend-focused engineer with strong Node.js, TypeScript, PostgreSQL, Docker, and AWS experience.

You will design scalable APIs, collaborate cross-functionally, improve reliability, and mentor teammates.

Preferred: GraphQL, Kubernetes, Terraform, CI/CD, and experience in fast-paced startup environments.`,
            },
        ],
    },
    {
        id: 'tailor-resume',
        name: 'Tailor Resume',
        description: 'Rewrites a profile against structured job analysis data and returns tailored resume content.',
        usage: 'Live prompt used when generating tailored resumes.',
        responseFormat: 'json',
        allowedVariables: [
            {
                name: 'profileJson',
                description: 'Serialized candidate profile JSON.',
                sampleValue: `{
  "name": "Jane Doe",
  "title": "Senior Software Engineer",
  "totalYearsExperience": 7,
  "summary": "Backend-focused engineer with experience in scalable systems.",
  "skills": ["Node.js", "TypeScript", "PostgreSQL", "AWS"],
  "experience": [
    {
      "title": "Senior Software Engineer",
      "company": "Acme",
      "startDate": "01/2022",
      "endDate": "Present",
      "location": "Remote",
      "description": "Builds backend services and platform tooling.",
      "achievements": [
        "Reduced API latency by 35%.",
        "Led migration to TypeScript."
      ]
    }
  ]
}`,
            },
            {
                name: 'jobAnalysisJson',
                description: 'Serialized job analysis JSON produced from the target job description.',
                sampleValue: `{
  "jobMeta": {
    "title": "Senior Backend Engineer",
    "seniority": "Senior",
    "industry": "Software",
    "department": "Engineering"
  },
  "skills": {
    "required": ["Node.js", "TypeScript", "PostgreSQL", "AWS"],
    "preferred": ["GraphQL", "Docker"],
    "tools": ["Docker"],
    "technologies": ["microservices", "CI/CD"]
  },
  "responsibilities": [
    "design and implement scalable backend services",
    "collaborate with product and design teams"
  ],
  "domainKnowledge": ["backend platforms", "distributed systems"],
  "softSkills": ["high ownership mentality", "excellent written communication"],
  "keywords": {
    "actionVerbs": ["design", "collaborate"],
    "buzzwords": ["scalable systems", "ownership mindset"],
    "mustInclude": ["Node.js", "TypeScript"]
  }
}`,
            },
            {
                name: 'jobTitle',
                description: 'Exact job title extracted from job analysis.',
                sampleValue: 'Senior Backend Engineer',
            },
            {
                name: 'hardSkillsJSON',
                description: 'Serialized combined hard skills array from required, preferred, technologies, and tools.',
                sampleValue: `["Node.js", "TypeScript", "PostgreSQL", "AWS", "GraphQL", "Docker"]`,
            },
            {
                name: 'domainKnowledge',
                description: 'Serialized domain knowledge and industry terms array.',
                sampleValue: `["backend platforms", "distributed systems", "Software"]`,
            },
            {
                name: 'keywordsJson',
                description: 'Serialized ATS keyword array.',
                sampleValue: `["scalable systems", "cross-functional collaboration", "ownership mindset"]`,
            },
            {
                name: 'keyResponsibilitiesJson',
                description: 'Serialized job responsibilities array.',
                sampleValue: `[
  "design and implement scalable backend services",
  "collaborate with product and design teams"
]`,
            },
            {
                name: 'softSkillsJSON',
                description: 'Serialized soft skills array.',
                sampleValue: `["high ownership mentality", "excellent written communication"]`,
            },
        ],
    },
    {
        id: 'generate-cover-letter',
        name: 'Generate Cover Letter',
        description: 'Generates a concise cover letter body using the profile and application details.',
        usage: 'Live prompt used when there is no job description but a cover letter is requested.',
        responseFormat: 'text',
        allowedVariables: [
            {
                name: 'profileJson',
                description: 'Serialized candidate profile JSON.',
            },
            {
                name: 'companyName',
                description: 'Target company name.',
                sampleValue: 'Acme',
            },
            {
                name: 'role',
                description: 'Target role title.',
                sampleValue: 'Senior Software Engineer',
            },
        ],
    },
    {
        id: 'extract-template-from-pdf',
        name: 'Extract Template From PDF',
        description: 'Converts resume PDF text into an ATS-friendly Handlebars HTML template.',
        usage: 'Live prompt used when uploading a PDF to create a resume template.',
        responseFormat: 'json',
        allowedVariables: [
            {
                name: 'pdfText',
                description: 'Extracted text content from the uploaded PDF.',
                sampleValue: `JANE DOE
Senior Software Engineer
jane@example.com | San Francisco, CA | linkedin.com/in/jane

SUMMARY
Backend-focused engineer with experience building APIs and internal tooling.

EXPERIENCE
Senior Software Engineer | Acme | 2022 - Present
- Designed and shipped TypeScript APIs used by 5 internal teams.
- Improved reliability of background processing workloads.

EDUCATION
BS Computer Science | State University | 2018`,
            },
        ],
    },
    {
        id: 'extract-profile-from-resume',
        name: 'Extract Profile From Resume',
        description: 'Parses raw resume text into the structured profile schema used by the app.',
        usage: 'Live prompt used when importing resume text into a profile.',
        responseFormat: 'json',
        allowedVariables: [
            {
                name: 'resumeText',
                description: 'Full resume text extracted from an uploaded resume.',
                sampleValue: `JANE DOE
Senior Software Engineer
jane@example.com
San Francisco, CA

SUMMARY
Senior engineer focused on scalable backend systems.

EXPERIENCE
Senior Software Engineer, Acme, 01/2022 - Present
- Built Node.js services and improved system reliability.

SKILLS
Node.js, TypeScript, PostgreSQL, AWS`,
            },
        ],
    },
];
function isBuiltInPrompt(id) {
    return BUILT_IN_PROMPTS.some((prompt) => prompt.id === id);
}
function getBuiltInPrompt(id) {
    return BUILT_IN_PROMPTS.find((prompt) => prompt.id === id);
}
function getPromptTextPath(id) {
    return path_1.default.join(PROMPTS_DIR, `${id}${TEXT_SUFFIX}`);
}
function getPromptMetaPath(id) {
    return path_1.default.join(PROMPTS_DIR, `${id}${META_SUFFIX}`);
}
async function ensurePromptDirectory() {
    await promises_1.default.mkdir(PROMPTS_DIR, { recursive: true });
}
function normalizePromptName(name) {
    return name.trim().replace(/\s+/g, ' ');
}
function normalizePromptDescription(description) {
    return description?.trim().replace(/\s+/g, ' ') ?? '';
}
function normalizePromptContent(content) {
    return content.replace(/\r\n/g, '\n').trim();
}
function normalizeResponseFormat(format) {
    return format === 'text' ? 'text' : 'json';
}
function normalizeVariableName(name) {
    return name.trim();
}
function normalizeAllowedVariables(allowedVariables) {
    const seen = new Set();
    const normalized = [];
    for (const variable of allowedVariables ?? []) {
        const name = normalizeVariableName(variable?.name ?? '');
        if (!name)
            continue;
        if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
            throw new Error(`Invalid variable name "${name}". Use letters, numbers, ".", "_" or "-".`);
        }
        if (seen.has(name))
            continue;
        seen.add(name);
        normalized.push({
            name,
            description: variable.description?.trim() || undefined,
            sampleValue: variable.sampleValue,
        });
    }
    return normalized;
}
function extractPromptVariables(content) {
    const seen = new Set();
    const found = [];
    for (const match of content.matchAll(VARIABLE_PATTERN)) {
        const name = normalizeVariableName(match[1] ?? '');
        if (!name || seen.has(name))
            continue;
        seen.add(name);
        found.push(name);
    }
    return found;
}
function validatePromptContent(content, allowedVariables) {
    const usedVariables = extractPromptVariables(content);
    const allowed = new Set(allowedVariables.map((variable) => variable.name));
    const unknownVariables = usedVariables.filter((name) => !allowed.has(name));
    return {
        usedVariables,
        unknownVariables,
    };
}
function buildSampleValue(variableName) {
    switch (variableName) {
        case 'jobDescription':
            return `Senior Software Engineer

Looking for a backend-leaning engineer with Node.js, TypeScript, PostgreSQL, Docker, AWS, and cross-functional collaboration experience.`;
        case 'profileJson':
            return `{
  "name": "Jane Doe",
  "title": "Senior Software Engineer",
  "totalYearsExperience": 7,
  "skills": ["Node.js", "TypeScript", "PostgreSQL", "AWS"]
}`;
        case 'jobAnalysisJson':
            return `{
  "jobMeta": {
    "title": "Senior Backend Engineer",
    "seniority": "Senior",
    "industry": "Software",
    "department": "Engineering"
  },
  "skills": {
    "required": ["Node.js", "TypeScript", "PostgreSQL", "AWS"],
    "preferred": ["GraphQL", "Docker"],
    "tools": ["Docker"],
    "technologies": ["microservices", "CI/CD"]
  },
  "responsibilities": ["design scalable backend services"],
  "domainKnowledge": ["backend platforms", "distributed systems"],
  "softSkills": ["ownership mindset"],
  "keywords": {
    "actionVerbs": ["design"],
    "buzzwords": ["scalable systems"],
    "mustInclude": ["Node.js", "TypeScript"]
  }
}`;
        case 'companyName':
            return 'Acme';
        case 'role':
            return 'Senior Software Engineer';
        case 'pdfText':
        case 'resumeText':
            return 'Sample resume text content for preview.';
        default:
            return `<sample:${variableName}>`;
    }
}
function buildSampleValues(allowedVariables, providedValues) {
    const sampleValues = {};
    const provided = providedValues ?? {};
    for (const variable of allowedVariables) {
        sampleValues[variable.name] = provided[variable.name] ?? variable.sampleValue ?? buildSampleValue(variable.name);
    }
    return sampleValues;
}
function renderPromptText(content, sampleValues) {
    const missing = new Set();
    const renderedContent = content.replace(VARIABLE_PATTERN, (_match, variableName) => {
        const name = normalizeVariableName(variableName);
        if (!(name in sampleValues)) {
            missing.add(name);
            return `[[${name}]]`;
        }
        return sampleValues[name] ?? '';
    });
    return {
        renderedContent,
        missingVariables: [...missing],
    };
}
function assertValidPromptDraft(content, allowedVariables) {
    const validation = validatePromptContent(content, allowedVariables);
    if (validation.unknownVariables.length > 0) {
        throw new Error(`Unknown prompt variables: ${validation.unknownVariables.join(', ')}`);
    }
    return validation;
}
function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'prompt';
}
async function generateCustomPromptId(name) {
    const base = `${CUSTOM_PROMPT_PREFIX}${slugify(name)}`;
    let candidate = base;
    let counter = 1;
    while (true) {
        try {
            await promises_1.default.access(getPromptMetaPath(candidate));
            candidate = `${base}-${counter}`;
            counter += 1;
            continue;
        }
        catch {
            // Keep checking the paired text file before accepting the candidate.
        }
        try {
            await promises_1.default.access(getPromptTextPath(candidate));
            candidate = `${base}-${counter}`;
            counter += 1;
        }
        catch {
            return candidate;
        }
    }
}
async function safeStat(filePath) {
    try {
        const stats = await promises_1.default.stat(filePath);
        return {
            createdAt: stats.birthtime.toISOString(),
            updatedAt: stats.mtime.toISOString(),
        };
    }
    catch {
        return null;
    }
}
async function readBuiltInPromptRecord(definition) {
    try {
        const content = await promises_1.default.readFile(getPromptTextPath(definition.id), 'utf-8');
        const normalizedContent = normalizePromptContent(content);
        const validation = validatePromptContent(normalizedContent, definition.allowedVariables);
        const timestamps = await safeStat(getPromptTextPath(definition.id));
        return {
            id: definition.id,
            name: definition.name,
            description: definition.description,
            responseFormat: definition.responseFormat,
            allowedVariables: definition.allowedVariables,
            validation,
            isBuiltIn: true,
            usage: definition.usage,
            createdAt: timestamps?.createdAt ?? new Date().toISOString(),
            updatedAt: timestamps?.updatedAt ?? new Date().toISOString(),
            content: normalizedContent,
        };
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            console.warn(`Built-in prompt file missing: ${definition.id}`);
            return null;
        }
        throw error;
    }
}
async function readCustomPromptMeta(id) {
    try {
        const raw = await promises_1.default.readFile(getPromptMetaPath(id), 'utf-8');
        const parsed = JSON.parse(raw);
        return {
            id: parsed.id,
            name: normalizePromptName(parsed.name),
            description: normalizePromptDescription(parsed.description),
            responseFormat: normalizeResponseFormat(parsed.responseFormat),
            allowedVariables: normalizeAllowedVariables(parsed.allowedVariables),
            createdAt: parsed.createdAt,
            updatedAt: parsed.updatedAt,
        };
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}
async function readCustomPromptRecord(id) {
    const meta = await readCustomPromptMeta(id);
    if (!meta)
        return null;
    try {
        const content = await promises_1.default.readFile(getPromptTextPath(id), 'utf-8');
        const normalizedContent = normalizePromptContent(content);
        return {
            id: meta.id,
            name: meta.name,
            description: meta.description,
            responseFormat: meta.responseFormat,
            allowedVariables: meta.allowedVariables,
            validation: validatePromptContent(normalizedContent, meta.allowedVariables),
            isBuiltIn: false,
            createdAt: meta.createdAt,
            updatedAt: meta.updatedAt,
            content: normalizedContent,
        };
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}
function toPromptSummary(record) {
    return {
        id: record.id,
        name: record.name,
        description: record.description,
        responseFormat: record.responseFormat,
        allowedVariables: record.allowedVariables,
        validation: record.validation,
        isBuiltIn: record.isBuiltIn,
        usage: record.usage,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}
async function listPrompts() {
    await ensurePromptDirectory();
    const builtInRecords = (await Promise.all(BUILT_IN_PROMPTS.map(readBuiltInPromptRecord)))
        .filter((record) => record !== null);
    const entries = await promises_1.default.readdir(PROMPTS_DIR);
    const customIds = entries
        .filter((entry) => entry.endsWith(META_SUFFIX))
        .map((entry) => entry.slice(0, -META_SUFFIX.length))
        .filter((id) => !isBuiltInPrompt(id));
    const customRecords = (await Promise.all(customIds.map(readCustomPromptRecord)))
        .filter((record) => record !== null)
        .sort((left, right) => left.name.localeCompare(right.name));
    return [...builtInRecords.map(toPromptSummary), ...customRecords.map(toPromptSummary)];
}
async function getPromptById(id) {
    await ensurePromptDirectory();
    if (isBuiltInPrompt(id)) {
        const definition = getBuiltInPrompt(id);
        if (!definition)
            return null;
        return readBuiltInPromptRecord(definition);
    }
    return readCustomPromptRecord(id);
}
async function createPrompt(input) {
    await ensurePromptDirectory();
    const name = normalizePromptName(input.name);
    const description = normalizePromptDescription(input.description);
    const content = normalizePromptContent(input.content);
    const responseFormat = normalizeResponseFormat(input.responseFormat);
    const allowedVariables = normalizeAllowedVariables(input.allowedVariables);
    if (!name) {
        throw new Error('Prompt name is required');
    }
    if (!content) {
        throw new Error('Prompt content is required');
    }
    assertValidPromptDraft(content, allowedVariables);
    const id = await generateCustomPromptId(name);
    const now = new Date().toISOString();
    const meta = {
        id,
        name,
        description,
        responseFormat,
        allowedVariables,
        createdAt: now,
        updatedAt: now,
    };
    await promises_1.default.writeFile(getPromptTextPath(id), `${content}\n`, 'utf-8');
    await promises_1.default.writeFile(getPromptMetaPath(id), JSON.stringify(meta, null, 2), 'utf-8');
    const saved = await getPromptById(id);
    if (!saved) {
        throw new Error('Failed to create prompt');
    }
    return saved;
}
async function updatePrompt(id, input) {
    await ensurePromptDirectory();
    const content = normalizePromptContent(input.content);
    if (!content) {
        throw new Error('Prompt content is required');
    }
    if (isBuiltInPrompt(id)) {
        const definition = getBuiltInPrompt(id);
        if (!definition)
            return null;
        assertValidPromptDraft(content, definition.allowedVariables);
        await promises_1.default.writeFile(getPromptTextPath(id), `${content}\n`, 'utf-8');
        return getPromptById(id);
    }
    const current = await readCustomPromptMeta(id);
    if (!current)
        return null;
    const name = normalizePromptName(input.name ?? current.name);
    const description = normalizePromptDescription(input.description ?? current.description);
    const responseFormat = normalizeResponseFormat(input.responseFormat ?? current.responseFormat);
    const allowedVariables = normalizeAllowedVariables(input.allowedVariables ?? current.allowedVariables);
    if (!name) {
        throw new Error('Prompt name is required');
    }
    assertValidPromptDraft(content, allowedVariables);
    const nextMeta = {
        ...current,
        name,
        description,
        responseFormat,
        allowedVariables,
        updatedAt: new Date().toISOString(),
    };
    await promises_1.default.writeFile(getPromptTextPath(id), `${content}\n`, 'utf-8');
    await promises_1.default.writeFile(getPromptMetaPath(id), JSON.stringify(nextMeta, null, 2), 'utf-8');
    return getPromptById(id);
}
async function deletePrompt(id) {
    await ensurePromptDirectory();
    if (isBuiltInPrompt(id)) {
        throw new Error('Cannot delete built-in prompts');
    }
    const prompt = await getPromptById(id);
    if (!prompt)
        return false;
    await Promise.all([
        promises_1.default.unlink(getPromptTextPath(id)).catch(() => undefined),
        promises_1.default.unlink(getPromptMetaPath(id)).catch(() => undefined),
    ]);
    return true;
}
function resolveDraftSource(record, input) {
    if (record) {
        return {
            content: input.content ? normalizePromptContent(input.content) : record.content,
            allowedVariables: record.isBuiltIn
                ? record.allowedVariables
                : normalizeAllowedVariables(input.allowedVariables ?? record.allowedVariables),
        };
    }
    const content = normalizePromptContent(input.content ?? '');
    const allowedVariables = normalizeAllowedVariables(input.allowedVariables);
    if (!content) {
        throw new Error('Prompt content is required');
    }
    return {
        content,
        allowedVariables,
    };
}
async function previewPrompt(input) {
    await ensurePromptDirectory();
    const stored = input.id ? await getPromptById(input.id) : null;
    if (input.id && !stored) {
        throw new Error('Prompt not found');
    }
    const { content, allowedVariables } = resolveDraftSource(stored, input);
    const validation = validatePromptContent(content, allowedVariables);
    const sampleValues = buildSampleValues(allowedVariables, input.sampleValues);
    const { renderedContent } = renderPromptText(content, sampleValues);
    return {
        renderedContent,
        sampleValues,
        validation,
    };
}
async function validatePromptDraft(input) {
    await ensurePromptDirectory();
    const stored = input.id ? await getPromptById(input.id) : null;
    if (input.id && !stored) {
        throw new Error('Prompt not found');
    }
    const { content, allowedVariables } = resolveDraftSource(stored, input);
    return validatePromptContent(content, allowedVariables);
}
async function renderPrompt(id, values) {
    const prompt = await getPromptById(id);
    if (!prompt) {
        throw new Error(`Prompt "${id}" not found`);
    }
    if (prompt.validation.unknownVariables.length > 0) {
        throw new Error(`Prompt "${id}" contains unknown variables: ${prompt.validation.unknownVariables.join(', ')}`);
    }
    const { renderedContent, missingVariables } = renderPromptText(prompt.content, values);
    if (missingVariables.length > 0) {
        throw new Error(`Prompt "${id}" is missing runtime values for: ${missingVariables.join(', ')}`);
    }
    return renderedContent;
}
//# sourceMappingURL=promptService.js.map