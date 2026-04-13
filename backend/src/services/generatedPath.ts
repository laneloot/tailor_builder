import fs from 'fs/promises';
import path from 'path';
import { Profile } from '../types/profile';
import { renderOutputPathTemplate, resolveStoredFilePath, sanitizePathSegment } from '../config/storage';
import { getOutputStorageSettings } from './aiModelConfig';

const PROFILES_DIR = path.join(__dirname, '../../data/profiles');
const MULTI_FOLDER_PREFIX = '@profile';

function getCurrentDateFolder(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface GeneratedPathInfo {
  relativeBase: string;
  absoluteDir: string;
  storagePathBase: string;
  profileSlug: string;
  companyFolderName: string;
  roleSlug: string;
}

export async function getGeneratedOutputPath(
  profile: Profile,
  companyName: string,
  role: string
): Promise<GeneratedPathInfo> {
  const { outputStorageMode, outputBaseDir, outputPathTemplate } = await getOutputStorageSettings();
  const profileSlug = sanitizePathSegment(profile.name) || 'unknown';
  const companyFolderName = sanitizePathSegment(companyName || 'unknown') || 'unknown';
  const roleSlug = sanitizePathSegment(role || 'resume') || 'resume';
  const relativeBase = renderOutputPathTemplate(outputPathTemplate, {
    date: getCurrentDateFolder(),
    profileName: profile.name || 'unknown',
    companyName: companyName || 'unknown',
    jobTitle: role || 'resume',
  });
  const baseDir = outputStorageMode === 'multi'
    ? profile.outputDirectory?.trim()
    : outputBaseDir;

  if (!baseDir) {
    throw new Error(
      outputStorageMode === 'multi'
        ? `Profile "${profile.name}" does not have an output directory configured.`
        : 'Output base directory is not configured.'
    );
  }

  const absoluteDir = path.join(baseDir, ...relativeBase.split('/'));
  const storagePathBase = outputStorageMode === 'multi'
    ? `${MULTI_FOLDER_PREFIX}/${profile.id}/${relativeBase}`
    : relativeBase;

  return { relativeBase, absoluteDir, storagePathBase, profileSlug, companyFolderName, roleSlug };
}

export async function getGeneratedFilePath(relativePathValue: string): Promise<string | null> {
  const normalizedValue = relativePathValue.replace(/\\/g, '/').trim();
  if (!normalizedValue) {
    return null;
  }

  let resolved: string | null = null;

  if (normalizedValue.startsWith(`${MULTI_FOLDER_PREFIX}/`)) {
    const [, profileId, ...restSegments] = normalizedValue.split('/').filter(Boolean);
    if (!profileId || restSegments.length === 0) {
      return null;
    }

    try {
      const profileContent = await fs.readFile(path.join(PROFILES_DIR, `${profileId}.json`), 'utf-8');
      const profile = JSON.parse(profileContent) as Profile;
      const profileBaseDir = profile.outputDirectory?.trim();
      if (!profileBaseDir) {
        return null;
      }
      resolved = resolveStoredFilePath(profileBaseDir, restSegments.join('/'));
    } catch {
      return null;
    }
  } else {
    const { outputBaseDir } = await getOutputStorageSettings();
    resolved = resolveStoredFilePath(outputBaseDir, normalizedValue);
  }

  if (!resolved) {
    return null;
  }

  try {
    await fs.access(resolved);
    return resolved;
  } catch {
    return null;
  }
}
