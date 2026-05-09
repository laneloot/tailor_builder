declare const router: import("express-serve-static-core").Router;
type ExportRowIdentity = {
    companyName: string;
    jobTitle: string;
    jobLink: string;
};
declare function buildExportRowDuplicateKeys(identity: ExportRowIdentity): string[];
declare function shouldSkipExistingFilterRow(input: {
    jobLink: string;
    existingAnalysisValues: string[];
}): boolean;
export { buildExportRowDuplicateKeys, shouldSkipExistingFilterRow };
export default router;
//# sourceMappingURL=jobs.d.ts.map