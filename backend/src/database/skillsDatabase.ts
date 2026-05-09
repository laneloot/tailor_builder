import fs from 'fs';
import path from 'path';

export type SkillType = 'hard' | 'soft';

export type SkillMutationResult = {
  skill: string;
  type: SkillType;
};

export type HardSkillRecord = {
  skill: string;
  priority: number;
};

export type AddSkillResult = SkillMutationResult & {
  added: boolean;
};

export type UpdateSkillResult = SkillMutationResult & {
  updated: boolean;
};

export type DeleteSkillResult = SkillMutationResult & {
  deleted: boolean;
};

type SkillsStore = {
  hard: HardSkillRecord[];
  soft: string[];
};

export class SkillDatabaseError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'SkillDatabaseError';
  }
}

const DATA_DIR = process.env.TAILOR_DATA_DIR
  ? path.resolve(process.env.TAILOR_DATA_DIR)
  : path.join(__dirname, '../../data');
const SKILLS_DIR = path.join(DATA_DIR, 'skills');
const SKILLS_FILE = path.join(SKILLS_DIR, 'skills.json');

function cleanSkill(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSkillValue(value: string): string {
  return value.trim().toLowerCase();
}

function inferHardSkillPriority(skill: string): number {
  const normalized = normalizeSkillValue(skill);

  const languagePatterns = [
    'python', 'javascript', 'typescript', 'java', 'golang', 'go', 'rust', 'ruby', 'php', 'c#', 'c++', 'kotlin',
    'swift', 'scala', 'sql', 'bash', 'elixir', 'dart', 'perl', 'r language', 'matlab', 'lua', 'groovy', 'shell',
    'powershell', 'objective-c', 'html', 'css',
  ];
  if (languagePatterns.some((pattern) => normalized === pattern || normalized.startsWith(`${pattern} `))) {
    return 1;
  }

  const frameworkPatterns = [
    'react', 'next', 'vue', 'angular', 'django', 'flask', 'fastapi', 'spring', 'nestjs', 'express', 'laravel',
    'symfony', 'rails', 'redux', 'tailwind', 'bootstrap', 'material ui', 'mui', 'chakra', 'styled-components',
    'emotion', 'jquery', 'sass', 'scss', 'webpack', 'vite', 'babel', 'eslint', 'prettier', 'numpy', 'pandas',
    'pytorch', 'tensorflow', 'keras', 'scikit', 'langchain', 'llamaindex', 'playwright', 'cypress', 'jest',
    'pytest', 'selenium', 'mocha', 'chai', 'junit', 'testng',
  ];
  if (frameworkPatterns.some((pattern) => normalized.includes(pattern))) {
    return 2;
  }

  const databasePatterns = [
    'postgres', 'postgresql', 'mysql', 'sql server', 'oracle', 'mongodb', 'dynamodb', 'cassandra', 'couchdb',
    'redis', 'memcached', 'firestore', 'elasticsearch', 'solr', 'influxdb', 'timescaledb', 'neo4j', 'database',
    'databases', 'query', 'index', 'shard', 'replication', 'schema', 'orm', 'sqlalchemy', 'prisma', 'typeorm',
    'sequelize', 'mongoose', 'activerecord', 'etl', 'warehouse', 'data lake',
  ];
  if (databasePatterns.some((pattern) => normalized.includes(pattern))) {
    return 3;
  }

  const cloudPatterns = [
    'aws', 'azure', 'gcp', 'google cloud', 'cloud', 'docker', 'kubernetes', 'helm', 'terraform', 'ansible',
    'puppet', 'chef', 'openshift', 'ec2', 'ecs', 'eks', 'fargate', 's3', 'rds', 'cloudfront', 'lambda', 'vpc',
    'iam', 'route 53', 'api gateway', 'cloudwatch', 'grafana', 'prometheus', 'datadog', 'new relic', 'elk',
    'istio', 'linkerd', 'argocd', 'flux', 'ci/cd', 'deployment', 'infrastructure', 'iac', 'network', 'load balanc',
    'autoscaling', 'auto scaling',
  ];
  if (cloudPatterns.some((pattern) => normalized.includes(pattern))) {
    return 4;
  }

  return 5;
}

function normalizeHardSkillList(input: unknown): HardSkillRecord[] {
  const source = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const skills: HardSkillRecord[] = [];

  for (const item of source) {
    const skill = typeof item === 'string'
      ? cleanSkill(item)
      : cleanSkill(typeof item === 'object' && item !== null ? (item as { skill?: unknown }).skill : '');
    if (!skill) continue;

    const key = normalizeSkillValue(skill);
    if (seen.has(key)) continue;
    seen.add(key);

    const parsedPriority = typeof item === 'object' && item !== null
      ? (item as { priority?: unknown }).priority
      : undefined;
    const priority = typeof parsedPriority === 'number' && Number.isFinite(parsedPriority)
      ? parsedPriority
      : inferHardSkillPriority(skill);

    skills.push({
      skill,
      priority: Math.max(1, Math.min(5, Math.trunc(priority))),
    });
  }

  return skills.sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }

    return left.skill.localeCompare(right.skill, undefined, { sensitivity: 'base' });
  });
}

function normalizeSoftSkillList(input: unknown): string[] {
  const source = Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const skills: string[] = [];

  for (const item of source) {
    const skill = cleanSkill(item);
    if (!skill) continue;

    const key = normalizeSkillValue(skill);
    if (seen.has(key)) continue;

    seen.add(key);
    skills.push(skill);
  }

  return skills.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
}

function normalizeStore(input: unknown): SkillsStore {
  const source = typeof input === 'object' && input !== null
    ? input as Partial<Record<SkillType, unknown>>
    : {};

  return {
    hard: normalizeHardSkillList(source.hard),
    soft: normalizeSoftSkillList(source.soft),
  };
}

function ensureSkillsFile(): void {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });

  if (!fs.existsSync(SKILLS_FILE)) {
    writeStore({ hard: [], soft: [] });
  }
}

function readStore(): SkillsStore {
  ensureSkillsFile();

  try {
    const parsed = JSON.parse(fs.readFileSync(SKILLS_FILE, 'utf8')) as unknown;
    return normalizeStore(parsed);
  } catch {
    return { hard: [], soft: [] };
  }
}

function writeStore(store: SkillsStore): void {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
  fs.writeFileSync(SKILLS_FILE, `${JSON.stringify(normalizeStore(store), null, 2)}\n`, 'utf8');
}

function findSoftSkillIndex(skills: string[], skill: string): number {
  const normalized = normalizeSkillValue(skill);
  return skills.findIndex((item) => normalizeSkillValue(item) === normalized);
}

function findHardSkillIndex(skills: HardSkillRecord[], skill: string): number {
  const normalized = normalizeSkillValue(skill);
  return skills.findIndex((item) => normalizeSkillValue(item.skill) === normalized);
}

export function ensureSkillsDatabase(): void {
  ensureSkillsFile();
}

export function isSkillType(value: unknown): value is SkillType {
  return value === 'hard' || value === 'soft';
}

export function readSkills(type: SkillType): string[] {
  const store = readStore();
  return type === 'hard'
    ? store.hard.map((item) => item.skill)
    : store.soft;
}

export function readHardSkillRecords(): HardSkillRecord[] {
  return readStore().hard.map((item) => ({ ...item }));
}

export function readHardSkillPriorityMap(): Map<string, number> {
  return new Map(
    readStore().hard.map((item) => [normalizeSkillValue(item.skill), item.priority] as const)
  );
}

export function addSkill(type: SkillType, skill: string): AddSkillResult {
  const cleaned = cleanSkill(skill);
  if (!cleaned) {
    throw new SkillDatabaseError('Skill type and value are required', 400);
  }

  const store = readStore();
  const existingIndex = type === 'hard'
    ? findHardSkillIndex(store.hard, cleaned)
    : findSoftSkillIndex(store.soft, cleaned);
  if (existingIndex !== -1) {
    return { added: false, skill: cleaned, type };
  }

  if (type === 'hard') {
    store.hard.push({ skill: cleaned, priority: inferHardSkillPriority(cleaned) });
  } else {
    store.soft.push(cleaned);
  }
  writeStore(store);

  return { added: true, skill: cleaned, type };
}

export function updateSkill(type: SkillType, original: string, skill: string): UpdateSkillResult {
  const cleanedOriginal = cleanSkill(original);
  const cleaned = cleanSkill(skill);
  if (!cleanedOriginal || !cleaned) {
    throw new SkillDatabaseError('Skill type, original value, and new value are required', 400);
  }

  const store = readStore();
  const originalIndex = type === 'hard'
    ? findHardSkillIndex(store.hard, cleanedOriginal)
    : findSoftSkillIndex(store.soft, cleanedOriginal);
  if (originalIndex === -1) {
    throw new SkillDatabaseError('Skill not found', 404);
  }

  const duplicateIndex = type === 'hard'
    ? findHardSkillIndex(store.hard, cleaned)
    : findSoftSkillIndex(store.soft, cleaned);
  if (duplicateIndex !== -1 && duplicateIndex !== originalIndex) {
    throw new SkillDatabaseError('Skill already exists', 409);
  }

  if (type === 'hard') {
    store.hard[originalIndex] = {
      skill: cleaned,
      priority: inferHardSkillPriority(cleaned),
    };
  } else {
    store.soft[originalIndex] = cleaned;
  }
  writeStore(store);

  return { updated: true, skill: cleaned, type };
}

export function deleteSkill(type: SkillType, skill: string): DeleteSkillResult {
  const cleaned = cleanSkill(skill);
  if (!cleaned) {
    throw new SkillDatabaseError('Skill type and value are required', 400);
  }

  const store = readStore();
  const index = type === 'hard'
    ? findHardSkillIndex(store.hard, cleaned)
    : findSoftSkillIndex(store.soft, cleaned);
  if (index === -1) {
    throw new SkillDatabaseError('Skill not found', 404);
  }

  if (type === 'hard') {
    store.hard.splice(index, 1);
  } else {
    store.soft.splice(index, 1);
  }
  writeStore(store);

  return { deleted: true, skill: cleaned, type };
}
