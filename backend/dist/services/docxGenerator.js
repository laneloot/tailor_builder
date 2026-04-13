"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateResumeDOCX = generateResumeDOCX;
/// <reference path="../types/html-to-docx.d.ts" />
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const html_to_docx_1 = __importDefault(require("html-to-docx"));
const pdfGenerator_1 = require("./pdfGenerator");
/**
 * Builds HTML in Daniel-style: Arial, centered header (name, title, contact),
 * blue accent (#2B5C8A), section headers with underline.
 */
function buildHayatoStyleHTML(data) {
    const esc = (s) => String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const contactParts = [];
    if (data.contact?.location)
        contactParts.push(esc(data.contact.location));
    if (data.contact?.phone)
        contactParts.push(esc(data.contact.phone));
    if (data.contact?.email)
        contactParts.push(esc(data.contact.email));
    if (data.contact?.linkedin)
        contactParts.push(`<a href="${esc(data.contact.linkedin)}">${esc(data.contact.linkedin)}</a>`);
    const contactLine = contactParts.filter(Boolean).join('  •  ');
    const accentColor = '#2B5C8A';
    const sectionStyle = `margin: 5pt 0 6pt 0; font-size: 11pt; font-weight: bold; color: ${accentColor}; border-bottom: 1px solid ${accentColor}; padding-bottom: 2pt;`;
    let html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 10pt; color: #1A1A1A;">
  <div style="text-align: center;">
    <p style="font-size: 20pt; font-weight: bold; color: #1A1A1A; margin: 0 0 5pt 0; text-align: center;">${esc(data.name)}</p>
    <p style="font-size: 12pt; font-weight: bold; color: ${accentColor}; margin: 0 0 5pt 0; text-align: center;">${esc(data.title)}</p>
    <p style="font-size: 9pt; color: #555555; margin: 0 0 14pt 0; text-align: center;">${contactLine}</p>
    <p style="margin: 0;"><br></p>
  </div>

  <p style="${sectionStyle}"><u>Professional Summary</u></p>
  <p style="font-size: 10pt; color: #1A1A1A; margin: 0 0 12pt 0; line-height: 1.35;">${esc(data.summary || '')}</p>
  <p style="margin: 0;"><br></p>

  ${(data.strengths?.length ?? 0) > 0 ? `
  <p style="${sectionStyle}"><u>Key Strengths</u></p>
  ${(data.strengths ?? [])
        .map((s) => `<p style="margin: 4pt 0 2pt 0; font-weight: bold; font-size: 9pt; color: #1A1A1A;">${esc(s.title ?? '')}</p>
  <p style="margin: 0 0 8pt 0; font-size: 9pt; color: #1A1A1A; line-height: 1.35;">${esc(s.description ?? '')}</p>`)
        .join('\n  ')}
  <p style="margin: 0;"><br></p>
  ` : ''}

  <p style="${sectionStyle}"><u>Technical Skills</u></p>
  <p style="font-size: 9pt; color: #1A1A1A; margin: 0 0 14pt 0; line-height: 1.35;">${esc([...(data.hardSkills ?? data.skills ?? []), ...(data.softSkills ?? [])].filter(Boolean).join(', '))}</p>
  <p style="margin: 0;"><br></p>

  <p style="${sectionStyle}"><u>Professional Experience</u></p>
  ${(data.experience ?? [])
        .map((exp) => {
        const dates = [exp.startDate, exp.endDate].filter(Boolean).join(' – ');
        const loc = exp.location ? ` • ${exp.location}` : '';
        const bullets = (exp.achievements ?? [])
            .map((a) => `<p style="font-size: 9pt; color: #1A1A1A; line-height: 1.35;">- ${esc(a)}</p>`)
            .join('\n  ');
        return `
  <p style="font-weight: bold; font-size: 11pt; color: #1A1A1A;">${esc(exp.company ?? '')}</p>
  <p style="font-size: 10pt; color: ${accentColor}; font-style: italic;">${esc(exp.title ?? '')}</p>
  <p style="font-size: 8pt; color: #555555;">${esc(dates)}${esc(loc)}</p>
  <p style="font-size: 9pt; color: #1A1A1A; line-height: 1.35;">${esc(exp.description ?? '')}</p>
  ${bullets}`;
    })
        .join('\n')}
  <p style="margin: 0;"><br></p>

  <p style="${sectionStyle}"><u>Education</u></p>
  ${(data.education ?? [])
        .map((edu) => {
        const dates = [edu.startDate, edu.endDate].filter(Boolean).join(' – ');
        const loc = edu.location ? ` • ${edu.location}` : '';
        return `
  <p style="font-weight: bold; font-size: 10pt; color: #1A1A1A;">${esc(edu.degree ?? '')}</p>
  <p style="font-size: 9pt; color: #555555;">${esc(edu.institution ?? '')}${esc(loc)}</p>
  <p style="font-size: 8pt; color: #555555;">${esc(dates)}</p>`;
    })
        .join('\n')}
</body>
</html>`;
    return html;
}
async function generateResumeDOCX(profile, tailoredContent, pathInfo, companyName, role) {
    const renderData = (0, pdfGenerator_1.prepareResumeRenderData)(profile, tailoredContent, companyName, role);
    const html = buildHayatoStyleHTML(renderData);
    const docxBuffer = await (0, html_to_docx_1.default)(html, null, {
        font: 'Arial',
        fontSize: 18, // 9pt = 18 half-points
        margins: { top: 720, right: 720, bottom: 720, left: 720 }, // 0.5in in twips
        orientation: 'portrait',
    });
    const docxFilename = `${pathInfo.profileSlug}.docx`;
    const relativePath = `${pathInfo.storagePathBase}/${docxFilename}`;
    const filepath = path_1.default.join(pathInfo.absoluteDir, docxFilename);
    await promises_1.default.mkdir(path_1.default.dirname(filepath), { recursive: true });
    await promises_1.default.writeFile(filepath, Buffer.from(docxBuffer));
    return relativePath;
}
//# sourceMappingURL=docxGenerator.js.map