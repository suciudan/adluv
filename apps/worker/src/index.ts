import { appConfig, queueNames } from "@adluv/config";
import {
  claimNextQueuedJob,
  createInitialIndexCompletedNotification,
  createInitialIndexFailedNotification,
  listAdvertisersWithActiveAdsDueForStatusCheck,
  listCreativeAssetRepairCandidates,
  listSyncableAdvertisers,
  listUsersPendingAlertDigests,
  markJobCompleted,
  markJobFailed,
} from "@adluv/db";

import { getWorkerEnv } from "./env";
import { runActiveAdStatusCheckJob } from "./jobs/active-ad-status-check";
import { runAdvertiserSearchJob } from "./jobs/advertiser-search";
import { runCreativeAssetRepairJob } from "./jobs/creative-asset-repair";
import { runInitialIndexJob } from "./jobs/initial-index";
import { runLandingPageCaptureJob } from "./jobs/landing-page-capture";
import { runScheduledSyncJob } from "./jobs/scheduled-sync";
import { runSendAlertDigestJob } from "./jobs/send-alert-digest";
import { runSendAlertJob } from "./jobs/send-alert";
import { logWorkerEvent, toErrorContext } from "./logger";
import { buildSafeJobId, enqueueTrackedJob, queues } from "./queue";

const workerEnv = getWorkerEnv();

const queueHandlers = {
  [queueNames.advertiserSearch]: (payload: Record<string, unknown>) =>
    runAdvertiserSearchJob(payload as { normalizedQuery: string; displayQuery: string }),
  [queueNames.initialIndex]: (payload: Record<string, unknown>) => runInitialIndexJob(payload as { trackedCompanyId: string }),
  [queueNames.scheduledSync]: (payload: Record<string, unknown>) =>
    runScheduledSyncJob(payload as { advertiserId?: string; trackedCompanyId?: string }),
  [queueNames.creativeAssetRepair]: (payload: Record<string, unknown>) =>
    runCreativeAssetRepairJob(payload as { adId: string }),
  [queueNames.activeAdStatusCheck]: (payload: Record<string, unknown>) =>
    runActiveAdStatusCheckJob(payload as { advertiserId: string }),
  [queueNames.landingPageCapture]: (payload: Record<string, unknown>) =>
    runLandingPageCaptureJob(payload as { adId: string; url: string }),
  [queueNames.sendAlert]: (payload: Record<string, unknown>) =>
    runSendAlertJob(payload as { alertId: string }),
  [queueNames.sendAlertDigest]: (payload: Record<string, unknown>) =>
    runSendAlertDigestJob(
      payload as {
        userId: string;
        digestFrequency: "daily" | "weekly" | "monthly";
      },
    ),
} as const;

const queueOrder = [
  queueNames.advertiserSearch,
  queueNames.initialIndex,
  queueNames.scheduledSync,
  queueNames.creativeAssetRepair,
  queueNames.activeAdStatusCheck,
  queueNames.landingPageCapture,
  queueNames.sendAlert,
  queueNames.sendAlertDigest,
] as const;

function getSyncDueCutoff(now: Date) {
  return new Date(now.getTime() - workerEnv.syncCadenceMinutes * 60_000);
}

function getActiveAdStatusCheckDueCutoff(now: Date) {
  return new Date(now.getTime() - workerEnv.activeAdStatusCheckCadenceHours * 60 * 60_000);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scheduleRecurringSyncs() {
  const now = new Date();
  const cutoff = getSyncDueCutoff(now);
  const advertisers = await listSyncableAdvertisers();
  const dueAdvertisers = advertisers.filter(
    (advertiser) =>
      advertiser.lastIndexedAt === null || advertiser.lastIndexedAt.getTime() <= cutoff.getTime(),
  );

  await Promise.all(
    dueAdvertisers.map((advertiser) =>
      enqueueTrackedJob(
        queues.scheduledSync,
        "scheduled-sync",
        { advertiserId: advertiser.advertiserId },
        {
          jobId: buildSafeJobId("scheduled-sync", advertiser.advertiserId),
          removeOnComplete: true,
          removeOnFail: true,
        },
      ),
    ),
  );

  logWorkerEvent("info", "scheduler.scan.completed", {
    advertisersScanned: advertisers.length,
    dueAdvertisers: dueAdvertisers.length,
    cadenceMinutes: workerEnv.syncCadenceMinutes,
    pollSeconds: workerEnv.syncSchedulerPollSeconds,
  });
}

async function scheduleActiveAdStatusChecks() {
  const now = new Date();
  const cutoff = getActiveAdStatusCheckDueCutoff(now);
  const advertisers = await listAdvertisersWithActiveAdsDueForStatusCheck(cutoff);

  await Promise.all(
    advertisers.map((advertiser) =>
      enqueueTrackedJob(
        queues.activeAdStatusCheck,
        "active-ad-status-check",
        { advertiserId: advertiser.advertiserId },
        {
          jobId: buildSafeJobId("active-ad-status-check", advertiser.advertiserId),
          removeOnComplete: true,
          removeOnFail: true,
        },
      ),
    ),
  );

  logWorkerEvent("info", "scheduler.active_ad_status_scan.completed", {
    advertisersDue: advertisers.length,
    activeAdsDue: advertisers.reduce((total, advertiser) => total + advertiser.activeAdsDue, 0),
    cadenceHours: workerEnv.activeAdStatusCheckCadenceHours,
    pollSeconds: workerEnv.syncSchedulerPollSeconds,
  });
}

async function scheduleCreativeAssetRepairs() {
  const candidates = await listCreativeAssetRepairCandidates(workerEnv.creativeAssetRepairScanLimit);

  await Promise.all(
    candidates.map((candidate) =>
      enqueueTrackedJob(
        queues.creativeAssetRepair,
        "creative-asset-repair",
        { adId: candidate.adId },
        {
          jobId: buildSafeJobId("creative-asset-repair", candidate.adId),
          removeOnComplete: true,
          removeOnFail: true,
        },
      ),
    ),
  );

  logWorkerEvent("info", "scheduler.creative_asset_repair_scan.completed", {
    candidates: candidates.length,
    missingStoredCreatives: candidates.reduce((sum, candidate) => sum + candidate.missingStoredCreatives, 0),
    scanLimit: workerEnv.creativeAssetRepairScanLimit,
  });
}

async function scheduleAlertDigests() {
  const now = new Date();
  const users = await listUsersPendingAlertDigests(now);

  await Promise.all(
    users.map((user) =>
      enqueueTrackedJob(
        queues.sendAlertDigest,
        "send-alert-digest",
        {
          userId: user.userId,
          digestFrequency: user.digestFrequency,
        },
        {
          jobId: buildSafeJobId("send-alert-digest", user.userId, user.digestFrequency),
          removeOnComplete: true,
          removeOnFail: true,
        },
      ),
    ),
  );

  logWorkerEvent("info", "scheduler.digest_scan.completed", {
    usersScanned: users.length,
  });
}

async function handleCompletedInitialIndexJob(jobId: string, result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return;
  }

  const payload = (result as Record<string, unknown>).payload;
  const trackedCompanyId =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>).trackedCompanyId
      : null;

  if (typeof trackedCompanyId !== "string") {
    return;
  }

  await createInitialIndexCompletedNotification({
    jobId,
    trackedCompanyId,
    adsFound:
      typeof (result as Record<string, unknown>).adsFound === "number"
        ? ((result as Record<string, unknown>).adsFound as number)
        : 0,
    adsPersisted:
      typeof (result as Record<string, unknown>).adsPersisted === "number"
        ? ((result as Record<string, unknown>).adsPersisted as number)
        : 0,
    landingPagesQueued:
      typeof (result as Record<string, unknown>).landingPagesQueued === "number"
        ? ((result as Record<string, unknown>).landingPagesQueued as number)
        : 0,
  });
}

async function handleFailedInitialIndexJob(jobId: string, payload: Record<string, unknown> | null, error: Error) {
  const trackedCompanyId =
    payload && typeof payload.trackedCompanyId === "string" ? payload.trackedCompanyId : null;

  if (!trackedCompanyId) {
    return;
  }

  await createInitialIndexFailedNotification({
    jobId,
    trackedCompanyId,
    errorMessage: error.message,
  });
}

async function processNextJob(queueName: (typeof queueOrder)[number]) {
  const claimedJob = await claimNextQueuedJob(queueName);

  if (!claimedJob) {
    return false;
  }

  logWorkerEvent("info", "job.active", {
    jobId: claimedJob.id,
    queueName: claimedJob.queueName,
    attempts: claimedJob.attempts,
  });

  const handler = queueHandlers[queueName];

  try {
    const result = await handler(claimedJob.payload ?? {});

    await markJobCompleted({
      id: claimedJob.id,
      attempts: claimedJob.attempts,
    });

    if (queueName === queueNames.initialIndex) {
      await handleCompletedInitialIndexJob(claimedJob.id, result);
    }

    logWorkerEvent("info", "job.completed", {
      jobId: claimedJob.id,
      queueName: claimedJob.queueName,
      attempts: claimedJob.attempts,
      result,
    });
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error("Unknown worker failure");

    await markJobFailed({
      id: claimedJob.id,
      attempts: claimedJob.attempts,
      errorMessage: normalizedError.message,
    });

    if (queueName === queueNames.initialIndex) {
      await handleFailedInitialIndexJob(claimedJob.id, claimedJob.payload, normalizedError);
    }

    logWorkerEvent("error", "job.failed", {
      jobId: claimedJob.id,
      queueName: claimedJob.queueName,
      attempts: claimedJob.attempts,
      ...toErrorContext(normalizedError),
    });
  }

  return true;
}

async function runQueueLoop() {
  for (;;) {
    let processedJobs = 0;

    for (const queueName of queueOrder) {
      if (await processNextJob(queueName)) {
        processedJobs += 1;
      }
    }

    if (processedJobs === 0) {
      await delay(1_000);
    }
  }
}

void scheduleRecurringSyncs().catch((error) => {
  logWorkerEvent("error", "scheduler.scan.failed", toErrorContext(error));
});

void scheduleActiveAdStatusChecks().catch((error) => {
  logWorkerEvent("error", "scheduler.active_ad_status_scan.failed", toErrorContext(error));
});

void scheduleCreativeAssetRepairs().catch((error) => {
  logWorkerEvent("error", "scheduler.creative_asset_repair_scan.failed", toErrorContext(error));
});

void scheduleAlertDigests().catch((error) => {
  logWorkerEvent("error", "scheduler.digest_scan.failed", toErrorContext(error));
});

setInterval(() => {
  void scheduleRecurringSyncs().catch((error) => {
    logWorkerEvent("error", "scheduler.scan.failed", toErrorContext(error));
  });
  void scheduleActiveAdStatusChecks().catch((error) => {
    logWorkerEvent("error", "scheduler.active_ad_status_scan.failed", toErrorContext(error));
  });
  void scheduleCreativeAssetRepairs().catch((error) => {
    logWorkerEvent("error", "scheduler.creative_asset_repair_scan.failed", toErrorContext(error));
  });
  void scheduleAlertDigests().catch((error) => {
    logWorkerEvent("error", "scheduler.digest_scan.failed", toErrorContext(error));
  });
}, workerEnv.syncSchedulerPollSeconds * 1000);

void runQueueLoop().catch((error) => {
  logWorkerEvent("error", "worker.queue_loop.failed", toErrorContext(error));
});

logWorkerEvent("info", "worker.started", {
  appName: appConfig.name,
  cadenceMinutes: workerEnv.syncCadenceMinutes,
  activeAdStatusCheckCadenceHours: workerEnv.activeAdStatusCheckCadenceHours,
  pollSeconds: workerEnv.syncSchedulerPollSeconds,
});
