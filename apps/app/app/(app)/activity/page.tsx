import Link from "next/link";
import {
  Activity,
  ChevronDown,
  LoaderCircle,
} from "lucide-react";

import { getSourceLabel } from "@adluv/config";
import { listActivityFeed, markActivityNotificationsRead, type ActivityFeedItem } from "@adluv/db";

import { ActivityFeedSaveButton } from "../../../components/activity-feed-actions";
import { EmptyState, SurfaceCard } from "../../../components/app-ui";
import { CreativeAssetMedia } from "../../../components/creative-asset-media";
import { SourceLogo } from "../../../components/source-logo";
import { getAdFormatLabel } from "../../../lib/ad-format";
import { buildWorkspaceHref, requireWorkspaceContext } from "../../../lib/workspace";

type SearchParams = Record<string, string | string[] | undefined>;
type ActivityFilter = "all" | "new_ads" | "multiple_launches" | "engagement_gains" | "landing_pages";
type RangeFilter = "7" | "30" | "90";
type PreviewFilter = "all" | "with_preview" | "without_preview";
type SortFilter = "newest" | "oldest" | "advertiser" | "largest_group";
type DisplayActivityKind = Exclude<ActivityFilter, "all">;

type DisplayFeedGroup = {
  id: string;
  dayKey: string;
  kind: DisplayActivityKind;
  occurredAt: Date;
  advertiserId: string;
  advertiserName: string;
  trackedCompanyId: string;
  primaryItem: ActivityFeedItem;
  items: ActivityFeedItem[];
  count: number;
  previewCount: number;
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getRangeDays(range: RangeFilter) {
  return Number(range);
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function getCurrentRangeStart(range: RangeFilter) {
  return addDays(startOfDay(new Date()), -getRangeDays(range) + 1);
}

function getDayKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatExactDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDayHeading(dayKey: string) {
  const date = new Date(`${dayKey}T00:00:00`);
  const todayKey = getDayKey(new Date());
  const yesterdayKey = getDayKey(addDays(new Date(), -1));

  if (dayKey === todayKey) {
    return {
      label: "Today",
      detail: formatExactDate(date),
    };
  }

  if (dayKey === yesterdayKey) {
    return {
      label: "Yesterday",
      detail: formatExactDate(date),
    };
  }

  return {
    label: date.toLocaleDateString("en-GB", { weekday: "long" }),
    detail: formatExactDate(date),
  };
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function getRelativeFirstSeenLabel(date: Date) {
  const todayKey = getDayKey(new Date());
  const yesterdayKey = getDayKey(addDays(new Date(), -1));
  const valueKey = getDayKey(date);

  if (valueKey === todayKey) {
    return "First seen today";
  }

  if (valueKey === yesterdayKey) {
    return "First seen yesterday";
  }

  return `First seen ${formatShortDate(date)}`;
}

function getActivityKind(item: ActivityFeedItem): DisplayActivityKind {
  const lowerHeadline = item.headline.toLowerCase();
  const lowerSummary = item.summary.toLowerCase();

  if (
    lowerHeadline.includes("landing page") ||
    lowerSummary.includes("landing page") ||
    lowerSummary.includes("landing-page")
  ) {
    return "landing_pages";
  }

  if (item.kind === "engagement_spike") {
    return "engagement_gains";
  }

  return "new_ads";
}

function hasPreview(item: ActivityFeedItem) {
  return Boolean(item.screenshotUrl || item.adMediaUrl);
}

function isPreviewPreparing(item: ActivityFeedItem) {
  const hoursSinceSeen = (Date.now() - item.occurredAt.getTime()) / 3_600_000;
  return hoursSinceSeen >= 0 && hoursSinceSeen <= 12;
}

function getPreviewStatus(item: ActivityFeedItem) {
  if (hasPreview(item)) {
    return "Preview ready";
  }

  if (isPreviewPreparing(item)) {
    return "Preparing preview";
  }

  if (item.snapshotUrl || item.adDestinationUrl) {
    return "Preview capture queued";
  }

  return "Preview pending";
}

function normalizeQueryText(value: string) {
  return value.trim().toLowerCase();
}

function matchesQuery(item: ActivityFeedItem, query: string) {
  if (!query) {
    return true;
  }

  const haystack = [
    item.advertiserName,
    item.headline,
    item.summary,
    item.adTitle ?? "",
    item.adBody ?? "",
    item.adCallToAction ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function matchesCta(item: ActivityFeedItem, cta: string) {
  if (!cta) {
    return true;
  }

  if (cta === "__missing__") {
    return !item.adCallToAction;
  }

  return item.adCallToAction === cta;
}

function matchesPreview(item: ActivityFeedItem, preview: PreviewFilter) {
  if (preview === "all") {
    return true;
  }

  return preview === "with_preview" ? hasPreview(item) : !hasPreview(item);
}

function buildDisplayFeedGroups(items: ActivityFeedItem[]) {
  const grouped = new Map<string, ActivityFeedItem[]>();

  for (const item of items.filter((entry) => entry.kind !== "launch_burst")) {
    const baseKind = getActivityKind(item);
    const groupKey = `${getDayKey(item.occurredAt)}:${item.advertiserId}:${baseKind}`;
    const existing = grouped.get(groupKey);

    if (existing) {
      existing.push(item);
      continue;
    }

    grouped.set(groupKey, [item]);
  }

  return Array.from(grouped.entries())
    .map(([groupKey, groupItems]) => {
      const itemsByTime = [...groupItems].sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
      const primaryItem = itemsByTime[0];
      const baseKind = getActivityKind(primaryItem);
      const kind = baseKind === "new_ads" && itemsByTime.length > 1 ? "multiple_launches" : baseKind;

      return {
        id: `${kind}:${groupKey}`,
        dayKey: getDayKey(primaryItem.occurredAt),
        kind,
        occurredAt: primaryItem.occurredAt,
        advertiserId: primaryItem.advertiserId,
        advertiserName: primaryItem.advertiserName,
        trackedCompanyId: primaryItem.trackedCompanyId,
        primaryItem,
        items: itemsByTime,
        count: itemsByTime.length,
        previewCount: itemsByTime.filter(hasPreview).length,
      } satisfies DisplayFeedGroup;
    })
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
}

function matchesGroupQuery(group: DisplayFeedGroup, query: string) {
  return group.items.some((item) => matchesQuery(item, query));
}

function matchesGroupCta(group: DisplayFeedGroup, cta: string) {
  return group.items.some((item) => matchesCta(item, cta));
}

function matchesGroupPreview(group: DisplayFeedGroup, preview: PreviewFilter) {
  if (preview === "all") {
    return true;
  }

  return preview === "with_preview" ? group.previewCount > 0 : group.previewCount === 0;
}

function sortGroups(groups: DisplayFeedGroup[], sort: SortFilter) {
  const next = [...groups];

  next.sort((left, right) => {
    if (sort === "oldest") {
      return left.occurredAt.getTime() - right.occurredAt.getTime();
    }

    if (sort === "advertiser") {
      return (
        left.advertiserName.localeCompare(right.advertiserName) ||
        right.occurredAt.getTime() - left.occurredAt.getTime()
      );
    }

    if (sort === "largest_group") {
      return right.count - left.count || right.occurredAt.getTime() - left.occurredAt.getTime();
    }

    return right.occurredAt.getTime() - left.occurredAt.getTime();
  });

  return next;
}

function getBucketPhrase(dayKey: string) {
  const todayKey = getDayKey(new Date());
  const yesterdayKey = getDayKey(addDays(new Date(), -1));

  if (dayKey === todayKey) {
    return "today";
  }

  if (dayKey === yesterdayKey) {
    return "yesterday";
  }

  return `on ${formatShortDate(new Date(`${dayKey}T00:00:00`))}`;
}

function getBucketLabel(dayKey: string) {
  const todayKey = getDayKey(new Date());
  const yesterdayKey = getDayKey(addDays(new Date(), -1));

  if (dayKey === todayKey) {
    return "today";
  }

  if (dayKey === yesterdayKey) {
    return "yesterday";
  }

  return formatShortDate(new Date(`${dayKey}T00:00:00`));
}

function getLaunchDatePhrase(dayKey: string) {
  const label = getBucketLabel(dayKey);
  return label === "today" || label === "yesterday" ? label : `on ${label}`;
}

function SourceBadge({ source }: { source: ActivityFeedItem["source"] }) {
  const label = getSourceLabel(source);

  return (
    <span className="inline-flex h-8 w-8 items-center justify-center align-middle" title={label} aria-label={label}>
      <SourceLogo source={source} className={source === "facebook" ? "h-5 w-7 shrink-0" : "h-6 w-6 shrink-0"} />
    </span>
  );
}

function getGroupTitle(group: DisplayFeedGroup) {
  if (group.kind === "multiple_launches") {
    return `Launched ${group.count} ads ${getLaunchDatePhrase(group.dayKey)}`;
  }

  if (group.kind === "landing_pages") {
    return group.count > 1
      ? `${group.advertiserName} added ${group.count} landing pages ${getBucketPhrase(group.dayKey)}`
      : `New landing page from ${group.advertiserName}`;
  }

  if (group.kind === "engagement_gains") {
    return group.count > 1
      ? `${group.advertiserName} had ${group.count} ads gain traction ${getBucketPhrase(group.dayKey)}`
      : `Ad from ${group.advertiserName} gained engagement`;
  }

  return `New ad from ${group.advertiserName}`;
}

function getGroupMeta(group: DisplayFeedGroup) {
  const item = group.primaryItem;
  const parts: string[] = [];

  if (group.kind === "landing_pages") {
    parts.push(group.count > 1 ? `${group.count} destinations captured` : "Destination captured");
  } else if (group.count === 1) {
    if (item.adFormat) {
      parts.push(getAdFormatLabel(item.adFormat));
    } else {
      parts.push("Format pending");
    }
  }

  if (group.kind === "engagement_gains" || item.reactionCount > 0 || item.commentCount > 0) {
    const engagementBits = [];

    if (item.reactionCount > 0) {
      engagementBits.push(`${item.reactionCount} reactions`);
    }

    if (item.commentCount > 0) {
      engagementBits.push(`${item.commentCount} comments`);
    }

    if (engagementBits.length) {
      parts.push(engagementBits.join(" · "));
    }
  }

  return parts;
}

function getChildMeta(item: ActivityFeedItem) {
  const parts = [getRelativeFirstSeenLabel(item.occurredAt)];

  if (item.adFormat) {
    parts.push(getAdFormatLabel(item.adFormat));
  }

  if (item.adCallToAction) {
    parts.push(item.adCallToAction);
  } else {
    parts.push("CTA not detected");
  }

  if (item.reactionCount > 0) {
    parts.push(`${item.reactionCount} reactions`);
  }

  if (item.commentCount > 0) {
    parts.push(`${item.commentCount} comments`);
  }

  return parts;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getLoadMoreHref(searchParams: URLSearchParams, visible: number) {
  const next = new URLSearchParams(searchParams.toString());
  next.set("visible", String(visible));
  const query = next.toString();
  return query ? `/activity?${query}` : "/activity";
}

function getSpotlightItem(group: DisplayFeedGroup) {
  return group.items.find((candidate) => hasPreview(candidate)) ?? group.primaryItem;
}

function ActivityBurstPreviewTile({ item, workspaceSlug }: { item: ActivityFeedItem; workspaceSlug: string }) {
  const previewSource = item.adMediaUrl ?? item.screenshotUrl;
  const previewStatus = getPreviewStatus(item);

  return (
    <article className="w-[220px] shrink-0 overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)]">
      <div className="aspect-[4/5] overflow-hidden border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        {previewSource ? (
          <CreativeAssetMedia
            src={previewSource}
            alt={item.adTitle ?? item.headline}
            controls={previewSource === item.adMediaUrl}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--bg-surface-2)] px-4 text-center">
            <LoaderCircle size={24} strokeWidth={1.8} className="animate-spin text-violet-400" />
            <p className="text-[12px] font-medium leading-5 text-[var(--text-secondary)]">{previewStatus}</p>
          </div>
        )}
      </div>
      <div className="space-y-2 px-3 py-3">
        <p className="truncate text-[14px] font-semibold leading-5 text-[var(--text-primary)]">
          {item.adTitle ?? "Ad creative"}
        </p>
        <p className="line-clamp-2 text-[12px] leading-5 text-[var(--text-secondary)]">{item.adBody ?? item.headline}</p>
        <p className="text-[11px] leading-4 text-[var(--text-tertiary)]">{getChildMeta(item).join(" · ")}</p>
        <div className="flex items-center justify-between gap-2 pt-1">
          <Link href={buildWorkspaceHref(workspaceSlug, `/ads/${item.adId}`)} className="app-button app-button-secondary h-8 px-3 text-[12px] font-medium">
            Open ad
          </Link>
          <ActivityFeedSaveButton
            adId={item.adId}
            initialSaved={item.isSaved}
            idleLabel="Save"
            className="app-button app-button-ghost h-8 px-3 text-[12px] font-medium"
          />
        </div>
      </div>
    </article>
  );
}

function ActivityGroupRow({ group, workspaceSlug }: { group: DisplayFeedGroup; workspaceSlug: string }) {
  const item = getSpotlightItem(group);
  const meta = getGroupMeta(group);
  const sourceLabels = Array.from(new Set(group.items.map((entry) => entry.source)));

  return (
    <SurfaceCard className="overflow-hidden p-0">
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {item.advertiserLogoUrl ? (
              <img
                src={item.advertiserLogoUrl}
                alt={`${group.advertiserName} logo`}
                className="h-11 w-11 shrink-0 rounded-full border border-[var(--border-subtle)] bg-white object-contain p-1"
              />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[13px] font-semibold text-[var(--text-primary)]">
                {getInitials(group.advertiserName)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold leading-6 text-[var(--text-primary)]">{group.advertiserName}</p>
            </div>
          </div>

          <h3 className="mt-4 text-[22px] font-semibold leading-[1.1] tracking-[-0.03em] text-[var(--text-primary)]">
            {group.kind === "multiple_launches" ? (
              <span className="flex flex-wrap items-center gap-2">
                <span>{getGroupTitle(group)}</span>
                <span className="text-[var(--text-primary)]">on</span>
                {sourceLabels.map((source) => (
                  <SourceBadge key={source} source={source} />
                ))}
              </span>
            ) : (
              getGroupTitle(group)
            )}
          </h3>
          {meta.length ? <p className="mt-2 text-[14px] leading-6 text-[var(--text-secondary)]">{meta.join(" · ")}</p> : null}
        </div>
      </div>

      <details className="border-t border-[var(--border-subtle)] px-5 py-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-medium text-[var(--accent-hover)] transition hover:text-[var(--text-primary)] [&::-webkit-details-marker]:hidden">
          <span>{group.count > 1 ? `View ${group.count} ads` : "View ad"}</span>
          <ChevronDown size={16} strokeWidth={1.75} />
        </summary>
        <div className="mt-4 space-y-4">
          <div className="app-scrollbar flex gap-3 overflow-x-auto pb-2">
            {group.items.map((child) => (
              <ActivityBurstPreviewTile key={child.id} item={child} workspaceSlug={workspaceSlug} />
            ))}
          </div>
        </div>
      </details>
    </SurfaceCard>
  );
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { user, workspace } = await requireWorkspaceContext();
  const params = await searchParams;
  const query = normalizeQueryText(getSingleValue(params.q) ?? "");
  const type = ((getSingleValue(params.type) as ActivityFilter | undefined) ?? "all");
  const range = ((getSingleValue(params.range) as RangeFilter | undefined) ?? "30");
  const advertiser = getSingleValue(params.advertiser) ?? "";
  const cta = getSingleValue(params.cta) ?? "";
  const preview = ((getSingleValue(params.preview) as PreviewFilter | undefined) ?? "all");
  const sort = ((getSingleValue(params.sort) as SortFilter | undefined) ?? "newest");
  const visibleCount = Number.parseInt(getSingleValue(params.visible) ?? "18", 10) || 18;

  const [feed] = await Promise.all([
    listActivityFeed(user.id, 180, workspace.id),
    markActivityNotificationsRead(user.id, workspace.id),
  ]);

  if (!feed.length) {
    return (
      <div className="space-y-5">
        <EmptyState
          title="Your activity feed is empty"
          body="Add advertisers to your watchlist to see new ads, grouped launch bursts, engagement gains, and landing-page changes here."
          icon={Activity}
        />
      </div>
    );
  }

  const currentRangeStart = getCurrentRangeStart(range);
  const currentParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    const single = getSingleValue(value);

    if (single) {
      currentParams.set(key, single);
    }
  }

  const currentScopedRawItems = feed.filter((item) => {
    if (item.occurredAt < currentRangeStart) {
      return false;
    }

    if (advertiser && item.advertiserId !== advertiser) {
      return false;
    }

    if (!matchesQuery(item, query)) {
      return false;
    }

    if (!matchesCta(item, cta)) {
      return false;
    }

    if (!matchesPreview(item, preview)) {
      return false;
    }

    return true;
  });

  const currentGroups = buildDisplayFeedGroups(currentScopedRawItems);

  const filteredGroups = sortGroups(
    currentGroups.filter((group) => {
      if (type !== "all" && group.kind !== type) {
        return false;
      }

      if (advertiser && group.advertiserId !== advertiser) {
        return false;
      }

      if (!matchesGroupQuery(group, query)) {
        return false;
      }

      if (!matchesGroupCta(group, cta)) {
        return false;
      }

      if (!matchesGroupPreview(group, preview)) {
        return false;
      }

      return true;
    }),
    sort,
  );

  const visibleGroups = filteredGroups.slice(0, visibleCount);
  const groupedByDay = Array.from(
    visibleGroups.reduce((acc, group) => {
      const existing = acc.get(group.dayKey);

      if (existing) {
        existing.push(group);
        return acc;
      }

      acc.set(group.dayKey, [group]);
      return acc;
    }, new Map<string, DisplayFeedGroup[]>()),
  );

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <p className="text-[15px] leading-7 text-[var(--text-secondary)]">
          Track recent activity from advertisers in your watchlist.
        </p>
      </section>

      {filteredGroups.length ? (
        <>
          <section className="space-y-8">
            {groupedByDay.map(([dayKey, groups]) => {
              const heading = formatDayHeading(dayKey);

              return (
                <div key={dayKey} className="space-y-4">
                  <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
                    <div>
                      <h2 className="text-[18px] font-semibold leading-6 tracking-[-0.02em] text-[var(--text-primary)]">
                        {heading.label}
                      </h2>
                      <p className="mt-1 text-[14px] leading-6 text-[var(--text-secondary)]">{heading.detail}</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {groups.map((group) => (
                      <ActivityGroupRow key={group.id} group={group} workspaceSlug={workspace.slug} />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

          {filteredGroups.length > visibleCount ? (
            <section className="flex justify-center pt-2">
              <Link href={getLoadMoreHref(currentParams, visibleCount + 12)} className="app-button app-button-secondary">
                Load older activity
              </Link>
            </section>
          ) : null}
        </>
      ) : (
        <EmptyState
          title="No activity matches these filters"
          body="Adjust the feed toolbar to widen the scope or remove one of the local filters."
          icon={Activity}
        />
      )}
    </div>
  );
}
