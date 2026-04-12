'use client';

import { useEffect, useMemo, useState } from 'react';
import { importApi } from '@/lib/api';

export type ImportedSheetJob = {
  companyName: string;
  jobTitle: string;
  jobDescription: string;
  sourceRowNumber: number;
};

type ColumnMapping = {
  companyName: string;
  jobTitle: string;
  jobDescription: string;
};

type Props = {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (jobs: ImportedSheetJob[], meta: { skippedRows: number }) => Promise<void>;
};

const DEFAULT_MAPPING: ColumnMapping = {
  companyName: '',
  jobTitle: '',
  jobDescription: '',
};

function toSpreadsheetColumnLabel(columnNumber: number): string {
  let current = columnNumber;
  let label = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    current = Math.floor((current - 1) / 26);
  }

  return label;
}

function parseSpreadsheetColumnInput(label: string, value: string): number {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  if (!/^[A-Z]+$/.test(normalized)) {
    throw new Error(`${label} must use spreadsheet letters like A, B, or AA.`);
  }

  let columnNumber = 0;
  for (const character of normalized) {
    columnNumber = (columnNumber * 26) + (character.charCodeAt(0) - 64);
  }

  return columnNumber;
}

export default function SheetsImportModal({
  isOpen,
  isSubmitting,
  onClose,
  onConfirm,
}: Props) {
  const [sheetId, setSheetId] = useState('');
  const [tabName, setTabName] = useState('');
  const [fromRow, setFromRow] = useState('1');
  const [toRow, setToRow] = useState('10');
  const [fromCol, setFromCol] = useState('A');
  const [toCol, setToCol] = useState('E');
  const [mapping, setMapping] = useState<ColumnMapping>(DEFAULT_MAPPING);
  const [values, setValues] = useState<string[][]>([]);
  const [rangeStartRow, setRangeStartRow] = useState(1);
  const [rangeStartCol, setRangeStartCol] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setSheetId('');
      setTabName('');
      setFromRow('1');
      setToRow('10');
      setFromCol('A');
      setToCol('E');
      setMapping(DEFAULT_MAPPING);
      setValues([]);
      setRangeStartRow(1);
      setRangeStartCol(1);
      setIsLoading(false);
      setError('');
    }
  }, [isOpen]);

  const columnOptions = useMemo(() => {
    if (!values.length) return [];

    const totalColumns = values.reduce((max, row) => Math.max(max, row.length), 0);

    return Array.from({ length: totalColumns }, (_, index) => {
      const absoluteColumnNumber = rangeStartCol + index;
      const letter = toSpreadsheetColumnLabel(absoluteColumnNumber);

      return {
        value: String(index),
        label: letter,
      };
    });
  }, [rangeStartCol, values]);

  const previewRows = values.slice(0, 12);

  if (!isOpen) return null;

  const handleLoad = async () => {
    if (!sheetId.trim()) {
      setError('Spreadsheet ID is required.');
      return;
    }
    if (!tabName.trim()) {
      setError('Sheet tab name is required.');
      return;
    }

    try {
      const parsedFromCol = parseSpreadsheetColumnInput('From column', fromCol);
      const parsedToCol = parseSpreadsheetColumnInput('To column', toCol);
      setIsLoading(true);
      setError('');
      const response = await importApi.fetchGoogleSheetRange({
        sheetId: sheetId.trim(),
        tabName: tabName.trim(),
        fromRow: Number(fromRow),
        toRow: Number(toRow),
        fromCol: parsedFromCol,
        toCol: parsedToCol,
      });
      const importedValues = response.values ?? [];
      setValues(importedValues);
      setRangeStartRow(response.range?.fromRow ?? Number(fromRow));
      setRangeStartCol(response.range?.fromCol ?? parsedFromCol);
      setMapping({
        companyName: '',
        jobTitle: '',
        jobDescription: '',
      });
    } catch (err) {
      setValues([]);
      setError(err instanceof Error ? err.message : 'Failed to import sheet range');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!values.length) {
      setError('Load a sheet range before confirming.');
      return;
    }
    if (mapping.companyName === '') {
      setError('Map a column to company_name.');
      return;
    }
    if (mapping.jobDescription === '') {
      setError('Map a column to job_description.');
      return;
    }

    const companyIndex = Number(mapping.companyName);
    const jobTitleIndex = mapping.jobTitle === '' ? null : Number(mapping.jobTitle);
    const jobDescriptionIndex = Number(mapping.jobDescription);
    const jobs: ImportedSheetJob[] = [];
    let skippedRows = 0;

    for (let rowIndex = 0; rowIndex < values.length; rowIndex += 1) {
      const row = values[rowIndex] ?? [];
      const companyName = row[companyIndex]?.trim() ?? '';
      const jobDescription = row[jobDescriptionIndex]?.trim() ?? '';
      const jobTitle = jobTitleIndex === null ? '' : row[jobTitleIndex]?.trim() ?? '';

      if (!companyName || !jobDescription) {
        skippedRows += 1;
        continue;
      }

      jobs.push({
        companyName,
        jobTitle,
        jobDescription,
        sourceRowNumber: rangeStartRow + rowIndex,
      });
    }

    if (!jobs.length) {
      setError('No importable jobs were found. Check the mapped columns and imported rows.');
      return;
    }

    try {
      setError('');
      await onConfirm(jobs, { skippedRows });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import jobs from sheet');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm">
      <div className="absolute inset-4 flex items-center justify-center">
        <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Import from Sheets</h3>
              <p className="text-sm text-gray-600">
                Load jobs from Google Sheets, map the columns, then generate all profile × job combinations.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading || isSubmitting}
              className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            >
              Close
            </button>
          </div>

          <div className="max-h-[calc(90vh-72px)] overflow-y-auto px-6 py-5">
            <div className="space-y-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Spreadsheet ID</label>
                  <input
                    type="text"
                    value={sheetId}
                    onChange={(e) => setSheetId(e.target.value)}
                    disabled={isLoading || isSubmitting}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Sheet Tab Name</label>
                  <input
                    type="text"
                    value={tabName}
                    onChange={(e) => setTabName(e.target.value)}
                    disabled={isLoading || isSubmitting}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">From Row</label>
                  <input
                    type="number"
                    min="1"
                    value={fromRow}
                    onChange={(e) => setFromRow(e.target.value)}
                    disabled={isLoading || isSubmitting}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">To Row</label>
                  <input
                    type="number"
                    min="1"
                    value={toRow}
                    onChange={(e) => setToRow(e.target.value)}
                    disabled={isLoading || isSubmitting}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">From Column</label>
                  <input
                    type="text"
                    value={fromCol}
                    onChange={(e) => setFromCol(e.target.value)}
                    disabled={isLoading || isSubmitting}
                    placeholder="A"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">To Column</label>
                  <input
                    type="text"
                    value={toCol}
                    onChange={(e) => setToCol(e.target.value)}
                    disabled={isLoading || isSubmitting}
                    placeholder="E"
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleLoad}
                  disabled={isLoading || isSubmitting}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {isLoading ? 'Loading...' : 'Load Range'}
                </button>
              </div>

              {values.length > 0 && (
                <>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="text-sm text-gray-700">
                      Every imported row will be treated as one job record.
                    </div>
                    <div className="text-xs text-gray-500">Rows loaded: {values.length}</div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        company_name <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={mapping.companyName}
                        onChange={(e) => setMapping((current) => ({ ...current, companyName: e.target.value }))}
                        disabled={isSubmitting}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Choose a column...</option>
                        {columnOptions.map((option) => (
                          <option key={`company-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">job_title</label>
                      <select
                        value={mapping.jobTitle}
                        onChange={(e) => setMapping((current) => ({ ...current, jobTitle: e.target.value }))}
                        disabled={isSubmitting}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Skip</option>
                        {columnOptions.map((option) => (
                          <option key={`title-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">
                        job_description <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={mapping.jobDescription}
                        onChange={(e) => setMapping((current) => ({ ...current, jobDescription: e.target.value }))}
                        disabled={isSubmitting}
                        className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Choose a column...</option>
                        {columnOptions.map((option) => (
                          <option key={`desc-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200 text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-700">Row</th>
                          {columnOptions.map((option, index) => (
                            <th key={option.value} className="px-3 py-2 text-left font-medium text-gray-700">
                              {toSpreadsheetColumnLabel(rangeStartCol + index)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {previewRows.map((row, rowIndex) => (
                          <tr key={`preview-row-${rowIndex}`}>
                            <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900">
                              {rangeStartRow + rowIndex}
                            </td>
                            {columnOptions.map((option, columnIndex) => (
                              <td key={`preview-cell-${rowIndex}-${option.value}`} className="max-w-xs px-3 py-2 align-top text-gray-700">
                                <span className="line-clamp-3 whitespace-pre-wrap break-words">
                                  {row[columnIndex] ?? ''}
                                </span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isSubmitting}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      disabled={isSubmitting}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
                    >
                      {isSubmitting ? 'Generating...' : 'Generate from Imported Jobs'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
