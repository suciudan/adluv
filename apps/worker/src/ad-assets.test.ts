import assert from "node:assert/strict";
import test from "node:test";

import {
  CreativeAssetRequestError,
  ensureMetaCreativeAssetsFromRawPayload,
  isExpiredMetaCreativeAssetUrlError,
  materializeAdAssets,
} from "./ad-assets";

const sourcePreviewUrl = "https://scontent.example.com/repeated-card-image.jpg";
const storedPreviewUrl = "https://cdn.example.test/ad-assets/repeated-card-image.webp";
const expiredFbCdnUrl = "https://scontent.fbcdn.net/v/t39.35426-6/expired_n.jpg?oh=old&oe=old";
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4////fwAJ+wP9CNHoHgAAAABJRU5ErkJggg==",
  "base64",
);

function buildRepeatedCardMetadata() {
  return {
    sourceMediaUrl: sourcePreviewUrl,
    sourceThumbnailUrl: sourcePreviewUrl,
    assetStoredUrl: storedPreviewUrl,
    assetThumbnailStoredUrl: storedPreviewUrl,
    metaCreativeAssets: [
      {
        label: "Original",
        sourceMediaUrl: sourcePreviewUrl,
        sourceThumbnailUrl: sourcePreviewUrl,
        assetStoredUrl: storedPreviewUrl,
        assetThumbnailStoredUrl: storedPreviewUrl,
      },
    ],
    rawPayload: {
      snapshot: {
        cards: [
          {
            title: "Global scale. Local control.",
            original_image_url: sourcePreviewUrl,
          },
          {
            title: "Global scale. Local control.",
            original_image_url: sourcePreviewUrl,
          },
          {
            title: "Global scale. Local control.",
            original_image_url: sourcePreviewUrl,
          },
        ],
      },
    },
  };
}

test("ensureMetaCreativeAssetsFromRawPayload preserves repeated-image Meta carousel card slots", () => {
  const metadata = buildRepeatedCardMetadata();

  ensureMetaCreativeAssetsFromRawPayload(metadata);
  ensureMetaCreativeAssetsFromRawPayload(metadata);

  assert.equal(metadata.metaCreativeAssets.length, 3);
  assert.deepEqual(
    metadata.metaCreativeAssets.map((asset) => asset.label),
    ["Original", "Variant 1", "Variant 2"],
  );
  assert.deepEqual(
    metadata.metaCreativeAssets.map((asset) => asset.assetStoredUrl),
    [storedPreviewUrl, storedPreviewUrl, storedPreviewUrl],
  );
});

test("isExpiredMetaCreativeAssetUrlError identifies stale Meta CDN 403 responses", () => {
  assert.equal(
    isExpiredMetaCreativeAssetUrlError(
      new CreativeAssetRequestError("Creative asset request failed with status 403.", {
        bodySnippet: "URL signature expired",
        contentType: "text/plain",
        sourceUrl: expiredFbCdnUrl,
        status: 403,
      }),
    ),
    true,
  );
  assert.equal(
    isExpiredMetaCreativeAssetUrlError(
      new CreativeAssetRequestError("Creative asset request failed with status 403.", {
        bodySnippet: "Forbidden",
        contentType: "text/plain",
        sourceUrl: expiredFbCdnUrl,
        status: 403,
      }),
    ),
    true,
  );
  assert.equal(
    isExpiredMetaCreativeAssetUrlError(
      new CreativeAssetRequestError("Creative asset request failed with status 403.", {
        bodySnippet: "Forbidden",
        contentType: "text/plain",
        sourceUrl: "https://example.com/asset.jpg",
        status: 403,
      }),
    ),
    false,
  );
});

test("materializeAdAssets refreshes expired Meta CDN URLs before recording storage failure", async () => {
  const originalFetch = globalThis.fetch;
  const fetchedUrls: string[] = [];
  const uniqueRefreshedFbCdnUrl = `https://scontent.fbcdn.net/v/t39.35426-6/fresh_${Date.now()}_${Math.random()
    .toString(16)
    .slice(2)}.jpg?oh=new&oe=new`;

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    fetchedUrls.push(url);

    if (url === expiredFbCdnUrl) {
      return new Response("URL signature expired", {
        status: 403,
        headers: { "content-type": "text/plain" },
      });
    }

    if (url === uniqueRefreshedFbCdnUrl) {
      return new Response(onePixelPng, {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }

    return new Response("Not found", { status: 404 });
  };

  try {
    const refreshKeys: string[] = [];
    const [hydratedAd] = await materializeAdAssets(
      [
        {
          source: "facebook",
          sourceAdId: "1234567890",
          fingerprint: "facebook:1234567890",
          firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
          lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
          metadata: {
            metaCreativeAssets: [
              {
                label: "Original",
                sourceMediaUrl: expiredFbCdnUrl,
                sourceThumbnailUrl: expiredFbCdnUrl,
              },
            ],
          },
        },
      ],
      {
        forceSourceRefetch: true,
        persist: false,
        refreshExpiredSourceUrl: async ({ asset, sourceKey, sourceUrl }) => {
          assert.equal(sourceUrl, expiredFbCdnUrl);
          assert.match(sourceKey, /^source(?:Media|Thumbnail)Url$/);
          assert.equal(asset?.label, "Original");
          refreshKeys.push(sourceKey);
          return uniqueRefreshedFbCdnUrl;
        },
        sourceProxyUrls: ["http://127.0.0.1:9"],
      },
    );
    const metadata = hydratedAd.metadata as Record<string, unknown>;
    const [asset] = metadata.metaCreativeAssets as Array<Record<string, unknown>>;

    assert.deepEqual(fetchedUrls, [expiredFbCdnUrl, uniqueRefreshedFbCdnUrl, expiredFbCdnUrl, uniqueRefreshedFbCdnUrl]);
    assert.deepEqual(refreshKeys, ["sourceMediaUrl", "sourceThumbnailUrl"]);
    assert.equal(asset.sourceMediaUrl, uniqueRefreshedFbCdnUrl);
    assert.equal(asset.sourceThumbnailUrl, uniqueRefreshedFbCdnUrl);
    assert.equal(typeof asset.assetStoredUrl, "string");
    assert.equal(typeof asset.assetThumbnailStoredUrl, "string");
    assert.equal(asset.assetStorageError, undefined);
    assert.equal(asset.assetThumbnailStorageError, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
