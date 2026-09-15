"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";

import {
  getSourceLabel,
  normalizeAdvertiserIndustry,
  normalizeAdvertiserIndustryOptions,
  supportedSourceNames,
  type SourceName,
} from "@adluv/config";
import type { AdvertiserDirectoryResult } from "@adluv/db";

import { AddAdvertiserRequestModal } from "./add-advertiser-request-modal";
import { AdvertiserDirectoryActionButton } from "./advertiser-directory-action-button";
import { EmptyState, Toolbar, ToolbarInput, ToolbarSelect, cn } from "./app-ui";
import { SourceLogo } from "./source-logo";
import { useWorkspaceHref } from "../lib/client-workspace";

type WatchlistFilter = "All" | "Watched" | "Not watched";
type SortFilter = "Most active" | "Most total ads" | "A–Z" | "Last updated";
type SourceFilter = "all" | SourceName;

const pageSizeOptions = [12, 24, 48, 96] as const;

const sortOptions: SortFilter[] = [
  "Most active",
  "Most total ads",
  "A–Z",
  "Last updated",
];

function buildPaginationItems(page: number, pageCount: number) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const normalizedPages = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((left, right) => left - right);
  const items: Array<number | "ellipsis"> = [];

  for (const value of normalizedPages) {
    const previousValue = items.at(-1);

    if (typeof previousValue === "number" && value - previousValue > 1) {
      items.push(value - previousValue === 2 ? previousValue + 1 : "ellipsis");
    }

    items.push(value);
  }

  return items;
}

function parseDate(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatRelativeDate(value: Date | string | null | undefined) {
  const date = parseDate(value);

  if (!date) {
    return "Not available";
  }

  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));

  if (days === 0) {
    return "Today";
  }

  if (days === 1) {
    return "Yesterday";
  }

  return `${days}d ago`;
}

function getAdvertiserInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function AdvertiserSourceIcons({ sources }: { sources: SourceName[] }) {
  return (
    <span className="inline-flex items-center gap-1.5 align-middle whitespace-nowrap">
      <span className="text-[13px] leading-5 text-[var(--text-secondary)]">Active on</span>
      {sources.map((source) => (
        <span key={source} className="inline-flex h-4 w-4 items-center justify-center" title={getSourceLabel(source)}>
          <SourceLogo source={source} className={source === "facebook" ? "h-3 w-5" : "h-4 w-4"} />
        </span>
      ))}
    </span>
  );
}

function AdvertiserMetric({
  label,
  value,
  className,
  valueClassName,
  valueTitle,
}: {
  label: string;
  value: string | number;
  className?: string;
  valueClassName?: string;
  valueTitle?: string;
}) {
  return (
    <div className={cn("min-w-0 border-l border-[var(--border-subtle)]/70 pl-3 first:border-l-0 first:pl-0", className)}>
      <dt className="text-[8px] font-medium uppercase tracking-[0.12em] text-[var(--text-tertiary)] sm:text-[9px]">
        {label}
      </dt>
      <dd
        title={valueTitle}
        className={cn(
          "mt-1.5 text-[12px] font-semibold leading-none tracking-[-0.01em] text-[var(--text-primary)] sm:text-[13px] xl:text-[14px]",
          valueClassName,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function BrowseAdvertisersPage({ result }: { result: AdvertiserDirectoryResult }) {
  const pathname = usePathname();
  const workspaceHref = useWorkspaceHref();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [queryDraft, setQueryDraft] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setQueryDraft(searchParams.get("q") ?? "");
  }, [searchParams]);

  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const industry = normalizeAdvertiserIndustry(searchParams.get("industry")) ?? "";
  const source = (searchParams.get("source") as SourceFilter | null) ?? "all";
  const watchlist = (searchParams.get("watchlist") as WatchlistFilter | null) ?? "All";
  const sort = (searchParams.get("sort") as SortFilter | null) ?? "Most active";
  const requestedPageSize = Number.parseInt(searchParams.get("pageSize") ?? "24", 10);
  const pageSize = pageSizeOptions.includes(requestedPageSize as (typeof pageSizeOptions)[number]) ? requestedPageSize : 24;
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      next.delete(key);

      if (
        !value ||
        (key === "watchlist" && value === "All") ||
        (key === "sort" && value === "Most active") ||
        (key === "pageSize" && value === "24") ||
        (key === "page" && value === "1")
      ) {
        continue;
      }

      next.set(key, value);
    }

    if (updates.page === undefined) {
      next.delete("page");
    }

    const queryString = next.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const filteredAdvertisers = result.advertisers
    .map((advertiser) => ({
      ...advertiser,
      industry: normalizeAdvertiserIndustry(advertiser.industry),
      lastSeenAt: parseDate(advertiser.lastSeenAt),
      lastIndexedAt: parseDate(advertiser.lastIndexedAt),
    }))
    .filter((advertiser) => {
      if (query) {
        const haystack = [advertiser.canonicalName, advertiser.industry ?? ""].join(" ").toLowerCase();

        if (!haystack.includes(query)) {
          return false;
        }
      }

      if (industry && advertiser.industry !== industry) {
        return false;
      }

      if (source !== "all" && !advertiser.sources.includes(source)) {
        return false;
      }

      if (watchlist === "Watched" && !advertiser.trackedCompanyId) {
        return false;
      }

      if (watchlist === "Not watched" && advertiser.trackedCompanyId) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      if (sort === "Most total ads") {
        return right.totalAds - left.totalAds || left.canonicalName.localeCompare(right.canonicalName);
      }

      if (sort === "A–Z") {
        return left.canonicalName.localeCompare(right.canonicalName);
      }

      if (sort === "Last updated") {
        return (right.lastIndexedAt?.getTime() ?? 0) - (left.lastIndexedAt?.getTime() ?? 0);
      }

      return right.activeAds - left.activeAds || right.totalAds - left.totalAds;
    });
  const pageCount = Math.max(1, Math.ceil(filteredAdvertisers.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visibleAdvertisers = filteredAdvertisers.slice(start, start + pageSize);
  const paginationItems = buildPaginationItems(safePage, pageCount);
  const industryOptions = normalizeAdvertiserIndustryOptions(result.availableIndustries);
  const hasActiveFilters = Boolean(
    query ||
    industry ||
    source !== "all" ||
    watchlist !== "All" ||
    sort !== "Most active",
  );
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(hasActiveFilters);

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <Toolbar className="advertiser-filter-toolbar">
          <div className="md:hidden">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen((value) => !value)}
              aria-expanded={mobileFiltersOpen}
              className={cn(
                "app-button app-button-secondary w-full justify-center gap-2",
                mobileFiltersOpen && "border-violet-500/30 bg-violet-950/30 text-violet-50",
              )}
            >
              <SlidersHorizontal size={16} strokeWidth={1.9} />
              Filters
            </button>
          </div>

          <div className={cn("gap-3 md:grid md:grid-cols-2 xl:grid-cols-6", mobileFiltersOpen ? "mt-4 grid md:mt-0" : "hidden")}>
            <form
              className="min-w-0"
              onSubmit={(event) => {
                event.preventDefault();
                updateParams({ q: queryDraft || null });
              }}
            >
              <ToolbarInput
                label="Search company name"
                type="search"
                value={queryDraft}
                onChange={(event) => setQueryDraft(event.target.value)}
                placeholder="Search company name"
                icon={Search}
                wrapperClassName="min-w-0"
              />
            </form>

            <ToolbarSelect
              label="Industry"
              value={industry}
              onChange={(event) => updateParams({ industry: event.target.value || null })}
            >
              <option value="">All industries</option>
              {industryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </ToolbarSelect>

            <ToolbarSelect
              label="Source"
              value={source}
              onChange={(event) => updateParams({ source: event.target.value || null })}
            >
              <option value="all">All sources</option>
              {supportedSourceNames.map((option) => (
                <option key={option} value={option}>
                  {getSourceLabel(option)}
                </option>
              ))}
            </ToolbarSelect>

            <ToolbarSelect
              label="Watchlist"
              value={watchlist}
              onChange={(event) => updateParams({ watchlist: event.target.value })}
            >
              {(["All", "Watched", "Not watched"] as WatchlistFilter[]).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </ToolbarSelect>

            <ToolbarSelect
              label="Sort by"
              value={sort}
              onChange={(event) => updateParams({ sort: event.target.value })}
            >
              {sortOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </ToolbarSelect>

            <ToolbarSelect
              label="Results per page"
              value={String(pageSize)}
              onChange={(event) => updateParams({ pageSize: event.target.value, page: "1" })}
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={String(option)}>
                  {option} per page
                </option>
              ))}
            </ToolbarSelect>
          </div>

          <div className="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[14px] leading-[22px] text-[var(--text-secondary)]">{filteredAdvertisers.length} advertisers found</p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={() => {
                  setQueryDraft("");
                  router.push(pathname);
                }}
                className="app-button app-button-secondary"
              >
                Clear all filters
              </button>
            ) : null}
          </div>
        </Toolbar>
      </section>

      {filteredAdvertisers.length ? (
        <>
          <section className="grid gap-5 xl:grid-cols-3 2xl:grid-cols-4">
            {visibleAdvertisers.map((advertiser) => {
              const advertiserHref = workspaceHref(`/advertisers/${advertiser.id}/overview`);
              const advertiserActionPayload = {
                id: advertiser.id,
                canonicalName: advertiser.canonicalName,
                profileUrl: advertiser.profileUrl,
                websiteUrl: advertiser.websiteUrl,
                industry: advertiser.industry,
                companySize: advertiser.companySize,
                country: advertiser.country,
                summary: advertiser.summary,
              };
              const metadata = [
                advertiser.industry,
                <AdvertiserSourceIcons key="sources" sources={advertiser.sources} />,
              ].filter(Boolean);

              return (
                <article
                  key={advertiser.id}
                  className="group app-surface-card block overflow-hidden p-4 transition duration-150 ease-out hover:!border-violet-500 hover:[background:linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0)),var(--bg-surface-2)] hover:shadow-[0_20px_56px_rgba(76,29,149,0.28)] hover:ring-1 hover:ring-violet-500/60 sm:p-6"
                >
                  <div className="space-y-6">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <Link href={advertiserHref} aria-label={`Open ${advertiser.canonicalName}`} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-app)]">
                        {advertiser.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={advertiser.logoUrl}
                            alt={`${advertiser.canonicalName} logo`}
                            className="h-10 w-10 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] object-cover sm:h-12 sm:w-12"
                          />
                        ) : (
                          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-sm font-semibold text-[var(--text-primary)] sm:h-12 sm:w-12">
                            {getAdvertiserInitials(advertiser.canonicalName)}
                          </span>
                        )}
                      </Link>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <Link
                            href={advertiserHref}
                            className="min-w-0 truncate text-[15px] font-semibold leading-5 text-[var(--text-primary)] transition group-hover:text-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-app)]"
                          >
                            {advertiser.canonicalName}
                          </Link>
                          <AdvertiserDirectoryActionButton
                            advertiser={advertiserActionPayload}
                            trackedCompanyIds={advertiser.trackedCompanyIds}
                          />
                        </div>
                        {metadata.length ? (
                          <p className="text-[13px] leading-5 text-[var(--text-secondary)]">
                            {metadata.map((item, index) => (
                              <span key={index}>
                                {index > 0 ? <span className="px-1.5">·</span> : null}
                                {item}
                              </span>
                            ))}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <dl className="grid grid-cols-3 gap-x-3 border-t border-[var(--border-subtle)] pt-5 sm:gap-x-5">
                      <AdvertiserMetric label="Total ads" value={advertiser.totalAds} />
                      <AdvertiserMetric label="Active ads" value={advertiser.activeAds} valueClassName="text-emerald-400" />
                      <AdvertiserMetric
                        label="Updated"
                        value={formatRelativeDate(advertiser.lastSeenAt)}
                        valueTitle={advertiser.lastSeenAt?.toISOString()}
                      />
                    </dl>
                  </div>
                </article>
              );
            })}

            <article className="flex flex-col justify-between rounded-[24px] border border-dashed border-[var(--border-subtle)] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.01))] p-6 xl:col-span-3 2xl:col-span-4">
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

          {pageCount > 1 ? (
            <section className="flex flex-col gap-4 rounded-[28px] border border-white/8 bg-[rgba(12,10,18,0.4)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => updateParams({ page: String(Math.max(1, safePage - 1)) })}
                className="app-button app-button-secondary"
              >
                Previous
              </button>

              <div className="flex flex-col items-center gap-3">
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {paginationItems.map((item, index) =>
                    item === "ellipsis" ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="inline-flex min-w-10 items-center justify-center px-1 text-sm font-medium text-[var(--text-tertiary)]"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        type="button"
                        onClick={() => updateParams({ page: String(item) })}
                        aria-current={item === safePage ? "page" : undefined}
                        className={cn(
                          "inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-semibold transition",
                          item === safePage
                            ? "border-[rgba(139,92,246,0.4)] bg-[rgba(91,33,182,0.28)] text-[#f5f3ff]"
                            : "border-white/10 bg-[rgba(255,255,255,0.02)] text-[var(--text-secondary)] hover:border-white/20 hover:text-white",
                        )}
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <button
                type="button"
                disabled={safePage >= pageCount}
                onClick={() => updateParams({ page: String(Math.min(pageCount, safePage + 1)) })}
                className="app-button app-button-secondary"
              >
                Next
              </button>
            </section>
          ) : null}
        </>
      ) : (
        <EmptyState
          title={hasActiveFilters ? "No advertisers match these filters" : "No advertisers to show yet"}
          body={
            hasActiveFilters
              ? "Try a broader company search or remove one filter."
              : "Add an advertiser to start building the directory."
          }
          primaryAction={
            hasActiveFilters ? (
              <button
                type="button"
                onClick={() => {
                  setQueryDraft("");
                  router.push(pathname);
                }}
                className="app-button app-button-primary"
              >
                Clear all filters
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
