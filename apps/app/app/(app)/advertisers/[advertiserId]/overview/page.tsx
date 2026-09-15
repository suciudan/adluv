import { notFound } from "next/navigation";
import {
  Activity,
  Building2,
  ExternalLink,
  Globe2,
  Link2,
  Megaphone,
} from "lucide-react";

import { getSourceLabel } from "@adluv/config";

import {
  EmptyState,
  SurfaceCard,
} from "../../../../../components/app-ui";
import { ExpandableDescription } from "../../../../../components/expandable-description";
import { requireAdvertiserDirectoryDetailForRoute, type AdvertiserRouteSearchParams } from "../../../../../lib/advertiser-route";
import { requireWorkspaceContext } from "../../../../../lib/workspace";

type LaunchActivityCell = {
  key: string;
  date: Date;
  isInRange: boolean;
  count: number;
};

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

function formatActivityMonth(value: Date) {
  return value.toLocaleDateString("en-GB", {
    month: "short",
  });
}

function buildLaunchActivityCalendar(timeline: Array<{ date: string; count: number }>, rangeDays = 90) {
  const timelineByDate = new Map(timeline.map((item) => [item.date, item.count]));
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const start = addDays(end, -(rangeDays - 1));
  const gridStart = addDays(start, -((start.getDay() + 6) % 7));
  const cells: LaunchActivityCell[] = [];

  for (let date = gridStart; date <= end; date = addDays(date, 1)) {
    const key = getDayKey(date);

    cells.push({
      key,
      date,
      isInRange: date >= start,
      count: timelineByDate.get(key) ?? 0,
    });
  }

  const activeCells = cells.filter((cell) => cell.isInRange);
  const max = Math.max(1, ...activeCells.map((cell) => cell.count));
  const total = activeCells.reduce((sum, cell) => sum + cell.count, 0);
  const weekCount = Math.ceil(cells.length / 7);
  const monthLabels = Array.from({ length: weekCount }, (_, weekIndex) => {
    const firstInRangeCell = cells.slice(weekIndex * 7, weekIndex * 7 + 7).find((cell) => cell.isInRange);

    if (!firstInRangeCell) {
      return "";
    }

    const previousWeekCell = weekIndex > 0
      ? cells.slice((weekIndex - 1) * 7, (weekIndex - 1) * 7 + 7).find((cell) => cell.isInRange)
      : null;
    const isFirstWeek = !previousWeekCell;
    const isNewMonth = previousWeekCell ? firstInRangeCell.date.getMonth() !== previousWeekCell.date.getMonth() : false;

    return isFirstWeek || isNewMonth ? formatActivityMonth(firstInRangeCell.date) : "";
  });

  return { cells, max, monthLabels, total, weekCount };
}

function getLaunchActivityCellTitle(cell: ReturnType<typeof buildLaunchActivityCalendar>["cells"][number]) {
  return `${formatActivityDate(cell.date)}\n${cell.count} ads`;
}

function getTargetAudienceSignals(advertiser: {
  industry: string | null;
  companySize: string | null;
  summary: string | null;
}) {
  const haystack = `${advertiser.industry ?? ""} ${advertiser.summary ?? ""}`.toLowerCase();

  if (haystack.includes("developer") || haystack.includes("software") || haystack.includes("devops")) {
    return ["Software teams", "Engineering leaders", "Technical buyers"];
  }

  if (haystack.includes("finance") || haystack.includes("payment") || haystack.includes("accounting")) {
    return ["Finance teams", "Operations leaders", "Business owners"];
  }

  if (haystack.includes("marketing") || haystack.includes("sales") || haystack.includes("crm")) {
    return ["Marketing teams", "Sales leaders", "Revenue operators"];
  }

  if (haystack.includes("commerce") || haystack.includes("retail") || haystack.includes("shop")) {
    return ["Ecommerce teams", "Brand marketers", "Growth operators"];
  }

  return [
    advertiser.companySize ? `${advertiser.companySize} companies` : "Business teams",
    advertiser.industry ? `${advertiser.industry} buyers` : "Category buyers",
    "Decision makers",
  ];
}

export default async function AdvertiserOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ advertiserId: string }>;
  searchParams: Promise<AdvertiserRouteSearchParams>;
}) {
  const { user, workspace } = await requireWorkspaceContext();
  const { advertiserId } = await params;
  const advertiser = await requireAdvertiserDirectoryDetailForRoute({
    userId: user.id,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    advertiserId,
    segment: "overview",
    searchParams: await searchParams,
  });

  if (!advertiser) {
    notFound();
  }

  if (!advertiser.totalAds) {
    return (
      <EmptyState
        title="No advertiser overview data yet"
        body="This advertiser exists in the database but has no indexed activity to show yet."
        icon={Building2}
      />
    );
  }

  const launchCalendar = buildLaunchActivityCalendar(advertiser.launchTimeline);
  const landingPages = advertiser.landingPages.slice(0, 5);
  const weekdayLabels = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const activeSources = new Set(
    advertiser.ads
      .filter((ad) => ad.status?.toLowerCase() === "active")
      .map((ad) => ad.source),
  );
  const platformProfiles = advertiser.sources.map((source) => {
    const profiles = advertiser.sourceProfiles.filter((profile) => profile.source === source);
    const profile = profiles.find((item) => item.profileUrl) ?? profiles[0] ?? null;

    return {
      source,
      profileUrl: profile?.profileUrl ?? null,
      isActive: activeSources.has(source),
    };
  });
  const overviewStats = [
    { label: "Total ads", value: advertiser.totalAds },
    { label: "Active ads", value: advertiser.activeAds, valueClassName: "text-emerald-400" },
    { label: "Average engagement", value: advertiser.averageEngagement },
    { label: "Landing pages", value: advertiser.landingPages.length },
  ];
  const targetAudiences = getTargetAudienceSignals(advertiser);

  return (
    <div className="space-y-6">
      <section className="grid min-w-0 gap-6 xl:grid-cols-2 2xl:grid-cols-4">
        <div className="flex min-w-0 flex-col space-y-4 2xl:col-span-2">
          <div className="flex items-center gap-3">
            <span className="app-icon-chip">
              <Building2 size={18} strokeWidth={1.75} />
            </span>
            <h2
              className="text-[28px] leading-[1] tracking-[-0.035em] text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-instrument-serif), serif" }}
            >
              Description
            </h2>
          </div>

          <SurfaceCard className="flex-1 space-y-4 p-4">
            {advertiser.summary ? (
              <ExpandableDescription text={advertiser.summary} />
            ) : (
              <p className="text-[13px] leading-5 text-[var(--text-secondary)]">
                No description is available for this advertiser yet.
              </p>
            )}

            {advertiser.websiteUrl ? (
              <a
                href={advertiser.websiteUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-2 text-[13px] font-medium text-[var(--accent-hover)] transition hover:text-[var(--text-primary)]"
              >
                <Globe2 size={14} strokeWidth={1.75} className="shrink-0" />
                <span className="truncate">{advertiser.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}</span>
              </a>
            ) : null}
          </SurfaceCard>
        </div>

        <div className="flex min-w-0 flex-col space-y-4">
          <div className="flex items-center gap-3">
            <span className="app-icon-chip">
              <Megaphone size={18} strokeWidth={1.75} />
            </span>
            <h2
              className="text-[28px] leading-[1] tracking-[-0.035em] text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-instrument-serif), serif" }}
            >
              Summary
            </h2>
          </div>

          <SurfaceCard className="flex-1 space-y-4 overflow-hidden p-3 sm:space-y-5 sm:p-4">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5">
              {overviewStats.map((stat) => (
                <div key={stat.label} className="min-w-0">
                  <dt className="text-[12px] font-medium leading-4 text-[var(--text-tertiary)]">
                    {stat.label}
                  </dt>
                  <dd className={`mt-1.5 text-2xl font-semibold leading-7 text-[var(--text-primary)] sm:mt-2 sm:text-[28px] sm:leading-8 ${stat.valueClassName ?? ""}`}>
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="border-t border-[var(--border-subtle)] pt-4">
              <p className="mb-3 text-[12px] font-medium leading-4 text-[var(--text-tertiary)]">Platforms</p>

              <div className="grid min-w-0 gap-2 sm:grid-cols-3">
                {platformProfiles.map((profile) => {
                  const content = (
                    <>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {profile.isActive ? (
                            <span
                              aria-label="Active ads running"
                              title="Active ads running"
                              className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]"
                            />
                          ) : null}
                          <p className="min-w-0 truncate text-[14px] font-semibold leading-5 text-[var(--text-primary)]">
                            {getSourceLabel(profile.source)}
                          </p>
                        </div>
                      </div>
                      {profile.profileUrl ? (
                        <ExternalLink size={15} strokeWidth={1.75} className="shrink-0 text-[var(--text-tertiary)]" />
                      ) : null}
                    </>
                  );

                  return profile.profileUrl ? (
                    <a
                      key={`${profile.source}-${profile.profileUrl}`}
                      href={profile.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-2.5 py-2 transition hover:border-violet-500/60 hover:bg-[var(--bg-surface-3)]"
                    >
                      {content}
                    </a>
                  ) : (
                    <div
                      key={profile.source}
                      className="flex min-w-0 items-center justify-between gap-2 overflow-hidden rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-2.5 py-2"
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          </SurfaceCard>
        </div>

        <div className="flex min-w-0 flex-col space-y-4">
          <div className="flex items-center gap-3">
            <span className="app-icon-chip">
              <Activity size={18} strokeWidth={1.75} />
            </span>
            <h2
              className="text-[28px] leading-[1] tracking-[-0.035em] text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-instrument-serif), serif" }}
            >
              90-day activity
            </h2>
          </div>

          <SurfaceCard className="flex flex-1 flex-col p-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[12px] font-medium leading-4 text-[var(--text-tertiary)]">Ad launches</p>
              <p className="text-[12px] leading-4 text-[var(--text-tertiary)]">{launchCalendar.total} ads</p>
            </div>

            <div
              className="mt-4 grid flex-1 gap-1"
              style={{
                gridTemplateColumns: `1.75rem repeat(${launchCalendar.weekCount}, minmax(0, 1fr))`,
                gridTemplateRows: "1rem repeat(7, minmax(0, 1fr))",
              }}
            >
              {launchCalendar.monthLabels.map((label, index) => (
                <span
                  key={`${label}-${index}`}
                  className="truncate text-[10px] leading-4 text-[var(--text-tertiary)]"
                  style={{ gridColumn: index + 2, gridRow: 1 }}
                >
                  {label}
                </span>
              ))}

              {weekdayLabels.map((label, index) => (
                <span
                  key={label}
                  className="flex items-center text-[10px] leading-none text-[var(--text-tertiary)]"
                  style={{ gridColumn: 1, gridRow: index + 2 }}
                >
                  {label}
                </span>
              ))}

              {launchCalendar.cells.map((cell, cellIndex) => {
                const opacity = cell.isInRange && cell.count ? Math.min(0.92, 0.18 + (cell.count / launchCalendar.max) * 0.74) : 0.06;

                return (
                  <span
                    key={cell.key}
                    title={getLaunchActivityCellTitle(cell)}
                    className="block h-full min-h-3 min-w-0 rounded border border-[var(--activity-heatmap-cell-border)]"
                    style={{
                      backgroundColor: cell.isInRange && cell.count ? `rgba(var(--activity-heatmap-active-rgb), ${opacity})` : "var(--activity-heatmap-empty-bg)",
                      gridColumn: Math.floor(cellIndex / 7) + 2,
                      gridRow: (cellIndex % 7) + 2,
                      opacity: cell.isInRange ? 1 : 0.35,
                    }}
                  />
                );
              })}
            </div>
          </SurfaceCard>
        </div>

      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="app-icon-chip">
            <Building2 size={18} strokeWidth={1.75} />
          </span>
          <h2
            className="text-[28px] leading-[1] tracking-[-0.035em] text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-instrument-serif), serif" }}
          >
            Target audience
          </h2>
        </div>
        <SurfaceCard className="p-4">
          <div className="flex flex-wrap gap-2">
            {targetAudiences.map((audience) => (
              <span
                key={audience}
                className="rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-2 text-[13px] font-medium leading-5 text-[var(--text-primary)]"
              >
                {audience}
              </span>
            ))}
          </div>
        </SurfaceCard>
      </section>

      <section className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="app-icon-chip">
              <Link2 size={18} strokeWidth={1.75} />
            </span>
            <h2
              className="text-[28px] leading-[1] tracking-[-0.035em] text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-instrument-serif), serif" }}
            >
              Top landing pages
            </h2>
          </div>
          {landingPages.length ? (
            <div className="overflow-hidden rounded-[18px] border border-[var(--border-subtle)]">
              <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 border-b border-[var(--border-subtle)] bg-[color:var(--bg-surface-3)] px-4 py-3 text-[12px] font-medium leading-4 text-[var(--text-tertiary)]">
                <span>Landing page URL</span>
                <span>Used in ads</span>
              </div>
              {landingPages.map((page) => (
                <div
                  key={page.url}
                  className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 border-b border-[var(--border-subtle)] px-4 py-4 text-[13px] leading-5 text-[var(--text-secondary)] odd:bg-[color:var(--bg-surface-2)] even:bg-[color:var(--bg-surface-1)] last:border-b-0"
                >
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-[var(--text-primary)] transition hover:text-[var(--accent-hover)]"
                  >
                    {page.url}
                  </a>
                  <span>{page.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border border-dashed border-[var(--border-subtle)] px-4 py-8 text-[14px] leading-[22px] text-[var(--text-secondary)]">
              No landing pages have been indexed for this advertiser yet.
            </div>
          )}
        </div>

      </section>
    </div>
  );
}
