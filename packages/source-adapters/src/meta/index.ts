import { randomUUID } from "node:crypto";

import {
  AdvertiserSearchError,
  type AdvertiserMatch,
  type FetchAdvertiserAdsOptions,
  type NormalizedAd,
  type SourceAdapter,
} from "../types";
import { buildSourceScopedId, fetchLandingPageSnapshot, isE2eFixtureMode } from "../helpers";
import {
  fetchTextViaHttpProxy,
  fetchTextViaWebScrapingApi,
  fetchTextViaWebScrapingApiProxy,
  getResponseHeader,
  type WebScrapingApiProxyOptions,
  type WebScrapingApiTextResponse,
} from "../webscrapingapi";

const fixtureFetchCounts = new Map<string, number>();
const metaBaseUrl = "https://www.facebook.com";
const metaGraphqlUrl = `${metaBaseUrl}/api/graphql/`;
const metaRequestTimeoutMs = 20_000;
const metaSearchDocId = "25987067537594875";
const metaSearchFriendlyName = "AdLibrarySearchPaginationQuery";
const metaAdDetailsDocId = "25068828942793558";
const metaAdDetailsFriendlyName = "AdLibraryV3AdDetailsQuery";
const metaDefaultSearchLimit = 8;
const metaDefaultAdsLimit = 50;
const metaMaxAdsPerPage = 10;
const metaAdLibraryCountry = "GB";
const metaAdLibraryTransparencyCountry = "RO";
const metaCometDyn =
  "7xeUmwlECdwn8K2Wmh0no6u5U4e1Fx-ewSAwHwNw9G2S2q0_EtxG4o0B-qbwgE1EEb87C1xwEwgo9oO0n24oaEd86a3a1YwBgao6C0Mo6i588Etw8WfK1LwPxe2GewbCXwJwmE2eUlwhE2Lw6OyES0gq0K-1LwqobU3Cwr86C1nwf6Eb87u0jW0eowRw";
const metaSessionMaxAttempts = 4;
const metaSessionRetryDelayMs = [2_000, 5_000, 10_000];
const defaultMetaProxyAttemptsPerRequest = 12;
const metaRenderedRequestTimeoutMs = 120_000;
let metaProxyCursor = Math.floor(Math.random() * 1_000_000);

export type CreateMetaAdapterOptions = {
  metaProxyUrl?: string;
  metaProxyUrls?: string[];
  metaTransportOrder?: "proxy-first" | "webscrapingapi-first";
  webScrapingApiCountry?: string;
  webScrapingApiKey?: string;
  webScrapingApiProxy?: WebScrapingApiProxyOptions;
};

export type FetchMetaAdLibraryDetailsOptions = CreateMetaAdapterOptions & {
  collationAdIds?: string[];
  collationCount?: number | string | null;
  collationId?: string | null;
  country?: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shuffledMetaProxyAttempts(metaProxyUrls: string[]) {
  const [primaryProxyUrl, ...remainingProxyUrls] = metaProxyUrls;
  const shuffled = [...remainingProxyUrls];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }

  const attempts = primaryProxyUrl ? [primaryProxyUrl, ...shuffled] : shuffled;

  return attempts.slice(0, Math.min(getMetaProxyAttemptsPerRequest(), attempts.length));
}

function getMetaProxyAttemptsPerRequest() {
  const parsed = Number.parseInt(process.env.META_PROXY_ATTEMPTS_PER_REQUEST ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMetaProxyAttemptsPerRequest;
}

function isMetaRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return /rate limit|429|temporarily blocked|try again/i.test(message);
}

function createWebScrapingApiProxySessionId() {
  return `${Date.now()}${Math.floor(Math.random() * 1_000_000).toString().padStart(6, "0")}`.slice(-16);
}

function createMetaCometSessionToken() {
  return `::${Math.random().toString(36).slice(2, 8)}`;
}

function hasWebScrapingApiTransport(options?: MetaFetchOptions) {
  return Boolean(options?.webScrapingApiProxy || options?.webScrapingApiKey?.trim());
}

function collectCookiePairs(setCookieHeader?: string) {
  if (!setCookieHeader) {
    return [];
  }

  return [...setCookieHeader.matchAll(/(?:^|,\s*)([A-Za-z0-9_.$-]+=[^;,]*)/g)].map((match) => match[1]);
}

function mergeCookieHeaders(...cookieHeaders: Array<string | undefined>) {
  const cookies = new Map<string, string>();

  for (const cookieHeader of cookieHeaders) {
    const pairs = cookieHeader?.includes(";") && !/[;,]\s*(?:Path|Expires|Max-Age|Domain|Secure|HttpOnly|SameSite)\b/i.test(cookieHeader)
      ? cookieHeader.split(";").map((value) => value.trim()).filter(Boolean)
      : collectCookiePairs(cookieHeader);

    for (const pair of pairs ?? []) {
      const separatorIndex = pair.indexOf("=");

      if (separatorIndex <= 0) {
        continue;
      }

      cookies.set(pair.slice(0, separatorIndex), pair);
    }
  }

  return [...cookies.values()].join("; ");
}

type MetaImageRecord = {
  original_image_url?: string | null;
  resized_image_url?: string | null;
  watermarked_resized_image_url?: string | null;
};

type MetaVideoRecord = {
  video_hd_url?: string | null;
  video_preview_image_url?: string | null;
  video_sd_url?: string | null;
  watermarked_video_hd_url?: string | null;
  watermarked_video_sd_url?: string | null;
};

type MetaCardRecord = MetaImageRecord &
  MetaVideoRecord & {
    body?: string | null;
    caption?: string | null;
    cta_text?: string | null;
    cta_type?: string | null;
    link_description?: string | null;
    link_url?: string | null;
    title?: string | null;
  };

type MetaSnapshot = {
  body?: {
    text?: string | null;
  } | null;
  caption?: string | null;
  cards?: MetaCardRecord[] | null;
  country_iso_code?: string | null;
  cta_text?: string | null;
  cta_type?: string | null;
  display_format?: string | null;
  extra_images?: MetaImageRecord[] | null;
  extra_videos?: MetaVideoRecord[] | null;
  images?: MetaImageRecord[] | null;
  link_description?: string | null;
  link_url?: string | null;
  page_categories?: string[] | null;
  page_id?: string | null;
  page_name?: string | null;
  page_profile_picture_url?: string | null;
  page_profile_uri?: string | null;
  title?: string | null;
  videos?: MetaVideoRecord[] | null;
};

type MetaCollatedResult = {
  ad_archive_id?: string | null;
  categories?: string[] | null;
  collation_id?: string | null;
  collation_count?: number | null;
  contains_digital_created_media?: boolean | null;
  currency?: string | null;
  end_date?: number | null;
  is_active?: boolean | null;
  page_id?: string | null;
  publisher_platform?: string[] | string | null;
  reach_estimate?: unknown;
  snapshot?: MetaSnapshot | null;
  spend?: unknown;
  start_date?: number | null;
  targeted_or_reached_countries?: string[] | null;
};

type MetaSearchConnection = {
  edges?: Array<{
    node?: {
      collated_results?: MetaCollatedResult[] | null;
    } | null;
  }> | null;
  page_info?: {
    end_cursor?: string | null;
    has_next_page?: boolean | null;
  } | null;
};

type MetaSearchResponse = {
  data?: {
    ad_library_main?: {
      search_results_connection?: MetaSearchConnection | null;
    } | null;
  } | null;
  errors?: Array<{
    message?: string;
  }>;
};

type MetaAdDetailsVariables = {
  adArchiveID: string;
  country: string;
  isAdNonPolitical: boolean;
  isAdNotAAAEligible: boolean;
  pageID: string;
  sessionID: string;
  source: null;
};

type MetaAdDetailsResponse = {
  data?: {
    ad_library_main?: {
      ad_details?: Record<string, unknown> | null;
    } | null;
  } | null;
  errors?: Array<{
    message?: string;
  }>;
};

type MetaCollationCard = MetaCollatedResult & {
  adArchiveID?: string | number | null;
  collationID?: string | null;
  pageID?: string | number | null;
};

type MetaCollationResponse = {
  payload?: {
    adCards?: MetaCollationCard[] | null;
    forwardCursor?: string | null;
  } | null;
  error?: unknown;
};

type MetaSearchVariables = {
  activeStatus: "all";
  adType: "ALL";
  bylines: [];
  collationToken: null;
  contentLanguages: [];
  countries: string[];
  cursor: string | null;
  first: number;
  isTargetedCountry: false;
  mediaType: "all";
  pageIDs: [];
  publisherPlatforms: [];
  queryString: string;
  searchType: "keyword_unordered" | "page";
  sessionID: string;
  sortData: null;
  source: null;
  startDate: null;
  v: "e8d3d3";
  viewAllPageID: string | null;
};

type MetaSession = {
  aaid?: string;
  cometReq: string;
  cookie: string;
  fetchOptions?: MetaFetchOptions;
  headers: Record<string, string>;
  hasteSession?: string;
  hsi: string;
  jazoest: string;
  jssesw?: string;
  lsd: string;
  rev: string;
  spinB: string;
  spinR: string;
  spinT: string;
  proxySessionId?: string;
  transportLabel?: string;
};

type MetaTextFetchInit = {
  body?: string | URLSearchParams;
  headers: Record<string, string>;
  method?: "GET" | "POST";
};

type MetaFetchOptions = Pick<
  CreateMetaAdapterOptions,
  "metaProxyUrl" | "metaProxyUrls" | "metaTransportOrder" | "webScrapingApiCountry" | "webScrapingApiKey" | "webScrapingApiProxy"
>;

function getMetaFetchOptions(options?: FetchMetaAdLibraryDetailsOptions): MetaFetchOptions | undefined {
  return options;
}

function slugifyMetaFixtureId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeMetaPageId(value: string) {
  const digitsOnly = value.trim().replace(/\D+/g, "");
  return /^\d{5,}$/.test(digitsOnly) ? digitsOnly : null;
}

function normalizeMetaCountry(value?: string | null) {
  const normalized = value?.trim().toUpperCase();
  return normalized && /^[A-Z]{2,3}$/.test(normalized) ? normalized : metaAdLibraryCountry;
}

function cleanText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || undefined;
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
  return (value.match(/[ÂÃâðï]/g) ?? []).length;
}

function decodeWindows1252Utf8Mojibake(value: string) {
  if (!/[ÂÃâðï]/.test(value)) {
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

export function repairMetaMojibakeText(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const decoded = decodeWindows1252Utf8Mojibake(value) ?? value;
  const repaired = decoded
    .replace(/âœ…/g, "✅")
    .replace(/â„¹ï¸/g, "ℹ️")
    .replace(/â€”/g, "—")
    .replace(/â€“/g, "–")
    .replace(/â€˜/g, "'")
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€�/g, '"')
    .replace(/â€¦/g, "…")
    .replace(/Â /g, " ")
    .replace(/Â/g, "");

  return repaired.trim() || undefined;
}

function humanizeIdentifier(value: string) {
  return value
    .split(/[-_.]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeMetaProfileUri(value?: string | null) {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);

    if (!url.hostname.endsWith("facebook.com") && !url.hostname.endsWith("instagram.com")) {
      return undefined;
    }

    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return undefined;
  }
}

function buildMetaAdsLibraryUrl(sourceAdvertiserId: string, country = metaAdLibraryCountry) {
  const params = new URLSearchParams({
    active_status: "all",
    ad_type: "all",
    country,
    is_targeted_country: "false",
    media_type: "all",
    search_type: "page",
    view_all_page_id: sourceAdvertiserId,
  });

  return `${metaBaseUrl}/ads/library/?${params.toString()}`;
}

function buildMetaAdLibraryDetailUrl(sourceAdId: string, country = metaAdLibraryCountry) {
  const params = new URLSearchParams({
    active_status: "all",
    ad_type: "all",
    country,
    is_targeted_country: "false",
    media_type: "all",
    id: sourceAdId,
  });

  return `${metaBaseUrl}/ads/library/?${params.toString()}`;
}

function buildMetaAdLibraryCollationUrl(collationId: string, country = "ALL", forwardCursor?: string | null) {
  let query = `collation_group_id=${encodeURIComponent(collationId)}&active_status=all&countries[0]=${encodeURIComponent(country)}`;

  if (forwardCursor) {
    query += `&forward_cursor=${encodeURIComponent(forwardCursor)}`;
  }

  return `${metaBaseUrl}/ads/library/async/collation/?${query}`;
}

function buildMetaKeywordSearchUrl(query: string, country = metaAdLibraryCountry) {
  const params = new URLSearchParams({
    active_status: "all",
    ad_type: "all",
    country,
    is_targeted_country: "false",
    media_type: "all",
    q: query,
    search_type: "keyword_unordered",
  });

  return `${metaBaseUrl}/ads/library/?${params.toString()}`;
}

function parseMetaSearchInput(query: string) {
  const trimmed = query.trim();

  if (!trimmed) {
    return {};
  }

  const directPageId = normalizeMetaPageId(trimmed);

  if (directPageId) {
    return {
      pageId: directPageId,
      keyword: directPageId,
    };
  }

  try {
    const url = new URL(trimmed);
    const pageId = normalizeMetaPageId(url.searchParams.get("view_all_page_id") ?? url.searchParams.get("id") ?? "");

    if (pageId) {
      return {
        pageId,
        keyword: pageId,
      };
    }

    const profileUri = normalizeMetaProfileUri(url.toString());
    const pathSegment = url.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .filter(Boolean)
      .at(-1);

    return {
      profileUri,
      keyword: cleanText(pathSegment?.replace(/^@/, "").replace(/[_-]+/g, " ")) ?? trimmed,
    };
  } catch {
    return {
      keyword: trimmed.replace(/^@/, ""),
    };
  }
}

function isTemplateValue(value?: string | null) {
  return Boolean(value && /{{[^}]+}}/.test(value));
}

function cleanMetaCopy(value?: string | null) {
  const normalized = cleanText(repairMetaMojibakeText(value));
  return normalized && !isTemplateValue(normalized) ? normalized : undefined;
}

function pickFirstDefined(...values: Array<string | undefined>) {
  return values.find((value) => Boolean(value));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function clonePlainRecord(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function getNestedRecord(value: unknown, path: string[]) {
  let current: unknown = value;

  for (const segment of path) {
    if (!isPlainRecord(current)) {
      return null;
    }

    current = current[segment];
  }

  return isPlainRecord(current) ? current : null;
}

function getNestedValue(value: unknown, path: string[]) {
  let current: unknown = value;

  for (const segment of path) {
    if (!isPlainRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function parseMetaReachValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function addMetaCountryValue(countries: Set<string>, value: unknown) {
  if (typeof value !== "string") {
    return;
  }

  const normalized = value.trim().toUpperCase();

  if (/^[A-Z]{2,3}$/.test(normalized)) {
    countries.add(normalized);
  }
}

function collectMetaDetailCountries(value: unknown, countries = new Set<string>()) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectMetaDetailCountries(item, countries));
    return countries;
  }

  if (!isPlainRecord(value)) {
    addMetaCountryValue(countries, value);
    return countries;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (/country/i.test(key)) {
      if (Array.isArray(nestedValue)) {
        nestedValue.forEach((item) => collectMetaDetailCountries(item, countries));
      } else {
        addMetaCountryValue(countries, nestedValue);
      }
      continue;
    }

    if (isPlainRecord(nestedValue) || Array.isArray(nestedValue)) {
      collectMetaDetailCountries(nestedValue, countries);
    }
  }

  return countries;
}

function parseMetaTimestamp(value?: number | null, fallbackToNow = false) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1_000);
  }

  return fallbackToNow ? new Date() : null;
}

function hasMetaCardVideo(card: MetaCardRecord) {
  return Boolean(card.video_hd_url || card.video_sd_url || card.watermarked_video_hd_url || card.watermarked_video_sd_url);
}

function hasMetaCardImage(card: MetaCardRecord) {
  return Boolean(card.original_image_url || card.resized_image_url || card.watermarked_resized_image_url);
}

function mapMetaFormat(displayFormat?: string | null, snapshot?: MetaSnapshot) {
  const normalizedFormat = cleanText(displayFormat)?.toUpperCase();
  const cards = snapshot?.cards ?? [];
  const hasCards = cards.length > 0;
  const hasTopLevelVideo = Boolean(snapshot?.videos?.length || snapshot?.extra_videos?.length);
  const hasVideoOnlyCards = hasCards && cards.every((card) => hasMetaCardVideo(card) && !hasMetaCardImage(card));

  if (normalizedFormat === "VIDEO" || (hasTopLevelVideo && !hasCards) || hasVideoOnlyCards) {
    return "video";
  }

  if (hasCards || normalizedFormat === "CAROUSEL") {
    return "carousel";
  }

  if (normalizedFormat === "IMAGE") {
    return "single-image";
  }

  return normalizedFormat?.toLowerCase() ?? "single-image";
}

function humanizeMetaEnum(value?: string | null) {
  return cleanText(value)
    ?.toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function overlapsWindow(firstSeenAt: Date, lastSeenAt: Date, options?: FetchAdvertiserAdsOptions) {
  if (options?.since && lastSeenAt < options.since) {
    return false;
  }

  if (options?.until && firstSeenAt > options.until) {
    return false;
  }

  return true;
}

function clampMetaResultLimit(maxResults?: number, cap = 100) {
  if (!maxResults || !Number.isFinite(maxResults)) {
    return metaDefaultAdsLimit;
  }

  return Math.min(cap, Math.max(1, Math.trunc(maxResults)));
}

function buildFixtureProfile(query: string): AdvertiserMatch {
  const sourceAdvertiserId = slugifyMetaFixtureId(query) || "fixture-meta";

  return {
    id: buildSourceScopedId("facebook", sourceAdvertiserId),
    source: "facebook",
    sourceAdvertiserId,
    canonicalName: humanizeIdentifier(sourceAdvertiserId),
    profileUrl: buildMetaAdsLibraryUrl(sourceAdvertiserId),
    summary: "Deterministic Meta advertiser fixture.",
  };
}

function buildFixtureAds(sourceAdvertiserId: string) {
  const now = new Date();
  const fetchCount = (fixtureFetchCounts.get(sourceAdvertiserId) ?? 0) + 1;

  fixtureFetchCounts.set(sourceAdvertiserId, fetchCount);

  const primaryAd: NormalizedAd = {
    source: "facebook",
    sourceAdId: `${sourceAdvertiserId}-fixture-ad-1`,
    fingerprint: `${sourceAdvertiserId}-fixture-ad-1`,
    title: "Fixture Meta prospecting ad",
    body: "Deterministic Meta ad fixture used for multi-source coverage.",
    payer: humanizeIdentifier(sourceAdvertiserId),
    format: "single-image",
    callToAction: "Learn more",
    destinationUrl: `https://example.com/${sourceAdvertiserId}/meta-prospecting`,
    mediaUrl: "https://images.example.com/meta-fixture-1.png",
    status: "active",
    reactionCount: 52,
    commentCount: 7,
    firstSeenAt: now,
    lastSeenAt: now,
    metadata: {
      status: "fixture",
      sourceAdvertiserId,
      network: "meta",
    },
  };

  if (fetchCount === 1) {
    return [primaryAd];
  }

  return [
    primaryAd,
    {
      source: "facebook" as const,
      sourceAdId: `${sourceAdvertiserId}-fixture-ad-2`,
      fingerprint: `${sourceAdvertiserId}-fixture-ad-2`,
      title: "Fixture Meta retargeting ad",
      body: "Second deterministic Meta creative returned on a later fetch.",
      payer: humanizeIdentifier(sourceAdvertiserId),
      format: "carousel",
      callToAction: "Shop now",
      destinationUrl: `https://example.com/${sourceAdvertiserId}/meta-retargeting`,
      mediaUrl: "https://images.example.com/meta-fixture-2.png",
      status: "active",
      reactionCount: 88,
      commentCount: 11,
      firstSeenAt: now,
      lastSeenAt: now,
      metadata: {
        status: "fixture",
        sourceAdvertiserId,
        network: "meta",
      },
    } satisfies NormalizedAd,
  ];
}

function extractMetaGraphqlToken(html: string, pattern: RegExp, label: string) {
  const value = html.match(pattern)?.[1];

  if (!value) {
    throw new Error(`Meta Ads Library page is missing ${label}.`);
  }

  return value;
}

function tryBuildMetaSessionFromHtml(html: string, headers: Record<string, string>, cookie = ""): MetaSession | null {
  try {
    return {
      cometReq: extractMetaGraphqlToken(html, /__comet_req=(\d+)&jazoest=/, "__comet_req"),
      aaid: html.match(/"__aaid":"([^"]+)"/)?.[1],
      cookie,
      hasteSession: html.match(/"haste_session":"([^"]+)"/)?.[1],
      headers,
      hsi: extractMetaGraphqlToken(html, /"hsi":"([^"]+)"/, "hsi"),
      jazoest: extractMetaGraphqlToken(html, /__comet_req=\d+&jazoest=(\d+)/, "jazoest"),
      jssesw: html.includes('"__jssesw"') ? "1" : undefined,
      lsd: extractMetaGraphqlToken(html, /\["LSD",\[\],\{"token":"([^"]+)"/, "lsd"),
      rev: extractMetaGraphqlToken(html, /"server_revision":(\d+)/, "server_revision"),
      spinB: extractMetaGraphqlToken(html, /"__spin_b":"([^"]+)"/, "__spin_b"),
      spinR: extractMetaGraphqlToken(html, /"__spin_r":(\d+)/, "__spin_r"),
      spinT: extractMetaGraphqlToken(html, /"__spin_t":(\d+)/, "__spin_t"),
    };
  } catch {
    return null;
  }
}

function extractMetaChallengePath(html: string) {
  return html.match(/fetch\(\s*["']([^"']*__rd_verify_[^"']*)["']/i)?.[1] ?? null;
}

function describeMetaSessionBootstrapFailure(response: WebScrapingApiTextResponse, html: string) {
  const title = cleanText(html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]);
  const markers = [
    html.includes("__rd_verify_") ? "rd_challenge" : null,
    html.includes("__comet_req") ? "comet_req" : null,
    html.includes("LSD") ? "lsd" : null,
  ].filter(Boolean);

  return [
    `status ${response.status}`,
    title ? `title "${title}"` : null,
    markers.length ? `markers ${markers.join(", ")}` : "no session markers",
  ].filter(Boolean).join("; ");
}

function buildMetaSessionAttemptOptions(options?: MetaFetchOptions) {
  const attempts: Array<{ label: string; options?: MetaFetchOptions }> = [];
  const webScrapingApiAttempts: Array<{ label: string; options?: MetaFetchOptions }> = [];
  const proxyAttemptsList: Array<{ label: string; options?: MetaFetchOptions }> = [];
  const metaProxyUrls = (options?.metaProxyUrls ?? []).map((proxyUrl) => proxyUrl.trim()).filter(Boolean);
  const proxyAttempts = shuffledMetaProxyAttempts(metaProxyUrls);

  if (options?.metaProxyUrl) {
    proxyAttemptsList.push({
      label: "meta-proxy",
      options: {
        ...options,
        metaProxyUrls: undefined,
      },
    });
  }

  proxyAttempts.forEach((metaProxyUrl, index) => {
    proxyAttemptsList.push({
      label: `meta-proxy-${index + 1}`,
      options: {
        ...options,
        metaProxyUrl,
        metaProxyUrls: undefined,
      },
    });
  });

  if (options?.webScrapingApiProxy) {
    webScrapingApiAttempts.push({
      label: "webscrapingapi-proxy",
      options: {
        ...options,
        webScrapingApiProxy: {
          ...options.webScrapingApiProxy,
          sessionId: options.webScrapingApiProxy.sessionId ?? createWebScrapingApiProxySessionId(),
        },
      },
    });
  }

  if (options?.webScrapingApiKey?.trim()) {
    webScrapingApiAttempts.push({
      label: "webscrapingapi",
      options: {
        webScrapingApiCountry: options.webScrapingApiCountry,
        webScrapingApiKey: options.webScrapingApiKey,
      },
    });
  }

  if (options?.metaTransportOrder === "webscrapingapi-first") {
    attempts.push(...webScrapingApiAttempts, ...proxyAttemptsList);
  } else {
    attempts.push(...proxyAttemptsList, ...webScrapingApiAttempts);
  }

  if (!attempts.length) {
    attempts.push({
      label: "direct",
      options: {},
    });
  }

  return attempts;
}

async function fetchMetaText(
  url: string,
  init: MetaTextFetchInit,
  options?: MetaFetchOptions,
): Promise<WebScrapingApiTextResponse> {
  if (options?.metaProxyUrl) {
    return fetchTextViaHttpProxy(url, {
      body: init.body,
      headers: init.headers,
      method: init.method ?? "GET",
      proxy: options.metaProxyUrl,
      timeoutMs: metaRequestTimeoutMs,
    });
  }

  if (options?.webScrapingApiProxy) {
    return fetchTextViaWebScrapingApiProxy(url, {
      body: init.body,
      headers: init.headers,
      method: init.method ?? "GET",
      proxy: options.webScrapingApiProxy,
      timeoutMs: metaRequestTimeoutMs,
    });
  }

  const apiKey = options?.webScrapingApiKey?.trim();

  if (apiKey) {
    return fetchTextViaWebScrapingApi(url, {
      apiKey,
      body: init.body,
      country: options?.webScrapingApiCountry,
      headers: init.headers,
      method: init.method ?? "GET",
      timeoutMs: metaRequestTimeoutMs,
    });
  }

  const response = await fetch(url, {
    body: init.body,
    headers: init.headers,
    method: init.method ?? "GET",
    signal: AbortSignal.timeout(metaRequestTimeoutMs),
  });

  return {
    headers: Object.fromEntries(response.headers.entries()),
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
}

async function openMetaSessionOnce(refererUrl: string, options?: MetaFetchOptions): Promise<MetaSession> {
  const headers = {
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "Mozilla/5.0",
  };

  const pageResponse = await fetchMetaText(refererUrl, { headers }, options);
  const pageHtml = pageResponse.text;
  const pageCookie = mergeCookieHeaders(getResponseHeader(pageResponse.headers, "set-cookie"));
  const unlockedSession = tryBuildMetaSessionFromHtml(pageHtml, headers, pageCookie);

  if (unlockedSession) {
    return unlockedSession;
  }

  const challengePath = extractMetaChallengePath(pageHtml);

  if (!challengePath) {
    throw new Error(`Meta Ads Library challenge flow was not present (${describeMetaSessionBootstrapFailure(pageResponse, pageHtml)}).`);
  }

  const challengeResponse = await fetchMetaText(new URL(challengePath, refererUrl).toString(), {
    method: "POST",
    headers: {
      ...headers,
      referer: refererUrl,
    },
  }, options);

  const cookie = mergeCookieHeaders(pageCookie, getResponseHeader(challengeResponse.headers, "set-cookie"));

  if (!cookie) {
    throw new Error("Meta Ads Library challenge did not return a session cookie.");
  }

  const unlockedResponse = await fetchMetaText(refererUrl, {
    headers: {
      ...headers,
      cookie,
    },
  }, options);

  const unlockedHtml = unlockedResponse.text;
  const unlockedCookie = mergeCookieHeaders(cookie, getResponseHeader(unlockedResponse.headers, "set-cookie"));
  const challengedSession = tryBuildMetaSessionFromHtml(unlockedHtml, headers, unlockedCookie);

  if (!challengedSession) {
    throw new Error("Meta Ads Library page did not expose GraphQL tokens after challenge.");
  }

  return challengedSession;
}

async function openMetaSession(refererUrl: string, options?: MetaFetchOptions): Promise<MetaSession> {
  let lastError: unknown = null;
  const errors: string[] = [];
  const attemptOptions = buildMetaSessionAttemptOptions(options);
  const maxAttempts = Math.max(metaSessionMaxAttempts, attemptOptions.length);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptOption = attemptOptions[(attempt - 1) % attemptOptions.length];

    try {
      const session = await openMetaSessionOnce(refererUrl, attemptOption.options);
      session.fetchOptions = attemptOption.options;
      session.proxySessionId = attemptOption.options?.webScrapingApiProxy?.sessionId;
      session.transportLabel = attemptOption.label;
      if (attemptOption.options?.metaProxyUrl && options?.metaProxyUrls?.length) {
        metaProxyCursor = attempt % options.metaProxyUrls.length;
      }
      return session;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);

      errors.push(`${attemptOption.label}: ${message}`);

      if (attempt >= maxAttempts) {
        break;
      }

      const delayMs = metaSessionRetryDelayMs[attempt - 1] ?? metaSessionRetryDelayMs.at(-1) ?? 0;
      await sleep(delayMs);
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError ?? "unknown error");
  const attempts = errors.length ? ` Attempts: ${errors.join(" | ")}` : "";

  throw new Error(`Meta Ads Library session failed after ${maxAttempts} attempts: ${message}.${attempts}`);
}

async function fetchMetaSearchConnection(
  session: MetaSession,
  refererUrl: string,
  variables: MetaSearchVariables,
  options?: MetaFetchOptions,
): Promise<MetaSearchConnection> {
  const sessionFetchOptions = session.fetchOptions ?? options;
  const fetchOptions = session.proxySessionId && sessionFetchOptions?.webScrapingApiProxy
    ? {
        ...sessionFetchOptions,
        webScrapingApiProxy: {
          ...sessionFetchOptions.webScrapingApiProxy,
          sessionId: session.proxySessionId,
        },
      }
    : sessionFetchOptions;
  const response = await fetchMetaText(metaGraphqlUrl, {
    method: "POST",
    headers: {
      ...session.headers,
      cookie: session.cookie,
      "content-type": "application/x-www-form-urlencoded",
      origin: metaBaseUrl,
      referer: refererUrl,
    },
    body: new URLSearchParams({
      av: "0",
      __user: "0",
      __a: "1",
      __req: "1",
      dpr: "1",
      __ccg: "EXCELLENT",
      __rev: session.rev,
      __hsi: session.hsi,
      __comet_req: session.cometReq,
      lsd: session.lsd,
      jazoest: session.jazoest,
      __spin_r: session.spinR,
      __spin_b: session.spinB,
      __spin_t: session.spinT,
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: metaSearchFriendlyName,
      variables: JSON.stringify(variables),
      server_timestamps: "true",
      doc_id: metaSearchDocId,
    }),
  }, fetchOptions);

  if (!response.ok) {
    throw new Error(`Meta Ads Library request failed with ${response.status}.`);
  }

  const text = response.text.replace(/^for \(;;\);/, "");
  const payload = JSON.parse(text) as MetaSearchResponse;

  if (payload.errors?.length && !payload.data?.ad_library_main?.search_results_connection) {
    throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join(" | ") || "Meta Ads Library returned an error.");
  }

  return payload.data?.ad_library_main?.search_results_connection ?? {};
}

async function fetchMetaAdDetails(
  session: MetaSession,
  refererUrl: string,
  variables: MetaAdDetailsVariables,
  options?: MetaFetchOptions,
) {
  const sessionFetchOptions = session.fetchOptions ?? options;
  const fetchOptions = session.proxySessionId && sessionFetchOptions?.webScrapingApiProxy
    ? {
        ...sessionFetchOptions,
        webScrapingApiProxy: {
          ...sessionFetchOptions.webScrapingApiProxy,
          sessionId: session.proxySessionId,
        },
      }
    : sessionFetchOptions;
  const response = await fetchMetaText(metaGraphqlUrl, {
    method: "POST",
    headers: {
      ...session.headers,
      "accept": "*/*",
      cookie: session.cookie,
      "content-type": "application/x-www-form-urlencoded",
      origin: metaBaseUrl,
      referer: refererUrl,
      "x-fb-friendly-name": metaAdDetailsFriendlyName,
      "x-fb-lsd": session.lsd,
      "x-asbd-id": "359341",
    },
    body: new URLSearchParams({
      av: "0",
      __user: "0",
      __a: "1",
      ...(session.hasteSession ? { __hs: session.hasteSession } : {}),
      __req: "2",
      dpr: "1",
      __ccg: "EXCELLENT",
      __rev: session.rev,
      __s: createMetaCometSessionToken(),
      __hsi: session.hsi,
      __dyn: metaCometDyn,
      __comet_req: session.cometReq,
      fb_dtsg: "",
      lsd: session.lsd,
      jazoest: session.jazoest,
      ...(session.aaid ? { __aaid: session.aaid } : {}),
      __spin_r: session.spinR,
      __spin_b: session.spinB,
      __spin_t: session.spinT,
      ...(session.jssesw ? { __jssesw: session.jssesw } : {}),
      fb_api_caller_class: "RelayModern",
      fb_api_req_friendly_name: metaAdDetailsFriendlyName,
      variables: JSON.stringify(variables),
      server_timestamps: "true",
      doc_id: metaAdDetailsDocId,
    }),
  }, fetchOptions);

  if (!response.ok) {
    throw new Error(`Meta Ad Library details request failed with ${response.status}.`);
  }

  const text = response.text.replace(/^for \(;;\);/, "");
  const payload = JSON.parse(text) as MetaAdDetailsResponse;

  if (payload.errors?.length && !payload.data?.ad_library_main?.ad_details) {
    throw new Error(payload.errors.map((error) => error.message).filter(Boolean).join(" | ") || "Meta Ad Library details returned an error.");
  }

  return payload.data?.ad_library_main?.ad_details ?? null;
}

async function fetchMetaAdDetailsWithFallbacks(
  session: MetaSession,
  refererUrl: string,
  input: Omit<MetaAdDetailsVariables, "isAdNonPolitical" | "isAdNotAAAEligible" | "sessionID">,
  options?: MetaFetchOptions,
) {
  const variants = [
    { isAdNonPolitical: true, isAdNotAAAEligible: true },
    { isAdNonPolitical: true, isAdNotAAAEligible: false },
    { isAdNonPolitical: false, isAdNotAAAEligible: true },
    { isAdNonPolitical: false, isAdNotAAAEligible: false },
  ];
  let lastDetails: Record<string, unknown> | null = null;

  for (const variant of variants) {
    const details = await fetchMetaAdDetails(
      session,
      refererUrl,
      {
        ...input,
        ...variant,
        sessionID: randomUUID(),
      },
      options,
    );

    if (details) {
      return details;
    }

    lastDetails = details;
  }

  return lastDetails;
}

async function fetchMetaCollationCards(
  session: MetaSession,
  refererUrl: string,
  collationId: string,
  country: string,
  expectedCount: number | null,
  options?: MetaFetchOptions,
) {
  const sessionFetchOptions = session.fetchOptions ?? options;
  const fetchOptions = session.proxySessionId && sessionFetchOptions?.webScrapingApiProxy
    ? {
        ...sessionFetchOptions,
        webScrapingApiProxy: {
          ...sessionFetchOptions.webScrapingApiProxy,
          sessionId: session.proxySessionId,
        },
      }
    : sessionFetchOptions;
  const cards: MetaCollationCard[] = [];
  let forwardCursor: string | null | undefined;

  for (let page = 0; page < 20; page += 1) {
    const response = await fetchMetaText(buildMetaAdLibraryCollationUrl(collationId, country, forwardCursor), {
      method: "POST",
      headers: {
        ...session.headers,
        "accept": "*/*",
        cookie: session.cookie,
        "content-type": "application/x-www-form-urlencoded",
        origin: metaBaseUrl,
        referer: refererUrl,
        "x-fb-lsd": session.lsd,
      },
      body: new URLSearchParams({
        av: "0",
        __user: "0",
        __a: "1",
        __req: "3",
        dpr: "1",
        __ccg: "EXCELLENT",
        __rev: session.rev,
        __hsi: session.hsi,
        __comet_req: session.cometReq,
        lsd: session.lsd,
        jazoest: session.jazoest,
        __spin_r: session.spinR,
        __spin_b: session.spinB,
        __spin_t: session.spinT,
        fb_api_caller_class: "RelayModern",
        fb_api_req_friendly_name: metaAdDetailsFriendlyName,
        server_timestamps: "true",
        doc_id: metaAdDetailsDocId,
      }),
    }, fetchOptions);

    if (!response.ok) {
      throw new Error(`Meta Ad Library collation request failed with ${response.status}.`);
    }

    const text = response.text.replace(/^for \(;;\);/, "");
    const payload = JSON.parse(text) as MetaCollationResponse;

    if (payload.error) {
      throw new Error("Meta Ad Library collation request returned an error.");
    }

    const pageCards = payload.payload?.adCards ?? [];
    cards.push(...pageCards);
    forwardCursor = payload.payload?.forwardCursor ?? null;

    if (!forwardCursor || (expectedCount && cards.length >= expectedCount)) {
      break;
    }
  }

  return cards;
}

function parseMetaCollationCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value));
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(1, parsed) : null;
  }

  return null;
}

function getMetaDetailsAaaInfo(details: Record<string, unknown> | null | undefined) {
  return getNestedRecord(details, ["aaa_info"]);
}

function getMetaDetailsEuReach(details: Record<string, unknown> | null | undefined) {
  return (
    parseMetaReachValue(getNestedValue(details, ["aaa_info", "eu_total_reach"])) ??
    parseMetaReachValue(getNestedValue(details, ["aaa_info", "total_reach"]))
  );
}

function getMetaCollationCardAdId(card: MetaCollationCard) {
  const value = card.adArchiveID ?? card.ad_archive_id;
  return normalizeMetaPageId(String(value ?? ""));
}

function getMetaCollationCardPageId(card: MetaCollationCard, fallbackPageId: string) {
  const value = card.pageID ?? card.page_id;
  return normalizeMetaPageId(String(value ?? "")) ?? fallbackPageId;
}

function mergeMetaCollationDetails(details: Array<Record<string, unknown> | null>, fallbackDetails: Record<string, unknown> | null) {
  const detailsWithReach = details
    .map((detail) => ({
      detail,
      reach: getMetaDetailsEuReach(detail),
    }))
    .filter((entry): entry is { detail: Record<string, unknown>; reach: number } => Boolean(entry.detail && entry.reach !== null));

  if (!detailsWithReach.length) {
    return fallbackDetails;
  }

  const baseDetails = clonePlainRecord(fallbackDetails ?? detailsWithReach[0].detail);
  const baseAaaInfo = clonePlainRecord(getMetaDetailsAaaInfo(fallbackDetails) ?? getMetaDetailsAaaInfo(detailsWithReach[0].detail) ?? {});
  const countries = new Set<string>();

  detailsWithReach.forEach(({ detail }) => {
    collectMetaDetailCountries(getMetaDetailsAaaInfo(detail), countries);
  });

  const countryList = [...countries].sort();

  baseAaaInfo.eu_total_reach = detailsWithReach.reduce((total, { reach }) => total + reach, 0);
  baseAaaInfo.collated_ad_count = detailsWithReach.length;

  if (countryList.length) {
    baseAaaInfo.targeted_or_reached_countries = countryList;
    baseDetails.targeted_or_reached_countries = countryList;
  }

  baseDetails.aaa_info = baseAaaInfo;

  return baseDetails;
}

function collectRenderedJsonScriptBodies(html: string) {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]?.trim())
    .filter((body): body is string => Boolean(body));
}

function findRenderedMetaAdRecord(value: unknown, sourceAdId: string, sourceAdvertiserId?: string | null): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findRenderedMetaAdRecord(item, sourceAdId, sourceAdvertiserId);

      if (match) {
        return match;
      }
    }

    return null;
  }

  const record = value as Record<string, unknown>;
  const adArchiveId = cleanText(typeof record.ad_archive_id === "string" ? record.ad_archive_id : null);
  const pageId = normalizeMetaPageId(String(record.page_id ?? getNestedValue(record, ["snapshot", "page_id"]) ?? ""));
  const hasMatchingPage = !sourceAdvertiserId || pageId === sourceAdvertiserId;

  if (adArchiveId === sourceAdId && hasMatchingPage && getNestedValue(record, ["snapshot"])) {
    return record;
  }

  for (const item of Object.values(record)) {
    const match = findRenderedMetaAdRecord(item, sourceAdId, sourceAdvertiserId);

    if (match) {
      return match;
    }
  }

  return null;
}

export function extractMetaAdLibraryDetailsFromRenderedHtml(
  html: string,
  sourceAdId: string,
  sourceAdvertiserId?: string | null,
): Record<string, unknown> | null {
  const normalizedAdId = normalizeMetaPageId(sourceAdId);
  const normalizedAdvertiserId = sourceAdvertiserId ? normalizeMetaPageId(sourceAdvertiserId) : null;

  if (!normalizedAdId) {
    return null;
  }

  for (const body of collectRenderedJsonScriptBodies(html)) {
    try {
      const match = findRenderedMetaAdRecord(JSON.parse(body), normalizedAdId, normalizedAdvertiserId);

      if (match) {
        return match;
      }
    } catch {
      // Meta emits many small JSON script payloads; ignore unrelated malformed fragments.
    }
  }

  return null;
}

export async function fetchRenderedMetaAdLibraryDetails(
  sourceAdvertiserId: string,
  sourceAdId: string,
  options?: FetchMetaAdLibraryDetailsOptions,
): Promise<Record<string, unknown> | null> {
  const apiKey = options?.webScrapingApiKey?.trim();
  const normalizedPageId = normalizeMetaPageId(sourceAdvertiserId);
  const normalizedAdId = normalizeMetaPageId(sourceAdId);

  if (!apiKey || !normalizedPageId || !normalizedAdId) {
    return null;
  }

  const country = normalizeMetaCountry(options?.country ?? "ALL");
  const webScrapingApiCountry =
    options?.webScrapingApiCountry ?? (country !== "ALL" ? country.toLowerCase() : undefined);
  const response = await fetchTextViaWebScrapingApi(buildMetaAdLibraryDetailUrl(normalizedAdId, country), {
    apiKey,
    country: webScrapingApiCountry,
    headers: {
      "accept-language": "en-US,en;q=0.9",
      "user-agent": "Mozilla/5.0",
    },
    renderJs: true,
    timeoutMs: metaRenderedRequestTimeoutMs,
  });

  if (!response.ok) {
    throw new Error(`Rendered Meta Ad Library request failed with ${response.status}.`);
  }

  return extractMetaAdLibraryDetailsFromRenderedHtml(response.text, normalizedAdId, normalizedPageId);
}

export async function fetchMetaAdLibraryDetails(
  sourceAdvertiserId: string,
  sourceAdId: string,
  options?: FetchMetaAdLibraryDetailsOptions,
): Promise<Record<string, unknown> | null> {
  const metaProxyUrls = (options?.metaProxyUrls ?? []).map((proxyUrl) => proxyUrl.trim()).filter(Boolean);
  const shouldUseProxyListFirst = !(options?.metaTransportOrder === "webscrapingapi-first" && hasWebScrapingApiTransport(options));

  if (metaProxyUrls.length && !options?.metaProxyUrl && shouldUseProxyListFirst) {
    const proxyStartIndex = metaProxyCursor % metaProxyUrls.length;
    const rotatedProxyUrls = [...metaProxyUrls.slice(proxyStartIndex), ...metaProxyUrls.slice(0, proxyStartIndex)];
    const proxyAttempts = rotatedProxyUrls.slice(0, Math.min(getMetaProxyAttemptsPerRequest(), rotatedProxyUrls.length));
    let lastError: unknown = null;

    for (const [index, metaProxyUrl] of proxyAttempts.entries()) {
      try {
        const details: Record<string, unknown> | null = await fetchMetaAdLibraryDetails(sourceAdvertiserId, sourceAdId, {
          ...options,
          metaProxyUrl,
          metaProxyUrls: undefined,
        });

        metaProxyCursor = (proxyStartIndex + index + 1) % metaProxyUrls.length;
        return details;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);

        if (!/rate limit|429|temporarily blocked|try again/i.test(message)) {
          throw error;
        }

        metaProxyCursor = (proxyStartIndex + index + 1) % metaProxyUrls.length;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Meta ad details proxy list failed."));
  }

  const normalizedPageId = normalizeMetaPageId(sourceAdvertiserId);
  const normalizedAdId = normalizeMetaPageId(sourceAdId);

  if (!normalizedPageId || !normalizedAdId) {
    return null;
  }

  const fetchOptions = getMetaFetchOptions(options);
  const country = normalizeMetaCountry(options?.country ?? metaAdLibraryTransparencyCountry);
  const refererUrl = buildMetaAdLibraryDetailUrl(normalizedAdId, country);
  const session = await openMetaSession(refererUrl, fetchOptions);
  const directDetails = await fetchMetaAdDetailsWithFallbacks(
    session,
    refererUrl,
    {
      adArchiveID: normalizedAdId,
      country,
      pageID: normalizedPageId,
      source: null,
    },
    fetchOptions,
  );
  const collationId = cleanText(options?.collationId);
  const collationCount = parseMetaCollationCount(options?.collationCount);

  if (!collationId || !collationCount || collationCount <= 1) {
    return directDetails;
  }

  const uniqueAdIds = new Map<string, string>();

  uniqueAdIds.set(normalizedAdId, normalizedPageId);

  for (const optionAdId of options?.collationAdIds ?? []) {
    const adId = normalizeMetaPageId(optionAdId);

    if (!adId) {
      continue;
    }

    uniqueAdIds.set(adId, normalizedPageId);
  }

  if (uniqueAdIds.size < collationCount) {
    try {
      const cards = await fetchMetaCollationCards(session, refererUrl, collationId, country, collationCount, fetchOptions);

      for (const card of cards) {
        const adId = getMetaCollationCardAdId(card);

        if (!adId) {
          continue;
        }

        uniqueAdIds.set(adId, getMetaCollationCardPageId(card, normalizedPageId));
      }
    } catch (error) {
      if (uniqueAdIds.size <= 1) {
        return directDetails;
      }
    }
  }

  const details = [];

  for (const [adId, pageId] of uniqueAdIds) {
    if (adId === normalizedAdId) {
      details.push(directDetails);
      continue;
    }

    details.push(await fetchMetaAdDetailsWithFallbacks(
      session,
      refererUrl,
      {
        adArchiveID: adId,
        country,
        pageID: pageId,
        source: null,
      },
      fetchOptions,
    ));
  }

  return mergeMetaCollationDetails(details, directDetails);
}

function buildMetaSearchVariables(options: {
  country?: string;
  cursor?: string | null;
  first: number;
  pageId?: string | null;
  queryString?: string;
  searchType: "keyword_unordered" | "page";
  sessionId: string;
}): MetaSearchVariables {
  return {
    activeStatus: "all",
    adType: "ALL",
    bylines: [],
    collationToken: null,
    contentLanguages: [],
    countries: [normalizeMetaCountry(options.country)],
    cursor: options.cursor ?? null,
    first: options.first,
    isTargetedCountry: false,
    mediaType: "all",
    pageIDs: [],
    publisherPlatforms: [],
    queryString: options.queryString ?? "",
    searchType: options.searchType,
    sessionID: options.sessionId,
    sortData: null,
    source: null,
    startDate: null,
    v: "e8d3d3",
    viewAllPageID: options.pageId ?? null,
  };
}

function buildAdvertiserMatchFromSnapshot(snapshot?: MetaSnapshot | null): AdvertiserMatch | null {
  const sourceAdvertiserId = normalizeMetaPageId(snapshot?.page_id ?? "");
  const canonicalName = cleanText(snapshot?.page_name);

  if (!sourceAdvertiserId || !canonicalName) {
    return null;
  }

  const categories = (snapshot?.page_categories ?? []).map((category) => cleanText(category)).filter((category): category is string => Boolean(category));

  return {
    id: buildSourceScopedId("facebook", sourceAdvertiserId),
    source: "facebook",
    sourceAdvertiserId,
    canonicalName,
    profileUrl: buildMetaAdsLibraryUrl(sourceAdvertiserId),
    logoUrl: cleanText(snapshot?.page_profile_picture_url),
    industry: categories.length ? categories.join(", ") : undefined,
    summary: categories.length ? `Categories: ${categories.slice(0, 3).join(", ")}` : "Public Meta advertiser profile.",
  };
}

function pickMetaImage(snapshot?: MetaSnapshot | null) {
  const cards = snapshot?.cards ?? [];
  const images = [...cards, ...(snapshot?.images ?? []), ...(snapshot?.extra_images ?? [])];

  for (const image of images) {
    const candidate = cleanText(image.original_image_url) ?? cleanText(image.resized_image_url) ?? cleanText(image.watermarked_resized_image_url);

    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function pickMetaVideo(snapshot?: MetaSnapshot | null) {
  const cards = snapshot?.cards ?? [];
  const videos = [...cards, ...(snapshot?.videos ?? []), ...(snapshot?.extra_videos ?? [])];

  for (const video of videos) {
    const sourceVideoUrl =
      cleanText(video.video_hd_url) ??
      cleanText(video.video_sd_url) ??
      cleanText(video.watermarked_video_hd_url) ??
      cleanText(video.watermarked_video_sd_url);

    if (sourceVideoUrl) {
      return {
        previewImageUrl: cleanText(video.video_preview_image_url),
        sourceVideoUrl,
      };
    }
  }

  return null;
}

function pickPrimaryMetaCard(snapshot?: MetaSnapshot | null) {
  return (
    snapshot?.cards?.find((card) =>
      Boolean(
        cleanMetaCopy(card.title) ||
          cleanMetaCopy(card.body) ||
          cleanMetaCopy(card.link_description) ||
          cleanText(card.link_url) ||
          cleanText(card.original_image_url) ||
          cleanText(card.video_hd_url),
      ),
    ) ?? null
  );
}

function getMetaCreativeAssetSlotKey(label: string) {
  if (label === "Original") {
    return "card:0";
  }

  const variantMatch = label.match(/^Variant (\d+)$/);

  return variantMatch ? `card:${variantMatch[1]}` : null;
}

function collectMetaCreativeAssets(snapshot?: MetaSnapshot | null) {
  if (!snapshot) {
    return [];
  }

  const cards = snapshot.cards ?? [];
  const videos = snapshot.videos ?? [];
  const extraVideos = snapshot.extra_videos ?? [];
  const images = snapshot.images ?? [];
  const extraImages = snapshot.extra_images ?? [];
  const candidates: Array<{ dedupeKey: string | null; label: string; value: Partial<MetaCardRecord> }> = [
    ...cards.map((value, index) => {
      const label = index === 0 ? "Original" : `Variant ${index}`;

      return { dedupeKey: getMetaCreativeAssetSlotKey(label), label, value };
    }),
    ...videos.map((value, index) => ({ dedupeKey: null, label: `Video ${index + 1}`, value })),
    ...extraVideos.map((value, index) => ({ dedupeKey: null, label: `Extra video ${index + 1}`, value })),
    ...images.map((value, index) => ({ dedupeKey: null, label: `Image ${index + 1}`, value })),
    ...extraImages.map((value, index) => ({ dedupeKey: null, label: `Extra image ${index + 1}`, value })),
  ];
  const assets: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const sourceVideoUrl =
      cleanText(candidate.value.video_hd_url) ??
      cleanText(candidate.value.video_sd_url) ??
      cleanText(candidate.value.watermarked_video_hd_url) ??
      cleanText(candidate.value.watermarked_video_sd_url);
    const sourceMediaUrl =
      cleanText(candidate.value.original_image_url) ??
      cleanText(candidate.value.resized_image_url) ??
      cleanText(candidate.value.watermarked_resized_image_url);
    const sourceThumbnailUrl = cleanText(candidate.value.video_preview_image_url) ?? sourceMediaUrl;
    const identity = sourceVideoUrl ?? sourceMediaUrl ?? sourceThumbnailUrl;
    const dedupeKey = candidate.dedupeKey ?? identity;

    if (!identity || !dedupeKey || seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    assets.push({
      label: candidate.label,
      title:
        cleanMetaCopy(candidate.value.title) ??
        cleanMetaCopy(candidate.value.link_description) ??
        cleanMetaCopy(snapshot.title) ??
        cleanMetaCopy(snapshot.link_description),
      body:
        cleanMetaCopy(candidate.value.body) ??
        cleanMetaCopy(candidate.value.caption) ??
        cleanMetaCopy(snapshot.body?.text) ??
        cleanMetaCopy(snapshot.caption),
      callToAction:
        cleanText(candidate.value.cta_text) ??
        cleanText(snapshot.cta_text) ??
        humanizeMetaEnum(candidate.value.cta_type) ??
        humanizeMetaEnum(snapshot.cta_type),
      destinationUrl: cleanText(candidate.value.link_url) ?? cleanText(snapshot.link_url),
      sourceMediaUrl,
      sourceThumbnailUrl,
      sourceVideoUrl,
    });
  }

  return assets;
}

function buildNormalizedMetaAd(result: MetaCollatedResult): NormalizedAd | null {
  const snapshot = result.snapshot;
  const sourceAdvertiserId = normalizeMetaPageId(result.page_id ?? snapshot?.page_id ?? "");
  const sourceAdId = cleanText(result.ad_archive_id);

  if (!sourceAdvertiserId || !sourceAdId) {
    return null;
  }

  const card = pickPrimaryMetaCard(snapshot);
  const video = pickMetaVideo(snapshot);
  const imageUrl = pickMetaImage(snapshot);
  const title = pickFirstDefined(
    cleanMetaCopy(card?.title),
    cleanMetaCopy(snapshot?.title),
    cleanMetaCopy(card?.link_description),
    cleanMetaCopy(snapshot?.link_description),
  );
  const body = pickFirstDefined(
    cleanMetaCopy(card?.body),
    cleanMetaCopy(snapshot?.body?.text),
    cleanMetaCopy(card?.caption),
    cleanMetaCopy(snapshot?.caption),
  );
  const now = new Date();
  const firstSeenAt = parseMetaTimestamp(result.start_date, true) ?? new Date();
  const archivedEndDate = parseMetaTimestamp(result.end_date);
  const isActive = result.is_active === true;
  const lastSeenAt = isActive ? now : archivedEndDate ?? firstSeenAt;
  const destinationUrl = pickFirstDefined(cleanText(card?.link_url), cleanText(snapshot?.link_url));
  const posterUrl = pickFirstDefined(video?.previewImageUrl, imageUrl);
  const payer = cleanText(snapshot?.page_name);

  return {
    source: "facebook",
    sourceAdId,
    fingerprint: buildSourceScopedId("facebook", `${sourceAdvertiserId}:${sourceAdId}`),
    title,
    body,
    payer,
    format: mapMetaFormat(snapshot?.display_format, snapshot ?? undefined),
    callToAction: pickFirstDefined(
      cleanText(card?.cta_text),
      cleanText(snapshot?.cta_text),
      humanizeMetaEnum(card?.cta_type),
      humanizeMetaEnum(snapshot?.cta_type),
    ),
    destinationUrl,
    mediaUrl: posterUrl,
    status: isActive ? "active" : "inactive",
    firstSeenAt,
    lastSeenAt,
    metadata: {
      collationCount: result.collation_count,
      containsDigitalCreatedMedia: result.contains_digital_created_media,
      countryIsoCode: cleanText(snapshot?.country_iso_code),
      currency: cleanText(result.currency),
      network: "meta",
      pageCategories: snapshot?.page_categories ?? [],
      pageProfileUrl: cleanText(snapshot?.page_profile_uri),
      publisherPlatforms: Array.isArray(result.publisher_platform) ? result.publisher_platform : [result.publisher_platform].filter(Boolean),
      rawPayload: result,
      sourceAdvertiserId,
      metaCreativeAssets: collectMetaCreativeAssets(snapshot),
      sourceMediaUrl: imageUrl,
      sourceThumbnailUrl: posterUrl,
      sourceVideoUrl: video?.sourceVideoUrl,
      targetedCountries: result.targeted_or_reached_countries ?? [],
    },
  };
}

export function normalizeMetaAdLibraryDetails(details: Record<string, unknown> | null): NormalizedAd | null {
  return details ? buildNormalizedMetaAd(details as MetaCollatedResult) : null;
}

function createMetaAdapterWithoutWebScrapingApi(options: CreateMetaAdapterOptions) {
  return new MetaAdapter({
    ...options,
    metaTransportOrder: "proxy-first",
    webScrapingApiKey: undefined,
    webScrapingApiProxy: undefined,
  });
}

async function tryMetaWithoutWebScrapingApi<T>(
  options: CreateMetaAdapterOptions,
  operation: (adapter: MetaAdapter) => Promise<T>,
) {
  if (!hasWebScrapingApiTransport(options)) {
    return null;
  }

  try {
    return await operation(createMetaAdapterWithoutWebScrapingApi(options));
  } catch {
    return null;
  }
}

export class MetaAdapter implements SourceAdapter {
  readonly source = "facebook" as const;

  constructor(private readonly options: CreateMetaAdapterOptions = {}) {}

  async searchAdvertisers(query: string): Promise<AdvertiserMatch[]> {
    const term = query.trim();

    if (!term) {
      return [];
    }

    const parsedQuery = parseMetaSearchInput(term);

    if (!parsedQuery.pageId && term.length < 2) {
      throw new AdvertiserSearchError("Enter at least 2 characters to search advertisers.", "invalid_query");
    }

    if (isE2eFixtureMode()) {
      return [buildFixtureProfile(term)];
    }

    try {
      if (parsedQuery.pageId) {
        const profile = await this.fetchAdvertiserProfile(parsedQuery.pageId);
        return profile ? [profile] : [];
      }

      const keyword = parsedQuery.keyword?.trim();

      if (!keyword) {
        return [];
      }

      const refererUrl = buildMetaKeywordSearchUrl(keyword);
      const session = await openMetaSession(refererUrl, this.options);
      const connection = await fetchMetaSearchConnection(
        session,
        refererUrl,
        buildMetaSearchVariables({
          first: metaDefaultSearchLimit,
          queryString: keyword,
          searchType: "keyword_unordered",
          sessionId: randomUUID(),
        }),
        this.options,
      );
      const seenAdvertiserIds = new Set<string>();
      const results: AdvertiserMatch[] = [];

      for (const edge of connection.edges ?? []) {
        for (const result of edge.node?.collated_results ?? []) {
          const advertiser = buildAdvertiserMatchFromSnapshot(result.snapshot);

          if (!advertiser || seenAdvertiserIds.has(advertiser.sourceAdvertiserId)) {
            continue;
          }

          if (
            parsedQuery.profileUri &&
            normalizeMetaProfileUri(advertiser.profileUrl) !== parsedQuery.profileUri &&
            normalizeMetaProfileUri(result.snapshot?.page_profile_uri) !== parsedQuery.profileUri
          ) {
            continue;
          }

          seenAdvertiserIds.add(advertiser.sourceAdvertiserId);
          results.push(advertiser);
        }
      }

      if (!results.length) {
        const fallbackResults = await tryMetaWithoutWebScrapingApi(this.options, (adapter) => adapter.searchAdvertisers(query));

        if (fallbackResults?.length) {
          return fallbackResults;
        }
      }

      if (parsedQuery.profileUri && !results.length) {
        return [];
      }

      return results;
    } catch (error) {
      if (error instanceof AdvertiserSearchError) {
        throw error;
      }

      const fallbackResults = await tryMetaWithoutWebScrapingApi(this.options, (adapter) => adapter.searchAdvertisers(query));

      if (fallbackResults) {
        return fallbackResults;
      }

      throw new AdvertiserSearchError(
        error instanceof Error ? error.message : "Meta advertiser search is temporarily unavailable.",
        "unavailable",
      );
    }
  }

  async fetchAdvertiserProfile(sourceAdvertiserId: string): Promise<AdvertiserMatch | null> {
    const normalizedId = normalizeMetaPageId(sourceAdvertiserId);

    if (!normalizedId) {
      return null;
    }

    const refererUrl = buildMetaAdsLibraryUrl(normalizedId);
    const session = await openMetaSession(refererUrl, this.options);
    const connection = await fetchMetaSearchConnection(
      session,
      refererUrl,
      buildMetaSearchVariables({
        first: 5,
        pageId: normalizedId,
        searchType: "page",
        sessionId: randomUUID(),
      }),
      this.options,
    );

    for (const edge of connection.edges ?? []) {
      for (const result of edge.node?.collated_results ?? []) {
        const advertiser = buildAdvertiserMatchFromSnapshot(result.snapshot);

        if (advertiser?.sourceAdvertiserId === normalizedId) {
          return advertiser;
        }
      }
    }

    const fallbackProfile = await tryMetaWithoutWebScrapingApi(this.options, (adapter) =>
      adapter.fetchAdvertiserProfile(sourceAdvertiserId),
    );

    if (fallbackProfile) {
      return fallbackProfile;
    }

    return null;
  }

  async fetchAdvertiserAds(sourceAdvertiserId: string, options?: FetchAdvertiserAdsOptions): Promise<NormalizedAd[]> {
    const metaProxyUrls = (this.options.metaProxyUrls ?? []).map((proxyUrl) => proxyUrl.trim()).filter(Boolean);
    const shouldUseProxyListFirst = !(
      this.options.metaTransportOrder === "webscrapingapi-first" && hasWebScrapingApiTransport(this.options)
    );
    let shouldUseProxyList = shouldUseProxyListFirst;

    if (metaProxyUrls.length && !this.options.metaProxyUrl && !shouldUseProxyListFirst) {
      try {
        const ads = await new MetaAdapter({
          ...this.options,
          metaProxyUrls: undefined,
        }).fetchAdvertiserAds(sourceAdvertiserId, options);

        if (ads.length) {
          return ads;
        }

        const fallbackAds = await tryMetaWithoutWebScrapingApi(this.options, (adapter) =>
          adapter.fetchAdvertiserAds(sourceAdvertiserId, options),
        );

        return fallbackAds?.length ? fallbackAds : ads;
      } catch (error) {
        if (!isMetaRateLimitError(error)) {
          throw error;
        }

        shouldUseProxyList = true;
      }
    }

    if (metaProxyUrls.length && !this.options.metaProxyUrl && shouldUseProxyList) {
      const proxyAttempts = shuffledMetaProxyAttempts(metaProxyUrls);
      let lastError: unknown = null;

      for (const [index, metaProxyUrl] of proxyAttempts.entries()) {
        try {
          const ads = await new MetaAdapter({
            ...this.options,
            metaTransportOrder: "proxy-first",
            metaProxyUrl,
            metaProxyUrls: undefined,
            webScrapingApiKey: undefined,
            webScrapingApiProxy: undefined,
          }).fetchAdvertiserAds(sourceAdvertiserId, options);

          metaProxyCursor = (metaProxyCursor + index + 1) % metaProxyUrls.length;
          return ads;
        } catch (error) {
          lastError = error;

          if (!isMetaRateLimitError(error)) {
            throw error;
          }

          metaProxyCursor = (metaProxyCursor + index + 1) % metaProxyUrls.length;
        }
      }

      throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Meta proxy list failed."));
    }

    if (isE2eFixtureMode()) {
      return buildFixtureAds(slugifyMetaFixtureId(sourceAdvertiserId) || "fixture-meta");
    }

    const normalizedId = normalizeMetaPageId(sourceAdvertiserId);

    if (!normalizedId) {
      return [];
    }

    const country = normalizeMetaCountry(options?.country ?? metaAdLibraryCountry);
    const refererUrl = buildMetaAdsLibraryUrl(normalizedId, country);
    const session = await openMetaSession(refererUrl, this.options);
    const targetSourceAdIds = new Set(options?.sourceAdIds?.map((sourceAdId) => sourceAdId.trim()).filter(Boolean));
    const maxResults = clampMetaResultLimit(options?.maxResults, targetSourceAdIds.size > 0 ? 500 : 100);
    const sessionId = randomUUID();
    const seenAdIds = new Set<string>();
    const ads: NormalizedAd[] = [];
    let cursor: string | null = null;

    while (ads.length < maxResults) {
      const connection = await fetchMetaSearchConnection(
        session,
        refererUrl,
        buildMetaSearchVariables({
          country,
          cursor,
          first: Math.min(metaMaxAdsPerPage, maxResults - ads.length),
          pageId: normalizedId,
          searchType: "page",
          sessionId,
        }),
        this.options,
      );

      for (const edge of connection.edges ?? []) {
        for (const result of edge.node?.collated_results ?? []) {
          const ad = buildNormalizedMetaAd(result);
          const sourceAdId = ad?.sourceAdId ?? ad?.fingerprint;

          if (
            !ad ||
            !sourceAdId ||
            seenAdIds.has(sourceAdId) ||
            (targetSourceAdIds.size > 0 && !targetSourceAdIds.has(sourceAdId)) ||
            !overlapsWindow(ad.firstSeenAt, ad.lastSeenAt, options)
          ) {
            continue;
          }

          seenAdIds.add(sourceAdId);
          ads.push(ad);

          if (ads.length >= maxResults || (targetSourceAdIds.size > 0 && [...targetSourceAdIds].every((id) => seenAdIds.has(id)))) {
            return ads;
          }
        }
      }

      if (!connection.page_info?.has_next_page || !connection.page_info.end_cursor) {
        break;
      }

      cursor = connection.page_info.end_cursor;
    }

    if (!ads.length) {
      const fallbackAds = await tryMetaWithoutWebScrapingApi(this.options, (adapter) =>
        adapter.fetchAdvertiserAds(sourceAdvertiserId, options),
      );

      if (fallbackAds?.length) {
        return fallbackAds;
      }
    }

    return ads;
  }

  async fetchLandingPage(url: string) {
    return fetchLandingPageSnapshot(url);
  }
}

export function createMetaAdapter(options?: CreateMetaAdapterOptions) {
  return new MetaAdapter(options);
}
