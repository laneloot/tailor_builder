export type LinkedInPostedSince = 'past-24-hours' | 'past-week' | 'past-month';
export interface LinkedInJobCriteria {
    label: string;
    value: string;
}
export interface LinkedInJobResult {
    id: string;
    title: string;
    company: string;
    jobId: string | null;
    jobTitle: string | null;
    companyName: string | null;
    companyLogo: string | null;
    companyWebsite: string | null;
    location: string | null;
    postedAtText: string;
    postedAtIso: string | null;
    link: string | null;
    jobUrl: string;
    applyUrl: string | null;
    easyApply: boolean | null;
    descriptionText: string | null;
    postedAt: string | null;
    externalApplyUrl: string | null;
    applyText: string;
    workplaceType: string;
    employmentType: string | null;
    experienceLevel: string | null;
    seniorityLevel: string;
    workplaceTypes: string[] | null;
    jobFunction: string;
    industries: string;
    sector: string | null;
    description: string;
    insights: string[];
    criteria: LinkedInJobCriteria[];
}
export interface LinkedInJobSearchInput {
    keywords: string;
    postedSince?: LinkedInPostedSince;
    limit?: number;
    onJobCollected?: (job: LinkedInJobResult) => Promise<void> | void;
}
export interface LinkedInJobSearchResult {
    fetchedAt: string;
    filters: {
        keywords: string;
        postedSince: LinkedInPostedSince;
        location: string;
        workplaceType: 'remote';
        excludeEasyApply: true;
        limit: number;
    };
    results: LinkedInJobResult[];
}
export declare function hasLinkedInExternalApplyUrl(job: LinkedInJobResult): boolean;
type ApifyLinkedInActorInput = {
    urls: string[];
    count: number;
    proxy: {
        useApifyProxy: boolean;
    };
};
type ApifyLinkedInJobItem = {
    id?: string | number;
    jobId?: string | number;
    jobTitle?: string;
    title?: string;
    companyName?: string;
    company?: string;
    companyLogo?: string;
    companyWebsite?: string;
    location?: string;
    link?: string;
    jobUrl?: string;
    url?: string;
    externalApplyLink?: string;
    applyUrl?: string;
    easyApply?: boolean;
    description?: string;
    descriptionText?: string;
    descriptionHtml?: string;
    postedAt?: string;
    publishedAt?: string;
    postedTime?: string;
    contractType?: string;
    employmentType?: string;
    experienceLevel?: string;
    seniorityLevel?: string;
    workType?: string;
    jobFunction?: string;
    sector?: string;
    industries?: string;
    applyType?: string;
    workplaceTypes?: string[] | string;
};
export declare function mapApifyLinkedInJobItem(item: ApifyLinkedInJobItem): LinkedInJobResult | null;
export declare function normalizeLinkedInLimit(value: unknown): number;
export declare function resolveLinkedInPostedSince(value: unknown): LinkedInPostedSince;
export declare function expandLinkedInSearchKeywords(keywords: string): string[];
export declare function buildLinkedInJobSearchUrl(input: {
    keywords: string;
    postedSince: LinkedInPostedSince;
}): string;
export declare function buildLinkedInApifyActorInput(input: {
    keywords: string;
    postedSince: LinkedInPostedSince;
    limit: number;
}): ApifyLinkedInActorInput;
export declare function searchLinkedInRemoteJobs(input: LinkedInJobSearchInput): Promise<LinkedInJobSearchResult>;
export {};
//# sourceMappingURL=linkedinJobs.d.ts.map