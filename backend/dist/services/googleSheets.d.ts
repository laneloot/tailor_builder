export type GoogleSheetTab = {
    title: string;
    index: number;
    sheetId: number;
};
export type GoogleSheetRangeSelection = {
    fromRow: number;
    toRow: number;
    fromCol: number;
    toCol: number;
    a1Notation: string;
};
export type GoogleSheetColor = {
    red: number;
    green: number;
    blue: number;
    alpha: number;
};
export type GoogleSheetBorder = {
    style: string;
    color: GoogleSheetColor;
};
export type GoogleSheetTextFormat = {
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strikethrough: boolean;
    fontSize: number | null;
    fontFamily: string | null;
    foregroundColor: GoogleSheetColor | null;
};
export type GoogleSheetCellFormat = {
    backgroundColor: GoogleSheetColor | null;
    textFormat: GoogleSheetTextFormat | null;
    horizontalAlignment: string | null;
    verticalAlignment: string | null;
    wrapStrategy: string | null;
    borders: {
        top: GoogleSheetBorder | null;
        right: GoogleSheetBorder | null;
        bottom: GoogleSheetBorder | null;
        left: GoogleSheetBorder | null;
    };
};
export type GoogleSheetCell = {
    value: string;
    format: GoogleSheetCellFormat | null;
};
export type GoogleSheetMergeRange = {
    startRow: number;
    endRow: number;
    startCol: number;
    endCol: number;
};
export type GoogleSheetsRangeRequest = {
    sheetId?: unknown;
    tabName?: unknown;
    fromRow?: unknown;
    toRow?: unknown;
    fromCol?: unknown;
    toCol?: unknown;
};
export type GoogleSheetsUpdateRangeRequest = GoogleSheetsRangeRequest & {
    values?: unknown;
};
export type GoogleSheetsRangeResponse = {
    spreadsheetId: string;
    spreadsheetTitle: string;
    tabs: GoogleSheetTab[];
    selectedTab?: string;
    range?: GoogleSheetRangeSelection;
    cells?: GoogleSheetCell[][];
    rowHeights?: number[];
    columnWidths?: number[];
    merges?: GoogleSheetMergeRange[];
    values?: string[][];
    totalRows?: number;
    totalColumns?: number;
};
export type GoogleSheetsUpdateRangeResponse = {
    spreadsheetId: string;
    spreadsheetTitle: string;
    selectedTab: string;
    updatedRange: string;
    updatedRows: number;
    updatedColumns: number;
    updatedCells: number;
};
export declare class GoogleSheetsRequestError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string);
}
export declare function fetchGoogleSheetsRange(input: GoogleSheetsRangeRequest): Promise<GoogleSheetsRangeResponse>;
export declare function updateGoogleSheetsRange(input: GoogleSheetsUpdateRangeRequest): Promise<GoogleSheetsUpdateRangeResponse>;
//# sourceMappingURL=googleSheets.d.ts.map