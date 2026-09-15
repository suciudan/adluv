import { getPool, importAdvertiserAdArchive } from "@adluv/db";
import { enrichGoogleCreativePreview, type NormalizedAd } from "@adluv/source-adapters";
import type { RowDataPacket } from "mysql2/promise";
import { pathToFileURL } from "node:url";
import { createScriptProgressLogger } from "./progress";

import { materializeAdAssets } from "../ad-assets";
import { getGoogleRpcProxyUrlsAsync, getWebScrapingApiProxyOptions } from "../source-adapter";

type Args = {
  adId: string | null;
  advertiserId: string | null;
  concurrency: number;
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  maxResults: number;
};

type CandidateRow = RowDataPacket & {
  id: string;
  advertiserId: string;
  sourceAdvertiserId: string;
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
  id: string;
  advertiserId: string;
  sourceAdvertiserId: string;
  sourceAdId: string;
  metadata: Record<string, unknown>;
};

type Stats = {
  scanned: number;
  candidateRows: number;
  refreshedAds: number;
  materializedVideos: number;
  materializedPosters: number;
  unmaterializedVideos: number;
  skippedHealthy: number;
  skippedNoSourceAdId: number;
  skippedNoVideo: number;
  failedAds: number;
  materializedVariations: number;
};

const defaultConcurrency = 1;
const defaultMaxResults = 100;

const logProgress = createScriptProgressLogger("backfill:google-video-assets");

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
  const limitFlag = argv.find((value) => value.startsWith("--limit="));
  const maxResultsFlag = argv.find((value) => value.startsWith("--max-results="));
  const adId = adIdFlag?.slice("--ad-id=".length).trim() || null;

  return {
    adId,
    advertiserId: advertiserIdFlag?.slice("--advertiser-id=".length).trim() || null,
    concurrency: parsePositiveInteger(concurrencyFlag?.slice("--concurrency=".length), defaultConcurrency) ?? defaultConcurrency,
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    limit: adId ? 1 : parsePositiveInteger(limitFlag?.slice("--limit=".length), null),
    maxResults: parsePositiveInteger(maxResultsFlag?.slice("--max-results=".length), defaultMaxResults) ?? defaultMaxResults,
  };
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

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStoredUrl(value: string | null) {
  return value?.replace(/\\u0026/gi, "&").replace(/\\([/?=&])/g, "$1") ?? null;
}

function extractYoutubeVideoIdFromThumbnailUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return value.match(/\/vi\/([^/?#]+)\//i)?.[1] ?? null;
}

function isVideoCandidate(row: CandidateRow) {
  const metadata = parseMetadata(row.metadata);
  const format = row.format?.toLowerCase() ?? "";
  const formatCode = String(metadata.googleFormatCode ?? "");

  return (
    format.includes("video") ||
    formatCode === "3" ||
    Boolean(cleanText(metadata.sourceVideoUrl)) ||
    Boolean(cleanText(metadata.assetVideoStoredUrl)) ||
    hasGoogleYoutubeVideoId(metadata)
  );
}

function hasStoredPoster(row: CandidateRow | NormalizedAd) {
  const metadata = parseMetadata(row.metadata);
  const assets = Array.isArray(metadata.googleCreativeAssets) ? metadata.googleCreativeAssets : [];

  return (
    Boolean(cleanText(row.mediaUrl)) ||
    Boolean(cleanText(metadata.assetStoredUrl)) ||
    Boolean(cleanText(metadata.assetThumbnailStoredUrl)) ||
    assets.some((asset) => {
      if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
        return false;
      }

      const record = asset as Record<string, unknown>;
      return Boolean(cleanText(record.assetStoredUrl) || cleanText(record.assetThumbnailStoredUrl));
    })
  );
}

function hasDirectVideoSource(metadata: Record<string, unknown>) {
  const assets = Array.isArray(metadata.googleCreativeAssets) ? metadata.googleCreativeAssets : [];

  return (
    Boolean(cleanText(metadata.sourceVideoUrl)) ||
    Boolean(cleanText(metadata.assetVideoStoredUrl)) ||
    assets.some((asset) => {
      if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
        return false;
      }

      const record = asset as Record<string, unknown>;
      return Boolean(cleanText(record.sourceVideoUrl) || cleanText(record.assetVideoStoredUrl));
    })
  );
}

function hasGoogleYoutubeVideoId(metadata: Record<string, unknown>) {
  const assets = Array.isArray(metadata.googleCreativeAssets) ? metadata.googleCreativeAssets : [];

  return (
    Boolean(
      cleanText(metadata.googleYoutubeVideoId) ||
        extractYoutubeVideoIdFromThumbnailUrl(metadata.sourceThumbnailUrl) ||
        extractYoutubeVideoIdFromThumbnailUrl(metadata.sourceMediaUrl),
    ) ||
    assets.some((asset) => {
      if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
        return false;
      }

      const record = asset as Record<string, unknown>;

      return Boolean(
        cleanText(record.googleYoutubeVideoId) ||
          extractYoutubeVideoIdFromThumbnailUrl(record.sourceThumbnailUrl) ||
          extractYoutubeVideoIdFromThumbnailUrl(record.sourceMediaUrl),
      );
    })
  );
}

function hasMissingGoogleCreativeVariations(metadata: Record<string, unknown>) {
  const assets = Array.isArray(metadata.googleCreativeAssets) ? metadata.googleCreativeAssets : [];
  const variationTotal = Number(metadata.googleCreativeVariationTotal ?? 0);

  if (assets.length === 0) {
    return true;
  }

  if (Number.isFinite(variationTotal) && variationTotal > assets.length) {
    return true;
  }

  return assets.some((asset) => {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
      return false;
    }

    const record = asset as Record<string, unknown>;
    return Boolean(cleanText(record.sourceVideoUrl) && !cleanText(record.assetVideoStoredUrl));
  });
}

export function shouldBackfillGoogleVideoAssetRow(row: CandidateRow, args: Pick<Args, "adId" | "force">) {
  if (!row.sourceAdId?.trim()) {
    return false;
  }

  if (args.force && args.adId) {
    return true;
  }

  if (!isVideoCandidate(row)) {
    return false;
  }

  if (args.force) {
    return true;
  }

  const metadata = parseMetadata(row.metadata);
  const assetVideoStoredUrl = cleanText(metadata.assetVideoStoredUrl);
  const assetVideoStorageError = cleanText(metadata.assetVideoStorageError);
  const sourceVideoUrl = cleanText(metadata.sourceVideoUrl);
  const normalizedSourceVideoUrl = normalizeStoredUrl(sourceVideoUrl);
  const missingVariations = hasMissingGoogleCreativeVariations(metadata);

  if (
    !hasDirectVideoSource(metadata) &&
    !hasGoogleYoutubeVideoId(metadata) &&
    hasStoredPoster(row) &&
    !missingVariations &&
    !assetVideoStorageError
  ) {
    return false;
  }

  return (
    !assetVideoStoredUrl ||
    Boolean(assetVideoStorageError) ||
    sourceVideoUrl !== normalizedSourceVideoUrl ||
    missingVariations
  );
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

function hasVideoAsset(ad: NormalizedAd) {
  if (cleanText(ad.metadata?.assetVideoStoredUrl)) {
    return true;
  }

  const assets = Array.isArray(ad.metadata?.googleCreativeAssets) ? ad.metadata.googleCreativeAssets : [];

  return assets.some((asset) => {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
      return false;
    }

    return Boolean(cleanText((asset as Record<string, unknown>).assetVideoStoredUrl));
  });
}

function hasSourceVideo(ad: NormalizedAd) {
  return Boolean(cleanText(ad.metadata?.sourceVideoUrl));
}

function hasGoogleCreativeAssets(ad: NormalizedAd) {
  return Array.isArray(ad.metadata?.googleCreativeAssets) && ad.metadata.googleCreativeAssets.length > 0;
}

function countMaterializedGoogleVariations(ad: NormalizedAd) {
  const assets = Array.isArray(ad.metadata?.googleCreativeAssets) ? ad.metadata.googleCreativeAssets : [];

  return assets.filter((asset) => {
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
      return false;
    }

    return Boolean(cleanText((asset as Record<string, unknown>).assetVideoStoredUrl));
  }).length;
}

function rowToNormalizedAd(row: CandidateRow): NormalizedAd {
  return {
    source: "google",
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
    metadata: parseMetadata(row.metadata),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();
  const googleRpcProxyUrls = await getGoogleRpcProxyUrlsAsync();
  const googlePreviewOptions = {
    googleRpcProxyUrls,
    webScrapingApiProxy: getWebScrapingApiProxyOptions(),
    webScrapingApiKey: process.env.WEBSCRAPINGAPI_API_KEY?.trim() || undefined,
  };
  const stats: Stats = {
    scanned: 0,
    candidateRows: 0,
    refreshedAds: 0,
    materializedVideos: 0,
    materializedPosters: 0,
    unmaterializedVideos: 0,
    skippedHealthy: 0,
    skippedNoSourceAdId: 0,
    skippedNoVideo: 0,
    failedAds: 0,
    materializedVariations: 0,
  };

  try {
    const limitClause = args.limit ? `limit ${args.limit}` : "";
    const [rows] = await pool.query<CandidateRow[]>(
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
        where ads.source = 'google'
          and advertisers.source = 'google'
          and (? is null or ads.id = ?)
          and (? is null or ads.advertiser_id = ?)
        order by ads.updated_at desc
        ${limitClause}
      `,
      [args.adId, args.adId, args.advertiserId, args.advertiserId],
    );

    stats.scanned = rows.length;

    const candidates: Candidate[] = [];

    for (const row of rows) {
      if (!row.sourceAdId?.trim()) {
        if (isVideoCandidate(row)) {
          stats.skippedNoSourceAdId += 1;
        }
        continue;
      }

      if (!shouldBackfillGoogleVideoAssetRow(row, args)) {
        if (isVideoCandidate(row)) {
          stats.skippedHealthy += 1;
        }
        continue;
      }

      candidates.push({
        id: row.id,
        advertiserId: row.advertiserId,
        sourceAdvertiserId: row.sourceAdvertiserId,
        sourceAdId: row.sourceAdId.trim(),
        metadata: parseMetadata(row.metadata),
      });
    }

    stats.candidateRows = candidates.length;

    logProgress(
      [
        `found ${stats.candidateRows} google video candidates`,
        args.dryRun ? "(dry run)" : "",
        args.force ? "with force" : "",
        `concurrency=${args.concurrency}`,
      ].filter(Boolean).join(" "),
    );

    await runPool(candidates, args.concurrency, async (candidate, index) => {
      try {
        const row = rows.find((current) => current.id === candidate.id);

        if (!row) {
          stats.failedAds += 1;
          return;
        }

        const refreshedAd = await enrichGoogleCreativePreview(rowToNormalizedAd(row), googlePreviewOptions);

        if (
          !hasSourceVideo(refreshedAd) &&
          !hasVideoAsset(refreshedAd) &&
          !hasGoogleCreativeAssets(refreshedAd) &&
          !hasGoogleYoutubeVideoId(parseMetadata(refreshedAd.metadata))
        ) {
          stats.skippedNoVideo += 1;
          return;
        }

        if (args.dryRun) {
          stats.refreshedAds += 1;
          return;
        }

        const hydratedAds = await materializeAdAssets([refreshedAd], {
          sourceProxyUrls: googleRpcProxyUrls,
        });
        const adsWithStoredVideo = hydratedAds.filter((ad) => hasVideoAsset(ad));
        const adsWithStoredPoster = hydratedAds.filter((ad) => hasStoredPoster(ad));

        stats.refreshedAds += hydratedAds.length;
        stats.materializedVideos += adsWithStoredVideo.length;
        stats.materializedPosters += adsWithStoredPoster.length;
        stats.unmaterializedVideos += hydratedAds.length - adsWithStoredVideo.length;
        stats.materializedVariations += hydratedAds.reduce((sum, ad) => sum + countMaterializedGoogleVariations(ad), 0);
        stats.failedAds += hydratedAds.length - adsWithStoredPoster.length;

        await importAdvertiserAdArchive({
          advertiserId: candidate.advertiserId,
          ads: hydratedAds,
        });

        logProgress(
          `processed ad ${index + 1}/${candidates.length}: ${candidate.id}; poster=${adsWithStoredPoster.length}; video=${adsWithStoredVideo.length}; unmaterializedVideo=${hydratedAds.length - adsWithStoredVideo.length}`,
        );
      } catch (error) {
        stats.failedAds += 1;
        console.warn(
          `[backfill:google-video-assets] failed ad ${candidate.id}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    });

    logProgress(
      [
        args.dryRun ? "dry-run summary" : "backfill summary",
        `scanned=${stats.scanned}`,
        `candidateRows=${stats.candidateRows}`,
        `refreshedAds=${stats.refreshedAds}`,
        `materializedVideos=${stats.materializedVideos}`,
        `materializedPosters=${stats.materializedPosters}`,
        `unmaterializedVideos=${stats.unmaterializedVideos}`,
        `materializedVariations=${stats.materializedVariations}`,
        `wouldRefresh=${args.dryRun ? stats.refreshedAds : 0}`,
        `skippedHealthy=${stats.skippedHealthy}`,
        `skippedNoSourceAdId=${stats.skippedNoSourceAdId}`,
        `skippedNoVideo=${stats.skippedNoVideo}`,
        `failedAds=${stats.failedAds}`,
      ].join(" "),
    );
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[backfill:google-video-assets] failed", error);
    process.exitCode = 1;
  });
}
