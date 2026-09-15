import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { supportedSourceNames } from "@adluv/config";
import { importAdvertiserAdArchive, upsertAdvertiser } from "@adluv/db";
import {
  AdvertiserSearchError,
  normalizeAdvertiserCoreText,
  normalizeAdvertiserText,
  type AdvertiserMatch,
  type SourceName,
} from "@adluv/source-adapters";

import { materializeAdAssets } from "../ad-assets";
import { materializeAdvertiserLogo } from "../advertiser-assets";
import { resolveWorkerPath } from "../paths";
import { createWorkerSourceAdapter } from "../source-adapter";

type SeedCompany = {
  company: string;
  industry?: string;
};

type SeedArgs = {
  company?: string;
  concurrency: number;
  delayMs: number;
  dryRun: boolean;
  file: string;
  force: boolean;
  limit?: number;
  offset: number;
  sources: SourceName[];
};

type SeedTarget = SeedCompany & {
  source: SourceName;
};

const sourceDisplayNames: Record<SourceName, string> = {
  facebook: "Meta",
  google: "Google",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
};

function sourceDisplayName(source: SourceName) {
  return sourceDisplayNames[source];
}

function parseSourceName(value: string): SourceName | null {
  const normalized = normalizeAdvertiserText(value).replace(/\s+/g, "");

  switch (normalized) {
    case "linkedin":
    case "li":
      return "linkedin";
    case "facebook":
    case "fb":
    case "meta":
      return "facebook";
    case "google":
    case "googleads":
    case "adsgoogle":
      return "google";
    default:
      return null;
  }
}

function parseSourcesArg(value: string) {
  const parsedSources = value
    .split(",")
    .map((item) => parseSourceName(item))
    .filter((item): item is SourceName => Boolean(item));

  if (!parsedSources.length) {
    throw new Error(`No valid sources found in "${value}". Use linkedin, meta, or google.`);
  }

  return [...new Set(parsedSources)];
}

function selectAdvertiserMatchOrThrow(company: string, source: SourceName, matches: AdvertiserMatch[]) {
  if (matches.length === 0) {
    throw new Error(`No ${sourceDisplayName(source)} advertiser profiles found for "${company}".`);
  }

  if (matches.length === 1) {
    return matches[0];
  }

  const normalizedCompany = normalizeAdvertiserCoreText(company);
  const exactNameMatches = matches.filter((match) => normalizeAdvertiserCoreText(match.canonicalName) === normalizedCompany);

  if (exactNameMatches.length === 1) {
    return exactNameMatches[0];
  }

  const candidates = matches
    .slice(0, 5)
    .map((match) => `${match.canonicalName} (${match.profileUrl ?? match.sourceAdvertiserId})`)
    .join("; ");

  throw new Error(
    `Multiple ${sourceDisplayName(source)} advertiser profiles found for "${company}". Manual selection required: ${candidates}`,
  );
}

function parseNumberArg(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function parseArgs(argv: string[]): SeedArgs {
  const args: SeedArgs = {
    concurrency: 2,
    delayMs: 1_250,
    dryRun: false,
    file: resolveWorkerPath("sources", "initial-seed.csv"),
    force: false,
    offset: 0,
    sources: [...supportedSourceNames],
  };
  let hasExplicitSourceSelection = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    if (arg === "--file" && nextValue) {
      args.file = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--company" && nextValue) {
      args.company = nextValue;
      index += 1;
      continue;
    }

    if (arg === "--limit" && nextValue) {
      args.limit = parseNumberArg(nextValue, 0) || undefined;
      index += 1;
      continue;
    }

    if (arg === "--offset" && nextValue) {
      args.offset = parseNumberArg(nextValue, 0);
      index += 1;
      continue;
    }

    if (arg === "--concurrency" && nextValue) {
      args.concurrency = Math.max(1, parseNumberArg(nextValue, 2));
      index += 1;
      continue;
    }

    if (arg === "--delay-ms" && nextValue) {
      args.delayMs = parseNumberArg(nextValue, 1_250);
      index += 1;
      continue;
    }

    if (arg === "--source" && nextValue) {
      const source = parseSourceName(nextValue);

      if (!source) {
        throw new Error(`Unsupported source "${nextValue}". Use linkedin, meta, or google.`);
      }

      if (!hasExplicitSourceSelection) {
        args.sources = [];
        hasExplicitSourceSelection = true;
      }

      if (!args.sources.includes(source)) {
        args.sources.push(source);
      }

      index += 1;
      continue;
    }

    if (arg === "--sources" && nextValue) {
      args.sources = parseSourcesArg(nextValue);
      hasExplicitSourceSelection = true;
      index += 1;
      continue;
    }

    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (arg === "--force") {
      args.force = true;
    }
  }

  return args;
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    const nextCharacter = content[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (character === "," && !inQuotes) {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentCell);

      if (currentRow.some((value) => value.trim().length > 0)) {
        rows.push(currentRow);
      }

      currentRow = [];
      currentCell = "";
      continue;
    }

    currentCell += character;
  }

  currentRow.push(currentCell);

  if (currentRow.some((value) => value.trim().length > 0)) {
    rows.push(currentRow);
  }

  return rows;
}

async function loadSeedCompanies(file: string) {
  const absolutePath = path.resolve(process.cwd(), file);
  const content = await readFile(absolutePath, "utf8");
  const [header, ...rows] = parseCsv(content);
  const companyIndex = header.findIndex((value) => normalizeAdvertiserText(value) === "company");
  const industryIndex = header.findIndex((value) => normalizeAdvertiserText(value) === "industry");

  if (companyIndex === -1) {
    throw new Error(`CSV file ${absolutePath} must include a Company column.`);
  }

  return rows
    .map((row) => ({
      company: row[companyIndex]?.trim(),
      industry: industryIndex === -1 ? undefined : row[industryIndex]?.trim() || undefined,
    }))
    .filter((row) => Boolean(row.company))
    .map((row) => ({
      company: row.company as string,
      industry: row.industry,
    }));
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

function resolveRequestDelayMs(baseDelayMs: number) {
  if (baseDelayMs <= 0) {
    return 0;
  }

  const jitterMs = Math.min(500, Math.max(100, Math.floor(baseDelayMs / 3)));
  return baseDelayMs + Math.floor(Math.random() * jitterMs);
}

async function pauseBeforeSourceRequest(progressLabel: string, baseDelayMs: number, phase: string) {
  const waitMs = resolveRequestDelayMs(baseDelayMs);

  if (waitMs <= 0) {
    return;
  }

  console.log(`${progressLabel} waiting ${waitMs}ms before ${phase}...`);
  await delay(waitMs);
}

function describeSourceList(sources: SourceName[]) {
  return sources.map((source) => sourceDisplayName(source)).join(", ");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const companies = await loadSeedCompanies(args.file);
  const filteredCompanies = companies
    .filter((entry) =>
      args.company ? normalizeAdvertiserText(entry.company) === normalizeAdvertiserText(args.company) : true,
    )
    .slice(args.offset, args.limit ? args.offset + args.limit : undefined);
  const targets: SeedTarget[] = filteredCompanies.flatMap((seed) =>
    args.sources.map((source) => ({
      ...seed,
      source,
    })),
  );

  if (!targets.length) {
    throw new Error("No seed companies matched the current CLI filters.");
  }

  const adapters = new Map(
    await Promise.all(args.sources.map(async (source) => [source, await createWorkerSourceAdapter(source)] as const)),
  );
  const oneYearAgo = new Date();

  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  console.log(
    `Seeding ${targets.length} advertiser-source pairs from ${path.resolve(process.cwd(), args.file)} across ${describeSourceList(args.sources)} with concurrency=${args.concurrency} delayMs=${args.delayMs}${args.dryRun ? " (dry run)" : ""}${args.force ? " (force)" : " (resume enabled)"}.`,
  );

  const successes: Array<{ company: string; source: SourceName; adsFound: number; newAds: number; advertiser: string }> =
    [];
  const failures: Array<{ company: string; source: SourceName; error: string }> = [];
  const skipped: Array<{ company: string; source: SourceName; advertiser: string; lastIndexedAt: string }> = [];

  await runPool(targets, args.concurrency, async (seed, index) => {
    const sourceName = sourceDisplayName(seed.source);
    const progressLabel = `[${index + 1}/${targets.length}] ${seed.company} [${sourceName}]`;
    const adapter = adapters.get(seed.source);

    if (!adapter) {
      throw new Error(`Missing ${sourceName} source adapter.`);
    }

    try {
      await pauseBeforeSourceRequest(progressLabel, args.delayMs, `${sourceName} advertiser search`);
      console.log(`${progressLabel} searching ${sourceName} advertiser matches...`);
      const matches = await adapter.searchAdvertisers(seed.company);
      const bestMatch = selectAdvertiserMatchOrThrow(seed.company, seed.source, matches);
      const resolvedAdvertiser =
        (await adapter.fetchAdvertiserProfile(bestMatch.sourceAdvertiserId).catch(() => bestMatch)) ?? bestMatch;
      const hydratedBestMatch = await materializeAdvertiserLogo(resolvedAdvertiser).catch(() => resolvedAdvertiser);
      const advertiser = await upsertAdvertiser({
        id: hydratedBestMatch.id,
        source: hydratedBestMatch.source,
        sourceAdvertiserId: hydratedBestMatch.sourceAdvertiserId,
        canonicalName: hydratedBestMatch.canonicalName,
        profileUrl: hydratedBestMatch.profileUrl,
        logoUrl: hydratedBestMatch.logoUrl,
        industry: hydratedBestMatch.industry ?? seed.industry,
        companySize: hydratedBestMatch.companySize,
        country: hydratedBestMatch.country,
        summary: hydratedBestMatch.summary,
      });

      if (!args.force && advertiser.lastIndexedAt) {
        skipped.push({
          company: seed.company,
          source: seed.source,
          advertiser: `${advertiser.canonicalName} (${advertiser.sourceAdvertiserId})`,
          lastIndexedAt: advertiser.lastIndexedAt.toISOString(),
        });

        console.log(
          `[skipped] ${seed.company} [${sourceName}] -> ${advertiser.canonicalName} (${advertiser.sourceAdvertiserId}) | already indexed at ${advertiser.lastIndexedAt.toISOString()}`,
        );

        return;
      }

      await pauseBeforeSourceRequest(progressLabel, args.delayMs, `${sourceName} ad archive fetch`);
      console.log(`${progressLabel} fetching ad archive for ${advertiser.canonicalName} (${advertiser.sourceAdvertiserId})...`);
      const ads = await adapter.fetchAdvertiserAds(hydratedBestMatch.sourceAdvertiserId, {
        since: oneYearAgo,
      });
      console.log(`${progressLabel} storing ${ads.length} ad assets...`);
      const hydratedAds = await materializeAdAssets(ads);

      const result = args.dryRun
        ? {
            adsPersisted: hydratedAds.length,
            newAds: hydratedAds.map((ad) => ({
              id: ad.sourceAdId ?? ad.fingerprint,
              title: ad.title,
              body: ad.body,
            })),
          }
        : await importAdvertiserAdArchive({
            advertiserId: advertiser.id,
            ads: hydratedAds,
          });

      successes.push({
        company: seed.company,
        source: seed.source,
        advertiser: `${advertiser.canonicalName} (${advertiser.sourceAdvertiserId})`,
        adsFound: hydratedAds.length,
        newAds: result.newAds.length,
      });

      console.log(
        `[ok] ${seed.company} [${sourceName}] -> ${advertiser.canonicalName} (${advertiser.sourceAdvertiserId}) | ads=${hydratedAds.length} new=${result.newAds.length}`,
      );
    } catch (error) {
      const message =
        error instanceof AdvertiserSearchError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Unknown error";

      failures.push({
        company: seed.company,
        source: seed.source,
        error: message,
      });

      console.error(`[failed] ${seed.company} [${sourceName}] | ${message}`);
    }
  });

  console.log("");
  console.log(
    `Completed initial archive seed. Success=${successes.length} Skipped=${skipped.length} Failed=${failures.length} Ads=${successes.reduce((sum, item) => sum + item.adsFound, 0)} NewAds=${successes.reduce((sum, item) => sum + item.newAds, 0)}`,
  );

  if (skipped.length) {
    console.log("Skipped advertisers:");

    for (const item of skipped) {
      console.log(`- ${item.company} [${sourceDisplayName(item.source)}]: ${item.advertiser} (indexed ${item.lastIndexedAt})`);
    }

    console.log("");
  }

  if (failures.length) {
    console.log("Failed advertisers:");

    for (const failure of failures) {
      console.log(`- ${failure.company} [${sourceDisplayName(failure.source)}]: ${failure.error}`);
    }

    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Seeder failed.");
  process.exitCode = 1;
});
