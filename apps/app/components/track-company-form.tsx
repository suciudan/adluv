"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useRef, useState, useTransition } from "react";

import { getSourceLabel } from "@adluv/config";
import type { AdvertiserMatch } from "@adluv/source-adapters";
import { Button, Card } from "@adluv/ui";

import { createTrackedCompanyAction, searchAdvertisersAction } from "../app/actions/tracking";
import { useWorkspaceHref } from "../lib/client-workspace";

const MIN_QUERY_LENGTH = 2;

type TrackResponse = {
  status: string;
  queued: boolean;
  trackedCompany: {
    id: string;
    status: string;
    advertiserId: string;
    canonicalName: string;
  };
};

type TrackErrorResponse = {
  status: "error";
  message: string;
};

type SearchResponse = {
  status: "ok";
  results: AdvertiserMatch[];
  warnings?: string[];
};

type SearchErrorResponse = {
  status: "error";
  message: string;
};

export function TrackCompanyForm(props: {
  alertConfigurationLabel: string;
  trackedCompaniesUsed: number;
  trackedCompanyLimit: number;
  alertsEnabled: boolean;
  syncEnabled: boolean;
}) {
  const workspaceHref = useWorkspaceHref();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const latestRequestId = useRef(0);
  const [results, setResults] = useState<AdvertiserMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [trackResult, setTrackResult] = useState<TrackResponse | null>(null);
  const [isSearching, startSearch] = useTransition();
  const [isTracking, startTracking] = useTransition();

  useEffect(() => {
    const searchTerm = deferredQuery.trim();

    if (!searchTerm || searchTerm.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setError(null);
      setWarnings([]);
      return;
    }

    const requestId = ++latestRequestId.current;
    const controller = new AbortController();

    startSearch(async () => {
      try {
        setError(null);
        const payload = (await searchAdvertisersAction(searchTerm)) as SearchResponse | SearchErrorResponse;

        if (payload.status === "error") {
          throw new Error(payload.message || "Search failed.");
        }

        if (latestRequestId.current === requestId) {
          setResults(payload.results);
          setWarnings(payload.warnings ?? []);
        }
      } catch (fetchError) {
        if (controller.signal.aborted) {
          return;
        }

        if (latestRequestId.current === requestId) {
          setResults([]);
          setWarnings([]);
          setError(fetchError instanceof Error ? fetchError.message : "Search failed.");
        }
      }
    });

    return () => {
      controller.abort();
    };
  }, [deferredQuery]);

  return (
    <Card className="max-w-4xl space-y-5 rounded-md border-neutral-800 bg-[#141518]">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Search and add</h2>
        <p className="text-sm text-neutral-400">
          Watchlist usage: {props.trackedCompaniesUsed} of {props.trackedCompanyLimit} tracked companies in use.
        </p>
        <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">
          Alert delivery {props.alertsEnabled ? "enabled" : "paused"} · {props.alertConfigurationLabel} · Sync{" "}
          {props.syncEnabled ? "enabled" : "disabled"}
        </p>
        {props.trackedCompaniesUsed >= props.trackedCompanyLimit ? (
          <p className="text-sm text-amber-300">
            This beta workspace is at capacity. You can still review existing trackers, but adding a new company will
            be blocked until the limit is raised.
          </p>
        ) : null}
      </div>

      <label className="block">
        <span className="mb-3 block text-sm font-medium text-neutral-300">Company name</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-4 py-3 text-white outline-none ring-0 transition placeholder:text-neutral-600 focus:border-amber-400"
          placeholder="Search by company name"
        />
      </label>

      <p className="text-xs text-neutral-500">
        Search public advertiser profiles by name across all supported sources, then choose the exact verified match.
      </p>

      {isSearching ? <p className="text-sm text-neutral-500">Searching...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
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
        <Card className="rounded-md border-dashed border-neutral-800 bg-neutral-950 text-sm text-neutral-400">
          No verified advertiser profiles found for that name.
        </Card>
      ) : null}
      {!isSearching && !error && deferredQuery.trim().length > 0 && deferredQuery.trim().length < MIN_QUERY_LENGTH ? (
        <Card className="rounded-md border-dashed border-neutral-800 bg-neutral-950 text-sm text-neutral-400">
          Enter at least {MIN_QUERY_LENGTH} characters to search.
        </Card>
      ) : null}

      <div className="grid gap-4">
        {results.map((result) => (
          <Card
            key={result.id}
            className="flex flex-col gap-4 rounded-md border-neutral-800 bg-neutral-900 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3">
              {result.logoUrl ? (
                <img
                  src={result.logoUrl}
                  alt={`${result.canonicalName} logo`}
                  className="h-12 w-12 rounded-xl border border-neutral-800 bg-white object-contain p-1"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-sm font-semibold text-neutral-300">
                  {result.canonicalName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-lg font-semibold">{result.canonicalName}</h3>
                  <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-400">
                    {getSourceLabel(result.source)}
                  </span>
                </div>
                <p className="truncate text-sm text-neutral-500">{result.profileUrl ?? result.sourceAdvertiserId}</p>
              </div>
            </div>

            <Button
              disabled={isTracking}
              onClick={() => {
                startTracking(async () => {
                  try {
                    setError(null);
                    const payload = (await createTrackedCompanyAction(result)) as TrackResponse | TrackErrorResponse;

                    if (payload.status === "error" || !("trackedCompany" in payload)) {
                      throw new Error(
                        "message" in payload ? payload.message : "Unable to create the tracker.",
                      );
                    }

                    setTrackResult(payload);
                  } catch (trackError) {
                    setTrackResult(null);
                    setError(
                      trackError instanceof Error ? trackError.message : "Unable to create the tracker.",
                    );
                  }
                });
              }}
            >
              {isTracking ? "Queueing..." : "Track company"}
            </Button>
          </Card>
        ))}
      </div>

      {trackResult ? (
        <Card className="rounded-md border-amber-500/20 bg-amber-500/8 text-white">
          <p className="text-xs uppercase tracking-[0.2em] text-amber-300">
            {trackResult.queued ? "Queued" : "Already tracked"}
          </p>
          <h3 className="mt-2 text-xl font-semibold">{trackResult.trackedCompany.canonicalName}</h3>
          <p className="mt-2 text-sm text-neutral-300">
            Status: <strong>{trackResult.trackedCompany.status}</strong>
          </p>
          <div className="mt-4">
            <Link
              href={workspaceHref("/watchlist")}
              className="inline-flex rounded-full border border-amber-400/30 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:border-amber-300 hover:text-white"
            >
              Open watchlist
            </Link>
          </div>
        </Card>
      ) : null}
    </Card>
  );
}
