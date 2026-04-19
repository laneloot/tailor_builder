import fs from 'fs/promises';
import path from 'path';
import { Profile } from '../types/profile';
import { renderOutputPathTemplate, resolveStoredFilePath, sanitizePathSegment } from './outputStorage';
import { getOutputStorageSettings } from '../config/aiModelConfig';

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
  const { outputBaseDir, outputPathTemplate } = await getOutputStorageSettings();
  const profileSlug = sanitizePathSegment(profile.name) || 'unknown';
  const companyFolderName = sanitizePathSegment(companyName || 'unknown') || 'unknown';
  const roleSlug = sanitizePathSegment(role || 'resume') || 'resume';
  const relativeBase = renderOutputPathTemplate(outputPathTemplate, {
    date: getCurrentDateFolder(),
    profileName: profile.name || 'unknown',
    companyName: companyName || 'unknown',
    jobTitle: role || 'resume',
  });
  if (!outputBaseDir) {
    throw new Error('Output base directory is not configured.');
  }

  const absoluteDir = path.join(outputBaseDir, ...relativeBase.split('/'));
  const storagePathBase = relativeBase;

  return { relativeBase, absoluteDir, storagePathBase, profileSlug, companyFolderName, roleSlug };
}

export async function getGeneratedFilePath(relativePathValue: string): Promise<string | null> {
  const normalizedValue = relativePathValue.replace(/\\/g, '/').trim();
  if (!normalizedValue) {
    return null;
  }

  const { outputBaseDir } = await getOutputStorageSettings();
  const resolved = resolveStoredFilePath(outputBaseDir, normalizedValue);

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
