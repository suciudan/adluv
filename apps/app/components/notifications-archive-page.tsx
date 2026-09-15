"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, LoaderCircle, Search } from "lucide-react";

import type { NotificationInboxItem } from "@adluv/db";

import {
  getNotificationBody,
  getNotificationTitle,
  getNotificationType,
  getNotificationTypeLabel,
} from "../lib/notification-inbox";
import {
  NotificationArchiveItemActions,
  NotificationInboxActions,
} from "./notification-inbox-actions";
import { EmptyState, PageHeader, Toolbar } from "./app-ui";

type NotificationTypeFilter = "all" | "unread" | "new_ads" | "new_creatives" | "landing_pages" | "tracking";
type NotificationRangeFilter = "7" | "30" | "90" | "all";
type NotificationSortFilter = "newest" | "oldest";

const typeOptions: Array<{ label: string; value: NotificationTypeFilter }> = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "New ads", value: "new_ads" },
  { label: "New creatives", value: "new_creatives" },
  { label: "Landing pages", value: "landing_pages" },
  { label: "Tracking", value: "tracking" },
];

function formatCalendarDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function hasActiveFilters(params: URLSearchParams) {
  return ["q", "type", "range", "sort"].some((key) => {
    const value = params.get(key);
    return Boolean(value) && !["all", "newest"].includes(value ?? "");
  });
}

export function NotificationsArchivePage(props: {
  items: NotificationInboxItem[];
  unreadCount: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [queryDraft, setQueryDraft] = useState(searchParams.get("q") ?? "");
  const [visibleCount, setVisibleCount] = useState(12);

  useEffect(() => {
    setQueryDraft(searchParams.get("q") ?? "");
    setVisibleCount(12);
  }, [searchParams]);

  const query = searchParams.get("q")?.trim().toLowerCase() ?? "";
  const type = (searchParams.get("type") as NotificationTypeFilter | null) ?? "all";
  const range = (searchParams.get("range") as NotificationRangeFilter | null) ?? "30";
  const sort = (searchParams.get("sort") as NotificationSortFilter | null) ?? "newest";
  const paramsForClear = new URLSearchParams();

  const updateParams = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (!value || ["all", "newest", "30"].includes(value)) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const next = params.toString();
    router.push(next ? `${pathname}?${next}` : pathname);
  };

  const filteredItems = [...props.items]
    .filter((item) => {
      if (type === "unread" && item.isRead) {
        return false;
      }

      if (type !== "all" && type !== "unread" && getNotificationType(item) !== type) {
        return false;
      }

      if (range !== "all") {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - Number(range));

        if (item.createdAt < threshold) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      const haystack = [
        item.advertiserName,
        item.headline,
        item.body ?? "",
        item.adTitle ?? "",
        item.destinationUrl ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    })
    .sort((left, right) =>
      sort === "oldest"
        ? left.createdAt.getTime() - right.createdAt.getTime()
        : right.createdAt.getTime() - left.createdAt.getTime(),
    );

  const visibleItems = filteredItems.slice(0, visibleCount);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Bell}
        title="Notifications"
        subtitle="All in-app notifications from your watchlist."
        actions={<NotificationInboxActions unreadCount={props.unreadCount} />}
      />

      <Toolbar className="space-y-4">
        <div className="grid gap-3 xl:grid-cols-[1.35fr_repeat(3,0.55fr)]">
          <form
            className="min-w-0"
            onSubmit={(event) => {
              event.preventDefault();
              updateParams({ q: queryDraft || null });
            }}
          >
            <label className="relative block">
              <Search size={16} strokeWidth={1.75} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="search"
                value={queryDraft}
                onChange={(event) => setQueryDraft(event.target.value)}
                placeholder="Search notifications by advertiser or text"
                className="app-input app-input-with-icon"
              />
            </label>
          </form>

          <label className="space-y-2">
            <span className="text-[12px] font-medium leading-4 text-[var(--text-secondary)]">Range</span>
            <select
              value={range}
              onChange={(event) => updateParams({ range: event.target.value })}
              className="app-select"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-[12px] font-medium leading-4 text-[var(--text-secondary)]">Sort by</span>
            <select
              value={sort}
              onChange={(event) => updateParams({ sort: event.target.value })}
              className="app-select"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                setQueryDraft("");
                router.push(pathname);
              }}
              className="app-button app-button-secondary w-full"
            >
              Clear filters
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {typeOptions.map((option) => {
            const active = option.value === type;

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => updateParams({ type: option.value })}
                className={`app-pill px-3 py-2 ${active ? "app-pill-accent" : "app-pill-default"}`}
                >
                  {option.label}
                </button>
            );
          })}
        </div>
      </Toolbar>

      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[14px] leading-[22px] text-[var(--text-secondary)]">{filteredItems.length} notifications</p>
        {hasActiveFilters(new URLSearchParams(searchParams.toString())) ? (
          <Link href={pathname + (paramsForClear.toString() ? `?${paramsForClear.toString()}` : "")} className="text-[13px] font-medium leading-5 text-[var(--accent-hover)] transition hover:text-[var(--text-primary)]">
            Clear filters
          </Link>
        ) : null}
      </section>

      {filteredItems.length ? (
        <>
          <section className="space-y-5">
            {visibleItems.map((item) => {
              const notificationType = getNotificationType(item);
              const targetHref = item.targetUrl;
              const relatedPreviewItems = item.entityType === "tracker" ? [] : [
                item.screenshotUrl
                  ? {
                      key: "creative",
                      title: "Creative preview",
                      body: item.adTitle ?? "Stored creative",
                      imageUrl: item.screenshotUrl,
                    }
                  : null,
                item.relatedLandingPageUrl || item.destinationUrl
                  ? {
                      key: "landing-page",
                      title: "Landing page",
                      body: item.relatedLandingPageUrl ?? item.destinationUrl ?? "Linked destination",
                      imageUrl: null,
                    }
                  : null,
              ].filter(Boolean) as Array<{
                key: string;
                title: string;
                body: string;
                imageUrl: string | null;
              }>;

              return (
                <div
                  key={item.deliveryId}
                  className={`space-y-5 rounded-[30px] border p-5 ${
                    item.isRead
                      ? "border-white/10 bg-[linear-gradient(180deg,rgba(20,18,15,0.94),rgba(12,12,14,0.98))]"
                      : "border-amber-500/25 bg-[linear-gradient(180deg,rgba(27,20,14,0.98),rgba(12,12,14,0.98))]"
                  }`}
                        >
                          <div className="grid gap-5 lg:grid-cols-[0.78fr_1.22fr]">
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-[26px] border border-white/10 bg-black/20">
                        {item.entityType === "tracker" ? (
                          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_34%),rgba(255,255,255,0.03)] px-6 text-center">
                            <LoaderCircle
                              size={28}
                              strokeWidth={1.75}
                              className={`text-amber-300 ${item.kind === "initial_index_completed" ? "" : "animate-spin"}`}
                            />
                            <p className="text-sm leading-6 text-stone-300">
                              {item.kind === "initial_index_completed"
                                ? "Initial scrape completed."
                                : "Tracker needs attention before it can finish the first scrape."}
                            </p>
                          </div>
                        ) : item.screenshotUrl ? (
                          <img
                            src={item.screenshotUrl}
                            alt={item.adTitle ?? item.headline}
                            className="aspect-[4/3] w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-[4/3] items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.16),transparent_34%),rgba(255,255,255,0.03)] px-6 text-center text-sm leading-6 text-stone-400">
                            No creative preview is stored for this notification yet.
                          </div>
                        )}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Type</p>
                          <p className="mt-2 text-sm font-semibold text-white">{getNotificationTypeLabel(notificationType)}</p>
                        </div>
                        <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Created</p>
                          <p className="mt-2 text-sm font-semibold text-white">{formatCalendarDate(item.createdAt)}</p>
                        </div>
                        <div className="rounded-[20px] border border-white/10 bg-white/5 px-4 py-4">
                          <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Status</p>
                          <p className="mt-2 text-sm font-semibold text-white">{item.isRead ? "Read" : "Unread"}</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            {!item.isRead ? <span className="mt-1 h-2.5 w-2.5 rounded-full bg-amber-300" /> : null}
                            {item.advertiserLogoUrl ? (
                              <img
                                src={item.advertiserLogoUrl}
                                alt={`${item.advertiserName} logo`}
                                className="h-10 w-10 rounded-full border border-white/10 bg-[#17130f] object-cover"
                              />
                            ) : (
                              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[#17130f] text-sm font-semibold text-amber-300">
                                {getInitials(item.advertiserName)}
                              </span>
                            )}
                            <div>
                              <p className="text-sm font-semibold text-white">{item.advertiserName}</p>
                              <p className="text-xs uppercase tracking-[0.18em] text-stone-500">
                                {item.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white">
                              {getNotificationTitle(item)}
                            </h2>
                            <p className="text-sm leading-7 text-stone-300">{getNotificationBody(item)}</p>
                          </div>
                        </div>
                      </div>

                      {item.entityType === "alert" ? (
                        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">Related creative</p>
                          <h3 className="mt-3 text-xl font-semibold text-white">{item.adTitle ?? "Untitled creative"}</h3>
                          <p className="mt-3 text-sm leading-7 text-stone-400">
                            {item.adBody ?? "No ad body was captured for this notification."}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                          <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">Tracker update</p>
                          <h3 className="mt-3 text-xl font-semibold text-white">
                            {item.kind === "initial_index_completed" ? "Ready to review" : "Needs attention"}
                          </h3>
                          <p className="mt-3 text-sm leading-7 text-stone-400">
                            {getNotificationBody(item)}
                          </p>
                        </div>
                      )}

                      <NotificationArchiveItemActions
                        deliveryId={item.deliveryId}
                        href={targetHref}
                        isRead={item.isRead}
                      />
                    </div>
                  </div>

                  {relatedPreviewItems.length ? (
                    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">Related preview</p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {relatedPreviewItems.slice(0, 2).map((preview) => (
                              <div
                                key={preview.key}
                                className="overflow-hidden rounded-[20px] border border-white/10 bg-[rgba(255,255,255,0.04)]"
                              >
                                {preview.imageUrl ? (
                                  <img
                                    src={preview.imageUrl}
                                    alt={preview.title}
                                    className="aspect-[5/3] w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex aspect-[5/3] items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_34%),rgba(255,255,255,0.03)] px-4 text-center text-sm text-stone-400">
                                    No page preview stored
                                  </div>
                                )}
                                <div className="space-y-2 px-4 py-4">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">{preview.title}</p>
                                  <p className="text-sm text-stone-300">{preview.body}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <a
                          href={item.relatedLandingPageUrl ?? targetHref}
                          target={item.relatedLandingPageUrl ? "_blank" : undefined}
                          rel={item.relatedLandingPageUrl ? "noreferrer" : undefined}
                          className="text-sm font-semibold text-amber-300 underline"
                        >
                          Open related
                        </a>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>

          {visibleCount < filteredItems.length ? (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((count) => count + 12)}
                className="app-button app-button-secondary"
              >
                Load older notifications
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyState
          title="You’re all caught up"
          body="No notifications match these filters."
          primaryAction={
            <button
              type="button"
              onClick={() => {
                setQueryDraft("");
                router.push(pathname);
              }}
              className="app-button app-button-primary"
            >
              Clear filters
            </button>
          }
        />
      )}
    </div>
  );
}
