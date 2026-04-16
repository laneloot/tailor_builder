import OpenAI from 'openai';
import dotenv from 'dotenv';
import { Profile } from '../types/profile';
import { AIProvider, JobAnalysis, TailoredContent } from '../types/template';
import fs from "fs";
import path from "path";
import { renderPrompt } from './promptService';
import { getProviderApiKey } from './aiModelConfig';

// Ensure the repo .env file is loaded for this module even when it is imported
// before index.ts finishes bootstrapping, and prefer .env over inherited shell vars.
dotenv.config({ path: path.join(__dirname, '../../../.env'), override: true });

let jobDesc = '';

function moveMatches(array1: string[], array2: string[], array3: string[]) {
  const lowerSet = new Set(array1.map(item => item.toLowerCase()));

  for (let i = array2.length - 1; i >= 0; i--) {
    if (lowerSet.has(array2[i].toLowerCase())) {
      array3.push(array2[i]);   // add to array3
      array2.splice(i, 1);      // remove from array2
    }
  }
}

function removeDuplicatesIgnoreCase(arr: string[]) {
  const seen = new Set();
  
  return arr.filter(item => {
    const lower = item.toLowerCase();
    if (seen.has(lower)) {
      return false;
    }
    seen.add(lower);
    return true;
  });
}


const technicalSkills = fs
    .readFileSync(path.resolve(__dirname, '../../skill_data/tech_skills.txt'), 'utf-8')
    .split(/\r?\n/)
    .map((item: any) => item.trim())
    .filter(Boolean);

const softSkills = fs
    .readFileSync(path.resolve(__dirname, '../../skill_data/soft_skills.txt'), 'utf-8')
    .split(/\r?\n/)
    .map((item: any) => item.trim())
    .filter(Boolean);

function normalizeSkillKey(skill: string): string {
  return skill.trim().toLowerCase();
}

const TECH_SKILL_SET = new Set(technicalSkills.map(normalizeSkillKey));
const SOFT_SKILL_SET = new Set(softSkills.map(normalizeSkillKey));

export function addTechSkill(skill: string): boolean {
  const cleaned = skill.trim();
  if (!cleaned) return false;
  const key = normalizeSkillKey(cleaned);
  if (TECH_SKILL_SET.has(key)) return false;
  TECH_SKILL_SET.add(key);
  technicalSkills.push(cleaned);
  return true;
}

export function addSoftSkill(skill: string): boolean {
  const cleaned = skill.trim();
  if (!cleaned) return false;
  const key = normalizeSkillKey(cleaned);
  if (SOFT_SKILL_SET.has(key)) return false;
  SOFT_SKILL_SET.add(key);
  softSkills.push(cleaned);
  return true;
}

export function refreshSkillCaches(): void {
  const nextTech = fs
    .readFileSync(path.resolve(__dirname, '../../skill_data/tech_skills.txt'), 'utf-8')
    .split(/\r?\n/)
    .map((item: any) => item.trim())
    .filter(Boolean);

  const nextSoft = fs
    .readFileSync(path.resolve(__dirname, '../../skill_data/soft_skills.txt'), 'utf-8')
    .split(/\r?\n/)
    .map((item: any) => item.trim())
    .filter(Boolean);

  technicalSkills.length = 0;
  technicalSkills.push(...nextTech);
  TECH_SKILL_SET.clear();
  for (const item of nextTech) TECH_SKILL_SET.add(normalizeSkillKey(item));

  softSkills.length = 0;
  softSkills.push(...nextSoft);
  SOFT_SKILL_SET.clear();
  for (const item of nextSoft) SOFT_SKILL_SET.add(normalizeSkillKey(item));
}

function splitSkillsByOriginal(
  hardSkills: string[],
  original: string[]
): { matched: string[]; rest: string[] } {
  const originalLower = original.map((item) => item.toLowerCase());

  const matched: string[] = [];
  const rest: string[] = [];

  for (const skill of hardSkills) {
    const skillLower = skill.toLowerCase();

    const found = originalLower.some((orig) => orig.includes(skillLower));

    if (found) {
      matched.push(skill);
    } else {
      rest.push(skill);
    }
  }

  return { matched, rest };
}

// Lazy initialization to ensure env vars are loaded first
let openaiClient: OpenAI | null = null;
let openRouterClient: OpenAI | null = null;
let openaiClientKey = '';
let openRouterClientKey = '';

function extractTechSkills(text: string): string[] {
  return technicalSkills.filter((item: string) => {
    const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const regex =
      item === "Go"
        ? new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`) // case-sensitive
        : new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i"); // case-insensitive

    return regex.test(text);
  });
}

function extractSoftSkills(text: string): string[] {
  return softSkills.filter((item: string) => {
    const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, "i");
    return regex.test(text);
  });
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.1';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
const CLAUDE_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_PROVIDER: AIProvider = 'openai';
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
const ATS_SOFT_SKILL_RULES: Array<{ canonical: string; patterns: string[] }> = [
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
const HARD_SKILL_PRIORITY_SIGNALS = [
  'ai',
  'ruby',
  'sre',
  'cloud infrastructure',
  'cloud technologies',
  'automation',
  'aws',
  'kubernetes',
  'docker',
  'linux',
  'infrastructure as code',
  'iac',
  'devops',
  'ci/cd',
  'terraform',
  'monitoring',
  'observability',
  'bash scripting',
  'troubleshoot',
  'log analysis',
  'server-side',
  'abstraction',
  'debugging',
  'aws cloud',
  'tooling',
  'version control',
];
const HARD_SKILL_RULES: Array<{ canonical: string; patterns: string[] }> = [
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
type HardSkillCategory = 'language' | 'framework' | 'other';
type CompletionResponseFormat = 'json' | 'text';

type HardSkillDefinition = {
  display: string;
  category: HardSkillCategory;
  aliases: string[];
};

const HARD_SKILL_DEFINITIONS: HardSkillDefinition[] = [
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

const HARD_SKILL_ALIAS_MAP = new Map<string, { display: string; category: HardSkillCategory }>();
for (const definition of HARD_SKILL_DEFINITIONS) {
  for (const alias of definition.aliases) {
    HARD_SKILL_ALIAS_MAP.set(alias, { display: definition.display, category: definition.category });
  }
}

export function resolveAIProvider(model?: string): AIProvider {
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

async function getOpenAIClient(): Promise<OpenAI> {
  const apiKey = await getProviderApiKey('openai');
  if (!apiKey) {
    throw new Error('OpenAI API key is not set');
  }

  if (!openaiClient || openaiClientKey !== apiKey) {
    openaiClient = new OpenAI({
      apiKey,
    });
    openaiClientKey = apiKey;
  }
  return openaiClient;
}

async function getOpenRouterClient(): Promise<OpenAI> {
  const apiKey = await getProviderApiKey('openrouter');
  if (!apiKey) {
    throw new Error('OpenRouter API key is not set');
  }

  if (!openRouterClient || openRouterClientKey !== apiKey) {
    openRouterClient = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    openRouterClientKey = apiKey;
  }
  return openRouterClient;
}

async function createAnthropicMessage(prompt: string, maxTokens: number, temperature = 0): Promise<string> {
  const apiKey = await getProviderApiKey('claude');
  if (!apiKey) {
    throw new Error('Claude API key is not set');
  }

  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
  const getRetryDelayMs = (attempt: number, retryAfterHeader: string | null): number => {
    // Honor provider hint when present, otherwise use capped exponential backoff with jitter.
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.min(Math.round(retryAfterSeconds * 1000), 15000);
    }
    const exponential = ANTHROPIC_BASE_RETRY_DELAY_MS * (2 ** (attempt - 1));
    const jitter = Math.round(Math.random() * 300);
    return Math.min(exponential + jitter, 15000);
  };
  const isRetriableStatus = (status: number): boolean =>
    status === 429 || status === 529 || (status >= 500 && status < 600);

  let lastError: Error | null = null;

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
        console.warn(
          `Anthropic returned ${response.status} (attempt ${attempt}/${ANTHROPIC_MAX_RETRIES}); retrying in ${delayMs}ms.`
        );
        await sleep(delayMs);
        continue;
      }

      const data = await response.json() as { content?: Array<{ type: string; text?: string }> };
      const textBlock = data.content?.find((block) => block.type === 'text' && typeof block.text === 'string');

      if (!textBlock?.text) {
        throw new Error('Unexpected response from Anthropic');
      }

      return textBlock.text;
    } catch (error) {
      const maybeError = error instanceof Error ? error : new Error(String(error));
      lastError = maybeError;

      const isLastAttempt = attempt === ANTHROPIC_MAX_RETRIES;
      const isNetworkFailure =
        maybeError.name === 'TypeError' || maybeError.message.toLowerCase().includes('fetch failed');

      if (!isNetworkFailure || isLastAttempt) {
        throw maybeError;
      }

      const delayMs = getRetryDelayMs(attempt, null);
      console.warn(
        `Anthropic request failed due to network issue (attempt ${attempt}/${ANTHROPIC_MAX_RETRIES}); retrying in ${delayMs}ms.`
      );
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error('Anthropic request failed');
}

async function createTextCompletion(
  prompt: string,
  provider: AIProvider = DEFAULT_PROVIDER,
  maxTokens = 4000,
  temperature = 0,
  responseFormat: CompletionResponseFormat = 'json'
): Promise<string> {
  if (provider === 'openai') {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
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
      ...(responseFormat === 'json' ? { response_format: { type: 'json_object' as const } } : {}),
      messages,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Unexpected response from OpenAI');
    }

    return content;
  }

  if (provider === 'openrouter') {
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
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

    const response = await (await getOpenRouterClient()).chat.completions.create(
      {
        model: OPENROUTER_MODEL,
        max_tokens: maxTokens,
        temperature,
        top_p: 1,
        ...(responseFormat === 'json' ? { response_format: { type: 'json_object' as const } } : {}),
        messages,
      },
      {
        headers: {
          'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://localhost:3001',
          'X-Title': process.env.OPENROUTER_APP_NAME || 'Tailored Resume Builder',
        },
      }
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Unexpected response from OpenRouter');
    }

    return content;
  }

  return createAnthropicMessage(prompt, maxTokens, temperature);
}

function tryParseJsonCandidate(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    return null;
  }
}

function findFirstBalancedJson(text: string): string | null {
  const source = text.trim();
  if (!source) return null;

  for (let start = 0; start < source.length; start += 1) {
    const firstChar = source[start];
    if (firstChar !== '{' && firstChar !== '[') {
      continue;
    }

    const stack: string[] = [firstChar === '{' ? '}' : ']'];
    let inString = false;
    let escaping = false;

    for (let index = start + 1; index < source.length; index += 1) {
      const char = source[index];

      if (inString) {
        if (escaping) {
          escaping = false;
          continue;
        }
        if (char === '\\') {
          escaping = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        stack.push('}');
        continue;
      }

      if (char === '[') {
        stack.push(']');
        continue;
      }

      if (char === '}' || char === ']') {
        const expected = stack.pop();
        if (expected !== char) {
          break;
        }

        if (stack.length === 0) {
          const candidate = source.slice(start, index + 1);
          if (tryParseJsonCandidate(candidate)) {
            return candidate;
          }
          break;
        }
      }
    }
  }

  return null;
}

// Helper function to extract JSON from model response.
// Models may wrap JSON in markdown or add extra prose around it.
function extractJSON(text: string): string {
  const candidates: string[] = [];
  const direct = text.trim();
  if (direct) {
    candidates.push(direct);
  }

  const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (jsonBlockMatch?.[1]?.trim()) {
    candidates.unshift(jsonBlockMatch[1].trim());
  }

  for (const candidate of candidates) {
    const exact = tryParseJsonCandidate(candidate);
    if (exact) {
      return exact;
    }

    const balanced = findFirstBalancedJson(candidate);
    if (balanced) {
      return balanced;
    }
  }

  throw new Error('No valid JSON object found in model response');
}

function normalizeSkillsList(skills: string[] | undefined): string[] {
  if (!Array.isArray(skills)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of skills) {
    if (typeof raw !== 'string') continue;
    const skill = raw.trim();
    if (!skill) continue;
    const key = skill.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(skill);
  }

  return normalized;
}

function normalizeHardSkillAlias(skill: string): string {
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

function capitalizeHardSkill(s: string): string {
  if (!s || s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function resolveHardSkill(skill: string): { display: string; category: HardSkillCategory } | null {
  const normalized = skill.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.length > 50 || /[.!?]/.test(normalized)) return null;

  const lower = normalizeHardSkillAlias(normalized);
  // Exclude job titles (full stack developer, frontend developer, etc.)
  if (JOB_TITLE_EXCLUSIONS.has(lower)) return null;
  // Exclude soft skills only (communication, collaboration, ownership, etc.)
  if (SOFT_SKILL_SIGNALS.some((signal) => lower.includes(signal))) return null;

  // If in alias map, return canonical form (already properly capitalized)
  const mapped = HARD_SKILL_ALIAS_MAP.get(lower);
  if (mapped) return mapped;

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

function normalizeAllowedHardSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of skills) {
    const resolved = resolveHardSkill(raw);
    if (!resolved) continue;
    const display = resolved.display;
    const key = display.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(display);
  }

  return result;
}

function isTechnicalSkill(skill: string): boolean {
  return resolveHardSkill(skill) !== null;
}

const MAX_SOFT_SKILL_LENGTH = 30;

/** Map long soft skill phrases to short key points */
const SOFT_SKILL_CONDENSE: Array<{ patterns: RegExp | string[]; key: string }> = [
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

function condenseSoftSkill(s: string): string {
  const trimmed = s.trim();
  if (trimmed.length <= MAX_SOFT_SKILL_LENGTH) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  const lower = trimmed.toLowerCase();
  for (const { patterns, key } of SOFT_SKILL_CONDENSE) {
    const matches = Array.isArray(patterns)
      ? patterns.some((p) => lower.includes(p.toLowerCase()))
      : (patterns as RegExp).test(lower);
    if (matches) return key;
  }
  const firstWord = trimmed.split(/\s+/)[0];
  return firstWord ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1) : trimmed;
}

function prioritizeSoftSkills(skills: string[]): string[] {
  return [...skills].sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const aScore = SOFT_SKILL_SIGNALS.reduce((count, signal) =>
      count + (aLower.includes(signal) ? 1 : 0), 0);
    const bScore = SOFT_SKILL_SIGNALS.reduce((count, signal) =>
      count + (bLower.includes(signal) ? 1 : 0), 0);

    if (bScore !== aScore) return bScore - aScore;
    return a.length - b.length;
  });
}

function inferAtsSoftSkillsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  return ATS_SOFT_SKILL_RULES
    .filter((rule) => rule.patterns.some((pattern) => lower.includes(pattern)))
    .map((rule) => rule.canonical);
}

function inferAtsSoftSkillsFromAnalysis(jobAnalysis?: JobAnalysis): string[] {
  if (!jobAnalysis) return [];

  const text = [
    ...(jobAnalysis.softSkills ?? []),
    ...(jobAnalysis.keywords ?? []),
    ...(jobAnalysis.keyResponsibilities ?? []),
    ...(jobAnalysis.industryTerms ?? []),
    jobAnalysis.companyInfo ?? '',
  ].join(' | ');

  return inferAtsSoftSkillsFromText(text);
}

function inferHardSkillsFromText(text: string): string[] {
  const lower = text.toLowerCase();
  return HARD_SKILL_RULES
    .filter((rule) => rule.patterns.some((pattern) => lower.includes(pattern)))
    .map((rule) => rule.canonical);
}

function prioritizeHardSkills(skills: string[], _jobAnalysis?: JobAnalysis): string[] {
  // Keep normalized insertion order (no sorting).
  return normalizeAllowedHardSkills(skills);
}

function buildFallbackExperienceDescription(title: string, jobAnalysis?: JobAnalysis): string {
  const role = title.trim() || 'Engineer';
  const responsibility =
    jobAnalysis?.keyResponsibilities?.find((item) => item.trim()) ||
    'delivering reliable solutions aligned with business goals';
  const keywords = (jobAnalysis?.keywords ?? []).slice(0, 2).join(', ');
  const suffix = keywords ? ` with focus on ${keywords}` : '';
  const text = `${role} focused on ${responsibility}${suffix}.`;
  return text.slice(0, MAX_ROLE_BRIEF_LENGTH).trim();
}

function buildFallbackAchievements(jobAnalysis?: JobAnalysis): string[] {
  const base = (jobAnalysis?.keyResponsibilities ?? [])
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

function ensureMinLength(
  text: string,
  minLength: number,
  fillerParts: string[]
): string {
  let result = text.trim();
  for (const part of fillerParts) {
    if (result.length >= minLength) break;
    const clean = part.trim().replace(/\s+/g, ' ');
    if (!clean) continue;
    result = result ? `${result} ${clean}` : clean;
  }
  return result;
}

function ensureSummaryUsesExperienceYears(summary: string, profile: Profile): string {
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

function limitSummaryNumericMentions(summary: string, maxMentions = 1): string {
  const text = summary.trim().replace(/\s+/g, ' ');
  if (!text) return text;

  const numberPattern = /\b\d+(?:\.\d+)?\+?\b/g;
  let seen = 0;

  return text.replace(numberPattern, (match) => {
    seen += 1;
    return seen <= maxMentions ? match : '';
  }).replace(/\s+/g, ' ').replace(/\s([.,;:!?])/g, '$1').trim();
}

function toTitleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function buildSimpleSeniorEngineerTitle(
  contentTitle: string | undefined,
  jobAnalysis?: JobAnalysis,
  profile?: Profile
): string {
  const source = (jobAnalysis?.jobTitle || contentTitle || profile?.title || '').trim();
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

function normalizeTailoredContent(content: TailoredContent, jobAnalysis?: JobAnalysis, profile?: Profile): TailoredContent {
  const MAX_SOFT_SKILLS = 10;

  // Job analysis skills FIRST (required, preferred, keywords) - must appear in hard skills
  const jobHardRaw = [
    ...(jobAnalysis?.requiredSkills ?? []),
    ...(jobAnalysis?.preferredSkills ?? []),
    ...(jobAnalysis?.keywords ?? []),
    ...(jobAnalysis?.industryTerms ?? []),
  ];
  const combinedHardRaw = [
    ...jobHardRaw,
    ...(content.requiredSkills ?? []),
    ...(content.preferredSkills ?? []),
    ...(content.hardSkills ?? content.skills ?? []),
    ...(profile?.skills ?? []),
  ];

  const atsSoftPriority = inferAtsSoftSkillsFromAnalysis(jobAnalysis);
  const hardSkills = prioritizeHardSkills(
    normalizeAllowedHardSkills(combinedHardRaw),
    jobAnalysis
  );
  const softFromModel = normalizeSkillsList(content.softSkills);
  const softFromAnalysis = normalizeSkillsList(jobAnalysis?.softSkills);
  const softMerged = normalizeSkillsList([...atsSoftPriority, ...softFromModel, ...softFromAnalysis]);
  const softSkills = prioritizeSoftSkills(softMerged);

  const hardLimited = hardSkills; // No limit on hard skills
  const softSlots = MAX_SOFT_SKILLS;
  const condensed = softSkills.slice(0, softSlots).map(condenseSoftSkill);
  const softSeen = new Set<string>();
  const softLimited = condensed.filter((s) => {
    const key = s.toLowerCase();
    if (softSeen.has(key)) return false;
    softSeen.add(key);
    return true;
  });

  const trimIncompleteEnd = (s: string): string =>
    s.trim().replace(/,+\s*$/, '').replace(/\s+(and|or)\s*$/i, '').trim();
  const stripBoldTags = (s: string): string =>
    s.replace(/<\/?strong>/gi, '').replace(/<\/?b>/gi, '');

  const clampRoleBrief = (description: string): string => {
    const cleanBase = stripBoldTags(description).trim().replace(/\s+/g, ' ');
    const clean = ensureMinLength(
      cleanBase,
      MIN_ROLE_BRIEF_LENGTH,
      [
        ...(jobAnalysis?.keyResponsibilities ?? []).slice(0, 3),
        ...(jobAnalysis?.keywords ?? []).slice(0, 2).map((k) => `Focus on ${k}.`),
      ]
    );
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
  };

  const normalizeSummary = (summary: string): string =>
    stripBoldTags(summary).trim().replace(/\s+/g, ' ');

  const normalizedExperience = (content.experience ?? []).map((item) => ({
    ...item,
    description: clampRoleBrief(item.description ?? buildFallbackExperienceDescription(item.title ?? '', jobAnalysis)),
    achievements: normalizeSkillsList(item.achievements).length > 0
      ? normalizeSkillsList(item.achievements).map(stripBoldTags)
      : buildFallbackAchievements(jobAnalysis),
  }));

  const extractedJobTitle = (jobAnalysis?.jobTitle ?? '').trim();
  if (normalizedExperience.length > 0 && extractedJobTitle) {
    const latestExperience = normalizedExperience[0];
    const baseDescription = (latestExperience.description ?? '').trim();
    const sentences = baseDescription
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const jobTitleSentence =
      `Aligned recent delivery with ${extractedJobTitle} role requirements and expected outcomes.`;
    const alreadyHasTitle = sentences.some((sentence) =>
      sentence.toLowerCase().includes(extractedJobTitle.toLowerCase())
    );
    if (!alreadyHasTitle) {
      const rewritten = sentences.length > 0
        ? [sentences[0], jobTitleSentence, ...sentences.slice(1)]
        : [jobTitleSentence];
      latestExperience.description = clampRoleBrief(rewritten.join(' '));
      normalizedExperience[0] = latestExperience;
    }
  }

  const strengthKeywordPool = normalizeSkillsList([
    ...(jobAnalysis?.requiredSkills ?? []),
    ...(jobAnalysis?.preferredSkills ?? []),
    ...(jobAnalysis?.keywords ?? []),
    ...(jobAnalysis?.industryTerms ?? []),
  ]).filter((keyword) => keyword.length >= 3);

  const fallbackStrengths = (jobAnalysis?.keyResponsibilities ?? [])
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

    const hasKeyword = strengthKeywordPool.some((kw) =>
      normalizedDescription.toLowerCase().includes(kw.toLowerCase())
    );
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
    summary: limitSummaryNumericMentions(
      normalizeSummary(
        profile ? ensureSummaryUsesExperienceYears(content.summary ?? '', profile) : (content.summary ?? '').trim()
      ),
      1
    ),
    experience: normalizedExperience,
    hardSkills: hardLimited,
    softSkills: softLimited,
    strengths: normalizedStrengths,
    // Keep legacy field aligned with hard skills for older templates/components.
    skills: hardLimited,
  };
}

export async function analyzeJobDescription(jobDescription: string, provider: AIProvider = DEFAULT_PROVIDER): Promise<JobAnalysis> {
  const keywordTarget = jobDescription.trim().length > 3000 ? 2000 : 1500;
  jobDesc = jobDescription;
  const prompt = await renderPrompt('analyze-job-description', {
    jobDescription,
  });
  const content = await createTextCompletion(prompt, provider, 7000, 0, 'json');

  try {
    const jsonText = extractJSON(content);
    const parsed = JSON.parse(jsonText) as JobAnalysis;
    const inferredSoft = inferAtsSoftSkillsFromText(jobDescription);
    const inferredHard = inferHardSkillsFromText(jobDescription);
    return {
      ...parsed,
      requiredSkills: normalizeSkillsList([...(parsed.requiredSkills ?? []), ...inferredHard]),
      keywords: normalizeSkillsList([...(parsed.keywords ?? []), ...inferredHard]),
      softSkills: prioritizeSoftSkills(
        normalizeSkillsList([...(parsed.softSkills ?? []), ...inferredSoft])
      ),
    };
  } catch {
    console.error('Failed to parse model response:', content);
    throw new Error('Failed to parse job analysis response');
  }
}

export async function tailorResume(
  profile: Profile,
  jobAnalysis: JobAnalysis,
  provider: AIProvider = DEFAULT_PROVIDER
): Promise<TailoredContent> {
  const keywordCount = jobAnalysis.keywords?.length ?? 0;
  const insertionTarget = keywordCount >= 2000 ? 2000 : keywordCount >= 1500 ? 1500 : keywordCount;
  const prompt = await renderPrompt('tailor-resume', {
    profileJson: JSON.stringify(profile, null, 2),
    jobAnalysisJson: JSON.stringify(jobAnalysis, null, 2),
    jobTitle: jobAnalysis.jobTitle ?? '',
    requiredSkillsJson: JSON.stringify(jobAnalysis.requiredSkills ?? []),
    preferredSkillsJson: JSON.stringify(jobAnalysis.preferredSkills ?? []),
    industryTermsJson: JSON.stringify(jobAnalysis.industryTerms ?? []),
    keywordsJson: JSON.stringify(jobAnalysis.keywords ?? []),
    keyResponsibilitiesJson: JSON.stringify(jobAnalysis.keyResponsibilities ?? []),
    softSkillsJson: JSON.stringify(jobAnalysis.softSkills ?? []),
  });
  const content = await createTextCompletion(prompt, provider, 11000, 0.2, 'json');

  try {
    const jsonText = extractJSON(content);
    const parsed = JSON.parse(jsonText) as TailoredContent;
    const finalResult = normalizeTailoredContent(parsed, jobAnalysis, profile);

    finalResult.unconfirmedHardSkills = [...finalResult.hardSkills]
    finalResult.hardSkills = [...extractTechSkills(jobDesc)]
    moveMatches(technicalSkills, finalResult.unconfirmedHardSkills, finalResult.hardSkills);

    finalResult.unconfirmedHardSkills = [...removeDuplicatesIgnoreCase(finalResult.unconfirmedHardSkills)]
    finalResult.hardSkills = [...removeDuplicatesIgnoreCase(finalResult.hardSkills)]

    finalResult.unconfirmedSoftSkills = [...finalResult.softSkills]
    finalResult.softSkills = [...extractSoftSkills(jobDesc)]
    moveMatches(softSkills, finalResult.unconfirmedSoftSkills, finalResult.softSkills);

    finalResult.unconfirmedSoftSkills = [...removeDuplicatesIgnoreCase(finalResult.unconfirmedSoftSkills)]
    finalResult.softSkills = [...removeDuplicatesIgnoreCase(finalResult.softSkills)]
    

    return finalResult;
  } catch {
    console.error('Failed to parse model response:', content);
    throw new Error('Failed to parse tailored resume response');
  }
}

/**
 * Generate a cover letter body when no job description is provided.
 * Returns only the body text (no salutation or sign-off).
 */
export async function generateCoverLetter(
  profile: Profile,
  companyName: string,
  role: string,
  provider: AIProvider = DEFAULT_PROVIDER
): Promise<string> {
  const prompt = await renderPrompt('generate-cover-letter', {
    profileJson: JSON.stringify(profile, null, 2),
    companyName,
    role,
  });
  const content = await createTextCompletion(prompt, provider, 1500, 0.7, 'text');
  return content.trim();
}

export async function extractTemplateFromPDF(
  pdfText: string,
  templateName: string,
  provider: AIProvider = DEFAULT_PROVIDER
): Promise<{ html: string; css: string; sections: string[] }> {
  const content = await createTextCompletion(
    await renderPrompt('extract-template-from-pdf', {
      pdfText,
      templateName,
    }),
    provider,
    8000,
    0,
    'json'
  );

  try {
    const jsonText = extractJSON(content);
    return JSON.parse(jsonText);
  } catch {
    console.error('Failed to parse model response:', content);
    throw new Error('Failed to parse template extraction response');
  }
}

export async function extractProfileFromResume(
  resumeText: string,
  provider: AIProvider = DEFAULT_PROVIDER
): Promise<Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>> {
  const content = await createTextCompletion(
    await renderPrompt('extract-profile-from-resume', {
      resumeText,
    }),
    provider,
    4000,
    0,
    'json'
  );

  try {
    const jsonText = extractJSON(content);
    return JSON.parse(jsonText);
  } catch {
    console.error('Failed to parse model response:', content);
    throw new Error('Failed to parse profile extraction response');
  }
}

export { DEFAULT_PROVIDER };
