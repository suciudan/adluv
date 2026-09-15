import { envInteger, envString } from "./env";
import { requestText, responseHeader } from "./http-client";
import type { ProxyProvider } from "./providers";
import { runProbe, type ProbeResult } from "./results";

const googleRpcBaseUrl = "https://adstransparency.google.com/anji/_/rpc";
const googleUkRegionCode = 2826;

function googleRpcRequest(path: string, payload: unknown) {
  return {
    body: new URLSearchParams({
      "f.req": JSON.stringify(payload),
    }),
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "x-same-domain": "1",
      origin: "https://adstransparency.google.com",
      referer: "https://adstransparency.google.com/",
    },
    method: "POST" as const,
    timeoutMs: envInteger("PROXY_LAB_GOOGLE_RPC_TIMEOUT_MS", 30_000),
    url: `${googleRpcBaseUrl}/${path}?authuser=`,
  };
}

async function runGoogleRpc<TPayload extends object>(
  provider: ProxyProvider,
  target: string,
  path: string,
  payload: TPayload,
  summarize: (response: unknown) => string,
) {
  return runProbe(provider, target, async () => {
    const response = await requestText(provider, googleRpcRequest(path, payload));

    if (!response.ok) {
      const retryAfter = responseHeader(response.headers, "retry-after");
      const location = responseHeader(response.headers, "location");

      return {
        detail: [
          `body_bytes=${response.body.length}`,
          retryAfter ? `retry_after=${retryAfter}` : null,
          location ? `location=${location}` : null,
        ].filter(Boolean).join(" "),
        ok: false,
        status: response.status,
      };
    }

    const parsed = JSON.parse(response.body) as unknown;

    return {
      detail: summarize(parsed),
      ok: true,
      status: response.status,
    };
  });
}

export async function runGoogleRpcSearchSuggestionsProbe(provider: ProxyProvider): Promise<ProbeResult> {
  const query = envString("PROXY_LAB_GOOGLE_QUERY", "nike");
  const maxResults = envInteger("PROXY_LAB_GOOGLE_MAX_RESULTS", 5);

  return runGoogleRpc(
    provider,
    "google.rpc.search_suggestions",
    "SearchService/SearchSuggestions",
    {
      1: query,
      2: maxResults,
      3: maxResults,
      4: [googleUkRegionCode],
      5: { 1: 1 },
    },
    (payload) => {
      const items = (payload as { "1"?: unknown[] })["1"] ?? [];

      return `query="${query}" items=${items.length}`;
    },
  );
}

export async function runGoogleRpcProbes(provider: ProxyProvider): Promise<ProbeResult[]> {
  const advertiserId = envString("PROXY_LAB_GOOGLE_ADVERTISER_ID");
  const results: ProbeResult[] = [];

  results.push(await runGoogleRpcSearchSuggestionsProbe(provider));

  if (advertiserId) {
    const maxResults = envInteger("PROXY_LAB_GOOGLE_MAX_RESULTS", 5);

    results.push(await runGoogleRpc(
      provider,
      "google.rpc.search_creatives",
      "SearchService/SearchCreatives",
      {
        2: maxResults,
        3: {
          8: [googleUkRegionCode],
          12: { 1: "", 2: true },
          13: { 1: [advertiserId] },
        },
        7: { 1: 1, 2: 0, 3: googleUkRegionCode },
      },
      (payload) => {
        const items = (payload as { "1"?: unknown[] })["1"] ?? [];

        return `advertiser_id=${advertiserId} items=${items.length}`;
      },
    ));
  } else {
    results.push({
      detail: "set PROXY_LAB_GOOGLE_ADVERTISER_ID to test SearchCreatives",
      durationMs: 0,
      ok: true,
      provider: provider.label,
      target: "google.rpc.search_creatives.skip",
    });
  }

  const previewUrl = envString("PROXY_LAB_GOOGLE_PREVIEW_URL");

  if (previewUrl) {
    results.push(await runProbe(provider, "google.http.preview", async () => {
      const response = await requestText(provider, {
        headers: {
          "user-agent": "Mozilla/5.0",
        },
        timeoutMs: envInteger("PROXY_LAB_GOOGLE_PREVIEW_TIMEOUT_MS", 30_000),
        url: previewUrl,
      });

      return {
        detail: `body_bytes=${response.body.length}`,
        ok: response.ok,
        status: response.status,
      };
    }));
  }

  return results;
}
