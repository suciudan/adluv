"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Eye } from "lucide-react";

import { addAdvertiserToWatchlistByIdAction } from "../app/actions/advertisers";
import { removeAdvertiserEntityFromWatchlistAction } from "../app/actions/tracking";
import { WatchlistIcon } from "./watchlist-icon";

export function AdvertiserDirectoryActionButton(props: {
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
  const [isPending, startTransition] = useTransition();

  const addToWatchlist = () => {
    startTransition(async () => {
      const response = await addAdvertiserToWatchlistByIdAction(props.advertiser);

      if (response.status === "queued" || response.status === "existing") {
        setTrackedCompanyIds(response.trackedCompanyIds);
        router.refresh();
      }
    });
  };

  const removeFromWatchlist = () => {
    if (!trackedCompanyIds.length) {
      return;
    }

    startTransition(async () => {
      const response = await removeAdvertiserEntityFromWatchlistAction(props.advertiser.id);

      if (response.status === "removed") {
        setTrackedCompanyIds([]);
        router.refresh();
      }
    });
  };

  if (trackedCompanyIds.length) {
    return (
      <button
        type="button"
        aria-label={`Remove ${props.advertiser.canonicalName} from watchlist`}
        disabled={isPending}
        onClick={(event) => {
          event.stopPropagation();
          removeFromWatchlist();
        }}
        className="relative z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border border-transparent text-[#a78bfa] transition hover:border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        <WatchlistIcon className={isPending ? "animate-pulse" : undefined} />
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Add ${props.advertiser.canonicalName} to watchlist`}
      disabled={isPending}
      onClick={(event) => {
        event.stopPropagation();
        addToWatchlist();
      }}
      className="relative z-10 inline-flex h-8 w-8 items-center justify-center text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Eye size={15} strokeWidth={1.9} fill="none" className={isPending ? "animate-pulse" : undefined} />
    </button>
  );
}
