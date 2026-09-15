import {
  upsertAdvertiser,
  upsertAdvertiserSearchAlias,
} from "@adluv/db";
import {
  normalizeAdvertiserCoreText,
  type SourceName,
} from "@adluv/source-adapters";

import { materializeAdvertiserLogo } from "../advertiser-assets";
import { createWorkerSourceAdapter } from "../source-adapter";

type Args = {
  query: string;
  source: SourceName;
  sourceAdvertiserId: string;
};

function parseSourceName(value: string): SourceName {
  const normalized = value.trim().toLowerCase();

  switch (normalized) {
    case "linkedin":
      return "linkedin";
    case "facebook":
    case "meta":
      return "facebook";
    case "google":
      return "google";
    case "tiktok":
      return "tiktok";
    default:
      throw new Error(`Unsupported source "${value}".`);
  }
}

function parseArgs(argv: string[]): Args {
  let query = "";
  let source: SourceName | null = null;
  let sourceAdvertiserId = "";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    if (arg === "--query" && nextValue) {
      query = nextValue.trim();
      index += 1;
      continue;
    }

    if (arg === "--source" && nextValue) {
      source = parseSourceName(nextValue);
      index += 1;
      continue;
    }

    if (arg === "--source-advertiser-id" && nextValue) {
      sourceAdvertiserId = nextValue.trim();
      index += 1;
      continue;
    }
  }

  if (!query || !source || !sourceAdvertiserId) {
    throw new Error(
      "Usage: yarn workspace @adluv/worker upsert:advertiser-alias --query \"Microsoft\" --source google --source-advertiser-id AR...",
    );
  }

  return {
    query,
    source,
    sourceAdvertiserId,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const normalizedQuery = normalizeAdvertiserCoreText(args.query);
  const adapter = await createWorkerSourceAdapter(args.source);
  const profile = await adapter.fetchAdvertiserProfile(args.sourceAdvertiserId);

  if (!profile) {
    throw new Error(
      `No ${args.source} advertiser profile found for source advertiser id "${args.sourceAdvertiserId}".`,
    );
  }

  const hydratedProfile = await materializeAdvertiserLogo(profile).catch(() => profile);
  const advertiser = await upsertAdvertiser({
    id: hydratedProfile.id,
    source: hydratedProfile.source,
    sourceAdvertiserId: hydratedProfile.sourceAdvertiserId,
    canonicalName: hydratedProfile.canonicalName,
    profileUrl: hydratedProfile.profileUrl,
    logoUrl: hydratedProfile.logoUrl,
    industry: hydratedProfile.industry,
    companySize: hydratedProfile.companySize,
    country: hydratedProfile.country,
    summary: hydratedProfile.summary,
  });

  const alias = await upsertAdvertiserSearchAlias({
    advertiserId: advertiser.id,
    query: args.query,
    normalizedQuery,
  });

  console.log(
    JSON.stringify(
      {
        aliasId: alias.id,
        query: alias.query,
        normalizedQuery: alias.normalizedQuery,
        advertiserId: advertiser.id,
        source: advertiser.source,
        sourceAdvertiserId: advertiser.sourceAdvertiserId,
        canonicalName: advertiser.canonicalName,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed to upsert advertiser alias.");
  process.exitCode = 1;
});
