import assert from "node:assert/strict";
import { test } from "node:test";

import { getGoogleYoutubeEmbedUrlFromMetadata } from "./repositories";

test("getGoogleYoutubeEmbedUrlFromMetadata uses top-level Google YouTube ids", () => {
  assert.equal(
    getGoogleYoutubeEmbedUrlFromMetadata({
      googleYoutubeVideoId: "J1qgNH1_pI8",
    }),
    "https://www.youtube-nocookie.com/embed/J1qgNH1_pI8?rel=0&modestbranding=1&playsinline=1",
  );
});

test("getGoogleYoutubeEmbedUrlFromMetadata falls back to nested Google creative asset ids", () => {
  assert.equal(
    getGoogleYoutubeEmbedUrlFromMetadata({
      googleCreativeAssets: [
        {
          sourceThumbnailUrl: "https://i3.ytimg.com/vi/J1qgNH1_pI8/hqdefault.jpg",
        },
      ],
    }),
    "https://www.youtube-nocookie.com/embed/J1qgNH1_pI8?rel=0&modestbranding=1&playsinline=1",
  );
});
