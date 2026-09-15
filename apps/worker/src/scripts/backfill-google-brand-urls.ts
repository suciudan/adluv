import { getPool } from "@adluv/db";
import { fetchGooglePreviewBrandUrl } from "@adluv/source-adapters";
import type { RowDataPacket } from "mysql2/promise";
import { createScriptProgressLogger } from "./progress";

type Args = {
  concurrency: number;
  dryRun: boolean;
  force: boolean;
  limit: number | null;
};

type AdRow = RowDataPacket & {
  id: string;
  sourceAdId: string | null;
  title: string | null;
  body: string | null;
  destinationUrl: string | null;
  metadata: unknown;
};

type Stats = {
  scanned: number;
  extracted: number;
  updated: number;
  skippedExisting: number;
  skippedNoPreview: number;
  skippedNoBrandUrl: number;
  failed: number;
};

const defaultConcurrency = 4;

const logProgress = createScriptProgressLogger("backfill:google-brand-urls");

function parsePositiveInteger(value: string | undefined, fallback: number | null) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv: string[]): Args {
  const limitFlag = argv.find((value) => value.startsWith("--limit="));
  const concurrencyFlag = argv.find((value) => value.startsWith("--concurrency="));

  return {
    concurrency: parsePositiveInteger(concurrencyFlag?.slice("--concurrency=".length), defaultConcurrency) ?? defaultConcurrency,
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    limit: parsePositiveInteger(limitFlag?.slice("--limit=".length), null),
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

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isGoogleInternalUrl(value: string | null | undefined) {
  const normalized = value?.toLowerCase() ?? "";

  return (
    !normalized ||
    normalized.includes("adstransparency.google.com") ||
    normalized.includes("googleadservices.com") ||
    normalized.includes("googlesyndication.com") ||
    normalized.includes("googleusercontent.com") ||
    normalized.includes("doubleclick.net") ||
    normalized.includes("gstatic.com")
  );
}

function cleanBrandUrl(value: string | null | undefined) {
  const normalized = value?.trim().replace(/^https?:\/\//i, "").toLowerCase() ?? "";
  let hostname = "";

  try {
    hostname = new URL(normalized, "https://adluv.local").hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    hostname = "";
  }

  return normalized && hostname !== "object.create" && !isGoogleInternalUrl(normalized) ? normalized : null;
}

function extractBrandUrlFromText(value: string | null | undefined) {
  const match = value?.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s"'<>]*)?/i);
  return cleanBrandUrl(match?.[0]);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();
  const stats: Stats = {
    scanned: 0,
    extracted: 0,
    updated: 0,
    skippedExisting: 0,
    skippedNoPreview: 0,
    skippedNoBrandUrl: 0,
    failed: 0,
  };

  try {
    const limitClause = args.limit ? `limit ${args.limit}` : "";
    const [rows] = await pool.query<AdRow[]>(
      `
        select
          id,
          source_ad_id as sourceAdId,
          title,
          body,
          destination_url as destinationUrl,
          metadata
        from ads
        where source = 'google'
          and metadata is not null
          and (
            ? = 1
            or json_unquote(json_extract(metadata, '$.googleBrandUrl')) is null
            or trim(json_unquote(json_extract(metadata, '$.googleBrandUrl'))) = ''
          )
        order by updated_at desc
        ${limitClause}
      `,
      [args.force ? 1 : 0],
    );

    logProgress(
      `found ${rows.length} google ads${args.dryRun ? " (dry run)" : ""}${args.force ? " with force" : ""}; concurrency=${args.concurrency}`,
    );

    await runPool(rows, args.concurrency, async (row, index) => {
      stats.scanned += 1;
      const metadata = parseMetadata(row.metadata);
      const existingBrandUrl = cleanBrandUrl(cleanText(metadata.googleBrandUrl));

      if (existingBrandUrl && !args.force) {
        stats.skippedExisting += 1;
        return;
      }

      const previewUrl = cleanText(metadata.previewUrl);
      let brandUrl = cleanBrandUrl(row.destinationUrl) ?? extractBrandUrlFromText(row.body) ?? extractBrandUrlFromText(row.title);

      if (!brandUrl && previewUrl) {
        try {
          brandUrl = cleanBrandUrl(
            await fetchGooglePreviewBrandUrl(previewUrl, {
              webScrapingApiKey: process.env.WEBSCRAPINGAPI_API_KEY?.trim() || undefined,
            }),
          );
        } catch (error) {
          stats.failed += 1;
          console.warn(
            `[backfill:google-brand-urls] failed ${row.id}${row.sourceAdId ? ` (${row.sourceAdId})` : ""}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
          return;
        }
      } else if (!previewUrl && !brandUrl) {
        stats.skippedNoPreview += 1;
        return;
      }

      if (!brandUrl) {
        stats.skippedNoBrandUrl += 1;
        return;
      }

      stats.extracted += 1;

      if (!args.dryRun) {
        await pool.execute("update ads set metadata = ?, updated_at = ? where id = ?", [
          JSON.stringify({
            ...metadata,
            googleBrandUrl: brandUrl,
          }),
          new Date(),
          row.id,
        ]);
      }

      stats.updated += 1;

      if ((index + 1) % 50 === 0) {
        logProgress(`processed ${index + 1}/${rows.length}`);
      }
    });

    logProgress(
      [
        `${args.dryRun ? "dry-run summary" : "backfill summary"}`,
        `scanned=${stats.scanned}`,
        `extracted=${stats.extracted}`,
        `updated=${args.dryRun ? 0 : stats.updated}`,
        `wouldUpdate=${args.dryRun ? stats.updated : 0}`,
        `skippedExisting=${stats.skippedExisting}`,
        `skippedNoPreview=${stats.skippedNoPreview}`,
        `skippedNoBrandUrl=${stats.skippedNoBrandUrl}`,
        `failed=${stats.failed}`,
      ].join(" "),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:google-brand-urls] failed", error);
  process.exitCode = 1;
});
