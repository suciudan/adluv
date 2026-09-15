import { getPool } from "@adluv/db";
import type { RowDataPacket } from "mysql2/promise";
import { createScriptProgressLogger } from "./progress";

import { runLandingPageCaptureJob } from "../jobs/landing-page-capture";

type Args = {
  companyId: string | null;
  concurrency: number;
  dryRun: boolean;
  force: boolean;
  limit: number | null;
};

type LandingPageRow = RowDataPacket & {
  snapshotId: string | null;
  adId: string;
  url: string;
  screenshotUrl: string | null;
};

type Stats = {
  scanned: number;
  captured: number;
  updated: number;
  failed: number;
};

const defaultConcurrency = 2;

const logProgress = createScriptProgressLogger("backfill:landing-page-screenshots");

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
  const companyIdFlag = argv.find((value) => value.startsWith("--company-id="));
  const rawCompanyId = companyIdFlag?.slice("--company-id=".length).trim() || null;

  return {
    companyId: rawCompanyId?.startsWith("company_") ? rawCompanyId.slice("company_".length) : rawCompanyId,
    concurrency: parsePositiveInteger(concurrencyFlag?.slice("--concurrency=".length), defaultConcurrency) ?? defaultConcurrency,
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    limit: parsePositiveInteger(limitFlag?.slice("--limit=".length), null),
  };
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
    captured: 0,
    updated: 0,
    failed: 0,
  };

  try {
    const limitClause = args.limit ? `limit ${args.limit}` : "";
    const [rows] = await pool.query<LandingPageRow[]>(
      `
        select
          landing_page_snapshots.id as snapshotId,
          ads.id as adId,
          coalesce(landing_page_snapshots.url, ads.destination_url) as url,
          landing_page_snapshots.screenshot_url as screenshotUrl
        from ads
        left join landing_page_snapshots on landing_page_snapshots.ad_id = ads.id
        inner join advertisers on advertisers.id = ads.advertiser_id
        where ads.destination_url is not null
          and trim(ads.destination_url) <> ''
          and (? is null or advertisers.company_id = ?)
          and (
            ? = 1
            or landing_page_snapshots.id is null
            or landing_page_snapshots.screenshot_url is null
            or trim(landing_page_snapshots.screenshot_url) = ''
          )
        order by ads.last_seen_at desc
        ${limitClause}
      `,
      [args.companyId, args.companyId, args.force ? 1 : 0],
    );

    logProgress(
      `found ${rows.length} landing page capture candidates${args.companyId ? ` for company ${args.companyId}` : ""}${args.dryRun ? " (dry run)" : ""}${args.force ? " with force" : ""}; concurrency=${args.concurrency}`,
    );

    await runPool(rows, args.concurrency, async (row, index) => {
      stats.scanned += 1;

      try {
        if (args.dryRun) {
          stats.captured += 1;
          stats.updated += 1;
        } else {
          await runLandingPageCaptureJob({
            adId: row.adId,
            url: row.url,
          });

          stats.captured += 1;
          stats.updated += 1;
        }
      } catch (error) {
        stats.failed += 1;
        console.warn(
          `[backfill:landing-page-screenshots] failed ${row.snapshotId ?? row.adId} (${row.url}): ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      }

      if ((index + 1) % 25 === 0) {
        logProgress(`processed ${index + 1}/${rows.length}`);
      }
    });

    logProgress(
      [
        `${args.dryRun ? "dry-run summary" : "backfill summary"}`,
        `scanned=${stats.scanned}`,
        `captured=${args.dryRun ? 0 : stats.captured}`,
        `updated=${args.dryRun ? 0 : stats.updated}`,
        `wouldCapture=${args.dryRun ? stats.captured : 0}`,
        `failed=${stats.failed}`,
      ].join(" "),
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:landing-page-screenshots] failed", error);
  process.exitCode = 1;
});
