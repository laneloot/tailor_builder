"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleSheetsRequestError = void 0;
exports.fetchGoogleSheetsRange = fetchGoogleSheetsRange;
exports.updateGoogleSheetsRange = updateGoogleSheetsRange;
exports.batchUpdateGoogleSheetsColumns = batchUpdateGoogleSheetsColumns;
exports.fetchGoogleSheetsColumnValues = fetchGoogleSheetsColumnValues;
exports.updateGoogleSheetsRow = updateGoogleSheetsRow;
const crypto_1 = __importDefault(require("crypto"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60000;
let cachedAccessToken = null;
class GoogleSheetsRequestError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}
exports.GoogleSheetsRequestError = GoogleSheetsRequestError;
function base64UrlEncode(value) {
    return Buffer.from(value, 'utf8').toString('base64url');
}
function normalizePrivateKey(privateKey) {
    return privateKey.includes('\\n') ? privateKey.replace(/\\n/g, '\n') : privateKey;
}
async function fileExists(filePath) {
    try {
        await promises_1.default.access(filePath);
        return true;
    }
    catch {
        return false;
    }
}
async function resolveServiceAccountPath() {
    const explicitPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH?.trim();
    const cwd = process.cwd();
    const candidates = [
        explicitPath,
        path_1.default.join(cwd, 'service-account-key.json'),
        path_1.default.join(cwd, 'backend/service-account-key.json'),
        path_1.default.join(__dirname, '../../service-account-key.json'),
        path_1.default.join(__dirname, '../../../service-account-key.json'),
    ].filter((value) => Boolean(value));
    for (const candidate of candidates) {
        if (await fileExists(candidate)) {
            return candidate;
        }
    }
    throw new GoogleSheetsRequestError(500, 'Google Service Account key file was not found. Set GOOGLE_SERVICE_ACCOUNT_KEY_PATH or place service-account-key.json in the project or backend directory.');
}
async function loadServiceAccountCredentials() {
    const filePath = await resolveServiceAccountPath();
    const raw = await promises_1.default.readFile(filePath, 'utf8');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new GoogleSheetsRequestError(500, 'Google Service Account key file is not valid JSON.');
    }
    const clientEmail = parsed.client_email?.trim();
    const privateKey = parsed.private_key?.trim();
    const tokenUri = parsed.token_uri?.trim() || DEFAULT_TOKEN_URI;
    if (!clientEmail || !privateKey) {
        throw new GoogleSheetsRequestError(500, 'Google Service Account credentials are incomplete. Expected client_email and private_key.');
    }
    return {
        client_email: clientEmail,
        private_key: normalizePrivateKey(privateKey),
        token_uri: tokenUri,
    };
}
function buildJwtAssertion(credentials) {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
        iss: credentials.client_email,
        scope: SHEETS_SCOPE,
        aud: credentials.token_uri,
        iat: now,
        exp: now + 3600,
    };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto_1.default.sign('RSA-SHA256', Buffer.from(unsignedToken), credentials.private_key).toString('base64url');
    return `${unsignedToken}.${signature}`;
}
async function getAccessToken() {
    if (cachedAccessToken && cachedAccessToken.expiresAt - ACCESS_TOKEN_REFRESH_BUFFER_MS > Date.now()) {
        return cachedAccessToken.token;
    }
    const credentials = await loadServiceAccountCredentials();
    const assertion = buildJwtAssertion(credentials);
    const response = await fetch(credentials.token_uri, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }).toString(),
    });
    if (!response.ok) {
        let errorMessage = 'Failed to authenticate with Google Sheets.';
        try {
            const errorBody = (await response.json());
            if (typeof errorBody.error === 'string' && errorBody.error_description) {
                errorMessage = `${errorBody.error}: ${errorBody.error_description}`;
            }
            else if (typeof errorBody.error === 'object' && errorBody.error?.message) {
                errorMessage = errorBody.error.message;
            }
        }
        catch {
            // Ignore JSON parsing failures and use the fallback message.
        }
        if (errorMessage.toLowerCase().includes('user not found')) {
            errorMessage =
                `Google service account was not recognized: ${credentials.client_email}. ` +
                    'This usually means the JSON key belongs to a deleted or disabled service account, or the key file does not match the live account. ' +
                    'Create a new key for the current service account and replace backend/service-account-key.json.';
        }
        throw new GoogleSheetsRequestError(response.status, errorMessage);
    }
    const data = (await response.json());
    if (!data.access_token || !data.expires_in) {
        throw new GoogleSheetsRequestError(500, 'Google Sheets authentication response did not include an access token.');
    }
    cachedAccessToken = {
        token: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
    };
    return cachedAccessToken.token;
}
async function googleSheetsFetch(pathname, init, hasRetried = false) {
    const accessToken = await getAccessToken();
    const response = await fetch(`${SHEETS_API_BASE}${pathname}`, {
        ...init,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(init?.headers ?? {}),
        },
    });
    if (response.status === 401 && !hasRetried) {
        cachedAccessToken = null;
        return googleSheetsFetch(pathname, init, true);
    }
    if (!response.ok) {
        let errorMessage = 'Google Sheets request failed.';
        try {
            const errorBody = (await response.json());
            if (errorBody.error?.message) {
                errorMessage = errorBody.error.message;
            }
        }
        catch {
            // Ignore JSON parsing failures and use the fallback message.
        }
        throw new GoogleSheetsRequestError(response.status, errorMessage);
    }
    return response.json();
}
function requireNonEmptyString(fieldName, value) {
    if (typeof value !== 'string' || !value.trim()) {
        throw new GoogleSheetsRequestError(400, `${fieldName} is required.`);
    }
    return value.trim();
}
function toPositiveInteger(fieldName, value) {
    const numeric = typeof value === 'string' ? Number(value.trim()) : value;
    if (typeof numeric !== 'number' || !Number.isInteger(numeric) || numeric <= 0) {
        throw new GoogleSheetsRequestError(400, `${fieldName} must be a positive whole number.`);
    }
    return numeric;
}
function hasRangeInput(input) {
    return [input.fromRow, input.toRow, input.fromCol, input.toCol].some((value) => value !== undefined && value !== null && value !== '');
}
function toColumnLetters(columnNumber) {
    let current = columnNumber;
    let letters = '';
    while (current > 0) {
        const remainder = (current - 1) % 26;
        letters = String.fromCharCode(65 + remainder) + letters;
        current = Math.floor((current - 1) / 26);
    }
    return letters;
}
function quoteSheetTitle(sheetTitle) {
    return `'${sheetTitle.replace(/'/g, "''")}'`;
}
function buildA1Notation(tabName, fromRow, toRow, fromCol, toCol) {
    return `${quoteSheetTitle(tabName)}!${toColumnLetters(fromCol)}${fromRow}:${toColumnLetters(toCol)}${toRow}`;
}
function normalizeTabs(metadata) {
    return (metadata.sheets ?? [])
        .map((sheet) => ({
        title: sheet.properties?.title ?? '',
        index: sheet.properties?.index ?? 0,
        sheetId: sheet.properties?.sheetId ?? 0,
    }))
        .filter((sheet) => Boolean(sheet.title))
        .sort((left, right) => left.index - right.index);
}
function padValues(values, rowCount, columnCount) {
    return Array.from({ length: rowCount }, (_, rowIndex) => Array.from({ length: columnCount }, (_, columnIndex) => values[rowIndex]?.[columnIndex] ?? ''));
}
function normalizeAlpha(alpha) {
    if (typeof alpha === 'number' && Number.isFinite(alpha))
        return alpha;
    if (alpha && typeof alpha === 'object' && typeof alpha.value === 'number' && Number.isFinite(alpha.value)) {
        return alpha.value;
    }
    return 1;
}
function normalizeColor(color) {
    if (!color)
        return null;
    return {
        red: typeof color.red === 'number' ? color.red : 0,
        green: typeof color.green === 'number' ? color.green : 0,
        blue: typeof color.blue === 'number' ? color.blue : 0,
        alpha: normalizeAlpha(color.alpha),
    };
}
function normalizeBorder(border) {
    if (!border?.style || border.style === 'NONE')
        return null;
    return {
        style: border.style,
        color: normalizeColor(border.color) ?? { red: 0.85, green: 0.88, blue: 0.92, alpha: 1 },
    };
}
function normalizeTextFormat(textFormat) {
    if (!textFormat)
        return null;
    return {
        bold: Boolean(textFormat.bold),
        italic: Boolean(textFormat.italic),
        underline: Boolean(textFormat.underline),
        strikethrough: Boolean(textFormat.strikethrough),
        fontSize: typeof textFormat.fontSize === 'number' ? textFormat.fontSize : null,
        fontFamily: textFormat.fontFamily ?? null,
        foregroundColor: normalizeColor(textFormat.foregroundColor),
    };
}
function normalizeCellFormat(format) {
    if (!format)
        return null;
    return {
        backgroundColor: normalizeColor(format.backgroundColor),
        textFormat: normalizeTextFormat(format.textFormat),
        horizontalAlignment: format.horizontalAlignment ?? null,
        verticalAlignment: format.verticalAlignment ?? null,
        wrapStrategy: format.wrapStrategy ?? null,
        borders: {
            top: normalizeBorder(format.borders?.top),
            right: normalizeBorder(format.borders?.right),
            bottom: normalizeBorder(format.borders?.bottom),
            left: normalizeBorder(format.borders?.left),
        },
    };
}
function buildEmptyCells(rowCount, columnCount) {
    return Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => ({
        value: '',
        format: null,
    })));
}
function clampPixelSize(value, fallback, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return fallback;
    return Math.max(min, Math.min(max, Math.round(value)));
}
function normalizeMerges(merges, fromRow, toRow, fromCol, toCol) {
    const requestStartRow = fromRow - 1;
    const requestEndRow = toRow;
    const requestStartCol = fromCol - 1;
    const requestEndCol = toCol;
    return (merges ?? [])
        .map((merge) => {
        const startRow = typeof merge.startRowIndex === 'number' ? merge.startRowIndex : 0;
        const endRow = typeof merge.endRowIndex === 'number' ? merge.endRowIndex : startRow;
        const startCol = typeof merge.startColumnIndex === 'number' ? merge.startColumnIndex : 0;
        const endCol = typeof merge.endColumnIndex === 'number' ? merge.endColumnIndex : startCol;
        const clippedStartRow = Math.max(startRow, requestStartRow);
        const clippedEndRow = Math.min(endRow, requestEndRow);
        const clippedStartCol = Math.max(startCol, requestStartCol);
        const clippedEndCol = Math.min(endCol, requestEndCol);
        if (clippedStartRow >= clippedEndRow || clippedStartCol >= clippedEndCol) {
            return null;
        }
        return {
            startRow: clippedStartRow - requestStartRow,
            endRow: clippedEndRow - requestStartRow,
            startCol: clippedStartCol - requestStartCol,
            endCol: clippedEndCol - requestStartCol,
        };
    })
        .filter((merge) => Boolean(merge));
}
function normalizeUpdateValues(values, rowCount, columnCount) {
    if (!Array.isArray(values)) {
        throw new GoogleSheetsRequestError(400, 'values must be a two-dimensional array.');
    }
    return Array.from({ length: rowCount }, (_, rowIndex) => {
        const sourceRow = values[rowIndex];
        const normalizedSourceRow = Array.isArray(sourceRow) ? sourceRow : [];
        return Array.from({ length: columnCount }, (_, columnIndex) => {
            const cellValue = normalizedSourceRow[columnIndex];
            if (cellValue === null || cellValue === undefined)
                return '';
            if (typeof cellValue === 'string')
                return cellValue;
            if (typeof cellValue === 'number' || typeof cellValue === 'boolean')
                return String(cellValue);
            throw new GoogleSheetsRequestError(400, 'values must contain only strings, numbers, booleans, or empty cells.');
        });
    });
}
function normalizeColumnUpdateValues(values) {
    if (!Array.isArray(values)) {
        throw new GoogleSheetsRequestError(400, 'Column update values must be an array.');
    }
    return values.map((value) => {
        if (value === null || value === undefined)
            return '';
        if (typeof value === 'string')
            return value;
        if (typeof value === 'number' || typeof value === 'boolean')
            return String(value);
        throw new GoogleSheetsRequestError(400, 'Column update values must contain only strings, numbers, booleans, or empty cells.');
    });
}
function normalizeSingleCellValue(fieldName, value) {
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'string')
        return value;
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    throw new GoogleSheetsRequestError(400, `${fieldName} must be a string, number, boolean, or empty value.`);
}
async function getSpreadsheetMetadata(sheetId) {
    const metadata = await googleSheetsFetch(`/spreadsheets/${encodeURIComponent(sheetId)}?fields=spreadsheetId,properties(title),sheets(properties(title,sheetId,index))`);
    return {
        spreadsheetId: metadata.spreadsheetId,
        spreadsheetTitle: metadata.properties?.title?.trim() || sheetId,
        tabs: normalizeTabs(metadata),
    };
}
async function fetchGoogleSheetsRange(input) {
    const sheetId = requireNonEmptyString('sheetId', input.sheetId);
    const metadata = await getSpreadsheetMetadata(sheetId);
    if (!hasRangeInput(input)) {
        return metadata;
    }
    const tabName = requireNonEmptyString('tabName', input.tabName);
    const fromRow = toPositiveInteger('fromRow', input.fromRow);
    const toRow = toPositiveInteger('toRow', input.toRow);
    const fromCol = toPositiveInteger('fromCol', input.fromCol);
    const toCol = toPositiveInteger('toCol', input.toCol);
    if (fromRow > toRow) {
        throw new GoogleSheetsRequestError(400, 'fromRow must be less than or equal to toRow.');
    }
    if (fromCol > toCol) {
        throw new GoogleSheetsRequestError(400, 'fromCol must be less than or equal to toCol.');
    }
    const matchingTab = metadata.tabs.find((tab) => tab.title === tabName);
    if (!matchingTab) {
        throw new GoogleSheetsRequestError(400, `Tab "${tabName}" was not found in the spreadsheet.`);
    }
    const a1Notation = buildA1Notation(tabName, fromRow, toRow, fromCol, toCol);
    const requestedRowCount = toRow - fromRow + 1;
    const requestedColumnCount = toCol - fromCol + 1;
    const gridResponse = await googleSheetsFetch(`/spreadsheets/${encodeURIComponent(sheetId)}?includeGridData=true&ranges=${encodeURIComponent(a1Notation)}&fields=${encodeURIComponent('spreadsheetId,properties(title),sheets(properties(title,sheetId,index),merges,data(startRow,startColumn,rowMetadata(pixelSize),columnMetadata(pixelSize),rowData(values(formattedValue,effectiveFormat(backgroundColor,textFormat(bold,italic,underline,strikethrough,fontSize,fontFamily,foregroundColor),horizontalAlignment,verticalAlignment,wrapStrategy,borders(top(style,color),right(style,color),bottom(style,color),left(style,color)))))))')}`);
    const selectedSheet = gridResponse.sheets?.find((sheet) => sheet.properties?.title === matchingTab.title) ?? gridResponse.sheets?.[0];
    const gridData = selectedSheet?.data?.[0];
    const cells = buildEmptyCells(requestedRowCount, requestedColumnCount);
    for (let rowIndex = 0; rowIndex < requestedRowCount; rowIndex += 1) {
        for (let columnIndex = 0; columnIndex < requestedColumnCount; columnIndex += 1) {
            const sourceCell = gridData?.rowData?.[rowIndex]?.values?.[columnIndex];
            cells[rowIndex][columnIndex] = {
                value: sourceCell?.formattedValue ?? '',
                format: normalizeCellFormat(sourceCell?.effectiveFormat),
            };
        }
    }
    const rowHeights = Array.from({ length: requestedRowCount }, (_, rowIndex) => clampPixelSize(gridData?.rowMetadata?.[rowIndex]?.pixelSize, 28, 24, 120));
    const columnWidths = Array.from({ length: requestedColumnCount }, (_, columnIndex) => clampPixelSize(gridData?.columnMetadata?.[columnIndex]?.pixelSize, 120, 72, 360));
    const merges = normalizeMerges(selectedSheet?.merges, fromRow, toRow, fromCol, toCol);
    const values = padValues(cells.map((row) => row.map((cell) => cell.value)), requestedRowCount, requestedColumnCount);
    return {
        ...metadata,
        selectedTab: matchingTab.title,
        range: {
            fromRow,
            toRow,
            fromCol,
            toCol,
            a1Notation,
        },
        cells,
        rowHeights,
        columnWidths,
        merges,
        values,
        totalRows: requestedRowCount,
        totalColumns: requestedColumnCount,
    };
}
async function updateGoogleSheetsRange(input) {
    const sheetId = requireNonEmptyString('sheetId', input.sheetId);
    const metadata = await getSpreadsheetMetadata(sheetId);
    const tabName = requireNonEmptyString('tabName', input.tabName);
    const fromRow = toPositiveInteger('fromRow', input.fromRow);
    const toRow = toPositiveInteger('toRow', input.toRow);
    const fromCol = toPositiveInteger('fromCol', input.fromCol);
    const toCol = toPositiveInteger('toCol', input.toCol);
    if (fromRow > toRow) {
        throw new GoogleSheetsRequestError(400, 'fromRow must be less than or equal to toRow.');
    }
    if (fromCol > toCol) {
        throw new GoogleSheetsRequestError(400, 'fromCol must be less than or equal to toCol.');
    }
    const matchingTab = metadata.tabs.find((tab) => tab.title === tabName);
    if (!matchingTab) {
        throw new GoogleSheetsRequestError(400, `Tab "${tabName}" was not found in the spreadsheet.`);
    }
    const requestedRowCount = toRow - fromRow + 1;
    const requestedColumnCount = toCol - fromCol + 1;
    const values = normalizeUpdateValues(input.values, requestedRowCount, requestedColumnCount);
    const a1Notation = buildA1Notation(tabName, fromRow, toRow, fromCol, toCol);
    const updateResponse = await googleSheetsFetch(`/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(a1Notation)}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            range: a1Notation,
            majorDimension: 'ROWS',
            values,
        }),
    });
    return {
        spreadsheetId: metadata.spreadsheetId,
        spreadsheetTitle: metadata.spreadsheetTitle,
        selectedTab: matchingTab.title,
        updatedRange: updateResponse.updatedRange ?? a1Notation,
        updatedRows: updateResponse.updatedRows ?? requestedRowCount,
        updatedColumns: updateResponse.updatedColumns ?? requestedColumnCount,
        updatedCells: updateResponse.updatedCells ?? requestedRowCount * requestedColumnCount,
    };
}
async function batchUpdateGoogleSheetsColumns(input) {
    const sheetId = requireNonEmptyString('sheetId', input.sheetId);
    const metadata = await getSpreadsheetMetadata(sheetId);
    const tabName = requireNonEmptyString('tabName', input.tabName);
    const startRow = toPositiveInteger('startRow', input.startRow);
    const matchingTab = metadata.tabs.find((tab) => tab.title === tabName);
    if (!matchingTab) {
        throw new GoogleSheetsRequestError(400, `Tab "${tabName}" was not found in the spreadsheet.`);
    }
    if (!Array.isArray(input.updates) || input.updates.length === 0) {
        throw new GoogleSheetsRequestError(400, 'updates must contain at least one column update.');
    }
    const normalizedUpdates = input.updates.map((entry, index) => {
        if (!entry || typeof entry !== 'object') {
            throw new GoogleSheetsRequestError(400, `updates[${index + 1}] must be an object.`);
        }
        const typedEntry = entry;
        const col = toPositiveInteger(`updates[${index + 1}].col`, typedEntry.col);
        const values = normalizeColumnUpdateValues(typedEntry.values);
        return { col, values };
    });
    const rowCount = Math.max(...normalizedUpdates.map((entry) => entry.values.length), 0);
    if (rowCount === 0) {
        return {
            spreadsheetId: metadata.spreadsheetId,
            spreadsheetTitle: metadata.spreadsheetTitle,
            selectedTab: matchingTab.title,
            updatedRanges: [],
            updatedRows: 0,
            updatedColumns: normalizedUpdates.length,
            updatedCells: 0,
        };
    }
    const data = normalizedUpdates.map((entry) => {
        const toRow = startRow + rowCount - 1;
        const range = buildA1Notation(tabName, startRow, toRow, entry.col, entry.col);
        const values = Array.from({ length: rowCount }, (_, rowIndex) => [entry.values[rowIndex] ?? '']);
        return {
            range,
            majorDimension: 'ROWS',
            values,
        };
    });
    const updateResponse = await googleSheetsFetch(`/spreadsheets/${encodeURIComponent(sheetId)}/values:batchUpdate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            valueInputOption: 'USER_ENTERED',
            data,
        }),
    });
    return {
        spreadsheetId: metadata.spreadsheetId,
        spreadsheetTitle: metadata.spreadsheetTitle,
        selectedTab: matchingTab.title,
        updatedRanges: updateResponse.responses?.map((entry) => entry.updatedRange ?? '').filter(Boolean) ?? data.map((entry) => entry.range),
        updatedRows: updateResponse.totalUpdatedRows ?? rowCount,
        updatedColumns: updateResponse.totalUpdatedColumns ?? normalizedUpdates.length,
        updatedCells: updateResponse.totalUpdatedCells ?? rowCount * normalizedUpdates.length,
    };
}
async function fetchGoogleSheetsColumnValues(input) {
    const sheetId = requireNonEmptyString('sheetId', input.sheetId);
    const metadata = await getSpreadsheetMetadata(sheetId);
    const tabName = requireNonEmptyString('tabName', input.tabName);
    const col = toPositiveInteger('col', input.col);
    const matchingTab = metadata.tabs.find((tab) => tab.title === tabName);
    if (!matchingTab) {
        throw new GoogleSheetsRequestError(400, `Tab "${tabName}" was not found in the spreadsheet.`);
    }
    const range = `${quoteSheetTitle(tabName)}!${toColumnLetters(col)}:${toColumnLetters(col)}`;
    const response = await googleSheetsFetch(`/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`);
    return {
        spreadsheetId: metadata.spreadsheetId,
        spreadsheetTitle: metadata.spreadsheetTitle,
        selectedTab: matchingTab.title,
        column: col,
        values: (response.values ?? []).map((row) => normalizeSingleCellValue('value', row?.[0] ?? '')),
    };
}
async function updateGoogleSheetsRow(input) {
    const sheetId = requireNonEmptyString('sheetId', input.sheetId);
    const metadata = await getSpreadsheetMetadata(sheetId);
    const tabName = requireNonEmptyString('tabName', input.tabName);
    const row = toPositiveInteger('row', input.row);
    const matchingTab = metadata.tabs.find((tab) => tab.title === tabName);
    if (!matchingTab) {
        throw new GoogleSheetsRequestError(400, `Tab "${tabName}" was not found in the spreadsheet.`);
    }
    if (!Array.isArray(input.updates) || input.updates.length === 0) {
        throw new GoogleSheetsRequestError(400, 'updates must contain at least one cell update.');
    }
    const normalizedUpdates = input.updates.map((entry, index) => {
        if (!entry || typeof entry !== 'object') {
            throw new GoogleSheetsRequestError(400, `updates[${index + 1}] must be an object.`);
        }
        const typedEntry = entry;
        const col = toPositiveInteger(`updates[${index + 1}].col`, typedEntry.col);
        const value = normalizeSingleCellValue(`updates[${index + 1}].value`, typedEntry.value);
        return { col, value };
    });
    const data = normalizedUpdates.map((entry) => {
        const range = buildA1Notation(tabName, row, row, entry.col, entry.col);
        return {
            range,
            majorDimension: 'ROWS',
            values: [[entry.value]],
        };
    });
    const updateResponse = await googleSheetsFetch(`/spreadsheets/${encodeURIComponent(sheetId)}/values:batchUpdate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            valueInputOption: 'USER_ENTERED',
            data,
        }),
    });
    return {
        spreadsheetId: metadata.spreadsheetId,
        spreadsheetTitle: metadata.spreadsheetTitle,
        selectedTab: matchingTab.title,
        row,
        updatedRanges: updateResponse.responses?.map((entry) => entry.updatedRange ?? '').filter(Boolean) ?? data.map((entry) => entry.range),
        updatedColumns: updateResponse.totalUpdatedColumns ?? normalizedUpdates.length,
        updatedCells: updateResponse.totalUpdatedCells ?? normalizedUpdates.length,
    };
}
//# sourceMappingURL=googleSheets.js.map