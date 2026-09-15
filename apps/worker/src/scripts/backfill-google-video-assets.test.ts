import assert from "node:assert/strict";
import { test } from "node:test";

import type { RowDataPacket } from "mysql2";

import { shouldBackfillGoogleVideoAssetRow } from "./backfill-google-video-assets";

function buildGoogleRow(input: {
  format?: string;
  id?: string;
  metadata?: Record<string, unknown>;
  sourceAdId?: string | null;
}) {
  return {
    id: input.id ?? "google-ad-1",
    advertiserId: "advertiser-1",
    sourceAdvertiserId: "AR123456789012",
    sourceAdId: input.sourceAdId ?? "CR123",
    fingerprint: "google:test",
    title: null,
    body: null,
    payer: null,
    format: input.format ?? "image",
    callToAction: null,
    destinationUrl: null,
    mediaUrl: "https://images.example.com/poster.jpg",
    status: null,
    reactionCount: null,
    commentCount: null,
    firstSeenAt: new Date("2026-06-01T00:00:00.000Z"),
    lastSeenAt: new Date("2026-06-01T00:00:00.000Z"),
    metadata: input.metadata ?? {
      googleFormatCode: "2",
      sourceThumbnailUrl: "https://images.example.com/poster.jpg",
    },
  } as RowDataPacket & Parameters<typeof shouldBackfillGoogleVideoAssetRow>[0];
}

test("targeted force backfill includes image-classified Google rows for preview refresh", () => {
  const row = buildGoogleRow({ id: "0d8cd44b98dbf87e81af1f1b3b9020a967f5cb3a" });

  assert.equal(
    shouldBackfillGoogleVideoAssetRow(row, {
      adId: row.id,
      force: true,
    }),
    true,
  );
});

test("broad force backfill does not include image rows without video signals", () => {
  assert.equal(
    shouldBackfillGoogleVideoAssetRow(buildGoogleRow({}), {
      adId: null,
      force: true,
    }),
    false,
  );
});

test("broad force backfill still includes known Google video rows", () => {
  assert.equal(
    shouldBackfillGoogleVideoAssetRow(
      buildGoogleRow({
        format: "video",
        metadata: {
          googleFormatCode: "3",
        },
      }),
      {
        adId: null,
        force: true,
      },
    ),
    true,
  );
});
