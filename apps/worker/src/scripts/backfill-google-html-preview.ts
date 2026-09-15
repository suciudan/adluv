import { getPool } from "@adluv/db";
import { fetchTextViaWebScrapingApiProxy } from "@adluv/source-adapters";
import type { RowDataPacket } from "mysql2/promise";
import { createScriptProgressLogger } from "./progress";

import { getWebScrapingApiProxyOptions } from "../source-adapter";

type Args = {
  adId: string | null;
  advertiserId: string | null;
  concurrency: number;
  delayMs: number;
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  timeoutMs: number;
  transport: "auto" | "direct" | "proxy";
};

type CandidateRow = RowDataPacket & {
  id: string;
  advertiserId: string;
  sourceAdId: string;
  sourceAdvertiserId: string;
  title: string | null;
  body: string | null;
  metadata: unknown;
};

type ParsedHtmlPreview = {
  body: string | null;
  brandUrl: string | null;
  previewUrl: string;
  title: string | null;
};

type Stats = {
  candidates: number;
  failed: number;
  htmlFound: number;
  noHtml: number;
  scanned: number;
  updated: number;
};

const googleRpcBaseUrl = "https://adstransparency.google.com/anji/_/rpc";
const googleUkRegionCode = 2826;
const retryableStatuses = new Set([302, 408, 425, 500, 502, 503, 504]);
const defaultConcurrency = 1;
const defaultDelayMs = 3_000;
const defaultLimit = 100;
const defaultTimeoutMs = 15_000;

class GoogleRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleRateLimitError";
  }
}

const logProgress = createScriptProgressLogger("backfill:google-html-preview");

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parsePositiveInteger(value: string | undefined, fallback: number | null) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseTransport(value: string | undefined): Args["transport"] {
  if (value === "direct" || value === "proxy") {
    return value;
  }

  return "auto";
}

function parseArgs(argv: string[]): Args {
  const adIdFlag = argv.find((value) => value.startsWith("--ad-id="));
  const advertiserIdFlag = argv.find((value) => value.startsWith("--advertiser-id="));
  const concurrencyFlag = argv.find((value) => value.startsWith("--concurrency="));
  const delayFlag = argv.find((value) => value.startsWith("--delay-ms="));
  const limitFlag = argv.find((value) => value.startsWith("--limit="));
  const timeoutFlag = argv.find((value) => value.startsWith("--timeout-ms="));
  const transportFlag = argv.find((value) => value.startsWith("--transport="));
  const adId = adIdFlag?.slice("--ad-id=".length).trim() || null;

  return {
    adId,
    advertiserId: advertiserIdFlag?.slice("--advertiser-id=".length).trim() || null,
    concurrency: parsePositiveInteger(concurrencyFlag?.slice("--concurrency=".length), defaultConcurrency) ?? defaultConcurrency,
    delayMs: parsePositiveInteger(delayFlag?.slice("--delay-ms=".length), defaultDelayMs) ?? defaultDelayMs,
    dryRun: argv.includes("--dry-run"),
    force: argv.includes("--force"),
    limit: adId ? 1 : parsePositiveInteger(limitFlag?.slice("--limit=".length), defaultLimit),
    timeoutMs: parsePositiveInteger(timeoutFlag?.slice("--timeout-ms=".length), defaultTimeoutMs) ?? defaultTimeoutMs,
    transport: parseTransport(transportFlag?.slice("--transport=".length)),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describeTransportPlan(transport: Args["transport"]) {
  const proxyConfigured = Boolean(getWebScrapingApiProxyOptions());

  if (transport === "auto") {
    return proxyConfigured ? "auto(proxy,direct)" : "auto(direct only; proxy env missing)";
  }

  return transport === "proxy" && !proxyConfigured ? "proxy(requested but proxy env missing)" : transport;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() || null : null;
}

function normalizePreviewUrl(value: string | null) {
  if (!value) {
    return null;
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

  return null;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
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
      .replace(/\\"/g, "\"")
      .replace(/\\'/g, "'"),
  );
}

function extractBalancedJsonArrayAfterMarker(content: string, marker: string) {
  const markerIndex = content.indexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const startIndex = content.indexOf("[", markerIndex + marker.length);

  if (startIndex === -1) {
    return null;
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

  return null;
}

function extractIframePreviewUrl(html: string | null) {
  if (!html) {
    return null;
  }

  const src =
    html.match(/<iframe[^>]*\bsrc=["']([^"']+)["']/i)?.[1] ??
    html.match(/\bsrc=([^ >]+)/i)?.[1]?.replace(/^["']|["']$/g, "") ??
    null;

  return normalizePreviewUrl(src);
}

function parsePreviewHtml(html: string, previewUrl: string): ParsedHtmlPreview | null {
  const decoded = decodeGooglePreviewScript(html);
  const rawSearchAdData = extractBalancedJsonArrayAfterMarker(decoded, "\"361903925\":");

  if (!rawSearchAdData) {
    return null;
  }

  try {
    const searchAdData = JSON.parse(rawSearchAdData) as unknown[];
    const title = cleanText(searchAdData[7]);
    const brandUrl = cleanText(searchAdData[8])?.replace(/^https?:\/\//i, "").toLowerCase() ?? null;
    const body = cleanText(searchAdData[9]);

    return title || body || brandUrl ? { body, brandUrl, previewUrl, title } : null;
  } catch {
    return null;
  }
}

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

  if (typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }

  return {};
}

function getNextMetadata(row: CandidateRow, preview: ParsedHtmlPreview) {
  const metadata = parseMetadata(row.metadata);

  return {
    ...metadata,
    googleBrandUrl: preview.brandUrl ?? metadata.googleBrandUrl,
    googleHtmlPreviewBackfilledAt: new Date().toISOString(),
    googleHtmlPreviewUrl: preview.previewUrl,
    googleCreativeAssets: [
      {
        label: "Original",
        previewUrl: preview.previewUrl,
        title: preview.title ?? undefined,
        body: preview.body ?? undefined,
        brandUrl: preview.brandUrl ?? undefined,
      },
    ],
  };
}

function needsUpdate(row: CandidateRow, preview: ParsedHtmlPreview, nextMetadata: Record<string, unknown>) {
  return (
    cleanText(row.title) !== preview.title ||
    cleanText(row.body) !== preview.body ||
    JSON.stringify(parseMetadata(row.metadata)) !== JSON.stringify(nextMetadata)
  );
}

async function fetchDirectText(
  targetUrl: string,
  request: {
    body?: URLSearchParams;
    headers: Record<string, string>;
    method?: "GET" | "POST";
  },
  timeoutMs: number,
) {
  const response = await fetch(targetUrl, {
    body: request.body,
    headers: request.headers,
    method: request.method ?? "GET",
    signal: AbortSignal.timeout(timeoutMs),
  });

  return {
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
}

async function fetchRpcText(
  targetUrl: string,
  request: {
    body: URLSearchParams;
    headers: Record<string, string>;
    method: "POST";
  },
  transport: Args["transport"],
  timeoutMs: number,
  rowId: string,
) {
  const proxyOptions = getWebScrapingApiProxyOptions();
  const transports =
    transport === "auto"
      ? (proxyOptions ? (["proxy", "direct"] as const) : (["direct"] as const))
      : ([transport] as const);
  let lastError: unknown = null;

  logProgress(`rpc ${rowId}: transports=${transports.join(",")} proxyConfigured=${Boolean(proxyOptions)}`);

  for (const currentTransport of transports) {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        logProgress(`rpc ${rowId}: ${currentTransport} attempt ${attempt}/4 start`);
        const response =
          currentTransport === "proxy"
            ? proxyOptions
              ? await fetchTextViaWebScrapingApiProxy(targetUrl, {
                  ...request,
                  proxy: proxyOptions,
                  timeoutMs,
                })
              : null
            : await fetchDirectText(targetUrl, request, timeoutMs);

        if (!response) {
          lastError = new Error("WebScrapingAPI proxy credentials are not configured.");
          logProgress(`rpc ${rowId}: ${currentTransport} skipped, proxy credentials missing`);
          break;
        }

        if (response.ok) {
          logProgress(`rpc ${rowId}: ${currentTransport} attempt ${attempt}/4 ok bytes=${response.text.length}`);
          return response.text;
        }

        lastError = new Error(`${currentTransport} HTTP ${response.status}`);
        logProgress(`rpc ${rowId}: ${currentTransport} attempt ${attempt}/4 http=${response.status} bytes=${response.text.length}`);

        if (response.status === 429 && currentTransport === "direct" && !proxyOptions) {
          logProgress(
            `rpc ${rowId}: direct Google RPC is rate-limited from this server IP; configure WebScrapingAPI proxy env vars or rerun later`,
          );
        }

        if (response.status === 429) {
          throw new GoogleRateLimitError(`${currentTransport} HTTP 429 from Google Ads Transparency`);
        }

        if (!retryableStatuses.has(response.status)) {
          logProgress(`rpc ${rowId}: ${currentTransport} http=${response.status} is not retryable`);
          break;
        }
      } catch (error) {
        lastError = error;
        logProgress(`rpc ${rowId}: ${currentTransport} attempt ${attempt}/4 error=${formatError(error)}`);

        if (error instanceof GoogleRateLimitError) {
          throw error;
        }

        if (currentTransport === "direct" && transport === "auto" && proxyOptions) {
          logProgress(`rpc ${rowId}: direct fallback failed; stopping direct retries because proxy was available`);
          break;
        }
      }

      const retryDelayMs = 2_000 * attempt;
      logProgress(`rpc ${rowId}: sleeping ${retryDelayMs}ms before next attempt`);
      await sleep(retryDelayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Unknown Google detail failure."));
}

async function fetchHtmlText(previewUrl: string, timeoutMs: number, rowId: string, transport: Args["transport"]) {
  const proxyOptions = getWebScrapingApiProxyOptions();
  const transports =
    transport === "auto"
      ? (proxyOptions ? (["proxy", "direct"] as const) : (["direct"] as const))
      : ([transport] as const);
  let lastError: unknown = null;

  logProgress(`preview ${rowId}: transports=${transports.join(",")} proxyConfigured=${Boolean(proxyOptions)}`);

  for (const currentTransport of transports) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        logProgress(`preview ${rowId}: ${currentTransport} attempt ${attempt}/3 fetch ${previewUrl.slice(0, 160)}`);
        const response =
          currentTransport === "proxy"
            ? proxyOptions
              ? await fetchTextViaWebScrapingApiProxy(previewUrl, {
                  headers: {
                    "user-agent": "Mozilla/5.0",
                  },
                  method: "GET",
                  proxy: proxyOptions,
                  timeoutMs,
                })
              : null
            : await fetchDirectText(
                previewUrl,
                {
                  headers: {
                    "user-agent": "Mozilla/5.0",
                  },
                  method: "GET",
                },
                timeoutMs,
              );

        if (!response) {
          lastError = new Error("WebScrapingAPI proxy credentials are not configured.");
          logProgress(`preview ${rowId}: ${currentTransport} skipped, proxy credentials missing`);
          break;
        }

        if (response.ok) {
          logProgress(`preview ${rowId}: ${currentTransport} attempt ${attempt}/3 ok status=${response.status} bytes=${response.text.length}`);
          return response.text;
        }

        lastError = new Error(`Preview HTML request via ${currentTransport} failed with ${response.status}.`);
        logProgress(`preview ${rowId}: ${currentTransport} attempt ${attempt}/3 http=${response.status} bytes=${response.text.length}`);
      } catch (error) {
        lastError = error;
        logProgress(`preview ${rowId}: ${currentTransport} attempt ${attempt}/3 error=${formatError(error)}`);
      }

      const retryDelayMs = 1_000 * attempt;
      logProgress(`preview ${rowId}: sleeping ${retryDelayMs}ms before next attempt`);
      await sleep(retryDelayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Unknown preview HTML failure."));
}

async function fetchGoogleDetail(row: CandidateRow, args: Args) {
  const responseText = await fetchRpcText(
    `${googleRpcBaseUrl}/LookupService/GetCreativeById?authuser=`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "x-same-domain": "1",
        origin: "https://adstransparency.google.com",
        referer: "https://adstransparency.google.com/",
      },
      body: new URLSearchParams({
        "f.req": JSON.stringify({
          1: row.sourceAdvertiserId,
          2: row.sourceAdId,
          5: { 1: 1, 2: 0, 3: googleUkRegionCode },
        }),
      }),
    },
    args.transport,
    args.timeoutMs,
    row.id,
  );

  const detail = (JSON.parse(responseText) as Record<string, unknown>)["1"] as Record<string, unknown> | undefined;

  logProgress(
    `detail ${row.id}: ${detail ? `keys=${Object.keys(detail).join(",") || "none"}` : "missing detail record"}`,
  );

  return detail;
}

async function hydrateFromHtml(row: CandidateRow, args: Args) {
  const detail = await fetchGoogleDetail(row, args);
  const previewRecords = Array.isArray(detail?.["5"]) ? (detail["5"] as Array<Record<string, unknown>>) : [];
  const previewUrls = previewRecords
    .flatMap((item) => [
      normalizePreviewUrl(cleanText((item["1"] as Record<string, unknown> | undefined)?.["4"])),
      extractIframePreviewUrl(cleanText((item["3"] as Record<string, unknown> | undefined)?.["2"])),
    ])
    .filter((value): value is string => Boolean(value));

  logProgress(`detail ${row.id}: previewRecords=${previewRecords.length} previewUrls=${previewUrls.length}`);

  if (!previewUrls.length) {
    return null;
  }

  for (const previewUrl of previewUrls) {
    const html = await fetchHtmlText(previewUrl, args.timeoutMs, row.id, args.transport);
    const parsed = parsePreviewHtml(html, previewUrl);

    if (parsed) {
      logProgress(
        `preview ${row.id}: parsed title=${Boolean(parsed.title)} body=${Boolean(parsed.body)} brandUrl=${parsed.brandUrl ?? "null"}`,
      );
      return parsed;
    }

    logProgress(`preview ${row.id}: parser found no text payload`);
  }

  return null;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pool = getPool();
  const stats: Stats = {
    candidates: 0,
    failed: 0,
    htmlFound: 0,
    noHtml: 0,
    scanned: 0,
    updated: 0,
  };

  try {
    const limitClause = args.limit ? `limit ${args.limit}` : "";
    const [rows] = await pool.query<CandidateRow[]>(
      `
        select
          ads.id,
          ads.advertiser_id as advertiserId,
          advertisers.source_advertiser_id as sourceAdvertiserId,
          ads.source_ad_id as sourceAdId,
          ads.title,
          ads.body,
          ads.metadata
        from ads
        inner join advertisers on advertisers.id = ads.advertiser_id
        where ads.source = 'google'
          and advertisers.source = 'google'
          and ads.source_ad_id is not null
          and advertisers.source_advertiser_id is not null
          and coalesce(json_unquote(json_extract(ads.metadata, '$.googleFormatCode')), '') = '1'
          and (? = 1 or json_unquote(json_extract(ads.metadata, '$.googleHtmlPreviewBackfilledAt')) is null)
          and (? is null or ads.id = ?)
          and (? is null or ads.advertiser_id = ?)
        order by ads.updated_at desc
        ${limitClause}
      `,
      [args.force ? 1 : 0, args.adId, args.adId, args.advertiserId, args.advertiserId],
    );

    stats.candidates = rows.length;
    logProgress(
      [
        `found ${rows.length} google text candidates`,
        args.dryRun ? "(dry run)" : "",
        args.force ? "with force" : "",
        `concurrency=${args.concurrency}`,
        `delayMs=${args.delayMs}`,
        `timeoutMs=${args.timeoutMs}`,
        `transport=${args.transport}`,
        `transportPlan=${describeTransportPlan(args.transport)}`,
      ].filter(Boolean).join(" "),
    );

    if (args.transport === "auto" && !getWebScrapingApiProxyOptions()) {
      logProgress(
        "warning: transport=auto has no proxy credentials, so requests are direct from this server IP and Google may immediately return 429 if that IP is already rate-limited",
      );
    }

    await runPool(rows, args.concurrency, async (row, index) => {
      stats.scanned += 1;
      logProgress(`scanning ${index + 1}/${rows.length} ${row.id}`);

      try {
        const preview = await hydrateFromHtml(row, args);

        if (!preview?.title || !preview.body) {
          stats.noHtml += 1;
          logProgress(`no html ${row.id}`);
          return;
        }

        stats.htmlFound += 1;

        const nextMetadata = getNextMetadata(row, preview);

        if (!needsUpdate(row, preview, nextMetadata)) {
          logProgress(`unchanged ${row.id}`);
          return;
        }

        stats.updated += 1;

        if (!args.dryRun) {
          await pool.execute("update ads set title = ?, body = ?, metadata = ?, updated_at = ? where id = ?", [
            preview.title.slice(0, 255),
            preview.body,
            JSON.stringify(nextMetadata),
            new Date(),
            row.id,
          ]);
        }

        logProgress(`${args.dryRun ? "would update" : "updated"} ${row.id}`);
      } catch (error) {
        if (error instanceof GoogleRateLimitError) {
          logProgress(`aborting: ${error.message}; rerun later or change proxy pool/session settings`);
          throw error;
        }

        stats.failed += 1;

        if (stats.failed <= 10) {
          logProgress(`failed ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      } finally {
        if (args.delayMs > 0) {
          await sleep(args.delayMs);
        }

        if (stats.scanned % 25 === 0 || stats.scanned === rows.length) {
          logProgress(
            `scanned=${stats.scanned}/${rows.length} html=${stats.htmlFound} updated=${stats.updated} no_html=${stats.noHtml} failed=${stats.failed}`,
          );
        }
      }
    });

    logProgress(`summary ${JSON.stringify(stats)}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[backfill:google-html-preview] failed", error);
  process.exitCode = 1;
});
