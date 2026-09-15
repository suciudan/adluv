import { getPool } from "@adluv/db";
import { resolveCdnAssetUrl } from "@adluv/config";
import { type RowDataPacket } from "mysql2/promise";
import { createScriptProgressLogger } from "./progress";

type Args = {
  dryRun: boolean;
  limit: number | null;
};

type AdRow = RowDataPacket & {
  id: string;
  mediaUrl: string | null;
  metadata: unknown;
};

const chunkSize = 100;

const logProgress = createScriptProgressLogger("backfill:cdn-asset-urls");

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

function normalizeValue(value: unknown): { changed: boolean; value: unknown } {
  if (typeof value === "string") {
    const normalized = resolveCdnAssetUrl(value);
    return {
      changed: normalized !== value,
      value: normalized,
    };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const normalized = value.map((entry) => {
      const result = normalizeValue(entry);
      changed ||= result.changed;
      return result.value;
    });

    return { changed, value: normalized };
  }

  if (value && typeof value === "object") {
    let changed = false;
    const normalized = Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        const result = normalizeValue(entry);
        changed ||= result.changed;
        return [key, result.value];
      }),
    );

    return { changed, value: normalized };
  }

  return { changed: false, value };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();

  try {
    const [rows] = await pool.query<AdRow[]>(
      `
        select
          id,
          media_url as mediaUrl,
          metadata
        from ads
        where media_url is not null or metadata is not null
        order by updated_at desc
      `,
    );

    const candidates = rows
      .map((row) => {
        const metadata = parseMetadata(row.metadata);
        const mediaUrl = resolveCdnAssetUrl(row.mediaUrl);
        const normalizedMetadataResult = normalizeValue(metadata);

        return {
          id: row.id,
          mediaUrl,
          metadata: normalizedMetadataResult.value as Record<string, unknown>,
          changed: mediaUrl !== row.mediaUrl || normalizedMetadataResult.changed,
        };
      })
      .filter((row) => row.changed);

    const targetRows = args.limit ? candidates.slice(0, args.limit) : candidates;
    logProgress(`found ${targetRows.length} ads with CDN URLs to normalize`);

    let updated = 0;
    let processed = 0;

    for (let index = 0; index < targetRows.length; index += chunkSize) {
      const chunk = targetRows.slice(index, index + chunkSize);

      for (const row of chunk) {
        updated += 1;

        if (!args.dryRun) {
          await pool.execute("update ads set media_url = ?, metadata = ?, updated_at = ? where id = ?", [
            row.mediaUrl,
            JSON.stringify(row.metadata),
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

    logProgress(`${args.dryRun ? "dry run complete" : "backfill complete"}: ${updated} ads ${args.dryRun ? "would change" : "changed"}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:cdn-asset-urls] failed", error);
  process.exitCode = 1;
});
