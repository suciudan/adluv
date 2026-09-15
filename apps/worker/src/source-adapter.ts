import {
  createSourceAdapter,
  loadGoogleRpcProxyUrlsFromEnv,
  loadGoogleRpcProxyUrlsFromEnvAsync,
  loadMetaProxyUrlsFromEnv,
  loadMetaProxyUrlsFromEnvAsync,
  type CreateMetaAdapterOptions,
  type SourceName,
} from "@adluv/source-adapters";
import { loadWorkspaceEnv } from "@adluv/config/load-env";

loadWorkspaceEnv();

export function getWebScrapingApiProxyOptions() {
  const username = process.env.WEBSCRAPINGAPI_PROXY_USERNAME?.trim();
  const password = process.env.WEBSCRAPINGAPI_PROXY_PASSWORD?.trim();
  const url = process.env.WEBSCRAPINGAPI_PROXY_URL?.trim();

  if (!url) {
    return undefined;
  }

  return username && password ? { username, password, url } : { url };
}

export async function createWorkerSourceAdapter(source: SourceName) {
  const [googleRpcProxyUrls, metaFetchOptions] = await Promise.all([
    loadGoogleRpcProxyUrlsFromEnvAsync(),
    getWorkerMetaFetchOptionsAsync(),
  ]);
  const metaProxyUrls = metaFetchOptions.metaProxyUrls ?? [];
  const shouldUseLinkedInProxyList = source === "linkedin" && googleRpcProxyUrls.length > 0;
  const shouldUseWebScrapingApi = source !== "facebook" && !metaProxyUrls.length && !shouldUseLinkedInProxyList;

  return createSourceAdapter(source, {
    googleRpcProxyUrls,
    metaProxyUrls: metaFetchOptions.metaProxyUrls,
    metaTransportOrder: metaFetchOptions.metaTransportOrder,
    webScrapingApiCountry: metaFetchOptions.webScrapingApiCountry,
    proxyUrls: shouldUseLinkedInProxyList ? googleRpcProxyUrls : undefined,
    webScrapingApiProxy: shouldUseWebScrapingApi ? metaFetchOptions.webScrapingApiProxy ?? getWebScrapingApiProxyOptions() : undefined,
    webScrapingApiKey: shouldUseWebScrapingApi
      ? (metaFetchOptions.webScrapingApiKey ?? process.env.WEBSCRAPINGAPI_API_KEY?.trim()) || undefined
      : undefined,
  });
}

export async function getWorkerMetaFetchOptionsAsync(): Promise<CreateMetaAdapterOptions> {
  const metaProxyUrls = await loadMetaProxyUrlsFromEnvAsync();

  return {
    metaProxyUrls,
    metaTransportOrder: "proxy-first",
  };
}

export function getWorkerMetaFetchOptions(): CreateMetaAdapterOptions {
  const metaProxyUrls = loadMetaProxyUrlsFromEnv();

  return {
    metaProxyUrls,
    metaTransportOrder: "proxy-first",
  };
}

export function getGoogleRpcProxyUrls() {
  return loadGoogleRpcProxyUrlsFromEnv();
}

export async function getGoogleRpcProxyUrlsAsync() {
  return loadGoogleRpcProxyUrlsFromEnvAsync();
}

export function getMetaProxyUrls() {
  return loadMetaProxyUrlsFromEnv();
}

export async function getMetaProxyUrlsAsync() {
  return loadMetaProxyUrlsFromEnvAsync();
}
