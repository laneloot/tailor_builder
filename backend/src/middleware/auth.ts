import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const revokedTokens = new Set<string>();
const ADMIN_TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 hours

type AdminTokenPayload = {
  iat: number;
  exp: number;
  nonce: string;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function getTokenSecret(): string {
  const explicit = process.env.ADMIN_TOKEN_SECRET?.trim();
  if (explicit) return explicit;

  const fallback = process.env.ADMIN_PASSWORD?.trim();
  if (fallback) return fallback;

  // Keep behavior deterministic even when env is missing to avoid crashes.
  return 'resume-builder-dev-fallback-secret';
}

function signPayload(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', getTokenSecret())
    .update(encodedPayload)
    .digest('base64url');
}

function encodeToken(payload: AdminTokenPayload): string {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function decodeAndValidateToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [encodedPayload, providedSignature] = parts;
  if (!encodedPayload || !providedSignature) return false;
  if (revokedTokens.has(token)) return false;

  const expectedSignature = signPayload(encodedPayload);
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<AdminTokenPayload>;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || typeof payload.exp !== 'number') return false;
    if (payload.exp <= now) return false;
    return true;
  } catch {
    return false;
  }
}

export function generateToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminTokenPayload = {
    iat: now,
    exp: now + ADMIN_TOKEN_TTL_SECONDS,
    nonce: crypto.randomBytes(16).toString('hex'),
  };

  return encodeToken(payload);
}

export function validatePassword(password: string): boolean {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.warn('ADMIN_PASSWORD not set in environment variables');
    return false;
  }
  return password === adminPassword;
}

export function invalidateToken(token: string): void {
  revokedTokens.add(token);
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: No token provided' });
    return;
  }

  const token = authHeader.substring(7);
  
  if (!decodeAndValidateToken(token)) {
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
    return;
  }

  next();
}

export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    (req as any).isAuthenticated = decodeAndValidateToken(token);
  } else {
    (req as any).isAuthenticated = false;
  }
  
  next();
}
