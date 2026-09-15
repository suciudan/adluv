import { getPool } from "@adluv/db";
import type { SourceName } from "@adluv/config";
import type { NormalizedAd } from "@adluv/source-adapters";
import type { RowDataPacket } from "mysql2/promise";
import { createScriptProgressLogger } from "./progress";

import { materializeAdAssets } from "../ad-assets";
import { createWorkerSourceAdapter, getMetaProxyUrlsAsync } from "../source-adapter";

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
};

type AdRow = RowDataPacket & {
  id: string;
  advertiserId: string;
  sourceAdvertiserId: string;
  source: SourceName;
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
  reactionCount: number;
  commentCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  metadata: unknown;
};

type RefreshCandidate = {
  row: AdRow;
  metadata: Record<string, unknown>;
};

type Stats = {
  scanned: number;
  directUpdated: number;
  staleVideoAds: number;
  refreshedAdvertisers: number;
  refreshedAds: number;
  refreshedUpdated: number;
  storedVariantVideos: number;
  failedCountryFetches: number;
  skippedRetryCooldown: number;
  skippedNoSourceAdId: number;
  skippedNotFound: number;
  failedAdvertisers: number;
};

const chunkSize = 10;
const defaultConcurrency = 1;
const defaultMaxResults = 100;
const defaultRateLimitDelayMs = 120_000;
const retryCooldownMs = 12 * 60 * 60_000;
const backfillStateKey = "metaVariantVideoBackfill";

const logProgress = createScriptProgressLogger("backfill:meta-variant-videos");

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

function getBackfillState(metadata: Record<string, unknown>) {
  const state = metadata[backfillStateKey];

  return state && typeof state === "object" && !Array.isArray(state) ? (state as Record<string, unknown>) : null;
}

function getRetryAfterMs(metadata: Record<string, unknown>) {
  const retryAfterMs = getBackfillState(metadata)?.retryAfterMs;

  return typeof retryAfterMs === "number" && Number.isFinite(retryAfterMs) ? retryAfterMs : null;
}

function isRetryCooldownActive(metadata: Record<string, unknown>, force: boolean, nowMs = Date.now()) {
  const retryAfterMs = getRetryAfterMs(metadata);

  return !force && retryAfterMs !== null && retryAfterMs > nowMs;
}

function clearBackfillState(metadata: Record<string, unknown>) {
  if (metadata[backfillStateKey]) {
    delete metadata[backfillStateKey];
  }
}

function withBackfillFailureState(metadata: Record<string, unknown>, input: {
  error: string;
  rateLimited: boolean;
}) {
  const nowMs = Date.now();

  return {
    ...metadata,
    [backfillStateKey]: {
      failedAtMs: nowMs,
      retryAfterMs: nowMs + (input.rateLimited ? retryCooldownMs : 60 * 60_000),
      error: input.error,
      rateLimited: input.rateLimited,
    },
  };
}

async function persistCandidateBackfillFailure(input: {
  candidates: RefreshCandidate[];
  dryRun: boolean;
  error: string;
  pool: ReturnType<typeof getPool>;
  rateLimited: boolean;
}) {
  if (input.dryRun) {
    return;
  }

  const updatedAt = new Date();

  for (const candidate of input.candidates) {
    await input.pool.execute("update ads set metadata = ?, updated_at = ? where id = ?", [
      serializeMetadata(withBackfillFailureState(candidate.metadata, {
        error: input.error,
        rateLimited: input.rateLimited,
      })),
      updatedAt,
      candidate.row.id,
    ]);
  }
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

function countStoredVariantVideos(metadata: Record<string, unknown>) {
  const assets = Array.isArray(metadata.metaCreativeAssets) ? metadata.metaCreativeAssets : [];

  return assets.filter((asset) => {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
      return false;
    }

    return typeof (asset as Record<string, unknown>).assetVideoStoredUrl === "string";
  }).length;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function countSourceVariantVideos(metadata: Record<string, unknown>) {
  const assets = Array.isArray(metadata.metaCreativeAssets) ? metadata.metaCreativeAssets : [];

  return assets.filter((asset) => {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
      return false;
    }

    return Boolean(cleanText((asset as Record<string, unknown>).sourceVideoUrl));
  }).length;
}

function hasVariantVideoStorageError(metadata: Record<string, unknown>) {
  const assets = Array.isArray(metadata.metaCreativeAssets) ? metadata.metaCreativeAssets : [];

  return assets.some((asset) => {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
      return false;
    }

    return Boolean(cleanText((asset as Record<string, unknown>).assetVideoStorageError));
  });
}

function needsFreshVideoRefresh(metadata: Record<string, unknown>, force: boolean) {
  if (force) {
    return countSourceVariantVideos(metadata) > 0 || Boolean(cleanText(metadata.sourceVideoUrl));
  }

  const sourceVariantVideos = countSourceVariantVideos(metadata);
  const storedVariantVideos = countStoredVariantVideos(metadata);

  return (
    sourceVariantVideos > storedVariantVideos ||
    hasVariantVideoStorageError(metadata) ||
    Boolean(cleanText(metadata.sourceVideoUrl) && !cleanText(metadata.assetVideoStoredUrl))
  );
}

function groupCandidatesByAdvertiser(candidates: RefreshCandidate[]) {
  const grouped = new Map<string, RefreshCandidate[]>();

  for (const candidate of candidates) {
    const key = `${candidate.row.advertiserId}:${candidate.row.sourceAdvertiserId}`;
    const current = grouped.get(key);

    if (current) {
      current.push(candidate);
    } else {
      grouped.set(key, [candidate]);
    }
  }

  return [...grouped.values()];
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;

        nextIndex += 1;
        await worker(items[currentIndex], currentIndex);
      }
    }),
  );
}

function mergeMetadata(currentMetadata: Record<string, unknown>, nextMetadata: Record<string, unknown>) {
  const merged = {
    ...currentMetadata,
    ...nextMetadata,
  };

  if (nextMetadata.assetStoredUrl) {
    delete merged.assetStorageError;
  }

  if (nextMetadata.assetThumbnailStoredUrl) {
    delete merged.assetThumbnailStorageError;
  }

  if (nextMetadata.assetVideoStoredUrl) {
    delete merged.assetVideoStorageError;
  }

  return merged;
}

function serializeMetadata(metadata: Record<string, unknown>) {
  return Object.keys(metadata).length ? JSON.stringify(metadata) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();
  const stats: Stats = {
    scanned: 0,
    directUpdated: 0,
    staleVideoAds: 0,
    refreshedAdvertisers: 0,
    refreshedAds: 0,
    refreshedUpdated: 0,
    storedVariantVideos: 0,
    failedCountryFetches: 0,
    skippedRetryCooldown: 0,
    skippedNoSourceAdId: 0,
    skippedNotFound: 0,
    failedAdvertisers: 0,
  };

  try {
    const limitClause = args.limit ? `limit ${args.limit}` : "";
    const [rows] = await pool.query<AdRow[]>(
      `
        select
          ads.id,
          ads.advertiser_id as advertiserId,
          advertisers.source_advertiser_id as sourceAdvertiserId,
          ads.source,
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
            cast(ads.metadata as char) like '%video_hd_url%'
            or cast(ads.metadata as char) like '%video_sd_url%'
            or cast(ads.metadata as char) like '%watermarked_video_hd_url%'
            or cast(ads.metadata as char) like '%watermarked_video_sd_url%'
            or cast(ads.metadata as char) like '%sourceVideoUrl%'
          )
        order by ads.updated_at desc
        ${limitClause}
      `,
      [args.adId, args.adId, args.advertiserId, args.advertiserId],
    );

    stats.scanned = rows.length;

    logProgress(
      [
        `found ${rows.length} Meta ads with nested/source video URLs`,
        args.dryRun ? "(dry run)" : "",
        args.force ? "with force" : "",
        args.countries.length ? `countries=${args.countries.join(",")}` : "",
        `concurrency=${args.concurrency}`,
        `maxResults=${args.maxResults}`,
        `rateLimitDelay=${formatDuration(args.rateLimitDelayMs)}`,
      ].filter(Boolean).join(" "),
    );

    let processed = 0;
    const refreshCandidates: RefreshCandidate[] = [];

    for (let index = 0; index < rows.length; index += chunkSize) {
      const chunk = rows.slice(index, index + chunkSize);
      const input = chunk.map((row) => ({
        row,
        metadata: parseMetadata(row.metadata),
      }));
      const hydratedAds = await materializeAdAssets(
        input.map(({ row, metadata }) => ({
          source: row.source,
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
          reactionCount: row.reactionCount,
          commentCount: row.commentCount,
          firstSeenAt: new Date(row.firstSeenAt),
          lastSeenAt: new Date(row.lastSeenAt),
          metadata,
        })),
        {
          forceSourceRefetch: args.force,
          persist: !args.dryRun,
        },
      );

      for (const [offset, hydratedAd] of hydratedAds.entries()) {
        const { row, metadata } = input[offset];
        const currentMetadata = serializeMetadata(metadata);
        const nextMetadataRecord =
          hydratedAd.metadata && typeof hydratedAd.metadata === "object" && !Array.isArray(hydratedAd.metadata)
            ? (hydratedAd.metadata as Record<string, unknown>)
            : {};
        const nextMetadata = serializeMetadata(nextMetadataRecord);
        const nextMediaUrl = hydratedAd.mediaUrl ?? null;
        const currentMediaUrl = row.mediaUrl ?? null;

        stats.storedVariantVideos += countStoredVariantVideos(nextMetadataRecord);
        const retryCooldownActive = isRetryCooldownActive(nextMetadataRecord, args.force);

        if (currentMediaUrl === nextMediaUrl && currentMetadata === nextMetadata) {
          if (needsFreshVideoRefresh(nextMetadataRecord, args.force)) {
            if (retryCooldownActive) {
              stats.skippedRetryCooldown += 1;
              continue;
            }

            refreshCandidates.push({
              row,
              metadata: nextMetadataRecord,
            });
          }
        } else {
          stats.directUpdated += 1;

          if (!args.dryRun) {
            await pool.execute("update ads set media_url = ?, metadata = ?, updated_at = ? where id = ?", [
              nextMediaUrl,
              nextMetadata,
              new Date(),
              row.id,
            ]);
          }

          if (needsFreshVideoRefresh(nextMetadataRecord, args.force)) {
            if (retryCooldownActive) {
              stats.skippedRetryCooldown += 1;
              continue;
            }

            refreshCandidates.push({
              row: {
                ...row,
                mediaUrl: nextMediaUrl,
              },
              metadata: nextMetadataRecord,
            });
          }
        }
      }

      processed += chunk.length;
      logProgress(
        `${args.dryRun ? "scanned" : "processed"} ${processed}/${rows.length}; ${args.dryRun ? "would directly update" : "directly updated"} ${stats.directUpdated}`,
      );
    }

    const groupedRefreshCandidates = groupCandidatesByAdvertiser(
      refreshCandidates.filter((candidate) => {
        if (!candidate.row.sourceAdId?.trim()) {
          stats.skippedNoSourceAdId += 1;
          return false;
        }

        return true;
      }),
    );

    stats.staleVideoAds = refreshCandidates.length;

    if (groupedRefreshCandidates.length) {
      logProgress(
        `refreshing ${refreshCandidates.length} stale Meta video ads across ${groupedRefreshCandidates.length} advertisers`,
      );
    }

    const adapter = groupedRefreshCandidates.length ? await createWorkerSourceAdapter("facebook") : null;
    const metaProxyCount = groupedRefreshCandidates.length ? (await getMetaProxyUrlsAsync()).length : 0;

    if (groupedRefreshCandidates.length) {
      logProgress(
        metaProxyCount
          ? `Meta refresh transport=proxy-list proxyCount=${metaProxyCount}`
          : "Meta refresh transport=WebScrapingAPI/direct fallback; no proxy list configured",
      );
    }

    await runPool(groupedRefreshCandidates, args.concurrency, async (advertiserCandidates, index) => {
      const { sourceAdvertiserId } = advertiserCandidates[0].row;

      try {
        if (!adapter) {
          return;
        }

        stats.refreshedAdvertisers += 1;

        const targetSourceAdIds = new Set(
          advertiserCandidates
            .map((candidate) => candidate.row.sourceAdId?.trim())
            .filter((sourceAdId): sourceAdId is string => Boolean(sourceAdId)),
        );
        const fetchedAdsBySourceAdId = new Map<string, NormalizedAd>();
        const countries = args.countries.length ? args.countries : [null];
        const countryErrors: string[] = [];

        for (const country of countries) {
          if ([...targetSourceAdIds].every((sourceAdId) => fetchedAdsBySourceAdId.has(sourceAdId))) {
            break;
          }

          let fetchedAds: NormalizedAd[];

          try {
            fetchedAds = await adapter.fetchAdvertiserAds(sourceAdvertiserId, {
              country: country ?? undefined,
              maxResults: args.maxResults,
              sourceAdIds: [...targetSourceAdIds],
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            const rateLimited = isMetaRateLimitError(message);

            stats.failedCountryFetches += 1;
            countryErrors.push(`${country ?? "default"}: ${message}`);
            console.warn(
              `[backfill:meta-variant-videos] failed advertiser ${sourceAdvertiserId} country ${
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
            if (ad.sourceAdId && targetSourceAdIds.has(ad.sourceAdId) && !fetchedAdsBySourceAdId.has(ad.sourceAdId)) {
              fetchedAdsBySourceAdId.set(ad.sourceAdId, ad);
            }
          }
        }

        if (!fetchedAdsBySourceAdId.size && countryErrors.length === countries.length) {
          throw new Error(`All country refresh attempts failed: ${countryErrors.join("; ")}`);
        }

        const materializeInput: Array<{ candidate: RefreshCandidate; ad: NormalizedAd }> = [];

        for (const candidate of advertiserCandidates) {
          const sourceAdId = candidate.row.sourceAdId?.trim();
          const fetchedAd = sourceAdId ? fetchedAdsBySourceAdId.get(sourceAdId) : null;

          if (!fetchedAd) {
            stats.skippedNotFound += 1;
            continue;
          }

          materializeInput.push({
            candidate,
            ad: fetchedAd,
          });
        }

        if (!materializeInput.length) {
          return;
        }

        const hydratedAds = await materializeAdAssets(
          materializeInput.map(({ ad }) => ad),
          {
            forceSourceRefetch: args.force,
            persist: !args.dryRun,
          },
        );

        for (const [offset, hydratedAd] of hydratedAds.entries()) {
          const { candidate } = materializeInput[offset];
          const nextMetadata =
            hydratedAd.metadata && typeof hydratedAd.metadata === "object" && !Array.isArray(hydratedAd.metadata)
              ? mergeMetadata(candidate.metadata, hydratedAd.metadata)
              : candidate.metadata;
          const nextMediaUrl = hydratedAd.mediaUrl ?? candidate.row.mediaUrl ?? null;

          stats.refreshedAds += 1;
          stats.storedVariantVideos += countStoredVariantVideos(nextMetadata);
          clearBackfillState(nextMetadata);

          if (serializeMetadata(candidate.metadata) === serializeMetadata(nextMetadata) && (candidate.row.mediaUrl ?? null) === nextMediaUrl) {
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

        logProgress(
          `refreshed advertiser ${index + 1}/${groupedRefreshCandidates.length}: ${sourceAdvertiserId}; matched=${materializeInput.length}; updated=${stats.refreshedUpdated}`,
        );
      } catch (error) {
        stats.failedAdvertisers += 1;
        const message = error instanceof Error ? error.message : "Unknown error";
        const rateLimited = isMetaRateLimitError(message);

        await persistCandidateBackfillFailure({
          candidates: advertiserCandidates,
          dryRun: args.dryRun,
          error: message,
          pool,
          rateLimited,
        });

        console.warn(
          `[backfill:meta-variant-videos] failed advertiser ${sourceAdvertiserId}: ${
            rateLimited ? "Meta Ads Library rate limit: " : ""
          }${message}`
        );
      }
    });

    logProgress(
      [
        args.dryRun ? "dry-run summary" : "backfill summary",
        `inspected=${stats.scanned}`,
        `${args.dryRun ? "wouldDirectUpdate" : "directUpdated"}=${stats.directUpdated}`,
        `staleVideoAds=${stats.staleVideoAds}`,
        `refreshedAdvertisers=${stats.refreshedAdvertisers}`,
        `refreshedAds=${stats.refreshedAds}`,
        `${args.dryRun ? "wouldRefreshUpdate" : "refreshUpdated"}=${stats.refreshedUpdated}`,
        `storedVariantVideos=${stats.storedVariantVideos}`,
        `skippedRetryCooldown=${stats.skippedRetryCooldown}`,
        `skippedNoSourceAdId=${stats.skippedNoSourceAdId}`,
        `skippedNotFound=${stats.skippedNotFound}`,
        `failedCountryFetches=${stats.failedCountryFetches}`,
        `failedAdvertisers=${stats.failedAdvertisers}`,
      ].join(" "),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:meta-variant-videos] failed", error);
  process.exitCode = 1;
});
