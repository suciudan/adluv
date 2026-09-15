import assert from "node:assert/strict";
import test from "node:test";

import {
  isBetterAuthConfigured,
  normalizeUsername,
} from "./index";

test("normalizeUsername trims whitespace and lowercases values", () => {
  assert.equal(normalizeUsername("  LaunchUser  "), "launchuser");
});

test("isBetterAuthConfigured requires both Better Auth env vars", () => {
  assert.equal(isBetterAuthConfigured({ BETTER_AUTH_SECRET: "secret" }), false);
  assert.equal(isBetterAuthConfigured({ BETTER_AUTH_URL: "https://app.adluv.test" }), false);
  assert.equal(
    isBetterAuthConfigured({
      BETTER_AUTH_SECRET: "secret",
      BETTER_AUTH_URL: "https://app.adluv.test",
    }),
    true,
  );
});
