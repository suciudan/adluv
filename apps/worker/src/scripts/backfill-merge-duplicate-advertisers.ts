import { createHash } from "node:crypto";
import { createScriptProgressLogger } from "./progress";

import { resolveCdnAssetUrl } from "@adluv/config";
import {
  compareAdvertiserBrandCandidates,
  extractRegistrableDomain,
  getPool,
  isIgnoredAdvertiserDomain,
  normalizeAdvertiserBrandKey,
  normalizeAdvertiserWebsite,
} from "@adluv/db";
import { type PoolConnection, type RowDataPacket } from "mysql2/promise";

type Source = "linkedin" | "facebook" | "google" | "tiktok";

type Args = {
  apply: boolean;
  advertiserId: string | null;
  name: string | null;
  limitGroups: number | null;
};

type AdvertiserRow = RowDataPacket & {
  id: string;
  source: Source;
  sourceAdvertiserId: string;
  canonicalName: string;
  profileUrl: string | null;
  websiteUrl: string | null;
  normalizedDomain: string | null;
  companyId: string | null;
  companyNormalizedDomain: string | null;
  logoUrl: string | null;
  lastIndexedAt: Date | null;
  totalAds: number;
  destinationUrls: string | null;
  createdAt: Date;
};

type SearchCompanyHintRow = RowDataPacket & {
  source: Source;
  sourceAdvertiserId: string;
  companyKey: string;
  displayName: string;
  websiteUrl: string | null;
  domain: string | null;
  logoUrl: string | null;
};

type SearchHint = {
  companyKey: string;
  displayName: string;
  websiteUrl: string | null;
  domain: string | null;
  logoUrl: string | null;
};

type DuplicateGroup = {
  key: string;
  advertisers: AdvertiserRow[];
  hints: SearchHint[];
};

type CompanyTarget = {
  id: string;
  normalizedDomain: string;
  websiteUrl: string | null;
  displayName: string;
  logoUrl: string | null;
  isSyntheticNameKey: boolean;
};

type ExistingCompanyRow = RowDataPacket & {
  id: string;
  normalizedDomain: string;
  websiteUrl: string | null;
  displayName: string;
  logoUrl: string | null;
  createdAt: Date;
};

const logProgress = createScriptProgressLogger("backfill:merge-duplicate-advertisers");

function parseArgs(argv: string[]): Args {
  const readValue = (name: string) => {
    const flag = argv.find((value) => value.startsWith(`--${name}=`));
    return flag ? flag.slice(name.length + 3).trim() : null;
  };
  const limitGroups = Number.parseInt(readValue("limit-groups") ?? "", 10);

  return {
    apply: argv.includes("--apply"),
    advertiserId: normalizeAdvertiserId(readValue("advertiser-id")),
    name: normalizeNameKey(readValue("name")),
    limitGroups: Number.isFinite(limitGroups) && limitGroups > 0 ? limitGroups : null,
  };
}

function normalizeAdvertiserId(value: string | null) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  return trimmedValue.startsWith("advertiser_") ? trimmedValue.slice("advertiser_".length) : trimmedValue;
}

function normalizeNameKey(value: string | null | undefined) {
  return normalizeAdvertiserBrandKey(value);
}

function normalizeDomainKey(value: string | null | undefined) {
  if (!value || value.trim().startsWith("name:")) {
    return null;
  }

  const normalizedWebsite = normalizeAdvertiserWebsite(value);
  const normalizedDomain =
    normalizedWebsite.normalizedDomain ?? extractRegistrableDomain(value?.trim().toLowerCase());

  if (!normalizedDomain || !normalizedDomain.includes(".") || isIgnoredAdvertiserDomain(normalizedDomain)) {
    return null;
  }

  return normalizedDomain;
}

function buildCompanyId(normalizedDomain: string) {
  return createHash("sha1").update(normalizedDomain).digest("hex");
}

function toRootWebsiteUrl(websiteUrl: string | null, normalizedDomain: string) {
  const normalizedWebsite = normalizeAdvertiserWebsite(websiteUrl);

  if (!normalizedWebsite.websiteUrl) {
    if (normalizedDomain.startsWith("name:")) {
      return null;
    }

    return `https://${normalizedDomain}/`;
  }

  const parsedUrl = new URL(normalizedWebsite.websiteUrl);
  parsedUrl.pathname = "/";
  parsedUrl.search = "";
  parsedUrl.hash = "";

  return parsedUrl.toString();
}

function getAdvertiserDomainHint(advertiser: AdvertiserRow) {
  return (
    normalizeDomainKey(advertiser.companyNormalizedDomain) ??
    normalizeDomainKey(advertiser.normalizedDomain) ??
    normalizeDomainKey(advertiser.websiteUrl)
  );
}

function getSearchHintDomain(hint: SearchHint) {
  return normalizeDomainKey(hint.websiteUrl) ?? normalizeDomainKey(hint.domain);
}

function getSearchHintNameKey(hint: SearchHint) {
  return normalizeNameKey(hint.displayName) ?? normalizeNameKey(hint.companyKey);
}

function getDomainBrandKey(normalizedDomain: string) {
  const brandLabel = normalizedDomain.split(".")[0] ?? normalizedDomain;

  return normalizeNameKey(brandLabel.replace(/[-_]+/g, " "));
}

function getAdvertiserAdDomainHints(advertiser: AdvertiserRow) {
  return Array.from(
    new Set(
      (advertiser.destinationUrls ?? "")
        .split("\n")
        .map((destinationUrl) => normalizeDomainKey(destinationUrl))
        .filter((domain): domain is string => Boolean(domain)),
    ),
  );
}

function getDomainTail(normalizedDomain: string) {
  const labels = normalizedDomain.split(".").filter(Boolean);

  return labels.slice(1).join(".");
}

function scoreWebsiteCandidate(input: {
  brandKey: string | null;
  normalizedDomain: string;
  source: Source | "search";
}) {
  let score = 0;
  const domainBrandKey = getDomainBrandKey(input.normalizedDomain);
  const domainTail = getDomainTail(input.normalizedDomain);

  if (input.brandKey && domainBrandKey === input.brandKey) {
    score += 100;
  }

  if (input.brandKey && input.normalizedDomain === `${input.brandKey}.com`) {
    score += 40;
  }

  if (domainTail === "com") {
    score += 30;
  } else if (domainTail === "io") {
    score += 24;
  } else if (domainTail === "ai") {
    score += 22;
  } else if (domainTail === "app") {
    score += 18;
  } else if (domainTail === "co") {
    score += 12;
  } else if (/^[a-z]{2}$/i.test(domainTail)) {
    score -= 12;
  }

  if (input.source === "google" || input.source === "facebook") {
    score += 3;
  }

  return score;
}

function pickPreferredWebsiteUrl(group: DuplicateGroup, brandKey: string | null) {
  const candidates = [
    ...group.advertisers.map((advertiser) => ({
      source: advertiser.source,
      websiteUrl: advertiser.websiteUrl,
      normalizedDomain: getAdvertiserDomainHint(advertiser),
    })),
    ...group.advertisers.flatMap((advertiser) =>
      getAdvertiserAdDomainHints(advertiser).map((normalizedDomain) => ({
        source: advertiser.source,
        websiteUrl: `https://${normalizedDomain}/`,
        normalizedDomain,
      })),
    ),
    ...group.hints.map((hint) => ({
      source: "search" as const,
      websiteUrl: hint.websiteUrl,
      normalizedDomain: getSearchHintDomain(hint),
    })),
  ]
    .filter((candidate): candidate is {
      source: Source | "search";
      websiteUrl: string | null;
      normalizedDomain: string;
    } => Boolean(candidate.normalizedDomain))
    .map((candidate) => ({
      ...candidate,
      rootWebsiteUrl: toRootWebsiteUrl(candidate.websiteUrl, candidate.normalizedDomain),
      score: scoreWebsiteCandidate({
        brandKey,
        normalizedDomain: candidate.normalizedDomain,
        source: candidate.source,
      }),
    }))
    .filter((candidate) => candidate.rootWebsiteUrl);

  return [...candidates].sort(
    (left, right) =>
      right.score - left.score ||
      left.normalizedDomain.length - right.normalizedDomain.length ||
      left.normalizedDomain.localeCompare(right.normalizedDomain),
  )[0]?.rootWebsiteUrl ?? null;
}

function getAdvertiserGroupKey(advertiser: AdvertiserRow, hints: SearchHint[]) {
  const domainKey = getAdvertiserDomainHint(advertiser);

  if (domainKey) {
    return `domain:${domainKey}`;
  }

  const consistentSearchDomains = Array.from(new Set(hints.map(getSearchHintDomain).filter(Boolean)));

  if (consistentSearchDomains.length === 1) {
    return `domain:${consistentSearchDomains[0]}`;
  }

  const consistentSearchNames = Array.from(new Set(hints.map(getSearchHintNameKey).filter(Boolean)));

  if (consistentSearchNames.length === 1) {
    return `name:${consistentSearchNames[0]}`;
  }

  const nameKey = normalizeNameKey(advertiser.canonicalName);

  return nameKey ? `name:${nameKey}` : null;
}

function pickBestAdvertiser(advertisers: AdvertiserRow[]) {
  return [...advertisers].sort((left, right) => compareAdvertiserBrandCandidates(left, right))[0] ?? advertisers[0];
}

function pickDisplayName(group: DuplicateGroup) {
  const candidates = [
    ...group.advertisers.map((advertiser) => ({
      canonicalName: advertiser.canonicalName,
      logoUrl: advertiser.logoUrl,
      totalAds: advertiser.totalAds,
      lastIndexedAt: advertiser.lastIndexedAt,
    })),
    ...group.hints
      .filter((hint) => hint.displayName)
      .map((hint) => ({
        canonicalName: hint.displayName,
        logoUrl: hint.logoUrl,
        totalAds: null,
        lastIndexedAt: null,
      })),
  ];
  const brandKey =
    group.key.startsWith("name:")
      ? group.key.slice("name:".length)
      : candidates.map((candidate) => normalizeNameKey(candidate.canonicalName)).find(Boolean) ?? null;

  return [...candidates].sort((left, right) => {
    const leftMatchesBrand = normalizeNameKey(left.canonicalName) === brandKey;
    const rightMatchesBrand = normalizeNameKey(right.canonicalName) === brandKey;

    if (leftMatchesBrand !== rightMatchesBrand) {
      return leftMatchesBrand ? -1 : 1;
    }

    if (left.canonicalName.length !== right.canonicalName.length) {
      return left.canonicalName.length - right.canonicalName.length;
    }

    return compareAdvertiserBrandCandidates(left, right);
  })[0]?.canonicalName ?? pickBestAdvertiser(group.advertisers).canonicalName;
}

function buildCompanyTarget(group: DuplicateGroup): CompanyTarget {
  const domainHints = Array.from(
    new Set([
      ...group.advertisers.map(getAdvertiserDomainHint),
      ...group.advertisers.flatMap(getAdvertiserAdDomainHints),
      ...group.hints.map(getSearchHintDomain),
    ].filter((value): value is string => Boolean(value))),
  );
  const displayName = pickDisplayName(group);
  const bestAdvertiser = pickBestAdvertiser(group.advertisers);
  const bestHintLogo = group.hints.find((hint) => hint.logoUrl)?.logoUrl ?? null;
  const brandKey = normalizeNameKey(displayName) ?? group.key.replace(/^name:/, "");
  const logoUrl = resolveCdnAssetUrl(bestAdvertiser.logoUrl ?? bestHintLogo) ?? null;
  const normalizedDomain =
    domainHints.length === 1
      ? domainHints[0]
      : `name:${brandKey}`;
  const websiteUrl = pickPreferredWebsiteUrl(group, brandKey);

  return {
    id: buildCompanyId(normalizedDomain),
    normalizedDomain,
    websiteUrl,
    displayName,
    logoUrl,
    isSyntheticNameKey: normalizedDomain.startsWith("name:"),
  };
}

function getGroupDomainHints(group: DuplicateGroup) {
  return Array.from(
    new Set([
      ...group.advertisers.map(getAdvertiserDomainHint),
      ...group.advertisers.flatMap(getAdvertiserAdDomainHints),
      ...group.hints.map(getSearchHintDomain),
    ].filter((value): value is string => Boolean(value))),
  );
}

function getGroupNameKey(group: DuplicateGroup) {
  return (
    normalizeNameKey(pickDisplayName(group)) ??
    group.advertisers.map((advertiser) => normalizeNameKey(advertiser.canonicalName)).find(Boolean) ??
    group.hints.map(getSearchHintNameKey).find(Boolean) ??
    null
  );
}

function mergeGroupsByBrandName(groups: DuplicateGroup[]) {
  const groupsByNameKey = new Map<string, DuplicateGroup[]>();
  const mergedGroups: DuplicateGroup[] = [];
  const consumedGroups = new Set<DuplicateGroup>();

  for (const group of groups) {
    const nameKey = getGroupNameKey(group);

    if (!nameKey) {
      mergedGroups.push(group);
      continue;
    }

    groupsByNameKey.set(nameKey, [...(groupsByNameKey.get(nameKey) ?? []), group]);
  }

  for (const [nameKey, nameGroups] of groupsByNameKey.entries()) {
    if (nameGroups.length === 1) {
      continue;
    }

    const domainHints = Array.from(new Set(nameGroups.flatMap(getGroupDomainHints)));

    for (const group of nameGroups) {
      consumedGroups.add(group);
    }

    mergedGroups.push({
      key: domainHints[0] ? `domain:${domainHints[0]}` : `name:${nameKey}`,
      advertisers: nameGroups.flatMap((group) => group.advertisers),
      hints: nameGroups.flatMap((group) => group.hints),
    });
  }

  for (const group of groups) {
    if (!consumedGroups.has(group)) {
      mergedGroups.push(group);
    }
  }

  return mergedGroups;
}

function shouldMergeGroup(group: DuplicateGroup) {
  if (group.advertisers.length < 2) {
    return false;
  }

  const companyIds = new Set(group.advertisers.map((advertiser) => advertiser.companyId ?? ""));

  return companyIds.size > 1 || group.advertisers.some((advertiser) => !advertiser.companyId);
}

function filterTargetGroups(groups: DuplicateGroup[], args: Args) {
  let targetGroups = groups;

  if (args.advertiserId) {
    targetGroups = targetGroups.filter((group) =>
      group.advertisers.some((advertiser) => advertiser.id === args.advertiserId),
    );
  }

  if (args.name) {
    targetGroups = targetGroups.filter((group) =>
      group.key === `name:${args.name}` ||
      group.advertisers.some((advertiser) => normalizeNameKey(advertiser.canonicalName) === args.name) ||
      group.hints.some((hint) => getSearchHintNameKey(hint) === args.name),
    );
  }

  return args.limitGroups ? targetGroups.slice(0, args.limitGroups) : targetGroups;
}

async function upsertCompany(connection: PoolConnection, target: CompanyTarget) {
  const [existingRows] = await connection.query<ExistingCompanyRow[]>(
    `
      select
        id,
        normalized_domain as normalizedDomain,
        website_url as websiteUrl,
        display_name as displayName,
        logo_url as logoUrl,
        created_at as createdAt
      from advertiser_companies
      where id = ?
      limit 1
    `,
    [target.id],
  );
  const existingCompany = existingRows[0] ?? null;
  const now = new Date();

  await connection.execute(
    `
      insert into advertiser_companies (
        id,
        normalized_domain,
        website_url,
        display_name,
        logo_url,
        created_at,
        updated_at
      ) values (?, ?, ?, ?, ?, ?, ?)
      on duplicate key update
        website_url = values(website_url),
        display_name = values(display_name),
        logo_url = coalesce(values(logo_url), logo_url),
        updated_at = values(updated_at)
    `,
    [
      target.id,
      target.normalizedDomain,
      target.websiteUrl,
      target.displayName,
      target.logoUrl,
      existingCompany?.createdAt ?? now,
      now,
    ],
  );
}

async function applyGroup(connection: PoolConnection, group: DuplicateGroup, target: CompanyTarget) {
  await upsertCompany(connection, target);

  for (const advertiser of group.advertisers) {
    const updateWebsiteFields = !target.isSyntheticNameKey && !getAdvertiserDomainHint(advertiser);

    await connection.execute(
      `
        update advertisers
        set
          company_id = ?,
          website_url = case when ? then coalesce(website_url, ?) else website_url end,
          normalized_domain = case when ? then coalesce(normalized_domain, ?) else normalized_domain end,
          updated_at = ?
        where id = ?
      `,
      [
        target.id,
        updateWebsiteFields ? 1 : 0,
        target.websiteUrl,
        updateWebsiteFields ? 1 : 0,
        target.normalizedDomain,
        new Date(),
        advertiser.id,
      ],
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();

  try {
    const [advertiserRows, searchRows] = await Promise.all([
      pool.query<AdvertiserRow[]>(
        `
          select
            a.id,
            a.source,
            a.source_advertiser_id as sourceAdvertiserId,
            a.canonical_name as canonicalName,
            a.profile_url as profileUrl,
            a.website_url as websiteUrl,
            a.normalized_domain as normalizedDomain,
            a.company_id as companyId,
            c.normalized_domain as companyNormalizedDomain,
            a.logo_url as logoUrl,
            a.last_indexed_at as lastIndexedAt,
            a.created_at as createdAt,
            count(ad.id) as totalAds,
            group_concat(distinct ad.destination_url separator '\\n') as destinationUrls
          from advertisers a
          left join advertiser_companies c on c.id = a.company_id
          left join ads ad on ad.advertiser_id = a.id
          group by
            a.id,
            a.source,
            a.source_advertiser_id,
            a.canonical_name,
            a.profile_url,
            a.website_url,
            a.normalized_domain,
            a.company_id,
            c.normalized_domain,
            a.logo_url,
            a.last_indexed_at,
            a.created_at
          order by a.updated_at desc
        `,
      ),
      pool.query<SearchCompanyHintRow[]>(
        `
          select distinct
            r.source,
            r.source_advertiser_id as sourceAdvertiserId,
            r.company_key as companyKey,
            r.display_name as displayName,
            c.website_url as websiteUrl,
            c.domain as domain,
            c.logo_url as logoUrl
          from advertiser_search_query_results r
          left join advertiser_search_query_companies c
            on c.query_id = r.query_id
            and c.company_key = r.company_key
        `,
      ),
    ]);
    const hintsBySourceAdvertiser = new Map<string, SearchHint[]>();

    for (const hint of searchRows[0]) {
      const key = `${hint.source}:${hint.sourceAdvertiserId}`;
      const hints = hintsBySourceAdvertiser.get(key) ?? [];
      hints.push({
        companyKey: hint.companyKey,
        displayName: hint.displayName,
        websiteUrl: hint.websiteUrl,
        domain: hint.domain,
        logoUrl: hint.logoUrl,
      });
      hintsBySourceAdvertiser.set(key, hints);
    }

    const groupsByKey = new Map<string, DuplicateGroup>();

    for (const advertiser of advertiserRows[0]) {
      const hints = hintsBySourceAdvertiser.get(`${advertiser.source}:${advertiser.sourceAdvertiserId}`) ?? [];
      const key = getAdvertiserGroupKey(advertiser, hints);

      if (!key) {
        continue;
      }

      const group = groupsByKey.get(key) ?? { key, advertisers: [], hints: [] };
      group.advertisers.push(advertiser);
      group.hints.push(...hints);
      groupsByKey.set(key, group);
    }

    const mergeGroups = mergeGroupsByBrandName([...groupsByKey.values()])
      .filter(shouldMergeGroup)
      .sort((left, right) => right.advertisers.length - left.advertisers.length || left.key.localeCompare(right.key));
    const targetGroups = filterTargetGroups(mergeGroups, args);
    const plannedUpdates = targetGroups.reduce((sum, group) => sum + group.advertisers.length, 0);

    logProgress(`loaded ${advertiserRows[0].length} advertisers`);
    logProgress(`found ${mergeGroups.length} duplicate advertiser groups; selected ${targetGroups.length}`);
    logProgress(`${args.apply ? "will update" : "dry run: would update"} ${plannedUpdates} advertiser company links`);

    for (const group of targetGroups.slice(0, 20)) {
      const target = buildCompanyTarget(group);
      logProgress(
        `${args.apply ? "merge" : "would merge"} ${group.key} -> company ${target.normalizedDomain} (${target.displayName}; website=${target.websiteUrl ?? "none"}): ${group.advertisers
          .map((advertiser) => `${advertiser.source}:${advertiser.canonicalName}:${advertiser.id}`)
          .join(", ")}`,
      );
    }

    if (!args.apply) {
      logProgress("dry run complete; re-run with --apply to write changes");
      return;
    }

    const connection = await pool.getConnection();

    try {
      let processedGroups = 0;
      let updatedAdvertisers = 0;

      for (const group of targetGroups) {
        const target = buildCompanyTarget(group);

        await connection.beginTransaction();
        try {
          await applyGroup(connection, group, target);
          await connection.commit();
        } catch (error) {
          await connection.rollback();
          throw error;
        }

        processedGroups += 1;
        updatedAdvertisers += group.advertisers.length;

        logProgress(
          `processed ${processedGroups}/${targetGroups.length} groups; updated ${updatedAdvertisers} advertisers`,
        );
      }

      logProgress(`backfill complete: merged ${processedGroups} groups and updated ${updatedAdvertisers} advertisers`);
    } finally {
      connection.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:merge-duplicate-advertisers] failed", error);
  process.exitCode = 1;
});
