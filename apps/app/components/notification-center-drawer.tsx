"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NotificationInboxItem } from "@adluv/db";
import {
  Bell,
  BellRing,
  Check,
  Image,
  Link2,
  LoaderCircle,
  Megaphone,
  X,
} from "lucide-react";

import { markNotificationInboxItemReadAction } from "../app/actions/notifications";
import { useWorkspaceHref } from "../lib/client-workspace";
import {
  getNotificationBody,
  getNotificationTitle,
  getNotificationType,
  hydrateNotificationInboxItems,
  isTrackerNotification,
} from "../lib/notification-inbox";
import { NotificationInboxActions } from "./notification-inbox-actions";
import { AppButton, AppLinkButton, cn } from "./app-ui";

type FilterValue = "all" | "unread" | "new_ad" | "new_creative" | "landing_page" | "tracking";

const filterItems: Array<{ label: string; value: FilterValue }> = [
  { label: "All", value: "all" },
  { label: "Unread", value: "unread" },
  { label: "New ads", value: "new_ad" },
  { label: "New creatives", value: "new_creative" },
  { label: "Landing pages", value: "landing_page" },
  { label: "Tracking", value: "tracking" },
];

function formatRelativeTime(value: Date) {
  const diffMs = Date.now() - value.getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return value.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function getNotificationIcon(item: NotificationInboxItem) {
  if (item.kind === "initial_index_completed" || item.kind === "initial_index_failed") {
    return LoaderCircle;
  }

  if (item.kind === "landing_page") {
    return Link2;
  }

  if (item.kind === "new_creative") {
    return Image;
  }

  return Megaphone;
}

function DrawerRowAction(props: {
  deliveryId: string;
  href: string;
  isRead: boolean;
  onNavigate: () => void;
}) {
  const workspaceHref = useWorkspaceHref();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            setError(null);

            if (!props.isRead) {
              const response = await markNotificationInboxItemReadAction(props.deliveryId);

              if (response.status === "error") {
                setError(response.message);
                return;
              }
            }

            props.onNavigate();
            router.push(props.href);
          });
        }}
        className="text-[13px] font-medium leading-5 text-[var(--accent-hover)] transition hover:text-[var(--text-primary)]"
      >
        {isPending ? "Opening..." : "Open"}
      </button>
      {error ? <p className="text-[12px] leading-4 text-[#fecaca]">{error}</p> : null}
    </div>
  );
}

export function NotificationCenterDrawer({
  items,
  unreadCount,
}: {
  items: NotificationInboxItem[];
  unreadCount: number;
}) {
  const workspaceHref = useWorkspaceHref();
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<FilterValue>("all");
  const [liveItems, setLiveItems] = useState(() => hydrateNotificationInboxItems(items));
  const [liveUnreadCount, setLiveUnreadCount] = useState(unreadCount);
  const [toast, setToast] = useState<string | null>(null);
  const knownNotificationIdsRef = useRef(new Set(items.map((item) => item.deliveryId)));

  useEffect(() => {
    setLiveItems(hydrateNotificationInboxItems(items));
    setLiveUnreadCount(unreadCount);

    for (const item of items) {
      knownNotificationIdsRef.current.add(item.deliveryId);
    }
  }, [items, unreadCount]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    let cancelled = false;

    async function refreshNotifications() {
      if (document.visibilityState !== "visible") {
        return;
      }

      const response = await fetch("/api/notifications/live", {
        cache: "no-store",
      });

      if (!response.ok || cancelled) {
        return;
      }

      const payload = (await response.json()) as {
        items: NotificationInboxItem[];
        unreadCount: number;
      };
      const nextItems = hydrateNotificationInboxItems(payload.items);

      if (cancelled) {
        return;
      }

      const newTrackerItems = nextItems.filter(
        (item) => isTrackerNotification(item) && !knownNotificationIdsRef.current.has(item.deliveryId),
      );

      for (const item of nextItems) {
        knownNotificationIdsRef.current.add(item.deliveryId);
      }

      if (newTrackerItems.length) {
        setToast(getNotificationTitle(newTrackerItems[0]));
      }

      setLiveItems(nextItems);
      setLiveUnreadCount(payload.unreadCount);
    }

    const intervalId = window.setInterval(() => {
      void refreshNotifications();
    }, 15_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshNotifications();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
    };
  }, []);

  const visibleItems = liveItems.filter((item) => {
    if (filter === "all") {
      return true;
    }

    if (filter === "unread") {
      return !item.isRead;
    }

    if (filter === "tracking") {
      return item.entityType === "tracker";
    }

    return item.kind === filter;
  });

  return (
    <>
      {toast ? (
        <div className="fixed bottom-5 right-5 z-[80] w-[360px] rounded-[18px] border border-[rgba(244,180,0,0.24)] bg-[var(--bg-surface-1)] px-4 py-3 text-[14px] font-medium leading-[22px] text-[#f8e08a] shadow-[var(--shadow-overlay)] [html[data-theme='light']_&]:text-black">
          {toast}
        </div>
      ) : null}
      <button
        type="button"
        title="Notifications"
        onClick={() => setIsOpen(true)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
        aria-label="Notifications"
      >
        <Bell size={18} strokeWidth={1.75} />
        {liveUnreadCount ? (
          <span className="absolute -right-1.5 -top-1.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--accent-primary)] px-1.5 py-0.5 text-[11px] font-medium text-white">
            {liveUnreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-[70] bg-[var(--overlay)]">
          <button
            type="button"
            aria-label="Close notifications"
            className="absolute inset-0"
            onClick={() => setIsOpen(false)}
          />

          <aside
            className="app-modal-surface absolute right-0 top-0 h-screen w-full max-w-[420px] border-l border-r-0 border-t-0 p-5"
            style={{
              borderTopLeftRadius: 24,
              borderBottomLeftRadius: 24,
              borderTopRightRadius: 0,
              borderBottomRightRadius: 0,
            }}
          >
            <div className="flex h-full flex-col">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="app-icon-chip">
                      <BellRing size={18} strokeWidth={1.75} />
                    </span>
                    <h2 className="text-[24px] font-semibold leading-[30px] text-[var(--text-primary)]">
                      Notifications
                    </h2>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="app-icon-button"
                  aria-label="Close"
                >
                  <X size={18} strokeWidth={1.75} />
                </button>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <NotificationInboxActions unreadCount={liveUnreadCount} />
                <AppLinkButton href={workspaceHref("/notifications")} variant="secondary" className="h-10" >
                  View all notifications
                </AppLinkButton>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {filterItems.map((item) => {
                  const active = filter === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setFilter(item.value)}
                      className={cn("app-pill app-pill-default px-3 py-2", active && "app-pill-accent")}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="app-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto">
                {visibleItems.length ? (
                  <div className="space-y-3">
                    {visibleItems.map((item) => {
                      const Icon = getNotificationIcon(item);

                      return (
                        <div
                          key={item.deliveryId}
                          className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4"
                        >
                          <div className="flex items-start gap-3">
                            <span className="app-icon-chip shrink-0">
                              <Icon
                                size={16}
                                strokeWidth={1.75}
                                className={
                                  item.kind === "initial_index_failed" ? "text-[#fca5a5]" : undefined
                                }
                              />
                            </span>

                            <div className="min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="block w-full text-left"
                              >
                                <div className="flex items-center gap-2">
                                  {!item.isRead ? (
                                    <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)]" />
                                  ) : null}
                                  <p className="truncate text-[14px] font-medium leading-[22px] text-[var(--text-primary)]">
                                    {getNotificationTitle(item)}
                                  </p>
                                </div>
                                <p className="mt-1 text-[13px] leading-5 text-[var(--text-secondary)]">
                                  {getNotificationBody(item)}
                                </p>
                                <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] leading-4 text-[var(--text-tertiary)]">
                                  <span>{formatRelativeTime(item.createdAt)}</span>
                                  {item.isRead ? (
                                    <span className="inline-flex items-center gap-1">
                                      <Check size={14} strokeWidth={1.75} />
                                      Read
                                    </span>
                                  ) : (
                                    <span>Unread</span>
                                  )}
                                </div>
                              </button>
                            </div>

                            <DrawerRowAction
                              deliveryId={item.deliveryId}
                              href={workspaceHref(item.targetUrl)}
                              isRead={item.isRead}
                              onNavigate={() => setIsOpen(false)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex h-full min-h-[260px] items-center justify-center rounded-[18px] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-6 text-center">
                    <div>
                      <h3 className="text-[20px] font-semibold leading-7 text-[var(--text-primary)]">
                        You’re all caught up
                      </h3>
                      <p className="mt-2 text-[13px] leading-5 text-[var(--text-secondary)]">
                        New watchlist changes will appear here as they are detected.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
