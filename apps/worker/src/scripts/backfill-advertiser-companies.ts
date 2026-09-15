import { createHash } from "node:crypto";
import { createScriptProgressLogger } from "./progress";

import { eq, inArray, sql } from "drizzle-orm";
import { normalizeAdvertiserIndustry, resolveCdnAssetUrl } from "@adluv/config";
import {
  advertiserCompaniesTable,
  advertisersTable,
  adsTable,
  compareAdvertiserBrandCandidates,
  extractHostnameFromWebsite,
  extractRegistrableDomain,
  getDb,
  getPool,
  isIgnoredAdvertiserDomain,
  normalizeAdvertiserBrandKey,
  normalizeAdvertiserWebsite,
  syncAdvertiserCompanyMembership,
} from "@adluv/db";
import { type RowDataPacket } from "mysql2/promise";

import { buildSafeJobId, enqueueTrackedJob, queues } from "../queue";
import { createWorkerSourceAdapter } from "../source-adapter";

type Args = {
  dryRun: boolean;
  limit: number | null;
};

type AdvertiserSummaryRow = RowDataPacket & {
  id: string;
  source: "linkedin" | "facebook" | "google" | "tiktok";
  sourceAdvertiserId: string;
  canonicalName: string;
  profileUrl: string | null;
  websiteUrl: string | null;
  normalizedDomain: string | null;
  companyId: string | null;
  logoUrl: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  summary: string | null;
  lastIndexedAt: Date | null;
  totalAds: number;
};

type SearchHintRow = RowDataPacket & {
  advertiserId: string;
  websiteUrl: string | null;
  domain: string | null;
};

type AdDestinationRow = RowDataPacket & {
  advertiserId: string;
  destinationUrl: string | null;
};

type DomainHint = {
  normalizedDomain: string;
  websiteUrl: string | null;
};

type AdvertiserResolution = {
  id: string;
  source: "linkedin" | "facebook" | "google" | "tiktok";
  sourceAdvertiserId: string;
  canonicalName: string;
  profileUrl: string | null;
  currentWebsiteUrl: string | null;
  currentNormalizedDomain: string | null;
  currentCompanyId: string | null;
  nextWebsiteUrl: string | null;
  nextNormalizedDomain: string;
  resolutionSource: "existing" | "profile" | "search_cache" | "ads";
  logoUrl: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  summary: string | null;
  lastIndexedAt: Date | null;
  totalAds: number;
};

type AdvertiserProfileRefresh = {
  advertiserId: string;
  canonicalName: string;
  profileUrl: string | null;
  websiteUrl: string | null;
  normalizedDomain: string | null;
  logoUrl: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  summary: string | null;
};

const chunkSize = 100;

const logProgress = createScriptProgressLogger("backfill:advertiser-companies");

function parseArgs(argv: string[]): Args {
  const limitFlag = argv.find((value) => value.startsWith("--limit="));
  const rawLimit = limitFlag ? Number.parseInt(limitFlag.slice("--limit=".length), 10) : null;

  return {
    dryRun: argv.includes("--dry-run"),
    limit: Number.isFinite(rawLimit) && rawLimit && rawLimit > 0 ? rawLimit : null,
  };
}

function buildCompanyId(normalizedDomain: string) {
  return createHash("sha1").update(normalizedDomain).digest("hex");
}

function toRootWebsiteUrl(websiteUrl: string | null, normalizedDomain: string) {
  const normalizedWebsite = normalizeAdvertiserWebsite(websiteUrl);

  if (!normalizedWebsite.websiteUrl) {
    return `https://${normalizedDomain}/`;
  }

  const parsedUrl = new URL(normalizedWebsite.websiteUrl);
  parsedUrl.pathname = "/";
  parsedUrl.search = "";
  parsedUrl.hash = "";

  return parsedUrl.toString();
}

function toDomainHintFromWebsite(websiteUrl: string | null | undefined): DomainHint | null {
  const normalized = normalizeAdvertiserWebsite(websiteUrl);

  if (!normalized.normalizedDomain || isIgnoredAdvertiserDomain(normalized.normalizedDomain)) {
    return null;
  }

  return {
    normalizedDomain: normalized.normalizedDomain,
    websiteUrl: toRootWebsiteUrl(normalized.websiteUrl, normalized.normalizedDomain),
  };
}

function toDomainHintFromDomain(domain: string | null | undefined): DomainHint | null {
  const normalizedDomain = extractRegistrableDomain(domain);

  if (!normalizedDomain || isIgnoredAdvertiserDomain(normalizedDomain)) {
    return null;
  }

  return {
    normalizedDomain,
    websiteUrl: `https://${normalizedDomain}/`,
  };
}

function toDomainHintFromDestination(destinationUrl: string | null | undefined): DomainHint | null {
  const hostname = extractHostnameFromWebsite(destinationUrl);
  const normalizedDomain = extractRegistrableDomain(hostname);

  if (!normalizedDomain || isIgnoredAdvertiserDomain(normalizedDomain)) {
    return null;
  }

  return {
    normalizedDomain,
    websiteUrl: `https://${normalizedDomain}/`,
  };
}

function getDomainBrandKey(normalizedDomain: string) {
  const brandLabel = normalizedDomain.split(".")[0] ?? normalizedDomain;

  return normalizeAdvertiserBrandKey(brandLabel.replace(/[-_]+/g, " "));
}

function shouldPreferAdHint(input: {
  advertiserName: string;
  existingHint: DomainHint | null;
  adHint: DomainHint | null;
}) {
  if (!input.adHint) {
    return false;
  }

  const brandKey = normalizeAdvertiserBrandKey(input.advertiserName);

  if (!brandKey || getDomainBrandKey(input.adHint.normalizedDomain) !== brandKey) {
    return false;
  }

  return !input.existingHint || getDomainBrandKey(input.existingHint.normalizedDomain) !== brandKey;
}

function buildConsistentHintMap<T>(
  rows: T[],
  keySelector: (row: T) => string,
  hintSelector: (row: T) => DomainHint | null,
) {
  const hintsByAdvertiserId = new Map<string, DomainHint[]>();

  for (const row of rows) {
    const advertiserId = keySelector(row);
    const hint = hintSelector(row);

    if (!hint) {
      continue;
    }

    const hints = hintsByAdvertiserId.get(advertiserId);

    if (hints) {
      hints.push(hint);
      continue;
    }

    hintsByAdvertiserId.set(advertiserId, [hint]);
  }

  const resolved = new Map<string, DomainHint>();
  const ambiguousAdvertiserIds = new Set<string>();

  for (const [advertiserId, hints] of hintsByAdvertiserId.entries()) {
    const uniqueDomains = [...new Set(hints.map((hint) => hint.normalizedDomain))];

    if (uniqueDomains.length !== 1) {
      ambiguousAdvertiserIds.add(advertiserId);
      continue;
    }

    const normalizedDomain = uniqueDomains[0];
    const websiteUrl =
      hints.find((hint) => hint.websiteUrl)?.websiteUrl ?? `https://${normalizedDomain}/`;

    resolved.set(advertiserId, {
      normalizedDomain,
      websiteUrl,
    });
  }

  return {
    resolved,
    ambiguousAdvertiserIds,
  };
}

function pickBestResolution(current: AdvertiserResolution, candidate: AdvertiserResolution) {
  return compareAdvertiserBrandCandidates(candidate, current) < 0 ? candidate : current;
}

function pickBestAdvertiserSummary(current: AdvertiserSummaryRow, candidate: AdvertiserSummaryRow) {
  return compareAdvertiserBrandCandidates(candidate, current) < 0 ? candidate : current;
}

function mergeProfileRefresh(
  advertiser: AdvertiserSummaryRow,
  refresh: AdvertiserProfileRefresh,
) {
  const normalizedWebsite = normalizeAdvertiserWebsite(refresh.websiteUrl ?? advertiser.websiteUrl);

  return {
    canonicalName: refresh.canonicalName || advertiser.canonicalName,
    profileUrl: refresh.profileUrl ?? advertiser.profileUrl,
    websiteUrl: normalizedWebsite.websiteUrl,
    normalizedDomain: normalizedWebsite.normalizedDomain,
    logoUrl: resolveCdnAssetUrl(refresh.logoUrl ?? advertiser.logoUrl) ?? null,
    industry: normalizeAdvertiserIndustry(refresh.industry ?? advertiser.industry),
    companySize: refresh.companySize ?? advertiser.companySize ?? null,
    country: refresh.country ?? advertiser.country ?? null,
    summary: refresh.summary ?? advertiser.summary ?? null,
  };
}

async function fetchProfileRefreshes(advertisers: AdvertiserSummaryRow[]) {
  const refreshMap = new Map<string, AdvertiserProfileRefresh>();
  const advertisersNeedingRefresh = advertisers.filter((advertiser) => !advertiser.companyId);
  const adapterCache = new Map<string, Awaited<ReturnType<typeof createWorkerSourceAdapter>>>();

  for (let index = 0; index < advertisersNeedingRefresh.length; index += 5) {
    const chunk = advertisersNeedingRefresh.slice(index, index + 5);
    const results = await Promise.all(
      chunk.map(async (advertiser) => {
        try {
          let adapter = adapterCache.get(advertiser.source);

          if (!adapter) {
            adapter = await createWorkerSourceAdapter(advertiser.source);
            adapterCache.set(advertiser.source, adapter);
          }

          const profile = await adapter.fetchAdvertiserProfile(advertiser.sourceAdvertiserId);

          if (!profile) {
            return null;
          }

          const normalizedWebsite = normalizeAdvertiserWebsite(profile.websiteUrl ?? null);

          return {
            advertiserId: advertiser.id,
            canonicalName: profile.canonicalName,
            profileUrl: profile.profileUrl ?? null,
            websiteUrl: normalizedWebsite.websiteUrl,
            normalizedDomain: normalizedWebsite.normalizedDomain,
            logoUrl: profile.logoUrl ?? null,
            industry: normalizeAdvertiserIndustry(profile.industry),
            companySize: profile.companySize ?? null,
            country: profile.country ?? null,
            summary: profile.summary ?? null,
          } satisfies AdvertiserProfileRefresh;
        } catch {
          return null;
        }
      }),
    );

    for (const result of results) {
      if (!result) {
        continue;
      }

      refreshMap.set(result.advertiserId, result);
    }
  }

  return refreshMap;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();
  const db = getDb();

  try {
    const [advertisers, searchHints, adDestinations] = await Promise.all([
      pool.query<AdvertiserSummaryRow[]>(
        `
          select
            a.id,
            a.source as source,
            a.source_advertiser_id as sourceAdvertiserId,
            a.canonical_name as canonicalName,
            a.profile_url as profileUrl,
            a.website_url as websiteUrl,
            a.normalized_domain as normalizedDomain,
            a.company_id as companyId,
            a.logo_url as logoUrl,
            a.industry as industry,
            a.company_size as companySize,
            a.country as country,
            a.summary as summary,
            a.last_indexed_at as lastIndexedAt,
            count(ad.id) as totalAds
          from advertisers a
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
            a.logo_url,
            a.industry,
            a.company_size,
            a.country,
            a.summary,
            a.last_indexed_at
          order by a.updated_at desc
        `,
      ),
      pool.query<SearchHintRow[]>(
        `
          select distinct
            r.advertiser_id as advertiserId,
            c.website_url as websiteUrl,
            c.domain as domain
          from advertiser_search_query_results r
          inner join advertiser_search_query_companies c
            on c.company_key = r.company_key
          where r.advertiser_id is not null
            and (c.website_url is not null or c.domain is not null)
        `,
      ),
      pool.query<AdDestinationRow[]>(
        `
          select
            advertiser_id as advertiserId,
            destination_url as destinationUrl
          from ads
          where destination_url is not null
        `,
      ),
    ]);

    const advertiserRows = advertisers[0];
    const searchHintRows = searchHints[0];
    const adDestinationRows = adDestinations[0];
    const advertiserById = new Map(advertiserRows.map((advertiser) => [advertiser.id, advertiser]));
    const profileRefreshMap = await fetchProfileRefreshes(advertiserRows);

    const searchHintMap = buildConsistentHintMap(
      searchHintRows,
      (row) => row.advertiserId,
      (row) => toDomainHintFromWebsite(row.websiteUrl) ?? toDomainHintFromDomain(row.domain),
    );
    const adHintMap = buildConsistentHintMap(
      adDestinationRows,
      (row) => row.advertiserId,
      (row) => toDomainHintFromDestination(row.destinationUrl),
    );
    const profileHintMap = new Map<string, DomainHint>();

    for (const [advertiserId, profileRefresh] of profileRefreshMap.entries()) {
      const hint =
        toDomainHintFromWebsite(profileRefresh.websiteUrl) ??
        toDomainHintFromDomain(profileRefresh.normalizedDomain);

      if (!hint) {
        continue;
      }

      profileHintMap.set(advertiserId, hint);
    }

    const resolutions = advertiserRows
      .map<AdvertiserResolution | null>((advertiser) => {
        const existingHint =
          toDomainHintFromWebsite(advertiser.websiteUrl) ??
          toDomainHintFromDomain(advertiser.normalizedDomain);
        const profileHint = profileHintMap.get(advertiser.id) ?? null;
        const searchHint = searchHintMap.resolved.get(advertiser.id) ?? null;
        const adHint = adHintMap.resolved.get(advertiser.id) ?? null;
        const nextHint = shouldPreferAdHint({
          advertiserName: advertiser.canonicalName,
          existingHint,
          adHint,
        })
          ? adHint
          : existingHint ?? profileHint ?? searchHint ?? adHint;
        const refreshedProfile = profileRefreshMap.get(advertiser.id) ?? null;

        if (!nextHint) {
          return null;
        }

        return {
          id: advertiser.id,
          source: advertiser.source,
          sourceAdvertiserId: advertiser.sourceAdvertiserId,
          canonicalName: refreshedProfile?.canonicalName ?? advertiser.canonicalName,
          profileUrl: refreshedProfile?.profileUrl ?? advertiser.profileUrl,
          currentWebsiteUrl: advertiser.websiteUrl,
          currentNormalizedDomain: advertiser.normalizedDomain,
          currentCompanyId: advertiser.companyId,
          nextWebsiteUrl: nextHint.websiteUrl,
          nextNormalizedDomain: nextHint.normalizedDomain,
          resolutionSource: existingHint
            ? "existing"
            : profileHint
              ? "profile"
              : searchHint
                ? "search_cache"
                : "ads",
          logoUrl: refreshedProfile?.logoUrl ?? advertiser.logoUrl,
          industry: refreshedProfile?.industry ?? advertiser.industry,
          companySize: refreshedProfile?.companySize ?? advertiser.companySize,
          country: refreshedProfile?.country ?? advertiser.country,
          summary: refreshedProfile?.summary ?? advertiser.summary,
          lastIndexedAt: advertiser.lastIndexedAt,
          totalAds: Number(advertiser.totalAds ?? 0),
        };
      })
      .filter((advertiser): advertiser is AdvertiserResolution => Boolean(advertiser))
      .sort((left, right) => {
        if (right.totalAds !== left.totalAds) {
          return right.totalAds - left.totalAds;
        }

        return left.canonicalName.localeCompare(right.canonicalName);
      });

    const targetResolutions = args.limit ? resolutions.slice(0, args.limit) : resolutions;
    const domainCounts = new Map<string, number>();

    for (const resolution of resolutions) {
      domainCounts.set(
        resolution.nextNormalizedDomain,
        (domainCounts.get(resolution.nextNormalizedDomain) ?? 0) + 1,
      );
    }

    const duplicateCompanyGroups = [...domainCounts.values()].filter((count) => count > 1);
    const advertisersToUpdateFields = targetResolutions.filter(
      (resolution) => {
        const advertiser = advertiserById.get(resolution.id);
        const refreshedProfile = profileRefreshMap.get(resolution.id);

        if (!advertiser) {
          return false;
        }

        const mergedProfile = refreshedProfile ? mergeProfileRefresh(advertiser, refreshedProfile) : null;

        return (
          resolution.currentNormalizedDomain !== resolution.nextNormalizedDomain ||
          resolution.currentWebsiteUrl !== resolution.nextWebsiteUrl ||
          (mergedProfile
            ? advertiser.canonicalName !== mergedProfile.canonicalName ||
              advertiser.profileUrl !== mergedProfile.profileUrl ||
              advertiser.logoUrl !== mergedProfile.logoUrl ||
              advertiser.industry !== mergedProfile.industry ||
              advertiser.companySize !== mergedProfile.companySize ||
              advertiser.country !== mergedProfile.country ||
              advertiser.summary !== mergedProfile.summary
            : false)
        );
      },
    ).length;
    const advertisersToLink = targetResolutions.filter(
      (resolution) => resolution.currentCompanyId !== buildCompanyId(resolution.nextNormalizedDomain),
    ).length;
    const unresolvedAdvertisers = advertiserRows.length - resolutions.length;
    const ambiguousAdvertiserIds = new Set<string>([
      ...searchHintMap.ambiguousAdvertiserIds,
      ...adHintMap.ambiguousAdvertiserIds,
    ]);

    logProgress(`loaded ${advertiserRows.length} advertisers`);
    logProgress(`resolved ${resolutions.length} advertiser domains (${targetResolutions.length} selected for ${args.dryRun ? "dry run" : "apply"})`);
    logProgress(
      `resolution sources: existing=${resolutions.filter((item) => item.resolutionSource === "existing").length}, profile=${resolutions.filter((item) => item.resolutionSource === "profile").length}, search_cache=${resolutions.filter((item) => item.resolutionSource === "search_cache").length}, ads=${resolutions.filter((item) => item.resolutionSource === "ads").length}`,
    );
    logProgress(`refreshed ${profileRefreshMap.size} unresolved advertiser profiles before linking`);
    logProgress(
      `duplicates detected: ${duplicateCompanyGroups.length} merged company groups covering ${duplicateCompanyGroups.reduce((sum, count) => sum + count, 0)} advertisers`,
    );
    logProgress(
      `skipped advertisers: unresolved=${unresolvedAdvertisers}, ambiguous=${ambiguousAdvertiserIds.size}`,
    );
    logProgress(
      `${args.dryRun ? "would update" : "updating"} ${advertisersToUpdateFields} advertiser website/domain fields and ${advertisersToLink} company links`,
    );

    if (args.dryRun) {
      logProgress("dry run complete");
      return;
    }

    let advertisersUpdated = 0;
    let advertisersRefreshed = 0;
    let fanoutTrackersQueued = 0;

    for (let index = 0; index < targetResolutions.length; index += chunkSize) {
      const chunk = targetResolutions.slice(index, index + chunkSize);

      for (const resolution of chunk) {
        const advertiser = advertiserById.get(resolution.id);

        if (!advertiser) {
          continue;
        }

        const refreshedProfile = profileRefreshMap.get(resolution.id);
        const mergedProfile = refreshedProfile ? mergeProfileRefresh(advertiser, refreshedProfile) : null;
        const updateSet: Partial<typeof advertisersTable.$inferInsert> = {
          updatedAt: new Date(),
        };

        if (
          resolution.currentNormalizedDomain !== resolution.nextNormalizedDomain ||
          resolution.currentWebsiteUrl !== resolution.nextWebsiteUrl
        ) {
          updateSet.websiteUrl = resolution.nextWebsiteUrl;
          updateSet.normalizedDomain = resolution.nextNormalizedDomain;
        }

        if (mergedProfile) {
          if (advertiser.canonicalName !== mergedProfile.canonicalName) {
            updateSet.canonicalName = mergedProfile.canonicalName;
          }

          if (advertiser.profileUrl !== mergedProfile.profileUrl) {
            updateSet.profileUrl = mergedProfile.profileUrl;
          }

          if (advertiser.logoUrl !== mergedProfile.logoUrl) {
            updateSet.logoUrl = mergedProfile.logoUrl;
          }

          if (advertiser.industry !== mergedProfile.industry) {
            updateSet.industry = mergedProfile.industry;
          }

          if (advertiser.companySize !== mergedProfile.companySize) {
            updateSet.companySize = mergedProfile.companySize;
          }

          if (advertiser.country !== mergedProfile.country) {
            updateSet.country = mergedProfile.country;
          }

          if (advertiser.summary !== mergedProfile.summary) {
            updateSet.summary = mergedProfile.summary;
          }
        }

        const profileFieldsChanged = Boolean(
          mergedProfile &&
            (advertiser.canonicalName !== mergedProfile.canonicalName ||
              advertiser.profileUrl !== mergedProfile.profileUrl ||
              advertiser.logoUrl !== mergedProfile.logoUrl ||
              advertiser.industry !== mergedProfile.industry ||
              advertiser.companySize !== mergedProfile.companySize ||
              advertiser.country !== mergedProfile.country ||
              advertiser.summary !== mergedProfile.summary),
        );

        if (Object.keys(updateSet).length > 1) {
          await db
            .update(advertisersTable)
            .set(updateSet)
            .where(eq(advertisersTable.id, resolution.id));

          advertisersUpdated += 1;

          if (profileFieldsChanged) {
            advertisersRefreshed += 1;
          }
        }

        const syncedAdvertiser = await syncAdvertiserCompanyMembership(db, resolution.id);

        for (const trackedCompanyId of syncedAdvertiser.fanoutTrackedCompanyIds) {
          await enqueueTrackedJob(
            queues.initialIndex,
            "initial-index",
            { trackedCompanyId },
            {
              jobId: buildSafeJobId("initial-index", trackedCompanyId),
            },
          );
        }

        fanoutTrackersQueued += syncedAdvertiser.fanoutTrackedCompanyIds.length;
      }

      logProgress(
        `processed ${Math.min(index + chunk.length, targetResolutions.length)}/${targetResolutions.length} advertisers; updated ${advertisersUpdated}, refreshed ${advertisersRefreshed}, queued ${fanoutTrackersQueued} fanout trackers`,
      );
    }

    const companyIds = Array.from(
      new Set(targetResolutions.map((resolution) => buildCompanyId(resolution.nextNormalizedDomain))),
    );
    const companyMemberRows = companyIds.length
      ? await db
          .select({
            id: advertisersTable.id,
            source: advertisersTable.source,
            sourceAdvertiserId: advertisersTable.sourceAdvertiserId,
            canonicalName: advertisersTable.canonicalName,
            profileUrl: advertisersTable.profileUrl,
            websiteUrl: advertisersTable.websiteUrl,
            normalizedDomain: advertisersTable.normalizedDomain,
            companyId: advertisersTable.companyId,
            logoUrl: advertisersTable.logoUrl,
            industry: advertisersTable.industry,
            companySize: advertisersTable.companySize,
            country: advertisersTable.country,
            summary: advertisersTable.summary,
            lastIndexedAt: advertisersTable.lastIndexedAt,
            totalAds: sql<number>`count(${adsTable.id})`,
          })
          .from(advertisersTable)
          .leftJoin(adsTable, eq(adsTable.advertiserId, advertisersTable.id))
          .where(inArray(advertisersTable.companyId, companyIds))
          .groupBy(
            advertisersTable.id,
            advertisersTable.source,
            advertisersTable.sourceAdvertiserId,
            advertisersTable.canonicalName,
            advertisersTable.profileUrl,
            advertisersTable.websiteUrl,
            advertisersTable.normalizedDomain,
            advertisersTable.companyId,
            advertisersTable.logoUrl,
            advertisersTable.industry,
            advertisersTable.companySize,
            advertisersTable.country,
            advertisersTable.summary,
            advertisersTable.lastIndexedAt,
          )
      : [];
    const bestResolutionByDomain = new Map<string, AdvertiserSummaryRow>();

    for (const resolution of companyMemberRows) {
      if (!resolution.normalizedDomain) {
        continue;
      }

      const current = bestResolutionByDomain.get(resolution.normalizedDomain);

      if (!current) {
        bestResolutionByDomain.set(resolution.normalizedDomain, resolution as AdvertiserSummaryRow);
        continue;
      }

      bestResolutionByDomain.set(
        resolution.normalizedDomain,
        pickBestAdvertiserSummary(current, resolution as AdvertiserSummaryRow),
      );
    }

    const existingCompanies = companyIds.length
      ? await db
          .select()
          .from(advertiserCompaniesTable)
          .where(inArray(advertiserCompaniesTable.id, companyIds))
      : [];
    const existingCompanyMap = new Map(existingCompanies.map((company) => [company.id, company]));
    let companiesCreated = 0;
    let companiesUpdated = 0;

    for (const [normalizedDomain, resolution] of bestResolutionByDomain.entries()) {
      const companyId = buildCompanyId(normalizedDomain);
      const existingCompany = existingCompanyMap.get(companyId) ?? null;
      const nextWebsiteUrl = toRootWebsiteUrl(
        resolution.websiteUrl ?? existingCompany?.websiteUrl ?? null,
        normalizedDomain,
      );
      const nextDisplayName = resolution.canonicalName;
      const nextLogoUrl = resolution.logoUrl ?? existingCompany?.logoUrl ?? null;
      const shouldWrite =
        !existingCompany ||
        existingCompany.websiteUrl !== nextWebsiteUrl ||
        existingCompany.displayName !== nextDisplayName ||
        existingCompany.logoUrl !== nextLogoUrl;

      if (!shouldWrite) {
        continue;
      }

      await db
        .insert(advertiserCompaniesTable)
        .values({
          id: companyId,
          normalizedDomain,
          websiteUrl: nextWebsiteUrl,
          displayName: nextDisplayName,
          logoUrl: nextLogoUrl,
          createdAt: existingCompany?.createdAt ?? new Date(),
          updatedAt: new Date(),
        })
        .onDuplicateKeyUpdate({
          set: {
            websiteUrl: nextWebsiteUrl,
            displayName: nextDisplayName,
            logoUrl: nextLogoUrl,
            updatedAt: new Date(),
          },
        });

      if (existingCompany) {
        companiesUpdated += 1;
      } else {
        companiesCreated += 1;
      }
    }

    logProgress(
      `backfill complete: linked ${targetResolutions.length} advertisers, updated ${advertisersUpdated} advertiser records, refreshed ${advertisersRefreshed} advertiser profiles, created ${companiesCreated} companies, updated ${companiesUpdated} companies, queued ${fanoutTrackersQueued} fanout trackers`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:advertiser-companies] failed", error);
  process.exitCode = 1;
});
