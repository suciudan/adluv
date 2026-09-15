import { findAuthUserByEmail, findAuthUserByUsername, getAuthUserById } from "@adluv/auth";
import { supportedSourceNames, getAppHref, getSourceLabel, type SupportedSourceName } from "@adluv/config";
import {
  getAdvertiserDirectoryDetail,
  ensureDefaultWorkspaceForUser,
  listActivityFeed,
  listPendingTrackedCompanies,
  listWorkspacesForUser,
  listWatchlistEntries,
  getWorkspaceForUserBySlug,
  searchAdvertisers,
  searchAdvertisersForUser,
  searchAppShell,
  type AdvertiserDirectoryDetail,
  type McpAuthRecord,
  type WatchlistEntry,
  type WorkspaceSummary,
} from "@adluv/db";
import { createSourceAdapter, loadGoogleRpcProxyUrlsFromEnvAsync, loadMetaProxyUrlsFromEnvAsync } from "@adluv/source-adapters";

import { formatTimeframe, resolveTimeframe, timeframePresetValues, type ResolvedTimeframe, type TimeframeInput } from "./timeframes";
const supportedSources = [...supportedSourceNames];

function getWebScrapingApiProxyOptions() {
  const username = process.env.WEBSCRAPINGAPI_PROXY_USERNAME?.trim();
  const password = process.env.WEBSCRAPINGAPI_PROXY_PASSWORD?.trim();
  const url = process.env.WEBSCRAPINGAPI_PROXY_URL?.trim();

  if (!url) {
    return undefined;
  }

  return username && password ? { username, password, url } : { url };
}

const stopwords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "into",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "with",
  "your",
  "you",
  "our",
]);

type JsonSchema = Record<string, unknown>;

type McpToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export type ToolContext = {
  auth: McpAuthRecord;
};

type ToolHandler = (args: Record<string, unknown>, context: ToolContext) => Promise<McpToolResponse>;

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  handler: ToolHandler;
};

type ViewerProfile = {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
};

async function resolveWorkspace(workspaceReference: unknown, viewer: ViewerProfile) {
  const workspaceValue = readOptionalString(workspaceReference);

  if (!workspaceValue) {
    return ensureDefaultWorkspaceForUser(viewer.id);
  }

  const workspaces = await listWorkspacesForUser(viewer.id);
  const byId = workspaces.find((workspace) => workspace.id === workspaceValue);

  if (byId) {
    return byId;
  }

  const bySlug = await getWorkspaceForUserBySlug(viewer.id, workspaceValue);

  if (!bySlug) {
    throw new Error("The requested workspace could not be resolved for this MCP user.");
  }

  return bySlug;
}

function getWorkspaceAppHref(workspace: WorkspaceSummary, href: string) {
  const normalizedHref = href.startsWith("/") ? href : `/${href}`;
  return getAppHref(`/w/${workspace.slug}${normalizedHref}`);
}

type AdvertiserSearchRecord = {
  id: string;
  source: SupportedSourceName;
  sourceAdvertiserId: string;
  canonicalName: string;
  profileUrl: string | null;
  logoUrl: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  summary: string | null;
  trackedCompanyId: string | null;
  trackedStatus: string | null;
  score: number;
  resolutionReason: string[];
  adluvAdvertiserUrl: string;
};

type WindowedAd = AdvertiserDirectoryDetail["ads"][number] & {
  durationDays: number;
  hook: string | null;
  adluvAdUrl: string;
};

type WindowedLandingPage = {
  url: string;
  title: string | null;
  count: number;
  activeAdsCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  screenshotUrl: string | null;
  status: "active" | "inactive";
  adIds: string[];
  alternateTitles: string[];
};

function getViewerProfileFromAuth(auth: McpAuthRecord): ViewerProfile {
  return {
    id: auth.userId,
    email: auth.userEmail,
    username: auth.userUsername,
    name: auth.userName,
  };
}

function requireString(value: unknown, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Expected a non-empty string for ${field}.`);
  }

  return value.trim();
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNullableStringRecordField(record: unknown, key: string) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return null;
  }

  const value = (record as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function readOptionalNumber(value: unknown, fallback: number, options?: { min?: number; max?: number }) {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Expected a number.");
  }

  if (options?.min != null && value < options.min) {
    throw new Error(`Expected a number greater than or equal to ${options.min}.`);
  }

  if (options?.max != null && value > options.max) {
    throw new Error(`Expected a number less than or equal to ${options.max}.`);
  }

  return Math.trunc(value);
}

function readBoolean(value: unknown, fallback = false) {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "boolean") {
    throw new Error("Expected a boolean.");
  }

  return value;
}

async function fetchMediaDataUri(url: string | null | undefined, maxBytes = 1_500_000) {
  if (!url) {
    return null;
  }

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";
    const contentLength = Number(response.headers.get("content-length") ?? 0);

    if (contentLength > maxBytes) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > maxBytes) {
      return null;
    }

    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

function readSources(value: unknown) {
  if (value == null) {
    return supportedSources;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("Expected sources to be a non-empty array.");
  }

  const sources = value.map((item) => {
    if (typeof item !== "string" || !supportedSources.includes(item as SupportedSourceName)) {
      throw new Error(`Unsupported source: ${String(item)}`);
    }

    return item as SupportedSourceName;
  });

  return Array.from(new Set(sources));
}

function readTimeframe(value: unknown) {
  if (value == null) {
    return resolveTimeframe();
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected timeframe to be an object.");
  }

  const input = value as Record<string, unknown>;
  const preset = readOptionalString(input.preset) as TimeframeInput["preset"] | undefined;

  if (preset && !timeframePresetValues.includes(preset)) {
    throw new Error(`Unsupported timeframe preset: ${preset}`);
  }

  return resolveTimeframe({
    preset,
    since: readOptionalString(input.since),
    until: readOptionalString(input.until),
  });
}

function overlapWindow(firstSeenAt: Date, lastSeenAt: Date, window: ResolvedTimeframe) {
  const startsBeforeEnd = !window.end || firstSeenAt.getTime() <= window.end.getTime();
  const endsAfterStart = !window.start || lastSeenAt.getTime() >= window.start.getTime();
  return startsBeforeEnd && endsAfterStart;
}

function withinWindow(date: Date, window: ResolvedTimeframe) {
  const afterStart = !window.start || date.getTime() >= window.start.getTime();
  const beforeEnd = !window.end || date.getTime() <= window.end.getTime();
  return afterStart && beforeEnd;
}

function getDurationDays(firstSeenAt: Date, lastSeenAt: Date) {
  const diff = Math.max(0, lastSeenAt.getTime() - firstSeenAt.getTime());
  return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

function extractHook(title: string | null, body: string | null) {
  const source = title?.trim() || body?.trim();

  if (!source) {
    return null;
  }

  const firstSentence = source.split(/[.!?]\s|\n/)[0]?.trim();
  if (!firstSentence) {
    return null;
  }

  const words = firstSentence.split(/\s+/).slice(0, 12);
  return words.join(" ").trim() || null;
}

function normalizeToken(token: string) {
  return token
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenizeText(text: string, ignoredWords: string[]) {
  const extraIgnored = new Set(ignoredWords.flatMap((word) => normalizeToken(word).split(/\s+/).filter(Boolean)));

  return normalizeToken(text)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !stopwords.has(token) && !extraIgnored.has(token));
}

function buildBreakdown(values: Array<string | null | undefined>, limit = 6) {
  return Array.from(
    values.reduce((acc, value) => {
      const label = value?.trim() || "Unknown";
      acc.set(label, (acc.get(label) ?? 0) + 1);
      return acc;
    }, new Map<string, number>()),
  )
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function extractRecurringPhrases(
  ads: Array<{ id: string; title: string | null; body: string | null }>,
  advertiserName: string,
  limit = 5,
) {
  const phraseToAdIds = new Map<string, Set<string>>();

  for (const ad of ads) {
    const combined = [ad.title, ad.body].filter(Boolean).join(" ").trim();
    if (!combined) {
      continue;
    }

    const tokens = tokenizeText(combined, [advertiserName]);
    const seenForAd = new Set<string>();

    for (let size = 3; size >= 1; size -= 1) {
      for (let index = 0; index <= tokens.length - size; index += 1) {
        const phrase = tokens.slice(index, index + size).join(" ");
        if (phrase.length < 4 || seenForAd.has(phrase)) {
          continue;
        }

        seenForAd.add(phrase);
        let ids = phraseToAdIds.get(phrase);
        if (!ids) {
          ids = new Set<string>();
          phraseToAdIds.set(phrase, ids);
        }
        ids.add(ad.id);
      }
    }
  }

  return Array.from(phraseToAdIds.entries())
    .map(([phrase, adIds]) => ({
      phrase,
      adIds: [...adIds],
      count: adIds.size,
      score: adIds.size * Math.max(1, phrase.split(" ").length),
    }))
    .filter((item) => item.count >= 2)
    .sort((left, right) => right.score - left.score || left.phrase.localeCompare(right.phrase))
    .slice(0, limit)
    .map(({ score: _score, ...item }) => item);
}

function getViewerId(viewer: ViewerProfile) {
  return viewer.id;
}

async function resolveViewer(viewerReference: unknown, context: ToolContext) {
  const viewer = readOptionalString(viewerReference);
  const authorizedViewer = getViewerProfileFromAuth(context.auth);

  if (!viewer) {
    return authorizedViewer;
  }

  const byId = await getAuthUserById(viewer);
  const resolvedViewer = byId
    ? {
        id: byId.id,
        email: byId.email,
        username: byId.username,
        name: byId.name,
      }
    : viewer.includes("@")
      ? await findAuthUserByEmail(viewer)
      : await findAuthUserByUsername(viewer);

  if (!resolvedViewer) {
    throw new Error("The requested viewer could not be resolved.");
  }

  if (resolvedViewer.id !== context.auth.userId) {
    throw new Error("Authenticated MCP sessions can only access data for their own AdLuv user.");
  }

  return {
    id: resolvedViewer.id,
    email: resolvedViewer.email,
    username: resolvedViewer.username,
    name: resolvedViewer.name,
  } satisfies ViewerProfile;
}

function scoreAdvertiserMatch(query: string, match: {
  id: string;
  canonicalName: string;
  sourceAdvertiserId: string;
  profileUrl: string | null;
  trackedCompanyId?: string | null;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedName = match.canonicalName.trim().toLowerCase();
  const normalizedSourceId = match.sourceAdvertiserId.trim().toLowerCase();
  const reasons: string[] = [];
  let score = 0;

  if (match.id === query) {
    score += 120;
    reasons.push("exact advertiser id");
  }

  if (normalizedName === normalizedQuery) {
    score += 100;
    reasons.push("exact canonical name");
  } else if (normalizedName.startsWith(normalizedQuery)) {
    score += 70;
    reasons.push("canonical name prefix");
  } else if (normalizedName.includes(normalizedQuery)) {
    score += 45;
    reasons.push("canonical name contains query");
  }

  if (normalizedSourceId === normalizedQuery) {
    score += 95;
    reasons.push("exact source advertiser id");
  } else if (normalizedSourceId.includes(normalizedQuery)) {
    score += 35;
    reasons.push("source advertiser id contains query");
  }

  if (match.profileUrl?.toLowerCase().includes(normalizedQuery)) {
    score += 25;
    reasons.push("profile URL contains query");
  }

  if (match.trackedCompanyId) {
    score += 5;
    reasons.push("already tracked");
  }

  return {
    score,
    reasons,
  };
}

async function searchIndexedAdvertisers(input: {
  query: string;
  sources: SupportedSourceName[];
  viewer: ViewerProfile | null;
  workspace?: WorkspaceSummary | null;
  limit: number;
}) {
  const viewerId = input.viewer?.id;

  const results = await Promise.all(
    input.sources.map(async (source) => {
      const matches = viewerId
        ? await searchAdvertisersForUser({
            userId: viewerId,
            workspaceId: input.workspace?.id,
            source,
            query: input.query,
            limit: input.limit,
          })
        : await searchAdvertisers({ source, query: input.query, limit: input.limit });

      return matches.map((match) => {
        const { score, reasons } = scoreAdvertiserMatch(input.query, match);

        return {
          ...match,
          source,
          trackedCompanyId: readNullableStringRecordField(match, "trackedCompanyId"),
          trackedStatus: readNullableStringRecordField(match, "trackedStatus"),
          score,
          resolutionReason: reasons,
          adluvAdvertiserUrl: input.workspace
            ? getWorkspaceAppHref(input.workspace, `/advertisers/${match.id}/overview`)
            : getAppHref(`/advertisers/${match.id}/overview`),
        } satisfies AdvertiserSearchRecord;
      });
    }),
  );

  return results.flat().sort((left, right) => right.score - left.score || left.canonicalName.localeCompare(right.canonicalName));
}

async function searchLiveAdvertisers(input: { query: string; sources: SupportedSourceName[]; limit: number }) {
  const liveResults = await Promise.all(
    input.sources.map(async (source) => {
      try {
        const [googleRpcProxyUrls, metaProxyUrls] = await Promise.all([
          loadGoogleRpcProxyUrlsFromEnvAsync(),
          loadMetaProxyUrlsFromEnvAsync(),
        ]);
        const matches = await createSourceAdapter(source, {
          googleRpcProxyUrls,
          metaProxyUrls,
          webScrapingApiProxy: getWebScrapingApiProxyOptions(),
          webScrapingApiKey: process.env.WEBSCRAPINGAPI_API_KEY?.trim() || undefined,
        }).searchAdvertisers(input.query);
        return matches.slice(0, input.limit).map((match) => ({
          id: match.id,
          source: source,
          sourceAdvertiserId: match.sourceAdvertiserId,
          canonicalName: match.canonicalName,
          profileUrl: match.profileUrl ?? null,
          logoUrl: match.logoUrl ?? null,
          industry: match.industry ?? null,
          companySize: match.companySize ?? null,
          country: match.country ?? null,
          summary: match.summary ?? null,
          trackedCompanyId: null,
          trackedStatus: null,
          score: scoreAdvertiserMatch(input.query, {
            id: match.id,
            canonicalName: match.canonicalName,
            sourceAdvertiserId: match.sourceAdvertiserId,
            profileUrl: match.profileUrl ?? null,
          }).score,
          resolutionReason: ["live source search"],
          adluvAdvertiserUrl: "",
        })) satisfies AdvertiserSearchRecord[];
      } catch (error) {
        return [
          {
            id: `live-error:${source}`,
            source,
            sourceAdvertiserId: "",
            canonicalName: `Live lookup failed on ${getSourceLabel(source)}`,
            profileUrl: null,
            logoUrl: null,
            industry: null,
            companySize: null,
            country: null,
            summary: error instanceof Error ? error.message : "Unknown live lookup failure.",
            trackedCompanyId: null,
            trackedStatus: null,
            score: -1,
            resolutionReason: ["live source search failed"],
            adluvAdvertiserUrl: "",
          },
        ];
      }
    }),
  );

  return liveResults.flat();
}

async function resolveAdvertiserDetails(input: {
  advertiser?: string;
  advertiserId?: string;
  sources: SupportedSourceName[];
  viewer: ViewerProfile;
  workspace: WorkspaceSummary;
  limitPerSource?: number;
}) {
  const viewerId = getViewerId(input.viewer);
  const resolved = new Map<
    string,
    {
      detail: AdvertiserDirectoryDetail;
      match: AdvertiserSearchRecord;
    }
  >();

  if (input.advertiserId) {
    const detail = await getAdvertiserDirectoryDetail(viewerId, input.advertiserId, input.workspace.id);
    const primarySource = detail
      ? detail.sources.find((source) => input.sources.includes(source as SupportedSourceName)) ?? detail.sources[0]
      : undefined;
    const primarySourceIndex = primarySource ? detail?.sources.findIndex((source) => source === primarySource) ?? -1 : -1;

    if (detail && primarySource) {
      resolved.set(detail.id, {
        detail,
        match: {
          id: detail.id,
          source: primarySource as SupportedSourceName,
          sourceAdvertiserId:
            detail.sourceAdvertiserIds[primarySourceIndex] ??
            detail.sourceAdvertiserIds[0] ??
            detail.primaryAdvertiserId,
          canonicalName: detail.canonicalName,
          profileUrl: detail.profileUrl,
          logoUrl: detail.logoUrl,
          industry: detail.industry,
          companySize: detail.companySize,
          country: detail.country,
          summary: detail.summary,
          trackedCompanyId: detail.trackedCompanyId,
          trackedStatus: detail.trackedStatus,
          score: 120,
          resolutionReason: ["explicit advertiserId"],
          adluvAdvertiserUrl: getWorkspaceAppHref(input.workspace, `/advertisers/${detail.id}/overview`),
        },
      });
    }
  }

  if (!input.advertiser) {
    return [...resolved.values()];
  }

  const matches = await searchIndexedAdvertisers({
    query: input.advertiser,
    sources: input.sources,
    viewer: input.viewer,
    workspace: input.workspace,
    limit: input.limitPerSource ?? 6,
  });

  for (const source of input.sources) {
    const best = matches.find((match) => match.source === source && match.score > 0);

    if (!best || resolved.has(best.id)) {
      continue;
    }

    const detail = await getAdvertiserDirectoryDetail(viewerId, best.id, input.workspace.id);
    if (detail) {
      resolved.set(best.id, {
        detail,
        match: best,
      });
    }
  }

  return [...resolved.values()];
}

function windowAds(detail: AdvertiserDirectoryDetail, window: ResolvedTimeframe, workspace: WorkspaceSummary) {
  return detail.ads
    .filter((ad) => overlapWindow(ad.firstSeenAt, ad.lastSeenAt, window))
    .map((ad) => ({
      ...ad,
      durationDays: getDurationDays(ad.firstSeenAt, ad.lastSeenAt),
      hook: extractHook(ad.title, ad.body),
      adluvAdUrl: getWorkspaceAppHref(workspace, `/ads/${ad.id}`),
    }))
    .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime());
}

function summarizeLandingPages(ads: WindowedAd[]): WindowedLandingPage[] {
  return Array.from(
    ads.reduce((acc, ad) => {
      const key = ad.snapshotUrl ?? ad.destinationUrl;

      if (!key) {
        return acc;
      }

      const existing = acc.get(key);
      if (existing) {
        existing.count += 1;
        existing.activeAdsCount += ad.status?.toLowerCase() === "active" ? 1 : 0;
        existing.firstSeenAt = ad.firstSeenAt < existing.firstSeenAt ? ad.firstSeenAt : existing.firstSeenAt;
        existing.lastSeenAt = ad.lastSeenAt > existing.lastSeenAt ? ad.lastSeenAt : existing.lastSeenAt;
        if (ad.snapshotTitle && !existing.alternateTitles.includes(ad.snapshotTitle)) {
          existing.alternateTitles.push(ad.snapshotTitle);
        }
        if (!existing.title && ad.snapshotTitle) {
          existing.title = ad.snapshotTitle;
        }
        if (!existing.screenshotUrl && ad.mediaUrl) {
          existing.screenshotUrl = ad.mediaUrl;
        }
        existing.adIds.push(ad.id);
        return acc;
      }

      acc.set(key, {
        url: key,
        title: ad.snapshotTitle ?? ad.title,
        count: 1,
        activeAdsCount: ad.status?.toLowerCase() === "active" ? 1 : 0,
        firstSeenAt: ad.firstSeenAt,
        lastSeenAt: ad.lastSeenAt,
        screenshotUrl: ad.mediaUrl,
        status: ad.status?.toLowerCase() === "active" ? ("active" as const) : ("inactive" as const),
        adIds: [ad.id],
        alternateTitles: ad.snapshotTitle ? [ad.snapshotTitle] : [],
      });
      return acc;
    }, new Map<string, WindowedLandingPage>()),
  )
    .map(([, page]) => ({
      ...page,
      status: page.activeAdsCount > 0 ? ("active" as const) : ("inactive" as const),
    }))
    .sort((left, right) => right.count - left.count || left.url.localeCompare(right.url));
}

function buildAdvertiserWindowSummary(
  detail: AdvertiserDirectoryDetail,
  window: ResolvedTimeframe,
  workspace: WorkspaceSummary,
) {
  const ads = windowAds(detail, window, workspace);
  const activeAds = ads.filter((ad) => ad.status?.toLowerCase() === "active");
  const newCreatives = ads.filter((ad) => withinWindow(ad.firstSeenAt, window));
  const landingPages = summarizeLandingPages(ads);
  const longestRunningAds = [...ads]
    .sort((left, right) => right.durationDays - left.durationDays || right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
    .slice(0, 10);
  const topRunningAd = longestRunningAds[0] ?? null;
  const topRunningJourney = topRunningAd
    ? {
        adId: topRunningAd.id,
        adTitle: topRunningAd.title,
        hook: topRunningAd.hook,
        durationDays: topRunningAd.durationDays,
        status: topRunningAd.status,
        format: topRunningAd.format,
        callToAction: topRunningAd.callToAction,
        destinationUrl: topRunningAd.destinationUrl,
        snapshotUrl: topRunningAd.snapshotUrl,
        mediaUrl: topRunningAd.mediaUrl ?? topRunningAd.posterUrl ?? topRunningAd.videoUrl,
        adluvAdUrl: topRunningAd.adluvAdUrl,
      }
    : null;

  return {
    detail,
    ads,
    activeAds,
    newCreatives,
    longestRunningAds,
    landingPages,
    formatBreakdown: buildBreakdown(ads.map((ad) => ad.format)),
    ctaBreakdown: buildBreakdown(ads.map((ad) => ad.callToAction)),
    hookBreakdown: buildBreakdown(ads.map((ad) => ad.hook)),
    landingPageChangeSignals: {
      uniqueLandingPages: landingPages.length,
      distinctTitles: Array.from(new Set(landingPages.flatMap((page) => page.alternateTitles))).length,
      hasLikelyTestOrChange:
        landingPages.filter((page) => page.activeAdsCount > 0).length > 1 ||
        Array.from(new Set(landingPages.flatMap((page) => page.alternateTitles))).length > 1,
    },
    topRunningJourney,
  };
}

function buildCreativeObservations(
  summary: ReturnType<typeof buildAdvertiserWindowSummary> & { match: AdvertiserSearchRecord },
) {
  const observations: Array<{ source: SupportedSourceName; text: string; supportingAdIds: string[] }> = [];
  const topFormat = summary.formatBreakdown[0];
  const topCta = summary.ctaBreakdown[0];
  const recurringPhrases = extractRecurringPhrases(summary.ads, summary.detail.canonicalName, 3);

  if (topFormat && topFormat.count >= 2) {
    observations.push({
      source: summary.match.source,
      text: `${getSourceLabel(summary.match.source)} leans on ${topFormat.label} creatives (${topFormat.count}/${summary.ads.length} in-window ads).`,
      supportingAdIds: summary.ads.filter((ad) => (ad.format?.trim() || "Unknown") === topFormat.label).slice(0, 4).map((ad) => ad.id),
    });
  }

  if (topCta && topCta.label !== "Unknown" && topCta.count >= 2) {
    observations.push({
      source: summary.match.source,
      text: `${getSourceLabel(summary.match.source)} repeats the ${topCta.label} CTA across ${topCta.count} creatives.`,
      supportingAdIds: summary.ads
        .filter((ad) => (ad.callToAction?.trim() || "Unknown") === topCta.label)
        .slice(0, 4)
        .map((ad) => ad.id),
    });
  }

  for (const phrase of recurringPhrases.slice(0, 2)) {
    observations.push({
      source: summary.match.source,
      text: `${getSourceLabel(summary.match.source)} repeats the phrase "${phrase.phrase}" across ${phrase.count} creatives.`,
      supportingAdIds: phrase.adIds,
    });
  }

  return observations.slice(0, 4);
}

function buildConfidence(resolvedCount: number, requestedSourceCount: number, bestScore: number | null) {
  if (resolvedCount === 0) {
    return "low";
  }

  if (resolvedCount === requestedSourceCount && (bestScore ?? 0) >= 90) {
    return "high";
  }

  return "medium";
}

function formatAdvertiserReference(detail: AdvertiserDirectoryDetail) {
  return `${detail.canonicalName} on ${detail.sources.map((source) => getSourceLabel(source)).join(" + ")}`;
}

function toIsoString(value: Date | string | number | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function mapWatchlistEntry(entry: WatchlistEntry, workspace: WorkspaceSummary) {
  return {
    trackedCompanyId: entry.trackedCompanyId,
    trackedCompanyIds: entry.trackedCompanyIds,
    advertiserId: entry.advertiserId,
    advertiserName: entry.advertiserName,
    source: entry.sources[0] ?? null,
    sources: entry.sources,
    status: entry.status,
    totalAds: entry.totalAds,
    activeAds: entry.activeAds,
    lastSeenAt: toIsoString(entry.lastSeenAt),
    lastSyncedAt: toIsoString(entry.lastSyncedAt),
    latestCreativeTitle: entry.latestCreativeTitle,
    latestDestinationUrl: entry.latestDestinationUrl,
    advertiserProfileUrl: entry.profileUrl,
    adluvAdvertiserUrl: getWorkspaceAppHref(workspace, `/advertisers/${entry.advertiserId}/overview`),
  };
}

export function buildToolResponse(text: string, structuredContent?: Record<string, unknown>): McpToolResponse {
  const responseText = structuredContent
    ? `${text}\n\nStructured data:\n${JSON.stringify(structuredContent, null, 2)}`
    : text;

  return {
    content: [{ type: "text", text: responseText }],
    structuredContent,
  };
}

function textResponse(text: string, structuredContent?: Record<string, unknown>): McpToolResponse {
  return buildToolResponse(text, structuredContent);
}

async function handleSearchAdvertisers(args: Record<string, unknown>, context: ToolContext) {
  const query = requireString(args.query, "query");
  const sources = readSources(args.sources);
  const limit = readOptionalNumber(args.limit, 8, { min: 1, max: 25 });
  const liveFallback = readBoolean(args.liveFallback, false);
  const viewer = await resolveViewer(args.viewer, context);
  const workspace = await resolveWorkspace(args.workspace, viewer);

  const indexedMatches = await searchIndexedAdvertisers({
    query,
    sources,
    viewer,
    workspace,
    limit,
  });

  const liveMatches = liveFallback && indexedMatches.length === 0
    ? await searchLiveAdvertisers({ query, sources, limit })
    : [];

  const matches = [...indexedMatches, ...liveMatches]
    .filter((match) => match.score >= 0)
    .slice(0, limit * sources.length);

  return textResponse(
    matches.length
      ? `Found ${matches.length} advertiser matches for "${query}" across ${sources.map(getSourceLabel).join(", ")}.`
      : `No indexed advertiser matches found for "${query}".`,
    {
      query,
      sources,
      viewer: viewer
        ? {
            id: viewer.id,
            email: viewer.email,
            username: viewer.username,
          }
        : null,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
      matches,
    },
  );
}

async function handleSearchLibrary(args: Record<string, unknown>, context: ToolContext) {
  const query = requireString(args.query, "query");
  const viewer = await resolveViewer(args.viewer, context);
  const workspace = await resolveWorkspace(args.workspace, viewer);
  const result = await searchAppShell(query);

  return textResponse(`Search completed for "${query}".`, {
    query,
    ads: result.ads.map((ad) => ({
      ...ad,
      adluvAdUrl: getWorkspaceAppHref(workspace, `/ads/${ad.id}`),
      adluvAdvertiserUrl: getWorkspaceAppHref(workspace, `/advertisers/${ad.advertiserId}/overview`),
    })),
    advertisers: result.advertisers.map((advertiser) => ({
      ...advertiser,
      adluvAdvertiserUrl: getWorkspaceAppHref(workspace, `/advertisers/${advertiser.id}/overview`),
    })),
    landingPages: result.landingPages.map((landingPage) => ({
      ...landingPage,
      adluvAdvertiserLandingPagesUrl: getWorkspaceAppHref(workspace, `/advertisers/${landingPage.advertiserId}/landing-pages`),
    })),
  });
}

async function handleGetAdvertiserIntelligence(args: Record<string, unknown>, context: ToolContext) {
  const advertiser = readOptionalString(args.advertiser);
  const advertiserId = readOptionalString(args.advertiserId);

  if (!advertiser && !advertiserId) {
    throw new Error("Provide either advertiser or advertiserId.");
  }

  const sources = readSources(args.sources);
  const viewer = await resolveViewer(args.viewer, context);
  const workspace = await resolveWorkspace(args.workspace, viewer);
  const window = readTimeframe(args.timeframe);
  const includeAdsLimit = readOptionalNumber(args.includeAdsLimit, 10, { min: 1, max: 50 });
  const resolved = await resolveAdvertiserDetails({
    advertiser,
    advertiserId,
    sources,
    viewer,
    workspace,
  });

  if (resolved.length === 0) {
    const candidates = advertiser
      ? await searchIndexedAdvertisers({
          query: advertiser,
          sources,
          viewer,
          workspace,
          limit: 5,
        })
      : [];

    return textResponse("No indexed advertiser record could be resolved for this request.", {
      advertiser: advertiser ?? null,
      advertiserId: advertiserId ?? null,
      timeWindow: formatTimeframe(window),
      candidates,
      confidence: "low",
    });
  }

  const summaries = resolved.map(({ detail, match }) => ({
    match,
    ...buildAdvertiserWindowSummary(detail, window, workspace),
  }));

  const combinedAds = summaries.flatMap((summary) => summary.ads);
  const combinedLandingPages = summarizeLandingPages(combinedAds);
  const longestRunningAds = [...combinedAds]
    .sort((left, right) => right.durationDays - left.durationDays || right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
    .slice(0, includeAdsLimit);
  const newestCreatives = [...combinedAds]
    .sort((left, right) => right.firstSeenAt.getTime() - left.firstSeenAt.getTime())
    .slice(0, includeAdsLimit);
  const sourceIntensityByActiveAds = summaries
    .map((summary) => ({
      source: summary.match.source,
      sourceLabel: getSourceLabel(summary.match.source),
      activeAds: summary.activeAds.length,
      adsInWindow: summary.ads.length,
    }))
    .sort((left, right) => right.activeAds - left.activeAds || right.adsInWindow - left.adsInWindow);

  const response = {
    advertiser: advertiser ?? null,
    advertiserId: advertiserId ?? null,
    viewer: viewer
      ? {
          id: viewer.id,
          email: viewer.email,
          username: viewer.username,
        }
      : null,
    timeWindow: formatTimeframe(window),
    confidence: buildConfidence(resolved.length, sources.length, Math.max(...resolved.map((item) => item.match.score))),
    totals: {
      resolvedSources: summaries.length,
      adsInWindow: combinedAds.length,
      activeAdsInWindow: combinedAds.filter((ad) => ad.status?.toLowerCase() === "active").length,
      newCreativesInWindow: combinedAds.filter((ad) => withinWindow(ad.firstSeenAt, window)).length,
      landingPagesInWindow: combinedLandingPages.length,
    },
    sourceIntensityByActiveAds,
    advertisers: summaries.map((summary) => ({
      advertiserId: summary.detail.id,
      source: summary.match.source,
      sourceLabel: getSourceLabel(summary.match.source),
      sources: summary.detail.sources,
      canonicalName: summary.detail.canonicalName,
      sourceAdvertiserId: summary.match.sourceAdvertiserId,
      sourceAdvertiserIds: summary.detail.sourceAdvertiserIds,
      profileUrl: summary.detail.profileUrl,
      logoUrl: summary.detail.logoUrl,
      industry: summary.detail.industry,
      companySize: summary.detail.companySize,
      country: summary.detail.country,
      summary: summary.detail.summary,
      adluvAdvertiserUrl: getWorkspaceAppHref(workspace, `/advertisers/${summary.detail.id}/overview`),
      adsInWindow: summary.ads.length,
      activeAdsInWindow: summary.activeAds.length,
      newCreativesInWindow: summary.newCreatives.length,
      formatBreakdown: summary.formatBreakdown,
      ctaBreakdown: summary.ctaBreakdown,
      hookBreakdown: summary.hookBreakdown,
      landingPageChangeSignals: summary.landingPageChangeSignals,
      topRunningJourney: summary.topRunningJourney,
      longestRunningAds: summary.longestRunningAds.slice(0, includeAdsLimit),
      newestCreatives: summary.newCreatives
        .slice()
        .sort((left, right) => right.firstSeenAt.getTime() - left.firstSeenAt.getTime())
        .slice(0, includeAdsLimit),
      landingPages: summary.landingPages.slice(0, includeAdsLimit),
    })),
    longestRunningAds,
    newestCreatives,
    combinedFormatBreakdown: buildBreakdown(combinedAds.map((ad) => ad.format)),
    combinedCtaBreakdown: buildBreakdown(combinedAds.map((ad) => ad.callToAction)),
    landingPages: combinedLandingPages.slice(0, includeAdsLimit),
  };

  return textResponse(
    `Advertiser intelligence data for ${advertiser ?? advertiserId}: ${summaries.length} resolved advertiser record${summaries.length === 1 ? "" : "s"}, ${combinedAds.length} ads in the requested window.`,
    response,
  );
}

async function handleAnalyzeAdvertiserCreatives(args: Record<string, unknown>, context: ToolContext) {
  const advertiser = readOptionalString(args.advertiser);
  const advertiserId = readOptionalString(args.advertiserId);

  if (!advertiser && !advertiserId) {
    throw new Error("Provide either advertiser or advertiserId.");
  }

  const sources = readSources(args.sources);
  const viewer = await resolveViewer(args.viewer, context);
  const workspace = await resolveWorkspace(args.workspace, viewer);
  const window = readTimeframe(args.timeframe);
  const representativeAdsLimit = readOptionalNumber(args.representativeAdsLimit, 8, { min: 1, max: 25 });
  const resolved = await resolveAdvertiserDetails({
    advertiser,
    advertiserId,
    sources,
    viewer,
    workspace,
  });

  if (resolved.length === 0) {
    return textResponse("No indexed advertiser record could be resolved for creative analysis.", {
      advertiser: advertiser ?? null,
      advertiserId: advertiserId ?? null,
      timeWindow: formatTimeframe(window),
      confidence: "low",
    });
  }

  const summaries = resolved.map(({ detail, match }) => ({
    match,
    ...buildAdvertiserWindowSummary(detail, window, workspace),
  }));
  const activeCreativeCount = summaries.reduce((sum, summary) => sum + summary.activeAds.length, 0);
  const activeCreativeCountBySource = summaries.map((summary) => ({
    source: summary.match.source,
    sourceLabel: getSourceLabel(summary.match.source),
    activeCreativeCount: summary.activeAds.length,
    adsInWindow: summary.ads.length,
  }));
  const observations = summaries.flatMap(buildCreativeObservations).slice(0, 6);
  const representativeAdRows = summaries
    .flatMap((summary) => summary.longestRunningAds.map((ad) => ({
      advertiserId: summary.detail.id,
      advertiserName: summary.detail.canonicalName,
      source: summary.match.source,
      sourceLabel: getSourceLabel(summary.match.source),
      id: ad.id,
      title: ad.title,
      body: ad.body,
      transcript: ad.transcript,
      hook: ad.hook,
      format: ad.format,
      callToAction: ad.callToAction,
      firstSeenAt: ad.firstSeenAt.toISOString(),
      lastSeenAt: ad.lastSeenAt.toISOString(),
      durationDays: ad.durationDays,
      adluvAdUrl: ad.adluvAdUrl,
      mediaUrl: ad.mediaUrl ?? ad.posterUrl ?? ad.videoUrl,
      destinationUrl: ad.destinationUrl,
    })))
    .sort((left, right) => right.durationDays - left.durationDays || right.lastSeenAt.localeCompare(left.lastSeenAt))
    .slice(0, representativeAdsLimit);
  const representativeAds = await Promise.all(
    representativeAdRows.map(async (ad) => ({
      ...ad,
      mediaBase64: await fetchMediaDataUri(ad.mediaUrl),
    })),
  );

  return textResponse(
    `Creative analysis data for ${advertiser ?? advertiserId}: ${summaries.length} resolved source record${summaries.length === 1 ? "" : "s"}, ${activeCreativeCount} active creatives.`,
    {
      advertiser: advertiser ?? null,
      advertiserId: advertiserId ?? null,
      timeWindow: formatTimeframe(window),
      advertiserMatches: summaries.map((summary) => ({
        advertiserId: summary.detail.id,
        source: summary.match.source,
        sourceLabel: getSourceLabel(summary.match.source),
        sources: summary.detail.sources,
        canonicalName: summary.detail.canonicalName,
        sourceAdvertiserId: summary.match.sourceAdvertiserId,
        sourceAdvertiserIds: summary.detail.sourceAdvertiserIds,
        profileUrl: summary.detail.profileUrl,
        adluvAdvertiserUrl: getWorkspaceAppHref(workspace, `/advertisers/${summary.detail.id}/overview`),
      })),
      activeCreativeCount,
      activeCreativeCountBySource,
      sourceBreakdowns: summaries.map((summary) => ({
        source: summary.match.source,
        sourceLabel: getSourceLabel(summary.match.source),
        formats: summary.formatBreakdown,
        ctas: summary.ctaBreakdown,
        hooks: summary.hookBreakdown,
        recurringPhrases: extractRecurringPhrases(summary.ads, summary.detail.canonicalName, 5),
      })),
      observations,
      representativeAds,
      confidence: buildConfidence(
        summaries.length,
        sources.length,
        Math.max(...summaries.map((summary) => summary.match.score)),
      ),
    },
  );
}

async function handleCompareAdvertisers(args: Record<string, unknown>, context: ToolContext) {
  const advertisers = args.advertisers;

  if (!Array.isArray(advertisers) || advertisers.length < 2) {
    throw new Error("Provide at least two advertisers.");
  }

  const advertiserNames = advertisers.map((value, index) => requireString(value, `advertisers[${index}]`));
  const sources = readSources(args.sources);
  const viewer = await resolveViewer(args.viewer, context);
  const workspace = await resolveWorkspace(args.workspace, viewer);
  const window = readTimeframe(args.timeframe);
  const includeAdsLimit = readOptionalNumber(args.includeAdsLimit, 5, { min: 1, max: 20 });

  const comparisons = await Promise.all(
    advertiserNames.map(async (advertiser) => {
      const resolved = await resolveAdvertiserDetails({
        advertiser,
        sources,
        viewer,
        workspace,
      });

      const summaries = resolved.map(({ detail, match }) => ({
        match,
        ...buildAdvertiserWindowSummary(detail, window, workspace),
      }));
      const ads = summaries.flatMap((summary) => summary.ads);

      return {
        requestedAdvertiser: advertiser,
        confidence: buildConfidence(
          summaries.length,
          sources.length,
          summaries.length ? Math.max(...summaries.map((summary) => summary.match.score)) : null,
        ),
        matchedAdvertisers: summaries.map((summary) => ({
          advertiserId: summary.detail.id,
          source: summary.match.source,
          sourceLabel: getSourceLabel(summary.match.source),
          sources: summary.detail.sources,
          canonicalName: summary.detail.canonicalName,
          adluvAdvertiserUrl: getWorkspaceAppHref(workspace, `/advertisers/${summary.detail.id}/overview`),
          profileUrl: summary.detail.profileUrl,
        })),
        totalAdsInWindow: ads.length,
        activeAdsInWindow: ads.filter((ad) => ad.status?.toLowerCase() === "active").length,
        newCreativesInWindow: ads.filter((ad) => withinWindow(ad.firstSeenAt, window)).length,
        averageRunLengthDays: ads.length
          ? Math.round(ads.reduce((sum, ad) => sum + ad.durationDays, 0) / ads.length)
          : 0,
        topFormats: buildBreakdown(ads.map((ad) => ad.format)),
        topCallsToAction: buildBreakdown(ads.map((ad) => ad.callToAction)),
        sourceVolume: summaries.map((summary) => ({
          source: summary.match.source,
          sourceLabel: getSourceLabel(summary.match.source),
          adsInWindow: summary.ads.length,
          activeAdsInWindow: summary.activeAds.length,
          newCreativesInWindow: summary.newCreatives.length,
        })),
        longestRunningAds: [...ads]
          .sort((left, right) => right.durationDays - left.durationDays || right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
          .slice(0, includeAdsLimit),
      };
    }),
  );

  const rankedByVolume = [...comparisons]
    .sort((left, right) => right.totalAdsInWindow - left.totalAdsInWindow || right.activeAdsInWindow - left.activeAdsInWindow)
    .map((item) => ({
      advertiser: item.requestedAdvertiser,
      totalAdsInWindow: item.totalAdsInWindow,
      activeAdsInWindow: item.activeAdsInWindow,
      newCreativesInWindow: item.newCreativesInWindow,
    }));
  const longestRunningAcrossAdvertisers = comparisons
    .flatMap((comparison) =>
      comparison.longestRunningAds.map((ad) => ({
        requestedAdvertiser: comparison.requestedAdvertiser,
        matchedAdvertiser: comparison.matchedAdvertisers[0]?.canonicalName ?? comparison.requestedAdvertiser,
        adId: ad.id,
        title: ad.title,
        hook: ad.hook,
        durationDays: ad.durationDays,
        firstSeenAt: ad.firstSeenAt,
        lastSeenAt: ad.lastSeenAt,
        status: ad.status,
        format: ad.format,
        callToAction: ad.callToAction,
        adluvAdUrl: ad.adluvAdUrl,
        destinationUrl: ad.destinationUrl,
      })),
    )
    .sort((left, right) => right.durationDays - left.durationDays || right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
    .slice(0, includeAdsLimit);

  return textResponse(
    `Comparison data for ${advertiserNames.length} advertisers across ${sources.map(getSourceLabel).join(", ")}.`,
    {
      timeWindow: formatTimeframe(window),
      comparisons,
      rankedByVolume,
      longestRunningAcrossAdvertisers,
    },
  );
}

async function handleGetWatchlistReport(args: Record<string, unknown>, context: ToolContext) {
  const viewer = await resolveViewer(args.viewer, context);
  const workspace = await resolveWorkspace(args.workspace, viewer);

  const window = readTimeframe(args.timeframe);
  const includePending = readBoolean(args.includePending, true);
  const includeActivityFeed = readBoolean(args.includeActivityFeed, true);
  const limit = readOptionalNumber(args.limit, 10, { min: 1, max: 25 });
  const watchlistEntries = await listWatchlistEntries(viewer.id, workspace.id);
  const pendingEntries = includePending ? await listPendingTrackedCompanies(viewer.id, workspace.id) : [];
  const details = await Promise.all(
    watchlistEntries.slice(0, limit).map((entry) => getAdvertiserDirectoryDetail(viewer.id, entry.advertiserId, workspace.id)),
  );

  const watchlist = watchlistEntries.slice(0, limit).map((entry) => {
    const detail = details.find((item) => item?.id === entry.advertiserId) ?? null;
    const summary = detail ? buildAdvertiserWindowSummary(detail, window, workspace) : null;

    return {
      ...mapWatchlistEntry(entry, workspace),
      windowedAds: summary?.ads.length ?? 0,
      newCreativesInWindow: summary?.newCreatives.length ?? 0,
      longestRunningAd:
        summary?.longestRunningAds[0]
          ? {
              adId: summary.longestRunningAds[0].id,
              title: summary.longestRunningAds[0].title,
              hook: summary.longestRunningAds[0].hook,
              durationDays: summary.longestRunningAds[0].durationDays,
              firstSeenAt: summary.longestRunningAds[0].firstSeenAt,
              lastSeenAt: summary.longestRunningAds[0].lastSeenAt,
              status: summary.longestRunningAds[0].status,
              adluvAdUrl: summary.longestRunningAds[0].adluvAdUrl,
            }
          : null,
      landingPageTestingSignal: summary?.landingPageChangeSignals.hasLikelyTestOrChange ?? false,
      landingPagesInWindow: summary?.landingPages.length ?? 0,
      topFormats: summary?.formatBreakdown ?? [],
    };
  });

  const watchlistWithDetails = watchlist
    .filter((entry) => entry.windowedAds > 0)
    .sort((left, right) => right.windowedAds - left.windowedAds || right.newCreativesInWindow - left.newCreativesInWindow);

  const longestRunningBrands = watchlist
    .filter((entry) => entry.longestRunningAd)
    .sort(
      (left, right) =>
        (right.longestRunningAd?.durationDays ?? 0) - (left.longestRunningAd?.durationDays ?? 0),
    )
    .slice(0, limit);

  const brandsWithLandingPageTests = watchlist.filter((entry) => entry.landingPageTestingSignal).slice(0, limit);
  const brandsWithoutRecentLaunches = watchlist
    .filter((entry) => entry.newCreativesInWindow === 0)
    .sort((left, right) => {
      const leftLastSeen = left.lastSeenAt ? new Date(left.lastSeenAt).getTime() : 0;
      const rightLastSeen = right.lastSeenAt ? new Date(right.lastSeenAt).getTime() : 0;
      return leftLastSeen - rightLastSeen;
    })
    .slice(0, limit);

  const activityFeed = includeActivityFeed
    ? (await listActivityFeed(viewer.id, limit, workspace.id)).map((item) => ({
        ...item,
        occurredAt: toIsoString(item.occurredAt),
        adluvAdUrl: getWorkspaceAppHref(workspace, `/ads/${item.adId}`),
        adluvAdvertiserUrl: getWorkspaceAppHref(workspace, `/advertisers/${item.advertiserId}/overview`),
      }))
    : [];

  return textResponse(
    `Watchlist report data for ${viewer.email}: ${watchlist.length} tracked advertiser${watchlist.length === 1 ? "" : "s"} in ${workspace.name}.`,
    {
      viewer: {
        id: viewer.id,
        email: viewer.email,
        username: viewer.username,
      },
      timeWindow: formatTimeframe(window),
      watchlist,
      pendingEntries: pendingEntries.map((entry) => ({
        ...entry,
        advertiserLogoUrl: entry.advertiserLogoUrl,
        adluvAdvertiserUrl: getWorkspaceAppHref(workspace, `/advertisers/${entry.advertiserId}/overview`),
      })),
      longestRunningBrands,
      brandsWithMostAdsInWindow: watchlistWithDetails.slice(0, limit),
      brandsWithLandingPageTests,
      brandsWithoutRecentLaunches,
      formatMixAcrossTrackedBrands: buildBreakdown(watchlist.flatMap((entry) => entry.topFormats.map((format) => format.label)), 10),
      activityFeed,
    },
  );
}

async function withToolErrorBoundary(handler: ToolHandler, args: Record<string, unknown>, context: ToolContext) {
  try {
    return await handler(args, context);
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: error instanceof Error ? error.message : "Unexpected tool failure.",
        },
      ],
      isError: true,
    } satisfies McpToolResponse;
  }
}

export const tools: ToolDefinition[] = [
  {
    name: "search_advertisers",
    description:
      "Resolve AdLuv advertisers by name, source advertiser id, or profile URL across Meta, Google, and LinkedIn. Use this first when a brand name may be ambiguous.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Advertiser name, source advertiser id, or another identifying search term." },
        sources: { type: "array", items: { type: "string", enum: supportedSources } },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 8 },
        viewer: { type: "string", description: "Optional AdLuv user id, email, or username to annotate tracked/watchlist state." },
        workspace: { type: "string", description: "Optional workspace id or slug. Defaults to the user's default workspace." },
        liveFallback: {
          type: "boolean",
          description: "When true, run a live source-adapter search only if the indexed search returns nothing.",
          default: false,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: (args, context) => withToolErrorBoundary(handleSearchAdvertisers, args, context),
  },
  {
    name: "search_library",
    description:
      "Search indexed ads, advertisers, and landing pages across the AdLuv library. Useful for quick broad discovery before running a deeper advertiser or watchlist report.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        viewer: { type: "string", description: "Optional AdLuv user id, email, or username." },
        workspace: { type: "string", description: "Optional workspace id or slug. Defaults to the user's default workspace." },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: (args, context) => withToolErrorBoundary(handleSearchLibrary, args, context),
  },
  {
    name: "get_advertiser_intelligence",
    description:
      "Return an evidence-backed advertiser report for the covered AdLuv MCP queries: active ads, longest-running creatives, new launches, format mix, landing pages, and ad-to-landing-page journeys.",
    inputSchema: {
      type: "object",
      properties: {
        advertiser: { type: "string", description: "Advertiser name or source advertiser id." },
        advertiserId: { type: "string", description: "Explicit AdLuv advertiser id when already known." },
        sources: { type: "array", items: { type: "string", enum: supportedSources } },
        viewer: { type: "string", description: "Optional AdLuv user id, email, or username." },
        workspace: { type: "string", description: "Optional workspace id or slug. Defaults to the user's default workspace." },
        timeframe: {
          type: "object",
          properties: {
            preset: { type: "string", enum: timeframePresetValues },
            since: { type: "string", format: "date-time" },
            until: { type: "string", format: "date-time" },
          },
          additionalProperties: false,
        },
        includeAdsLimit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      },
      additionalProperties: false,
    },
    handler: (args, context) => withToolErrorBoundary(handleGetAdvertiserIntelligence, args, context),
  },
  {
    name: "analyze_advertiser_creatives",
    description:
      "Run a creative-focused advertiser analysis across one or more sources. Returns active creative counts, format/CTA/hook breakdowns, recurring phrases, representative ads, and short evidence-backed observations.",
    inputSchema: {
      type: "object",
      properties: {
        advertiser: { type: "string", description: "Advertiser name or source advertiser id." },
        advertiserId: { type: "string", description: "Explicit AdLuv advertiser id when already known." },
        sources: { type: "array", items: { type: "string", enum: supportedSources } },
        viewer: { type: "string", description: "Optional AdLuv user id, email, or username." },
        workspace: { type: "string", description: "Optional workspace id or slug. Defaults to the user's default workspace." },
        timeframe: {
          type: "object",
          properties: {
            preset: { type: "string", enum: timeframePresetValues },
            since: { type: "string", format: "date-time" },
            until: { type: "string", format: "date-time" },
          },
          additionalProperties: false,
        },
        representativeAdsLimit: { type: "integer", minimum: 1, maximum: 25, default: 8 },
      },
      additionalProperties: false,
    },
    handler: (args, context) => withToolErrorBoundary(handleAnalyzeAdvertiserCreatives, args, context),
  },
  {
    name: "compare_advertisers",
    description:
      "Compare advertiser volume, launch cadence, format mix, and active creative count across multiple brands for covered competitive-intelligence queries.",
    inputSchema: {
      type: "object",
      properties: {
        advertisers: { type: "array", items: { type: "string" }, minItems: 2 },
        sources: { type: "array", items: { type: "string", enum: supportedSources } },
        viewer: { type: "string", description: "Optional AdLuv user id, email, or username." },
        workspace: { type: "string", description: "Optional workspace id or slug. Defaults to the user's default workspace." },
        timeframe: {
          type: "object",
          properties: {
            preset: { type: "string", enum: timeframePresetValues },
            since: { type: "string", format: "date-time" },
            until: { type: "string", format: "date-time" },
          },
          additionalProperties: false,
        },
        includeAdsLimit: { type: "integer", minimum: 1, maximum: 20, default: 5 },
      },
      required: ["advertisers"],
      additionalProperties: false,
    },
    handler: (args, context) => withToolErrorBoundary(handleCompareAdvertisers, args, context),
  },
  {
    name: "get_watchlist_report",
    description:
      "Summarize an AdLuv user's watchlist for covered watchlist queries: latest launches, longest-lived creatives, landing-page tests, activity-feed alerts, and brands that have gone quiet.",
    inputSchema: {
      type: "object",
      properties: {
        viewer: { type: "string", description: "Optional AdLuv user id, email, or username. If omitted, the authenticated MCP key owner is used." },
        workspace: { type: "string", description: "Optional workspace id or slug. Defaults to the user's default workspace." },
        timeframe: {
          type: "object",
          properties: {
            preset: { type: "string", enum: timeframePresetValues },
            since: { type: "string", format: "date-time" },
            until: { type: "string", format: "date-time" },
          },
          additionalProperties: false,
        },
        includePending: { type: "boolean", default: true },
        includeActivityFeed: { type: "boolean", default: true },
        limit: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
      additionalProperties: false,
    },
    handler: (args, context) => withToolErrorBoundary(handleGetWatchlistReport, args, context),
  },
];

export function listTools() {
  return tools.map(({ handler: _handler, ...tool }) => tool);
}

export async function callTool(name: string, args: Record<string, unknown>, context: ToolContext) {
  const tool = tools.find((item) => item.name === name);

  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  return tool.handler(args, context);
}
