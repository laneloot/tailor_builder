'use client';

import type { CSSProperties } from 'react';
import { useState } from 'react';
import { adminApi, GoogleSheetCell, GoogleSheetColor, GoogleSheetMergeRange, GoogleSheetTab, GoogleSheetsRangeResponse } from '@/lib/api';

type SheetsImportFormState = {
  sheetId: string;
  tabName: string;
  fromRow: string;
  toRow: string;
  fromCol: string;
  toCol: string;
};

type SheetsLookupState = {
  spreadsheetId: string;
  spreadsheetTitle: string;
  tabs: GoogleSheetTab[];
};

const DEFAULT_SHEETS_IMPORT_FORM: SheetsImportFormState = {
  sheetId: '',
  tabName: '',
  fromRow: '1',
  toRow: '10',
  fromCol: '1',
  toCol: '5',
};

function parsePositiveWholeNumber(label: string, value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive whole number.`);
  }
  return parsed;
}

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

function toRgba(color: GoogleSheetColor | null | undefined, fallback: string): string {
  if (!color) return fallback;
  const red = Math.round(color.red * 255);
  const green = Math.round(color.green * 255);
  const blue = Math.round(color.blue * 255);
  const alpha = Math.max(0, Math.min(1, color.alpha));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function toCssBorder(borderStyle: string | undefined, borderColor: GoogleSheetColor | null | undefined): string | undefined {
  if (!borderStyle || borderStyle === 'NONE') return undefined;

  const width =
    borderStyle === 'SOLID_THICK' ? 3 :
    borderStyle === 'SOLID_MEDIUM' ? 2 :
    borderStyle === 'DOUBLE' ? 3 :
    1;

  const style =
    borderStyle === 'DOTTED' ? 'dotted' :
    borderStyle === 'DASHED' ? 'dashed' :
    borderStyle === 'DOUBLE' ? 'double' :
    'solid';

  return `${width}px ${style} ${toRgba(borderColor, 'rgba(208, 215, 222, 1)')}`;
}

function getCellStyle(cell: GoogleSheetCell, rowHeight: number | undefined): CSSProperties {
  const format = cell.format;
  const textFormat = format?.textFormat;
  const wrapStrategy = format?.wrapStrategy;

  return {
    backgroundColor: toRgba(format?.backgroundColor, '#ffffff'),
    color: toRgba(textFormat?.foregroundColor, '#202124'),
    fontWeight: textFormat?.bold ? 700 : 400,
    fontStyle: textFormat?.italic ? 'italic' : 'normal',
    fontSize: textFormat?.fontSize ? `${textFormat.fontSize}px` : '13px',
    fontFamily: textFormat?.fontFamily ?? 'Arial, Helvetica, sans-serif',
    textDecoration: [
      textFormat?.underline ? 'underline' : '',
      textFormat?.strikethrough ? 'line-through' : '',
    ].filter(Boolean).join(' ') || undefined,
    textAlign:
      format?.horizontalAlignment === 'CENTER' ? 'center' :
      format?.horizontalAlignment === 'RIGHT' ? 'right' :
      'left',
    verticalAlign:
      format?.verticalAlignment === 'MIDDLE' ? 'middle' :
      format?.verticalAlignment === 'BOTTOM' ? 'bottom' :
      'top',
    whiteSpace: wrapStrategy === 'WRAP' ? 'pre-wrap' : 'nowrap',
    overflow: 'hidden',
    textOverflow: wrapStrategy === 'WRAP' ? 'clip' : 'ellipsis',
    lineHeight: wrapStrategy === 'WRAP' ? 1.4 : `${Math.max((rowHeight ?? 32) - 10, 18)}px`,
    borderTop: toCssBorder(format?.borders.top?.style, format?.borders.top?.color) ?? '1px solid #e0e3e7',
    borderRight: toCssBorder(format?.borders.right?.style, format?.borders.right?.color) ?? '1px solid #e0e3e7',
    borderBottom: toCssBorder(format?.borders.bottom?.style, format?.borders.bottom?.color) ?? '1px solid #e0e3e7',
    borderLeft: toCssBorder(format?.borders.left?.style, format?.borders.left?.color) ?? '1px solid #e0e3e7',
  };
}

function buildMergeMaps(merges: GoogleSheetMergeRange[]) {
  const mergeStarts = new Map<string, GoogleSheetMergeRange>();
  const coveredCells = new Set<string>();

  for (const merge of merges) {
    mergeStarts.set(`${merge.startRow}:${merge.startCol}`, merge);
    for (let rowIndex = merge.startRow; rowIndex < merge.endRow; rowIndex += 1) {
      for (let columnIndex = merge.startCol; columnIndex < merge.endCol; columnIndex += 1) {
        if (rowIndex === merge.startRow && columnIndex === merge.startCol) continue;
        coveredCells.add(`${rowIndex}:${columnIndex}`);
      }
    }
  }

  return { mergeStarts, coveredCells };
}

export default function GoogleSheetsRangeImporter() {
  const [sheetsForm, setSheetsForm] = useState<SheetsImportFormState>(DEFAULT_SHEETS_IMPORT_FORM);
  const [sheetsLookup, setSheetsLookup] = useState<SheetsLookupState | null>(null);
  const [sheetsResult, setSheetsResult] = useState<GoogleSheetsRangeResponse | null>(null);
  const [editableValues, setEditableValues] = useState<string[][]>([]);
  const [originalValues, setOriginalValues] = useState<string[][]>([]);
  const [sheetsError, setSheetsError] = useState('');
  const [sheetsSuccess, setSheetsSuccess] = useState('');
  const [isLoadingSheetTabs, setIsLoadingSheetTabs] = useState(false);
  const [isImportingSheetRange, setIsImportingSheetRange] = useState(false);
  const [isSavingSheetRange, setIsSavingSheetRange] = useState(false);

  const setSheetsField = <K extends keyof SheetsImportFormState>(field: K, value: SheetsImportFormState[K]) => {
    setSheetsForm((current) => ({ ...current, [field]: value }));
  };

  const applySheetsLookup = (response: GoogleSheetsRangeResponse) => {
    setSheetsLookup({
      spreadsheetId: response.spreadsheetId,
      spreadsheetTitle: response.spreadsheetTitle,
      tabs: response.tabs,
    });
  };

  const applyImportedSheetResult = (response: GoogleSheetsRangeResponse) => {
    applySheetsLookup(response);
    setSheetsResult(response);
    const nextValues = (response.cells ?? []).map((row) => row.map((cell) => cell.value));
    setEditableValues(nextValues);
    setOriginalValues(nextValues);
  };

  const handleSheetIdChange = (value: string) => {
    setSheetsForm((current) => ({
      ...current,
      sheetId: value,
      tabName: value.trim() === current.sheetId.trim() ? current.tabName : '',
    }));
    setSheetsLookup(null);
    setSheetsResult(null);
    setEditableValues([]);
    setOriginalValues([]);
    setSheetsError('');
    setSheetsSuccess('');
  };

  const handleLoadSheetTabs = async () => {
    const sheetId = sheetsForm.sheetId.trim();
    if (!sheetId) {
      setSheetsError('Enter a Google Sheet ID.');
      return;
    }

    try {
      setIsLoadingSheetTabs(true);
      setSheetsError('');
      setSheetsSuccess('');
      const response = await adminApi.fetchGoogleSheetRange({ sheetId });
      applySheetsLookup(response);
      setSheetsResult(null);
      setEditableValues([]);
      setOriginalValues([]);
      setSheetsForm((current) => ({
        ...current,
        sheetId,
        tabName: response.tabs.some((tab) => tab.title === current.tabName)
          ? current.tabName
          : (response.tabs[0]?.title ?? ''),
      }));
    } catch (err) {
      setSheetsLookup(null);
      setSheetsResult(null);
      setSheetsError(err instanceof Error ? err.message : 'Failed to load spreadsheet tabs');
    } finally {
      setIsLoadingSheetTabs(false);
    }
  };

  const handleImportSheetRange = async () => {
    const sheetId = sheetsForm.sheetId.trim();
    if (!sheetId) {
      setSheetsError('Enter a Google Sheet ID.');
      return;
    }

    if (!sheetsForm.tabName.trim()) {
      setSheetsError('Select a sheet tab before importing a range.');
      return;
    }

    try {
      const payload = {
        sheetId,
        tabName: sheetsForm.tabName.trim(),
        fromRow: parsePositiveWholeNumber('From row', sheetsForm.fromRow),
        toRow: parsePositiveWholeNumber('To row', sheetsForm.toRow),
        fromCol: parsePositiveWholeNumber('From column', sheetsForm.fromCol),
        toCol: parsePositiveWholeNumber('To column', sheetsForm.toCol),
      };

      setIsImportingSheetRange(true);
      setSheetsError('');
      setSheetsSuccess('');
      const response = await adminApi.fetchGoogleSheetRange(payload);
      applyImportedSheetResult(response);
      setSheetsForm((current) => ({
        ...current,
        sheetId,
        tabName: response.selectedTab ?? payload.tabName,
      }));
    } catch (err) {
      setSheetsResult(null);
      setSheetsError(err instanceof Error ? err.message : 'Failed to import Google Sheets range');
    } finally {
      setIsImportingSheetRange(false);
    }
  };

  const handleCellValueChange = (rowIndex: number, columnIndex: number, value: string) => {
    setEditableValues((current) =>
      current.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex
          ? row.map((cellValue, currentColumnIndex) => (currentColumnIndex === columnIndex ? value : cellValue))
          : row
      )
    );
    setSheetsSuccess('');
  };

  const handleSaveSheetChanges = async () => {
    if (!sheetsResult?.range) {
      setSheetsError('Import a range before saving changes.');
      return;
    }

    const payload = {
      sheetId: sheetsForm.sheetId.trim(),
      tabName: sheetsForm.tabName.trim(),
      fromRow: sheetsResult.range.fromRow,
      toRow: sheetsResult.range.toRow,
      fromCol: sheetsResult.range.fromCol,
      toCol: sheetsResult.range.toCol,
      values: editableValues,
    };

    try {
      setIsSavingSheetRange(true);
      setSheetsError('');
      setSheetsSuccess('');
      await adminApi.updateGoogleSheetRange(payload);
      const refreshed = await adminApi.fetchGoogleSheetRange({
        sheetId: payload.sheetId,
        tabName: payload.tabName,
        fromRow: payload.fromRow,
        toRow: payload.toRow,
        fromCol: payload.fromCol,
        toCol: payload.toCol,
      });
      applyImportedSheetResult(refreshed);
      setSheetsSuccess('Google Sheet updated successfully.');
    } catch (err) {
      setSheetsError(err instanceof Error ? err.message : 'Failed to save Google Sheets changes');
    } finally {
      setIsSavingSheetRange(false);
    }
  };

  const importedCells = sheetsResult?.cells ?? [];
  const importedRange = sheetsResult?.range;
  const importedMerges = sheetsResult?.merges ?? [];
  const importedRowHeights = sheetsResult?.rowHeights ?? [];
  const importedColumnWidths = sheetsResult?.columnWidths ?? [];
  const importedColumnNumbers = importedRange
    ? Array.from({ length: sheetsResult?.totalColumns ?? 0 }, (_, index) => importedRange.fromCol + index)
    : [];
  const hasImportedCells = editableValues.some((row) => row.some((cell) => cell.trim().length > 0));
  const { mergeStarts, coveredCells } = buildMergeMaps(importedMerges);
  const hasPendingChanges = JSON.stringify(editableValues) !== JSON.stringify(originalValues);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Google Sheets Range Importer</h2>
        <p className="text-sm text-gray-600">
          Load spreadsheet tabs by Sheet ID, then import a numeric row and column range through the backend service account.
        </p>
      </div>

      {sheetsError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {sheetsError}
        </div>
      )}

      {sheetsSuccess && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {sheetsSuccess}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-900">Google Sheet ID</label>
          <input
            type="text"
            value={sheetsForm.sheetId}
            onChange={(e) => handleSheetIdChange(e.target.value)}
            disabled={isLoadingSheetTabs || isImportingSheetRange}
            placeholder="1abcDEFghIjklMNopQRstuVWxyz1234567890"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={handleLoadSheetTabs}
            disabled={isLoadingSheetTabs || isImportingSheetRange || !sheetsForm.sheetId.trim()}
            className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
          >
            {isLoadingSheetTabs ? 'Loading Tabs...' : 'Load Tabs'}
          </button>
        </div>
      </div>

      {sheetsLookup && (
        <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          <div className="font-medium text-gray-900">{sheetsLookup.spreadsheetTitle}</div>
          <div className="text-xs text-gray-500">Spreadsheet ID: {sheetsLookup.spreadsheetId}</div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-900">Tab name</label>
          <select
            value={sheetsForm.tabName}
            onChange={(e) => {
              setSheetsField('tabName', e.target.value);
              setSheetsResult(null);
              setSheetsError('');
            }}
            disabled={isLoadingSheetTabs || isImportingSheetRange || !sheetsLookup?.tabs.length}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          >
            <option value="">
              {sheetsLookup?.tabs.length ? 'Select a tab' : 'Load tabs first'}
            </option>
            {(sheetsLookup?.tabs ?? []).map((tab) => (
              <option key={tab.sheetId} value={tab.title}>
                {tab.title}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Column numbers map directly to Sheets columns: `1 = A`, `2 = B`, `27 = AA`.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-900">From row</label>
          <input
            type="number"
            min="1"
            step="1"
            value={sheetsForm.fromRow}
            onChange={(e) => setSheetsField('fromRow', e.target.value)}
            disabled={isImportingSheetRange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-900">To row</label>
          <input
            type="number"
            min="1"
            step="1"
            value={sheetsForm.toRow}
            onChange={(e) => setSheetsField('toRow', e.target.value)}
            disabled={isImportingSheetRange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-900">From column</label>
          <input
            type="number"
            min="1"
            step="1"
            value={sheetsForm.fromCol}
            onChange={(e) => setSheetsField('fromCol', e.target.value)}
            disabled={isImportingSheetRange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-900">To column</label>
          <input
            type="number"
            min="1"
            step="1"
            value={sheetsForm.toCol}
            onChange={(e) => setSheetsField('toCol', e.target.value)}
            disabled={isImportingSheetRange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleImportSheetRange}
          disabled={isImportingSheetRange || isLoadingSheetTabs || !sheetsForm.sheetId.trim() || !sheetsForm.tabName.trim()}
          className="px-5 py-2.5 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:bg-blue-400"
        >
          {isImportingSheetRange ? 'Importing...' : 'Import Range'}
        </button>
      </div>

      {sheetsResult && importedRange && (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 md:flex-row md:items-center md:justify-between">
            <div>
              Imported <span className="font-medium">{importedRange.a1Notation}</span> from{' '}
              <span className="font-medium">{sheetsResult.spreadsheetTitle}</span>.
            </div>
            <button
              type="button"
              onClick={handleSaveSheetChanges}
              disabled={!hasPendingChanges || isSavingSheetRange || isImportingSheetRange}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-400"
            >
              {isSavingSheetRange ? 'Saving...' : hasPendingChanges ? 'Save Changes' : 'No Changes'}
            </button>
          </div>

          <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
            Preview mirrors the imported Google Sheets range layout. Edit any visible cell here, then save to push the updated values back to Google Sheets.
          </div>

          {!hasImportedCells && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
              The requested range was fetched successfully, but every returned cell is blank.
            </div>
          )}

          <div className="overflow-auto rounded-xl border border-gray-300 bg-white shadow-sm">
            <table className="border-separate border-spacing-0 text-sm text-gray-900">
              <colgroup>
                <col style={{ width: 56 }} />
                {importedColumnWidths.map((width, index) => (
                  <col key={importedColumnNumbers[index]} style={{ width }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 border-b border-r border-gray-300 bg-[#f8f9fa]" style={{ height: 36, minWidth: 56 }} />
                  {importedColumnNumbers.map((columnNumber) => (
                    <th
                      key={columnNumber}
                      className="sticky top-0 z-20 border-b border-r border-gray-300 bg-[#f8f9fa] px-2 text-center text-xs font-medium text-gray-600"
                      style={{ height: 36 }}
                    >
                      {toSpreadsheetColumnLabel(columnNumber)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {importedCells.map((row, rowIndex) => (
                  <tr key={`${importedRange.fromRow + rowIndex}`} style={{ height: importedRowHeights[rowIndex] ?? 28 }}>
                    <th
                      className="sticky left-0 z-10 border-b border-r border-gray-300 bg-[#f8f9fa] px-2 text-center text-xs font-medium text-gray-600"
                      style={{ width: 56, minWidth: 56 }}
                    >
                      {importedRange.fromRow + rowIndex}
                    </th>
                    {row.map((cell, columnIndex) => {
                      const mergeKey = `${rowIndex}:${columnIndex}`;
                      if (coveredCells.has(mergeKey)) {
                        return null;
                      }

                      const merge = mergeStarts.get(mergeKey);
                      const rowSpan = merge ? merge.endRow - merge.startRow : 1;
                      const colSpan = merge ? merge.endCol - merge.startCol : 1;
                      const cellHeight = Array.from({ length: rowSpan }, (_, offset) => importedRowHeights[rowIndex + offset] ?? 28)
                        .reduce((sum, value) => sum + value, 0);
                      const cellValue = editableValues[rowIndex]?.[columnIndex] ?? cell.value;
                      const format = cell.format;
                      const wrapStrategy = format?.wrapStrategy;

                      return (
                        <td
                          key={`${importedRange.fromRow + rowIndex}-${importedColumnNumbers[columnIndex]}`}
                          rowSpan={rowSpan}
                          colSpan={colSpan}
                          className="px-2 align-top"
                          style={{
                            ...getCellStyle(cell, importedRowHeights[rowIndex]),
                            minWidth: importedColumnWidths[columnIndex] ?? 120,
                            height: cellHeight,
                            paddingTop: 6,
                            paddingRight: 8,
                            paddingBottom: 6,
                            paddingLeft: 8,
                          }}
                        >
                          <textarea
                            value={cellValue}
                            onChange={(event) => handleCellValueChange(rowIndex, columnIndex, event.target.value)}
                            spellCheck={false}
                            disabled={isSavingSheetRange}
                            rows={1}
                            className="block w-full resize-none border-0 bg-transparent p-0 focus:outline-none"
                            style={{
                              minHeight: Math.max(cellHeight - 12, 24),
                              whiteSpace: wrapStrategy === 'WRAP' ? 'pre-wrap' : 'pre',
                              overflow: 'hidden',
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
