export const pendingTrackedCompanyQueuedEventName = "adluv:pending-tracked-company-queued";

export type PendingTrackedCompanyEventDetail = {
  trackedCompanyId: string;
  advertiserId: string;
  advertiserName: string;
  advertiserLogoUrl: string | null;
  source: "linkedin" | "facebook" | "google" | "tiktok";
  createdAt: string;
  status: "pending_initial_index";
};
