import { getPool } from "@adluv/db";
import { resolveCdnAssetUrl } from "@adluv/config";
import { type RowDataPacket } from "mysql2/promise";
import { createScriptProgressLogger } from "./progress";

type Args = {
  dryRun: boolean;
  limit: number | null;
};

type AdvertiserRow = RowDataPacket & {
  id: string;
  logoUrl: string | null;
};

const chunkSize = 100;

const logProgress = createScriptProgressLogger("backfill:advertiser-logo-urls");

function parseArgs(argv: string[]): Args {
  const limitFlag = argv.find((value) => value.startsWith("--limit="));
  const rawLimit = limitFlag ? Number.parseInt(limitFlag.slice("--limit=".length), 10) : null;

  return {
    dryRun: argv.includes("--dry-run"),
    limit: Number.isFinite(rawLimit) && rawLimit && rawLimit > 0 ? rawLimit : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();

  try {
    const [rows] = await pool.query<AdvertiserRow[]>(
      `
        select
          id,
          logo_url as logoUrl
        from advertisers
        where logo_url is not null
        order by updated_at desc
      `,
    );

    const candidates = rows
      .map((row) => ({
        id: row.id,
        currentLogoUrl: row.logoUrl,
        nextLogoUrl: resolveCdnAssetUrl(row.logoUrl),
      }))
      .filter((row) => row.nextLogoUrl !== row.currentLogoUrl);

    const targetRows = args.limit ? candidates.slice(0, args.limit) : candidates;
    logProgress(`found ${targetRows.length} advertisers with logo URLs to normalize`);

    let updated = 0;
    let processed = 0;

    for (let index = 0; index < targetRows.length; index += chunkSize) {
      const chunk = targetRows.slice(index, index + chunkSize);

      for (const row of chunk) {
        updated += 1;

        if (!args.dryRun) {
          await pool.execute("update advertisers set logo_url = ?, updated_at = ? where id = ?", [
            row.nextLogoUrl,
            new Date(),
            row.id,
          ]);
        }
      }

      processed += chunk.length;
      logProgress(
        `${args.dryRun ? "scanned" : "processed"} ${processed}/${targetRows.length} advertisers; ${args.dryRun ? "would update" : "updated"} ${updated}`,
      );
    }

    logProgress(
      `${args.dryRun ? "dry run complete" : "backfill complete"}: ${updated} advertisers ${args.dryRun ? "would change" : "changed"}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:advertiser-logo-urls] failed", error);
  process.exitCode = 1;
});
