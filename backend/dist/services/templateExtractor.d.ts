import { Template } from '../types/template';
export declare function extractAndSaveTemplate(pdfBuffer: Buffer, templateName: string, originalFilename: string): Promise<Template>;
export declare function getAllTemplates(): Promise<Template[]>;
export declare function getTemplateById(id: string): Promise<Template | null>;
export declare function updateTemplate(id: string, updates: Partial<Pick<Template, 'disabled' | 'name' | 'description'>>): Promise<Template | null>;
export declare function uploadJsonTemplate(jsonBuffer: Buffer, options?: {
    overrideId?: string;
}): Promise<Template>;
export declare function deleteTemplate(id: string): Promise<boolean>;
export declare function createDefaultTemplate(): Promise<Template>;
export interface ElementStyle {
    color: string;
    fontSizePt: number;
    fontFamily: string;
    fontWeight: 'normal' | 'bold';
}
export interface ManualTemplateConfig {
    name: string;
    description?: string;
    columns: 1 | 2;
    accentColor: string;
    bodyColor: string;
    bodyFontSizePt: number;
    titleFontSizePt: number;
    /** For 1 column: order of all sections. For 2 columns: ignored. */
    sectionOrder?: string[];
    /** For 2 columns: order of sections in left column (summary, experience) */
    leftSectionOrder?: string[];
    /** For 2 columns: order of sections in right column (strengths, hardSkills, softSkills, education) */
    rightSectionOrder?: string[];
    /** Header: person name */
    nameStyle?: Partial<ElementStyle>;
    /** Header: professional title */
    headerTitleStyle?: Partial<ElementStyle>;
    /** Header: contact info (phone, email, etc.) */
    contactStyle?: Partial<ElementStyle>;
    /** Main title (name) and section titles */
    titleStyle?: Partial<ElementStyle>;
    /** Job title, degree, strength title */
    subTitleStyle?: Partial<ElementStyle>;
    /** Body text: summary, description, paragraphs */
    paragraphStyle?: Partial<ElementStyle>;
    /** Per-section, per-element overrides: sectionId -> elementId -> { color, fontSizePt, fontFamily?, fontWeight? } */
    sectionStyles?: Record<string, Record<string, {
        color?: string;
        fontSizePt?: number;
        fontFamily?: string;
        fontWeight?: string;
    }>>;
}
export declare function createManualTemplate(config: ManualTemplateConfig): Promise<Template>;
export declare function updateManualTemplate(id: string, config: ManualTemplateConfig): Promise<Template | null>;
//# sourceMappingURL=templateExtractor.d.ts.map