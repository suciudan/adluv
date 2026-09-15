import { getPool } from "@adluv/db";
import type { SourceName } from "@adluv/config";
import { type RowDataPacket } from "mysql2/promise";
import { createScriptProgressLogger } from "./progress";

import { materializeAdAssets } from "../ad-assets";

type Args = {
  dryRun: boolean;
  limit: number | null;
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

const chunkSize = 50;

const logProgress = createScriptProgressLogger("backfill:ad-media-dimensions");

function parseArgs(argv: string[]): Args {
  const limitFlag = argv.find((value) => value.startsWith("--limit="));
  const rawLimit = limitFlag ? Number.parseInt(limitFlag.slice("--limit=".length), 10) : null;

  return {
    dryRun: argv.includes("--dry-run"),
    limit: Number.isFinite(rawLimit) && rawLimit && rawLimit > 0 ? rawLimit : null,
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

function hasMediaDimensions(metadata: Record<string, unknown>) {
  const keys = [
    ["assetWidth", "assetHeight"],
    ["assetThumbnailWidth", "assetThumbnailHeight"],
    ["assetVideoWidth", "assetVideoHeight"],
  ] as const;

  return keys.some(([widthKey, heightKey]) => {
    const width = metadata[widthKey];
    const height = metadata[heightKey];

    return typeof width === "number" && Number.isFinite(width) && typeof height === "number" && Number.isFinite(height);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();
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
      order by updated_at desc
    `,
  );

  const candidates = rows
    .map((row) => ({
      row,
      metadata: parseMetadata(row.metadata),
    }))
    .filter(({ row, metadata }) => {
      if (hasMediaDimensions(metadata)) {
        return false;
      }

      return Boolean(
        row.mediaUrl ||
          typeof metadata.sourceMediaUrl === "string" ||
          typeof metadata.assetStoredUrl === "string" ||
          typeof metadata.sourceVideoUrl === "string" ||
          typeof metadata.assetVideoStoredUrl === "string",
      );
    });

  const targetRows = args.limit ? candidates.slice(0, args.limit) : candidates;
  logProgress(`found ${targetRows.length} ads without stored media dimensions`);

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
    );

    for (const [offset, hydratedAd] of hydratedAds.entries()) {
      const { row } = chunk[offset];
      const metadata = hydratedAd.metadata ?? {};

      if (!hasMediaDimensions(metadata)) {
        continue;
      }

      updated += 1;

      if (!args.dryRun) {
        await pool.execute("update ads set media_url = ?, metadata = ?, updated_at = ? where id = ?", [
          hydratedAd.mediaUrl ?? null,
          JSON.stringify(metadata),
          new Date(),
          row.id,
        ]);
      }
    }

    processed += chunk.length;
    logProgress(`${args.dryRun ? "scanned" : "processed"} ${processed}/${targetRows.length} ads`);
  }

  logProgress(`${args.dryRun ? "would backfill" : "backfilled"} ${updated} ads with media dimensions`);
  await pool.end();
}

main().catch((error) => {
  console.error("[backfill:ad-media-dimensions] failed", error);
  process.exitCode = 1;
});
