'use client';

import { JobAnalysis } from '@/lib/api';

interface SkillsExtractedProps {
  analysis: JobAnalysis;
}

export default function SkillsExtracted({ analysis }: SkillsExtractedProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-black">
          Job Analysis Results
        </h3>
        <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full">
          ATS Keywords Extracted
        </span>
      </div>

      {/* Job Title & Level */}
      <div className="mb-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-sm text-blue-600 font-medium">
          {analysis.jobTitle}
        </p>
        <p className="text-xs text-blue-500">
          Experience Level: {analysis.experienceLevel}
        </p>
      </div>

      {/* Hard Skills (merge Required + Preferred into one list) */}
      {((analysis.requiredSkills || []).length > 0 || (analysis.preferredSkills || []).length > 0) && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-black mb-2">Hard Skills</h4>
          <div className="flex flex-wrap gap-2">
            {Array.from(
              new Set([
                ...analysis.requiredSkills,
                ...analysis.preferredSkills,
              ])
            ).map((skill, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-indigo-100 text-indigo-700 text-sm rounded-full"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Keywords */}
      {analysis.keywords.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-black mb-2">
            ATS Keywords
          </h4>
          <div className="flex flex-wrap gap-2">
            {analysis.keywords.map((keyword, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded-full"
              >
                {keyword}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Industry Terms */}
      {analysis.industryTerms.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-black mb-2">
            Industry Terms
          </h4>
          <div className="flex flex-wrap gap-2">
            {analysis.industryTerms.map((term, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-gray-100 text-black text-sm rounded-full"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Soft Skills (limit to 5) */}
      {analysis.softSkills.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-black mb-2">Soft Skills</h4>
          <div className="flex flex-wrap gap-2">
            {analysis.softSkills.slice(0, 5).map((skill, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Key Responsibilities */}
      {analysis.keyResponsibilities.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-black mb-2">
            Key Responsibilities
          </h4>
          <ul className="list-disc list-inside text-sm text-black space-y-1">
            {analysis.keyResponsibilities.slice(0, 5).map((resp, idx) => (
              <li key={idx}>{resp}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Certifications */}
      {analysis.certifications.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-black mb-2">
            Certifications Mentioned
          </h4>
          <div className="flex flex-wrap gap-2">
            {analysis.certifications.map((cert, idx) => (
              <span
                key={idx}
                className="px-3 py-1 bg-blue-100 text-blue-700 text-sm rounded-full"
              >
                {cert}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
