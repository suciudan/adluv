import assert from "node:assert/strict";
import { test } from "node:test";

import { resolvePersistedAdFirstSeenAt } from "./ad-timeline";

test("resolvePersistedAdFirstSeenAt keeps the original launch date when a duplicate ad refreshes", () => {
  const existingFirstSeenAt = new Date("2026-06-01T09:00:00.000Z");
  const incomingFirstSeenAt = new Date("2026-06-02T09:00:00.000Z");

  assert.equal(
    resolvePersistedAdFirstSeenAt({
      existingFirstSeenAt,
      incomingFirstSeenAt,
    }).toISOString(),
    "2026-06-01T09:00:00.000Z",
  );
});

test("resolvePersistedAdFirstSeenAt accepts an older parsed run date for existing ads", () => {
  const existingFirstSeenAt = new Date("2026-06-02T09:00:00.000Z");
  const incomingFirstSeenAt = new Date("2026-05-27T09:00:00.000Z");

  assert.equal(
    resolvePersistedAdFirstSeenAt({
      existingFirstSeenAt,
      incomingFirstSeenAt,
    }).toISOString(),
    "2026-05-27T09:00:00.000Z",
  );
});

test("resolvePersistedAdFirstSeenAt uses the incoming launch date for new ads", () => {
  const incomingFirstSeenAt = new Date("2026-06-02T09:00:00.000Z");

  assert.equal(
    resolvePersistedAdFirstSeenAt({
      existingFirstSeenAt: null,
      incomingFirstSeenAt,
    }).toISOString(),
    "2026-06-02T09:00:00.000Z",
  );
});
