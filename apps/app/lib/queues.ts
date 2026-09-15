import { randomUUID } from "node:crypto";

import { queueNames } from "@adluv/config";

type AppJob<TData, TName extends string> = {
  id: string;
  name: TName;
  queueName: string;
  data: TData;
  attemptsMade: number;
};

type AppQueueOptions = {
  jobId?: string;
};

class AppQueue<TData, TName extends string> {
  constructor(readonly name: string) {}

  async add(name: TName, data: TData, options?: AppQueueOptions): Promise<AppJob<TData, TName>> {
    return {
      id: options?.jobId ?? randomUUID(),
      name,
      queueName: this.name,
      data,
      attemptsMade: 0,
    };
  }
}

let advertiserSearchQueue:
  | AppQueue<{ normalizedQuery: string; displayQuery: string }, "advertiser-search">
  | undefined;
let initialIndexQueue: AppQueue<{ trackedCompanyId: string; sourceAdvertiserId?: string }, "initial-index"> | undefined;
let scheduledSyncQueue: AppQueue<{ trackedCompanyId: string }, "scheduled-sync"> | undefined;

export function getAdvertiserSearchQueue() {
  if (!advertiserSearchQueue) {
    advertiserSearchQueue = new AppQueue(queueNames.advertiserSearch);
  }

  return advertiserSearchQueue;
}

export function getInitialIndexQueue() {
  if (!initialIndexQueue) {
    initialIndexQueue = new AppQueue(queueNames.initialIndex);
  }

  return initialIndexQueue;
}

export function getScheduledSyncQueue() {
  if (!scheduledSyncQueue) {
    scheduledSyncQueue = new AppQueue(queueNames.scheduledSync);
  }

  return scheduledSyncQueue;
}
