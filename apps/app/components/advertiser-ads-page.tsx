"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  CalendarClock,
  Download,
  Grid3X3,
  Megaphone,
  PieChart,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { getSourceLabel, supportedSourceNames, type SourceName } from "@adluv/config";
import type { AdDetailRecord, BrowseAdRecord } from "@adluv/db";

import { getAdModalDetailAction } from "../app/actions/ads";
import { AdBentoCard, AdDetailsModal } from "./browse-ads-page";
import { EmptyState, SurfaceCard, Toolbar, ToolbarInput, ToolbarSelect, cn } from "./app-ui";
import { SourceLogo } from "./source-logo";
import { getAdFormatKey, getAdFormatLabel } from "../lib/ad-format";

type AdvertiserAd = {
  id: string;
  sourceAdId: string | null;
  source: SourceName;
  title: string | null;
  body: string | null;
  transcript: string | null;
  format: string | null;
  callToAction: string | null;
  status: string | null;
  reactionCount: number;
  commentCount: number;
  destinationUrl: string | null;
  mediaUrl: string | null;
  posterUrl: string | null;
  videoUrl: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaAspectRatio: number | null;
  snapshotUrl: string | null;
  snapshotTitle: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  impressions: number | null;
  isSaved: boolean;
};
type FormatBreakdownItem = {
  label: string;
  count: number;
};

type SortFilter = "most_recent" | "longest_running" | "most_impressions";
type StatusFilter = "all" | "active" | "inactive";
type AgeFilter = "all" | "lt7" | "7_30" | "30_90" | "90_plus";
type PlatformSource = (typeof supportedSourceNames)[number];
type AdvertiserAdsSourceCandidate = Pick<
  AdvertiserAd,
  "source" | "destinationUrl" | "mediaUrl" | "posterUrl" | "snapshotUrl" | "videoUrl"
>;
type FilterChip = {
  label: string;
  value: string;
  remove: () => void;
};
type AdModalDetailResponse =
  | {
      status: "ok";
      ad: AdDetailRecord;
    }
  | {
      status: "error";
      message: string;
    };

const sortOptions: Array<{ label: string; value: SortFilter }> = [
  { label: "Most recent", value: "most_recent" },
  { label: "Most impressions", value: "most_impressions" },
  { label: "Longest running", value: "longest_running" },
];

const formatOptions = [
  { label: "Image ad", value: "image" },
  { label: "Video ad", value: "video" },
  { label: "Carousel ad", value: "carousel" },
  { label: "Text ad", value: "text" },
  { label: "Leadgen ad", value: "leadgen" },
];

const ctaOptions = [
  "All",
  "Apply",
  "Apply Now",
  "Attend",
  "Download",
  "Get Quote",
  "Join",
  "Learn more",
  "Register",
  "Request Demo",
  "See more",
  "Sign Up",
  "Subscribe",
  "View Quote",
];

const ageOptions: Array<{ label: string; value: AgeFilter }> = [
  { label: "<7 days", value: "lt7" },
  { label: "7–30 days", value: "7_30" },
  { label: "30–90 days", value: "30_90" },
  { label: "90+ days", value: "90_plus" },
];

function isPlatformSource(value: string | null): value is PlatformSource {
  return supportedSourceNames.some((source) => source === value);
}

function getAdvertiserAdLandingPageUrl(ad: Pick<AdvertiserAd, "destinationUrl" | "snapshotUrl">) {
  return ad.snapshotUrl ?? ad.destinationUrl;
}

function getAdvertiserAdAssetUrl(ad: Pick<AdvertiserAd, "mediaUrl" | "posterUrl" | "snapshotUrl" | "videoUrl">) {
  return ad.videoUrl ?? ad.mediaUrl ?? ad.posterUrl ?? ad.snapshotUrl;
}

function matchesLandingPageAndAsset(ad: AdvertiserAdsSourceCandidate, landingPage: string, asset: string) {
  if (landingPage && getAdvertiserAdLandingPageUrl(ad) !== landingPage) {
    return false;
  }

  if (asset && getAdvertiserAdAssetUrl(ad) !== asset) {
    return false;
  }

  return true;
}

function normalizeSourceHint(value: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") ?? "";
}

function getLandingPageSourceHint(landingPage: string): PlatformSource | null {
  if (!landingPage) {
    return null;
  }

  const candidates: string[] = [];

  try {
    const url = new URL(landingPage);

    candidates.push(url.searchParams.get("utm_source") ?? "");
    candidates.push(url.searchParams.get("source") ?? "");
  } catch {
    candidates.push(landingPage);
  }

  for (const candidate of candidates.map(normalizeSourceHint)) {
    if (["meta", "facebook", "fb", "instagram", "ig"].includes(candidate)) {
      return "facebook";
    }

    if (["linkedin", "linkedinads", "li"].includes(candidate)) {
      return "linkedin";
    }

    if (["google", "googleads", "adwords", "youtube", "yt"].includes(candidate)) {
      return "google";
    }
  }

  return null;
}

export function resolveAdvertiserAdsSource({
  ads,
  requestedSource,
  landingPage,
  asset,
}: {
  ads: AdvertiserAdsSourceCandidate[];
  requestedSource: string | null;
  landingPage: string;
  asset: string;
}): PlatformSource {
  if (isPlatformSource(requestedSource)) {
    return requestedSource;
  }

  const sourceHint = getLandingPageSourceHint(landingPage);
  const platformStats = supportedSourceNames.map((source, index) => {
    const sourceAds = ads.filter((ad) => ad.source === source);

    return {
      source,
      index,
      count: sourceAds.length,
      filteredCount: sourceAds.filter((ad) => matchesLandingPageAndAsset(ad, landingPage, asset)).length,
    };
  });
  const filteredMatch = platformStats
    .filter((entry) => entry.filteredCount > 0)
    .sort((left, right) => {
      if (sourceHint) {
        const hintDelta = Number(right.source === sourceHint) - Number(left.source === sourceHint);

        if (hintDelta !== 0) {
          return hintDelta;
        }
      }

      return right.filteredCount - left.filteredCount || left.index - right.index;
    })[0];

  return filteredMatch?.source ?? platformStats.find((entry) => entry.count > 0)?.source ?? "facebook";
}

function isSortFilter(value: string | null): value is SortFilter {
  return sortOptions.some((option) => option.value === value);
}

function getDurationDays(firstSeenAt: Date, lastSeenAt: Date) {
  return Math.max(1, Math.ceil((lastSeenAt.getTime() - firstSeenAt.getTime()) / (24 * 60 * 60 * 1000)));
}

function getDaysSince(date: Date) {
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function matchesAge(ad: AdvertiserAd, age: AgeFilter) {
  if (age === "all") {
    return true;
  }

  const days = getDaysSince(ad.firstSeenAt);

  if (age === "lt7") {
    return days < 7;
  }

  if (age === "7_30") {
    return days >= 7 && days <= 30;
  }

  if (age === "30_90") {
    return days > 30 && days <= 90;
  }

  return days > 90;
}

function formatCompactDate(date: Date) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildFormatBreakdown(ads: AdvertiserAd[]): FormatBreakdownItem[] {
  return Array.from(
    ads.reduce((acc, ad) => {
      const key = getAdFormatLabel(ad.format);
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<string, number>()),
  )
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function getLastUpdatedLabel(ads: AdvertiserAd[]) {
  const lastSeenAt = ads.reduce<Date | null>((latest, ad) => {
    if (!latest || ad.lastSeenAt > latest) {
      return ad.lastSeenAt;
    }

    return latest;
  }, null);

  return lastSeenAt ? formatCompactDate(lastSeenAt) : "Not available";
}

function escapeCsvCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadAdvertiserAdsCsv(advertiserName: string, ads: AdvertiserAd[]) {
  const headers = [
    "id",
    "source",
    "title",
    "body",
    "format",
    "callToAction",
    "status",
    "destinationUrl",
    "mediaUrl",
    "firstSeenAt",
    "lastSeenAt",
    "impressions",
    "reactions",
    "comments",
  ];
  const rows = ads.map((ad) => [
    ad.id,
    ad.source,
    ad.title,
    ad.body,
    ad.format,
    ad.callToAction,
    ad.status,
    ad.destinationUrl,
    ad.videoUrl ?? ad.mediaUrl,
    ad.firstSeenAt,
    ad.lastSeenAt,
    ad.impressions,
    ad.reactionCount,
    ad.commentCount,
  ]);
  const csv = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${advertiserName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "advertiser"}-ads.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function AdvertiserAdsSummary({ ads }: { ads: AdvertiserAd[] }) {
  const totalAds = ads.length;
  const uniqueAds = new Set(ads.map((ad) => ad.sourceAdId ?? ad.id)).size;
  const variants = Math.max(0, totalAds - uniqueAds);
  const activeAds = ads.filter((ad) => ad.status?.toLowerCase() === "active").length;

  return (
    <section className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="app-icon-chip">
          <Megaphone size={18} strokeWidth={1.75} />
        </span>
        <h2
          className="text-[28px] leading-[1] tracking-[-0.035em] text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-instrument-serif), serif" }}
        >
          Ads summary
        </h2>
      </div>

      <SurfaceCard className="flex-1 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">Unique ads</p>
        <p className="mt-3 text-4xl font-semibold leading-none text-[var(--text-primary)]">{uniqueAds}</p>
        <div className="mt-5 space-y-2 text-sm font-medium leading-6 text-[var(--text-secondary)]">
          <p className="inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.55)]" />
            <span className="text-emerald-300">{activeAds}</span>
            <span>active</span>
          </p>
          <p className="flex items-center gap-2">
            <Grid3X3 size={15} strokeWidth={1.8} className="text-[var(--text-tertiary)]" />
            <span>
              {totalAds} total ads{variants ? ` (${variants} variants)` : ""}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <CalendarClock size={15} strokeWidth={1.8} className="text-[var(--text-tertiary)]" />
            <span>Last updated {getLastUpdatedLabel(ads)}</span>
          </p>
        </div>
      </SurfaceCard>
    </section>
  );
}

function AdvertiserMediaMix({ formatBreakdown }: { formatBreakdown: FormatBreakdownItem[] }) {
  const total = Math.max(1, formatBreakdown.reduce((sum, item) => sum + item.count, 0));
  const visibleBreakdown = formatBreakdown.slice(0, 4);

  if (!visibleBreakdown.length) {
    return null;
  }

  return (
    <section className="flex h-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="app-icon-chip">
          <PieChart size={18} strokeWidth={1.75} />
        </span>
        <h2
          className="text-[28px] leading-[1] tracking-[-0.035em] text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-instrument-serif), serif" }}
        >
          Media mix
        </h2>
      </div>

      <SurfaceCard className="flex-1 p-4">
        <div className="space-y-4">
          {visibleBreakdown.map((item) => {
            const percentage = Math.round((item.count / total) * 100);
            const width = Math.max(10, percentage);

            return (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-[14px] font-medium leading-[22px] text-[var(--text-primary)]">
                    {getAdFormatLabel(item.label)}
                  </p>
                  <p className="text-[13px] leading-5 text-[var(--text-secondary)]">
                    {percentage}%
                  </p>
                </div>
                <div className="h-2.5 rounded-full bg-[var(--bg-surface-3)]">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,var(--accent-primary),var(--accent-hover))]"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </SurfaceCard>
    </section>
  );
}

export function AdvertiserAdsPage({
  advertiserId,
  advertiserName,
  advertiserLogoUrl,
  ads,
}: {
  advertiserId: string;
  advertiserName: string;
  advertiserLogoUrl: string | null;
  ads: AdvertiserAd[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const adDetailRequestRef = useRef(0);
  const closingModalAdIdRef = useRef<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedAd, setSelectedAd] = useState<BrowseAdRecord | null>(null);
  const [selectedAdDetail, setSelectedAdDetail] = useState<AdDetailRecord | null>(null);
  const [selectedAdError, setSelectedAdError] = useState<string | null>(null);
  const [, startDetailTransition] = useTransition();

  const requestedSort = searchParams.get("sort");
  const sort = isSortFilter(requestedSort) ? requestedSort : "most_recent";
  const status = (searchParams.get("status") as StatusFilter | null) ?? "all";
  const selectedFormats = searchParams.getAll("format");
  const cta = searchParams.get("cta") ?? "All";
  const age = (searchParams.get("age") as AgeFilter | null) ?? "all";
  const landingPage = searchParams.get("landingPage") ?? "";
  const asset = searchParams.get("asset") ?? "";
  const requestedSource = searchParams.get("source");
  const platformStats = supportedSourceNames.map((source) => ({
    source,
    count: ads.filter((ad) => ad.source === source).length,
  }));
  const source = resolveAdvertiserAdsSource({ ads, requestedSource, landingPage, asset });
  const sourceAds = ads.filter((ad) => ad.source === source);
  const formatBreakdown = buildFormatBreakdown(sourceAds);
  const rawQuery = searchParams.get("q") ?? "";
  const query = rawQuery.trim().toLowerCase();
  const modalAdId = searchParams.get("ad");

  const buildParamsHref = (updates: Record<string, string | string[] | null>) => {
    const next = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      next.delete(key);

      if (Array.isArray(value)) {
        for (const item of value) {
          if (item) {
            next.append(key, item);
          }
        }
        continue;
      }

      if (
        !value ||
        (key === "sort" && value === "most_recent") ||
        (key === "status" && value === "all") ||
        (key === "cta" && value === "All") ||
        (key === "age" && value === "all")
      ) {
        continue;
      }

      next.set(key, value);
    }

    const queryString = next.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  };

  const updateParams = (updates: Record<string, string | string[] | null>) => {
    router.push(buildParamsHref(updates));
  };
  const toBrowseAdRecord = useCallback((ad: AdvertiserAd): BrowseAdRecord => ({
    id: ad.id,
    source: ad.source,
    adLibraryUrl: null,
    advertiserId,
    advertiserName,
    advertiserLogoUrl,
    advertiserProfileUrl: null,
    advertiserWebsiteUrl: null,
    advertiserIndustry: null,
    advertiserCompanySize: null,
    advertiserCountry: null,
    advertiserSummary: null,
    title: ad.title,
    body: ad.body,
    transcript: ad.transcript,
    language: null,
    callToAction: ad.callToAction,
    destinationUrl: ad.destinationUrl,
    googleBrandUrl: null,
    mediaUrl: ad.mediaUrl,
    posterUrl: ad.posterUrl,
    videoUrl: ad.videoUrl,
    mediaWidth: ad.mediaWidth,
    mediaHeight: ad.mediaHeight,
    mediaAspectRatio: ad.mediaAspectRatio,
    format: ad.format,
    payer: null,
    status: ad.status,
    firstSeenAt: ad.firstSeenAt,
    lastSeenAt: ad.lastSeenAt,
    durationDays: getDurationDays(ad.firstSeenAt, ad.lastSeenAt),
    impressions: ad.impressions,
    variationCount: 1,
    reactions: ad.reactionCount,
    comments: ad.commentCount,
    engagementBand: "active",
    ageBand: "recent",
    isSaved: ad.isSaved,
    isWatched: false,
  }), [advertiserId, advertiserLogoUrl, advertiserName]);
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
  const loadAdDetails = useCallback((adId: string, fallbackAd?: BrowseAdRecord | null) => {
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
  }, [startDetailTransition]);
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

    const fallbackAd = ads.find((ad) => ad.id === modalAdId);
    loadAdDetails(modalAdId, fallbackAd ? toBrowseAdRecord(fallbackAd) : null);
  }, [modalAdId, ads, loadAdDetails, selectedAd?.id, selectedAdDetail?.id, toBrowseAdRecord]);

  const filteredAds = sourceAds
    .filter((ad) => {
      if (status === "active" && ad.status?.toLowerCase() !== "active") {
        return false;
      }

      if (status === "inactive" && ad.status?.toLowerCase() === "active") {
        return false;
      }

      if (selectedFormats.length && !selectedFormats.includes(getAdFormatKey(ad.format))) {
        return false;
      }

      if (cta !== "All" && ad.callToAction !== cta) {
        return false;
      }

      if (!matchesAge(ad, age)) {
        return false;
      }

      if (query) {
        const haystack = [
          ad.title ?? "",
          ad.body ?? "",
          ad.callToAction ?? "",
          ad.destinationUrl ?? "",
          ad.snapshotTitle ?? "",
        ]
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(query)) {
          return false;
        }
      }

      if (landingPage && getAdvertiserAdLandingPageUrl(ad) !== landingPage) {
        return false;
      }

      if (asset && getAdvertiserAdAssetUrl(ad) !== asset) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      if (sort === "most_recent") {
        return (
          right.firstSeenAt.getTime() - left.firstSeenAt.getTime() ||
          right.lastSeenAt.getTime() - left.lastSeenAt.getTime()
        );
      }

      if (sort === "most_impressions") {
        return (
          (right.impressions ?? 0) - (left.impressions ?? 0) ||
          right.firstSeenAt.getTime() - left.firstSeenAt.getTime() ||
          right.lastSeenAt.getTime() - left.lastSeenAt.getTime()
        );
      }

      if (sort === "longest_running") {
        return getDurationDays(right.firstSeenAt, right.lastSeenAt) - getDurationDays(left.firstSeenAt, left.lastSeenAt);
      }

      return (
        right.firstSeenAt.getTime() - left.firstSeenAt.getTime() ||
        right.lastSeenAt.getTime() - left.lastSeenAt.getTime()
      );
    });

  const chips: FilterChip[] = [];

  if (query) {
    chips.push({
      label: "Search",
      value: rawQuery.trim(),
      remove: () => updateParams({ q: null }),
    });
  }

  if (status !== "all") {
    chips.push({
      label: "Status",
      value: status === "active" ? "Active" : "Inactive",
      remove: () => updateParams({ status: null }),
    });
  }

  for (const selectedFormat of selectedFormats) {
    chips.push({
      label: "Format",
      value: formatOptions.find((option) => option.value === selectedFormat)?.label ?? selectedFormat,
      remove: () => updateParams({ format: selectedFormats.filter((value) => value !== selectedFormat) }),
    });
  }

  if (cta !== "All") {
    chips.push({
      label: "CTA",
      value: cta,
      remove: () => updateParams({ cta: null }),
    });
  }

  if (age !== "all") {
    chips.push({
      label: "Age",
      value: ageOptions.find((option) => option.value === age)?.label ?? age,
      remove: () => updateParams({ age: null }),
    });
  }

  if (landingPage) {
    chips.push({
      label: "Landing page",
      value: landingPage.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      remove: () => updateParams({ landingPage: null }),
    });
  }

  if (asset) {
    chips.push({
      label: "Asset",
      value: "Filtered",
      remove: () => updateParams({ asset: null }),
    });
  }

  const hasActiveFilters = chips.length > 0;
  const resetFiltersHref = `${pathname}?source=${source}`;

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

      <nav aria-label="Ad platform" className="flex flex-wrap gap-2">
        {platformStats.map((entry) => {
          const active = entry.source === source;

          return (
            <Link
              key={entry.source}
              href={buildParamsHref({ source: entry.source })}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition",
                active
                  ? "border-[rgba(124,58,237,0.28)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface-1)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              <SourceLogo source={entry.source} className={entry.source === "facebook" ? "h-4 w-6" : "h-4 w-4"} />
              <span>{getSourceLabel(entry.source)}</span>
              <span className="text-xs font-medium text-[var(--text-tertiary)]">{entry.count}</span>
            </Link>
          );
        })}
      </nav>

      <section className="grid items-stretch gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
        <AdvertiserAdsSummary ads={sourceAds} />
        <AdvertiserMediaMix formatBreakdown={formatBreakdown} />
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="text-[15px] leading-6 text-[var(--text-secondary)]">
              {filteredAds.length} ads for {advertiserName}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => downloadAdvertiserAdsCsv(advertiserName, filteredAds)}
              className="app-button app-button-secondary gap-2"
            >
              <Download size={16} strokeWidth={1.9} />
              Export CSV
            </button>

            <button
              type="button"
              onClick={() => setFiltersOpen((value) => !value)}
              className={cn(
                "app-button app-button-secondary gap-2",
                filtersOpen && "border-violet-500/30 bg-[var(--accent-soft)] text-[var(--text-primary)]",
              )}
            >
              <SlidersHorizontal size={16} strokeWidth={1.9} />
              {filtersOpen ? "Hide filters" : "Show filters"}
            </button>

            {hasActiveFilters ? (
              <button
                type="button"
                onClick={() => router.push(resetFiltersHref)}
                className="app-button app-button-ghost"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>

        {filtersOpen ? (
          <Toolbar>
            <div className="grid gap-4">
              <div className="grid gap-3 xl:grid-cols-[1.15fr_0.8fr_0.8fr]">
                <ToolbarInput
                  label="Search"
                  icon={Search}
                  value={rawQuery}
                  placeholder="Headline, copy, CTA, landing page"
                  onChange={(event) => updateParams({ q: event.target.value || null })}
                />

                <ToolbarSelect
                  label="Sort by"
                  value={sort}
                  onChange={(event) => updateParams({ sort: event.target.value })}
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </ToolbarSelect>

                <ToolbarSelect
                  label="Status"
                  value={status}
                  onChange={(event) => updateParams({ status: event.target.value || null })}
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </ToolbarSelect>
              </div>

              <div className="grid gap-3 xl:grid-cols-[1.1fr_0.8fr_0.8fr]">
                <div className="grid gap-[7px]">
                  <span className="text-[12px] font-medium leading-4 text-[var(--text-secondary)]">Ad format</span>
                  <div className="flex flex-wrap gap-2">
                    {formatOptions.map((option) => {
                      const active = selectedFormats.includes(option.value);

                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            updateParams({
                              format: active
                                ? selectedFormats.filter((value) => value !== option.value)
                                : [...selectedFormats, option.value],
                            })
                          }
                          className={cn(
                            "app-pill px-3 py-2",
                            active ? "app-pill-accent" : "app-pill-default",
                          )}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <ToolbarSelect
                  label="CTA type"
                  value={cta}
                  onChange={(event) => updateParams({ cta: event.target.value || null })}
                >
                  {ctaOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </ToolbarSelect>

                <ToolbarSelect
                  label="Ad age"
                  value={age}
                  onChange={(event) => updateParams({ age: event.target.value || null })}
                >
                  <option value="all">All ranges</option>
                  {ageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </ToolbarSelect>
              </div>
            </div>
          </Toolbar>
        ) : null}

        {chips.length ? (
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={`${chip.label}:${chip.value}`}
                type="button"
                onClick={chip.remove}
                className="app-pill app-pill-default px-3 py-2"
              >
                {chip.label}: {chip.value} ×
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {filteredAds.length ? (
        <section className="columns-1 gap-5 md:columns-2 lg:columns-5">
          {filteredAds.map((ad) => {
            const browseAd = toBrowseAdRecord(ad);

            return <AdBentoCard key={ad.id} ad={browseAd} layout="columns" onOpenDetails={openAdDetails} />;
          })}
        </section>
      ) : (
        <EmptyState
          title={hasActiveFilters ? "No ads match these filters" : `No ads to show for ${advertiserName}`}
          body={
            hasActiveFilters
              ? "Try a broader search, remove one filter, or switch to a different sort order."
              : "This advertiser does not have any indexed ads in this view yet."
          }
          primaryAction={
            hasActiveFilters ? (
              <button type="button" onClick={() => router.push(resetFiltersHref)} className="app-button app-button-primary">
                Clear filters
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
