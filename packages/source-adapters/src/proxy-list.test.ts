import assert from "node:assert/strict";
import test from "node:test";

import {
  loadGoogleRpcProxyUrlsFromEnv,
  loadGoogleRpcProxyUrlsFromEnvAsync,
  loadMetaProxyUrlsFromEnvAsync,
} from "./proxy-list";

function env(overrides: Record<string, string>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...overrides,
  } as NodeJS.ProcessEnv;
}

test("loadGoogleRpcProxyUrlsFromEnv reads shared inline PROXIES_LIST", () => {
  assert.deepEqual(
    loadGoogleRpcProxyUrlsFromEnv(env({
      PROXIES_LIST: [
        "198.51.100.10:8000:user-one:pass-one",
        "user-two:pass-two@proxy.example:9000",
      ].join("\n"),
    })),
    [
      "http://user-one:pass-one@198.51.100.10:8000/",
      "http://user-two:pass-two@proxy.example:9000/",
    ],
  );
});

test("loadGoogleRpcProxyUrlsFromEnvAsync downloads shared PROXIES_LIST url", async () => {
  const originalFetch = globalThis.fetch;
  const downloadUrl = "https://proxy.webshare.io/api/v2/proxy/list/download/test-google";
  let requestCount = 0;

  globalThis.fetch = (async (input) => {
    requestCount += 1;
    assert.equal(String(input), downloadUrl);
    return new Response("203.0.113.10:8080:user:pass\n");
  }) as typeof fetch;

  try {
    assert.deepEqual(
      await loadGoogleRpcProxyUrlsFromEnvAsync(env({
        PROXIES_LIST: downloadUrl,
      })),
      ["http://user:pass@203.0.113.10:8080/"],
    );
    assert.equal(requestCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadMetaProxyUrlsFromEnvAsync uses shared PROXIES_LIST url", async () => {
  const originalFetch = globalThis.fetch;
  const downloadUrl = "https://proxy.webshare.io/api/v2/proxy/list/download/test-meta";

  globalThis.fetch = (async () => new Response("203.0.113.11:8081:user:pass\n")) as typeof fetch;

  try {
    assert.deepEqual(
      await loadMetaProxyUrlsFromEnvAsync(env({
        PROXIES_LIST: downloadUrl,
      })),
      ["http://user:pass@203.0.113.11:8081/"],
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
