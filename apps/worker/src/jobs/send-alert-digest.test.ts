import assert from "node:assert/strict";
import test from "node:test";

test("buildDigestEmail groups pending alerts by advertiser", async () => {
  process.env.DATABASE_URL ??= "mysql://root:root@127.0.0.1:3306/adluv_test";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";

  const { buildDigestEmail } = await import("./send-alert-digest");
  const digest = buildDigestEmail({
    digestFrequency: "weekly",
    activityUrl: "https://app.example.test/activity",
    items: [
      {
        alertId: "alert-1",
        advertiserName: "Klippa",
        headline: "New ad detected for Klippa",
        body: "First ad",
        adTitle: "First ad",
        adId: "ad-1",
        advertiserId: "adv-klippa",
        source: "facebook",
        createdAt: new Date("2026-04-17T10:00:00.000Z"),
      },
      {
        alertId: "alert-2",
        advertiserName: "Klippa",
        headline: "New ad detected for Klippa",
        body: "Second ad",
        adTitle: "Second ad",
        adId: "ad-2",
        advertiserId: "adv-klippa",
        source: "facebook",
        createdAt: new Date("2026-04-18T10:00:00.000Z"),
      },
      {
        alertId: "alert-3",
        advertiserName: "Ahrefs",
        headline: "New ad detected for Ahrefs",
        body: "Third ad",
        adTitle: "Third ad",
        adId: "ad-3",
        advertiserId: "adv-ahrefs",
        source: "linkedin",
        createdAt: new Date("2026-04-24T10:00:00.000Z"),
      },
    ],
  });

  assert.equal(digest.subject, "2 advertisers have new ads");
  assert.match(digest.text, /Klippa\nMeta - 2 new ads/);
  assert.match(digest.text, /Ahrefs\nLinkedIn - 1 new ad/);
  assert.match(digest.text, /https:\/\/app\.example\.test\/activity/);
  assert.match(digest.html, />3<\/p>/);
  assert.match(digest.html, />2<\/p>/);
  assert.match(digest.html, /Apr 17 - Apr 24/);
});
