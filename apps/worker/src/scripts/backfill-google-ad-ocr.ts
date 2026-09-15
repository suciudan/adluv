import { getPool } from "@adluv/db";
import type { NormalizedAd } from "@adluv/source-adapters";
import type { RowDataPacket } from "mysql2/promise";
import { createScriptProgressLogger } from "./progress";

import { materializeAdAssets } from "../ad-assets";
import { disposeGoogleAdOcrWorkers, enrichGoogleAdsWithOcr } from "../google-ad-ocr";

type Args = {
  adId: string | null;
  dryRun: boolean;
  force: boolean;
  limit: number | null;
};

type BackfillStats = {
  scanned: number;
  hydrated: number;
  completed: number;
  lowConfidence: number;
  noText: number;
  skippedNonImage: number;
  failed: number;
  reused: number;
  rowsUpdated: number;
};

type AdRow = RowDataPacket & {
  id: string;
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

const chunkSize = 25;

const logProgress = createScriptProgressLogger("backfill:google-ad-ocr");

function parseArgs(argv: string[]): Args {
  const adIdFlag = argv.find((value) => value.startsWith("--ad-id="));
  const limitFlag = argv.find((value) => value.startsWith("--limit="));
  const rawLimit = limitFlag ? Number.parseInt(limitFlag.slice("--limit=".length), 10) : null;
  const adId = adIdFlag?.slice("--ad-id=".length).trim() || null;

  return {
    adId,
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    limit: adId ? 1 : Number.isFinite(rawLimit) && rawLimit && rawLimit > 0 ? rawLimit : null,
  };
}

function parseMetadata(value: unknown) {
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

function hasUsableCopy(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeNullableString(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function buildHydrationSnapshot(ad: { mediaUrl?: string | null; metadata?: Record<string, unknown> | null }) {
  const metadata = ad.metadata ?? {};

  return JSON.stringify({
    mediaUrl: ad.mediaUrl ?? null,
    assetStoredUrl: typeof metadata.assetStoredUrl === "string" ? metadata.assetStoredUrl : null,
    assetStoredPath: typeof metadata.assetStoredPath === "string" ? metadata.assetStoredPath : null,
    assetThumbnailStoredUrl:
      typeof metadata.assetThumbnailStoredUrl === "string" ? metadata.assetThumbnailStoredUrl : null,
    assetThumbnailStoredPath:
      typeof metadata.assetThumbnailStoredPath === "string" ? metadata.assetThumbnailStoredPath : null,
    assetVideoStoredUrl: typeof metadata.assetVideoStoredUrl === "string" ? metadata.assetVideoStoredUrl : null,
    assetVideoStoredPath: typeof metadata.assetVideoStoredPath === "string" ? metadata.assetVideoStoredPath : null,
    assetWidth: typeof metadata.assetWidth === "number" ? metadata.assetWidth : null,
    assetHeight: typeof metadata.assetHeight === "number" ? metadata.assetHeight : null,
    assetThumbnailWidth: typeof metadata.assetThumbnailWidth === "number" ? metadata.assetThumbnailWidth : null,
    assetThumbnailHeight: typeof metadata.assetThumbnailHeight === "number" ? metadata.assetThumbnailHeight : null,
    assetVideoWidth: typeof metadata.assetVideoWidth === "number" ? metadata.assetVideoWidth : null,
    assetVideoHeight: typeof metadata.assetVideoHeight === "number" ? metadata.assetVideoHeight : null,
  });
}

function rowToNormalizedAd(row: AdRow): NormalizedAd {
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

function shouldBackfillRow(row: AdRow, force: boolean) {
  if (force) {
    return true;
  }

  const metadata = parseMetadata(row.metadata);
  const googleBrandUrl = normalizeNullableString(
    typeof metadata.googleBrandUrl === "string" ? metadata.googleBrandUrl : null,
  );

  return !hasUsableCopy(row.title) || !hasUsableCopy(row.body) || !googleBrandUrl;
}

function needsDatabaseUpdate(row: AdRow, ad: NormalizedAd) {
  const currentMetadataJson = JSON.stringify(parseMetadata(row.metadata));
  const nextMetadataJson = JSON.stringify(ad.metadata ?? {});

  return (
    normalizeNullableString(row.title) !== normalizeNullableString(ad.title) ||
    normalizeNullableString(row.body) !== normalizeNullableString(ad.body) ||
    normalizeNullableString(row.mediaUrl) !== normalizeNullableString(ad.mediaUrl) ||
    currentMetadataJson !== nextMetadataJson
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();
  const stats: BackfillStats = {
    scanned: 0,
    hydrated: 0,
    completed: 0,
    lowConfidence: 0,
    noText: 0,
    skippedNonImage: 0,
    failed: 0,
    reused: 0,
    rowsUpdated: 0,
  };

  try {
    const limitClause = args.limit ? `limit ${args.limit}` : "";
    const [rows] = await pool.query<AdRow[]>(
      `
        select
          id,
          source_ad_id as sourceAdId,
          fingerprint,
          title,
          body,
          payer,
          format,
          call_to_action as callToAction,
          destination_url as destinationUrl,
          media_url as mediaUrl,
          status,
          reaction_count as reactionCount,
          comment_count as commentCount,
          first_seen_at as firstSeenAt,
          last_seen_at as lastSeenAt,
          metadata
        from ads
        where source = 'google'
          and (? is null or id = ?)
          and (
            media_url is not null
            or json_unquote(json_extract(metadata, '$.assetStoredUrl')) is not null
            or json_unquote(json_extract(metadata, '$.assetThumbnailStoredUrl')) is not null
            or json_unquote(json_extract(metadata, '$.googleArchivedImageHtml')) is not null
          )
          and coalesce(lower(format), '') not like '%video%'
          and (
            coalesce(json_unquote(json_extract(metadata, '$.googleFormatCode')), '') = '1'
            or (
              json_extract(metadata, '$.googleFormatCode') is null
              and coalesce(lower(format), '') like '%text%'
            )
          )
          and (
            title is null or trim(title) = ''
            or body is null or trim(body) = ''
            or json_unquote(json_extract(metadata, '$.googleBrandUrl')) is null
            or trim(json_unquote(json_extract(metadata, '$.googleBrandUrl'))) = ''
            or ? = 1
          )
        order by updated_at desc
        ${limitClause}
      `,
      [args.adId, args.adId, args.force ? 1 : 0],
    );

    const candidates = rows.filter((row) => shouldBackfillRow(row, args.force));

    logProgress(
      `found ${candidates.length} candidate google ads${args.dryRun ? " (dry run)" : ""}${args.force ? " with force" : ""}`,
    );

    for (let index = 0; index < candidates.length; index += chunkSize) {
      const chunk = candidates.slice(index, index + chunkSize);
      const normalizedAds = chunk.map((row) => rowToNormalizedAd(row));
      const hydrationSnapshots = normalizedAds.map((ad) => buildHydrationSnapshot(ad));
      const hydratedAds = await materializeAdAssets(normalizedAds, {
        persist: !args.dryRun,
      });
      const ocrResult = await enrichGoogleAdsWithOcr(hydratedAds, {
        concurrency: 2,
        force: args.force,
        timeoutMs: 15_000,
      });

      stats.scanned += ocrResult.stats.scanned;
      stats.completed += ocrResult.stats.completed;
      stats.lowConfidence += ocrResult.stats.lowConfidence;
      stats.noText += ocrResult.stats.noText;
      stats.skippedNonImage += ocrResult.stats.skippedNonImage;
      stats.failed += ocrResult.stats.failed;
      stats.reused += ocrResult.stats.reused;

      for (const [offset, nextAd] of ocrResult.ads.entries()) {
        const row = chunk[offset];

        if (hydrationSnapshots[offset] !== buildHydrationSnapshot(nextAd)) {
          stats.hydrated += 1;
        }

        if (!needsDatabaseUpdate(row, nextAd)) {
          continue;
        }

        stats.rowsUpdated += 1;

        if (!args.dryRun) {
          await pool.execute("update ads set title = ?, body = ?, media_url = ?, metadata = ?, updated_at = ? where id = ?", [
            normalizeNullableString(nextAd.title),
            normalizeNullableString(nextAd.body),
            normalizeNullableString(nextAd.mediaUrl),
            JSON.stringify(nextAd.metadata ?? {}),
            new Date(),
            row.id,
          ]);
        }
      }

      logProgress(
        `${args.dryRun ? "scanned" : "processed"} ${Math.min(index + chunk.length, candidates.length)}/${candidates.length} ads`,
      );
    }

    logProgress(
      [
        `${args.dryRun ? "dry-run summary" : "backfill summary"}`,
        `scanned=${stats.scanned}`,
        `hydrated=${stats.hydrated}`,
        `completed=${stats.completed}`,
        `low_confidence=${stats.lowConfidence}`,
        `no_text=${stats.noText}`,
        `skipped_non_image=${stats.skippedNonImage}`,
        `failed=${stats.failed}`,
        `reused=${stats.reused}`,
        `${args.dryRun ? "would_update" : "rows_updated"}=${stats.rowsUpdated}`,
      ].join(" "),
    );
  } finally {
    await disposeGoogleAdOcrWorkers().catch(() => undefined);
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:google-ad-ocr] failed", error);
  process.exitCode = 1;
});
