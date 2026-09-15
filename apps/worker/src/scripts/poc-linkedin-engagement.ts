import http from "node:http";
import https from "node:https";

import { getPool } from "@adluv/db";
import { type RowDataPacket } from "mysql2/promise";

type Args = {
  adIds: string[];
  limit: number;
  sourceAdIds: string[];
  usePlaywright: boolean;
  usePlaywrightNetwork: boolean;
};

type AdRow = RowDataPacket & {
  id: string;
  advertiserId: string;
  advertiserName: string;
  title: string | null;
  sourceAdId: string;
  reactionCount: number;
  commentCount: number;
  lastSeenAt: Date;
};

type TextResponse = {
  body: string;
  headers: Record<string, string | string[] | undefined>;
  ok: boolean;
  status: number;
};

type EngagementProbeOutcome =
  | "found_on_detail"
  | "found_on_post"
  | "not_found"
  | "no_post_url"
  | "fetch_failed"
  | "parse_failed";

type EngagementEvidence = {
  comments: number | null;
  evidenceSnippet: string | null;
  evidenceSource: "detail" | "post";
  reactions: number | null;
};

type ProbeResult = {
  adId: string;
  adUrl: string | null;
  advertiserName: string;
  comments: number | null;
  detailUrl: string;
  errors: string[];
  evidenceSnippet: string | null;
  evidenceSource: "detail" | "post" | null;
  outcome: EngagementProbeOutcome;
  postUrl: string | null;
  reactions: number | null;
  sourceAdId: string;
  storedComments: number;
  storedReactions: number;
  title: string | null;
  networkSignals: NetworkSignal[];
};

type NetworkSignal = {
  contentType: string;
  matchedPatterns: string[];
  method: string;
  snippet: string | null;
  status: number;
  url: string;
};

const linkedInUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const fetchTimeoutMs = 25_000;
const defaultLimit = 10;
const maxSnippetLength = 220;

function logProgress(message: string) {
  console.log(`[poc:linkedin-engagement] ${message}`);
}

function parseArgs(argv: string[]): Args {
  const adIdsFlag = argv.find((value) => value.startsWith("--ad-ids="));
  const sourceAdIdsFlag = argv.find((value) => value.startsWith("--source-ad-ids="));
  const limitFlag = argv.find((value) => value.startsWith("--limit="));
  const usePlaywright = argv.includes("--playwright");
  const usePlaywrightNetwork = argv.includes("--playwright-network");
  const parsedLimit = limitFlag ? Number.parseInt(limitFlag.slice("--limit=".length), 10) : defaultLimit;

  const adIds = adIdsFlag
    ? adIdsFlag
        .slice("--ad-ids=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const sourceAdIds = sourceAdIdsFlag
    ? sourceAdIdsFlag
        .slice("--source-ad-ids=".length)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  return {
    adIds,
    limit: Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : defaultLimit,
    sourceAdIds,
    usePlaywright: usePlaywright || usePlaywrightNetwork,
    usePlaywrightNetwork,
  };
}

function buildWebScrapingApiUrl(targetUrl: string, apiKey: string) {
  const url = new URL("https://api.webscrapingapi.com/v2");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("url", targetUrl);
  return url.toString();
}

async function fetchDuckDuckGoHtml(query: string) {
  const response = await fetchWithTimeout(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    {
      headers: {
        "user-agent": "Mozilla/5.0",
      },
    },
    `DuckDuckGo search timed out for query: ${query}`,
  );

  if (!response.ok) {
    throw new Error(`DuckDuckGo returned HTTP ${response.status} for query: ${query}`);
  }

  return response.text();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMessage: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

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

function requestDirectText(url: URL, headers: Record<string, string>, redirectCount = 0): Promise<TextResponse> {
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        headers,
        method: "GET",
      },
      (response) => {
        const status = response.statusCode ?? 0;

        if (status >= 300 && status < 400 && response.headers.location && redirectCount < 5) {
          try {
            const nextUrl = new URL(response.headers.location, url);
            response.resume();
            void requestDirectText(nextUrl, headers, redirectCount + 1).then(resolve, reject);
            return;
          } catch (error) {
            reject(error);
            return;
          }
        }

        const chunks: Buffer[] = [];
        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("error", reject);
        response.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          resolve({
            body,
            headers: response.headers,
            ok: status >= 200 && status < 300,
            status,
          });
        });
      },
    );

    request.setTimeout(fetchTimeoutMs, () => {
      request.destroy(new Error(`Request to ${url.toString()} timed out.`));
    });
    request.on("error", reject);
    request.end();
  });
}

async function fetchHtml(url: string, webScrapingApiKey?: string) {
  const headers = {
    accept: "text/html,application/xhtml+xml",
    "accept-encoding": "identity",
    "user-agent": linkedInUserAgent,
  };

  const apiKey = webScrapingApiKey?.trim();

  if (apiKey) {
    const response = await fetchWithTimeout(
      buildWebScrapingApiUrl(url, apiKey),
      { headers },
      `Request to ${url} via WebScrapingAPI timed out.`,
    );

    return {
      body: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
      ok: response.ok,
      status: response.status,
    } satisfies TextResponse;
  }

  return requestDirectText(new URL(url), headers);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;/g, "'")
    .replace(/&#x3D;/g, "=")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)));
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

function cleanText(value?: string | null) {
  return value
    ?.replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMetricNumber(rawValue: string) {
  const normalized = rawValue.trim().toLowerCase().replace(/,/g, "");
  const match = normalized.match(/^(\d+(?:\.\d+)?)([kmb])?$/i);

  if (!match) {
    const integerValue = Number.parseInt(normalized, 10);
    return Number.isFinite(integerValue) ? integerValue : null;
  }

  const base = Number.parseFloat(match[1]);

  if (!Number.isFinite(base)) {
    return null;
  }

  const suffix = match[2]?.toLowerCase();

  if (suffix === "k") {
    return Math.round(base * 1_000);
  }

  if (suffix === "m") {
    return Math.round(base * 1_000_000);
  }

  if (suffix === "b") {
    return Math.round(base * 1_000_000_000);
  }

  return Math.round(base);
}

function getSnippet(content: string, index: number) {
  const start = Math.max(0, index - Math.floor(maxSnippetLength / 2));
  const end = Math.min(content.length, start + maxSnippetLength);
  return cleanText(content.slice(start, end)) ?? null;
}

function extractMetric(content: string, kind: "reactions" | "comments") {
  const patterns =
    kind === "reactions"
      ? [
          /"reactionCount"\s*:\s*(\d{1,12})/i,
          /"numLikes"\s*:\s*(\d{1,12})/i,
          /"socialCounts?[^"]*"\s*:\s*{[^}]*"reactions?"\s*:\s*(\d{1,12})/i,
          /(\d[\d,.]*(?:[kmb])?)\s+reactions?\b/i,
          /reactions?\D{0,24}(\d[\d,.]*(?:[kmb])?)/i,
        ]
      : [
          /"commentCount"\s*:\s*(\d{1,12})/i,
          /"numComments"\s*:\s*(\d{1,12})/i,
          /"socialCounts?[^"]*"\s*:\s*{[^}]*"comments?"\s*:\s*(\d{1,12})/i,
          /(\d[\d,.]*(?:[kmb])?)\s+comments?\b/i,
          /comments?\D{0,24}(\d[\d,.]*(?:[kmb])?)/i,
        ];

  for (const pattern of patterns) {
    const match = pattern.exec(content);
    const rawValue = match?.[1];

    if (!rawValue || match.index === undefined) {
      continue;
    }

    const value = parseMetricNumber(rawValue);

    if (value === null) {
      continue;
    }

    return {
      snippet: getSnippet(content, match.index),
      value,
    };
  }

  return null;
}

function probeEngagementFromHtml(content: string, evidenceSource: "detail" | "post"): EngagementEvidence | null {
  const normalized = normalizeLinkedInContent(content);
  const reactions = extractMetric(normalized, "reactions");
  const comments = extractMetric(normalized, "comments");

  if (!reactions && !comments) {
    return null;
  }

  return {
    comments: comments?.value ?? null,
    evidenceSnippet: reactions?.snippet ?? comments?.snippet ?? null,
    evidenceSource,
    reactions: reactions?.value ?? null,
  };
}

function extractCandidatePostUrls(content: string) {
  const normalized = normalizeLinkedInContent(content);
  const urls = new Set<string>();
  const directUrlPattern = /https:\/\/www\.linkedin\.com\/(?:feed\/update\/urn:li:(?:activity|share):\d+\/?|posts\/[^\s"'<>]+|embed\/feed\/update\/urn:li:(?:activity|share):\d+\/?)/gi;

  for (const match of normalized.matchAll(directUrlPattern)) {
    const candidate = match[0]?.replace(/[),.;]+$/, "");

    if (candidate) {
      urls.add(candidate);
    }
  }

  for (const match of normalized.matchAll(/urn:li:(activity|share):(\d{6,})/gi)) {
    const urn = match[0];
    urls.add(`https://www.linkedin.com/feed/update/${urn}/`);
    urls.add(`https://www.linkedin.com/embed/feed/update/${urn}/`);
  }

  return [...urls];
}

async function probeHydratedPage(url: string) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({
      userAgent: linkedInUserAgent,
      viewport: { width: 1440, height: 2200 },
    });

    const networkSignals: NetworkSignal[] = [];
    page.on("response", async (response) => {
      try {
        const request = response.request();
        const resourceType = request.resourceType();

        if (!["document", "xhr", "fetch"].includes(resourceType)) {
          return;
        }

        const contentType = response.headers()["content-type"] ?? "";
        let body = "";

        if (/json|javascript|text|html/i.test(contentType)) {
          body = await response.text().catch(() => "");
        }

        const normalizedBody = normalizeLinkedInContent(body);
        const matchedPatterns = [
          /urn:li:(?:activity|share):\d+/i.test(normalizedBody) ? "urn" : null,
          /https:\/\/www\.linkedin\.com\/feed\/update\//i.test(normalizedBody) ? "feed_update_url" : null,
          /https:\/\/www\.linkedin\.com\/posts\//i.test(normalizedBody) ? "posts_url" : null,
          /"reactionCount"\s*:/i.test(normalizedBody) ? "reaction_count" : null,
          /"commentCount"\s*:/i.test(normalizedBody) ? "comment_count" : null,
          /\b\d[\d,.]*(?:[kmb])?\s+reactions?\b/i.test(normalizedBody) ? "reactions_text" : null,
          /\b\d[\d,.]*(?:[kmb])?\s+comments?\b/i.test(normalizedBody) ? "comments_text" : null,
        ].filter((value): value is string => Boolean(value));

        if (!matchedPatterns.length) {
          return;
        }

        networkSignals.push({
          contentType,
          matchedPatterns,
          method: request.method(),
          snippet: cleanText(body.slice(0, 800)) ?? null,
          status: response.status(),
          url: response.url(),
        });
      } catch {
        // Ignore capture errors in the POC path.
      }
    });

    await page.goto(url, {
      timeout: 120_000,
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(3_000);

    const snapshot = await page.evaluate(() => {
      return {
        anchors: Array.from(document.querySelectorAll("a[href]")).map((node) => (node as HTMLAnchorElement).href),
        html: document.documentElement.outerHTML,
        text: document.body?.innerText ?? "",
      };
    });

    return {
      anchors: [...new Set(snapshot.anchors)].filter(Boolean),
      html: snapshot.html,
      networkSignals,
      text: snapshot.text,
    };
  } finally {
    await browser.close();
  }
}

function buildSearchQueries(input: {
  advertiserName: string;
  title: string | null;
  body: string | null;
}) {
  const headline = cleanText(input.title)?.slice(0, 80);
  const bodySnippet = cleanText(input.body)?.slice(0, 100);
  const queries = new Set<string>();

  if (headline) {
    queries.add(`site:linkedin.com/posts/ "${input.advertiserName}" "${headline}"`);
    queries.add(`site:linkedin.com/feed/update/ "${input.advertiserName}" "${headline}"`);
  }

  if (bodySnippet) {
    queries.add(`site:linkedin.com/posts/ "${input.advertiserName}" "${bodySnippet}"`);
    queries.add(`site:linkedin.com/feed/update/ "${input.advertiserName}" "${bodySnippet}"`);
  }

  if (headline && bodySnippet) {
    queries.add(`site:linkedin.com/posts/ "${input.advertiserName}" "${headline}" "${bodySnippet.split(" ").slice(0, 5).join(" ")}"`);
  }

  queries.add(`site:linkedin.com/posts/ "${input.advertiserName}" linkedin`);
  queries.add(`site:linkedin.com/feed/update/ "${input.advertiserName}" linkedin`);

  return [...queries];
}

function extractLinkedInPostUrlsFromSearchHtml(content: string) {
  const urls = new Set<string>();

  for (const match of content.matchAll(/uddg=([^&"]+)/g)) {
    const rawValue = match[1];

    if (!rawValue) {
      continue;
    }

    try {
      const decoded = decodeURIComponent(rawValue);

      if (
        decoded.startsWith("https://www.linkedin.com/feed/update/") ||
        decoded.startsWith("https://www.linkedin.com/posts/")
      ) {
        urls.add(decoded);
      }
    } catch {
      continue;
    }
  }

  return [...urls];
}

async function searchForCandidatePostUrls(input: {
  advertiserName: string;
  title: string | null;
  body: string | null;
}) {
  const urls = new Set<string>();

  for (const query of buildSearchQueries(input)) {
    try {
      const html = await fetchDuckDuckGoHtml(query);

      for (const candidate of extractLinkedInPostUrlsFromSearchHtml(html)) {
        urls.add(candidate);
      }
    } catch {
      continue;
    }
  }

  return [...urls];
}

function buildLinkedInAdDetailUrl(sourceAdId: string) {
  return `https://www.linkedin.com/ad-library/detail/${sourceAdId}`;
}

async function selectCandidateAds(args: Args) {
  const pool = getPool();

  if (args.adIds.length) {
    const placeholders = args.adIds.map(() => "?").join(",");
    const [rows] = await pool.query<AdRow[]>(
      `
        select
          ads.id,
          ads.advertiser_id as advertiserId,
          advertisers.canonical_name as advertiserName,
          ads.title,
          ads.source_ad_id as sourceAdId,
          ads.reaction_count as reactionCount,
          ads.comment_count as commentCount,
          ads.last_seen_at as lastSeenAt
        from ads
        inner join advertisers on advertisers.id = ads.advertiser_id
        where ads.id in (${placeholders})
          and ads.source = 'linkedin'
          and ads.source_ad_id is not null
      `,
      args.adIds,
    );

    return rows;
  }

  if (args.sourceAdIds.length) {
    const placeholders = args.sourceAdIds.map(() => "?").join(",");
    const [rows] = await pool.query<AdRow[]>(
      `
        select
          ads.id,
          ads.advertiser_id as advertiserId,
          advertisers.canonical_name as advertiserName,
          ads.title,
          ads.source_ad_id as sourceAdId,
          ads.reaction_count as reactionCount,
          ads.comment_count as commentCount,
          ads.last_seen_at as lastSeenAt
        from ads
        inner join advertisers on advertisers.id = ads.advertiser_id
        where ads.source_ad_id in (${placeholders})
          and ads.source = 'linkedin'
          and ads.source_ad_id is not null
      `,
      args.sourceAdIds,
    );

    return rows;
  }

  const [rows] = await pool.query<AdRow[]>(
    `
      select
        ads.id,
        ads.advertiser_id as advertiserId,
        advertisers.canonical_name as advertiserName,
        ads.title,
        ads.source_ad_id as sourceAdId,
        ads.reaction_count as reactionCount,
        ads.comment_count as commentCount,
        ads.last_seen_at as lastSeenAt
      from ads
      inner join advertisers on advertisers.id = ads.advertiser_id
      where ads.source = 'linkedin'
        and ads.source_ad_id is not null
        and exists (
          select 1
          from tracked_companies
          where tracked_companies.advertiser_id = ads.advertiser_id
        )
      order by ads.last_seen_at desc
      limit ?
    `,
    [args.limit],
  );

  return rows;
}

async function probeAd(
  row: AdRow,
  options: { usePlaywright: boolean; usePlaywrightNetwork: boolean; webScrapingApiKey?: string },
): Promise<ProbeResult> {
  const detailUrl = buildLinkedInAdDetailUrl(row.sourceAdId);
  const result: ProbeResult = {
    adId: row.id,
    adUrl: null,
    advertiserName: row.advertiserName,
    comments: null,
    detailUrl,
    errors: [],
    evidenceSnippet: null,
    evidenceSource: null,
    outcome: "not_found",
    postUrl: null,
    reactions: null,
    sourceAdId: row.sourceAdId,
    storedComments: row.commentCount,
    storedReactions: row.reactionCount,
    title: row.title,
    networkSignals: [],
  };

  let detailHtml: string;

  try {
    const detailResponse = await fetchHtml(detailUrl, options.webScrapingApiKey);

    if (!detailResponse.ok) {
      result.outcome = "fetch_failed";
      result.errors.push(`detail http ${detailResponse.status}`);
      return result;
    }

    detailHtml = detailResponse.body;
  } catch (error) {
    result.outcome = "fetch_failed";
    result.errors.push(error instanceof Error ? error.message : "detail fetch failed");
    return result;
  }

  try {
    const detailEvidence = probeEngagementFromHtml(detailHtml, "detail");

    if (detailEvidence) {
      result.comments = detailEvidence.comments;
      result.evidenceSnippet = detailEvidence.evidenceSnippet;
      result.evidenceSource = detailEvidence.evidenceSource;
      result.outcome = "found_on_detail";
      result.reactions = detailEvidence.reactions;
      return result;
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "detail parse failed");
  }

  let candidatePostUrls = extractCandidatePostUrls(detailHtml);

  if (!candidatePostUrls.length && options.usePlaywright) {
    try {
      const hydratedDetail = await probeHydratedPage(detailUrl);
      if (options.usePlaywrightNetwork) {
        result.networkSignals.push(...hydratedDetail.networkSignals);
      }
      const hydratedDetailEvidence =
        probeEngagementFromHtml(hydratedDetail.html, "detail") ??
        probeEngagementFromHtml(hydratedDetail.text, "detail");

      if (hydratedDetailEvidence) {
        result.comments = hydratedDetailEvidence.comments;
        result.evidenceSnippet = hydratedDetailEvidence.evidenceSnippet;
        result.evidenceSource = hydratedDetailEvidence.evidenceSource;
        result.outcome = "found_on_detail";
        result.reactions = hydratedDetailEvidence.reactions;
        return result;
      }

      candidatePostUrls = [
        ...new Set([
          ...candidatePostUrls,
          ...hydratedDetail.anchors.filter((href) =>
            /^https:\/\/www\.linkedin\.com\/(?:feed\/update\/|posts\/|embed\/feed\/update\/)/i.test(href),
          ),
          ...extractCandidatePostUrls(hydratedDetail.html),
        ]),
      ];
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : "playwright detail probe failed");
    }
  }

  const detailBodySnippet = cleanText(detailHtml.match(/commentary__content[^>]*>([\s\S]{1,500}?)<\/p>/i)?.[1]) ?? null;
  const fallbackSearchUrls =
    candidatePostUrls.length === 0
      ? await searchForCandidatePostUrls({
          advertiserName: row.advertiserName,
          body: detailBodySnippet,
          title: row.title,
        })
      : [];
  const postUrlsToTry = [...new Set([...candidatePostUrls, ...fallbackSearchUrls])];

  if (!postUrlsToTry.length) {
    result.outcome = result.errors.length ? "parse_failed" : "no_post_url";
    return result;
  }

  result.adUrl = postUrlsToTry[0] ?? null;
  result.postUrl = postUrlsToTry[0] ?? null;

  for (const candidatePostUrl of postUrlsToTry) {
    try {
      const postResponse = await fetchHtml(candidatePostUrl, options.webScrapingApiKey);

      if (!postResponse.ok) {
        result.errors.push(`post http ${postResponse.status} for ${candidatePostUrl}`);
        continue;
      }

      const postEvidence = probeEngagementFromHtml(postResponse.body, "post");

      if (postEvidence) {
        result.comments = postEvidence.comments;
        result.evidenceSnippet = postEvidence.evidenceSnippet;
        result.evidenceSource = postEvidence.evidenceSource;
        result.adUrl = candidatePostUrl;
        result.outcome = "found_on_post";
        result.postUrl = candidatePostUrl;
        result.reactions = postEvidence.reactions;
        return result;
      }

      if (options.usePlaywright) {
        const hydratedPost = await probeHydratedPage(candidatePostUrl);
        if (options.usePlaywrightNetwork) {
          result.networkSignals.push(...hydratedPost.networkSignals);
        }
        const hydratedPostEvidence =
          probeEngagementFromHtml(hydratedPost.html, "post") ??
          probeEngagementFromHtml(hydratedPost.text, "post");

        if (hydratedPostEvidence) {
          result.comments = hydratedPostEvidence.comments;
          result.evidenceSnippet = hydratedPostEvidence.evidenceSnippet;
          result.evidenceSource = hydratedPostEvidence.evidenceSource;
          result.adUrl = candidatePostUrl;
          result.outcome = "found_on_post";
          result.postUrl = candidatePostUrl;
          result.reactions = hydratedPostEvidence.reactions;
          return result;
        }
      }
    } catch (error) {
      result.errors.push(
        `${error instanceof Error ? error.message : "post fetch failed"} for ${candidatePostUrl}`,
      );
    }
  }

  result.outcome = result.errors.length ? "fetch_failed" : "not_found";
  return result;
}

function printSummary(results: ProbeResult[]) {
  const rollup = results.reduce<Record<EngagementProbeOutcome, number>>(
    (current, result) => {
      current[result.outcome] += 1;
      return current;
    },
    {
      fetch_failed: 0,
      found_on_detail: 0,
      found_on_post: 0,
      no_post_url: 0,
      not_found: 0,
      parse_failed: 0,
    },
  );

  console.table(
    results.map((result) => ({
      adId: result.adId,
      advertiser: result.advertiserName,
      adUrl: result.adUrl ?? "",
      comments: result.comments ?? "",
      outcome: result.outcome,
      reactions: result.reactions ?? "",
      sourceAdId: result.sourceAdId,
      source: result.evidenceSource ?? "",
      title: result.title ?? "",
      networkSignals: result.networkSignals.length,
    })),
  );

  logProgress(
    `completed ${results.length} probes | detail=${rollup.found_on_detail} post=${rollup.found_on_post} no_post_url=${rollup.no_post_url} not_found=${rollup.not_found} fetch_failed=${rollup.fetch_failed} parse_failed=${rollup.parse_failed}`,
  );

  console.log(JSON.stringify(results, null, 2));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const webScrapingApiKey = process.env.WEBSCRAPINGAPI_API_KEY?.trim() || undefined;

  if (!webScrapingApiKey) {
    logProgress("WEBSCRAPINGAPI_API_KEY is not configured; falling back to direct fetches.");
  }

  const rows = await selectCandidateAds(args);

  if (!rows.length) {
    throw new Error("No candidate LinkedIn ads found for the requested selection.");
  }

  logProgress(`probing ${rows.length} stored LinkedIn ads`);

  const results: ProbeResult[] = [];

  for (const row of rows) {
    logProgress(`probing ${row.id} (${row.sourceAdId})`);
    results.push(
      await probeAd(row, {
        usePlaywright: args.usePlaywright,
        usePlaywrightNetwork: args.usePlaywrightNetwork,
        webScrapingApiKey,
      }),
    );
  }

  printSummary(results);
  await getPool().end();
}

main().catch(async (error) => {
  console.error("[poc:linkedin-engagement] failed", error);

  try {
    await getPool().end();
  } catch {
    // Ignore cleanup errors for the POC script.
  }

  process.exitCode = 1;
});
