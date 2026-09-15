import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveCdnStoragePath, resolveRepoPath } from "./paths";

test("worker uses the configured CDN storage directory in every environment", () => {
  const previousRoot = process.env.CDN_STORAGE_ROOT;
  const previousMode = process.env.NODE_ENV;
  try {
    for (const mode of ["development", "production"]) {
      process.env.NODE_ENV = mode;
      process.env.CDN_STORAGE_ROOT = "/tmp/adluv-test-assets";
      assert.equal(resolveCdnStoragePath("ad-assets", "sample.webp"), path.resolve("/tmp/adluv-test-assets/ad-assets/sample.webp"));
      process.env.CDN_STORAGE_ROOT = "";
      assert.equal(resolveCdnStoragePath("ad-assets"), resolveRepoPath("apps", "cdn", "storage", "ad-assets"));
    }
  } finally {
    if (previousRoot === undefined) delete process.env.CDN_STORAGE_ROOT;
    else process.env.CDN_STORAGE_ROOT = previousRoot;
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
  }
});
