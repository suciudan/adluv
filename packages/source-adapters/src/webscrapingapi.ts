import http from "node:http";
import https from "node:https";

import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";

export type WebScrapingApiTextResponse = {
  headers: Record<string, string | string[] | undefined>;
  ok: boolean;
  status: number;
  text: string;
};

export type WebScrapingApiProxyOptions = {
  password?: string;
  sessionId?: string;
  url?: string;
  username?: string;
};

export type HttpProxyOptions = {
  password?: string;
  url: string;
  username?: string;
};

type FetchTextOptions = {
  apiKey: string;
  body?: Buffer | string | URLSearchParams;
  country?: string;
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PUT";
  renderJs?: boolean;
  timeoutMs: number;
};

type FetchTextViaProxyOptions = {
  body?: Buffer | string | URLSearchParams;
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PUT";
  proxy: WebScrapingApiProxyOptions;
  timeoutMs: number;
};

type FetchTextViaHttpProxyOptions = Omit<FetchTextViaProxyOptions, "proxy"> & {
  proxy: HttpProxyOptions | string;
};

const webScrapingApiMaxTimeoutMs = 120_000;
const webScrapingApiAbortBufferMs = 5_000;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

export function getResponseHeader(headers: WebScrapingApiTextResponse["headers"], name: string) {
  const value = headers[name.toLowerCase()];

  if (value) {
    return Array.isArray(value) ? value[0] : value;
  }

  const scrapedHeaders = headers["wsa-scraped-headers"];
  const scrapedHeadersValue = Array.isArray(scrapedHeaders) ? scrapedHeaders[0] : scrapedHeaders;

  if (scrapedHeadersValue) {
    const parsed = parseScrapedHeaders(scrapedHeadersValue);
    const scrapedValue = parsed[name.toLowerCase()];

    if (scrapedValue) {
      return Array.isArray(scrapedValue) ? scrapedValue[0] : scrapedValue;
    }
  }

  if (name.toLowerCase() === "set-cookie") {
    const clientCookies = headers["wsa-client-cookies"];

    return Array.isArray(clientCookies) ? clientCookies[0] : clientCookies;
  }
}

function buildApiUrl(targetUrl: string, options: FetchTextOptions) {
  const apiUrl = new URL("https://api.webscrapingapi.com/v2");

  apiUrl.searchParams.set("api_key", options.apiKey);
  apiUrl.searchParams.set("url", targetUrl);
  apiUrl.searchParams.set("timeout", String(Math.min(options.timeoutMs, webScrapingApiMaxTimeoutMs)));

  if (options.country?.trim()) {
    apiUrl.searchParams.set("country", options.country.trim().toLowerCase());
  }

  if (options.renderJs) {
    apiUrl.searchParams.set("render_js", "1");
  }

  return apiUrl;
}

function toFetchBody(body: FetchTextOptions["body"]) {
  if (Buffer.isBuffer(body)) {
    return new Uint8Array(body);
  }

  return body;
}

function toRequestBody(body: FetchTextViaProxyOptions["body"]) {
  if (body === undefined) {
    return null;
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  return Buffer.from(body instanceof URLSearchParams ? body.toString() : body);
}

function buildProxyUrl(proxy: WebScrapingApiProxyOptions) {
  const username = proxy.username?.trim();
  const password = proxy.password?.trim();
  const rawProxyUrl = proxy.url?.trim();

  if (!rawProxyUrl) {
    return null;
  }

  const url = new URL(rawProxyUrl.includes("://") ? rawProxyUrl : `http://${rawProxyUrl}`);
  const hasEmbeddedCredentials = Boolean(url.username && url.password);

  if (!hasEmbeddedCredentials) {
    if (!username || !password) {
      return null;
    }

    const proxyUsername = username.startsWith("username=") ? username : `username=${username}`;

    url.username = proxyUsername.includes("country=") ? proxyUsername : `${proxyUsername}+country=us`;
    url.password = password;
  }

  const sessionId = proxy.sessionId?.trim();

  if (sessionId && !url.username.includes("session=")) {
    url.username = `${url.username}+session=${sessionId}`;
  }


  return url;
}

function buildHttpProxyUrl(proxy: HttpProxyOptions | string) {
  if (typeof proxy === "string") {
    return new URL(proxy.includes("://") ? proxy : `http://${proxy}`);
  }

  const url = new URL(proxy.url.includes("://") ? proxy.url : `http://${proxy.url}`);

  if (!url.username && proxy.username) {
    url.username = proxy.username;
  }

  if (!url.password && proxy.password) {
    url.password = proxy.password;
  }

  return url;
}

function buildRequestHeaders(headers?: Record<string, string>) {
  const requestHeaders: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers ?? {})) {
    if (name.toLowerCase() === "content-length") {
      continue;
    }

    requestHeaders[`WSA-${name}`] = value;
  }

  return requestHeaders;
}

function parseScrapedHeaders(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).map(([name, headerValue]) => [
          name.toLowerCase(),
          Array.isArray(headerValue) ? headerValue.map(String) : String(headerValue),
        ]),
      );
    }
  } catch {
    // Some providers return header blobs instead of JSON.
  }

  const headers: Record<string, string> = {};

  for (const line of value.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex <= 0) {
      continue;
    }

    headers[line.slice(0, separatorIndex).trim().toLowerCase()] = line.slice(separatorIndex + 1).trim();
  }

  return headers;
}

export async function fetchTextViaWebScrapingApi(
  targetUrl: string,
  options: FetchTextOptions,
): Promise<WebScrapingApiTextResponse> {
  const response = await fetch(buildApiUrl(targetUrl, options), {
    body: toFetchBody(options.body),
    headers: buildRequestHeaders(options.headers),
    method: options.method ?? "GET",
    signal: AbortSignal.timeout(Math.min(options.timeoutMs, webScrapingApiMaxTimeoutMs) + webScrapingApiAbortBufferMs),
  });

  return {
    headers: Object.fromEntries(response.headers.entries()),
    ok: response.ok,
    status: response.status,
    text: await response.text(),
  };
}

export function fetchTextViaWebScrapingApiProxy(
  targetUrl: string,
  options: FetchTextViaProxyOptions,
  redirectCount = 0,
): Promise<WebScrapingApiTextResponse> {
  const url = new URL(targetUrl);
  const proxyUrl = buildProxyUrl(options.proxy);

  if (!proxyUrl) {
    throw new Error("WebScrapingAPI proxy credentials are not configured.");
  }

  const body = toRequestBody(options.body);
  const transport = url.protocol === "http:" ? http : https;
  const agent =
    url.protocol === "http:"
      ? (new HttpProxyAgent(proxyUrl.toString()) as unknown as http.Agent)
      : (new HttpsProxyAgent(proxyUrl.toString()) as unknown as http.Agent);
  const requestHeaders = {
    "accept-encoding": "identity",
    ...(options.headers ?? {}),
    ...(body ? { "content-length": String(body.byteLength) } : {}),
  };

  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        agent,
        headers: requestHeaders,
        method: options.method ?? "GET",
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location;

          if (location && redirectStatuses.has(status) && redirectCount < 5) {
            const redirectUrl = new URL(Array.isArray(location) ? location[0] : location, url);
            const shouldSwitchToGet = status === 303 || ((status === 301 || status === 302) && options.method === "POST");

            resolve(
              fetchTextViaWebScrapingApiProxy(
                redirectUrl.toString(),
                {
                  ...options,
                  body: shouldSwitchToGet ? undefined : options.body,
                  method: shouldSwitchToGet ? "GET" : options.method,
                },
                redirectCount + 1,
              ),
            );
            return;
          }

          resolve({
            headers: response.headers,
            ok: status >= 200 && status < 300,
            status,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
        response.on("error", reject);
      },
    );

    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new Error(`Request to ${url.origin}${url.pathname} via WebScrapingAPI proxy timed out.`));
    });
    request.on("error", reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

export function fetchTextViaHttpProxy(
  targetUrl: string,
  options: FetchTextViaHttpProxyOptions,
  redirectCount = 0,
): Promise<WebScrapingApiTextResponse> {
  const url = new URL(targetUrl);
  const proxyUrl = buildHttpProxyUrl(options.proxy);
  const body = toRequestBody(options.body);
  const transport = url.protocol === "http:" ? http : https;
  const agent =
    url.protocol === "http:"
      ? (new HttpProxyAgent(proxyUrl.toString()) as unknown as http.Agent)
      : (new HttpsProxyAgent(proxyUrl.toString()) as unknown as http.Agent);
  const requestHeaders = {
    "accept-encoding": "identity",
    ...(options.headers ?? {}),
    ...(body ? { "content-length": String(body.byteLength) } : {}),
  };

  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        agent,
        headers: requestHeaders,
        method: options.method ?? "GET",
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location;

          if (location && redirectStatuses.has(status) && redirectCount < 5) {
            const redirectUrl = new URL(Array.isArray(location) ? location[0] : location, url);
            const shouldSwitchToGet = status === 303 || ((status === 301 || status === 302) && options.method === "POST");

            resolve(
              fetchTextViaHttpProxy(
                redirectUrl.toString(),
                {
                  ...options,
                  body: shouldSwitchToGet ? undefined : options.body,
                  method: shouldSwitchToGet ? "GET" : options.method,
                },
                redirectCount + 1,
              ),
            );
            return;
          }

          resolve({
            headers: response.headers,
            ok: status >= 200 && status < 300,
            status,
            text: Buffer.concat(chunks).toString("utf8"),
          });
        });
        response.on("error", reject);
      },
    );

    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new Error(`Request to ${url.origin}${url.pathname} via HTTP proxy timed out.`));
    });
    request.on("error", reject);

    if (body) {
      request.write(body);
    }

    request.end();
  });
}
