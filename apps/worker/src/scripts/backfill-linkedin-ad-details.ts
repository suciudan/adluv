import { fetchLinkedInAdDetail } from "@adluv/source-adapters";
import { getPool } from "@adluv/db";
import type { RowDataPacket } from "mysql2/promise";
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
  status: string | null;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
  metadata: unknown;
};

type Stats = {
  scanned: number;
  candidates: number;
  fetched: number;
  updated: number;
  retryAttempts: number;
  skippedHealthy: number;
  skippedNoSourceAdId: number;
  skippedNoDetail: number;
  failed: number;
};

const defaultConcurrency = 2;
const linkedInDetailFetchAttempts = 3;
const linkedInDetailRetryDelaysMs = [5_000, 15_000];

const logProgress = createScriptProgressLogger("backfill:linkedin-ad-details");

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableLinkedInDetailError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    /timed out/i.test(message) ||
    /temporarily unavailable/i.test(message) ||
    /\b(?:429|500|502|503|504)\b/.test(message) ||
    /\b(?:ECONNRESET|ECONNREFUSED|EHOSTUNREACH|ETIMEDOUT|ENOTFOUND)\b/i.test(message)
  );
}

async function fetchLinkedInAdDetailWithRetry(
  row: AdRow,
  options: Parameters<typeof fetchLinkedInAdDetail>[1],
  onRetry: (attempt: number, delayMs: number, error: unknown) => void,
) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= linkedInDetailFetchAttempts; attempt += 1) {
    try {
      return await fetchLinkedInAdDetail(row.sourceAdId ?? "", options);
    } catch (error) {
      lastError = error;

      if (attempt >= linkedInDetailFetchAttempts || !isRetryableLinkedInDetailError(error)) {
        throw error;
      }

      const delayMs = linkedInDetailRetryDelaysMs[attempt - 1] ?? linkedInDetailRetryDelaysMs.at(-1) ?? 0;

      onRetry(attempt, delayMs, error);
      await sleep(delayMs);
    }
  }

  throw lastError;
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

function sameDate(left: Date | null, right: Date | null) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function hasCountryImpressions(metadata: Record<string, unknown>) {
  return Array.isArray(metadata.countryImpressions) && metadata.countryImpressions.length > 0;
}

function shouldBackfill(row: AdRow, force: boolean) {
  if (!row.sourceAdId?.trim()) {
    return false;
  }

  if (force) {
    return true;
  }

  const metadata = parseMetadata(row.metadata);

  return (
    !cleanText(row.title) ||
    !cleanText(row.body) ||
    !cleanText(row.callToAction) ||
    !cleanText(metadata.totalImpressions) ||
    !hasCountryImpressions(metadata) ||
    !row.firstSeenAt ||
    !row.lastSeenAt ||
    sameDate(row.firstSeenAt, row.lastSeenAt)
  );
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
  status: string | null;
  firstSeenAt: Date | null;
  lastSeenAt: Date | null;
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
    cleanText(row.status) !== next.status ||
    !sameDate(row.firstSeenAt, next.firstSeenAt) ||
    !sameDate(row.lastSeenAt, next.lastSeenAt) ||
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
    retryAttempts: 0,
    skippedHealthy: 0,
    skippedNoSourceAdId: 0,
    skippedNoDetail: 0,
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
          ads.status,
          ads.first_seen_at as firstSeenAt,
          ads.last_seen_at as lastSeenAt,
          ads.metadata
        from ads
        inner join advertisers on advertisers.id = ads.advertiser_id
        where ads.source = 'linkedin'
          and advertisers.source = 'linkedin'
          and (? is null or ads.id = ?)
          and (? is null or ads.advertiser_id = ?)
        order by ads.updated_at desc
        ${limitClause}
      `,
      [args.adId, args.adId, args.advertiserId, args.advertiserId],
    );

    stats.scanned = rows.length;

    const candidates = rows.filter((row) => {
      if (!row.sourceAdId?.trim()) {
        stats.skippedNoSourceAdId += 1;
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
        `found ${stats.candidates} linkedin detail candidates`,
        args.dryRun ? "(dry run)" : "",
        args.force ? "with force" : "",
        `concurrency=${args.concurrency}`,
      ].filter(Boolean).join(" "),
    );

    const proxyUrls = await getGoogleRpcProxyUrlsAsync();

    await runPool(candidates, args.concurrency, async (row, index) => {
      try {
        const hydratedAd = await fetchLinkedInAdDetailWithRetry(
          row,
          {
            fallbackPayer: row.payer ?? undefined,
            proxyUrls,
            sourceAdvertiserId: row.sourceAdvertiserId,
            webScrapingApiKey: process.env.WEBSCRAPINGAPI_API_KEY?.trim() || undefined,
            webScrapingApiProxy: getWebScrapingApiProxyOptions(),
          },
          (attempt, delayMs, error) => {
            stats.retryAttempts += 1;
            console.warn(
              `[backfill:linkedin-ad-details] retrying ${row.id}${row.sourceAdId ? ` (${row.sourceAdId})` : ""} after attempt ${attempt}/${linkedInDetailFetchAttempts}: ${
                error instanceof Error ? error.message : "Unknown error"
              }; next retry in ${Math.round(delayMs / 1000)}s`,
            );
          },
        );

        if (!hydratedAd) {
          stats.skippedNoDetail += 1;
          return;
        }

        const [materializedAd] = await materializeAdAssets([hydratedAd], {
          persist: !args.dryRun,
        });

        stats.fetched += 1;

        const nextMetadata = mergeMetadata(row, materializedAd.metadata);
        const hasParsedRunDates = materializedAd.metadata?.linkedInRunDatesParsed === true;
        const next = {
          title: cleanText(materializedAd.title) ?? cleanText(row.title),
          body: cleanText(materializedAd.body) ?? cleanText(row.body),
          payer: cleanText(materializedAd.payer) ?? cleanText(row.payer),
          format: cleanText(materializedAd.format) ?? cleanText(row.format),
          callToAction: cleanText(materializedAd.callToAction) ?? cleanText(row.callToAction),
          destinationUrl: cleanText(materializedAd.destinationUrl) ?? cleanText(row.destinationUrl),
          mediaUrl: cleanText(materializedAd.mediaUrl) ?? cleanText(row.mediaUrl),
          status: hasParsedRunDates ? cleanText(materializedAd.status) : cleanText(row.status),
          firstSeenAt: hasParsedRunDates ? materializedAd.firstSeenAt : row.firstSeenAt,
          lastSeenAt: hasParsedRunDates ? materializedAd.lastSeenAt : row.lastSeenAt,
          metadata: nextMetadata,
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
                  status = ?,
                  first_seen_at = ?,
                  last_seen_at = ?,
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
              next.status,
              next.firstSeenAt,
              next.lastSeenAt,
              JSON.stringify({
                ...next.metadata,
                linkedInDetailBackfilledAt: new Date().toISOString(),
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
          `[backfill:linkedin-ad-details] failed ${row.id}${row.sourceAdId ? ` (${row.sourceAdId})` : ""}: ${
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
        `retryAttempts=${stats.retryAttempts}`,
        `skippedHealthy=${stats.skippedHealthy}`,
        `skippedNoSourceAdId=${stats.skippedNoSourceAdId}`,
        `skippedNoDetail=${stats.skippedNoDetail}`,
        `failed=${stats.failed}`,
      ].join(" "),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:linkedin-ad-details] failed", error);
  process.exitCode = 1;
});
