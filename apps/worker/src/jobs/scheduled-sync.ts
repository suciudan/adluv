import {
  createAlertsForAds,
  deferAdvertiserSyncAttempt,
  deferTrackedCompanySyncAttempt,
  getAdvertiserSyncContext,
  getTrackedCompanySyncContext,
  markAdvertiserSyncFailed,
  markTrackedCompanySyncFailed,
  persistAdvertiserSyncResult,
  persistScheduledSyncResult,
  upsertAdvertiser,
} from "@adluv/db";
import { postDiscordErrorNotification } from "@adluv/config/discord-errors";
import { isE2eFixtureMode, isValidSourceAdvertiserId, resolveAdvertiserSummary } from "@adluv/source-adapters";
import { materializeAdAssets } from "../ad-assets";
import { materializeAdvertiserLogo } from "../advertiser-assets";
import { prepareGoogleAdsForPersistence } from "../google-ad-ocr";
import { prepareVideoTranscriptsForPersistence } from "../video-transcription";
import { createWorkerSourceAdapter, getGoogleRpcProxyUrlsAsync } from "../source-adapter";
import { logWorkerEvent, toErrorContext } from "../logger";
import { buildSafeJobId, enqueueTrackedJob, queues } from "../queue";

export type ScheduledSyncJobPayload = {
  advertiserId?: string;
  trackedCompanyId?: string;
};

type ScheduledSyncTarget = {
  advertiserId: string;
  source: "linkedin" | "facebook" | "google" | "tiktok";
  sourceAdvertiserId: string;
  advertiserName: string;
  trackedCompanyId?: string;
  workspaceId?: string | null;
  userId?: string;
};

const scheduledSyncFailureNotifications = new Map<string, number>();

function isTransientScheduledSyncError(error: unknown, source?: ScheduledSyncTarget["source"] | null) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (source === "facebook") {
    return /rate limit|429|temporarily blocked|try again|timed out|timeout|502|503|504|ECONNRESET|ETIMEDOUT/i.test(
      message,
    );
  }

  if (source === "linkedin") {
    return /webscrapingapi|timed out|timeout|unable to fetch|429|502|503|504|ECONNRESET|ETIMEDOUT/i.test(
      message,
    );
  }

  if (source === "google") {
    return /rate limit|429|timed out|timeout|unable to fetch|502|503|504|ECONNRESET|ETIMEDOUT/i.test(message);
  }

  return /429|timed out|timeout|502|503|504|ECONNRESET|ETIMEDOUT/i.test(message);
}

function getScheduledSyncFailureNotificationDedupeMs() {
  const minutes = Number(process.env.SCHEDULED_SYNC_FAILURE_NOTIFICATION_DEDUPE_MINUTES);
  const normalizedMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;

  return normalizedMinutes * 60_000;
}

function shouldPostScheduledSyncFailureNotification(input: {
  error: unknown;
  source?: ScheduledSyncTarget["source"];
}) {
  const errorMessage = input.error instanceof Error ? input.error.message : String(input.error ?? "unknown error");
  const key = `${input.source ?? "unknown"}:${errorMessage}`;
  const now = Date.now();
  const dedupeMs = getScheduledSyncFailureNotificationDedupeMs();
  const lastNotifiedAt = scheduledSyncFailureNotifications.get(key);

  for (const [dedupeKey, notifiedAt] of scheduledSyncFailureNotifications) {
    if (now - notifiedAt > dedupeMs) {
      scheduledSyncFailureNotifications.delete(dedupeKey);
    }
  }

  if (lastNotifiedAt && now - lastNotifiedAt < dedupeMs) {
    return false;
  }

  scheduledSyncFailureNotifications.set(key, now);
  return true;
}

async function getScheduledSyncTarget(payload: ScheduledSyncJobPayload): Promise<ScheduledSyncTarget> {
  if (payload.advertiserId) {
    const advertiser = await getAdvertiserSyncContext(payload.advertiserId);

    if (!advertiser) {
      throw new Error(`Advertiser ${payload.advertiserId} was not found.`);
    }

    return advertiser;
  }

  if (payload.trackedCompanyId) {
    const trackedCompany = await getTrackedCompanySyncContext(payload.trackedCompanyId);

    if (!trackedCompany) {
      throw new Error(`Tracked company ${payload.trackedCompanyId} was not found.`);
    }

    return trackedCompany;
  }

  throw new Error("Scheduled sync requires an advertiserId or trackedCompanyId.");
}

export async function runScheduledSyncJob(payload: ScheduledSyncJobPayload) {
  let target: ScheduledSyncTarget | null = null;

  try {
    logWorkerEvent("info", "scheduled_sync.started", payload);

    target = await getScheduledSyncTarget(payload);
    const syncTarget = target;

    if (!isE2eFixtureMode() && !isValidSourceAdvertiserId(syncTarget.source, syncTarget.sourceAdvertiserId)) {
      throw new Error(
        `Refusing to sync invalid ${syncTarget.source} advertiser ${syncTarget.sourceAdvertiserId}.`,
      );
    }

    const adapter = await createWorkerSourceAdapter(syncTarget.source);
    const advertiserProfile = await adapter.fetchAdvertiserProfile(syncTarget.sourceAdvertiserId).catch((error) => {
      logWorkerEvent("warn", "scheduled_sync.advertiser_profile_refresh_failed", {
        advertiserId: syncTarget.advertiserId,
        trackedCompanyId: payload.trackedCompanyId ?? null,
        source: syncTarget.source,
        sourceAdvertiserId: syncTarget.sourceAdvertiserId,
        ...toErrorContext(error),
      });

      return null;
    });
    const hydratedAdvertiserProfile = advertiserProfile
      ? await materializeAdvertiserLogo(advertiserProfile).catch(() => advertiserProfile)
      : null;

    if (hydratedAdvertiserProfile) {
      const summary = isE2eFixtureMode()
        ? hydratedAdvertiserProfile.summary
        : await resolveAdvertiserSummary({
            websiteUrl: hydratedAdvertiserProfile.websiteUrl,
            currentSummary: hydratedAdvertiserProfile.summary,
          }) ?? undefined;
      const advertiser = await upsertAdvertiser({
        id: hydratedAdvertiserProfile.id,
        source: hydratedAdvertiserProfile.source,
        sourceAdvertiserId: hydratedAdvertiserProfile.sourceAdvertiserId,
        canonicalName: hydratedAdvertiserProfile.canonicalName,
        profileUrl: hydratedAdvertiserProfile.profileUrl,
        websiteUrl: hydratedAdvertiserProfile.websiteUrl,
        logoUrl: hydratedAdvertiserProfile.logoUrl,
        industry: hydratedAdvertiserProfile.industry,
        companySize: hydratedAdvertiserProfile.companySize,
        country: hydratedAdvertiserProfile.country,
        summary,
      });

      await Promise.all(
        advertiser.fanoutTrackedCompanyIds.map((fanoutTrackedCompanyId) =>
          enqueueTrackedJob(
            queues.initialIndex,
            "initial-index",
            { trackedCompanyId: fanoutTrackedCompanyId },
            {
              jobId: buildSafeJobId("initial-index", fanoutTrackedCompanyId),
            },
          ),
        ),
      );
    }

    const ads = await adapter.fetchAdvertiserAds(syncTarget.sourceAdvertiserId);
    const hydratedAds = await materializeAdAssets(ads, {
      sourceProxyUrls: syncTarget.source === "google" ? await getGoogleRpcProxyUrlsAsync() : undefined,
    });
    const ocrPrepared = await prepareGoogleAdsForPersistence({
      advertiserId: syncTarget.advertiserId,
      ads: hydratedAds,
    });
    const transcriptPrepared = await prepareVideoTranscriptsForPersistence(ocrPrepared.ads);
    const result = payload.trackedCompanyId
      ? await persistScheduledSyncResult({
          trackedCompanyId: payload.trackedCompanyId,
          ads: transcriptPrepared.ads,
        })
      : await persistAdvertiserSyncResult({
          advertiserId: syncTarget.advertiserId,
          ads: transcriptPrepared.ads,
        });
    const alertTargets = payload.trackedCompanyId && syncTarget.userId && syncTarget.trackedCompanyId
      ? [
          {
            userId: syncTarget.userId,
            workspaceId: syncTarget.workspaceId,
            trackedCompanyId: syncTarget.trackedCompanyId,
          },
        ]
      : "syncedTrackedCompanies" in result
        ? result.syncedTrackedCompanies
        : [];
    const createdAlerts = (
      await Promise.all(
        alertTargets.map((alertTarget) =>
          createAlertsForAds({
            userId: alertTarget.userId,
            workspaceId: alertTarget.workspaceId,
            trackedCompanyId: alertTarget.trackedCompanyId,
            advertiserName: syncTarget.advertiserName,
            ads: result.newAds,
          }),
        ),
      )
    ).flat();

    await Promise.all(
      result.landingPageCaptureCandidates.map((candidate) =>
        enqueueTrackedJob(queues.landingPageCapture, "landing-page-capture", candidate, {
          jobId: buildSafeJobId("landing-page", candidate.adId),
        }),
      ),
    );

    await Promise.all(
      result.fanoutTrackedCompanyIds.map((fanoutTrackedCompanyId) =>
        enqueueTrackedJob(
          queues.initialIndex,
          "initial-index",
          { trackedCompanyId: fanoutTrackedCompanyId },
          {
            jobId: buildSafeJobId("initial-index", fanoutTrackedCompanyId),
          },
        ),
      ),
    );

    await Promise.all(
      createdAlerts.map((alert) =>
        alert.shouldSendEmail
          ? enqueueTrackedJob(
              queues.sendAlert,
              "send-alert",
              {
                alertId: alert.id,
              },
              {
                jobId: buildSafeJobId("send-alert", alert.id, "email"),
                removeOnComplete: true,
                removeOnFail: true,
              },
            )
          : Promise.resolve(null),
      ),
    );

    logWorkerEvent("info", "scheduled_sync.completed", {
      advertiserId: syncTarget.advertiserId,
      trackedCompanyId: payload.trackedCompanyId ?? null,
      source: syncTarget.source,
      advertiserMetadataRefreshed: Boolean(hydratedAdvertiserProfile),
      adsFound: hydratedAds.length,
      googleAdOcr: ocrPrepared.stats,
      videoTranscripts: transcriptPrepared.transcribed,
      newAdsDetected: result.newAds.length,
      alertsCreated: createdAlerts.length,
      landingPagesQueued: result.landingPageCaptureCandidates.length,
      fanoutTrackersQueued: result.fanoutTrackedCompanyIds.length,
    });

    return {
      payload,
      adsFound: hydratedAds.length,
      googleAdOcr: ocrPrepared.stats,
      alertsCreated: createdAlerts.length,
      newAdsDetected: result.newAds.length,
      fanoutTrackersQueued: result.fanoutTrackedCompanyIds.length,
      mode: "live",
      syncedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (isTransientScheduledSyncError(error, target?.source)) {
      if (payload.trackedCompanyId) {
        await deferTrackedCompanySyncAttempt(payload.trackedCompanyId);
      } else if (payload.advertiserId) {
        await deferAdvertiserSyncAttempt(payload.advertiserId);
      }

      logWorkerEvent("warn", "scheduled_sync.deferred_transient", {
        advertiserId: payload.advertiserId ?? null,
        trackedCompanyId: payload.trackedCompanyId ?? null,
        source: target?.source ?? null,
        sourceAdvertiserId: target?.sourceAdvertiserId ?? null,
        ...toErrorContext(error),
      });

      return {
        payload,
        adsFound: 0,
        alertsCreated: 0,
        newAdsDetected: 0,
        fanoutTrackersQueued: 0,
        mode: "transient_deferred",
        syncedAt: new Date().toISOString(),
      };
    }

    if (payload.trackedCompanyId) {
      await markTrackedCompanySyncFailed(payload.trackedCompanyId);
    } else if (payload.advertiserId) {
      await markAdvertiserSyncFailed(payload.advertiserId);
    }

    logWorkerEvent("error", "scheduled_sync.failed", {
      advertiserId: payload.advertiserId ?? null,
      trackedCompanyId: payload.trackedCompanyId ?? null,
      source: target?.source ?? null,
      sourceAdvertiserId: target?.sourceAdvertiserId ?? null,
      ...toErrorContext(error),
    });

    if (shouldPostScheduledSyncFailureNotification({ error, source: target?.source })) {
      await postDiscordErrorNotification({
        service: "adluv-worker",
        event: "scheduled_sync.failed",
        title: "Ad scraper scheduled sync failed",
        error,
        context: {
          advertiserId: payload.advertiserId ?? null,
          trackedCompanyId: payload.trackedCompanyId ?? null,
          source: target?.source ?? null,
          sourceAdvertiserId: target?.sourceAdvertiserId ?? null,
        },
      });
    } else {
      logWorkerEvent("info", "scheduled_sync.failure_notification_suppressed", {
        advertiserId: payload.advertiserId ?? null,
        trackedCompanyId: payload.trackedCompanyId ?? null,
        source: target?.source ?? null,
        sourceAdvertiserId: target?.sourceAdvertiserId ?? null,
      });
    }

    throw error;
  }
}
