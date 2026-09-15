import { randomUUID } from "node:crypto";

import {
  createTrackedCompany,
  ensureUserNotificationSettings,
  getUserEntitlementSummary,
  listActiveAdvertiserSearchAutoAdds,
  listAdvertiserSearchCachedResults,
  listAdvertiserSearchCompanyResults,
  listAdvertiserSearchQuerySourceStatuses,
  markAdvertiserSearchQueryRefreshed,
  normalizeAdvertiserWebsite,
  replaceAdvertiserSearchCachedResultsForSource,
  updateAdvertiserSearchAutoAddStatus,
  upsertAdvertiser,
  upsertAdvertiserSearchQuery,
  upsertAdvertiserSearchQuerySourceStatus,
  isIgnoredAdvertiserDomain,
} from "@adluv/db";
import { postDiscordErrorNotification } from "@adluv/config/discord-errors";
import {
  buildAdvertiserCoreTokens,
  isE2eFixtureMode,
  isPlausibleDomainAdvertiserNameMatch,
  isValidSourceAdvertiserId,
  normalizeAdvertiserCoreText,
  normalizeAdvertiserText,
  resolveAdvertiserSummary,
  type AdvertiserMatch,
  type SourceAdapter,
} from "@adluv/source-adapters";
import { supportedSourceNames } from "@adluv/config";

import { materializeAdvertiserLogo } from "../advertiser-assets";
import { logWorkerEvent, toErrorContext } from "../logger";
import { buildSafeJobId, enqueueTrackedJob, queues } from "../queue";
import { createWorkerSourceAdapter } from "../source-adapter";

export type AdvertiserSearchJobPayload = {
  normalizedQuery: string;
  displayQuery: string;
};

const directInputRankFloor = 9_000;

function selectBestCompanyResultsForTracking<T extends { source: AdvertiserMatch["source"] }>(results: T[]) {
  const seenSources = new Set<AdvertiserMatch["source"]>();
  const selected: T[] = [];

  for (const result of results) {
    if (seenSources.has(result.source)) {
      continue;
    }

    seenSources.add(result.source);
    selected.push(result);
  }

  return selected;
}

function getSearchInputDomain(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const normalized = normalizeAdvertiserWebsite(trimmed);

  if (!normalized.normalizedDomain || isIgnoredAdvertiserDomain(normalized.normalizedDomain)) {
    return null;
  }

  if (!/^https?:\/\//i.test(trimmed) && !normalized.normalizedDomain.includes(".")) {
    return null;
  }

  return {
    normalizedDomain: normalized.normalizedDomain,
    brandQuery: normalized.normalizedDomain.split(".")[0] ?? normalized.normalizedDomain,
  };
}

function buildSearchQueryVariants(query: string) {
  const inputDomain = getSearchInputDomain(query);
  const variants = [query.trim()];
  const normalizedQuery = normalizeAdvertiserText(query);
  const coreQuery = normalizeAdvertiserCoreText(query);
  const dominantTokenQuery = buildAdvertiserCoreTokens(query).slice(0, 2).join(" ");

  for (const candidate of [
    inputDomain?.brandQuery,
    inputDomain?.normalizedDomain,
    coreQuery,
    normalizedQuery,
    dominantTokenQuery,
  ]) {
    if (!candidate) {
      continue;
    }

    const trimmedCandidate = candidate.trim();

    if (!trimmedCandidate || trimmedCandidate.length < 2) {
      continue;
    }

    if (variants.some((variant) => normalizeAdvertiserText(variant) === normalizeAdvertiserText(trimmedCandidate))) {
      continue;
    }

    variants.push(trimmedCandidate);
  }

  return variants;
}

function buildCompanyKey(name: string) {
  const normalizedCore = normalizeAdvertiserCoreText(name);

  if (normalizedCore) {
    return normalizedCore;
  }

  const normalized = normalizeAdvertiserText(name);
  return normalized || "unknown";
}

function buildResultCompanyKey(query: string, candidateName: string) {
  const inputDomain = getSearchInputDomain(query);

  if (inputDomain) {
    if (
      !isPlausibleDomainAdvertiserNameMatch({
        normalizedDomain: inputDomain.normalizedDomain,
        candidateName,
      })
    ) {
      return buildCompanyKey(candidateName);
    }

    return inputDomain.normalizedDomain;
  }

  const queryKey = normalizeAdvertiserCoreText(query) || normalizeAdvertiserText(query);
  const candidateKey = buildCompanyKey(candidateName);

  if (
    queryKey &&
    (candidateKey === queryKey ||
      candidateKey.startsWith(`${queryKey} `) ||
      candidateKey.includes(` ${queryKey}`))
  ) {
    return queryKey;
  }

  return candidateKey;
}

function toRankedResults(matches: AdvertiserMatch[]) {
  const dedupedMatches = new Map<string, AdvertiserMatch & { rankScore: number }>();

  matches.forEach((match, index) => {
    const rankScore = Math.max(1, 1000 - index * 10);
    const key = `${match.source}:${match.sourceAdvertiserId}`;
    const current = dedupedMatches.get(key);

    if (!current || rankScore > current.rankScore) {
      dedupedMatches.set(key, {
        ...match,
        rankScore,
      });
    }
  });

  return [...dedupedMatches.values()].sort((left, right) => right.rankScore - left.rankScore);
}

export async function searchAdvertiserVariants(adapter: SourceAdapter, variants: string[]) {
  const matches: AdvertiserMatch[] = [];
  let completedSearchCount = 0;
  let lastError: unknown = null;

  for (const variant of variants) {
    try {
      const searchResults = await adapter.searchAdvertisers(variant);
      completedSearchCount += 1;
      matches.push(...searchResults);
    } catch (error) {
      lastError = error;
    }
  }

  if (completedSearchCount === 0 && lastError) {
    throw lastError;
  }

  return matches;
}

async function processSourceSearch(queryId: string, source: (typeof supportedSourceNames)[number], displayQuery: string) {
  await upsertAdvertiserSearchQuerySourceStatus({
    queryId,
    source,
    status: "pending",
    errorMessage: null,
    startedAt: new Date(),
    finishedAt: null,
  });

  const adapter = await createWorkerSourceAdapter(source);
  const variants = buildSearchQueryVariants(displayQuery);
  const matches = await searchAdvertiserVariants(adapter, variants);

  const inputDomain = getSearchInputDomain(displayQuery);
  const hydratedResults = await Promise.all(
    toRankedResults(matches)
      .filter((match) =>
        inputDomain
          ? isPlausibleDomainAdvertiserNameMatch({
              normalizedDomain: inputDomain.normalizedDomain,
              candidateName: match.canonicalName,
            })
          : true,
      )
      .map(async (match) => {
        const hydratedMatch = await materializeAdvertiserLogo(match).catch(() => match);

        return {
          id: hydratedMatch.id,
          advertiserId: hydratedMatch.id,
          source: hydratedMatch.source,
          sourceAdvertiserId: hydratedMatch.sourceAdvertiserId,
          canonicalName: hydratedMatch.canonicalName,
          profileUrl: hydratedMatch.profileUrl,
          logoUrl: hydratedMatch.logoUrl,
          industry: hydratedMatch.industry,
          companySize: hydratedMatch.companySize,
          country: hydratedMatch.country,
          summary: hydratedMatch.summary,
          rankScore: match.rankScore,
          companyKey: buildResultCompanyKey(displayQuery, hydratedMatch.canonicalName),
          displayName: hydratedMatch.canonicalName,
        };
      }),
  );

  const existingDirectInputResults = (await listAdvertiserSearchCachedResults(queryId))
    .filter((result) => result.source === source && result.rankScore >= directInputRankFloor)
    .map((result) => ({
      advertiserId: result.advertiserId,
      sourceAdvertiserId: result.sourceAdvertiserId,
      companyKey: result.companyKey,
      displayName: result.displayName,
      rankScore: result.rankScore,
      canonicalName: result.canonicalName,
      profileUrl: result.profileUrl,
      logoUrl: result.logoUrl,
      industry: result.industry,
      companySize: result.companySize,
      country: result.country,
      summary: result.summary,
    }));
  const resultsByKey = new Map<string, (typeof existingDirectInputResults)[number]>(
    existingDirectInputResults.map((result) => [`${source}:${result.sourceAdvertiserId}`, result] as const),
  );

  for (const result of hydratedResults) {
    const key = `${source}:${result.sourceAdvertiserId}`;
    const current = resultsByKey.get(key);

    if (current && current.rankScore >= result.rankScore) {
      continue;
    }

    resultsByKey.set(key, {
      advertiserId: result.advertiserId,
      sourceAdvertiserId: result.sourceAdvertiserId,
      companyKey: result.companyKey,
      displayName: result.displayName,
      rankScore: result.rankScore,
      canonicalName: result.canonicalName,
      profileUrl: result.profileUrl ?? null,
      logoUrl: result.logoUrl ?? null,
      industry: result.industry ?? null,
      companySize: result.companySize ?? null,
      country: result.country ?? null,
      summary: result.summary ?? null,
    });
  }

  await replaceAdvertiserSearchCachedResultsForSource({
    queryId,
    source,
    results: [...resultsByKey.values()],
  });

  await upsertAdvertiserSearchQuerySourceStatus({
    queryId,
    source,
    status: "completed",
    errorMessage: null,
    startedAt: new Date(),
    finishedAt: new Date(),
  });

  return hydratedResults.length;
}

async function processAutoAdds(queryId: string) {
  const [autoAdds, cachedResults, companyResults, sourceStatuses] = await Promise.all([
    listActiveAdvertiserSearchAutoAdds(queryId),
    listAdvertiserSearchCachedResults(queryId),
    listAdvertiserSearchCompanyResults(queryId),
    listAdvertiserSearchQuerySourceStatuses(queryId),
  ]);

  if (!autoAdds.length) {
    return;
  }

  const sourceStatusMap = new Map(sourceStatuses.map((status) => [status.source, status.status]));
  const companyResultsByKey = new Map(companyResults.map((company) => [company.companyKey, company]));

  for (const autoAdd of autoAdds) {
    await ensureUserNotificationSettings(autoAdd.userId);

    const availableResults = cachedResults
      .filter((result) => result.companyKey === autoAdd.companyKey)
      .filter((result) => {
        const companyResult = companyResultsByKey.get(result.companyKey);

        return companyResult?.domain
          ? isPlausibleDomainAdvertiserNameMatch({
              normalizedDomain: companyResult.domain,
              candidateName: result.canonicalName,
            })
          : true;
      })
      .sort((left, right) => right.rankScore - left.rankScore);
    const resultsToTrack = selectBestCompanyResultsForTracking(availableResults);

    if (!resultsToTrack.length) {
      if (
        supportedSourceNames.every((source) => {
          const status = sourceStatusMap.get(source);
          return status === "completed" || status === "failed";
        })
      ) {
        await updateAdvertiserSearchAutoAddStatus({
          id: autoAdd.id,
          status: "completed",
        });
      }

      continue;
    }

    let capacityExhausted = false;

    for (const result of resultsToTrack) {
      if (!isE2eFixtureMode() && !isValidSourceAdvertiserId(result.source, result.sourceAdvertiserId)) {
        continue;
      }

      try {
        const companyResult = companyResultsByKey.get(result.companyKey);
        const websiteUrl =
          companyResult?.websiteUrl ?? (companyResult?.domain ? `https://${companyResult.domain}/` : undefined);
        const summary = isE2eFixtureMode()
          ? result.summary ?? undefined
          : await resolveAdvertiserSummary({
              websiteUrl,
              currentSummary: result.summary,
              fallbackSummary: companyResult?.description,
            }) ?? undefined;
        const advertiser = await upsertAdvertiser({
          id: result.advertiserId,
          source: result.source,
          sourceAdvertiserId: result.sourceAdvertiserId,
          canonicalName: result.canonicalName,
          profileUrl: result.profileUrl ?? undefined,
          websiteUrl,
          logoUrl: result.logoUrl ?? undefined,
          industry: result.industry ?? undefined,
          companySize: result.companySize ?? undefined,
          country: result.country ?? undefined,
          summary,
        });

        await Promise.all(
          advertiser.fanoutTrackedCompanyIds.map((fanoutTrackedCompanyId) =>
            enqueueTrackedJob(
              queues.initialIndex,
              "initial-index",
              { trackedCompanyId: fanoutTrackedCompanyId },
              {
                jobId: buildSafeJobId("initial-index", fanoutTrackedCompanyId),
              },
            ),
          ),
        );

        const trackedCompany = await createTrackedCompany({
          id: randomUUID(),
          userId: autoAdd.userId,
          advertiserId: advertiser.id,
        });

        if (trackedCompany.created) {
          await enqueueTrackedJob(
            queues.initialIndex,
            "initial-index",
            { trackedCompanyId: trackedCompany.trackedCompany.id },
            {
              jobId: buildSafeJobId("initial-index", trackedCompany.trackedCompany.id),
            },
          );
        }
      } catch (error) {
        const entitlement = await getUserEntitlementSummary(autoAdd.userId);
        const message = error instanceof Error ? error.message : "";

        if (
          message.includes("Tracked company limit reached") ||
          entitlement.trackedCompaniesUsed >= entitlement.trackedCompanyLimit
        ) {
          capacityExhausted = true;
          break;
        }

        await postDiscordErrorNotification({
          service: "adluv-worker",
          event: "advertiser_search.auto_add_failed",
          title: "Add advertiser auto-add failed",
          error,
          context: {
            queryId,
            autoAddId: autoAdd.id,
            userId: autoAdd.userId,
            companyKey: autoAdd.companyKey,
            source: result.source,
            sourceAdvertiserId: result.sourceAdvertiserId,
            advertiserId: result.advertiserId,
          },
        });
        throw error;
      }
    }

    if (capacityExhausted) {
      await updateAdvertiserSearchAutoAddStatus({
        id: autoAdd.id,
        status: "capacity_exhausted",
      });
      continue;
    }

    if (
      supportedSourceNames.every((source) => {
        const status = sourceStatusMap.get(source);
        return status === "completed" || status === "failed";
      })
    ) {
      await updateAdvertiserSearchAutoAddStatus({
        id: autoAdd.id,
        status: "completed",
      });
    }
  }
}

export async function runAdvertiserSearchJob(payload: AdvertiserSearchJobPayload) {
  try {
    logWorkerEvent("info", "advertiser_search.started", payload);

    const query = await upsertAdvertiserSearchQuery({
      normalizedQuery: payload.normalizedQuery,
      displayQuery: payload.displayQuery,
      requestedAt: new Date(),
    });

    if (!query) {
      throw new Error("Advertiser search query could not be persisted.");
    }

    const settledResults = await Promise.allSettled(
      supportedSourceNames.map((source) => processSourceSearch(query.id, source, payload.displayQuery)),
    );

    await Promise.all(
      settledResults.map(async (result, index) => {
        const source = supportedSourceNames[index];

        if (result.status === "fulfilled") {
          return;
        }

        await upsertAdvertiserSearchQuerySourceStatus({
          queryId: query.id,
          source,
          status: "failed",
          errorMessage: result.reason instanceof Error ? result.reason.message : "Advertiser search failed.",
          startedAt: new Date(),
          finishedAt: new Date(),
        });
        await postDiscordErrorNotification({
          service: "adluv-worker",
          event: "advertiser_search.source_failed",
          title: "Advertiser discovery source search failed",
          error: result.reason,
          context: {
            queryId: query.id,
            normalizedQuery: payload.normalizedQuery,
            displayQuery: payload.displayQuery,
            source,
          },
        });
      }),
    );

    await markAdvertiserSearchQueryRefreshed(query.id, new Date());
    await processAutoAdds(query.id);

    logWorkerEvent("info", "advertiser_search.completed", {
      normalizedQuery: payload.normalizedQuery,
      displayQuery: payload.displayQuery,
      queryId: query.id,
      completedSources: settledResults.filter((result) => result.status === "fulfilled").length,
      failedSources: settledResults.filter((result) => result.status === "rejected").length,
    });

    return {
      payload,
      queryId: query.id,
    };
  } catch (error) {
    logWorkerEvent("error", "advertiser_search.failed", {
      normalizedQuery: payload.normalizedQuery,
      displayQuery: payload.displayQuery,
      ...toErrorContext(error),
    });
    await postDiscordErrorNotification({
      service: "adluv-worker",
      event: "advertiser_search.failed",
      title: "Advertiser discovery job failed",
      error,
      context: {
        normalizedQuery: payload.normalizedQuery,
        displayQuery: payload.displayQuery,
      },
    });
    throw error;
  }
}
