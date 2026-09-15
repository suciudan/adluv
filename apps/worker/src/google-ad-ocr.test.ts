import assert from "node:assert/strict";
import test from "node:test";

import type { NormalizedAd } from "@adluv/source-adapters";

import { extractGoogleCreativeCopyCandidates, extractGoogleCreativeLines } from "./google-ad-ocr";

function buildGoogleTextAd(input: {
  advertiserName?: string;
  destinationUrl?: string;
} = {}): NormalizedAd {
  return {
    source: "google",
    sourceAdId: "CR_TEST",
    fingerprint: "google:test",
    payer: input.advertiserName ?? "Pipedrive Inc.",
    format: "text",
    destinationUrl: input.destinationUrl,
    firstSeenAt: new Date("2026-01-01T00:00:00.000Z"),
    lastSeenAt: new Date("2026-01-01T00:00:00.000Z"),
    metadata: {
      rawPayload: {
        "12": input.advertiserName ?? "Pipedrive Inc.",
      },
    },
  };
}

test("extractGoogleCreativeLines removes advertiser, symbol, and URL header lines", () => {
  const lines = extractGoogleCreativeLines(
    buildGoogleTextAd({
      destinationUrl: "https://www.pipedrive.com/project-mgmt",
    }),
    [
      "Pipedrive",
      "\u00a9",
      "www.pipedrive.com/project-mgmt",
      "13 Best KPI Software to Track",
      "Performance in 2025",
      "Discover the best KPI software with reports and",
      "dashboards to track performance. Compare features,",
      "pricing and more.",
    ].join("\n"),
  );

  assert.deepEqual(lines, [
    "13 Best KPI Software to Track",
    "Performance in 2025",
    "Discover the best KPI software with reports and",
    "dashboards to track performance. Compare features,",
    "pricing and more.",
  ]);
});

test("extractGoogleCreativeCopyCandidates joins wrapped Google text-ad headlines", () => {
  const candidates = extractGoogleCreativeCopyCandidates([
    "13 Best KPI Software to Track",
    "Performance in 2025",
    "Discover the best KPI software with reports and",
    "dashboards to track performance. Compare features,",
    "pricing and more.",
  ]);

  assert.deepEqual(candidates, {
    titleCandidate: "13 Best KPI Software to Track Performance in 2025",
    bodyCandidate: [
      "Discover the best KPI software with reports and",
      "dashboards to track performance. Compare features,",
      "pricing and more.",
    ].join("\n"),
  });
});
