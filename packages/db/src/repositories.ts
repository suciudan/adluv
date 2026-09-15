import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { RowDataPacket } from "mysql2/promise";
import { and, count, desc, eq, inArray, isNull, like, lt, or, sql, type SQL } from "drizzle-orm";

import {
  appConfig,
  normalizeAdvertiserIndustry,
  normalizeAdvertiserIndustryOptions,
  queueNames,
  resolveCdnAssetUrl,
  type SourceName,
} from "@adluv/config";

import { resolvePersistedAdFirstSeenAt } from "./ad-timeline";
import {
  buildPublicAdvertiserId,
  compareAdvertiserBrandCandidates,
  extractHostnameFromWebsite,
  extractRegistrableDomain,
  isIgnoredAdvertiserDomain,
  normalizeAdvertiserBrandKey,
  normalizeAdvertiserWebsite,
  parsePublicAdvertiserId,
  shouldPreferAdvertiserDisplayName,
} from "./advertiser-identity";
import { getDb, getPool } from "./client";
import {
  authMembersTable,
  authAccountsTable,
  authInvitationsTable,
  authOrganizationsTable,
  authSessionsTable,
  authUsersTable,
  authVerificationsTable,
  authOauthAccessTokensTable,
  advertiserSearchAliasesTable,
  advertiserSearchAutoAddsTable,
  advertiserCompaniesTable,
  advertiserSearchQueryCompaniesTable,
  advertiserSearchQueriesTable,
  advertiserSearchQueryResultsTable,
  advertiserSearchQuerySourcesTable,
  alertDeliveriesTable,
  advertisersTable,
  adsTable,
  adObservationsTable,
  entitlementsTable,
  alertsTable,
  jobsTable,
  landingPageSnapshotsTable,
  notificationSettingsTable,
  savedAdsTable,
  swipeFileCollectionItemsTable,
  swipeFileCollectionsTable,
  subscriptionsTable,
  trackerNotificationsTable,
  trackedCompaniesTable,
} from "./schema/app";

type Source = SourceName;
type ClaimedJobRow = RowDataPacket & {
  id: string;
  queueName: string;
  payload: unknown;
  status: JobRecord["status"];
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};
type AdvertiserRecord = {
  id: string;
  source: Source;
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
};
type AdvertiserSearchSourceStatus = "pending" | "completed" | "failed";
type AdvertiserSearchAutoAddStatus = "active" | "completed" | "capacity_exhausted";
type PersistedAdInput = {
  source: Source;
  sourceAdId?: string;
  fingerprint: string;
  title?: string;
  body?: string;
  payer?: string;
  format?: string;
  callToAction?: string;
  destinationUrl?: string;
  mediaUrl?: string;
  status?: string;
  reactionCount?: number;
  commentCount?: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  metadata?: Record<string, unknown>;
};
type LandingPageCaptureCandidate = {
  adId: string;
  url: string;
};
export type ActiveAdStatusCheckAdvertiser = {
  advertiserId: string;
  source: Source;
  sourceAdvertiserId: string;
  activeAdsDue: number;
  lastStatusCheckedAtMs: number | null;
};
export type ActiveAdStatusCheckContext = {
  advertiserId: string;
  source: Source;
  sourceAdvertiserId: string;
  advertiserName: string;
  activeAds: Array<{
    id: string;
    sourceAdId: string;
    metadata: Record<string, unknown>;
  }>;
};

export type AdminAdListItem = {
  id: string;
  source: Source;
  sourceAdId: string | null;
  advertiserId: string;
  advertiserName: string;
  title: string | null;
  format: string | null;
  status: string | null;
  mediaUrl: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  createdAt: Date;
};

export type AdminAdvertiserListItem = {
  id: string;
  advertiserIds: string[];
  source: Source;
  sources: Source[];
  sourceProfiles: Array<{
    advertiserId: string;
    source: Source;
    sourceAdvertiserId: string;
    profileUrl: string | null;
  }>;
  sourceAdvertiserId: string;
  sourceAdvertiserIds: string[];
  canonicalName: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  totalAds: number;
  activeAds: number;
  lastIndexedAt: Date | null;
  createdAt: Date;
};

export type AdminAdvertiserListPage = {
  items: AdminAdvertiserListItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type AdminRefreshStats = {
  generatedAt: Date;
  ads: {
    total: number;
    active: number;
    inactive: number;
    withMedia: number;
    seenLast24h: number;
    createdLast24h: number;
  };
  advertisers: {
    total: number;
    neverIndexed: number;
    indexedLast24h: number;
    stale7d: number;
    oldestIndexedAt: Date | null;
    newestIndexedAt: Date | null;
  };
  activeStatusChecks: {
    dueAdvertisers: number;
    dueAds: number;
    oldestCheckedAtMs: number | null;
  };
  bySource: Array<{
    source: Source;
    advertisers: number;
    ads: number;
    activeAds: number;
    lastIndexedAt: Date | null;
    lastSeenAt: Date | null;
  }>;
  adStatuses: Array<{
    source: Source;
    status: string;
    total: number;
  }>;
  queues: Array<{
    queueName: string;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    lastUpdatedAt: Date | null;
  }>;
  recentFailures: RecentJobActivity[];
};

export type AdminCreativeCoverageStats = {
  generatedAt: Date;
  totalAds: number;
  variantAds: number;
  expectedCreatives: number;
  availableCreatives: number;
  materializedCreatives: number;
  storedCreatives: number;
  unavailableCreatives: number;
  missingSourceCreatives: number;
  storageFailedCreatives: number;
  pendingStorageCreatives: number;
  completeVariantAds: number;
  partialVariantAds: number;
  emptyVariantAds: number;
  landingPagePreviews: {
    adsWithLandingPage: number;
    withPreview: number;
    missingPreview: number;
    neverCaptured: number;
    capturedWithoutPreview: number;
    bySource: Array<{
      source: Source;
      adsWithLandingPage: number;
      withPreview: number;
      missingPreview: number;
      neverCaptured: number;
      capturedWithoutPreview: number;
    }>;
  };
  bySource: Array<{
    source: Source;
    totalAds: number;
    variantAds: number;
    expectedCreatives: number;
    availableCreatives: number;
    materializedCreatives: number;
    storedCreatives: number;
    unavailableCreatives: number;
    missingSourceCreatives: number;
    storageFailedCreatives: number;
    pendingStorageCreatives: number;
    completeVariantAds: number;
    partialVariantAds: number;
    emptyVariantAds: number;
  }>;
  worstAds: Array<{
    id: string;
    source: Source;
    advertiserName: string;
    title: string | null;
    expectedCreatives: number;
    availableCreatives: number;
    materializedCreatives: number;
    storedCreatives: number;
    unavailableCreatives: number;
    missingStoredCreatives: number;
    storageFailedCreatives: number;
    pendingStorageCreatives: number;
    primaryGap: "missing_source" | "storage_failed" | "pending_storage";
    lastSeenAt: Date;
  }>;
};

export type CreativeAssetRepairCandidate = {
  adId: string;
  advertiserId: string;
  source: Source;
  expectedCreatives: number;
  availableCreatives: number;
  storedCreatives: number;
  missingStoredCreatives: number;
  storageFailedCreatives: number;
  pendingStorageCreatives: number;
};

export type ActiveAdStatusCheckResultInput = {
  advertiserId: string;
  checkedAt: Date;
  checkedSourceAdIds: string[];
  inactiveSourceAdIds: string[];
  sourceStatuses: Array<{
    sourceAdId: string;
    status: string | null;
  }>;
};
const placeholderLandingPageTitle = "Placeholder landing page capture";

function cleanLandingPageTitle(value: string | null | undefined) {
  const title = value?.trim();

  return title && title !== placeholderLandingPageTitle ? title : null;
}

function truncateTextColumnValue(value: string | null | undefined, maxBytes = 60_000) {
  if (!value || Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value;
  }

  let low = 0;
  let high = value.length;

  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);

    if (Buffer.byteLength(value.slice(0, middle), "utf8") <= maxBytes) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return value.slice(0, low);
}

function normalizeLinkedInCompanySlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^company\//, "")
    .replace(/\/+$/, "")
    .replace(/[^a-z0-9-]/g, "");
}

function buildMetaAdsLibraryUrl(sourceAdvertiserId: string) {
  const params = new URLSearchParams({
    active_status: "all",
    ad_type: "all",
    country: "ALL",
    is_targeted_country: "false",
    media_type: "all",
    search_type: "page",
    view_all_page_id: sourceAdvertiserId,
  });

  return `https://www.facebook.com/ads/library/?${params.toString()}`;
}

function buildLinkedInAdLibraryUrl(sourceAdvertiserId: string) {
  const params = new URLSearchParams({
    accountOwner: normalizeLinkedInCompanySlug(sourceAdvertiserId),
  });

  return `https://www.linkedin.com/ad-library/search?${params.toString()}`;
}

function buildGoogleAdTransparencyUrl(sourceAdvertiserId: string) {
  return `https://adstransparency.google.com/advertiser/${encodeURIComponent(sourceAdvertiserId)}`;
}

function resolveAdLibraryUrl(input: {
  source: Source;
  sourceAdvertiserId: string | null;
  sourceAdId?: string | null;
  profileUrl?: string | null;
}) {
  if (input.source === "google" && input.sourceAdvertiserId && input.sourceAdId) {
    return `${buildGoogleAdTransparencyUrl(input.sourceAdvertiserId)}/creative/${encodeURIComponent(input.sourceAdId)}`;
  }

  if (input.source === "linkedin" && input.sourceAdId) {
    return `https://www.linkedin.com/ad-library/detail/${encodeURIComponent(input.sourceAdId)}`;
  }

  if (input.source === "facebook" && input.sourceAdId) {
    const params = new URLSearchParams({ id: input.sourceAdId });
    return `https://www.facebook.com/ads/library/?${params.toString()}`;
  }

  return resolveAdvertiserSourceUrl(input);
}

function resolveAdvertiserSourceUrl(input: {
  source: Source;
  sourceAdvertiserId: string | null;
  profileUrl?: string | null;
}) {
  if (input.source === "facebook" && input.sourceAdvertiserId) {
    return buildMetaAdsLibraryUrl(input.sourceAdvertiserId);
  }

  if (input.source === "linkedin" && input.sourceAdvertiserId) {
    return buildLinkedInAdLibraryUrl(input.sourceAdvertiserId);
  }

  if (input.source === "google" && input.sourceAdvertiserId) {
    return buildGoogleAdTransparencyUrl(input.sourceAdvertiserId);
  }

  return input.profileUrl ?? null;
}

function pickMetadataUrl(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? resolveCdnAssetUrl(value.replace(/\\u0026/gi, "&").replace(/\\([/?=&])/g, "$1")) : null;
}

function pickMetadataNumber(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pickMetadataString(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function parseMetadataInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getMetadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata as Record<string, unknown>;
}

function normalizeAdStatusValue(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (["active", "enabled", "running"].includes(normalized)) {
    return "active";
  }

  if (["inactive", "disabled", "ended", "expired", "not_active", "not active"].includes(normalized)) {
    return "inactive";
  }

  return normalized;
}

function parseAdStatusDate(value: unknown): Date | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const timestamp = record["1"] ?? record.seconds ?? record.timestamp;

    if (timestamp !== undefined) {
      return parseAdStatusDate(timestamp);
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return coerceDate(value > 10_000_000_000 ? value : value * 1000);
  }

  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    const numeric = Number(trimmed);

    if (Number.isFinite(numeric) && /^[0-9]+(?:\.[0-9]+)?$/.test(trimmed)) {
      return parseAdStatusDate(numeric);
    }

    return coerceDate(trimmed);
  }

  return null;
}

function deriveAdStatusFromMetadata(source: Source, metadata: unknown, now = new Date()) {
  const metadataRecord = getMetadataRecord(metadata);
  const checkedSourceStatus = normalizeAdStatusValue(metadataRecord?.activeStatusLastSourceStatus);

  if (checkedSourceStatus === "inactive" || checkedSourceStatus === "removed" || checkedSourceStatus === "completed") {
    return "inactive";
  }

  if (cleanMetadataText(metadataRecord?.activeStatusStoppedCheckingAt)) {
    return "inactive";
  }

  const rawPayload = getMetadataRecord(metadataRecord?.rawPayload);

  if (!rawPayload) {
    return null;
  }

  if (source === "google") {
    const activeMarker = getNestedMetadataValue(rawPayload, ["3", "5"]) ?? rawPayload["16"];

    if (activeMarker === true || activeMarker === "true") {
      return "active";
    }

    if (activeMarker === false || activeMarker === "false") {
      return "inactive";
    }
  }

  const rawStatus = normalizeAdStatusValue(rawPayload.status ?? rawPayload.ad_status ?? rawPayload.delivery_status);

  if (rawStatus === "active" || rawStatus === "inactive") {
    return rawStatus;
  }

  const isActive = rawPayload.is_active ?? rawPayload.isActive;

  if (isActive === true || isActive === "true") {
    return "active";
  }

  if (isActive === false || isActive === "false") {
    return "inactive";
  }

  const endDate = parseAdStatusDate(
    rawPayload.end_date ??
      rawPayload.endDate ??
      rawPayload.ad_delivery_stop_time ??
      rawPayload.delivery_stop_time,
  );

  if (endDate) {
    return endDate.getTime() >= now.getTime() ? "active" : "inactive";
  }

  return null;
}

function resolveReadAdStatus(source: Source, storedStatus: string | null, metadata: unknown, now = new Date()) {
  return deriveAdStatusFromMetadata(source, metadata, now) ?? normalizeAdStatusValue(storedStatus) ?? storedStatus;
}

function resolvePersistedAdStatus(input: {
  source: Source;
  nextStatus: string | undefined;
  existingStatus: string | null;
  metadata: unknown;
}) {
  return (
    normalizeAdStatusValue(input.nextStatus) ??
    deriveAdStatusFromMetadata(input.source, input.metadata) ??
    normalizeAdStatusValue(input.existingStatus) ??
    input.existingStatus
  );
}

function getMetaCollation(metadata: unknown) {
  const rawPayload = getMetadataRecord(getMetadataRecord(metadata)?.rawPayload);
  const collationId = rawPayload?.collation_id;
  const collationCount = parseMetadataInteger(rawPayload?.collation_count);

  if (typeof collationId !== "string" || !collationId.trim()) {
    return null;
  }

  return {
    id: collationId.trim(),
    count: Math.max(1, collationCount ?? 1),
  };
}

function getMetaCreativeAssetCount(metadata: unknown) {
  const metadataRecord = getMetadataRecord(metadata);
  const rawPayload = getMetadataRecord(metadataRecord?.rawPayload);
  const snapshot = getNestedMetadataRecord(rawPayload, "snapshot");

  return Math.max(
    getNestedMetadataArray(metadataRecord, "metaCreativeAssets").length,
    getNestedMetadataArray(snapshot, "cards").length,
    getNestedMetadataArray(snapshot, "videos").length,
    getNestedMetadataArray(snapshot, "extra_videos").length,
    getNestedMetadataArray(snapshot, "images").length,
    getNestedMetadataArray(snapshot, "extra_images").length,
    1,
  );
}

function getRawMetaCreativeCandidateCount(metadata: unknown) {
  const metadataRecord = getMetadataRecord(metadata);
  const rawPayload = getMetadataRecord(metadataRecord?.rawPayload);
  const snapshot = getNestedMetadataRecord(rawPayload, "snapshot");

  if (!snapshot) {
    return 0;
  }

  const cards = getNestedMetadataArray(snapshot, "cards");

  if (cards.length) {
    return cards.length;
  }

  return (
    getNestedMetadataArray(snapshot, "videos").length +
    getNestedMetadataArray(snapshot, "extra_videos").length +
    getNestedMetadataArray(snapshot, "images").length +
    getNestedMetadataArray(snapshot, "extra_images").length
  );
}

function getMetaVariationCount(metadata: unknown) {
  return Math.max(getMetaCollation(metadata)?.count ?? 1, getMetaCreativeAssetCount(metadata));
}

function hasMetadataText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function extractGoogleYoutubeVideoIdFromThumbnailUrl(value: unknown) {
  return typeof value === "string" ? value.match(/\/vi\/([^/?#]+)\//i)?.[1] ?? null : null;
}

function cleanGoogleYoutubeVideoId(value: unknown) {
  const videoId = cleanMetadataText(value);

  return videoId && /^[a-z0-9_-]{6,}$/i.test(videoId) ? videoId : null;
}

function getGoogleYoutubeVideoIdFromRecord(record: Record<string, unknown> | null) {
  if (!record) {
    return null;
  }

  return (
    cleanGoogleYoutubeVideoId(record.googleYoutubeVideoId) ??
    extractGoogleYoutubeVideoIdFromThumbnailUrl(record.sourceThumbnailUrl) ??
    extractGoogleYoutubeVideoIdFromThumbnailUrl(record.sourceMediaUrl)
  );
}

export function buildGoogleYoutubeEmbedUrl(videoId: string | null | undefined) {
  const cleanVideoId = cleanGoogleYoutubeVideoId(videoId);

  return cleanVideoId
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(cleanVideoId)}?rel=0&modestbranding=1&playsinline=1`
    : null;
}

export function getGoogleYoutubeEmbedUrlFromMetadata(metadata: unknown) {
  const metadataRecord = getMetadataRecord(metadata);
  const topLevelVideoId = getGoogleYoutubeVideoIdFromRecord(metadataRecord);
  const nestedVideoId = getNestedMetadataArray(metadataRecord, "googleCreativeAssets")
    .map((asset) => getGoogleYoutubeVideoIdFromRecord(getMetadataRecord(asset)))
    .find((videoId): videoId is string => Boolean(videoId));

  return buildGoogleYoutubeEmbedUrl(topLevelVideoId ?? nestedVideoId);
}

function hasStoredCreativeAssetReference(asset: Record<string, unknown> | null) {
  return Boolean(
    asset &&
      (hasMetadataText(asset.assetStoredUrl) ||
        hasMetadataText(asset.assetThumbnailStoredUrl) ||
        hasMetadataText(asset.assetVideoStoredUrl)),
  );
}

function hasAnyCreativeAssetReference(asset: Record<string, unknown> | null) {
  return Boolean(
    asset &&
      (hasStoredCreativeAssetReference(asset) ||
        hasMetadataText(asset.sourceMediaUrl) ||
        hasMetadataText(asset.sourceThumbnailUrl) ||
        hasMetadataText(asset.sourceVideoUrl) ||
        hasMetadataText(asset.previewUrl)),
  );
}

function countStoredCreativeAssets(assets: unknown[]) {
  return assets.filter((asset) => hasStoredCreativeAssetReference(getMetadataRecord(asset))).length;
}

function countReferencedCreativeAssets(assets: unknown[]) {
  return assets.filter((asset) => hasAnyCreativeAssetReference(getMetadataRecord(asset))).length;
}

function countCreativeAssetStorageErrors(assets: unknown[]) {
  return assets.filter((asset) => {
    const record = getMetadataRecord(asset);

    return Boolean(
      record &&
        (hasMetadataText(record.assetStorageError) ||
          hasMetadataText(record.assetThumbnailStorageError) ||
          hasMetadataText(record.assetVideoStorageError)),
    );
  }).length;
}

function hasGoogleVideoReference(asset: Record<string, unknown> | null) {
  return Boolean(
    asset &&
      (hasMetadataText(asset.assetVideoStoredUrl) ||
        hasMetadataText(asset.sourceVideoUrl) ||
        hasMetadataText(asset.googleYoutubeVideoId) ||
        extractGoogleYoutubeVideoIdFromThumbnailUrl(asset.sourceThumbnailUrl) ||
        extractGoogleYoutubeVideoIdFromThumbnailUrl(asset.sourceMediaUrl)),
  );
}

function hasStoredGoogleVideoReference(asset: Record<string, unknown> | null) {
  return Boolean(asset && hasMetadataText(asset.assetVideoStoredUrl));
}

function countGoogleVideoReferences(assets: unknown[]) {
  return assets.filter((asset) => hasGoogleVideoReference(getMetadataRecord(asset))).length;
}

function countStoredGoogleVideoReferences(assets: unknown[]) {
  return assets.filter((asset) => hasStoredGoogleVideoReference(getMetadataRecord(asset))).length;
}

function getTopLevelStoredCreativeCount(metadata: unknown, mediaUrl: string | null) {
  const metadataRecord = getMetadataRecord(metadata);

  return mediaUrl ||
    hasMetadataText(metadataRecord?.assetStoredUrl) ||
    hasMetadataText(metadataRecord?.assetThumbnailStoredUrl) ||
    hasMetadataText(metadataRecord?.assetVideoStoredUrl)
    ? 1
    : 0;
}

function getTopLevelReferencedCreativeCount(metadata: unknown, mediaUrl: string | null) {
  const metadataRecord = getMetadataRecord(metadata);

  return mediaUrl ||
    hasMetadataText(metadataRecord?.sourceMediaUrl) ||
    hasMetadataText(metadataRecord?.sourceThumbnailUrl) ||
    hasMetadataText(metadataRecord?.sourceVideoUrl) ||
    getTopLevelStoredCreativeCount(metadata, mediaUrl)
    ? 1
    : 0;
}

function getCreativeCoverageForAd(input: {
  source: Source;
  format: string | null;
  mediaUrl: string | null;
  metadata: unknown;
}) {
  const metadataRecord = getMetadataRecord(input.metadata);
  const topLevelStored = getTopLevelStoredCreativeCount(input.metadata, input.mediaUrl);
  const topLevelReferenced = getTopLevelReferencedCreativeCount(input.metadata, input.mediaUrl);
  let expectedCreatives = 1;
  let availableCreatives = topLevelReferenced;
  let storedCreatives = topLevelStored;
  let storageErrorCreatives = 0;

  if (input.source === "facebook") {
    const assets = getNestedMetadataArray(metadataRecord, "metaCreativeAssets");
    expectedCreatives = Math.max(
      getMetaCollation(input.metadata)?.count ?? 0,
      getRawMetaCreativeCandidateCount(input.metadata),
      getMetaCreativeAssets(input.metadata).length,
      topLevelReferenced,
      1,
    );
    availableCreatives = Math.max(countReferencedCreativeAssets(assets), getMetaCreativeAssets(input.metadata).length, topLevelReferenced);
    storedCreatives = Math.max(countStoredCreativeAssets(assets), topLevelStored);
    storageErrorCreatives = countCreativeAssetStorageErrors(assets);
  } else if (input.source === "google") {
    const assets = getNestedMetadataArray(metadataRecord, "googleCreativeAssets");
    const isGoogleVideo =
      getStoredAdFormatKey(input.format) === "video" ||
      cleanMetadataScalarText(metadataRecord?.googleFormatCode) === "3" ||
      hasGoogleVideoReference(metadataRecord) ||
      assets.some((asset) => hasGoogleVideoReference(getMetadataRecord(asset)));
    expectedCreatives = Math.max(
      parseMetadataInteger(metadataRecord?.googleCreativeVariationTotal) ?? 0,
      getGoogleCreativeAssets(input.metadata).length,
      topLevelReferenced,
      1,
    );
    availableCreatives = isGoogleVideo
      ? Math.max(countGoogleVideoReferences(assets), hasGoogleVideoReference(metadataRecord) ? 1 : 0, topLevelReferenced)
      : Math.max(countReferencedCreativeAssets(assets), getGoogleCreativeAssets(input.metadata).length, topLevelReferenced);
    storedCreatives = isGoogleVideo
      ? Math.max(countStoredGoogleVideoReferences(assets), hasStoredGoogleVideoReference(metadataRecord) ? 1 : 0)
      : Math.max(countStoredCreativeAssets(assets), topLevelStored);
    storageErrorCreatives = countCreativeAssetStorageErrors(assets);
  } else if (input.source === "linkedin") {
    const slides = getNestedMetadataArray(metadataRecord, "linkedInDocumentSlides");
    const carouselCards = getNestedMetadataArray(metadataRecord, "linkedInCarouselCards");
    const linkedInAssets = [...carouselCards, ...slides];
    const linkedInDetails = getLinkedInAdDetails(input.metadata, input.format);
    expectedCreatives = Math.max(linkedInDetails?.carouselItems ?? 0, linkedInAssets.length, getLinkedInCreativeAssets(input.metadata).length, topLevelReferenced, 1);
    availableCreatives = Math.max(countReferencedCreativeAssets(linkedInAssets), getLinkedInCreativeAssets(input.metadata).length, topLevelReferenced);
    storedCreatives = Math.max(countStoredCreativeAssets(linkedInAssets), topLevelStored);
    storageErrorCreatives = countCreativeAssetStorageErrors(linkedInAssets);
  }

  const cappedAvailableCreatives = Math.min(expectedCreatives, Math.max(availableCreatives, storedCreatives));
  const cappedStoredCreatives = Math.min(cappedAvailableCreatives, storedCreatives);
  const missingStoredCreatives = Math.max(0, cappedAvailableCreatives - cappedStoredCreatives);
  const storageFailedCreatives = Math.min(missingStoredCreatives, storageErrorCreatives);
  const pendingStorageCreatives = Math.max(0, missingStoredCreatives - storageFailedCreatives);
  const unavailableCreatives = Math.max(0, expectedCreatives - cappedAvailableCreatives);

  return {
    expectedCreatives,
    availableCreatives: cappedAvailableCreatives,
    materializedCreatives: cappedAvailableCreatives,
    storedCreatives: cappedStoredCreatives,
    unavailableCreatives,
    missingSourceCreatives: unavailableCreatives,
    missingStoredCreatives,
    storageFailedCreatives,
    pendingStorageCreatives,
    primaryGap: missingStoredCreatives
      ? storageFailedCreatives
        ? "storage_failed"
        : "pending_storage"
      : unavailableCreatives
        ? "missing_source"
        : "pending_storage",
  } satisfies {
    expectedCreatives: number;
    availableCreatives: number;
    materializedCreatives: number;
    storedCreatives: number;
    unavailableCreatives: number;
    missingSourceCreatives: number;
    missingStoredCreatives: number;
    storageFailedCreatives: number;
    pendingStorageCreatives: number;
    primaryGap: "missing_source" | "storage_failed" | "pending_storage";
  };
}

function cleanMetadataText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cleanMetadataScalarText(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

const windows1252ByteByCharacter = new Map<string, number>([
  ["€", 0x80],
  ["‚", 0x82],
  ["ƒ", 0x83],
  ["„", 0x84],
  ["…", 0x85],
  ["†", 0x86],
  ["‡", 0x87],
  ["ˆ", 0x88],
  ["‰", 0x89],
  ["Š", 0x8a],
  ["‹", 0x8b],
  ["Œ", 0x8c],
  ["Ž", 0x8e],
  ["‘", 0x91],
  ["’", 0x92],
  ["“", 0x93],
  ["”", 0x94],
  ["•", 0x95],
  ["–", 0x96],
  ["—", 0x97],
  ["˜", 0x98],
  ["™", 0x99],
  ["š", 0x9a],
  ["›", 0x9b],
  ["œ", 0x9c],
  ["ž", 0x9e],
  ["Ÿ", 0x9f],
]);

function countMojibakeMarkers(value: string) {
  return (value.match(/[ÂÃâðïà]/g) ?? []).length;
}

function decodeWindows1252Utf8Mojibake(value: string) {
  if (!/[ÂÃâðïà]/.test(value)) {
    return null;
  }

  const bytes: number[] = [];

  for (const character of value) {
    const codePoint = character.codePointAt(0);

    if (codePoint === undefined) {
      return null;
    }

    if (codePoint <= 0xff) {
      bytes.push(codePoint);
      continue;
    }

    const mappedByte = windows1252ByteByCharacter.get(character);

    if (mappedByte === undefined) {
      return null;
    }

    bytes.push(mappedByte);
  }

  const decoded = Buffer.from(bytes).toString("utf8");

  if (!decoded || decoded.includes("�") || countMojibakeMarkers(decoded) >= countMojibakeMarkers(value)) {
    return null;
  }

  return decoded;
}

function repairMojibakeText(value: string | null) {
  const decoded = value ? decodeWindows1252Utf8Mojibake(value) ?? value : value;

  return decoded
    ?.replace(/â†’/g, "→")
    ?.replace(/âœ…/g, "✅")
    .replace(/â„¹ï¸/g, "ℹ️")
    .replace(/â€”/g, "—")
    .replace(/â€“/g, "–")
    .replace(/â€˜/g, "'")
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€�/g, '"')
    .replace(/â€¦/g, "…")
    .replace(/Â /g, " ")
    .replace(/Â/g, "") ?? null;
}

function cleanMetaMetadataText(value: unknown) {
  return repairMojibakeText(cleanMetadataText(value));
}

function cleanDisplayText(value: string | null) {
  return repairMojibakeText(value)?.trim() || null;
}

function isMetaPlaceholderDestinationUrl(source: Source, value: string | null) {
  if (source !== "facebook" || !value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.hostname.toLowerCase() === "fb.me";
  } catch {
    return false;
  }
}

function cleanAdDestinationUrl(source: Source, value: string | null) {
  return isMetaPlaceholderDestinationUrl(source, value) ? null : value;
}

function getAdTranscript(metadata: unknown) {
  return cleanMetadataText(getMetadataRecord(metadata)?.transcript);
}

function countLanguageMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((sum, pattern) => sum + (text.match(pattern)?.length ?? 0), 0);
}

function getLatinLanguageScores(text: string) {
  return {
    French:
      countLanguageMatches(text, [
        /[àâêëîïôûùÿœ]/giu,
        /\b(?:aux|avec|ce|cette|des|dans|du|faites|générative|les|meilleurs|nouveau|pour|problèmes|rapport|réalisez|résoudre|sur|une|vous|votre)\b/giu,
        /\bd[’'](?:entreprises|un|une)\b/giu,
        /\bl[’'](?:ia|audit|entreprise)\b/giu,
      ]) * 2,
    Portuguese:
      countLanguageMatches(text, [
        /[ãõ]/giu,
        /\b\w*ções\b/giu,
        /\b(?:acompanhando|aplicações|aprenda|auditoria|com|como|conta|corrigir|custos|dados|descubra|desempenho|está|estão|faça|gerar|gratuita|gratuitos|líderes|mensais|não|otimize|reduza|relatório|resultados|ritmo|serviços|sua|suas|uma|você|vocês)\b/giu,
      ]) * 2 +
      countLanguageMatches(text, [/[ç]/giu]),
    Spanish:
      countLanguageMatches(text, [
        /[ñ¿¡]/giu,
        /\b(?:ahora|auditoría|con|el|encontrar|gratis|haz|la|las|los|mejor|mejores|nuevo|nueva|para|posicionar|quieres|solucionar|técnico|técnica)\b/giu,
      ]) * 2,
  };
}

export function detectDisplayLanguage(value: string | null) {
  const text = value?.trim();

  if (!text) {
    return null;
  }

  if (/[\u0900-\u097f]/u.test(text)) {
    return "Hindi";
  }

  if (/[\u3040-\u30ff]/u.test(text)) {
    return "Japanese";
  }

  if (/[\u0400-\u04ff]/u.test(text)) {
    return "Bulgarian";
  }

  const latinScores = getLatinLanguageScores(text.toLowerCase());
  const detectedLatinLanguage = (Object.entries(latinScores) as Array<[keyof typeof latinScores, number]>)
    .filter(([, score]) => score > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];

  if (detectedLatinLanguage) {
    return detectedLatinLanguage;
  }

  return "English";
}

function getNestedMetadataRecord(record: Record<string, unknown> | null, key: string) {
  return getMetadataRecord(record?.[key]);
}

function getNestedMetadataArray(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1_000 ? 1 : 0,
    notation: value >= 10_000 ? "compact" : "standard",
  }).format(value);
}

function formatMoney(value: number, currency: string | null) {
  if (currency && /^[A-Z]{3}$/.test(currency)) {
    return new Intl.NumberFormat("en-US", {
      currency,
      maximumFractionDigits: 0,
      style: "currency",
    }).format(value);
  }

  return `$${formatCompactNumber(value)}`;
}

type BoundedNumbers = {
  lower: number | null;
  upper: number | null;
};

function extractBoundedNumbers(value: unknown): BoundedNumbers | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { lower: value, upper: null };
  }

  if (typeof value === "string") {
    const matches = [...value.matchAll(/\d[\d,]*(?:\.\d+)?\s*[kKmM]?/g)];

    if (!matches.length) {
      return null;
    }

    const numbers = matches
      .map((match) => {
        const token = match[0].trim();
        const multiplier = /m$/i.test(token) ? 1_000_000 : /k$/i.test(token) ? 1_000 : 1;
        const parsed = Number(token.replace(/[kKmM]$/g, "").replace(/,/g, "").trim());

        return Number.isFinite(parsed) ? parsed * multiplier : null;
      })
      .filter((match): match is number => match !== null);

    if (!numbers.length) {
      return null;
    }

    return {
      lower: numbers[0],
      upper: numbers[1] ?? null,
    };
  }

  const record = getMetadataRecord(value);

  if (!record) {
    return null;
  }

  const lower =
    parseMetadataInteger(record.lower_bound) ??
    parseMetadataInteger(record.lowerBound) ??
    parseMetadataInteger(record.min) ??
    parseMetadataInteger(record.minimum) ??
    parseMetadataInteger(record.amount);
  const upper =
    parseMetadataInteger(record.upper_bound) ??
    parseMetadataInteger(record.upperBound) ??
    parseMetadataInteger(record.max) ??
    parseMetadataInteger(record.maximum);

  if (lower === null && upper === null) {
    for (const child of Object.values(record)) {
      const nested: BoundedNumbers | null = extractBoundedNumbers(child);

      if (nested) {
        return nested;
      }
    }

    return null;
  }

  return {
    lower: lower ?? upper,
    upper,
  };
}

function formatBoundedMetric(value: unknown, options?: { currency?: string | null }) {
  const bounds = extractBoundedNumbers(value);

  if (!bounds?.lower) {
    return null;
  }

  const format = options?.currency
    ? (amount: number) => formatMoney(amount, options.currency ?? null)
    : formatCompactNumber;

  if (bounds.upper && bounds.upper !== bounds.lower) {
    return `${format(bounds.lower)} - ${format(bounds.upper)}`;
  }

  return format(bounds.lower);
}

function formatFirstBoundedMetric(values: unknown[], options?: { currency?: string | null }) {
  for (const value of values) {
    const formatted = formatBoundedMetric(value, options);

    if (formatted) {
      return formatted;
    }
  }

  return null;
}

function pickFirstBoundedMetricLower(values: unknown[]) {
  for (const value of values) {
    const bounds = extractBoundedNumbers(value);
    const lower = bounds?.lower ?? bounds?.upper ?? null;

    if (lower && lower > 0) {
      return lower;
    }
  }

  return null;
}

function getNestedMetadataValue(record: Record<string, unknown> | null, path: string[]) {
  let value: unknown = record;

  for (const key of path) {
    const nested = getMetadataRecord(value);

    if (!nested) {
      return undefined;
    }

    value = nested[key];
  }

  return value;
}

function collectMetaCountryValues(value: unknown, countries: Set<string>) {
  const text = cleanMetadataScalarText(value);

  if (text) {
    text
      .split(/[,;]/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((entry) => countries.add(entry.toUpperCase()));
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectMetaCountryValues(item, countries);
    }

    return;
  }

  const record = getMetadataRecord(value);

  if (!record) {
    return;
  }

  [
    "country",
    "country_code",
    "countryCode",
    "country_iso_code",
    "countryIsoCode",
    "country_name",
    "countryName",
    "reached_country",
    "targeted_country",
  ].forEach((key) => collectMetaCountryValues(record[key], countries));
}

function getMetaTargetedCountries(metadataRecord: Record<string, unknown> | null, rawPayload: Record<string, unknown>) {
  const countries = new Set<string>();
  const values = [
    metadataRecord?.targetedCountries,
    rawPayload.targeted_or_reached_countries,
    rawPayload.targeted_countries,
    rawPayload.reached_countries,
    rawPayload.eu_targeted_countries,
    rawPayload.eu_reached_countries,
    rawPayload.target_locations,
    rawPayload.age_country_gender_reach_breakdown,
    rawPayload.eu_age_country_gender_reach_breakdown,
    getNestedMetadataValue(rawPayload, ["data_reach", "targeted_or_reached_countries"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "target_locations"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "aaa_info", "targeted_or_reached_countries"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "aaa_info", "target_locations"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "aaa_info", "age_country_gender_reach_breakdown"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "transparency_by_location", "eu_transparency", "location_audience"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "transparency_by_location", "eu_transparency", "age_country_gender_reach_breakdown"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "transparency_by_location", "uk_transparency", "location_audience"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "transparency_by_location", "uk_transparency", "age_country_gender_reach_breakdown"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "transparency_by_location", "br_transparency", "location_audience"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "transparency_by_location", "br_transparency", "age_country_gender_reach_breakdown"]),
    getNestedMetadataValue(rawPayload, ["eu_transparency", "targeted_or_reached_countries"]),
    getNestedMetadataValue(rawPayload, ["eu_transparency", "target_locations"]),
    getNestedMetadataValue(rawPayload, ["eu_transparency", "age_country_gender_reach_breakdown"]),
  ];

  values.forEach((value) => collectMetaCountryValues(value, countries));

  return [...countries].filter(Boolean).sort();
}

function getMetaReachCandidates(rawPayload: Record<string, unknown>) {
  return [
    rawPayload.reach_estimate,
    rawPayload.eu_total_reach,
    rawPayload.euTotalReach,
    rawPayload.total_eu_reach,
    rawPayload.totalEuReach,
    rawPayload.total_reach,
    rawPayload.totalReach,
    getNestedMetadataValue(rawPayload, ["data_reach", "eu_total_reach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "euTotalReach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "total_reach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "totalReach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "aaa_info", "eu_total_reach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "aaa_info", "euTotalReach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "aaa_info", "total_eu_reach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "aaa_info", "total_reach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "aaa_info", "totalReach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "transparency_by_location", "eu_transparency", "total_reach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "transparency_by_location", "eu_transparency", "totalReach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "transparency_by_location", "uk_transparency", "total_reach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "transparency_by_location", "uk_transparency", "totalReach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "transparency_by_location", "br_transparency", "total_reach"]),
    getNestedMetadataValue(rawPayload, ["data_reach", "transparency_by_location", "br_transparency", "totalReach"]),
    getNestedMetadataValue(rawPayload, ["eu_transparency", "eu_total_reach"]),
    getNestedMetadataValue(rawPayload, ["eu_transparency", "euTotalReach"]),
    getNestedMetadataValue(rawPayload, ["eu_transparency", "total_reach"]),
  ];
}

function formatMetaEstimatedReach(rawPayload: Record<string, unknown>) {
  return formatFirstBoundedMetric(getMetaReachCandidates(rawPayload));
}

function getMetaEstimatedReachValue(rawPayload: Record<string, unknown>) {
  return pickFirstBoundedMetricLower(getMetaReachCandidates(rawPayload));
}

function parseDurationSeconds(value: unknown) {
  const seconds = parseMetadataInteger(value);

  if (seconds === null || seconds <= 0) {
    return null;
  }

  return seconds > 600 ? Math.round(seconds / 1_000) : seconds;
}

function pickMetaVideoDurationSeconds(metadataRecord: Record<string, unknown>, rawPayload: Record<string, unknown>, snapshot: Record<string, unknown> | null) {
  const directDuration =
    parseDurationSeconds(metadataRecord.assetVideoDurationSeconds) ??
    parseDurationSeconds(metadataRecord.assetVideoDuration) ??
    parseDurationSeconds(metadataRecord.assetDurationSeconds) ??
    parseDurationSeconds(metadataRecord.assetDuration) ??
    parseDurationSeconds(rawPayload.video_duration) ??
    parseDurationSeconds(snapshot?.video_duration);

  if (directDuration) {
    return directDuration;
  }

  const videos = [
    ...getNestedMetadataArray(snapshot, "videos"),
    ...getNestedMetadataArray(snapshot, "extra_videos"),
    ...getNestedMetadataArray(snapshot, "cards"),
  ];

  for (const video of videos) {
    const record = getMetadataRecord(video);
    const duration =
      parseDurationSeconds(record?.duration_seconds) ??
      parseDurationSeconds(record?.duration_ms) ??
      parseDurationSeconds(record?.duration);

    if (duration) {
      return duration;
    }
  }

  return null;
}

function pickDurationFromUrl(value: unknown) {
  const url = cleanMetadataText(value);

  if (!url) {
    return null;
  }

  const decodedUrl = decodeURIComponent(url);
  const match = decodedUrl.match(/(?:^|[_\-/])(\d{1,3})s(?:[_\-.]|$)/i) ?? decodedUrl.match(/(\d{1,3})\s*sec/i);

  return match?.[1] ? parseDurationSeconds(match[1]) : null;
}

function getStoredAdFormatKey(format: string | null) {
  const value = (format ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (value.includes("carousel") || value.includes("carrusel") || value.includes("carrossel")) {
    return "carousel";
  }

  if (value.includes("message") || value.includes("inmail") || value.includes("mensaje")) {
    return "message";
  }

  if (value.includes("follow")) {
    return "follow";
  }

  if (value.includes("document") || value.includes("documento") || value.includes("native-document")) {
    return "document";
  }

  if (value.includes("job") || value.includes("empleo")) {
    return "job";
  }

  if (value.includes("video") || value.includes("vdeo")) {
    return "video";
  }

  if (value.includes("text") || value.includes("texto") || value.includes("texte") || value.includes("tekst")) {
    return "text";
  }

  if (value.includes("image") || value.includes("imagen") || value.includes("imagem")) {
    return "image";
  }

  return "unknown";
}

function hasMetaVideoReference(record: Record<string, unknown> | null) {
  return Boolean(
    cleanMetadataText(record?.video_hd_url) ||
      cleanMetadataText(record?.video_sd_url) ||
      cleanMetadataText(record?.watermarked_video_hd_url) ||
      cleanMetadataText(record?.watermarked_video_sd_url) ||
      cleanMetadataText(record?.sourceVideoUrl) ||
      cleanMetadataText(record?.assetVideoStoredUrl),
  );
}

function hasMetaStillImageReference(record: Record<string, unknown> | null) {
  return Boolean(
    cleanMetadataText(record?.original_image_url) ||
      cleanMetadataText(record?.resized_image_url) ||
      cleanMetadataText(record?.watermarked_resized_image_url) ||
      cleanMetadataText(record?.sourceMediaUrl) ||
      cleanMetadataText(record?.assetStoredUrl),
  );
}

function getResolvedMetaAdFormat(metadata: unknown, format: string | null) {
  const metadataRecord = getMetadataRecord(metadata);
  const rawPayload = getMetadataRecord(metadataRecord?.rawPayload);
  const snapshot = getNestedMetadataRecord(rawPayload, "snapshot");
  const cards = getNestedMetadataArray(snapshot, "cards")
    .map((card) => getMetadataRecord(card))
    .filter((card): card is Record<string, unknown> => Boolean(card));
  const topLevelVideos = [...getNestedMetadataArray(snapshot, "videos"), ...getNestedMetadataArray(snapshot, "extra_videos")];
  const hasTopLevelVideo = Boolean(
    cleanMetadataText(metadataRecord?.sourceVideoUrl) ||
      cleanMetadataText(metadataRecord?.assetVideoStoredUrl) ||
      topLevelVideos.length,
  );
  const hasVideoOnlyCards = cards.length > 0 && cards.every((card) => hasMetaVideoReference(card) && !hasMetaStillImageReference(card));

  if ((hasTopLevelVideo && !cards.length) || hasVideoOnlyCards) {
    return "video";
  }

  return format;
}

function getLinkedInAdDetails(metadata: unknown, format: string | null): LinkedInAdDetailFields | null {
  const metadataRecord = getMetadataRecord(metadata);

  if (!metadataRecord) {
    return null;
  }

  const sourceVideoUrl = cleanMetadataText(metadataRecord.sourceVideoUrl);
  const videoStoredUrl = cleanMetadataText(metadataRecord.assetVideoStoredUrl);
  const hasVideo = Boolean(sourceVideoUrl || videoStoredUrl);
  const formatKey = getStoredAdFormatKey(format);
  const creativeType = cleanMetadataText(metadataRecord.creativeType)?.toLowerCase() ?? "";
  const isMessageAd = formatKey === "message";
  const isTextAd = formatKey === "text";
  const isFollowAd = formatKey === "follow" || creativeType.includes("follow");
  const isDocumentAd = formatKey === "document" || creativeType.includes("document");
  const isCarouselAd = formatKey === "carousel" || creativeType.includes("carousel");
  const carouselCardsCount = getNestedMetadataArray(metadataRecord, "linkedInCarouselCards").length || null;
  const documentSlidesCount = getNestedMetadataArray(metadataRecord, "linkedInDocumentSlides").length || null;
  const carouselItems =
    carouselCardsCount ??
    parseMetadataInteger(metadataRecord.linkedInDocumentPreviewPageCount) ??
    parseMetadataInteger(metadataRecord.carouselItems) ??
    parseMetadataInteger(metadataRecord.carouselItemCount) ??
    parseMetadataInteger(metadataRecord.carouselSlides) ??
    documentSlidesCount ??
    (isCarouselAd ? 4 : null);
  const duration =
    parseDurationSeconds(metadataRecord.assetVideoDurationSeconds) ??
    parseDurationSeconds(metadataRecord.assetVideoDuration) ??
    pickDurationFromUrl(sourceVideoUrl) ??
    pickDurationFromUrl(videoStoredUrl);

  return {
    adType: isMessageAd ? "Message Ad" : isTextAd ? "Text Ad" : isFollowAd ? "Follow Company Ad" : isDocumentAd ? "Document Ad" : formatKey === "job" ? "Job Ad" : formatKey === "video" || hasVideo ? "Video Ad" : isCarouselAd ? "Carousel Ad" : "Single Image Ad",
    carouselItems,
    creativeDurationSeconds: duration,
    format: isMessageAd ? "Message" : isTextAd ? "Text" : isFollowAd ? "Follow Company" : isDocumentAd ? "Document" : formatKey === "job" ? "Job" : isCarouselAd ? "Carousel" : "Single",
    language: "English",
    mediaType: isMessageAd || isTextAd || isFollowAd || formatKey === "job" ? "Text" : isDocumentAd ? "Document" : hasVideo ? "Video" : "Image",
    totalImpressions: cleanMetadataText(metadataRecord.totalImpressions),
    countryImpressions: getNestedMetadataArray(metadataRecord, "countryImpressions")
      .map((country) => getMetadataRecord(country))
      .map((country) => ({
        country: cleanMetadataText(country?.country),
        percentage: cleanMetadataText(country?.percentage),
      }))
      .filter((country): country is { country: string; percentage: string } => Boolean(country.country && country.percentage)),
  };
}

function getGoogleAdDetails(metadata: unknown, format: string | null): GoogleAdDetailFields | null {
  const metadataRecord = getMetadataRecord(metadata);

  if (!metadataRecord) {
    return null;
  }

  const rawPayload = getMetadataRecord(metadataRecord.rawPayload);
  const sourceVideoUrl = cleanMetadataText(metadataRecord.sourceVideoUrl);
  const videoStoredUrl = cleanMetadataText(metadataRecord.assetVideoStoredUrl);
  const formatCode = cleanMetadataScalarText(metadataRecord.googleFormatCode) ?? (rawPayload ? cleanMetadataScalarText(rawPayload["4"]) : null);
  const topicCode = cleanMetadataScalarText(metadataRecord.topicCode) ?? (rawPayload ? cleanMetadataScalarText(rawPayload["13"]) : null);
  const formatKey = getStoredAdFormatKey(format);
  const archivedPreview = getGoogleArchivedImagePreview(metadata);
  const hasImage =
    Boolean(
      archivedPreview?.url ||
      cleanMetadataText(metadataRecord.sourceMediaUrl) ||
      cleanMetadataText(metadataRecord.sourceThumbnailUrl) ||
      cleanMetadataText(metadataRecord.assetStoredUrl),
    );
  const isVideo = Boolean(sourceVideoUrl || videoStoredUrl || formatKey === "video" || formatCode === "3");
  const isText = Boolean(formatCode === "1" || (formatKey === "text" && !hasImage && !isVideo));
  const isImage = Boolean(!isText && (formatCode === "2" || formatKey === "image" || hasImage));
  const imageWidth =
    parseMetadataInteger(metadataRecord.googleArchivedImageWidth) ??
    parseMetadataInteger(metadataRecord.assetWidth) ??
    archivedPreview?.width ??
    null;
  const imageHeight =
    parseMetadataInteger(metadataRecord.googleArchivedImageHeight) ??
    parseMetadataInteger(metadataRecord.assetHeight) ??
    archivedPreview?.height ??
    null;

  return {
    advertiserCountry: cleanMetadataText(metadataRecord.googleAdvertiserCountry),
    advertiserCountryCode: cleanMetadataText(metadataRecord.googleAdvertiserCountryCode),
    advertiserLegalName: cleanMetadataText(metadataRecord.googleAdvertiserLegalName),
    advertiserName: cleanMetadataText(metadataRecord.googleAdvertiserName) ?? (rawPayload ? cleanMetadataText(rawPayload["12"]) : null),
    advertiserPaymentProfileName: cleanMetadataText(metadataRecord.googleAdvertiserPaymentProfileName),
    advertiserVerified: typeof metadataRecord.googleAdvertiserVerified === "boolean" ? metadataRecord.googleAdvertiserVerified : null,
    brandUrl: cleanMetadataText(metadataRecord.googleBrandUrl),
    creativeId: rawPayload ? cleanMetadataText(rawPayload["2"]) : null,
    creativeHeight: imageHeight,
    creativeVariationTotal:
      parseMetadataInteger(metadataRecord.googleCreativeVariationTotal) ??
      (getNestedMetadataArray(metadataRecord, "googleCreativeAssets").length || null),
    creativeWidth: imageWidth,
    format: isVideo ? "Video" : isText ? "Text" : isImage ? "Image" : format?.trim() || "Text",
    formatCode,
    mediaType: isVideo ? "Video" : isText ? "Text" : isImage ? "Image" : "Text",
    topicCode,
  };
}

function humanizeMetaPlatform(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const languageByCountryCode: Record<string, string> = {
  BR: "Portuguese",
  DE: "German",
  ES: "Spanish",
  FR: "French",
  IT: "Italian",
  NL: "Dutch",
  PT: "Portuguese",
  RO: "Romanian",
};

function getMetaAdDetails(metadata: unknown): MetaAdDetailFields | null {
  const metadataRecord = getMetadataRecord(metadata);
  const rawPayload = getMetadataRecord(metadataRecord?.rawPayload);

  if (!rawPayload) {
    return null;
  }

  const snapshot = getNestedMetadataRecord(rawPayload, "snapshot");
  const currency = cleanMetadataText(rawPayload.currency);
  const countryCode = cleanMetadataText(snapshot?.country_iso_code)?.toUpperCase() ?? null;
  const cards = getNestedMetadataArray(snapshot, "cards");
  const publisherPlatforms = getNestedMetadataArray(rawPayload, "publisher_platform")
    .map((platform) => cleanMetadataText(platform))
    .filter((platform): platform is string => Boolean(platform))
    .map(humanizeMetaPlatform);
  const targetedCountries = getMetaTargetedCountries(metadataRecord ?? null, rawPayload);

  return {
    adId: cleanMetadataText(rawPayload.ad_archive_id),
    displayFormat: cleanMetadataText(snapshot?.display_format),
    carouselSlides: cards.length || null,
    creativeDurationSeconds: pickMetaVideoDurationSeconds(metadataRecord ?? {}, rawPayload, snapshot),
    language: countryCode ? languageByCountryCode[countryCode] ?? countryCode : null,
    publisherPlatforms,
    targetedCountries,
    estimatedReach: formatMetaEstimatedReach(rawPayload),
    estimatedSpend: formatBoundedMetric(rawPayload.spend, { currency }),
    ageRange: cleanMetadataText(rawPayload.age_range) ?? "All",
    gender: cleanMetadataText(rawPayload.gender) ?? "All",
  };
}

function getMetaCreativeAssetUrl(value: unknown) {
  const url = cleanMetadataText(value);
  return url ? normalizeExtractedMediaUrl(url) : null;
}

function getGoogleCreativeAssets(metadata: unknown): MetaCreativeAssetRecord[] {
  const metadataRecord = getMetadataRecord(metadata);
  const materializedAssets = getNestedMetadataArray(metadataRecord, "googleCreativeAssets");

  return materializedAssets
    .map((value, index) => {
      const record = getMetadataRecord(value);

      if (!record) {
        return null;
      }

      const mediaUrl = getMetaCreativeAssetUrl(record.assetStoredUrl) ?? getMetaCreativeAssetUrl(record.sourceMediaUrl);
      const posterUrl =
        getMetaCreativeAssetUrl(record.assetThumbnailStoredUrl) ??
        getMetaCreativeAssetUrl(record.sourceThumbnailUrl) ??
        mediaUrl;
      const videoUrl =
        getMetaCreativeAssetUrl(record.assetVideoStoredUrl) ??
        getMetaCreativeAssetUrl(record.sourceVideoUrl) ??
        buildGoogleYoutubeEmbedUrl(getGoogleYoutubeVideoIdFromRecord(record));
      const identity = cleanMetadataText(record.previewUrl) ?? videoUrl ?? mediaUrl ?? posterUrl;
      const width =
        parseMetadataInteger(record.googleCreativeWidth) ??
        parseMetadataInteger(record.assetVideoWidth) ??
        parseMetadataInteger(record.assetWidth) ??
        parseMetadataInteger(record.assetThumbnailWidth);
      const height =
        parseMetadataInteger(record.googleCreativeHeight) ??
        parseMetadataInteger(record.assetVideoHeight) ??
        parseMetadataInteger(record.assetHeight) ??
        parseMetadataInteger(record.assetThumbnailHeight);

      if (!identity) {
        return null;
      }

      const asset: MetaCreativeAssetRecord = {
        id: createHash("sha1").update(`${identity}:${index}`).digest("hex").slice(0, 16),
        label: cleanMetadataText(record.label) ?? (index === 0 ? "Original" : `Variant ${index}`),
        previewUrl: cleanMetadataText(record.previewUrl),
        title: cleanMetaMetadataText(record.title),
        body: cleanMetaMetadataText(record.body),
        callToAction: cleanMetadataText(record.callToAction),
        destinationUrl: getMetaCreativeAssetUrl(record.destinationUrl),
        mediaUrl,
        posterUrl,
        videoUrl,
        mediaWidth: width,
        mediaHeight: height,
        mediaAspectRatio: width && height ? width / height : null,
      };

      return asset;
    })
    .filter((asset): asset is MetaCreativeAssetRecord => Boolean(asset));
}

function mapLinkedInCreativeAssetRecords(
  records: unknown[],
  options: {
    defaultFirstLabel: string;
    defaultLabelPrefix: string;
    fallbackTitle?: string | null;
  },
) {
  return records
    .map<MetaCreativeAssetRecord | null>((value, index) => {
      const record = getMetadataRecord(value);

      if (!record) {
        return null;
      }

      const mediaUrl = getMetaCreativeAssetUrl(record.assetStoredUrl) ?? getMetaCreativeAssetUrl(record.sourceMediaUrl);
      const posterUrl =
        getMetaCreativeAssetUrl(record.assetThumbnailStoredUrl) ??
        getMetaCreativeAssetUrl(record.sourceThumbnailUrl) ??
        mediaUrl;
      const identity = mediaUrl ?? posterUrl;
      const width = parseMetadataInteger(record.assetWidth) ?? parseMetadataInteger(record.assetThumbnailWidth) ?? parseMetadataInteger(record.mediaWidth);
      const height = parseMetadataInteger(record.assetHeight) ?? parseMetadataInteger(record.assetThumbnailHeight) ?? parseMetadataInteger(record.mediaHeight);

      if (!identity) {
        return null;
      }

      return {
        id: createHash("sha1").update(`${identity}:${index}`).digest("hex").slice(0, 16),
        label: cleanMetadataText(record.label) ?? (index === 0 ? options.defaultFirstLabel : `${options.defaultLabelPrefix} ${index + 1}`),
        title: cleanMetadataText(record.title) ?? options.fallbackTitle ?? null,
        body: cleanMetadataText(record.body),
        callToAction: cleanMetadataText(record.callToAction),
        destinationUrl: getMetaCreativeAssetUrl(record.destinationUrl),
        mediaUrl,
        posterUrl,
        videoUrl: null,
        mediaWidth: width,
        mediaHeight: height,
        mediaAspectRatio: width && height ? width / height : null,
      } satisfies MetaCreativeAssetRecord;
    })
    .filter((asset): asset is MetaCreativeAssetRecord => Boolean(asset));
}

function getLinkedInCreativeAssets(metadata: unknown): MetaCreativeAssetRecord[] {
  const metadataRecord = getMetadataRecord(metadata);
  const carouselCards = getNestedMetadataArray(metadataRecord, "linkedInCarouselCards");

  if (carouselCards.length) {
    return mapLinkedInCreativeAssetRecords(carouselCards, {
      defaultFirstLabel: "Card 1",
      defaultLabelPrefix: "Card",
    });
  }

  const slides = getNestedMetadataArray(metadataRecord, "linkedInDocumentSlides");
  const documentTitle = cleanMetadataText(metadataRecord?.linkedInDocumentTitle);

  return mapLinkedInCreativeAssetRecords(slides, {
    defaultFirstLabel: "Cover",
    defaultLabelPrefix: "Slide",
    fallbackTitle: documentTitle,
  });
}

export function getMetaCreativeAssets(metadata: unknown): MetaCreativeAssetRecord[] {
  const metadataRecord = getMetadataRecord(metadata);
  const materializedAssets = getNestedMetadataArray(metadataRecord, "metaCreativeAssets");
  const mappedMaterializedAssets = materializedAssets
    .map((value, index) => {
      const record = getMetadataRecord(value);

      if (!record) {
        return null;
      }

      const mediaUrl = getMetaCreativeAssetUrl(record.assetStoredUrl) ?? getMetaCreativeAssetUrl(record.sourceMediaUrl);
      const posterUrl =
        getMetaCreativeAssetUrl(record.assetThumbnailStoredUrl) ??
        getMetaCreativeAssetUrl(record.sourceThumbnailUrl) ??
        mediaUrl;
      const sourceVideoUrl = getMetaCreativeAssetUrl(record.sourceVideoUrl);
      const videoUrl = getMetaCreativeAssetUrl(record.assetVideoStoredUrl) ?? (posterUrl ? null : sourceVideoUrl);
      const hasStoredAsset =
        hasMetadataText(record.assetStoredUrl) ||
        hasMetadataText(record.assetThumbnailStoredUrl) ||
        hasMetadataText(record.assetVideoStoredUrl);
      const hasStorageError =
        hasMetadataText(record.assetStorageError) ||
        hasMetadataText(record.assetThumbnailStorageError) ||
        hasMetadataText(record.assetVideoStorageError);
      const identity = videoUrl ?? mediaUrl ?? posterUrl;
      const width =
        parseMetadataInteger(record.assetVideoWidth) ??
        parseMetadataInteger(record.assetWidth) ??
        parseMetadataInteger(record.assetThumbnailWidth);
      const height =
        parseMetadataInteger(record.assetVideoHeight) ??
        parseMetadataInteger(record.assetHeight) ??
        parseMetadataInteger(record.assetThumbnailHeight);

      if (!identity || (hasStorageError && !hasStoredAsset)) {
        return null;
      }

      return {
        id: createHash("sha1").update(identity).digest("hex").slice(0, 16),
        label: cleanMetadataText(record.label) ?? (index === 0 ? "Original" : `Variant ${index}`),
        title: cleanMetaMetadataText(record.title),
        body: cleanMetaMetadataText(record.body),
        callToAction: cleanMetadataText(record.callToAction),
        destinationUrl: getMetaCreativeAssetUrl(record.destinationUrl),
        mediaUrl,
        posterUrl,
        videoUrl,
        mediaWidth: width,
        mediaHeight: height,
        mediaAspectRatio: width && height ? width / height : null,
      } satisfies MetaCreativeAssetRecord;
    })
    .filter((asset): asset is MetaCreativeAssetRecord => Boolean(asset));

  const rawPayload = getMetadataRecord(metadataRecord?.rawPayload);
  const snapshot = getNestedMetadataRecord(rawPayload, "snapshot");

  if (!snapshot) {
    return mappedMaterializedAssets;
  }

  const cards = getNestedMetadataArray(snapshot, "cards");
  const videos = getNestedMetadataArray(snapshot, "videos");
  const extraVideos = getNestedMetadataArray(snapshot, "extra_videos");
  const images = getNestedMetadataArray(snapshot, "images");
  const extraImages = getNestedMetadataArray(snapshot, "extra_images");
  const topLevelSourceVideoUrl = getMetaCreativeAssetUrl(metadataRecord?.sourceVideoUrl);
  const topLevelStoredVideoUrl = getMetaCreativeAssetUrl(metadataRecord?.assetVideoStoredUrl);
  const topLevelSourceMediaUrl = getMetaCreativeAssetUrl(metadataRecord?.sourceMediaUrl);
  const topLevelStoredMediaUrl = getMetaCreativeAssetUrl(metadataRecord?.assetStoredUrl);
  const topLevelSourceThumbnailUrl = getMetaCreativeAssetUrl(metadataRecord?.sourceThumbnailUrl);
  const topLevelStoredThumbnailUrl = getMetaCreativeAssetUrl(metadataRecord?.assetThumbnailStoredUrl);
  const topLevelStoredPreviewUrl = topLevelStoredThumbnailUrl ?? topLevelStoredMediaUrl;
  const candidates = cards.length
    ? cards.map((value, index) => ({
        dedupeKey: `card:${index}`,
        label: index === 0 ? "Original" : `Variant ${index}`,
        value,
      }))
    : [
        ...videos.map((value, index) => ({ dedupeKey: "media", label: `Video ${index + 1}`, value })),
        ...extraVideos.map((value, index) => ({ dedupeKey: "media", label: `Extra video ${index + 1}`, value })),
        ...images.map((value, index) => ({ dedupeKey: "media", label: `Image ${index + 1}`, value })),
        ...extraImages.map((value, index) => ({ dedupeKey: "media", label: `Extra image ${index + 1}`, value })),
      ];
  const assets: MetaCreativeAssetRecord[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const record = getMetadataRecord(candidate.value);

    if (!record) {
      continue;
    }

    const videoUrl =
      getMetaCreativeAssetUrl(record.video_hd_url) ??
      getMetaCreativeAssetUrl(record.video_sd_url) ??
      getMetaCreativeAssetUrl(record.watermarked_video_hd_url) ??
      getMetaCreativeAssetUrl(record.watermarked_video_sd_url);
    const imageUrl =
      getMetaCreativeAssetUrl(record.original_image_url) ??
      getMetaCreativeAssetUrl(record.resized_image_url) ??
      getMetaCreativeAssetUrl(record.watermarked_resized_image_url);
    const posterUrl = getMetaCreativeAssetUrl(record.video_preview_image_url) ?? imageUrl;
    const resolvedImageUrl = imageUrl && imageUrl === topLevelSourceMediaUrl ? topLevelStoredMediaUrl ?? imageUrl : imageUrl;
    const resolvedPosterUrl =
      posterUrl && posterUrl === topLevelSourceThumbnailUrl ? topLevelStoredThumbnailUrl ?? posterUrl : resolvedImageUrl ?? posterUrl;
    const resolvedVideoUrl =
      videoUrl && videoUrl === topLevelSourceVideoUrl
        ? topLevelStoredVideoUrl ?? (resolvedPosterUrl ? null : videoUrl)
        : resolvedPosterUrl
          ? null
          : videoUrl;
    const cardStoredPreviewUrl =
      candidate.dedupeKey.startsWith("card:") && !resolvedVideoUrl && !resolvedImageUrl && !resolvedPosterUrl
        ? topLevelStoredPreviewUrl
        : null;
    const mediaUrl = resolvedImageUrl ?? resolvedPosterUrl ?? cardStoredPreviewUrl;
    const identity = resolvedVideoUrl ?? mediaUrl;

    if (!identity) {
      continue;
    }

    const seenKey = candidate.dedupeKey === "media" ? identity : candidate.dedupeKey;

    if (seen.has(seenKey)) {
      continue;
    }

    seen.add(seenKey);
    assets.push({
      id: createHash("sha1").update(`${seenKey}:${identity}`).digest("hex").slice(0, 16),
      label: candidate.label,
      title:
        cleanMetaMetadataText(record.title) ??
        cleanMetaMetadataText(record.link_description) ??
        cleanMetaMetadataText(snapshot.title) ??
        cleanMetaMetadataText(snapshot.link_description),
      body:
        cleanMetaMetadataText(record.body) ??
        cleanMetaMetadataText(record.caption) ??
        cleanMetaMetadataText(getMetadataRecord(snapshot.body)?.text) ??
        cleanMetaMetadataText(snapshot.caption),
      callToAction:
        cleanMetadataText(record.cta_text) ??
        cleanMetadataText(snapshot.cta_text) ??
        cleanMetadataText(record.cta_type) ??
        cleanMetadataText(snapshot.cta_type),
      destinationUrl: getMetaCreativeAssetUrl(record.link_url) ?? getMetaCreativeAssetUrl(snapshot.link_url),
      mediaUrl,
      posterUrl: resolvedPosterUrl ?? mediaUrl,
      videoUrl: resolvedVideoUrl,
      mediaWidth: null,
      mediaHeight: null,
      mediaAspectRatio: null,
    });
  }

  if (!mappedMaterializedAssets.length) {
    return assets;
  }

  if (!assets.length) {
    return mappedMaterializedAssets;
  }

  const mappedAssetsByLabel = new Map(mappedMaterializedAssets.map((asset) => [asset.label, asset]));
  const rawLabels = new Set(assets.map((asset) => asset.label));
  const mergedAssets = assets.map((asset) => mappedAssetsByLabel.get(asset.label) ?? asset);
  const supplementalMaterializedAssets = mappedMaterializedAssets.filter((asset) => !rawLabels.has(asset.label));

  return [...mergedAssets, ...supplementalMaterializedAssets];
}

function hasStoredMetaCreativeReference(input: {
  mediaUrl: string | null;
  metadata: unknown;
  metaCreativeAssets: MetaCreativeAssetRecord[];
}) {
  const metadataRecord = getMetadataRecord(input.metadata);

  return Boolean(
    input.metaCreativeAssets.length ||
      getMetaCreativeAssetUrl(metadataRecord?.assetStoredUrl) ||
      getMetaCreativeAssetUrl(metadataRecord?.assetThumbnailStoredUrl) ||
      getMetaCreativeAssetUrl(metadataRecord?.assetVideoStoredUrl) ||
      (typeof input.mediaUrl === "string" && input.mediaUrl.includes("/ad-assets/")),
  );
}

function getDisplayAdMediaUrl(input: { source: Source; mediaUrl: string | null; metadata: unknown }) {
  const resolvedMediaUrl = resolveCdnAssetUrl(input.mediaUrl);

  if (input.source !== "facebook") {
    return resolvedMediaUrl;
  }

  const metadataRecord = getMetadataRecord(input.metadata);
  const storedMediaUrl =
    getMetaCreativeAssetUrl(metadataRecord?.assetVideoStoredUrl) ??
    getMetaCreativeAssetUrl(metadataRecord?.assetStoredUrl) ??
    getMetaCreativeAssetUrl(metadataRecord?.assetThumbnailStoredUrl);

  if (storedMediaUrl) {
    return storedMediaUrl;
  }

  if (typeof input.mediaUrl === "string" && input.mediaUrl.includes("/ad-assets/")) {
    return resolvedMediaUrl;
  }

  const hasTopLevelStorageError =
    hasMetadataText(metadataRecord?.assetStorageError) ||
    hasMetadataText(metadataRecord?.assetThumbnailStorageError) ||
    hasMetadataText(metadataRecord?.assetVideoStorageError);

  return hasTopLevelStorageError ? null : resolvedMediaUrl;
}

function cloneMetadataRecord(metadata: unknown) {
  const record = getMetadataRecord(metadata);
  return record ? { ...record } : {};
}

function mergePersistedAdMetadata(existingMetadata: unknown, nextMetadata: Record<string, unknown> | undefined) {
  const existingRecord = cloneMetadataRecord(existingMetadata);
  const nextRecord = nextMetadata ? { ...nextMetadata } : {};
  const mergedRecord = {
    ...existingRecord,
    ...nextRecord,
  };

  if (nextRecord.assetStoredUrl) {
    delete mergedRecord.assetStorageError;
  }

  if (nextRecord.assetThumbnailStoredUrl) {
    delete mergedRecord.assetThumbnailStorageError;
  }

  if (nextRecord.assetVideoStoredUrl) {
    delete mergedRecord.assetVideoStorageError;
  }

  if (nextRecord.sourceMediaUrl || nextRecord.sourceThumbnailUrl || nextRecord.sourceVideoUrl || nextRecord.googleCreativeAssets) {
    delete mergedRecord.previewFetchError;
  }

  return Object.keys(mergedRecord).length ? mergedRecord : undefined;
}

function resolvePersistedAdCopy(nextValue: string | undefined, existingValue: string | null) {
  if (typeof nextValue === "string" && nextValue.trim().length > 0) {
    return nextValue;
  }

  if (typeof existingValue === "string" && existingValue.trim().length > 0) {
    return existingValue;
  }

  return null;
}

function resolvePersistedAdValue(nextValue: string | undefined, existingValue: string | null) {
  if (typeof nextValue === "string" && nextValue.trim().length > 0) {
    return nextValue;
  }

  return existingValue;
}

function normalizeExtractedMediaUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;

  return resolveCdnAssetUrl(normalized);
}

function collectNestedStrings(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectNestedStrings(item, depth + 1));
  }

  if (typeof value !== "object") {
    return [];
  }

  return Object.values(value as Record<string, unknown>).flatMap((item) =>
    collectNestedStrings(item, depth + 1),
  );
}

function getGoogleArchivedImagePreview(metadata: unknown) {
  const rawPayload = getMetadataRecord(metadata)?.rawPayload;

  if (!rawPayload) {
    return null;
  }

  const matches = collectNestedStrings(rawPayload)
    .map((value) => {
      const imgMatch =
        value.match(/<img[^>]+src=["']((?:https?:)?\/\/[^"' >]+)["']/i) ??
        value.match(/((?:https?:)?\/\/tpc\.googlesyndication\.com\/archive\/simgad\/[^"' <]+)/i);

      const url = imgMatch?.[1] ? normalizeExtractedMediaUrl(imgMatch[1]) : null;

      if (!url) {
        return null;
      }

      const widthMatch = value.match(/\bwidth=["']?(\d+)/i);
      const heightMatch = value.match(/\bheight=["']?(\d+)/i);
      const width = widthMatch ? Number.parseInt(widthMatch[1], 10) : null;
      const height = heightMatch ? Number.parseInt(heightMatch[1], 10) : null;

      return {
        url,
        width: width && Number.isFinite(width) ? width : null,
        height: height && Number.isFinite(height) ? height : null,
      };
    })
    .filter((match): match is { url: string; width: number | null; height: number | null } => Boolean(match));

  return matches[0] ?? null;
}

function collectErrorStrings(error: unknown, depth = 0): string[] {
  if (depth > 3 || error == null) {
    return [];
  }

  if (typeof error === "string") {
    return [error];
  }

  if (typeof error !== "object") {
    return [];
  }

  const record = error as Record<string, unknown>;
  const values = ["message", "sqlMessage", "query", "sql", "detail"]
    .map((key) => record[key])
    .filter((value): value is string => typeof value === "string");

  return [
    ...values,
    ...collectErrorStrings(record.cause, depth + 1),
    ...collectErrorStrings(record.originalError, depth + 1),
  ];
}

function isTrackerNotificationsSchemaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : null;
  const message = collectErrorStrings(error).join(" ");
  const referencesTrackerNotifications =
    message.includes("tracker_notifications") || message.includes("tracker_notification_");

  if (!referencesTrackerNotifications) {
    return false;
  }

  if (code === "ER_NO_SUCH_TABLE" || code === "ER_BAD_FIELD_ERROR") {
    return true;
  }

  return (
    message.includes("Failed query") ||
    message.includes("doesn't exist") ||
    message.includes("Unknown column") ||
    message.includes("Unknown table") ||
    message.includes("no such table") ||
    message.includes("Table")
  );
}

async function withOptionalTrackerNotifications<T>(query: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isTrackerNotificationsSchemaError(error)) {
      return fallback;
    }

    throw error;
  }
}

function getMetadataDimensions(metadata: unknown, prefix: "asset" | "assetThumbnail" | "assetVideo") {
  const width = pickMetadataNumber(metadata, `${prefix}Width`);
  const height = pickMetadataNumber(metadata, `${prefix}Height`);

  if (!width || !height) {
    return null;
  }

  return {
    width,
    height,
    aspectRatio: width / height,
  };
}

function hasFailedTopLevelCreativeStorage(metadata: unknown) {
  const metadataRecord = getMetadataRecord(metadata);

  return (
    hasMetadataText(metadataRecord?.assetStorageError) ||
    hasMetadataText(metadataRecord?.assetThumbnailStorageError) ||
    hasMetadataText(metadataRecord?.assetVideoStorageError)
  );
}

function getAdPosterUrl(metadata: unknown, source?: Source) {
  const assetThumbnailStoredUrl = pickMetadataUrl(metadata, "assetThumbnailStoredUrl");

  if (assetThumbnailStoredUrl) {
    return assetThumbnailStoredUrl;
  }

  const assetStoredUrl = pickMetadataUrl(metadata, "assetStoredUrl");
  const assetContentType = pickMetadataString(metadata, "assetContentType")?.toLowerCase() ?? null;
  const assetVideoStoredUrl = pickMetadataUrl(metadata, "assetVideoStoredUrl");

  if (assetStoredUrl && (assetContentType?.startsWith("image/") || !assetVideoStoredUrl)) {
    return assetStoredUrl;
  }

  if (source === "facebook" && hasFailedTopLevelCreativeStorage(metadata)) {
    return null;
  }

  return (
    pickMetadataUrl(metadata, "sourceThumbnailUrl") ??
    getNestedMetadataArray(getMetadataRecord(metadata), "googleCreativeAssets")
      .map((asset) => getMetadataRecord(asset))
      .map((asset) =>
        pickMetadataUrl(asset, "assetThumbnailStoredUrl") ??
        pickMetadataUrl(asset, "assetStoredUrl") ??
        pickMetadataUrl(asset, "sourceThumbnailUrl") ??
        pickMetadataUrl(asset, "sourceMediaUrl"),
      )
      .find((value): value is string => Boolean(value)) ??
    getGoogleArchivedImagePreview(metadata)?.url ??
    null
  );
}

function getAdVideoUrl(metadata: unknown, source?: Source) {
  const assetVideoStoredUrl = pickMetadataUrl(metadata, "assetVideoStoredUrl");

  if (assetVideoStoredUrl) {
    return assetVideoStoredUrl;
  }

  if (source === "facebook" && hasFailedTopLevelCreativeStorage(metadata)) {
    return null;
  }

  return (
    pickMetadataUrl(metadata, "sourceVideoUrl") ??
    getNestedMetadataArray(getMetadataRecord(metadata), "googleCreativeAssets")
      .map((asset) => getMetadataRecord(asset))
      .map((asset) =>
        pickMetadataUrl(asset, "assetVideoStoredUrl") ??
        pickMetadataUrl(asset, "sourceVideoUrl") ??
        buildGoogleYoutubeEmbedUrl(getGoogleYoutubeVideoIdFromRecord(asset)),
      )
      .find((value): value is string => Boolean(value)) ??
    getGoogleYoutubeEmbedUrlFromMetadata(metadata) ??
    null
  );
}

function getAdMediaDimensions(metadata: unknown) {
  return (
    getMetadataDimensions(metadata, "assetVideo") ??
    getMetadataDimensions(metadata, "asset") ??
    getMetadataDimensions(metadata, "assetThumbnail") ??
    (() => {
      const preview = getGoogleArchivedImagePreview(metadata);

      if (!preview?.width || !preview.height) {
        return null;
      }

      return {
        width: preview.width,
        height: preview.height,
        aspectRatio: preview.width / preview.height,
      };
    })()
  );
}

function advertiserDisplayNameSql() {
  return sql<string>`coalesce(${advertiserCompaniesTable.displayName}, ${advertisersTable.canonicalName})`;
}

function advertiserWebsiteUrlSql() {
  return sql<string | null>`coalesce(${advertiserCompaniesTable.websiteUrl}, ${advertisersTable.websiteUrl})`;
}

function advertiserLogoUrlSql() {
  return sql<string | null>`coalesce(${advertiserCompaniesTable.logoUrl}, ${advertisersTable.logoUrl})`;
}

function coerceDate(value: Date | string | number | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toRootAdvertiserWebsiteUrl(websiteUrl: string | null, normalizedDomain: string) {
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

type TrackerStatus = "pending_initial_index" | "active" | "retryable_error" | "paused";

type AdvertiserEntityMember = {
  advertiserId: string;
  source: Source;
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
  trackedCompanyId: string | null;
  trackedStatus: TrackerStatus | null;
  lastIndexedAt: Date | null;
  totalAds: number;
  activeAds: number;
  averageEngagement: number;
  lastSeenAt: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date | null;
};

type AggregatedAdvertiserEntity = {
  id: string;
  advertiserIds: string[];
  sourceAdvertiserIds: string[];
  primaryAdvertiserId: string;
  sources: Source[];
  sourceProfiles: Array<{ source: Source; profileUrl: string | null }>;
  canonicalName: string;
  profileUrl: string | null;
  websiteUrl: string | null;
  normalizedDomain: string | null;
  logoUrl: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  summary: string | null;
  totalAds: number;
  activeAds: number;
  averageEngagement: number;
  lastSeenAt: Date | null;
  trackedCompanyIds: string[];
  trackedCompanyId: string | null;
  trackedStatus: TrackerStatus | null;
  status: TrackerStatus | null;
  lastIndexedAt: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date | null;
};

function getTrackerStatusPriority(status: TrackerStatus | null) {
  switch (status) {
    case "retryable_error":
      return 4;
    case "paused":
      return 3;
    case "pending_initial_index":
      return 2;
    case "active":
      return 1;
    default:
      return 0;
  }
}

function aggregateTrackedStatus(statuses: Array<TrackerStatus | null>) {
  return statuses
    .filter((status): status is TrackerStatus => Boolean(status))
    .sort((left, right) => getTrackerStatusPriority(right) - getTrackerStatusPriority(left))[0] ?? null;
}

function pickPrimaryAdvertiserMember(members: AdvertiserEntityMember[]) {
  return [...members].sort((left, right) => {
    if (right.totalAds !== left.totalAds) {
      return right.totalAds - left.totalAds;
    }

    const rightIndexedAt = right.lastIndexedAt?.getTime() ?? 0;
    const leftIndexedAt = left.lastIndexedAt?.getTime() ?? 0;

    if (rightIndexedAt !== leftIndexedAt) {
      return rightIndexedAt - leftIndexedAt;
    }

    const rightCreatedAt = right.createdAt?.getTime() ?? 0;
    const leftCreatedAt = left.createdAt?.getTime() ?? 0;

    return rightCreatedAt - leftCreatedAt;
  })[0] ?? null;
}

function toAggregatedAdvertiserEntity(members: AdvertiserEntityMember[]): AggregatedAdvertiserEntity | null {
  if (!members.length) {
    return null;
  }

  const primaryMember = pickPrimaryAdvertiserMember(members);

  if (!primaryMember) {
    return null;
  }

  const companyId = primaryMember.companyId;
  const sources = Array.from(new Set(members.map((member) => member.source)));
  const sourceProfiles = Array.from(
    members.reduce((acc, member) => {
      const profileUrl = resolveAdvertiserSourceUrl({
        source: member.source,
        sourceAdvertiserId: member.sourceAdvertiserId,
        profileUrl: member.profileUrl,
      });
      const key = `${member.source}:${profileUrl ?? ""}`;

      if (!acc.has(key)) {
        acc.set(key, {
          source: member.source,
          profileUrl,
        });
      }

      return acc;
    }, new Map<string, { source: Source; profileUrl: string | null }>()),
  ).map(([, value]) => value);
  const trackedCompanyIds = Array.from(
    new Set(
      members
        .map((member) => member.trackedCompanyId)
        .filter((trackedCompanyId): trackedCompanyId is string => Boolean(trackedCompanyId)),
    ),
  );
  const totalAds = members.reduce((sum, member) => sum + member.totalAds, 0);
  const activeAds = members.reduce((sum, member) => sum + member.activeAds, 0);
  const engagementMembers = members.filter((member) => member.totalAds > 0);
  const averageEngagement = engagementMembers.length
    ? Math.round(
        engagementMembers.reduce((sum, member) => sum + member.averageEngagement * member.totalAds, 0) /
          Math.max(1, engagementMembers.reduce((sum, member) => sum + member.totalAds, 0)),
      )
    : 0;

  return {
    id: buildPublicAdvertiserId({
      companyId,
      advertiserId: companyId ? null : primaryMember.advertiserId,
    }),
    advertiserIds: members.map((member) => member.advertiserId),
    sourceAdvertiserIds: members.map((member) => member.sourceAdvertiserId),
    primaryAdvertiserId: primaryMember.advertiserId,
    sources,
    sourceProfiles,
    canonicalName: primaryMember.canonicalName,
    profileUrl: resolveAdvertiserSourceUrl({
      source: primaryMember.source,
      sourceAdvertiserId: primaryMember.sourceAdvertiserId,
      profileUrl: primaryMember.profileUrl,
    }),
    websiteUrl:
      primaryMember.websiteUrl ??
      sourceProfiles.find((profile) => profile.profileUrl)?.profileUrl ??
      null,
    normalizedDomain: primaryMember.normalizedDomain,
    logoUrl: resolveCdnAssetUrl(primaryMember.logoUrl),
    industry: primaryMember.industry ?? members.find((member) => member.industry)?.industry ?? null,
    companySize:
      primaryMember.companySize ?? members.find((member) => member.companySize)?.companySize ?? null,
    country: primaryMember.country ?? members.find((member) => member.country)?.country ?? null,
    summary: primaryMember.summary ?? members.find((member) => member.summary)?.summary ?? null,
    totalAds,
    activeAds,
    averageEngagement,
    lastSeenAt: members.reduce<Date | null>(
      (current, member) =>
        !current || (member.lastSeenAt && member.lastSeenAt > current) ? member.lastSeenAt : current,
      null,
    ),
    trackedCompanyIds,
    trackedCompanyId: trackedCompanyIds[0] ?? null,
    trackedStatus: aggregateTrackedStatus(members.map((member) => member.trackedStatus)),
    status: aggregateTrackedStatus(members.map((member) => member.trackedStatus)),
    lastIndexedAt: members.reduce<Date | null>(
      (current, member) =>
        !current || (member.lastIndexedAt && member.lastIndexedAt > current) ? member.lastIndexedAt : current,
      null,
    ),
    lastSyncedAt: members.reduce<Date | null>(
      (current, member) =>
        !current || (member.lastSyncedAt && member.lastSyncedAt > current) ? member.lastSyncedAt : current,
      null,
    ),
    createdAt: members.reduce<Date | null>(
      (current, member) =>
        !member.createdAt || (current && current <= member.createdAt) ? current : member.createdAt,
      members.find((member) => member.createdAt)?.createdAt ?? null,
    ),
  };
}

function groupAdvertiserEntityMembers(members: AdvertiserEntityMember[]) {
  const membersByKey = new Map<string, AdvertiserEntityMember[]>();

  for (const member of members) {
    const key = member.companyId ?? member.advertiserId;
    const group = membersByKey.get(key);

    if (group) {
      group.push(member);
      continue;
    }

    membersByKey.set(key, [member]);
  }

  return Array.from(membersByKey.values())
    .map((group) => toAggregatedAdvertiserEntity(group))
    .filter((group): group is AggregatedAdvertiserEntity => Boolean(group));
}

function selectPublicAdvertiserIdsForRows(
  rows: Array<{ companyId: string | null; advertiserId: string }>,
) {
  return rows.map((row) =>
    buildPublicAdvertiserId({
      companyId: row.companyId,
      advertiserId: row.companyId ? null : row.advertiserId,
    }),
  );
}

export type WorkspaceRole = "owner" | "admin" | "member";

export type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  ownerUserId: string;
  role: WorkspaceRole;
  createdAt: Date;
};

export type WorkspaceMemberSummary = {
  id: string;
  userId: string;
  email: string;
  username: string | null;
  name: string | null;
  role: WorkspaceRole;
  lastSeenAt: Date | null;
  createdAt: Date;
};

export type WorkspaceInvitationRole = Exclude<WorkspaceRole, "owner">;

export type AdminWorkspaceInvitationSummary = {
  id: string;
  email: string;
  role: WorkspaceInvitationRole;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
};

export type AdminWorkspaceUsersSummary = {
  members: WorkspaceMemberSummary[];
  invitations: AdminWorkspaceInvitationSummary[];
};

export type WorkspaceInvitationPreview = {
  id: string;
  email: string;
  role: WorkspaceInvitationRole;
  status: string;
  expiresAt: Date | null;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
};

export type AcceptedWorkspaceInvitation = {
  userId: string;
  email: string;
  username: string;
  workspaceId: string;
  workspaceSlug: string;
};

export type WorkspaceContext = {
  userId: string;
  workspace: WorkspaceSummary;
};

const workspaceInvitationTokenPrefix = "workspace-invite:";
const authUserLastSeenTouchIntervalMs = 5 * 60 * 1000;

function isWorkspaceRole(value: string): value is WorkspaceRole {
  return value === "owner" || value === "admin" || value === "member";
}

function normalizeWorkspaceInvitationRole(value: string): WorkspaceInvitationRole {
  return value === "admin" ? "admin" : "member";
}

function createWorkspaceInvitationToken() {
  return randomBytes(32).toString("base64url");
}

function getWorkspaceInvitationTokenIdentifier(token: string) {
  const hash = createHash("sha256").update(token).digest("hex");
  return `${workspaceInvitationTokenPrefix}${hash}`;
}

export function normalizeWorkspaceSlug(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || "workspace";
}

function buildDefaultWorkspaceName(user: {
  email: string;
  username: string | null;
  name: string | null;
}) {
  return user.name?.trim() || user.username?.trim() || user.email.trim();
}

async function buildUniqueWorkspaceSlug(baseValue: string) {
  const db = getDb();
  const baseSlug = normalizeWorkspaceSlug(baseValue);
  let candidate = baseSlug;
  let suffix = 2;

  while (true) {
    const [existing] = await db
      .select({ id: authOrganizationsTable.id })
      .from(authOrganizationsTable)
      .where(eq(authOrganizationsTable.slug, candidate))
      .limit(1);

    if (!existing) {
      return candidate;
    }

    candidate = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

function toWorkspaceSummary(row: {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  ownerUserId: string;
  role: string;
  createdAt: Date;
}): WorkspaceSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo: row.logo,
    ownerUserId: row.ownerUserId,
    role: isWorkspaceRole(row.role) ? row.role : "member",
    createdAt: row.createdAt,
  };
}

export async function createWorkspaceForUser(input: {
  userId: string;
  name: string;
  slug?: string;
}) {
  const db = getDb();
  const now = new Date();
  const slug = await buildUniqueWorkspaceSlug(input.slug ?? input.name);
  const workspaceId = randomUUID();

  await db.insert(authOrganizationsTable).values({
    id: workspaceId,
    name: input.name.trim() || "Workspace",
    slug,
    logo: null,
    metadata: null,
    ownerUserId: input.userId,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(authMembersTable).values({
    id: randomUUID(),
    organizationId: workspaceId,
    userId: input.userId,
    role: "owner",
    createdAt: now,
  });

  return getWorkspaceForUserById(input.userId, workspaceId);
}

export async function ensureDefaultWorkspaceForUser(userId: string): Promise<WorkspaceSummary> {
  const db = getDb();
  const [existing] = await db
    .select({
      id: authOrganizationsTable.id,
      name: authOrganizationsTable.name,
      slug: authOrganizationsTable.slug,
      logo: authOrganizationsTable.logo,
      ownerUserId: authOrganizationsTable.ownerUserId,
      role: authMembersTable.role,
      createdAt: authOrganizationsTable.createdAt,
    })
    .from(authMembersTable)
    .innerJoin(authOrganizationsTable, eq(authMembersTable.organizationId, authOrganizationsTable.id))
    .where(eq(authMembersTable.userId, userId))
    .orderBy(desc(authOrganizationsTable.createdAt))
    .limit(1);

  if (existing) {
    return toWorkspaceSummary(existing);
  }

  const [user] = await db
    .select({
      email: authUsersTable.email,
      username: authUsersTable.username,
      name: authUsersTable.name,
    })
    .from(authUsersTable)
    .where(eq(authUsersTable.id, userId))
    .limit(1);

  if (!user) {
    throw new Error("User was not found while creating a default workspace.");
  }

  const name = buildDefaultWorkspaceName(user);
  const workspace = await createWorkspaceForUser({
    userId,
    name,
    slug: user.username ?? user.email.split("@")[0] ?? name,
  });

  if (!workspace) {
    throw new Error("Default workspace could not be created.");
  }

  return workspace;
}

export async function getWorkspaceForUserById(userId: string, workspaceId: string) {
  const db = getDb();
  const [workspace] = await db
    .select({
      id: authOrganizationsTable.id,
      name: authOrganizationsTable.name,
      slug: authOrganizationsTable.slug,
      logo: authOrganizationsTable.logo,
      ownerUserId: authOrganizationsTable.ownerUserId,
      role: authMembersTable.role,
      createdAt: authOrganizationsTable.createdAt,
    })
    .from(authMembersTable)
    .innerJoin(authOrganizationsTable, eq(authMembersTable.organizationId, authOrganizationsTable.id))
    .where(and(eq(authMembersTable.userId, userId), eq(authOrganizationsTable.id, workspaceId)))
    .limit(1);

  return workspace ? toWorkspaceSummary(workspace) : null;
}

export async function getWorkspaceForUserBySlug(userId: string, slug: string) {
  const db = getDb();
  const [workspace] = await db
    .select({
      id: authOrganizationsTable.id,
      name: authOrganizationsTable.name,
      slug: authOrganizationsTable.slug,
      logo: authOrganizationsTable.logo,
      ownerUserId: authOrganizationsTable.ownerUserId,
      role: authMembersTable.role,
      createdAt: authOrganizationsTable.createdAt,
    })
    .from(authMembersTable)
    .innerJoin(authOrganizationsTable, eq(authMembersTable.organizationId, authOrganizationsTable.id))
    .where(and(eq(authMembersTable.userId, userId), eq(authOrganizationsTable.slug, normalizeWorkspaceSlug(slug))))
    .limit(1);

  return workspace ? toWorkspaceSummary(workspace) : null;
}

export async function listWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: authOrganizationsTable.id,
      name: authOrganizationsTable.name,
      slug: authOrganizationsTable.slug,
      logo: authOrganizationsTable.logo,
      ownerUserId: authOrganizationsTable.ownerUserId,
      role: authMembersTable.role,
      createdAt: authOrganizationsTable.createdAt,
    })
    .from(authMembersTable)
    .innerJoin(authOrganizationsTable, eq(authMembersTable.organizationId, authOrganizationsTable.id))
    .where(eq(authMembersTable.userId, userId))
    .orderBy(desc(authOrganizationsTable.createdAt));

  return rows.map(toWorkspaceSummary);
}

export async function listWorkspaceMembers(
  actorUserId: string,
  workspaceId: string,
): Promise<WorkspaceMemberSummary[]> {
  await assertWorkspaceMembership(actorUserId, workspaceId);

  const db = getDb();
  const rows = await db
    .select({
      id: authMembersTable.id,
      userId: authMembersTable.userId,
      email: authUsersTable.email,
      username: authUsersTable.username,
      name: authUsersTable.name,
      role: authMembersTable.role,
      lastSeenAt: authUsersTable.lastSeenAt,
      createdAt: authMembersTable.createdAt,
    })
    .from(authMembersTable)
    .innerJoin(authUsersTable, eq(authMembersTable.userId, authUsersTable.id))
    .where(eq(authMembersTable.organizationId, workspaceId))
    .orderBy(desc(authUsersTable.lastSeenAt), desc(authMembersTable.createdAt));

  return rows.map((row) => ({
    ...row,
    role: isWorkspaceRole(row.role) ? row.role : "member",
  }));
}

export async function touchAuthUserLastSeenAt(userId: string, now = new Date()) {
  const db = getDb();
  const staleBefore = new Date(now.getTime() - authUserLastSeenTouchIntervalMs);

  await db
    .update(authUsersTable)
    .set({ lastSeenAt: now })
    .where(
      and(
        eq(authUsersTable.id, userId),
        or(isNull(authUsersTable.lastSeenAt), lt(authUsersTable.lastSeenAt, staleBefore)),
      ),
    );
}

export async function listAdminWorkspaceUsers(
  actorUserId: string,
  workspaceId: string,
): Promise<AdminWorkspaceUsersSummary> {
  const members = await listWorkspaceMembers(actorUserId, workspaceId);
  const db = getDb();
  const invitations = await db
    .select({
      id: authInvitationsTable.id,
      email: authInvitationsTable.email,
      role: authInvitationsTable.role,
      status: authInvitationsTable.status,
      expiresAt: authInvitationsTable.expiresAt,
      createdAt: authInvitationsTable.createdAt,
    })
    .from(authInvitationsTable)
    .where(
      and(
        eq(authInvitationsTable.organizationId, workspaceId),
        eq(authInvitationsTable.status, "pending"),
      ),
    )
    .orderBy(desc(authInvitationsTable.createdAt));

  return {
    members,
    invitations: invitations.map((invitation) => ({
      ...invitation,
      role: normalizeWorkspaceInvitationRole(invitation.role),
    })),
  };
}

async function assertWorkspaceAdmin(userId: string, workspaceId: string) {
  const workspace = await assertWorkspaceMembership(userId, workspaceId);

  if (workspace.role !== "owner" && workspace.role !== "admin") {
    throw new Error("Only workspace owners and admins can manage this workspace.");
  }

  return workspace;
}

export async function createWorkspaceUserInvitation(input: {
  actorUserId: string;
  workspaceId: string;
  email: string;
  role: WorkspaceInvitationRole;
}) {
  await assertWorkspaceAdmin(input.actorUserId, input.workspaceId);

  const db = getDb();
  const email = input.email.trim().toLowerCase();

  if (!email) {
    throw new Error("Email is required.");
  }

  const [existingUser] = await db
    .select({ id: authUsersTable.id })
    .from(authUsersTable)
    .where(eq(authUsersTable.email, email))
    .limit(1);

  if (existingUser) {
    const [existingMember] = await db
      .select({ id: authMembersTable.id })
      .from(authMembersTable)
      .where(
        and(
          eq(authMembersTable.organizationId, input.workspaceId),
          eq(authMembersTable.userId, existingUser.id),
        ),
      )
      .limit(1);

    if (existingMember) {
      throw new Error("That user is already in this workspace.");
    }

    throw new Error("That email already has an account. Add the user to the workspace instead.");
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const token = createWorkspaceInvitationToken();
  const tokenIdentifier = getWorkspaceInvitationTokenIdentifier(token);
  const role = normalizeWorkspaceInvitationRole(input.role);

  const invitation = await db.transaction(async (tx) => {
    const [existingInvitation] = await tx
      .select({
        id: authInvitationsTable.id,
        email: authInvitationsTable.email,
        role: authInvitationsTable.role,
        status: authInvitationsTable.status,
        expiresAt: authInvitationsTable.expiresAt,
        createdAt: authInvitationsTable.createdAt,
      })
      .from(authInvitationsTable)
      .where(
        and(
          eq(authInvitationsTable.organizationId, input.workspaceId),
          eq(authInvitationsTable.email, email),
          eq(authInvitationsTable.status, "pending"),
        ),
      )
      .orderBy(desc(authInvitationsTable.createdAt))
      .limit(1);

    const invitationId = existingInvitation?.id ?? randomUUID();

    if (existingInvitation) {
      await tx
        .update(authInvitationsTable)
        .set({
          role,
          status: "pending",
          expiresAt,
        })
        .where(eq(authInvitationsTable.id, invitationId));

      await tx
        .delete(authVerificationsTable)
        .where(
          and(
            like(authVerificationsTable.identifier, `${workspaceInvitationTokenPrefix}%`),
            eq(authVerificationsTable.value, invitationId),
          ),
        );
    } else {
      await tx.insert(authInvitationsTable).values({
        id: invitationId,
        organizationId: input.workspaceId,
        email,
        role,
        status: "pending",
        expiresAt,
        inviterId: input.actorUserId,
        createdAt: now,
      });
    }

    await tx.insert(authVerificationsTable).values({
      id: randomUUID(),
      identifier: tokenIdentifier,
      value: invitationId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id: invitationId,
      email,
      role,
      status: "pending",
      expiresAt,
      createdAt: existingInvitation?.createdAt ?? now,
    };
  });

  return {
    invitation,
    token,
  };
}

async function findWorkspaceInvitationByToken(token: string) {
  const tokenIdentifier = getWorkspaceInvitationTokenIdentifier(token.trim());
  const db = getDb();
  const [record] = await db
    .select({
      verificationId: authVerificationsTable.id,
      verificationExpiresAt: authVerificationsTable.expiresAt,
      invitationId: authInvitationsTable.id,
      email: authInvitationsTable.email,
      role: authInvitationsTable.role,
      status: authInvitationsTable.status,
      invitationExpiresAt: authInvitationsTable.expiresAt,
      workspaceId: authOrganizationsTable.id,
      workspaceName: authOrganizationsTable.name,
      workspaceSlug: authOrganizationsTable.slug,
    })
    .from(authVerificationsTable)
    .innerJoin(authInvitationsTable, eq(authInvitationsTable.id, authVerificationsTable.value))
    .innerJoin(authOrganizationsTable, eq(authOrganizationsTable.id, authInvitationsTable.organizationId))
    .where(eq(authVerificationsTable.identifier, tokenIdentifier))
    .limit(1);

  return record ?? null;
}

export async function getWorkspaceInvitationPreviewByToken(
  token: string,
): Promise<WorkspaceInvitationPreview | null> {
  const record = await findWorkspaceInvitationByToken(token);

  if (!record) {
    return null;
  }

  return {
    id: record.invitationId,
    email: record.email,
    role: normalizeWorkspaceInvitationRole(record.role),
    status: record.status,
    expiresAt: record.invitationExpiresAt ?? record.verificationExpiresAt,
    workspaceId: record.workspaceId,
    workspaceName: record.workspaceName,
    workspaceSlug: record.workspaceSlug,
  };
}

export async function acceptWorkspaceUserInvitation(input: {
  token: string;
  name: string;
  username: string;
  passwordHash: string;
}): Promise<AcceptedWorkspaceInvitation> {
  const tokenIdentifier = getWorkspaceInvitationTokenIdentifier(input.token.trim());
  const name = input.name.trim();
  const username = input.username.trim().toLowerCase();
  const now = new Date();
  const db = getDb();

  if (!name) {
    throw new Error("Name is required.");
  }

  if (!username) {
    throw new Error("Username is required.");
  }

  const accepted = await db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        verificationId: authVerificationsTable.id,
        verificationExpiresAt: authVerificationsTable.expiresAt,
        invitationId: authInvitationsTable.id,
        email: authInvitationsTable.email,
        role: authInvitationsTable.role,
        status: authInvitationsTable.status,
        invitationExpiresAt: authInvitationsTable.expiresAt,
        workspaceId: authOrganizationsTable.id,
        workspaceSlug: authOrganizationsTable.slug,
      })
      .from(authVerificationsTable)
      .innerJoin(authInvitationsTable, eq(authInvitationsTable.id, authVerificationsTable.value))
      .innerJoin(authOrganizationsTable, eq(authOrganizationsTable.id, authInvitationsTable.organizationId))
      .where(eq(authVerificationsTable.identifier, tokenIdentifier))
      .limit(1);

    if (!record) {
      throw new Error("This invitation link is invalid or has already been used.");
    }

    const expiresAt = record.invitationExpiresAt ?? record.verificationExpiresAt;

    if (record.status !== "pending") {
      throw new Error("This invitation has already been used.");
    }

    if (expiresAt.getTime() <= now.getTime() || record.verificationExpiresAt.getTime() <= now.getTime()) {
      await tx
        .update(authInvitationsTable)
        .set({ status: "expired" })
        .where(eq(authInvitationsTable.id, record.invitationId));
      throw new Error("This invitation has expired.");
    }

    const email = record.email.trim().toLowerCase();
    const [existingEmailUser] = await tx
      .select({ id: authUsersTable.id })
      .from(authUsersTable)
      .where(eq(authUsersTable.email, email))
      .limit(1);

    if (existingEmailUser) {
      throw new Error("An account already exists for this email. Sign in instead.");
    }

    const [existingUsernameUser] = await tx
      .select({ id: authUsersTable.id })
      .from(authUsersTable)
      .where(eq(authUsersTable.username, username))
      .limit(1);

    if (existingUsernameUser) {
      throw new Error("That username is already in use.");
    }

    const userId = randomUUID();

    await tx.insert(authUsersTable).values({
      id: userId,
      email,
      name,
      username,
      displayUsername: username,
      role: "member",
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(authAccountsTable).values({
      id: randomUUID(),
      userId,
      accountId: userId,
      providerId: "credential",
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
      idToken: null,
      password: input.passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(authMembersTable).values({
      id: randomUUID(),
      organizationId: record.workspaceId,
      userId,
      role: normalizeWorkspaceInvitationRole(record.role),
      createdAt: now,
    });

    await tx
      .update(authInvitationsTable)
      .set({ status: "accepted" })
      .where(eq(authInvitationsTable.id, record.invitationId));

    await tx.delete(authVerificationsTable).where(eq(authVerificationsTable.id, record.verificationId));

    return {
      userId,
      email,
      username,
      workspaceId: record.workspaceId,
      workspaceSlug: record.workspaceSlug,
    };
  });

  await Promise.all([
    ensureUserEntitlements(accepted.userId),
    ensureUserNotificationSettings(accepted.userId),
  ]);

  return accepted;
}

export async function updateWorkspaceDetails(input: {
  actorUserId: string;
  workspaceId: string;
  name: string;
  slug?: string | null;
}) {
  const workspace = await assertWorkspaceAdmin(input.actorUserId, input.workspaceId);
  const db = getDb();
  const name = input.name.trim();

  if (!name) {
    throw new Error("Workspace name is required.");
  }

  let slug = workspace.slug;

  if (input.slug?.trim()) {
    const nextSlug = normalizeWorkspaceSlug(input.slug);

    if (nextSlug !== workspace.slug) {
      const [existing] = await db
        .select({ id: authOrganizationsTable.id })
        .from(authOrganizationsTable)
        .where(eq(authOrganizationsTable.slug, nextSlug))
        .limit(1);

      if (existing && existing.id !== input.workspaceId) {
        throw new Error("That workspace URL is already in use.");
      }

      slug = nextSlug;
    }
  }

  await db
    .update(authOrganizationsTable)
    .set({
      name,
      slug,
      updatedAt: new Date(),
    })
    .where(eq(authOrganizationsTable.id, input.workspaceId));

  return getWorkspaceForUserById(input.actorUserId, input.workspaceId);
}

export async function deleteWorkspaceForUser(input: {
  actorUserId: string;
  workspaceId: string;
}): Promise<WorkspaceSummary> {
  const workspace = await assertWorkspaceMembership(input.actorUserId, input.workspaceId);

  if (workspace.role !== "owner" || workspace.ownerUserId !== input.actorUserId) {
    throw new Error("Only the workspace owner can delete this workspace.");
  }

  const workspaces = await listWorkspacesForUser(input.actorUserId);
  const fallbackWorkspace = workspaces.find((item) => item.id !== input.workspaceId);

  if (!fallbackWorkspace) {
    throw new Error("Create or switch to another workspace before deleting this one.");
  }

  const db = getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    const [alerts, savedAds, collections] = await Promise.all([
      tx
        .select({ id: alertsTable.id })
        .from(alertsTable)
        .where(eq(alertsTable.workspaceId, input.workspaceId)),
      tx
        .select({ id: savedAdsTable.id })
        .from(savedAdsTable)
        .where(eq(savedAdsTable.workspaceId, input.workspaceId)),
      tx
        .select({ id: swipeFileCollectionsTable.id })
        .from(swipeFileCollectionsTable)
        .where(eq(swipeFileCollectionsTable.workspaceId, input.workspaceId)),
    ]);
    const alertIds = alerts.map((alert) => alert.id);
    const savedAdIds = savedAds.map((savedAd) => savedAd.id);
    const collectionIds = collections.map((collection) => collection.id);

    if (alertIds.length) {
      await tx.delete(alertDeliveriesTable).where(inArray(alertDeliveriesTable.alertId, alertIds));
    }

    if (collectionIds.length) {
      await tx
        .delete(swipeFileCollectionItemsTable)
        .where(inArray(swipeFileCollectionItemsTable.collectionId, collectionIds));
    }

    if (savedAdIds.length) {
      await tx
        .delete(swipeFileCollectionItemsTable)
        .where(inArray(swipeFileCollectionItemsTable.savedAdId, savedAdIds));
    }

    await tx
      .update(authSessionsTable)
      .set({
        activeOrganizationId: null,
        updatedAt: now,
      })
      .where(eq(authSessionsTable.activeOrganizationId, input.workspaceId));

    await tx.delete(authOrganizationsTable).where(eq(authOrganizationsTable.id, input.workspaceId));
  });

  return fallbackWorkspace;
}

export async function addExistingUserToWorkspace(input: {
  actorUserId: string;
  workspaceId: string;
  identifier: string;
  role: Exclude<WorkspaceRole, "owner">;
}) {
  await assertWorkspaceAdmin(input.actorUserId, input.workspaceId);

  const identifier = input.identifier.trim().toLowerCase();

  if (!identifier) {
    throw new Error("Enter an email or username.");
  }

  const db = getDb();
  const [targetUser] = await db
    .select({
      id: authUsersTable.id,
    })
    .from(authUsersTable)
    .where(or(eq(authUsersTable.email, identifier), eq(authUsersTable.username, identifier)))
    .limit(1);

  if (!targetUser) {
    throw new Error("No existing user was found for that email or username.");
  }

  const now = new Date();

  await db
    .insert(authMembersTable)
    .values({
      id: randomUUID(),
      organizationId: input.workspaceId,
      userId: targetUser.id,
      role: input.role === "admin" ? "admin" : "member",
      createdAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        role: input.role === "admin" ? "admin" : "member",
      },
    });

  return listWorkspaceMembers(input.actorUserId, input.workspaceId);
}

export async function assertWorkspaceMembership(userId: string, workspaceId: string) {
  const workspace = await getWorkspaceForUserById(userId, workspaceId);

  if (!workspace) {
    throw new Error("Workspace not found or access denied.");
  }

  return workspace;
}

async function resolveWorkspaceIdForUser(userId: string, workspaceId?: string | null) {
  if (workspaceId) {
    await assertWorkspaceMembership(userId, workspaceId);
    return workspaceId;
  }

  return (await ensureDefaultWorkspaceForUser(userId)).id;
}

async function getWorkspaceOwnerUserId(workspaceId: string) {
  const db = getDb();
  const [workspace] = await db
    .select({ ownerUserId: authOrganizationsTable.ownerUserId })
    .from(authOrganizationsTable)
    .where(eq(authOrganizationsTable.id, workspaceId))
    .limit(1);

  return workspace?.ownerUserId ?? null;
}

async function listWorkspaceMemberUserIds(workspaceId: string) {
  const db = getDb();
  const members = await db
    .select({ userId: authMembersTable.userId })
    .from(authMembersTable)
    .where(eq(authMembersTable.organizationId, workspaceId));

  return members.map((member) => member.userId);
}

export type UserNotificationSettingsSummary = {
  alertsPlanEnabled: boolean;
  alertsEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  digestFrequency: "instant" | "daily" | "weekly" | "monthly";
  emailImmediateDeliveryEnabled: boolean;
  emailDigestEnabled: boolean;
  emailDeliveryEnabled: boolean;
  inAppDeliveryEnabled: boolean;
  deliveryEnabled: boolean;
};

export type AccountSettingsSummary = {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  hasPassword: boolean;
  trackedCompanyLimit: number;
  trackedCompaniesUsed: number;
  alertsEnabled: boolean;
  syncEnabled: boolean;
  billingPlan: string | null;
  billingStatus: string | null;
  billingCurrentPeriodEnd: Date | null;
};

export type McpAuthRecord = {
  userId: string;
  userEmail: string;
  userUsername: string | null;
  userName: string | null;
};

export type McpAccessTokenAuthRecord = McpAuthRecord & {
  clientId: string;
  scopes: string;
  accessTokenExpiresAt: Date;
};

export type OperationsSummary = {
  queue: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    lastStartedAt: Date | null;
    lastFinishedAt: Date | null;
  };
  trackers: {
    pendingInitialIndex: number;
    active: number;
    retryableError: number;
    paused: number;
    lastSyncedAt: Date | null;
  };
  alerts: {
    emailDelivered: number;
    emailFailed: number;
    inAppDelivered: number;
    lastDeliveredAt: Date | null;
    lastFailedAt: Date | null;
  };
};

export type RecentJobActivity = {
  id: string;
  queueName: string;
  status: "queued" | "running" | "completed" | "failed";
  attempts: number;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorMessage: string | null;
};

export type JobRecord = {
  id: string;
  queueName: string;
  payload: Record<string, unknown> | null;
  status: "queued" | "running" | "completed" | "failed";
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export type TrackerAttentionItem = {
  id: string;
  advertiserName: string;
  profileUrl: string | null;
  status: "retryable_error" | "paused";
  updatedAt: Date;
  lastSyncedAt: Date | null;
};

export type AlertDeliveryFailureItem = {
  id: string;
  channel: "email" | "in_app";
  advertiserName: string;
  headline: string;
  failedAt: Date;
  errorMessage: string | null;
};

export type AdvertiserSearchMatch = {
  id: string;
  source: Source;
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
  trackedCompanyId: string | null;
  trackedStatus: TrackerStatus | null;
};

export type AdvertiserSearchQueryRecord = {
  id: string;
  normalizedQuery: string;
  displayQuery: string;
  lastRequestedAt: Date | null;
  refreshedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AdvertiserSearchCachedResult = {
  id: string;
  queryId: string;
  advertiserId: string;
  source: Source;
  sourceAdvertiserId: string;
  companyKey: string;
  displayName: string;
  rankScore: number;
  canonicalName: string;
  profileUrl: string | null;
  logoUrl: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  summary: string | null;
};

export type AdvertiserSearchCompanyResultRecord = {
  id: string;
  queryId: string;
  companyKey: string;
  displayName: string;
  websiteUrl: string | null;
  domain: string | null;
  logoUrl: string | null;
  description: string | null;
  rankScore: number;
};

export type AdvertiserSearchQuerySourceRecord = {
  queryId: string;
  source: Source;
  status: AdvertiserSearchSourceStatus;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
};

export type AdvertiserSearchAutoAddRecord = {
  id: string;
  userId: string;
  queryId: string;
  companyKey: string;
  status: AdvertiserSearchAutoAddStatus;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export type AlertNotificationInboxItem = {
  entityType: "alert";
  deliveryId: string;
  alertId: string;
  trackedCompanyId: string;
  advertiserId: string;
  advertiserName: string;
  advertiserLogoUrl: string | null;
  advertiserProfileUrl: string | null;
  adId: string;
  adTitle: string | null;
  adBody: string | null;
  adFormat: string | null;
  callToAction: string | null;
  firstSeenAt: Date | null;
  screenshotUrl: string | null;
  destinationUrl: string | null;
  headline: string;
  body: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
  isRead: boolean;
  kind: "new_ad" | "new_creative" | "landing_page";
  targetUrl: string;
  relatedAdIds: string[];
  relatedLandingPageUrl: string | null;
};

export type TrackerNotificationInboxItem = {
  entityType: "tracker";
  deliveryId: string;
  alertId: null;
  trackedCompanyId: string;
  advertiserId: string;
  advertiserName: string;
  advertiserLogoUrl: string | null;
  advertiserProfileUrl: string | null;
  adId: null;
  adTitle: null;
  adBody: null;
  adFormat: null;
  callToAction: null;
  firstSeenAt: Date | null;
  screenshotUrl: null;
  destinationUrl: null;
  headline: string;
  body: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
  isRead: boolean;
  kind: "initial_index_completed" | "initial_index_failed";
  targetUrl: string;
  relatedAdIds: string[];
  relatedLandingPageUrl: null;
  metadata: Record<string, unknown> | null;
};

export type NotificationInboxItem = AlertNotificationInboxItem | TrackerNotificationInboxItem;

export type PendingAlertDigestUser = {
  userId: string;
  digestFrequency: "daily" | "weekly" | "monthly";
  lastDigestSentAt: Date | null;
  digestAnchorAt: Date;
};

export type PendingAlertDigestItem = {
  alertId: string;
  advertiserName: string;
  headline: string;
  body: string | null;
  adTitle: string | null;
  adId: string;
  advertiserId: string;
  source: Source;
  createdAt: Date;
};

export type PendingTrackedCompany = {
  trackedCompanyId: string;
  advertiserId: string;
  advertiserName: string;
  advertiserLogoUrl: string | null;
  source: Source;
  createdAt: Date;
  status: "pending_initial_index";
};

export type BrowseAdsSort = "most_recent" | "longest_running" | "most_impressions";
export type BrowseAdsEngagementBand = "any" | "emerging" | "active" | "breakout";
export type BrowseAdsAgeBand = "any" | "new" | "recent" | "durable";

export type BrowseAdsFilters = {
  userId?: string;
  workspaceId?: string | null;
  query?: string;
  source?: Source | Source[];
  format?: string;
  callToAction?: string;
  industry?: string;
  companySize?: string;
  country?: string;
  sort?: BrowseAdsSort;
  engagementBand?: BrowseAdsEngagementBand;
  ageBand?: BrowseAdsAgeBand;
};

export type BrowseAdRecord = {
  id: string;
  source: Source;
  adLibraryUrl: string | null;
  advertiserId: string;
  advertiserName: string;
  advertiserLogoUrl: string | null;
  advertiserProfileUrl: string | null;
  advertiserWebsiteUrl: string | null;
  advertiserIndustry: string | null;
  advertiserCompanySize: string | null;
  advertiserCountry: string | null;
  advertiserSummary: string | null;
  title: string | null;
  body: string | null;
  transcript: string | null;
  language: string | null;
  callToAction: string | null;
  destinationUrl: string | null;
  googleBrandUrl: string | null;
  mediaUrl: string | null;
  posterUrl: string | null;
  videoUrl: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaAspectRatio: number | null;
  format: string | null;
  payer: string | null;
  status: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  durationDays: number;
  impressions: number | null;
  variationCount: number;
  reactions: number;
  comments: number;
  engagementBand: Exclude<BrowseAdsEngagementBand, "any">;
  ageBand: Exclude<BrowseAdsAgeBand, "any">;
  isSaved: boolean;
  isWatched: boolean;
};

export type MetaAdDetailFields = {
  adId: string | null;
  displayFormat: string | null;
  carouselSlides: number | null;
  creativeDurationSeconds: number | null;
  language: string | null;
  publisherPlatforms: string[];
  targetedCountries: string[];
  estimatedReach: string | null;
  estimatedSpend: string | null;
  ageRange: string | null;
  gender: string | null;
};

export type MetaCreativeAssetRecord = {
  id: string;
  label: string;
  previewUrl?: string | null;
  title: string | null;
  body: string | null;
  callToAction: string | null;
  destinationUrl: string | null;
  mediaUrl: string | null;
  posterUrl: string | null;
  videoUrl: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaAspectRatio: number | null;
};

export type MetaAdVariationRecord = BrowseAdRecord & {
  sourceAdId: string | null;
  metaDetails: MetaAdDetailFields | null;
  metaCreativeAssets: MetaCreativeAssetRecord[];
};

export type LinkedInAdDetailFields = {
  adType: string | null;
  carouselItems: number | null;
  creativeDurationSeconds: number | null;
  countryImpressions: Array<{ country: string; percentage: string }>;
  format: string | null;
  language: string | null;
  mediaType: string | null;
  totalImpressions: string | null;
};

export type GoogleAdDetailFields = {
  advertiserCountry: string | null;
  advertiserCountryCode: string | null;
  advertiserLegalName: string | null;
  advertiserName: string | null;
  advertiserPaymentProfileName: string | null;
  advertiserVerified: boolean | null;
  brandUrl: string | null;
  creativeId: string | null;
  creativeHeight: number | null;
  creativeVariationTotal: number | null;
  creativeWidth: number | null;
  format: string | null;
  formatCode: string | null;
  mediaType: string | null;
  topicCode: string | null;
};

export type BrowseAdsResult = {
  ads: BrowseAdRecord[];
  totalAds: number;
  availableLanguages: string[];
  availableFormats: string[];
  availableCallsToAction: string[];
  availableIndustries: string[];
  availableCompanySizes: string[];
  availableCountries: string[];
};

export type AppShellSearchResult = {
  ads: Array<{
    id: string;
    advertiserId: string;
    advertiserName: string;
    headline: string | null;
    callToAction: string | null;
    thumbnailUrl: string | null;
  }>;
  advertisers: Array<{
    id: string;
    advertiserIds: string[];
    sources: Source[];
    name: string;
    logoUrl: string | null;
    industry: string | null;
    country: string | null;
  }>;
  landingPages: Array<{
    id: string;
    advertiserId: string;
    advertiserName: string;
    title: string | null;
    url: string;
  }>;
};

export type AdDetailRecord = BrowseAdRecord & {
  source: Source;
  sourceAdId: string | null;
  snapshotTitle: string | null;
  snapshotUrl: string | null;
  screenshotUrl: string | null;
  isSaved: boolean;
  trackedCompanyId: string | null;
  googleDetails: GoogleAdDetailFields | null;
  googleCreativeAssets: MetaCreativeAssetRecord[];
  linkedInDetails: LinkedInAdDetailFields | null;
  linkedInCreativeAssets: MetaCreativeAssetRecord[];
  metaDetails: MetaAdDetailFields | null;
  metaCreativeAssets: MetaCreativeAssetRecord[];
  metaVariationTotal: number;
  metaVariations: MetaAdVariationRecord[];
  variations: Array<{
    id: string;
    title: string | null;
    body: string | null;
    transcript: string | null;
    format: string | null;
    callToAction: string | null;
    destinationUrl: string | null;
    mediaUrl: string | null;
    posterUrl: string | null;
    videoUrl: string | null;
    mediaWidth: number | null;
    mediaHeight: number | null;
    mediaAspectRatio: number | null;
    reactions: number;
    comments: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    variationReason: string;
  }>;
};

export type PublicAdShareRecord = BrowseAdRecord & {
  sourceAdId: string | null;
  screenshotUrl: string | null;
  snapshotUrl: string | null;
};

export type AdvertiserDirectoryRecord = {
  id: string;
  advertiserIds: string[];
  primaryAdvertiserId: string;
  sourceAdvertiserIds: string[];
  sources: Source[];
  sourceProfiles: Array<{ source: Source; profileUrl: string | null }>;
  canonicalName: string;
  profileUrl: string | null;
  websiteUrl: string | null;
  normalizedDomain: string | null;
  logoUrl: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  summary: string | null;
  totalAds: number;
  activeAds: number;
  averageEngagement: number;
  lastSeenAt: Date | null;
  trackedCompanyIds: string[];
  trackedCompanyId: string | null;
  trackedStatus: TrackerStatus | null;
  lastIndexedAt: Date | null;
};

export type AdvertiserDirectoryResult = {
  advertisers: AdvertiserDirectoryRecord[];
  availableIndustries: string[];
  availableCountries: string[];
};

export type AdvertiserDirectoryDetail = AdvertiserDirectoryRecord & {
  averageReactions: number;
  averageComments: number;
  formatBreakdown: Array<{ label: string; count: number }>;
  ctaBreakdown: Array<{ label: string; count: number }>;
  launchTimeline: Array<{ date: string; count: number }>;
  landingPages: Array<{
    url: string;
    title: string | null;
    source: Source;
    count: number;
    activeAdsCount: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    screenshotUrl: string | null;
    status: "active" | "inactive";
  }>;
  creativeAssets: Array<{ adId: string; label: string; previewUrl: string }>;
  copyHighlights: Array<{ adId: string; title: string | null; body: string | null; reactions: number }>;
  ads: Array<{
    id: string;
    sourceAdId: string | null;
    source: Source;
    title: string | null;
    body: string | null;
    transcript: string | null;
    format: string | null;
    callToAction: string | null;
    status: string | null;
    reactionCount: number;
    commentCount: number;
    destinationUrl: string | null;
    mediaUrl: string | null;
    posterUrl: string | null;
    videoUrl: string | null;
    mediaWidth: number | null;
    mediaHeight: number | null;
    mediaAspectRatio: number | null;
    snapshotUrl: string | null;
    snapshotTitle: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
    impressions: number | null;
    isSaved: boolean;
  }>;
  recentAds: Array<{
    id: string;
    title: string | null;
    body: string | null;
    format: string | null;
    callToAction: string | null;
    status: string | null;
    reactionCount: number;
    commentCount: number;
    destinationUrl: string | null;
    mediaUrl: string | null;
    posterUrl: string | null;
    videoUrl: string | null;
    mediaWidth: number | null;
    mediaHeight: number | null;
    mediaAspectRatio: number | null;
    snapshotUrl: string | null;
    snapshotTitle: string | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
    impressions: number | null;
    isSaved: boolean;
  }>;
};

export type WatchlistEntry = {
  trackedCompanyIds: string[];
  trackedCompanyId: string;
  advertiserId: string;
  advertiserIds: string[];
  advertiserName: string;
  advertiserLogoUrl: string | null;
  sources: Source[];
  sourceProfiles: Array<{ source: Source; profileUrl: string | null }>;
  profileUrl: string | null;
  websiteUrl: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  summary: string | null;
  status: TrackerStatus;
  lastSyncedAt: Date | null;
  createdAt: Date;
  totalAds: number;
  activeAds: number;
  lastSeenAt: Date | null;
  latestAdId: string | null;
  latestCreativeTitle: string | null;
  latestDestinationUrl: string | null;
  launchTimeline: Array<{
    date: string;
    total: number;
    sources: Partial<Record<Source, number>>;
  }>;
};

export type ActivityFeedItem = {
  id: string;
  kind: "new_ad" | "launch_burst" | "engagement_spike";
  occurredAt: Date;
  source: Source;
  trackedCompanyId: string;
  advertiserId: string;
  advertiserName: string;
  advertiserLogoUrl: string | null;
  advertiserProfileUrl: string | null;
  adId: string;
  adTitle: string | null;
  adBody: string | null;
  adFormat: string | null;
  adCallToAction: string | null;
  adDestinationUrl: string | null;
  adMediaUrl: string | null;
  screenshotUrl: string | null;
  snapshotUrl: string | null;
  reactionCount: number;
  commentCount: number;
  headline: string;
  summary: string;
  relatedCount: number;
  isSaved: boolean;
};

export type SwipeFileCollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  savedAdsCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export type SaveAdModalState = {
  savedAdId: string | null;
  note: string;
  selectedCollectionIds: string[];
  collections: SwipeFileCollectionSummary[];
};

export type SwipeFileEntry = {
  savedAdId: string;
  note: string | null;
  savedAt: Date;
  ad: BrowseAdRecord;
  trackedCompanyId: string | null;
  advertiserId: string;
  advertiserName: string;
  advertiserProfileUrl: string | null;
  adId: string;
  source: Source;
  adTitle: string | null;
  adBody: string | null;
  adFormat: string | null;
  adCallToAction: string | null;
  adDestinationUrl: string | null;
  adMediaUrl: string | null;
  screenshotUrl: string | null;
  snapshotUrl: string | null;
  reactionCount: number;
  commentCount: number;
  collections: Array<{ id: string; name: string }>;
};

export type SwipeFileLibrary = {
  collections: SwipeFileCollectionSummary[];
  entries: SwipeFileEntry[];
  savedCount: number;
};

function buildAdId(advertiserId: string, ad: PersistedAdInput) {
  return createHash("sha1")
    .update(`${advertiserId}:${ad.source}:${ad.sourceAdId ?? ""}:${ad.fingerprint}`)
    .digest("hex");
}

export async function listAdPersistenceStateByIds(adIds: string[]) {
  if (!adIds.length) {
    return new Map<string, { title: string | null; body: string | null; metadata: unknown }>();
  }

  const db = getDb();
  const rows = await db
    .select({
      id: adsTable.id,
      title: adsTable.title,
      body: adsTable.body,
      metadata: adsTable.metadata,
    })
    .from(adsTable)
    .where(inArray(adsTable.id, adIds));

  return new Map(
    rows.map((row) => [
      row.id,
      {
        title: row.title,
        body: row.body,
        metadata: row.metadata,
      },
    ]),
  );
}

async function persistAdsForAdvertiserRecords(
  executor: any,
  input: {
  advertiserId: string;
  ads: PersistedAdInput[];
},
) {
  const now = new Date();
  const landingPageCaptureCandidates: LandingPageCaptureCandidate[] = [];
  const newAds: Array<{ id: string; title?: string; body?: string }> = [];

  for (const ad of input.ads) {
    const adId = buildAdId(input.advertiserId, ad);
    const [existingAd] = await executor
      .select({
        id: adsTable.id,
        title: adsTable.title,
        body: adsTable.body,
        callToAction: adsTable.callToAction,
        destinationUrl: adsTable.destinationUrl,
        mediaUrl: adsTable.mediaUrl,
        format: adsTable.format,
        payer: adsTable.payer,
        status: adsTable.status,
        firstSeenAt: adsTable.firstSeenAt,
        metadata: adsTable.metadata,
      })
      .from(adsTable)
      .where(eq(adsTable.id, adId))
      .limit(1);
    const nextTitle = resolvePersistedAdCopy(ad.title, existingAd?.title ?? null);
    const nextBody = resolvePersistedAdCopy(ad.body, existingAd?.body ?? null);
    const nextCallToAction = resolvePersistedAdValue(ad.callToAction, existingAd?.callToAction ?? null);
    const nextDestinationUrl = cleanAdDestinationUrl(
      ad.source,
      resolvePersistedAdValue(ad.destinationUrl, existingAd?.destinationUrl ?? null),
    );
    const nextMediaUrl = resolvePersistedAdValue(ad.mediaUrl, existingAd?.mediaUrl ?? null);
    const nextFormat = resolvePersistedAdValue(ad.format, existingAd?.format ?? null);
    const nextPayer = resolvePersistedAdValue(ad.payer, existingAd?.payer ?? null);
    const nextMetadata = mergePersistedAdMetadata(existingAd?.metadata, ad.metadata);
    const nextStatus = resolvePersistedAdStatus({
      source: ad.source,
      nextStatus: ad.status,
      existingStatus: existingAd?.status ?? null,
      metadata: nextMetadata,
    });
    const nextFirstSeenAt = resolvePersistedAdFirstSeenAt({
      existingFirstSeenAt: existingAd?.firstSeenAt,
      incomingFirstSeenAt: ad.firstSeenAt,
    });

    await executor
      .insert(adsTable)
      .values({
        id: adId,
        advertiserId: input.advertiserId,
        source: ad.source,
        sourceAdId: ad.sourceAdId,
        fingerprint: ad.fingerprint,
        title: nextTitle,
        body: nextBody,
        callToAction: nextCallToAction,
        destinationUrl: nextDestinationUrl,
        mediaUrl: nextMediaUrl,
        format: nextFormat,
        payer: nextPayer,
        status: nextStatus,
        reactionCount: ad.reactionCount ?? 0,
        commentCount: ad.commentCount ?? 0,
        firstSeenAt: nextFirstSeenAt,
        lastSeenAt: ad.lastSeenAt,
        metadata: nextMetadata,
        createdAt: now,
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          title: nextTitle,
          body: nextBody,
          callToAction: nextCallToAction,
          destinationUrl: nextDestinationUrl,
          mediaUrl: nextMediaUrl,
          format: nextFormat,
          payer: nextPayer,
          status: nextStatus,
          reactionCount: ad.reactionCount ?? 0,
          commentCount: ad.commentCount ?? 0,
          firstSeenAt: nextFirstSeenAt,
          lastSeenAt: ad.lastSeenAt,
          metadata: nextMetadata,
          updatedAt: now,
        },
      });

    await executor.insert(adObservationsTable).values({
      id: randomUUID(),
      adId,
      observedAt: ad.lastSeenAt,
      rawPayload: ad.metadata,
    });

    if (!existingAd) {
      newAds.push({
        id: adId,
        title: nextTitle ?? undefined,
        body: nextBody ?? undefined,
      });
    }

    if (nextDestinationUrl) {
      const [existingSnapshot] = await executor
        .select({
          id: landingPageSnapshotsTable.id,
          screenshotUrl: landingPageSnapshotsTable.screenshotUrl,
        })
        .from(landingPageSnapshotsTable)
        .where(eq(landingPageSnapshotsTable.adId, adId))
        .limit(1);
      const destinationChanged = Boolean(existingAd && existingAd.destinationUrl !== nextDestinationUrl);
      const missingScreenshot = !existingSnapshot?.screenshotUrl?.trim();

      if (!existingSnapshot || missingScreenshot || destinationChanged) {
        landingPageCaptureCandidates.push({
          adId,
          url: nextDestinationUrl,
        });
      }
    }
  }

  await executor
    .update(advertisersTable)
    .set({
      lastIndexedAt: now,
      updatedAt: now,
    })
    .where(eq(advertisersTable.id, input.advertiserId));

  const advertiser = await syncAdvertiserCompanyMembership(executor, input.advertiserId);

  return {
    adsPersisted: input.ads.length,
    landingPageCaptureCandidates,
    newAds,
    fanoutTrackedCompanyIds: advertiser.fanoutTrackedCompanyIds,
  };
}

async function persistTrackedCompanyAds(input: {
  trackedCompanyId: string;
  ads: PersistedAdInput[];
}) {
  const db = getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [trackedCompany] = await tx
      .select({
        trackedCompanyId: trackedCompaniesTable.id,
        userId: trackedCompaniesTable.userId,
        advertiserId: advertisersTable.id,
      })
      .from(trackedCompaniesTable)
      .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
      .where(eq(trackedCompaniesTable.id, input.trackedCompanyId))
      .limit(1);

    if (!trackedCompany) {
      throw new Error(`Tracked company ${input.trackedCompanyId} was not found.`);
    }

    const persisted = await persistAdsForAdvertiserRecords(tx, {
      advertiserId: trackedCompany.advertiserId,
      ads: input.ads,
    });

    await tx
      .update(trackedCompaniesTable)
      .set({
        status: "active",
        lastSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(trackedCompaniesTable.id, trackedCompany.trackedCompanyId));

    return {
      adsPersisted: persisted.adsPersisted,
      landingPageCaptureCandidates: persisted.landingPageCaptureCandidates,
      newAds: persisted.newAds,
      fanoutTrackedCompanyIds: persisted.fanoutTrackedCompanyIds,
      trackedCompanyId: trackedCompany.trackedCompanyId,
      userId: trackedCompany.userId,
    };
  });
}

export async function getAccountSettingsSummary(input: {
  userId: string;
  workspaceId?: string | null;
  email: string;
  username: string | null;
  name: string | null;
  hasPassword?: boolean;
}): Promise<AccountSettingsSummary> {
  const ownerUserId = input.workspaceId ? (await getWorkspaceOwnerUserId(input.workspaceId)) ?? input.userId : input.userId;
  const [entitlements, billing] = await Promise.all([
    getUserEntitlementSummary(ownerUserId, input.workspaceId),
    getUserBillingSummary(ownerUserId),
  ]);

  return {
    id: input.userId,
    email: input.email,
    username: input.username,
    name: input.name,
    hasPassword: input.hasPassword ?? true,
    trackedCompanyLimit: entitlements.trackedCompanyLimit,
    trackedCompaniesUsed: entitlements.trackedCompaniesUsed,
    alertsEnabled: entitlements.alertsEnabled,
    syncEnabled: entitlements.syncEnabled,
    billingPlan: billing?.plan ?? null,
    billingStatus: billing?.status ?? null,
    billingCurrentPeriodEnd: billing?.currentPeriodEnd ?? null,
  };
}

export async function authenticateMcpAccessToken(
  accessToken: string,
): Promise<McpAccessTokenAuthRecord | null> {
  const normalizedToken = accessToken.trim();

  if (!normalizedToken) {
    return null;
  }

  const db = getDb();
  const now = new Date();
  const [record] = await db
    .select({
      userId: authOauthAccessTokensTable.userId,
      clientId: authOauthAccessTokensTable.clientId,
      scopes: authOauthAccessTokensTable.scopes,
      accessTokenExpiresAt: authOauthAccessTokensTable.accessTokenExpiresAt,
      userEmail: authUsersTable.email,
      userUsername: authUsersTable.username,
      userName: authUsersTable.name,
    })
    .from(authOauthAccessTokensTable)
    .innerJoin(authUsersTable, eq(authUsersTable.id, authOauthAccessTokensTable.userId))
    .where(eq(authOauthAccessTokensTable.accessToken, normalizedToken))
    .limit(1);

  if (!record || record.accessTokenExpiresAt.getTime() <= now.getTime() || !record.userId) {
    return null;
  }

  return {
    ...record,
    userId: record.userId,
  };
}

export async function ensureUserEntitlements(
  userId: string,
  overrides?: Partial<{
    trackedCompanyLimit: number;
    alertsEnabled: boolean;
    syncEnabled: boolean;
  }>,
) {
  const db = getDb();
  const now = new Date();
  const [existingEntitlement] = await db
    .select({
      id: entitlementsTable.id,
    })
    .from(entitlementsTable)
    .where(eq(entitlementsTable.userId, userId))
    .limit(1);

  if (existingEntitlement) {
    return existingEntitlement.id;
  }

  const entitlementId = randomUUID();

  await db.insert(entitlementsTable).values({
    id: entitlementId,
    userId,
    trackedCompanyLimit: overrides?.trackedCompanyLimit ?? appConfig.trackedCompanyLimit,
    alertsEnabled: overrides?.alertsEnabled ?? true,
    syncEnabled: overrides?.syncEnabled ?? true,
    createdAt: now,
    updatedAt: now,
  });

  return entitlementId;
}

export async function ensureUserNotificationSettings(
  userId: string,
  overrides?: Partial<{
    alertsEnabled: boolean;
    emailEnabled: boolean;
    inAppEnabled: boolean;
    digestFrequency: "instant" | "daily" | "weekly" | "monthly";
  }>,
) {
  const db = getDb();
  const now = new Date();
  const [existingSettings] = await db
    .select({
      id: notificationSettingsTable.id,
    })
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.userId, userId))
    .limit(1);

  if (existingSettings) {
    return existingSettings.id;
  }

  const settingsId = randomUUID();

  await db.insert(notificationSettingsTable).values({
    id: settingsId,
    userId,
    alertsEnabled: overrides?.alertsEnabled ?? true,
    emailEnabled: overrides?.emailEnabled ?? true,
    inAppEnabled: overrides?.inAppEnabled ?? true,
    digestFrequency: overrides?.digestFrequency ?? "daily",
    lastDigestSentAt: null,
    createdAt: now,
    updatedAt: now,
  });

  return settingsId;
}

export async function getUserNotificationSettingsSummary(userId: string): Promise<UserNotificationSettingsSummary> {
  const db = getDb();
  await Promise.all([ensureUserEntitlements(userId), ensureUserNotificationSettings(userId)]);

  const [[entitlement], [settings]] = await Promise.all([
    db
      .select({
        alertsEnabled: entitlementsTable.alertsEnabled,
      })
      .from(entitlementsTable)
      .where(eq(entitlementsTable.userId, userId))
      .limit(1),
    db
      .select({
        alertsEnabled: notificationSettingsTable.alertsEnabled,
        emailEnabled: notificationSettingsTable.emailEnabled,
        inAppEnabled: notificationSettingsTable.inAppEnabled,
        digestFrequency: notificationSettingsTable.digestFrequency,
        lastDigestSentAt: notificationSettingsTable.lastDigestSentAt,
      })
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.userId, userId))
      .limit(1),
  ]);

  const alertsPlanEnabled = entitlement?.alertsEnabled ?? true;
  const alertsEnabled = settings?.alertsEnabled ?? true;
  const emailEnabled = settings?.emailEnabled ?? true;
  const inAppEnabled = settings?.inAppEnabled ?? true;
  const digestFrequency = settings?.digestFrequency ?? "daily";
  const emailImmediateDeliveryEnabled =
    alertsPlanEnabled && alertsEnabled && emailEnabled && digestFrequency === "instant";
  const emailDigestEnabled = alertsPlanEnabled && alertsEnabled && emailEnabled && digestFrequency !== "instant";
  const emailDeliveryEnabled = emailImmediateDeliveryEnabled || emailDigestEnabled;
  const inAppDeliveryEnabled = alertsPlanEnabled && alertsEnabled && inAppEnabled;

  return {
    alertsPlanEnabled,
    alertsEnabled,
    emailEnabled,
    inAppEnabled,
    digestFrequency,
    emailImmediateDeliveryEnabled,
    emailDigestEnabled,
    emailDeliveryEnabled,
    inAppDeliveryEnabled,
    deliveryEnabled: emailDeliveryEnabled || inAppDeliveryEnabled,
  };
}

export async function updateUserNotificationSettings(
  userId: string,
  input: {
    alertsEnabled: boolean;
    emailEnabled: boolean;
    inAppEnabled: boolean;
    digestFrequency: "instant" | "daily" | "weekly" | "monthly";
  },
) {
  const db = getDb();
  await ensureUserNotificationSettings(userId);

  await db
    .update(notificationSettingsTable)
    .set({
      alertsEnabled: input.alertsEnabled,
      emailEnabled: input.emailEnabled,
      inAppEnabled: input.inAppEnabled,
      digestFrequency: input.digestFrequency,
      updatedAt: new Date(),
    })
    .where(eq(notificationSettingsTable.userId, userId));

  return getUserNotificationSettingsSummary(userId);
}

export async function getUserEntitlementSummary(userId: string, workspaceId?: string | null) {
  const db = getDb();
  await ensureUserEntitlements(userId);

  const [entitlement] = await db
    .select({
      trackedCompanyLimit: entitlementsTable.trackedCompanyLimit,
      alertsEnabled: entitlementsTable.alertsEnabled,
      syncEnabled: entitlementsTable.syncEnabled,
    })
    .from(entitlementsTable)
    .where(eq(entitlementsTable.userId, userId))
    .limit(1);

  const resolvedWorkspaceId = workspaceId ? await resolveWorkspaceIdForUser(userId, workspaceId) : null;
  const [trackedCountRow] = await db
    .select({
      value: sql<number>`count(distinct coalesce(${advertisersTable.companyId}, ${advertisersTable.id}))`,
    })
    .from(trackedCompaniesTable)
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(
      resolvedWorkspaceId
        ? eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId)
        : eq(trackedCompaniesTable.userId, userId),
    );

  return {
    trackedCompanyLimit: entitlement?.trackedCompanyLimit ?? appConfig.trackedCompanyLimit,
    trackedCompaniesUsed: trackedCountRow?.value ?? 0,
    alertsEnabled: entitlement?.alertsEnabled ?? true,
    syncEnabled: entitlement?.syncEnabled ?? true,
  };
}

function getEntitlementsForSubscriptionStatus(status: string) {
  const isActive = status === "active" || status === "trialing";

  return {
    trackedCompanyLimit: isActive ? appConfig.trackedCompanyLimit : 1,
    alertsEnabled: isActive,
    syncEnabled: isActive,
  };
}

export async function getSubscriptionByStripeSubscriptionId(stripeSubscriptionId: string) {
  const db = getDb();
  const [subscription] = await db
    .select({
      id: subscriptionsTable.id,
      userId: subscriptionsTable.userId,
      stripeCustomerId: subscriptionsTable.stripeCustomerId,
      stripeSubscriptionId: subscriptionsTable.stripeSubscriptionId,
      plan: subscriptionsTable.plan,
      status: subscriptionsTable.status,
      currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
    })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);

  return subscription ?? null;
}

export async function syncSubscriptionState(input: {
  userId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId: string;
  plan: string;
  status: string;
  currentPeriodEnd?: Date | null;
}) {
  const db = getDb();
  const now = new Date();
  const [existingSubscription] = await db
    .select({
      id: subscriptionsTable.id,
    })
    .from(subscriptionsTable)
    .where(
      or(
        eq(subscriptionsTable.stripeSubscriptionId, input.stripeSubscriptionId),
        eq(subscriptionsTable.userId, input.userId),
      ),
    )
    .limit(1);

  if (existingSubscription) {
    await db
      .update(subscriptionsTable)
      .set({
        userId: input.userId,
        stripeCustomerId: input.stripeCustomerId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        plan: input.plan,
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd ?? null,
        updatedAt: now,
      })
      .where(eq(subscriptionsTable.id, existingSubscription.id));
  } else {
    await db.insert(subscriptionsTable).values({
      id: randomUUID(),
      userId: input.userId,
      stripeCustomerId: input.stripeCustomerId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      plan: input.plan,
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd ?? null,
      createdAt: now,
      updatedAt: now,
    });
  }

  await ensureUserEntitlements(input.userId);

  const entitlements = getEntitlementsForSubscriptionStatus(input.status);

  await db
    .update(entitlementsTable)
    .set({
      trackedCompanyLimit: entitlements.trackedCompanyLimit,
      alertsEnabled: entitlements.alertsEnabled,
      syncEnabled: entitlements.syncEnabled,
      updatedAt: now,
    })
    .where(eq(entitlementsTable.userId, input.userId));
}

export async function getUserBillingSummary(userId: string) {
  const db = getDb();
  const [subscription] = await db
    .select({
      plan: subscriptionsTable.plan,
      status: subscriptionsTable.status,
      currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
    })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .orderBy(desc(subscriptionsTable.updatedAt))
    .limit(1);

  return subscription ?? null;
}

type AdvertiserWithFanout = AdvertiserRecord & {
  fanoutTrackedCompanyIds: string[];
};

async function upsertAdvertiserCompanyRecord(
  executor: any,
  input: {
    normalizedDomain: string;
    websiteUrl: string | null;
    displayName: string;
    logoUrl: string | null;
  },
) {
  const now = new Date();
  const companyId = createHash("sha1").update(input.normalizedDomain).digest("hex");

  const [existingCompany] = await executor
    .select()
    .from(advertiserCompaniesTable)
    .where(eq(advertiserCompaniesTable.id, companyId))
    .limit(1);

  const nextWebsiteUrl = toRootAdvertiserWebsiteUrl(
    input.websiteUrl ?? existingCompany?.websiteUrl ?? null,
    input.normalizedDomain,
  );
  const shouldUpgradeDisplayName = shouldPreferAdvertiserDisplayName(
    input.displayName,
    existingCompany?.displayName,
  );
  const nextDisplayName = shouldUpgradeDisplayName
    ? input.displayName
    : existingCompany?.displayName ?? input.displayName;
  const nextLogoUrl =
    !existingCompany?.logoUrl || shouldUpgradeDisplayName
      ? input.logoUrl ?? existingCompany?.logoUrl ?? null
      : existingCompany.logoUrl;

  await executor
    .insert(advertiserCompaniesTable)
    .values({
      id: companyId,
      normalizedDomain: input.normalizedDomain,
      websiteUrl: nextWebsiteUrl,
      displayName: nextDisplayName,
      logoUrl: nextLogoUrl,
      createdAt: existingCompany?.createdAt ?? now,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        websiteUrl: nextWebsiteUrl,
        displayName: nextDisplayName,
        logoUrl: nextLogoUrl,
        updatedAt: now,
      },
    });

  const [company] = await executor
    .select()
    .from(advertiserCompaniesTable)
    .where(eq(advertiserCompaniesTable.id, companyId))
    .limit(1);

  return company ?? null;
}

async function inferAdvertiserDomainFromAds(
  executor: any,
  advertiserId: string,
): Promise<{ websiteUrl: string | null; normalizedDomain: string | null }> {
  const rows = await executor
    .select({
      destinationUrl: adsTable.destinationUrl,
    })
    .from(adsTable)
    .where(eq(adsTable.advertiserId, advertiserId));

  const usableDomains: string[] = Array.from(
    new Set(
      rows
        .map((row: { destinationUrl: string | null }) => extractHostnameFromWebsite(row.destinationUrl))
        .map((hostname: string | null) => extractRegistrableDomain(hostname))
        .filter(
          (domain: string | null): domain is string =>
            Boolean(domain) && !isIgnoredAdvertiserDomain(domain),
        ),
    ),
  );

  if (usableDomains.length !== 1) {
    return {
      websiteUrl: null,
      normalizedDomain: null,
    };
  }

  return {
    websiteUrl: `https://${usableDomains[0]}/`,
    normalizedDomain: usableDomains[0],
  };
}

function normalizeAdvertiserCompanyDomainKey(value: string | null | undefined) {
  if (!value || value.trim().startsWith("name:")) {
    return null;
  }

  const normalizedWebsite = normalizeAdvertiserWebsite(value);
  const normalizedDomain =
    normalizedWebsite.normalizedDomain ?? extractRegistrableDomain(value.trim().toLowerCase());

  if (!normalizedDomain || !normalizedDomain.includes(".") || isIgnoredAdvertiserDomain(normalizedDomain)) {
    return null;
  }

  return normalizedDomain;
}

function getAdvertiserDomainBrandKey(normalizedDomain: string) {
  const brandLabel = normalizedDomain.split(".")[0] ?? normalizedDomain;

  return normalizeAdvertiserBrandKey(brandLabel.replace(/[-_]+/g, " "));
}

function isBrandDomainMismatch(input: {
  brandKey: string | null;
  normalizedDomain: string | null | undefined;
}) {
  if (!input.brandKey || !input.normalizedDomain) {
    return false;
  }

  const domainBrandKey = getAdvertiserDomainBrandKey(input.normalizedDomain);

  return Boolean(domainBrandKey && domainBrandKey !== input.brandKey);
}

function isBrandDomainMatch(input: {
  brandKey: string | null;
  normalizedDomain: string | null | undefined;
}) {
  if (!input.brandKey || !input.normalizedDomain) {
    return false;
  }

  return getAdvertiserDomainBrandKey(input.normalizedDomain) === input.brandKey;
}

function getAdvertiserDomainTail(normalizedDomain: string) {
  const labels = normalizedDomain.split(".").filter(Boolean);

  return labels.slice(1).join(".");
}

function scoreAdvertiserWebsiteCandidate(input: {
  brandKey: string | null;
  normalizedDomain: string;
  source: Source;
}) {
  let score = 0;
  const domainBrandKey = getAdvertiserDomainBrandKey(input.normalizedDomain);
  const domainTail = getAdvertiserDomainTail(input.normalizedDomain);

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

function pickAdvertiserCompanyDisplayName(members: AdvertiserBrandCompanyMember[], brandKey: string) {
  return [...members].sort((left, right) => {
    const leftMatchesBrand = normalizeAdvertiserBrandKey(left.canonicalName) === brandKey;
    const rightMatchesBrand = normalizeAdvertiserBrandKey(right.canonicalName) === brandKey;

    if (leftMatchesBrand !== rightMatchesBrand) {
      return leftMatchesBrand ? -1 : 1;
    }

    if (left.canonicalName.length !== right.canonicalName.length) {
      return left.canonicalName.length - right.canonicalName.length;
    }

    return compareAdvertiserBrandCandidates(left, right);
  })[0]?.canonicalName ?? members[0]?.canonicalName ?? brandKey;
}

type AdvertiserBrandCompanyMember = AdvertiserRecord & {
  companyNormalizedDomain: string | null;
  companyWebsiteUrl: string | null;
  companyDisplayName: string | null;
  companyLogoUrl: string | null;
};

async function selectAdvertiserBrandCompanyMembers(
  executor: any,
  advertiser: AdvertiserRecord,
): Promise<AdvertiserBrandCompanyMember[]> {
  const brandKey = normalizeAdvertiserBrandKey(advertiser.canonicalName);

  if (!brandKey) {
    return [];
  }

  const prefix = brandKey.split("-")[0] ?? brandKey;
  const candidateRows = await executor
    .select({
      id: advertisersTable.id,
      canonicalName: advertisersTable.canonicalName,
      companyDisplayName: advertiserCompaniesTable.displayName,
    })
    .from(advertisersTable)
    .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
    .where(
      and(
        sql`${advertisersTable.id} <> ${advertiser.id}`,
        or(
          sql`lower(${advertisersTable.canonicalName}) like ${`${prefix}%`}`,
          sql`lower(${advertiserCompaniesTable.displayName}) like ${`${prefix}%`}`,
        ),
      ),
    )
    .limit(100);

  const matchingIds = candidateRows
    .filter((row: { id: string; canonicalName: string; companyDisplayName: string | null }) =>
      normalizeAdvertiserBrandKey(row.canonicalName) === brandKey ||
      normalizeAdvertiserBrandKey(row.companyDisplayName) === brandKey,
    )
    .map((row: { id: string }) => row.id);

  if (!matchingIds.length) {
    return [];
  }

  return executor
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
      createdAt: advertisersTable.createdAt,
      updatedAt: advertisersTable.updatedAt,
      companyNormalizedDomain: advertiserCompaniesTable.normalizedDomain,
      companyWebsiteUrl: advertiserCompaniesTable.websiteUrl,
      companyDisplayName: advertiserCompaniesTable.displayName,
      companyLogoUrl: advertiserCompaniesTable.logoUrl,
    })
    .from(advertisersTable)
    .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
    .where(inArray(advertisersTable.id, [advertiser.id, ...matchingIds]));
}

async function consolidateAdvertiserBrandCompany(
  executor: any,
  advertiser: AdvertiserRecord,
): Promise<AdvertiserRecord> {
  const brandKey = normalizeAdvertiserBrandKey(advertiser.canonicalName);

  if (!brandKey) {
    return advertiser;
  }

  const members = await selectAdvertiserBrandCompanyMembers(executor, advertiser);

  if (members.length < 2) {
    return advertiser;
  }

  const domainHints = Array.from(
    new Set(
      members
        .map((member) =>
          normalizeAdvertiserCompanyDomainKey(member.companyNormalizedDomain) ??
          normalizeAdvertiserCompanyDomainKey(member.normalizedDomain) ??
          normalizeAdvertiserCompanyDomainKey(member.websiteUrl),
        )
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const normalizedDomain = domainHints.length === 1 ? domainHints[0] : `name:${brandKey}`;
  const companyId = createHash("sha1").update(normalizedDomain).digest("hex");
  const bestMember = [...members].sort((left, right) => compareAdvertiserBrandCandidates(left, right))[0] ?? members[0];
  const fallbackLogoUrl = members.find((member) => member.companyLogoUrl)?.companyLogoUrl ?? null;
  const logoUrl = resolveCdnAssetUrl(bestMember.logoUrl ?? fallbackLogoUrl) ?? null;
  const displayName = pickAdvertiserCompanyDisplayName(members, brandKey);
  const websiteCandidates = members
    .flatMap((member) => [
      {
        source: member.source,
        websiteUrl: member.websiteUrl,
        normalizedDomain:
          normalizeAdvertiserCompanyDomainKey(member.normalizedDomain) ??
          normalizeAdvertiserCompanyDomainKey(member.websiteUrl),
      },
      {
        source: member.source,
        websiteUrl: member.companyWebsiteUrl,
        normalizedDomain:
          normalizeAdvertiserCompanyDomainKey(member.companyNormalizedDomain) ??
          normalizeAdvertiserCompanyDomainKey(member.companyWebsiteUrl),
      },
    ])
    .filter((candidate): candidate is {
      source: Source;
      websiteUrl: string | null;
      normalizedDomain: string;
    } => Boolean(candidate.normalizedDomain))
    .map((candidate) => ({
      ...candidate,
      rootWebsiteUrl: toRootAdvertiserWebsiteUrl(candidate.websiteUrl, candidate.normalizedDomain),
      score: scoreAdvertiserWebsiteCandidate({
        brandKey,
        normalizedDomain: candidate.normalizedDomain,
        source: candidate.source,
      }),
    }));
  const websiteUrl = [...websiteCandidates].sort(
    (left, right) =>
      right.score - left.score ||
      left.normalizedDomain.length - right.normalizedDomain.length ||
      left.normalizedDomain.localeCompare(right.normalizedDomain),
  )[0]?.rootWebsiteUrl ?? null;
  const previousCompanyIds = Array.from(
    new Set(members.flatMap((member) => member.companyId ? [member.companyId] : [])),
  );
  const now = new Date();
  const [existingCompany] = await executor
    .select()
    .from(advertiserCompaniesTable)
    .where(eq(advertiserCompaniesTable.id, companyId))
    .limit(1);

  await executor
    .insert(advertiserCompaniesTable)
    .values({
      id: companyId,
      normalizedDomain,
      websiteUrl: websiteUrl ?? existingCompany?.websiteUrl ?? null,
      displayName,
      logoUrl: logoUrl ?? existingCompany?.logoUrl ?? null,
      createdAt: existingCompany?.createdAt ?? now,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        websiteUrl: websiteUrl ?? existingCompany?.websiteUrl ?? null,
        displayName,
        logoUrl: logoUrl ?? existingCompany?.logoUrl ?? null,
        updatedAt: now,
      },
    });

  const updateSet: Partial<typeof advertisersTable.$inferInsert> = {
    companyId,
    updatedAt: now,
  };

  if (!normalizedDomain.startsWith("name:")) {
    updateSet.websiteUrl = websiteUrl;
    updateSet.normalizedDomain = normalizedDomain;
  }

  await executor
    .update(advertisersTable)
    .set(updateSet)
    .where(inArray(advertisersTable.id, members.map((member) => member.id)));

  for (const previousCompanyId of previousCompanyIds) {
    if (previousCompanyId === companyId) {
      continue;
    }

    const [remainingCompanyAdvertiser] = await executor
      .select({ id: advertisersTable.id })
      .from(advertisersTable)
      .where(eq(advertisersTable.companyId, previousCompanyId))
      .limit(1);

    if (!remainingCompanyAdvertiser) {
      await executor.delete(advertiserCompaniesTable).where(eq(advertiserCompaniesTable.id, previousCompanyId));
    }
  }

  const [resolvedAdvertiser] = await executor
    .select()
    .from(advertisersTable)
    .where(eq(advertisersTable.id, advertiser.id))
    .limit(1);

  return resolvedAdvertiser ?? advertiser;
}

async function createMissingTrackedCompaniesForAdvertiser(executor: any, advertiser: AdvertiserRecord) {
  if (!advertiser.companyId) {
    return [];
  }

  const trackedUsers = await executor
    .select({
      workspaceId: trackedCompaniesTable.workspaceId,
      userId: trackedCompaniesTable.userId,
    })
    .from(trackedCompaniesTable)
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(
      and(
        eq(advertisersTable.companyId, advertiser.companyId),
        sql`${trackedCompaniesTable.advertiserId} <> ${advertiser.id}`,
      ),
    )
    .groupBy(trackedCompaniesTable.workspaceId, trackedCompaniesTable.userId);

  if (!trackedUsers.length) {
    return [];
  }

  const existingTrackers = await executor
    .select({
      workspaceId: trackedCompaniesTable.workspaceId,
      userId: trackedCompaniesTable.userId,
    })
    .from(trackedCompaniesTable)
    .where(
      and(
        eq(trackedCompaniesTable.advertiserId, advertiser.id),
        inArray(
          trackedCompaniesTable.workspaceId,
          trackedUsers
            .map((row: { workspaceId: string | null }) => row.workspaceId)
            .filter((workspaceId: string | null): workspaceId is string => Boolean(workspaceId)),
        ),
      ),
    );

  const existingWorkspaceIds = new Set(existingTrackers.map((row: { workspaceId: string | null }) => row.workspaceId));
  const now = new Date();
  const rowsToInsert = trackedUsers
    .filter((row: { workspaceId: string | null; userId: string }) => row.workspaceId && !existingWorkspaceIds.has(row.workspaceId))
    .map((row: { workspaceId: string | null; userId: string }) => ({
      id: randomUUID(),
      workspaceId: row.workspaceId,
      userId: row.userId,
      advertiserId: advertiser.id,
      status: "pending_initial_index" as const,
      lastSyncedAt: null,
      createdAt: now,
      updatedAt: now,
    }));

  if (!rowsToInsert.length) {
    return [];
  }

  await executor.insert(trackedCompaniesTable).values(rowsToInsert);

  return rowsToInsert.map((row: { id: string }) => row.id);
}

export async function syncAdvertiserCompanyMembership(executor: any, advertiserId: string): Promise<AdvertiserWithFanout> {
  const [advertiser] = await executor
    .select()
    .from(advertisersTable)
    .where(eq(advertisersTable.id, advertiserId))
    .limit(1);

  if (!advertiser) {
    throw new Error(`Advertiser ${advertiserId} was not found.`);
  }

  const brandKey = normalizeAdvertiserBrandKey(advertiser.canonicalName);
  const inferredDomain = await inferAdvertiserDomainFromAds(executor, advertiser.id);
  const shouldTrustAdDomain = Boolean(
    inferredDomain.normalizedDomain &&
    isBrandDomainMatch({ brandKey, normalizedDomain: inferredDomain.normalizedDomain }) &&
    (!advertiser.normalizedDomain ||
      isBrandDomainMismatch({ brandKey, normalizedDomain: advertiser.normalizedDomain })),
  );
  let resolvedAdvertiserInput = advertiser;

  if (shouldTrustAdDomain) {
    await executor
      .update(advertisersTable)
      .set({
        websiteUrl: inferredDomain.websiteUrl,
        normalizedDomain: inferredDomain.normalizedDomain,
        updatedAt: new Date(),
      })
      .where(eq(advertisersTable.id, advertiser.id));

    resolvedAdvertiserInput = {
      ...advertiser,
      websiteUrl: inferredDomain.websiteUrl,
      normalizedDomain: inferredDomain.normalizedDomain,
    };
  }

  if (advertiser.companyId) {
    const [existingCompany] = await executor
      .select()
      .from(advertiserCompaniesTable)
      .where(eq(advertiserCompaniesTable.id, advertiser.companyId))
      .limit(1);

    if (existingCompany && !shouldTrustAdDomain) {
      const consolidatedAdvertiser = await consolidateAdvertiserBrandCompany(executor, resolvedAdvertiserInput);
      const fanoutTrackedCompanyIds = await createMissingTrackedCompaniesForAdvertiser(executor, consolidatedAdvertiser);

      return {
        ...consolidatedAdvertiser,
        fanoutTrackedCompanyIds,
      };
    }
  }

  let nextWebsiteUrl = advertiser.websiteUrl;
  let nextNormalizedDomain = advertiser.normalizedDomain;

  if (shouldTrustAdDomain) {
    nextWebsiteUrl = inferredDomain.websiteUrl ?? nextWebsiteUrl;
    nextNormalizedDomain = inferredDomain.normalizedDomain;
  } else if (!nextNormalizedDomain) {
    nextWebsiteUrl = inferredDomain.websiteUrl ?? nextWebsiteUrl;
    nextNormalizedDomain = inferredDomain.normalizedDomain;

    if (nextNormalizedDomain) {
      await executor
        .update(advertisersTable)
        .set({
          websiteUrl: nextWebsiteUrl,
          normalizedDomain: nextNormalizedDomain,
          updatedAt: new Date(),
        })
        .where(eq(advertisersTable.id, advertiser.id));
    }
  }

  let companyId = advertiser.companyId;

  if (nextNormalizedDomain) {
    const company = await upsertAdvertiserCompanyRecord(executor, {
      normalizedDomain: nextNormalizedDomain,
      websiteUrl: nextWebsiteUrl,
      displayName: advertiser.canonicalName,
      logoUrl: advertiser.logoUrl,
    });

    if (company) {
      companyId = company.id;

      if (advertiser.companyId !== company.id) {
        await executor
          .update(advertisersTable)
          .set({
            companyId: company.id,
            websiteUrl: nextWebsiteUrl,
            normalizedDomain: nextNormalizedDomain,
            updatedAt: new Date(),
          })
          .where(eq(advertisersTable.id, advertiser.id));
      }
    }
  }

  const [resolvedAdvertiser] = await executor
    .select()
    .from(advertisersTable)
    .where(eq(advertisersTable.id, advertiser.id))
    .limit(1);

  if (!resolvedAdvertiser) {
    throw new Error(`Advertiser ${advertiser.id} could not be reloaded after company sync.`);
  }

  const consolidatedAdvertiser = await consolidateAdvertiserBrandCompany(executor, resolvedAdvertiser);
  const fanoutTrackedCompanyIds = consolidatedAdvertiser.companyId
    ? await createMissingTrackedCompaniesForAdvertiser(executor, consolidatedAdvertiser)
    : [];

  return {
    ...consolidatedAdvertiser,
    fanoutTrackedCompanyIds,
  };
}

export async function upsertAdvertiser(input: {
  id: string;
  source: Source;
  sourceAdvertiserId: string;
  canonicalName: string;
  profileUrl?: string;
  websiteUrl?: string;
  logoUrl?: string;
  industry?: string;
  companySize?: string;
  country?: string;
  summary?: string;
}) {
  const db = getDb();
  const now = new Date();
  const normalizedLogoUrl = resolveCdnAssetUrl(input.logoUrl ?? null) ?? undefined;
  const normalizedWebsite = normalizeAdvertiserWebsite(input.websiteUrl ?? null);
  const normalizedIndustry = normalizeAdvertiserIndustry(input.industry);
  const insertValues: typeof advertisersTable.$inferInsert = {
    id: randomUUID(),
    source: input.source,
    sourceAdvertiserId: input.sourceAdvertiserId,
    canonicalName: input.canonicalName,
    profileUrl: input.profileUrl ?? null,
    websiteUrl: normalizedWebsite.websiteUrl,
    normalizedDomain: normalizedWebsite.normalizedDomain,
    logoUrl: normalizedLogoUrl,
    industry: normalizedIndustry,
    companySize: input.companySize ?? null,
    country: input.country ?? null,
    summary: input.summary ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const updateSet: Partial<typeof advertisersTable.$inferInsert> = {
    canonicalName: input.canonicalName,
    profileUrl: input.profileUrl,
    logoUrl: normalizedLogoUrl,
    industry: normalizedIndustry,
    companySize: input.companySize,
    country: input.country,
    summary: input.summary,
    updatedAt: now,
  };

  if (input.websiteUrl !== undefined) {
    updateSet.websiteUrl = normalizedWebsite.websiteUrl;
    updateSet.normalizedDomain = normalizedWebsite.normalizedDomain;
  }

  await db
    .insert(advertisersTable)
    .values(insertValues)
    .onDuplicateKeyUpdate({
      set: updateSet,
    });

  const [insertedAdvertiser] = await db
    .select()
    .from(advertisersTable)
    .where(
      and(
        eq(advertisersTable.source, input.source),
        eq(advertisersTable.sourceAdvertiserId, input.sourceAdvertiserId),
      ),
    )
    .limit(1);

  if (!insertedAdvertiser) {
    throw new Error(`Advertiser ${input.source}:${input.sourceAdvertiserId} could not be persisted.`);
  }

  const advertiser = await syncAdvertiserCompanyMembership(db, insertedAdvertiser.id);

  return advertiser;
}

export async function updateAdvertiserSummary(advertiserId: string, summary: string) {
  const db = getDb();

  await db
    .update(advertisersTable)
    .set({
      summary,
      updatedAt: new Date(),
    })
    .where(eq(advertisersTable.id, advertiserId));
}

async function attachTrackedCompaniesToAdvertisers(
  userId: string,
  advertisers: AdvertiserRecord[],
  workspaceId?: string | null,
) {
  if (!advertisers.length) {
    return [];
  }

  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const trackedCompanies = await db
    .select({
      advertiserId: trackedCompaniesTable.advertiserId,
      trackedCompanyId: trackedCompaniesTable.id,
      trackedStatus: trackedCompaniesTable.status,
    })
    .from(trackedCompaniesTable)
    .where(
      and(
        eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId),
        inArray(
          trackedCompaniesTable.advertiserId,
          advertisers.map((advertiser) => advertiser.id),
        ),
      ),
    );

  const trackedCompanyByAdvertiserId = new Map(
    trackedCompanies.map((trackedCompany) => [trackedCompany.advertiserId, trackedCompany]),
  );

  return advertisers.map((advertiser) => {
    const trackedCompany = trackedCompanyByAdvertiserId.get(advertiser.id);

    return {
      ...advertiser,
      profileUrl: resolveAdvertiserSourceUrl({
        source: advertiser.source,
        sourceAdvertiserId: advertiser.sourceAdvertiserId,
        profileUrl: advertiser.profileUrl,
      }),
      logoUrl: resolveCdnAssetUrl(advertiser.logoUrl),
      trackedCompanyId: trackedCompany?.trackedCompanyId ?? null,
      trackedStatus: trackedCompany?.trackedStatus ?? null,
    };
  });
}

export async function getAdvertiserSearchQueryByNormalizedQuery(normalizedQuery: string) {
  const trimmedNormalizedQuery = normalizedQuery.trim();

  if (!trimmedNormalizedQuery) {
    return null;
  }

  const db = getDb();
  const [query] = await db
    .select()
    .from(advertiserSearchQueriesTable)
    .where(eq(advertiserSearchQueriesTable.normalizedQuery, trimmedNormalizedQuery))
    .limit(1);

  return query ?? null;
}

export async function getAdvertiserSearchQueryById(queryId: string) {
  const trimmedQueryId = queryId.trim();

  if (!trimmedQueryId) {
    return null;
  }

  const db = getDb();
  const [query] = await db
    .select()
    .from(advertiserSearchQueriesTable)
    .where(eq(advertiserSearchQueriesTable.id, trimmedQueryId))
    .limit(1);

  return query ?? null;
}

export async function upsertAdvertiserSearchQuery(input: {
  normalizedQuery: string;
  displayQuery: string;
  requestedAt?: Date;
}) {
  const db = getDb();
  const now = new Date();
  const requestedAt = input.requestedAt ?? now;
  const trimmedNormalizedQuery = input.normalizedQuery.trim();
  const trimmedDisplayQuery = input.displayQuery.trim();

  if (!trimmedNormalizedQuery || !trimmedDisplayQuery) {
    throw new Error("Advertiser search queries require both normalizedQuery and displayQuery.");
  }

  const queryId = createHash("sha1")
    .update(trimmedNormalizedQuery)
    .digest("hex");

  await db
    .insert(advertiserSearchQueriesTable)
    .values({
      id: queryId,
      normalizedQuery: trimmedNormalizedQuery,
      displayQuery: trimmedDisplayQuery,
      lastRequestedAt: requestedAt,
      refreshedAt: null,
      createdAt: now,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        displayQuery: trimmedDisplayQuery,
        lastRequestedAt: requestedAt,
        updatedAt: now,
      },
    });

  const [query] = await db
    .select()
    .from(advertiserSearchQueriesTable)
    .where(eq(advertiserSearchQueriesTable.id, queryId))
    .limit(1);

  return query ?? null;
}

export async function markAdvertiserSearchQueryRefreshed(queryId: string, refreshedAt = new Date()) {
  const db = getDb();

  await db
    .update(advertiserSearchQueriesTable)
    .set({
      refreshedAt,
      updatedAt: refreshedAt,
    })
    .where(eq(advertiserSearchQueriesTable.id, queryId));
}

export async function listAdvertiserSearchQuerySourceStatuses(queryId: string): Promise<AdvertiserSearchQuerySourceRecord[]> {
  const db = getDb();
  const rows = await db
    .select({
      queryId: advertiserSearchQuerySourcesTable.queryId,
      source: advertiserSearchQuerySourcesTable.source,
      status: advertiserSearchQuerySourcesTable.status,
      errorMessage: advertiserSearchQuerySourcesTable.errorMessage,
      startedAt: advertiserSearchQuerySourcesTable.startedAt,
      finishedAt: advertiserSearchQuerySourcesTable.finishedAt,
      updatedAt: advertiserSearchQuerySourcesTable.updatedAt,
    })
    .from(advertiserSearchQuerySourcesTable)
    .where(eq(advertiserSearchQuerySourcesTable.queryId, queryId))
    .orderBy(advertiserSearchQuerySourcesTable.source);

  return rows.map((row) => ({
    ...row,
    status: row.status as AdvertiserSearchSourceStatus,
  }));
}

export async function upsertAdvertiserSearchQuerySourceStatus(input: {
  queryId: string;
  source: Source;
  status: AdvertiserSearchSourceStatus;
  errorMessage?: string | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
}) {
  const db = getDb();
  const now = new Date();
  const sourceStatusId = createHash("sha1")
    .update(`${input.queryId}:${input.source}`)
    .digest("hex");

  await db
    .insert(advertiserSearchQuerySourcesTable)
    .values({
      id: sourceStatusId,
      queryId: input.queryId,
      source: input.source,
      status: input.status,
      errorMessage: input.errorMessage ?? null,
      startedAt: input.startedAt ?? null,
      finishedAt: input.finishedAt ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        status: input.status,
        errorMessage: input.errorMessage ?? null,
        startedAt: input.startedAt ?? null,
        finishedAt: input.finishedAt ?? null,
        updatedAt: now,
      },
    });
}

export async function listAdvertiserSearchCachedResults(queryId: string): Promise<AdvertiserSearchCachedResult[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(advertiserSearchQueryResultsTable)
    .where(eq(advertiserSearchQueryResultsTable.queryId, queryId))
    .orderBy(
      desc(advertiserSearchQueryResultsTable.rankScore),
      advertiserSearchQueryResultsTable.displayName,
      advertiserSearchQueryResultsTable.source,
    );

  return rows.map((row) => ({
    ...row,
    profileUrl: resolveAdvertiserSourceUrl({
      source: row.source,
      sourceAdvertiserId: row.sourceAdvertiserId,
      profileUrl: row.profileUrl,
    }),
    logoUrl: resolveCdnAssetUrl(row.logoUrl),
  }));
}

export async function listAdvertiserSearchCompanyResults(queryId: string): Promise<AdvertiserSearchCompanyResultRecord[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(advertiserSearchQueryCompaniesTable)
    .where(eq(advertiserSearchQueryCompaniesTable.queryId, queryId))
    .orderBy(
      desc(advertiserSearchQueryCompaniesTable.rankScore),
      advertiserSearchQueryCompaniesTable.displayName,
    );

  return rows.map((row) => ({
    ...row,
    logoUrl: resolveCdnAssetUrl(row.logoUrl),
  }));
}

export async function replaceAdvertiserSearchCachedResultsForSource(input: {
  queryId: string;
  source: Source;
  results: Array<{
    advertiserId: string;
    sourceAdvertiserId: string;
    companyKey: string;
    displayName: string;
    rankScore: number;
    canonicalName: string;
    profileUrl?: string | null;
    logoUrl?: string | null;
    industry?: string | null;
    companySize?: string | null;
    country?: string | null;
    summary?: string | null;
  }>;
}) {
  const db = getDb();
  const now = new Date();

  await db
    .delete(advertiserSearchQueryResultsTable)
    .where(
      and(
        eq(advertiserSearchQueryResultsTable.queryId, input.queryId),
        eq(advertiserSearchQueryResultsTable.source, input.source),
      ),
    );

  if (!input.results.length) {
    return;
  }

  await db.insert(advertiserSearchQueryResultsTable).values(
    input.results.map((result) => ({
      id: createHash("sha1")
        .update(`${input.queryId}:${input.source}:${result.sourceAdvertiserId}`)
        .digest("hex"),
      queryId: input.queryId,
      advertiserId: result.advertiserId,
      source: input.source,
      sourceAdvertiserId: result.sourceAdvertiserId,
      companyKey: result.companyKey,
      displayName: result.displayName,
      rankScore: result.rankScore,
      canonicalName: result.canonicalName,
      profileUrl: result.profileUrl ?? null,
      logoUrl: result.logoUrl ?? null,
      industry: normalizeAdvertiserIndustry(result.industry),
      companySize: result.companySize ?? null,
      country: result.country ?? null,
      summary: result.summary ?? null,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

export async function replaceAdvertiserSearchCompanyResults(input: {
  queryId: string;
  results: Array<{
    companyKey: string;
    displayName: string;
    websiteUrl?: string | null;
    domain?: string | null;
    logoUrl?: string | null;
    description?: string | null;
    rankScore: number;
  }>;
}) {
  const db = getDb();
  const now = new Date();

  await db
    .delete(advertiserSearchQueryCompaniesTable)
    .where(eq(advertiserSearchQueryCompaniesTable.queryId, input.queryId));

  if (!input.results.length) {
    return;
  }

  await db.insert(advertiserSearchQueryCompaniesTable).values(
    input.results.map((result) => ({
      id: createHash("sha1")
        .update(`${input.queryId}:${result.companyKey}`)
        .digest("hex"),
      queryId: input.queryId,
      companyKey: result.companyKey,
      displayName: result.displayName,
      websiteUrl: result.websiteUrl ?? null,
      domain: result.domain ?? null,
      logoUrl: resolveCdnAssetUrl(result.logoUrl ?? null) ?? null,
      description: result.description ?? null,
      rankScore: result.rankScore,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

export async function upsertAdvertiserSearchAutoAdd(input: {
  userId: string;
  workspaceId?: string | null;
  queryId: string;
  companyKey: string;
}) {
  const db = getDb();
  const now = new Date();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(input.userId, input.workspaceId);
  const autoAddId = createHash("sha1")
    .update(`${resolvedWorkspaceId}:${input.queryId}:${input.companyKey}`)
    .digest("hex");

  await db
    .insert(advertiserSearchAutoAddsTable)
    .values({
      id: autoAddId,
      workspaceId: resolvedWorkspaceId,
      userId: input.userId,
      queryId: input.queryId,
      companyKey: input.companyKey,
      status: "active",
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    .onDuplicateKeyUpdate({
      set: {
        status: "active",
        updatedAt: now,
        completedAt: null,
      },
    });

  const [autoAdd] = await db
    .select()
    .from(advertiserSearchAutoAddsTable)
    .where(eq(advertiserSearchAutoAddsTable.id, autoAddId))
    .limit(1);

  return {
    ...(autoAdd as typeof autoAdd & { status: AdvertiserSearchAutoAddStatus }),
  };
}

export async function listActiveAdvertiserSearchAutoAdds(queryId: string): Promise<AdvertiserSearchAutoAddRecord[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(advertiserSearchAutoAddsTable)
    .where(
      and(
        eq(advertiserSearchAutoAddsTable.queryId, queryId),
        eq(advertiserSearchAutoAddsTable.status, "active"),
      ),
    );

  return rows.map((row) => ({
    ...row,
    status: row.status as AdvertiserSearchAutoAddStatus,
  }));
}

export async function updateAdvertiserSearchAutoAddStatus(input: {
  id: string;
  status: Exclude<AdvertiserSearchAutoAddStatus, "active">;
}) {
  const db = getDb();
  const now = new Date();

  await db
    .update(advertiserSearchAutoAddsTable)
    .set({
      status: input.status,
      updatedAt: now,
      completedAt: now,
    })
    .where(eq(advertiserSearchAutoAddsTable.id, input.id));
}

export async function upsertAdvertiserSearchAlias(input: {
  advertiserId: string;
  query: string;
  normalizedQuery: string;
}) {
  const db = getDb();
  const now = new Date();
  const trimmedQuery = input.query.trim();
  const trimmedNormalizedQuery = input.normalizedQuery.trim();

  if (!trimmedQuery || !trimmedNormalizedQuery) {
    throw new Error("Advertiser search aliases require both query and normalizedQuery.");
  }

  const aliasId = createHash("sha1")
    .update(`${trimmedNormalizedQuery}:${input.advertiserId}`)
    .digest("hex");

  await db
    .insert(advertiserSearchAliasesTable)
    .values({
      id: aliasId,
      advertiserId: input.advertiserId,
      query: trimmedQuery,
      normalizedQuery: trimmedNormalizedQuery,
      createdAt: now,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        query: trimmedQuery,
        updatedAt: now,
      },
    });

  const [alias] = await db
    .select()
    .from(advertiserSearchAliasesTable)
    .where(eq(advertiserSearchAliasesTable.id, aliasId))
    .limit(1);

  return alias;
}

export async function searchAdvertiserAliasesForUser(input: {
  userId: string;
  workspaceId?: string | null;
  sources: Source[];
  normalizedQuery: string;
  limit?: number;
}): Promise<AdvertiserSearchMatch[]> {
  const normalizedQuery = input.normalizedQuery.trim();

  if (!normalizedQuery || !input.sources.length) {
    return [];
  }

  const db = getDb();
  const aliases = await db
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
      aliasUpdatedAt: advertiserSearchAliasesTable.updatedAt,
      advertiserLastIndexedAt: advertisersTable.lastIndexedAt,
    })
    .from(advertiserSearchAliasesTable)
    .innerJoin(advertisersTable, eq(advertiserSearchAliasesTable.advertiserId, advertisersTable.id))
    .where(
      and(
        eq(advertiserSearchAliasesTable.normalizedQuery, normalizedQuery),
        inArray(advertisersTable.source, input.sources),
      ),
    )
    .orderBy(desc(advertiserSearchAliasesTable.updatedAt), desc(advertisersTable.lastIndexedAt), advertisersTable.canonicalName)
    .limit(input.limit ?? 12);

  const dedupedAdvertisers = aliases.reduce<AdvertiserRecord[]>((collection, alias) => {
    if (collection.some((candidate) => candidate.id === alias.id)) {
      return collection;
    }

    collection.push({
      id: alias.id,
      source: alias.source,
      sourceAdvertiserId: alias.sourceAdvertiserId,
      canonicalName: alias.canonicalName,
      profileUrl: alias.profileUrl,
      websiteUrl: alias.websiteUrl,
      normalizedDomain: alias.normalizedDomain,
      companyId: alias.companyId,
      logoUrl: alias.logoUrl,
      industry: alias.industry,
      companySize: alias.companySize,
      country: alias.country,
      summary: alias.summary,
    });

    return collection;
  }, []);

  return attachTrackedCompaniesToAdvertisers(input.userId, dedupedAdvertisers, input.workspaceId);
}

export async function searchAdvertisers(input: {
  source: Source;
  query: string;
  limit?: number;
}) {
  const db = getDb();
  const trimmedQuery = input.query.trim().toLowerCase();

  if (!trimmedQuery) {
    return [];
  }

  const likeQuery = `%${trimmedQuery}%`;
  const limit = input.limit ?? 8;

  const advertisers = await db
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
    })
    .from(advertisersTable)
    .where(
      and(
        eq(advertisersTable.source, input.source),
        or(
          sql`lower(${advertisersTable.canonicalName}) like ${likeQuery}`,
          sql`lower(${advertisersTable.sourceAdvertiserId}) like ${likeQuery}`,
          sql`lower(coalesce(${advertisersTable.profileUrl}, '')) like ${likeQuery}`,
        ),
      ),
    )
    .orderBy(desc(advertisersTable.lastIndexedAt), advertisersTable.canonicalName)
    .limit(limit);

  return advertisers.map((advertiser) => ({
    ...advertiser,
    profileUrl: resolveAdvertiserSourceUrl({
      source: advertiser.source,
      sourceAdvertiserId: advertiser.sourceAdvertiserId,
      profileUrl: advertiser.profileUrl,
    }),
    logoUrl: resolveCdnAssetUrl(advertiser.logoUrl),
  }));
}

export async function searchAdvertisersForUser(input: {
  userId: string;
  workspaceId?: string | null;
  source: Source;
  query: string;
  limit?: number;
}): Promise<AdvertiserSearchMatch[]> {
  const advertisers = await searchAdvertisers({
    source: input.source,
    query: input.query,
    limit: input.limit,
  });

  return attachTrackedCompaniesToAdvertisers(input.userId, advertisers, input.workspaceId);
}

export async function createTrackedCompany(input: {
  id: string;
  userId: string;
  workspaceId?: string | null;
  advertiserId: string;
}) {
  const db = getDb();
  const now = new Date();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(input.userId, input.workspaceId);
  const [targetAdvertiser] = await db
    .select({
      id: advertisersTable.id,
      companyId: advertisersTable.companyId,
    })
    .from(advertisersTable)
    .where(eq(advertisersTable.id, input.advertiserId))
    .limit(1);

  if (!targetAdvertiser) {
    throw new Error(`Advertiser ${input.advertiserId} was not found.`);
  }

  const [existingTrackedCompany] = await db
    .select()
    .from(trackedCompaniesTable)
    .where(
      and(
        eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId),
        eq(trackedCompaniesTable.advertiserId, input.advertiserId),
      ),
    )
    .limit(1);

  if (existingTrackedCompany) {
    return {
      created: false,
      trackedCompany: existingTrackedCompany,
    };
  }

  const [existingEntityTracker] = await db
    .select({
      trackedCompanyId: trackedCompaniesTable.id,
    })
    .from(trackedCompaniesTable)
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(
      and(
        eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId),
        targetAdvertiser.companyId
          ? eq(advertisersTable.companyId, targetAdvertiser.companyId)
          : eq(advertisersTable.id, targetAdvertiser.id),
      ),
    )
    .limit(1);

  if (!existingEntityTracker) {
    const ownerUserId = (await getWorkspaceOwnerUserId(resolvedWorkspaceId)) ?? input.userId;
    const entitlement = await getUserEntitlementSummary(ownerUserId, resolvedWorkspaceId);

    if (entitlement.trackedCompaniesUsed >= entitlement.trackedCompanyLimit) {
      throw new Error(
        `Tracked company limit reached (${entitlement.trackedCompaniesUsed}/${entitlement.trackedCompanyLimit}). Contact the Adluv team to raise your beta limit.`,
      );
    }
  }

  await db
    .insert(trackedCompaniesTable)
    .values({
      id: input.id,
      workspaceId: resolvedWorkspaceId,
      userId: input.userId,
      advertiserId: input.advertiserId,
      status: "pending_initial_index",
      createdAt: now,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({
      set: {
        updatedAt: now,
      },
    });

  const [trackedCompany] = await db
    .select()
    .from(trackedCompaniesTable)
    .where(
      and(
        eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId),
        eq(trackedCompaniesTable.advertiserId, input.advertiserId),
      ),
    )
    .limit(1);

  return {
    created: true,
    trackedCompany,
  };
}

export async function addAdvertiserEntityToWatchlist(
  userId: string,
  advertiserId: string,
  workspaceId?: string | null,
) {
  const resolvedAdvertiserIds = await resolveAdvertiserEntityAdvertiserIds(advertiserId);

  if (!resolvedAdvertiserIds.length) {
    return null;
  }

  const trackedCompanies = await Promise.all(
    resolvedAdvertiserIds.map((resolvedAdvertiserId) =>
      createTrackedCompany({
        id: randomUUID(),
        userId,
        workspaceId,
        advertiserId: resolvedAdvertiserId,
      }),
    ),
  );

  return {
    advertiserIds: resolvedAdvertiserIds,
    trackedCompanies: trackedCompanies.map((result) => result.trackedCompany),
    createdTrackedCompanyIds: trackedCompanies
      .filter((result) => result.created)
      .map((result) => result.trackedCompany.id),
  };
}

export async function listTrackedCompanies(userId: string, workspaceId?: string | null) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);

  return db
    .select({
      id: trackedCompaniesTable.id,
      status: trackedCompaniesTable.status,
      lastSyncedAt: trackedCompaniesTable.lastSyncedAt,
      name: advertisersTable.canonicalName,
      profileUrl: advertisersTable.profileUrl,
    })
    .from(trackedCompaniesTable)
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId))
    .orderBy(desc(trackedCompaniesTable.createdAt));
}

export async function listWatchlistEntries(userId: string, workspaceId?: string | null): Promise<WatchlistEntry[]> {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);

  const watchedRows = await db
    .select({
      advertiserId: advertisersTable.id,
      companyId: advertisersTable.companyId,
    })
    .from(trackedCompaniesTable)
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId));

  if (!watchedRows.length) {
    return [];
  }

  const watchedAdvertiserIds = Array.from(new Set(watchedRows.map((row) => row.advertiserId)));
  const watchedCompanyIds = Array.from(
    new Set(watchedRows.map((row) => row.companyId).filter((companyId): companyId is string => Boolean(companyId))),
  );
  const watchedEntityClause = watchedCompanyIds.length
    ? or(inArray(advertisersTable.id, watchedAdvertiserIds), inArray(advertisersTable.companyId, watchedCompanyIds))
    : inArray(advertisersTable.id, watchedAdvertiserIds);
  const groupedEntries = groupAdvertiserEntityMembers(
    await selectAdvertiserEntityMembersForUser({
      userId,
      workspaceId: resolvedWorkspaceId,
      whereClause: watchedEntityClause,
      limit: 2000,
    }),
  ).filter((entry) => entry.trackedCompanyIds.length && entry.trackedCompanyId && entry.createdAt);

  if (!groupedEntries.length) {
    return [];
  }

  const advertiserIds = Array.from(new Set(groupedEntries.flatMap((entry) => entry.advertiserIds)));
  const launchStart = new Date();
  launchStart.setHours(0, 0, 0, 0);
  launchStart.setDate(launchStart.getDate() - 89);

  const latestAds = await db
    .select({
      advertiserId: adsTable.advertiserId,
      adId: adsTable.id,
      title: adsTable.title,
      destinationUrl: adsTable.destinationUrl,
      firstSeenAt: adsTable.firstSeenAt,
      lastSeenAt: adsTable.lastSeenAt,
    })
    .from(adsTable)
    .where(inArray(adsTable.advertiserId, advertiserIds))
    .orderBy(desc(adsTable.firstSeenAt), desc(adsTable.lastSeenAt));

  const launchRows = await db
    .select({
      advertiserId: adsTable.advertiserId,
      source: adsTable.source,
      firstSeenAt: adsTable.firstSeenAt,
    })
    .from(adsTable)
    .where(and(inArray(adsTable.advertiserId, advertiserIds), sql`${adsTable.firstSeenAt} >= ${launchStart}`));

  const latestAdsByAdvertiserId = new Map<string, (typeof latestAds)[number]>();

  for (const ad of latestAds) {
    const firstSeenAt = coerceDate(ad.firstSeenAt);

    if (!firstSeenAt || latestAdsByAdvertiserId.has(ad.advertiserId)) {
      continue;
    }

    latestAdsByAdvertiserId.set(ad.advertiserId, {
      ...ad,
      firstSeenAt,
      lastSeenAt: coerceDate(ad.lastSeenAt) ?? firstSeenAt,
    });
  }

  const launchTimelineByAdvertiserId = new Map<
    string,
    Map<string, { date: string; total: number; sources: Partial<Record<Source, number>> }>
  >();

  for (const row of launchRows) {
    const firstSeenAt = coerceDate(row.firstSeenAt);

    if (!firstSeenAt) {
      continue;
    }

    const date = firstSeenAt.toISOString().slice(0, 10);
    let advertiserTimeline = launchTimelineByAdvertiserId.get(row.advertiserId);

    if (!advertiserTimeline) {
      advertiserTimeline = new Map();
      launchTimelineByAdvertiserId.set(row.advertiserId, advertiserTimeline);
    }

    const current = advertiserTimeline.get(date) ?? {
      date,
      total: 0,
      sources: {},
    };

    current.total += 1;
    current.sources[row.source] = (current.sources[row.source] ?? 0) + 1;
    advertiserTimeline.set(date, current);
  }

  const entries: WatchlistEntry[] = [];

  for (const entry of groupedEntries) {
      const latestAd = entry.advertiserIds
        .map((advertiserId) => latestAdsByAdvertiserId.get(advertiserId))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
        .sort((left, right) => right.firstSeenAt.getTime() - left.firstSeenAt.getTime() || right.lastSeenAt.getTime() - left.lastSeenAt.getTime())[0];

      if (!entry.trackedCompanyIds.length || !entry.trackedCompanyId || !entry.createdAt) {
        continue;
      }

      const launchTimeline = Array.from(
        entry.advertiserIds.reduce(
          (acc, advertiserId) => {
            const advertiserTimeline = launchTimelineByAdvertiserId.get(advertiserId);

            if (!advertiserTimeline) {
              return acc;
            }

            for (const [date, item] of advertiserTimeline.entries()) {
              const current = acc.get(date) ?? {
                date,
                total: 0,
                sources: {},
              };

              current.total += item.total;

              for (const [source, count] of Object.entries(item.sources) as Array<[Source, number]>) {
                current.sources[source] = (current.sources[source] ?? 0) + count;
              }

              acc.set(date, current);
            }

            return acc;
          },
          new Map<string, { date: string; total: number; sources: Partial<Record<Source, number>> }>(),
        ),
      )
        .map(([, item]) => item)
        .sort((left, right) => left.date.localeCompare(right.date));

      entries.push({
        trackedCompanyIds: entry.trackedCompanyIds,
        trackedCompanyId: entry.trackedCompanyId,
        advertiserId: entry.id,
        advertiserIds: entry.advertiserIds,
        advertiserName: entry.canonicalName,
        advertiserLogoUrl: entry.logoUrl,
        sources: entry.sources,
        sourceProfiles: entry.sourceProfiles,
        profileUrl: entry.profileUrl,
        websiteUrl: entry.websiteUrl,
        industry: entry.industry,
        companySize: entry.companySize,
        country: entry.country,
        summary: entry.summary,
        status: entry.status ?? "active",
        lastSyncedAt: entry.lastSyncedAt,
        createdAt: entry.createdAt,
        totalAds: entry.totalAds,
        activeAds: entry.activeAds,
        lastSeenAt: entry.lastSeenAt,
        latestAdId: latestAd?.adId ?? null,
        latestCreativeTitle: latestAd?.title ?? null,
        latestDestinationUrl: latestAd?.destinationUrl ?? null,
        launchTimeline,
      });
  }

  return entries;
}

export async function listPendingTrackedCompanies(
  userId: string,
  workspaceId?: string | null,
): Promise<PendingTrackedCompany[]> {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const rows = await db
    .select({
      trackedCompanyId: trackedCompaniesTable.id,
      advertiserId: advertisersTable.id,
      advertiserCompanyId: advertisersTable.companyId,
      advertiserNormalizedDomain: advertisersTable.normalizedDomain,
      advertiserName: advertisersTable.canonicalName,
      advertiserLogoUrl: advertisersTable.logoUrl,
      source: advertisersTable.source,
      createdAt: trackedCompaniesTable.createdAt,
      status: trackedCompaniesTable.status,
    })
    .from(trackedCompaniesTable)
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(
      and(
        eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId),
        eq(trackedCompaniesTable.status, "pending_initial_index"),
        sql`exists (
          select 1
          from ${jobsTable}
          where ${jobsTable.queueName} = ${queueNames.initialIndex}
            and ${jobsTable.status} in ('queued', 'running')
            and json_unquote(json_extract(${jobsTable.payload}, '$.trackedCompanyId')) = ${trackedCompaniesTable.id}
        )`,
      ),
    )
    .orderBy(desc(trackedCompaniesTable.createdAt));

  const seenPendingKeys = new Set<string>();
  const dedupedRows = rows.filter((row) => {
    const pendingKey = [
      row.source,
      row.advertiserCompanyId ?? row.advertiserNormalizedDomain ?? row.advertiserId,
    ].join(":");

    if (seenPendingKeys.has(pendingKey)) {
      return false;
    }

    seenPendingKeys.add(pendingKey);
    return true;
  });

  return dedupedRows.map((row) => ({
    trackedCompanyId: row.trackedCompanyId,
    advertiserId: row.advertiserId,
    advertiserName: row.advertiserName,
    advertiserLogoUrl: resolveCdnAssetUrl(row.advertiserLogoUrl),
    source: row.source,
    createdAt: row.createdAt,
    status: "pending_initial_index",
  }));
}

export async function getTrackedCompanyDetail(
  userId: string,
  trackedCompanyId: string,
  workspaceId?: string | null,
) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const [trackedCompany] = await db
    .select({
      id: trackedCompaniesTable.id,
      status: trackedCompaniesTable.status,
      lastSyncedAt: trackedCompaniesTable.lastSyncedAt,
      createdAt: trackedCompaniesTable.createdAt,
      advertiserId: advertisersTable.id,
      advertiserName: advertisersTable.canonicalName,
      profileUrl: advertisersTable.profileUrl,
      industry: advertisersTable.industry,
      companySize: advertisersTable.companySize,
      country: advertisersTable.country,
      summary: advertisersTable.summary,
      source: advertisersTable.source,
      sourceAdvertiserId: advertisersTable.sourceAdvertiserId,
      lastIndexedAt: advertisersTable.lastIndexedAt,
    })
    .from(trackedCompaniesTable)
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(
      and(
        eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId),
        eq(trackedCompaniesTable.id, trackedCompanyId),
      ),
    )
    .limit(1);

  if (!trackedCompany) {
    return null;
  }

  const ads = await db
    .select({
      id: adsTable.id,
      title: adsTable.title,
      body: adsTable.body,
      callToAction: adsTable.callToAction,
      destinationUrl: adsTable.destinationUrl,
      mediaUrl: adsTable.mediaUrl,
      metadata: adsTable.metadata,
      format: adsTable.format,
      payer: adsTable.payer,
      status: adsTable.status,
      reactionCount: adsTable.reactionCount,
      commentCount: adsTable.commentCount,
      firstSeenAt: adsTable.firstSeenAt,
      lastSeenAt: adsTable.lastSeenAt,
      snapshotTitle: landingPageSnapshotsTable.title,
      snapshotUrl: landingPageSnapshotsTable.url,
      screenshotUrl: landingPageSnapshotsTable.screenshotUrl,
    })
    .from(adsTable)
    .leftJoin(landingPageSnapshotsTable, eq(landingPageSnapshotsTable.adId, adsTable.id))
    .where(eq(adsTable.advertiserId, trackedCompany.advertiserId))
    .orderBy(desc(adsTable.lastSeenAt));

  return {
    ...trackedCompany,
    ads: ads.filter((ad) => !isFixtureMetadata(ad.metadata)),
  };
}

export async function persistInitialIndexResult(input: {
  trackedCompanyId: string;
  ads: PersistedAdInput[];
}) {
  return persistTrackedCompanyAds(input);
}

export async function persistScheduledSyncResult(input: {
  trackedCompanyId: string;
  ads: PersistedAdInput[];
}) {
  return persistTrackedCompanyAds(input);
}

export async function persistAdvertiserSyncResult(input: {
  advertiserId: string;
  ads: PersistedAdInput[];
}) {
  const db = getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    const persisted = await persistAdsForAdvertiserRecords(tx, input);
    const syncedTrackedCompanies = await tx
      .select({
        trackedCompanyId: trackedCompaniesTable.id,
        workspaceId: trackedCompaniesTable.workspaceId,
        userId: trackedCompaniesTable.userId,
      })
      .from(trackedCompaniesTable)
      .where(eq(trackedCompaniesTable.advertiserId, input.advertiserId));

    if (syncedTrackedCompanies.length) {
      await tx
        .update(trackedCompaniesTable)
        .set({
          status: "active",
          lastSyncedAt: now,
          updatedAt: now,
        })
        .where(eq(trackedCompaniesTable.advertiserId, input.advertiserId));
    }

    return {
      adsPersisted: persisted.adsPersisted,
      landingPageCaptureCandidates: persisted.landingPageCaptureCandidates,
      newAds: persisted.newAds,
      fanoutTrackedCompanyIds: persisted.fanoutTrackedCompanyIds,
      advertiserId: input.advertiserId,
      syncedTrackedCompanies,
    };
  });
}

export async function importAdvertiserAdArchive(input: {
  advertiserId: string;
  ads: PersistedAdInput[];
}) {
  const db = getDb();

  return db.transaction(async (tx) => persistAdsForAdvertiserRecords(tx, input));
}

export async function markTrackedCompanyIndexFailed(trackedCompanyId: string) {
  const db = getDb();
  const [trackedCompany] = await db
    .select({
      status: trackedCompaniesTable.status,
    })
    .from(trackedCompaniesTable)
    .where(eq(trackedCompaniesTable.id, trackedCompanyId))
    .limit(1);

  if (!trackedCompany) {
    return;
  }

  await db
    .update(trackedCompaniesTable)
    .set({
      status: trackedCompany.status === "retryable_error" ? "paused" : "retryable_error",
      updatedAt: new Date(),
    })
    .where(eq(trackedCompaniesTable.id, trackedCompanyId));
}

export async function markTrackedCompanySyncFailed(trackedCompanyId: string) {
  await markTrackedCompanyIndexFailed(trackedCompanyId);
}

export async function markAdvertiserSyncFailed(advertiserId: string) {
  const db = getDb();
  const trackedCompanies = await db
    .select({
      trackedCompanyId: trackedCompaniesTable.id,
    })
    .from(trackedCompaniesTable)
    .where(
      and(
        eq(trackedCompaniesTable.advertiserId, advertiserId),
        inArray(trackedCompaniesTable.status, ["active", "retryable_error"]),
      ),
    );

  await Promise.all(
    trackedCompanies.map((trackedCompany) => markTrackedCompanyIndexFailed(trackedCompany.trackedCompanyId)),
  );
}

export async function deferAdvertiserSyncAttempt(advertiserId: string) {
  const db = getDb();

  await db
    .update(advertisersTable)
    .set({
      lastIndexedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(advertisersTable.id, advertiserId));
}

export async function deferTrackedCompanySyncAttempt(trackedCompanyId: string) {
  const db = getDb();
  const now = new Date();
  const [trackedCompany] = await db
    .select({
      advertiserId: advertisersTable.id,
    })
    .from(trackedCompaniesTable)
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(eq(trackedCompaniesTable.id, trackedCompanyId))
    .limit(1);

  if (!trackedCompany) {
    return;
  }

  await Promise.all([
    db
      .update(advertisersTable)
      .set({
        lastIndexedAt: now,
        updatedAt: now,
      })
      .where(eq(advertisersTable.id, trackedCompany.advertiserId)),
    db
      .update(trackedCompaniesTable)
      .set({
        status: "active",
        lastSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(trackedCompaniesTable.id, trackedCompanyId)),
  ]);
}

export async function getAdvertiserSyncContext(advertiserId: string) {
  const db = getDb();
  const [advertiser] = await db
    .select({
      advertiserId: advertisersTable.id,
      source: advertisersTable.source,
      sourceAdvertiserId: advertisersTable.sourceAdvertiserId,
      advertiserName: advertisersTable.canonicalName,
    })
    .from(advertisersTable)
    .where(eq(advertisersTable.id, advertiserId))
    .limit(1);

  return advertiser ?? null;
}

export async function getTrackedCompanySyncContext(trackedCompanyId: string) {
  const db = getDb();
  const [trackedCompany] = await db
    .select({
      trackedCompanyId: trackedCompaniesTable.id,
      advertiserId: advertisersTable.id,
      workspaceId: trackedCompaniesTable.workspaceId,
      userId: trackedCompaniesTable.userId,
      source: advertisersTable.source,
      sourceAdvertiserId: advertisersTable.sourceAdvertiserId,
      advertiserName: advertisersTable.canonicalName,
    })
    .from(trackedCompaniesTable)
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(eq(trackedCompaniesTable.id, trackedCompanyId))
    .limit(1);

  return trackedCompany ?? null;
}

export async function getTrackedCompanyUserSyncContext(
  userId: string,
  trackedCompanyId: string,
  workspaceId?: string | null,
) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const [trackedCompany] = await db
    .select({
      trackedCompanyId: trackedCompaniesTable.id,
      advertiserId: advertisersTable.id,
      source: advertisersTable.source,
      sourceAdvertiserId: advertisersTable.sourceAdvertiserId,
      advertiserName: advertisersTable.canonicalName,
      status: trackedCompaniesTable.status,
    })
    .from(trackedCompaniesTable)
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(and(eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId), eq(trackedCompaniesTable.id, trackedCompanyId)))
    .limit(1);

  return trackedCompany ?? null;
}

export async function createInitialIndexCompletedNotification(input: {
  jobId: string;
  trackedCompanyId: string;
  adsFound: number;
  adsPersisted: number;
  landingPagesQueued: number;
}) {
  const trackedCompany = await getTrackedCompanySyncContext(input.trackedCompanyId);

  if (!trackedCompany) {
    return null;
  }

  const db = getDb();
  const now = new Date();
  const [existingNotification] = await withOptionalTrackerNotifications(
    () =>
      db
        .select({ id: trackerNotificationsTable.id })
        .from(trackerNotificationsTable)
        .where(eq(trackerNotificationsTable.jobId, input.jobId))
        .limit(1),
    [],
  );

  if (existingNotification) {
    return existingNotification;
  }

  const notificationId = randomUUID();

  const workspaceId = trackedCompany.workspaceId ?? (await resolveWorkspaceIdForUser(trackedCompany.userId));
  const workspace = await getWorkspaceForUserById(trackedCompany.userId, workspaceId);
  const memberUserIds = await listWorkspaceMemberUserIds(workspaceId);

  await withOptionalTrackerNotifications(
    () =>
      db.insert(trackerNotificationsTable).values(memberUserIds.map((memberUserId) => ({
        id: memberUserId === trackedCompany.userId ? notificationId : randomUUID(),
        jobId: memberUserId === trackedCompany.userId ? input.jobId : `${input.jobId}:${memberUserId}`,
        workspaceId,
        userId: memberUserId,
        trackedCompanyId: trackedCompany.trackedCompanyId,
        advertiserId: trackedCompany.advertiserId,
        kind: "initial_index_completed" as const,
        headline: `${trackedCompany.advertiserName} finished initial scraping`,
        body: `Imported ${input.adsPersisted} ad${input.adsPersisted === 1 ? "" : "s"} from ${input.adsFound} discovered.`,
        targetUrl: `/w/${workspace?.slug ?? "workspace"}/advertisers/${trackedCompany.advertiserId}/overview`,
        metadata: {
          adsFound: input.adsFound,
          adsPersisted: input.adsPersisted,
          landingPagesQueued: input.landingPagesQueued,
        },
        createdAt: now,
        updatedAt: now,
      }))),
    undefined,
  );

  return {
    id: notificationId,
    userId: trackedCompany.userId,
  };
}

export async function createInitialIndexFailedNotification(input: {
  jobId: string;
  trackedCompanyId: string;
  errorMessage: string;
}) {
  const trackedCompany = await getTrackedCompanySyncContext(input.trackedCompanyId);

  if (!trackedCompany) {
    return null;
  }

  const db = getDb();
  const now = new Date();
  const [existingNotification] = await withOptionalTrackerNotifications(
    () =>
      db
        .select({ id: trackerNotificationsTable.id })
        .from(trackerNotificationsTable)
        .where(eq(trackerNotificationsTable.jobId, input.jobId))
        .limit(1),
    [],
  );

  if (existingNotification) {
    return existingNotification;
  }

  const notificationId = randomUUID();

  const workspaceId = trackedCompany.workspaceId ?? (await resolveWorkspaceIdForUser(trackedCompany.userId));
  const workspace = await getWorkspaceForUserById(trackedCompany.userId, workspaceId);
  const memberUserIds = await listWorkspaceMemberUserIds(workspaceId);

  await withOptionalTrackerNotifications(
    () =>
      db.insert(trackerNotificationsTable).values(memberUserIds.map((memberUserId) => ({
        id: memberUserId === trackedCompany.userId ? notificationId : randomUUID(),
        jobId: memberUserId === trackedCompany.userId ? input.jobId : `${input.jobId}:${memberUserId}`,
        workspaceId,
        userId: memberUserId,
        trackedCompanyId: trackedCompany.trackedCompanyId,
        advertiserId: trackedCompany.advertiserId,
        kind: "initial_index_failed" as const,
        headline: `${trackedCompany.advertiserName} needs tracker attention`,
        body: input.errorMessage,
        targetUrl: `/w/${workspace?.slug ?? "workspace"}/watchlist`,
        metadata: {
          errorMessage: input.errorMessage,
        },
        createdAt: now,
        updatedAt: now,
      }))),
    undefined,
  );

  return {
    id: notificationId,
    userId: trackedCompany.userId,
  };
}

export async function removeTrackedCompanyFromWatchlist(
  userId: string,
  trackedCompanyId: string,
  workspaceId?: string | null,
) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const [trackedCompany] = await db
    .select({
      trackedCompanyId: trackedCompaniesTable.id,
      advertiserId: advertisersTable.id,
    })
    .from(trackedCompaniesTable)
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(and(eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId), eq(trackedCompaniesTable.id, trackedCompanyId)))
    .limit(1);

  if (!trackedCompany) {
    return null;
  }

  await db.delete(trackedCompaniesTable).where(eq(trackedCompaniesTable.id, trackedCompanyId));

  return trackedCompany;
}

export async function removeAdvertiserEntityFromWatchlist(
  userId: string,
  advertiserId: string,
  workspaceId?: string | null,
) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const advertiserIds = await resolveAdvertiserEntityAdvertiserIds(advertiserId);

  if (!advertiserIds.length) {
    return null;
  }

  const trackedCompanies = await db
    .select({
      trackedCompanyId: trackedCompaniesTable.id,
      advertiserId: trackedCompaniesTable.advertiserId,
    })
    .from(trackedCompaniesTable)
    .where(
      and(
        eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId),
        inArray(trackedCompaniesTable.advertiserId, advertiserIds),
      ),
    );

  if (!trackedCompanies.length) {
    return null;
  }

  await db.delete(trackedCompaniesTable).where(
    and(
      eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId),
      inArray(
        trackedCompaniesTable.id,
        trackedCompanies.map((trackedCompany) => trackedCompany.trackedCompanyId),
      ),
    ),
  );

  return {
    advertiserId,
    advertiserIds,
    trackedCompanyIds: trackedCompanies.map((trackedCompany) => trackedCompany.trackedCompanyId),
  };
}

export async function getTrackedCompanyRetryContext(
  userId: string,
  trackedCompanyId: string,
  workspaceId?: string | null,
) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const [trackedCompany] = await db
    .select({
      trackedCompanyId: trackedCompaniesTable.id,
      status: trackedCompaniesTable.status,
      lastSyncedAt: trackedCompaniesTable.lastSyncedAt,
      advertiserId: advertisersTable.id,
      source: advertisersTable.source,
      sourceAdvertiserId: advertisersTable.sourceAdvertiserId,
    })
    .from(trackedCompaniesTable)
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(and(eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId), eq(trackedCompaniesTable.id, trackedCompanyId)))
    .limit(1);

  if (!trackedCompany) {
    return null;
  }

  const [adsSummary] = await db
    .select({ count: count(adsTable.id) })
    .from(adsTable)
    .where(eq(adsTable.advertiserId, trackedCompany.advertiserId));

  return {
    ...trackedCompany,
    adsCount: adsSummary?.count ?? 0,
  };
}

export async function markTrackedCompanyRetryQueued(input: {
  userId: string;
  workspaceId?: string | null;
  trackedCompanyId: string;
}) {
  const db = getDb();
  const trackedCompany = await getTrackedCompanyRetryContext(input.userId, input.trackedCompanyId, input.workspaceId);

  if (!trackedCompany) {
    return null;
  }

  const shouldRunInitialIndex = trackedCompany.lastSyncedAt === null && trackedCompany.adsCount === 0;
  const nextStatus = shouldRunInitialIndex ? "pending_initial_index" : "active";

  await db
    .update(trackedCompaniesTable)
    .set({
      status: nextStatus,
      updatedAt: new Date(),
    })
    .where(eq(trackedCompaniesTable.id, trackedCompany.trackedCompanyId));

  return {
    trackedCompanyId: trackedCompany.trackedCompanyId,
    nextStatus,
    queueName: shouldRunInitialIndex ? "initial-index" : "scheduled-sync",
  };
}

export async function listSyncableTrackedCompanies() {
  const db = getDb();

  return db
    .select({
      trackedCompanyId: trackedCompaniesTable.id,
      lastSyncedAt: trackedCompaniesTable.lastSyncedAt,
    })
    .from(trackedCompaniesTable)
    .innerJoin(entitlementsTable, eq(entitlementsTable.userId, trackedCompaniesTable.userId))
    .where(and(inArray(trackedCompaniesTable.status, ["active", "retryable_error"]), eq(entitlementsTable.syncEnabled, true)))
    .orderBy(desc(trackedCompaniesTable.createdAt));
}

export async function listSyncableAdvertisers() {
  const db = getDb();

  return db
    .select({
      advertiserId: advertisersTable.id,
      lastIndexedAt: advertisersTable.lastIndexedAt,
    })
    .from(advertisersTable)
    .orderBy(desc(advertisersTable.createdAt));
}

export async function listAdvertisersWithActiveAdsDueForStatusCheck(
  cutoff: Date,
  limit = 250,
): Promise<ActiveAdStatusCheckAdvertiser[]> {
  const pool = getPool();
  const cappedLimit = Math.max(1, Math.min(1000, Math.floor(limit)));
  const fixtureWhere =
    process.env.adluv_E2E_FIXTURE_MODE === "1"
      ? "1 = 1"
      : "coalesce(json_unquote(json_extract(ads.metadata, '$.status')), '') <> 'fixture'";
  const [rows] = await pool.query<
    Array<
      RowDataPacket & {
        advertiserId: string;
        source: Source;
        sourceAdvertiserId: string;
        activeAdsDue: number | string;
        lastStatusCheckedAtMs: number | string | null;
      }
    >
  >(
    `
      select
        advertisers.id as advertiserId,
        advertisers.source as source,
        advertisers.source_advertiser_id as sourceAdvertiserId,
        count(*) as activeAdsDue,
        min(cast(json_unquote(json_extract(ads.metadata, '$.activeStatusCheckedAtMs')) as unsigned)) as lastStatusCheckedAtMs
      from ads
      inner join advertisers on advertisers.id = ads.advertiser_id
      where ads.status = 'active'
        and ads.source_ad_id is not null
        and ads.source_ad_id <> ''
        and ${fixtureWhere}
        and (
          json_extract(ads.metadata, '$.activeStatusCheckedAtMs') is null
          or cast(json_unquote(json_extract(ads.metadata, '$.activeStatusCheckedAtMs')) as unsigned) <= ?
        )
      group by advertisers.id, advertisers.source, advertisers.source_advertiser_id
      order by activeAdsDue desc
      limit ?
    `,
    [cutoff.getTime(), cappedLimit],
  );

  return rows.map((row) => ({
    advertiserId: row.advertiserId,
    source: row.source,
    sourceAdvertiserId: row.sourceAdvertiserId,
    activeAdsDue: Number(row.activeAdsDue) || 0,
    lastStatusCheckedAtMs:
      row.lastStatusCheckedAtMs === null || row.lastStatusCheckedAtMs === undefined
        ? null
        : Number(row.lastStatusCheckedAtMs) || null,
  }));
}

export async function getActiveAdStatusCheckContext(
  advertiserId: string,
): Promise<ActiveAdStatusCheckContext | null> {
  const db = getDb();
  const rows = await db
    .select({
      advertiserId: advertisersTable.id,
      source: advertisersTable.source,
      sourceAdvertiserId: advertisersTable.sourceAdvertiserId,
      advertiserName: advertisersTable.canonicalName,
      adId: adsTable.id,
      sourceAdId: adsTable.sourceAdId,
      metadata: adsTable.metadata,
    })
    .from(advertisersTable)
    .innerJoin(adsTable, eq(adsTable.advertiserId, advertisersTable.id))
    .where(
      and(
        eq(advertisersTable.id, advertiserId),
        eq(adsTable.status, "active"),
        sql`${adsTable.sourceAdId} is not null`,
        sql`${adsTable.sourceAdId} <> ''`,
        notFixtureMetadataSql(adsTable.metadata),
      ),
    );

  const firstRow = rows[0];

  if (!firstRow) {
    const [advertiser] = await db
      .select({
        advertiserId: advertisersTable.id,
        source: advertisersTable.source,
        sourceAdvertiserId: advertisersTable.sourceAdvertiserId,
        advertiserName: advertisersTable.canonicalName,
      })
      .from(advertisersTable)
      .where(eq(advertisersTable.id, advertiserId))
      .limit(1);

    if (!advertiser) {
      return null;
    }

    return {
      advertiserId: advertiser.advertiserId,
      source: advertiser.source,
      sourceAdvertiserId: advertiser.sourceAdvertiserId,
      advertiserName: advertiser.advertiserName,
      activeAds: [],
    };
  }

  return {
    advertiserId: firstRow.advertiserId,
    source: firstRow.source,
    sourceAdvertiserId: firstRow.sourceAdvertiserId,
    advertiserName: firstRow.advertiserName,
    activeAds: rows
      .filter((row): row is typeof row & { sourceAdId: string } => typeof row.sourceAdId === "string")
      .map((row) => ({
        id: row.adId,
        sourceAdId: row.sourceAdId,
        metadata: cloneMetadataRecord(row.metadata),
      })),
  };
}

export async function recordActiveAdStatusCheckResults(input: ActiveAdStatusCheckResultInput) {
  const checkedSourceAdIds = Array.from(new Set(input.checkedSourceAdIds.filter(Boolean)));

  if (!checkedSourceAdIds.length) {
    return {
      checkedAds: 0,
      inactiveAds: 0,
    };
  }

  const db = getDb();
  const checkedAtMs = input.checkedAt.getTime();
  const checkedAtIso = input.checkedAt.toISOString();
  const inactiveSourceAdIds = new Set(input.inactiveSourceAdIds);
  const sourceStatuses = new Map(input.sourceStatuses.map((status) => [status.sourceAdId, status.status]));
  const rows = await db
    .select({
      id: adsTable.id,
      sourceAdId: adsTable.sourceAdId,
      metadata: adsTable.metadata,
    })
    .from(adsTable)
    .where(
      and(
        eq(adsTable.advertiserId, input.advertiserId),
        eq(adsTable.status, "active"),
        inArray(adsTable.sourceAdId, checkedSourceAdIds),
      ),
    );

  let inactiveAds = 0;

  for (const row of rows) {
    const metadata = cloneMetadataRecord(row.metadata);
    const sourceAdId = row.sourceAdId ?? "";
    const nextStatus = inactiveSourceAdIds.has(sourceAdId) ? "inactive" : "active";

    metadata.activeStatusCheckedAt = checkedAtIso;
    metadata.activeStatusCheckedAtMs = checkedAtMs;
    metadata.activeStatusLastSourceStatus = sourceStatuses.get(sourceAdId) ?? null;

    if (nextStatus === "inactive") {
      inactiveAds += 1;
      metadata.activeStatusStoppedCheckingAt = checkedAtIso;
    }

    await db
      .update(adsTable)
      .set({
        status: nextStatus,
        metadata,
        updatedAt: input.checkedAt,
      })
      .where(eq(adsTable.id, row.id));
  }

  return {
    checkedAds: rows.length,
    inactiveAds,
  };
}

function normalizeJobPayload(
  payload: unknown,
  extras?: Record<string, unknown>,
): Record<string, unknown> | null {
  const base =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? { ...(payload as Record<string, unknown>) }
      : payload === undefined
        ? {}
        : { payload };

  return Object.keys({ ...base, ...(extras ?? {}) }).length
    ? {
        ...base,
        ...(extras ?? {}),
      }
    : null;
}

function extractJobErrorMessage(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const errorMessage = (payload as Record<string, unknown>).errorMessage;
  return typeof errorMessage === "string" ? errorMessage : null;
}

function extractNumericMetadata(payload: unknown, keys: string[]) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return 0;
  }

  const record = payload as Record<string, unknown>;

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return 0;
}

function isFixtureMetadata(payload: unknown) {
  if (process.env.adluv_E2E_FIXTURE_MODE === "1") {
    return false;
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  return (payload as Record<string, unknown>).status === "fixture";
}

function notFixtureMetadataSql(column: typeof adsTable.metadata) {
  if (process.env.adluv_E2E_FIXTURE_MODE === "1") {
    return sql`1 = 1`;
  }

  return sql`coalesce(json_unquote(json_extract(${column}, '$.status')), '') <> 'fixture'`;
}

function impressionMetadataRankSql(column: typeof adsTable.metadata) {
  return sql<number>`case
    when json_extract(${column}, '$.totalImpressions') is not null then 1
    when json_extract(${column}, '$.rawPayload.reach_estimate') is not null then 1
    when json_extract(${column}, '$.rawPayload.eu_total_reach') is not null then 1
    when json_extract(${column}, '$.rawPayload.euTotalReach') is not null then 1
    when json_extract(${column}, '$.rawPayload.data_reach') is not null then 1
    when json_extract(${column}, '$.rawPayload.eu_transparency') is not null then 1
    else 0
  end`;
}

function getEngagementBand(reactions: number, comments: number): Exclude<BrowseAdsEngagementBand, "any"> {
  const score = reactions + comments;

  if (score >= 100) {
    return "breakout";
  }

  if (score >= 25) {
    return "active";
  }

  return "emerging";
}

function getAgeBand(firstSeenAt: Date, lastSeenAt: Date): Exclude<BrowseAdsAgeBand, "any"> {
  const durationDays = Math.max(
    1,
    Math.ceil((lastSeenAt.getTime() - firstSeenAt.getTime()) / (24 * 60 * 60 * 1000)),
  );

  if (durationDays > 30) {
    return "durable";
  }

  if (durationDays > 7) {
    return "recent";
  }

  return "new";
}

function mapBrowseAdRecord(row: {
  id: string;
  source: Source;
  sourceAdId: string | null;
  advertiserId: string;
  advertiserSourceAdvertiserId: string;
  companyId: string | null;
  advertiserName: string;
  advertiserLogoUrl: string | null;
  advertiserProfileUrl: string | null;
  advertiserWebsiteUrl: string | null;
  advertiserIndustry: string | null;
  advertiserCompanySize: string | null;
  advertiserCountry: string | null;
  advertiserSummary: string | null;
  title: string | null;
  body: string | null;
  callToAction: string | null;
  destinationUrl: string | null;
  mediaUrl: string | null;
  metadata: unknown;
  format: string | null;
  payer: string | null;
  status: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  reactionCount: number;
  commentCount: number;
  savedAdId: string | null;
  trackedCompanyId?: string | null;
}) {
  const mediaDimensions = getAdMediaDimensions(row.metadata);
  const status = resolveReadAdStatus(row.source, row.status, row.metadata);
  const durationEndAt = status === "active" ? new Date() : row.lastSeenAt;
  const durationDays = Math.max(
    1,
    Math.ceil((durationEndAt.getTime() - row.firstSeenAt.getTime()) / (24 * 60 * 60 * 1000)),
  );
  const title = cleanDisplayText(row.title);
  const body = cleanDisplayText(row.body);
  const callToAction = cleanDisplayText(row.callToAction);
  const payer = cleanDisplayText(row.payer);
  const googleDetails = row.source === "google" ? getGoogleAdDetails(row.metadata, row.format) : null;
  const metaDetails = row.source === "facebook" ? getMetaAdDetails(row.metadata) : null;
  const linkedInDetails = row.source === "linkedin" ? getLinkedInAdDetails(row.metadata, row.format) : null;
  const resolvedFormat = row.source === "facebook" ? getResolvedMetaAdFormat(row.metadata, row.format) : row.format;
  const variationCount = row.source === "facebook" ? getMetaVariationCount(row.metadata) : 1;
  const impressions =
    row.source === "facebook"
      ? getMetaEstimatedReachValue(getMetadataRecord(getMetadataRecord(row.metadata)?.rawPayload) ?? {})
      : row.source === "linkedin"
        ? pickFirstBoundedMetricLower([linkedInDetails?.totalImpressions])
        : null;
  const language =
    detectDisplayLanguage([title, body, callToAction].filter(Boolean).join("\n")) ??
    metaDetails?.language ??
    linkedInDetails?.language ??
    null;

  return {
    id: row.id,
    source: row.source,
    adLibraryUrl: resolveAdLibraryUrl({
      source: row.source,
      sourceAdvertiserId: row.advertiserSourceAdvertiserId,
      sourceAdId: row.sourceAdId,
      profileUrl: row.advertiserProfileUrl,
    }),
    advertiserId: buildPublicAdvertiserId({
      companyId: row.companyId,
      advertiserId: row.companyId ? null : row.advertiserId,
    }),
    advertiserName: row.advertiserName,
    advertiserLogoUrl: resolveCdnAssetUrl(row.advertiserLogoUrl),
    advertiserProfileUrl: resolveAdvertiserSourceUrl({
      source: row.source,
      sourceAdvertiserId: row.advertiserSourceAdvertiserId,
      profileUrl: row.advertiserProfileUrl,
    }),
    advertiserWebsiteUrl: row.advertiserWebsiteUrl,
    advertiserIndustry: row.advertiserIndustry,
    advertiserCompanySize: row.advertiserCompanySize,
    advertiserCountry: row.advertiserCountry,
    advertiserSummary: row.advertiserSummary,
    title,
    body,
    transcript: getAdTranscript(row.metadata),
    language,
    callToAction,
    destinationUrl: cleanAdDestinationUrl(row.source, row.destinationUrl),
    googleBrandUrl: googleDetails?.brandUrl ?? null,
    mediaUrl: getDisplayAdMediaUrl({
      source: row.source,
      mediaUrl: row.mediaUrl,
      metadata: row.metadata,
    }),
    posterUrl: getAdPosterUrl(row.metadata, row.source),
    videoUrl: getAdVideoUrl(row.metadata, row.source),
    mediaWidth: mediaDimensions?.width ?? null,
    mediaHeight: mediaDimensions?.height ?? null,
    mediaAspectRatio: mediaDimensions?.aspectRatio ?? null,
    format: googleDetails?.format ?? resolvedFormat,
    payer,
    status,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    durationDays,
    impressions,
    variationCount,
    reactions: row.reactionCount,
    comments: row.commentCount,
    engagementBand: getEngagementBand(row.reactionCount, row.commentCount),
    ageBand: getAgeBand(row.firstSeenAt, durationEndAt),
    isSaved: Boolean(row.savedAdId),
    isWatched: Boolean(row.trackedCompanyId),
  } satisfies BrowseAdRecord;
}

function getVariationReason(
  base: {
    destinationUrl: string | null;
    callToAction: string | null;
    format: string | null;
    body: string | null;
  },
  candidate: {
    destinationUrl: string | null;
    callToAction: string | null;
    format: string | null;
    body: string | null;
  },
) {
  if (base.destinationUrl && candidate.destinationUrl && base.destinationUrl === candidate.destinationUrl) {
    return "Shared landing page";
  }

  if (base.callToAction && candidate.callToAction && base.callToAction === candidate.callToAction) {
    return "Same CTA, different execution";
  }

  if (base.format && candidate.format && base.format === candidate.format) {
    return "Same format family";
  }

  if (base.body && candidate.body && base.body.slice(0, 80) === candidate.body.slice(0, 80)) {
    return "Copy variant";
  }

  return "Same advertiser sequence";
}

export async function recordJobQueued(input: {
  id: string;
  queueName: string;
  payload?: unknown;
}) {
  const db = getDb();
  const now = new Date();
  const payload = normalizeJobPayload(input.payload);
  const [existingJob] = await db.select({ id: jobsTable.id }).from(jobsTable).where(eq(jobsTable.id, input.id)).limit(1);

  if (existingJob) {
    await db
      .update(jobsTable)
      .set({
        queueName: input.queueName,
        payload,
        status: "queued",
        attempts: 0,
        updatedAt: now,
        startedAt: null,
        finishedAt: null,
      })
      .where(eq(jobsTable.id, input.id));

    return {
      created: false,
      id: input.id,
    };
  }

  await db.insert(jobsTable).values({
    id: input.id,
    queueName: input.queueName,
    payload,
    status: "queued",
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  });

  return {
    created: true,
    id: input.id,
  };
}

export async function getJobById(id: string): Promise<JobRecord | null> {
  const db = getDb();
  const [job] = await db
    .select({
      id: jobsTable.id,
      queueName: jobsTable.queueName,
      payload: jobsTable.payload,
      status: jobsTable.status,
      attempts: jobsTable.attempts,
      createdAt: jobsTable.createdAt,
      updatedAt: jobsTable.updatedAt,
      startedAt: jobsTable.startedAt,
      finishedAt: jobsTable.finishedAt,
    })
    .from(jobsTable)
    .where(eq(jobsTable.id, id))
    .limit(1);

  return job
    ? {
        ...job,
        payload:
          job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
            ? (job.payload as Record<string, unknown>)
            : null,
      }
    : null;
}

export async function claimNextQueuedJob(
  queueName: string,
): Promise<JobRecord | null> {
  const connection = await getPool().getConnection();
  const claimedAt = new Date();
  try {
    await connection.beginTransaction();

    const [candidates] = await connection.query<Array<RowDataPacket & { id: string }>>(
      `
        select id
        from jobs
        where queue_name = ?
          and job_status = 'queued'
        order by created_at asc
        limit 1
        for update skip locked
      `,
      [queueName],
    );
    const candidate = candidates[0];

    if (!candidate) {
      await connection.commit();
      return null;
    }

    await connection.query(
      `
        update jobs
        set
          job_status = 'running',
          attempts = attempts + 1,
          updated_at = ?,
          started_at = ?,
          finished_at = null
        where id = ?
      `,
      [claimedAt, claimedAt, candidate.id],
    );

    const [rows] = await connection.query<ClaimedJobRow[]>(
      `
        select
          id,
          queue_name as queueName,
          payload,
          job_status as status,
          attempts,
          created_at as createdAt,
          updated_at as updatedAt,
          started_at as startedAt,
          finished_at as finishedAt
        from jobs
        where id = ?
        limit 1
      `,
      [candidate.id],
    );

    await connection.commit();

    const row = rows[0];

    if (!row) {
      return null;
    }

    return {
      ...row,
      payload:
        row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
          ? (row.payload as Record<string, unknown>)
          : null,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function markJobRunning(input: { id: string; attempts: number }) {
  const db = getDb();

  await db
    .update(jobsTable)
    .set({
      status: "running",
      attempts: input.attempts,
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(jobsTable.id, input.id));
}

export async function markJobCompleted(input: { id: string; attempts: number }) {
  const db = getDb();
  const now = new Date();

  await db
    .update(jobsTable)
    .set({
      status: "completed",
      attempts: input.attempts,
      updatedAt: now,
      finishedAt: now,
    })
    .where(eq(jobsTable.id, input.id));
}

export async function markJobFailed(input: {
  id: string;
  attempts: number;
  errorMessage: string;
}) {
  const db = getDb();
  const now = new Date();
  const [existingJob] = await db
    .select({ payload: jobsTable.payload })
    .from(jobsTable)
    .where(eq(jobsTable.id, input.id))
    .limit(1);

  await db
    .update(jobsTable)
    .set({
      payload: normalizeJobPayload(existingJob?.payload, {
        errorMessage: input.errorMessage,
      }),
      status: "failed",
      attempts: input.attempts,
      updatedAt: now,
      finishedAt: now,
    })
    .where(eq(jobsTable.id, input.id));
}

export async function createAlertsForAds(input: {
  userId: string;
  workspaceId?: string | null;
  trackedCompanyId: string;
  advertiserName: string;
  ads: Array<{ id: string; title?: string; body?: string }>;
}) {
  if (!input.ads.length) {
    return [];
  }

  const db = getDb();
  const workspaceId = await resolveWorkspaceIdForUser(input.userId, input.workspaceId);
  const memberUserIds = await listWorkspaceMemberUserIds(workspaceId);

  if (!memberUserIds.length) {
    return [];
  }

  const createdAlerts: Array<{
    id: string;
    headline: string;
    body: string;
    shouldSendEmail: boolean;
  }> = [];

  for (const memberUserId of memberUserIds) {
    const notificationSettings = await getUserNotificationSettingsSummary(memberUserId);

    if (!notificationSettings.deliveryEnabled) {
      continue;
    }

    for (const ad of input.ads) {
      const [existingAlert] = await db
        .select({ id: alertsTable.id })
        .from(alertsTable)
        .where(
          and(
            eq(alertsTable.workspaceId, workspaceId),
            eq(alertsTable.userId, memberUserId),
            eq(alertsTable.trackedCompanyId, input.trackedCompanyId),
            eq(alertsTable.adId, ad.id),
          ),
        )
        .limit(1);

      if (existingAlert) {
        continue;
      }

      const headline = `New ad detected for ${input.advertiserName}`;
      const body = ad.title ?? ad.body ?? "A newly observed creative was captured during the latest sync.";
      const alertId = randomUUID();

      await db.insert(alertsTable).values({
        id: alertId,
        workspaceId,
        userId: memberUserId,
        trackedCompanyId: input.trackedCompanyId,
        adId: ad.id,
        headline,
        body,
        createdAt: new Date(),
      });

      if (notificationSettings.inAppDeliveryEnabled) {
        await recordAlertInAppDelivered({
          alertId,
        });
      }

      createdAlerts.push({
        id: alertId,
        headline,
        body,
        shouldSendEmail: notificationSettings.emailImmediateDeliveryEnabled,
      });
    }
  }

  return createdAlerts;
}

export async function getAlertDeliveryContext(alertId: string) {
  const db = getDb();
  const [alert] = await db
    .select({
      id: alertsTable.id,
      workspaceSlug: authOrganizationsTable.slug,
      userId: alertsTable.userId,
      headline: alertsTable.headline,
      body: alertsTable.body,
      advertiserId: advertisersTable.id,
      advertiserName: advertisersTable.canonicalName,
      advertiserLogoUrl: advertisersTable.logoUrl,
      source: adsTable.source,
      adId: adsTable.id,
      adTitle: adsTable.title,
      adBody: adsTable.body,
      adFormat: adsTable.format,
      adCallToAction: adsTable.callToAction,
      adDestinationUrl: adsTable.destinationUrl,
      adMediaUrl: adsTable.mediaUrl,
      firstSeenAt: adsTable.firstSeenAt,
    })
    .from(alertsTable)
    .innerJoin(authOrganizationsTable, eq(alertsTable.workspaceId, authOrganizationsTable.id))
    .innerJoin(adsTable, eq(alertsTable.adId, adsTable.id))
    .innerJoin(advertisersTable, eq(adsTable.advertiserId, advertisersTable.id))
    .where(eq(alertsTable.id, alertId))
    .limit(1);

  return alert
    ? {
        ...alert,
        advertiserLogoUrl: resolveCdnAssetUrl(alert.advertiserLogoUrl),
        adMediaUrl: resolveCdnAssetUrl(alert.adMediaUrl),
      }
    : null;
}

export async function getAlertEmailDeliveryStatus(alertId: string) {
  const db = getDb();
  const [delivery] = await db
    .select({
      id: alertDeliveriesTable.id,
      deliveredAt: alertDeliveriesTable.deliveredAt,
      failedAt: alertDeliveriesTable.failedAt,
      errorMessage: alertDeliveriesTable.errorMessage,
    })
    .from(alertDeliveriesTable)
    .where(and(eq(alertDeliveriesTable.alertId, alertId), eq(alertDeliveriesTable.channel, "email")))
    .limit(1);

  return delivery ?? null;
}

export async function recordAlertEmailDelivered(input: {
  alertId: string;
  providerMessageId?: string;
}) {
  const db = getDb();
  const now = new Date();
  const [existingDelivery] = await db
    .select({
      id: alertDeliveriesTable.id,
      errorMessage: alertDeliveriesTable.errorMessage,
    })
    .from(alertDeliveriesTable)
    .where(and(eq(alertDeliveriesTable.alertId, input.alertId), eq(alertDeliveriesTable.channel, "email")))
    .limit(1);

  const errorMessage = input.providerMessageId
    ? `provider_message_id:${input.providerMessageId}`
    : existingDelivery?.errorMessage ?? null;

  if (existingDelivery) {
    await db
      .update(alertDeliveriesTable)
      .set({
        deliveredAt: now,
        failedAt: null,
        errorMessage,
      })
      .where(eq(alertDeliveriesTable.id, existingDelivery.id));

    return {
      id: existingDelivery.id,
      created: false,
    };
  }

  const deliveryId = randomUUID();

  await db.insert(alertDeliveriesTable).values({
    id: deliveryId,
    alertId: input.alertId,
    channel: "email",
    deliveredAt: now,
    errorMessage,
  });

  return {
    id: deliveryId,
    created: true,
  };
}

export async function recordAlertEmailFailed(input: {
  alertId: string;
  errorMessage: string;
}) {
  const db = getDb();
  const now = new Date();
  const [existingDelivery] = await db
    .select({
      id: alertDeliveriesTable.id,
      deliveredAt: alertDeliveriesTable.deliveredAt,
    })
    .from(alertDeliveriesTable)
    .where(and(eq(alertDeliveriesTable.alertId, input.alertId), eq(alertDeliveriesTable.channel, "email")))
    .limit(1);

  if (existingDelivery?.deliveredAt) {
    return {
      id: existingDelivery.id,
      skipped: true,
    };
  }

  if (existingDelivery) {
    await db
      .update(alertDeliveriesTable)
      .set({
        failedAt: now,
        errorMessage: input.errorMessage,
      })
      .where(eq(alertDeliveriesTable.id, existingDelivery.id));

    return {
      id: existingDelivery.id,
      skipped: false,
    };
  }

  const deliveryId = randomUUID();

  await db.insert(alertDeliveriesTable).values({
    id: deliveryId,
    alertId: input.alertId,
    channel: "email",
    failedAt: now,
    errorMessage: input.errorMessage,
  });

  return {
    id: deliveryId,
    skipped: false,
  };
}

export async function recordAlertInAppDelivered(input: { alertId: string }) {
  const db = getDb();
  const now = new Date();
  const [existingDelivery] = await db
    .select({
      id: alertDeliveriesTable.id,
    })
    .from(alertDeliveriesTable)
    .where(and(eq(alertDeliveriesTable.alertId, input.alertId), eq(alertDeliveriesTable.channel, "in_app")))
    .limit(1);

  if (existingDelivery) {
    await db
      .update(alertDeliveriesTable)
      .set({
        deliveredAt: now,
        failedAt: null,
        errorMessage: null,
      })
      .where(eq(alertDeliveriesTable.id, existingDelivery.id));

    return {
      id: existingDelivery.id,
      created: false,
    };
  }

  const deliveryId = randomUUID();

  await db.insert(alertDeliveriesTable).values({
    id: deliveryId,
    alertId: input.alertId,
    channel: "in_app",
    deliveredAt: now,
    errorMessage: null,
  });

  return {
    id: deliveryId,
    created: true,
  };
}

export async function persistLandingPageSnapshot(input: {
  adId: string;
  url: string;
  title?: string;
  html?: string;
  screenshotUrl?: string;
  capturedAt: Date;
}) {
  const db = getDb();
  const title = cleanLandingPageTitle(input.title);
  const html = truncateTextColumnValue(input.html);
  const screenshotUrl = resolveCdnAssetUrl(input.screenshotUrl ?? null) ?? input.screenshotUrl;
  const [existingSnapshot] = await db
    .select({
      id: landingPageSnapshotsTable.id,
    })
    .from(landingPageSnapshotsTable)
    .where(eq(landingPageSnapshotsTable.adId, input.adId))
    .limit(1);

  if (existingSnapshot) {
    await db
      .update(landingPageSnapshotsTable)
      .set({
        url: input.url,
        title,
        html,
        screenshotUrl,
        capturedAt: input.capturedAt,
      })
      .where(eq(landingPageSnapshotsTable.id, existingSnapshot.id));

    return {
      id: existingSnapshot.id,
      created: false,
    };
  }

  const id = randomUUID();

  await db.insert(landingPageSnapshotsTable).values({
    id,
    adId: input.adId,
    url: input.url,
    title,
    html,
    screenshotUrl,
    capturedAt: input.capturedAt,
  });

  return {
    id,
    created: true,
  };
}

export async function getOperationsSummary(): Promise<OperationsSummary> {
  const db = getDb();

  const [
    queuedJobs,
    runningJobs,
    completedJobs,
    failedJobs,
    lastStartedJob,
    lastFinishedJob,
    pendingInitialIndexTrackers,
    activeTrackers,
    retryableErrorTrackers,
    pausedTrackers,
    lastSyncedTracker,
    emailDeliveredAlerts,
    emailFailedAlerts,
    inAppDeliveredAlerts,
    lastDeliveredAlert,
    lastFailedAlert,
  ] = await Promise.all([
    db.select({ value: count(jobsTable.id) }).from(jobsTable).where(eq(jobsTable.status, "queued")),
    db.select({ value: count(jobsTable.id) }).from(jobsTable).where(eq(jobsTable.status, "running")),
    db.select({ value: count(jobsTable.id) }).from(jobsTable).where(eq(jobsTable.status, "completed")),
    db.select({ value: count(jobsTable.id) }).from(jobsTable).where(eq(jobsTable.status, "failed")),
    db
      .select({ startedAt: jobsTable.startedAt })
      .from(jobsTable)
      .where(sql`${jobsTable.startedAt} is not null`)
      .orderBy(desc(jobsTable.startedAt))
      .limit(1),
    db
      .select({ finishedAt: jobsTable.finishedAt })
      .from(jobsTable)
      .where(sql`${jobsTable.finishedAt} is not null`)
      .orderBy(desc(jobsTable.finishedAt))
      .limit(1),
    db
      .select({ value: count(trackedCompaniesTable.id) })
      .from(trackedCompaniesTable)
      .where(eq(trackedCompaniesTable.status, "pending_initial_index")),
    db.select({ value: count(trackedCompaniesTable.id) }).from(trackedCompaniesTable).where(eq(trackedCompaniesTable.status, "active")),
    db
      .select({ value: count(trackedCompaniesTable.id) })
      .from(trackedCompaniesTable)
      .where(eq(trackedCompaniesTable.status, "retryable_error")),
    db.select({ value: count(trackedCompaniesTable.id) }).from(trackedCompaniesTable).where(eq(trackedCompaniesTable.status, "paused")),
    db
      .select({ lastSyncedAt: trackedCompaniesTable.lastSyncedAt })
      .from(trackedCompaniesTable)
      .where(sql`${trackedCompaniesTable.lastSyncedAt} is not null`)
      .orderBy(desc(trackedCompaniesTable.lastSyncedAt))
      .limit(1),
    db
      .select({ value: count(alertDeliveriesTable.id) })
      .from(alertDeliveriesTable)
      .where(and(eq(alertDeliveriesTable.channel, "email"), sql`${alertDeliveriesTable.deliveredAt} is not null`)),
    db
      .select({ value: count(alertDeliveriesTable.id) })
      .from(alertDeliveriesTable)
      .where(and(eq(alertDeliveriesTable.channel, "email"), sql`${alertDeliveriesTable.failedAt} is not null`)),
    db
      .select({ value: count(alertDeliveriesTable.id) })
      .from(alertDeliveriesTable)
      .where(and(eq(alertDeliveriesTable.channel, "in_app"), sql`${alertDeliveriesTable.deliveredAt} is not null`)),
    db
      .select({ deliveredAt: alertDeliveriesTable.deliveredAt })
      .from(alertDeliveriesTable)
      .where(sql`${alertDeliveriesTable.deliveredAt} is not null`)
      .orderBy(desc(alertDeliveriesTable.deliveredAt))
      .limit(1),
    db
      .select({ failedAt: alertDeliveriesTable.failedAt })
      .from(alertDeliveriesTable)
      .where(sql`${alertDeliveriesTable.failedAt} is not null`)
      .orderBy(desc(alertDeliveriesTable.failedAt))
      .limit(1),
  ]);

  return {
    queue: {
      queued: queuedJobs[0]?.value ?? 0,
      running: runningJobs[0]?.value ?? 0,
      completed: completedJobs[0]?.value ?? 0,
      failed: failedJobs[0]?.value ?? 0,
      lastStartedAt: lastStartedJob[0]?.startedAt ?? null,
      lastFinishedAt: lastFinishedJob[0]?.finishedAt ?? null,
    },
    trackers: {
      pendingInitialIndex: pendingInitialIndexTrackers[0]?.value ?? 0,
      active: activeTrackers[0]?.value ?? 0,
      retryableError: retryableErrorTrackers[0]?.value ?? 0,
      paused: pausedTrackers[0]?.value ?? 0,
      lastSyncedAt: lastSyncedTracker[0]?.lastSyncedAt ?? null,
    },
    alerts: {
      emailDelivered: emailDeliveredAlerts[0]?.value ?? 0,
      emailFailed: emailFailedAlerts[0]?.value ?? 0,
      inAppDelivered: inAppDeliveredAlerts[0]?.value ?? 0,
      lastDeliveredAt: lastDeliveredAlert[0]?.deliveredAt ?? null,
      lastFailedAt: lastFailedAlert[0]?.failedAt ?? null,
    },
  };
}

export async function listRecentJobActivity(limit = 12): Promise<RecentJobActivity[]> {
  const db = getDb();
  const jobs = await db
    .select({
      id: jobsTable.id,
      queueName: jobsTable.queueName,
      status: jobsTable.status,
      attempts: jobsTable.attempts,
      updatedAt: jobsTable.updatedAt,
      startedAt: jobsTable.startedAt,
      finishedAt: jobsTable.finishedAt,
      payload: jobsTable.payload,
    })
    .from(jobsTable)
    .orderBy(desc(jobsTable.updatedAt))
    .limit(limit);

  return jobs.map((job) => ({
    id: job.id,
    queueName: job.queueName,
    status: job.status,
    attempts: job.attempts,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    errorMessage: extractJobErrorMessage(job.payload),
  }));
}

export async function listTrackersNeedingAttention(limit = 12): Promise<TrackerAttentionItem[]> {
  const db = getDb();

  return db
    .select({
      id: trackedCompaniesTable.id,
      advertiserName: advertisersTable.canonicalName,
      profileUrl: advertisersTable.profileUrl,
      status: trackedCompaniesTable.status,
      updatedAt: trackedCompaniesTable.updatedAt,
      lastSyncedAt: trackedCompaniesTable.lastSyncedAt,
    })
    .from(trackedCompaniesTable)
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(or(eq(trackedCompaniesTable.status, "retryable_error"), eq(trackedCompaniesTable.status, "paused")))
    .orderBy(desc(trackedCompaniesTable.updatedAt))
    .limit(limit) as Promise<TrackerAttentionItem[]>;
}

export async function listRecentAlertDeliveryFailures(limit = 12): Promise<AlertDeliveryFailureItem[]> {
  const db = getDb();
  const failures = await db
    .select({
      id: alertDeliveriesTable.id,
      channel: alertDeliveriesTable.channel,
      advertiserName: advertisersTable.canonicalName,
      headline: alertsTable.headline,
      failedAt: alertDeliveriesTable.failedAt,
      errorMessage: alertDeliveriesTable.errorMessage,
    })
    .from(alertDeliveriesTable)
    .innerJoin(alertsTable, eq(alertDeliveriesTable.alertId, alertsTable.id))
    .innerJoin(trackedCompaniesTable, eq(alertsTable.trackedCompanyId, trackedCompaniesTable.id))
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .where(sql`${alertDeliveriesTable.failedAt} is not null`)
    .orderBy(desc(alertDeliveriesTable.failedAt))
    .limit(limit);

  return failures.map((failure) => ({
    id: failure.id,
    channel: failure.channel,
    advertiserName: failure.advertiserName,
    headline: failure.headline,
    failedAt: failure.failedAt as Date,
    errorMessage: failure.errorMessage,
  }));
}

function getAlertNotificationKind(input: {
  headline: string;
  body: string | null;
  adTitle: string | null;
}) {
  const haystack = `${input.headline} ${input.body ?? ""} ${input.adTitle ?? ""}`.toLowerCase();

  if (haystack.includes("landing page")) {
    return "landing_page" as const;
  }

  if (haystack.includes("creative")) {
    return "new_creative" as const;
  }

  return "new_ad" as const;
}

function getAlertNotificationTargetUrl(input: {
  advertiserId: string;
  adId: string;
  headline: string;
  body: string | null;
  adTitle: string | null;
}) {
  const kind = getAlertNotificationKind(input);

  if (kind === "landing_page") {
    return `/advertisers/${input.advertiserId}/landing-pages`;
  }

  if (kind === "new_creative") {
    return `/advertisers/${input.advertiserId}/assets`;
  }

  return `/ads/${input.adId}`;
}

export async function listNotificationInbox(
  userId: string,
  limit = 50,
  workspaceId?: string | null,
): Promise<NotificationInboxItem[]> {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const [alertRows, trackerRows] = await Promise.all([
    db
    .select({
      deliveryId: alertDeliveriesTable.id,
      alertId: alertsTable.id,
      trackedCompanyId: trackedCompaniesTable.id,
      advertiserId: advertisersTable.id,
      advertiserSource: advertisersTable.source,
      advertiserSourceAdvertiserId: advertisersTable.sourceAdvertiserId,
      companyId: advertisersTable.companyId,
      advertiserName: advertiserDisplayNameSql(),
      advertiserLogoUrl: advertiserLogoUrlSql(),
      advertiserProfileUrl: advertisersTable.profileUrl,
      adId: adsTable.id,
      adTitle: adsTable.title,
      adBody: adsTable.body,
      adFormat: adsTable.format,
      callToAction: adsTable.callToAction,
      firstSeenAt: adsTable.firstSeenAt,
      screenshotUrl: landingPageSnapshotsTable.screenshotUrl,
      destinationUrl: adsTable.destinationUrl,
      headline: alertsTable.headline,
      body: alertsTable.body,
      createdAt: alertsTable.createdAt,
      deliveredAt: alertDeliveriesTable.deliveredAt,
      readAt: alertDeliveriesTable.readAt,
    })
    .from(alertDeliveriesTable)
    .innerJoin(alertsTable, eq(alertDeliveriesTable.alertId, alertsTable.id))
    .innerJoin(
      trackedCompaniesTable,
      and(
        eq(alertsTable.trackedCompanyId, trackedCompaniesTable.id),
        eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId),
      ),
    )
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
    .innerJoin(adsTable, eq(alertsTable.adId, adsTable.id))
    .leftJoin(landingPageSnapshotsTable, eq(landingPageSnapshotsTable.adId, adsTable.id))
    .where(
      and(
        eq(alertsTable.workspaceId, resolvedWorkspaceId),
        eq(alertsTable.userId, userId),
        eq(alertDeliveriesTable.channel, "in_app"),
      ),
    )
    .orderBy(desc(alertsTable.createdAt))
    .limit(limit),
    withOptionalTrackerNotifications(
      () =>
        db
          .select({
            deliveryId: trackerNotificationsTable.id,
            trackedCompanyId: trackerNotificationsTable.trackedCompanyId,
            advertiserId: advertisersTable.id,
            advertiserSource: advertisersTable.source,
            advertiserSourceAdvertiserId: advertisersTable.sourceAdvertiserId,
            companyId: advertisersTable.companyId,
            advertiserName: advertiserDisplayNameSql(),
            advertiserLogoUrl: advertiserLogoUrlSql(),
            advertiserProfileUrl: advertisersTable.profileUrl,
            headline: trackerNotificationsTable.headline,
            body: trackerNotificationsTable.body,
            createdAt: trackerNotificationsTable.createdAt,
            readAt: trackerNotificationsTable.readAt,
            kind: trackerNotificationsTable.kind,
            targetUrl: trackerNotificationsTable.targetUrl,
            metadata: trackerNotificationsTable.metadata,
          })
          .from(trackerNotificationsTable)
          .innerJoin(advertisersTable, eq(trackerNotificationsTable.advertiserId, advertisersTable.id))
          .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
          .where(and(eq(trackerNotificationsTable.workspaceId, resolvedWorkspaceId), eq(trackerNotificationsTable.userId, userId)))
          .orderBy(desc(trackerNotificationsTable.createdAt))
          .limit(limit),
      [],
    ),
  ]);

  const items: NotificationInboxItem[] = [
    ...alertRows.map((row) => ({
      entityType: "alert" as const,
      deliveryId: row.deliveryId,
      alertId: row.alertId,
      trackedCompanyId: row.trackedCompanyId,
      advertiserId: buildPublicAdvertiserId({
        companyId: row.companyId,
        advertiserId: row.companyId ? null : row.advertiserId,
      }),
      advertiserName: row.advertiserName,
      advertiserLogoUrl: resolveCdnAssetUrl(row.advertiserLogoUrl),
      advertiserProfileUrl: resolveAdvertiserSourceUrl({
        source: row.advertiserSource,
        sourceAdvertiserId: row.advertiserSourceAdvertiserId,
        profileUrl: row.advertiserProfileUrl,
      }),
      adId: row.adId,
      adTitle: row.adTitle,
      adBody: row.adBody,
      adFormat: row.adFormat,
      callToAction: row.callToAction,
      firstSeenAt: row.firstSeenAt,
      screenshotUrl: resolveCdnAssetUrl(row.screenshotUrl),
      destinationUrl: row.destinationUrl,
      headline: row.headline,
      body: row.body,
      createdAt: row.createdAt,
      deliveredAt: row.deliveredAt,
      readAt: row.readAt,
      isRead: Boolean(row.readAt),
      kind: getAlertNotificationKind(row),
      targetUrl: getAlertNotificationTargetUrl({
        advertiserId: buildPublicAdvertiserId({
          companyId: row.companyId,
          advertiserId: row.companyId ? null : row.advertiserId,
        }),
        adId: row.adId,
        headline: row.headline,
        body: row.body,
        adTitle: row.adTitle,
      }),
      relatedAdIds: [row.adId],
      relatedLandingPageUrl: row.destinationUrl,
    })),
    ...trackerRows.map((row) => ({
      entityType: "tracker" as const,
      deliveryId: row.deliveryId,
      alertId: null,
      trackedCompanyId: row.trackedCompanyId,
      advertiserId: buildPublicAdvertiserId({
        companyId: row.companyId,
        advertiserId: row.companyId ? null : row.advertiserId,
      }),
      advertiserName: row.advertiserName,
      advertiserLogoUrl: resolveCdnAssetUrl(row.advertiserLogoUrl),
      advertiserProfileUrl: resolveAdvertiserSourceUrl({
        source: row.advertiserSource,
        sourceAdvertiserId: row.advertiserSourceAdvertiserId,
        profileUrl: row.advertiserProfileUrl,
      }),
      adId: null,
      adTitle: null,
      adBody: null,
      adFormat: null,
      callToAction: null,
      firstSeenAt: null,
      screenshotUrl: null,
      destinationUrl: null,
      headline: row.headline,
      body: row.body,
      createdAt: row.createdAt,
      deliveredAt: null,
      readAt: row.readAt,
      isRead: Boolean(row.readAt),
      kind: row.kind,
      targetUrl: row.targetUrl,
      relatedAdIds: [],
      relatedLandingPageUrl: null,
      metadata:
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null,
    })),
  ];

  return items
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, limit);
}

export async function getUnreadNotificationInboxCount(userId: string, workspaceId?: string | null) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const [[alertRow], [trackerRow]] = await Promise.all([
    db
      .select({ value: count(alertDeliveriesTable.id) })
      .from(alertDeliveriesTable)
      .innerJoin(alertsTable, eq(alertDeliveriesTable.alertId, alertsTable.id))
      .where(
        and(
          eq(alertsTable.userId, userId),
          eq(alertsTable.workspaceId, resolvedWorkspaceId),
          eq(alertDeliveriesTable.channel, "in_app"),
          sql`${alertDeliveriesTable.readAt} is null`,
        ),
      ),
    withOptionalTrackerNotifications(
      () =>
        db
          .select({ value: count(trackerNotificationsTable.id) })
          .from(trackerNotificationsTable)
          .where(
            and(
              eq(trackerNotificationsTable.workspaceId, resolvedWorkspaceId),
              eq(trackerNotificationsTable.userId, userId),
              sql`${trackerNotificationsTable.readAt} is null`,
            ),
          ),
      [],
    ),
  ]);

  return (alertRow?.value ?? 0) + (trackerRow?.value ?? 0);
}

export async function getUnreadActivityNotificationCount(userId: string, workspaceId?: string | null) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const rows = await db
    .select({ metadata: adsTable.metadata })
    .from(alertDeliveriesTable)
    .innerJoin(alertsTable, eq(alertDeliveriesTable.alertId, alertsTable.id))
    .innerJoin(
      trackedCompaniesTable,
      and(
        eq(alertsTable.trackedCompanyId, trackedCompaniesTable.id),
        eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId),
      ),
    )
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .innerJoin(adsTable, eq(alertsTable.adId, adsTable.id))
    .where(
      and(
        eq(alertsTable.userId, userId),
        eq(alertsTable.workspaceId, resolvedWorkspaceId),
        eq(alertDeliveriesTable.channel, "in_app"),
        sql`${alertDeliveriesTable.readAt} is null`,
      ),
    );

  return rows.filter((row) => !isFixtureMetadata(row.metadata)).length;
}

export async function markActivityNotificationsRead(userId: string, workspaceId?: string | null) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const rows = await db
    .select({
      deliveryId: alertDeliveriesTable.id,
      metadata: adsTable.metadata,
    })
    .from(alertDeliveriesTable)
    .innerJoin(alertsTable, eq(alertDeliveriesTable.alertId, alertsTable.id))
    .innerJoin(adsTable, eq(alertsTable.adId, adsTable.id))
    .where(
      and(
        eq(alertsTable.userId, userId),
        eq(alertsTable.workspaceId, resolvedWorkspaceId),
        eq(alertDeliveriesTable.channel, "in_app"),
        sql`${alertDeliveriesTable.readAt} is null`,
      ),
    );
  const deliveryIds = rows
    .filter((row) => !isFixtureMetadata(row.metadata))
    .map((row) => row.deliveryId);

  if (!deliveryIds.length) {
    return 0;
  }

  await db
    .update(alertDeliveriesTable)
    .set({ readAt: new Date() })
    .where(inArray(alertDeliveriesTable.id, deliveryIds));

  return deliveryIds.length;
}

export async function markNotificationInboxItemRead(
  userId: string,
  deliveryId: string,
  workspaceId?: string | null,
) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const [delivery] = await db
    .select({ id: alertDeliveriesTable.id })
    .from(alertDeliveriesTable)
    .innerJoin(alertsTable, eq(alertDeliveriesTable.alertId, alertsTable.id))
    .where(
      and(
        eq(alertDeliveriesTable.id, deliveryId),
        eq(alertDeliveriesTable.channel, "in_app"),
        eq(alertsTable.workspaceId, resolvedWorkspaceId),
        eq(alertsTable.userId, userId),
      ),
    )
    .limit(1);

  if (delivery) {
    await db
      .update(alertDeliveriesTable)
      .set({
        readAt: new Date(),
      })
      .where(eq(alertDeliveriesTable.id, deliveryId));

    return;
  }

  const [trackerNotification] = await withOptionalTrackerNotifications(
    () =>
      db
        .select({ id: trackerNotificationsTable.id })
        .from(trackerNotificationsTable)
        .where(
          and(
            eq(trackerNotificationsTable.id, deliveryId),
            eq(trackerNotificationsTable.workspaceId, resolvedWorkspaceId),
            eq(trackerNotificationsTable.userId, userId),
          ),
        )
        .limit(1),
    [],
  );

  if (!trackerNotification) {
    throw new Error("Notification inbox item was not found.");
  }

  await withOptionalTrackerNotifications(
    () =>
      db
        .update(trackerNotificationsTable)
        .set({
          readAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(trackerNotificationsTable.id, deliveryId)),
    undefined,
  );
}

export async function markNotificationInboxItemUnread(
  userId: string,
  deliveryId: string,
  workspaceId?: string | null,
) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const [delivery] = await db
    .select({ id: alertDeliveriesTable.id })
    .from(alertDeliveriesTable)
    .innerJoin(alertsTable, eq(alertDeliveriesTable.alertId, alertsTable.id))
    .where(
      and(
        eq(alertDeliveriesTable.id, deliveryId),
        eq(alertDeliveriesTable.channel, "in_app"),
        eq(alertsTable.workspaceId, resolvedWorkspaceId),
        eq(alertsTable.userId, userId),
      ),
    )
    .limit(1);

  if (delivery) {
    await db
      .update(alertDeliveriesTable)
      .set({
        readAt: null,
      })
      .where(eq(alertDeliveriesTable.id, deliveryId));

    return;
  }

  const [trackerNotification] = await withOptionalTrackerNotifications(
    () =>
      db
        .select({ id: trackerNotificationsTable.id })
        .from(trackerNotificationsTable)
        .where(
          and(
            eq(trackerNotificationsTable.id, deliveryId),
            eq(trackerNotificationsTable.workspaceId, resolvedWorkspaceId),
            eq(trackerNotificationsTable.userId, userId),
          ),
        )
        .limit(1),
    [],
  );

  if (!trackerNotification) {
    throw new Error("Notification inbox item was not found.");
  }

  await withOptionalTrackerNotifications(
    () =>
      db
        .update(trackerNotificationsTable)
        .set({
          readAt: null,
          updatedAt: new Date(),
        })
        .where(eq(trackerNotificationsTable.id, deliveryId)),
    undefined,
  );
}

export async function markAllNotificationInboxItemsRead(userId: string, workspaceId?: string | null) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const [deliveries, trackerNotifications] = await Promise.all([
    db
      .select({ id: alertDeliveriesTable.id })
      .from(alertDeliveriesTable)
      .innerJoin(alertsTable, eq(alertDeliveriesTable.alertId, alertsTable.id))
      .where(
        and(
          eq(alertsTable.userId, userId),
          eq(alertsTable.workspaceId, resolvedWorkspaceId),
          eq(alertDeliveriesTable.channel, "in_app"),
          sql`${alertDeliveriesTable.readAt} is null`,
        ),
      ),
    withOptionalTrackerNotifications(
      () =>
        db
          .select({ id: trackerNotificationsTable.id })
          .from(trackerNotificationsTable)
          .where(
            and(
              eq(trackerNotificationsTable.workspaceId, resolvedWorkspaceId),
              eq(trackerNotificationsTable.userId, userId),
              sql`${trackerNotificationsTable.readAt} is null`,
            ),
          ),
      [],
    ),
  ]);

  if (!deliveries.length && !trackerNotifications.length) {
    return 0;
  }

  const readAt = new Date();
  await Promise.all(
    [
      ...deliveries.map((delivery) =>
      db
        .update(alertDeliveriesTable)
        .set({
          readAt,
        })
        .where(eq(alertDeliveriesTable.id, delivery.id)),
      ),
      ...trackerNotifications.map((notification) =>
        db
          .update(trackerNotificationsTable)
          .set({
            readAt,
            updatedAt: readAt,
          })
          .where(eq(trackerNotificationsTable.id, notification.id)),
      ),
    ],
  );

  return deliveries.length + trackerNotifications.length;
}

export async function listUsersPendingAlertDigests(now: Date): Promise<PendingAlertDigestUser[]> {
  const db = getDb();
  const users = await db
    .select({
      userId: notificationSettingsTable.userId,
      digestFrequency: notificationSettingsTable.digestFrequency,
      lastDigestSentAt: notificationSettingsTable.lastDigestSentAt,
      digestAnchorAt: notificationSettingsTable.updatedAt,
    })
    .from(notificationSettingsTable)
    .innerJoin(entitlementsTable, eq(entitlementsTable.userId, notificationSettingsTable.userId))
    .where(
      and(
        eq(entitlementsTable.alertsEnabled, true),
        eq(notificationSettingsTable.alertsEnabled, true),
        eq(notificationSettingsTable.emailEnabled, true),
        sql`${notificationSettingsTable.digestFrequency} <> 'instant'`,
      ),
    );

  return users.filter((user) => {
    const windowMs =
      user.digestFrequency === "monthly"
        ? 30 * 24 * 60 * 60 * 1000
        : user.digestFrequency === "weekly"
          ? 7 * 24 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;
    const anchorAt = user.lastDigestSentAt ?? user.digestAnchorAt;
    return anchorAt.getTime() <= now.getTime() - windowMs;
  }) as PendingAlertDigestUser[];
}

export async function listPendingAlertDigestItems(userId: string, limit = 100): Promise<PendingAlertDigestItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      alertId: alertsTable.id,
      advertiserName: advertiserDisplayNameSql(),
      headline: alertsTable.headline,
      body: alertsTable.body,
      adTitle: adsTable.title,
      adId: adsTable.id,
      advertiserId: advertisersTable.id,
      companyId: advertisersTable.companyId,
      source: advertisersTable.source,
      createdAt: alertsTable.createdAt,
      emailDeliveredAt: alertDeliveriesTable.deliveredAt,
    })
    .from(alertsTable)
    .innerJoin(trackedCompaniesTable, eq(alertsTable.trackedCompanyId, trackedCompaniesTable.id))
    .innerJoin(advertisersTable, eq(trackedCompaniesTable.advertiserId, advertisersTable.id))
    .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
    .innerJoin(adsTable, eq(alertsTable.adId, adsTable.id))
    .leftJoin(
      alertDeliveriesTable,
      and(eq(alertDeliveriesTable.alertId, alertsTable.id), eq(alertDeliveriesTable.channel, "email")),
    )
    .where(and(eq(alertsTable.userId, userId), sql`${alertDeliveriesTable.deliveredAt} is null`))
    .orderBy(alertsTable.createdAt)
    .limit(limit);

  return rows.map(({ emailDeliveredAt: _ignored, advertiserId, companyId, ...row }) => ({
    ...row,
    advertiserId: buildPublicAdvertiserId({
      companyId,
      advertiserId: companyId ? null : advertiserId,
    }),
  }));
}

export async function markAlertDigestDelivered(userId: string, providerMessageId: string, deliveredAt: Date, alertIds: string[]) {
  const db = getDb();

  await Promise.all(
    alertIds.map((alertId) =>
      recordAlertEmailDelivered({
        alertId,
        providerMessageId,
      }),
    ),
  );

  await db
    .update(notificationSettingsTable)
    .set({
      lastDigestSentAt: deliveredAt,
      updatedAt: new Date(),
    })
    .where(eq(notificationSettingsTable.userId, userId));
}

export async function listActivityFeed(
  userId: string,
  limit = 60,
  workspaceId?: string | null,
): Promise<ActivityFeedItem[]> {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const trackedCompanyIdSql = sql<string>`(
    select ${trackedCompaniesTable.id}
    from ${trackedCompaniesTable}
    inner join ${advertisersTable} watched_advertisers
      on watched_advertisers.id = ${trackedCompaniesTable.advertiserId}
    where ${trackedCompaniesTable.workspaceId} = ${resolvedWorkspaceId}
      and (
        ${trackedCompaniesTable.advertiserId} = ${adsTable.advertiserId}
        or (
          ${advertisersTable.companyId} is not null
          and watched_advertisers.company_id = ${advertisersTable.companyId}
        )
      )
    order by
      case when ${trackedCompaniesTable.advertiserId} = ${adsTable.advertiserId} then 0 else 1 end,
      ${trackedCompaniesTable.createdAt} asc
    limit 1
  )`;
  const launchedAds = await db
    .select({
      alertId: alertsTable.id,
      occurredAt: adsTable.firstSeenAt,
      source: adsTable.source,
      alertHeadline: alertsTable.headline,
      alertBody: alertsTable.body,
      trackedCompanyId: trackedCompanyIdSql,
      advertiserId: advertisersTable.id,
      advertiserSourceAdvertiserId: advertisersTable.sourceAdvertiserId,
      companyId: advertisersTable.companyId,
      advertiserName: advertiserDisplayNameSql(),
      advertiserLogoUrl: advertiserLogoUrlSql(),
      advertiserProfileUrl: advertisersTable.profileUrl,
      adId: adsTable.id,
      adTitle: adsTable.title,
      adBody: adsTable.body,
      adFormat: adsTable.format,
      adCallToAction: adsTable.callToAction,
      adDestinationUrl: adsTable.destinationUrl,
      adMediaUrl: adsTable.mediaUrl,
      screenshotUrl: landingPageSnapshotsTable.screenshotUrl,
      snapshotUrl: landingPageSnapshotsTable.url,
      reactionCount: adsTable.reactionCount,
      commentCount: adsTable.commentCount,
      savedAdId: savedAdsTable.id,
    })
    .from(adsTable)
    .innerJoin(advertisersTable, eq(adsTable.advertiserId, advertisersTable.id))
    .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
    .leftJoin(
      alertsTable,
      and(
        eq(alertsTable.workspaceId, resolvedWorkspaceId),
        eq(alertsTable.userId, userId),
        eq(alertsTable.trackedCompanyId, trackedCompanyIdSql),
        eq(alertsTable.adId, adsTable.id),
      ),
    )
    .leftJoin(landingPageSnapshotsTable, eq(landingPageSnapshotsTable.adId, adsTable.id))
    .leftJoin(savedAdsTable, and(eq(savedAdsTable.adId, adsTable.id), eq(savedAdsTable.workspaceId, resolvedWorkspaceId)))
    .where(and(sql`${trackedCompanyIdSql} is not null`, notFixtureMetadataSql(adsTable.metadata)))
    .orderBy(desc(adsTable.firstSeenAt), desc(adsTable.id))
    .limit(Math.max(limit * 8, 500));

  const activityAds = launchedAds.map((alert) => ({
    ...alert,
    publicAdvertiserId: buildPublicAdvertiserId({
      companyId: alert.companyId,
      advertiserId: alert.companyId ? null : alert.advertiserId,
    }),
  }));

  const newAdEvents = activityAds.map((alert) => ({
    id: `new:${alert.alertId ?? alert.adId}`,
    kind: "new_ad" as const,
    occurredAt: alert.occurredAt,
    source: alert.source,
    trackedCompanyId: alert.trackedCompanyId,
    advertiserId: alert.publicAdvertiserId,
    advertiserName: alert.advertiserName,
    advertiserLogoUrl: resolveCdnAssetUrl(alert.advertiserLogoUrl),
    advertiserProfileUrl: resolveAdvertiserSourceUrl({
      source: alert.source,
      sourceAdvertiserId: alert.advertiserSourceAdvertiserId,
      profileUrl: alert.advertiserProfileUrl,
    }),
    adId: alert.adId,
    adTitle: alert.adTitle,
    adBody: alert.adBody,
    adFormat: alert.adFormat,
    adCallToAction: alert.adCallToAction,
    adDestinationUrl: alert.adDestinationUrl,
    adMediaUrl: resolveCdnAssetUrl(alert.adMediaUrl),
    screenshotUrl: resolveCdnAssetUrl(alert.screenshotUrl),
    snapshotUrl: alert.snapshotUrl,
    reactionCount: Number(alert.reactionCount ?? 0),
    commentCount: Number(alert.commentCount ?? 0),
    headline: alert.alertHeadline ?? `New ad detected for ${alert.advertiserName}`,
    summary: alert.alertBody ?? alert.adTitle ?? alert.adBody ?? "A newly observed creative was captured during the latest sync.",
    relatedCount: 1,
    isSaved: Boolean(alert.savedAdId),
  }));

  const launchBurstEvents = Array.from(
    activityAds.reduce((acc, alert) => {
      const dateKey = alert.occurredAt.toISOString().slice(0, 10);
      const groupKey = `${alert.publicAdvertiserId}:${dateKey}`;
      const existing = acc.get(groupKey);

      if (existing) {
        existing.rows.push(alert);
        return acc;
      }

      acc.set(groupKey, {
        advertiserId: alert.publicAdvertiserId,
        dateKey,
        rows: [alert],
      });
      return acc;
    }, new Map<string, { advertiserId: string; dateKey: string; rows: typeof activityAds }>()),
  )
    .map(([, group]) => group)
    .filter((group) => group.rows.length >= 2)
    .map((group) => {
      const primary = group.rows[0];
      return {
        id: `burst:${group.advertiserId}:${group.dateKey}`,
        kind: "launch_burst" as const,
        occurredAt: primary.occurredAt,
        source: primary.source,
        trackedCompanyId: primary.trackedCompanyId,
        advertiserId: primary.advertiserId,
        advertiserName: primary.advertiserName,
        advertiserLogoUrl: resolveCdnAssetUrl(primary.advertiserLogoUrl),
        advertiserProfileUrl: resolveAdvertiserSourceUrl({
          source: primary.source,
          sourceAdvertiserId: primary.advertiserSourceAdvertiserId,
          profileUrl: primary.advertiserProfileUrl,
        }),
        adId: primary.adId,
        adTitle: primary.adTitle,
        adBody: primary.adBody,
        adFormat: primary.adFormat,
        adCallToAction: primary.adCallToAction,
        adDestinationUrl: primary.adDestinationUrl,
        adMediaUrl: resolveCdnAssetUrl(primary.adMediaUrl),
        screenshotUrl: resolveCdnAssetUrl(primary.screenshotUrl),
        snapshotUrl: primary.snapshotUrl,
        reactionCount: Number(primary.reactionCount ?? 0),
        commentCount: Number(primary.commentCount ?? 0),
        headline: `${primary.advertiserName} launched ${group.rows.length} creatives in one burst`,
        summary: `Burst launch detected across ${group.rows.length} ads on ${group.dateKey}. Review the creative mix before the next sync changes the picture.`,
        relatedCount: group.rows.length,
        isSaved: Boolean(primary.savedAdId),
      };
    });

  const engagementSpikeEvents = activityAds
    .map((alert) => ({
      ...alert,
      advertiserId: alert.publicAdvertiserId,
    }))
    .filter((alert) => Number(alert.reactionCount ?? 0) + Number(alert.commentCount ?? 0) >= 25)
    .map((alert) => ({
      id: `engagement:${alert.alertId ?? alert.adId}`,
      kind: "engagement_spike" as const,
      occurredAt: alert.occurredAt,
      source: alert.source,
      trackedCompanyId: alert.trackedCompanyId,
      advertiserId: alert.advertiserId,
      advertiserName: alert.advertiserName,
      advertiserLogoUrl: resolveCdnAssetUrl(alert.advertiserLogoUrl),
      advertiserProfileUrl: resolveAdvertiserSourceUrl({
        source: alert.source,
        sourceAdvertiserId: alert.advertiserSourceAdvertiserId,
        profileUrl: alert.advertiserProfileUrl,
      }),
      adId: alert.adId,
      adTitle: alert.adTitle,
      adBody: alert.adBody,
      adFormat: alert.adFormat,
      adCallToAction: alert.adCallToAction,
      adDestinationUrl: alert.adDestinationUrl,
      adMediaUrl: resolveCdnAssetUrl(alert.adMediaUrl),
      screenshotUrl: resolveCdnAssetUrl(alert.screenshotUrl),
      snapshotUrl: alert.snapshotUrl,
      reactionCount: Number(alert.reactionCount ?? 0),
      commentCount: Number(alert.commentCount ?? 0),
      headline: `${alert.advertiserName} is already showing engagement on a new creative`,
      summary: `${Number(alert.reactionCount ?? 0)} reactions and ${Number(alert.commentCount ?? 0)} comments are already visible on this detected ad.`,
      relatedCount: 1,
      isSaved: Boolean(alert.savedAdId),
    }));

  return [...newAdEvents, ...launchBurstEvents, ...engagementSpikeEvents]
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
    .slice(0, limit);
}

export async function browseAds(filters: BrowseAdsFilters = {}): Promise<BrowseAdsResult> {
  const db = getDb();
  const resolvedWorkspaceId = filters.userId ? await resolveWorkspaceIdForUser(filters.userId, filters.workspaceId) : null;
  const normalizedQuery = filters.query?.trim();
  const sort = filters.sort ?? "most_recent";
  const whereClauses: SQL[] = [notFixtureMetadataSql(adsTable.metadata)];

  if (normalizedQuery) {
    const pattern = `%${normalizedQuery}%`;
    const queryClause = or(
      like(adsTable.title, pattern),
      like(adsTable.body, pattern),
      like(advertisersTable.canonicalName, pattern),
      like(advertiserCompaniesTable.displayName, pattern),
    );

    if (queryClause) {
      whereClauses.push(queryClause);
    }
  }

  const sourceFilters = filters.source ? (Array.isArray(filters.source) ? filters.source : [filters.source]) : [];

  if (filters.source) {
    if (sourceFilters.length === 1) {
      whereClauses.push(eq(adsTable.source, sourceFilters[0]));
    } else if (sourceFilters.length > 1) {
      whereClauses.push(inArray(adsTable.source, sourceFilters));
    }
  }

  if (filters.format) {
    whereClauses.push(eq(adsTable.format, filters.format));
  }

  if (filters.callToAction) {
    whereClauses.push(eq(adsTable.callToAction, filters.callToAction));
  }

  if (filters.industry) {
    whereClauses.push(eq(advertisersTable.industry, filters.industry));
  }

  if (filters.companySize) {
    whereClauses.push(eq(advertisersTable.companySize, filters.companySize));
  }

  if (filters.country) {
    whereClauses.push(eq(advertisersTable.country, filters.country));
  }

  const countWhereClauses = filters.source ? whereClauses : [...whereClauses, inArray(adsTable.source, appConfig.supportedSources)];
  const [{ value: totalAds } = { value: 0 }] = await db
    .select({ value: count(adsTable.id) })
    .from(adsTable)
    .innerJoin(advertisersTable, eq(adsTable.advertiserId, advertisersTable.id))
    .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
    .where(countWhereClauses.length ? and(...countWhereClauses) : undefined);

  const selectRows = (nextWhereClauses: typeof whereClauses) =>
    db
      .select({
      id: adsTable.id,
      source: adsTable.source,
      sourceAdId: adsTable.sourceAdId,
      advertiserId: advertisersTable.id,
      advertiserSourceAdvertiserId: advertisersTable.sourceAdvertiserId,
      companyId: advertisersTable.companyId,
      advertiserName: advertiserDisplayNameSql(),
      advertiserLogoUrl: advertiserLogoUrlSql(),
      advertiserProfileUrl: advertisersTable.profileUrl,
      advertiserWebsiteUrl: advertiserWebsiteUrlSql(),
      advertiserIndustry: advertisersTable.industry,
      advertiserCompanySize: advertisersTable.companySize,
      advertiserCountry: advertisersTable.country,
      advertiserSummary: advertisersTable.summary,
      title: adsTable.title,
      body: adsTable.body,
      callToAction: adsTable.callToAction,
      destinationUrl: adsTable.destinationUrl,
      mediaUrl: adsTable.mediaUrl,
      metadata: adsTable.metadata,
      format: adsTable.format,
      payer: adsTable.payer,
      status: adsTable.status,
      reactionCount: adsTable.reactionCount,
      commentCount: adsTable.commentCount,
      firstSeenAt: adsTable.firstSeenAt,
      lastSeenAt: adsTable.lastSeenAt,
      savedAdId: savedAdsTable.id,
      trackedCompanyId: trackedCompaniesTable.id,
      })
      .from(adsTable)
      .innerJoin(advertisersTable, eq(adsTable.advertiserId, advertisersTable.id))
      .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
      .leftJoin(
        savedAdsTable,
        and(eq(savedAdsTable.adId, adsTable.id), eq(savedAdsTable.workspaceId, resolvedWorkspaceId ?? "")),
      )
      .leftJoin(
        trackedCompaniesTable,
        and(eq(trackedCompaniesTable.advertiserId, advertisersTable.id), eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId ?? "")),
      )
      .where(nextWhereClauses.length ? and(...nextWhereClauses) : undefined)
      .orderBy(
        sort === "most_impressions" ? desc(impressionMetadataRankSql(adsTable.metadata)) : sort === "most_recent" ? desc(adsTable.firstSeenAt) : desc(adsTable.lastSeenAt),
        desc(adsTable.lastSeenAt),
        desc(adsTable.id),
      )
      .limit(250);

  const rows = filters.source
    ? await selectRows(whereClauses)
    : (
        await Promise.all(
          appConfig.supportedSources.map((source) =>
            selectRows([...whereClauses, eq(adsTable.source, source)]),
          ),
        )
      ).flat();

  const formats = await db
    .select({ value: adsTable.format })
    .from(adsTable)
    .where(sql`${adsTable.format} is not null`)
    .groupBy(adsTable.format)
    .orderBy(adsTable.format);
  const callToActions = await db
    .select({ value: adsTable.callToAction })
    .from(adsTable)
    .where(sql`${adsTable.callToAction} is not null`)
    .groupBy(adsTable.callToAction)
    .orderBy(adsTable.callToAction);
  const industries = await db
    .select({ value: advertisersTable.industry })
    .from(advertisersTable)
    .where(sql`${advertisersTable.industry} is not null`)
    .groupBy(advertisersTable.industry)
    .orderBy(advertisersTable.industry);
  const companySizes = await db
    .select({ value: advertisersTable.companySize })
    .from(advertisersTable)
    .where(sql`${advertisersTable.companySize} is not null`)
    .groupBy(advertisersTable.companySize)
    .orderBy(advertisersTable.companySize);
  const countries = await db
    .select({ value: advertisersTable.country })
    .from(advertisersTable)
    .where(sql`${advertisersTable.country} is not null`)
    .groupBy(advertisersTable.country)
    .orderBy(advertisersTable.country);

  let ads = rows.filter((row) => !isFixtureMetadata(row.metadata)).map(mapBrowseAdRecord);

  if (filters.engagementBand && filters.engagementBand !== "any") {
    ads = ads.filter((ad) => ad.engagementBand === filters.engagementBand);
  }

  if (filters.ageBand && filters.ageBand !== "any") {
    ads = ads.filter((ad) => ad.ageBand === filters.ageBand);
  }

  ads.sort((left, right) => {
    if (sort === "most_impressions") {
      return (
        (right.impressions ?? 0) - (left.impressions ?? 0) ||
        right.lastSeenAt.getTime() - left.lastSeenAt.getTime() ||
        right.id.localeCompare(left.id)
      );
    }

    if (sort === "longest_running") {
      return right.durationDays - left.durationDays || right.lastSeenAt.getTime() - left.lastSeenAt.getTime() || right.id.localeCompare(left.id);
    }

    return (
      right.firstSeenAt.getTime() - left.firstSeenAt.getTime() ||
      right.lastSeenAt.getTime() - left.lastSeenAt.getTime() ||
      right.id.localeCompare(left.id)
    );
  });
  const availableLanguages = Array.from(new Set(ads.flatMap((ad) => (ad.language ? [ad.language] : [])))).sort((left, right) =>
    left.localeCompare(right),
  );

  return {
    ads,
    totalAds,
    availableLanguages,
    availableFormats: formats.flatMap((item) => (item.value ? [item.value] : [])),
    availableCallsToAction: callToActions.flatMap((item) => (item.value ? [item.value] : [])),
    availableIndustries: industries.flatMap((item) => (item.value ? [item.value] : [])),
    availableCompanySizes: companySizes.flatMap((item) => (item.value ? [item.value] : [])),
    availableCountries: countries.flatMap((item) => (item.value ? [item.value] : [])),
  };
}

export async function getAdDetail(
  userId: string,
  adId: string,
  workspaceId?: string | null,
): Promise<AdDetailRecord | null> {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const [row] = await db
    .select({
      id: adsTable.id,
      advertiserId: advertisersTable.id,
      companyId: advertisersTable.companyId,
      source: adsTable.source,
      sourceAdId: adsTable.sourceAdId,
      advertiserSourceAdvertiserId: advertisersTable.sourceAdvertiserId,
      advertiserName: advertiserDisplayNameSql(),
      advertiserLogoUrl: advertiserLogoUrlSql(),
      advertiserProfileUrl: advertisersTable.profileUrl,
      advertiserWebsiteUrl: advertiserWebsiteUrlSql(),
      advertiserIndustry: advertisersTable.industry,
      advertiserCompanySize: advertisersTable.companySize,
      advertiserCountry: advertisersTable.country,
      advertiserSummary: advertisersTable.summary,
      title: adsTable.title,
      body: adsTable.body,
      callToAction: adsTable.callToAction,
      destinationUrl: adsTable.destinationUrl,
      mediaUrl: adsTable.mediaUrl,
      metadata: adsTable.metadata,
      format: adsTable.format,
      payer: adsTable.payer,
      status: adsTable.status,
      reactionCount: adsTable.reactionCount,
      commentCount: adsTable.commentCount,
      firstSeenAt: adsTable.firstSeenAt,
      lastSeenAt: adsTable.lastSeenAt,
      snapshotTitle: landingPageSnapshotsTable.title,
      snapshotUrl: landingPageSnapshotsTable.url,
      screenshotUrl: landingPageSnapshotsTable.screenshotUrl,
    })
    .from(adsTable)
    .innerJoin(advertisersTable, eq(adsTable.advertiserId, advertisersTable.id))
    .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
    .leftJoin(landingPageSnapshotsTable, eq(landingPageSnapshotsTable.adId, adsTable.id))
    .where(eq(adsTable.id, adId))
    .limit(1);

  if (!row) {
    return null;
  }

  if (isFixtureMetadata(row.metadata)) {
    return null;
  }

  const [savedAd, trackedCompany] = await Promise.all([
    db
      .select({ id: savedAdsTable.id })
      .from(savedAdsTable)
      .where(and(eq(savedAdsTable.workspaceId, resolvedWorkspaceId), eq(savedAdsTable.adId, adId)))
      .limit(1),
    db
      .select({ id: trackedCompaniesTable.id })
      .from(trackedCompaniesTable)
      .where(and(eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId), eq(trackedCompaniesTable.advertiserId, row.advertiserId)))
      .limit(1),
  ]);

  const metaCollation = row.source === "facebook" ? getMetaCollation(row.metadata) : null;
  const metaVariationAdvertiserClause = row.advertiserSourceAdvertiserId
    ? or(eq(adsTable.advertiserId, row.advertiserId), eq(advertisersTable.sourceAdvertiserId, row.advertiserSourceAdvertiserId))
    : eq(adsTable.advertiserId, row.advertiserId);
  const metaVariationLimit = metaCollation ? Math.min(Math.max(metaCollation.count, 24), 100) : 24;
  const metaVariationRows = metaCollation
    ? await db
        .select({
          id: adsTable.id,
          source: adsTable.source,
          sourceAdId: adsTable.sourceAdId,
          advertiserId: advertisersTable.id,
          advertiserSourceAdvertiserId: advertisersTable.sourceAdvertiserId,
          companyId: advertisersTable.companyId,
          advertiserName: advertiserDisplayNameSql(),
          advertiserLogoUrl: advertiserLogoUrlSql(),
          advertiserProfileUrl: advertisersTable.profileUrl,
          advertiserWebsiteUrl: advertiserWebsiteUrlSql(),
          advertiserIndustry: advertisersTable.industry,
          advertiserCompanySize: advertisersTable.companySize,
          advertiserCountry: advertisersTable.country,
          advertiserSummary: advertisersTable.summary,
          title: adsTable.title,
          body: adsTable.body,
          callToAction: adsTable.callToAction,
          destinationUrl: adsTable.destinationUrl,
          mediaUrl: adsTable.mediaUrl,
          metadata: adsTable.metadata,
          format: adsTable.format,
          payer: adsTable.payer,
          status: adsTable.status,
          reactionCount: adsTable.reactionCount,
          commentCount: adsTable.commentCount,
          firstSeenAt: adsTable.firstSeenAt,
          lastSeenAt: adsTable.lastSeenAt,
          savedAdId: savedAdsTable.id,
          trackedCompanyId: trackedCompaniesTable.id,
        })
        .from(adsTable)
        .innerJoin(advertisersTable, eq(adsTable.advertiserId, advertisersTable.id))
        .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
        .leftJoin(savedAdsTable, and(eq(savedAdsTable.adId, adsTable.id), eq(savedAdsTable.workspaceId, resolvedWorkspaceId)))
        .leftJoin(
          trackedCompaniesTable,
          and(eq(trackedCompaniesTable.advertiserId, advertisersTable.id), eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId)),
        )
        .where(
          and(
            metaVariationAdvertiserClause,
            eq(adsTable.source, "facebook"),
            sql`json_unquote(json_extract(${adsTable.metadata}, '$.rawPayload.collation_id')) = ${metaCollation.id}`,
            notFixtureMetadataSql(adsTable.metadata),
          ),
        )
        .orderBy(sql`case when ${adsTable.id} = ${adId} then 0 else 1 end`, desc(adsTable.lastSeenAt))
        .limit(metaVariationLimit)
    : [];
  const metaVariations = metaVariationRows.flatMap((variation) => {
    const metaCreativeAssets = getMetaCreativeAssets(variation.metadata);

    if (
      variation.id !== row.id &&
      !hasStoredMetaCreativeReference({
        mediaUrl: variation.mediaUrl,
        metadata: variation.metadata,
        metaCreativeAssets,
      })
    ) {
      return [];
    }

    return [
      {
        ...mapBrowseAdRecord(variation),
        sourceAdId: variation.sourceAdId,
        metaDetails: getMetaAdDetails(variation.metadata),
        metaCreativeAssets,
      },
    ];
  });

  const variationRows = await db
    .select({
      id: adsTable.id,
      source: adsTable.source,
      title: adsTable.title,
      body: adsTable.body,
      format: adsTable.format,
      callToAction: adsTable.callToAction,
      destinationUrl: adsTable.destinationUrl,
      mediaUrl: adsTable.mediaUrl,
      metadata: adsTable.metadata,
      reactionCount: adsTable.reactionCount,
      commentCount: adsTable.commentCount,
      firstSeenAt: adsTable.firstSeenAt,
      lastSeenAt: adsTable.lastSeenAt,
    })
    .from(adsTable)
    .where(and(eq(adsTable.advertiserId, row.advertiserId), sql`${adsTable.id} <> ${adId}`))
    .orderBy(desc(adsTable.lastSeenAt))
    .limit(8);

  const variations = variationRows
    .filter((candidate) => !isFixtureMetadata(candidate.metadata))
    .map((candidate) => {
      const mediaDimensions = getAdMediaDimensions(candidate.metadata);

      return {
        ...candidate,
        transcript: getAdTranscript(candidate.metadata),
        mediaUrl: resolveCdnAssetUrl(candidate.mediaUrl),
        posterUrl: getAdPosterUrl(candidate.metadata, candidate.source),
        videoUrl: getAdVideoUrl(candidate.metadata, candidate.source),
        mediaWidth: mediaDimensions?.width ?? null,
        mediaHeight: mediaDimensions?.height ?? null,
        mediaAspectRatio: mediaDimensions?.aspectRatio ?? null,
        reactions: Number(candidate.reactionCount ?? 0),
        comments: Number(candidate.commentCount ?? 0),
        variationReason: getVariationReason(row, candidate),
      };
    });

  return {
    ...mapBrowseAdRecord({
      ...row,
      savedAdId: savedAd[0]?.id ?? null,
    }),
    source: row.source,
    sourceAdId: row.sourceAdId,
    snapshotTitle: row.snapshotTitle,
    snapshotUrl: row.snapshotUrl,
    screenshotUrl: resolveCdnAssetUrl(row.screenshotUrl),
    isSaved: Boolean(savedAd[0]),
    trackedCompanyId: trackedCompany[0]?.id ?? null,
    googleDetails: row.source === "google" ? getGoogleAdDetails(row.metadata, row.format) : null,
    googleCreativeAssets: row.source === "google" ? getGoogleCreativeAssets(row.metadata) : [],
    linkedInDetails: row.source === "linkedin" ? getLinkedInAdDetails(row.metadata, row.format) : null,
    linkedInCreativeAssets: row.source === "linkedin" ? getLinkedInCreativeAssets(row.metadata) : [],
    metaDetails: getMetaAdDetails(row.metadata),
    metaCreativeAssets: row.source === "facebook" ? getMetaCreativeAssets(row.metadata) : [],
    metaVariationTotal: row.source === "facebook" ? Math.max(1, metaVariations.length) : 1,
    metaVariations,
    variations,
  };
}

export async function getPublicAdShare(adId: string): Promise<PublicAdShareRecord | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: adsTable.id,
      advertiserId: advertisersTable.id,
      companyId: advertisersTable.companyId,
      source: adsTable.source,
      sourceAdId: adsTable.sourceAdId,
      advertiserSourceAdvertiserId: advertisersTable.sourceAdvertiserId,
      advertiserName: advertiserDisplayNameSql(),
      advertiserLogoUrl: advertiserLogoUrlSql(),
      advertiserProfileUrl: advertisersTable.profileUrl,
      advertiserWebsiteUrl: advertiserWebsiteUrlSql(),
      advertiserIndustry: advertisersTable.industry,
      advertiserCompanySize: advertisersTable.companySize,
      advertiserCountry: advertisersTable.country,
      advertiserSummary: advertisersTable.summary,
      title: adsTable.title,
      body: adsTable.body,
      callToAction: adsTable.callToAction,
      destinationUrl: adsTable.destinationUrl,
      mediaUrl: adsTable.mediaUrl,
      metadata: adsTable.metadata,
      format: adsTable.format,
      payer: adsTable.payer,
      status: adsTable.status,
      reactionCount: adsTable.reactionCount,
      commentCount: adsTable.commentCount,
      firstSeenAt: adsTable.firstSeenAt,
      lastSeenAt: adsTable.lastSeenAt,
      snapshotUrl: landingPageSnapshotsTable.url,
      screenshotUrl: landingPageSnapshotsTable.screenshotUrl,
    })
    .from(adsTable)
    .innerJoin(advertisersTable, eq(adsTable.advertiserId, advertisersTable.id))
    .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
    .leftJoin(landingPageSnapshotsTable, eq(landingPageSnapshotsTable.adId, adsTable.id))
    .where(and(eq(adsTable.id, adId), notFixtureMetadataSql(adsTable.metadata)))
    .limit(1);

  if (!row || isFixtureMetadata(row.metadata)) {
    return null;
  }

  return {
    ...mapBrowseAdRecord({
      ...row,
      savedAdId: null,
      trackedCompanyId: null,
    }),
    sourceAdId: row.sourceAdId,
    screenshotUrl: resolveCdnAssetUrl(row.screenshotUrl),
    snapshotUrl: cleanAdDestinationUrl(row.source, row.snapshotUrl),
  };
}

export async function saveAdForUser(input: { userId: string; workspaceId?: string | null; adId: string }) {
  const db = getDb();
  const now = new Date();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(input.userId, input.workspaceId);
  const [existingSavedAd] = await db
    .select({ id: savedAdsTable.id })
    .from(savedAdsTable)
    .where(and(eq(savedAdsTable.workspaceId, resolvedWorkspaceId), eq(savedAdsTable.adId, input.adId)))
    .limit(1);

  if (existingSavedAd) {
    return {
      created: false,
      id: existingSavedAd.id,
    };
  }

  const id = randomUUID();

  await db.insert(savedAdsTable).values({
    id,
    workspaceId: resolvedWorkspaceId,
    userId: input.userId,
    adId: input.adId,
    note: null,
    createdAt: now,
    updatedAt: now,
  });

  return {
    created: true,
    id,
  };
}

export async function listSwipeFileCollections(
  userId: string,
  workspaceId?: string | null,
): Promise<SwipeFileCollectionSummary[]> {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const collections = await db
    .select({
      id: swipeFileCollectionsTable.id,
      name: swipeFileCollectionsTable.name,
      description: swipeFileCollectionsTable.description,
      createdAt: swipeFileCollectionsTable.createdAt,
      updatedAt: swipeFileCollectionsTable.updatedAt,
      savedAdsCount: sql<number>`count(${swipeFileCollectionItemsTable.id})`,
    })
    .from(swipeFileCollectionsTable)
    .leftJoin(
      swipeFileCollectionItemsTable,
      eq(swipeFileCollectionItemsTable.collectionId, swipeFileCollectionsTable.id),
    )
    .where(eq(swipeFileCollectionsTable.workspaceId, resolvedWorkspaceId))
    .groupBy(
      swipeFileCollectionsTable.id,
      swipeFileCollectionsTable.name,
      swipeFileCollectionsTable.description,
      swipeFileCollectionsTable.createdAt,
      swipeFileCollectionsTable.updatedAt,
    )
    .orderBy(swipeFileCollectionsTable.name);

  return collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    savedAdsCount: Number(collection.savedAdsCount ?? 0),
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  }));
}

export async function getSaveAdModalState(
  userId: string,
  adId: string,
  workspaceId?: string | null,
): Promise<SaveAdModalState> {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const [savedAd, collections, collectionItems] = await Promise.all([
    db
      .select({
        id: savedAdsTable.id,
        note: savedAdsTable.note,
      })
      .from(savedAdsTable)
      .where(and(eq(savedAdsTable.workspaceId, resolvedWorkspaceId), eq(savedAdsTable.adId, adId)))
      .limit(1),
    listSwipeFileCollections(userId, resolvedWorkspaceId),
    db
      .select({
        collectionId: swipeFileCollectionItemsTable.collectionId,
      })
      .from(swipeFileCollectionItemsTable)
      .innerJoin(savedAdsTable, eq(savedAdsTable.id, swipeFileCollectionItemsTable.savedAdId))
      .where(and(eq(savedAdsTable.workspaceId, resolvedWorkspaceId), eq(savedAdsTable.adId, adId))),
  ]);

  return {
    savedAdId: savedAd[0]?.id ?? null,
    note: savedAd[0]?.note ?? "",
    selectedCollectionIds: collectionItems.map((item) => item.collectionId),
    collections,
  };
}

export async function createSwipeFileCollection(input: {
  userId: string;
  workspaceId?: string | null;
  name: string;
  description?: string;
}) {
  const db = getDb();
  const now = new Date();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(input.userId, input.workspaceId);
  const normalizedName = input.name.trim();

  if (!normalizedName) {
    throw new Error("Collection name is required.");
  }

  const [existingCollection] = await db
    .select({ id: swipeFileCollectionsTable.id })
    .from(swipeFileCollectionsTable)
    .where(and(eq(swipeFileCollectionsTable.workspaceId, resolvedWorkspaceId), eq(swipeFileCollectionsTable.name, normalizedName)))
    .limit(1);

  if (existingCollection) {
    return {
      created: false,
      id: existingCollection.id,
    };
  }

  const id = randomUUID();

  await db.insert(swipeFileCollectionsTable).values({
    id,
    workspaceId: resolvedWorkspaceId,
    userId: input.userId,
    name: normalizedName,
    description: input.description?.trim() || null,
    createdAt: now,
    updatedAt: now,
  });

  return {
    created: true,
    id,
  };
}

export async function updateSwipeFileCollection(input: {
  userId: string;
  workspaceId?: string | null;
  collectionId: string;
  name: string;
  description?: string;
}) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(input.userId, input.workspaceId);
  const normalizedName = input.name.trim();

  if (!normalizedName) {
    throw new Error("Collection name is required.");
  }

  const [collection] = await db
    .select({ id: swipeFileCollectionsTable.id })
    .from(swipeFileCollectionsTable)
    .where(and(eq(swipeFileCollectionsTable.id, input.collectionId), eq(swipeFileCollectionsTable.workspaceId, resolvedWorkspaceId)))
    .limit(1);

  if (!collection) {
    throw new Error("Collection was not found.");
  }

  const [duplicate] = await db
    .select({ id: swipeFileCollectionsTable.id })
    .from(swipeFileCollectionsTable)
    .where(
      and(
        eq(swipeFileCollectionsTable.workspaceId, resolvedWorkspaceId),
        eq(swipeFileCollectionsTable.name, normalizedName),
        sql`${swipeFileCollectionsTable.id} <> ${input.collectionId}`,
      ),
    )
    .limit(1);

  if (duplicate) {
    throw new Error("A collection with this name already exists.");
  }

  await db
    .update(swipeFileCollectionsTable)
    .set({
      name: normalizedName,
      description: input.description?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(swipeFileCollectionsTable.id, input.collectionId));

  return { id: input.collectionId };
}

export async function deleteSwipeFileCollection(input: {
  userId: string;
  workspaceId?: string | null;
  collectionId: string;
}) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(input.userId, input.workspaceId);
  const [collection] = await db
    .select({ id: swipeFileCollectionsTable.id })
    .from(swipeFileCollectionsTable)
    .where(and(eq(swipeFileCollectionsTable.id, input.collectionId), eq(swipeFileCollectionsTable.workspaceId, resolvedWorkspaceId)))
    .limit(1);

  if (!collection) {
    throw new Error("Collection was not found.");
  }

  await db.delete(swipeFileCollectionItemsTable).where(eq(swipeFileCollectionItemsTable.collectionId, input.collectionId));
  await db.delete(swipeFileCollectionsTable).where(eq(swipeFileCollectionsTable.id, input.collectionId));

  return { id: input.collectionId };
}

export async function updateSavedAdNote(input: {
  userId: string;
  workspaceId?: string | null;
  savedAdId: string;
  note: string;
}) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(input.userId, input.workspaceId);
  const [savedAd] = await db
    .select({ id: savedAdsTable.id })
    .from(savedAdsTable)
    .where(and(eq(savedAdsTable.workspaceId, resolvedWorkspaceId), eq(savedAdsTable.id, input.savedAdId)))
    .limit(1);

  if (!savedAd) {
    throw new Error("Saved ad was not found.");
  }

  await db
    .update(savedAdsTable)
    .set({
      note: input.note.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(savedAdsTable.id, input.savedAdId));

  return { id: input.savedAdId };
}

export async function removeSavedAdForUser(input: {
  userId: string;
  workspaceId?: string | null;
  savedAdId: string;
}) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(input.userId, input.workspaceId);
  const [savedAd] = await db
    .select({ id: savedAdsTable.id })
    .from(savedAdsTable)
    .where(and(eq(savedAdsTable.id, input.savedAdId), eq(savedAdsTable.workspaceId, resolvedWorkspaceId)))
    .limit(1);

  if (!savedAd) {
    throw new Error("Saved ad was not found.");
  }

  await db.delete(swipeFileCollectionItemsTable).where(eq(swipeFileCollectionItemsTable.savedAdId, input.savedAdId));
  await db.delete(savedAdsTable).where(eq(savedAdsTable.id, input.savedAdId));

  return { id: input.savedAdId };
}

export async function setSavedAdCollectionMembership(input: {
  userId: string;
  workspaceId?: string | null;
  savedAdId: string;
  collectionId: string;
  present: boolean;
}) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(input.userId, input.workspaceId);
  const [savedAd, collection] = await Promise.all([
    db
      .select({ id: savedAdsTable.id })
      .from(savedAdsTable)
      .where(and(eq(savedAdsTable.id, input.savedAdId), eq(savedAdsTable.workspaceId, resolvedWorkspaceId)))
      .limit(1),
    db
      .select({ id: swipeFileCollectionsTable.id })
      .from(swipeFileCollectionsTable)
      .where(and(eq(swipeFileCollectionsTable.id, input.collectionId), eq(swipeFileCollectionsTable.workspaceId, resolvedWorkspaceId)))
      .limit(1),
  ]);

  if (!savedAd[0] || !collection[0]) {
    throw new Error("Saved ad collection membership could not be updated.");
  }

  if (!input.present) {
    await db
      .delete(swipeFileCollectionItemsTable)
      .where(
        and(
          eq(swipeFileCollectionItemsTable.collectionId, input.collectionId),
          eq(swipeFileCollectionItemsTable.savedAdId, input.savedAdId),
        ),
      );

    return { updated: true };
  }

  await db.insert(swipeFileCollectionItemsTable).values({
    id: randomUUID(),
    collectionId: input.collectionId,
    savedAdId: input.savedAdId,
    createdAt: new Date(),
  }).onDuplicateKeyUpdate({
    set: {
      collectionId: input.collectionId,
    },
  });

  return { updated: true };
}

export async function getSwipeFileLibrary(
  userId: string,
  selectedCollectionId?: string,
  workspaceId?: string | null,
): Promise<SwipeFileLibrary> {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const [savedAds, collections, collectionItems] = await Promise.all([
    db
      .select({
        savedAdId: savedAdsTable.id,
        note: savedAdsTable.note,
        savedAt: savedAdsTable.createdAt,
        trackedCompanyId: trackedCompaniesTable.id,
        advertiserId: advertisersTable.id,
        advertiserSourceAdvertiserId: advertisersTable.sourceAdvertiserId,
        companyId: advertisersTable.companyId,
        advertiserName: advertiserDisplayNameSql(),
        advertiserLogoUrl: advertiserLogoUrlSql(),
        advertiserProfileUrl: advertisersTable.profileUrl,
        advertiserWebsiteUrl: advertiserWebsiteUrlSql(),
        advertiserIndustry: advertisersTable.industry,
        advertiserCompanySize: advertisersTable.companySize,
        advertiserCountry: advertisersTable.country,
        advertiserSummary: advertisersTable.summary,
        adId: adsTable.id,
        source: adsTable.source,
        sourceAdId: adsTable.sourceAdId,
        adTitle: adsTable.title,
        adBody: adsTable.body,
        adFormat: adsTable.format,
        adCallToAction: adsTable.callToAction,
        adDestinationUrl: adsTable.destinationUrl,
        adMediaUrl: adsTable.mediaUrl,
        adMetadata: adsTable.metadata,
        adPayer: adsTable.payer,
        adStatus: adsTable.status,
        firstSeenAt: adsTable.firstSeenAt,
        lastSeenAt: adsTable.lastSeenAt,
        screenshotUrl: landingPageSnapshotsTable.screenshotUrl,
        snapshotUrl: landingPageSnapshotsTable.url,
        reactionCount: adsTable.reactionCount,
        commentCount: adsTable.commentCount,
      })
      .from(savedAdsTable)
      .innerJoin(adsTable, eq(savedAdsTable.adId, adsTable.id))
      .innerJoin(advertisersTable, eq(adsTable.advertiserId, advertisersTable.id))
      .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
      .leftJoin(landingPageSnapshotsTable, eq(landingPageSnapshotsTable.adId, adsTable.id))
      .leftJoin(
        trackedCompaniesTable,
        and(eq(trackedCompaniesTable.advertiserId, advertisersTable.id), eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId)),
      )
      .where(eq(savedAdsTable.workspaceId, resolvedWorkspaceId))
      .orderBy(desc(savedAdsTable.createdAt)),
    listSwipeFileCollections(userId, resolvedWorkspaceId),
    db
      .select({
        savedAdId: swipeFileCollectionItemsTable.savedAdId,
        collectionId: swipeFileCollectionsTable.id,
        collectionName: swipeFileCollectionsTable.name,
      })
      .from(swipeFileCollectionItemsTable)
      .innerJoin(
        swipeFileCollectionsTable,
        eq(swipeFileCollectionItemsTable.collectionId, swipeFileCollectionsTable.id),
      )
      .where(eq(swipeFileCollectionsTable.workspaceId, resolvedWorkspaceId)),
  ]);

  const collectionMap = new Map<string, Array<{ id: string; name: string }>>();

  for (const item of collectionItems) {
    const existing = collectionMap.get(item.savedAdId) ?? [];
    existing.push({
      id: item.collectionId,
      name: item.collectionName,
    });
    collectionMap.set(item.savedAdId, existing);
  }

  let entries = savedAds.map((savedAd) => ({
    savedAdId: savedAd.savedAdId,
    note: savedAd.note,
    savedAt: savedAd.savedAt,
    ad: mapBrowseAdRecord({
      id: savedAd.adId,
      source: savedAd.source,
      sourceAdId: savedAd.sourceAdId,
      advertiserId: savedAd.advertiserId,
      advertiserSourceAdvertiserId: savedAd.advertiserSourceAdvertiserId,
      companyId: savedAd.companyId,
      advertiserName: savedAd.advertiserName,
      advertiserLogoUrl: savedAd.advertiserLogoUrl,
      advertiserProfileUrl: savedAd.advertiserProfileUrl,
      advertiserWebsiteUrl: savedAd.advertiserWebsiteUrl,
      advertiserIndustry: savedAd.advertiserIndustry,
      advertiserCompanySize: savedAd.advertiserCompanySize,
      advertiserCountry: savedAd.advertiserCountry,
      advertiserSummary: savedAd.advertiserSummary,
      title: savedAd.adTitle,
      body: savedAd.adBody,
      callToAction: savedAd.adCallToAction,
      destinationUrl: savedAd.adDestinationUrl,
      mediaUrl: savedAd.adMediaUrl,
      metadata: savedAd.adMetadata,
      format: savedAd.adFormat,
      payer: savedAd.adPayer,
      status: savedAd.adStatus,
      firstSeenAt: savedAd.firstSeenAt,
      lastSeenAt: savedAd.lastSeenAt,
      reactionCount: Number(savedAd.reactionCount ?? 0),
      commentCount: Number(savedAd.commentCount ?? 0),
      savedAdId: savedAd.savedAdId,
      trackedCompanyId: savedAd.trackedCompanyId,
    }),
    trackedCompanyId: savedAd.trackedCompanyId,
    advertiserId: savedAd.advertiserId,
    advertiserName: savedAd.advertiserName,
    advertiserProfileUrl: resolveAdvertiserSourceUrl({
      source: savedAd.source,
      sourceAdvertiserId: savedAd.advertiserSourceAdvertiserId,
      profileUrl: savedAd.advertiserProfileUrl,
    }),
    adId: savedAd.adId,
    source: savedAd.source,
    adTitle: savedAd.adTitle,
    adBody: savedAd.adBody,
    adFormat: savedAd.adFormat,
    adCallToAction: savedAd.adCallToAction,
    adDestinationUrl: savedAd.adDestinationUrl,
    adMediaUrl: resolveCdnAssetUrl(savedAd.adMediaUrl),
    screenshotUrl: resolveCdnAssetUrl(savedAd.screenshotUrl),
    snapshotUrl: savedAd.snapshotUrl,
    reactionCount: Number(savedAd.reactionCount ?? 0),
    commentCount: Number(savedAd.commentCount ?? 0),
    collections: collectionMap.get(savedAd.savedAdId) ?? [],
  })) satisfies SwipeFileEntry[];

  if (selectedCollectionId) {
    entries = entries.filter((entry) => entry.collections.some((collection) => collection.id === selectedCollectionId));
  }

  return {
    collections,
    entries,
    savedCount: savedAds.length,
  };
}

async function selectAdvertiserEntityMembersForUser(input: {
  userId: string;
  workspaceId?: string | null;
  advertiserIds?: string[];
  whereClause?: any;
  limit?: number;
}) {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(input.userId, input.workspaceId);
  const clauses = [];

  if (input.advertiserIds?.length) {
    clauses.push(inArray(advertisersTable.id, input.advertiserIds));
  }

  if (input.whereClause) {
    clauses.push(input.whereClause);
  }

  const rows = await db
    .select({
      advertiserId: advertisersTable.id,
      source: advertisersTable.source,
      sourceAdvertiserId: advertisersTable.sourceAdvertiserId,
      canonicalName: advertiserDisplayNameSql(),
      profileUrl: advertisersTable.profileUrl,
      websiteUrl: advertiserWebsiteUrlSql(),
      normalizedDomain: advertisersTable.normalizedDomain,
      companyId: advertisersTable.companyId,
      logoUrl: advertiserLogoUrlSql(),
      industry: advertisersTable.industry,
      companySize: advertisersTable.companySize,
      country: advertisersTable.country,
      summary: advertisersTable.summary,
      lastIndexedAt: advertisersTable.lastIndexedAt,
      trackedCompanyId: trackedCompaniesTable.id,
      trackedStatus: trackedCompaniesTable.status,
      lastSyncedAt: trackedCompaniesTable.lastSyncedAt,
      createdAt: trackedCompaniesTable.createdAt,
      totalAds: sql<number>`count(${adsTable.id})`,
      activeAds: sql<number>`sum(case when ${adsTable.status} = 'active' then 1 else 0 end)`,
      averageEngagement: sql<number>`avg(coalesce(${adsTable.reactionCount}, 0) + coalesce(${adsTable.commentCount}, 0))`,
      lastSeenAt: sql<Date | null>`max(${adsTable.lastSeenAt})`,
    })
    .from(advertisersTable)
    .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
    .leftJoin(
      adsTable,
      and(eq(adsTable.advertiserId, advertisersTable.id), notFixtureMetadataSql(adsTable.metadata)),
    )
    .leftJoin(
      trackedCompaniesTable,
      and(eq(trackedCompaniesTable.advertiserId, advertisersTable.id), eq(trackedCompaniesTable.workspaceId, resolvedWorkspaceId)),
    )
    .where(clauses.length ? and(...clauses) : undefined)
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
      advertiserCompaniesTable.displayName,
      advertiserCompaniesTable.websiteUrl,
      advertiserCompaniesTable.logoUrl,
      trackedCompaniesTable.id,
      trackedCompaniesTable.status,
      trackedCompaniesTable.lastSyncedAt,
      trackedCompaniesTable.createdAt,
    )
    .orderBy(desc(sql`count(${adsTable.id})`), desc(advertisersTable.lastIndexedAt), advertiserDisplayNameSql())
    .limit(input.limit ?? 250);

  return rows.map(
    (row): AdvertiserEntityMember => ({
      advertiserId: row.advertiserId,
      source: row.source,
      sourceAdvertiserId: row.sourceAdvertiserId,
      canonicalName: row.canonicalName,
      profileUrl: row.profileUrl,
      websiteUrl: row.websiteUrl,
      normalizedDomain: row.normalizedDomain,
      companyId: row.companyId,
      logoUrl: row.logoUrl,
      industry: row.industry,
      companySize: row.companySize,
      country: row.country,
      summary: row.summary,
      trackedCompanyId: row.trackedCompanyId,
      trackedStatus: row.trackedStatus,
      lastIndexedAt: row.lastIndexedAt,
      totalAds: Number(row.totalAds ?? 0),
      activeAds: Number(row.activeAds ?? 0),
      averageEngagement: Math.round(Number(row.averageEngagement ?? 0)),
      lastSeenAt: row.lastSeenAt,
      lastSyncedAt: row.lastSyncedAt,
      createdAt: row.createdAt,
    }),
  );
}

async function resolveAdvertiserEntityAdvertiserIds(advertiserId: string) {
  const db = getDb();
  const parsedPublicId = parsePublicAdvertiserId(advertiserId);

  if (parsedPublicId?.kind === "company") {
    const rows = await db
      .select({ advertiserId: advertisersTable.id })
      .from(advertisersTable)
      .where(eq(advertisersTable.companyId, parsedPublicId.id));

    return rows.map((row) => row.advertiserId);
  }

  const rawAdvertiserId = parsedPublicId?.kind === "advertiser" ? parsedPublicId.id : advertiserId;
  const [advertiser] = await db
    .select({
      advertiserId: advertisersTable.id,
      companyId: advertisersTable.companyId,
    })
    .from(advertisersTable)
    .where(eq(advertisersTable.id, rawAdvertiserId))
    .limit(1);

  if (!advertiser) {
    return [];
  }

  if (!advertiser.companyId) {
    return [advertiser.advertiserId];
  }

  const companyRows = await db
    .select({ advertiserId: advertisersTable.id })
    .from(advertisersTable)
    .where(eq(advertisersTable.companyId, advertiser.companyId));

  return companyRows.map((row) => row.advertiserId);
}

export async function getAdAdvertiserContext(adId: string) {
  const db = getDb();
  const [ad] = await db
    .select({
      adId: adsTable.id,
      advertiserId: advertisersTable.id,
      source: advertisersTable.source,
      sourceAdvertiserId: advertisersTable.sourceAdvertiserId,
      canonicalName: advertisersTable.canonicalName,
      profileUrl: advertisersTable.profileUrl,
      industry: advertisersTable.industry,
      companySize: advertisersTable.companySize,
      country: advertisersTable.country,
      summary: advertisersTable.summary,
    })
    .from(adsTable)
    .innerJoin(advertisersTable, eq(adsTable.advertiserId, advertisersTable.id))
    .where(eq(adsTable.id, adId))
    .limit(1);

  return ad ?? null;
}

export async function listAdvertiserDirectory(input: {
  userId: string;
  workspaceId?: string | null;
  query?: string;
  industry?: string;
  country?: string;
}) {
  const db = getDb();
  const normalizedQuery = input.query?.trim();
  const normalizedIndustry = normalizeAdvertiserIndustry(input.industry);
  const whereClauses = [];

  if (normalizedQuery) {
    const pattern = `%${normalizedQuery}%`;
    whereClauses.push(
      or(
        like(advertisersTable.canonicalName, pattern),
        like(advertiserCompaniesTable.displayName, pattern),
        like(advertisersTable.industry, pattern),
        like(advertisersTable.country, pattern),
      ),
    );
  }

  if (normalizedIndustry) {
    whereClauses.push(eq(advertisersTable.industry, normalizedIndustry));
  }

  if (input.country) {
    whereClauses.push(eq(advertisersTable.country, input.country));
  }

  const advertisers = groupAdvertiserEntityMembers(
    await selectAdvertiserEntityMembersForUser({
      userId: input.userId,
      workspaceId: input.workspaceId,
      whereClause: whereClauses.length ? and(...whereClauses) : undefined,
      limit: 200,
    }),
  )
    .sort((left, right) => {
      if (right.totalAds !== left.totalAds) {
        return right.totalAds - left.totalAds;
      }

      const rightIndexedAt = right.lastIndexedAt?.getTime() ?? 0;
      const leftIndexedAt = left.lastIndexedAt?.getTime() ?? 0;

      if (rightIndexedAt !== leftIndexedAt) {
        return rightIndexedAt - leftIndexedAt;
      }

      return left.canonicalName.localeCompare(right.canonicalName);
    })
    .slice(0, 100);

  const [industries, countries] = await Promise.all([
    db
      .select({ value: advertisersTable.industry })
      .from(advertisersTable)
      .where(sql`${advertisersTable.industry} is not null`)
      .groupBy(advertisersTable.industry)
      .orderBy(advertisersTable.industry),
    db
      .select({ value: advertisersTable.country })
      .from(advertisersTable)
      .where(sql`${advertisersTable.country} is not null`)
      .groupBy(advertisersTable.country)
      .orderBy(advertisersTable.country),
  ]);

  return {
    advertisers: advertisers.map((advertiser) => ({
      ...advertiser,
      industry: normalizeAdvertiserIndustry(advertiser.industry),
    })) satisfies AdvertiserDirectoryRecord[],
    availableIndustries: normalizeAdvertiserIndustryOptions(industries.map((item) => item.value)),
    availableCountries: countries.flatMap((item) => (item.value ? [item.value] : [])),
  } satisfies AdvertiserDirectoryResult;
}

export async function listAdminAds(limit = 100): Promise<AdminAdListItem[]> {
  const db = getDb();
  const cappedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const rows = await db
    .select({
      id: adsTable.id,
      source: adsTable.source,
      sourceAdId: adsTable.sourceAdId,
      advertiserId: advertisersTable.id,
      advertiserName: advertiserDisplayNameSql(),
      title: adsTable.title,
      format: adsTable.format,
      status: adsTable.status,
      mediaUrl: adsTable.mediaUrl,
      firstSeenAt: adsTable.firstSeenAt,
      lastSeenAt: adsTable.lastSeenAt,
      createdAt: adsTable.createdAt,
    })
    .from(adsTable)
    .innerJoin(advertisersTable, eq(adsTable.advertiserId, advertisersTable.id))
    .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
    .orderBy(desc(adsTable.createdAt))
    .limit(cappedLimit);

  return rows.map((row) => ({
    ...row,
    mediaUrl: resolveCdnAssetUrl(row.mediaUrl),
  }));
}

export async function listAdminAdvertisersPage(input: {
  page?: number;
  pageSize?: number;
} = {}): Promise<AdminAdvertiserListPage> {
  const pool = getPool();
  const pageSize = Math.max(1, Math.min(500, Math.floor(input.pageSize ?? 100)));
  const requestedPage = Math.max(1, Math.floor(input.page ?? 1));
  const [countRows] = await pool.query<Array<RowDataPacket & { totalItems: number | string }>>(
    `
      select count(*) as totalItems
      from (
        select 1
        from advertisers a
        group by coalesce(a.company_id, a.normalized_domain, a.website_url, a.id)
      ) grouped
    `,
  );
  const totalItems = Number(countRows[0]?.totalItems ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;
  const [rows] = await pool.query<
    Array<
      RowDataPacket & {
        id: string;
        advertiserIds: string;
        source: Source;
        sources: string;
        sourceProfiles: string | Array<{
          advertiserId: string;
          source: Source;
          sourceAdvertiserId: string;
          profileUrl: string | null;
        }> | null;
        sourceAdvertiserId: string;
        sourceAdvertiserIds: string;
        canonicalName: string;
        logoUrl: string | null;
        websiteUrl: string | null;
        totalAds: number | string;
        activeAds: number | string;
        lastIndexedAt: Date | null;
        createdAt: Date;
      }
    >
  >(
    `
      select
        min(a.id) as id,
        group_concat(distinct a.id order by a.created_at separator ',') as advertiserIds,
        substring_index(group_concat(distinct a.source order by a.source separator ','), ',', 1) as source,
        group_concat(distinct a.source order by a.source separator ',') as sources,
        json_arrayagg(json_object(
          'advertiserId', a.id,
          'source', a.source,
          'sourceAdvertiserId', a.source_advertiser_id,
          'profileUrl', a.profile_url
        )) as sourceProfiles,
        substring_index(group_concat(distinct a.source_advertiser_id order by a.created_at separator ','), ',', 1) as sourceAdvertiserId,
        group_concat(distinct a.source_advertiser_id order by a.created_at separator ',') as sourceAdvertiserIds,
        coalesce(max(c.display_name), max(a.canonical_name)) as canonicalName,
        coalesce(max(c.logo_url), max(a.logo_url)) as logoUrl,
        coalesce(max(c.website_url), max(a.website_url)) as websiteUrl,
        count(ads.id) as totalAds,
        sum(case when ads.status = 'active' then 1 else 0 end) as activeAds,
        max(a.last_indexed_at) as lastIndexedAt,
        min(a.created_at) as createdAt
      from advertisers a
      left join advertiser_companies c on c.id = a.company_id
      left join ads on ads.advertiser_id = a.id
      group by
        coalesce(a.company_id, a.normalized_domain, a.website_url, a.id)
      order by createdAt desc
      limit ? offset ?
    `,
    [pageSize, offset],
  );

  const parseSourceProfiles = (value: typeof rows[number]["sourceProfiles"]) => {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;

    if (!Array.isArray(parsed)) {
      return [];
    }

    const profiles = parsed.flatMap((profile) => {
      if (!profile || typeof profile !== "object") {
        return [];
      }

      const source = "source" in profile ? profile.source : null;

      if (source !== "linkedin" && source !== "facebook" && source !== "google" && source !== "tiktok") {
        return [];
      }

      return [{
        advertiserId: String("advertiserId" in profile ? profile.advertiserId : ""),
        source,
        sourceAdvertiserId: String("sourceAdvertiserId" in profile ? profile.sourceAdvertiserId : ""),
        profileUrl: "profileUrl" in profile && profile.profileUrl ? String(profile.profileUrl) : null,
      }];
    }).filter((profile) => profile.advertiserId && profile.sourceAdvertiserId);

    return Array.from(new Map(profiles.map((profile) => [profile.advertiserId, profile])).values());
  };

  const items = rows.map((row) => ({
    id: row.id,
    advertiserIds: row.advertiserIds.split(",").filter(Boolean),
    source: row.source,
    sources: row.sources.split(",").filter((source): source is Source => source === "linkedin" || source === "facebook" || source === "google" || source === "tiktok"),
    sourceProfiles: parseSourceProfiles(row.sourceProfiles),
    sourceAdvertiserId: row.sourceAdvertiserId,
    sourceAdvertiserIds: row.sourceAdvertiserIds.split(",").filter(Boolean),
    canonicalName: row.canonicalName,
    logoUrl: resolveCdnAssetUrl(row.logoUrl),
    websiteUrl: row.websiteUrl,
    totalAds: Number(row.totalAds ?? 0),
    activeAds: Number(row.activeAds ?? 0),
    lastIndexedAt: row.lastIndexedAt,
    createdAt: row.createdAt,
  }));

  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages,
  };
}

export async function listAdminAdvertisers(limit = 100): Promise<AdminAdvertiserListItem[]> {
  return (await listAdminAdvertisersPage({ page: 1, pageSize: limit })).items;
}

function normalizeAdminText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeAdminLogoUrl(value: string | null | undefined) {
  const trimmed = normalizeAdminText(value);
  return resolveCdnAssetUrl(trimmed) ?? trimmed;
}

function normalizeAdminSource(source: string): Source {
  if (source === "linkedin" || source === "facebook" || source === "google" || source === "tiktok") {
    return source;
  }

  throw new Error("Choose a supported advertiser source.");
}

function buildAdminCompanyValues(input: {
  displayName: string;
  websiteUrl?: string | null;
  fallbackNormalizedDomain?: string | null;
}) {
  const normalizedWebsite = normalizeAdvertiserWebsite(input.websiteUrl ?? null);
  const nameKey = normalizeAdvertiserSearchEntityKey(input.displayName)
    || createHash("sha1").update(input.displayName).digest("hex").slice(0, 16);
  const normalizedDomain = normalizedWebsite.normalizedDomain ?? input.fallbackNormalizedDomain ?? `name:${nameKey}`;
  const websiteUrl = normalizedWebsite.normalizedDomain
    ? toRootAdvertiserWebsiteUrl(normalizedWebsite.websiteUrl, normalizedWebsite.normalizedDomain)
    : null;

  return {
    normalizedWebsite,
    normalizedDomain,
    websiteUrl,
    companyId: createHash("sha1").update(normalizedDomain).digest("hex"),
  };
}

export async function updateAdminAdvertiser(input: {
  advertiserIds: string[];
  displayName: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  sourceUpdates?: Array<{
    advertiserId: string;
    sourceAdvertiserId: string;
    profileUrl?: string | null;
  }>;
}) {
  const db = getDb();
  const uniqueAdvertiserIds = Array.from(new Set(input.advertiserIds.map((id) => id.trim()).filter(Boolean)));
  const displayName = input.displayName.trim();
  const logoUrl = normalizeAdminLogoUrl(input.logoUrl);
  const now = new Date();

  if (!uniqueAdvertiserIds.length) {
    throw new Error("Choose an advertiser to update.");
  }

  if (!displayName) {
    throw new Error("Advertiser name is required.");
  }

  return db.transaction(async (tx) => {
    const advertisers = await tx
      .select()
      .from(advertisersTable)
      .where(inArray(advertisersTable.id, uniqueAdvertiserIds));

    if (!advertisers.length) {
      throw new Error("The selected advertiser no longer exists.");
    }

    const foundAdvertiserIds = new Set(advertisers.map((advertiser) => advertiser.id));
    const missingAdvertiserId = uniqueAdvertiserIds.find((advertiserId) => !foundAdvertiserIds.has(advertiserId));

    if (missingAdvertiserId) {
      throw new Error(`Advertiser ${missingAdvertiserId} no longer exists.`);
    }

    const companyIds = Array.from(new Set(advertisers.flatMap((advertiser) => advertiser.companyId ? [advertiser.companyId] : [])));
    let companyId = companyIds[0] ?? null;
    const [existingCompany] = companyId
      ? await tx.select().from(advertiserCompaniesTable).where(eq(advertiserCompaniesTable.id, companyId)).limit(1)
      : [];
    const companyValues = buildAdminCompanyValues({
      displayName,
      websiteUrl: input.websiteUrl,
      fallbackNormalizedDomain: existingCompany?.normalizedDomain ?? advertisers.find((advertiser) => advertiser.normalizedDomain)?.normalizedDomain,
    });

    if (!companyId && advertisers.length > 1) {
      companyId = companyValues.companyId;
    }

    if (companyId && existingCompany) {
      await tx
        .update(advertiserCompaniesTable)
        .set({
          normalizedDomain: companyValues.normalizedDomain,
          websiteUrl: companyValues.websiteUrl,
          displayName,
          logoUrl,
          updatedAt: now,
        })
        .where(eq(advertiserCompaniesTable.id, companyId));
    } else if (companyId) {
      await tx
        .insert(advertiserCompaniesTable)
        .values({
          id: companyId,
          normalizedDomain: companyValues.normalizedDomain,
          websiteUrl: companyValues.websiteUrl,
          displayName,
          logoUrl,
          createdAt: existingCompany?.createdAt ?? now,
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            normalizedDomain: companyValues.normalizedDomain,
            websiteUrl: companyValues.websiteUrl,
            displayName,
            logoUrl,
            updatedAt: now,
          },
        });
    }

    const advertiserUpdateSet: Partial<typeof advertisersTable.$inferInsert> = {
      canonicalName: displayName,
      logoUrl,
      updatedAt: now,
    };

    if (companyId) {
      advertiserUpdateSet.companyId = companyId;
    }

    if (companyValues.normalizedWebsite.normalizedDomain) {
      advertiserUpdateSet.websiteUrl = companyValues.websiteUrl;
      advertiserUpdateSet.normalizedDomain = companyValues.normalizedWebsite.normalizedDomain;
    } else if (input.websiteUrl !== undefined) {
      advertiserUpdateSet.websiteUrl = null;
      advertiserUpdateSet.normalizedDomain = null;
    }

    await tx
      .update(advertisersTable)
      .set(advertiserUpdateSet)
      .where(inArray(advertisersTable.id, advertisers.map((advertiser) => advertiser.id)));

    const sourceUpdates = input.sourceUpdates ?? [];
    for (const sourceUpdate of sourceUpdates) {
      const advertiserId = sourceUpdate.advertiserId.trim();
      const sourceAdvertiserId = sourceUpdate.sourceAdvertiserId.trim();

      if (!foundAdvertiserIds.has(advertiserId)) {
        throw new Error(`Advertiser source ${advertiserId} is not part of this advertiser row.`);
      }

      if (!sourceAdvertiserId) {
        throw new Error("Source advertiser IDs cannot be empty.");
      }

      const sourceUpdateSet: Partial<typeof advertisersTable.$inferInsert> = {
        sourceAdvertiserId,
        updatedAt: now,
      };

      if (sourceUpdate.profileUrl !== undefined) {
        sourceUpdateSet.profileUrl = normalizeAdminText(sourceUpdate.profileUrl);
      }

      await tx
        .update(advertisersTable)
        .set(sourceUpdateSet)
        .where(eq(advertisersTable.id, advertiserId));
    }

    const updatedAdvertisers = await tx
      .select()
      .from(advertisersTable)
      .where(inArray(advertisersTable.id, advertisers.map((advertiser) => advertiser.id)));

    const fanoutTrackedCompanyIds = (
      await Promise.all(updatedAdvertisers.map((advertiser) => createMissingTrackedCompaniesForAdvertiser(tx, advertiser)))
    ).flat();

    return {
      updated: true,
      advertiserIds: updatedAdvertisers.map((advertiser) => advertiser.id),
      advertisersUpdated: updatedAdvertisers.length,
      companyId,
      fanoutTrackedCompanyIds,
    };
  });
}

export async function addAdminAdvertiserSource(input: {
  advertiserIds: string[];
  source: Source | string;
  sourceAdvertiserId: string;
  canonicalName?: string | null;
  profileUrl?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
}) {
  const db = getDb();
  const source = normalizeAdminSource(input.source);
  const sourceAdvertiserId = input.sourceAdvertiserId.trim();
  const uniqueAdvertiserIds = Array.from(new Set(input.advertiserIds.map((id) => id.trim()).filter(Boolean)));
  const now = new Date();

  if (!uniqueAdvertiserIds.length) {
    throw new Error("Choose an advertiser before adding a source.");
  }

  if (!sourceAdvertiserId) {
    throw new Error("Source advertiser ID is required.");
  }

  return db.transaction(async (tx) => {
    const advertisers = await tx
      .select()
      .from(advertisersTable)
      .where(inArray(advertisersTable.id, uniqueAdvertiserIds));

    if (!advertisers.length) {
      throw new Error("The selected advertiser no longer exists.");
    }

    const foundAdvertiserIds = new Set(advertisers.map((advertiser) => advertiser.id));
    const missingAdvertiserId = uniqueAdvertiserIds.find((advertiserId) => !foundAdvertiserIds.has(advertiserId));

    if (missingAdvertiserId) {
      throw new Error(`Advertiser ${missingAdvertiserId} no longer exists.`);
    }

    const primaryAdvertiser = advertisers[0];
    const companyIds = Array.from(new Set(advertisers.flatMap((advertiser) => advertiser.companyId ? [advertiser.companyId] : [])));
    let companyId = companyIds[0] ?? null;
    const [existingCompany] = companyId
      ? await tx.select().from(advertiserCompaniesTable).where(eq(advertiserCompaniesTable.id, companyId)).limit(1)
      : [];
    const displayName = normalizeAdminText(input.canonicalName) ?? existingCompany?.displayName ?? primaryAdvertiser.canonicalName;
    const logoUrl = normalizeAdminLogoUrl(input.logoUrl) ?? existingCompany?.logoUrl ?? primaryAdvertiser.logoUrl;
    const sourceWebsiteUrl = input.websiteUrl !== undefined
      ? input.websiteUrl
      : existingCompany?.websiteUrl ?? primaryAdvertiser.websiteUrl;
    const companyValues = buildAdminCompanyValues({
      displayName,
      websiteUrl: sourceWebsiteUrl,
      fallbackNormalizedDomain: existingCompany?.normalizedDomain ?? primaryAdvertiser.normalizedDomain,
    });

    if (!companyId) {
      companyId = companyValues.companyId;
      await tx
        .insert(advertiserCompaniesTable)
        .values({
          id: companyId,
          normalizedDomain: companyValues.normalizedDomain,
          websiteUrl: companyValues.websiteUrl,
          displayName,
          logoUrl,
          createdAt: now,
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            websiteUrl: companyValues.websiteUrl,
            displayName,
            logoUrl,
            updatedAt: now,
          },
        });

      await tx
        .update(advertisersTable)
        .set({
          companyId,
          websiteUrl: companyValues.websiteUrl,
          normalizedDomain: companyValues.normalizedWebsite.normalizedDomain ?? companyValues.normalizedDomain,
          updatedAt: now,
        })
        .where(inArray(advertisersTable.id, advertisers.map((advertiser) => advertiser.id)));
    }

    await tx
      .insert(advertisersTable)
      .values({
        id: randomUUID(),
        source,
        sourceAdvertiserId,
        canonicalName: displayName,
        profileUrl: normalizeAdminText(input.profileUrl),
        websiteUrl: companyValues.websiteUrl,
        normalizedDomain: companyValues.normalizedWebsite.normalizedDomain,
        companyId,
        logoUrl,
        createdAt: now,
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          canonicalName: displayName,
          profileUrl: normalizeAdminText(input.profileUrl),
          websiteUrl: companyValues.websiteUrl,
          normalizedDomain: companyValues.normalizedWebsite.normalizedDomain,
          companyId,
          logoUrl,
          updatedAt: now,
        },
      });

    const [sourceAdvertiser] = await tx
      .select()
      .from(advertisersTable)
      .where(and(eq(advertisersTable.source, source), eq(advertisersTable.sourceAdvertiserId, sourceAdvertiserId)))
      .limit(1);

    if (!sourceAdvertiser) {
      throw new Error(`Advertiser source ${source}:${sourceAdvertiserId} could not be saved.`);
    }

    const fanoutTrackedCompanyIds = await createMissingTrackedCompaniesForAdvertiser(tx, sourceAdvertiser);

    return {
      added: true,
      advertiserId: sourceAdvertiser.id,
      companyId,
      fanoutTrackedCompanyIds,
    };
  });
}

function numberFromRowValue(value: unknown) {
  return Number(value ?? 0) || 0;
}

function createEmptyCoverageSourceStats(source: Source) {
  return {
    source,
    totalAds: 0,
    variantAds: 0,
    expectedCreatives: 0,
    availableCreatives: 0,
    materializedCreatives: 0,
    storedCreatives: 0,
    unavailableCreatives: 0,
    missingSourceCreatives: 0,
    storageFailedCreatives: 0,
    pendingStorageCreatives: 0,
    completeVariantAds: 0,
    partialVariantAds: 0,
    emptyVariantAds: 0,
  };
}

function createEmptyLandingPagePreviewSourceStats(source: Source) {
  return {
    source,
    adsWithLandingPage: 0,
    withPreview: 0,
    missingPreview: 0,
    neverCaptured: 0,
    capturedWithoutPreview: 0,
  };
}

export async function getAdminCreativeCoverageStats(): Promise<AdminCreativeCoverageStats> {
  const pool = getPool();
  const [rows] = await pool.query<
    Array<
      RowDataPacket & {
        id: string;
        source: Source;
        advertiserName: string;
        title: string | null;
        format: string | null;
        mediaUrl: string | null;
        metadata: unknown;
        lastSeenAt: Date;
      }
    >
  >(
    `
      select
        ads.id,
        ads.source,
        coalesce(advertiser_companies.display_name, advertisers.canonical_name) as advertiserName,
        ads.title,
        ads.format,
        ads.media_url as mediaUrl,
        ads.metadata,
        ads.last_seen_at as lastSeenAt
      from ads
      inner join advertisers on advertisers.id = ads.advertiser_id
      left join advertiser_companies on advertiser_companies.id = advertisers.company_id
    `,
  );
  const [landingPagePreviewRows] = await pool.query<
    Array<
      RowDataPacket & {
        source: Source;
        adsWithLandingPage: unknown;
        withPreview: unknown;
        neverCaptured: unknown;
        capturedWithoutPreview: unknown;
      }
    >
  >(
    `
      select
        ads.source,
        count(*) as adsWithLandingPage,
        sum(case when coalesce(snapshots.hasPreview, 0) = 1 then 1 else 0 end) as withPreview,
        sum(case when snapshots.adId is null then 1 else 0 end) as neverCaptured,
        sum(case when snapshots.adId is not null and coalesce(snapshots.hasPreview, 0) = 0 then 1 else 0 end) as capturedWithoutPreview
      from ads
      left join (
        select
          landing_page_snapshots.ad_id as adId,
          max(case when landing_page_snapshots.screenshot_url is not null and trim(landing_page_snapshots.screenshot_url) <> '' then 1 else 0 end) as hasPreview
        from landing_page_snapshots
        group by landing_page_snapshots.ad_id
      ) snapshots on snapshots.adId = ads.id
      where ads.destination_url is not null and trim(ads.destination_url) <> ''
      group by ads.source
    `,
  );
  const bySourceMap = new Map<Source, ReturnType<typeof createEmptyCoverageSourceStats>>();
  const landingPagePreviewBySourceMap = new Map<Source, ReturnType<typeof createEmptyLandingPagePreviewSourceStats>>();
  const worstAds: AdminCreativeCoverageStats["worstAds"] = [];
  let variantAds = 0;
  let expectedCreatives = 0;
  let availableCreatives = 0;
  let materializedCreatives = 0;
  let storedCreatives = 0;
  let unavailableCreatives = 0;
  let missingSourceCreatives = 0;
  let storageFailedCreatives = 0;
  let pendingStorageCreatives = 0;
  let completeVariantAds = 0;
  let partialVariantAds = 0;
  let emptyVariantAds = 0;
  let adsWithLandingPage = 0;
  let landingPagesWithPreview = 0;
  let landingPagesNeverCaptured = 0;
  let landingPagesCapturedWithoutPreview = 0;

  for (const row of landingPagePreviewRows) {
    const sourceStats = landingPagePreviewBySourceMap.get(row.source) ?? createEmptyLandingPagePreviewSourceStats(row.source);
    sourceStats.adsWithLandingPage += numberFromRowValue(row.adsWithLandingPage);
    sourceStats.withPreview += numberFromRowValue(row.withPreview);
    sourceStats.neverCaptured += numberFromRowValue(row.neverCaptured);
    sourceStats.capturedWithoutPreview += numberFromRowValue(row.capturedWithoutPreview);
    sourceStats.missingPreview = Math.max(0, sourceStats.adsWithLandingPage - sourceStats.withPreview);

    adsWithLandingPage += numberFromRowValue(row.adsWithLandingPage);
    landingPagesWithPreview += numberFromRowValue(row.withPreview);
    landingPagesNeverCaptured += numberFromRowValue(row.neverCaptured);
    landingPagesCapturedWithoutPreview += numberFromRowValue(row.capturedWithoutPreview);

    landingPagePreviewBySourceMap.set(row.source, sourceStats);
  }

  for (const row of rows) {
    const sourceStats = bySourceMap.get(row.source) ?? createEmptyCoverageSourceStats(row.source);
    const coverage = getCreativeCoverageForAd({
      format: row.format,
      mediaUrl: row.mediaUrl,
      metadata: row.metadata,
      source: row.source,
    });

    sourceStats.totalAds += 1;

    if (coverage.expectedCreatives > 1) {
      variantAds += 1;
      expectedCreatives += coverage.expectedCreatives;
      availableCreatives += coverage.availableCreatives;
      materializedCreatives += coverage.materializedCreatives;
      storedCreatives += coverage.storedCreatives;
      unavailableCreatives += coverage.unavailableCreatives;
      missingSourceCreatives += coverage.missingSourceCreatives;
      storageFailedCreatives += coverage.storageFailedCreatives;
      pendingStorageCreatives += coverage.pendingStorageCreatives;
      sourceStats.variantAds += 1;
      sourceStats.expectedCreatives += coverage.expectedCreatives;
      sourceStats.availableCreatives += coverage.availableCreatives;
      sourceStats.materializedCreatives += coverage.materializedCreatives;
      sourceStats.storedCreatives += coverage.storedCreatives;
      sourceStats.unavailableCreatives += coverage.unavailableCreatives;
      sourceStats.missingSourceCreatives += coverage.missingSourceCreatives;
      sourceStats.storageFailedCreatives += coverage.storageFailedCreatives;
      sourceStats.pendingStorageCreatives += coverage.pendingStorageCreatives;

      if (coverage.storedCreatives >= coverage.availableCreatives) {
        completeVariantAds += 1;
        sourceStats.completeVariantAds += 1;
      } else if (coverage.storedCreatives > 0) {
        partialVariantAds += 1;
        sourceStats.partialVariantAds += 1;
      } else {
        emptyVariantAds += 1;
        sourceStats.emptyVariantAds += 1;
      }

      worstAds.push({
        id: row.id,
        source: row.source,
        advertiserName: row.advertiserName,
        title: row.title,
        expectedCreatives: coverage.expectedCreatives,
        availableCreatives: coverage.availableCreatives,
        materializedCreatives: coverage.materializedCreatives,
        storedCreatives: coverage.storedCreatives,
        unavailableCreatives: coverage.unavailableCreatives,
        missingStoredCreatives: coverage.missingStoredCreatives,
        storageFailedCreatives: coverage.storageFailedCreatives,
        pendingStorageCreatives: coverage.pendingStorageCreatives,
        primaryGap: coverage.primaryGap,
        lastSeenAt: row.lastSeenAt,
      });
    }

    bySourceMap.set(row.source, sourceStats);
  }

  return {
    generatedAt: new Date(),
    totalAds: rows.length,
    variantAds,
    expectedCreatives,
    availableCreatives,
    materializedCreatives,
    storedCreatives,
    unavailableCreatives,
    missingSourceCreatives,
    storageFailedCreatives,
    pendingStorageCreatives,
    completeVariantAds,
    partialVariantAds,
    emptyVariantAds,
    landingPagePreviews: {
      adsWithLandingPage,
      withPreview: landingPagesWithPreview,
      missingPreview: Math.max(0, adsWithLandingPage - landingPagesWithPreview),
      neverCaptured: landingPagesNeverCaptured,
      capturedWithoutPreview: landingPagesCapturedWithoutPreview,
      bySource: Array.from(landingPagePreviewBySourceMap.values()).sort((left, right) =>
        left.source.localeCompare(right.source),
      ),
    },
    bySource: Array.from(bySourceMap.values()).sort((left, right) => left.source.localeCompare(right.source)),
    worstAds: worstAds
      .sort((left, right) => {
        const missingDifference = right.missingStoredCreatives - left.missingStoredCreatives;

        if (missingDifference) {
          return missingDifference;
        }

        const sourceDifference = right.unavailableCreatives - left.unavailableCreatives;

        if (sourceDifference) {
          return sourceDifference;
        }

        return right.availableCreatives - left.availableCreatives;
      })
      .slice(0, 20),
  };
}

export async function listCreativeAssetRepairCandidates(limit = 100): Promise<CreativeAssetRepairCandidate[]> {
  const pool = getPool();
  const cappedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const [rows] = await pool.query<
    Array<
      RowDataPacket & {
        id: string;
        advertiserId: string;
        source: Source;
        format: string | null;
        mediaUrl: string | null;
        metadata: unknown;
      }
    >
  >(
    `
      select
        ads.id,
        ads.advertiser_id as advertiserId,
        ads.source,
        ads.format,
        ads.media_url as mediaUrl,
        ads.metadata
      from ads
      where ads.metadata is not null
      order by ads.updated_at asc
    `,
  );
  const candidates: CreativeAssetRepairCandidate[] = [];

  for (const row of rows) {
    const coverage = getCreativeCoverageForAd({
      format: row.format,
      mediaUrl: row.mediaUrl,
      metadata: row.metadata,
      source: row.source,
    });

    if (coverage.missingStoredCreatives <= 0) {
      continue;
    }

    candidates.push({
      adId: row.id,
      advertiserId: row.advertiserId,
      source: row.source,
      expectedCreatives: coverage.expectedCreatives,
      availableCreatives: coverage.availableCreatives,
      storedCreatives: coverage.storedCreatives,
      missingStoredCreatives: coverage.missingStoredCreatives,
      storageFailedCreatives: coverage.storageFailedCreatives,
      pendingStorageCreatives: coverage.pendingStorageCreatives,
    });

    if (candidates.length >= cappedLimit) {
      break;
    }
  }

  return candidates;
}

export async function getAdminRefreshStats(): Promise<AdminRefreshStats> {
  const pool = getPool();
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60_000);
  const staleAdvertiserCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const activeStatusCheckCutoffMs = now.getTime() - 24 * 60 * 60_000;

  const [
    [adSummaryRows],
    [advertiserSummaryRows],
    [activeStatusRows],
    [sourceRows],
    [statusRows],
    [queueRows],
    [failureRows],
  ] = await Promise.all([
    pool.query<Array<RowDataPacket & {
      total: number | string;
      active: number | string;
      inactive: number | string;
      withMedia: number | string;
      seenLast24h: number | string;
      createdLast24h: number | string;
    }>>(
      `
        select
          count(*) as total,
          sum(case when status = 'active' then 1 else 0 end) as active,
          sum(case when status <> 'active' or status is null then 1 else 0 end) as inactive,
          sum(case when media_url is not null and media_url <> '' then 1 else 0 end) as withMedia,
          sum(case when last_seen_at >= ? then 1 else 0 end) as seenLast24h,
          sum(case when created_at >= ? then 1 else 0 end) as createdLast24h
        from ads
      `,
      [last24h, last24h],
    ),
    pool.query<Array<RowDataPacket & {
      total: number | string;
      neverIndexed: number | string;
      indexedLast24h: number | string;
      stale7d: number | string;
      oldestIndexedAt: Date | null;
      newestIndexedAt: Date | null;
    }>>(
      `
        select
          count(*) as total,
          sum(case when last_indexed_at is null then 1 else 0 end) as neverIndexed,
          sum(case when last_indexed_at >= ? then 1 else 0 end) as indexedLast24h,
          sum(case when last_indexed_at is null or last_indexed_at < ? then 1 else 0 end) as stale7d,
          min(last_indexed_at) as oldestIndexedAt,
          max(last_indexed_at) as newestIndexedAt
        from advertisers
      `,
      [last24h, staleAdvertiserCutoff],
    ),
    pool.query<Array<RowDataPacket & {
      dueAdvertisers: number | string;
      dueAds: number | string;
      oldestCheckedAtMs: number | string | null;
    }>>(
      `
        select
          count(distinct advertisers.id) as dueAdvertisers,
          count(*) as dueAds,
          min(cast(json_unquote(json_extract(ads.metadata, '$.activeStatusCheckedAtMs')) as unsigned)) as oldestCheckedAtMs
        from ads
        inner join advertisers on advertisers.id = ads.advertiser_id
        where ads.status = 'active'
          and ads.source_ad_id is not null
          and ads.source_ad_id <> ''
          and (
            json_extract(ads.metadata, '$.activeStatusCheckedAtMs') is null
            or cast(json_unquote(json_extract(ads.metadata, '$.activeStatusCheckedAtMs')) as unsigned) <= ?
          )
      `,
      [activeStatusCheckCutoffMs],
    ),
    pool.query<Array<RowDataPacket & {
      source: Source;
      advertisers: number | string;
      ads: number | string;
      activeAds: number | string;
      lastIndexedAt: Date | null;
      lastSeenAt: Date | null;
    }>>(
      `
        select
          advertisers.source as source,
          count(distinct advertisers.id) as advertisers,
          count(ads.id) as ads,
          sum(case when ads.status = 'active' then 1 else 0 end) as activeAds,
          max(advertisers.last_indexed_at) as lastIndexedAt,
          max(ads.last_seen_at) as lastSeenAt
        from advertisers
        left join ads on ads.advertiser_id = advertisers.id
        group by advertisers.source
        order by advertisers.source
      `,
    ),
    pool.query<Array<RowDataPacket & {
      source: Source;
      status: string | null;
      total: number | string;
    }>>(
      `
        select source, coalesce(status, 'unknown') as status, count(*) as total
        from ads
        group by source, coalesce(status, 'unknown')
        order by source, total desc
      `,
    ),
    pool.query<Array<RowDataPacket & {
      queueName: string;
      queued: number | string;
      running: number | string;
      completed: number | string;
      failed: number | string;
      lastUpdatedAt: Date | null;
    }>>(
      `
        select
          queue_name as queueName,
          sum(case when job_status = 'queued' then 1 else 0 end) as queued,
          sum(case when job_status = 'running' then 1 else 0 end) as running,
          sum(case when job_status = 'completed' then 1 else 0 end) as completed,
          sum(case when job_status = 'failed' then 1 else 0 end) as failed,
          max(updated_at) as lastUpdatedAt
        from jobs
        group by queue_name
        order by queue_name
      `,
    ),
    pool.query<Array<RowDataPacket & {
      id: string;
      queueName: string;
      status: "failed";
      attempts: number;
      updatedAt: Date;
      startedAt: Date | null;
      finishedAt: Date | null;
      payload: unknown;
    }>>(
      `
        select
          jobs.id,
          jobs.queue_name as queueName,
          jobs.job_status as status,
          jobs.attempts,
          jobs.updated_at as updatedAt,
          jobs.started_at as startedAt,
          jobs.finished_at as finishedAt,
          jobs.payload
        from (
          select id
          from jobs
          where job_status = 'failed'
          limit 8
        ) recent_failed_jobs
        inner join jobs on jobs.id = recent_failed_jobs.id
      `,
    ),
  ]);

  const adSummary = adSummaryRows[0];
  const advertiserSummary = advertiserSummaryRows[0];
  const activeStatus = activeStatusRows[0];

  return {
    generatedAt: now,
    ads: {
      total: numberFromRowValue(adSummary?.total),
      active: numberFromRowValue(adSummary?.active),
      inactive: numberFromRowValue(adSummary?.inactive),
      withMedia: numberFromRowValue(adSummary?.withMedia),
      seenLast24h: numberFromRowValue(adSummary?.seenLast24h),
      createdLast24h: numberFromRowValue(adSummary?.createdLast24h),
    },
    advertisers: {
      total: numberFromRowValue(advertiserSummary?.total),
      neverIndexed: numberFromRowValue(advertiserSummary?.neverIndexed),
      indexedLast24h: numberFromRowValue(advertiserSummary?.indexedLast24h),
      stale7d: numberFromRowValue(advertiserSummary?.stale7d),
      oldestIndexedAt: advertiserSummary?.oldestIndexedAt ?? null,
      newestIndexedAt: advertiserSummary?.newestIndexedAt ?? null,
    },
    activeStatusChecks: {
      dueAdvertisers: numberFromRowValue(activeStatus?.dueAdvertisers),
      dueAds: numberFromRowValue(activeStatus?.dueAds),
      oldestCheckedAtMs:
        activeStatus?.oldestCheckedAtMs === null || activeStatus?.oldestCheckedAtMs === undefined
          ? null
          : numberFromRowValue(activeStatus.oldestCheckedAtMs),
    },
    bySource: sourceRows.map((row) => ({
      source: row.source,
      advertisers: numberFromRowValue(row.advertisers),
      ads: numberFromRowValue(row.ads),
      activeAds: numberFromRowValue(row.activeAds),
      lastIndexedAt: row.lastIndexedAt,
      lastSeenAt: row.lastSeenAt,
    })),
    adStatuses: statusRows.map((row) => ({
      source: row.source,
      status: row.status ?? "unknown",
      total: numberFromRowValue(row.total),
    })),
    queues: queueRows.map((row) => ({
      queueName: row.queueName,
      queued: numberFromRowValue(row.queued),
      running: numberFromRowValue(row.running),
      completed: numberFromRowValue(row.completed),
      failed: numberFromRowValue(row.failed),
      lastUpdatedAt: row.lastUpdatedAt,
    })),
    recentFailures: failureRows.map((job) => ({
      id: job.id,
      queueName: job.queueName,
      status: job.status,
      attempts: Number(job.attempts ?? 0),
      updatedAt: job.updatedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      errorMessage: extractJobErrorMessage(job.payload),
    })),
  };
}

async function deleteAdDependents(
  executor: Pick<ReturnType<typeof getDb>, "delete" | "select">,
  adIds: string[],
) {
  if (!adIds.length) {
    return {
      adsDeleted: 0,
      savedAdsDeleted: 0,
      alertsDeleted: 0,
    };
  }

  const savedAds = await executor
    .select({ id: savedAdsTable.id })
    .from(savedAdsTable)
    .where(inArray(savedAdsTable.adId, adIds));
  const alerts = await executor
    .select({ id: alertsTable.id })
    .from(alertsTable)
    .where(inArray(alertsTable.adId, adIds));
  const savedAdIds = savedAds.map((savedAd) => savedAd.id);
  const alertIds = alerts.map((alert) => alert.id);

  if (savedAdIds.length) {
    await executor
      .delete(swipeFileCollectionItemsTable)
      .where(inArray(swipeFileCollectionItemsTable.savedAdId, savedAdIds));
  }

  if (alertIds.length) {
    await executor
      .delete(alertDeliveriesTable)
      .where(inArray(alertDeliveriesTable.alertId, alertIds));
  }

  await executor.delete(savedAdsTable).where(inArray(savedAdsTable.adId, adIds));
  await executor.delete(alertsTable).where(inArray(alertsTable.adId, adIds));
  await executor.delete(landingPageSnapshotsTable).where(inArray(landingPageSnapshotsTable.adId, adIds));
  await executor.delete(adObservationsTable).where(inArray(adObservationsTable.adId, adIds));

  return {
    adsDeleted: adIds.length,
    savedAdsDeleted: savedAdIds.length,
    alertsDeleted: alertIds.length,
  };
}

export async function deleteAdminAd(adId: string) {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [ad] = await tx
      .select({
        id: adsTable.id,
      })
      .from(adsTable)
      .where(eq(adsTable.id, adId))
      .limit(1);

    if (!ad) {
      return {
        deleted: false,
        adId,
      };
    }

    const deleted = await deleteAdDependents(tx, [ad.id]);
    await tx.delete(adsTable).where(eq(adsTable.id, ad.id));

    return {
      deleted: true,
      adId: ad.id,
      ...deleted,
    };
  });
}

export async function deleteAdminAdvertiser(advertiserId: string) {
  const result = await deleteAdminAdvertisers([advertiserId]);

  return {
    deleted: result.deleted,
    advertiserId,
    adsDeleted: result.adsDeleted,
    savedAdsDeleted: result.savedAdsDeleted,
    alertsDeleted: result.alertsDeleted,
  };
}

export async function deleteAdminAdvertisers(advertiserIds: string[]) {
  const db = getDb();
  const uniqueAdvertiserIds = Array.from(new Set(advertiserIds.map((id) => id.trim()).filter(Boolean)));

  return db.transaction(async (tx) => {
    if (!uniqueAdvertiserIds.length) {
      return {
        deleted: false,
        advertiserIds: [],
        advertisersDeleted: 0,
        adsDeleted: 0,
        savedAdsDeleted: 0,
        alertsDeleted: 0,
      };
    }

    const advertisers = await tx
      .select({
        id: advertisersTable.id,
        companyId: advertisersTable.companyId,
      })
      .from(advertisersTable)
      .where(inArray(advertisersTable.id, uniqueAdvertiserIds));

    if (!advertisers.length) {
      return {
        deleted: false,
        advertiserIds: uniqueAdvertiserIds,
        advertisersDeleted: 0,
        adsDeleted: 0,
        savedAdsDeleted: 0,
        alertsDeleted: 0,
      };
    }

    const existingAdvertiserIds = advertisers.map((advertiser) => advertiser.id);
    const companyIds = Array.from(new Set(advertisers.flatMap((advertiser) => advertiser.companyId ? [advertiser.companyId] : [])));
    const ads = await tx
      .select({ id: adsTable.id })
      .from(adsTable)
      .where(inArray(adsTable.advertiserId, existingAdvertiserIds));
    const adIds = ads.map((ad) => ad.id);
    const deletedAds = await deleteAdDependents(tx, adIds);

    if (adIds.length) {
      await tx.delete(adsTable).where(inArray(adsTable.id, adIds));
    }

    await tx.delete(trackerNotificationsTable).where(inArray(trackerNotificationsTable.advertiserId, existingAdvertiserIds));
    await tx.delete(trackedCompaniesTable).where(inArray(trackedCompaniesTable.advertiserId, existingAdvertiserIds));
    await tx.delete(advertiserSearchAliasesTable).where(inArray(advertiserSearchAliasesTable.advertiserId, existingAdvertiserIds));
    await tx.delete(advertiserSearchQueryResultsTable).where(inArray(advertiserSearchQueryResultsTable.advertiserId, existingAdvertiserIds));

    await tx.delete(advertisersTable).where(inArray(advertisersTable.id, existingAdvertiserIds));

    for (const companyId of companyIds) {
      const [remainingCompanyAdvertiser] = await tx
        .select({ id: advertisersTable.id })
        .from(advertisersTable)
        .where(eq(advertisersTable.companyId, companyId))
        .limit(1);

      if (!remainingCompanyAdvertiser) {
        await tx.delete(advertiserCompaniesTable).where(eq(advertiserCompaniesTable.id, companyId));
      }
    }

    return {
      deleted: true,
      advertiserIds: existingAdvertiserIds,
      advertisersDeleted: existingAdvertiserIds.length,
      ...deletedAds,
    };
  });
}

export async function mergeAdminAdvertisers(input: {
  advertiserIds: string[];
  displayName: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
}) {
  const db = getDb();
  const uniqueAdvertiserIds = Array.from(new Set(input.advertiserIds.map((id) => id.trim()).filter(Boolean)));
  const displayName = input.displayName.trim();
  const normalizedWebsite = normalizeAdvertiserWebsite(input.websiteUrl ?? null);
  const nameKey = normalizeAdvertiserSearchEntityKey(displayName) ?? createHash("sha1").update(displayName).digest("hex").slice(0, 16);
  const normalizedDomain = normalizedWebsite.normalizedDomain ?? `name:${nameKey}`;
  const companyId = createHash("sha1").update(normalizedDomain).digest("hex");
  const websiteUrl = normalizedWebsite.normalizedDomain
    ? toRootAdvertiserWebsiteUrl(normalizedWebsite.websiteUrl, normalizedWebsite.normalizedDomain)
    : null;
  const logoUrl = resolveCdnAssetUrl(input.logoUrl ?? null) ?? input.logoUrl ?? null;
  const now = new Date();

  if (uniqueAdvertiserIds.length < 2) {
    throw new Error("Select at least two advertiser rows to merge.");
  }

  if (!displayName) {
    throw new Error("Choose a display name for the merged advertiser.");
  }

  return db.transaction(async (tx) => {
    const advertisers = await tx
      .select({
        id: advertisersTable.id,
        companyId: advertisersTable.companyId,
      })
      .from(advertisersTable)
      .where(inArray(advertisersTable.id, uniqueAdvertiserIds));

    if (advertisers.length < 2) {
      throw new Error("At least two selected advertisers must still exist.");
    }

    const previousCompanyIds = Array.from(new Set(advertisers.flatMap((advertiser) => advertiser.companyId ? [advertiser.companyId] : [])));
    const [existingCompany] = await tx
      .select()
      .from(advertiserCompaniesTable)
      .where(eq(advertiserCompaniesTable.id, companyId))
      .limit(1);

    await tx
      .insert(advertiserCompaniesTable)
      .values({
        id: companyId,
        normalizedDomain,
        websiteUrl,
        displayName,
        logoUrl,
        createdAt: existingCompany?.createdAt ?? now,
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          websiteUrl,
          displayName,
          logoUrl,
          updatedAt: now,
        },
      });

    const updateSet: Partial<typeof advertisersTable.$inferInsert> = {
      companyId,
      updatedAt: now,
    };

    if (normalizedWebsite.normalizedDomain) {
      updateSet.websiteUrl = websiteUrl;
      updateSet.normalizedDomain = normalizedWebsite.normalizedDomain;
    }

    await tx
      .update(advertisersTable)
      .set(updateSet)
      .where(inArray(advertisersTable.id, advertisers.map((advertiser) => advertiser.id)));

    const mergedAdvertisers = await tx
      .select()
      .from(advertisersTable)
      .where(inArray(advertisersTable.id, advertisers.map((advertiser) => advertiser.id)));

    const fanoutTrackedCompanyIds = (
      await Promise.all(mergedAdvertisers.map((advertiser) => createMissingTrackedCompaniesForAdvertiser(tx, advertiser)))
    ).flat();

    for (const previousCompanyId of previousCompanyIds) {
      if (previousCompanyId === companyId) {
        continue;
      }

      const [remainingCompanyAdvertiser] = await tx
        .select({ id: advertisersTable.id })
        .from(advertisersTable)
        .where(eq(advertisersTable.companyId, previousCompanyId))
        .limit(1);

      if (!remainingCompanyAdvertiser) {
        await tx.delete(advertiserCompaniesTable).where(eq(advertiserCompaniesTable.id, previousCompanyId));
      }
    }

    return {
      merged: true,
      advertiserIds: advertisers.map((advertiser) => advertiser.id),
      advertisersMerged: advertisers.length,
      companyId,
      fanoutTrackedCompanyIds,
    };
  });
}

function normalizeAdvertiserSearchEntityKey(name: string) {
  return normalizeAdvertiserBrandKey(name) ?? "";
}

function collapseAdvertiserSearchEntities(entities: AggregatedAdvertiserEntity[]) {
  const collapsedByName = new Map<string, AggregatedAdvertiserEntity>();

  for (const entity of entities) {
    const key = normalizeAdvertiserSearchEntityKey(entity.canonicalName);

    if (!key) {
      collapsedByName.set(entity.id, entity);
      continue;
    }

    const existing = collapsedByName.get(key);

    if (!existing) {
      collapsedByName.set(key, entity);
      continue;
    }

    const preferred = compareAdvertiserBrandCandidates(entity, existing) < 0 ? entity : existing;
    const fallback = preferred === entity ? existing : entity;

    collapsedByName.set(key, {
      ...preferred,
      advertiserIds: Array.from(new Set([...preferred.advertiserIds, ...fallback.advertiserIds])),
      sourceAdvertiserIds: Array.from(new Set([...preferred.sourceAdvertiserIds, ...fallback.sourceAdvertiserIds])),
      sources: Array.from(new Set([...preferred.sources, ...fallback.sources])),
      sourceProfiles: [...preferred.sourceProfiles, ...fallback.sourceProfiles],
      logoUrl: preferred.logoUrl ?? fallback.logoUrl,
      industry: preferred.industry ?? fallback.industry,
      companySize: preferred.companySize ?? fallback.companySize,
      country: preferred.country ?? fallback.country,
      summary: preferred.summary ?? fallback.summary,
    });
  }

  return Array.from(collapsedByName.values());
}

export async function searchAppShell(query: string): Promise<AppShellSearchResult> {
  const db = getDb();
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return {
      ads: [],
      advertisers: [],
      landingPages: [],
    };
  }

  const pattern = `%${normalizedQuery}%`;

  const [ads, advertisers, landingPages] = await Promise.all([
    db
      .select({
        id: adsTable.id,
        advertiserId: advertisersTable.id,
        companyId: advertisersTable.companyId,
        advertiserName: advertiserDisplayNameSql(),
        headline: adsTable.title,
        callToAction: adsTable.callToAction,
        thumbnailUrl: adsTable.mediaUrl,
      })
      .from(adsTable)
      .innerJoin(advertisersTable, eq(adsTable.advertiserId, advertisersTable.id))
      .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
      .where(
        or(
          like(adsTable.title, pattern),
          like(adsTable.body, pattern),
          like(advertisersTable.canonicalName, pattern),
          like(advertiserCompaniesTable.displayName, pattern),
        ),
      )
      .orderBy(desc(adsTable.lastSeenAt))
      .limit(4),
    db
      .select({
        advertiserId: advertisersTable.id,
        companyId: advertisersTable.companyId,
        source: advertisersTable.source,
        name: advertiserDisplayNameSql(),
        logoUrl: advertiserLogoUrlSql(),
        industry: advertisersTable.industry,
        country: advertisersTable.country,
      })
      .from(advertisersTable)
      .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
      .where(
        or(
          like(advertisersTable.canonicalName, pattern),
          like(advertiserCompaniesTable.displayName, pattern),
          like(advertisersTable.industry, pattern),
          like(advertisersTable.country, pattern),
        ),
      )
      .orderBy(desc(advertisersTable.lastIndexedAt), advertiserDisplayNameSql())
      .limit(12),
    db
      .select({
        id: landingPageSnapshotsTable.id,
        advertiserId: advertisersTable.id,
        companyId: advertisersTable.companyId,
        advertiserName: advertiserDisplayNameSql(),
        title: landingPageSnapshotsTable.title,
        url: landingPageSnapshotsTable.url,
      })
      .from(landingPageSnapshotsTable)
      .innerJoin(adsTable, eq(landingPageSnapshotsTable.adId, adsTable.id))
      .innerJoin(advertisersTable, eq(adsTable.advertiserId, advertisersTable.id))
      .leftJoin(advertiserCompaniesTable, eq(advertisersTable.companyId, advertiserCompaniesTable.id))
      .where(
        or(
          like(landingPageSnapshotsTable.title, pattern),
          like(landingPageSnapshotsTable.url, pattern),
          like(advertisersTable.canonicalName, pattern),
          like(advertiserCompaniesTable.displayName, pattern),
        ),
      )
      .orderBy(desc(landingPageSnapshotsTable.capturedAt))
      .limit(4),
  ]);

  return {
    ads: ads.map((ad) => ({
      ...ad,
      advertiserId: buildPublicAdvertiserId({
        companyId: ad.companyId,
        advertiserId: ad.companyId ? null : ad.advertiserId,
      }),
      headline: ad.headline ?? "Untitled ad",
      thumbnailUrl: resolveCdnAssetUrl(ad.thumbnailUrl),
    })),
    advertisers: collapseAdvertiserSearchEntities(
      groupAdvertiserEntityMembers(
        advertisers.map(
          (advertiser): AdvertiserEntityMember => ({
            advertiserId: advertiser.advertiserId,
            source: advertiser.source,
            sourceAdvertiserId: "",
            canonicalName: advertiser.name,
            profileUrl: null,
            websiteUrl: null,
            normalizedDomain: null,
            companyId: advertiser.companyId,
            logoUrl: advertiser.logoUrl,
            industry: advertiser.industry,
            companySize: null,
            country: advertiser.country,
            summary: null,
            trackedCompanyId: null,
            trackedStatus: null,
            lastIndexedAt: null,
            totalAds: 0,
            activeAds: 0,
            averageEngagement: 0,
            lastSeenAt: null,
            lastSyncedAt: null,
            createdAt: null,
          }),
        ),
      ),
    )
      .slice(0, 4)
      .map((advertiser) => ({
        id: advertiser.id,
        advertiserIds: advertiser.advertiserIds,
        sources: advertiser.sources,
        name: advertiser.canonicalName,
        logoUrl: advertiser.logoUrl,
        industry: advertiser.industry,
        country: advertiser.country,
      })),
    landingPages: landingPages.map((page) => ({
      ...page,
      advertiserId: buildPublicAdvertiserId({
        companyId: page.companyId,
        advertiserId: page.companyId ? null : page.advertiserId,
      }),
    })),
  };
}

export async function getAdvertiserDirectoryDetail(
  userId: string,
  advertiserId: string,
  workspaceId?: string | null,
): Promise<AdvertiserDirectoryDetail | null> {
  const db = getDb();
  const resolvedWorkspaceId = await resolveWorkspaceIdForUser(userId, workspaceId);
  const advertiserIds = await resolveAdvertiserEntityAdvertiserIds(advertiserId);

  if (!advertiserIds.length) {
    return null;
  }

  const rawEntityMembers = await selectAdvertiserEntityMembersForUser({
    userId,
    workspaceId: resolvedWorkspaceId,
    advertiserIds,
    limit: advertiserIds.length,
  });
  const entity = groupAdvertiserEntityMembers(rawEntityMembers)[0];
  const memberByAdvertiserId = new Map(
    rawEntityMembers.map((member) => [member.advertiserId, member] as const),
  );

  if (!entity) {
    return null;
  }

  const allAds = await db
    .select({
      id: adsTable.id,
      source: adsTable.source,
      sourceAdId: adsTable.sourceAdId,
      advertiserId: adsTable.advertiserId,
      title: adsTable.title,
      body: adsTable.body,
      format: adsTable.format,
      callToAction: adsTable.callToAction,
      status: adsTable.status,
      reactionCount: adsTable.reactionCount,
      commentCount: adsTable.commentCount,
      destinationUrl: adsTable.destinationUrl,
      mediaUrl: adsTable.mediaUrl,
      metadata: adsTable.metadata,
      snapshotUrl: landingPageSnapshotsTable.url,
      snapshotTitle: landingPageSnapshotsTable.title,
      screenshotUrl: landingPageSnapshotsTable.screenshotUrl,
      firstSeenAt: adsTable.firstSeenAt,
      lastSeenAt: adsTable.lastSeenAt,
      savedAdId: savedAdsTable.id,
    })
    .from(adsTable)
    .leftJoin(landingPageSnapshotsTable, eq(landingPageSnapshotsTable.adId, adsTable.id))
    .leftJoin(savedAdsTable, and(eq(savedAdsTable.adId, adsTable.id), eq(savedAdsTable.workspaceId, resolvedWorkspaceId)))
    .where(and(inArray(adsTable.advertiserId, entity.advertiserIds), notFixtureMetadataSql(adsTable.metadata)))
    .orderBy(desc(adsTable.lastSeenAt));

  const recentAds = allAds.slice(0, 8).map((ad) => {
    const mediaDimensions = getAdMediaDimensions(ad.metadata);
    const linkedInDetails = ad.source === "linkedin" ? getLinkedInAdDetails(ad.metadata, ad.format) : null;

    return {
      id: ad.id,
      title: ad.title,
      body: ad.body,
      transcript: getAdTranscript(ad.metadata),
      format: ad.format,
      callToAction: ad.callToAction,
      status: ad.status,
      reactionCount: Number(ad.reactionCount ?? 0),
      commentCount: Number(ad.commentCount ?? 0),
      destinationUrl: cleanAdDestinationUrl(ad.source, ad.destinationUrl),
      mediaUrl: resolveCdnAssetUrl(ad.mediaUrl),
      posterUrl: getAdPosterUrl(ad.metadata, ad.source),
      videoUrl: getAdVideoUrl(ad.metadata, ad.source),
      mediaWidth: mediaDimensions?.width ?? null,
      mediaHeight: mediaDimensions?.height ?? null,
      mediaAspectRatio: mediaDimensions?.aspectRatio ?? null,
      snapshotUrl: cleanAdDestinationUrl(ad.source, ad.snapshotUrl),
      snapshotTitle: ad.snapshotTitle,
      firstSeenAt: ad.firstSeenAt,
      lastSeenAt: ad.lastSeenAt,
      impressions:
        ad.source === "facebook"
          ? getMetaEstimatedReachValue(getMetadataRecord(getMetadataRecord(ad.metadata)?.rawPayload) ?? {})
          : ad.source === "linkedin"
            ? pickFirstBoundedMetricLower([linkedInDetails?.totalImpressions])
            : null,
      isSaved: Boolean(ad.savedAdId),
    };
  });

  const ads = allAds.map((ad) => {
    const mediaDimensions = getAdMediaDimensions(ad.metadata);
    const linkedInDetails = ad.source === "linkedin" ? getLinkedInAdDetails(ad.metadata, ad.format) : null;

    return {
      id: ad.id,
      sourceAdId: ad.sourceAdId,
      source: memberByAdvertiserId.get(ad.advertiserId)?.source ?? "linkedin",
      title: ad.title,
      body: ad.body,
      transcript: getAdTranscript(ad.metadata),
      format: ad.format,
      callToAction: ad.callToAction,
      status: ad.status,
      reactionCount: Number(ad.reactionCount ?? 0),
      commentCount: Number(ad.commentCount ?? 0),
      destinationUrl: cleanAdDestinationUrl(ad.source, ad.destinationUrl),
      mediaUrl: resolveCdnAssetUrl(ad.mediaUrl),
      posterUrl: getAdPosterUrl(ad.metadata, ad.source),
      videoUrl: getAdVideoUrl(ad.metadata, ad.source),
      mediaWidth: mediaDimensions?.width ?? null,
      mediaHeight: mediaDimensions?.height ?? null,
      mediaAspectRatio: mediaDimensions?.aspectRatio ?? null,
      snapshotUrl: cleanAdDestinationUrl(ad.source, ad.snapshotUrl),
      snapshotTitle: ad.snapshotTitle,
      firstSeenAt: ad.firstSeenAt,
      lastSeenAt: ad.lastSeenAt,
      impressions:
        ad.source === "facebook"
          ? getMetaEstimatedReachValue(getMetadataRecord(getMetadataRecord(ad.metadata)?.rawPayload) ?? {})
          : ad.source === "linkedin"
            ? pickFirstBoundedMetricLower([linkedInDetails?.totalImpressions])
            : null,
      isSaved: Boolean(ad.savedAdId),
    };
  });

  const averageReactions = allAds.length
    ? Math.round(allAds.reduce((sum, ad) => sum + Number(ad.reactionCount ?? 0), 0) / allAds.length)
    : 0;
  const averageComments = allAds.length
    ? Math.round(allAds.reduce((sum, ad) => sum + Number(ad.commentCount ?? 0), 0) / allAds.length)
    : 0;

  const formatBreakdown = Array.from(
    allAds.reduce((acc, ad) => {
      const key = ad.format?.trim() || "Unknown format";
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<string, number>()),
  )
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 6);

  const ctaBreakdown = Array.from(
    allAds.reduce((acc, ad) => {
      const key = ad.callToAction?.trim() || "No CTA";
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<string, number>()),
  )
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 6);

  const launchTimeline = Array.from(
    allAds.reduce((acc, ad) => {
      const key = ad.firstSeenAt.toISOString().slice(0, 10);
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<string, number>()),
  )
    .map(([date, count]) => ({ date, count }))
    .sort((left, right) => left.date.localeCompare(right.date));

  const landingPages = Array.from(
    allAds.reduce((acc, ad) => {
      const destinationUrl = cleanAdDestinationUrl(ad.source, ad.destinationUrl);
      const snapshotUrl = cleanAdDestinationUrl(ad.source, ad.snapshotUrl);
      const key = snapshotUrl ?? destinationUrl;
      if (!key) {
        return acc;
      }

      const existing = acc.get(key);
      if (existing) {
        const nextTitle = cleanLandingPageTitle(ad.snapshotTitle) ?? ad.title ?? null;
        existing.count += 1;
        existing.activeAdsCount += ad.status?.toLowerCase() === "active" ? 1 : 0;
        existing.sources[ad.source] = (existing.sources[ad.source] ?? 0) + 1;
        if (ad.firstSeenAt < existing.firstSeenAt) {
          existing.firstSeenAt = ad.firstSeenAt;
        }
        if (ad.lastSeenAt > existing.lastSeenAt) {
          existing.lastSeenAt = ad.lastSeenAt;
        }
        if (!existing.screenshotUrl && ad.screenshotUrl) {
          existing.screenshotUrl = resolveCdnAssetUrl(ad.screenshotUrl);
        }
        if (!existing.title && nextTitle) {
          existing.title = nextTitle;
        }
        return acc;
      }

      const title = cleanLandingPageTitle(ad.snapshotTitle) ?? ad.title ?? null;

      acc.set(key, {
        url: key,
        title,
        sources: { [ad.source]: 1 },
        count: 1,
        activeAdsCount: ad.status?.toLowerCase() === "active" ? 1 : 0,
        firstSeenAt: ad.firstSeenAt,
        lastSeenAt: ad.lastSeenAt,
        screenshotUrl: resolveCdnAssetUrl(ad.screenshotUrl),
        status: ad.status?.toLowerCase() === "active" ? ("active" as const) : ("inactive" as const),
      });
      return acc;
    }, new Map<
      string,
      {
        url: string;
        title: string | null;
        sources: Partial<Record<Source, number>>;
        count: number;
        activeAdsCount: number;
        firstSeenAt: Date;
        lastSeenAt: Date;
        screenshotUrl: string | null;
        status: "active" | "inactive";
      }
    >()),
  )
    .map(([, value]) => ({
      ...value,
      source: (Object.entries(value.sources) as Array<[Source, number]>)
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? "linkedin",
      status: value.activeAdsCount > 0 ? ("active" as const) : ("inactive" as const),
    }))
    .sort((left, right) => right.count - left.count || left.url.localeCompare(right.url));

  const creativeAssets = allAds
    .filter((ad): ad is typeof ad & { screenshotUrl: string | null; mediaUrl: string | null } => Boolean(ad.screenshotUrl || ad.mediaUrl))
    .map((ad) => ({
      adId: ad.id,
      label: ad.title ?? ad.format ?? "Creative asset",
      previewUrl: resolveCdnAssetUrl(ad.screenshotUrl) ?? resolveCdnAssetUrl(ad.mediaUrl) ?? "",
    }))
    .slice(0, 8);

  const copyHighlights = allAds
    .filter((ad) => Boolean(ad.title || ad.body))
    .sort((left, right) => {
      const reactionDelta = Number(right.reactionCount ?? 0) - Number(left.reactionCount ?? 0);
      if (reactionDelta !== 0) {
        return reactionDelta;
      }

      return right.lastSeenAt.getTime() - left.lastSeenAt.getTime();
    })
    .slice(0, 6)
    .map((ad) => ({
      adId: ad.id,
      title: ad.title,
      body: ad.body,
      reactions: Number(ad.reactionCount ?? 0),
    }));

  return {
    ...entity,
    averageReactions,
    averageComments,
    formatBreakdown,
    ctaBreakdown,
    launchTimeline,
    landingPages,
    creativeAssets,
    copyHighlights,
    ads,
    recentAds,
  };
}

export async function pingDatabase() {
  const db = getDb();
  await db.execute(sql`select 1`);
}
