"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeAdvertiserEntityFromWatchlistAction } from "../app/actions/tracking";
import { SaveAdModalTrigger } from "./save-ad-modal-trigger";

export function ActivityFeedSaveButton({
  adId,
  initialSaved,
  className,
  savedLabel = "Saved",
  idleLabel = "Save",
}: {
  adId: string;
  initialSaved: boolean;
  className?: string;
  savedLabel?: string;
  idleLabel?: string;
}) {
  return (
    <SaveAdModalTrigger
      adId={adId}
      initialSaved={initialSaved}
      className={className}
      idleLabel={idleLabel}
      savedLabel={savedLabel}
    />
  );
}

export function ActivityFeedRemoveButton({
  advertiserId,
  className,
}: {
  advertiserId: string;
  className?: string;
}) {
  const router = useRouter();
  const [isRemoved, setIsRemoved] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        disabled={isPending || isRemoved}
        onClick={() => setIsOpen(true)}
        className={
          className ??
          "inline-flex items-center rounded-full border border-rose-500/25 px-4 py-2.5 text-sm font-semibold text-rose-100 transition hover:border-rose-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {isPending ? "Removing..." : isRemoved ? "Removed" : "Remove from watchlist"}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(13,12,10,0.78)] px-5 py-6 backdrop-blur-sm">
          <button type="button" aria-label="Close remove modal" className="absolute inset-0" onClick={() => setIsOpen(false)} />
          <div className="relative w-full max-w-lg rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,rgba(28,22,17,0.96),rgba(12,12,14,0.98))] p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <h2 className="font-[family-name:var(--font-instrument-serif)] text-4xl leading-none tracking-[-0.04em] text-white">
                  Remove from watchlist?
                </h2>
                <p className="text-sm leading-7 text-stone-300">
                  You will stop receiving alerts for this advertiser.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-stone-100 transition hover:bg-white/10"
              >
                ×
              </button>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-stone-100 transition hover:bg-white/10"
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
                      setIsRemoved(true);
                      setIsOpen(false);
                      router.refresh();
                    }
                  });
                }}
                className="inline-flex items-center rounded-full bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
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
