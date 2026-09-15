import http from "node:http";
import https from "node:https";

import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";

import { getProxyUrl, type ProxyProvider } from "./providers";

export type ProbeResponse = {
  body: string;
  headers: Record<string, string | string[] | undefined>;
  ok: boolean;
  status: number;
  url: string;
};

export type ProbeRequest = {
  body?: string | URLSearchParams;
  headers?: Record<string, string>;
  method?: "GET" | "HEAD" | "POST";
  timeoutMs?: number;
  url: string;
};

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

function bodyToBuffer(body: ProbeRequest["body"]) {
  if (body === undefined) {
    return null;
  }

  return Buffer.from(body instanceof URLSearchParams ? body.toString() : body);
}

function normalizeHeaders(headers: http.IncomingHttpHeaders) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

function getHeader(headers: http.IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()];

  return Array.isArray(value) ? value[0] : value;
}

function readBody(response: http.IncomingMessage) {
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

function requestViaNode(
  provider: ProxyProvider,
  request: ProbeRequest,
  currentUrl = new URL(request.url),
  redirectCount = 0,
): Promise<ProbeResponse> {
  const body = bodyToBuffer(request.body);
  const transport = currentUrl.protocol === "http:" ? http : https;
  const proxyUrl = getProxyUrl(provider);
  const agent = proxyUrl
    ? currentUrl.protocol === "http:"
      ? new HttpProxyAgent(proxyUrl.toString())
      : new HttpsProxyAgent(proxyUrl.toString())
    : undefined;
  const headers = {
    "accept-encoding": "identity",
    ...(request.headers ?? {}),
    ...(body ? { "content-length": String(body.byteLength) } : {}),
  };

  return new Promise((resolve, reject) => {
    const outgoing = transport.request(
      currentUrl,
      {
        agent,
        headers,
        method: request.method ?? "GET",
      },
      async (response) => {
        try {
          const status = response.statusCode ?? 0;
          const location = getHeader(response.headers, "location");

          if (location && redirectStatuses.has(status) && redirectCount < 5) {
            response.resume();
            const nextUrl = new URL(location, currentUrl);
            resolve(requestViaNode(provider, request, nextUrl, redirectCount + 1));
            return;
          }

          const responseBody = request.method === "HEAD" ? "" : await readBody(response);

          resolve({
            body: responseBody,
            headers: normalizeHeaders(response.headers),
            ok: status >= 200 && status < 300,
            status,
            url: currentUrl.toString(),
          });
        } catch (error) {
          reject(error);
        }
      },
    );

    outgoing.setTimeout(request.timeoutMs ?? provider.timeoutMs, () => {
      outgoing.destroy(new Error(`Request to ${currentUrl.toString()} timed out.`));
    });
    outgoing.on("error", reject);

    if (body) {
      outgoing.write(body);
    }

    outgoing.end();
  });
}

function buildWebScrapingApiRestUrl(targetUrl: string, provider: ProxyProvider, timeoutMs: number) {
  if (!provider.apiKey) {
    throw new Error(`Proxy provider "${provider.label}" is missing an API key.`);
  }

  const apiUrl = new URL("https://api.webscrapingapi.com/v2");
  apiUrl.searchParams.set("api_key", provider.apiKey);
  apiUrl.searchParams.set("url", targetUrl);
  apiUrl.searchParams.set("timeout", String(Math.max(timeoutMs, 120_000)));

  if (provider.country) {
    apiUrl.searchParams.set("country", provider.country);
  }

  return apiUrl;
}

function buildWebScrapingApiRestHeaders(headers?: Record<string, string>) {
  const requestHeaders: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers ?? {})) {
    if (name.toLowerCase() === "content-length") {
      continue;
    }

    requestHeaders[`WSA-${name}`] = value;
  }

  return requestHeaders;
}

async function requestViaWebScrapingApiRest(provider: ProxyProvider, request: ProbeRequest): Promise<ProbeResponse> {
  const timeoutMs = request.timeoutMs ?? provider.timeoutMs;
  const response = await fetch(buildWebScrapingApiRestUrl(request.url, provider, timeoutMs), {
    body: request.body,
    headers: buildWebScrapingApiRestHeaders(request.headers),
    method: request.method ?? "GET",
    signal: AbortSignal.timeout(timeoutMs + 5_000),
  });

  return {
    body: await response.text(),
    headers: Object.fromEntries(response.headers.entries()),
    ok: response.ok,
    status: response.status,
    url: request.url,
  };
}

export async function requestText(provider: ProxyProvider, request: ProbeRequest) {
  if (provider.mode === "webscrapingapi-rest") {
    return requestViaWebScrapingApiRest(provider, request);
  }

  return requestViaNode(provider, request);
}

export function responseHeader(headers: ProbeResponse["headers"], name: string) {
  const normalizedName = name.toLowerCase();
  const value = headers[normalizedName];

  if (value) {
    return Array.isArray(value) ? value[0] : value;
  }

  const scrapedHeaders = headers["wsa-scraped-headers"];
  const scrapedHeadersValue = Array.isArray(scrapedHeaders) ? scrapedHeaders[0] : scrapedHeaders;

  if (scrapedHeadersValue) {
    try {
      const parsed = JSON.parse(scrapedHeadersValue) as Record<string, string | string[]>;
      const scrapedValue = parsed[normalizedName];

      return Array.isArray(scrapedValue) ? scrapedValue[0] : scrapedValue;
    } catch {
      for (const line of scrapedHeadersValue.split(/\r?\n/)) {
        const separatorIndex = line.indexOf(":");

        if (separatorIndex <= 0) {
          continue;
        }

        if (line.slice(0, separatorIndex).trim().toLowerCase() === normalizedName) {
          return line.slice(separatorIndex + 1).trim();
        }
      }
    }
  }

  if (normalizedName === "set-cookie") {
    const cookie = headers["wsa-client-cookies"];

    return Array.isArray(cookie) ? cookie[0] : cookie;
  }
}
