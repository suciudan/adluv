"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { LoaderCircle, Plus, Search, X } from "lucide-react";
import type { AppShellSearchResult } from "@adluv/db";

import { searchAppShellAction } from "../app/actions/search";
import { AddAdvertiserRequestModal } from "./add-advertiser-request-modal";

type SearchResponse =
  | {
      status: "ok";
      results: AppShellSearchResult;
    }
  | {
      status: "error";
      message: string;
      results: AppShellSearchResult;
    };

const emptyResults: AppShellSearchResult = {
  ads: [],
  advertisers: [],
  landingPages: [],
};

export function AppShellSearch({
  placeholder = "Search advertisers",
  workspaceSlug,
}: {
  placeholder?: string;
  workspaceSlug: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AppShellSearchResult>(emptyResults);
  const [error, setError] = useState<string | null>(null);
  const [completedQuery, setCompletedQuery] = useState("");
  const [dismissedQuery, setDismissedQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (!trimmed) {
      setResults(emptyResults);
      setError(null);
      setCompletedQuery("");
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      startTransition(async () => {
        const response = (await searchAppShellAction(trimmed)) as SearchResponse;

        if (response.status === "error") {
          setError(response.message);
          setResults(response.results);
          setCompletedQuery(trimmed);
          return;
        }

        setError(null);
        setResults(response.results);
        setCompletedQuery(trimmed);
      });
    }, 180);

    return () => window.clearTimeout(timeout);
  }, [query]);

  const trimmedQuery = query.trim();
  const hasAdvertiserResults = results.advertisers.length > 0;
  const hasSettledResults = completedQuery === trimmedQuery;
  const showDropdown = trimmedQuery.length > 0 && hasSettledResults && !isPending && dismissedQuery !== trimmedQuery;

  useEffect(() => {
    if (!showDropdown) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setDismissedQuery(trimmedQuery);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [showDropdown, trimmedQuery]);

  return (
    <div ref={rootRef} className="relative">
      <label className="relative block">
        {isPending ? (
          <LoaderCircle
            size={18}
            strokeWidth={1.9}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 animate-spin text-[var(--text-tertiary)]"
          />
        ) : (
          <Search
            size={18}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
        )}
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setDismissedQuery("");
          }}
          onFocus={() => setDismissedQuery("")}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setDismissedQuery(trimmedQuery);
              event.currentTarget.blur();
            }
          }}
          placeholder={placeholder}
          className="app-input app-input-with-icon h-10 w-full pr-11"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              setDismissedQuery("");
            }}
            className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-tertiary)] transition hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
          >
            <X size={16} strokeWidth={1.9} />
          </button>
        ) : null}
      </label>

      {showDropdown ? (
        <div className="app-modal-surface absolute left-0 right-0 top-[calc(100%+12px)] z-50 overflow-hidden">
          <div className="app-scrollbar max-h-[70vh] overflow-y-auto p-4">
            {error ? (
              <div className="rounded-[18px] border border-[rgba(239,68,68,0.22)] bg-[rgba(239,68,68,0.12)] px-4 py-5 text-[14px] leading-[22px] text-[#fecaca]">
                {error}
              </div>
            ) : null}

            {!error && hasAdvertiserResults ? (
              <div className="space-y-5">
                <section className="space-y-2">
                  <p className="text-[12px] font-medium leading-4 text-[var(--text-tertiary)]">Advertisers</p>
                  {results.advertisers.map((item) => (
                    <Link
                      key={item.id}
                      href={`/w/${workspaceSlug}/advertisers/${item.id}/overview`}
                      onClick={() => setQuery("")}
                      className="flex items-center gap-3 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-3 transition hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-3)]"
                    >
                      {item.logoUrl ? (
                        <img
                          src={item.logoUrl}
                          alt={`${item.name} logo`}
                          className="h-10 w-10 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] object-cover"
                        />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] text-[12px] font-medium text-[var(--text-primary)]">
                          {item.name.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-[14px] font-medium leading-[22px] text-[var(--text-primary)]">
                          {item.name}
                        </span>
                        <span className="block truncate text-[13px] leading-5 text-[var(--text-secondary)]">
                          {[item.industry, item.country].filter(Boolean).join(" · ") || "Advertiser"}
                        </span>
                      </span>
                    </Link>
                  ))}
                </section>
              </div>
            ) : null}

            {!error && !hasAdvertiserResults ? (
              <div className="px-4 py-8 text-center">
                <p className="text-[14px] font-medium leading-[22px] text-[var(--text-primary)]">No advertiser matches</p>
                <p className="mt-2 text-[13px] leading-5 text-[var(--text-secondary)]">
                  Add this advertiser directly or open advertiser search with your query.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <AddAdvertiserRequestModal
                    triggerVariant="secondary"
                    triggerClassName="w-full sm:w-auto"
                    initialQuery={trimmedQuery}
                    triggerChildren={
                      <>
                        <Plus size={16} strokeWidth={1.9} />
                        <span>Add advertiser</span>
                      </>
                    }
                  />
                </div>
              </div>
            ) : null}
          </div>

          {hasAdvertiserResults ? (
          <div className="border-t border-[var(--border-subtle)] px-4 py-3">
            <AddAdvertiserRequestModal
              triggerVariant="ghost"
              triggerClassName="!min-h-0 !h-auto !px-0 text-[13px] font-medium leading-5 !text-[var(--accent-hover)] hover:!text-[var(--text-primary)]"
              initialQuery={trimmedQuery}
              triggerChildren={<span>Missing advertiser?</span>}
            />
          </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
