export declare const SCRAPER_SOURCES: readonly ["linkedin", "indeed", "jobboard", "wellfound", "lever", "hiringcafe"];
export type ScraperSource = (typeof SCRAPER_SOURCES)[number];
export type UnifiedScraperFilters = {
    title?: string;
    rows?: number;
    keywords?: string;
    startUrl?: string;
    location?: string;
    timePosted?: '24h' | '3d' | '7d' | '30d';
    jobType?: 'full-time' | 'part-time' | 'contract' | 'internship' | 'temporary';
    remoteOnly?: boolean;
    maxResults?: number;
};
export type UnifiedScraperJob = {
    id: string;
    title: string;
    company: string;
    location: string;
    job_type: string;
    salary_min: number | null;
    salary_max: number | null;
    equity: string | null;
    posted_at: string | null;
    description: string;
    apply_url: string;
    source: ScraperSource;
    raw: Record<string, unknown>;
};
export type ScraperProviderSummary = {
    id: string;
    label: string;
    description: string;
};
export type ScraperSourceProviderCatalog = {
    source: ScraperSource;
    defaultProviderId: string;
    providers: ScraperProviderSummary[];
};
type ScraperProviderDefinition = ScraperProviderSummary & {
    run: (filters: UnifiedScraperFilters) => Promise<UnifiedScraperJob[]>;
};
export declare function isSupportedScraperSource(value: string): value is ScraperSource;
export declare function listScraperProviderCatalog(): ScraperSourceProviderCatalog[];
export declare function resolveScraperProvider(source: ScraperSource, providerId?: string): ScraperProviderDefinition;
export {};
//# sourceMappingURL=scraperProviders.d.ts.map