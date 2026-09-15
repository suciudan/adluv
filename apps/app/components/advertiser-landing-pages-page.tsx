"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ExternalLink, Link2, Search } from "lucide-react";

import type { SourceName } from "@adluv/config";

import { useWorkspaceHref } from "../lib/client-workspace";
import { cn, DetailField, Pill, StatCard, SurfaceCard, Toolbar, ToolbarInput, ToolbarSelect } from "./app-ui";
import { AdDetailUrlField } from "./ad-detail-url-field";

type AdvertiserLandingPage = {
  url: string;
  title: string | null;
  source: SourceName;
  count: number;
  activeAdsCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  screenshotUrl: string | null;
  status: "active" | "inactive";
};

type SortFilter = "most_used" | "newest" | "oldest" | "active_first";
type ViewMode = "grid" | "list";
const placeholderLandingPageTitle = "Placeholder landing page capture";

const sortOptions: Array<{ label: string; value: SortFilter }> = [
  { label: "Most used", value: "most_used" },
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "Active first", value: "active_first" },
];

function formatDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function trimUrl(url: string) {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function getLandingPageTitle(page: Pick<AdvertiserLandingPage, "title" | "url">) {
  const title = page.title?.trim();

  return title && title !== placeholderLandingPageTitle ? title : trimUrl(page.url);
}

export function AdvertiserLandingPagesPage({
  advertiserId,
  advertiserName,
  landingPages,
}: {
  advertiserId: string;
  advertiserName: string;
  landingPages: AdvertiserLandingPage[];
}) {
  const pathname = usePathname();
  const workspaceHref = useWorkspaceHref();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [queryDraft, setQueryDraft] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setQueryDraft(searchParams.get("q") ?? "");
  }, [searchParams]);

  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const sort = (searchParams.get("sort") as SortFilter | null) ?? "most_used";
  const view = (searchParams.get("view") as ViewMode | null) ?? "grid";

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (!value || (key === "sort" && value === "most_used") || (key === "view" && value === "grid")) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    const queryString = next.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const filteredPages = landingPages
    .filter((page) => {
      if (!query) {
        return true;
      }

      const haystack = `${getLandingPageTitle(page)} ${page.url}`.toLowerCase();
      return haystack.includes(query);
    })
    .sort((left, right) => {
      if (sort === "newest") {
        return right.firstSeenAt.getTime() - left.firstSeenAt.getTime();
      }

      if (sort === "oldest") {
        return left.firstSeenAt.getTime() - right.firstSeenAt.getTime();
      }

      if (sort === "active_first") {
        return right.activeAdsCount - left.activeAdsCount || right.count - left.count;
      }

      return right.count - left.count || right.firstSeenAt.getTime() - left.firstSeenAt.getTime();
    });

  const newestPage = [...landingPages].sort((left, right) => right.firstSeenAt.getTime() - left.firstSeenAt.getTime())[0] ?? null;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard icon={Link2} label="Total landing pages" value={landingPages.length} />
        <StatCard
          icon={Link2}
          label="Used in active ads"
          value={landingPages.filter((page) => page.activeAdsCount > 0).length}
        />
        <StatCard icon={ExternalLink} label="Newest page detected" value={newestPage ? formatDate(newestPage.firstSeenAt) : "None yet"} />
      </section>

      <Toolbar>
        <div className="grid gap-4 xl:grid-cols-[1fr_0.5fr_auto]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              updateParams({ q: queryDraft || null });
            }}
          >
            <ToolbarInput
              label="Search"
              icon={Search}
              value={queryDraft}
              placeholder="Filter landing pages by URL or title"
              onChange={(event) => setQueryDraft(event.target.value)}
            />
          </form>

          <ToolbarSelect
            label="Sort by"
            value={sort}
            onChange={(event) => updateParams({ sort: event.target.value })}
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </ToolbarSelect>

          <div className="grid gap-[7px]">
            <span className="text-[12px] font-medium leading-4 text-[var(--text-secondary)]">View</span>
            <div className="inline-flex h-10 items-center gap-1 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-1">
              {([
                { label: "Grid", value: "grid" },
                { label: "List", value: "list" },
              ] as const).map((option) => {
                const active = option.value === view;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateParams({ view: option.value })}
                    style={{ fontSize: "13px", lineHeight: "18px" }}
                    className={cn(
                      "inline-flex h-8 items-center rounded-[10px] px-5 font-medium transition",
                      active
                        ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Toolbar>

      {filteredPages.length ? (
        view === "grid" ? (
          <section className="grid gap-5 xl:grid-cols-3">
            {filteredPages.map((page) => (
              <SurfaceCard key={page.url} className="overflow-hidden p-0">
                <div className="border-b border-[var(--border-subtle)] bg-[color:var(--bg-surface-2)]">
                  {page.screenshotUrl ? (
                    <img
                      src={page.screenshotUrl}
                      alt={getLandingPageTitle(page)}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                      Preview pending
                    </div>
                  )}
                </div>

                <div className="space-y-5 p-5">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <h2
                        className="text-[28px] leading-[0.96] tracking-[-0.04em] text-[var(--text-primary)]"
                        style={{ fontFamily: "var(--font-instrument-serif), serif" }}
                      >
                        {getLandingPageTitle(page)}
                      </h2>
                      <Pill tone={page.status === "active" ? "success" : "default"}>
                        {page.status === "active" ? "Active" : "Inactive"}
                      </Pill>
                    </div>
                    <AdDetailUrlField value={page.url} />
                  </div>

                  <div className="grid gap-x-8 gap-y-5 sm:grid-cols-3">
                    <DetailField label="Used in ads" value={page.count} />
                    <DetailField label="First seen" value={formatDate(page.firstSeenAt)} />
                    <DetailField label="Status" value={page.status === "active" ? "Active" : "Inactive"} />
                  </div>

                  <div className="flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-5">
                    <Link
                      href={workspaceHref(`/advertisers/${advertiserId}/ads?source=${page.source}&landingPage=${encodeURIComponent(page.url)}`)}
                      className="app-button app-button-secondary"
                    >
                      View ads using this page
                    </Link>
                  </div>
                </div>
              </SurfaceCard>
            ))}
          </section>
        ) : (
          <section className="overflow-hidden rounded-[28px] border border-[var(--border-subtle)]">
            <div className="grid grid-cols-[0.6fr_1fr_1.2fr_0.6fr_0.7fr_0.5fr_0.8fr] gap-3 border-b border-[var(--border-subtle)] bg-[color:var(--bg-surface-3)] px-4 py-3 text-[12px] font-medium leading-4 text-[var(--text-tertiary)]">
              <span>Screenshot</span>
              <span>Page title</span>
              <span>URL</span>
              <span>Used in ads</span>
              <span>First seen</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {filteredPages.map((page, index) => (
              <div
                key={page.url}
                className={`grid grid-cols-[0.6fr_1fr_1.2fr_0.6fr_0.7fr_0.5fr_0.8fr] gap-3 border-b border-[var(--border-subtle)] px-4 py-4 text-[14px] leading-6 text-[var(--text-secondary)] last:border-b-0 ${
                  index % 2 === 0 ? "bg-[color:var(--bg-surface-2)]" : "bg-[color:var(--bg-surface-1)]"
                }`}
              >
                <div className="overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[color:var(--bg-surface-2)]">
                  {page.screenshotUrl ? (
                    <img src={page.screenshotUrl} alt={getLandingPageTitle(page)} className="aspect-[4/3] h-full w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[4/3] items-center justify-center text-[11px] uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                      None
                    </div>
                  )}
                </div>
                <span className="font-medium text-[var(--text-primary)]">{getLandingPageTitle(page)}</span>
                <span className="break-all">{page.url}</span>
                <span>{page.count}</span>
                <span>{formatDate(page.firstSeenAt)}</span>
                <span>
                  <Pill tone={page.status === "active" ? "success" : "default"}>
                    {page.status === "active" ? "Active" : "Inactive"}
                  </Pill>
                </span>
                <span className="flex flex-col items-start gap-2">
                  <Link
                    href={workspaceHref(`/advertisers/${advertiserId}/ads?source=${page.source}&landingPage=${encodeURIComponent(page.url)}`)}
                    className="text-[13px] font-medium text-[var(--accent-hover)] transition hover:text-[var(--text-primary)]"
                  >
                    View ads using this page
                  </Link>
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] font-medium text-[var(--text-primary)] transition hover:text-[var(--accent-hover)]"
                  >
                    Open landing page
                  </a>
                </span>
              </div>
            ))}
          </section>
        )
      ) : (
        <section className="rounded-[28px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center sm:px-10">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-tertiary)]">{advertiserName}</p>
          <h2
            className="mt-5 text-4xl leading-none tracking-[-0.04em] text-[var(--text-primary)] sm:text-5xl"
            style={{ fontFamily: "var(--font-instrument-serif), serif" }}
          >
            No landing pages found
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[14px] leading-6 text-[var(--text-secondary)]">
            No landing pages have been detected for this advertiser yet.
          </p>
        </section>
      )}
    </div>
  );
}
