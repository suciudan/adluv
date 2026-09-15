import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CreativeAssetMedia,
  getYoutubeEmbedSrc,
  isVideoCreativeAsset,
  isYoutubeCreativeAsset,
} from "../components/creative-asset-media";

test("explicit video kind renders ambiguous URLs with a video element", () => {
  const src = "https://cdn.example.com/ad-assets/opaque";

  assert.equal(isVideoCreativeAsset(src, "video"), false);

  const markup = renderToStaticMarkup(
    createElement(CreativeAssetMedia, {
      alt: "Creative",
      className: "media",
      kind: "video",
      src,
    }),
  );

  assert.match(markup, /^<video\b/);
});

test("ambiguous URLs without explicit kind render as images", () => {
  const markup = renderToStaticMarkup(
    createElement(CreativeAssetMedia, {
      alt: "Creative",
      className: "media",
      hint: "video",
      src: "https://cdn.example.com/ad-assets/opaque",
    }),
  );

  assert.match(markup, /<img\b/);
});

test("YouTube embed URLs render with an iframe player", () => {
  const src = "https://www.youtube-nocookie.com/embed/J1qgNH1_pI8?rel=0";

  assert.equal(isYoutubeCreativeAsset(src), true);
  assert.equal(
    getYoutubeEmbedSrc(src, true),
    "https://www.youtube-nocookie.com/embed/J1qgNH1_pI8?rel=0&modestbranding=1&playsinline=1&controls=1",
  );

  const markup = renderToStaticMarkup(
    createElement(CreativeAssetMedia, {
      alt: "Creative",
      className: "media",
      controls: true,
      kind: "video",
      src,
    }),
  );

  assert.match(markup, /^<iframe\b/);
  assert.match(markup, /youtube-nocookie\.com\/embed\/J1qgNH1_pI8/);
});
