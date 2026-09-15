"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Toolbar, ToolbarInput, ToolbarSelect } from "./app-ui";

type ActivityFilter = "all" | "new_ads" | "multiple_launches" | "engagement_gains" | "landing_pages";
type RangeFilter = "7" | "30" | "90";
type PreviewFilter = "all" | "with_preview" | "without_preview";
type SortFilter = "newest" | "oldest" | "advertiser" | "largest_group";

const activityOptions: Array<{ label: string; value: ActivityFilter }> = [
  { label: "All activity", value: "all" },
  { label: "New ads", value: "new_ads" },
  { label: "Multiple launches", value: "multiple_launches" },
  { label: "Engagement gains", value: "engagement_gains" },
  { label: "Landing pages", value: "landing_pages" },
];

const previewOptions: Array<{ label: string; value: PreviewFilter }> = [
  { label: "All previews", value: "all" },
  { label: "Has preview", value: "with_preview" },
  { label: "No preview", value: "without_preview" },
];

const sortOptions: Array<{ label: string; value: SortFilter }> = [
  { label: "Newest first", value: "newest" },
  { label: "Oldest first", value: "oldest" },
  { label: "Advertiser A-Z", value: "advertiser" },
  { label: "Largest groups", value: "largest_group" },
];

export function ActivityFeedFilterBar({
  initialQuery,
  initialType,
  initialRange,
  initialAdvertiser,
  initialCta,
  initialPreview,
  initialSort,
  advertiserOptions,
  ctaOptions,
  showClearFilters,
}: {
  initialQuery: string;
  initialType: ActivityFilter;
  initialRange: RangeFilter;
  initialAdvertiser: string;
  initialCta: string;
  initialPreview: PreviewFilter;
  initialSort: SortFilter;
  advertiserOptions: Array<{ label: string; value: string }>;
  ctaOptions: Array<{ label: string; value: string }>;
  showClearFilters: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [queryDraft, setQueryDraft] = useState(initialQuery);

  useEffect(() => {
    setQueryDraft(searchParams.get("q") ?? "");
  }, [searchParams]);

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (
        !value ||
        (key === "type" && value === "all") ||
        (key === "range" && value === "30") ||
        (key === "preview" && value === "all") ||
        (key === "sort" && value === "newest")
      ) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    next.delete("visible");
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
    <Toolbar className="sticky top-20 z-10 border border-[color:color-mix(in_oklab,var(--border-subtle)_88%,white_12%)] bg-[color:color-mix(in_oklab,var(--bg-surface)_94%,black_6%)]/95 px-4 py-3 backdrop-blur">
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,1fr))]">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              updateParams({ q: queryDraft || null });
            }}
            className="min-w-0"
          >
            <ToolbarInput
              label="Search within feed"
              type="search"
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              placeholder="Advertiser, headline, CTA, copy"
              icon={Search}
              wrapperClassName="min-w-0"
            />
          </form>

          <ToolbarSelect
            label="Advertiser"
            value={initialAdvertiser}
            onChange={(event) => updateParams({ advertiser: event.target.value || null })}
          >
            <option value="">All advertisers</option>
            {advertiserOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </ToolbarSelect>

          <ToolbarSelect label="Activity type" value={initialType} onChange={(event) => updateParams({ type: event.target.value })}>
            {activityOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </ToolbarSelect>

          <ToolbarSelect label="CTA" value={initialCta} onChange={(event) => updateParams({ cta: event.target.value || null })}>
            <option value="">All CTAs</option>
            {ctaOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </ToolbarSelect>

          <ToolbarSelect
            label="Has preview"
            value={initialPreview}
            onChange={(event) => updateParams({ preview: event.target.value })}
          >
            {previewOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </ToolbarSelect>

          <ToolbarSelect label="Sort" value={initialSort} onChange={(event) => updateParams({ sort: event.target.value })}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </ToolbarSelect>

          <ToolbarSelect label="Date range" value={initialRange} onChange={(event) => updateParams({ range: event.target.value })}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </ToolbarSelect>
        </div>

        {showClearFilters ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setQueryDraft("");
                router.push(pathname);
              }}
              className="text-[13px] font-medium text-[var(--accent-hover)] transition hover:text-[var(--text-primary)]"
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </div>
    </Toolbar>
  );
}
