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
} from "../webscrapingapi";

const fixtureFetchCounts = new Map<string, number>();
const googleRpcBaseUrl = "https://adstransparency.google.com/anji/_/rpc";
const googleRpcTimeoutMs = 20_000;
const googlePreviewFetchTimeoutMs = 20_000;
const googleUkRegionCode = 2826;
const googleDefaultSearchLimit = 8;
const googleMaxCreativeResults = 100;
const googlePreviewEnhancementConcurrency = 4;
const googleRpcMaxAttempts = 4;
const googleRpcRetryDelayMs = [2_000, 5_000, 10_000];
const googleRpcRetryableStatuses = new Set([302, 408, 425, 429, 500, 502, 503, 504]);
let googleRpcProxyCursor = 0;
const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

export type CreateGoogleAdapterOptions = {
  googleRpcProxyUrls?: string[];
  webScrapingApiProxy?: WebScrapingApiProxyOptions;
  webScrapingApiKey?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GoogleAdvertiserRecord = {
  "1"?: string;
  "2"?: string;
  "3"?: string;
  "4"?: {
    "2"?: {
      "1"?: string;
      "2"?: string;
    };
  };
  "5"?: boolean;
  "9"?: {
    "1"?: string;
    "2"?: string;
    "4"?: number;
  };
  "11"?: string;
  "15"?: number[];
  "16"?: boolean;
};

type GoogleSearchSuggestionItem = {
  "1"?: GoogleAdvertiserRecord;
  "2"?: {
    "1"?: string;
  };
};

type GoogleSearchSuggestionsResponse = {
  "1"?: GoogleSearchSuggestionItem[];
  "3"?: string;
};

type GoogleAdvertiserLookupResponse = {
  "1"?: GoogleAdvertiserRecord;
};

type GoogleTimestamp = {
  "1"?: string | number;
  "2"?: string | number;
};

type GoogleCreativeRecord = {
  "1"?: string;
  "2"?: string;
  "3"?: {
    "1"?: {
      "4"?: string;
    };
    "3"?: {
      "2"?: string;
    };
    "5"?: boolean;
  };
  "4"?: string | number;
  "6"?: GoogleTimestamp;
  "7"?: GoogleTimestamp;
  "12"?: string;
  "13"?: string | number;
  "16"?: boolean;
};

type GoogleCreativeSearchResponse = {
  "1"?: GoogleCreativeRecord[];
  "4"?: string;
  "5"?: string;
};

type GoogleCreativeDetailRecord = {
  "1"?: string;
  "2"?: string;
  "4"?: GoogleTimestamp;
  "5"?: Array<{
    "1"?: {
      "4"?: string;
    };
    "3"?: {
      "2"?: string;
    };
  }>;
  "8"?: string | number;
  "17"?: Array<{
    "1"?: string | number;
    "5"?: string | number;
  }>;
  "22"?: {
    "1"?: string;
  };
};

type GoogleCreativeLookupResponse = {
  "1"?: GoogleCreativeDetailRecord;
};

type GooglePreviewInsights = {
  title?: string;
  body?: string;
  callToAction?: string;
  brandUrl?: string;
  destinationUrl?: string;
  mediaUrl?: string;
  sourceThumbnailUrl?: string;
  sourceVideoUrl?: string;
  previewTitle?: string;
  previewAppName?: string;
  youtubeVideoId?: string;
  variationType?: number;
  creativeWidth?: number;
  creativeHeight?: number;
};

type GoogleAdvertiserMetadata = {
  googleAdvertiserName?: string;
  googleAdvertiserCountryCode?: string;
  googleAdvertiserCountry?: string;
  googleAdvertiserVerified?: boolean;
  googleAdvertiserLegalName?: string;
  googleAdvertiserPaymentProfileName?: string;
  googleAdvertiserVerificationStatusCode?: number;
  googleAdvertiserServedRegionCodes?: number[];
  googleAdvertiserAdCountLowerBound?: string;
  googleAdvertiserAdCountUpperBound?: string;
};

type GoogleArchivedImagePreview = {
  url: string;
  width?: number;
  height?: number;
  html?: string;
};

type GoogleCreativePreviewVideoSignal = {
  sourceVideoUrl?: string | null;
  googleYoutubeVideoId?: string | null;
};

export function resolveGoogleCreativePreviewVideoSignal(input: {
  currentFormat?: string;
  sourceVideoUrl?: string | null;
  googleYoutubeVideoId?: string | null;
  creativeAssets?: GoogleCreativePreviewVideoSignal[];
}) {
  const googleYoutubeVideoId =
    cleanText(input.googleYoutubeVideoId) ??
    input.creativeAssets
      ?.map((asset) => cleanText(asset.googleYoutubeVideoId))
      .find((value): value is string => Boolean(value));
  const hasVideoSignal = Boolean(
    cleanText(input.sourceVideoUrl) ||
      googleYoutubeVideoId ||
      input.creativeAssets?.some((asset) => cleanText(asset.sourceVideoUrl)),
  );

  return {
    format: hasVideoSignal ? "video" : input.currentFormat,
    googleYoutubeVideoId,
  };
}

function slugifyGoogleFixtureId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeGoogleAdvertiserId(value: string) {
  return value.trim().replace(/[^a-z0-9_-]+/gi, "").toUpperCase();
}

function humanizeIdentifier(value: string) {
  return value
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || undefined;
}

function stripHtmlTags(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function decodeGooglePreviewScript(text: string) {
  return decodeHtmlEntities(
    text
      .replace(/\\x([0-9a-f]{2})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
      .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
      .replace(/\\\//g, "/")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'"),
  );
}

function normalizePreviewUrl(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .replace(/\\u0026/gi, "&")
    .replace(/\\([/?=&])/g, "$1");

  if (normalized.startsWith("//")) {
    return `https:${normalized}`;
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }

  return undefined;
}

function collectNestedStrings(value: unknown, depth = 0): string[] {
  if (depth > 5 || value == null) {
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

  return Object.values(value as Record<string, unknown>).flatMap((item) => collectNestedStrings(item, depth + 1));
}

function extractDecodedText(value?: string | null) {
  if (!value) {
    return undefined;
  }

  return cleanText(stripHtmlTags(decodeHtmlEntities(value)));
}

function extractPreviewTargetText(decodedPreview: string, target: string) {
  const spanMatch = decodedPreview.match(
    new RegExp(`data-asoch-targets="ad0,${target}"[\\s\\S]{0,600}?<span[^>]*dir="auto">([^<]+)<\\/span>`, "i"),
  );

  if (spanMatch?.[1]) {
    return extractDecodedText(spanMatch[1]);
  }

  const anchorMatch = decodedPreview.match(
    new RegExp(`data-asoch-targets="ad0,${target}"[\\s\\S]{0,240}?>([^<]+)<\\/a>`, "i"),
  );

  return extractDecodedText(anchorMatch?.[1]);
}

function extractPreviewUrlMatch(decodedPreview: string, pattern: RegExp) {
  const match = decodedPreview.match(pattern);
  return normalizePreviewUrl(match?.[0]);
}

function rankGoogleImageUrl(url: string) {
  let score = 0;

  if (url.includes("ytimg.com")) {
    score += 40;
  }

  if (url.includes("googleusercontent.com")) {
    score += 60;
  }

  const sizeMatch = url.match(/[=?-]w(\d+)-h(\d+)/i);

  if (sizeMatch?.[1] && sizeMatch?.[2]) {
    score += Number.parseInt(sizeMatch[1], 10) * Number.parseInt(sizeMatch[2], 10);
  }

  if (url.includes("w96-h96")) {
    score -= 20_000;
  }

  return score;
}

function extractGoogleImageUrl(decodedPreview: string) {
  const matches = [...decodedPreview.matchAll(/(?:https?:)?\/\/(?:lh\d+\.googleusercontent\.com|i\d*\.ytimg\.com)\/[^"'<)\s]+/gi)]
    .map((match) => normalizePreviewUrl(match[0]))
    .filter((value): value is string => Boolean(value));

  if (!matches.length) {
    return undefined;
  }

  return matches
    .sort((left, right) => rankGoogleImageUrl(right) - rankGoogleImageUrl(left))
    .find((value) => !value.includes("w96-h96"))
    ?? matches[0];
}

function extractGoogleArchivedImagePreview(value: unknown): GoogleArchivedImagePreview | undefined {
  const directHtml = typeof (value as GoogleCreativeRecord | undefined)?.["3"]?.["3"]?.["2"] === "string"
    ? (value as GoogleCreativeRecord)["3"]?.["3"]?.["2"]
    : undefined;
  const candidates = directHtml ? [directHtml] : collectNestedStrings(value);

  for (const candidate of candidates) {
    const imgMatch =
      candidate.match(/<img[^>]+src=["']((?:https?:)?\/\/[^"' >]+)["']/i) ??
      candidate.match(/((?:https?:)?\/\/tpc\.googlesyndication\.com\/archive\/simgad\/[^"' <]+)/i);
    const url = normalizePreviewUrl(imgMatch?.[1]);

    if (!url) {
      continue;
    }

    const widthMatch = candidate.match(/\bwidth=["']?(\d+(?:\.\d+)?)/i);
    const heightMatch = candidate.match(/\bheight=["']?(\d+(?:\.\d+)?)/i);
    const width = widthMatch?.[1] ? Number.parseFloat(widthMatch[1]) : Number.NaN;
    const height = heightMatch?.[1] ? Number.parseFloat(heightMatch[1]) : Number.NaN;

    return {
      url,
      width: Number.isFinite(width) ? width : undefined,
      height: Number.isFinite(height) ? height : undefined,
      html: candidate.includes("<img") ? candidate : undefined,
    };
  }

  return undefined;
}

function extractGoogleVideoUrl(decodedPreview: string) {
  return extractPreviewUrlMatch(decodedPreview, /(?:https?:)?\/\/[^"'<\]\s]+googlevideo\.com\/videoplayback\?[^"'<\]\s]+/i);
}

function extractGoogleYoutubeVideoId(decodedPreview: string) {
  return cleanText(
    decodedPreview.match(/['"]video_id['"]\s*:\s*['"]([^'"]+)['"]/i)?.[1] ??
      decodedPreview.match(/youtube(?:_vertical_player_media|\.com\/embed).*?['"]video_id['"]\s*:\s*['"]([^'"]+)['"]/i)?.[1],
  );
}

function extractGoogleYoutubeVideoIdFromUrl(url?: string | null) {
  if (!url) {
    return undefined;
  }

  return cleanText(url.match(/\/vi\/([^/]+)\//i)?.[1]);
}

function buildYoutubeThumbnailUrl(videoId?: string | null) {
  return videoId ? `https://i3.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : undefined;
}

function extractGooglePreviewMetadata(decodedPreview: string) {
  const match = decodedPreview.match(/"creativeType":(\d+)[^}]*"variationType":(\d+)[^}]*"width":(\d+)[^}]*"height":(\d+)/i);

  if (!match?.[2] || !match[3] || !match[4]) {
    return {};
  }

  return {
    variationType: Number.parseInt(match[2], 10),
    creativeWidth: Number.parseInt(match[3], 10),
    creativeHeight: Number.parseInt(match[4], 10),
  };
}

function extractGoogleClickthroughUrl(decodedPreview: string) {
  return extractPreviewUrlMatch(decodedPreview, /https:\/\/www\.googleadservices\.com\/pagead\/aclk\?[^"'<\s]+/i);
}

function extractGoogleDestinationUrl(clickthroughUrl?: string) {
  if (!clickthroughUrl) {
    return undefined;
  }

  try {
    const url = new URL(clickthroughUrl);
    return url.searchParams.get("adurl") ?? clickthroughUrl;
  } catch {
    return clickthroughUrl;
  }
}

function isGoogleInternalUrl(value: string) {
  const normalized = value.toLowerCase();

  return (
    normalized.includes("google.com") ||
    normalized.includes("googleadservices.com") ||
    normalized.includes("googlesyndication.com") ||
    normalized.includes("googleusercontent.com") ||
    normalized.includes("gstatic.com") ||
    normalized.includes("doubleclick.net") ||
    normalized.includes("ytimg.com") ||
    normalized.includes("youtube.com")
  );
}

function normalizeGoogleDisplayUrl(value?: string | null) {
  const normalized = cleanText(value)?.replace(/^https?:\/\//i, "").toLowerCase();

  if (!normalized || isGoogleInternalUrl(normalized)) {
    return undefined;
  }

  return normalized;
}

function extractGoogleDisplayUrl(decodedPreview: string) {
  const targetedDisplayUrl = [
    "ochUrl",
    "ochDisplayUrl",
    "ochVisibleUrl",
    "ochWebsite",
    "ochWebsiteUrl",
    "ochDisplayDomain",
  ]
    .map((target) => normalizeGoogleDisplayUrl(extractPreviewTargetText(decodedPreview, target)))
    .find((value): value is string => Boolean(value));

  if (targetedDisplayUrl) {
    return targetedDisplayUrl;
  }

  const textOnly = stripHtmlTags(decodedPreview);
  const urlMatches = textOnly.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s"'<>]*)?/gi) ?? [];

  return urlMatches.map(normalizeGoogleDisplayUrl).find((value): value is string => Boolean(value));
}

export function extractGoogleBrandUrlFromPreviewHtml(previewHtml: string) {
  return extractGoogleDisplayUrl(decodeGooglePreviewScript(previewHtml));
}

async function fetchGoogleText(
  url: string,
  init: {
    body?: URLSearchParams;
    headers: Record<string, string>;
    method?: "GET" | "POST";
    timeoutMs: number;
  },
  webScrapingApiKey?: string,
) {
  const apiKey = webScrapingApiKey?.trim();

  if (apiKey) {
    const response = await fetchTextViaWebScrapingApi(url, {
      apiKey,
      body: init.body,
      headers: init.headers,
      method: init.method ?? "GET",
      timeoutMs: init.timeoutMs,
    });

    if (response.ok || (init.method && init.method !== "GET")) {
      return {
        ...response,
        viaWebScrapingApi: true,
      };
    }
  }

  const response = await fetch(url, {
    body: init.body,
    headers: init.headers,
    method: init.method ?? "GET",
    signal: AbortSignal.timeout(init.timeoutMs),
  });

  return {
    headers: Object.fromEntries(response.headers.entries()),
    ok: response.ok,
    status: response.status,
    text: await response.text(),
    viaWebScrapingApi: false,
  };
}

export async function fetchGooglePreviewBrandUrl(previewUrl: string, options?: CreateGoogleAdapterOptions) {
  const response = await fetchGoogleText(previewUrl, {
    headers: {
      "user-agent": "Mozilla/5.0",
    },
    timeoutMs: googlePreviewFetchTimeoutMs,
  }, options?.webScrapingApiKey);

  if (!response.ok) {
    throw new Error(`Google creative preview request failed with ${response.status}.`);
  }

  return extractGoogleBrandUrlFromPreviewHtml(response.text);
}

function extractGoogleVastTitle(decodedPreview: string) {
  return extractDecodedText(decodedPreview.match(/<AdTitle>([^<]+)<\/AdTitle>/i)?.[1]);
}

function extractGoogleTemplateText(decodedPreview: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match =
    decodedPreview.match(new RegExp(`['"]${escapedKey}['"]\\s*:\\s*'((?:\\\\'|[^'])*)'`, "i")) ??
    decodedPreview.match(new RegExp(`['"]${escapedKey}['"]\\s*:\\s*"((?:\\\\"|[^"])*)"`, "i"));

  if (!match?.[1]) {
    return undefined;
  }

  return extractDecodedText(match[1].replace(/\\'/g, "'").replace(/\\"/g, '"'));
}

function extractBalancedJsonArrayAfterMarker(content: string, marker: string) {
  const markerIndex = content.indexOf(marker);

  if (markerIndex === -1) {
    return undefined;
  }

  const startIndex = content.indexOf("[", markerIndex + marker.length);

  if (startIndex === -1) {
    return undefined;
  }

  let depth = 0;
  let isEscaped = false;
  let isInString = false;

  for (let index = startIndex; index < content.length; index += 1) {
    const character = content[index];

    if (isInString) {
      if (isEscaped) {
        isEscaped = false;
      } else if (character === "\\") {
        isEscaped = true;
      } else if (character === "\"") {
        isInString = false;
      }

      continue;
    }

    if (character === "\"") {
      isInString = true;
      continue;
    }

    if (character === "[") {
      depth += 1;
      continue;
    }

    if (character === "]") {
      depth -= 1;

      if (depth === 0) {
        return content.slice(startIndex, index + 1);
      }
    }
  }

  return undefined;
}

function extractGoogleStructuredSearchAdData(decodedPreview: string): GooglePreviewInsights {
  const rawSearchAdData = extractBalancedJsonArrayAfterMarker(decodedPreview, "\"361903925\":");

  if (!rawSearchAdData) {
    return {};
  }

  try {
    const searchAdData = JSON.parse(rawSearchAdData) as unknown[];

    return {
      title: extractDecodedText(typeof searchAdData[7] === "string" ? searchAdData[7] : null),
      brandUrl: normalizeGoogleDisplayUrl(typeof searchAdData[8] === "string" ? searchAdData[8] : null),
      body: extractDecodedText(typeof searchAdData[9] === "string" ? searchAdData[9] : null),
    };
  } catch {
    return {};
  }
}

function extractGooglePreviewInsightsFromDecodedPreview(decodedPreview: string): GooglePreviewInsights {
  const structuredSearchAdData = extractGoogleStructuredSearchAdData(decodedPreview);
  const appName = extractPreviewTargetText(decodedPreview, "ochAppName");
  const headline =
    structuredSearchAdData.title ??
    extractPreviewTargetText(decodedPreview, "ochBody") ??
    extractGoogleTemplateText(decodedPreview, "headline") ??
    extractGoogleTemplateText(decodedPreview, "longHeadline");
  const description =
    structuredSearchAdData.body ??
    extractPreviewTargetText(decodedPreview, "ochDescription") ??
    extractGoogleTemplateText(decodedPreview, "description") ??
    extractGoogleTemplateText(decodedPreview, "shortDescription");
  const cta =
    extractPreviewTargetText(decodedPreview, "ochButton") ??
    extractPreviewTargetText(decodedPreview, "ochLearnMoreButton") ??
    extractPreviewTargetText(decodedPreview, "ochEndCardButton") ??
    extractGoogleTemplateText(decodedPreview, "callToActionText");
  const videoUrl = extractGoogleVideoUrl(decodedPreview);
  const rawImageUrl = extractGoogleImageUrl(decodedPreview);
  const youtubeVideoId = extractGoogleYoutubeVideoId(decodedPreview) ?? extractGoogleYoutubeVideoIdFromUrl(rawImageUrl);
  const imageUrl = rawImageUrl ?? buildYoutubeThumbnailUrl(youtubeVideoId);
  const clickthroughUrl = extractGoogleClickthroughUrl(decodedPreview);
  const brandUrl = structuredSearchAdData.brandUrl ?? extractGoogleDisplayUrl(decodedPreview);
  const previewMetadata = extractGooglePreviewMetadata(decodedPreview);

  return {
    title: headline ?? extractGoogleVastTitle(decodedPreview) ?? appName,
    body: description ?? (appName && headline && appName !== headline ? appName : undefined),
    callToAction: cta,
    brandUrl,
    destinationUrl: extractGoogleDestinationUrl(clickthroughUrl),
    mediaUrl: imageUrl,
    sourceThumbnailUrl: imageUrl,
    sourceVideoUrl: videoUrl,
    previewTitle: extractGoogleVastTitle(decodedPreview),
    previewAppName: appName,
    youtubeVideoId,
    ...previewMetadata,
  };
}

async function fetchGooglePreviewInsights(previewUrl: string, webScrapingApiKey?: string): Promise<GooglePreviewInsights> {
  const response = await fetchGoogleText(previewUrl, {
    headers: {
      "user-agent": "Mozilla/5.0",
    },
    timeoutMs: googlePreviewFetchTimeoutMs,
  }, webScrapingApiKey);

  if (!response.ok) {
    throw new Error(`Google creative preview request failed with ${response.status}.`);
  }

  const decodedPreview = decodeGooglePreviewScript(response.text);
  return extractGooglePreviewInsightsFromDecodedPreview(decodedPreview);
}

function extractGoogleCreativeDetailPreviewUrls(record?: GoogleCreativeDetailRecord | null) {
  return (record?.["5"] ?? [])
    .flatMap((item) => [
      normalizePreviewUrl(cleanText(item["1"]?.["4"])),
      extractGoogleIframePreviewUrl(cleanText(item["3"]?.["2"])),
    ])
    .filter((value): value is string => Boolean(value));
}

function extractGoogleIframePreviewUrl(html?: string | null) {
  if (!html) {
    return undefined;
  }

  const src =
    html.match(/<iframe[^>]*\bsrc=["']([^"']+)["']/i)?.[1] ??
    html.match(/\bsrc=([^ >]+)/i)?.[1]?.replace(/^['"]|['"]$/g, "");

  return normalizePreviewUrl(src);
}

async function fetchGoogleCreativeDetail(
  sourceAdvertiserId: string,
  sourceAdId: string,
  options?: CreateGoogleAdapterOptions,
) {
  const response = await fetchGoogleRpc<GoogleCreativeLookupResponse>("LookupService/GetCreativeById", {
    1: sourceAdvertiserId,
    2: sourceAdId,
    5: { 1: 1, 2: 0, 3: googleUkRegionCode },
  }, options);

  return response["1"] ?? null;
}

async function fetchGoogleCreativePreviewAssets(input: {
  fallbackPreviewUrl?: string | null;
  googleRpcProxyUrls?: string[];
  sourceAdvertiserId?: string | null;
  sourceAdId?: string | null;
  webScrapingApiProxy?: WebScrapingApiProxyOptions;
  webScrapingApiKey?: string;
}) {
  const detail =
    input.sourceAdvertiserId && input.sourceAdId
      ? await fetchGoogleCreativeDetail(input.sourceAdvertiserId, input.sourceAdId, {
          googleRpcProxyUrls: input.googleRpcProxyUrls,
          webScrapingApiKey: input.webScrapingApiKey,
          webScrapingApiProxy: input.webScrapingApiProxy,
        }).catch(() => null)
      : null;
  const detailPreviewUrls = extractGoogleCreativeDetailPreviewUrls(detail);
  const previewUrls = detailPreviewUrls.length
    ? detailPreviewUrls
    : input.fallbackPreviewUrl
      ? [input.fallbackPreviewUrl]
      : [];

  if (!previewUrls.length) {
    return [];
  }

  const fetchedPreviews = await Promise.all(
    previewUrls.map(async (previewUrl, index) => {
      try {
        return {
          index,
          previewUrl,
          insights: await fetchGooglePreviewInsights(previewUrl, input.webScrapingApiKey),
        };
      } catch {
        return null;
      }
    }),
  );
  const previews = fetchedPreviews.filter((preview): preview is NonNullable<(typeof fetchedPreviews)[number]> => Boolean(preview));
  const videoByYoutubeId = new Map<string, string>();

  for (const preview of previews) {
    if (preview.insights.youtubeVideoId && preview.insights.sourceVideoUrl) {
      videoByYoutubeId.set(preview.insights.youtubeVideoId, preview.insights.sourceVideoUrl);
    }
  }

  return previews.map((preview) => {
    const sourceVideoUrl =
      preview.insights.sourceVideoUrl ??
      (preview.insights.youtubeVideoId ? videoByYoutubeId.get(preview.insights.youtubeVideoId) : undefined);

    return {
      label: preview.index === 0 ? "Original" : `Variant ${preview.index}`,
      previewUrl: preview.previewUrl,
      title: preview.insights.title,
      body: preview.insights.body,
      callToAction: preview.insights.callToAction,
      brandUrl: preview.insights.brandUrl,
      destinationUrl: preview.insights.destinationUrl,
      sourceMediaUrl: preview.insights.mediaUrl,
      sourceThumbnailUrl: preview.insights.sourceThumbnailUrl,
      sourceVideoUrl,
      googleYoutubeVideoId: preview.insights.youtubeVideoId,
      googleVariationType: preview.insights.variationType,
      googleCreativeWidth: preview.insights.creativeWidth,
      googleCreativeHeight: preview.insights.creativeHeight,
    };
  });
}

export async function enrichGoogleCreativePreview(ad: NormalizedAd, options?: CreateGoogleAdapterOptions) {
  const metadata = { ...(ad.metadata ?? {}) };
  const previewUrl = typeof metadata.previewUrl === "string" ? metadata.previewUrl : null;
  const sourceAdvertiserId = typeof metadata.sourceAdvertiserId === "string" ? cleanText(metadata.sourceAdvertiserId) : undefined;

  if (!previewUrl && !(sourceAdvertiserId && ad.sourceAdId)) {
    return ad;
  }

  try {
    const creativeAssets = await fetchGoogleCreativePreviewAssets({
      fallbackPreviewUrl: previewUrl,
      googleRpcProxyUrls: options?.googleRpcProxyUrls,
      sourceAdvertiserId,
      sourceAdId: ad.sourceAdId,
      webScrapingApiKey: options?.webScrapingApiKey,
      webScrapingApiProxy: options?.webScrapingApiProxy,
    });
    const preview = creativeAssets[0]
      ? {
          title: creativeAssets[0].title,
          body: creativeAssets[0].body,
          callToAction: creativeAssets[0].callToAction,
          brandUrl: creativeAssets[0].brandUrl,
          destinationUrl: creativeAssets[0].destinationUrl,
          mediaUrl: creativeAssets[0].sourceMediaUrl,
          sourceThumbnailUrl: creativeAssets[0].sourceThumbnailUrl,
          sourceVideoUrl: creativeAssets[0].sourceVideoUrl,
          youtubeVideoId: creativeAssets[0].googleYoutubeVideoId,
          previewTitle: undefined,
          previewAppName: undefined,
        }
      : previewUrl
        ? await fetchGooglePreviewInsights(previewUrl, options?.webScrapingApiKey)
        : null;

    if (!preview) {
      return ad;
    }

    const videoSignal = resolveGoogleCreativePreviewVideoSignal({
      currentFormat: ad.format,
      sourceVideoUrl:
        preview.sourceVideoUrl ?? (typeof metadata.sourceVideoUrl === "string" ? metadata.sourceVideoUrl : undefined),
      googleYoutubeVideoId:
        preview.youtubeVideoId ?? (typeof metadata.googleYoutubeVideoId === "string" ? metadata.googleYoutubeVideoId : undefined),
      creativeAssets,
    });
    const nextMetadata: Record<string, unknown> = {
      ...metadata,
      previewTitle: preview.previewTitle,
      previewAppName: preview.previewAppName,
      googleBrandUrl: preview.brandUrl ?? metadata.googleBrandUrl,
      sourceMediaUrl: preview.mediaUrl ?? metadata.sourceMediaUrl,
      sourceThumbnailUrl: preview.sourceThumbnailUrl ?? metadata.sourceThumbnailUrl,
      sourceVideoUrl: preview.sourceVideoUrl ?? metadata.sourceVideoUrl,
      googleYoutubeVideoId: videoSignal.googleYoutubeVideoId ?? metadata.googleYoutubeVideoId,
      googleCreativeVariationTotal: creativeAssets.length || undefined,
      googleCreativeAssets: creativeAssets.length ? creativeAssets : metadata.googleCreativeAssets,
    };

    delete nextMetadata.previewFetchError;

    return {
      ...ad,
      title: preview.title ?? ad.title,
      body: preview.body ?? ad.body,
      callToAction: preview.callToAction ?? ad.callToAction,
      destinationUrl: preview.destinationUrl ?? ad.destinationUrl,
      format: videoSignal.format,
      mediaUrl: preview.mediaUrl ?? ad.mediaUrl,
      metadata: nextMetadata,
    } satisfies NormalizedAd;
  } catch (error) {
    return {
      ...ad,
      metadata: {
        ...metadata,
        previewFetchError: error instanceof Error ? error.message : "Unknown Google preview fetch error.",
      },
    } satisfies NormalizedAd;
  }
}

async function enrichGoogleCreatives(ads: NormalizedAd[], options?: CreateGoogleAdapterOptions) {
  if (!ads.length) {
    return [];
  }

  const enrichedAds = new Array<NormalizedAd>(ads.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(googlePreviewEnhancementConcurrency, ads.length) }, async () => {
      while (nextIndex < ads.length) {
        const currentIndex = nextIndex;

        nextIndex += 1;
        enrichedAds[currentIndex] = await enrichGoogleCreativePreview(ads[currentIndex], options);
      }
    }),
  );

  return enrichedAds;
}

function buildGoogleProfileUrl(sourceAdvertiserId: string) {
  return `https://adstransparency.google.com/advertiser/${encodeURIComponent(sourceAdvertiserId)}`;
}

function isGoogleAdvertiserId(value: string) {
  return /^AR[0-9A-Z]{12,}$/i.test(value.trim());
}

function parseGoogleAdvertiserIdentifier(query: string) {
  const trimmed = query.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    const pathMatch = url.pathname.match(/\/advertiser\/([^/?#]+)/i);

    if (pathMatch?.[1]) {
      const identifier = normalizeGoogleAdvertiserId(decodeURIComponent(pathMatch[1]));
      return isGoogleAdvertiserId(identifier) ? identifier : null;
    }
  } catch {
    if (isGoogleAdvertiserId(trimmed)) {
      return normalizeGoogleAdvertiserId(trimmed);
    }
  }

  return null;
}

function getCountryLabel(countryCode?: string | null) {
  const normalizedCountryCode = countryCode?.trim();

  if (!normalizedCountryCode) {
    return undefined;
  }

  if (normalizedCountryCode.length === 2 && regionNames) {
    return regionNames.of(normalizedCountryCode.toUpperCase()) ?? normalizedCountryCode.toUpperCase();
  }

  return normalizedCountryCode;
}

function parseGoogleTimestamp(value?: GoogleTimestamp) {
  const rawSeconds = value?.["1"];
  const rawNanos = value?.["2"];
  const seconds =
    typeof rawSeconds === "number"
      ? rawSeconds
      : typeof rawSeconds === "string"
        ? Number.parseInt(rawSeconds, 10)
        : Number.NaN;
  const nanos =
    typeof rawNanos === "number"
      ? rawNanos
      : typeof rawNanos === "string"
        ? Number.parseInt(rawNanos, 10)
        : 0;

  if (!Number.isFinite(seconds)) {
    return null;
  }

  return new Date(seconds * 1_000 + Math.floor(Math.max(0, nanos) / 1_000_000));
}

function mapGoogleCreativeFormat(formatCode: string | number | undefined, previewUrl?: string, archivedImageUrl?: string) {
  if (String(formatCode) === "3") {
    return "video";
  }

  if (String(formatCode) === "1") {
    return "text";
  }

  if (String(formatCode) === "2") {
    return "image";
  }

  return previewUrl || archivedImageUrl ? "image" : "text";
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

function clampCreativeResultLimit(maxResults?: number) {
  if (!maxResults || !Number.isFinite(maxResults)) {
    return googleMaxCreativeResults;
  }

  return Math.min(googleMaxCreativeResults, Math.max(1, Math.trunc(maxResults)));
}

function buildFixtureProfile(query: string): AdvertiserMatch {
  const sourceAdvertiserId = slugifyGoogleFixtureId(query) || "fixture-google";

  return {
    id: buildSourceScopedId("google", sourceAdvertiserId),
    source: "google",
    sourceAdvertiserId,
    canonicalName: humanizeIdentifier(sourceAdvertiserId),
    profileUrl: buildGoogleProfileUrl(sourceAdvertiserId),
    summary: "Deterministic Google Ads advertiser fixture.",
  };
}

function buildFixtureAds(sourceAdvertiserId: string) {
  const now = new Date();
  const fetchCount = (fixtureFetchCounts.get(sourceAdvertiserId) ?? 0) + 1;

  fixtureFetchCounts.set(sourceAdvertiserId, fetchCount);

  const primaryAd: NormalizedAd = {
    source: "google",
    sourceAdId: `${sourceAdvertiserId}-fixture-ad-1`,
    fingerprint: `${sourceAdvertiserId}-fixture-ad-1`,
    title: "Fixture Google search ad",
    body: "Deterministic Google text ad fixture used for multi-source coverage.",
    payer: humanizeIdentifier(sourceAdvertiserId),
    format: "text",
    callToAction: "Learn more",
    destinationUrl: `https://example.com/${sourceAdvertiserId}/google-search`,
    status: "active",
    reactionCount: 0,
    commentCount: 0,
    firstSeenAt: now,
    lastSeenAt: now,
    metadata: {
      status: "fixture",
      sourceAdvertiserId,
      network: "google",
    },
  };

  if (fetchCount === 1) {
    return [primaryAd];
  }

  return [
    primaryAd,
    {
      source: "google" as const,
      sourceAdId: `${sourceAdvertiserId}-fixture-ad-2`,
      fingerprint: `${sourceAdvertiserId}-fixture-ad-2`,
      title: "Fixture Google display ad",
      body: "Second deterministic Google creative returned on a later fetch.",
      payer: humanizeIdentifier(sourceAdvertiserId),
      format: "display",
      callToAction: "Get quote",
      destinationUrl: `https://example.com/${sourceAdvertiserId}/google-display`,
      mediaUrl: "https://images.example.com/google-fixture-1.png",
      status: "active",
      reactionCount: 0,
      commentCount: 0,
      firstSeenAt: now,
      lastSeenAt: now,
      metadata: {
        status: "fixture",
        sourceAdvertiserId,
        network: "google",
      },
    } satisfies NormalizedAd,
  ];
}

function buildAdvertiserMatch(record: GoogleAdvertiserRecord): AdvertiserMatch | null {
  const sourceAdvertiserId = cleanText(record["1"]);

  if (!sourceAdvertiserId || !isGoogleAdvertiserId(sourceAdvertiserId)) {
    return null;
  }

  const canonicalName = cleanText(record["2"]) ?? cleanText(record["9"]?.["1"]) ?? sourceAdvertiserId;
  const countryCode = cleanText(record["11"]) ?? cleanText(record["3"]);
  const verified = record["16"] ?? record["5"] ?? false;

  return {
    id: buildSourceScopedId("google", sourceAdvertiserId),
    source: "google",
    sourceAdvertiserId,
    canonicalName,
    profileUrl: buildGoogleProfileUrl(sourceAdvertiserId),
    country: getCountryLabel(countryCode),
    summary: verified ? "Verified Google Ads advertiser profile." : undefined,
  };
}

function buildGoogleAdvertiserMetadata(record?: GoogleAdvertiserRecord | null): GoogleAdvertiserMetadata {
  if (!record) {
    return {};
  }

  const countryCode = cleanText(record["11"]) ?? cleanText(record["3"]);
  const adCountBounds = record["4"]?.["2"];
  const metadata: GoogleAdvertiserMetadata = {
    googleAdvertiserName: cleanText(record["2"]) ?? cleanText(record["9"]?.["1"]),
    googleAdvertiserCountryCode: countryCode,
    googleAdvertiserCountry: getCountryLabel(countryCode),
    googleAdvertiserVerified: record["16"] ?? record["5"] ?? undefined,
    googleAdvertiserLegalName: cleanText(record["9"]?.["1"]),
    googleAdvertiserPaymentProfileName: cleanText(record["9"]?.["2"]),
    googleAdvertiserVerificationStatusCode: record["9"]?.["4"],
    googleAdvertiserServedRegionCodes: record["15"],
    googleAdvertiserAdCountLowerBound: cleanText(adCountBounds?.["1"]),
    googleAdvertiserAdCountUpperBound: cleanText(adCountBounds?.["2"]),
  };

  return Object.fromEntries(Object.entries(metadata).filter(([, value]) => value !== undefined)) as GoogleAdvertiserMetadata;
}

function buildAdvertiserMatchFromSuggestion(record: GoogleAdvertiserRecord): AdvertiserMatch | null {
  const sourceAdvertiserId = cleanText(record["2"]);

  if (!sourceAdvertiserId || !isGoogleAdvertiserId(sourceAdvertiserId)) {
    return null;
  }

  const canonicalName = cleanText(record["1"]) ?? sourceAdvertiserId;
  const countryCode = cleanText(record["3"]);
  const verified = record["5"] ?? false;

  return {
    id: buildSourceScopedId("google", sourceAdvertiserId),
    source: "google",
    sourceAdvertiserId,
    canonicalName,
    profileUrl: buildGoogleProfileUrl(sourceAdvertiserId),
    country: getCountryLabel(countryCode),
    summary: verified ? "Verified Google Ads advertiser profile." : undefined,
  };
}

function buildNormalizedCreative(record: GoogleCreativeRecord, advertiserRecord?: GoogleAdvertiserRecord | null): NormalizedAd | null {
  const sourceAdvertiserId = cleanText(record["1"]);
  const sourceAdId = cleanText(record["2"]);

  if (!sourceAdvertiserId || !sourceAdId) {
    return null;
  }

  const previewUrl = cleanText(record["3"]?.["1"]?.["4"]);
  const archivedImage = extractGoogleArchivedImagePreview(record);
  const firstSeenAt = parseGoogleTimestamp(record["6"]) ?? parseGoogleTimestamp(record["7"]) ?? new Date();
  const lastSeenAt = parseGoogleTimestamp(record["7"]) ?? firstSeenAt;
  const advertiserMetadata = buildGoogleAdvertiserMetadata(advertiserRecord);
  const isActive = record["16"] === true || record["3"]?.["5"] === true;

  return {
    source: "google",
    sourceAdId,
    fingerprint: buildSourceScopedId("google", `${sourceAdvertiserId}:${sourceAdId}`),
    payer: cleanText(record["12"]) ?? advertiserMetadata.googleAdvertiserName,
    format: mapGoogleCreativeFormat(record["4"], previewUrl, archivedImage?.url),
    mediaUrl: archivedImage?.url,
    status: isActive ? "active" : undefined,
    firstSeenAt,
    lastSeenAt,
    metadata: {
      ...advertiserMetadata,
      sourceAdvertiserId,
      network: "google",
      previewUrl,
      googleFormatCode: record["4"],
      topicCode: record["13"],
      sourceMediaUrl: archivedImage?.url,
      sourceThumbnailUrl: archivedImage?.url,
      googleArchivedImageHtml: archivedImage?.html,
      googleArchivedImageWidth: archivedImage?.width,
      googleArchivedImageHeight: archivedImage?.height,
      rawPayload: record,
    },
  };
}

async function fetchGoogleAdvertiserRecord(sourceAdvertiserId: string, options?: CreateGoogleAdapterOptions) {
  const response = await fetchGoogleRpc<GoogleAdvertiserLookupResponse>("LookupService/GetAdvertiserById", {
    1: sourceAdvertiserId,
    3: { 1: 1 },
  }, options);

  return response["1"] ?? null;
}

async function fetchGoogleRpc<TResponse>(
  rpcPath: string,
  payload: unknown,
  options?: CreateGoogleAdapterOptions,
): Promise<TResponse> {
  // WebScrapingAPI REST rejects this Google RPC POST target, so use the
  // generic proxy list when configured, then the authenticated WSA proxy.
  const url = `${googleRpcBaseUrl}/${rpcPath}?authuser=`;
  let response: Awaited<ReturnType<typeof fetchGoogleText>> | null = null;
  let lastError: unknown = null;
  const googleRpcProxyUrls = (options?.googleRpcProxyUrls ?? []).map((proxyUrl) => proxyUrl.trim()).filter(Boolean);
  const transport = googleRpcProxyUrls.length
    ? "via Google RPC proxy list"
    : options?.webScrapingApiProxy
      ? "via WebScrapingAPI"
      : "directly";
  if (!googleRpcProxyUrls.length && !options?.webScrapingApiProxy) {
    throw new Error("Google Ads Transparency proxy transport is not configured.");
  }

  const proxyStartIndex = googleRpcProxyUrls.length ? googleRpcProxyCursor % googleRpcProxyUrls.length : 0;
  const proxyAttempts = googleRpcProxyUrls.length
    ? [...googleRpcProxyUrls.slice(proxyStartIndex), ...googleRpcProxyUrls.slice(0, proxyStartIndex)]
    : [];
  const maxAttempts = proxyAttempts.length || googleRpcMaxAttempts;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const request = {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "x-same-domain": "1",
        origin: "https://adstransparency.google.com",
        referer: "https://adstransparency.google.com/",
      },
      body: new URLSearchParams({
        "f.req": JSON.stringify(payload),
      }),
      timeoutMs: googleRpcTimeoutMs,
    } as const;
    const proxyUrl = proxyAttempts[attempt - 1];

    try {
      response = proxyUrl
        ? {
            ...(await fetchTextViaHttpProxy(url, {
              ...request,
              proxy: proxyUrl,
            })),
            viaWebScrapingApi: false,
          }
        : options?.webScrapingApiProxy
          ? {
            ...(await fetchTextViaWebScrapingApiProxy(url, {
              ...request,
              proxy: options.webScrapingApiProxy,
            })),
            viaWebScrapingApi: true,
          }
          : await fetchGoogleText(url, request);
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts) {
        break;
      }

      if (!proxyAttempts.length) {
        const delayMs = googleRpcRetryDelayMs[attempt - 1] ?? googleRpcRetryDelayMs.at(-1) ?? 0;
        await sleep(delayMs);
      }
      continue;
    }

    if (response.ok && proxyAttempts.length) {
      googleRpcProxyCursor = (proxyStartIndex + attempt) % googleRpcProxyUrls.length;
    }

    if (!googleRpcRetryableStatuses.has(response.status) || attempt >= maxAttempts) {
      break;
    }

    if (!proxyAttempts.length) {
      const delayMs = googleRpcRetryDelayMs[attempt - 1] ?? googleRpcRetryDelayMs.at(-1) ?? 0;
      await sleep(delayMs);
    }
  }

  if (!response) {
    const message = lastError instanceof Error ? lastError.message : String(lastError ?? "unknown error");

    throw new Error(`Google Ads Transparency request ${transport} failed before receiving a response: ${message}`);
  }

  if (!response.ok) {
    const location = getResponseHeader(response.headers, "location");
    throw new Error(
      `Google Ads Transparency request ${transport} failed with ${response.status}${location ? ` (location: ${location})` : ""}.`,
    );
  }

  try {
    return JSON.parse(response.text) as TResponse;
  } catch {
    throw new Error("Google Ads Transparency returned an invalid response payload.");
  }
}

export class GoogleAdapter implements SourceAdapter {
  readonly source = "google" as const;

  constructor(private readonly options: CreateGoogleAdapterOptions = {}) {}

  async searchAdvertisers(query: string): Promise<AdvertiserMatch[]> {
    const term = query.trim();

    if (!term) {
      return [];
    }

    if (term.length < 2) {
      throw new AdvertiserSearchError("Enter at least 2 characters to search advertisers.", "invalid_query");
    }

    if (isE2eFixtureMode()) {
      return [buildFixtureProfile(term)];
    }

    const directAdvertiserId = parseGoogleAdvertiserIdentifier(term);

    try {
      if (directAdvertiserId) {
        const profile = await this.fetchAdvertiserProfile(directAdvertiserId);
        return profile ? [profile] : [];
      }

      const response = await fetchGoogleRpc<GoogleSearchSuggestionsResponse>("SearchService/SearchSuggestions", {
        1: term,
        2: googleDefaultSearchLimit,
        3: googleDefaultSearchLimit,
        4: [googleUkRegionCode],
        5: { 1: 1 },
      }, this.options);

      const seenAdvertiserIds = new Set<string>();
      const results: AdvertiserMatch[] = [];

      for (const item of response["1"] ?? []) {
        if (!item["1"]) {
          continue;
        }

        const match = buildAdvertiserMatchFromSuggestion(item["1"]);

        if (!match || seenAdvertiserIds.has(match.sourceAdvertiserId)) {
          continue;
        }

        seenAdvertiserIds.add(match.sourceAdvertiserId);
        results.push(match);
      }

      return results;
    } catch (error) {
      if (error instanceof AdvertiserSearchError) {
        throw error;
      }

      throw new AdvertiserSearchError(
        error instanceof Error ? error.message : "Google advertiser search is temporarily unavailable.",
        "unavailable",
      );
    }
  }

  async fetchAdvertiserProfile(sourceAdvertiserId: string) {
    const normalizedId = normalizeGoogleAdvertiserId(sourceAdvertiserId);

    if (!isGoogleAdvertiserId(normalizedId)) {
      return null;
    }

    const record = await fetchGoogleAdvertiserRecord(normalizedId, this.options);

    return record ? buildAdvertiserMatch(record) : null;
  }

  async fetchAdvertiserAds(sourceAdvertiserId: string, options?: FetchAdvertiserAdsOptions): Promise<NormalizedAd[]> {
    if (isE2eFixtureMode()) {
      return buildFixtureAds(slugifyGoogleFixtureId(sourceAdvertiserId) || "fixture-google");
    }

    const normalizedId = normalizeGoogleAdvertiserId(sourceAdvertiserId);

    if (!isGoogleAdvertiserId(normalizedId)) {
      return [];
    }

    const [advertiserRecord, response] = await Promise.all([
      fetchGoogleAdvertiserRecord(normalizedId, this.options).catch(() => null),
      fetchGoogleRpc<GoogleCreativeSearchResponse>("SearchService/SearchCreatives", {
        2: clampCreativeResultLimit(options?.maxResults),
        3: {
          8: [googleUkRegionCode],
          12: { 1: "", 2: true },
          13: { 1: [normalizedId] },
        },
        7: { 1: 1, 2: 0, 3: googleUkRegionCode },
      }, this.options),
    ]);

    const ads = (response["1"] ?? [])
      .map((record) => buildNormalizedCreative(record, advertiserRecord))
      .filter((ad): ad is NormalizedAd => Boolean(ad))
      .filter((ad) => overlapsWindow(ad.firstSeenAt, ad.lastSeenAt, options));
    const targetSourceAdIds = new Set(options?.sourceAdIds?.map((sourceAdId) => sourceAdId.trim()).filter(Boolean));
    const filteredAds = targetSourceAdIds.size
      ? ads.filter((ad) => ad.sourceAdId && targetSourceAdIds.has(ad.sourceAdId))
      : ads;

    return enrichGoogleCreatives(filteredAds, this.options);
  }

  async fetchLandingPage(url: string) {
    return fetchLandingPageSnapshot(url);
  }
}

export function createGoogleAdapter(options?: CreateGoogleAdapterOptions) {
  return new GoogleAdapter(options);
}
