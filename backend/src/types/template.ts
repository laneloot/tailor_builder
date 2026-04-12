/** Stored config for manual templates; enables edit. Matches ManualTemplateConfig shape. */
export interface ManualTemplateConfigStored {
  name: string;
  description?: string;
  columns: 1 | 2;
  accentColor?: string;
  bodyColor?: string;
  bodyFontSizePt?: number;
  titleFontSizePt?: number;
  sectionOrder?: string[];
  leftSectionOrder?: string[];
  rightSectionOrder?: string[];
  nameStyle?: Record<string, unknown>;
  headerTitleStyle?: Record<string, unknown>;
  contactStyle?: Record<string, unknown>;
  sectionStyles?: Record<string, Record<string, Record<string, unknown>>>;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  disabled?: boolean;
  htmlContent: string;
  cssContent: string;
  sections: string[];
  createdAt: string;
  updatedAt: string;
  /** Stored config for manual templates; enables edit */
  manualConfig?: ManualTemplateConfigStored;
}

export interface CreateTemplateDTO {
  name: string;
  description?: string;
}

export interface JobAnalysis {
  requiredSkills: string[];
  preferredSkills: string[];
  keywords: string[];
  experienceLevel: string;
  keyResponsibilities: string[];
  industryTerms: string[];
  softSkills: string[];
  weakSkills: string[];
  techSkills: string[];
  certifications: string[];
  jobTitle: string;
  companyInfo?: string;
}

export type AIProvider = 'openai' | 'claude' | 'openrouter';

export interface TailoredContent {
  title: string;
  summary: string;
  experience: TailoredExperience[];
  skills: string[];
  hardSkills: string[];
  techSkills: string[];
  weakSkills: string[];
  softSkills: string[];
  unconfirmedSoftSkills: string[];
  unconfirmedHardSkills: string[];
  // Optional fields from job analysis merged into tailored content
  requiredSkills?: string[];
  preferredSkills?: string[];
  strengths: TailoredStrength[];
  /** Cover letter body (content between "Dear Hiring Manager" and "Best regards") */
  coverLetter?: string;
}

export interface TailoredExperience {
  title: string;
  company: string;
  startDate: string;
  endDate: string;
  location: string;
  description: string;
  achievements: string[];
}

export interface TailoredStrength {
  title: string;
  description: string;
}

export type ResumeFormat = 'pdf' | 'docx' | 'both';

export interface GenerateResumeRequest {
  profileId: string;
  templateId: string;
  jobDescription?: string;
  jobAnalysis?: JobAnalysis;
  tailoredContent?: TailoredContent;
  model?: AIProvider;
  companyName: string;
  role: string;
  format?: ResumeFormat;
  includeCoverLetterDocx?: boolean;
}
