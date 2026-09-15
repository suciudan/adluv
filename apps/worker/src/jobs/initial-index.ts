import { getTrackedCompanySyncContext, markTrackedCompanyIndexFailed, persistInitialIndexResult, upsertAdvertiser } from "@adluv/db";
import { postDiscordErrorNotification } from "@adluv/config/discord-errors";
import { isE2eFixtureMode, isValidSourceAdvertiserId, resolveAdvertiserSummary } from "@adluv/source-adapters";
import { materializeAdAssets } from "../ad-assets";
import { materializeAdvertiserLogo } from "../advertiser-assets";
import { prepareGoogleAdsForPersistence } from "../google-ad-ocr";
import { prepareVideoTranscriptsForPersistence } from "../video-transcription";
import { createWorkerSourceAdapter, getGoogleRpcProxyUrlsAsync } from "../source-adapter";
import { logWorkerEvent, toErrorContext } from "../logger";
import { buildSafeJobId, enqueueTrackedJob, queues } from "../queue";

export type InitialIndexJobPayload = {
  trackedCompanyId: string;
};

export async function runInitialIndexJob(payload: InitialIndexJobPayload) {
  try {
    logWorkerEvent("info", "initial_index.started", payload);

    const trackedCompany = await getTrackedCompanySyncContext(payload.trackedCompanyId);

    if (!trackedCompany) {
      throw new Error(`Tracked company ${payload.trackedCompanyId} was not found.`);
    }

    if (!isE2eFixtureMode() && !isValidSourceAdvertiserId(trackedCompany.source, trackedCompany.sourceAdvertiserId)) {
      throw new Error(
        `Refusing to index invalid ${trackedCompany.source} advertiser ${trackedCompany.sourceAdvertiserId}.`,
      );
    }

    const adapter = await createWorkerSourceAdapter(trackedCompany.source);
    const oneYearAgo = new Date();

    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const advertiserProfile = await adapter.fetchAdvertiserProfile(trackedCompany.sourceAdvertiserId);
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

    const ads = await adapter.fetchAdvertiserAds(trackedCompany.sourceAdvertiserId, {
      since: oneYearAgo,
    });
    const hydratedAds = await materializeAdAssets(ads, {
      sourceProxyUrls: trackedCompany.source === "google" ? await getGoogleRpcProxyUrlsAsync() : undefined,
    });
    const ocrPrepared = await prepareGoogleAdsForPersistence({
      advertiserId: trackedCompany.advertiserId,
      ads: hydratedAds,
    });
    const transcriptPrepared = await prepareVideoTranscriptsForPersistence(ocrPrepared.ads);
    const result = await persistInitialIndexResult({
      trackedCompanyId: payload.trackedCompanyId,
      ads: transcriptPrepared.ads,
    });

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

    logWorkerEvent("info", "initial_index.completed", {
      trackedCompanyId: payload.trackedCompanyId,
      source: trackedCompany.source,
      sourceAdvertiserId: trackedCompany.sourceAdvertiserId,
      advertiserMetadataRefreshed: Boolean(hydratedAdvertiserProfile),
      adsFound: hydratedAds.length,
      adsPersisted: result.adsPersisted,
      googleAdOcr: ocrPrepared.stats,
      landingPagesQueued: result.landingPageCaptureCandidates.length,
      fanoutTrackersQueued: result.fanoutTrackedCompanyIds.length,
    });

    return {
      payload,
      adsFound: hydratedAds.length,
      adsPersisted: result.adsPersisted,
      googleAdOcr: ocrPrepared.stats,
      landingPagesQueued: result.landingPageCaptureCandidates.length,
      fanoutTrackersQueued: result.fanoutTrackedCompanyIds.length,
      mode: "live",
    };
  } catch (error) {
    await markTrackedCompanyIndexFailed(payload.trackedCompanyId);
    logWorkerEvent("error", "initial_index.failed", {
      trackedCompanyId: payload.trackedCompanyId,
      ...toErrorContext(error),
    });
    await postDiscordErrorNotification({
      service: "adluv-worker",
      event: "initial_index.failed",
      title: "Ad scraper initial index failed",
      error,
      context: {
        trackedCompanyId: payload.trackedCompanyId,
      },
    });
    throw error;
  }
}
