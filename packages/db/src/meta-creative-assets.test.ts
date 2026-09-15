import assert from "node:assert/strict";
import { test } from "node:test";

import { getMetaCreativeAssets } from "./repositories";

const storedPreviewUrl = "https://cdn.example.com/ad-assets/preview.webp";
const sourcePreviewUrl = "https://scontent.example.com/top-level.jpg";

function buildCarouselMetadata(metaCreativeAssets: unknown[]) {
  return {
    sourceMediaUrl: sourcePreviewUrl,
    sourceThumbnailUrl: sourcePreviewUrl,
    assetStoredUrl: storedPreviewUrl,
    assetThumbnailStoredUrl: storedPreviewUrl,
    metaCreativeAssets,
    rawPayload: {
      snapshot: {
        cards: [
          {
            title: "Global scale. Local control.",
            original_image_url: sourcePreviewUrl,
            link_url: "https://example.com/one",
          },
          {
            title: "Global scale. Local control.",
            original_image_url: sourcePreviewUrl,
            link_url: "https://example.com/two",
          },
          {
            title: "Global scale. Local control.",
            original_image_url: sourcePreviewUrl,
            link_url: "https://example.com/three",
          },
        ],
      },
    },
  };
}

test("getMetaCreativeAssets supplements partial materialized Meta carousel assets from raw cards", () => {
  const assets = getMetaCreativeAssets(
    buildCarouselMetadata([
      {
        label: "Original",
        title: "Global scale. Local control.",
        sourceMediaUrl: sourcePreviewUrl,
        sourceThumbnailUrl: sourcePreviewUrl,
        assetStoredUrl: storedPreviewUrl,
        assetThumbnailStoredUrl: storedPreviewUrl,
      },
    ]),
  );

  assert.equal(assets.length, 3);
  assert.deepEqual(
    assets.map((asset) => asset.label),
    ["Original", "Variant 1", "Variant 2"],
  );
  assert.deepEqual(
    assets.map((asset) => asset.mediaUrl?.endsWith("/ad-assets/preview.webp")),
    [true, true, true],
  );
});

test("getMetaCreativeAssets falls back to raw Meta cards when materialized assets are unusable", () => {
  const assets = getMetaCreativeAssets(
    buildCarouselMetadata([
      {
        label: "Original",
        sourceMediaUrl: sourcePreviewUrl,
        sourceThumbnailUrl: sourcePreviewUrl,
        assetStorageError: "Creative asset request failed with status 403.",
        assetThumbnailStorageError: "Creative asset request failed with status 403.",
      },
    ]),
  );

  assert.equal(assets.length, 3);
  assert.deepEqual(
    assets.map((asset) => asset.mediaUrl?.endsWith("/ad-assets/preview.webp")),
    [true, true, true],
  );
});

test("getMetaCreativeAssets preserves raw Meta carousel order when later slots are materialized", () => {
  const assets = getMetaCreativeAssets(
    buildCarouselMetadata([
      {
        label: "Original",
        sourceMediaUrl: sourcePreviewUrl,
        sourceThumbnailUrl: sourcePreviewUrl,
        assetStoredUrl: storedPreviewUrl,
        assetThumbnailStoredUrl: storedPreviewUrl,
      },
      {
        label: "Variant 2",
        sourceMediaUrl: sourcePreviewUrl,
        sourceThumbnailUrl: sourcePreviewUrl,
        assetStoredUrl: storedPreviewUrl,
        assetThumbnailStoredUrl: storedPreviewUrl,
      },
    ]),
  );

  assert.equal(assets.length, 3);
  assert.deepEqual(
    assets.map((asset) => asset.label),
    ["Original", "Variant 1", "Variant 2"],
  );
  assert.equal(assets[2].mediaUrl?.endsWith("/ad-assets/preview.webp"), true);
});
