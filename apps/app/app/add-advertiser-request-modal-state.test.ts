import assert from "node:assert/strict";
import test from "node:test";

import { getCompanyCardAddState } from "../components/add-advertiser-request-modal";

type CompanyCard = Parameters<typeof getCompanyCardAddState>[0];

function companyCard(overrides: Partial<CompanyCard> = {}): CompanyCard {
  return {
    companyKey: "spabreaks.com",
    displayName: "Spabreaks",
    logoUrl: null,
    websiteUrl: "https://spabreaks.com/",
    domain: "spabreaks.com",
    description: null,
    matchedProviderCount: 0,
    providers: {
      facebook: { source: "facebook", status: "searching", result: null },
      linkedin: { source: "linkedin", status: "searching", result: null },
      google: { source: "google", status: "searching", result: null },
    },
    fullyResolved: false,
    ...overrides,
  };
}

test("unresolved company-only advertiser search can be queued for auto-add", () => {
  assert.equal(getCompanyCardAddState(companyCard()), "add_when_found");
});

test("fully resolved company-only advertiser search is a no-match state", () => {
  assert.equal(
    getCompanyCardAddState(
      companyCard({
        providers: {
          facebook: { source: "facebook", status: "no_match", result: null },
          linkedin: { source: "linkedin", status: "no_match", result: null },
          google: { source: "google", status: "no_match", result: null },
        },
        fullyResolved: true,
      }),
    ),
    "no_matches",
  );
});

test("provider match that is not tracked can be added immediately", () => {
  assert.equal(
    getCompanyCardAddState(
      companyCard({
        matchedProviderCount: 1,
        providers: {
          facebook: {
            source: "facebook",
            status: "matched",
            result: {
              id: "facebook:128148880536744",
              source: "facebook",
              sourceAdvertiserId: "128148880536744",
              canonicalName: "Spabreaks.com",
              trackedCompanyId: null,
              trackedStatus: null,
            },
          },
          linkedin: { source: "linkedin", status: "no_match", result: null },
          google: { source: "google", status: "no_match", result: null },
        },
        fullyResolved: true,
      }),
    ),
    "add_now",
  );
});
