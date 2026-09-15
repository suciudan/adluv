import { envInteger, envString } from "./env";
import { requestText, responseHeader } from "./http-client";
import type { ProbeResponse } from "./http-client";
import type { ProxyProvider } from "./providers";
import { runProbe, type ProbeResult } from "./results";

const metaBaseUrl = "https://www.facebook.com";
const metaGraphqlUrl = `${metaBaseUrl}/api/graphql/`;
const metaSearchDocId = "25987067537594875";
const metaSearchFriendlyName = "AdLibrarySearchPaginationQuery";

type MetaSession = {
  cometReq: string;
  cookie: string;
  headers: Record<string, string>;
  hsi: string;
  jazoest: string;
  lsd: string;
  refererUrl: string;
  rev: string;
  spinB: string;
  spinR: string;
  spinT: string;
};

function cleanText(value?: string | null) {
  return value?.replace(/\s+/g, " ").trim() || undefined;
}

function buildMetaAdsLibraryUrl() {
  const pageId = envString("PROXY_LAB_META_PAGE_ID");
  const query = envString("PROXY_LAB_META_QUERY", "nike");
  const country = envString("PROXY_LAB_META_COUNTRY", "GB");
  const params = new URLSearchParams({
    active_status: "all",
    ad_type: "all",
    country,
    is_targeted_country: "false",
    media_type: "all",
    search_type: pageId ? "page" : "keyword_unordered",
  });

  if (pageId) {
    params.set("view_all_page_id", pageId);
  } else {
    params.set("q", query);
  }

  return `${metaBaseUrl}/ads/library/?${params.toString()}`;
}

function extractToken(html: string, pattern: RegExp, label: string) {
  const value = html.match(pattern)?.[1];

  if (!value) {
    throw new Error(`Meta Ads Library page is missing ${label}.`);
  }

  return value;
}

function tryBuildSessionFromHtml(refererUrl: string, html: string, headers: Record<string, string>, cookie = ""): MetaSession | null {
  try {
    return {
      cometReq: extractToken(html, /__comet_req=(\d+)&jazoest=/, "__comet_req"),
      cookie,
      headers,
      hsi: extractToken(html, /"hsi":"([^"]+)"/, "hsi"),
      jazoest: extractToken(html, /__comet_req=\d+&jazoest=(\d+)/, "jazoest"),
      lsd: extractToken(html, /\["LSD",\[\],\{"token":"([^"]+)"/, "lsd"),
      refererUrl,
      rev: extractToken(html, /"server_revision":(\d+)/, "server_revision"),
      spinB: extractToken(html, /"__spin_b":"([^"]+)"/, "__spin_b"),
      spinR: extractToken(html, /"__spin_r":(\d+)/, "__spin_r"),
      spinT: extractToken(html, /"__spin_t":(\d+)/, "__spin_t"),
    };
  } catch {
    return null;
  }
}

function extractChallengePath(html: string) {
  return html.match(/fetch\(\s*["']([^"']*__rd_verify_[^"']*)["']/i)?.[1] ?? null;
}

function describeBootstrapFailure(response: ProbeResponse) {
  const title = cleanText(response.body.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]);
  const markers = [
    response.body.includes("__rd_verify_") ? "rd_challenge" : null,
    response.body.includes("__comet_req") ? "comet_req" : null,
    response.body.includes("LSD") ? "lsd" : null,
  ].filter(Boolean);

  return [
    `status=${response.status}`,
    title ? `title="${title}"` : null,
    markers.length ? `markers=${markers.join(",")}` : "markers=none",
    `body_bytes=${response.body.length}`,
  ].filter(Boolean).join(" ");
}

async function fetchMetaPage(provider: ProxyProvider, url: string, cookie = "") {
  return requestText(provider, {
    headers: {
      "accept-language": "en-US,en;q=0.9",
      ...(cookie ? { cookie } : {}),
      "user-agent": "Mozilla/5.0",
    },
    timeoutMs: envInteger("PROXY_LAB_META_TIMEOUT_MS", 30_000),
    url,
  });
}

async function openMetaSession(provider: ProxyProvider): Promise<MetaSession> {
  const refererUrl = buildMetaAdsLibraryUrl();
  const headers = {
    "accept-language": "en-US,en;q=0.9",
    "user-agent": "Mozilla/5.0",
  };
  const pageResponse = await fetchMetaPage(provider, refererUrl);
  const pageSession = tryBuildSessionFromHtml(refererUrl, pageResponse.body, headers);

  if (pageSession) {
    return pageSession;
  }

  const challengePath = extractChallengePath(pageResponse.body);

  if (!challengePath) {
    throw new Error(`Meta session bootstrap failed: ${describeBootstrapFailure(pageResponse)}.`);
  }

  const challengeUrl = new URL(challengePath, refererUrl).toString();
  const challengeResponse = await requestText(provider, {
    headers: {
      ...headers,
      referer: refererUrl,
    },
    method: "POST",
    timeoutMs: envInteger("PROXY_LAB_META_TIMEOUT_MS", 30_000),
    url: challengeUrl,
  });
  const cookie = responseHeader(challengeResponse.headers, "set-cookie")?.split(";")[0];

  if (!cookie) {
    throw new Error("Meta challenge did not return a session cookie.");
  }

  const unlockedResponse = await fetchMetaPage(provider, refererUrl, cookie);
  const challengedSession = tryBuildSessionFromHtml(refererUrl, unlockedResponse.body, headers, cookie);

  if (!challengedSession) {
    throw new Error(`Meta session did not expose GraphQL tokens after challenge: ${describeBootstrapFailure(unlockedResponse)}.`);
  }

  return challengedSession;
}

function buildMetaVariables() {
  const pageId = envString("PROXY_LAB_META_PAGE_ID");
  const query = envString("PROXY_LAB_META_QUERY", "nike");
  const country = envString("PROXY_LAB_META_COUNTRY", "GB");

  return {
    activeStatus: "all",
    adType: "ALL",
    bylines: [],
    collationToken: null,
    contentLanguages: [],
    countries: [country],
    cursor: null,
    first: envInteger("PROXY_LAB_META_FIRST", 3),
    isTargetedCountry: false,
    mediaType: "all",
    pageIDs: [],
    publisherPlatforms: [],
    queryString: pageId ? "" : query,
    searchType: pageId ? "page" : "keyword_unordered",
    sessionID: crypto.randomUUID(),
    sortData: null,
    source: null,
    startDate: null,
    v: "e8d3d3",
    viewAllPageID: pageId || null,
  };
}

export async function runMetaGraphqlProbes(provider: ProxyProvider): Promise<ProbeResult[]> {
  return [
    await runProbe(provider, "meta.graphql.search", async () => {
      const session = await openMetaSession(provider);
      const response = await requestText(provider, {
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
          variables: JSON.stringify(buildMetaVariables()),
          server_timestamps: "true",
          doc_id: metaSearchDocId,
        }),
        headers: {
          ...session.headers,
          cookie: session.cookie,
          "content-type": "application/x-www-form-urlencoded",
          origin: metaBaseUrl,
          referer: session.refererUrl,
        },
        method: "POST",
        timeoutMs: envInteger("PROXY_LAB_META_TIMEOUT_MS", 30_000),
        url: metaGraphqlUrl,
      });

      if (!response.ok) {
        return {
          detail: `body_bytes=${response.body.length}`,
          ok: false,
          status: response.status,
        };
      }

      const payload = JSON.parse(response.body.replace(/^for \(;;\);/, "")) as {
        data?: {
          ad_library_main?: {
            search_results_connection?: {
              edges?: unknown[];
            } | null;
          } | null;
        } | null;
        errors?: Array<{ message?: string }>;
      };
      const edges = payload.data?.ad_library_main?.search_results_connection?.edges ?? [];
      const errorCount = payload.errors?.length ?? 0;

      return {
        detail: `edges=${edges.length} errors=${errorCount}`,
        ok: errorCount === 0 || edges.length > 0,
        status: response.status,
      };
    }),
  ];
}
