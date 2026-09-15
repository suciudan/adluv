import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveAdvertiserAdsSource } from "../components/advertiser-ads-page";

type SourceTestAd = Parameters<typeof resolveAdvertiserAdsSource>[0]["ads"][number];

function makeAd(overrides: Partial<SourceTestAd>): SourceTestAd {
  return {
    source: "linkedin",
    destinationUrl: null,
    mediaUrl: null,
    posterUrl: null,
    snapshotUrl: null,
    videoUrl: null,
    ...overrides,
  };
}

test("landing page filter chooses the source with matching ads when source is omitted", () => {
  const landingPage =
    "https://1password.com/campaigns/oracle-red-bull-racing-lifestyle?utm_medium=paid_social&utm_source=meta";

  assert.equal(
    resolveAdvertiserAdsSource({
      ads: [
        makeAd({
          source: "linkedin",
          snapshotUrl: "https://1password.com/other-campaign?utm_source=linkedin",
        }),
        makeAd({
          source: "facebook",
          snapshotUrl: landingPage,
        }),
      ],
      requestedSource: null,
      landingPage,
      asset: "",
    }),
    "facebook",
  );
});

test("explicit source is preserved even when another source matches the landing page", () => {
  const landingPage = "https://example.com/lp?utm_source=meta";

  assert.equal(
    resolveAdvertiserAdsSource({
      ads: [
        makeAd({
          source: "facebook",
          snapshotUrl: landingPage,
        }),
      ],
      requestedSource: "linkedin",
      landingPage,
      asset: "",
    }),
    "linkedin",
  );
});

test("Meta utm_source breaks ties toward the Meta platform", () => {
  const landingPage = "https://example.com/shared?utm_source=meta";

  assert.equal(
    resolveAdvertiserAdsSource({
      ads: [
        makeAd({
          source: "linkedin",
          snapshotUrl: landingPage,
        }),
        makeAd({
          source: "facebook",
          snapshotUrl: landingPage,
        }),
      ],
      requestedSource: null,
      landingPage,
      asset: "",
    }),
    "facebook",
  );
});
