import { getPool } from "@adluv/db";
import { repairMetaMojibakeText } from "@adluv/source-adapters";
import type { RowDataPacket } from "mysql2/promise";
import { createScriptProgressLogger } from "./progress";

type Args = {
  adId: string | null;
  dryRun: boolean;
  limit: number | null;
};

type AdRow = RowDataPacket & {
  id: string;
  title: string | null;
  body: string | null;
  metadata: unknown;
};

const logProgress = createScriptProgressLogger("backfill:meta-copy-normalization");

function parsePositiveInteger(value: string | undefined, fallback: number | null) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv: string[]): Args {
  const adIdFlag = argv.find((value) => value.startsWith("--ad-id="));
  const limitFlag = argv.find((value) => value.startsWith("--limit="));
  const adId = adIdFlag?.slice("--ad-id=".length).trim() || null;

  return {
    adId,
    dryRun: argv.includes("--dry-run"),
    limit: adId ? 1 : parsePositiveInteger(limitFlag?.slice("--limit=".length), null),
  };
}

function normalizeNullableText(value: string | null | undefined) {
  const repaired = repairMetaMojibakeText(value);
  return repaired?.replace(/\s+/g, " ").trim() || null;
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

function normalizeMetadataValue(value: unknown): unknown {
  if (typeof value === "string") {
    return repairMetaMojibakeText(value) ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeMetadataValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nestedValue]) => [
        key,
        normalizeMetadataValue(nestedValue),
      ]),
    );
  }

  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();

  try {
    const limitClause = args.limit ? `limit ${args.limit}` : "";
    const [rows] = await pool.query<AdRow[]>(
      `
        select id, title, body, metadata
        from ads
        where source = 'facebook'
          and (? is null or id = ?)
          and (
            title like '%â%'
            or title like '%Â%'
            or title like '%ð%'
            or title like '%ï%'
            or body like '%â%'
            or body like '%Â%'
            or body like '%ð%'
            or body like '%ï%'
            or cast(metadata as char) like '%â%'
            or cast(metadata as char) like '%Â%'
            or cast(metadata as char) like '%ð%'
            or cast(metadata as char) like '%ï%'
          )
        order by updated_at desc
        ${limitClause}
      `,
      [args.adId, args.adId],
    );
    let updated = 0;

    for (const row of rows) {
      const nextTitle = normalizeNullableText(row.title);
      const nextBody = normalizeNullableText(row.body);
      const metadata = parseMetadata(row.metadata);
      const nextMetadata = {
        ...(normalizeMetadataValue(metadata) as Record<string, unknown>),
        copyNormalizedAt: new Date().toISOString(),
      };

      if (
        nextTitle === row.title &&
        nextBody === row.body &&
        JSON.stringify(metadata) === JSON.stringify(nextMetadata)
      ) {
        continue;
      }

      updated += 1;

      if (!args.dryRun) {
        await pool.execute(
          `
            update ads
            set title = ?,
                body = ?,
                metadata = ?,
                updated_at = now(3)
            where id = ?
          `,
          [nextTitle, nextBody, JSON.stringify(nextMetadata), row.id],
        );
      }
    }

    logProgress(
      `${args.dryRun ? "would normalize" : "normalized"} ${updated} of ${rows.length} Meta ads`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:meta-copy-normalization] failed", error);
  process.exitCode = 1;
});
