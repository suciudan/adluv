"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { addAdvertiserToWatchlistByIdAction } from "../app/actions/advertisers";
import { useWorkspaceHref } from "../lib/client-workspace";

export function AdvertiserCardActions(props: {
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
  trackedCompanyId: string | null;
}) {
  const workspaceHref = useWorkspaceHref();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <Link
          href={workspaceHref(`/advertisers/${props.advertiser.id}`)}
          className="inline-flex items-center rounded-full border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:text-white"
        >
          Open advertiser
        </Link>

        {props.trackedCompanyId ? (
          <Link
            href={workspaceHref("/watchlist")}
            className="inline-flex items-center rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400"
          >
            Open watchlist
          </Link>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                const response = await addAdvertiserToWatchlistByIdAction(props.advertiser);

                if (response.status === "error") {
                  setMessage(response.message);
                  return;
                }

                setMessage(
                  response.status === "queued"
                    ? "Advertiser added to watchlist and queued for indexing."
                    : "Advertiser is already in your watchlist.",
                );
              });
            }}
            className="inline-flex items-center rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Adding..." : "Add to watchlist"}
          </button>
        )}
      </div>

      {message ? <p className="text-sm text-neutral-400">{message}</p> : null}
    </div>
  );
}
