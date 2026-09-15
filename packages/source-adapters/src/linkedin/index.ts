import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import * as http from "node:http";
import * as https from "node:https";
import * as net from "node:net";
import * as tls from "node:tls";

import {
  AdvertiserSearchError,
  type AdvertiserMatch,
  type FetchAdvertiserAdsOptions,
  type LandingPageSnapshot,
  type NormalizedAd,
  type SourceAdapter,
} from "../types";
import { fetchLandingPageSnapshot } from "../helpers";
import {
  fetchTextViaHttpProxy,
  fetchTextViaWebScrapingApiProxy,
  type WebScrapingApiProxyOptions,
} from "../webscrapingapi";

const e2eFixtureFetchCounts = new Map<string, number>();
const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
const networkFetchTimeoutMs = 20_000;
const slugSuffixHints = ["hq", "ai", "inc", "labs", "software", "tech", "cloud", "computing", "dotcom"];
const knownRedirectDomains = new Set([
  "bit.ly",
  "buff.ly",
  "cutt.ly",
  "lnkd.in",
  "lnk.to",
  "ow.ly",
  "rb.gy",
  "rebrand.ly",
  "short.io",
  "t.co",
  "tinyurl.com",
]);

function normalizeLinkedInCompanySlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^company\//, "")
    .replace(/\/+$/, "")
    .replace(/[^a-z0-9-]/g, "");
}

function buildLinkedInCompanyUrl(slug: string) {
  return `https://www.linkedin.com/company/${slug}/`;
}

function buildLinkedInAdvertiserLibraryUrl(slug: string) {
  const url = new URL("https://www.linkedin.com/ad-library/search");
  url.searchParams.set("accountOwner", normalizeLinkedInCompanySlug(slug));
  return url.toString();
}

function buildAdvertiserId(sourceAdvertiserId: string) {
  return createHash("sha1").update(`linkedin:${sourceAdvertiserId}`).digest("hex");
}

function slugifyLinkedInFixtureId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCaseFromSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stripHtmlTags(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function stripHtmlTagsPreservingLineBreaks(value: string) {
  return value
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(?:p|div|li)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
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

function repairLinkedInMojibakeText(value: string) {
  return value
    .replace(/â†’/g, "→")
    .replace(/âœ…/g, "✅")
    .replace(/â€”/g, "—")
    .replace(/â€“/g, "–")
    .replace(/â€˜/g, "'")
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€�/g, '"')
    .replace(/â€¦/g, "…")
    .replace(/Â /g, " ")
    .replace(/Â/g, "");
}

function cleanText(value?: string | null) {
  if (!value) {
    return undefined;
  }

  return repairLinkedInMojibakeText(decodeHtmlEntities(stripHtmlTags(value))).replace(/\s+/g, " ").trim() || undefined;
}

function cleanMultilineText(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const cleaned = repairLinkedInMojibakeText(decodeHtmlEntities(stripHtmlTagsPreservingLineBreaks(value)))
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned || undefined;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeCompactText(value: string) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function parseLinkedInCompanyUrl(value: string) {
  try {
    const url = new URL(value.trim());

    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes("linkedin.com")) {
      return null;
    }

    const match = url.pathname.match(/\/company\/([^/?#]+)/i);

    if (!match?.[1]) {
      return null;
    }

    return normalizeLinkedInCompanySlug(match[1]);
  } catch {
    return null;
  }
}

function parseLinkedInAdLibraryUrl(value: string) {
  try {
    const url = new URL(value.trim());

    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes("linkedin.com")) {
      return null;
    }

    if (!url.pathname.toLowerCase().includes("/ad-library")) {
      return null;
    }

    const accountOwner = url.searchParams.get("accountOwner");

    return accountOwner ? normalizeLinkedInCompanySlug(accountOwner) : null;
  } catch {
    return null;
  }
}

function parseDirectCompanyIdentifier(query: string) {
  const trimmed = query.trim();

  if (!trimmed) {
    return null;
  }

  const parsedUrlSlug = parseLinkedInCompanyUrl(trimmed);

  if (parsedUrlSlug) {
    return parsedUrlSlug;
  }

  const parsedAdLibrarySlug = parseLinkedInAdLibraryUrl(trimmed);

  if (parsedAdLibrarySlug) {
    return parsedAdLibrarySlug;
  }

  if (/^company\/[a-z0-9-]+$/i.test(trimmed)) {
    return normalizeLinkedInCompanySlug(trimmed);
  }

  if (/^[a-z0-9][a-z0-9-]{1,62}$/i.test(trimmed) && !trimmed.includes(" ")) {
    return normalizeLinkedInCompanySlug(trimmed);
  }

  return null;
}

function extractRegistrableDomain(hostname?: string | null) {
  const trimmedHostname = hostname?.trim().toLowerCase().replace(/^www\./, "");

  if (!trimmedHostname) {
    return null;
  }

  const labels = trimmedHostname
    .split(".")
    .map((label) => label.trim())
    .filter(Boolean);

  if (!labels.length) {
    return null;
  }

  if (labels.length <= 2) {
    return labels.join(".");
  }

  const secondLevelLabels = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
  const topLevel = labels.at(-1) ?? "";
  const secondLevel = labels.at(-2) ?? "";

  if (topLevel.length === 2 && secondLevelLabels.has(secondLevel)) {
    return labels.slice(-3).join(".");
  }

  return labels.slice(-2).join(".");
}

function isKnownRedirectDomain(hostname?: string | null) {
  const registrableDomain = extractRegistrableDomain(hostname);

  if (!registrableDomain) {
    return false;
  }

  return (
    knownRedirectDomains.has(registrableDomain) ||
    [...knownRedirectDomains].some((candidate) => registrableDomain.endsWith(`.${candidate}`))
  );
}

function isE2eFixtureMode() {
  return process.env.adluv_E2E_FIXTURE_MODE === "1";
}

function buildFixtureAds(sourceAdvertiserId: string) {
  const now = new Date();
  const fetchCount = (e2eFixtureFetchCounts.get(sourceAdvertiserId) ?? 0) + 1;

  e2eFixtureFetchCounts.set(sourceAdvertiserId, fetchCount);

  const baseAd: NormalizedAd = {
    source: "linkedin",
    sourceAdId: `${sourceAdvertiserId}-fixture-ad-1`,
    fingerprint: `${sourceAdvertiserId}-fixture-ad-1`,
    title: "Fixture launch ad",
    body: "Deterministic LinkedIn ad fixture used for browser end-to-end coverage.",
    payer: sourceAdvertiserId,
    format: "single-image",
    callToAction: "Learn more",
    destinationUrl: `https://example.com/${sourceAdvertiserId}/launch`,
    mediaUrl: "https://images.example.com/ad-fixture-1.png",
    status: "active",
    reactionCount: 64,
    commentCount: 18,
    firstSeenAt: now,
    lastSeenAt: now,
    metadata: {
      status: "fixture",
      batch: 1,
    },
  };

  if (fetchCount === 1) {
    return [baseAd];
  }

  return [
    baseAd,
    {
      source: "linkedin" as const,
      sourceAdId: `${sourceAdvertiserId}-fixture-ad-2`,
      fingerprint: `${sourceAdvertiserId}-fixture-ad-2`,
      title: "Fixture retargeting ad",
      body: "Second deterministic creative returned on scheduled sync to trigger alerts.",
      payer: sourceAdvertiserId,
      format: "video",
      callToAction: "Book demo",
      destinationUrl: `https://example.com/${sourceAdvertiserId}/retargeting`,
      mediaUrl: "https://images.example.com/ad-fixture-2.png",
      status: "active",
      reactionCount: 142,
      commentCount: 39,
      firstSeenAt: now,
      lastSeenAt: now,
      metadata: {
        status: "fixture",
        batch: 2,
      },
    },
  ];
}

function buildFixtureProfile(query: string): AdvertiserMatch {
  const sourceAdvertiserId =
    parseDirectCompanyIdentifier(query) ??
    slugifyLinkedInFixtureId(query) ??
    "fixture-linkedin";

  return {
    id: buildAdvertiserId(sourceAdvertiserId),
    source: "linkedin",
    sourceAdvertiserId,
    canonicalName: titleCaseFromSlug(sourceAdvertiserId),
    profileUrl: buildLinkedInAdvertiserLibraryUrl(sourceAdvertiserId),
    summary: "Deterministic LinkedIn advertiser fixture.",
  };
}

type LinkedInSearchCandidate = {
  confidence: number;
  slug: string;
  title: string;
  profileUrl: string;
};

type LinkedInOrganizationSchema = {
  name?: string;
  url?: string;
  description?: string;
  address?: {
    addressCountry?: string;
  };
};

export type CreateLinkedInAdapterOptions = {
  proxyUrls?: string[];
  webScrapingApiKey?: string;
  webScrapingApiProxy?: WebScrapingApiProxyOptions;
};

export type FetchLinkedInAdDetailOptions = {
  fallbackPayer?: string;
  proxyUrls?: string[];
  sourceAdvertiserId?: string;
  webScrapingApiKey?: string;
  webScrapingApiProxy?: WebScrapingApiProxyOptions;
};

function extractMetaContent(html: string, attribute: "name" | "property", key: string) {
  const match = html.match(new RegExp(`<meta\\s+${attribute}="${key}"\\s+content="([^"]+)"`, "i"));
  return cleanText(match?.[1]);
}

function extractTitle(html: string) {
  return cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
}

function extractAboutUsField(
  html: string,
  field: "industry" | "size" | "headquarters" | "website",
) {
  const match = html.match(
    new RegExp(`data-test-id="about-us__${field}"[\\s\\S]*?<dd[^>]*>([\\s\\S]*?)<\\/dd>`, "i"),
  );

  return cleanText(match?.[1]);
}

function extractAboutUsWebsiteUrl(html: string) {
  const match = html.match(/data-test-id="about-us__website"[\s\S]*?<dd[^>]*>([\s\S]*?)<\/dd>/i);
  const block = match?.[1];

  if (!block) {
    return undefined;
  }

  const href = block.match(/href="([^"]+)"/i)?.[1];
  return cleanText(href ?? block);
}

function findOrganizationSchemaNode(value: unknown): LinkedInOrganizationSchema | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const node = findOrganizationSchemaNode(item);

      if (node) {
        return node;
      }
    }

    return null;
  }

  const candidate = value as Record<string, unknown>;
  const type = candidate["@type"];

  if (type === "Organization") {
    return candidate as LinkedInOrganizationSchema;
  }

  if ("@graph" in candidate) {
    return findOrganizationSchemaNode(candidate["@graph"]);
  }

  return null;
}

function extractOrganizationSchema(html: string) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1]);
      const organization = findOrganizationSchemaNode(parsed);

      if (organization) {
        return organization;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function getCountryLabel(countryCode?: string, headquarters?: string) {
  const normalizedCountryCode = countryCode?.trim();

  if (normalizedCountryCode && normalizedCountryCode.length === 2 && regionNames) {
    const label = regionNames.of(normalizedCountryCode.toUpperCase());

    if (label) {
      return label;
    }
  }

  if (headquarters?.includes(",")) {
    return headquarters.split(",").at(-1)?.trim();
  }

  return normalizedCountryCode || undefined;
}

function decodeBingRedirectUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);

    if (!url.hostname.includes("bing.com")) {
      return rawUrl;
    }

    const encodedTarget = url.searchParams.get("u");

    if (!encodedTarget) {
      return rawUrl;
    }

    const normalized = encodedTarget.startsWith("a1") ? encodedTarget.slice(2) : encodedTarget;
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return rawUrl;
  }
}

function decodeDuckDuckGoRedirectUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl, "https://html.duckduckgo.com");

    if (!url.hostname.includes("duckduckgo.com")) {
      return rawUrl;
    }

    const encodedTarget = url.searchParams.get("uddg");

    if (!encodedTarget) {
      return url.toString();
    }

    return decodeURIComponent(encodedTarget);
  } catch {
    return rawUrl;
  }
}

function decodeLinkedInWebsiteRedirectUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);

    if (!url.hostname.includes("linkedin.com") || !url.pathname.startsWith("/redir/redirect")) {
      return rawUrl;
    }

    const targetUrl = url.searchParams.get("url");
    return targetUrl ? decodeURIComponent(targetUrl) : rawUrl;
  } catch {
    return rawUrl;
  }
}

function toRootWebsiteUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return rawUrl;
  }
}

async function resolveAdvertiserWebsiteUrl(rawUrl?: string) {
  const trimmedUrl = rawUrl?.trim();

  if (!trimmedUrl) {
    return undefined;
  }

  const decodedUrl = decodeLinkedInWebsiteRedirectUrl(trimmedUrl);
  const wasLinkedInRedirect = decodedUrl !== trimmedUrl;
  let decodedRootUrl: string | undefined;
  let decodedHostname: string | undefined;

  try {
    const decodedParsedUrl = new URL(decodedUrl);
    decodedRootUrl = toRootWebsiteUrl(decodedParsedUrl.toString());
    decodedHostname = decodedParsedUrl.hostname;
  } catch {
    decodedRootUrl = undefined;
    decodedHostname = undefined;
  }

  const decodedRegistrableDomain = extractRegistrableDomain(decodedHostname);
  const shouldPreserveDecodedDomain =
    Boolean(decodedRegistrableDomain) && !isKnownRedirectDomain(decodedHostname);

  const requestInit: RequestInit = {
    headers: {
      "user-agent": "Mozilla/5.0",
    },
    redirect: "follow",
  };

  try {
    const response = await fetchWithTimeout(
      decodedUrl,
      {
        ...requestInit,
        method: "HEAD",
      },
      `LinkedIn advertiser website lookup timed out after ${networkFetchTimeoutMs}ms.`,
    );

    const resolvedUrl = response.url || decodedUrl;
    const resolvedHostname = (() => {
      try {
        return new URL(resolvedUrl).hostname;
      } catch {
        return undefined;
      }
    })();
    const resolvedRegistrableDomain = extractRegistrableDomain(resolvedHostname);

    if (
      decodedRootUrl &&
      decodedRegistrableDomain &&
      shouldPreserveDecodedDomain &&
      resolvedRegistrableDomain &&
      resolvedRegistrableDomain !== decodedRegistrableDomain
    ) {
      return decodedRootUrl;
    }

    return toRootWebsiteUrl(resolvedUrl);
  } catch {
    try {
      const response = await fetchWithTimeout(
        decodedUrl,
        {
          ...requestInit,
          method: "GET",
        },
        `LinkedIn advertiser website lookup timed out after ${networkFetchTimeoutMs}ms.`,
      );

      const resolvedUrl = response.url || decodedUrl;
      const resolvedHostname = (() => {
        try {
          return new URL(resolvedUrl).hostname;
        } catch {
          return undefined;
        }
      })();
      const resolvedRegistrableDomain = extractRegistrableDomain(resolvedHostname);

      if (
        decodedRootUrl &&
        decodedRegistrableDomain &&
        shouldPreserveDecodedDomain &&
        resolvedRegistrableDomain &&
        resolvedRegistrableDomain !== decodedRegistrableDomain
      ) {
        return decodedRootUrl;
      }

      return toRootWebsiteUrl(resolvedUrl);
    } catch {
      return decodedRootUrl && shouldPreserveDecodedDomain
        ? decodedRootUrl
        : wasLinkedInRedirect
          ? undefined
          : toRootWebsiteUrl(decodedUrl);
    }
  }
}

function scoreCandidate(query: string, candidate: { slug: string; title?: string; canonicalName?: string }) {
  const queryNormalized = normalizeSearchText(query);
  const queryCompact = normalizeCompactText(query);
  const candidateText = candidate.canonicalName ?? candidate.title ?? titleCaseFromSlug(candidate.slug);
  const candidateNormalized = normalizeSearchText(candidateText);
  const candidateCompact = normalizeCompactText(candidateText);

  let score = 0;

  if (candidateCompact === queryCompact) {
    score += 12;
  }

  if (candidate.slug === normalizeLinkedInCompanySlug(queryCompact)) {
    score += 9;
  }

  if (candidateNormalized.includes(queryNormalized)) {
    score += 6;
  }

  const queryTokens = new Set(queryNormalized.split(/\s+/).filter(Boolean));
  const candidateTokens = new Set(candidateNormalized.split(/\s+/).filter(Boolean));
  let overlap = 0;

  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  }

  score += overlap * 2;

  return score;
}

function scoreAdvertiserMatchQuality(match: AdvertiserMatch) {
  let score = 0;

  if (match.country) {
    score += 2;
  }

  if (match.companySize) {
    score += 2;

    if (/\d{3,}|\d,\d{3}|10,001\+/i.test(match.companySize)) {
      score += 1;
    }
  }

  if ((match.summary?.length ?? 0) >= 120) {
    score += 4;
  } else if ((match.summary?.length ?? 0) >= 60) {
    score += 2;
  }

  if (match.summary && /\|\s*\d[\d,]*\s+followers on linkedin\.?$/i.test(match.summary)) {
    score -= 3;
  }

  return score;
}

type TextResponse = {
  attempts: string[];
  body: string;
  bodyAccepted: boolean;
  headers: http.IncomingHttpHeaders;
  ok: boolean;
  status: number;
};

function isRetryableStatus(status: number) {
  return status === 401 || status === 403 || status === 407 || status === 408 || status === 425 || status === 429 || status >= 500;
}

function isRedirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function getResponseHeader(headers: http.IncomingHttpHeaders, key: keyof http.IncomingHttpHeaders) {
  const value = headers[key];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function summarizeAttempts(attempts: string[]) {
  return attempts.length ? attempts.join("; ") : "no request attempts recorded";
}

function readResponseBody(response: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    response.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    response.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    response.on("error", reject);
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMessage: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), networkFetchTimeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(timeoutMessage);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildWebScrapingApiUrl(targetUrl: string, apiKey: string) {
  const url = new URL("https://api.webscrapingapi.com/v2");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("url", targetUrl);
  url.searchParams.set("country", "us");
  return url.toString();
}

function requestDirectText(url: URL, headers: Record<string, string>, redirectCount = 0): Promise<TextResponse> {
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        headers,
        method: "GET",
      },
      async (response) => {
        try {
          const status = response.statusCode ?? 0;
          const location = getResponseHeader(response.headers, "location");

          if (location && isRedirectStatus(status) && redirectCount < 5) {
            response.resume();
            resolve(requestDirectText(new URL(location, url), headers, redirectCount + 1));
            return;
          }

          const body = await readResponseBody(response);

          resolve({
            attempts: [`direct: http ${status}`],
            body,
            bodyAccepted: true,
            headers: response.headers,
            ok: status >= 200 && status < 300,
            status,
          });
        } catch (error) {
          reject(error);
        }
      },
    );

    request.setTimeout(20_000, () => {
      request.destroy(new Error(`Request to ${url.toString()} timed out.`));
    });
    request.on("error", reject);
    request.end();
  });
}

function connectToProxy(proxyUrl: URL) {
  return new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
    const port = Number(proxyUrl.port || (proxyUrl.protocol === "https:" ? "443" : "80"));
    const socket =
      proxyUrl.protocol === "https:"
        ? tls.connect({
            host: proxyUrl.hostname,
            port,
            servername: proxyUrl.hostname,
          })
        : net.connect({
            host: proxyUrl.hostname,
            port,
          });

    const cleanup = () => {
      socket.off("connect", handleConnect);
      socket.off("secureConnect", handleSecureConnect);
      socket.off("error", handleError);
      socket.off("timeout", handleTimeout);
    };

    const handleConnect = () => {
      if (proxyUrl.protocol === "https:") {
        return;
      }

      cleanup();
      resolve(socket);
    };

    const handleSecureConnect = () => {
      cleanup();
      resolve(socket);
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const handleTimeout = () => {
      cleanup();
      reject(new Error(`Proxy connection to ${proxyUrl.toString()} timed out.`));
    };

    socket.setTimeout(20_000);
    socket.once("connect", handleConnect);
    socket.once("secureConnect", handleSecureConnect);
    socket.once("error", handleError);
    socket.once("timeout", handleTimeout);
  });
}

function createProxyAuthorizationHeader(proxyUrl: URL) {
  if (!proxyUrl.username) {
    return null;
  }

  const token = Buffer.from(
    `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`,
    "utf8",
  ).toString("base64");

  return `Basic ${token}`;
}

function readProxyConnectResponse(socket: net.Socket | tls.TLSSocket) {
  return new Promise<Buffer>((resolve, reject) => {
    let buffer = Buffer.alloc(0);

    const cleanup = () => {
      socket.off("data", handleData);
      socket.off("error", handleError);
      socket.off("timeout", handleTimeout);
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const handleTimeout = () => {
      cleanup();
      reject(new Error("Proxy tunnel establishment timed out."));
    };

    const handleData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      const headerEnd = buffer.indexOf("\r\n\r\n");

      if (headerEnd === -1) {
        return;
      }

      cleanup();

      const head = buffer.subarray(0, headerEnd).toString("utf8");
      const status = Number(head.match(/^HTTP\/1\.[01]\s+(\d{3})/)?.[1] ?? "0");

      if (status !== 200) {
        reject(new Error(`Proxy CONNECT failed with status ${status || "unknown"}.`));
        return;
      }

      resolve(buffer.subarray(headerEnd + 4));
    };

    socket.on("data", handleData);
    socket.on("error", handleError);
    socket.on("timeout", handleTimeout);
  });
}

async function createProxyTunnel(targetUrl: URL, proxy: string) {
  const proxyUrl = new URL(proxy);
  const socket = await connectToProxy(proxyUrl);
  const targetPort = Number(targetUrl.port || "443");
  const proxyAuthorization = createProxyAuthorizationHeader(proxyUrl);
  const connectRequest = [
    `CONNECT ${targetUrl.hostname}:${targetPort} HTTP/1.1`,
    `Host: ${targetUrl.hostname}:${targetPort}`,
    proxyAuthorization ? `Proxy-Authorization: ${proxyAuthorization}` : null,
    "Connection: keep-alive",
    "",
    "",
  ]
    .filter(Boolean)
    .join("\r\n");

  socket.write(connectRequest);

  const bufferedRemainder = await readProxyConnectResponse(socket);

  if (bufferedRemainder.length > 0) {
    socket.unshift(bufferedRemainder);
  }

  if (targetUrl.protocol !== "https:") {
    return socket;
  }

  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secureSocket = tls.connect({
      servername: targetUrl.hostname,
      socket,
    });

    const cleanup = () => {
      secureSocket.off("secureConnect", handleSecureConnect);
      secureSocket.off("error", handleError);
      secureSocket.off("timeout", handleTimeout);
    };

    const handleSecureConnect = () => {
      cleanup();
      resolve(secureSocket);
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const handleTimeout = () => {
      cleanup();
      reject(new Error(`TLS upgrade for ${targetUrl.toString()} timed out.`));
    };

    secureSocket.setTimeout(20_000);
    secureSocket.once("secureConnect", handleSecureConnect);
    secureSocket.once("error", handleError);
    secureSocket.once("timeout", handleTimeout);
  });
}

function requestTextThroughProxy(
  url: URL,
  headers: Record<string, string>,
  proxy: string,
  redirectCount = 0,
): Promise<TextResponse> {
  return new Promise(async (resolve, reject) => {
    try {
      const socket = await createProxyTunnel(url, proxy);
      const request = https.request(
        {
          agent: false,
          createConnection: (_options, callback) => {
            if (callback) {
              callback(null, socket);
            }

            return socket;
          },
          headers: {
            host: url.host,
            ...headers,
            connection: "close",
          },
          host: url.hostname,
          method: "GET",
          path: `${url.pathname}${url.search}`,
          port: Number(url.port || "443"),
          protocol: url.protocol,
        },
        async (response) => {
          try {
            const status = response.statusCode ?? 0;
            const location = getResponseHeader(response.headers, "location");

            if (location && isRedirectStatus(status) && redirectCount < 5) {
              response.resume();
              resolve(requestTextThroughProxy(new URL(location, url), headers, proxy, redirectCount + 1));
              return;
            }

            const body = await readResponseBody(response);

            resolve({
              attempts: [`proxy ${new URL(proxy).host}: http ${status}`],
              body,
              bodyAccepted: true,
              headers: response.headers,
              ok: status >= 200 && status < 300,
              status,
            });
          } catch (error) {
            reject(error);
          }
        },
      );

      request.setTimeout(20_000, () => {
        request.destroy(new Error(`Request to ${url.toString()} via proxy timed out.`));
      });
      request.on("error", reject);
      request.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function requestText(url: string, options: {
  headers: Record<string, string>;
  isAcceptableBody?: (body: string) => boolean;
  preferProxy?: boolean;
  proxyUrls?: string[];
  webScrapingApiKey?: string;
  webScrapingApiProxy?: WebScrapingApiProxyOptions;
}) {
  const apiKey = options.webScrapingApiKey?.trim();
  const targetUrl = new URL(url);
  const proxyUrls = (options.proxyUrls ?? []).map((proxyUrl) => proxyUrl.trim()).filter(Boolean);
  const proxyStartIndex = proxyUrls.length ? linkedInProxyCursor % proxyUrls.length : 0;
  const proxyAttempts = proxyUrls.length
    ? [...proxyUrls.slice(proxyStartIndex), ...proxyUrls.slice(0, proxyStartIndex)]
      .slice(0, Math.min(getLinkedInProxyAttemptsPerRequest(), proxyUrls.length))
    : [];
  const attempts: string[] = [];
  let lastResponse: TextResponse | null = null;

  for (const [index, proxyUrl] of proxyAttempts.entries()) {
    try {
      const proxyResponse = await fetchTextViaHttpProxy(targetUrl.toString(), {
        headers: options.headers,
        proxy: proxyUrl,
        timeoutMs: networkFetchTimeoutMs,
      });
      const bodyAccepted = options.isAcceptableBody ? options.isAcceptableBody(proxyResponse.text) : true;
      const normalizedResponse = {
        attempts: [
          `proxy ${new URL(proxyUrl).host}: http ${proxyResponse.status}${bodyAccepted ? "" : " (body rejected)"}`,
        ],
        body: proxyResponse.text,
        bodyAccepted,
        headers: proxyResponse.headers,
        ok: proxyResponse.ok,
        status: proxyResponse.status,
      };

      attempts.push(...normalizedResponse.attempts);
      linkedInProxyCursor = (proxyStartIndex + index + 1) % proxyUrls.length;

      if (normalizedResponse.status === 404 || (normalizedResponse.ok && normalizedResponse.bodyAccepted)) {
        return normalizedResponse;
      }

      lastResponse = normalizedResponse;
    } catch (error) {
      attempts.push(`proxy ${new URL(proxyUrl).host}: ${error instanceof Error ? error.message : "request failed"}`);
      linkedInProxyCursor = (proxyStartIndex + index + 1) % proxyUrls.length;
    }
  }

  if (proxyAttempts.length && !options.webScrapingApiProxy && !apiKey) {
    if (lastResponse) {
      return {
        ...lastResponse,
        attempts,
      };
    }

    throw new Error(`Unable to fetch ${url}. ${summarizeAttempts(attempts)}`);
  }

  if (options.webScrapingApiProxy) {
    try {
      const proxyResponse = await fetchTextViaWebScrapingApiProxy(targetUrl.toString(), {
        headers: options.headers,
        proxy: options.webScrapingApiProxy,
        timeoutMs: networkFetchTimeoutMs,
      });
      const bodyAccepted = options.isAcceptableBody ? options.isAcceptableBody(proxyResponse.text) : true;

      return {
        attempts: [...attempts, `webscrapingapi-proxy: http ${proxyResponse.status}${bodyAccepted ? "" : " (body rejected)"}`],
        body: proxyResponse.text,
        bodyAccepted,
        headers: proxyResponse.headers,
        ok: proxyResponse.ok,
        status: proxyResponse.status,
      };
    } catch (error) {
      attempts.push(`webscrapingapi-proxy: ${error instanceof Error ? error.message : "request failed"}`);

      if (!apiKey) {
        throw new Error(`Unable to fetch ${url}. ${summarizeAttempts(attempts)}`);
      }
    }
  }

  if (!apiKey) {
    throw new Error(`Unable to fetch ${url}. ${summarizeAttempts(attempts)}`);
  }

  try {
    const response = await fetchWithTimeout(
      buildWebScrapingApiUrl(targetUrl.toString(), apiKey),
      {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-encoding": "identity",
          "wsa-accept-language": "en-US,en;q=0.9",
          "user-agent": options.headers["user-agent"] ?? linkedInUserAgent,
        },
      },
      `Request to ${targetUrl.origin}${targetUrl.pathname} via WebScrapingAPI timed out.`,
    );
    const body = await response.text();
    const bodyAccepted = options.isAcceptableBody ? options.isAcceptableBody(body) : true;

    return {
      attempts: [`webscrapingapi: http ${response.status}${bodyAccepted ? "" : " (body rejected)"}`],
      body,
      bodyAccepted,
      headers: Object.fromEntries(response.headers.entries()),
      ok: response.ok,
      status: response.status,
    };
  } catch (error) {
    throw new Error(
      `Unable to fetch ${url}. ${summarizeAttempts([
        `webscrapingapi: ${error instanceof Error ? error.message : "request failed"}`,
      ])}`,
    );
  }
}

async function fetchBingMarkdown(
  query: string,
  options: {
    proxyUrls?: string[];
    webScrapingApiKey?: string;
    webScrapingApiProxy?: WebScrapingApiProxyOptions;
  } = {},
) {
  let response: TextResponse;

  try {
    response = await requestText(`https://r.jina.ai/http://www.bing.com/search?q=${encodeURIComponent(query)}`, {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
      proxyUrls: options.proxyUrls,
      webScrapingApiKey: options.webScrapingApiKey,
      webScrapingApiProxy: options.webScrapingApiProxy,
    });
  } catch (error) {
    throw new AdvertiserSearchError(
      error instanceof Error ? error.message : "LinkedIn advertiser search is temporarily unavailable.",
      "unavailable",
    );
  }

  if (response.status === 451) {
    throw new AdvertiserSearchError(
      "LinkedIn advertiser search is rate-limited right now. Try a direct company URL or slug.",
      "rate_limited",
    );
  }

  if (!response.ok) {
    throw new AdvertiserSearchError("LinkedIn advertiser search is temporarily unavailable.", "unavailable");
  }

  const text = response.body;

  if (text.includes("SecurityCompromiseError") || text.includes("DDoS attack suspected")) {
    throw new AdvertiserSearchError(
      "LinkedIn advertiser search is rate-limited right now. Try a direct company URL or slug.",
      "rate_limited",
    );
  }

  if (text.includes("Unable to process this search")) {
    throw new AdvertiserSearchError("LinkedIn advertiser search is temporarily unavailable.", "unavailable");
  }

  return text;
}

async function fetchDuckDuckGoHtml(
  query: string,
  options: {
    proxyUrls?: string[];
    webScrapingApiKey?: string;
    webScrapingApiProxy?: WebScrapingApiProxyOptions;
  } = {},
) {
  let response: TextResponse;

  try {
    response = await requestText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
      proxyUrls: options.proxyUrls,
      webScrapingApiKey: options.webScrapingApiKey,
      webScrapingApiProxy: options.webScrapingApiProxy,
    });
  } catch (error) {
    throw new AdvertiserSearchError(
      error instanceof Error ? error.message : "DuckDuckGo advertiser search is temporarily unavailable.",
      "unavailable",
    );
  }

  if (response.status === 202 || response.status === 429) {
    throw new AdvertiserSearchError("DuckDuckGo advertiser search is rate-limited right now.", "rate_limited");
  }

  if (!response.ok) {
    throw new AdvertiserSearchError("DuckDuckGo advertiser search is temporarily unavailable.", "unavailable");
  }

  return response.body;
}

function buildLinkedInCompanySearchQueries(query: string) {
  const term = query.trim();
  const normalized = normalizeSearchText(term);
  const compact = normalizeCompactText(term);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const queries = new Set<string>([
    `linkedin ${term} company`,
    `site:linkedin.com/company ${term}`,
    `site:linkedin.com/company "${term}"`,
    `"${term}" linkedin company`,
  ]);

  if (normalized && normalized !== term.toLowerCase()) {
    queries.add(`site:linkedin.com/company ${normalized}`);
  }

  if (compact && compact !== normalized) {
    queries.add(`site:linkedin.com/company ${compact}`);
  }

  if (tokens.length === 1) {
    queries.add(`site:linkedin.com/company ${term}.com`);

    for (const suffix of slugSuffixHints) {
      queries.add(`site:linkedin.com/company ${term} ${suffix}`);
      queries.add(`site:linkedin.com/company ${term}${suffix}`);
    }
  }

  return [...queries];
}

function parseDuckDuckGoLinkedInCandidates(html: string) {
  const candidates: LinkedInSearchCandidate[] = [];
  let rank = 0;

  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = cleanText(match[2]) ?? "";
    const targetUrl = decodeDuckDuckGoRedirectUrl(decodeHtmlEntities(match[1]));
    const slug = parseLinkedInCompanyUrl(targetUrl);

    if (!slug) {
      continue;
    }

    candidates.push({
      confidence: Math.max(3, 14 - rank),
      slug,
      title,
      profileUrl: buildLinkedInCompanyUrl(slug),
    });
    rank += 1;
  }

  return candidates;
}

function parseBingLinkedInCandidates(markdown: string) {
  const candidates: LinkedInSearchCandidate[] = [];
  let rank = 0;

  for (const match of markdown.matchAll(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g)) {
    const title = cleanText(match[1].replace(/\*\*/g, "")) ?? "";
    const targetUrl = decodeBingRedirectUrl(match[2]);
    const slug = parseLinkedInCompanyUrl(targetUrl);

    if (!slug) {
      continue;
    }

    candidates.push({
      confidence: Math.max(2, 12 - rank),
      slug,
      title,
      profileUrl: buildLinkedInCompanyUrl(slug),
    });
    rank += 1;
  }

  return candidates;
}

async function searchLinkedInCompanyCandidates(
  query: string,
  options: {
    proxyUrls?: string[];
    webScrapingApiKey?: string;
    webScrapingApiProxy?: WebScrapingApiProxyOptions;
  } = {},
) {
  const searchQueries = buildLinkedInCompanySearchQueries(query);
  const candidates = new Map<string, LinkedInSearchCandidate>();

  for (const searchQuery of searchQueries) {
    try {
      const html = await fetchDuckDuckGoHtml(searchQuery, options);

      for (const candidate of parseDuckDuckGoLinkedInCandidates(html)) {
        if (!candidates.has(candidate.slug)) {
          candidates.set(candidate.slug, candidate);
        }
      }
    } catch (error) {
      if (error instanceof AdvertiserSearchError && error.code === "rate_limited") {
        const markdown = await fetchBingMarkdown(searchQuery, options);

        for (const candidate of parseBingLinkedInCandidates(markdown)) {
          if (!candidates.has(candidate.slug)) {
            candidates.set(candidate.slug, candidate);
          }
        }
      } else {
        throw error;
      }
    }

    if (candidates.size >= 12) {
      break;
    }
  }

  return [...candidates.values()];
}

async function fetchLinkedInCompanyProfile(
  sourceAdvertiserId: string,
  webScrapingApiKey?: string,
  webScrapingApiProxy?: WebScrapingApiProxyOptions,
  proxyUrls?: string[],
) {
  const slug = normalizeLinkedInCompanySlug(sourceAdvertiserId);

  if (!slug) {
    return null;
  }

  if (isE2eFixtureMode()) {
    return buildFixtureProfile(slug);
  }

  if (!webScrapingApiKey?.trim() && !webScrapingApiProxy && !proxyUrls?.length) {
    throw new AdvertiserSearchError(
      "LinkedIn scraping is not configured. Set WEBSCRAPINGAPI_API_KEY, WEBSCRAPINGAPI_PROXY_URL, or WebShare proxy URLs.",
      "unavailable",
    );
  }

  const response = await requestText(buildLinkedInCompanyUrl(slug), {
    headers: {
      "accept-encoding": "identity",
      "user-agent": "Mozilla/5.0",
    },
    isAcceptableBody: (body) => !body.includes("LinkedIn Login, Sign in"),
    proxyUrls,
    webScrapingApiKey,
    webScrapingApiProxy,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new AdvertiserSearchError("LinkedIn advertiser profiles are temporarily unavailable.", "unavailable");
  }

  const html = response.body;

  if (html.includes("LinkedIn Login, Sign in")) {
    throw new AdvertiserSearchError("LinkedIn advertiser profiles are temporarily unavailable.", "unavailable");
  }

  const organization = extractOrganizationSchema(html);
  const profileUrl = parseLinkedInCompanyUrl(organization?.url ?? "") ? buildLinkedInCompanyUrl(slug) : buildLinkedInCompanyUrl(slug);
  const title = extractMetaContent(html, "property", "og:title") ?? extractTitle(html);
  const logoUrl =
    extractMetaContent(html, "property", "og:image") ??
    extractMetaContent(html, "name", "twitter:image");
  const canonicalName = cleanText(organization?.name) ?? title?.replace(/\s*\|\s*LinkedIn\s*$/i, "") ?? titleCaseFromSlug(slug);
  const headquarters = extractAboutUsField(html, "headquarters");
  const industry = extractAboutUsField(html, "industry");
  const companySize = extractAboutUsField(html, "size");
  const websiteUrl = await resolveAdvertiserWebsiteUrl(
    extractAboutUsWebsiteUrl(html) ?? extractAboutUsField(html, "website"),
  );
  const country = getCountryLabel(organization?.address?.addressCountry, headquarters);
  const summary =
    cleanText(organization?.description) ??
    extractMetaContent(html, "property", "og:description") ??
    extractMetaContent(html, "name", "description");

  return normalizeLinkedInAdvertiserMatch({
    sourceAdvertiserId: slug,
    canonicalName,
    profileUrl,
    websiteUrl,
    logoUrl,
    industry,
    companySize,
    country,
    summary,
  });
}

export function normalizeLinkedInAdvertiserMatch(input: {
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
  const sourceAdvertiserId = normalizeLinkedInCompanySlug(input.sourceAdvertiserId);

  return {
    id: buildAdvertiserId(sourceAdvertiserId),
    source: "linkedin" as const,
    sourceAdvertiserId,
    canonicalName: input.canonicalName.trim(),
    profileUrl: buildLinkedInAdvertiserLibraryUrl(sourceAdvertiserId),
    websiteUrl: input.websiteUrl,
    logoUrl: input.logoUrl,
    industry: input.industry,
    companySize: input.companySize,
    country: input.country,
    summary: input.summary,
  };
}

type LinkedInAdCard = {
  adId: string;
  detailUrl: string;
  title?: string;
  body?: string;
  payer?: string;
  format?: string;
  callToAction?: string;
  destinationUrl?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  status?: string;
  firstSeenAt?: Date;
  lastSeenAt?: Date;
  metadata?: Record<string, unknown>;
};

type LinkedInCountryImpression = {
  country: string;
  percentage: string;
};

type LinkedInDocumentSlide = {
  label: string;
  sourceMediaUrl: string;
  sourceThumbnailUrl: string;
  mediaWidth?: number;
  mediaHeight?: number;
};

type LinkedInCarouselCard = LinkedInDocumentSlide & {
  title?: string;
  body?: string;
  callToAction?: string;
  destinationUrl?: string;
};

type LinkedInDocumentCreative = {
  expiresAt?: number;
  manifestUrl?: string;
  pageCount?: number;
  previewPageCount?: number;
  slides: LinkedInDocumentSlide[];
  title?: string;
  type?: string;
};

type LinkedInDocumentPrimaryManifest = {
  perResolutions?: Array<{
    height?: number | null;
    imageManifestUrl?: string | null;
    width?: number | null;
  }> | null;
};

type LinkedInDocumentImageManifest = {
  pages?: string[] | null;
};

const linkedInUserAgent = "Mozilla/5.0";
const linkedInAdLibraryMaxPages = 40;
const linkedInAdLibraryCountry = "GB";
const linkedInAdDetailEnrichmentConcurrency = 2;
const defaultLinkedInProxyAttemptsPerRequest = 3;
let linkedInProxyCursor = Math.floor(Math.random() * 10_000);

function buildJinaProxyUrl(url: string) {
  return `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
}

function getLinkedInProxyAttemptsPerRequest() {
  const configured = Number(process.env.LINKEDIN_PROXY_ATTEMPTS_PER_REQUEST);

  if (Number.isFinite(configured) && configured > 0) {
    return Math.floor(configured);
  }

  return defaultLinkedInProxyAttemptsPerRequest;
}

function decodeEscapedUnicode(value: string) {
  return value.replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function normalizeLinkedInContent(value: string) {
  return decodeHtmlEntities(decodeEscapedUnicode(value))
    .replace(/\\\//g, "/")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\");
}

type PaginationCursor = {
  requestParam: "fragmentToken" | "pageToken";
  value: string;
};

async function fetchPageContent(
  url: string,
  webScrapingApiKey?: string,
  proxyUrls?: string[],
  webScrapingApiProxy?: WebScrapingApiProxyOptions,
) {
  if (!webScrapingApiKey?.trim() && !webScrapingApiProxy && !proxyUrls?.length) {
    throw new AdvertiserSearchError(
      "LinkedIn scraping is not configured. Set WEBSCRAPINGAPI_API_KEY, WEBSCRAPINGAPI_PROXY_URL, or WebShare proxy URLs.",
      "unavailable",
    );
  }

  const response = await requestText(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "accept-encoding": "identity",
      "user-agent": linkedInUserAgent,
    },
    isAcceptableBody: (body) => !body.includes("LinkedIn Login, Sign in"),
    proxyUrls,
    webScrapingApiKey,
    webScrapingApiProxy,
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.bodyAccepted) {
    throw new AdvertiserSearchError(
      `LinkedIn ad pages are temporarily unavailable (${summarizeAttempts(response.attempts)}).`,
      "unavailable",
    );
  }

  if (!response.ok) {
    throw new AdvertiserSearchError(
      `LinkedIn ad pages are temporarily unavailable (${summarizeAttempts(response.attempts)}).`,
      "unavailable",
    );
  }

  return response.body;
}

async function fetchLinkedInPublicPage(
  url: string,
  webScrapingApiKey?: string,
  proxyUrls?: string[],
  webScrapingApiProxy?: WebScrapingApiProxyOptions,
) {
  return fetchPageContent(url, webScrapingApiKey, proxyUrls, webScrapingApiProxy);
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;

        nextIndex += 1;
        await worker(items[currentIndex], currentIndex);
      }
    }),
  );
}

async function enrichLinkedInAdCards(
  cards: LinkedInAdCard[],
  sourceAdvertiserId: string,
  webScrapingApiKey?: string,
  proxyUrls?: string[],
  webScrapingApiProxy?: WebScrapingApiProxyOptions,
) {
  const hydratedCards = [...cards];

  await runPool(hydratedCards, linkedInAdDetailEnrichmentConcurrency, async (card) => {
    const detailContent = await fetchLinkedInPublicPage(card.detailUrl, webScrapingApiKey, proxyUrls, webScrapingApiProxy).catch(() => null);

    if (!detailContent) {
      card.metadata = {
        ...(card.metadata ?? {}),
        detailValidationFailed: true,
      };
      return;
    }

    const detailPageCard = extractLinkedInAdCardFromDetailPage(detailContent, card.adId, card.payer ?? "");

    if (
      !isLinkedInAdvertiserCompatible(detailPageCard.payer, card.payer) ||
      !isLinkedInAdvertiserCompatibleWithSource(detailPageCard.payer, sourceAdvertiserId)
    ) {
      card.metadata = {
        ...(card.metadata ?? {}),
        detailAdvertiserMismatch: true,
        detailAdvertiserName: detailPageCard.payer,
      };
      return;
    }

    Object.assign(card, await hydrateLinkedInDocumentSlides(mergeAdCards(card, detailPageCard)));
  });

  return hydratedCards.filter((card) => !card.metadata?.detailAdvertiserMismatch && !card.metadata?.detailValidationFailed);
}

function resolveAdLibraryDateOption(options?: FetchAdvertiserAdsOptions) {
  if (!options?.since) {
    return "last-30-days";
  }

  const now = options.until ?? new Date();
  const windowDays = Math.max(1, Math.ceil((now.getTime() - options.since.getTime()) / 86_400_000));

  if (windowDays <= 30) {
    return "last-30-days";
  }

  if (windowDays <= 90) {
    return "last-90-days";
  }

  return "last-year";
}

function resolveAdLibraryCountry() {
  return linkedInAdLibraryCountry;
}

function buildLinkedInAdLibraryUrl(sourceAdvertiserId: string, options?: FetchAdvertiserAdsOptions) {
  const url = new URL("https://www.linkedin.com/ad-library/search");

  url.searchParams.set("accountOwner", normalizeLinkedInCompanySlug(sourceAdvertiserId));
  url.searchParams.set("countries", resolveAdLibraryCountry());
  url.searchParams.set("dateOption", resolveAdLibraryDateOption(options));

  return url;
}

function buildLinkedInAdDetailUrl(adId: string) {
  return `https://www.linkedin.com/ad-library/detail/${adId}`;
}

function parseDateCandidate(value: string) {
  const cleaned = cleanText(value)?.replace(/\.+$/, "");

  if (!cleaned) {
    return undefined;
  }

  const englishMonthDate = cleaned.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),\s*(\d{4})$/i);

  if (englishMonthDate) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
      englishMonthDate[1].slice(0, 3).toLowerCase(),
    );
    const parsedMonthDate = new Date(Date.UTC(Number(englishMonthDate[3]), month, Number(englishMonthDate[2]), 0, 0, 0, 0));

    if (!Number.isNaN(parsedMonthDate.getTime())) {
      return parsedMonthDate;
    }
  }

  const asNumber = Number(cleaned);

  if (Number.isFinite(asNumber)) {
    const timestamp = cleaned.length >= 13 ? asNumber : asNumber * 1_000;
    const parsedTimestamp = new Date(timestamp);

    if (!Number.isNaN(parsedTimestamp.getTime())) {
      return parsedTimestamp;
    }
  }

  const normalized = cleaned
    .replace(/(\d{4})-(\d{2})-(\d{2})/g, "$1/$2/$3")
    .replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, "$3-$1-$2");
  const parsed = new Date(normalized);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return undefined;
}

function pickFirstMatching(content: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    const candidate = cleanText(match?.[1]);

    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function pickFirstMatchingMultiline(content: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    const candidate = cleanMultilineText(match?.[1]);

    if (candidate) {
      return candidate;
    }
  }

  return undefined;
}

function pickFirstUrl(content: string, patterns: RegExp[], options?: { allowLinkedIn?: boolean }) {
  for (const pattern of patterns) {
    const match = pattern.exec(content);
    const rawValue = match?.[1];

    if (!rawValue) {
      continue;
    }

    const cleaned = decodeHtmlEntities(rawValue).replace(/\\u002F/gi, "/").replace(/\\\//g, "/");

    try {
      const url = new URL(cleaned);

      if (!options?.allowLinkedIn && url.hostname.includes("linkedin.com")) {
        continue;
      }

      return url.toString();
    } catch {
      continue;
    }
  }

  return undefined;
}

function pickAttributeValue(content: string, attributeName: string) {
  const match = new RegExp(`${attributeName}=["']([^"']+)["']`, "i").exec(content);

  return match?.[1] ? decodeHtmlEntities(match[1]) : undefined;
}

function parseLinkedInCarouselCards(content: string): LinkedInCarouselCard[] {
  const creativeType = pickLinkedInCreativeType(content)?.toLowerCase() ?? "";

  if (!creativeType.includes("carousel") && !/sponsored-update-carousel-preview|slide-list__list/i.test(content)) {
    return [];
  }

  const cards: LinkedInCarouselCard[] = [];
  const imageMatches = [...content.matchAll(/<img\b[^>]*class=["'][^"']*ad-preview__dynamic-dimensions-image[^"']*["'][^>]*>/gi)];

  for (const [index, match] of imageMatches.entries()) {
    const imageHtml = match[0];
    const sourceMediaUrl = cleanText(pickAttributeValue(imageHtml, "data-delayed-url") ?? pickAttributeValue(imageHtml, "src"));

    if (!sourceMediaUrl) {
      continue;
    }

    const nextMatch = imageMatches[index + 1];
    const segment = content.slice(match.index ?? 0, nextMatch?.index ?? content.length);
    const width = Number.parseInt(pickAttributeValue(imageHtml, "width") ?? "", 10);
    const height = Number.parseInt(pickAttributeValue(imageHtml, "height") ?? "", 10);
    const title =
      pickFirstMatching(segment, [
        /<span[^>]*class="[^"]*line-clamp-2[^"]*"[^>]*>([\s\S]{1,500}?)<\/span>/i,
        /<h2[^>]*>([\s\S]{1,500}?)<\/h2>/i,
      ]) ?? cleanText(pickAttributeValue(imageHtml, "alt"));
    const destinationUrl = pickFirstUrl(segment, [
      /<a[^>]*href="([^"]+)"[^>]*data-tracking-control-name="ad_library_ad_preview_content_image"/i,
      /<a[^>]*data-tracking-control-name="ad_library_ad_preview_content_image"[^>]*href="([^"]+)"/i,
      /<a[^>]*href="([^"]+)"[^>]*>/i,
    ], { allowLinkedIn: true });

    cards.push({
      label: `Card ${cards.length + 1}`,
      title,
      destinationUrl,
      sourceMediaUrl,
      sourceThumbnailUrl: sourceMediaUrl,
      mediaWidth: Number.isFinite(width) && width > 0 ? width : undefined,
      mediaHeight: Number.isFinite(height) && height > 0 ? height : undefined,
    });
  }

  return cards;
}

function parseVideoSourcesAttribute(rawValue: string) {
  const decoded = decodeHtmlEntities(rawValue).replace(/\\u002F/gi, "/").replace(/\\\//g, "/");

  try {
    const parsed = JSON.parse(decoded);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter((candidate): candidate is { src: string; type?: string; bitrate?: number } => {
        return Boolean(
          candidate &&
          typeof candidate === "object" &&
          typeof (candidate as { src?: unknown }).src === "string",
        );
      })
      .map((candidate) => ({
        src: candidate.src,
        type: typeof candidate.type === "string" ? candidate.type : undefined,
        bitrate: typeof candidate.bitrate === "number" ? candidate.bitrate : undefined,
      }));
  } catch {
    return [];
  }
}

function pickBestVideoUrlFromSources(content: string) {
  const matches = content.matchAll(/data-sources="(\[[\s\S]*?\])"/gi);
  let bestCandidate: { url: string; bitrate: number } | null = null;

  for (const match of matches) {
    const rawValue = match[1];

    if (!rawValue) {
      continue;
    }

    for (const candidate of parseVideoSourcesAttribute(rawValue)) {
      if (candidate.type && !candidate.type.startsWith("video/")) {
        continue;
      }

      try {
        const url = new URL(candidate.src);

        if (url.hostname.includes("linkedin.com")) {
          continue;
        }

        const bitrate = candidate.bitrate ?? 0;

        if (!bestCandidate || bitrate > bestCandidate.bitrate) {
          bestCandidate = {
            url: url.toString(),
            bitrate,
          };
        }
      } catch {
        continue;
      }
    }
  }

  return bestCandidate?.url;
}

function pickDate(content: string, keys: string[]) {
  const patterns = keys.map(
    (key) =>
      new RegExp(`["']${key}["']\\s*:\\s*(?:"([^"]+)"|'([^']+)'|(\\d{10,13}))`, "i"),
  );

  for (const pattern of patterns) {
    const match = pattern.exec(content);
    const candidate = match?.[1] ?? match?.[2] ?? match?.[3];
    const parsed = candidate ? parseDateCandidate(candidate) : undefined;

    if (parsed) {
      return parsed;
    }
  }

  const labelPatterns = keys.map(
    (key) => new RegExp(`${key}\\s*[:|-]\\s*([^\\n]+)`, "i"),
  );

  for (const pattern of labelPatterns) {
    const parsed = parseDateCandidate(pattern.exec(content)?.[1] ?? "");

    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

function parseLinkedInRunEndDate(value: string) {
  const cleaned = cleanText(value);

  if (!cleaned || /^(?:now|present|current|today|actual|actualidad|presente)$/i.test(cleaned)) {
    return undefined;
  }

  return parseDateCandidate(cleaned);
}

function pickLinkedInRunDates(content: string) {
  const match =
    content.match(/Ran from\s+([\s\S]{1,120}?)\s+to\s+([\s\S]{1,120}?)(?:<\/p>|<|$)/i) ??
    content.match(/(?:Started|Start date)\s*[:|-]\s*([\s\S]{1,120}?)(?:\n|<|$)[\s\S]{0,240}?(?:Ended|End date)\s*[:|-]\s*([\s\S]{1,120}?)(?:\n|<|$)/i);

  if (!match?.[1]) {
    return {
      firstSeenAt: undefined,
      lastSeenAt: undefined,
    };
  }

  return {
    firstSeenAt: parseDateCandidate(cleanText(match[1]) ?? ""),
    lastSeenAt: match[2] ? parseLinkedInRunEndDate(match[2]) : undefined,
  };
}

function pickLinkedInSponsoredMessageBody(content: string) {
  return pickFirstMatchingMultiline(content, [
    /<p[^>]*class="[^"]*sponsored-message__content[^"]*"[^>]*>([\s\S]{1,8000}?)<\/p>\s*<button[^>]*sponsored-message__truncation-button/i,
    /<div[^>]*class="[^"]*sponsored-message__content[^"]*"[^>]*>([\s\S]{1,8000}?)<\/div>/i,
  ]);
}

function pickLinkedInSponsoredMessageSender(content: string) {
  return pickFirstMatching(content, [
    /<p[^>]*class="[^"]*font-semibold[^"]*text-md[^"]*"[^>]*>([\s\S]{1,180}?)<\/p>\s*<p[^>]*class="[^"]*sponsored-message__content/i,
    /<p[^>]*class="[^"]*font-semibold[^"]*"[^>]*>([\s\S]{1,180}?)<\/p>\s*<p[^>]*class="[^"]*sponsored-message__content/i,
  ]);
}

function pickLinkedInButtonText(content: string) {
  return pickFirstMatching(content, [
    /<a[^>]*data-tracking-control-name="ad_library_ad_detail_cta"[^>]*>([\s\S]{1,240}?)<\/a>/i,
    /<a[^>]*data-tracking-control-name="ad_library_ad_preview_cta"[^>]*>([\s\S]{1,240}?)<\/a>/i,
    /<a[^>]*data-tracking-control-name="ad_library_ad_cta"[^>]*>([\s\S]{1,240}?)<\/a>/i,
    /<a[^>]*class="[^"]*(?:cta|call-to-action)[^"]*"[^>]*>([\s\S]{1,240}?)<\/a>/i,
    /<button[^>]*data-tracking-control-name="ad_library_ad_detail_cta"[^>]*>([\s\S]{1,240}?)<\/button>/i,
    /<button[^>]*data-tracking-control-name="ad_library_ad_preview_cta"[^>]*>([\s\S]{1,240}?)<\/button>/i,
    /<button[^>]*class="[^"]*btn[^"]*"[^>]*>([^<]{1,120})<\/button>/i,
    /<a[^>]*class="[^"]*btn[^"]*"[^>]*>([^<]{1,120})<\/a>/i,
    /"callToAction"\s*:\s*"([^"]+)"/i,
    /"ctaText"\s*:\s*"([^"]+)"/i,
  ]);
}

function pickLinkedInCreativeType(content: string) {
  const rawType = pickFirstMatching(content, [
    /data-creative-type="([^"]{1,120})"/i,
    /"creativeType"\s*:\s*"([^"]{1,120})"/i,
  ]);
  const normalizedType = rawType?.toLowerCase().replace(/[_\s]+/g, "-");

  if (!normalizedType) {
    return undefined;
  }

  if (normalizedType.includes("inmail") || normalizedType.includes("message")) {
    return "Message Ad";
  }

  return rawType;
}

function parseLinkedInNativeDocumentConfig(content: string): LinkedInDocumentCreative | null {
  const rawConfig = content.match(/data-native-document-config="([\s\S]*?)"/i)?.[1];

  if (!rawConfig) {
    return null;
  }

  try {
    const parsed = JSON.parse(decodeHtmlEntities(rawConfig)) as {
      doc?: {
        coverPages?: Array<{
          config?: {
            src?: string | null;
          } | null;
        }> | null;
        expiresAt?: number | null;
        height?: number | null;
        manifestUrl?: string | null;
        subtitle?: string | null;
        title?: string | null;
        totalPageCount?: number | null;
        type?: string | null;
        width?: number | null;
      } | null;
    };
    const doc = parsed.doc;

    if (!doc) {
      return null;
    }

    const width = typeof doc.width === "number" && Number.isFinite(doc.width) ? doc.width : undefined;
    const height = typeof doc.height === "number" && Number.isFinite(doc.height) ? doc.height : undefined;
    const slides = (doc.coverPages ?? [])
      .map<LinkedInDocumentSlide | null>((page, index) => {
        const sourceMediaUrl = cleanText(page?.config?.src);

        if (!sourceMediaUrl) {
          return null;
        }

        return {
          label: index === 0 ? "Cover" : `Slide ${index + 1}`,
          sourceMediaUrl,
          sourceThumbnailUrl: sourceMediaUrl,
          mediaWidth: width,
          mediaHeight: height,
        } satisfies LinkedInDocumentSlide;
      })
      .filter((slide): slide is LinkedInDocumentSlide => Boolean(slide));

    if (!slides.length) {
      return null;
    }

    const previewPageCount = Number(cleanText(doc.subtitle)?.match(/(\d+)\s+(?:of|de)\s+(\d+)/i)?.[1] ?? "");

    return {
      expiresAt: typeof doc.expiresAt === "number" && Number.isFinite(doc.expiresAt) ? doc.expiresAt : undefined,
      manifestUrl: cleanText(doc.manifestUrl),
      pageCount: typeof doc.totalPageCount === "number" && Number.isFinite(doc.totalPageCount) ? doc.totalPageCount : undefined,
      previewPageCount: Number.isFinite(previewPageCount) && previewPageCount > 0 ? previewPageCount : slides.length,
      slides,
      title: cleanText(doc.title),
      type: cleanText(doc.type),
    };
  } catch {
    return null;
  }
}

async function fetchLinkedInDocumentManifestSlides(input: {
  fallbackSlides: LinkedInDocumentSlide[];
  manifestUrl: string;
}) {
  try {
    const manifestResponse = await fetchWithTimeout(
      input.manifestUrl,
      {
        headers: {
          accept: "application/json,text/plain,*/*",
          "user-agent": linkedInUserAgent,
        },
      },
      "LinkedIn document manifest request timed out.",
    );

    if (!manifestResponse.ok) {
      return input.fallbackSlides;
    }

    const manifest = (await manifestResponse.json()) as LinkedInDocumentPrimaryManifest;
    const resolution = (manifest.perResolutions ?? [])
      .filter((candidate) => cleanText(candidate.imageManifestUrl))
      .sort((left, right) => {
        const leftWidth = typeof left.width === "number" ? left.width : Number.MAX_SAFE_INTEGER;
        const rightWidth = typeof right.width === "number" ? right.width : Number.MAX_SAFE_INTEGER;

        return Math.abs(leftWidth - 480) - Math.abs(rightWidth - 480);
      })[0];
    const imageManifestUrl = cleanText(resolution?.imageManifestUrl);

    if (!imageManifestUrl) {
      return input.fallbackSlides;
    }

    const imageManifestResponse = await fetchWithTimeout(
      imageManifestUrl,
      {
        headers: {
          accept: "application/json,text/plain,*/*",
          "user-agent": linkedInUserAgent,
        },
      },
      "LinkedIn document image manifest request timed out.",
    );

    if (!imageManifestResponse.ok) {
      return input.fallbackSlides;
    }

    const imageManifest = (await imageManifestResponse.json()) as LinkedInDocumentImageManifest;
    const pages = (imageManifest.pages ?? []).map((page) => cleanText(page)).filter((page): page is string => Boolean(page));

    if (!pages.length) {
      return input.fallbackSlides;
    }

    const width = typeof resolution?.width === "number" && Number.isFinite(resolution.width) ? resolution.width : undefined;
    const height = typeof resolution?.height === "number" && Number.isFinite(resolution.height) ? resolution.height : undefined;

    return pages.map((sourceMediaUrl, index) => ({
      label: index === 0 ? "Cover" : `Slide ${index + 1}`,
      sourceMediaUrl,
      sourceThumbnailUrl: sourceMediaUrl,
      mediaWidth: width,
      mediaHeight: height,
    })) satisfies LinkedInDocumentSlide[];
  } catch {
    return input.fallbackSlides;
  }
}

async function hydrateLinkedInDocumentSlides(card: LinkedInAdCard) {
  const metadata = card.metadata ?? {};
  const manifestUrl =
    typeof metadata.linkedInDocumentManifestUrl === "string" ? cleanText(metadata.linkedInDocumentManifestUrl) : undefined;
  const fallbackSlides = Array.isArray(metadata.linkedInDocumentSlides)
    ? metadata.linkedInDocumentSlides.filter(
        (slide): slide is LinkedInDocumentSlide => Boolean(slide && typeof slide === "object" && !Array.isArray(slide)),
      )
    : [];

  if (!manifestUrl || !fallbackSlides.length) {
    return card;
  }

  const slides = await fetchLinkedInDocumentManifestSlides({
    fallbackSlides,
    manifestUrl,
  });

  if (slides === fallbackSlides) {
    return card;
  }

  return {
    ...card,
    mediaUrl: slides[0]?.sourceMediaUrl ?? card.mediaUrl,
    thumbnailUrl: slides[0]?.sourceThumbnailUrl ?? card.thumbnailUrl,
    metadata: {
      ...metadata,
      linkedInDocumentPreviewPageCount: slides.length,
      linkedInDocumentSlides: slides,
    },
  } satisfies LinkedInAdCard;
}

function pickLinkedInTotalImpressions(content: string) {
  return pickFirstMatching(content, [
    /<p[^>]*>\s*Total Impressions\s*<\/p>\s*<p[^>]*>\s*([^<]{1,80})\s*<\/p>/i,
    /Total Impressions\s*([0-9][0-9.,kKmM\s-]{0,40})/i,
  ]);
}

function pickLinkedInCountryImpressions(content: string): LinkedInCountryImpression[] {
  const countries: LinkedInCountryImpression[] = [];

  for (const match of content.matchAll(/ad-analytics__country-impressions[\s\S]*?<p[^>]*font-semibold[^>]*>([\s\S]{1,120}?)<\/p>[\s\S]*?<p[^>]*text-right[^>]*>([\s\S]{1,80}?)<\/p>/gi)) {
    const country = cleanText(match[1]);
    const percentage = cleanText(match[2]);

    if (country && percentage) {
      countries.push({ country, percentage });
    }
  }

  return countries;
}

function normalizeAdFormat(value?: string) {
  if (!value) {
    return undefined;
  }

  const normalized = value
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");

  if (normalized.includes("text") || normalized.includes("texto") || normalized.includes("texte") || normalized.includes("tekst")) {
    return "text";
  }

  if (normalized.includes("document") || normalized.includes("documento") || normalized.includes("native-document")) {
    return "document";
  }

  if (normalized.includes("follow")) {
    return "follow-company-ad";
  }

  return normalized;
}

function normalizeAdvertiserLabel(value?: string) {
  return normalizeSearchText(value ?? "");
}

function normalizeAdvertiserCompact(value?: string) {
  return normalizeCompactText(value ?? "");
}

function isLinkedInAdvertiserCompatible(left?: string, right?: string) {
  const leftCompact = normalizeAdvertiserCompact(left);
  const rightCompact = normalizeAdvertiserCompact(right);

  if (!leftCompact || !rightCompact) {
    return true;
  }

  if (leftCompact === rightCompact) {
    return true;
  }

  return leftCompact.startsWith(rightCompact) || rightCompact.startsWith(leftCompact);
}

function isLinkedInAdvertiserCompatibleWithSource(advertiser: string | undefined, sourceAdvertiserId: string) {
  const advertiserLabel = normalizeAdvertiserLabel(advertiser);
  const advertiserCompact = normalizeAdvertiserCompact(advertiser);
  const sourceCompact = normalizeAdvertiserCompact(titleCaseFromSlug(sourceAdvertiserId));
  const sourceTokens = normalizeAdvertiserLabel(titleCaseFromSlug(sourceAdvertiserId)).split(/\s+/).filter(Boolean);

  if (!advertiserCompact || !sourceCompact) {
    return true;
  }

  if (advertiserCompact === sourceCompact || advertiserCompact.startsWith(sourceCompact)) {
    return true;
  }

  if (sourceTokens.length > 1) {
    const advertiserTokens = advertiserLabel.split(/\s+/).filter(Boolean);
    return sourceTokens.every((token, index) => advertiserTokens[index] === token);
  }

  return false;
}

function mergeAdCards(existing: LinkedInAdCard | undefined, incoming: LinkedInAdCard): LinkedInAdCard {
  if (!existing) {
    return incoming;
  }

  return {
    ...existing,
    ...incoming,
    title: incoming.title ?? existing.title,
    body: incoming.body ?? existing.body,
    payer: incoming.payer ?? existing.payer,
    format: incoming.format ?? existing.format,
    callToAction: incoming.callToAction ?? existing.callToAction,
    destinationUrl: incoming.destinationUrl ?? existing.destinationUrl,
    mediaUrl: incoming.mediaUrl ?? existing.mediaUrl,
    thumbnailUrl: incoming.thumbnailUrl ?? existing.thumbnailUrl,
    videoUrl: incoming.videoUrl ?? existing.videoUrl,
    status: incoming.status ?? existing.status,
    firstSeenAt: incoming.firstSeenAt ?? existing.firstSeenAt,
    lastSeenAt: incoming.lastSeenAt ?? existing.lastSeenAt,
    metadata: {
      ...(existing.metadata ?? {}),
      ...(incoming.metadata ?? {}),
    },
  };
}

function pickLinkedInTextAdCopy(content: string) {
  const rawCopy = pickFirstMatching(content, [
    /<div[^>]*class="[^"]*font-semibold[^"]*text-sm[^"]*break-words[^"]*leading-\[18px\][^"]*"[^>]*>([\s\S]{1,1200}?)<\/div>/i,
  ]);

  if (!rawCopy) {
    return null;
  }

  const [titlePart, ...bodyParts] = rawCopy.split(/\s+-\s+/);
  const title = cleanText(titlePart);
  const body = cleanText(bodyParts.join(" - "));

  if (!title && !body) {
    return null;
  }

  return {
    title,
    body,
  };
}

function extractLinkedInAdCards(content: string, fallbackPayer: string, sourceAdvertiserId: string) {
  const normalizedContent = normalizeLinkedInContent(content);
  const cards = new Map<string, LinkedInAdCard>();
  const blockPattern = /<li class="search-result-item[\s\S]*?<\/li>/gi;

  for (const blockMatch of normalizedContent.matchAll(blockPattern)) {
    const block = blockMatch[0];
    const adId = block.match(/(?:https?:\/\/www\.linkedin\.com)?\/ad-library\/detail\/(\d{6,})/i)?.[1];

    if (!adId) {
      continue;
    }

    const thumbnailUrl = pickFirstUrl(block, [
      /<img[^>]*class="ad-preview__dynamic-dimensions-image[^"]*"[^>]*data-delayed-url="([^"]+)"/i,
      /<img[^>]*data-delayed-url="([^"]+)"[^>]*class="ad-preview__dynamic-dimensions-image[^"]*"/i,
      /"thumbnailUrl"\s*:\s*"([^"]+)"/i,
      /"imageUrl"\s*:\s*"([^"]+)"/i,
    ]);
    const videoUrl = pickBestVideoUrlFromSources(block) ?? pickFirstUrl(block, [
      /<source[^>]*src="([^"]+)"[^>]*type="video\//i,
      /<video[^>]*src="([^"]+)"/i,
      /<video[^>]*data-delayed-url="([^"]+)"/i,
      /"videoUrl"\s*:\s*"([^"]+)"/i,
      /"streamingUrl"\s*:\s*"([^"]+)"/i,
      /"playbackUrl"\s*:\s*"([^"]+)"/i,
      /"progressiveUrl"\s*:\s*"([^"]+)"/i,
      /"contentUrl"\s*:\s*"([^"]+)"/i,
    ]);
    const textAdCopy = pickLinkedInTextAdCopy(block);
    const card: LinkedInAdCard = {
      adId,
      detailUrl: buildLinkedInAdDetailUrl(adId),
      title: pickFirstMatching(block, [
        /<a[^>]*data-tracking-control-name="ad_library_ad_preview_headline_content"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]{1,280}?)<\/h2>/i,
        /<h2[^>]*class="text-sm font-semibold[^"]*"[^>]*>([\s\S]{1,280}?)<\/h2>/i,
        /<img[^>]*class="ad-preview__dynamic-dimensions-image[^"]*"[^>]*alt="([^"]{1,280})"/i,
        /"headline"\s*:\s*"([^"]{1,280})"/i,
        /"title"\s*:\s*"([^"]{1,280})"/i,
        /headline\s*[:|-]\s*([^\n]+)/i,
      ]) ?? textAdCopy?.title,
      body: pickFirstMatching(block, [
        /<p[^>]*class="commentary__content[^"]*"[^>]*>([\s\S]{1,4000}?)<\/p>/i,
        /"body"\s*:\s*"([^"]{1,4000})"/i,
        /"adCopy"\s*:\s*"([^"]{1,4000})"/i,
        /description\s*[:|-]\s*([^\n]+)/i,
      ]) ?? textAdCopy?.body,
      payer:
        pickFirstMatching(block, [
          /aria-label="View organization page for ([^"]{1,280})"/i,
          /<div[^>]*class="block text-md[^"]*"[^>]*>([\s\S]{1,280}?)<\/div>/i,
          /"advertiserName"\s*:\s*"([^"]{1,280})"/i,
          /"paidBy"\s*:\s*"([^"]{1,280})"/i,
          /advertiser\s*[:|-]\s*([^\n]+)/i,
        ]) ?? fallbackPayer,
      format: normalizeAdFormat(
        pickFirstMatching(block, [
          /aria-label="[^"]+,\s*([^,"]{1,120}),\s*View details"/i,
          /<p[^>]*>\s*([^<]{1,120}\s+Ad)\s*<\/p>/i,
          /"creativeFormat"\s*:\s*"([^"]+)"/i,
          /"format"\s*:\s*"([^"]+)"/i,
          /"adType"\s*:\s*"([^"]+)"/i,
        ]),
      ),
      callToAction: pickLinkedInButtonText(block) ?? pickFirstMatching(block, [
        /call to action\s*[:|-]\s*([^\n]+)/i,
      ]),
      destinationUrl: pickFirstUrl(block, [
        /<a[^>]*href="([^"]+)"[^>]*data-tracking-control-name="ad_library_ad_preview_content_image"/i,
        /<a[^>]*href="([^"]+)"[^>]*data-tracking-control-name="ad_library_ad_preview_headline_content"/i,
        /<a[^>]*href="([^"]+)"[^>]*class="sponsored-content-headline[^"]*"/i,
        /"destinationUrl"\s*:\s*"([^"]+)"/i,
        /"landingPageUrl"\s*:\s*"([^"]+)"/i,
        /"clickThroughUrl"\s*:\s*"([^"]+)"/i,
      ]),
      mediaUrl: thumbnailUrl ?? videoUrl ?? pickFirstUrl(block, [
        /"mediaUrl"\s*:\s*"([^"]+)"/i,
      ]),
      thumbnailUrl,
      videoUrl,
      status:
        pickFirstMatching(block, [
          /"status"\s*:\s*"([^"]+)"/i,
        ])?.toLowerCase() ?? undefined,
      firstSeenAt: pickDate(block, ["firstSeenAt", "startedAt", "runStartDate", "servedStartTime", "createdAt"]),
      lastSeenAt: pickDate(block, ["lastSeenAt", "endedAt", "runEndDate", "servedEndTime", "updatedAt"]),
      metadata: {
        detailUrl: buildLinkedInAdDetailUrl(adId),
      },
    };

    if (!isLinkedInAdvertiserCompatibleWithSource(card.payer, sourceAdvertiserId)) {
      continue;
    }

    cards.set(adId, mergeAdCards(cards.get(adId), card));
  }

  return [...cards.values()];
}

function extractLinkedInAdCardFromDetailPage(content: string, adId: string, fallbackPayer: string): LinkedInAdCard {
  const normalizedContent = normalizeLinkedInContent(content);
  const documentCreative = parseLinkedInNativeDocumentConfig(content);
  const runDates = pickLinkedInRunDates(normalizedContent);
  const sponsoredMessageSender = pickLinkedInSponsoredMessageSender(normalizedContent);
  const sponsoredMessageBody = pickLinkedInSponsoredMessageBody(normalizedContent);
  const totalImpressions = pickLinkedInTotalImpressions(normalizedContent);
  const countryImpressions = pickLinkedInCountryImpressions(normalizedContent);
  const thumbnailUrl = pickFirstUrl(normalizedContent, [
    /<img[^>]*class="ad-preview__dynamic-dimensions-image[^"]*"[^>]*data-delayed-url="([^"]+)"/i,
    /<img[^>]*data-delayed-url="([^"]+)"[^>]*class="ad-preview__dynamic-dimensions-image[^"]*"/i,
    /<video[^>]*poster="([^"]+)"/i,
    /"thumbnailUrl"\s*:\s*"([^"]+)"/i,
    /"imageUrl"\s*:\s*"([^"]+)"/i,
  ]);
  const videoUrl = pickBestVideoUrlFromSources(normalizedContent) ?? pickFirstUrl(normalizedContent, [
    /<source[^>]*src="([^"]+)"[^>]*type="video\//i,
    /<video[^>]*src="([^"]+)"/i,
    /<video[^>]*data-delayed-url="([^"]+)"/i,
    /"videoUrl"\s*:\s*"([^"]+)"/i,
    /"streamingUrl"\s*:\s*"([^"]+)"/i,
    /"playbackUrl"\s*:\s*"([^"]+)"/i,
    /"progressiveUrl"\s*:\s*"([^"]+)"/i,
    /"contentUrl"\s*:\s*"([^"]+)"/i,
  ]);
  const textAdCopy = pickLinkedInTextAdCopy(normalizedContent);
  const carouselCards = parseLinkedInCarouselCards(normalizedContent);
  const primaryCarouselCard = carouselCards[0];

  return {
    adId,
    detailUrl: buildLinkedInAdDetailUrl(adId),
    title: pickFirstMatching(normalizedContent, [
      /<div[^>]*class="[^"]*ad-preview[^"]*"[^>]*data-creative-type="JOBS_V2"[\s\S]{1,2400}?<h2[^>]*>([\s\S]{1,280}?)<\/h2>/i,
      /<a[^>]*data-tracking-control-name="ad_library_ad_preview_headline_content"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]{1,280}?)<\/h2>/i,
      /<h2[^>]*class="text-sm font-semibold[^"]*"[^>]*>([\s\S]{1,280}?)<\/h2>/i,
      /<img[^>]*class="ad-preview__dynamic-dimensions-image[^"]*"[^>]*alt="([^"]{1,280})"/i,
    ]) ?? textAdCopy?.title ?? documentCreative?.title ?? (sponsoredMessageSender ? `Message from ${sponsoredMessageSender}` : undefined),
    body: pickFirstMatchingMultiline(normalizedContent, [
      /<p[^>]*class="commentary__content[^"]*"[^>]*>([\s\S]{1,4000}?)<\/p>/i,
    ]) ?? textAdCopy?.body ?? sponsoredMessageBody,
    payer:
      pickFirstMatching(normalizedContent, [
        /aria-label="View organization page for ([^"]{1,280})"/i,
        /Paid for by ([^<]{1,280})<\/p>/i,
      ]) ?? fallbackPayer,
    format: normalizeAdFormat(
      pickFirstMatching(normalizedContent, [
        /<p[^>]*class="text-sm mb-1 text-color-text leading-\[18px\]">([^<]{1,120})<\/p>/i,
        /<p[^>]*class="[^"]*text-sm[^"]*text-color-text[^"]*"[^>]*>\s*([^<]{1,120}\s+Ad)\s*<\/p>/i,
        /aria-label="[^"]+,\s*([^,"]{1,120}),\s*View details"/i,
      ]) ?? pickLinkedInCreativeType(normalizedContent),
    ),
    callToAction: pickLinkedInButtonText(normalizedContent),
    destinationUrl: pickFirstUrl(normalizedContent, [
      /<a[^>]*href="([^"]+)"[^>]*data-tracking-control-name="ad_library_ad_detail_cta"/i,
      /<a[^>]*data-tracking-control-name="ad_library_ad_detail_cta"[^>]*href="([^"]+)"/i,
    ], { allowLinkedIn: true }) ?? pickFirstUrl(normalizedContent, [
      /<a[^>]*href="([^"]+)"[^>]*data-tracking-control-name="ad_library_ad_preview_content_image"/i,
      /<a[^>]*href="([^"]+)"[^>]*data-tracking-control-name="ad_library_ad_preview_headline_content"/i,
      /<a[^>]*href="([^"]+)"[^>]*class="sponsored-content-headline[^"]*"/i,
    ]),
    mediaUrl: primaryCarouselCard?.sourceMediaUrl ?? thumbnailUrl ?? videoUrl ?? documentCreative?.slides[0]?.sourceMediaUrl,
    thumbnailUrl: primaryCarouselCard?.sourceThumbnailUrl ?? thumbnailUrl ?? documentCreative?.slides[0]?.sourceThumbnailUrl,
    videoUrl,
    status: undefined,
    firstSeenAt: runDates.firstSeenAt,
    lastSeenAt: runDates.lastSeenAt,
    metadata: {
      detailUrl: buildLinkedInAdDetailUrl(adId),
      creativeType: pickLinkedInCreativeType(normalizedContent),
      carouselItemCount: carouselCards.length || undefined,
      linkedInCarouselCards: carouselCards.length ? carouselCards : undefined,
      linkedInDocumentExpiresAt: documentCreative?.expiresAt,
      linkedInDocumentManifestUrl: documentCreative?.manifestUrl,
      linkedInDocumentPageCount: documentCreative?.pageCount,
      linkedInDocumentPreviewPageCount: documentCreative?.previewPageCount,
      linkedInDocumentSlides: documentCreative?.slides,
      linkedInDocumentTitle: documentCreative?.title,
      linkedInDocumentType: documentCreative?.type,
      linkedInRunDatesParsed: Boolean(runDates.firstSeenAt || runDates.lastSeenAt),
      totalImpressions,
      countryImpressions,
    },
  } satisfies LinkedInAdCard;
}

function decodePaginationCursorValue(value: string) {
  let decoded = normalizeLinkedInContent(value).trim();

  for (let index = 0; index < 2; index += 1) {
    try {
      const nextValue = decodeURIComponent(decoded);

      if (nextValue === decoded) {
        break;
      }

      decoded = nextValue;
    } catch {
      break;
    }
  }

  return decoded;
}

function mapPaginationKeyToRequestParam(key: string): PaginationCursor["requestParam"] | null {
  const normalizedKey = key.toLowerCase();

  if (normalizedKey === "fragmenttoken") {
    return "fragmentToken";
  }

  if (normalizedKey === "pagetoken" || normalizedKey === "nextpagetoken" || normalizedKey === "continuationtoken") {
    return "pageToken";
  }

  return null;
}

function extractAdLibraryPaginationCursor(content: string): PaginationCursor | undefined {
  const normalizedContent = normalizeLinkedInContent(content);
  const tokenPatterns = [
    /(?:[?&]|^)(fragmentToken|pageToken|nextPageToken|continuationToken)=([^&"\s]+)/i,
    /"(fragmentToken|pageToken|nextPageToken|continuationToken)"\s*:\s*"([^"]+)"/i,
    /'(fragmentToken|pageToken|nextPageToken|continuationToken)'\s*:\s*'([^']+)'/i,
  ];

  for (const pattern of tokenPatterns) {
    const match = pattern.exec(normalizedContent);
    const key = match?.[1];
    const rawValue = match?.[2];

    if (!key || !rawValue) {
      continue;
    }

    const requestParam = mapPaginationKeyToRequestParam(key);
    const value = decodePaginationCursorValue(rawValue);

    if (requestParam && value) {
      return {
        requestParam,
        value,
      };
    }
  }

  return undefined;
}

function filterAdsToWindow(ads: NormalizedAd[], options?: FetchAdvertiserAdsOptions) {
  if (!options?.since && !options?.until) {
    return ads;
  }

  return ads.filter((ad) => {
    if (options.since && ad.lastSeenAt.getTime() < options.since.getTime()) {
      return false;
    }

    if (options.until && ad.firstSeenAt.getTime() > options.until.getTime()) {
      return false;
    }

    return true;
  });
}

export class LinkedInAdapter implements SourceAdapter {
  readonly source = "linkedin" as const;

  constructor(private readonly options: CreateLinkedInAdapterOptions = {}) {}

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

    const directIdentifier = parseDirectCompanyIdentifier(term);

    if (directIdentifier) {
      const profile = await this.fetchAdvertiserProfile(directIdentifier);
      return profile ? [profile] : [];
    }

    let providerError: AdvertiserSearchError | null = null;
    let liveCandidates: LinkedInSearchCandidate[] = [];

    try {
      liveCandidates = await searchLinkedInCompanyCandidates(term, {
        proxyUrls: this.options.proxyUrls,
        webScrapingApiKey: this.options.webScrapingApiKey,
        webScrapingApiProxy: this.options.webScrapingApiProxy,
      });
    } catch (error) {
      if (error instanceof AdvertiserSearchError) {
        providerError = error;
      } else {
        providerError = new AdvertiserSearchError("LinkedIn advertiser search is temporarily unavailable.", "unavailable");
      }
    }

    const allCandidates = new Map<string, LinkedInSearchCandidate>();

    for (const candidate of liveCandidates) {
      allCandidates.set(candidate.slug, candidate);
    }

    const rankedCandidates = [...allCandidates.values()]
      .sort(
        (left, right) =>
          right.confidence + scoreCandidate(term, right) - (left.confidence + scoreCandidate(term, left)),
      )
      .slice(0, 12);

    const fetchedMatches = await Promise.all(
      rankedCandidates.map(async (candidate) => {
        try {
          return await this.fetchAdvertiserProfile(candidate.slug);
        } catch {
          return null;
        }
      }),
    );

    const matches = fetchedMatches
      .filter((match) => Boolean(match))
      .map((match) => match as AdvertiserMatch)
      .sort(
        (left, right) =>
          ((allCandidates.get(right.sourceAdvertiserId)?.confidence ?? 0) +
            scoreCandidate(term, { slug: right.sourceAdvertiserId, canonicalName: right.canonicalName }) +
            scoreAdvertiserMatchQuality(right)) -
          ((allCandidates.get(left.sourceAdvertiserId)?.confidence ?? 0) +
            scoreCandidate(term, { slug: left.sourceAdvertiserId, canonicalName: left.canonicalName }) +
            scoreAdvertiserMatchQuality(left)),
      );

    if (matches.length) {
      return matches.filter((match, index, collection) => {
        return collection.findIndex((candidate) => candidate.sourceAdvertiserId === match.sourceAdvertiserId) === index;
      });
    }

    if (providerError) {
      throw providerError;
    }

    return [];
  }

  async fetchAdvertiserProfile(sourceAdvertiserId: string) {
    return fetchLinkedInCompanyProfile(
      sourceAdvertiserId,
      this.options.webScrapingApiKey,
      this.options.webScrapingApiProxy,
      this.options.proxyUrls,
    );
  }

  async fetchAdvertiserAds(
    sourceAdvertiserId: string,
    options?: FetchAdvertiserAdsOptions,
  ): Promise<NormalizedAd[]> {
    if (isE2eFixtureMode()) {
      return buildFixtureAds(sourceAdvertiserId);
    }

    const searchUrl = buildLinkedInAdLibraryUrl(sourceAdvertiserId, options);
    const seenTokens = new Set<string>();
    const cards = new Map<string, LinkedInAdCard>();
    let pageCount = 0;

    while (pageCount < linkedInAdLibraryMaxPages) {
      const pageContent = await fetchLinkedInPublicPage(
        searchUrl.toString(),
        this.options.webScrapingApiKey,
        this.options.proxyUrls,
        this.options.webScrapingApiProxy,
      );

      if (!pageContent) {
        break;
      }

      for (const card of extractLinkedInAdCards(
        pageContent,
        titleCaseFromSlug(sourceAdvertiserId),
        sourceAdvertiserId,
      )) {
        cards.set(card.adId, mergeAdCards(cards.get(card.adId), card));
      }

      if (options?.maxResults && cards.size >= options.maxResults) {
        break;
      }

      const paginationCursor = extractAdLibraryPaginationCursor(pageContent);

      if (!paginationCursor || seenTokens.has(`${paginationCursor.requestParam}:${paginationCursor.value}`)) {
        break;
      }

      seenTokens.add(`${paginationCursor.requestParam}:${paginationCursor.value}`);

      if (paginationCursor.requestParam === "fragmentToken") {
        searchUrl.searchParams.delete("pageToken");
      } else {
        searchUrl.searchParams.delete("fragmentToken");
      }

      searchUrl.searchParams.set(paginationCursor.requestParam, paginationCursor.value);
      pageCount += 1;
    }

    const enrichedCards = await enrichLinkedInAdCards(
      [...cards.values()],
      sourceAdvertiserId,
      this.options.webScrapingApiKey,
      this.options.proxyUrls,
      this.options.webScrapingApiProxy,
    );

    const now = options?.until ?? new Date();
    const normalizedAds = enrichedCards.map((card) => {
      const lastSeenAt = card.lastSeenAt ?? card.firstSeenAt ?? now;
      const firstSeenAt = card.firstSeenAt ?? lastSeenAt;
      const endedBeforeNow = Boolean(card.lastSeenAt && card.lastSeenAt.getTime() < now.getTime() - 86_400_000);
      const isInactive = card.status?.includes("inactive") || card.status?.includes("completed") || endedBeforeNow;

      return {
        source: this.source,
        sourceAdId: card.adId,
        fingerprint: card.adId,
        title: card.title,
        body: card.body,
        payer: card.payer ?? titleCaseFromSlug(sourceAdvertiserId),
        format: card.format,
        callToAction: card.callToAction,
        destinationUrl: card.destinationUrl,
        mediaUrl: card.mediaUrl,
        status: isInactive ? "inactive" : "active",
        reactionCount: 0,
        commentCount: 0,
        firstSeenAt,
        lastSeenAt,
        metadata: {
          ...(card.metadata ?? {}),
          sourceThumbnailUrl: card.thumbnailUrl,
          sourceVideoUrl: card.videoUrl,
          sourceAdvertiserId: normalizeLinkedInCompanySlug(sourceAdvertiserId),
        },
      } satisfies NormalizedAd;
    });

    return filterAdsToWindow(normalizedAds, options)
      .slice(0, options?.maxResults)
      .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime());
  }

  async fetchLandingPage(url: string): Promise<LandingPageSnapshot> {
    return fetchLandingPageSnapshot(url);
  }
}

export function createLinkedInAdapter(options?: CreateLinkedInAdapterOptions) {
  return new LinkedInAdapter(options);
}

export async function fetchLinkedInAdDetail(
  adId: string,
  options?: FetchLinkedInAdDetailOptions,
): Promise<NormalizedAd | null> {
  const normalizedAdId = cleanText(adId);

  if (!normalizedAdId) {
    return null;
  }

  const sourceAdvertiserId = options?.sourceAdvertiserId
    ? normalizeLinkedInCompanySlug(options.sourceAdvertiserId)
    : undefined;
  const detailContent = await fetchLinkedInPublicPage(
    buildLinkedInAdDetailUrl(normalizedAdId),
    options?.webScrapingApiKey,
    options?.proxyUrls,
    options?.webScrapingApiProxy,
  );

  if (!detailContent) {
    return null;
  }

  const card = await hydrateLinkedInDocumentSlides(extractLinkedInAdCardFromDetailPage(
    detailContent,
    normalizedAdId,
    options?.fallbackPayer ?? (sourceAdvertiserId ? titleCaseFromSlug(sourceAdvertiserId) : ""),
  ));

  if (sourceAdvertiserId && !isLinkedInAdvertiserCompatibleWithSource(card.payer, sourceAdvertiserId)) {
    return null;
  }

  const now = new Date();
  const lastSeenAt = card.lastSeenAt ?? card.firstSeenAt ?? now;
  const firstSeenAt = card.firstSeenAt ?? lastSeenAt;
  const endedBeforeNow = Boolean(card.lastSeenAt && card.lastSeenAt.getTime() < now.getTime() - 86_400_000);
  const isInactive = card.status?.includes("inactive") || card.status?.includes("completed") || endedBeforeNow;

  return {
    source: "linkedin",
    sourceAdId: card.adId,
    fingerprint: card.adId,
    title: card.title,
    body: card.body,
    payer: card.payer ?? options?.fallbackPayer ?? (sourceAdvertiserId ? titleCaseFromSlug(sourceAdvertiserId) : undefined),
    format: card.format,
    callToAction: card.callToAction,
    destinationUrl: card.destinationUrl,
    mediaUrl: card.mediaUrl,
    status: isInactive ? "inactive" : "active",
    reactionCount: 0,
    commentCount: 0,
    firstSeenAt,
    lastSeenAt,
    metadata: {
      ...(card.metadata ?? {}),
      sourceThumbnailUrl: card.thumbnailUrl,
      sourceVideoUrl: card.videoUrl,
      ...(sourceAdvertiserId ? { sourceAdvertiserId } : {}),
    },
  };
}
