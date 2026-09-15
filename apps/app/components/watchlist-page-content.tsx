"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, Search, SlidersHorizontal } from "lucide-react";

import type { SourceName } from "@adluv/config";
import type { WatchlistEntry } from "@adluv/db";

import { useWorkspaceHref } from "../lib/client-workspace";
import { AddAdvertiserRequestModal } from "./add-advertiser-request-modal";
import { AdvertiserIdentity } from "./advertiser-identity";
import { AppLinkButton, EmptyState, Toolbar, ToolbarInput, ToolbarSelect, cn } from "./app-ui";
import { WatchlistCardActions } from "./watchlist-card-actions";

type SortFilter = "recent_activity" | "most_active_ads" | "a_z" | "newest_watched";
type DateValue = Date | string | null | undefined;
type WatchlistStatus = WatchlistEntry["status"];
type WatchlistLaunchTimelineItem = WatchlistEntry["launchTimeline"][number];

const sortOptions: Array<{ label: string; value: SortFilter }> = [
  { label: "Recent activity", value: "recent_activity" },
  { label: "Most active ads", value: "most_active_ads" },
  { label: "A–Z", value: "a_z" },
  { label: "Newest watched", value: "newest_watched" },
];

const sourceDisplay: Record<SourceName, { label: string; dotClassName: string }> = {
  facebook: { label: "Meta", dotClassName: "bg-orange-500" },
  google: { label: "Google", dotClassName: "bg-sky-500" },
  linkedin: { label: "LinkedIn", dotClassName: "bg-emerald-500" },
  tiktok: { label: "TikTok", dotClassName: "bg-zinc-300" },
};

const orderedSources: SourceName[] = ["facebook", "google", "linkedin", "tiktok"];

function parseDate(value: DateValue) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRelativeDate(value: DateValue) {
  const date = parseDate(value);

  if (!date) {
    return "No activity yet";
  }

  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));

  if (days === 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  if (days < 7) {
    return `${days} days ago`;
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function formatElapsedDuration(startedAt: DateValue, nowMs = Date.now()) {
  const date = parseDate(startedAt);

  if (!date) {
    return "just now";
  }

  const totalMinutes = Math.max(0, Math.floor((nowMs - date.getTime()) / (60 * 1000)));

  if (totalMinutes < 1) {
    return "less than 1m";
  }

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

function normalizeIdentityText(value: string) {
  return value.toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9]+/g, "");
}

function formatAdvertiserWebsite(value: string | null, advertiserName: string) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    const hostname = url.hostname.replace(/^www\./, "");

    if (!hostname || normalizeIdentityText(hostname) === normalizeIdentityText(advertiserName)) {
      return null;
    }

    return hostname;
  } catch {
    return null;
  }
}

function getDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function formatActivityDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function parseLaunchTimelineDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function countLaunchesSince(timeline: WatchlistLaunchTimelineItem[], start: Date) {
  return timeline.reduce((sum, item) => {
    const date = parseLaunchTimelineDate(item.date);

    return date && date >= start ? sum + item.total : sum;
  }, 0);
}

function buildLaunchActivityCalendar(timeline: WatchlistLaunchTimelineItem[], rangeDays = 90) {
  const timelineByDate = new Map(timeline.map((item) => [item.date, item]));
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const start = addDays(end, -(rangeDays - 1));
  const gridStart = addDays(start, -((start.getDay() + 6) % 7));
  const cells = [];

  for (let date = gridStart; date <= end; date = addDays(date, 1)) {
    const key = getDayKey(date);
    const item = timelineByDate.get(key);

    cells.push({
      key,
      date,
      isInRange: date >= start,
      total: item?.total ?? 0,
      sources: item?.sources ?? {},
    });
  }

  const activeCells = cells.filter((cell) => cell.isInRange);
  const max = Math.max(1, ...activeCells.map((cell) => cell.total));
  const total = activeCells.reduce((sum, cell) => sum + cell.total, 0);
  const sourceTotals = activeCells.reduce(
    (acc, cell) => {
      for (const [source, count] of Object.entries(cell.sources) as Array<[SourceName, number]>) {
        acc[source] = (acc[source] ?? 0) + count;
      }

      return acc;
    },
    {} as Partial<Record<SourceName, number>>,
  );

  return { cells, max, total, sourceTotals };
}

function getLaunchActivityCellTitle(cell: ReturnType<typeof buildLaunchActivityCalendar>["cells"][number]) {
  const lines = [
    formatActivityDate(cell.date),
    ...orderedSources
      .filter((source) => cell.sources[source] || source !== "tiktok")
      .map((source) => `${sourceDisplay[source].label}: ${cell.sources[source] ?? 0}`),
    `Total: ${cell.total} ads`,
  ];

  return lines.join("\n");
}

function WatchlistLaunchActivity({ timeline }: { timeline: WatchlistLaunchTimelineItem[] }) {
  const calendar = buildLaunchActivityCalendar(timeline);
  const visibleSourceTotals = orderedSources.filter((source) => calendar.sourceTotals[source]);

  return (
    <div className="mt-5 w-fit max-w-full rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[12px] font-medium leading-4 text-[var(--text-tertiary)]">90-day activity</p>
        <p className="text-[12px] leading-4 text-[var(--text-tertiary)]">{calendar.total} ads</p>
      </div>

      <div className="mt-4 flex max-w-full gap-2 overflow-x-auto">
        <div className="hidden shrink-0 grid-rows-7 gap-1 text-[10px] leading-5 text-[var(--text-tertiary)] sm:grid">
          <span>Mon</span>
          <span />
          <span>Wed</span>
          <span />
          <span>Fri</span>
          <span />
          <span>Sun</span>
        </div>

        <div className="grid min-w-max grid-flow-col grid-rows-7 gap-1">
          {calendar.cells.map((cell) => {
            const opacity = cell.isInRange && cell.total ? Math.min(0.92, 0.18 + (cell.total / calendar.max) * 0.74) : 0.06;

            return (
              <span
                key={cell.key}
                title={getLaunchActivityCellTitle(cell)}
                className="block h-5 w-5 rounded border border-[var(--activity-heatmap-cell-border)]"
                style={{
                  backgroundColor: cell.isInRange && cell.total ? `rgba(var(--activity-heatmap-active-rgb), ${opacity})` : "var(--activity-heatmap-empty-bg)",
                  opacity: cell.isInRange ? 1 : 0.35,
                }}
              />
            );
          })}
        </div>
      </div>

      {visibleSourceTotals.length ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {visibleSourceTotals.map((source) => (
            <span key={source} className="inline-flex items-center gap-2 text-[12px] leading-4 text-[var(--text-secondary)]">
              <span className={cn("h-2 w-2 rounded-full", sourceDisplay[source].dotClassName)} />
              <span>{sourceDisplay[source].label}</span>
              <span className="font-medium text-[var(--text-primary)]">{calendar.sourceTotals[source]}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function getWatchlistStatusMeta(status: WatchlistStatus) {
  switch (status) {
    case "pending_initial_index":
      return {
        className: "app-pill-warning",
        label: "Scanning",
        title: "Initial ad collection is queued or running.",
      };
    case "retryable_error":
      return {
        className: "app-pill-danger",
        label: "Needs attention",
        title: "The last update failed. Open the advertiser actions to retry.",
      };
    case "paused":
      return {
        className: "app-pill-default",
        label: "Paused",
        title: "Automatic updates are paused for this advertiser.",
      };
    default:
      return null;
  }
}

function WatchlistMetric({
  label,
  value,
  valueClassName,
  valueTitle,
}: {
  label: string;
  value: string | number;
  valueClassName?: string;
  valueTitle?: string;
}) {
  return (
    <div className="min-w-0 border-l border-[var(--border-subtle)]/70 pl-3 first:border-l-0 first:pl-0">
      <dt className="text-[9px] font-medium uppercase tracking-widest text-[var(--text-tertiary)]">
        {label}
      </dt>
      <dd
        title={valueTitle}
        className={cn("mt-1.5 text-[14px] font-semibold leading-none text-[var(--text-primary)]", valueClassName)}
      >
        {value}
      </dd>
    </div>
  );
}

export function WatchlistPageContent({
  entries,
}: {
  entries: WatchlistEntry[];
}) {
  const pathname = usePathname();
  const workspaceHref = useWorkspaceHref();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [queryDraft, setQueryDraft] = useState(searchParams.get("q") ?? "");
  const hasPendingEntries = entries.some((entry) => entry.status === "pending_initial_index");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setQueryDraft(searchParams.get("q") ?? "");
  }, [searchParams]);

  useEffect(() => {
    if (!hasPendingEntries) {
      return;
    }

    const intervalId = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(intervalId);
  }, [hasPendingEntries]);

  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const sort = (searchParams.get("sort") as SortFilter | null) ?? "recent_activity";

  const now = new Date();
  const monthStart = new Date(now);
  monthStart.setHours(0, 0, 0, 0);
  monthStart.setDate(monthStart.getDate() - 29);
  const normalizedEntries = entries.map((entry) => ({
    ...entry,
    lastSeenAt: parseDate(entry.lastSeenAt),
    lastSyncedAt: parseDate(entry.lastSyncedAt),
    createdAt: parseDate(entry.createdAt) ?? new Date(0),
  }));
  const records = normalizedEntries
    .map((entry) => {
      const recentLaunches = countLaunchesSince(entry.launchTimeline, monthStart);
      const updatedAt = entry.lastSeenAt ?? entry.lastSyncedAt;

      return {
        ...entry,
        newAdsDetected: recentLaunches,
        recentActivity: recentLaunches,
        updatedAt,
      };
    })
    .filter((entry) => {
      if (!query) {
        return true;
      }

      const haystack = [entry.advertiserName, entry.industry ?? "", entry.country ?? "", entry.companySize ?? ""]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    })
    .sort((left, right) => {
      if (sort === "most_active_ads") {
        return right.activeAds - left.activeAds || right.recentActivity - left.recentActivity;
      }

      if (sort === "a_z") {
        return left.advertiserName.localeCompare(right.advertiserName);
      }

      if (sort === "newest_watched") {
        return right.createdAt.getTime() - left.createdAt.getTime();
      }

      if (left.status === "pending_initial_index" || right.status === "pending_initial_index") {
        if (left.status === right.status) {
          return right.createdAt.getTime() - left.createdAt.getTime();
        }

        return left.status === "pending_initial_index" ? -1 : 1;
      }

      return (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0);
    });

  const hasActiveFilters = Boolean(query || sort !== "recent_activity");
  const [filtersOpen, setFiltersOpen] = useState(hasActiveFilters);

  return (
    <div className="space-y-6">
      {normalizedEntries.length ? (
        <>
          <section className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((value) => !value)}
                  className={cn(
                    "app-button app-button-secondary gap-2",
                    filtersOpen && "border-[rgba(139,92,246,0.3)] bg-[rgba(91,33,182,0.18)] text-[#f5f3ff]",
                  )}
                >
                  <SlidersHorizontal size={16} strokeWidth={1.9} />
                  Filters
                </button>

                <p className="text-[14px] leading-[22px] text-[var(--text-secondary)]">{records.length} advertisers found</p>
              </div>
            </div>

            {filtersOpen ? (
              <Toolbar>
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)_auto]">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const next = new URLSearchParams(searchParams.toString());
                      if (queryDraft.trim()) {
                        next.set("q", queryDraft.trim());
                      } else {
                        next.delete("q");
                      }
                      const queryString = next.toString();
                      router.push(queryString ? `${pathname}?${queryString}` : pathname);
                    }}
                    className="min-w-0"
                  >
                    <ToolbarInput
                      label="Search watched advertisers"
                      type="search"
                      value={queryDraft}
                      onChange={(event) => setQueryDraft(event.target.value)}
                      placeholder="Search watched advertisers"
                      className="min-w-0"
                      icon={Search}
                    />
                  </form>

                  <ToolbarSelect
                    label="Sort by"
                    value={sort}
                    onChange={(event) => {
                      const next = new URLSearchParams(searchParams.toString());
                      if (event.target.value === "recent_activity") {
                        next.delete("sort");
                      } else {
                        next.set("sort", event.target.value);
                      }
                      const queryString = next.toString();
                      router.push(queryString ? `${pathname}?${queryString}` : pathname);
                    }}
                  >
                    {sortOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </ToolbarSelect>

                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setQueryDraft("");
                        router.push(pathname);
                      }}
                      className="app-button app-button-secondary"
                    >
                      Clear filters
                    </button>
                  </div>
                </div>
              </Toolbar>
            ) : null}
          </section>

          <section className="grid gap-5 xl:grid-cols-3">
            {records.map((entry) => {
              const metadata = [formatAdvertiserWebsite(entry.websiteUrl, entry.advertiserName)].filter(Boolean);
              const statusMeta = getWatchlistStatusMeta(entry.status);
              const isScanning = entry.status === "pending_initial_index";
              const scanningDuration = formatElapsedDuration(entry.createdAt, nowMs);

              return (
                <article
                  key={entry.advertiserId}
                  className="group app-surface-card relative overflow-hidden p-4 transition duration-150 ease-out hover:!border-violet-500 hover:[background:linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0)),var(--bg-surface-2)] hover:shadow-[0_20px_56px_rgba(76,29,149,0.28)] hover:ring-1 hover:ring-violet-500/60 sm:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-3">
                      <AdvertiserIdentity
                        name={entry.advertiserName}
                        href={workspaceHref(`/advertisers/${entry.advertiserId}/overview`)}
                        logoUrl={entry.advertiserLogoUrl}
                        metadata={metadata}
                        className="flex items-start gap-4"
                        titleAction={
                          <WatchlistCardActions
                            advertiserId={entry.advertiserId}
                            advertiserName={entry.advertiserName}
                          />
                        }
                      />

                    </div>

                    {statusMeta ? (
                      <span className={cn("app-pill", statusMeta.className)} title={statusMeta.title}>
                        {statusMeta.label}
                      </span>
                    ) : null}
                  </div>

                  {isScanning ? (
                    <div className="mt-5 rounded-[18px] border border-[var(--pill-warning-border)] bg-[var(--pill-warning-bg)] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <LoaderCircle size={16} strokeWidth={1.9} className="shrink-0 animate-spin text-[var(--warning)]" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold leading-5 text-[var(--text-primary)]">Scanning ad libraries</p>
                          <p className="text-[12px] leading-5 text-[var(--text-secondary)]">
                            Added {scanningDuration} ago. Ads will appear here as soon as the first scrape finishes.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <dl className="mt-5 grid grid-cols-3 gap-x-3 border-t border-[var(--border-subtle)] pt-5 sm:gap-x-5">
                    <WatchlistMetric label="Total ads" value={entry.totalAds} />
                    <WatchlistMetric label="Active ads" value={entry.activeAds} valueClassName="text-emerald-400" />
                    <WatchlistMetric
                      label={isScanning ? "Scanning for" : "Updated"}
                      value={isScanning ? scanningDuration : formatRelativeDate(entry.updatedAt)}
                      valueTitle={isScanning ? entry.createdAt.toISOString() : entry.updatedAt?.toISOString()}
                    />
                  </dl>

                  <WatchlistLaunchActivity timeline={entry.launchTimeline} />
                </article>
              );
            })}
          </section>
        </>
      ) : (
        <EmptyState
          title="Your watchlist is empty"
          body="Add advertisers to start tracking launches, creatives, and landing pages."
          primaryAction={<AppLinkButton href={workspaceHref("/advertisers")} variant="primary">Browse advertisers</AppLinkButton>}
          secondaryAction={<AppLinkButton href={workspaceHref("/ads")} variant="secondary">Browse ads</AppLinkButton>}
        />
      )}

      <section>
        <article className="flex flex-col justify-between rounded-[24px] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-6">
          <div>
            <h2 className="text-[24px] font-semibold leading-[30px] text-[var(--text-primary)]">
              Can’t find a company?
            </h2>
            <p className="mt-4 max-w-md text-[14px] leading-[22px] text-[var(--text-secondary)]">
              Search AdLuv and the supported public ad networks, then add the right advertiser and
              start indexing it in the background.
            </p>
          </div>

          <div className="mt-8">
            <AddAdvertiserRequestModal />
          </div>
        </article>
      </section>
    </div>
  );
}
