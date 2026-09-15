"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import posthog from "posthog-js";

import { addAdvertiserToWatchlistByIdAction } from "../app/actions/advertisers";
import { removeAdvertiserEntityFromWatchlistAction } from "../app/actions/tracking";

export function AdvertiserWatchlistToggle(props: {
  advertiser: {
    id: string;
    canonicalName: string;
    profileUrl?: string | null;
    websiteUrl?: string | null;
    industry?: string | null;
    companySize?: string | null;
    country?: string | null;
    summary?: string | null;
  };
  trackedCompanyIds: string[];
}) {
  const router = useRouter();
  const [trackedCompanyIds, setTrackedCompanyIds] = useState(props.trackedCompanyIds);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (trackedCompanyIds.length) {
    return (
      <>
        <button
          type="button"
          disabled={isPending}
          onClick={() => setRemoveOpen(true)}
          className="app-button app-button-secondary"
        >
          {isPending ? "Removing..." : "Remove from watchlist"}
        </button>

        {removeOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] px-5 py-6">
            <button type="button" aria-label="Close remove modal" className="absolute inset-0" onClick={() => setRemoveOpen(false)} />
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
                  onClick={() => setRemoveOpen(false)}
                  className="app-icon-button"
                >
                  ×
                </button>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRemoveOpen(false)}
                  className="app-button app-button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const response = await removeAdvertiserEntityFromWatchlistAction(props.advertiser.id);

                      if (response.status === "removed") {
                        posthog.capture("advertiser_removed_from_watchlist", {
                          advertiser_id: props.advertiser.id,
                          advertiser_name: props.advertiser.canonicalName,
                        });
                        setTrackedCompanyIds([]);
                        setRemoveOpen(false);
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

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const response = await addAdvertiserToWatchlistByIdAction(props.advertiser);

          if (response.status === "queued" || response.status === "existing") {
            posthog.capture("advertiser_added_to_watchlist", {
              advertiser_id: props.advertiser.id,
              advertiser_name: props.advertiser.canonicalName,
              is_new: response.status === "queued",
            });
            setTrackedCompanyIds(response.trackedCompanyIds);
            router.refresh();
          }
        });
      }}
      className="app-button app-button-primary"
    >
      {isPending ? "Adding..." : "Add to watchlist"}
    </button>
  );
}
