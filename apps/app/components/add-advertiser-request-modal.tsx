"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Link, LoaderCircle, Plus, X } from "lucide-react";

import { type SourceName } from "@adluv/config";

import {
  createTrackedCompaniesForSearchCompanyAction,
  searchAdvertisersAction,
} from "../app/actions/tracking";
import {
  pendingTrackedCompanyQueuedEventName,
  type PendingTrackedCompanyEventDetail,
} from "../lib/pending-tracked-company-events";
import { AdvertiserIdentity } from "./advertiser-identity";
import { AppButton, cn } from "./app-ui";

const MIN_QUERY_LENGTH = 2;
const SEARCH_TIMEOUT_MS = 15_000;
const TRACKING_TIMEOUT_MS = 20_000;
const SEARCH_POLL_INTERVAL_MS = 4_000;

declare global {
  interface Window {
    __ADLUV_ADD_ADVERTISER_SEARCH_TIMEOUT_MS__?: number;
    __ADLUV_ADD_ADVERTISER_TRACKING_TIMEOUT_MS__?: number;
  }
}

type SearchItem = {
  id: string;
  source: SourceName;
  sourceAdvertiserId: string;
  canonicalName: string;
  profileUrl?: string;
  logoUrl?: string;
  industry?: string;
  companySize?: string;
  country?: string;
  summary?: string;
  trackedCompanyId: string | null;
  trackedStatus: "pending_initial_index" | "active" | "retryable_error" | "paused" | null;
};

type CompanyProviderStatus = "matched" | "searching" | "no_match" | "failed";

type CompanyProvider = {
  source: SourceName;
  status: CompanyProviderStatus;
  result: SearchItem | null;
};

type CompanyCard = {
  companyKey: string;
  displayName: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  domain: string | null;
  description: string | null;
  matchedProviderCount: number;
  providers: Record<"facebook" | "linkedin" | "google", CompanyProvider>;
  fullyResolved: boolean;
};

export type CompanyCardAddState = "add_now" | "add_when_found" | "tracked" | "no_matches";

type SearchResponse =
  | {
      status: "ok";
      queryId: string | null;
      companyCards: CompanyCard[];
      hasPendingSources: boolean;
      warnings?: string[];
    }
  | {
      status: "error";
      message: string;
    };

type CompanyAddResponse =
  | {
      status: "ok";
      trackedCompanies: Array<{
        id: string;
        status: "pending_initial_index" | "active" | "retryable_error" | "paused";
        advertiserId: string;
        canonicalName: string;
        logoUrl: string | null;
        profileUrl: string | null;
        source: SourceName;
        queued: boolean;
      }>;
      autoAddStatus: "none" | "active" | "completed" | "capacity_exhausted";
      totalMatchedProviders: number;
    }
  | {
      status: "error";
      message: string;
    };

type AddAdvertiserToast = {
  title: string;
  body: string;
};

function mergeCompanyCards(current: CompanyCard[], incoming: CompanyCard[]) {
  const incomingByKey = new Map(incoming.map((card) => [card.companyKey, card]));
  const merged = current
    .map((card) => incomingByKey.get(card.companyKey) ?? card)
    .filter((card) => incomingByKey.has(card.companyKey));
  const mergedKeys = new Set(merged.map((card) => card.companyKey));

  for (const card of incoming) {
    if (!mergedKeys.has(card.companyKey)) {
      merged.push(card);
    }
  }

  return merged;
}

export function getCompanyCardAddState(card: CompanyCard): CompanyCardAddState {
  const matchedProviders = Object.values(card.providers).filter(
    (provider) => provider.status === "matched" && provider.result,
  );

  if (matchedProviders.length === 0) {
    return card.fullyResolved ? "no_matches" : "add_when_found";
  }

  const trackedProviders = matchedProviders.filter((provider) => provider.result?.trackedCompanyId);
  const allMatchedTracked = matchedProviders.length === trackedProviders.length;

  return allMatchedTracked ? "tracked" : "add_now";
}

function canAddCompanyCard(card: CompanyCard | null) {
  if (!card) {
    return false;
  }

  const state = getCompanyCardAddState(card);

  return state === "add_now" || state === "add_when_found";
}

function stripTrailingUrlPunctuation(value: string) {
  return value.trim().replace(/[),.;\]]+$/g, "");
}

function parseUrlishInput(value: string) {
  const trimmed = stripTrailingUrlPunctuation(value);

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function isUrlOnlyAdvertiserInput(input: string) {
  const values = input
    .split(/[\s,\n\r]+/)
    .map((value) => stripTrailingUrlPunctuation(value))
    .filter(Boolean);

  if (!values.length) {
    return false;
  }

  return values.every((value) => {
    const parsedUrl = parseUrlishInput(value);

    if (!parsedUrl) {
      return false;
    }

    const explicitUrl = /^https?:\/\//i.test(value);
    return explicitUrl || parsedUrl.hostname.includes(".");
  });
}

function getClientTimeoutMs(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function ResultCard(props: {
  card: CompanyCard;
  isPending: boolean;
  onTrack: (card: CompanyCard) => void;
  onOpenWatchlist: () => void;
}) {
  const matchedProviders = Object.values(props.card.providers).filter(
    (provider) => provider.status === "matched" && provider.result,
  );
  const trackedProviders = matchedProviders.filter((provider) => provider.result?.trackedCompanyId);
  const isIndexing = trackedProviders.some(
    (provider) => provider.result?.trackedStatus === "pending_initial_index",
  );
  const hasProviderMatches = matchedProviders.length > 0;
  const addState = getCompanyCardAddState(props.card);
  const allMatchedTracked = hasProviderMatches && matchedProviders.length === trackedProviders.length;
  const canAdd = canAddCompanyCard(props.card);

  return (
    <article className="rounded-[20px] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-4 sm:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <AdvertiserIdentity
            name={props.card.displayName}
            href={matchedProviders[0]?.result?.profileUrl ?? props.card.websiteUrl ?? "/watchlist"}
            logoUrl={props.card.logoUrl}
            metadata={[
              props.card.domain ?? props.card.websiteUrl ?? matchedProviders[0]?.result?.industry,
              props.card.domain ? null : matchedProviders[0]?.result?.country,
            ]}
            className="min-w-0 flex flex-1 items-center gap-3"
            logoClassName="bg-white object-contain p-1.5"
          />

          {addState === "no_matches" ? (
            <button
              type="button"
              disabled
              className="app-button app-button-secondary w-full shrink-0 cursor-not-allowed opacity-70 sm:w-auto"
            >
              No ad matches
            </button>
          ) : addState === "add_when_found" ? (
            <AppButton
              type="button"
              variant="primary"
              disabled={!canAdd || props.isPending}
              onClick={() => props.onTrack(props.card)}
              className="w-full shrink-0 sm:w-auto"
            >
              {props.isPending ? (
                <>
                  <LoaderCircle size={16} strokeWidth={1.9} className="animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                <span>Add when found</span>
              )}
            </AppButton>
          ) : allMatchedTracked ? (
            <button
              type="button"
              onClick={props.onOpenWatchlist}
              className={cn(
                "app-button w-full shrink-0 sm:w-auto",
                isIndexing ? "app-button-secondary" : "app-button-ghost",
              )}
            >
              {isIndexing ? "Indexing" : "Tracked"}
            </button>
          ) : (
            <AppButton
              type="button"
              variant="primary"
              disabled={!canAdd || props.isPending}
              onClick={() => props.onTrack(props.card)}
              className="w-full shrink-0 sm:w-auto"
            >
              {props.isPending ? (
                <>
                  <LoaderCircle size={16} strokeWidth={1.9} className="animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                <span>Add advertiser</span>
              )}
            </AppButton>
          )}
        </div>
      </div>
    </article>
  );
}

export function AddAdvertiserRequestModal({
  triggerClassName,
  iconOnly = false,
  triggerVariant = "primary",
  initialQuery = "",
  triggerChildren,
  onTriggerClick,
}: {
  triggerClassName?: string;
  iconOnly?: boolean;
  triggerVariant?: "primary" | "secondary" | "ghost" | "icon";
  initialQuery?: string;
  triggerChildren?: ReactNode;
  onTriggerClick?: () => void;
}) {
  const router = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [toast, setToast] = useState<AddAdvertiserToast | null>(null);
  const latestRequestId = useRef(0);
  const activeQueryRef = useRef("");
  const [queryId, setQueryId] = useState<string | null>(null);
  const [companyCards, setCompanyCards] = useState<CompanyCard[]>([]);
  const [completedSearchQuery, setCompletedSearchQuery] = useState<string | null>(null);
  const [hasPendingSources, setHasPendingSources] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [activeTrackingCompanyKey, setActiveTrackingCompanyKey] = useState<string | null>(null);
  const latestTrackingRequestId = useRef(0);
  const searchTimeoutRef = useRef<number | null>(null);
  const trackingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  const clearSearchTimeout = useCallback(() => {
    if (searchTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = null;
  }, []);

  const clearTrackingTimeout = useCallback(() => {
    if (trackingTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(trackingTimeoutRef.current);
    trackingTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setQuery(initialQuery);
    setDebouncedQuery(initialQuery);
  }, [initialQuery, isOpen]);

  const runSearch = useCallback((searchTerm: string, merge = false, silent = false) => {
    const requestId = ++latestRequestId.current;
    activeQueryRef.current = searchTerm;
    if (!silent) {
      setCompletedSearchQuery(null);
      setIsSearching(true);
      setError(null);
      setWarnings([]);
    }
    clearSearchTimeout();

    if (!merge) {
      setCompanyCards([]);
    }

    searchTimeoutRef.current = window.setTimeout(() => {
      if (latestRequestId.current !== requestId || activeQueryRef.current !== searchTerm) {
        return;
      }

      if (!silent) {
        setIsSearching(false);
      }
      setCompletedSearchQuery(searchTerm);
      setError("Advertiser search is taking longer than expected. Check the URL and try again.");
    }, getClientTimeoutMs(window.__ADLUV_ADD_ADVERTISER_SEARCH_TIMEOUT_MS__, SEARCH_TIMEOUT_MS));

    void (async () => {
      let payload: SearchResponse;

      try {
        payload = (await searchAdvertisersAction(searchTerm)) as SearchResponse;
      } catch (searchError) {
        if (latestRequestId.current !== requestId || activeQueryRef.current !== searchTerm) {
          return;
        }

        setQueryId(null);
        setCompanyCards([]);
        setCompletedSearchQuery(searchTerm);
        setHasPendingSources(false);
        setWarnings([]);
        setError(searchError instanceof Error ? searchError.message : "Unable to search advertisers.");
        return;
      } finally {
        if (latestRequestId.current === requestId && activeQueryRef.current === searchTerm) {
          clearSearchTimeout();
          if (!silent) {
            setIsSearching(false);
          }
        }
      }

      if (latestRequestId.current !== requestId || activeQueryRef.current !== searchTerm) {
        return;
      }

      if (payload.status === "error") {
        setQueryId(null);
        setCompanyCards([]);
        setCompletedSearchQuery(searchTerm);
        setHasPendingSources(false);
        setWarnings([]);
        setError(payload.message);
        return;
      }

      setError(null);
      setWarnings(payload.warnings ?? []);
      setQueryId(payload.queryId);
      setCompanyCards((current) => (merge ? mergeCompanyCards(current, payload.companyCards) : payload.companyCards));
      setHasPendingSources(payload.hasPendingSources);
      setCompletedSearchQuery(searchTerm);
    })();
  }, [clearSearchTimeout]);

  useEffect(() => {
    const trimmedQuery = debouncedQuery.trim();

    if (!trimmedQuery || trimmedQuery.length < MIN_QUERY_LENGTH) {
      setQueryId(null);
      setCompanyCards([]);
      setCompletedSearchQuery(null);
      setHasPendingSources(false);
      setWarnings([]);
      setError(null);
      return;
    }

    if (!isUrlOnlyAdvertiserInput(trimmedQuery)) {
      setQueryId(null);
      setCompanyCards([]);
      setCompletedSearchQuery(trimmedQuery);
      setHasPendingSources(false);
      setWarnings([]);
      setError("Enter a company URL or ad library link, not a brand name.");
      return;
    }

    runSearch(trimmedQuery, false);
  }, [debouncedQuery, runSearch]);

  useEffect(() => {
    if (!isOpen || !hasPendingSources || isTracking) {
      return;
    }

    const searchTerm = activeQueryRef.current;

    if (!searchTerm || completedSearchQuery !== searchTerm) {
      return;
    }

    const intervalId = window.setInterval(() => {
      runSearch(searchTerm, true, true);
    }, SEARCH_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [completedSearchQuery, hasPendingSources, isOpen, isTracking, runSearch]);

  const resetState = () => {
    latestRequestId.current += 1;
    latestTrackingRequestId.current += 1;
    activeQueryRef.current = "";
    clearSearchTimeout();
    clearTrackingTimeout();
    setQuery("");
    setDebouncedQuery("");
    setQueryId(null);
    setCompanyCards([]);
    setCompletedSearchQuery(null);
    setHasPendingSources(false);
    setError(null);
    setWarnings([]);
    setIsSearching(false);
    setIsTracking(false);
    setActiveTrackingCompanyKey(null);
  };

  const openWatchlist = () => {
    setToast(null);
    setIsOpen(false);
    router.push("/watchlist");
  };

  const handleTrack = (card: CompanyCard) => {
    if (!queryId) {
      setError("Search results are still loading. Try again in a moment.");
      return;
    }

    const requestId = ++latestTrackingRequestId.current;
    setActiveTrackingCompanyKey(card.companyKey);
    setIsTracking(true);
    setError(null);
    clearTrackingTimeout();

    trackingTimeoutRef.current = window.setTimeout(() => {
      if (latestTrackingRequestId.current !== requestId) {
        return;
      }

      setIsTracking(false);
      setActiveTrackingCompanyKey(null);
      setError("Adding this advertiser is taking longer than expected. Try again in a moment.");
    }, getClientTimeoutMs(window.__ADLUV_ADD_ADVERTISER_TRACKING_TIMEOUT_MS__, TRACKING_TIMEOUT_MS));

    void (async () => {
      try {
        const response = (await createTrackedCompaniesForSearchCompanyAction({
          queryId,
          companyKey: card.companyKey,
        })) as CompanyAddResponse;

        if (latestTrackingRequestId.current !== requestId) {
          return;
        }

        if (response.status === "error") {
          setError(response.message);
          return;
        }

        for (const trackedCompany of response.trackedCompanies) {
          if (trackedCompany.status !== "pending_initial_index") {
            continue;
          }

          const pendingDetail: PendingTrackedCompanyEventDetail = {
            trackedCompanyId: trackedCompany.id,
            advertiserId: trackedCompany.advertiserId,
            advertiserName: trackedCompany.canonicalName,
            advertiserLogoUrl: trackedCompany.logoUrl,
            source: trackedCompany.source,
            createdAt: new Date().toISOString(),
            status: "pending_initial_index",
          };

          window.dispatchEvent(
            new CustomEvent<PendingTrackedCompanyEventDetail>(
              pendingTrackedCompanyQueuedEventName,
              { detail: pendingDetail },
            ),
          );
        }

        const addedCount = response.trackedCompanies.filter((company) => company.queued).length;

        if (response.autoAddStatus === "active") {
          setToast({
            title: `${card.displayName} added to watchlist`,
            body:
              addedCount > 0
                ? `Added ${addedCount} provider${addedCount === 1 ? "" : "s"} and started scanning. Remaining provider matches will be added automatically. Ads will appear in the watchlist as soon as the first scrape finishes.`
                : "Provider matching is still running. This company will be added automatically when a provider match is found. Ads will appear in the watchlist after its first scrape finishes.",
          });
        } else if (response.autoAddStatus === "capacity_exhausted") {
          setToast({
            title: `${card.displayName} added to watchlist`,
            body: `Added ${response.trackedCompanies.length} provider${response.trackedCompanies.length === 1 ? "" : "s"} and started scanning. Ads will appear in the watchlist as soon as the first scrape finishes. Your remaining watchlist capacity is full, so no more matches can be added automatically.`,
          });
        } else if (response.trackedCompanies.length > 0) {
          setToast({
            title: `${card.displayName} added to watchlist`,
            body: `Added ${response.trackedCompanies.length} provider${response.trackedCompanies.length === 1 ? "" : "s"} and started scanning. Ads will appear in the watchlist as soon as the first scrape finishes.`,
          });
        } else {
          setToast({
            title: `${card.displayName} is already in your watchlist`,
            body: "Open the watchlist to check whether it is still scanning or has finished collecting ads.",
          });
        }

        setIsOpen(false);
        resetState();
        router.refresh();
      } catch (trackError) {
        if (latestTrackingRequestId.current !== requestId) {
          return;
        }

        setError(trackError instanceof Error ? trackError.message : "Unable to add advertiser.");
      } finally {
        if (latestTrackingRequestId.current === requestId) {
          clearTrackingTimeout();
          setIsTracking(false);
          setActiveTrackingCompanyKey(null);
        }
      }
    })();
  };

  const trimmedQuery = debouncedQuery.trim();
  const hasSearchQuery = trimmedQuery.length >= MIN_QUERY_LENGTH;
  const shouldShowEmptyState =
    hasSearchQuery &&
    !error &&
    completedSearchQuery === trimmedQuery &&
    companyCards.length === 0;

  const toastElement = toast ? (
    <div className="fixed bottom-4 left-4 right-4 z-[80] rounded-2xl border border-[rgba(244,180,0,0.24)] bg-[var(--bg-surface-1)] px-4 py-4 text-sm leading-6 text-[#f8e08a] shadow-[var(--shadow-overlay)] [html[data-theme='light']_&]:text-black sm:bottom-5 sm:left-auto sm:right-5 sm:w-[460px]">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--text-primary)] [html[data-theme='dark']_&]:text-[#f8e08a]">
            {toast.title}
          </p>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)] [html[data-theme='dark']_&]:text-[#f8e08a]">
            {toast.body}
          </p>
          <button
            type="button"
            onClick={openWatchlist}
            className="app-button app-button-secondary mt-3 h-9 px-3 text-sm"
          >
            View watchlist
          </button>
        </div>
        <button
          type="button"
          aria-label="Dismiss add advertiser confirmation"
          onClick={() => setToast(null)}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-3)] hover:text-[var(--text-primary)]"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  ) : null;

  const modalElement = isOpen ? (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-[var(--overlay)] px-3 py-3 sm:px-5 sm:py-6"
      data-add-advertiser-modal="true"
    >
      <button
        type="button"
        aria-label="Close add advertiser modal"
        className="absolute inset-0"
        onClick={() => {
          setIsOpen(false);
          resetState();
        }}
      />
      <div className="mx-auto flex min-h-full items-start justify-center sm:items-center">
        <div
          className="app-modal-surface relative flex max-h-[calc(100vh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden p-4 sm:max-h-[calc(100vh-3rem)] sm:p-6"
          data-add-advertiser-modal-surface="true"
        >
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="text-[22px] font-semibold leading-[28px] text-[var(--text-primary)] sm:text-[24px] sm:leading-[30px]">
                Add advertiser
              </h2>
            </div>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                resetState();
              }}
              className="app-icon-button"
              aria-label="Close"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </div>

          <div className="mt-6 flex min-h-0 flex-1 flex-col gap-4">
            <label className="grid gap-2">
              <span className="text-[13px] font-medium leading-5 text-[var(--text-secondary)]">
                Paste a company URL or ad library link. Brand names are not supported here.
              </span>
              <span className="relative block">
                <Link
                  size={16}
                  strokeWidth={1.75}
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
                />
                <input
                  autoFocus
                  type="text"
                  inputMode="url"
                  value={query}
                  onChange={(event) => setQuery(event.target.value.split(/\r?\n/, 1)[0] ?? "")}
                  placeholder="https://nike.com or ad library link"
                  className={cn(
                    "app-input app-input-with-icon h-12 pr-12 text-[14px]",
                    isSearching && "cursor-wait opacity-80",
                  )}
                />
                {isSearching ? (
                  <LoaderCircle
                    size={16}
                    strokeWidth={1.9}
                    className="pointer-events-none absolute right-4 top-4 animate-spin text-[#f5c451]"
                  />
                ) : null}
              </span>
            </label>

            {error ? <p className="text-[13px] leading-5 text-[#fecaca]">{error}</p> : null}
            {warnings.length ? (
              <div className="space-y-2">
                {warnings.map((warning) => (
                  <p key={warning} className="text-[13px] leading-5 text-[#fcd34d] [html[data-theme='light']_&]:text-black">
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}

            {hasSearchQuery && (!error || companyCards.length > 0) ? (
              <div className="app-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                {companyCards.map((card) => (
                  <ResultCard
                    key={card.companyKey}
                    card={card}
                    isPending={isTracking && activeTrackingCompanyKey === card.companyKey}
                    onTrack={handleTrack}
                    onOpenWatchlist={openWatchlist}
                  />
                ))}

                {shouldShowEmptyState ? (
                  <div className="rounded-[18px] border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-4 py-5 text-[14px] leading-[22px] text-[var(--text-secondary)]">
                    No advertiser matches found for{" "}
                    <span className="font-medium text-[var(--text-primary)]">{trimmedQuery}</span>.
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <AppButton
        type="button"
        variant={triggerVariant}
        onClick={() => {
          onTriggerClick?.();
          setIsOpen(true);
        }}
        className={cn(triggerClassName, iconOnly && "h-10 w-10 rounded-[14px] px-0")}
        aria-label={iconOnly ? "Add advertiser" : undefined}
      >
        {triggerChildren ? (
          triggerChildren
        ) : (
          <>
            <Plus size={18} strokeWidth={1.75} />
            {!iconOnly ? <span>Add Advertiser</span> : null}
          </>
        )}
      </AppButton>

      {isMounted && toastElement ? createPortal(toastElement, document.body) : null}
      {isMounted && modalElement ? createPortal(modalElement, document.body) : null}
    </>
  );
}
