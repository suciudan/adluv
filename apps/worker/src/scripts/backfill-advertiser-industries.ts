import { advertiserIndustryGroups } from "@adluv/config";
import { getPool } from "@adluv/db";
import { createScriptProgressLogger } from "./progress";

type Args = {
  dryRun: boolean;
};

type TargetTable = {
  label: string;
  name: "advertisers" | "advertiser_search_query_results";
};

const targetTables: TargetTable[] = [
  { label: "advertisers", name: "advertisers" },
  { label: "advertiser search cached results", name: "advertiser_search_query_results" },
];

const logProgress = createScriptProgressLogger("backfill:advertiser-industries");

function parseArgs(argv: string[]): Args {
  return {
    dryRun: argv.includes("--dry-run"),
  };
}

function buildNormalizedIndustryLookup() {
  const variants: Array<{ canonical: string; variant: string }> = [];

  for (const group of advertiserIndustryGroups) {
    const canonicalVariant = group.canonical.trim().replace(/\s+/g, " ").toLowerCase();

    for (const variant of group.variants) {
      const normalizedVariant = variant.trim().replace(/\s+/g, " ").toLowerCase();

      if (normalizedVariant === canonicalVariant) {
        continue;
      }

      variants.push({
        canonical: group.canonical,
        variant: normalizedVariant,
      });
    }
  }

  return variants;
}

function buildWhereInPlaceholders(length: number) {
  return Array.from({ length }, () => "?").join(", ");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();
  const industryVariants = buildNormalizedIndustryLookup();
  const whereValues = industryVariants.map((entry) => entry.variant);

  try {
    for (const table of targetTables) {
      const [countRows] = await pool.query<Array<{ count: number }>>(
        `
          select count(*) as count
          from ${table.name}
          where industry is not null
            and lower(trim(industry)) in (${buildWhereInPlaceholders(whereValues.length)})
        `,
        whereValues,
      );
      const candidateCount = Number(countRows[0]?.count ?? 0);

      logProgress(`${table.label}: found ${candidateCount} rows to normalize`);

      if (!candidateCount || args.dryRun) {
        continue;
      }

      const caseClauses = industryVariants.map(() => "when lower(trim(industry)) = ? then ?").join(" ");
      const caseParams = industryVariants.flatMap((entry) => [entry.variant, entry.canonical]);
      const now = new Date();
      const [result] = await pool.execute<{ affectedRows: number } & Record<string, unknown>>(
        `
          update ${table.name}
          set
            industry = case
              ${caseClauses}
              else industry
            end,
            updated_at = ?
          where industry is not null
            and lower(trim(industry)) in (${buildWhereInPlaceholders(whereValues.length)})
        `,
        [...caseParams, now, ...whereValues],
      );

      logProgress(`${table.label}: updated ${Number(result.affectedRows ?? 0)} rows`);
    }

    logProgress(args.dryRun ? "dry run complete" : "backfill complete");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:advertiser-industries] failed", error);
  process.exitCode = 1;
});
