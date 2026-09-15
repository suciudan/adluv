import assert from "node:assert/strict";
import test from "node:test";

import { getBackfilledMetaMediaUrl } from "./meta-creative-backfill-media";

test("Meta creative backfill rejects refreshed non-stored preview media", () => {
  const currentMediaUrl = "https://scontent.example.com/original-creative.jpg";

  assert.equal(
    getBackfilledMetaMediaUrl({
      currentMediaUrl,
      hydratedMediaUrl: "https://landing.example.com/page-preview.webp",
      hydratedMetadata: {},
    }),
    currentMediaUrl,
  );
});

test("Meta creative backfill accepts stored ad asset media", () => {
  assert.equal(
    getBackfilledMetaMediaUrl({
      currentMediaUrl: "https://scontent.example.com/original-creative.jpg",
      hydratedMediaUrl: "https://cdn.example.test/ad-assets/stored-creative.webp",
      hydratedMetadata: {},
    }),
    "https://cdn.example.test/ad-assets/stored-creative.webp",
  );
});

test("Meta creative backfill promotes stored asset metadata when hydrated media is a preview", () => {
  assert.equal(
    getBackfilledMetaMediaUrl({
      currentMediaUrl: "https://scontent.example.com/original-creative.jpg",
      hydratedMediaUrl: "https://landing.example.com/page-preview.webp",
      hydratedMetadata: {
        assetStoredUrl: "https://cdn.example.test/ad-assets/stored-creative.webp",
      },
    }),
    "https://cdn.example.test/ad-assets/stored-creative.webp",
  );
});
