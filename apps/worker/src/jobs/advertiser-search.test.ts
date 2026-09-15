import assert from "node:assert/strict";
import test from "node:test";

import type { AdvertiserMatch, SourceAdapter } from "@adluv/source-adapters";

import { searchAdvertiserVariants } from "./advertiser-search";

function match(input: Partial<AdvertiserMatch> = {}): AdvertiserMatch {
  return {
    id: input.id ?? "facebook:123",
    source: input.source ?? "facebook",
    sourceAdvertiserId: input.sourceAdvertiserId ?? "123",
    canonicalName: input.canonicalName ?? "Example",
    profileUrl: input.profileUrl,
    websiteUrl: input.websiteUrl,
    logoUrl: input.logoUrl,
    industry: input.industry,
    companySize: input.companySize,
    country: input.country,
    summary: input.summary,
  };
}

function adapterWithResults(resultsByQuery: Record<string, AdvertiserMatch[] | Error>): SourceAdapter {
  return {
    source: "facebook",
    async searchAdvertisers(query) {
      const result = resultsByQuery[query] ?? [];

      if (result instanceof Error) {
        throw result;
      }

      return result;
    },
    async fetchAdvertiserProfile() {
      return null;
    },
    async fetchAdvertiserAds() {
      return [];
    },
    async fetchLandingPage() {
      return {
        url: "https://example.com",
        capturedAt: new Date(),
      };
    },
  };
}

test("searchAdvertiserVariants continues after a failed query variant", async () => {
  const results = await searchAdvertiserVariants(
    adapterWithResults({
      "spabreaks.com": new Error("Meta Ads Library request failed with 400."),
      spabreaks: [match({ canonicalName: "Spabreaks.com", sourceAdvertiserId: "128148880536744" })],
    }),
    ["spabreaks.com", "spabreaks"],
  );

  assert.equal(results.length, 1);
  assert.equal(results[0]?.sourceAdvertiserId, "128148880536744");
});

test("searchAdvertiserVariants throws when every query variant fails", async () => {
  await assert.rejects(
    () =>
      searchAdvertiserVariants(
        adapterWithResults({
          "spabreaks.com": new Error("Meta Ads Library request failed with 400."),
          spabreaks: new Error("Rate limit exceeded"),
        }),
        ["spabreaks.com", "spabreaks"],
      ),
    /Rate limit exceeded/,
  );
});
