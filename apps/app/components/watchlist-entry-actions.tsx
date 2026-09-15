"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@adluv/ui";

import {
  removeTrackedCompanyAction,
  retryTrackedCompanyAction,
  syncTrackedCompanyNowAction,
} from "../app/actions/tracking";
import { useWorkspaceHref } from "../lib/client-workspace";

type ActionResponse =
  | {
      status: "queued";
      trackedCompany: {
        id: string;
      };
    }
  | {
      status: "removed";
    }
  | {
      status: "error";
      message: string;
    };

export function WatchlistEntryActions(props: {
  advertiserId: string;
  trackedCompanyId: string;
  status: "pending_initial_index" | "active" | "retryable_error" | "paused";
}) {
  const workspaceHref = useWorkspaceHref();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Link
          href={workspaceHref(`/advertisers/${props.advertiserId}/overview`)}
          className="inline-flex items-center rounded-full border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:text-white"
        >
          View advertiser
        </Link>
        {props.status === "active" ? (
          <Button
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                setError(null);
                setMessage(null);

                const response = (await syncTrackedCompanyNowAction(props.trackedCompanyId)) as ActionResponse;

                if (response.status === "error") {
                  setError(response.message);
                  return;
                }

                setMessage("Manual sync queued. Refresh after the worker runs to see the latest changes.");
                router.refresh();
              });
            }}
          >
            {isPending ? "Queueing..." : "Sync now"}
          </Button>
        ) : props.status === "retryable_error" || props.status === "paused" ? (
          <Button
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                setError(null);
                setMessage(null);

                const response = (await retryTrackedCompanyAction(props.trackedCompanyId)) as ActionResponse;

                if (response.status === "error") {
                  setError(response.message);
                  return;
                }

                setMessage("Update queued. Refresh after the worker runs to see the updated status.");
                router.refresh();
              });
            }}
          >
            {isPending ? "Queueing..." : props.status === "paused" ? "Resume updates" : "Check for updates"}
          </Button>
        ) : (
          <div className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/12 px-4 py-2 text-sm font-semibold text-amber-200">
            Initial index queued
          </div>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => setRemoveOpen(true)}
          className="inline-flex items-center rounded-full border border-rose-500/30 px-4 py-2 text-sm font-semibold text-rose-200 transition hover:border-rose-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Working..." : "Remove"}
        </button>
      </div>

      {message ? <p className="text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}

      {removeOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(13,12,10,0.78)] px-5 py-6 backdrop-blur-sm">
          <button type="button" aria-label="Close remove modal" className="absolute inset-0" onClick={() => setRemoveOpen(false)} />
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
                onClick={() => setRemoveOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-stone-100 transition hover:bg-white/10"
              >
                ×
              </button>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setRemoveOpen(false)}
                className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-stone-100 transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    setError(null);
                    setMessage(null);

                    const response = (await removeTrackedCompanyAction(props.trackedCompanyId)) as ActionResponse;

                    if (response.status === "error") {
                      setError(response.message);
                      return;
                    }

                    setRemoveOpen(false);
                    setMessage("Watchlist entry removed. This advertiser will no longer be tracked.");
                    router.refresh();
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
    </div>
  );
}
