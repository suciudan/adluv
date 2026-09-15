import assert from "node:assert/strict";
import test from "node:test";

import { isPlausibleDomainAdvertiserNameMatch } from "./helpers";

test("matches advertiser names that include the searched domain suffix", () => {
  for (const candidateName of [
    "Spabreaks.com",
    "spabreaks.com",
    "Spabreaks.com Ltd",
    "Spa Breaks UK",
  ]) {
    assert.equal(
      isPlausibleDomainAdvertiserNameMatch({
        normalizedDomain: "spabreaks.com",
        candidateName,
      }),
      true,
      candidateName,
    );
  }
});

test("keeps unrelated domain-prefix advertiser names excluded", () => {
  assert.equal(
    isPlausibleDomainAdvertiserNameMatch({
      normalizedDomain: "apple.com",
      candidateName: "Apple Bank",
    }),
    false,
  );
});
