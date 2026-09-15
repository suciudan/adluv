"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeAdvertiserEntityFromWatchlistAction } from "../app/actions/tracking";
import { WatchlistIcon } from "./watchlist-icon";

export function WatchlistCardActions({
  advertiserId,
  advertiserName,
}: {
  advertiserId: string;
  advertiserName: string;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        aria-label={`Remove ${advertiserName} from watchlist`}
        disabled={isPending}
        onClick={() => setIsOpen(true)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-[#a78bfa] transition hover:border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        <WatchlistIcon className={isPending ? "animate-pulse" : undefined} />
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] px-5 py-6">
          <button type="button" aria-label="Close remove modal" className="absolute inset-0" onClick={() => setIsOpen(false)} />
          <div className="app-modal-surface relative w-full max-w-lg p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h2 className="text-[24px] font-semibold leading-[30px] text-[var(--text-primary)]">
                  Remove from watchlist?
                </h2>
                <p className="text-[14px] leading-[22px] text-[var(--text-secondary)]">
                  You will stop receiving alerts for this advertiser.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="app-icon-button"
              >
                ×
              </button>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="app-button app-button-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    const response = await removeAdvertiserEntityFromWatchlistAction(advertiserId);

                    if (response.status === "removed") {
                      setIsOpen(false);
                      router.refresh();
                    }
                  });
                }}
                className="app-button app-button-destructive"
              >
                {isPending ? "Removing..." : "Remove advertiser"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
