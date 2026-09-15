"use client";

import { useDeferredValue, useEffect, useRef, useState, useTransition } from "react";

import { getSourceLabel } from "@adluv/config";
import type { AdvertiserMatch } from "@adluv/source-adapters";

import posthog from "posthog-js";

import { createTrackedCompanyAction, searchAdvertisersAction } from "../app/actions/tracking";

const MIN_QUERY_LENGTH = 2;

type SearchResponse = {
  status: "ok";
  results: AdvertiserMatch[];
  warnings?: string[];
};

type SearchErrorResponse = {
  status: "error";
  message: string;
};

type TrackResponse = {
  status: "queued" | "existing";
  trackedCompany: {
    id: string;
    canonicalName: string;
  };
};

type TrackErrorResponse = {
  status: "error";
  message: string;
};

export function AdvertiserLookupPanel() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const latestRequestId = useRef(0);
  const [results, setResults] = useState<AdvertiserMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isSearching, startSearch] = useTransition();
  const [isTracking, startTracking] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const term = deferredQuery.trim();

    if (!term || term.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setError(null);
      setWarnings([]);
      return;
    }

    const requestId = ++latestRequestId.current;

    startSearch(async () => {
      const payload = (await searchAdvertisersAction(term)) as SearchResponse | SearchErrorResponse;

      if (latestRequestId.current !== requestId) {
        return;
      }

      if (payload.status === "error") {
        setResults([]);
        setWarnings([]);
        setError(payload.message);
        return;
      }

      setError(null);
      setResults(payload.results);
      setWarnings(payload.warnings ?? []);
    });
  }, [deferredQuery]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Missing from the archive?</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Add a new advertiser</h2>
        <p className="mt-2 text-sm leading-7 text-neutral-400">
          Search by company name, review the recommended advertiser profiles, and choose the one you want to add.
        </p>
      </div>

      <label className="block">
        <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-neutral-500">Company</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by company name"
          className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-neutral-600 focus:border-amber-500/40"
        />
      </label>

      {isSearching ? <p className="text-sm text-neutral-500">Searching advertiser profiles...</p> : null}
      {error ? <p className="text-sm text-rose-300">{error}</p> : null}
      {warnings.length ? (
        <div className="space-y-1">
          {warnings.map((warning) => (
            <p key={warning} className="text-sm text-amber-300">
              {warning}
            </p>
          ))}
        </div>
      ) : null}
      {!isSearching && !error && deferredQuery.trim().length >= MIN_QUERY_LENGTH && results.length === 0 ? (
        <p className="text-sm text-neutral-500">No verified advertiser profiles found for that name.</p>
      ) : null}
      {!isSearching && !error && deferredQuery.trim().length > 0 && deferredQuery.trim().length < MIN_QUERY_LENGTH ? (
        <p className="text-sm text-neutral-500">Enter at least {MIN_QUERY_LENGTH} characters to search.</p>
      ) : null}

      <div className="grid gap-3">
        {results.map((result) => (
          <div key={result.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                {result.logoUrl ? (
                  <img
                    src={result.logoUrl}
                    alt={`${result.canonicalName} logo`}
                    className="h-12 w-12 rounded-xl border border-neutral-800 bg-white object-contain p-1"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-sm font-semibold text-neutral-300">
                    {result.canonicalName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-white">{result.canonicalName}</p>
                    <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-400">
                      {getSourceLabel(result.source)}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm text-neutral-500">{result.profileUrl ?? result.sourceAdvertiserId}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isTracking}
                onClick={() => {
                  startTracking(async () => {
                    const response = (await createTrackedCompanyAction(result)) as TrackResponse | TrackErrorResponse;

                    if ("message" in response) {
                      setMessage(response.message);
                      return;
                    }

                    posthog.capture("advertiser_tracked", {
                      advertiser_id: result.id,
                      advertiser_name: result.canonicalName,
                      source: result.source,
                      is_new: response.status === "queued",
                    });
                    setMessage(`Queued ${response.trackedCompany.canonicalName} for watchlist indexing.`);
                  });
                }}
                className="inline-flex items-center rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isTracking ? "Queueing..." : "Add to watchlist"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {message ? <p className="text-sm text-neutral-400">{message}</p> : null}
    </div>
  );
}
