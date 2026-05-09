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
exports.renderPromptSegments = renderPromptSegments;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const aiModelCatalog_1 = require("./aiModelCatalog");
const DATA_DIR = process.env.TAILOR_DATA_DIR
    ? path_1.default.resolve(process.env.TAILOR_DATA_DIR)
    : path_1.default.join(__dirname, '../../data');
const PROMPTS_DIR = path_1.default.join(DATA_DIR, 'prompts');
const CUSTOM_PROMPT_PREFIX = 'custom-';
const PROMPT_SUFFIX = '.json';
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
    {
        id: 'filter-google-sheet-job',
        name: 'Filter Google Sheet Job',
        description: 'Analyzes scraped job-page content and returns structured job attributes for Google Sheets.',
        usage: 'Live prompt used by the Google Sheets job filter flow.',
        responseFormat: 'json',
        allowedVariables: [
            {
                name: 'jobContent',
                description: 'Scraped text content from the full job page.',
                sampleValue: `Senior Software Engineer

Remote - United States

We are hiring a remote backend engineer based in the US. This role is fully remote, does not require a security clearance, and is not in the healthcare industry.

Compensation: $180,000 - $220,000 base salary plus equity.

Requirements:
- 5+ years of backend engineering experience
- Node.js, TypeScript, PostgreSQL
- Strong written communication`,
            },
            {
                name: 'jobDescription',
                description: 'Legacy alias for jobContent so older prompts continue to render.',
                sampleValue: `Senior Software Engineer

Remote - United States

We are hiring a remote backend engineer based in the US. This role is fully remote, does not require a security clearance, and is not in the healthcare industry.

Compensation: $180,000 - $220,000 base salary plus equity.

Requirements:
- 5+ years of backend engineering experience
- Node.js, TypeScript, PostgreSQL
- Strong written communication`,
            },
            {
                name: 'jobLink',
                description: 'Original job URL for the scraped page.',
                sampleValue: 'https://jobs.example.com/openings/senior-software-engineer',
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
function getPromptPath(id) {
    return path_1.default.join(PROMPTS_DIR, `${id}${PROMPT_SUFFIX}`);
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
function renderPromptSegmentsFromText(content, values) {
    const missing = new Set();
    const segments = [];
    let lastIndex = 0;
    let match;
    VARIABLE_PATTERN.lastIndex = 0;
    while ((match = VARIABLE_PATTERN.exec(content)) !== null) {
        const [rawMatch, rawVariableName] = match;
        const variableName = normalizeVariableName(rawVariableName);
        const literalText = content.slice(lastIndex, match.index);
        if (literalText) {
            segments.push({ text: literalText });
        }
        if (!(variableName in values)) {
            missing.add(variableName);
            segments.push({ text: `[[${variableName}]]`, variableName });
        }
        else {
            segments.push({ text: values[variableName] ?? '', variableName });
        }
        lastIndex = match.index + rawMatch.length;
    }
    const tailText = content.slice(lastIndex);
    if (tailText) {
        segments.push({ text: tailText });
    }
    return {
        segments,
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
            await promises_1.default.access(getPromptPath(candidate));
            candidate = `${base}-${counter}`;
            counter += 1;
            continue;
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
async function readPromptJson(id) {
    try {
        const filePath = getPromptPath(id);
        const raw = await promises_1.default.readFile(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        const content = normalizePromptContent(typeof parsed.content === 'string' ? parsed.content : '');
        if (!content)
            return null;
        return {
            parsed,
            content,
            timestamps: await safeStat(filePath),
        };
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}
async function readBuiltInPromptRecord(definition) {
    const stored = await readPromptJson(definition.id);
    if (!stored) {
        console.warn(`Built-in prompt file missing: ${definition.id}`);
        return null;
    }
    const validation = validatePromptContent(stored.content, definition.allowedVariables);
    const modelSelection = (0, aiModelCatalog_1.normalizePromptModelSelection)(stored.parsed.modelProvider ?? definition.modelProvider, stored.parsed.modelName ?? definition.modelName);
    return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        responseFormat: definition.responseFormat,
        modelProvider: modelSelection?.provider,
        modelName: modelSelection?.modelName,
        allowedVariables: definition.allowedVariables,
        validation,
        isBuiltIn: true,
        usage: definition.usage,
        createdAt: typeof stored.parsed.createdAt === 'string'
            ? stored.parsed.createdAt
            : stored.timestamps?.createdAt ?? new Date().toISOString(),
        updatedAt: typeof stored.parsed.updatedAt === 'string'
            ? stored.parsed.updatedAt
            : stored.timestamps?.updatedAt ?? new Date().toISOString(),
        content: stored.content,
    };
}
async function readCustomPromptFile(id) {
    const stored = await readPromptJson(id);
    if (!stored)
        return null;
    const parsed = stored.parsed;
    const modelSelection = (0, aiModelCatalog_1.normalizePromptModelSelection)(parsed.modelProvider, parsed.modelName);
    return {
        id: typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id.trim() : id,
        name: normalizePromptName(typeof parsed.name === 'string' ? parsed.name : id),
        description: normalizePromptDescription(typeof parsed.description === 'string' ? parsed.description : ''),
        responseFormat: normalizeResponseFormat(parsed.responseFormat),
        modelProvider: modelSelection?.provider,
        modelName: modelSelection?.modelName,
        allowedVariables: normalizeAllowedVariables(Array.isArray(parsed.allowedVariables) ? parsed.allowedVariables : []),
        createdAt: typeof parsed.createdAt === 'string' && parsed.createdAt.trim()
            ? parsed.createdAt.trim()
            : stored.timestamps?.createdAt ?? new Date().toISOString(),
        updatedAt: typeof parsed.updatedAt === 'string' && parsed.updatedAt.trim()
            ? parsed.updatedAt.trim()
            : stored.timestamps?.updatedAt ?? new Date().toISOString(),
        content: stored.content,
    };
}
async function writePromptJson(id, prompt) {
    await promises_1.default.writeFile(getPromptPath(id), `${JSON.stringify(prompt, null, 2)}\n`, 'utf-8');
}
async function readCustomPromptRecord(id) {
    const prompt = await readCustomPromptFile(id);
    if (!prompt)
        return null;
    return {
        id: prompt.id,
        name: prompt.name,
        description: prompt.description,
        responseFormat: prompt.responseFormat,
        modelProvider: prompt.modelProvider,
        modelName: prompt.modelName,
        allowedVariables: prompt.allowedVariables,
        validation: validatePromptContent(prompt.content, prompt.allowedVariables),
        isBuiltIn: false,
        createdAt: prompt.createdAt,
        updatedAt: prompt.updatedAt,
        content: prompt.content,
    };
}
function toPromptSummary(record) {
    return {
        id: record.id,
        name: record.name,
        description: record.description,
        responseFormat: record.responseFormat,
        modelProvider: record.modelProvider,
        modelName: record.modelName,
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
        .filter((entry) => entry.endsWith(PROMPT_SUFFIX))
        .map((entry) => entry.slice(0, -PROMPT_SUFFIX.length))
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
    const modelSelection = (0, aiModelCatalog_1.normalizePromptModelSelection)(input.modelProvider, input.modelName);
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
    const prompt = {
        id,
        name,
        description,
        responseFormat,
        modelProvider: modelSelection?.provider,
        modelName: modelSelection?.modelName,
        allowedVariables,
        createdAt: now,
        updatedAt: now,
        content,
    };
    await writePromptJson(id, prompt);
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
        const modelSelection = (0, aiModelCatalog_1.normalizePromptModelSelection)(input.modelProvider, input.modelName);
        assertValidPromptDraft(content, definition.allowedVariables);
        const existing = await readPromptJson(id);
        await writePromptJson(id, {
            id,
            content,
            modelProvider: modelSelection?.provider,
            modelName: modelSelection?.modelName,
            createdAt: typeof existing?.parsed.createdAt === 'string'
                ? existing.parsed.createdAt
                : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
        return getPromptById(id);
    }
    const current = await readCustomPromptFile(id);
    if (!current)
        return null;
    const name = normalizePromptName(input.name ?? current.name);
    const description = normalizePromptDescription(input.description ?? current.description);
    const responseFormat = normalizeResponseFormat(input.responseFormat ?? current.responseFormat);
    const modelSelection = (0, aiModelCatalog_1.normalizePromptModelSelection)(input.modelProvider ?? current.modelProvider, input.modelName ?? current.modelName);
    const allowedVariables = normalizeAllowedVariables(input.allowedVariables ?? current.allowedVariables);
    if (!name) {
        throw new Error('Prompt name is required');
    }
    assertValidPromptDraft(content, allowedVariables);
    const nextPrompt = {
        ...current,
        name,
        description,
        responseFormat,
        modelProvider: modelSelection?.provider,
        modelName: modelSelection?.modelName,
        allowedVariables,
        updatedAt: new Date().toISOString(),
        content,
    };
    await writePromptJson(id, nextPrompt);
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
    await promises_1.default.unlink(getPromptPath(id)).catch(() => undefined);
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
async function renderPromptSegments(id, values) {
    const prompt = await getPromptById(id);
    if (!prompt) {
        throw new Error(`Prompt "${id}" not found`);
    }
    if (prompt.validation.unknownVariables.length > 0) {
        throw new Error(`Prompt "${id}" contains unknown variables: ${prompt.validation.unknownVariables.join(', ')}`);
    }
    const { segments, missingVariables } = renderPromptSegmentsFromText(prompt.content, values);
    if (missingVariables.length > 0) {
        throw new Error(`Prompt "${id}" is missing runtime values for: ${missingVariables.join(', ')}`);
    }
    return segments;
}
//# sourceMappingURL=promptService.js.map