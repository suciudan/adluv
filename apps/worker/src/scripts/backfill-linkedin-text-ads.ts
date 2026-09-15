import { getPool } from "@adluv/db";
import { fetchLinkedInAdDetail } from "@adluv/source-adapters";
import type { RowDataPacket } from "mysql2/promise";
import { createScriptProgressLogger } from "./progress";

type Args = {
  adId: string | null;
  advertiserId: string | null;
  concurrency: number;
  dryRun: boolean;
  force: boolean;
  limit: number | null;
};

type AdRow = RowDataPacket & {
  id: string;
  advertiserId: string;
  sourceAdvertiserId: string;
  sourceAdId: string | null;
  title: string | null;
  body: string | null;
  payer: string | null;
  format: string | null;
  callToAction: string | null;
  destinationUrl: string | null;
  mediaUrl: string | null;
  metadata: unknown;
};

type Stats = {
  scanned: number;
  candidates: number;
  fetched: number;
  updated: number;
  skippedHealthy: number;
  skippedNoSourceAdId: number;
  skippedNoDetail: number;
  skippedNoCopy: number;
  failed: number;
};

const defaultConcurrency = 2;

const logProgress = createScriptProgressLogger("backfill:linkedin-text-ads");

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
  const adId = adIdFlag?.slice("--ad-id=".length).trim() || null;

  return {
    adId,
    advertiserId: advertiserIdFlag?.slice("--advertiser-id=".length).trim() || null,
    concurrency: parsePositiveInteger(concurrencyFlag?.slice("--concurrency=".length), defaultConcurrency) ?? defaultConcurrency,
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    limit: adId ? 1 : parsePositiveInteger(limitFlag?.slice("--limit=".length), null),
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

function normalizeFormat(value: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isTextFormat(value: string | null) {
  const normalized = normalizeFormat(value);

  return (
    normalized.includes("text") ||
    normalized.includes("texto") ||
    normalized.includes("texte") ||
    normalized.includes("tekst")
  );
}

function shouldBackfill(row: AdRow, force: boolean) {
  if (!row.sourceAdId?.trim()) {
    return false;
  }

  if (force) {
    return true;
  }

  return isTextFormat(row.format) && (!cleanText(row.title) || !cleanText(row.body) || normalizeFormat(row.format) !== "text");
}

function mergeMetadata(row: AdRow, nextMetadata: Record<string, unknown> | undefined) {
  return {
    ...parseMetadata(row.metadata),
    ...(nextMetadata ?? {}),
  };
}

function hasChanges(row: AdRow, next: {
  title: string | null;
  body: string | null;
  payer: string | null;
  format: string | null;
  callToAction: string | null;
  destinationUrl: string | null;
  mediaUrl: string | null;
  metadata: Record<string, unknown>;
}) {
  return (
    cleanText(row.title) !== next.title ||
    cleanText(row.body) !== next.body ||
    cleanText(row.payer) !== next.payer ||
    cleanText(row.format) !== next.format ||
    cleanText(row.callToAction) !== next.callToAction ||
    cleanText(row.destinationUrl) !== next.destinationUrl ||
    cleanText(row.mediaUrl) !== next.mediaUrl ||
    JSON.stringify(parseMetadata(row.metadata)) !== JSON.stringify(next.metadata)
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();
  const stats: Stats = {
    scanned: 0,
    candidates: 0,
    fetched: 0,
    updated: 0,
    skippedHealthy: 0,
    skippedNoSourceAdId: 0,
    skippedNoDetail: 0,
    skippedNoCopy: 0,
    failed: 0,
  };

  try {
    const limitClause = args.limit ? `limit ${args.limit}` : "";
    const [rows] = await pool.query<AdRow[]>(
      `
        select
          ads.id,
          ads.advertiser_id as advertiserId,
          advertisers.source_advertiser_id as sourceAdvertiserId,
          ads.source_ad_id as sourceAdId,
          ads.title,
          ads.body,
          ads.payer,
          ads.format,
          ads.call_to_action as callToAction,
          ads.destination_url as destinationUrl,
          ads.media_url as mediaUrl,
          ads.metadata
        from ads
        inner join advertisers on advertisers.id = ads.advertiser_id
        where ads.source = 'linkedin'
          and advertisers.source = 'linkedin'
          and (? is null or ads.id = ?)
          and (? is null or ads.advertiser_id = ?)
          and (
            ? = 1
            or lower(coalesce(ads.format, '')) like '%text%'
            or lower(coalesce(ads.format, '')) like '%texto%'
            or lower(coalesce(ads.format, '')) like '%texte%'
            or lower(coalesce(ads.format, '')) like '%tekst%'
          )
        order by ads.updated_at desc
        ${limitClause}
      `,
      [args.adId, args.adId, args.advertiserId, args.advertiserId, args.force ? 1 : 0],
    );

    stats.scanned = rows.length;

    const candidates = rows.filter((row) => {
      if (!row.sourceAdId?.trim()) {
        if (isTextFormat(row.format)) {
          stats.skippedNoSourceAdId += 1;
        }
        return false;
      }

      if (!shouldBackfill(row, args.force)) {
        stats.skippedHealthy += 1;
        return false;
      }

      return true;
    });

    stats.candidates = candidates.length;

    logProgress(
      [
        `found ${stats.candidates} linkedin text-ad candidates`,
        args.dryRun ? "(dry run)" : "",
        args.force ? "with force" : "",
        `concurrency=${args.concurrency}`,
      ].filter(Boolean).join(" "),
    );

    await runPool(candidates, args.concurrency, async (row, index) => {
      try {
        const hydratedAd = await fetchLinkedInAdDetail(row.sourceAdId ?? "", {
          fallbackPayer: row.payer ?? undefined,
          sourceAdvertiserId: row.sourceAdvertiserId,
          webScrapingApiKey: process.env.WEBSCRAPINGAPI_API_KEY?.trim() || undefined,
        });

        if (!hydratedAd) {
          stats.skippedNoDetail += 1;
          return;
        }

        stats.fetched += 1;

        const title = cleanText(hydratedAd.title);
        const body = cleanText(hydratedAd.body);

        if (!title && !body) {
          stats.skippedNoCopy += 1;
          return;
        }

        const next = {
          title: title ?? cleanText(row.title),
          body: body ?? cleanText(row.body),
          payer: cleanText(hydratedAd.payer) ?? cleanText(row.payer),
          format: cleanText(hydratedAd.format) ?? (isTextFormat(row.format) ? "text" : cleanText(row.format)),
          callToAction: cleanText(hydratedAd.callToAction) ?? cleanText(row.callToAction),
          destinationUrl: cleanText(hydratedAd.destinationUrl) ?? cleanText(row.destinationUrl),
          mediaUrl: cleanText(hydratedAd.mediaUrl) ?? cleanText(row.mediaUrl),
          metadata: mergeMetadata(row, hydratedAd.metadata),
        };

        if (!hasChanges(row, next)) {
          return;
        }

        stats.updated += 1;

        if (!args.dryRun) {
          await pool.execute(
            `
              update ads
              set title = ?,
                  body = ?,
                  payer = ?,
                  format = ?,
                  call_to_action = ?,
                  destination_url = ?,
                  media_url = ?,
                  metadata = ?,
                  updated_at = ?
              where id = ?
            `,
            [
              next.title,
              next.body,
              next.payer,
              next.format,
              next.callToAction,
              next.destinationUrl,
              next.mediaUrl,
              JSON.stringify({
                ...next.metadata,
                linkedInTextAdBackfilledAt: new Date().toISOString(),
              }),
              new Date(),
              row.id,
            ],
          );
        }

        if ((index + 1) % 25 === 0) {
          logProgress(`processed ${index + 1}/${candidates.length}`);
        }
      } catch (error) {
        stats.failed += 1;
        console.warn(
          `[backfill:linkedin-text-ads] failed ${row.id}${row.sourceAdId ? ` (${row.sourceAdId})` : ""}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }
    });

    logProgress(
      [
        args.dryRun ? "dry-run summary" : "backfill summary",
        `scanned=${stats.scanned}`,
        `candidates=${stats.candidates}`,
        `fetched=${stats.fetched}`,
        `${args.dryRun ? "wouldUpdate" : "updated"}=${stats.updated}`,
        `skippedHealthy=${stats.skippedHealthy}`,
        `skippedNoSourceAdId=${stats.skippedNoSourceAdId}`,
        `skippedNoDetail=${stats.skippedNoDetail}`,
        `skippedNoCopy=${stats.skippedNoCopy}`,
        `failed=${stats.failed}`,
      ].join(" "),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:linkedin-text-ads] failed", error);
  process.exitCode = 1;
});
