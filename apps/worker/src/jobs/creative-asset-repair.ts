import { getPool, importAdvertiserAdArchive } from "@adluv/db";
import {
  enrichGoogleCreativePreview,
  fetchLinkedInAdDetail,
  type NormalizedAd,
  type SourceName,
} from "@adluv/source-adapters";
import type { RowDataPacket } from "mysql2/promise";

import { materializeAdAssets } from "../ad-assets";
import { getGoogleRpcProxyUrlsAsync, getWebScrapingApiProxyOptions } from "../source-adapter";

export type CreativeAssetRepairJobPayload = {
  adId: string;
};

type CreativeAssetRepairRow = RowDataPacket & {
  id: string;
  advertiserId: string;
  source: SourceName;
  sourceAdvertiserId: string;
  sourceAdId: string | null;
  fingerprint: string;
  title: string | null;
  body: string | null;
  payer: string | null;
  format: string | null;
  callToAction: string | null;
  destinationUrl: string | null;
  mediaUrl: string | null;
  status: string | null;
  reactionCount: number | null;
  commentCount: number | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  metadata: unknown;
};

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

  return typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rowToNormalizedAd(row: CreativeAssetRepairRow): NormalizedAd {
  return {
    source: row.source,
    sourceAdId: row.sourceAdId ?? undefined,
    fingerprint: row.fingerprint,
    title: row.title ?? undefined,
    body: row.body ?? undefined,
    payer: row.payer ?? undefined,
    format: row.format ?? undefined,
    callToAction: row.callToAction ?? undefined,
    destinationUrl: row.destinationUrl ?? undefined,
    mediaUrl: row.mediaUrl ?? undefined,
    status: row.status ?? undefined,
    reactionCount: row.reactionCount ?? undefined,
    commentCount: row.commentCount ?? undefined,
    firstSeenAt: new Date(row.firstSeenAt),
    lastSeenAt: new Date(row.lastSeenAt),
    metadata: parseMetadata(row.metadata),
  };
}

async function getCreativeAssetRepairRow(adId: string) {
  const pool = getPool();
  const [rows] = await pool.query<CreativeAssetRepairRow[]>(
    `
      select
        ads.id,
        ads.advertiser_id as advertiserId,
        ads.source,
        advertisers.source_advertiser_id as sourceAdvertiserId,
        ads.source_ad_id as sourceAdId,
        ads.fingerprint,
        ads.title,
        ads.body,
        ads.payer,
        ads.format,
        ads.call_to_action as callToAction,
        ads.destination_url as destinationUrl,
        ads.media_url as mediaUrl,
        ads.status,
        ads.reaction_count as reactionCount,
        ads.comment_count as commentCount,
        ads.first_seen_at as firstSeenAt,
        ads.last_seen_at as lastSeenAt,
        ads.metadata
      from ads
      inner join advertisers on advertisers.id = ads.advertiser_id
      where ads.id = ?
      limit 1
    `,
    [adId],
  );

  return rows[0] ?? null;
}

async function buildRepairInput(row: CreativeAssetRepairRow): Promise<NormalizedAd> {
  const existingAd = rowToNormalizedAd(row);
  const proxyUrls = await getGoogleRpcProxyUrlsAsync();

  if (row.source === "google") {
    return enrichGoogleCreativePreview(existingAd, {
      googleRpcProxyUrls: proxyUrls,
      webScrapingApiKey: process.env.WEBSCRAPINGAPI_API_KEY?.trim() || undefined,
      webScrapingApiProxy: getWebScrapingApiProxyOptions(),
    });
  }

  if (row.source === "linkedin" && row.sourceAdId) {
    const detailAd = await fetchLinkedInAdDetail(row.sourceAdId, {
      fallbackPayer: row.payer ?? undefined,
      proxyUrls,
      sourceAdvertiserId: row.sourceAdvertiserId,
      webScrapingApiKey: process.env.WEBSCRAPINGAPI_API_KEY?.trim() || undefined,
      webScrapingApiProxy: getWebScrapingApiProxyOptions(),
    }).catch(() => null);

    if (detailAd?.metadata) {
      return {
        ...detailAd,
        mediaUrl: cleanText(detailAd.mediaUrl) ?? cleanText(existingAd.mediaUrl) ?? undefined,
        metadata: {
          ...parseMetadata(existingAd.metadata),
          ...parseMetadata(detailAd.metadata),
        },
      };
    }
  }

  return existingAd;
}

export async function runCreativeAssetRepairJob(payload: CreativeAssetRepairJobPayload) {
  const adId = payload.adId?.trim();

  if (!adId) {
    throw new Error("Creative asset repair requires an adId.");
  }

  const row = await getCreativeAssetRepairRow(adId);

  if (!row) {
    throw new Error(`Ad ${adId} was not found.`);
  }

  const repairInput = await buildRepairInput(row);
  const [hydratedAd] = await materializeAdAssets([repairInput], {
    sourceProxyUrls: row.source === "google" ? await getGoogleRpcProxyUrlsAsync() : undefined,
  });

  await importAdvertiserAdArchive({
    advertiserId: row.advertiserId,
    ads: [hydratedAd],
  });

  return {
    adId,
    source: row.source,
  };
}
