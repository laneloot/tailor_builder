"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCRAPER_SOURCES = void 0;
exports.isSupportedScraperSource = isSupportedScraperSource;
exports.listScraperProviderCatalog = listScraperProviderCatalog;
exports.resolveScraperProvider = resolveScraperProvider;
const { runLinkedInScraper, runIndeedScraper, runJobBoardScraper, runWellfoundScraper, runLeverScraper, runHiringCafeScraper, runHiringCafeCrawlerbrosScraper, runHiringCafeMemo23Scraper, } = require('../../scrapers');
exports.SCRAPER_SOURCES = ['linkedin', 'indeed', 'jobboard', 'wellfound', 'lever', 'hiringcafe'];
const SCRAPER_PROVIDER_REGISTRY = {
    linkedin: {
        defaultProviderId: 'apify-bebity',
        providers: [
            {
                id: 'apify-bebity',
                label: 'Apify: Bebity',
                description: 'Runs bebity/linkedin-jobs-scraper with fixed United States, remote, and past-24-hours filters.',
                run: (filters) => runLinkedInScraper(filters),
            },
        ],
    },
    indeed: {
        defaultProviderId: 'apify-misceres',
        providers: [
            {
                id: 'apify-misceres',
                label: 'Apify: Misceres',
                description: 'Dedicated Indeed scraper that runs from a pasted Indeed start URL.',
                run: (filters) => runIndeedScraper(filters),
            },
        ],
    },
    jobboard: {
        defaultProviderId: 'apify-jobboard',
        providers: [
            {
                id: 'apify-jobboard',
                label: 'Apify Job Board',
                description: 'Multi-board community scraper across major public job boards.',
                run: (filters) => runJobBoardScraper(filters),
            },
        ],
    },
    wellfound: {
        defaultProviderId: 'apify-wellfound',
        providers: [
            {
                id: 'apify-wellfound',
                label: 'Apify Wellfound',
                description: 'Current Wellfound actor integration.',
                run: (filters) => runWellfoundScraper(filters),
            },
        ],
    },
    lever: {
        defaultProviderId: 'apify-lever',
        providers: [
            {
                id: 'apify-lever',
                label: 'Apify Lever',
                description: 'Current Lever actor integration.',
                run: (filters) => runLeverScraper(filters),
            },
        ],
    },
    hiringcafe: {
        defaultProviderId: 'apify-manojachari',
        providers: [
            {
                id: 'apify-manojachari',
                label: 'Apify: Manoj Achari',
                description: 'Current Hiring Cafe actor using the internal API and Cloudflare bypass.',
                run: (filters) => runHiringCafeScraper(filters),
            },
            {
                id: 'apify-crawlerbros',
                label: 'Apify: CrawlerBros',
                description: 'Alternative Hiring Cafe actor with a broader structured output schema.',
                run: (filters) => runHiringCafeCrawlerbrosScraper(filters),
            },
            {
                id: 'apify-memo23',
                label: 'Apify: memo23',
                description: 'Alternative Hiring Cafe actor that runs from a pasted Hiring Cafe start URL and returns richer nested job metadata.',
                run: (filters) => runHiringCafeMemo23Scraper(filters),
            },
        ],
    },
};
function isSupportedScraperSource(value) {
    return exports.SCRAPER_SOURCES.includes(value);
}
function listScraperProviderCatalog() {
    return exports.SCRAPER_SOURCES.map((source) => ({
        source,
        defaultProviderId: SCRAPER_PROVIDER_REGISTRY[source].defaultProviderId,
        providers: SCRAPER_PROVIDER_REGISTRY[source].providers.map(({ id, label, description }) => ({
            id,
            label,
            description,
        })),
    }));
}
function resolveScraperProvider(source, providerId) {
    const sourceRegistry = SCRAPER_PROVIDER_REGISTRY[source];
    const effectiveProviderId = providerId?.trim() || sourceRegistry.defaultProviderId;
    const provider = sourceRegistry.providers.find((entry) => entry.id === effectiveProviderId);
    if (!provider) {
        throw new Error(`Unknown scraper provider "${effectiveProviderId}" for source "${source}".`);
    }
    return provider;
}
//# sourceMappingURL=scraperProviders.js.map