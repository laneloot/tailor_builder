"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROVIDER = void 0;
exports.refreshSkillCaches = refreshSkillCaches;
exports.resolveAIProvider = resolveAIProvider;
exports.analyzeJobDescription = analyzeJobDescription;
exports.tailorResume = tailorResume;
exports.generateCoverLetter = generateCoverLetter;
exports.extractTemplateFromPDF = extractTemplateFromPDF;
exports.extractProfileFromResume = extractProfileFromResume;
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const promptService_1 = require("./promptService");
const aiModelConfig_1 = require("../config/aiModelConfig");
const skillsDatabase_1 = require("../database/skillsDatabase");
const array_1 = require("../utils/array");
const json_1 = require("../utils/json");
// Ensure the repo .env file is loaded for this module even when it is imported
// before index.ts finishes bootstrapping, and prefer .env over inherited shell vars.
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../../../.env'), override: true });
let jobDesc = '';
const technicalSkills = (0, skillsDatabase_1.readSkills)('hard');
const softSkills = (0, skillsDatabase_1.readSkills)('soft');
function refreshSkillCaches() {
    const nextTech = (0, skillsDatabase_1.readSkills)('hard');
    const nextSoft = (0, skillsDatabase_1.readSkills)('soft');
    technicalSkills.length = 0;
    technicalSkills.push(...nextTech);
    softSkills.length = 0;
    softSkills.push(...nextSoft);
}
// function splitSkillsByOriginal(
//   hardSkills: string[],
//   original: string[]
// ): { matched: string[]; rest: string[] } {
//   const originalLower = original.map((item) => item.toLowerCase());
//   const matched: string[] = [];
//   const rest: string[] = [];
//   for (const skill of hardSkills) {
//     const skillLower = skill.toLowerCase();
//     const found = originalLower.some((orig) => orig.includes(skillLower));
//     if (found) {
//       matched.push(skill);
//     } else {
//       rest.push(skill);
//     }
//   }
//   return { matched, rest };
// }
// Lazy initialization to ensure env vars are loaded first
let openaiClient = null;
let openRouterClient = null;
let openaiClientKey = '';
let openRouterClientKey = '';
function extractTechSkills(text) {
    return technicalSkills.filter((item) => {
        const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = item === "Go"
            ? new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`) // case-sensitive
            : new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i"); // case-insensitive
        return regex.test(text);
    });
}
function extractSoftSkills(text) {
    return softSkills.filter((item) => {
        const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i");
        return regex.test(text);
    });
}
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-5.4-nano';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_PROVIDER = 'openai';
exports.DEFAULT_PROVIDER = DEFAULT_PROVIDER;
const ANTHROPIC_MAX_RETRIES = 4;
const ANTHROPIC_BASE_RETRY_DELAY_MS = 600;
const MIN_ROLE_BRIEF_LENGTH = 320;
const MAX_ROLE_BRIEF_LENGTH = 900;
const SOFT_SKILL_SIGNALS = [
    'accountability',
    'communication',
    'collaboration',
    'mindset',
    'mentality',
    'ownership',
    'reliability',
    'resilient',
    'supportive',
    'eager to learn',
    'adaptability',
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
const ATS_SOFT_SKILL_RULES = [
    { canonical: 'Reliability', patterns: ['reliability', 'reliable'] },
    { canonical: 'Resilient', patterns: ['resilient', 'resilience'] },
    { canonical: 'Supportive', patterns: ['supportive', 'support'] },
    { canonical: 'Communication', patterns: ['communication', 'communicate'] },
    { canonical: 'Collaboration skills', patterns: ['collaboration', 'collaborative'] },
    { canonical: 'Cross-functional team', patterns: ['cross-functional', 'cross functional'] },
    { canonical: 'Strong problem-solving skills', patterns: ['problem-solving', 'problem solving'] },
    { canonical: 'Eager to learn', patterns: ['eager to learn', 'lifelong learning'] },
    { canonical: 'Accountability', patterns: ['accountability', 'accountable'] },
];
// const HARD_SKILL_PRIORITY_SIGNALS = [
//   'ai',
//   'ruby',
//   'sre',
//   'cloud infrastructure',
//   'cloud technologies',
//   'automation',
//   'aws',
//   'kubernetes',
//   'docker',
//   'linux',
//   'infrastructure as code',
//   'iac',
//   'devops',
//   'ci/cd',
//   'terraform',
//   'monitoring',
//   'observability',
//   'bash scripting',
//   'troubleshoot',
//   'log analysis',
//   'server-side',
//   'abstraction',
//   'debugging',
//   'aws cloud',
//   'tooling',
//   'version control',
// ];
const HARD_SKILL_RULES = [
    { canonical: 'Bash scripting', patterns: ['bash scripting', 'bash'] },
    { canonical: 'Troubleshoot', patterns: ['troubleshoot', 'troubleshooting'] },
    { canonical: 'Log analysis', patterns: ['log analysis', 'logging'] },
    { canonical: 'Server-side', patterns: ['server-side', 'server side'] },
    { canonical: 'Abstraction', patterns: ['abstraction'] },
    { canonical: 'Debugging', patterns: ['debugging', 'debug'] },
    { canonical: 'AWS cloud', patterns: ['aws cloud', 'aws'] },
    { canonical: 'Tooling', patterns: ['tooling', 'tools'] },
    { canonical: 'Version control', patterns: ['version control', 'git'] },
];
const HARD_SKILL_DEFINITIONS = [
    { display: 'Python', category: 'language', aliases: ['python'] },
    { display: 'JavaScript', category: 'language', aliases: ['javascript', 'js'] },
    { display: 'TypeScript', category: 'language', aliases: ['typescript', 'ts'] },
    { display: 'Java', category: 'language', aliases: ['java'] },
    { display: 'Go', category: 'language', aliases: ['go', 'golang'] },
    { display: 'Rust', category: 'language', aliases: ['rust'] },
    { display: 'Ruby', category: 'language', aliases: ['ruby'] },
    { display: 'PHP', category: 'language', aliases: ['php'] },
    { display: 'C++', category: 'language', aliases: ['c++'] },
    { display: 'C#', category: 'language', aliases: ['c#'] },
    { display: 'Kotlin', category: 'language', aliases: ['kotlin'] },
    { display: 'Swift', category: 'language', aliases: ['swift'] },
    { display: 'Scala', category: 'language', aliases: ['scala'] },
    { display: 'SQL', category: 'language', aliases: ['sql'] },
    { display: 'HTML', category: 'language', aliases: ['html'] },
    { display: 'CSS', category: 'language', aliases: ['css'] },
    { display: 'Elixir', category: 'language', aliases: ['elixir'] },
    { display: 'Bash', category: 'language', aliases: ['bash', 'bash scripting'] },
    { display: 'React', category: 'framework', aliases: ['react', 'react.js', 'reactjs'] },
    { display: 'Next.js', category: 'framework', aliases: ['next', 'next.js', 'nextjs'] },
    { display: 'Node.js', category: 'framework', aliases: ['node', 'node.js', 'nodejs'] },
    { display: 'Vue', category: 'framework', aliases: ['vue', 'vue.js', 'vuejs'] },
    { display: 'Express', category: 'framework', aliases: ['express', 'express.js', 'expressjs'] },
    { display: 'Angular', category: 'framework', aliases: ['angular', 'angular.js', 'angularjs'] },
    { display: 'NestJS', category: 'framework', aliases: ['nest', 'nestjs', 'nest.js'] },
    { display: 'Nuxt', category: 'framework', aliases: ['nuxt', 'nuxt.js', 'nuxtjs'] },
    { display: 'Django', category: 'framework', aliases: ['django'] },
    { display: 'Flask', category: 'framework', aliases: ['flask'] },
    { display: 'FastAPI', category: 'framework', aliases: ['fastapi', 'fast api'] },
    { display: 'Fastify', category: 'framework', aliases: ['fastify'] },
    { display: 'Laravel', category: 'framework', aliases: ['laravel'] },
    { display: 'Ruby on Rails', category: 'framework', aliases: ['rails', 'ruby on rails'] },
    { display: 'Spring', category: 'framework', aliases: ['spring', 'spring boot', 'springboot'] },
    { display: 'TensorFlow', category: 'framework', aliases: ['tensorflow', 'tensor flow'] },
    { display: 'PyTorch', category: 'framework', aliases: ['pytorch', 'py torch', 'torch'] },
    { display: 'Keras', category: 'framework', aliases: ['keras'] },
    { display: 'Scikit-learn', category: 'framework', aliases: ['scikit-learn', 'sklearn'] },
    { display: 'Pandas', category: 'framework', aliases: ['pandas'] },
    { display: 'NumPy', category: 'framework', aliases: ['numpy', 'num py'] },
    { display: 'Redux', category: 'framework', aliases: ['redux'] },
    { display: 'React Router', category: 'framework', aliases: ['react router'] },
    { display: 'TailwindCSS', category: 'framework', aliases: ['tailwind', 'tailwindcss', 'tailwind css'] },
    { display: 'MUI', category: 'framework', aliases: ['mui', 'material ui', 'material-ui'] },
    { display: 'Sass', category: 'framework', aliases: ['sass'] },
    { display: 'SCSS', category: 'framework', aliases: ['scss'] },
    { display: 'Svelte', category: 'framework', aliases: ['svelte', 'svelte.js', 'sveltejs'] },
    { display: 'Ember', category: 'framework', aliases: ['ember', 'ember.js', 'emberjs'] },
    { display: 'jQuery', category: 'framework', aliases: ['jquery', 'jquery.js', 'jqueryjs'] },
    { display: 'Bootstrap', category: 'framework', aliases: ['bootstrap'] },
    { display: 'GraphQL', category: 'framework', aliases: ['graphql'] },
    { display: 'SWR', category: 'framework', aliases: ['swr'] },
    { display: 'Flutter', category: 'framework', aliases: ['flutter'] },
    { display: 'React Native', category: 'framework', aliases: ['react native', 'reactnative'] },
    { display: '.NET', category: 'framework', aliases: ['.net', 'dotnet', 'asp.net', 'aspnet'] },
    { display: 'Docker', category: 'other', aliases: ['docker'] },
    { display: 'Kubernetes', category: 'other', aliases: ['kubernetes', 'k8s', 'kube'] },
    { display: 'AWS', category: 'other', aliases: ['aws', 'aws cloud'] },
    { display: 'GCP', category: 'other', aliases: ['gcp', 'google cloud'] },
    { display: 'Azure', category: 'other', aliases: ['azure'] },
    { display: 'Git', category: 'other', aliases: ['git', 'version control'] },
    { display: 'Nginx', category: 'other', aliases: ['nginx'] },
    { display: 'Redis', category: 'other', aliases: ['redis'] },
    { display: 'Celery', category: 'other', aliases: ['celery'] },
    { display: 'PostgreSQL', category: 'other', aliases: ['postgres', 'postgresql', 'psql'] },
    { display: 'MongoDB', category: 'other', aliases: ['mongodb', 'mongo'] },
    { display: 'MySQL', category: 'other', aliases: ['mysql'] },
    { display: 'NoSQL', category: 'other', aliases: ['nosql'] },
    { display: 'OpenAPI', category: 'other', aliases: ['openapi'] },
    { display: 'RESTful API', category: 'other', aliases: ['restful api', 'rest api', 'rest'] },
    { display: 'JWT', category: 'other', aliases: ['jwt'] },
    { display: 'OAuth', category: 'other', aliases: ['oauth'] },
    { display: 'Jest', category: 'other', aliases: ['jest'] },
    { display: 'Mocha', category: 'other', aliases: ['mocha'] },
    { display: 'Chai', category: 'other', aliases: ['chai'] },
    { display: 'CI/CD', category: 'other', aliases: ['ci/cd', 'github actions', 'gitlab ci'] },
    { display: 'Vercel', category: 'other', aliases: ['vercel'] },
    { display: 'Netlify', category: 'other', aliases: ['netlify'] },
    { display: 'Figma', category: 'other', aliases: ['figma'] },
    { display: 'Sketch', category: 'other', aliases: ['sketch'] },
    { display: 'Unix/Linux', category: 'other', aliases: ['unix/linux', 'linux'] },
    { display: 'RDBMS', category: 'other', aliases: ['rdbms/sql', 'rdbms'] },
    { display: 'Webpack', category: 'other', aliases: ['webpack'] },
    { display: 'Vite', category: 'other', aliases: ['vite'] },
    { display: 'Gatsby', category: 'other', aliases: ['gatsby'] },
    { display: 'ESLint', category: 'other', aliases: ['eslint', 'es lint'] },
    { display: 'OpenAI API', category: 'other', aliases: ['openai api'] },
    { display: 'LLM', category: 'other', aliases: ['llm', 'llms'] },
    { display: 'Terraform', category: 'other', aliases: ['terraform'] },
    { display: 'Ansible', category: 'other', aliases: ['ansible'] },
    { display: 'Jenkins', category: 'other', aliases: ['jenkins'] },
    { display: 'Kafka', category: 'other', aliases: ['kafka'] },
    { display: 'RabbitMQ', category: 'other', aliases: ['rabbitmq'] },
    { display: 'Airflow', category: 'other', aliases: ['airflow'] },
    { display: 'dbt', category: 'other', aliases: ['dbt'] },
    { display: 'Snowflake', category: 'other', aliases: ['snowflake'] },
    { display: 'DynamoDB', category: 'other', aliases: ['dynamodb'] },
    { display: 'Cloudflare Workers', category: 'other', aliases: ['cloudflare workers', 'cloudflare'] },
    { display: 'AWS Lambda', category: 'other', aliases: ['aws lambda', 'lambda'] },
];
const HARD_SKILL_ALIAS_MAP = new Map();
for (const definition of HARD_SKILL_DEFINITIONS) {
    for (const alias of definition.aliases) {
        HARD_SKILL_ALIAS_MAP.set(alias, { display: definition.display, category: definition.category });
    }
}
function resolveAIProvider(model) {
    if (model === 'openai' || model?.startsWith('gpt-')) {
        return 'openai';
    }
    if (model === 'claude' || model?.startsWith('claude-')) {
        return 'claude';
    }
    if (model === 'openrouter' || model?.startsWith('openrouter/')) {
        return 'openrouter';
    }
    return DEFAULT_PROVIDER;
}
async function getOpenAIClient() {
    const apiKey = await (0, aiModelConfig_1.getProviderApiKey)('openai');
    if (!apiKey) {
        throw new Error('OpenAI API key is not set');
    }
    if (!openaiClient || openaiClientKey !== apiKey) {
        openaiClient = new openai_1.default({
            apiKey,
        });
        openaiClientKey = apiKey;
    }
    return openaiClient;
}
async function getOpenRouterClient() {
    const apiKey = await (0, aiModelConfig_1.getProviderApiKey)('openrouter');
    if (!apiKey) {
        throw new Error('OpenRouter API key is not set');
    }
    if (!openRouterClient || openRouterClientKey !== apiKey) {
        openRouterClient = new openai_1.default({
            apiKey,
            baseURL: 'https://openrouter.ai/api/v1',
        });
        openRouterClientKey = apiKey;
    }
    return openRouterClient;
}
async function createAnthropicMessage(prompt, maxTokens, temperature = 0) {
    const apiKey = await (0, aiModelConfig_1.getProviderApiKey)('claude');
    if (!apiKey) {
        throw new Error('Claude API key is not set');
    }
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const getRetryDelayMs = (attempt, retryAfterHeader) => {
        // Honor provider hint when present, otherwise use capped exponential backoff with jitter.
        const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
        if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
            return Math.min(Math.round(retryAfterSeconds * 1000), 15000);
        }
        const exponential = ANTHROPIC_BASE_RETRY_DELAY_MS * (2 ** (attempt - 1));
        const jitter = Math.round(Math.random() * 300);
        return Math.min(exponential + jitter, 15000);
    };
    const isRetriableStatus = (status) => status === 429 || status === 529 || (status >= 500 && status < 600);
    let lastError = null;
    for (let attempt = 1; attempt <= ANTHROPIC_MAX_RETRIES; attempt++) {
        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: CLAUDE_MODEL,
                    max_tokens: maxTokens,
                    temperature,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                const error = new Error(`Anthropic API error (${response.status}): ${errorText}`);
                if (!isRetriableStatus(response.status) || attempt === ANTHROPIC_MAX_RETRIES) {
                    throw error;
                }
                const delayMs = getRetryDelayMs(attempt, response.headers.get('retry-after'));
                console.warn(`Anthropic returned ${response.status} (attempt ${attempt}/${ANTHROPIC_MAX_RETRIES}); retrying in ${delayMs}ms.`);
                await sleep(delayMs);
                continue;
            }
            const data = await response.json();
            const textBlock = data.content?.find((block) => block.type === 'text' && typeof block.text === 'string');
            if (!textBlock?.text) {
                throw new Error('Unexpected response from Anthropic');
            }
            return textBlock.text;
        }
        catch (error) {
            const maybeError = error instanceof Error ? error : new Error(String(error));
            lastError = maybeError;
            const isLastAttempt = attempt === ANTHROPIC_MAX_RETRIES;
            const isNetworkFailure = maybeError.name === 'TypeError' || maybeError.message.toLowerCase().includes('fetch failed');
            if (!isNetworkFailure || isLastAttempt) {
                throw maybeError;
            }
            const delayMs = getRetryDelayMs(attempt, null);
            console.warn(`Anthropic request failed due to network issue (attempt ${attempt}/${ANTHROPIC_MAX_RETRIES}); retrying in ${delayMs}ms.`);
            await sleep(delayMs);
        }
    }
    throw lastError ?? new Error('Anthropic request failed');
}
async function createTextCompletion(prompt, provider = DEFAULT_PROVIDER, maxTokens = 4000, temperature = 0, responseFormat = 'json') {
    if (provider === 'openai') {
        const messages = [];
        if (responseFormat === 'json') {
            messages.push({
                role: 'system',
                content: 'You are a strict JSON generator. Return valid JSON only, with no markdown fences or extra text.',
            });
        }
        messages.push({
            role: 'user',
            content: prompt,
        });
        const response = await (await getOpenAIClient()).chat.completions.create({
            model: OPENAI_MODEL,
            max_completion_tokens: maxTokens,
            temperature,
            top_p: 1,
            ...(responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
            messages,
        });
        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('Unexpected response from OpenAI');
        }
        return content;
    }
    if (provider === 'openrouter') {
        const messages = [];
        if (responseFormat === 'json') {
            messages.push({
                role: 'system',
                content: 'You are a strict JSON generator. Return valid JSON only, with no markdown fences or extra text.',
            });
        }
        messages.push({
            role: 'user',
            content: prompt,
        });
        const response = await (await getOpenRouterClient()).chat.completions.create({
            model: OPENROUTER_MODEL,
            max_tokens: maxTokens,
            temperature,
            top_p: 1,
            ...(responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
            messages,
        }, {
            headers: {
                'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://localhost:3001',
                'X-Title': process.env.OPENROUTER_APP_NAME || 'Tailored Resume Builder',
            },
        });
        const content = response.choices[0]?.message?.content;
        if (!content) {
            throw new Error('Unexpected response from OpenRouter');
        }
        return content;
    }
    return createAnthropicMessage(prompt, maxTokens, temperature);
}
function normalizeSkillsList(skills) {
    if (!Array.isArray(skills))
        return [];
    const seen = new Set();
    const normalized = [];
    for (const raw of skills) {
        if (typeof raw !== 'string')
            continue;
        const skill = raw.trim();
        if (!skill)
            continue;
        const key = skill.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        normalized.push(skill);
    }
    return normalized;
}
function asString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function toStringList(value) {
    if (Array.isArray(value)) {
        return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
        return [value.trim()];
    }
    return [];
}
function normalizeJobAnalysisResponse(parsed, jobDescription) {
    // const inferredSoft = inferAtsSoftSkillsFromText(jobDescription);
    // const inferredHard = inferHardSkillsFromText(jobDescription);
    const required = normalizeSkillsList([
        ...toStringList(parsed.skills?.required),
        // ...inferredHard,
    ]);
    const preferred = normalizeSkillsList([
        ...toStringList(parsed.skills?.preferred),
    ]);
    const tools = normalizeSkillsList(toStringList(parsed.skills?.tools));
    const technologies = normalizeSkillsList(toStringList(parsed.skills?.technologies));
    const responsibilities = normalizeSkillsList([
        ...toStringList(parsed.responsibilities),
    ]);
    const domainKnowledge = normalizeSkillsList([
        ...toStringList(parsed.domainKnowledge),
    ]);
    const softSkills = prioritizeSoftSkills(normalizeSkillsList([
        ...toStringList(parsed.softSkills),
    ]));
    const keywordGroups = parsed.keywords && typeof parsed.keywords === 'object' && !Array.isArray(parsed.keywords)
        ? parsed.keywords
        : {};
    return {
        jobMeta: {
            title: asString(parsed.jobMeta?.title) || asString(parsed.jobMeta?.title),
            seniority: asString(parsed.jobMeta?.seniority),
            industry: asString(parsed.jobMeta?.industry),
            department: asString(parsed.jobMeta?.department),
        },
        skills: {
            required,
            preferred,
            tools,
            technologies,
        },
        responsibilities,
        domainKnowledge,
        softSkills,
        keywords: {
            actionVerbs: normalizeSkillsList(toStringList(keywordGroups.actionVerbs)),
            buzzwords: normalizeSkillsList(toStringList(keywordGroups.buzzwords)),
            mustInclude: normalizeSkillsList([
                ...toStringList(keywordGroups.mustInclude),
            ]),
        },
    };
}
function getJobAnalysisTitle(jobAnalysis) {
    return jobAnalysis?.jobMeta?.title?.trim() ?? '';
}
function getRequiredSkills(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.skills?.required);
}
function getPreferredSkills(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.skills?.preferred);
}
function getSkillTools(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.skills?.tools);
}
function getSkillTechnologies(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.skills?.technologies);
}
function getResponsibilities(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.responsibilities);
}
function getDomainKnowledge(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.domainKnowledge);
}
function getSoftSkills(jobAnalysis) {
    return normalizeSkillsList(jobAnalysis?.softSkills);
}
function getIndustryTerms(jobAnalysis) {
    return normalizeSkillsList([
        jobAnalysis?.jobMeta?.industry ?? '',
        jobAnalysis?.jobMeta?.department ?? '',
        ...getDomainKnowledge(jobAnalysis),
    ]);
}
function getKeywordChecklist(jobAnalysis) {
    return normalizeSkillsList([
        ...(jobAnalysis?.keywords?.actionVerbs ?? []),
        ...(jobAnalysis?.keywords?.buzzwords ?? []),
        ...(jobAnalysis?.keywords?.mustInclude ?? []),
        ...getSkillTools(jobAnalysis),
        ...getSkillTechnologies(jobAnalysis),
        ...getDomainKnowledge(jobAnalysis),
    ]);
}
function getHardSkillChecklist(jobAnalysis) {
    return normalizeSkillsList([
        ...getRequiredSkills(jobAnalysis),
        ...getPreferredSkills(jobAnalysis),
        ...getSkillTools(jobAnalysis),
        ...getSkillTechnologies(jobAnalysis),
        ...getKeywordChecklist(jobAnalysis),
        ...getIndustryTerms(jobAnalysis),
    ]);
}
function normalizeHardSkillAlias(skill) {
    return skill.trim().toLowerCase().replace(/\s+/g, ' ');
}
/** Job titles to exclude from hard skills - these are roles, not technical skills */
const JOB_TITLE_EXCLUSIONS = new Set([
    'full stack developer', 'fullstack developer', 'full-stack developer',
    'frontend developer', 'front-end developer', 'frotnend developer',
    'backend developer', 'back-end developer',
    'full stack engineer', 'frontend engineer', 'backend engineer',
    'software developer', 'software engineer',
]);
function capitalizeHardSkill(s) {
    if (!s || s.length === 0)
        return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function resolveHardSkill(skill) {
    const normalized = skill.trim().replace(/\s+/g, ' ');
    if (!normalized || normalized.length > 50 || /[.!?]/.test(normalized))
        return null;
    const lower = normalizeHardSkillAlias(normalized);
    // Exclude job titles (full stack developer, frontend developer, etc.)
    if (JOB_TITLE_EXCLUSIONS.has(lower))
        return null;
    // Exclude soft skills only (communication, collaboration, ownership, etc.)
    if (SOFT_SKILL_SIGNALS.some((signal) => lower.includes(signal)))
        return null;
    // If in alias map, return canonical form (already properly capitalized)
    const mapped = HARD_SKILL_ALIAS_MAP.get(lower);
    if (mapped)
        return mapped;
    // Pass through as hard skill: frameworks, tools, architectures, methodologies, tech names
    const techIndicators = [
        'api', 'rest', 'graphql', 'backend', 'frontend', 'fullstack', 'full-stack',
        'microservice', 'event-driven', 'distributed', 'database', 'sql', 'etl',
        'devops', 'ci/cd', 'docker', 'kubernetes', 'aws', 'cloud', 'architecture',
        'python', 'javascript', 'typescript', 'react', 'vue', 'angular', 'nuxt', 'svelte', 'ember', 'django', 'node', 'go', 'rust', 'rails', 'spring', 'laravel',
        'redis', 'postgres', 'mysql', 'kafka', 'airflow', 'dbt', 'snowflake',
        'terraform', 'testing', 'celery', 'flutter', 'lambda', 'cloudflare',
    ];
    if (techIndicators.some((term) => lower.includes(term))) {
        return { display: capitalizeHardSkill(normalized), category: 'other' };
    }
    // Single-word tech (Airflow, dbt, Kafka) - allow if looks like a tool/framework name
    if (/^[a-z0-9][a-z0-9+\-./]*$/.test(lower) && lower.length >= 2) {
        return { display: capitalizeHardSkill(normalized), category: 'other' };
    }
    return null;
}
function normalizeAllowedHardSkills(skills) {
    const seen = new Set();
    const result = [];
    for (const raw of skills) {
        const resolved = resolveHardSkill(raw);
        if (!resolved)
            continue;
        const display = resolved.display;
        const key = display.toLowerCase();
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(display);
    }
    return result;
}
function isTechnicalSkill(skill) {
    return resolveHardSkill(skill) !== null;
}
const MAX_SOFT_SKILL_LENGTH = 30;
/** Map long soft skill phrases to short key points */
const SOFT_SKILL_CONDENSE = [
    { patterns: ['excellent communication', 'communication and collaboration', 'communication skills', 'communicate'], key: 'Communication' },
    { patterns: ['collaboration', 'collaborative', 'collaborate'], key: 'Collaboration' },
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
    { patterns: ['analytics', 'applied ai'], key: 'Analytics & AI' },
    { patterns: ['scalable', 'polished'], key: 'Quality focus' },
];
function condenseSoftSkill(s) {
    const trimmed = s.trim();
    if (trimmed.length <= MAX_SOFT_SKILL_LENGTH) {
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    }
    const lower = trimmed.toLowerCase();
    for (const { patterns, key } of SOFT_SKILL_CONDENSE) {
        const matches = Array.isArray(patterns)
            ? patterns.some((p) => lower.includes(p.toLowerCase()))
            : patterns.test(lower);
        if (matches)
            return key;
    }
    const firstWord = trimmed.split(/\s+/)[0];
    return firstWord ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1) : trimmed;
}
function prioritizeSoftSkills(skills) {
    return [...skills].sort((a, b) => {
        const aLower = a.toLowerCase();
        const bLower = b.toLowerCase();
        const aScore = SOFT_SKILL_SIGNALS.reduce((count, signal) => count + (aLower.includes(signal) ? 1 : 0), 0);
        const bScore = SOFT_SKILL_SIGNALS.reduce((count, signal) => count + (bLower.includes(signal) ? 1 : 0), 0);
        if (bScore !== aScore)
            return bScore - aScore;
        return a.length - b.length;
    });
}
function inferAtsSoftSkillsFromText(text) {
    const lower = text.toLowerCase();
    return ATS_SOFT_SKILL_RULES
        .filter((rule) => rule.patterns.some((pattern) => lower.includes(pattern)))
        .map((rule) => rule.canonical);
}
function inferAtsSoftSkillsFromAnalysis(jobAnalysis) {
    if (!jobAnalysis)
        return [];
    const text = [
        ...getSoftSkills(jobAnalysis),
        ...getKeywordChecklist(jobAnalysis),
        ...getResponsibilities(jobAnalysis),
        ...getIndustryTerms(jobAnalysis),
    ].join(' | ');
    return inferAtsSoftSkillsFromText(text);
}
function inferHardSkillsFromText(text) {
    const lower = text.toLowerCase();
    return HARD_SKILL_RULES
        .filter((rule) => rule.patterns.some((pattern) => lower.includes(pattern)))
        .map((rule) => rule.canonical);
}
function prioritizeHardSkills(skills, _jobAnalysis) {
    // Keep normalized insertion order (no sorting).
    return normalizeAllowedHardSkills(skills);
}
function buildFallbackExperienceDescription(title, jobAnalysis) {
    const role = title.trim() || 'Engineer';
    const responsibility = getResponsibilities(jobAnalysis).find((item) => item.trim()) ||
        'delivering reliable solutions aligned with business goals';
    const keywords = getKeywordChecklist(jobAnalysis).slice(0, 2).join(', ');
    const suffix = keywords ? ` with focus on ${keywords}` : '';
    const text = `${role} focused on ${responsibility}${suffix}.`;
    return text.slice(0, MAX_ROLE_BRIEF_LENGTH).trim();
}
function buildFallbackAchievements(jobAnalysis) {
    const base = getResponsibilities(jobAnalysis)
        .filter((item) => item.trim())
        .slice(0, 3);
    if (base.length > 0) {
        return base.map((item) => item.replace(/\.$/, '').trim());
    }
    return [
        'Improved delivery consistency across critical projects.',
        'Enhanced service reliability and operational efficiency.',
    ];
}
function ensureMinLength(text, minLength, fillerParts) {
    let result = text.trim();
    for (const part of fillerParts) {
        if (result.length >= minLength)
            break;
        const clean = part.trim().replace(/\s+/g, ' ');
        if (!clean)
            continue;
        result = result ? `${result} ${clean}` : clean;
    }
    return result;
}
function ensureSummaryUsesExperienceYears(summary, profile) {
    const years = profile.totalYearsExperience;
    if (typeof years !== 'number' || !Number.isFinite(years) || years < 0) {
        return summary.trim();
    }
    const normalizedSummary = summary.trim().replace(/\s+/g, ' ');
    const yearsText = Number.isInteger(years) ? String(years) : years.toFixed(1);
    const prefixRole = profile.title?.trim() || 'Professional';
    const topSkills = (profile.skills ?? []).slice(0, 3);
    const skillsText = topSkills.length > 0 ? ` in ${topSkills.join(', ')}` : '';
    const leadSentence = `${prefixRole} with about ${yearsText} years of experience${skillsText}.`;
    // Keep the remaining summary content, but avoid duplicate years-style lead sentences.
    const remainder = normalizedSummary
        .replace(/^[^.]*\b\d+(?:\.\d+)?\s*\+?\s*years?\b[^.]*\.?\s*/i, '')
        .trim();
    return remainder ? `${leadSentence} ${remainder}` : leadSentence;
}
function limitSummaryNumericMentions(summary, maxMentions = 1) {
    const text = summary.trim().replace(/\s+/g, ' ');
    if (!text)
        return text;
    const numberPattern = /\b\d+(?:\.\d+)?\+?\b/g;
    let seen = 0;
    return text.replace(numberPattern, (match) => {
        seen += 1;
        return seen <= maxMentions ? match : '';
    }).replace(/\s+/g, ' ').replace(/\s([.,;:!?])/g, '$1').trim();
}
function toTitleCase(text) {
    return text
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}
function buildSimpleSeniorEngineerTitle(contentTitle, jobAnalysis, profile) {
    const source = (getJobAnalysisTitle(jobAnalysis) || contentTitle || profile?.title || '').trim();
    const cleaned = source
        .replace(/[^a-zA-Z0-9\s/+.-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const stopWords = new Set([
        'a',
        'an',
        'and',
        'for',
        'of',
        'the',
        'to',
        'with',
        'at',
        'in',
        'on',
    ]);
    const roleWords = new Set([
        'engineer',
        'engineering',
        'developer',
        'development',
        'architect',
        'specialist',
        'manager',
        'lead',
        'principal',
        'staff',
        'sr',
        'senior',
        'mid',
        'junior',
        'ii',
        'iii',
        'iv',
    ]);
    const domainTokens = cleaned
        .split(/\s+/)
        .map((token) => token.toLowerCase())
        .filter((token) => token && !stopWords.has(token) && !roleWords.has(token))
        .slice(0, 2);
    const domain = domainTokens.length > 0 ? toTitleCase(domainTokens.join(' ')) : 'Software';
    return `Senior ${domain} Engineer`;
}
function normalizeTailoredContent(content, jobAnalysis, profile) {
    const MAX_SOFT_SKILLS = 10;
    // Job analysis skills FIRST (required, preferred, keywords) - must appear in hard skills
    const jobHardRaw = getHardSkillChecklist(jobAnalysis);
    const combinedHardRaw = [
        ...jobHardRaw,
        ...(content.requiredSkills ?? []),
        ...(content.preferredSkills ?? []),
        ...(content.hardSkills ?? content.skills ?? []),
        ...(profile?.skills ?? []),
    ];
    const atsSoftPriority = inferAtsSoftSkillsFromAnalysis(jobAnalysis);
    const hardSkills = prioritizeHardSkills(normalizeAllowedHardSkills(combinedHardRaw), jobAnalysis);
    const softFromModel = normalizeSkillsList(content.softSkills);
    const softFromAnalysis = getSoftSkills(jobAnalysis);
    const softMerged = normalizeSkillsList([...atsSoftPriority, ...softFromModel, ...softFromAnalysis]);
    const softSkills = prioritizeSoftSkills(softMerged);
    const hardLimited = hardSkills; // No limit on hard skills
    const softSlots = MAX_SOFT_SKILLS;
    const condensed = softSkills.slice(0, softSlots).map(condenseSoftSkill);
    const softSeen = new Set();
    const softLimited = condensed.filter((s) => {
        const key = s.toLowerCase();
        if (softSeen.has(key))
            return false;
        softSeen.add(key);
        return true;
    });
    const trimIncompleteEnd = (s) => s.trim().replace(/,+\s*$/, '').replace(/\s+(and|or)\s*$/i, '').trim();
    const stripBoldTags = (s) => s.replace(/<\/?strong>/gi, '').replace(/<\/?b>/gi, '');
    const clampRoleBrief = (description) => {
        const cleanBase = stripBoldTags(description).trim().replace(/\s+/g, ' ');
        const clean = ensureMinLength(cleanBase, MIN_ROLE_BRIEF_LENGTH, [
            ...getResponsibilities(jobAnalysis).slice(0, 3),
            ...getKeywordChecklist(jobAnalysis).slice(0, 2).map((k) => `Focus on ${k}.`),
        ]);
        if (clean.length <= MAX_ROLE_BRIEF_LENGTH)
            return trimIncompleteEnd(clean);
        const truncated = clean.slice(0, MAX_ROLE_BRIEF_LENGTH);
        let result;
        const lastSentenceEnd = Math.max(truncated.lastIndexOf('. '), truncated.lastIndexOf('! '), truncated.lastIndexOf('? '));
        if (lastSentenceEnd >= MAX_ROLE_BRIEF_LENGTH - 80) {
            result = truncated.slice(0, lastSentenceEnd + 1).trim();
        }
        else {
            const lastComma = truncated.lastIndexOf(', ');
            if (lastComma >= MAX_ROLE_BRIEF_LENGTH - 50) {
                result = truncated.slice(0, lastComma).trim();
            }
            else {
                const lastSpace = truncated.trimEnd().lastIndexOf(' ');
                result = lastSpace > 0 && lastSpace >= MAX_ROLE_BRIEF_LENGTH - 40
                    ? truncated.slice(0, lastSpace).trim()
                    : truncated.trimEnd();
            }
        }
        return trimIncompleteEnd(result);
    };
    const normalizeSummary = (summary) => stripBoldTags(summary).trim().replace(/\s+/g, ' ');
    const normalizedExperience = (content.experience ?? []).map((item) => ({
        ...item,
        description: clampRoleBrief(item.description ?? buildFallbackExperienceDescription(item.title ?? '', jobAnalysis)),
        achievements: normalizeSkillsList(item.achievements).length > 0
            ? normalizeSkillsList(item.achievements).map(stripBoldTags)
            : buildFallbackAchievements(jobAnalysis),
    }));
    const extractedJobTitle = getJobAnalysisTitle(jobAnalysis);
    if (normalizedExperience.length > 0 && extractedJobTitle) {
        const latestExperience = normalizedExperience[0];
        const baseDescription = (latestExperience.description ?? '').trim();
        const sentences = baseDescription
            .split(/(?<=[.!?])\s+/)
            .map((s) => s.trim())
            .filter(Boolean);
        const jobTitleSentence = `Aligned recent delivery with ${extractedJobTitle} role requirements and expected outcomes.`;
        const alreadyHasTitle = sentences.some((sentence) => sentence.toLowerCase().includes(extractedJobTitle.toLowerCase()));
        if (!alreadyHasTitle) {
            const rewritten = sentences.length > 0
                ? [sentences[0], jobTitleSentence, ...sentences.slice(1)]
                : [jobTitleSentence];
            latestExperience.description = clampRoleBrief(rewritten.join(' '));
            normalizedExperience[0] = latestExperience;
        }
    }
    const strengthKeywordPool = normalizeSkillsList([
        ...getRequiredSkills(jobAnalysis),
        ...getPreferredSkills(jobAnalysis),
        ...getKeywordChecklist(jobAnalysis),
        ...getIndustryTerms(jobAnalysis),
    ]).filter((keyword) => keyword.length >= 3);
    const fallbackStrengths = getResponsibilities(jobAnalysis)
        .filter((item) => item.trim())
        .slice(0, 4)
        .map((item, index) => ({
        title: `Core Strength ${index + 1}`,
        description: item.trim().replace(/\.$/, '') + '.',
    }));
    const baseStrengths = (content.strengths ?? []).length > 0 ? (content.strengths ?? []) : fallbackStrengths;
    const normalizedStrengths = baseStrengths.map((strength, index) => {
        const title = (strength?.title ?? `Core Strength ${index + 1}`).trim() || `Core Strength ${index + 1}`;
        const rawDescription = (strength?.description ?? '').trim();
        const keywordA = strengthKeywordPool[index % Math.max(strengthKeywordPool.length, 1)] ?? '';
        const keywordB = strengthKeywordPool[(index + 7) % Math.max(strengthKeywordPool.length, 1)] ?? '';
        const keywordSnippet = [keywordA, keywordB]
            .filter(Boolean)
            .join(' and ');
        const normalizedDescription = rawDescription
            ? stripBoldTags(rawDescription).replace(/\s+/g, ' ').replace(/\.$/, '')
            : 'Demonstrated impact in complex engineering environments';
        const hasKeyword = strengthKeywordPool.some((kw) => normalizedDescription.toLowerCase().includes(kw.toLowerCase()));
        const suffix = hasKeyword || !keywordSnippet
            ? '.'
            : `. Focused on ${keywordSnippet}.`;
        return {
            title,
            description: `${normalizedDescription}${suffix}`,
        };
    });
    return {
        ...content,
        title: buildSimpleSeniorEngineerTitle(content.title, jobAnalysis, profile),
        summary: limitSummaryNumericMentions(normalizeSummary(profile ? ensureSummaryUsesExperienceYears(content.summary ?? '', profile) : (content.summary ?? '').trim()), 1),
        experience: normalizedExperience,
        hardSkills: hardLimited,
        softSkills: softLimited,
        strengths: normalizedStrengths,
        // Keep legacy field aligned with hard skills for older templates/components.
        skills: hardLimited,
    };
}
async function analyzeJobDescription(jobDescription, provider = DEFAULT_PROVIDER) {
    jobDesc = jobDescription;
    const prompt = await (0, promptService_1.renderPrompt)('analyze-job-description', {
        jobDescription,
    });
    const content = await createTextCompletion(prompt, provider, 7000, 0, 'json');
    try {
        const jsonText = (0, json_1.extractJSON)(content);
        const parsed = JSON.parse(jsonText);
        return normalizeJobAnalysisResponse(parsed, jobDescription);
    }
    catch (error) {
        console.error('Failed to parse model response:', error, content);
        throw new Error('Failed to parse job analysis response');
    }
}
async function tailorResume(profile, jobAnalysis, provider = DEFAULT_PROVIDER) {
    const keywords = getKeywordChecklist(jobAnalysis);
    const responsibilities = getResponsibilities(jobAnalysis);
    const keywordCount = keywords.length;
    const insertionTarget = keywordCount >= 2000 ? 2000 : keywordCount >= 1500 ? 1500 : keywordCount;
    const prompt = await (0, promptService_1.renderPrompt)('tailor-resume', {
        profileJson: JSON.stringify(profile, null, 2),
        jobAnalysisJson: JSON.stringify(jobAnalysis, null, 2),
        jobTitle: getJobAnalysisTitle(jobAnalysis),
        hardSkillsJSON: JSON.stringify([...jobAnalysis.skills.preferred, ...jobAnalysis.skills.required, ...jobAnalysis.skills.technologies, ...jobAnalysis.skills.tools]),
        softSkillsJSON: JSON.stringify([...jobAnalysis.softSkills]),
        keywordsJson: JSON.stringify([...jobAnalysis.keywords.actionVerbs, ...jobAnalysis.keywords.buzzwords, ...jobAnalysis.keywords.mustInclude]),
        keyResponsibilitiesJson: JSON.stringify([...jobAnalysis.responsibilities]),
        domainKnowledge: JSON.stringify([...jobAnalysis.domainKnowledge, jobAnalysis.jobMeta.industry])
    });
    const content = await createTextCompletion(prompt, provider, 11000, 0.2, 'json');
    try {
        const jsonText = (0, json_1.extractJSON)(content);
        const parsed = JSON.parse(jsonText);
        const finalResult = normalizeTailoredContent(parsed, jobAnalysis, profile);
        finalResult.unconfirmedHardSkills = [...finalResult.hardSkills];
        finalResult.hardSkills = [...extractTechSkills(jobDesc)];
        (0, array_1.moveCaseInsensitiveMatches)(technicalSkills, finalResult.unconfirmedHardSkills, finalResult.hardSkills);
        finalResult.unconfirmedHardSkills = [...(0, array_1.uniqueCaseInsensitive)(finalResult.unconfirmedHardSkills)];
        finalResult.hardSkills = [...(0, array_1.uniqueCaseInsensitive)(finalResult.hardSkills)];
        finalResult.unconfirmedSoftSkills = [...finalResult.softSkills];
        finalResult.softSkills = [...extractSoftSkills(jobDesc)];
        (0, array_1.moveCaseInsensitiveMatches)(softSkills, finalResult.unconfirmedSoftSkills, finalResult.softSkills);
        finalResult.unconfirmedSoftSkills = [...(0, array_1.uniqueCaseInsensitive)(finalResult.unconfirmedSoftSkills)];
        finalResult.softSkills = [...(0, array_1.uniqueCaseInsensitive)(finalResult.softSkills)];
        return finalResult;
    }
    catch {
        console.error('Failed to parse model response:', content);
        throw new Error('Failed to parse tailored resume response');
    }
}
/**
 * Generate a cover letter body when no job description is provided.
 * Returns only the body text (no salutation or sign-off).
 */
async function generateCoverLetter(profile, companyName, role, provider = DEFAULT_PROVIDER) {
    const prompt = await (0, promptService_1.renderPrompt)('generate-cover-letter', {
        profileJson: JSON.stringify(profile, null, 2),
        companyName,
        role,
    });
    const content = await createTextCompletion(prompt, provider, 1500, 0.7, 'text');
    return content.trim();
}
async function extractTemplateFromPDF(pdfText, templateName, provider = DEFAULT_PROVIDER) {
    const content = await createTextCompletion(await (0, promptService_1.renderPrompt)('extract-template-from-pdf', {
        pdfText,
        templateName,
    }), provider, 8000, 0, 'json');
    try {
        const jsonText = (0, json_1.extractJSON)(content);
        return JSON.parse(jsonText);
    }
    catch {
        console.error('Failed to parse model response:', content);
        throw new Error('Failed to parse template extraction response');
    }
}
async function extractProfileFromResume(resumeText, provider = DEFAULT_PROVIDER) {
    const content = await createTextCompletion(await (0, promptService_1.renderPrompt)('extract-profile-from-resume', {
        resumeText,
    }), provider, 4000, 0, 'json');
    try {
        const jsonText = (0, json_1.extractJSON)(content);
        return JSON.parse(jsonText);
    }
    catch {
        console.error('Failed to parse model response:', content);
        throw new Error('Failed to parse profile extraction response');
    }
}
//# sourceMappingURL=claude.js.map