import { postDiscordErrorNotification } from "@adluv/config/discord-errors";
import { getActiveAdStatusCheckContext, recordActiveAdStatusCheckResults } from "@adluv/db";
import { isE2eFixtureMode, isValidSourceAdvertiserId } from "@adluv/source-adapters";

import { logWorkerEvent, toErrorContext } from "../logger";
import { createWorkerSourceAdapter } from "../source-adapter";

export type ActiveAdStatusCheckJobPayload = {
  advertiserId: string;
};

type ActiveAdStatusCheckContext = Awaited<ReturnType<typeof getActiveAdStatusCheckContext>>;

function isInactiveSourceStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return (
    normalized === "inactive" ||
    normalized === "ended" ||
    normalized === "completed" ||
    normalized === "removed" ||
    normalized.includes("not active")
  );
}

function isTransientActiveAdStatusCheckError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return /webscrapingapi|rate limit|429|timed out|timeout|unable to fetch|502|503|504|ECONNRESET|ETIMEDOUT/i.test(
    message,
  );
}

export async function runActiveAdStatusCheckJob(payload: ActiveAdStatusCheckJobPayload) {
  let context: ActiveAdStatusCheckContext = null;

  try {
    logWorkerEvent("info", "active_ad_status_check.started", payload);

    context = await getActiveAdStatusCheckContext(payload.advertiserId);

    if (!context) {
      throw new Error(`Advertiser ${payload.advertiserId} was not found.`);
    }

    if (!context.activeAds.length) {
      logWorkerEvent("info", "active_ad_status_check.skipped", {
        advertiserId: context.advertiserId,
        reason: "no-active-ads",
      });

      return {
        payload,
        checkedAds: 0,
        inactiveAds: 0,
        checkedAt: new Date().toISOString(),
      };
    }

    if (!isE2eFixtureMode() && !isValidSourceAdvertiserId(context.source, context.sourceAdvertiserId)) {
      throw new Error(
        `Refusing to check invalid ${context.source} advertiser ${context.sourceAdvertiserId}.`,
      );
    }

    const checkedAt = new Date();
    const adapter = await createWorkerSourceAdapter(context.source);
    const fetchedAds = await adapter.fetchAdvertiserAds(context.sourceAdvertiserId, {
      maxResults: Math.max(100, context.activeAds.length),
      sourceAdIds: context.activeAds.map((ad) => ad.sourceAdId),
    });
    const fetchedAdsBySourceId = new Map(
      fetchedAds
        .filter((ad): ad is typeof ad & { sourceAdId: string } => typeof ad.sourceAdId === "string")
        .map((ad) => [ad.sourceAdId, ad]),
    );
    const contextSource = context.source;
    const sourceStatuses = context.activeAds.map((ad) => ({
      sourceAdId: ad.sourceAdId,
      status: fetchedAdsBySourceId.get(ad.sourceAdId)?.status ?? (contextSource === "facebook" ? "removed" : null),
    }));
    const inactiveSourceAdIds = sourceStatuses
      .filter((sourceStatus) => isInactiveSourceStatus(sourceStatus.status))
      .map((sourceStatus) => sourceStatus.sourceAdId);
    const result = await recordActiveAdStatusCheckResults({
      advertiserId: context.advertiserId,
      checkedAt,
      checkedSourceAdIds: context.activeAds.map((ad) => ad.sourceAdId),
      inactiveSourceAdIds,
      sourceStatuses,
    });

    logWorkerEvent("info", "active_ad_status_check.completed", {
      advertiserId: context.advertiserId,
      source: context.source,
      advertiserName: context.advertiserName,
      activeAds: context.activeAds.length,
      adsFetched: fetchedAds.length,
      checkedAds: result.checkedAds,
      inactiveAds: result.inactiveAds,
    });

    return {
      payload,
      adsFetched: fetchedAds.length,
      checkedAds: result.checkedAds,
      inactiveAds: result.inactiveAds,
      checkedAt: checkedAt.toISOString(),
    };
  } catch (error) {
    if (context && isTransientActiveAdStatusCheckError(error)) {
      const checkedAt = new Date();
      const result = await recordActiveAdStatusCheckResults({
        advertiserId: context.advertiserId,
        checkedAt,
        checkedSourceAdIds: context.activeAds.map((ad) => ad.sourceAdId),
        inactiveSourceAdIds: [],
        sourceStatuses: context.activeAds.map((ad) => ({
          sourceAdId: ad.sourceAdId,
          status: null,
        })),
      });

      logWorkerEvent("warn", "active_ad_status_check.deferred_transient", {
        advertiserId: context.advertiserId,
        source: context.source,
        advertiserName: context.advertiserName,
        activeAds: context.activeAds.length,
        checkedAds: result.checkedAds,
        ...toErrorContext(error),
      });

      return {
        payload,
        adsFetched: 0,
        checkedAds: result.checkedAds,
        inactiveAds: 0,
        mode: "transient_deferred",
        checkedAt: checkedAt.toISOString(),
      };
    }

    logWorkerEvent("error", "active_ad_status_check.failed", {
      advertiserId: payload.advertiserId,
      ...toErrorContext(error),
    });
    await postDiscordErrorNotification({
      service: "adluv-worker",
      event: "active_ad_status_check.failed",
      title: "Active ad status check failed",
      error,
      context: {
        advertiserId: payload.advertiserId,
      },
    });
    throw error;
  }
}
