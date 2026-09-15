import assert from "node:assert/strict";
import test from "node:test";

import { getWorkerMetaFetchOptions } from "./source-adapter";

const envKeys = [
  "GOOGLE_RPC_PROXY_FILE",
  "GOOGLE_RPC_PROXY_LIST",
  "GOOGLE_RPC_PROXY_URLS",
  "META_PROXY_FILE",
  "META_PROXY_LIST",
  "META_PROXY_URLS",
  "PROXIES_LIST",
  "META_WEBSCRAPINGAPI_COUNTRY",
  "WEBSCRAPINGAPI_API_KEY",
  "WEBSCRAPINGAPI_COUNTRY",
  "WEBSCRAPINGAPI_PROXY_PASSWORD",
  "WEBSCRAPINGAPI_PROXY_URL",
  "WEBSCRAPINGAPI_PROXY_USERNAME",
] as const;

function withEnv(overrides: Partial<Record<(typeof envKeys)[number], string>>, fn: () => void) {
  const previous = new Map<string, string | undefined>();

  for (const key of envKeys) {
    previous.set(key, process.env[key]);

    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  try {
    fn();
  } finally {
    for (const key of envKeys) {
      const value = previous.get(key);

      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("Meta fetch options use proxy list and ignore WSA credentials", () => {
  withEnv(
    {
      GOOGLE_RPC_PROXY_FILE: "",
      GOOGLE_RPC_PROXY_LIST: "",
      GOOGLE_RPC_PROXY_URLS: "",
      META_PROXY_FILE: "",
      META_PROXY_LIST: "",
      META_PROXY_URLS: "http://proxy-one.example:8080,http://proxy-two.example:8080",
      PROXIES_LIST: "",
      META_WEBSCRAPINGAPI_COUNTRY: "",
      WEBSCRAPINGAPI_API_KEY: "wsa-key",
      WEBSCRAPINGAPI_COUNTRY: "",
      WEBSCRAPINGAPI_PROXY_PASSWORD: "wsa-password",
      WEBSCRAPINGAPI_PROXY_URL: "http://wsa-proxy.example:8000",
      WEBSCRAPINGAPI_PROXY_USERNAME: "wsa-user",
    },
    () => {
      const options = getWorkerMetaFetchOptions();

      assert.equal(options.metaTransportOrder, "proxy-first");
      assert.deepEqual(options.metaProxyUrls, [
        "http://proxy-one.example:8080",
        "http://proxy-two.example:8080",
      ]);
      assert.equal(options.webScrapingApiCountry, undefined);
      assert.equal(options.webScrapingApiKey, undefined);
      assert.equal(options.webScrapingApiProxy, undefined);
    },
  );
});
