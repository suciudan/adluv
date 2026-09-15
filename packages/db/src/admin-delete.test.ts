import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

import { eq } from "drizzle-orm";

import { getDb, getPool } from "./client";
import { deleteAdminAdvertisers } from "./repositories";
import {
  adObservationsTable,
  advertiserCompaniesTable,
  advertiserSearchAliasesTable,
  advertiserSearchQueriesTable,
  advertiserSearchQueryResultsTable,
  advertisersTable,
  adsTable,
  alertDeliveriesTable,
  alertsTable,
  landingPageSnapshotsTable,
  savedAdsTable,
  swipeFileCollectionItemsTable,
  trackedCompaniesTable,
  trackerNotificationsTable,
} from "./schema/app";

const runDbIntegrationTests = process.env.RUN_DB_INTEGRATION_TESTS === "1" && Boolean(process.env.DATABASE_URL);

after(async () => {
  if (runDbIntegrationTests) {
    await getPool().end();
  }
});

test(
  "deleteAdminAdvertisers removes advertiser records and local dependents",
  { skip: runDbIntegrationTests ? undefined : "Set RUN_DB_INTEGRATION_TESTS=1 with DATABASE_URL to run DB integration tests." },
  async () => {
    const db = getDb();
    const suffix = randomUUID().slice(0, 8);
    const companyId = `codex-delete-company-${suffix}`;
    const advertiserId = `codex-delete-adv-${suffix}`;
    const secondAdvertiserId = `codex-delete-adv-2-${suffix}`;
    const adId = `codex-delete-ad-${suffix}`;
    const secondAdId = `codex-delete-ad-2-${suffix}`;
    const savedAdId = `codex-delete-saved-${suffix}`;
    const alertId = `codex-delete-alert-${suffix}`;
    const trackedCompanyId = `codex-delete-track-${suffix}`;
    const queryId = `codex-delete-query-${suffix}`;
    const now = new Date();

    try {
      await db.insert(advertiserCompaniesTable).values({
        id: companyId,
        normalizedDomain: `codex-delete-${suffix}.invalid`,
        displayName: "Codex Delete Fixture",
        websiteUrl: `https://codex-delete-${suffix}.invalid/`,
        logoUrl: "https://cdn.example.invalid/advertiser-logos/logo.png",
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(advertisersTable).values({
        id: advertiserId,
        source: "linkedin",
        sourceAdvertiserId: `codex-delete-src-${suffix}`,
        canonicalName: "Codex Delete Fixture",
        profileUrl: null,
        websiteUrl: `https://codex-delete-${suffix}.invalid/`,
        normalizedDomain: `codex-delete-${suffix}.invalid`,
        companyId,
        logoUrl: "https://cdn.example.invalid/advertiser-logos/logo.png",
        industry: null,
        companySize: null,
        country: null,
        summary: null,
        lastIndexedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(advertisersTable).values({
        id: secondAdvertiserId,
        source: "google",
        sourceAdvertiserId: `codex-delete-google-src-${suffix}`,
        canonicalName: "Codex Delete Fixture",
        profileUrl: null,
        websiteUrl: `https://codex-delete-${suffix}.invalid/`,
        normalizedDomain: `codex-delete-${suffix}.invalid`,
        companyId,
        logoUrl: "https://cdn.example.invalid/advertiser-logos/logo-google.png",
        industry: null,
        companySize: null,
        country: null,
        summary: null,
        lastIndexedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(adsTable).values({
        id: adId,
        advertiserId,
        source: "linkedin",
        sourceAdId: `codex-delete-ad-src-${suffix}`,
        fingerprint: `codex-delete-fp-${suffix}`,
        title: "Codex delete fixture ad",
        body: null,
        callToAction: null,
        destinationUrl: "https://example.invalid/",
        mediaUrl: "https://cdn.example.invalid/ad-assets/media.png",
        format: null,
        payer: null,
        status: "active",
        reactionCount: 0,
        commentCount: 0,
        firstSeenAt: now,
        lastSeenAt: now,
        metadata: {
          assetStoredUrl: "https://cdn.example.invalid/ad-assets/asset.png",
        },
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(adsTable).values({
        id: secondAdId,
        advertiserId: secondAdvertiserId,
        source: "google",
        sourceAdId: `codex-delete-google-ad-src-${suffix}`,
        fingerprint: `codex-delete-google-fp-${suffix}`,
        title: "Codex delete fixture Google ad",
        body: null,
        callToAction: null,
        destinationUrl: "https://example.invalid/google",
        mediaUrl: "https://cdn.example.invalid/ad-assets/google-media.png",
        format: null,
        payer: null,
        status: "active",
        reactionCount: 0,
        commentCount: 0,
        firstSeenAt: now,
        lastSeenAt: now,
        metadata: {
          assetStoredUrl: "https://cdn.example.invalid/ad-assets/google-asset.png",
        },
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(adObservationsTable).values({
        id: `codex-delete-obs-${suffix}`,
        adId,
        observedAt: now,
        countries: null,
        impressionWindow: null,
        rawPayload: null,
      });
      await db.insert(landingPageSnapshotsTable).values({
        id: `codex-delete-snap-${suffix}`,
        adId,
        url: "https://example.invalid/",
        title: null,
        html: null,
        screenshotUrl: "https://cdn.example.invalid/landing-page-screenshots/screen.png",
        capturedAt: now,
      });
      await db.insert(savedAdsTable).values({
        id: savedAdId,
        workspaceId: null,
        userId: `codex-delete-user-${suffix}`,
        adId,
        note: null,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(swipeFileCollectionItemsTable).values({
        id: `codex-delete-item-${suffix}`,
        collectionId: `codex-delete-coll-${suffix}`,
        savedAdId,
        createdAt: now,
      });
      await db.insert(alertsTable).values({
        id: alertId,
        workspaceId: null,
        userId: `codex-delete-user-${suffix}`,
        trackedCompanyId,
        adId,
        headline: "Codex delete alert",
        body: null,
        createdAt: now,
      });
      await db.insert(alertDeliveriesTable).values({
        id: `codex-delete-delivery-${suffix}`,
        alertId,
        channel: "in_app",
        deliveredAt: null,
        readAt: null,
        failedAt: null,
        errorMessage: null,
      });
      await db.insert(trackedCompaniesTable).values({
        id: trackedCompanyId,
        workspaceId: null,
        userId: `codex-delete-user-${suffix}`,
        advertiserId,
        status: "active",
        lastSyncedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(trackerNotificationsTable).values({
        id: `codex-delete-note-${suffix}`,
        jobId: `codex-delete-job-${suffix}`,
        workspaceId: null,
        userId: `codex-delete-user-${suffix}`,
        trackedCompanyId,
        advertiserId,
        kind: "initial_index_completed",
        headline: "Codex delete notification",
        body: null,
        targetUrl: "/watchlist",
        metadata: null,
        createdAt: now,
        updatedAt: now,
        readAt: null,
      });
      await db.insert(advertiserSearchAliasesTable).values({
        id: `codex-delete-alias-${suffix}`,
        advertiserId,
        query: "Codex Delete",
        normalizedQuery: `codex delete ${suffix}`,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(advertiserSearchQueriesTable).values({
        id: queryId,
        normalizedQuery: `codex-delete-query-${suffix}`,
        displayQuery: "Codex Delete Query",
        lastRequestedAt: now,
        refreshedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await db.insert(advertiserSearchQueryResultsTable).values({
        id: `codex-delete-result-${suffix}`,
        queryId,
        advertiserId,
        source: "linkedin",
        sourceAdvertiserId: `codex-delete-src-${suffix}`,
        companyKey: `codex-delete-key-${suffix}`,
        displayName: "Codex Delete Fixture",
        rankScore: 1,
        canonicalName: "Codex Delete Fixture",
        profileUrl: null,
        logoUrl: null,
        industry: null,
        companySize: null,
        country: null,
        summary: null,
        createdAt: now,
        updatedAt: now,
      });

      const result = await deleteAdminAdvertisers([advertiserId, secondAdvertiserId]);

      assert.equal(result.deleted, true);
      assert.equal(result.advertisersDeleted, 2);
      assert.equal(result.adsDeleted, 2);
      assert.equal(result.savedAdsDeleted, 1);
      assert.equal(result.alertsDeleted, 1);

      const remaining = await Promise.all([
        db.select({ id: advertisersTable.id }).from(advertisersTable).where(eq(advertisersTable.id, advertiserId)),
        db.select({ id: advertisersTable.id }).from(advertisersTable).where(eq(advertisersTable.id, secondAdvertiserId)),
        db.select({ id: adsTable.id }).from(adsTable).where(eq(adsTable.id, adId)),
        db.select({ id: adsTable.id }).from(adsTable).where(eq(adsTable.id, secondAdId)),
        db.select({ id: trackedCompaniesTable.id }).from(trackedCompaniesTable).where(eq(trackedCompaniesTable.id, trackedCompanyId)),
        db.select({ id: savedAdsTable.id }).from(savedAdsTable).where(eq(savedAdsTable.id, savedAdId)),
        db.select({ id: alertsTable.id }).from(alertsTable).where(eq(alertsTable.id, alertId)),
        db.select({ id: advertiserSearchQueryResultsTable.id })
          .from(advertiserSearchQueryResultsTable)
          .where(eq(advertiserSearchQueryResultsTable.advertiserId, advertiserId)),
        db.select({ id: advertiserCompaniesTable.id }).from(advertiserCompaniesTable).where(eq(advertiserCompaniesTable.id, companyId)),
      ]);

      assert.deepEqual(remaining.map((rows) => rows.length), [0, 0, 0, 0, 0, 0, 0, 0, 0]);
    } finally {
      await db.delete(swipeFileCollectionItemsTable).where(eq(swipeFileCollectionItemsTable.savedAdId, savedAdId));
      await db.delete(alertDeliveriesTable).where(eq(alertDeliveriesTable.alertId, alertId));
      await db.delete(savedAdsTable).where(eq(savedAdsTable.id, savedAdId));
      await db.delete(alertsTable).where(eq(alertsTable.id, alertId));
      await db.delete(landingPageSnapshotsTable).where(eq(landingPageSnapshotsTable.adId, adId));
      await db.delete(adObservationsTable).where(eq(adObservationsTable.adId, adId));
      await db.delete(adObservationsTable).where(eq(adObservationsTable.adId, secondAdId));
      await db.delete(adsTable).where(eq(adsTable.id, adId));
      await db.delete(adsTable).where(eq(adsTable.id, secondAdId));
      await db.delete(trackerNotificationsTable).where(eq(trackerNotificationsTable.advertiserId, advertiserId));
      await db.delete(trackedCompaniesTable).where(eq(trackedCompaniesTable.id, trackedCompanyId));
      await db.delete(advertiserSearchAliasesTable).where(eq(advertiserSearchAliasesTable.advertiserId, advertiserId));
      await db.delete(advertiserSearchQueryResultsTable).where(eq(advertiserSearchQueryResultsTable.advertiserId, advertiserId));
      await db.delete(advertiserSearchQueryResultsTable).where(eq(advertiserSearchQueryResultsTable.advertiserId, secondAdvertiserId));
      await db.delete(advertisersTable).where(eq(advertisersTable.id, advertiserId));
      await db.delete(advertisersTable).where(eq(advertisersTable.id, secondAdvertiserId));
      await db.delete(advertiserCompaniesTable).where(eq(advertiserCompaniesTable.id, companyId));
      await db.delete(advertiserSearchQueriesTable).where(eq(advertiserSearchQueriesTable.id, queryId));
    }
  },
);
