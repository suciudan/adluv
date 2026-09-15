"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";

import { getSourceLabel } from "@adluv/config";
import type { PendingTrackedCompany } from "@adluv/db";

import { useWorkspaceHref } from "../lib/client-workspace";
import { pendingTrackedCompanyQueuedEventName, type PendingTrackedCompanyEventDetail } from "../lib/pending-tracked-company-events";

type PendingTrackedCompaniesResponse = {
  items: Array<PendingTrackedCompanyEventDetail>;
};

function normalizeItems(
  items: Array<PendingTrackedCompany | PendingTrackedCompanyEventDetail>,
): PendingTrackedCompanyEventDetail[] {
  return items.map((item) => ({
    trackedCompanyId: item.trackedCompanyId,
    advertiserId: item.advertiserId,
    advertiserName: item.advertiserName,
    advertiserLogoUrl: item.advertiserLogoUrl,
    source: item.source,
    createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
    status: "pending_initial_index",
  }));
}

function mergePendingItems(
  current: PendingTrackedCompanyEventDetail[],
  nextItem: PendingTrackedCompanyEventDetail,
) {
  const withoutDuplicate = current.filter((item) => item.trackedCompanyId !== nextItem.trackedCompanyId);
  return [nextItem, ...withoutDuplicate];
}

export function PendingTrackedCompaniesChip({
  initialItems,
}: {
  initialItems: PendingTrackedCompany[];
}) {
  const workspaceHref = useWorkspaceHref();
  const [items, setItems] = useState(() => normalizeItems(initialItems));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setItems(normalizeItems(initialItems));
  }, [initialItems]);

  useEffect(() => {
    let cancelled = false;

    async function refreshPendingItems() {
      if (document.visibilityState !== "visible") {
        return;
      }

      const response = await fetch("/api/tracked-companies/pending", {
        cache: "no-store",
      });

      if (!response.ok || cancelled) {
        return;
      }

      const payload = (await response.json()) as PendingTrackedCompaniesResponse;

      if (!cancelled) {
        setItems(normalizeItems(payload.items));
      }
    }

    const intervalId = window.setInterval(() => {
      void refreshPendingItems();
    }, 15_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshPendingItems();
      }
    };

    const handleQueued = (event: Event) => {
      const customEvent = event as CustomEvent<PendingTrackedCompanyEventDetail>;
      setItems((current) => mergePendingItems(current, customEvent.detail));
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    window.addEventListener(pendingTrackedCompanyQueuedEventName, handleQueued as EventListener);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
      window.removeEventListener(pendingTrackedCompanyQueuedEventName, handleQueued as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  if (!items.length) {
    return null;
  }

  const visibleItems = items.slice(0, 2);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="group relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(244,180,0,0.24)] bg-[rgba(244,180,0,0.08)] transition hover:border-[rgba(244,180,0,0.4)] hover:bg-[rgba(244,180,0,0.14)]"
        aria-label={`${items.length} advertiser${items.length === 1 ? "" : "s"} currently scraping`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <LoaderCircle size={15} strokeWidth={1.9} className="animate-spin text-[#f5c451]" />
        <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[#f5c451] px-1 text-[10px] font-semibold leading-4 text-[#2a1d00]">
          {items.length}
        </span>
      </button>

      {open ? (
        <div className="app-modal-surface absolute right-0 top-[calc(100%+12px)] z-50 w-[360px] p-2">
          <div className="border-b border-[var(--border-subtle)] px-3 py-2.5">
            <p className="text-[13px] font-semibold leading-5 text-[var(--text-primary)]">Scrapes in progress</p>
          </div>

          <div className="max-h-[320px] overflow-y-auto py-2">
            {items.map((item) => (
              <Link
                key={item.trackedCompanyId}
                href={workspaceHref("/watchlist")}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-[14px] px-3 py-2.5 transition hover:bg-[var(--bg-surface-2)]"
              >
                {item.advertiserLogoUrl ? (
                  <img
                    src={item.advertiserLogoUrl}
                    alt={`${item.advertiserName} logo`}
                    className="h-9 w-9 rounded-full bg-[var(--bg-surface-1)] object-cover"
                  />
                ) : (
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-surface-2)] text-[11px] font-semibold text-[var(--text-primary)]">
                    {item.advertiserName.slice(0, 2).toUpperCase()}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-5 text-[var(--text-primary)]">
                    {item.advertiserName}
                  </p>
                  <p className="text-[12px] leading-4 text-[var(--text-secondary)]">
                    {getSourceLabel(item.source)} · Initial scrape in progress
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
