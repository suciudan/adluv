import type { NotificationInboxItem } from "@adluv/db";

import { getAdFormatLabel } from "./ad-format";

export type NotificationTypeFilter =
  | "all"
  | "unread"
  | "new_ads"
  | "new_creatives"
  | "landing_pages"
  | "tracking";

export function isTrackerNotification(item: NotificationInboxItem) {
  return item.entityType === "tracker";
}

export function getNotificationType(item: NotificationInboxItem): Exclude<NotificationTypeFilter, "all" | "unread"> {
  if (item.kind === "landing_page") {
    return "landing_pages";
  }

  if (item.kind === "new_creative") {
    return "new_creatives";
  }

  if (item.entityType === "tracker") {
    return "tracking";
  }

  return "new_ads";
}

export function getNotificationTypeLabel(type: Exclude<NotificationTypeFilter, "all" | "unread">) {
  if (type === "landing_pages") {
    return "Landing pages";
  }

  if (type === "new_creatives") {
    return "New creatives";
  }

  if (type === "tracking") {
    return "Tracking";
  }

  return "New ads";
}

export function getNotificationTitle(item: NotificationInboxItem) {
  if (item.kind === "initial_index_completed") {
    return `${item.advertiserName} finished initial scraping`;
  }

  if (item.kind === "initial_index_failed") {
    return `${item.advertiserName} needs tracker attention`;
  }

  if (item.kind === "landing_page") {
    return `${item.advertiserName} added a new landing page`;
  }

  if (item.kind === "new_creative") {
    return `${item.advertiserName} added a new creative`;
  }

  if (!item.adFormat) {
    return `${item.advertiserName} launched a new ad`;
  }

  const formatLabel = getAdFormatLabel(item.adFormat).toLowerCase();

  return formatLabel.endsWith(" ad")
    ? `${item.advertiserName} launched a new ${formatLabel}`
    : `${item.advertiserName} launched a new ${formatLabel} ad`;
}

export function getNotificationBody(item: NotificationInboxItem) {
  if (item.kind === "initial_index_completed") {
    const adsPersisted =
      item.entityType === "tracker" && typeof item.metadata?.adsPersisted === "number"
        ? item.metadata.adsPersisted
        : null;
    const adsFound =
      item.entityType === "tracker" && typeof item.metadata?.adsFound === "number"
        ? item.metadata.adsFound
        : null;

    if (adsPersisted !== null && adsFound !== null) {
      return `Imported ${adsPersisted} ad${adsPersisted === 1 ? "" : "s"} from ${adsFound} discovered.`;
    }

    return item.body ?? "Initial scrape completed.";
  }

  if (item.kind === "initial_index_failed") {
    return item.body ?? "Initial scrape failed and needs attention.";
  }

  if (item.kind === "landing_page") {
    return item.relatedLandingPageUrl ?? item.destinationUrl ?? "Landing page detected";
  }

  const firstSeenDate = item.firstSeenAt?.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  if (item.kind === "new_creative") {
    const relatedCount = Math.max(1, item.relatedAdIds.length);
    return `Used in ${relatedCount} ad${relatedCount === 1 ? "" : "s"} · First seen: ${firstSeenDate}`;
  }

  return `CTA: ${item.callToAction ?? "Unknown"} · First seen: ${firstSeenDate}`;
}

export function hydrateNotificationInboxItems(items: NotificationInboxItem[]) {
  return items.map((item) => ({
    ...item,
    createdAt: item.createdAt instanceof Date ? item.createdAt : new Date(item.createdAt),
    deliveredAt:
      item.deliveredAt instanceof Date || item.deliveredAt === null ? item.deliveredAt : new Date(item.deliveredAt),
    readAt: item.readAt instanceof Date || item.readAt === null ? item.readAt : new Date(item.readAt),
    firstSeenAt:
      item.firstSeenAt instanceof Date || item.firstSeenAt === null
        ? item.firstSeenAt
        : new Date(item.firstSeenAt),
  }));
}
