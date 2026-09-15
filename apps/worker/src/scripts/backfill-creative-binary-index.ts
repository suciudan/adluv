import { getPool } from "@adluv/db";
import { getCdnAssetPathname, type SourceName } from "@adluv/config";
import { type RowDataPacket } from "mysql2/promise";
import { createScriptProgressLogger } from "./progress";

import { materializeAdAssets } from "../ad-assets";

type Args = {
  dryRun: boolean;
  limit: number | null;
  source: SourceName | null;
};

type AdRow = RowDataPacket & {
  id: string;
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

const chunkSize = 25;
const publicAssetPrefix = "/ad-assets/";

const logProgress = createScriptProgressLogger("backfill:creative-binary-index");

function parseArgs(argv: string[]): Args {
  const limitFlag = argv.find((value) => value.startsWith("--limit="));
  const sourceFlag = argv.find((value) => value.startsWith("--source="));
  const rawLimit = limitFlag ? Number.parseInt(limitFlag.slice("--limit=".length), 10) : null;
  const rawSource = sourceFlag?.slice("--source=".length).trim().toLowerCase() ?? null;
  const source = rawSource && ["google", "linkedin", "facebook", "tiktok"].includes(rawSource) ? (rawSource as SourceName) : null;

  return {
    dryRun: argv.includes("--dry-run"),
    limit: Number.isFinite(rawLimit) && rawLimit && rawLimit > 0 ? rawLimit : null,
    source,
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

function isStoredAssetUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return Boolean(getCdnAssetPathname(value)?.startsWith(publicAssetPrefix));
}

function collectNestedStrings(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectNestedStrings(item, depth + 1));
  }

  if (typeof value !== "object") {
    return [];
  }

  return Object.values(value as Record<string, unknown>).flatMap((item) => collectNestedStrings(item, depth + 1));
}

function sanitizeExternalUrl(value: string) {
  const trimmed = value.trim().replace(/\\/g, "");

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  return trimmed;
}

function extractGoogleArchivedImageUrl(metadata: Record<string, unknown>) {
  const rawPayload = metadata.rawPayload;

  if (!rawPayload) {
    return null;
  }

  return (
    collectNestedStrings(rawPayload)
      .map((value) => {
        const imgMatch =
          value.match(/<img[^>]+src=["']((?:https?:)?\/\/[^"' >]+)["']/i) ??
          value.match(/((?:https?:)?\/\/tpc\.googlesyndication\.com\/archive\/simgad\/[^"' <]+)/i);

        return imgMatch?.[1] ? sanitizeExternalUrl(imgMatch[1]) : null;
      })
      .find((value): value is string => Boolean(value)) ?? null
  );
}

function collectSourceUrls(rowMediaUrl: string | null, metadata: Record<string, unknown>) {
  const urls = new Set<string>();
  const sourceMediaUrl = typeof metadata.sourceMediaUrl === "string" ? metadata.sourceMediaUrl : rowMediaUrl;
  const sourceThumbnailUrl = typeof metadata.sourceThumbnailUrl === "string" ? metadata.sourceThumbnailUrl : null;
  const sourceVideoUrl = typeof metadata.sourceVideoUrl === "string" ? metadata.sourceVideoUrl : null;
  const googleArchivedImageUrl = extractGoogleArchivedImageUrl(metadata);

  for (const candidate of [sourceMediaUrl, sourceThumbnailUrl, sourceVideoUrl, googleArchivedImageUrl]) {
    if (candidate && !isStoredAssetUrl(candidate)) {
      urls.add(candidate);
    }
  }

  return urls;
}

function serializeMetadata(metadata: Record<string, unknown>) {
  return Object.keys(metadata).length ? JSON.stringify(metadata) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();

  try {
    const [rows] = await pool.query<AdRow[]>(
      `
        select
          id,
          source,
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
        where media_url is not null or metadata is not null
          ${args.source ? "and source = ?" : ""}
        order by updated_at desc
      `,
      args.source ? [args.source] : [],
    );

    const candidates = rows
      .map((row) => ({
        row,
        metadata: parseMetadata(row.metadata),
      }))
      .filter(({ row, metadata }) => collectSourceUrls(row.mediaUrl, metadata).size > 0);

    const targetRows = args.limit ? candidates.slice(0, args.limit) : candidates;
    const distinctSourceUrls = new Set(targetRows.flatMap(({ row, metadata }) => [...collectSourceUrls(row.mediaUrl, metadata)]));
    logProgress(
      `found ${targetRows.length} ${args.source ? `${args.source} ` : ""}ads with ${distinctSourceUrls.size} external creative URLs`,
    );

    let updated = 0;
    let processed = 0;

    for (let index = 0; index < targetRows.length; index += chunkSize) {
      const chunk = targetRows.slice(index, index + chunkSize);
      const hydratedAds = await materializeAdAssets(
        chunk.map(({ row, metadata }) => ({
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
          forceSourceRefetch: true,
          persist: !args.dryRun,
        },
      );

      for (const [offset, hydratedAd] of hydratedAds.entries()) {
        const { row, metadata } = chunk[offset];
        const currentMetadata = serializeMetadata(metadata);
        const nextMetadataRecord =
          hydratedAd.metadata && typeof hydratedAd.metadata === "object" && !Array.isArray(hydratedAd.metadata)
            ? (hydratedAd.metadata as Record<string, unknown>)
            : {};
        const nextMetadata = serializeMetadata(nextMetadataRecord);
        const currentMediaUrl = row.mediaUrl ?? null;
        const nextMediaUrl = hydratedAd.mediaUrl ?? null;
        const changed = currentMediaUrl !== nextMediaUrl || currentMetadata !== nextMetadata;

        if (!changed) {
          continue;
        }

        updated += 1;

        if (!args.dryRun) {
          await pool.execute("update ads set media_url = ?, metadata = ?, updated_at = ? where id = ?", [
            nextMediaUrl,
            nextMetadata,
            new Date(),
            row.id,
          ]);
        }
      }

      processed += chunk.length;
      logProgress(
        `${args.dryRun ? "scanned" : "processed"} ${processed}/${targetRows.length} ads; ${args.dryRun ? "would update" : "updated"} ${updated}`,
      );
    }

    logProgress(
      `${args.dryRun ? "dry run complete" : "backfill complete"}: ${targetRows.length} ads inspected, ${updated} ads ${args.dryRun ? "would change" : "changed"}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:creative-binary-index] failed", error);
  process.exitCode = 1;
});
