"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = generateToken;
exports.validatePassword = validatePassword;
exports.invalidateToken = invalidateToken;
exports.authMiddleware = authMiddleware;
exports.optionalAuthMiddleware = optionalAuthMiddleware;
const crypto_1 = __importDefault(require("crypto"));
const revokedTokens = new Set();
const ADMIN_TOKEN_TTL_SECONDS = 60 * 60 * 12; // 12 hours
function base64UrlEncode(value) {
    return Buffer.from(value, 'utf8').toString('base64url');
}
function base64UrlDecode(value) {
    return Buffer.from(value, 'base64url').toString('utf8');
}
function getTokenSecret() {
    const explicit = process.env.ADMIN_TOKEN_SECRET?.trim();
    if (explicit)
        return explicit;
    const fallback = process.env.ADMIN_PASSWORD?.trim();
    if (fallback)
        return fallback;
    // Keep behavior deterministic even when env is missing to avoid crashes.
    return 'resume-builder-dev-fallback-secret';
}
function signPayload(encodedPayload) {
    return crypto_1.default
        .createHmac('sha256', getTokenSecret())
        .update(encodedPayload)
        .digest('base64url');
}
function encodeToken(payload) {
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signature = signPayload(encodedPayload);
    return `${encodedPayload}.${signature}`;
}
function decodeAndValidateToken(token) {
    const parts = token.split('.');
    if (parts.length !== 2)
        return false;
    const [encodedPayload, providedSignature] = parts;
    if (!encodedPayload || !providedSignature)
        return false;
    if (revokedTokens.has(token))
        return false;
    const expectedSignature = signPayload(encodedPayload);
    const providedBuffer = Buffer.from(providedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (providedBuffer.length !== expectedBuffer.length ||
        !crypto_1.default.timingSafeEqual(providedBuffer, expectedBuffer)) {
        return false;
    }
    try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        const now = Math.floor(Date.now() / 1000);
        if (!payload.exp || typeof payload.exp !== 'number')
            return false;
        if (payload.exp <= now)
            return false;
        return true;
    }
    catch {
        return false;
    }
}
function generateToken() {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iat: now,
        exp: now + ADMIN_TOKEN_TTL_SECONDS,
        nonce: crypto_1.default.randomBytes(16).toString('hex'),
    };
    return encodeToken(payload);
}
function validatePassword(password) {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
        console.warn('ADMIN_PASSWORD not set in environment variables');
        return false;
    }
    return password === adminPassword;
}
function invalidateToken(token) {
    revokedTokens.add(token);
}
function authMiddleware(req, res, next) {
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
function optionalAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        req.isAuthenticated = decodeAndValidateToken(token);
    }
    else {
        req.isAuthenticated = false;
    }
    next();
}
//# sourceMappingURL=auth.js.map