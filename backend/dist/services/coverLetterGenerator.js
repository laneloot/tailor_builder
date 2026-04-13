"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveCoverLetter = saveCoverLetter;
exports.saveCoverLetterDOCX = saveCoverLetterDOCX;
const puppeteer_1 = __importDefault(require("puppeteer"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
/// <reference path="../types/html-to-docx.d.ts" />
const html_to_docx_1 = __importDefault(require("html-to-docx"));
function esc(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
/** Convert plain text content to HTML paragraphs */
function contentToHtmlParagraphs(content) {
    const trimmed = content.trim();
    if (!trimmed)
        return '';
    const paragraphs = trimmed.split(/\n\s*\n/).filter((p) => p.trim());
    return paragraphs
        .map((p) => `<p style="margin: 0 0 12pt 0; line-height: 1.5;">${esc(p.trim().replace(/\n/g, ' '))}</p>`)
        .join('\n  ');
}
/**
 * Build professional PDF-style HTML for the cover letter.
 * Structure: Dear Hiring Manager, {content}, Best regards, {Profile name}
 */
function buildCoverLetterHTML(content, profileName) {
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 11pt; color: #1A1A1A; line-height: 1.5;">
  <p style="margin: 0 0 24pt 0;">Dear Hiring Manager,</p>
  ${contentToHtmlParagraphs(content)}
  <p style="margin: 24pt 0 12pt 0;">Best regards,</p>
  <p style="margin: 0; font-weight: bold; color: black; font-size: 12pt;">${esc(profileName.trim())}</p>
</body>
</html>`;
}
/**
 * Build cover letter HTML for DOCX with explicit line breaks between sections.
 * Structure: Dear Hiring Manager, (line break), {content}, (line break), Best regards, {profile name}
 */
function buildCoverLetterHTMLForDocx(content, profileName) {
    const lineBreak = '<p style="margin: 0 0 12pt 0;"></p>';
    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 11pt; color: #1A1A1A; line-height: 1.5;">
  <p style="margin: 0 0 12pt 0;">Dear Hiring Manager,</p>
  ${lineBreak}
  ${contentToHtmlParagraphs(content)}
  ${lineBreak}
  <p style="margin: 0 0 12pt 0;">Best regards,</p>
  <p style="margin: 0; font-weight: bold; color: black; font-size: 12pt;">${esc(profileName.trim())}</p>
</body>
</html>`;
}
/**
 * Save cover letter as PDF in the same directory as the resume.
 * Path: {profile}/{count+1}_{company}/{role}/{profile}_cover_letter.pdf
 */
async function saveCoverLetter(profile, content, pathInfo) {
    const filename = `${pathInfo.profileSlug}_cover_letter.pdf`;
    const relativePath = `${pathInfo.storagePathBase}/${filename}`;
    const filepath = path_1.default.join(pathInfo.absoluteDir, filename);
    const html = buildCoverLetterHTML(content.trim(), profile.name);
    const browser = await puppeteer_1.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 595, height: 842, deviceScaleFactor: 1 }); // A4 at 72 DPI
        await page.emulateMediaType('print');
        await page.setContent(html, { waitUntil: 'networkidle0' });
        const pdfBuffer = await page.pdf({
            format: 'A4',
            margin: { top: '0.75in', right: '0.75in', bottom: '0.75in', left: '0.75in' },
            printBackground: true,
        });
        await promises_1.default.mkdir(path_1.default.dirname(filepath), { recursive: true });
        await promises_1.default.writeFile(filepath, Buffer.from(pdfBuffer));
        return relativePath;
    }
    finally {
        await browser.close();
    }
}
/**
 * Save cover letter as DOCX in the same directory as the resume.
 * Path: {profile}/{date}/{company}/{role}/{profile}_cover_letter.docx
 */
async function saveCoverLetterDOCX(profile, content, pathInfo) {
    const filename = `${pathInfo.profileSlug}_cover_letter.docx`;
    const relativePath = `${pathInfo.storagePathBase}/${filename}`;
    const filepath = path_1.default.join(pathInfo.absoluteDir, filename);
    const html = buildCoverLetterHTMLForDocx(content.trim(), profile.name);
    const docxBuffer = await (0, html_to_docx_1.default)(html, null, {
        font: 'Arial',
        fontSize: 22, // 11pt = 22 half-points
        margins: { top: 1080, right: 1080, bottom: 1080, left: 1080 }, // 0.75in in twips
        orientation: 'portrait',
    });
    await promises_1.default.mkdir(path_1.default.dirname(filepath), { recursive: true });
    await promises_1.default.writeFile(filepath, Buffer.from(docxBuffer));
    return relativePath;
}
//# sourceMappingURL=coverLetterGenerator.js.map