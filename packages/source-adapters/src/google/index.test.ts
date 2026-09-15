import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveGoogleCreativePreviewVideoSignal } from "./index";

test("resolveGoogleCreativePreviewVideoSignal promotes YouTube preview ads to video", () => {
  assert.deepEqual(
    resolveGoogleCreativePreviewVideoSignal({
      currentFormat: "image",
      googleYoutubeVideoId: "abc123",
    }),
    {
      format: "video",
      googleYoutubeVideoId: "abc123",
    },
  );
});

test("resolveGoogleCreativePreviewVideoSignal promotes nested Google creative video assets", () => {
  assert.deepEqual(
    resolveGoogleCreativePreviewVideoSignal({
      currentFormat: "image",
      creativeAssets: [
        {
          googleYoutubeVideoId: "nested123",
          sourceVideoUrl: "https://redirector.googlevideo.com/videoplayback?id=nested123",
        },
      ],
    }),
    {
      format: "video",
      googleYoutubeVideoId: "nested123",
    },
  );
});

test("resolveGoogleCreativePreviewVideoSignal leaves image previews unchanged without video signals", () => {
  assert.deepEqual(
    resolveGoogleCreativePreviewVideoSignal({
      currentFormat: "image",
      creativeAssets: [
        {
          sourceVideoUrl: "",
          googleYoutubeVideoId: "",
        },
      ],
    }),
    {
      format: "image",
      googleYoutubeVideoId: undefined,
    },
  );
});
