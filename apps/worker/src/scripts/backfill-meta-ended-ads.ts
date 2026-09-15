import { getPool, persistAdvertiserSyncResult, recordActiveAdStatusCheckResults } from "@adluv/db";
import { fetchMetaAdLibraryDetails } from "@adluv/source-adapters";
import type { RowDataPacket } from "mysql2/promise";
import { createWorkerSourceAdapter, getWorkerMetaFetchOptionsAsync } from "../source-adapter";
import { createScriptProgressLogger } from "./progress";

type Args = {
  adId: string | null;
  dryRun: boolean;
  limit: number | null;
};

type CandidateRow = RowDataPacket & {
  id: string;
  sourceAdId: string | null;
  endDateSeconds: number | string | null;
};

type ActiveCorrectionRow = RowDataPacket & {
  id: string;
  sourceAdId: string | null;
};

type LiveRefreshCorrectionRow = RowDataPacket & {
  id: string;
  advertiserId: string;
  collationCount: number | string | null;
  collationId: string | null;
  collationSourceAdIdsJson: unknown;
  missingEuTransparency: number | string | null;
  sourceAdvertiserId: string;
  sourceAdId: string;
  status: string | null;
  rawIsActive: string | null;
};

type ActiveLiveStatusRow = RowDataPacket & {
  id: string;
  advertiserId: string;
  sourceAdvertiserId: string;
  sourceAdId: string;
};

const logProgress = createScriptProgressLogger("backfill:meta-ended-ads");
const rawPayloadIsActiveExpression =
  "coalesce(json_unquote(json_extract(metadata, '$.rawPayload.is_active')), 'false')";
const lastActiveSourceStatusExpression =
  "lower(coalesce(json_unquote(json_extract(metadata, '$.activeStatusLastSourceStatus')), ''))";
const missingMetaEuReachExpression = `
  nullif(json_unquote(json_extract(ads.metadata, '$.rawPayload.reach_estimate')), 'null') is null
  and nullif(json_unquote(json_extract(ads.metadata, '$.rawPayload.eu_total_reach')), 'null') is null
  and nullif(json_unquote(json_extract(ads.metadata, '$.rawPayload.total_reach')), 'null') is null
  and nullif(json_unquote(json_extract(ads.metadata, '$.rawPayload.data_reach.eu_total_reach')), 'null') is null
  and nullif(json_unquote(json_extract(ads.metadata, '$.rawPayload.data_reach.total_reach')), 'null') is null
  and nullif(json_unquote(json_extract(ads.metadata, '$.rawPayload.data_reach.aaa_info.eu_total_reach')), 'null') is null
  and nullif(json_unquote(json_extract(ads.metadata, '$.rawPayload.data_reach.aaa_info.total_reach')), 'null') is null
  and nullif(json_unquote(json_extract(ads.metadata, '$.rawPayload.data_reach.transparency_by_location.eu_transparency.total_reach')), 'null') is null
  and nullif(json_unquote(json_extract(ads.metadata, '$.rawPayload.data_reach.transparency_by_location.uk_transparency.total_reach')), 'null') is null
  and nullif(json_unquote(json_extract(ads.metadata, '$.rawPayload.data_reach.transparency_by_location.br_transparency.total_reach')), 'null') is null
  and nullif(json_unquote(json_extract(ads.metadata, '$.rawPayload.eu_transparency.eu_total_reach')), 'null') is null
  and nullif(json_unquote(json_extract(ads.metadata, '$.rawPayload.eu_transparency.total_reach')), 'null') is null
`;
const missingMetaEuCountriesExpression = `
  coalesce(json_length(json_extract(ads.metadata, '$.rawPayload.targeted_or_reached_countries')), 0) = 0
  and coalesce(json_length(json_extract(ads.metadata, '$.rawPayload.data_reach.targeted_or_reached_countries')), 0) = 0
  and coalesce(json_length(json_extract(ads.metadata, '$.rawPayload.data_reach.aaa_info.targeted_or_reached_countries')), 0) = 0
  and coalesce(json_length(json_extract(ads.metadata, '$.rawPayload.data_reach.transparency_by_location.eu_transparency.age_country_gender_reach_breakdown')), 0) = 0
  and coalesce(json_length(json_extract(ads.metadata, '$.rawPayload.data_reach.transparency_by_location.uk_transparency.age_country_gender_reach_breakdown')), 0) = 0
  and coalesce(json_length(json_extract(ads.metadata, '$.rawPayload.data_reach.transparency_by_location.br_transparency.age_country_gender_reach_breakdown')), 0) = 0
  and coalesce(json_length(json_extract(ads.metadata, '$.rawPayload.eu_transparency.targeted_or_reached_countries')), 0) = 0
`;
const missingMetaEuTransparencyExpression = `
  (${missingMetaEuReachExpression})
  or (${missingMetaEuCountriesExpression})
`;

function isActiveStatus(status: string | null | undefined) {
  return status?.trim().toLowerCase() === "active";
}

function isRawPayloadActive(value: string | null | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function isInactiveSourceStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return (
    normalized === "inactive" ||
    normalized === "ended" ||
    normalized === "completed" ||
    normalized === "removed" ||
    normalized.includes("not active")
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "unknown error");
}

function isLiveRefreshRateLimitError(error: unknown) {
  return /rate limit|429|temporarily blocked|try again/i.test(getErrorMessage(error));
}

function parseJsonStringArray(value: unknown) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function describeMetaFetchTransport(options: Awaited<ReturnType<typeof getWorkerMetaFetchOptionsAsync>>) {
  const transports = [
    options.webScrapingApiProxy ? "webscrapingapi-proxy" : null,
    options.webScrapingApiKey ? "webscrapingapi-rest" : null,
    options.metaProxyUrls?.length ? `meta-proxy-list(${options.metaProxyUrls.length})` : null,
  ].filter(Boolean);

  return `transportOrder=${options.metaTransportOrder ?? "proxy-first"} transports=${transports.join(", ") || "direct"}`;
}

function parsePositiveInteger(value: string | undefined, fallback: number | null) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv: string[]): Args {
  const adIdFlag = argv.find((value) => value.startsWith("--ad-id="));
  const limitFlag = argv.find((value) => value.startsWith("--limit="));
  const adId = adIdFlag?.slice("--ad-id=".length).trim() || null;

  return {
    adId,
    dryRun: argv.includes("--dry-run"),
    limit: adId ? 1 : parsePositiveInteger(limitFlag?.slice("--limit=".length), null),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();

  try {
    const limitClause = args.limit ? `limit ${args.limit}` : "";
    const liveRefreshLimit = args.adId ? 1 : args.limit ?? 5;
    const liveRefreshLimitClause = `limit ${liveRefreshLimit}`;
    const [activeCorrectionRows] = await pool.query<ActiveCorrectionRow[]>(
      `
        select
          id,
          source_ad_id as sourceAdId
        from ads
        where source = 'facebook'
          and coalesce(status, '') <> 'active'
          and (? is null or id = ?)
          and ${rawPayloadIsActiveExpression} = 'true'
          and ${lastActiveSourceStatusExpression} not in ('inactive', 'ended', 'completed', 'removed')
          and ${lastActiveSourceStatusExpression} not like '%not active%'
        order by last_seen_at desc
        ${limitClause}
      `,
      [args.adId, args.adId],
    );

    logProgress(
      `found ${activeCorrectionRows.length} inactive Meta ads with rawPayload.is_active=true${
        args.dryRun ? " (dry run)" : ""
      }`,
    );

    if (!args.dryRun && activeCorrectionRows.length) {
      const ids = activeCorrectionRows.map((row) => row.id);
      await pool.query(
        `
          update ads
          set status = 'active',
              last_seen_at = now(3),
              metadata = json_set(
                coalesce(metadata, json_object()),
                '$.statusCorrectedFromMetaIsActiveAt',
                date_format(now(3), '%Y-%m-%dT%H:%i:%s.%fZ')
              ),
              updated_at = now(3)
          where id in (?)
        `,
        [ids],
      );
    }

    let liveRefreshCorrections = 0;
    let liveSourceRefreshes = 0;
    let liveRefreshFailures = 0;
    let liveRefreshRateLimited = false;
    let activeLiveStatusChecks = 0;
    let activeLiveStatusInactive = 0;
    let activeLiveStatusFailures = 0;
    let activeLiveStatusRateLimited = false;
    const activeLiveStatusLimit = args.adId ? 1 : args.limit ?? 50;
    const activeLiveStatusLimitClause = `limit ${activeLiveStatusLimit}`;

    const [activeLiveStatusRows] = await pool.query<ActiveLiveStatusRow[]>(
      `
        select
          ads.id,
          ads.advertiser_id as advertiserId,
          advertisers.source_advertiser_id as sourceAdvertiserId,
          ads.source_ad_id as sourceAdId
        from ads
        inner join advertisers on advertisers.id = ads.advertiser_id
        where ads.source = 'facebook'
          and ads.status = 'active'
          and (? is null or ads.id = ?)
          and ads.source_ad_id is not null
          and ads.source_ad_id <> ''
          and advertisers.source_advertiser_id is not null
          and advertisers.source_advertiser_id <> ''
          and (? is not null or json_extract(ads.metadata, '$.activeStatusCheckedAtMs') is null)
        order by ads.last_seen_at desc
        ${activeLiveStatusLimitClause}
      `,
      [args.adId, args.adId, args.adId],
    );

    logProgress(
      `found ${activeLiveStatusRows.length} active Meta ads that need a live status check${
        args.dryRun ? " (dry run)" : ""
      }${args.adId ? "" : ` (limit ${activeLiveStatusLimit})`}`,
    );

    if (activeLiveStatusRows.length) {
      logProgress(`checking active live statuses with ${describeMetaFetchTransport(await getWorkerMetaFetchOptionsAsync())}`);
    }

    if (args.dryRun) {
      activeLiveStatusChecks = activeLiveStatusRows.length;
    } else if (activeLiveStatusRows.length) {
      const adapter = await createWorkerSourceAdapter("facebook");
      const rowsByAdvertiser = new Map<string, ActiveLiveStatusRow[]>();

      for (const row of activeLiveStatusRows) {
        const key = `${row.advertiserId}:${row.sourceAdvertiserId}`;
        rowsByAdvertiser.set(key, [...(rowsByAdvertiser.get(key) ?? []), row]);
      }

      for (const advertiserRows of rowsByAdvertiser.values()) {
        const [firstRow] = advertiserRows;
        let fetchedAds: Awaited<ReturnType<typeof adapter.fetchAdvertiserAds>>;

        try {
          fetchedAds = await adapter.fetchAdvertiserAds(firstRow.sourceAdvertiserId, {
            maxResults: 500,
            sourceAdIds: advertiserRows.map((row) => row.sourceAdId),
          });
        } catch (error) {
          activeLiveStatusFailures += advertiserRows.length;

          if (isLiveRefreshRateLimitError(error)) {
            activeLiveStatusRateLimited = true;
            logProgress(
              `active live status check rate-limited at advertiser ${firstRow.sourceAdvertiserId}; stopping batch: ${getErrorMessage(error)}`,
            );
            break;
          }

          logProgress(
            `active live status check failed for advertiser ${firstRow.sourceAdvertiserId}: ${getErrorMessage(error)}`,
          );
          continue;
        }

        const fetchedAdsBySourceAdId = new Map(
          fetchedAds
            .filter((ad): ad is typeof ad & { sourceAdId: string } => typeof ad.sourceAdId === "string")
            .map((ad) => [ad.sourceAdId, ad]),
        );
        const sourceStatuses = advertiserRows.map((row) => ({
          sourceAdId: row.sourceAdId,
          status: fetchedAdsBySourceAdId.get(row.sourceAdId)?.status ?? "removed",
        }));
        const inactiveSourceAdIds = sourceStatuses
          .filter((sourceStatus) => isInactiveSourceStatus(sourceStatus.status))
          .map((sourceStatus) => sourceStatus.sourceAdId);
        const activeFetchedAds = fetchedAds.filter((ad) => isActiveStatus(ad.status));

        if (activeFetchedAds.length) {
          await persistAdvertiserSyncResult({
            advertiserId: firstRow.advertiserId,
            ads: activeFetchedAds,
          });
        }

        const result = await recordActiveAdStatusCheckResults({
          advertiserId: firstRow.advertiserId,
          checkedAt: new Date(),
          checkedSourceAdIds: advertiserRows.map((row) => row.sourceAdId),
          inactiveSourceAdIds,
          sourceStatuses,
        });

        activeLiveStatusChecks += result.checkedAds;
        activeLiveStatusInactive += result.inactiveAds;
      }
    }

    const [liveRefreshRows] = await pool.query<LiveRefreshCorrectionRow[]>(
      `
        select
          ads.id,
          ads.advertiser_id as advertiserId,
          json_unquote(json_extract(ads.metadata, '$.rawPayload.collation_id')) as collationId,
          json_unquote(json_extract(ads.metadata, '$.rawPayload.collation_count')) as collationCount,
          (
            select json_arrayagg(sibling_ads.source_ad_id)
            from ads sibling_ads
            where sibling_ads.source = 'facebook'
              and sibling_ads.advertiser_id = ads.advertiser_id
              and sibling_ads.source_ad_id is not null
              and sibling_ads.source_ad_id <> ''
              and json_unquote(json_extract(sibling_ads.metadata, '$.rawPayload.collation_id')) =
                json_unquote(json_extract(ads.metadata, '$.rawPayload.collation_id'))
          ) as collationSourceAdIdsJson,
          case when (${missingMetaEuTransparencyExpression}) then 1 else 0 end as missingEuTransparency,
          advertisers.source_advertiser_id as sourceAdvertiserId,
          ads.source_ad_id as sourceAdId,
          ads.status,
          ${rawPayloadIsActiveExpression} as rawIsActive
        from ads
        inner join advertisers on advertisers.id = ads.advertiser_id
        where ads.source = 'facebook'
          and (? is null or ads.id = ?)
          and ads.source_ad_id is not null
          and ads.source_ad_id <> ''
          and advertisers.source_advertiser_id is not null
          and advertisers.source_advertiser_id <> ''
          and (
            (coalesce(ads.status, '') <> 'active' and ${rawPayloadIsActiveExpression} <> 'true')
            or (${missingMetaEuTransparencyExpression})
          )
          and (? is not null or json_extract(ads.metadata, '$.liveMetaRefreshCheckedAtMs') is null)
        order by
          case when coalesce(ads.status, '') = 'active' and (${missingMetaEuTransparencyExpression}) then 0 else 1 end,
          ads.last_seen_at desc
        ${liveRefreshLimitClause}
      `,
      [args.adId, args.adId, args.adId],
    );

    logProgress(
      `found ${liveRefreshRows.length} Meta ads that need a live source refresh${
        args.dryRun ? " (dry run)" : ""
      }${args.adId ? "" : ` (limit ${liveRefreshLimit})`}`,
    );

    const metaFetchOptions = liveRefreshRows.length ? await getWorkerMetaFetchOptionsAsync() : null;

    if (metaFetchOptions) {
      logProgress(`refreshing live Meta sources with ${describeMetaFetchTransport(metaFetchOptions)}`);
    }

    if (args.dryRun) {
      liveSourceRefreshes = liveRefreshRows.length;
      liveRefreshCorrections = liveRefreshRows.filter(
        (row) => !isActiveStatus(row.status) && !isRawPayloadActive(row.rawIsActive),
      ).length;
    } else if (liveRefreshRows.length) {
      const detailsOnlyRows = liveRefreshRows.filter(
        (row) => isActiveStatus(row.status) || isRawPayloadActive(row.rawIsActive) || String(row.missingEuTransparency) === "1",
      );
      const searchRefreshRows = liveRefreshRows.filter((row) => !detailsOnlyRows.includes(row));

      for (const row of detailsOnlyRows) {
        let details: Record<string, unknown> | null;

        try {
          details = await fetchMetaAdLibraryDetails(row.sourceAdvertiserId, row.sourceAdId, {
            ...metaFetchOptions,
            collationAdIds: parseJsonStringArray(row.collationSourceAdIdsJson),
            collationCount: row.collationCount,
            collationId: row.collationId,
          });
        } catch (error) {
          liveRefreshFailures += 1;

          if (isLiveRefreshRateLimitError(error)) {
            liveRefreshRateLimited = true;
            logProgress(
              `live details refresh rate-limited at ${row.id} (${row.sourceAdId}); stopping live refresh batch: ${getErrorMessage(error)}`,
            );
            break;
          }

          logProgress(`live details refresh failed for ${row.id} (${row.sourceAdId}): ${getErrorMessage(error)}`);
          continue;
        }

        await pool.query(
          `
            update ads
            set metadata = json_set(
                  coalesce(metadata, json_object()),
                  '$.rawPayload.data_reach',
                  cast(? as json),
                  '$.liveMetaRefreshCheckedAt',
                  date_format(now(3), '%Y-%m-%dT%H:%i:%s.%fZ'),
                  '$.liveMetaRefreshCheckedAtMs',
                  unix_timestamp(now(3)) * 1000
                ),
                updated_at = now(3)
            where id = ?
          `,
          [JSON.stringify(details ?? {}), row.id],
        );
        liveSourceRefreshes += 1;
      }

      if (liveRefreshRateLimited) {
        logProgress("skipping page-search live refresh after details rate limit");
      } else if (searchRefreshRows.length) {
        const adapter = await createWorkerSourceAdapter("facebook");
        const rowsByAdvertiser = new Map<string, LiveRefreshCorrectionRow[]>();

        for (const row of searchRefreshRows) {
          const key = `${row.advertiserId}:${row.sourceAdvertiserId}`;
          rowsByAdvertiser.set(key, [...rowsByAdvertiser.get(key) ?? [], row]);
        }

        for (const advertiserRows of rowsByAdvertiser.values()) {
          const [firstRow] = advertiserRows;
          let fetchedAds: Awaited<ReturnType<typeof adapter.fetchAdvertiserAds>>;

          try {
            fetchedAds = await adapter.fetchAdvertiserAds(firstRow.sourceAdvertiserId, {
              maxResults: 500,
              sourceAdIds: advertiserRows.map((row) => row.sourceAdId),
            });
          } catch (error) {
            liveRefreshFailures += advertiserRows.length;

            if (isLiveRefreshRateLimitError(error)) {
              liveRefreshRateLimited = true;
              logProgress(
                `live refresh rate-limited at advertiser ${firstRow.sourceAdvertiserId}; stopping live refresh batch: ${getErrorMessage(error)}`,
              );
              break;
            }

            logProgress(`live refresh failed for advertiser ${firstRow.sourceAdvertiserId}: ${getErrorMessage(error)}`);
            continue;
          }

          const fetchedAdsBySourceAdId = new Map(fetchedAds.filter((ad) => ad.sourceAdId).map((ad) => [ad.sourceAdId, ad]));
          const adsToPersist = [];
          const refreshedRows = [];
          const checkedRows = [];

          for (const row of advertiserRows) {
            const fetchedAd = fetchedAdsBySourceAdId.get(row.sourceAdId);

            if (!fetchedAd) {
              logProgress(`live refresh did not find ${row.id} (${row.sourceAdId})`);
              continue;
            }

            if (!isActiveStatus(fetchedAd.status)) {
              logProgress(`live refresh found ${row.id} (${row.sourceAdId}) with status ${fetchedAd.status ?? "unknown"}`);
              checkedRows.push(row);
              continue;
            }

            if (!isActiveStatus(row.status) && !isRawPayloadActive(row.rawIsActive)) {
              liveRefreshCorrections += 1;
            }

            liveSourceRefreshes += 1;
            adsToPersist.push(fetchedAd);
            refreshedRows.push(row);
            checkedRows.push(row);
          }

          if (adsToPersist.length) {
            await persistAdvertiserSyncResult({
              advertiserId: firstRow.advertiserId,
              ads: adsToPersist,
            });
          }

          if (checkedRows.length) {
            await pool.query(
              `
              update ads
              set metadata = json_set(
                    coalesce(metadata, json_object()),
                    '$.liveMetaRefreshCheckedAt',
                    date_format(now(3), '%Y-%m-%dT%H:%i:%s.%fZ'),
                    '$.liveMetaRefreshCheckedAtMs',
                    unix_timestamp(now(3)) * 1000
                  ),
                  updated_at = now(3)
              where id in (?)
            `,
              [checkedRows.map((row) => row.id)],
            );
          }

          if (refreshedRows.length) {
            await pool.query(
              `
              update ads
              set metadata = json_set(
                    coalesce(metadata, json_object()),
                    '$.statusCorrectedFromLiveMetaActiveAt',
                    date_format(now(3), '%Y-%m-%dT%H:%i:%s.%fZ')
                  ),
                  updated_at = now(3)
              where id in (?)
            `,
              [refreshedRows.map((row) => row.id)],
            );
          }
        }
      }
    }

    const [rows] = await pool.query<CandidateRow[]>(
      `
        select
          id,
          source_ad_id as sourceAdId,
          cast(json_unquote(json_extract(metadata, '$.rawPayload.end_date')) as unsigned) as endDateSeconds
        from ads
        where source = 'facebook'
          and status = 'active'
          and (? is null or id = ?)
          and ${rawPayloadIsActiveExpression} <> 'true'
          and cast(json_unquote(json_extract(metadata, '$.rawPayload.end_date')) as unsigned) > 0
          and cast(json_unquote(json_extract(metadata, '$.rawPayload.end_date')) as unsigned) <= unix_timestamp()
        order by last_seen_at desc
        ${limitClause}
      `,
      [args.adId, args.adId],
    );

    logProgress(
      `found ${rows.length} active Meta ads with past end_date and rawPayload.is_active!=true${
        args.dryRun ? " (dry run)" : ""
      }`,
    );

    if (!args.dryRun && rows.length) {
      const ids = rows.map((row) => row.id);
      await pool.query(
        `
          update ads
          set status = 'inactive',
              last_seen_at = from_unixtime(cast(json_unquote(json_extract(metadata, '$.rawPayload.end_date')) as unsigned)),
              metadata = json_set(
                coalesce(metadata, json_object()),
                '$.statusCorrectedFromPastMetaEndDateAt',
                date_format(now(3), '%Y-%m-%dT%H:%i:%s.%fZ')
              ),
              updated_at = now(3)
          where id in (?)
        `,
        [ids],
      );
    }

    logProgress(
      `${args.dryRun ? "would update" : "updated"} ${
        activeCorrectionRows.length + liveRefreshCorrections
      } active corrections, ${activeLiveStatusChecks} active live status checks, ${activeLiveStatusInactive} active live status inactive corrections, ${activeLiveStatusFailures} active live status failures${
        activeLiveStatusRateLimited ? " (rate limited)" : ""
      }, ${liveSourceRefreshes} live source refreshes, ${liveRefreshFailures} live refresh failures${
        liveRefreshRateLimited ? " (rate limited)" : ""
      }, and ${rows.length} ended corrections`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:meta-ended-ads] failed", error);
  process.exitCode = 1;
});
