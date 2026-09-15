import { getPool } from "@adluv/db";
import {
  fetchMetaAdLibraryDetails,
  fetchRenderedMetaAdLibraryDetails,
  normalizeMetaAdLibraryDetails,
  type NormalizedAd,
} from "@adluv/source-adapters";
import type { RowDataPacket } from "mysql2/promise";
import { createScriptProgressLogger } from "./progress";
import { getBackfilledMetaMediaUrl } from "./meta-creative-backfill-media";

import { materializeAdAssets, type RefreshExpiredSourceUrlInput } from "../ad-assets";
import { createWorkerSourceAdapter, getWorkerMetaFetchOptionsAsync } from "../source-adapter";

type Args = {
  adId: string | null;
  advertiserId: string | null;
  concurrency: number;
  countries: string[];
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  maxResults: number;
  rateLimitDelayMs: number;
  skipDetailRefresh: boolean;
};

type AdRow = RowDataPacket & {
  id: string;
  advertiserId: string;
  sourceAdvertiserId: string | null;
  sourceAdId: string | null;
  fingerprint: string;
  title: string | null;
  body: string | null;
  payer: string | null;
  format: string | null;
  callToAction: string | null;
  destinationUrl: string | null;
  mediaUrl: string | null;
  status: string | null;
  reactionCount: number | null;
  commentCount: number | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  metadata: unknown;
};

type Candidate = {
  row: AdRow;
  metadata: Record<string, unknown>;
};

type Stats = {
  scanned: number;
  directMaterialized: number;
  directUpdated: number;
  refreshCandidates: number;
  detailRefreshedAds: number;
  detailUpdated: number;
  failedDetailFetches: number;
  refreshedAdvertisers: number;
  renderedRefreshedAds: number;
  renderedUpdated: number;
  refreshedAds: number;
  refreshedUpdated: number;
  failedCountryFetches: number;
  skippedHealthy: number;
  skippedNoSourceAdId: number;
  skippedNoSourceAdvertiserId: number;
  skippedNotFound: number;
  failedAdvertisers: number;
};

const defaultConcurrency = 1;
const defaultMaxResults = 100;
const defaultRateLimitDelayMs = 120_000;
const chunkSize = 20;

const logProgress = createScriptProgressLogger("backfill:meta-creative-assets");

function parsePositiveInteger(value: string | undefined, fallback: number | null) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv: string[]): Args {
  const adIdFlag = argv.find((value) => value.startsWith("--ad-id="));
  const advertiserIdFlag = argv.find((value) => value.startsWith("--advertiser-id="));
  const concurrencyFlag = argv.find((value) => value.startsWith("--concurrency="));
  const countriesFlag = argv.find((value) => value.startsWith("--countries="));
  const countryFlag = argv.find((value) => value.startsWith("--country="));
  const limitFlag = argv.find((value) => value.startsWith("--limit="));
  const maxResultsFlag = argv.find((value) => value.startsWith("--max-results="));
  const rateLimitDelayFlag = argv.find((value) => value.startsWith("--rate-limit-delay-ms="));
  const adId = adIdFlag?.slice("--ad-id=".length).trim() || null;
  const countryValue = countriesFlag?.slice("--countries=".length) ?? countryFlag?.slice("--country=".length) ?? "";

  return {
    adId,
    advertiserId: advertiserIdFlag?.slice("--advertiser-id=".length).trim() || null,
    concurrency: parsePositiveInteger(concurrencyFlag?.slice("--concurrency=".length), defaultConcurrency) ?? defaultConcurrency,
    countries: countryValue
      .split(",")
      .map((country) => country.trim().toUpperCase())
      .filter(Boolean),
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    limit: adId ? 1 : parsePositiveInteger(limitFlag?.slice("--limit=".length), null),
    maxResults: parsePositiveInteger(maxResultsFlag?.slice("--max-results=".length), defaultMaxResults) ?? defaultMaxResults,
    rateLimitDelayMs:
      parsePositiveInteger(rateLimitDelayFlag?.slice("--rate-limit-delay-ms=".length), defaultRateLimitDelayMs) ??
      defaultRateLimitDelayMs,
    skipDetailRefresh: argv.includes("--skip-detail-refresh"),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMetaRateLimitError(message: string) {
  return /rate limit|429|temporarily blocked|try again/i.test(message);
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }

  return {};
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

function getRawCreativeCandidateCount(metadata: Record<string, unknown>) {
  const rawPayload = getRecord(metadata.rawPayload);
  const snapshot = getRecord(rawPayload?.snapshot);

  if (!snapshot) {
    return 0;
  }

  const cards = getArray(snapshot, "cards");

  if (cards.length) {
    return cards.length;
  }

  return (
    getArray(snapshot, "videos").length +
    getArray(snapshot, "extra_videos").length +
    getArray(snapshot, "images").length +
    getArray(snapshot, "extra_images").length
  );
}

function hasStoredCreativeAsset(asset: Record<string, unknown>) {
  return Boolean(
    typeof asset.assetStoredUrl === "string" ||
      typeof asset.assetThumbnailStoredUrl === "string" ||
      typeof asset.assetVideoStoredUrl === "string",
  );
}

function hasSourceCreativeAsset(asset: Record<string, unknown>) {
  return Boolean(
    typeof asset.sourceMediaUrl === "string" ||
      typeof asset.sourceThumbnailUrl === "string" ||
      typeof asset.sourceVideoUrl === "string",
  );
}

function hasCreativeAssetStorageError(asset: Record<string, unknown>) {
  return Boolean(
    typeof asset.assetStorageError === "string" ||
      typeof asset.assetThumbnailStorageError === "string" ||
      typeof asset.assetVideoStorageError === "string",
  );
}

function hasFbCdnSourceCreativeAsset(asset: Record<string, unknown>) {
  return ["sourceMediaUrl", "sourceThumbnailUrl", "sourceVideoUrl"].some((key) => {
    const value = asset[key];

    if (typeof value !== "string") {
      return false;
    }

    try {
      return /(?:^|\.)fbcdn\.net$/i.test(new URL(value).hostname);
    } catch {
      return false;
    }
  });
}

function hasExpiredMetaCdnStorageError(metadata: Record<string, unknown>) {
  return getMetaCreativeAssets(metadata).some((asset) => {
    if (!hasFbCdnSourceCreativeAsset(asset)) {
      return false;
    }

    return ["assetStorageError", "assetThumbnailStorageError", "assetVideoStorageError"].some((key) => {
      const value = asset[key];

      return typeof value === "string" && /URL signature expired|status 403/i.test(value);
    });
  });
}

function getMetaCreativeAssets(metadata: Record<string, unknown>) {
  return getArray(metadata, "metaCreativeAssets")
    .map((asset) => getRecord(asset))
    .filter((asset): asset is Record<string, unknown> => Boolean(asset));
}

function getCollationId(metadata: Record<string, unknown>) {
  const rawPayload = getRecord(metadata.rawPayload);
  const value = rawPayload?.collation_id ?? rawPayload?.collationID ?? metadata.collationId;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getCollationCount(metadata: Record<string, unknown>) {
  const rawPayload = getRecord(metadata.rawPayload);
  const value = rawPayload?.collation_count ?? rawPayload?.collationCount ?? metadata.collationCount;

  return typeof value === "number" || typeof value === "string" ? value : null;
}

function getStoredCreativeAssetCount(metadata: Record<string, unknown>) {
  return getMetaCreativeAssets(metadata).filter(hasStoredCreativeAsset).length;
}

function hasMetaCreativeAssetGap(metadata: Record<string, unknown>) {
  const rawCandidateCount = getRawCreativeCandidateCount(metadata);
  const creativeAssets = getMetaCreativeAssets(metadata);

  if (!rawCandidateCount && !creativeAssets.length) {
    return false;
  }

  if (rawCandidateCount > 1 && creativeAssets.length < rawCandidateCount) {
    return true;
  }

  return creativeAssets.some(
    (asset) => hasCreativeAssetStorageError(asset) || (hasSourceCreativeAsset(asset) && !hasStoredCreativeAsset(asset)),
  );
}

function rowToNormalizedAd(row: AdRow, metadata: Record<string, unknown>): NormalizedAd {
  return {
    source: "facebook",
    sourceAdId: row.sourceAdId ?? undefined,
    fingerprint: row.fingerprint,
    title: row.title ?? undefined,
    body: row.body ?? undefined,
    payer: row.payer ?? undefined,
    format: row.format ?? undefined,
    callToAction: row.callToAction ?? undefined,
    destinationUrl: row.destinationUrl ?? undefined,
    mediaUrl: row.mediaUrl ?? undefined,
    status: row.status ?? undefined,
    reactionCount: row.reactionCount ?? undefined,
    commentCount: row.commentCount ?? undefined,
    firstSeenAt: new Date(row.firstSeenAt),
    lastSeenAt: new Date(row.lastSeenAt),
    metadata: {
      ...metadata,
      sourceAdvertiserId: metadata.sourceAdvertiserId ?? row.sourceAdvertiserId ?? undefined,
    },
  };
}

function serializeMetadata(metadata: Record<string, unknown>) {
  return Object.keys(metadata).length ? JSON.stringify(metadata) : null;
}

function getNextMediaUrl(candidate: Candidate, hydratedAd: NormalizedAd) {
  return getBackfilledMetaMediaUrl({
    currentMediaUrl: candidate.row.mediaUrl,
    hydratedMediaUrl: hydratedAd.mediaUrl,
    hydratedMetadata: parseMetadata(hydratedAd.metadata),
  });
}

function mergeMetadata(currentMetadata: Record<string, unknown>, nextMetadata: Record<string, unknown>) {
  const merged = {
    ...currentMetadata,
    ...nextMetadata,
  };

  if (nextMetadata.metaCreativeAssets) {
    delete merged.metaCreativeAssetBackfillError;
  }

  return merged;
}

function needsDatabaseUpdate(row: AdRow, mediaUrl: string | null, metadata: Record<string, unknown>) {
  return (row.mediaUrl ?? null) !== mediaUrl || serializeMetadata(parseMetadata(row.metadata)) !== serializeMetadata(metadata);
}

function groupCandidatesByAdvertiser(candidates: Candidate[]) {
  const grouped = new Map<string, Candidate[]>();

  for (const candidate of candidates) {
    const sourceAdvertiserId = candidate.row.sourceAdvertiserId?.trim();

    if (!sourceAdvertiserId) {
      continue;
    }

    const key = `${candidate.row.advertiserId}:${sourceAdvertiserId}`;
    const current = grouped.get(key);

    if (current) {
      current.push(candidate);
    } else {
      grouped.set(key, [candidate]);
    }
  }

  return [...grouped.values()];
}

function formatProxyUrl(proxy: { password?: string; url: string; username?: string }) {
  const proxyUrl = proxy.url.includes("://") ? proxy.url : `http://${proxy.url}`;

  if (!proxy.username || !proxy.password) {
    return proxyUrl;
  }

  try {
    const url = new URL(proxyUrl);
    const proxyUsername = proxy.username.startsWith("username=") ? proxy.username : `username=${proxy.username}`;
    url.username = proxyUsername.includes("country=") ? proxyUsername : `${proxyUsername}+country=us`;
    url.password = proxy.password;
    return url.toString();
  } catch {
    return proxy.url;
  }
}

function getMetaAssetProxyUrls(metaFetchOptions: Awaited<ReturnType<typeof getWorkerMetaFetchOptionsAsync>>) {
  const webScrapingApiProxyUrl = metaFetchOptions.webScrapingApiProxy
    ? formatProxyUrl(metaFetchOptions.webScrapingApiProxy)
    : null;

  return [
    ...(webScrapingApiProxyUrl ? [webScrapingApiProxyUrl] : []),
    ...(metaFetchOptions.metaProxyUrls ?? []),
  ];
}

function getUniqueRefreshCountries(args: Args) {
  const countries = args.countries.length ? args.countries : ["ALL", "US", "GB", "SG", "RO", null];

  return [
    ...new Set(
      countries.map((country) => country?.trim().toUpperCase() || null),
    ),
  ];
}

function getMetaSourceAdvertiserId(ad: NormalizedAd) {
  const metadata = parseMetadata(ad.metadata);
  const value = metadata.sourceAdvertiserId;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getFreshSourceUrlForExpiredAsset(input: RefreshExpiredSourceUrlInput, freshAd: NormalizedAd) {
  const freshMetadata = parseMetadata(freshAd.metadata);
  const sourceKey = input.sourceKey;
  const assetLabel = typeof input.asset?.label === "string" ? input.asset.label : null;

  if (assetLabel) {
    const freshAsset = getMetaCreativeAssets(freshMetadata).find((asset) => asset.label === assetLabel);
    const freshUrl = freshAsset?.[sourceKey];

    if (typeof freshUrl === "string" && freshUrl && freshUrl !== input.sourceUrl) {
      return freshUrl;
    }
  }

  const topLevelUrl = freshMetadata[sourceKey];

  return typeof topLevelUrl === "string" && topLevelUrl && topLevelUrl !== input.sourceUrl ? topLevelUrl : null;
}

function createExpiredMetaSourceUrlRefresher(
  args: Args,
  metaFetchOptions: Awaited<ReturnType<typeof getWorkerMetaFetchOptionsAsync>>,
) {
  const freshAdByKey = new Map<string, Promise<NormalizedAd | null>>();
  let adapterPromise: ReturnType<typeof createWorkerSourceAdapter> | null = null;

  async function fetchFreshAd(ad: NormalizedAd) {
    const sourceAdvertiserId = getMetaSourceAdvertiserId(ad);
    const sourceAdId = ad.sourceAdId?.trim();

    if (!sourceAdvertiserId || !sourceAdId) {
      return null;
    }

    const key = `${sourceAdvertiserId}:${sourceAdId}`;
    const existing = freshAdByKey.get(key);

    if (existing) {
      return existing;
    }

    const promise = (async () => {
      const metadata = parseMetadata(ad.metadata);
      const countries = getUniqueRefreshCountries(args);

      for (const country of countries) {
        try {
          const details = await fetchMetaAdLibraryDetails(sourceAdvertiserId, sourceAdId, {
            ...metaFetchOptions,
            country,
            collationCount: getCollationCount(metadata),
            collationId: getCollationId(metadata),
          });
          const normalizedAd = normalizeMetaAdLibraryDetails(details);

          if (normalizedAd?.sourceAdId === sourceAdId) {
            return normalizedAd;
          }
        } catch (error) {
          console.warn(
            `[backfill:meta-creative-assets] expired URL detail refresh failed for ${sourceAdId} country=${
              country ?? "default"
            }: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }

      if (metaFetchOptions.webScrapingApiKey) {
        for (const country of countries) {
          try {
            const details = await fetchRenderedMetaAdLibraryDetails(sourceAdvertiserId, sourceAdId, {
              ...metaFetchOptions,
              country,
            });
            const normalizedAd = normalizeMetaAdLibraryDetails(details);

            if (normalizedAd?.sourceAdId === sourceAdId) {
              return normalizedAd;
            }
          } catch (error) {
            console.warn(
              `[backfill:meta-creative-assets] expired URL rendered refresh failed for ${sourceAdId} country=${
                country ?? "default"
              }: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        }
      }

      adapterPromise ??= createWorkerSourceAdapter("facebook");
      const adapter = await adapterPromise;

      for (const country of countries) {
        try {
          const ads = await adapter.fetchAdvertiserAds(sourceAdvertiserId, {
            country: country ?? undefined,
            maxResults: args.maxResults,
            sourceAdIds: [sourceAdId],
          });
          const fetchedAd = ads.find((candidate) => candidate.sourceAdId === sourceAdId);

          if (fetchedAd) {
            return fetchedAd;
          }
        } catch (error) {
          console.warn(
            `[backfill:meta-creative-assets] expired URL page refresh failed for ${sourceAdId} country=${
              country ?? "default"
            }: ${error instanceof Error ? error.message : "Unknown error"}`,
          );
        }
      }

      return null;
    })();

    freshAdByKey.set(key, promise);
    return promise;
  }

  return async (input: RefreshExpiredSourceUrlInput) => {
    if (input.ad.source !== "facebook") {
      return null;
    }

    const freshAd = await fetchFreshAd(input.ad);

    if (!freshAd) {
      return null;
    }

    return getFreshSourceUrlForExpiredAsset(input, freshAd);
  };
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length || 1) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        await worker(items[currentIndex], currentIndex);
      }
    }),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();
  const stats: Stats = {
    scanned: 0,
    directMaterialized: 0,
    directUpdated: 0,
    refreshCandidates: 0,
    detailRefreshedAds: 0,
    detailUpdated: 0,
    failedDetailFetches: 0,
    refreshedAdvertisers: 0,
    renderedRefreshedAds: 0,
    renderedUpdated: 0,
    refreshedAds: 0,
    refreshedUpdated: 0,
    failedCountryFetches: 0,
    skippedHealthy: 0,
    skippedNoSourceAdId: 0,
    skippedNoSourceAdvertiserId: 0,
    skippedNotFound: 0,
    failedAdvertisers: 0,
  };

  try {
    const metaFetchOptions = await getWorkerMetaFetchOptionsAsync();
    const metaAssetProxyUrls = getMetaAssetProxyUrls(metaFetchOptions);
    const refreshExpiredSourceUrl = createExpiredMetaSourceUrlRefresher(args, metaFetchOptions);
    const limitClause = args.limit ? `limit ${args.limit}` : "";
    const [selectedRows] = await pool.query<AdRow[]>(
      `
        select
          ads.id,
          ads.advertiser_id as advertiserId,
          advertisers.source_advertiser_id as sourceAdvertiserId,
          ads.source_ad_id as sourceAdId,
          ads.fingerprint,
          ads.title,
          ads.body,
          ads.payer,
          ads.format,
          ads.call_to_action as callToAction,
          ads.destination_url as destinationUrl,
          ads.media_url as mediaUrl,
          ads.status,
          ads.reaction_count as reactionCount,
          ads.comment_count as commentCount,
          ads.first_seen_at as firstSeenAt,
          ads.last_seen_at as lastSeenAt,
          ads.metadata
        from ads
        inner join advertisers on advertisers.id = ads.advertiser_id
        where ads.source = 'facebook'
          and advertisers.source = 'facebook'
          and (? is null or ads.id = ?)
          and (? is null or ads.advertiser_id = ?)
          and ads.metadata is not null
          and (
            json_length(json_extract(ads.metadata, '$.metaCreativeAssets')) > 0
            or json_length(json_extract(ads.metadata, '$.rawPayload.snapshot.cards')) > 1
            or json_length(json_extract(ads.metadata, '$.rawPayload.snapshot.videos')) > 1
            or json_length(json_extract(ads.metadata, '$.rawPayload.snapshot.images')) > 1
            or ? = 1
          )
        order by ads.updated_at desc
        ${limitClause}
      `,
      [args.adId, args.adId, args.advertiserId, args.advertiserId, args.force ? 1 : 0],
    );
    let rows = selectedRows;

    if (args.adId && rows.length) {
      const selectedRow = rows[0];
      const selectedCollationId = getCollationId(parseMetadata(selectedRow.metadata));

      if (selectedCollationId) {
        const [siblingRows] = await pool.query<AdRow[]>(
          `
            select
              ads.id,
              ads.advertiser_id as advertiserId,
              advertisers.source_advertiser_id as sourceAdvertiserId,
              ads.source_ad_id as sourceAdId,
              ads.fingerprint,
              ads.title,
              ads.body,
              ads.payer,
              ads.format,
              ads.call_to_action as callToAction,
              ads.destination_url as destinationUrl,
              ads.media_url as mediaUrl,
              ads.status,
              ads.reaction_count as reactionCount,
              ads.comment_count as commentCount,
              ads.first_seen_at as firstSeenAt,
              ads.last_seen_at as lastSeenAt,
              ads.metadata
            from ads
            inner join advertisers on advertisers.id = ads.advertiser_id
            where ads.source = 'facebook'
              and advertisers.source = 'facebook'
              and ads.id <> ?
              and ads.advertiser_id = ?
              and ads.metadata is not null
              and json_unquote(json_extract(ads.metadata, '$.rawPayload.collation_id')) = ?
            order by ads.last_seen_at desc
          `,
          [args.adId, selectedRow.advertiserId, selectedCollationId],
        );

        if (siblingRows.length) {
          const seenRowIds = new Set(rows.map((row) => row.id));
          rows = [...rows, ...siblingRows.filter((row) => !seenRowIds.has(row.id))];
          logProgress(`included ${siblingRows.length} sibling Meta ads from collation ${selectedCollationId}`);
        }
      }
    }

    stats.scanned = rows.length;

    const candidates = rows
      .map((row) => ({ row, metadata: parseMetadata(row.metadata) }))
      .filter((candidate) => args.force || hasMetaCreativeAssetGap(candidate.metadata));

    stats.skippedHealthy = rows.length - candidates.length;

    logProgress(
      [
        `found ${candidates.length} candidate Meta ads`,
        args.dryRun ? "(dry run)" : "",
        args.force ? "with force" : "",
        args.countries.length ? `countries=${args.countries.join(",")}` : "",
        `concurrency=${args.concurrency}`,
        `maxResults=${args.maxResults}`,
      ].filter(Boolean).join(" "),
    );

    const directCandidates = candidates.filter((candidate) => !hasExpiredMetaCdnStorageError(candidate.metadata));
    const refreshCandidates: Candidate[] = candidates.filter((candidate) => hasExpiredMetaCdnStorageError(candidate.metadata));

    if (refreshCandidates.length) {
      logProgress(`sending ${refreshCandidates.length} known expired Meta CDN rows directly to source refresh`);
    }

    for (let index = 0; index < directCandidates.length; index += chunkSize) {
      const chunk = directCandidates.slice(index, index + chunkSize);
      const hydratedAds = await materializeAdAssets(
        chunk.map(({ row, metadata }) => rowToNormalizedAd(row, metadata)),
        {
          forceSourceRefetch: args.force,
          persist: !args.dryRun,
          refreshExpiredSourceUrl,
          sourceProxyUrls: metaAssetProxyUrls,
        },
      );

      for (const [offset, hydratedAd] of hydratedAds.entries()) {
        const candidate = chunk[offset];
        const nextMetadata = parseMetadata(hydratedAd.metadata);
        const nextMediaUrl = getNextMediaUrl(candidate, hydratedAd);

        if (getStoredCreativeAssetCount(nextMetadata) > getStoredCreativeAssetCount(candidate.metadata)) {
          stats.directMaterialized += 1;
        }

        if (needsDatabaseUpdate(candidate.row, nextMediaUrl, nextMetadata)) {
          stats.directUpdated += 1;

          if (!args.dryRun) {
            await pool.execute("update ads set media_url = ?, metadata = ?, updated_at = ? where id = ?", [
              nextMediaUrl,
              serializeMetadata(nextMetadata),
              new Date(),
              candidate.row.id,
            ]);
          }
        }

        if (hasMetaCreativeAssetGap(nextMetadata)) {
          refreshCandidates.push({
            row: {
              ...candidate.row,
              mediaUrl: nextMediaUrl,
            },
            metadata: nextMetadata,
          });
        }
      }

      logProgress(
        `${args.dryRun ? "scanned" : "processed"} ${Math.min(index + chunk.length, directCandidates.length)}/${directCandidates.length}; directUpdated=${stats.directUpdated}`,
      );
    }

    stats.refreshCandidates = refreshCandidates.length;

    const groupedRefreshCandidates = groupCandidatesByAdvertiser(
      refreshCandidates.filter((candidate) => {
        if (!candidate.row.sourceAdId?.trim()) {
          stats.skippedNoSourceAdId += 1;
          return false;
        }

        if (!candidate.row.sourceAdvertiserId?.trim()) {
          stats.skippedNoSourceAdvertiserId += 1;
          return false;
        }

        return true;
      }),
    );

    if (groupedRefreshCandidates.length) {
      const metaProxyCount = metaFetchOptions.metaProxyUrls?.length ?? 0;
      const hasWebScrapingApi = Boolean(metaFetchOptions.webScrapingApiProxy || metaFetchOptions.webScrapingApiKey);
      logProgress(
        hasWebScrapingApi
          ? `refreshing ${refreshCandidates.length} ads across ${groupedRefreshCandidates.length} advertisers via WebScrapingAPI first${metaProxyCount ? `, proxy-list fallback proxyCount=${metaProxyCount}` : ""}`
          : metaProxyCount
            ? `refreshing ${refreshCandidates.length} ads across ${groupedRefreshCandidates.length} advertisers via proxy-list proxyCount=${metaProxyCount}`
            : `refreshing ${refreshCandidates.length} ads across ${groupedRefreshCandidates.length} advertisers via direct fallback`,
      );
    }

    const refreshMetaFetchOptions = groupedRefreshCandidates.length ? metaFetchOptions : null;
    const adapter = groupedRefreshCandidates.length ? await createWorkerSourceAdapter("facebook") : null;

    await runPool(groupedRefreshCandidates, args.concurrency, async (advertiserCandidates) => {
      const sourceAdvertiserId = advertiserCandidates[0].row.sourceAdvertiserId?.trim();

      if (!adapter || !sourceAdvertiserId) {
        return;
      }

      try {
        stats.refreshedAdvertisers += 1;

        const detailFetchedAdsBySourceAdId = new Map<string, NormalizedAd>();
        const refreshCountries = getUniqueRefreshCountries(args);

        if (args.skipDetailRefresh) {
          logProgress("skipping exact Meta detail refresh by request");
        } else {
          for (const candidate of advertiserCandidates) {
            const sourceAdId = candidate.row.sourceAdId?.trim();

            if (!refreshMetaFetchOptions || !sourceAdId) {
              continue;
            }

            for (const country of refreshCountries) {
              try {
                logProgress(`refreshing exact Meta details for ${candidate.row.id} (${sourceAdId}) country=${country ?? "default"}`);
                const details = await fetchMetaAdLibraryDetails(sourceAdvertiserId, sourceAdId, {
                  ...refreshMetaFetchOptions,
                  country,
                  collationCount: getCollationCount(candidate.metadata),
                  collationId: getCollationId(candidate.metadata),
                });
                const normalizedAd = normalizeMetaAdLibraryDetails(details);

                if (normalizedAd?.sourceAdId === sourceAdId) {
                  detailFetchedAdsBySourceAdId.set(sourceAdId, normalizedAd);
                  break;
                }
              } catch (error) {
                const message = error instanceof Error ? error.message : "Unknown error";
                const rateLimited = isMetaRateLimitError(message);

                stats.failedDetailFetches += 1;
                console.warn(
                  `[backfill:meta-creative-assets] failed exact details for ${candidate.row.id} (${sourceAdId}) country=${
                    country ?? "default"
                  }: ${rateLimited ? "Meta Ads Library rate limit: " : ""}${message}`,
                );

                if (rateLimited) {
                  logProgress(
                    `Meta Ads Library detail lookup rate-limited for ${candidate.row.id}; pausing ${formatDuration(
                      args.rateLimitDelayMs,
                    )} before the next Meta request`,
                  );
                  await sleep(args.rateLimitDelayMs);
                }
              }
            }
          }
        }

        if (detailFetchedAdsBySourceAdId.size) {
          const materializeInput = advertiserCandidates.flatMap((candidate) => {
            const sourceAdId = candidate.row.sourceAdId?.trim();
            const fetchedAd = sourceAdId ? detailFetchedAdsBySourceAdId.get(sourceAdId) : null;

            return fetchedAd ? [{ candidate, ad: fetchedAd }] : [];
          });
          const hydratedAds = await materializeAdAssets(
            materializeInput.map(({ ad }) => ad),
            {
              forceSourceRefetch: true,
              persist: !args.dryRun,
              refreshExpiredSourceUrl,
              sourceProxyUrls: metaAssetProxyUrls,
            },
          );

          for (const [offset, hydratedAd] of hydratedAds.entries()) {
            const { candidate } = materializeInput[offset];
            const nextMetadata = mergeMetadata(candidate.metadata, parseMetadata(hydratedAd.metadata));
            const nextMediaUrl = getNextMediaUrl(candidate, hydratedAd);

            stats.detailRefreshedAds += 1;

            if (!needsDatabaseUpdate(candidate.row, nextMediaUrl, nextMetadata)) {
              continue;
            }

            stats.detailUpdated += 1;

            if (!args.dryRun) {
              await pool.execute("update ads set media_url = ?, metadata = ?, updated_at = ? where id = ?", [
                nextMediaUrl,
                serializeMetadata(nextMetadata),
                new Date(),
                candidate.row.id,
              ]);
            }
          }
        }

        const pageSearchCandidates = advertiserCandidates.filter((candidate) => {
          const sourceAdId = candidate.row.sourceAdId?.trim();

          return !sourceAdId || !detailFetchedAdsBySourceAdId.has(sourceAdId);
        });

        if (!pageSearchCandidates.length) {
          return;
        }

        const renderedFetchedAdsBySourceAdId = new Map<string, NormalizedAd>();

        if (metaFetchOptions.webScrapingApiKey) {
          for (const candidate of pageSearchCandidates) {
            const sourceAdId = candidate.row.sourceAdId?.trim();

            if (!sourceAdId) {
              continue;
            }

            for (const country of refreshCountries) {
              try {
                logProgress(`refreshing rendered Meta page for ${candidate.row.id} (${sourceAdId}) country=${country ?? "default"}`);
                const details = await fetchRenderedMetaAdLibraryDetails(sourceAdvertiserId, sourceAdId, {
                  ...metaFetchOptions,
                  country,
                });
                const normalizedAd = normalizeMetaAdLibraryDetails(details);

                if (normalizedAd?.sourceAdId === sourceAdId) {
                  renderedFetchedAdsBySourceAdId.set(sourceAdId, normalizedAd);
                  break;
                }
              } catch (error) {
                console.warn(
                  `[backfill:meta-creative-assets] failed rendered page refresh for ${candidate.row.id} (${sourceAdId}) country=${
                    country ?? "default"
                  }: ${error instanceof Error ? error.message : "Unknown error"}`,
                );
              }
            }
          }
        }

        if (renderedFetchedAdsBySourceAdId.size) {
          const materializeInput = pageSearchCandidates.flatMap((candidate) => {
            const sourceAdId = candidate.row.sourceAdId?.trim();
            const fetchedAd = sourceAdId ? renderedFetchedAdsBySourceAdId.get(sourceAdId) : null;

            return fetchedAd ? [{ candidate, ad: fetchedAd }] : [];
          });
          const hydratedAds = await materializeAdAssets(
            materializeInput.map(({ ad }) => ad),
            {
              forceSourceRefetch: true,
              persist: !args.dryRun,
              refreshExpiredSourceUrl,
              sourceProxyUrls: metaAssetProxyUrls,
            },
          );

          for (const [offset, hydratedAd] of hydratedAds.entries()) {
            const { candidate } = materializeInput[offset];
            const nextMetadata = mergeMetadata(candidate.metadata, parseMetadata(hydratedAd.metadata));
            const nextMediaUrl = getNextMediaUrl(candidate, hydratedAd);

            stats.renderedRefreshedAds += 1;

            if (!needsDatabaseUpdate(candidate.row, nextMediaUrl, nextMetadata)) {
              continue;
            }

            stats.renderedUpdated += 1;

            if (!args.dryRun) {
              await pool.execute("update ads set media_url = ?, metadata = ?, updated_at = ? where id = ?", [
                nextMediaUrl,
                serializeMetadata(nextMetadata),
                new Date(),
                candidate.row.id,
              ]);
            }
          }
        }

        const remainingPageSearchCandidates = pageSearchCandidates.filter((candidate) => {
          const sourceAdId = candidate.row.sourceAdId?.trim();

          return !sourceAdId || !renderedFetchedAdsBySourceAdId.has(sourceAdId);
        });

        if (!remainingPageSearchCandidates.length) {
          return;
        }

        const pageSearchSourceAdIds = [
          ...new Set(
            remainingPageSearchCandidates
              .map((candidate) => candidate.row.sourceAdId?.trim())
              .filter((sourceAdId): sourceAdId is string => Boolean(sourceAdId)),
          ),
        ];
        const countries = refreshCountries;
        const fetchedAdsBySourceAdId = new Map<string, NormalizedAd>();
        const countryErrors: string[] = [];

        for (const country of countries) {
          if (pageSearchSourceAdIds.every((sourceAdId) => fetchedAdsBySourceAdId.has(sourceAdId))) {
            break;
          }

          let fetchedAds: NormalizedAd[];

          try {
            logProgress(
              `refreshing advertiser ${sourceAdvertiserId} by page search country=${country ?? "default"} remainingAds=${remainingPageSearchCandidates.length}`,
            );
            fetchedAds = await adapter.fetchAdvertiserAds(sourceAdvertiserId, {
              country: country ?? undefined,
              maxResults: args.maxResults,
              sourceAdIds: pageSearchSourceAdIds,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            const rateLimited = isMetaRateLimitError(message);

            stats.failedCountryFetches += 1;
            countryErrors.push(`${country ?? "default"}: ${message}`);
            console.warn(
              `[backfill:meta-creative-assets] failed advertiser ${sourceAdvertiserId} country ${
                country ?? "default"
              }: ${rateLimited ? "Meta Ads Library rate limit: " : ""}${message}`,
            );

            if (rateLimited) {
              logProgress(
                `Meta Ads Library rate-limited advertiser ${sourceAdvertiserId} country ${
                  country ?? "default"
                }; pausing ${formatDuration(args.rateLimitDelayMs)} before the next Meta request`,
              );
              await sleep(args.rateLimitDelayMs);
            }

            continue;
          }

          for (const ad of fetchedAds) {
            if (ad.sourceAdId && pageSearchSourceAdIds.includes(ad.sourceAdId) && !fetchedAdsBySourceAdId.has(ad.sourceAdId)) {
              fetchedAdsBySourceAdId.set(ad.sourceAdId, ad);
            }
          }
        }

        if (!fetchedAdsBySourceAdId.size && countryErrors.length === countries.length) {
          throw new Error(`All country refresh attempts failed: ${countryErrors.join("; ")}`);
        }

        const materializeInput = remainingPageSearchCandidates.flatMap((candidate) => {
          const sourceAdId = candidate.row.sourceAdId?.trim();
          const fetchedAd = sourceAdId ? fetchedAdsBySourceAdId.get(sourceAdId) : null;

          if (!fetchedAd) {
            stats.skippedNotFound += 1;
            return [];
          }

          return [{ candidate, ad: fetchedAd }];
        });

        if (!materializeInput.length) {
          return;
        }

        const hydratedAds = await materializeAdAssets(
          materializeInput.map(({ ad }) => ad),
            {
              forceSourceRefetch: true,
              persist: !args.dryRun,
              refreshExpiredSourceUrl,
              sourceProxyUrls: metaAssetProxyUrls,
            },
          );

        for (const [offset, hydratedAd] of hydratedAds.entries()) {
          const { candidate } = materializeInput[offset];
          const nextMetadata = mergeMetadata(candidate.metadata, parseMetadata(hydratedAd.metadata));
          const nextMediaUrl = getNextMediaUrl(candidate, hydratedAd);

          stats.refreshedAds += 1;

          if (!needsDatabaseUpdate(candidate.row, nextMediaUrl, nextMetadata)) {
            continue;
          }

          stats.refreshedUpdated += 1;

          if (!args.dryRun) {
            await pool.execute("update ads set media_url = ?, metadata = ?, updated_at = ? where id = ?", [
              nextMediaUrl,
              serializeMetadata(nextMetadata),
              new Date(),
              candidate.row.id,
            ]);
          }
        }
      } catch (error) {
        stats.failedAdvertisers += 1;
        console.warn(
          `[backfill:meta-creative-assets] failed advertiser ${sourceAdvertiserId}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    });

    logProgress(
      [
        args.dryRun ? "dry-run summary" : "backfill summary",
        `scanned=${stats.scanned}`,
        `skippedHealthy=${stats.skippedHealthy}`,
        `directMaterialized=${stats.directMaterialized}`,
        `directUpdated=${stats.directUpdated}`,
        `refreshCandidates=${stats.refreshCandidates}`,
        `detailRefreshedAds=${stats.detailRefreshedAds}`,
        `detailUpdated=${stats.detailUpdated}`,
        `failedDetailFetches=${stats.failedDetailFetches}`,
        `refreshedAdvertisers=${stats.refreshedAdvertisers}`,
        `renderedRefreshedAds=${stats.renderedRefreshedAds}`,
        `renderedUpdated=${stats.renderedUpdated}`,
        `refreshedAds=${stats.refreshedAds}`,
        `refreshedUpdated=${stats.refreshedUpdated}`,
        `failedCountryFetches=${stats.failedCountryFetches}`,
        `skippedNoSourceAdId=${stats.skippedNoSourceAdId}`,
        `skippedNoSourceAdvertiserId=${stats.skippedNoSourceAdvertiserId}`,
        `skippedNotFound=${stats.skippedNotFound}`,
        `failedAdvertisers=${stats.failedAdvertisers}`,
      ].join(" "),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:meta-creative-assets] failed", error);
  process.exitCode = 1;
});
