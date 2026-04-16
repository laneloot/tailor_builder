"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const multer_1 = __importDefault(require("multer"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const auth_1 = require("../middleware/auth");
const claude_1 = require("../services/claude");
const router = (0, express_1.Router)();
const PROFILES_DIR = path_1.default.join(__dirname, '../../data/profiles');
const UPLOADS_DIR = path_1.default.join(__dirname, '../../uploads');
// Configure multer for PDF uploads
const storage = multer_1.default.diskStorage({
    destination: async (req, file, cb) => {
        try {
            await promises_1.default.mkdir(UPLOADS_DIR, { recursive: true });
            cb(null, UPLOADS_DIR);
        }
        catch (error) {
            cb(error, UPLOADS_DIR);
        }
    },
    filename: (req, file, cb) => {
        cb(null, `resume-${Date.now()}-${file.originalname}`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        }
        else {
            cb(new Error('Only PDF files are allowed'));
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
// Ensure profiles directory exists
async function ensureProfilesDir() {
    try {
        await promises_1.default.access(PROFILES_DIR);
    }
    catch {
        await promises_1.default.mkdir(PROFILES_DIR, { recursive: true });
    }
}
function toSafeString(value, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}
function toOptionalPositiveNumber(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
        return value;
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0)
            return parsed;
    }
    return fallback;
}
function normalizeContact(input, existing) {
    return {
        phone: toSafeString(input?.phone, existing?.phone ?? ''),
        email: toSafeString(input?.email, existing?.email ?? ''),
        linkedin: toSafeString(input?.linkedin, existing?.linkedin ?? ''),
        github: toSafeString(input?.github, existing?.github ?? ''),
        portfolio: toSafeString(input?.portfolio, existing?.portfolio ?? ''),
        location: toSafeString(input?.location, existing?.location ?? ''),
    };
}
function normalizeExperience(experience, existing) {
    if (!experience)
        return existing ?? [];
    return experience.map((exp) => ({
        title: toSafeString(exp?.title),
        company: toSafeString(exp?.company),
        startDate: toSafeString(exp?.startDate),
        endDate: toSafeString(exp?.endDate),
        location: toSafeString(exp?.location),
        description: toSafeString(exp?.description),
        achievements: Array.isArray(exp?.achievements)
            ? exp.achievements.filter((a) => typeof a === 'string').map((a) => a.trim()).filter(Boolean)
            : [],
    }));
}
function normalizeStrengths(strengths, existing) {
    if (!strengths)
        return existing ?? [];
    return strengths.map((item) => ({
        title: toSafeString(item?.title),
        description: toSafeString(item?.description),
    }));
}
function normalizeEducation(education, existing) {
    if (!education)
        return existing ?? [];
    return education.map((item) => ({
        degree: toSafeString(item?.degree),
        institution: toSafeString(item?.institution),
        startDate: toSafeString(item?.startDate),
        endDate: toSafeString(item?.endDate),
        location: toSafeString(item?.location),
        gpa: toSafeString(item?.gpa),
        achievements: Array.isArray(item?.achievements)
            ? item.achievements.filter((a) => typeof a === 'string').map((a) => a.trim()).filter(Boolean)
            : undefined,
    }));
}
function normalizeCertifications(certifications, existing) {
    if (!certifications)
        return existing ?? [];
    return certifications
        .filter((item) => !!item && typeof item === 'object')
        .map((item) => ({
        name: toSafeString(item.name),
        issuer: toSafeString(item.issuer),
        date: toSafeString(item.date),
        expiryDate: toSafeString(item.expiryDate),
        credentialId: toSafeString(item.credentialId),
    }));
}
function normalizeProfilePayload(data, existing) {
    const skills = Array.isArray(data.skills)
        ? data.skills.filter((s) => typeof s === 'string').map((s) => s.trim()).filter(Boolean)
        : (existing?.skills ?? []);
    return {
        name: toSafeString(data.name, existing?.name ?? 'Untitled Profile'),
        title: toSafeString(data.title, existing?.title ?? 'Professional'),
        totalYearsExperience: toOptionalPositiveNumber(data.totalYearsExperience, existing?.totalYearsExperience),
        preferredTemplate: toSafeString(data.preferredTemplate, existing?.preferredTemplate ?? ''),
        disabled: typeof data.disabled === 'boolean' ? data.disabled : (existing?.disabled ?? false),
        contact: normalizeContact(data.contact, existing?.contact),
        summary: toSafeString(data.summary, existing?.summary ?? ''),
        experience: normalizeExperience(data.experience, existing?.experience),
        strengths: normalizeStrengths(data.strengths, existing?.strengths),
        skills,
        education: normalizeEducation(data.education, existing?.education),
        certifications: normalizeCertifications(data.certifications, existing?.certifications),
    };
}
// Get all profiles
router.get('/', async (req, res) => {
    try {
        await ensureProfilesDir();
        const files = await promises_1.default.readdir(PROFILES_DIR);
        const profiles = [];
        const includeDisabled = req.query.includeDisabled === 'true';
        for (const file of files) {
            if (file.endsWith('.json')) {
                const content = await promises_1.default.readFile(path_1.default.join(PROFILES_DIR, file), 'utf-8');
                profiles.push(JSON.parse(content));
            }
        }
        // Sort by updatedAt descending
        profiles.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        const filteredProfiles = includeDisabled
            ? profiles
            : profiles.filter((profile) => !profile.disabled);
        res.json(filteredProfiles);
    }
    catch (error) {
        console.error('Error fetching profiles:', error);
        res.status(500).json({ error: 'Failed to fetch profiles' });
    }
});
// Get single profile
router.get('/:id', async (req, res) => {
    try {
        const filePath = path_1.default.join(PROFILES_DIR, `${req.params.id}.json`);
        const content = await promises_1.default.readFile(filePath, 'utf-8');
        res.json(JSON.parse(content));
    }
    catch (error) {
        res.status(404).json({ error: 'Profile not found' });
    }
});
// Create profile (protected)
router.post('/', auth_1.authMiddleware, async (req, res) => {
    try {
        await ensureProfilesDir();
        const data = req.body;
        const normalized = normalizeProfilePayload(data);
        const profile = {
            ...normalized,
            id: (0, uuid_1.v4)(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        const filePath = path_1.default.join(PROFILES_DIR, `${profile.id}.json`);
        await promises_1.default.writeFile(filePath, JSON.stringify(profile, null, 2));
        res.status(201).json(profile);
    }
    catch (error) {
        console.error('Error creating profile:', error);
        res.status(500).json({ error: 'Failed to create profile' });
    }
});
// Update profile (protected)
router.put('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const filePath = path_1.default.join(PROFILES_DIR, `${req.params.id}.json`);
        // Check if profile exists
        const existingContent = await promises_1.default.readFile(filePath, 'utf-8');
        const existingProfile = JSON.parse(existingContent);
        const normalized = normalizeProfilePayload(req.body, existingProfile);
        const updatedProfile = {
            ...normalized,
            id: existingProfile.id, // Preserve ID
            createdAt: existingProfile.createdAt, // Preserve creation date
            updatedAt: new Date().toISOString()
        };
        await promises_1.default.writeFile(filePath, JSON.stringify(updatedProfile, null, 2));
        res.json(updatedProfile);
    }
    catch (error) {
        res.status(404).json({ error: 'Profile not found' });
    }
});
// Delete profile (protected)
router.delete('/:id', auth_1.authMiddleware, async (req, res) => {
    try {
        const filePath = path_1.default.join(PROFILES_DIR, `${req.params.id}.json`);
        await promises_1.default.unlink(filePath);
        res.json({ message: 'Profile deleted successfully' });
    }
    catch (error) {
        res.status(404).json({ error: 'Profile not found' });
    }
});
// Upload resume PDF and extract profile (protected)
router.post('/upload', auth_1.authMiddleware, upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }
        // Read and parse PDF
        const pdfBuffer = await promises_1.default.readFile(req.file.path);
        const pdfData = await (0, pdf_parse_1.default)(pdfBuffer);
        if (!pdfData.text || pdfData.text.trim().length < 50) {
            await promises_1.default.unlink(req.file.path); // Clean up
            return res.status(400).json({ error: 'Could not extract text from PDF. Please ensure the PDF contains readable text.' });
        }
        // Extract profile using Claude
        const extractedData = await (0, claude_1.extractProfileFromResume)(pdfData.text);
        // Create profile
        await ensureProfilesDir();
        const profile = {
            ...extractedData,
            disabled: false,
            id: (0, uuid_1.v4)(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        const filePath = path_1.default.join(PROFILES_DIR, `${profile.id}.json`);
        await promises_1.default.writeFile(filePath, JSON.stringify(profile, null, 2));
        // Clean up uploaded file
        await promises_1.default.unlink(req.file.path);
        res.status(201).json(profile);
    }
    catch (error) {
        console.error('Error extracting profile from PDF:', error);
        // Clean up uploaded file if it exists
        if (req.file) {
            try {
                await promises_1.default.unlink(req.file.path);
            }
            catch { }
        }
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to extract profile from PDF' });
    }
});
exports.default = router;
//# sourceMappingURL=profiles.js.map