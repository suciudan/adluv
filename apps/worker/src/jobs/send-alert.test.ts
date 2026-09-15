import assert from "node:assert/strict";
import test from "node:test";

test("buildAlertEmail renders instant alert HTML with direct app links", async () => {
  process.env.DATABASE_URL ??= "mysql://root:root@127.0.0.1:3306/adluv_test";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";

  const { buildAlertEmail } = await import("./send-alert");
  const email = buildAlertEmail({
    headline: "New ad detected for Cloudflare",
    body: "See research",
    workspaceSlug: "growth",
    advertiserName: "Cloudflare",
    source: "linkedin",
    adId: "ad-123",
    adTitle: "Stop wasting spend <script>",
    adBody: "Launch campaigns faster & compare every creative.",
    adFormat: "image",
    adCallToAction: "Learn more",
    adMediaUrl: "https://cdn.adluv.co/ad-assets/cloudflare.png",
    firstSeenAt: new Date("2026-06-17T10:00:00.000Z"),
  });

  assert.equal(email.subject, "New ad detected for Cloudflare");
  assert.match(email.text, /View ad: https:\/\/app\.example\.test\/w\/growth\/ads\/ad-123/);
  assert.match(email.html, /<html>/);
  assert.match(email.html, /https:\/\/app\.example\.test\/w\/growth\/ads\/ad-123/);
  assert.match(email.html, /https:\/\/app\.example\.test\/w\/growth\/activity/);
  assert.match(email.html, /Cloudflare launched a new ad/);
  assert.match(email.html, /Stop wasting spend &lt;script&gt;/);
  assert.doesNotMatch(email.html, /Stop wasting spend <script>/);
  assert.match(email.html, /#8b5cf6/);
});
