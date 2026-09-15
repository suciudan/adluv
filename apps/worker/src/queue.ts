import { randomUUID } from "node:crypto";

import { queueNames } from "@adluv/config";
import { getJobById, recordJobQueued } from "@adluv/db";

export type QueueName = (typeof queueNames)[keyof typeof queueNames];

export type JobsOptions = {
  jobId?: string;
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
};

export type DatabaseJob<TData, TName extends string> = {
  id: string;
  name: TName;
  queueName: string;
  data: TData;
  attemptsMade: number;
  status?: "queued" | "running" | "completed" | "failed";
};

class DatabaseQueue<TData, TName extends string> {
  constructor(readonly name: string) {}

  async add(name: TName, data: TData, options?: JobsOptions): Promise<DatabaseJob<TData, TName>> {
    return {
      id: options?.jobId ?? randomUUID(),
      name,
      queueName: this.name,
      data,
      attemptsMade: 0,
    };
  }

  async getJob(jobId: string): Promise<DatabaseJob<TData, TName> | null> {
    const job = await getJobById(jobId);

    if (!job) {
      return null;
    }

    return {
      id: job.id,
      name: this.name as TName,
      queueName: job.queueName,
      data: (job.payload ?? {}) as TData,
      attemptsMade: Math.max(0, job.attempts - 1),
      status: job.status,
    };
  }
}

export const queues = {
  advertiserSearch: new DatabaseQueue<{ normalizedQuery: string; displayQuery: string }, "advertiser-search">(
    queueNames.advertiserSearch,
  ),
  initialIndex: new DatabaseQueue<{ trackedCompanyId: string; sourceAdvertiserId?: string }, "initial-index">(
    queueNames.initialIndex,
  ),
  scheduledSync: new DatabaseQueue<{ advertiserId?: string; trackedCompanyId?: string }, "scheduled-sync">(
    queueNames.scheduledSync,
  ),
  creativeAssetRepair: new DatabaseQueue<{ adId: string }, "creative-asset-repair">(
    queueNames.creativeAssetRepair,
  ),
  activeAdStatusCheck: new DatabaseQueue<{ advertiserId: string }, "active-ad-status-check">(
    queueNames.activeAdStatusCheck,
  ),
  landingPageCapture: new DatabaseQueue<{ adId: string; url: string }, "landing-page-capture">(
    queueNames.landingPageCapture,
  ),
  sendAlert: new DatabaseQueue<{ alertId: string }, "send-alert">(queueNames.sendAlert),
  sendAlertDigest: new DatabaseQueue<
    { userId: string; digestFrequency: "daily" | "weekly" | "monthly" },
    "send-alert-digest"
  >(queueNames.sendAlertDigest),
};

export function buildSafeJobId(...parts: Array<string | number>) {
  return parts
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join("__")
    .replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export async function enqueueTrackedJob<TData, TName extends string>(
  queue: DatabaseQueue<TData, TName>,
  name: TName,
  payload: TData,
  options?: JobsOptions,
) {
  if (options?.jobId) {
    const existingJob = await queue.getJob(options.jobId);

    if (existingJob && (existingJob.status === "queued" || existingJob.status === "running")) {
      return existingJob;
    }
  }

  const job = await queue.add(name, payload, options);

  await recordJobQueued({
    id: String(job.id),
    queueName: queue.name,
    payload,
  });

  return job;
}
