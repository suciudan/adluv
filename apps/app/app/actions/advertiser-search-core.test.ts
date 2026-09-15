import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCompanyCards,
  buildDiscoveredCompanyFromDomain,
  buildProviderSearchDisplayQuery,
  buildSearchQueryVariants,
  getAdvertiserSearchUserErrorMessage,
  parseAdvertiserTrackingInput,
  selectBestCompanyResultsForTracking,
  type SearchResultItem,
  type TrackableCompanyResult,
} from "./advertiser-search-core";

import type { AdvertiserMatch, SourceName } from "@adluv/source-adapters";

const sources: SourceName[] = ["linkedin", "facebook", "google"];

function completedStatuses() {
  return new Map<SourceName, { status: string; errorMessage: string | null }>(
    sources.map((source) => [source, { status: "completed", errorMessage: null }]),
  );
}

function result(input: {
  source: "linkedin" | "facebook" | "google";
  sourceAdvertiserId: string;
  canonicalName: string;
  profileUrl: string;
  companyKey?: string;
  websiteUrl?: string;
}): SearchResultItem {
  return {
    id: `${input.source}:${input.sourceAdvertiserId}`,
    source: input.source,
    sourceAdvertiserId: input.sourceAdvertiserId,
    canonicalName: input.canonicalName,
    profileUrl: input.profileUrl,
    websiteUrl: input.websiteUrl,
    companyKey: input.companyKey,
    trackedCompanyId: null,
    trackedStatus: null,
  };
}

test("brand website search groups Meta, Google, and LinkedIn advertiser ids for the entered domain", () => {
  const parsedInput = parseAdvertiserTrackingInput("nike.com");
  assert.equal(parsedInput.primaryCompanyDomain?.normalizedDomain, "nike.com");
  assert.deepEqual(buildSearchQueryVariants("nike.com"), ["nike.com", "nike"]);

  const grouped = buildCompanyCards({
    query: "nike.com",
    discoveredCompanies: [buildDiscoveredCompanyFromDomain(parsedInput.primaryCompanyDomain!)],
    localResults: [],
    cachedResults: [
      result({
        source: "linkedin",
        sourceAdvertiserId: "nike",
        canonicalName: "Nike",
        profileUrl: "https://www.linkedin.com/company/nike/",
      }),
      result({
        source: "facebook",
        sourceAdvertiserId: "15087023444",
        canonicalName: "Nike",
        profileUrl: "https://www.facebook.com/nike/",
      }),
      result({
        source: "google",
        sourceAdvertiserId: "AR17870761394842157057",
        canonicalName: "Nike",
        profileUrl: "https://adstransparency.google.com/advertiser/AR17870761394842157057",
      }),
    ],
    sourceStatuses: completedStatuses(),
    sources,
  });

  const card = grouped.cards.find((candidate) => candidate.companyKey === "nike.com");

  assert.equal(card?.matchedProviderCount, 3);
  assert.equal(card?.providers.linkedin.result?.sourceAdvertiserId, "nike");
  assert.equal(card?.providers.facebook.result?.sourceAdvertiserId, "15087023444");
  assert.equal(card?.providers.google.result?.sourceAdvertiserId, "AR17870761394842157057");
});

test("Meta advertiser URL search seeds the other provider lookups from the resolved advertiser", () => {
  const metaUrl = "https://www.facebook.com/ads/library/?active_status=all&ad_type=all&view_all_page_id=15087023444";
  const parsedInput = parseAdvertiserTrackingInput(metaUrl);
  const directMatch: AdvertiserMatch = {
    id: "facebook:15087023444",
    source: "facebook",
    sourceAdvertiserId: "15087023444",
    canonicalName: "Nike",
    profileUrl: "https://www.facebook.com/nike/",
  };

  assert.equal(parsedInput.primaryCompanyDomain, null);
  assert.deepEqual(parsedInput.directLinks, [{ source: "facebook", value: metaUrl }]);
  assert.equal(
    buildProviderSearchDisplayQuery({
      primaryCompanyDomain: parsedInput.primaryCompanyDomain,
      directMatches: [directMatch],
      fallbackQuery: metaUrl,
    }),
    "Nike",
  );

  const grouped = buildCompanyCards({
    query: "Nike",
    discoveredCompanies: [],
    localResults: [],
    cachedResults: [
      result({
        source: "facebook",
        sourceAdvertiserId: "15087023444",
        canonicalName: "Nike",
        profileUrl: "https://www.facebook.com/nike/",
        companyKey: "nike",
      }),
      result({
        source: "linkedin",
        sourceAdvertiserId: "nike",
        canonicalName: "Nike",
        profileUrl: "https://www.linkedin.com/company/nike/",
        companyKey: "nike",
      }),
      result({
        source: "google",
        sourceAdvertiserId: "AR17870761394842157057",
        canonicalName: "Nike",
        profileUrl: "https://adstransparency.google.com/advertiser/AR17870761394842157057",
        companyKey: "nike",
      }),
    ],
    sourceStatuses: completedStatuses(),
    sources,
  });

  assert.equal(grouped.cards.length, 1);
  assert.equal(grouped.cards[0]?.matchedProviderCount, 3);
  assert.equal(grouped.cards[0]?.providers.linkedin.result?.sourceAdvertiserId, "nike");
  assert.equal(grouped.cards[0]?.providers.google.result?.sourceAdvertiserId, "AR17870761394842157057");
});

test("ad library and advertiser URLs are identified as direct provider links", () => {
  const cases = [
    {
      input: "https://www.facebook.com/ads/library/?id=123456789012345",
      expected: [{ source: "facebook", value: "https://www.facebook.com/ads/library/?id=123456789012345" }],
    },
    {
      input: "https://www.facebook.com/ads/library/?active_status=all&view_all_page_id=15087023444",
      expected: [{ source: "facebook", value: "https://www.facebook.com/ads/library/?active_status=all&view_all_page_id=15087023444" }],
    },
    {
      input: "https://adstransparency.google.com/advertiser/AR17870761394842157057",
      expected: [{ source: "google", value: "https://adstransparency.google.com/advertiser/AR17870761394842157057" }],
    },
    {
      input: "https://www.linkedin.com/company/nike/",
      expected: [{ source: "linkedin", value: "https://www.linkedin.com/company/nike/" }],
    },
    {
      input: "https://www.linkedin.com/ad-library/search?accountOwner=nike&countries=US",
      expected: [{ source: "linkedin", value: "https://www.linkedin.com/ad-library/search?accountOwner=nike&countries=US" }],
    },
  ] as const;

  for (const item of cases) {
    assert.deepEqual(parseAdvertiserTrackingInput(item.input).directLinks, item.expected);
  }
});

test("rate limit provider errors are converted to a recoverable user message", () => {
  const message = getAdvertiserSearchUserErrorMessage(new Error("Rate limit exceeded"));

  assert.equal(
    message,
    "Advertiser search is temporarily unavailable. Provider lookup is retrying through proxies.",
  );
  assert.equal(/rate\s*limit|429/i.test(message), false);
});

test("company URL plus ad library link keeps the company domain and direct provider identity", () => {
  const input = "nike.com https://adstransparency.google.com/advertiser/AR17870761394842157057";
  const parsedInput = parseAdvertiserTrackingInput(input);

  assert.equal(parsedInput.primaryCompanyDomain?.normalizedDomain, "nike.com");
  assert.deepEqual(parsedInput.directLinks, [
    {
      source: "google",
      value: "https://adstransparency.google.com/advertiser/AR17870761394842157057",
    },
  ]);
  assert.deepEqual(parsedInput.invalidValues, []);
});

test("domain plus advertiser URL keeps a common-name advertiser from grouping with the wrong company", () => {
  const metaUrl = "https://www.facebook.com/ads/library/?view_all_page_id=305960658086";
  const parsedInput = parseAdvertiserTrackingInput(`apple.com ${metaUrl}`);

  assert.equal(parsedInput.primaryCompanyDomain?.normalizedDomain, "apple.com");
  assert.deepEqual(parsedInput.directLinks, [{ source: "facebook", value: metaUrl }]);
  assert.equal(
    buildProviderSearchDisplayQuery({
      primaryCompanyDomain: parsedInput.primaryCompanyDomain,
      directMatches: [
        {
          canonicalName: "Apple",
          profileUrl: "https://www.facebook.com/apple/",
        },
      ],
      fallbackQuery: "apple.com",
    }),
    "apple.com",
  );

  const grouped = buildCompanyCards({
    query: "apple.com",
    discoveredCompanies: [buildDiscoveredCompanyFromDomain(parsedInput.primaryCompanyDomain!)],
    localResults: [],
    cachedResults: [
      result({
        source: "facebook",
        sourceAdvertiserId: "305960658086",
        canonicalName: "Apple",
        profileUrl: "https://www.facebook.com/apple/",
        companyKey: "apple.com",
      }),
      result({
        source: "linkedin",
        sourceAdvertiserId: "apple",
        canonicalName: "Apple",
        profileUrl: "https://www.linkedin.com/company/apple/",
        companyKey: "apple.com",
      }),
      result({
        source: "google",
        sourceAdvertiserId: "AR08038904645948129281",
        canonicalName: "Apple",
        profileUrl: "https://adstransparency.google.com/advertiser/AR08038904645948129281",
        companyKey: "apple.com",
      }),
      result({
        source: "linkedin",
        sourceAdvertiserId: "apple-bank",
        canonicalName: "Apple Bank",
        profileUrl: "https://www.linkedin.com/company/apple-bank/",
        companyKey: "applebank.com",
      }),
    ],
    sourceStatuses: completedStatuses(),
    sources,
  });

  const appleCard = grouped.cards.find((card) => card.companyKey === "apple.com");
  const appleBankCard = grouped.cards.find((card) => card.companyKey === "applebank.com");

  assert.equal(appleCard?.matchedProviderCount, 3);
  assert.equal(appleCard?.providers.facebook.result?.sourceAdvertiserId, "305960658086");
  assert.equal(appleCard?.providers.linkedin.result?.sourceAdvertiserId, "apple");
  assert.equal(appleCard?.providers.google.result?.sourceAdvertiserId, "AR08038904645948129281");
  assert.equal(appleBankCard?.providers.linkedin.result?.sourceAdvertiserId, "apple-bank");
});

test("domain search excludes unrelated advertisers that only share the brand token", () => {
  const parsedInput = parseAdvertiserTrackingInput("https://www.adobe.com/");

  assert.equal(parsedInput.primaryCompanyDomain?.normalizedDomain, "adobe.com");

  const grouped = buildCompanyCards({
    query: "adobe.com",
    discoveredCompanies: [buildDiscoveredCompanyFromDomain(parsedInput.primaryCompanyDomain!)],
    localResults: [],
    cachedResults: [
      result({
        source: "google",
        sourceAdvertiserId: "AR11111111111111111111",
        canonicalName: "ADOBE SYSTEMS ROMANIA SRL",
        profileUrl: "https://adstransparency.google.com/advertiser/AR11111111111111111111",
        companyKey: "adobe.com",
      }),
      result({
        source: "google",
        sourceAdvertiserId: "AR22222222222222222222",
        canonicalName: "Adobe Rose Inn",
        profileUrl: "https://adstransparency.google.com/advertiser/AR22222222222222222222",
        companyKey: "adobe.com",
      }),
    ],
    sourceStatuses: completedStatuses(),
    sources,
  });

  const adobeCard = grouped.cards.find((card) => card.companyKey === "adobe.com");

  assert.equal(adobeCard?.matchedProviderCount, 1);
  assert.equal(adobeCard?.providers.google.result?.canonicalName, "ADOBE SYSTEMS ROMANIA SRL");
  assert.equal(
    Object.values(adobeCard?.providers ?? {}).some((provider) => provider.result?.canonicalName === "Adobe Rose Inn"),
    false,
  );
});

test("domain search groups provider results named with the domain suffix", () => {
  const parsedInput = parseAdvertiserTrackingInput("https://www.spabreaks.com/");

  assert.equal(parsedInput.primaryCompanyDomain?.normalizedDomain, "spabreaks.com");

  const grouped = buildCompanyCards({
    query: "spabreaks.com",
    discoveredCompanies: [buildDiscoveredCompanyFromDomain(parsedInput.primaryCompanyDomain!)],
    localResults: [],
    cachedResults: [
      result({
        source: "facebook",
        sourceAdvertiserId: "128148880536744",
        canonicalName: "Spabreaks.com",
        profileUrl: "https://www.facebook.com/ads/library/?view_all_page_id=128148880536744",
        companyKey: "spabreaks.com",
      }),
      result({
        source: "google",
        sourceAdvertiserId: "AR12345678901234567890",
        canonicalName: "Spabreaks.com",
        profileUrl: "https://adstransparency.google.com/advertiser/AR12345678901234567890",
        companyKey: "spabreaks.com",
      }),
    ],
    sourceStatuses: completedStatuses(),
    sources,
  });

  const spabreaksCard = grouped.cards.find((card) => card.companyKey === "spabreaks.com");

  assert.equal(spabreaksCard?.matchedProviderCount, 2);
  assert.equal(spabreaksCard?.providers.facebook.result?.sourceAdvertiserId, "128148880536744");
  assert.equal(spabreaksCard?.providers.google.result?.sourceAdvertiserId, "AR12345678901234567890");
});

function trackable(input: {
  advertiserId?: string;
  source: "linkedin" | "facebook" | "google";
  sourceAdvertiserId: string;
  canonicalName?: string;
  rankScore: number;
}): TrackableCompanyResult {
  return {
    advertiserId: input.advertiserId ?? `${input.source}:${input.sourceAdvertiserId}`,
    source: input.source,
    sourceAdvertiserId: input.sourceAdvertiserId,
    companyKey: "nike.com",
    rankScore: input.rankScore,
    canonicalName: input.canonicalName ?? "Nike",
    profileUrl: null,
    logoUrl: null,
    industry: null,
    companySize: null,
    country: null,
    summary: null,
  };
}

test("adding a company tracks the highest ranked advertiser from each matched provider", () => {
  const selected = selectBestCompanyResultsForTracking([
    trackable({
      source: "google",
      sourceAdvertiserId: "AR17870761394842157057",
      rankScore: 10_000,
    }),
    trackable({
      source: "google",
      sourceAdvertiserId: "AR00000000000000000000",
      canonicalName: "Nike Factory Store",
      rankScore: 9_990,
    }),
    trackable({
      source: "facebook",
      sourceAdvertiserId: "15087023444",
      rankScore: 9_980,
    }),
    trackable({
      source: "linkedin",
      sourceAdvertiserId: "nike",
      rankScore: 9_970,
    }),
  ]);

  assert.deepEqual(
    selected.map((item) => `${item.source}:${item.sourceAdvertiserId}`),
    [
      "google:AR17870761394842157057",
      "facebook:15087023444",
      "linkedin:nike",
    ],
  );
});
