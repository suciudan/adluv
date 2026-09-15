"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";

import { type SourceName } from "@adluv/config";
import type { AdDetailRecord, BrowseAdRecord, SwipeFileCollectionSummary, SwipeFileEntry, SwipeFileLibrary } from "@adluv/db";

import { getAdModalDetailAction } from "../app/actions/ads";
import { deleteSwipeFileCollectionAction } from "../app/actions/swipe-file";
import { AppLinkButton, EmptyState, Toolbar, ToolbarSelect } from "./app-ui";
import { AdBentoCard, AdDetailsModal } from "./browse-ads-page";
import { SwipeFileCollectionCreator } from "./swipe-file-collection-creator";
import { getAdFormatKey } from "../lib/ad-format";
import { useWorkspaceHref } from "../lib/client-workspace";

type FormatFilter = "all" | "image" | "video" | "carousel" | "leadgen";
type PlatformFilter = "all" | Extract<SourceName, "facebook" | "google" | "linkedin">;
type AdModalDetailResponse =
  | {
      status: "ok";
      ad: AdDetailRecord;
    }
  | {
      status: "error";
      message: string;
    };
type DeleteCollectionResponse =
  | {
      status: "deleted";
    }
  | {
      status: "error";
      message: string;
    };

const platformOptions: Array<{ label: string; value: PlatformFilter }> = [
  { label: "Meta", value: "facebook" },
  { label: "Google", value: "google" },
  { label: "LinkedIn", value: "linkedin" },
];

function getAdvertiserOptions(entries: SwipeFileEntry[]) {
  return Array.from(new Set(entries.map((entry) => entry.advertiserName))).sort((left, right) => left.localeCompare(right));
}

function getCollectionOptions(collections: SwipeFileCollectionSummary[]) {
  return [...collections].sort((left, right) => left.name.localeCompare(right.name));
}

export function SwipeFilePageContent({ library }: { library: SwipeFileLibrary }) {
  const pathname = usePathname();
  const workspaceHref = useWorkspaceHref();
  const router = useRouter();
  const searchParams = useSearchParams();

  const collectionFilter = searchParams.get("collection") ?? "";
  const advertiserFilter = searchParams.get("advertiser") ?? "";
  const format = (searchParams.get("format") as FormatFilter | null) ?? "all";
  const platform = (searchParams.get("platform") as PlatformFilter | null) ?? "all";
  const modalAdId = searchParams.get("ad");
  const adDetailRequestRef = useRef(0);
  const closingModalAdIdRef = useRef<string | null>(null);
  const [selectedAd, setSelectedAd] = useState<BrowseAdRecord | null>(null);
  const [selectedAdDetail, setSelectedAdDetail] = useState<AdDetailRecord | null>(null);
  const [selectedAdError, setSelectedAdError] = useState<string | null>(null);
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [, startDetailTransition] = useTransition();
  const [isDeletingCollection, startDeleteCollectionTransition] = useTransition();
  const selectedCollection = library.collections.find((collection) => collection.id === collectionFilter) ?? null;

  const updateParams = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (
        !value ||
        (key === "format" && value === "all") ||
        (key === "platform" && value === "all")
      ) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    const queryString = next.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const filteredEntries = library.entries.filter((entry) => {
    if (collectionFilter && !entry.collections.some((collection) => collection.id === collectionFilter)) {
      return false;
    }

    if (advertiserFilter && entry.advertiserName !== advertiserFilter) {
      return false;
    }

    if (format !== "all" && getAdFormatKey(entry.adFormat) !== format) {
      return false;
    }

    if (platform !== "all" && entry.source !== platform) {
      return false;
    }

    return true;
  });

  const swipeFileCollectionOptions = library.collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
  }));
  const buildAdModalHref = (adId: string | null) => {
    const next = new URLSearchParams(searchParams.toString());

    if (adId) {
      next.set("ad", adId);
    } else {
      next.delete("ad");
    }

    const queryString = next.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  };
  const loadAdDetails = (adId: string, fallbackAd?: BrowseAdRecord | null) => {
    const requestId = adDetailRequestRef.current + 1;

    adDetailRequestRef.current = requestId;
    setSelectedAd(fallbackAd ?? null);
    setSelectedAdDetail(null);
    setSelectedAdError(null);
    startDetailTransition(async () => {
      const response = (await getAdModalDetailAction(adId)) as AdModalDetailResponse;

      if (adDetailRequestRef.current !== requestId) {
        return;
      }

      if (response.status === "error") {
        setSelectedAdError(response.message);
        return;
      }

      setSelectedAd(response.ad);
      setSelectedAdDetail(response.ad);
    });
  };
  const openAdDetails = (ad: BrowseAdRecord) => {
    closingModalAdIdRef.current = null;
    router.push(buildAdModalHref(ad.id), { scroll: false });
    loadAdDetails(ad.id, ad);
  };
  const closeAdDetails = () => {
    closingModalAdIdRef.current = modalAdId ?? selectedAd?.id ?? selectedAdDetail?.id ?? null;
    adDetailRequestRef.current += 1;
    setSelectedAd(null);
    setSelectedAdDetail(null);
    setSelectedAdError(null);
    router.replace(buildAdModalHref(null), { scroll: false });
  };

  useEffect(() => {
    if (!modalAdId) {
      closingModalAdIdRef.current = null;
      adDetailRequestRef.current += 1;
      setSelectedAd(null);
      setSelectedAdDetail(null);
      setSelectedAdError(null);
      return;
    }

    if (closingModalAdIdRef.current === modalAdId) {
      return;
    }

    if (selectedAd?.id === modalAdId || selectedAdDetail?.id === modalAdId) {
      return;
    }

    loadAdDetails(modalAdId, library.entries.find((entry) => entry.ad.id === modalAdId)?.ad ?? null);
  }, [modalAdId, library.entries, selectedAd?.id, selectedAdDetail?.id]);

  return (
    <div className="space-y-6">
      {selectedAd ? (
        <AdDetailsModal
          ad={selectedAd}
          detail={selectedAdDetail}
          error={selectedAdError}
          onClose={closeAdDetails}
          onRemovedFromWatchlist={() => {
            setSelectedAd((current) => (current ? { ...current, isWatched: false } : current));
            setSelectedAdDetail((current) => (current ? { ...current, isWatched: false } : current));
            router.refresh();
          }}
        />
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <p className="text-[13px] leading-5 text-[var(--text-tertiary)]">
            {filteredEntries.length} saved ad{filteredEntries.length === 1 ? "" : "s"}
          </p>

          <div className="flex flex-wrap items-center justify-start gap-3 xl:justify-end">
            {selectedCollection ? (
              <button
                type="button"
                disabled={isDeletingCollection}
                onClick={() => {
                  if (!window.confirm(`Delete "${selectedCollection.name}"? Saved ads will stay in your swipe file.`)) {
                    return;
                  }

                  startDeleteCollectionTransition(async () => {
                    setCollectionError(null);
                    const response = (await deleteSwipeFileCollectionAction(selectedCollection.id)) as DeleteCollectionResponse;

                    if (response.status === "error") {
                      setCollectionError(response.message);
                      return;
                    }

                    updateParams({ collection: null });
                    router.refresh();
                  });
                }}
                className="app-button app-button-destructive whitespace-nowrap"
              >
                <Trash2 size={16} strokeWidth={1.9} />
                {isDeletingCollection ? "Deleting..." : "Delete collection"}
              </button>
            ) : null}
            <SwipeFileCollectionCreator
              triggerClassName="app-button app-button-primary whitespace-nowrap sm:self-stretch"
            />
          </div>
        </div>

        {collectionError ? <p className="text-[13px] leading-5 text-[var(--pill-danger-text)]">{collectionError}</p> : null}

        <Toolbar>
          <div className="grid gap-3 lg:grid-cols-4">
            <ToolbarSelect
              label="Collection"
              value={collectionFilter}
              onChange={(event) => updateParams({ collection: event.target.value || null })}
            >
              <option value="">All collections</option>
              {getCollectionOptions(library.collections).map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </ToolbarSelect>

            <ToolbarSelect
              label="Advertiser"
              value={advertiserFilter}
              onChange={(event) => updateParams({ advertiser: event.target.value || null })}
            >
              <option value="">All advertisers</option>
              {getAdvertiserOptions(library.entries).map((advertiser) => (
                <option key={advertiser} value={advertiser}>
                  {advertiser}
                </option>
              ))}
            </ToolbarSelect>

            <ToolbarSelect
              label="Ad format"
              value={format}
              onChange={(event) => updateParams({ format: event.target.value })}
            >
              <option value="all">All</option>
              <option value="image">Image ad</option>
              <option value="video">Video ad</option>
              <option value="carousel">Carousel ad</option>
              <option value="text">Text ad</option>
              <option value="leadgen">Leadgen ad</option>
            </ToolbarSelect>

            <ToolbarSelect
              label="Platforms"
              value={platform}
              onChange={(event) => updateParams({ platform: event.target.value })}
            >
              <option value="all">All platforms</option>
              {platformOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </ToolbarSelect>
          </div>
        </Toolbar>
      </section>

      {filteredEntries.length ? (
        <section className="columns-1 gap-7 md:columns-2 xl:columns-4">
          {filteredEntries.map((entry) => (
            <AdBentoCard
              key={entry.savedAdId}
              ad={entry.ad}
              layout="columns"
              onOpenDetails={openAdDetails}
              swipeFileMeta={{
                savedAdId: entry.savedAdId,
                note: entry.note,
                savedAt: entry.savedAt,
                source: entry.source,
                collections: entry.collections,
                allCollections: swipeFileCollectionOptions,
              }}
            />
          ))}
        </section>
      ) : (
        <EmptyState
          title="You haven’t saved any ads yet"
          body="Save ads from Browse Ads, Activity Feed, or advertiser pages to build your swipe file."
          primaryAction={<AppLinkButton href={workspaceHref("/ads")} variant="primary">Browse ads</AppLinkButton>}
        />
      )}
    </div>
  );
}
