"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { supportedSourceNames } from "@adluv/config";
import { postDiscordErrorNotification } from "@adluv/config/discord-errors";
import {
  type AdvertiserSearchCachedResult,
  createTrackedCompany,
  ensureUserEntitlements,
  ensureUserNotificationSettings,
  getAdvertiserSearchQueryById,
  getTrackedCompanyUserSyncContext,
  listAdvertiserSearchCachedResults,
  listAdvertiserSearchCompanyResults,
  listAdvertiserSearchQuerySourceStatuses,
  markTrackedCompanyRetryQueued,
  recordJobQueued,
  replaceAdvertiserSearchCachedResultsForSource,
  replaceAdvertiserSearchCompanyResults,
  removeAdvertiserEntityFromWatchlist,
  removeTrackedCompanyFromWatchlist,
  searchAdvertiserAliasesForUser,
  searchAdvertisersForUser,
  updateAdvertiserSearchAutoAddStatus,
  upsertAdvertiserSearchAutoAdd,
  upsertAdvertiserSearchQuery,
  upsertAdvertiserSearchQuerySourceStatus,
  upsertAdvertiser,
} from "@adluv/db";
import {
  createSourceAdapter,
  isE2eFixtureMode,
  isPlausibleDomainAdvertiserNameMatch,
  isValidSourceAdvertiserId,
  loadGoogleRpcProxyUrlsFromEnvAsync,
  loadMetaProxyUrlsFromEnvAsync,
  normalizeAdvertiserText,
  normalizeAdvertiserCoreText,
  resolveAdvertiserSummary,
  type AdvertiserMatch,
  type SourceName,
} from "@adluv/source-adapters";

import { searchCompaniesOnWeb } from "../../lib/company-discovery";
import { getAdvertiserSearchQueue, getInitialIndexQueue, getScheduledSyncQueue } from "../../lib/queues";
import { getCurrentWorkspaceContext } from "../../lib/workspace";
import {
  buildCompanyCards,
  buildCompanyKey,
  buildCompanyKeyForResult,
  buildDiscoveredCompanyFromDomain,
  buildProviderSearchDisplayQuery,
  buildSearchQueryVariants,
  getAdvertiserSearchUserErrorMessage,
  getSearchInputDomain,
  isRateLimitProviderMessage,
  parseAdvertiserTrackingInput,
  resolveCompanyKeyForResult,
  selectBestCompanyResultsForTracking,
  type SearchResultItem,
} from "./advertiser-search-core";

function getWebScrapingApiProxyOptions() {
  const username = process.env.WEBSCRAPINGAPI_PROXY_USERNAME?.trim();
  const password = process.env.WEBSCRAPINGAPI_PROXY_PASSWORD?.trim();
  const url = process.env.WEBSCRAPINGAPI_PROXY_URL?.trim();

  if (!url) {
    return undefined;
  }

  return username && password ? { username, password, url } : { url };
}

const advertiserSchema = z.object({
  id: z.string(),
  source: z.enum(["linkedin", "facebook", "google", "tiktok"]),
  sourceAdvertiserId: z.string(),
  canonicalName: z.string(),
  profileUrl: z.string().optional(),
  websiteUrl: z.string().optional(),
  logoUrl: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  country: z.string().optional(),
  summary: z.string().optional(),
});

type SearchSourceFilter = SourceName | "all";
const minAdvertiserQueryLength = 2;
const advertiserSearchFreshnessMs = 24 * 60 * 60 * 1000;
const advertiserSearchJobVersion = "v2";
const advertiserSearchCacheVersion = "v2";

function toSearchResultItem(match: {
  id: string;
  source: SourceName;
  sourceAdvertiserId: string;
  canonicalName: string;
  profileUrl?: string | null;
  logoUrl?: string | null;
  industry?: string | null;
  companySize?: string | null;
  country?: string | null;
  summary?: string | null;
  trackedCompanyId?: string | null;
  trackedStatus?: "pending_initial_index" | "active" | "retryable_error" | "paused" | null;
}): SearchResultItem {
  return {
    id: match.id,
    source: match.source,
    sourceAdvertiserId: match.sourceAdvertiserId,
    canonicalName: match.canonicalName,
    profileUrl: match.profileUrl ?? undefined,
    logoUrl: match.logoUrl ?? undefined,
    industry: match.industry ?? undefined,
    companySize: match.companySize ?? undefined,
    country: match.country ?? undefined,
    summary: match.summary ?? undefined,
    trackedCompanyId: match.trackedCompanyId ?? null,
    trackedStatus: match.trackedStatus ?? null,
  };
}

function mergeUniqueSearchResultItems(current: SearchResultItem[], incoming: SearchResultItem[]) {
  const seenKeys = new Set(current.map((match) => `${match.source}:${match.sourceAdvertiserId}`));

  for (const match of incoming) {
    const key = `${match.source}:${match.sourceAdvertiserId}`;

    if (seenKeys.has(key)) {
      continue;
    }

    current.push(match);
    seenKeys.add(key);
  }

  return current;
}

function toSearchResultItemFromCachedResult(match: AdvertiserSearchCachedResult): SearchResultItem {
  return {
    id: match.advertiserId,
    source: match.source,
    sourceAdvertiserId: match.sourceAdvertiserId,
    canonicalName: match.canonicalName,
    profileUrl: match.profileUrl ?? undefined,
    companyKey: match.companyKey,
    logoUrl: match.logoUrl ?? undefined,
    industry: match.industry ?? undefined,
    companySize: match.companySize ?? undefined,
    country: match.country ?? undefined,
    summary: match.summary ?? undefined,
    trackedCompanyId: null,
    trackedStatus: null,
  };
}

function getAdvertiserSearchJobId(normalizedQuery: string) {
  return ["advertiser-search", advertiserSearchJobVersion, normalizedQuery]
    .join("__")
    .replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function getAdvertiserSearchCacheKey(normalizedQuery: string) {
  return `${advertiserSearchCacheVersion}:${normalizedQuery}`;
}

async function cacheDirectAdvertiserLinkResults(input: {
  queryId: string;
  links: Array<{ source: "facebook" | "google" | "linkedin"; value: string }>;
  companyKey?: string | null;
}): Promise<AdvertiserMatch[]> {
  const linksBySource = new Map<SourceName, string[]>();
  const directMatches: AdvertiserMatch[] = [];

  for (const link of input.links) {
    linksBySource.set(link.source, [...(linksBySource.get(link.source) ?? []), link.value]);
  }

  for (const [source, links] of linksBySource.entries()) {
    const startedAt = new Date();

    await upsertAdvertiserSearchQuerySourceStatus({
      queryId: input.queryId,
      source,
      status: "pending",
      errorMessage: null,
      startedAt,
      finishedAt: null,
    });

    try {
      const [googleRpcProxyUrls, metaProxyUrls] = await Promise.all([
        loadGoogleRpcProxyUrlsFromEnvAsync(),
        loadMetaProxyUrlsFromEnvAsync(),
      ]);
      const adapter = createSourceAdapter(source, {
        googleRpcProxyUrls,
        metaProxyUrls,
        metaTransportOrder: "proxy-first",
        webScrapingApiProxy: source === "facebook" ? undefined : getWebScrapingApiProxyOptions(),
        webScrapingApiKey: source === "facebook" ? undefined : process.env.WEBSCRAPINGAPI_API_KEY?.trim() || undefined,
      });
      const matches: AdvertiserMatch[] = [];

      for (const link of links) {
        matches.push(...(await adapter.searchAdvertisers(link)));
      }

      const dedupedMatches = [...new Map(matches.map((match) => [`${match.source}:${match.sourceAdvertiserId}`, match])).values()];
      directMatches.push(...dedupedMatches);

      await replaceAdvertiserSearchCachedResultsForSource({
        queryId: input.queryId,
        source,
        results: dedupedMatches.map((match, index) => {
          const companyKey =
            input.companyKey ??
            buildCompanyKeyForResult({
              query: match.websiteUrl ?? match.canonicalName,
              resultName: match.canonicalName,
              resultWebsiteUrl: match.websiteUrl,
            });

          return {
            advertiserId: match.id,
            sourceAdvertiserId: match.sourceAdvertiserId,
            companyKey,
            displayName: match.canonicalName,
            rankScore: Math.max(1, 10_000 - index * 10),
            canonicalName: match.canonicalName,
            profileUrl: match.profileUrl ?? null,
            logoUrl: match.logoUrl ?? null,
            industry: match.industry ?? null,
            companySize: match.companySize ?? null,
            country: match.country ?? null,
            summary: match.summary ?? null,
          };
        }),
      });

      await upsertAdvertiserSearchQuerySourceStatus({
        queryId: input.queryId,
        source,
        status: "completed",
        errorMessage: null,
        startedAt,
        finishedAt: new Date(),
      });
    } catch (error) {
      await replaceAdvertiserSearchCachedResultsForSource({
        queryId: input.queryId,
        source,
        results: [],
      });
      await upsertAdvertiserSearchQuerySourceStatus({
        queryId: input.queryId,
        source,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Advertiser link lookup failed.",
        startedAt,
        finishedAt: new Date(),
      });
      await postDiscordErrorNotification({
        service: "adluv-app",
        event: "advertiser_discovery.direct_link_lookup_failed",
        title: "Advertiser discovery direct link lookup failed",
        error,
        context: {
          queryId: input.queryId,
          source,
          links,
          companyKey: input.companyKey ?? null,
        },
      });
    }
  }

  return directMatches;
}

function isAdvertiserSearchFresh(refreshedAt: Date | null) {
  return Boolean(refreshedAt && Date.now() - refreshedAt.getTime() < advertiserSearchFreshnessMs);
}

async function queueAdvertiserSearchProviderMatch(input: {
  normalizedQuery: string;
  displayQuery: string;
}) {
  const job = await getAdvertiserSearchQueue().add(
    "advertiser-search",
    {
      normalizedQuery: input.normalizedQuery,
      displayQuery: input.displayQuery,
    },
    {
      jobId: getAdvertiserSearchJobId(input.normalizedQuery),
    },
  );

  await recordJobQueued({
    id: String(job.id),
    queueName: job.queueName,
    payload: job.data,
  });
}

function getTrackingActionErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.includes("DATABASE_URL is not configured")
      ? "Database connection is not configured for the app runtime."
      : error.message.includes("doesn't exist") || error.message.includes("Failed query")
        ? "Database schema is missing. Run the Drizzle schema push before tracking companies."
        : error.message
    : "Unable to create the tracker. Check the database schema and queue configuration.";
}

function getAdvertiserSearchActionErrorMessage(error: unknown) {
  return getAdvertiserSearchUserErrorMessage(error);
}

function buildSafeJobId(...parts: Array<string | number>) {
  return parts
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join("__")
    .replace(/[^a-zA-Z0-9_-]+/g, "-");
}

async function queueInitialIndex(trackedCompanyId: string) {
  const job = await getInitialIndexQueue().add(
    "initial-index",
    {
      trackedCompanyId,
    },
    {
      jobId: buildSafeJobId("initial-index", trackedCompanyId),
    },
  );

  await recordJobQueued({
    id: String(job.id),
    queueName: job.queueName,
    payload: job.data,
  });
}

async function trackAdvertiserForUser(input: {
  userId: string;
  workspaceId: string;
  trackedCompanyId: string;
  match: {
    id: string;
    source: SourceName;
    sourceAdvertiserId: string;
    canonicalName: string;
    profileUrl?: string;
    websiteUrl?: string;
    logoUrl?: string;
    industry?: string;
    companySize?: string;
    country?: string;
    summary?: string;
    fallbackSummary?: string;
  };
}) {
  const summary = isE2eFixtureMode()
    ? input.match.summary
    : await resolveAdvertiserSummary({
        websiteUrl: input.match.websiteUrl,
        currentSummary: input.match.summary,
        fallbackSummary: input.match.fallbackSummary,
      }) ?? undefined;
  const advertiser = await upsertAdvertiser({
    id: input.match.id,
    source: input.match.source,
    sourceAdvertiserId: input.match.sourceAdvertiserId,
    canonicalName: input.match.canonicalName,
    profileUrl: input.match.profileUrl,
    websiteUrl: input.match.websiteUrl,
    logoUrl: input.match.logoUrl,
    industry: input.match.industry,
    companySize: input.match.companySize,
    country: input.match.country,
    summary,
  });

  const { created, trackedCompany } = await createTrackedCompany({
    id: input.trackedCompanyId,
    userId: input.userId,
    workspaceId: input.workspaceId,
    advertiserId: advertiser.id,
  });

  if (created) {
    await queueInitialIndex(trackedCompany.id);
  }

  return {
    created,
    advertiser,
    trackedCompany,
  };
}

async function findLocalAdvertiserResultsForQuery(input: {
  userId: string;
  workspaceId: string;
  query: string;
  sources: SourceName[];
}) {
  const queryVariants = buildSearchQueryVariants(input.query);
  let localResults: SearchResultItem[] = [];

  for (const sourceName of input.sources) {
    for (const searchQuery of queryVariants) {
      const normalizedVariant = normalizeAdvertiserCoreText(searchQuery);
      const [indexedMatches, aliasMatches] = await Promise.all([
        searchAdvertisersForUser({
          userId: input.userId,
          workspaceId: input.workspaceId,
          source: sourceName,
          query: searchQuery,
        }),
        searchAdvertiserAliasesForUser({
          userId: input.userId,
          workspaceId: input.workspaceId,
          sources: [sourceName],
          normalizedQuery: normalizedVariant,
        }),
      ]);

      localResults = mergeUniqueSearchResultItems(localResults, [
        ...aliasMatches.map((match) => toSearchResultItem(match)),
        ...indexedMatches.map((match) => toSearchResultItem(match)),
      ]);
    }
  }

  return localResults;
}

function buildDiscoverySeedQueries(input: {
  query: string;
  localResults: SearchResultItem[];
}) {
  const queryCore = normalizeAdvertiserCoreText(input.query);

  if (!queryCore || input.query.trim().length > 3) {
    return [];
  }

  const seenNames = new Set<string>();

  return input.localResults
    .map((result) => result.canonicalName.trim())
    .filter(Boolean)
    .filter((name) => {
      const normalizedName = normalizeAdvertiserCoreText(name);

      if (!normalizedName || normalizedName === queryCore || !normalizedName.startsWith(queryCore)) {
        return false;
      }

      if (seenNames.has(normalizedName)) {
        return false;
      }

      seenNames.add(normalizedName);
      return true;
    })
    .slice(0, 3);
}

function buildFallbackDiscoveredCompany(query: string) {
  const inputDomain = getSearchInputDomain(query);

  if (inputDomain) {
    return buildDiscoveredCompanyFromDomain(inputDomain);
  }

  const normalizedQuery = normalizeAdvertiserCoreText(query) || normalizeAdvertiserText(query);
  const displayName = normalizedQuery
    ? normalizedQuery
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" ")
    : query.trim();
  const companyKey = buildCompanyKey(displayName);
  const domainCandidate = normalizedQuery && /^[a-z0-9-]+(?:\s+[a-z0-9-]+)*$/.test(normalizedQuery)
    ? `${normalizedQuery.replace(/\s+/g, "")}.com`
    : null;

  return {
    companyKey,
    displayName,
    websiteUrl: domainCandidate ? `https://${domainCandidate}/` : null,
    domain: domainCandidate,
    logoUrl: domainCandidate
      ? `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(`https://${domainCandidate}`)}`
      : null,
    description: null,
    rankScore: 1,
  };
}

function shouldUpgradeFallbackDiscoveredCompany(input: {
  query: string;
  company: {
    companyKey: string;
    displayName: string;
    domain: string | null;
    logoUrl: string | null;
  };
}) {
  const queryKey = buildCompanyKey(input.query);
  const companyNameKey = buildCompanyKey(input.company.displayName);

  return (
    input.company.companyKey === queryKey &&
    companyNameKey === queryKey &&
    (!input.company.domain || !input.company.logoUrl || input.company.displayName !== buildFallbackDiscoveredCompany(input.query).displayName)
  );
}

function shouldQueueAdvertiserSearch(input: {
  refreshedAt: Date | null;
  sourceStatuses: Array<{ source: SourceName; status: string }>;
  sources: SourceName[];
}) {
  if (!isAdvertiserSearchFresh(input.refreshedAt)) {
    return true;
  }

  const statusBySource = new Map(input.sourceStatuses.map((status) => [status.source, status.status]));

  return input.sources.some((sourceName) => {
    const status = statusBySource.get(sourceName);
    return status !== "completed" && status !== "failed";
  });
}

export async function searchAdvertisersAction(query: string, source: SearchSourceFilter = "all") {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return {
      status: "ok" as const,
      queryId: null,
      companyCards: [],
      localResults: [],
      externalResults: [],
      results: [],
      hasPendingSources: false,
      warnings: [],
    };
  }

  if (trimmedQuery.length < minAdvertiserQueryLength) {
    return {
      status: "ok" as const,
      queryId: null,
      companyCards: [],
      localResults: [],
      externalResults: [],
      results: [],
      hasPendingSources: false,
      warnings: [],
    };
  }

  const sources = source === "all" ? [...supportedSourceNames] : [source];
  const parsedInput = parseAdvertiserTrackingInput(trimmedQuery);
  const directLinks = parsedInput.directLinks.filter((link) => sources.includes(link.source));

  if (!parsedInput.primaryCompanyDomain && !directLinks.length) {
    return {
      status: "error" as const,
      message: "Enter a company URL or ad library link, not a brand name.",
    };
  }

  if (parsedInput.invalidValues.length) {
    return {
      status: "error" as const,
      message: "Only company URLs and ad library links are supported.",
    };
  }

  const searchDisplayQuery = parsedInput.primaryCompanyDomain?.normalizedDomain ?? trimmedQuery;
  const baseNormalizedQuery =
    parsedInput.primaryCompanyDomain?.normalizedDomain ??
    normalizeAdvertiserCoreText(trimmedQuery) ??
    normalizeAdvertiserText(trimmedQuery);
  const normalizedQuery = getAdvertiserSearchCacheKey(baseNormalizedQuery);

  try {
    const queryRecord = await upsertAdvertiserSearchQuery({
      normalizedQuery,
      displayQuery: searchDisplayQuery,
    });

    if (!queryRecord) {
      throw new Error("Advertiser search query could not be created.");
    }

    if (isE2eFixtureMode() && /e2e-rate-limit/i.test(trimmedQuery)) {
      throw new Error("Rate limit exceeded");
    }

    if (parsedInput.primaryCompanyDomain) {
      await replaceAdvertiserSearchCompanyResults({
        queryId: queryRecord.id,
        results: [buildDiscoveredCompanyFromDomain(parsedInput.primaryCompanyDomain)],
      });
    }

    let directMatches: AdvertiserMatch[] = [];

    if (directLinks.length) {
      directMatches = await cacheDirectAdvertiserLinkResults({
        queryId: queryRecord.id,
        links: directLinks,
        companyKey: parsedInput.primaryCompanyDomain?.normalizedDomain,
      });
    }

    const providerSearchDisplayQuery = buildProviderSearchDisplayQuery({
      primaryCompanyDomain: parsedInput.primaryCompanyDomain,
      directMatches,
      fallbackQuery: searchDisplayQuery,
    });

    const localResults = await findLocalAdvertiserResultsForQuery({
      userId: user.id,
      workspaceId: workspace.id,
      query: providerSearchDisplayQuery,
      sources,
    });
    const discoverySeedQueries = buildDiscoverySeedQueries({
      query: providerSearchDisplayQuery,
      localResults,
    });

    const [cachedResults, cachedCompanyResults, sourceStatuses] = await Promise.all([
      listAdvertiserSearchCachedResults(queryRecord.id),
      listAdvertiserSearchCompanyResults(queryRecord.id),
      listAdvertiserSearchQuerySourceStatuses(queryRecord.id),
    ]);

    let discoveredCompanies = cachedCompanyResults.map((company) => ({
      companyKey: company.companyKey,
      displayName: company.displayName,
      websiteUrl: company.websiteUrl,
      domain: company.domain,
      logoUrl: company.logoUrl,
      description: company.description,
      rankScore: company.rankScore,
    }));

    if (discoveredCompanies.some((company) => shouldUpgradeFallbackDiscoveredCompany({ query: trimmedQuery, company }))) {
      const fallbackCompany = buildFallbackDiscoveredCompany(trimmedQuery);

      discoveredCompanies = discoveredCompanies.map((company) =>
        shouldUpgradeFallbackDiscoveredCompany({ query: trimmedQuery, company })
          ? { ...fallbackCompany, rankScore: Math.max(company.rankScore, fallbackCompany.rankScore) }
          : company,
      );

      await replaceAdvertiserSearchCompanyResults({
        queryId: queryRecord.id,
        results: discoveredCompanies,
      });
    }

    if (!discoveredCompanies.length || trimmedQuery.length <= 3) {
      try {
        const fetchedCompanies = parsedInput.primaryCompanyDomain
          ? []
          : await searchCompaniesOnWeb(providerSearchDisplayQuery, {
              seedQueries: discoverySeedQueries,
            });

        if (fetchedCompanies.length) {
          await replaceAdvertiserSearchCompanyResults({
            queryId: queryRecord.id,
            results: fetchedCompanies,
          });
          discoveredCompanies = fetchedCompanies;
        } else if (providerSearchDisplayQuery.length <= 3) {
          discoveredCompanies = [];
        }
      } catch (error) {
        await postDiscordErrorNotification({
          service: "adluv-app",
          event: "advertiser_discovery.company_search_failed",
          title: "Advertiser discovery company search failed",
          error,
          context: {
            queryId: queryRecord.id,
            query: providerSearchDisplayQuery,
            seedQueries: discoverySeedQueries,
            userId: user.id,
            workspaceId: workspace.id,
          },
        });
        discoveredCompanies = cachedCompanyResults.map((company) => ({
          companyKey: company.companyKey,
          displayName: company.displayName,
          websiteUrl: company.websiteUrl,
          domain: company.domain,
          logoUrl: company.logoUrl,
          description: company.description,
          rankScore: company.rankScore,
        }));
      }
    }

    const filteredCachedResults = cachedResults
      .filter((result) => sources.includes(result.source))
      .sort((left, right) => right.rankScore - left.rankScore);
    const cachedSearchResults = filteredCachedResults.map((result) => toSearchResultItemFromCachedResult(result));
    const needsProviderMatch =
      shouldQueueAdvertiserSearch({
        refreshedAt: queryRecord.refreshedAt,
        sourceStatuses,
        sources,
      });

    if (
      !discoveredCompanies.length &&
      !localResults.length &&
      !cachedSearchResults.length &&
      needsProviderMatch
    ) {
      const fallbackCompany = buildFallbackDiscoveredCompany(providerSearchDisplayQuery);

      await replaceAdvertiserSearchCompanyResults({
        queryId: queryRecord.id,
        results: [fallbackCompany],
      });
      discoveredCompanies = [fallbackCompany];
    }

    if (needsProviderMatch) {
      await queueAdvertiserSearchProviderMatch({
        normalizedQuery: queryRecord.normalizedQuery,
        displayQuery: providerSearchDisplayQuery,
      });
    }

    const warnings = sourceStatuses
      .filter((status) => sources.includes(status.source) && status.status === "failed" && status.errorMessage)
      .map((status) => status.errorMessage as string)
      .filter((message) => !isRateLimitProviderMessage(message));
    const sourceStatusMap = new Map(
      sourceStatuses
        .filter((status) => sources.includes(status.source))
        .map((status) => [status.source, { status: status.status, errorMessage: status.errorMessage }]),
    );
    const groupedResults = buildCompanyCards({
      query: providerSearchDisplayQuery,
      discoveredCompanies,
      localResults,
      cachedResults: cachedSearchResults,
      sourceStatuses: sourceStatusMap,
      sources,
    });

    return {
      status: "ok" as const,
      queryId: queryRecord.id,
      companyCards: groupedResults.cards,
      localResults: groupedResults.localResults,
      externalResults: groupedResults.externalResults,
      results: groupedResults.results,
      hasPendingSources: needsProviderMatch,
      warnings,
    };
  } catch (error) {
    await postDiscordErrorNotification({
      service: "adluv-app",
      event: "advertiser_discovery.action_failed",
      title: "Advertiser discovery action failed",
      error,
      context: {
        query: trimmedQuery,
        source,
        userId: user.id,
        workspaceId: workspace.id,
      },
    });
    return {
      status: "error" as const,
      message: getAdvertiserSearchActionErrorMessage(error),
    };
  }
}

export async function createTrackedCompaniesForSearchCompanyAction(input: {
  queryId: string;
  companyKey: string;
}) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  try {
    await ensureUserEntitlements(user.id);
    await ensureUserNotificationSettings(user.id);

    const normalizedE2eCompanyKey = input.companyKey.replace(/\s+/g, "-").toLowerCase();

    if (isE2eFixtureMode() && normalizedE2eCompanyKey.includes("e2e-tracking-error")) {
      throw new Error("Fixture add advertiser failure.");
    }

    const [queryRecord, cachedResults, cachedCompanyResults, sourceStatuses] = await Promise.all([
      getAdvertiserSearchQueryById(input.queryId),
      listAdvertiserSearchCachedResults(input.queryId),
      listAdvertiserSearchCompanyResults(input.queryId),
      listAdvertiserSearchQuerySourceStatuses(input.queryId),
    ]);

    if (!queryRecord) {
      return {
        status: "error" as const,
        message: "Advertiser search query could not be found.",
      };
    }

    const knownCompanyKeys = new Set(cachedCompanyResults.map((company) => company.companyKey));
    const localResults = await findLocalAdvertiserResultsForQuery({
      userId: user.id,
      workspaceId: workspace.id,
      query: queryRecord.displayQuery,
      sources: [...supportedSourceNames],
    });
    const companyExists = cachedCompanyResults.some((company) => company.companyKey === input.companyKey);
    const selectedCompany = cachedCompanyResults.find((company) => company.companyKey === input.companyKey) ?? null;
    const companyResults = [
      ...localResults
        .filter(
          (result) =>
            resolveCompanyKeyForResult({
              query: queryRecord.displayQuery,
              resultName: result.canonicalName,
              resultWebsiteUrl: result.profileUrl,
              existingCompanyKeys: knownCompanyKeys,
            }) === input.companyKey,
        )
        .map((result) => ({
          advertiserId: result.id,
          source: result.source,
          sourceAdvertiserId: result.sourceAdvertiserId,
          companyKey: input.companyKey,
          rankScore: 10_000,
          canonicalName: result.canonicalName,
          profileUrl: result.profileUrl ?? null,
          logoUrl: result.logoUrl ?? null,
          industry: result.industry ?? null,
          companySize: result.companySize ?? null,
          country: result.country ?? null,
          summary: result.summary ?? null,
        })),
      ...cachedResults.filter((result) => result.companyKey === input.companyKey),
    ]
      .sort((left, right) => right.rankScore - left.rankScore)
      .filter((result, index, collection) =>
        collection.findIndex(
          (candidate) =>
            candidate.source === result.source &&
            candidate.sourceAdvertiserId === result.sourceAdvertiserId,
        ) === index,
      )
      .filter((result) =>
        selectedCompany?.domain
          ? isPlausibleDomainAdvertiserNameMatch({
              normalizedDomain: selectedCompany.domain,
              candidateName: result.canonicalName,
            })
          : true,
      );

    if (!companyExists && !companyResults.length) {
      return {
        status: "error" as const,
        message: "No cached advertiser search card exists for this company yet.",
      };
    }

    const providerStatuses = new Map(sourceStatuses.map((status) => [status.source, status.status]));
    const isFresh = isAdvertiserSearchFresh(queryRecord.refreshedAt);
    const parsedQueryInput = parseAdvertiserTrackingInput(queryRecord.displayQuery);
    const canQueueProviderMatch = Boolean(parsedQueryInput.primaryCompanyDomain || !parsedQueryInput.directLinks.length);
    const needsProviderMatch =
      canQueueProviderMatch &&
      (!isFresh ||
        supportedSourceNames.some((sourceName) => {
          const status = providerStatuses.get(sourceName);
          return status !== "completed" && status !== "failed";
        }));

    if (needsProviderMatch) {
      await queueAdvertiserSearchProviderMatch({
        normalizedQuery: queryRecord.normalizedQuery,
        displayQuery: queryRecord.displayQuery,
      });
    }

    const isFullyResolved = supportedSourceNames.every((sourceName) => {
      if (sourceName === "facebook" || sourceName === "linkedin" || sourceName === "google") {
        return providerStatuses.get(sourceName) === "completed" || providerStatuses.get(sourceName) === "failed";
      }

      return true;
    });

    const resultsToTrack = selectBestCompanyResultsForTracking(companyResults);
    const trackedCompanies = [];
    let capacityExhausted = false;

    for (const match of resultsToTrack) {
      if (!isE2eFixtureMode() && !isValidSourceAdvertiserId(match.source, match.sourceAdvertiserId)) {
        continue;
      }

      try {
        const tracked = await trackAdvertiserForUser({
          userId: user.id,
          workspaceId: workspace.id,
          trackedCompanyId: randomUUID(),
          match: {
            id: match.advertiserId,
            source: match.source,
            sourceAdvertiserId: match.sourceAdvertiserId,
            canonicalName: match.canonicalName,
            profileUrl: match.profileUrl ?? undefined,
            websiteUrl:
              selectedCompany?.websiteUrl ??
              (selectedCompany?.domain ? `https://${selectedCompany.domain}/` : undefined),
            logoUrl: match.logoUrl ?? undefined,
            industry: match.industry ?? undefined,
            companySize: match.companySize ?? undefined,
            country: match.country ?? undefined,
            summary: match.summary ?? undefined,
            fallbackSummary: selectedCompany?.description ?? undefined,
          },
        });

        trackedCompanies.push({
          id: tracked.trackedCompany.id,
          status: tracked.trackedCompany.status,
          advertiserId: tracked.advertiser.id,
          canonicalName: tracked.advertiser.canonicalName,
          logoUrl: tracked.advertiser.logoUrl ?? null,
          profileUrl: tracked.advertiser.profileUrl ?? null,
          source: tracked.advertiser.source,
          queued: tracked.created,
        });
      } catch (error) {
        if (error instanceof Error && error.message.includes("Tracked company limit reached")) {
          capacityExhausted = true;
          break;
        }

        throw error;
      }
    }

    let autoAddStatus: "none" | "active" | "completed" | "capacity_exhausted" = "none";

    if (!companyResults.length && isFullyResolved) {
      return {
        status: "error" as const,
        message: "No advertiser matches were found for this company.",
      };
    }

    if (!isFullyResolved) {
      await upsertAdvertiserSearchAutoAdd({
        userId: user.id,
        workspaceId: workspace.id,
        queryId: input.queryId,
        companyKey: input.companyKey,
      });
      autoAddStatus = "active";
    } else if (capacityExhausted) {
      const activeAutoAdd = await upsertAdvertiserSearchAutoAdd({
        userId: user.id,
        workspaceId: workspace.id,
        queryId: input.queryId,
        companyKey: input.companyKey,
      });
      await updateAdvertiserSearchAutoAddStatus({
        id: activeAutoAdd.id,
        status: "capacity_exhausted",
      });
      autoAddStatus = "capacity_exhausted";
    }

    revalidatePath("/activity");
    revalidatePath("/watchlist");
    revalidatePath("/advertisers");

    return {
      status: "ok" as const,
      trackedCompanies,
      autoAddStatus,
      totalMatchedProviders: resultsToTrack.length,
    };
  } catch (error) {
    await postDiscordErrorNotification({
      service: "adluv-app",
      event: "advertiser_add.search_company_failed",
      title: "Add advertiser from search company failed",
      error,
      context: {
        queryId: input.queryId,
        companyKey: input.companyKey,
        userId: user.id,
        workspaceId: workspace.id,
      },
    });
    return {
      status: "error" as const,
      message: getTrackingActionErrorMessage(error),
    };
  }
}

export async function createTrackedCompanyAction(input: {
  id: string;
  source: SourceName;
  sourceAdvertiserId: string;
  canonicalName: string;
  profileUrl?: string;
  websiteUrl?: string;
  logoUrl?: string;
  industry?: string;
  companySize?: string;
  country?: string;
  summary?: string;
}) {
  const context = await getCurrentWorkspaceContext();
  const trackedCompanyId = randomUUID();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  try {
    const payload = advertiserSchema.parse(input);

    if (!isE2eFixtureMode() && !isValidSourceAdvertiserId(payload.source, payload.sourceAdvertiserId)) {
      return {
        status: "error" as const,
        message: `Refusing to track an invalid ${payload.source} advertiser identity.`,
      };
    }

    await ensureUserEntitlements(user.id);
    await ensureUserNotificationSettings(user.id);
    const { advertiser, created, trackedCompany } = await trackAdvertiserForUser({
      userId: user.id,
      workspaceId: workspace.id,
      trackedCompanyId,
      match: payload,
    });

    revalidatePath("/activity");
    revalidatePath("/watchlist");
    revalidatePath("/advertisers");

    return {
      status: created ? ("queued" as const) : ("existing" as const),
      queued: created,
      trackedCompany: {
        id: trackedCompany.id,
        status: trackedCompany.status,
        advertiserId: advertiser.id,
        canonicalName: advertiser.canonicalName,
        logoUrl: advertiser.logoUrl ?? null,
        profileUrl: advertiser.profileUrl ?? null,
      },
    };
  } catch (error) {
    await postDiscordErrorNotification({
      service: "adluv-app",
      event: "advertiser_add.direct_match_failed",
      title: "Add advertiser direct match failed",
      error,
      context: {
        trackedCompanyId,
        input,
        userId: user.id,
        workspaceId: workspace.id,
      },
    });
    return {
      status: "error" as const,
      message: getTrackingActionErrorMessage(error),
    };
  }
}

export async function retryTrackedCompanyAction(trackedCompanyId: string) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  try {
    const trackedCompany = await markTrackedCompanyRetryQueued({
      userId: user.id,
      workspaceId: workspace.id,
      trackedCompanyId,
    });

    if (!trackedCompany) {
      return {
        status: "error" as const,
        message: "Tracked company was not found.",
      };
    }

    if (trackedCompany.queueName === "initial-index") {
      const job = await getInitialIndexQueue().add(
        "initial-index",
        {
          trackedCompanyId: trackedCompany.trackedCompanyId,
        },
        {
          jobId: buildSafeJobId("initial-index", trackedCompany.trackedCompanyId),
        },
      );

      await recordJobQueued({
        id: String(job.id),
        queueName: job.queueName,
        payload: job.data,
      });
    } else {
      const job = await getScheduledSyncQueue().add("scheduled-sync", {
        trackedCompanyId: trackedCompany.trackedCompanyId,
      });

      await recordJobQueued({
        id: String(job.id),
        queueName: job.queueName,
        payload: job.data,
      });
    }

    revalidatePath("/activity");
    revalidatePath("/watchlist");

    return {
      status: "queued" as const,
      trackedCompany: {
        id: trackedCompany.trackedCompanyId,
        status: trackedCompany.nextStatus,
      },
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to resume updates.",
    };
  }
}

export async function syncTrackedCompanyNowAction(trackedCompanyId: string) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  try {
    const trackedCompany = await getTrackedCompanyUserSyncContext(user.id, trackedCompanyId, workspace.id);

    if (!trackedCompany) {
      return {
        status: "error" as const,
        message: "Tracked company was not found.",
      };
    }

    if (trackedCompany.status !== "active") {
      return {
        status: "error" as const,
        message:
          trackedCompany.status === "pending_initial_index"
            ? "Initial indexing is still in progress for this watchlist entry."
            : "This tracker needs recovery before it can run a manual sync.",
      };
    }

    const job = await getScheduledSyncQueue().add("scheduled-sync", {
      trackedCompanyId: trackedCompany.trackedCompanyId,
    });

    await recordJobQueued({
      id: String(job.id),
      queueName: job.queueName,
      payload: job.data,
    });

    revalidatePath("/activity");
    revalidatePath("/watchlist");
    revalidatePath(`/advertisers/${trackedCompany.advertiserId}`);

    return {
      status: "queued" as const,
      trackedCompany: {
        id: trackedCompany.trackedCompanyId,
        advertiserName: trackedCompany.advertiserName,
      },
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to queue a manual sync.",
    };
  }
}

export async function removeTrackedCompanyAction(trackedCompanyId: string) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  try {
    const trackedCompany = await removeTrackedCompanyFromWatchlist(user.id, trackedCompanyId, workspace.id);

    if (!trackedCompany) {
      return {
        status: "error" as const,
        message: "Tracked company was not found.",
      };
    }

    revalidatePath("/activity");
    revalidatePath("/watchlist");
    revalidatePath(`/advertisers/${trackedCompany.advertiserId}`);

    return {
      status: "removed" as const,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to remove this watchlist entry.",
    };
  }
}

export async function removeAdvertiserEntityFromWatchlistAction(advertiserId: string) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  try {
    const advertiser = await removeAdvertiserEntityFromWatchlist(user.id, advertiserId, workspace.id);

    if (!advertiser) {
      return {
        status: "error" as const,
        message: "Watchlist entry was not found.",
      };
    }

    revalidatePath("/activity");
    revalidatePath("/watchlist");
    revalidatePath("/advertisers");
    revalidatePath(`/advertisers/${advertiserId}`);

    return {
      status: "removed" as const,
      trackedCompanyIds: advertiser.trackedCompanyIds,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to remove this watchlist entry.",
    };
  }
}
