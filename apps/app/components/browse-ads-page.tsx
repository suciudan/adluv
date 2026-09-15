"use client";

import { type ReactNode, type Ref, useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { BadgeInfo, Bookmark, Briefcase, Check, ChevronRight, Copy, ExternalLink, Eye, EyeOff, FolderOpen, Info, MoreHorizontal, Palette, Play, Plus, Share2, SlidersHorizontal, Target, Trash2, X } from "lucide-react";

import { type SourceName } from "@adluv/config";
import type { AdDetailRecord, BrowseAdRecord, BrowseAdsResult, BrowseAdsSort, MetaAdVariationRecord, MetaCreativeAssetRecord, SaveAdModalState } from "@adluv/db";

import { getAdModalDetailAction, getSaveAdModalStateAction, saveAdToSwipeFileAction } from "../app/actions/ads";
import { addAdvertiserToWatchlistByIdAction } from "../app/actions/advertisers";
import { moveSavedAdToCollectionAction, removeSavedAdAction, updateSavedAdNoteAction } from "../app/actions/swipe-file";
import { removeAdvertiserEntityFromWatchlistAction } from "../app/actions/tracking";
import { AdvertiserIdentity } from "./advertiser-identity";
import { EmptyState, Toolbar, ToolbarSelect, cn } from "./app-ui";
import { CreativeAssetMedia, isVideoCreativeAsset } from "./creative-asset-media";
import { SaveAdModalTrigger } from "./save-ad-modal-trigger";
import { SourceLogo } from "./source-logo";
import { getAdFormatKey, getAdFormatLabel } from "../lib/ad-format";
import { useWorkspaceHref } from "../lib/client-workspace";
import MetaLogo from "../../site/src/components/Brands/MetaLogo";

type AdAgeFilter = "all" | "lt7" | "7_30" | "30_90" | "90_plus";
type NetworkFilter = "google" | "linkedin" | "meta";
type NetworkSelectValue = "all" | NetworkFilter;
type StatusFilter = "all" | "active" | "inactive";
type WatchlistFilter = "all" | "watched" | "not_watched";
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
type SaveAdStateResponse =
  | {
      status: "ok";
      state: SaveAdModalState;
    }
  | {
      status: "error";
      message: string;
    };
type SaveAdNoteResponse =
  | {
      status: "ok";
      savedAdId: string;
      created: boolean;
    }
  | {
      status: "error";
      message: string;
    };
type SwipeFileCardCollection = {
  id: string;
  name: string;
};
type SwipeFileCardMeta = {
  savedAdId: string;
  note: string | null;
  savedAt: Date;
  source: SourceName;
  collections: SwipeFileCardCollection[];
  allCollections: SwipeFileCardCollection[];
};
type SwipeFileCardActionResponse =
  | {
      status: "updated" | "removed";
    }
  | {
      status: "error";
      message: string;
    };
type AdDetailsPresentation = "modal" | "page";
type GoogleSitelink = {
  title: string;
  description: string | null;
};

const sortOptions: Array<{ label: string; value: BrowseAdsSort }> = [
  { label: "Most recent", value: "most_recent" },
  { label: "Most impressions", value: "most_impressions" },
  { label: "Longest running", value: "longest_running" },
];

const ageOptions: Array<{ label: string; value: AdAgeFilter }> = [
  { label: "<7 days", value: "lt7" },
  { label: "7–30 days", value: "7_30" },
  { label: "30–90 days", value: "30_90" },
  { label: "90+ days", value: "90_plus" },
];

const formatOptions = [
  { label: "Image", value: "image" },
  { label: "Video", value: "video" },
  { label: "Carousel", value: "carousel" },
  { label: "Text", value: "text" },
  { label: "Leadgen", value: "leadgen" },
  { label: "DCO (Meta only)", value: "dco" },
];

const networkOptions: Array<{ label: string; value: NetworkFilter }> = [
  { label: "Meta", value: "meta" },
  { label: "Google Ads", value: "google" },
  { label: "LinkedIn", value: "linkedin" },
];

const networkSourceMap: Record<NetworkFilter, SourceName[]> = {
  google: ["google"],
  linkedin: ["linkedin"],
  meta: ["facebook"],
};

function compareAdsByMostRecent(left: BrowseAdRecord, right: BrowseAdRecord) {
  return (
    right.firstSeenAt.getTime() - left.firstSeenAt.getTime() ||
    right.lastSeenAt.getTime() - left.lastSeenAt.getTime() ||
    right.id.localeCompare(left.id)
  );
}

function isBrowseAdsSort(value: string | null): value is BrowseAdsSort {
  return sortOptions.some((option) => option.value === value);
}

function getDaysSince(date: Date) {
  const diff = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}

function getAgeMatch(ad: BrowseAdRecord, age: AdAgeFilter) {
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

function extractHostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? url;
  }
}

function isGoogleInternalDisplayUrl(value: string | null | undefined) {
  const normalized = value?.toLowerCase() ?? "";
  const hostname = extractHostname(value ?? "");

  return (
    !normalized ||
    hostname === "object.create" ||
    normalized.includes("adstransparency.google.com") ||
    normalized.includes("googleadservices.com") ||
    normalized.includes("googlesyndication.com") ||
    normalized.includes("googleusercontent.com") ||
    normalized.includes("doubleclick.net")
  );
}

function cleanDisplayUrl(value: string | null | undefined) {
  const rawValue = value?.trim();

  if (!rawValue) {
    return null;
  }

  const compactValue = rawValue.replace(/\s*\.\s*/g, ".").replace(/\s+/g, "");
  const urlValue = /^[a-z][a-z0-9+.-]*:\/\//i.test(compactValue) ? compactValue : `https://${compactValue}`;
  let hostname: string;

  try {
    hostname = new URL(urlValue).hostname;
  } catch {
    hostname = compactValue.replace(/^https?:\/\//i, "").split(/[/?#]/)[0] ?? "";
  }

  const normalized = hostname
    .toLowerCase()
    .replace(/^www\.|^www(?=[a-z][a-z0-9-]*\.)/i, "")
    .replace(/\/+$/g, "");

  return normalized && !isGoogleInternalDisplayUrl(normalized) ? normalized : null;
}

function extractDisplayUrlFromText(value: string | null | undefined) {
  const match = value?.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s"'<>]*)?/i);

  return cleanDisplayUrl(match?.[0]);
}

function getGoogleBrandDisplayUrl(ad: BrowseAdRecord, details?: NonNullable<AdDetailRecord["googleDetails"]> | null) {
  return (
    cleanDisplayUrl(details?.brandUrl) ??
    cleanDisplayUrl(ad.googleBrandUrl) ??
    cleanDisplayUrl(ad.destinationUrl) ??
    extractDisplayUrlFromText(ad.body) ??
    extractDisplayUrlFromText(ad.title) ??
    cleanDisplayUrl(ad.advertiserWebsiteUrl)
  );
}

function isGoogleOcrNoiseLine(line: string) {
  const normalized = line.trim();
  const alphanumeric = normalized.replace(/[^\p{L}\p{N}]+/gu, "");
  const hasLowercase = /\p{Ll}/u.test(normalized);
  const wordCount = normalized.split(/\s+/).filter((part) => /[\p{L}\p{N}]/u.test(part)).length;

  if (!alphanumeric) {
    return true;
  }

  if (/^(?:ad|sponsored|learn more)$/i.test(normalized)) {
    return true;
  }

  if (normalized.length <= 2 || alphanumeric.length <= 2) {
    return true;
  }

  if ((wordCount === 1 && normalized.length <= 4) || (wordCount === 2 && normalized.length <= 6)) {
    return true;
  }

  return !hasLowercase && wordCount <= 2 && normalized.length <= 14;
}

function normalizeGoogleCopyComparisonText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9./&+\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getGoogleBrandHints(ad: BrowseAdRecord) {
  const hints = new Set<string>();

  for (const value of [
    ad.advertiserName,
    extractHostname(ad.googleBrandUrl ?? ""),
    extractHostname(ad.destinationUrl ?? ""),
    extractHostname(ad.advertiserWebsiteUrl ?? ""),
  ]) {
    const normalized = normalizeGoogleCopyComparisonText(value.replace(/^www\./i, "").split(".")[0] ?? value);

    if (normalized) {
      hints.add(normalized);
    }
  }

  return hints;
}

function isGoogleAdvertiserHeaderCopyLine(line: string, ad: BrowseAdRecord) {
  const normalized = normalizeGoogleCopyComparisonText(line.replace(/^[<\[\{(|]+/g, "").replace(/^[a-z]\s+/i, ""));

  if (!normalized || normalized.length > 48) {
    return false;
  }

  return [...getGoogleBrandHints(ad)].some((hint) => normalized === hint || normalized === `www ${hint}`);
}

function getGoogleCreativeCopyLines(ad: BrowseAdRecord) {
  if (ad.source !== "google" || !ad.body) {
    return [];
  }

  return ad.body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.replace(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s"'<>]*)?/gi, "").trim())
    .filter((line) => line && !isGoogleOcrNoiseLine(line) && !isGoogleAdvertiserHeaderCopyLine(line, ad));
}

function isGoogleNoisyTitle(ad: BrowseAdRecord) {
  return ad.source === "google" && Boolean(ad.title && isGoogleOcrNoiseLine(ad.title));
}

function isGoogleBrandOnlyTitle(title: string, ad: BrowseAdRecord) {
  const normalizedTitle = normalizeGoogleCopyComparisonText(title);

  if (!normalizedTitle || normalizedTitle.length < 4 || normalizedTitle.length > 32) {
    return false;
  }

  return [...getGoogleBrandHints(ad)].some((hint) => {
    const firstHintToken = hint.split(" ")[0] ?? "";

    return (
      hint === normalizedTitle ||
      (firstHintToken.length >= 4 && firstHintToken === normalizedTitle) ||
      (normalizedTitle.length >= 4 && hint.startsWith(`${normalizedTitle} `))
    );
  });
}

function getGoogleDisplayTitle(ad: BrowseAdRecord) {
  if (ad.source !== "google") {
    return ad.title;
  }

  if (ad.title && !isGoogleNoisyTitle(ad) && !isGoogleBrandOnlyTitle(ad.title, ad)) {
    return ad.title;
  }

  return getGoogleCreativeCopyLines(ad)[0] ?? ad.title;
}

function getGoogleBodyCopy(ad: BrowseAdRecord) {
  if (ad.source !== "google") {
    return ad.body;
  }

  const cleanedCopy = getGoogleBodyLines(ad).join("\n").trim();

  return cleanedCopy || null;
}

function getGoogleBodyContentLines(ad: BrowseAdRecord) {
  if (ad.source !== "google") {
    return ad.body ? [ad.body] : [];
  }

  const copyLines = getGoogleCreativeCopyLines(ad);
  const displayTitle = getGoogleDisplayTitle(ad);
  const bodyLines = isGoogleNoisyTitle(ad) ? copyLines.slice(1) : copyLines;
  const dedupedLines =
    displayTitle && bodyLines[0] && normalizeGoogleCopyComparisonText(bodyLines[0]) === normalizeGoogleCopyComparisonText(displayTitle)
      ? bodyLines.slice(1)
      : bodyLines;

  return dedupedLines;
}

function isLikelyGoogleSitelinkLine(line: string) {
  const trimmed = line.trim();

  if (trimmed.length < 2 || trimmed.length > 48) {
    return false;
  }

  if (/[.!?…]$/.test(trimmed)) {
    return false;
  }

  if (/[,;:]/.test(trimmed)) {
    return false;
  }

  return /[a-z0-9]/i.test(trimmed);
}

function getGoogleTrailingSitelinkLines(lines: string[]) {
  const sitelinkLines: string[] = [];

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? "";

    if (!isLikelyGoogleSitelinkLine(line)) {
      break;
    }

    sitelinkLines.unshift(line);
  }

  return sitelinkLines.length >= 2 ? sitelinkLines : [];
}

function getGoogleBodyLines(ad: BrowseAdRecord) {
  const lines = getGoogleBodyContentLines(ad);
  const sitelinkLines = getGoogleTrailingSitelinkLines(lines);

  return sitelinkLines.length ? lines.slice(0, -sitelinkLines.length) : lines;
}

function getGoogleSitelinks(ad: BrowseAdRecord): GoogleSitelink[] {
  if (ad.source !== "google") {
    return [];
  }

  return getGoogleTrailingSitelinkLines(getGoogleBodyContentLines(ad)).map((title) => ({
    title,
    description: null,
  }));
}

function isActiveAd(ad: Pick<BrowseAdRecord, "status">) {
  return ad.status?.toLowerCase() === "active";
}

function formatRunDateRange(ad: Pick<BrowseAdRecord, "firstSeenAt" | "lastSeenAt" | "durationDays" | "status">) {
  const startLabel = ad.firstSeenAt ? formatCompactDate(ad.firstSeenAt) : null;
  const endLabel = isActiveAd(ad) ? "Now" : ad.lastSeenAt ? formatCompactDate(ad.lastSeenAt) : null;
  const durationLabel = ad.durationDays ? `${ad.durationDays}d` : null;

  if (startLabel && endLabel && durationLabel) {
    return `${startLabel} - ${endLabel} (${durationLabel})`;
  }

  if (startLabel && endLabel) {
    return `${startLabel} - ${endLabel}`;
  }

  if (durationLabel) {
    return durationLabel;
  }

  return "Date unavailable";
}

function formatDurationDays(durationDays: number) {
  return `${durationDays} ${durationDays === 1 ? "Day" : "Days"}`;
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getPlatformLabel(source: SourceName) {
  if (source === "google") {
    return "Google";
  }

  if (source === "linkedin") {
    return "LinkedIn";
  }

  return "Meta";
}

function getAspectRatioLabel(input: BrowseAdRecord) {
  const ratio =
    (input.mediaWidth && input.mediaHeight ? input.mediaWidth / input.mediaHeight : null) ??
    input.mediaAspectRatio;

  if (!ratio || !Number.isFinite(ratio)) {
    return "Unknown";
  }

  const knownRatios = [
    { label: "1:1", value: 1 },
    { label: "4:5", value: 4 / 5 },
    { label: "3:4", value: 3 / 4 },
    { label: "4:3", value: 4 / 3 },
    { label: "16:9", value: 16 / 9 },
    { label: "9:16", value: 9 / 16 },
  ];
  const matched = knownRatios.find((item) => Math.abs(item.value - ratio) < 0.04);

  return matched?.label ?? `${ratio.toFixed(2)}:1`;
}

function isNetworkFilter(value: string): value is NetworkFilter {
  return networkOptions.some((option) => option.value === value);
}

function matchesNetworkFilter(source: SourceName, selectedNetwork: NetworkSelectValue) {
  if (selectedNetwork === "all") {
    return true;
  }

  return networkSourceMap[selectedNetwork].includes(source);
}

const bentoRowHeight = 1;
const bentoGapPx = 20;
const adBentoGridItemClass = "w-full min-h-0";
const adBentoColumnItemClass = "mb-7 inline-block w-full break-inside-avoid";
const feedMediaMinAspectRatio = 9 / 16;
const feedMediaMaxAspectRatio = 16 / 9;
const extremeTallMediaFallbackAspectRatio = 4 / 5;

function clampFeedMediaAspectRatio(ratio: number) {
  return Math.min(feedMediaMaxAspectRatio, Math.max(feedMediaMinAspectRatio, ratio));
}

function getStoredMediaAspectRatio(ad: Pick<BrowseAdRecord, "mediaWidth" | "mediaHeight" | "mediaAspectRatio">) {
  return ad.mediaWidth && ad.mediaHeight
    ? ad.mediaWidth / ad.mediaHeight
    : ad.mediaAspectRatio;
}

function isExtremeTallMedia(ad: Pick<BrowseAdRecord, "mediaWidth" | "mediaHeight" | "mediaAspectRatio">) {
  const ratio = getStoredMediaAspectRatio(ad);

  return Boolean(ratio && Number.isFinite(ratio) && ratio < 0.25);
}

function getFeedMediaAspectRatio(ad: BrowseAdRecord) {
  const storedRatio = getStoredMediaAspectRatio(ad);

  if (storedRatio && Number.isFinite(storedRatio)) {
    if (isExtremeTallMedia(ad)) {
      return extremeTallMediaFallbackAspectRatio;
    }

    return clampFeedMediaAspectRatio(storedRatio);
  }

  return isVideoAd(ad) ? 16 / 9 : 4 / 5;
}

function getPreferredMediaAspectRatio(ad: BrowseAdRecord) {
  const storedRatio = getStoredMediaAspectRatio(ad);

  if (storedRatio && Number.isFinite(storedRatio)) {
    if (isExtremeTallMedia(ad)) {
      return extremeTallMediaFallbackAspectRatio;
    }

    return clampFeedMediaAspectRatio(storedRatio);
  }

  return ad.videoUrl ? 16 / 9 : 4 / 5;
}

function isVideoAd(ad: BrowseAdRecord) {
  return Boolean(ad.videoUrl) || getAdFormatKey(ad.format) === "video" || isVideoCreativeAsset(ad.mediaUrl ?? "", ad.format);
}

function shouldContainFeedMedia(ad: BrowseAdRecord) {
  const ratio = getStoredMediaAspectRatio(ad);

  return isExtremeTallMedia(ad) || (isVideoAd(ad) && Boolean(ratio && Number.isFinite(ratio) && ratio < 1));
}

function isTextAd(ad: Pick<BrowseAdRecord, "format">) {
  return getAdFormatKey(ad.format) === "text";
}

function isGoogleImageAd(ad: Pick<BrowseAdRecord, "source" | "format">) {
  return ad.source === "google" && getAdFormatKey(ad.format) === "image";
}

function isLinkedInJobAd(ad: Pick<BrowseAdRecord, "source" | "format">) {
  return ad.source === "linkedin" && getAdFormatKey(ad.format) === "job";
}

function isLinkedInMessageAd(ad: Pick<BrowseAdRecord, "source" | "format">) {
  return ad.source === "linkedin" && getAdFormatKey(ad.format) === "message";
}

function isLinkedInFollowCompanyAd(ad: Pick<BrowseAdRecord, "source" | "format">) {
  return ad.source === "linkedin" && getAdFormatKey(ad.format) === "follow";
}

function getLinkedInFollowCompanyHeadline(ad: Pick<BrowseAdRecord, "advertiserName" | "title">) {
  return ad.title?.trim() || `Follow ${ad.advertiserName} on LinkedIn`;
}

function getLinkedInFollowCompanyBody(ad: Pick<BrowseAdRecord, "advertiserName" | "body">) {
  return ad.body?.trim() || `Stay up to date with ${ad.advertiserName} by following their company page.`;
}

function getBentoColumnSpanClass(ad: BrowseAdRecord) {
  void ad;
  return "";
}

function estimateBentoRowSpan(ad: BrowseAdRecord) {
  const ratio = getPreferredMediaAspectRatio(ad);
  const copyWeight = Math.min(8, Math.ceil(((ad.title?.length ?? 0) + (ad.body?.length ?? 0)) / 140));

  if (isVideoAd(ad)) {
    return Math.max(18, Math.round(20 + (1 / Math.max(0.7, ratio)) * 8 + copyWeight));
  }

  return Math.max(22, Math.round(26 + (1 / Math.max(0.55, ratio)) * 10 + copyWeight));
}

function AdMediaPlaceholder() {
  return (
    <div
      className="relative isolate flex h-full min-h-[12rem] items-stretch overflow-hidden bg-[linear-gradient(145deg,rgba(18,16,28,0.96),rgba(11,10,18,0.98))]"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.24),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.14),transparent_26%)]" />

      <div className="relative flex h-full w-full flex-col justify-between p-6">
        <div className="mt-auto space-y-3">
          <p className="text-[22px] font-semibold leading-[1.05] tracking-[-0.03em] text-white">
            Creative missing
          </p>
        </div>
      </div>
    </div>
  );
}

function AdMediaPreview({
  ad,
  className,
  controls = false,
}: {
  ad: BrowseAdRecord;
  className: string;
  controls?: boolean;
}) {
  const shouldPreferVideo = Boolean(ad.videoUrl);
  const posterSrc = ad.posterUrl ?? ad.mediaUrl ?? null;
  const previewSrc = shouldPreferVideo ? ad.videoUrl ?? null : ad.mediaUrl ?? ad.posterUrl ?? ad.videoUrl ?? null;
  const fallbackSrc = shouldPreferVideo ? posterSrc : ad.videoUrl ?? null;
  const [useFallback, setUseFallback] = useState(false);
  const [hasMediaError, setHasMediaError] = useState(false);
  const mediaSrc = useFallback ? fallbackSrc : previewSrc;
  const isRenderingVideo = Boolean(mediaSrc && ad.videoUrl && mediaSrc === ad.videoUrl);
  const shouldShowVideoPosterOverlay = isVideoAd(ad) && !isRenderingVideo && Boolean(mediaSrc);
  const mediaHint = isRenderingVideo ? ad.format : null;

  useEffect(() => {
    setUseFallback(false);
    setHasMediaError(false);
  }, [previewSrc, fallbackSrc, ad.videoUrl, ad.posterUrl, ad.format]);

  if (!mediaSrc || hasMediaError) {
    return <AdMediaPlaceholder />;
  }

  const media = (
    <CreativeAssetMedia
      key={`${mediaSrc}:${posterSrc ?? ""}`}
      src={mediaSrc}
      alt={getGoogleDisplayTitle(ad) ?? ad.title ?? ad.advertiserName}
      hint={mediaHint}
      kind={isRenderingVideo ? "video" : undefined}
      poster={isRenderingVideo ? posterSrc : undefined}
      controls={controls && isRenderingVideo}
      className={className}
      onMediaError={() => {
        if (!useFallback && fallbackSrc && fallbackSrc !== mediaSrc) {
          setUseFallback(true);
          return;
        }

        setHasMediaError(true);
      }}
    />
  );

  if (!shouldShowVideoPosterOverlay) {
    return media;
  }

  return (
    <div className="relative h-full w-full">
      {media}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-sm">
          <Play size={22} strokeWidth={2.2} fill="currentColor" className="ml-0.5" />
        </span>
      </div>
    </div>
  );
}

function AdvertiserLogo({
  name,
  logoUrl,
  className = "h-10 w-10",
  fallbackClassName,
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Advertiser logos are arbitrary remote source assets.
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className={cn(className, "aspect-square shrink-0 rounded-full border border-[rgba(0,0,0,0.08)] bg-white object-cover")}
      />
    );
  }

  return (
    <span
      className={cn(
        className,
        "inline-flex aspect-square shrink-0 items-center justify-center rounded-full border border-[#2f2a3d] bg-[#171321] text-sm font-semibold text-[#e4e6eb] [html[data-theme='light']_&]:border-[#dadde1] [html[data-theme='light']_&]:bg-[#f0f2f5] [html[data-theme='light']_&]:text-[#050505]",
        fallbackClassName,
      )}
    >
      {initials}
    </span>
  );
}

function LinkedInJobAdPreview({
  ad,
  className,
  compact = false,
}: {
  ad: BrowseAdRecord;
  className?: string;
  compact?: boolean;
}) {
  const headline = ad.title ?? `%FIRSTNAME%, explore jobs at ${ad.advertiserName} that match your skills`;
  const ctaLabel = ad.callToAction?.trim() || "See More Jobs";

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-[#151918] text-center text-[#e4e6eb]",
        compact ? "px-4 py-4" : "px-5 py-8",
        className,
      )}
    >
      <div className={cn("mx-auto flex w-full flex-col items-center", compact ? "max-w-xs gap-3" : "max-w-sm gap-6")}>
        <div className={cn("flex items-center justify-center", compact ? "gap-4" : "gap-6")}>
          <span
            aria-hidden="true"
            className={cn(
              "relative inline-flex shrink-0 items-center justify-center text-[#9fb4c8]",
              compact ? "h-10 w-10" : "h-20 w-20",
            )}
          >
            <span className="absolute top-0 h-1/2 w-1/2 rounded-full bg-current opacity-80" />
            <span className="absolute bottom-0 h-1/2 w-4/5 rounded-t-full bg-current opacity-90" />
          </span>
          <AdvertiserLogo
            name={ad.advertiserName}
            logoUrl={ad.advertiserLogoUrl}
            className={cn("shrink-0 rounded-none object-contain", compact ? "h-10 w-10" : "h-20 w-20")}
            fallbackClassName="rounded-full"
          />
        </div>

        <p className={cn("text-balance font-medium", compact ? "text-[14px] leading-5" : "text-[20px] leading-7")}>
          {headline}
        </p>

        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full border border-blue-600 px-5 font-semibold text-blue-400",
            compact ? "h-9 text-[13px]" : "h-12 text-[18px]",
          )}
        >
          {ctaLabel}
        </span>
      </div>
    </div>
  );
}

function LinkedInMessageAdPreview({
  ad,
  className,
  compact = false,
}: {
  ad: BrowseAdRecord;
  className?: string;
  compact?: boolean;
}) {
  const sender = ad.title?.replace(/^Message from\s+/i, "").trim() || ad.payer || ad.advertiserName;
  const messageLines =
    ad.body
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean) ?? [];
  const messageSnippet = messageLines.slice(0, compact ? 2 : 4).join(" ");
  const ctaLabel = ad.callToAction?.trim() || "Request a Demo";

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col justify-center bg-[#151918] text-[#e4e6eb] [html[data-theme='light']_&]:bg-white [html[data-theme='light']_&]:text-[#050505]",
        compact ? "gap-4 px-4 py-6 sm:px-5" : "gap-4 px-6 py-5 sm:px-8 sm:py-6",
        className,
      )}
    >
      <div className="min-w-0">
        <p className={cn("font-semibold leading-tight", compact ? "text-[15px]" : "text-[18px]")}>{sender}</p>
        <p
          className={cn(
            "mt-2 text-[var(--text-secondary)]",
            compact ? "line-clamp-2 text-[14px] leading-5" : "line-clamp-4 text-[16px] leading-6",
          )}
        >
          {messageSnippet || "Hi %FIRSTNAME%,"}
        </p>
      </div>

      <div>
        <div
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-[rgba(255,255,255,0.06)] font-semibold text-[var(--text-primary)] [html[data-theme='light']_&]:bg-[#edf3f8] [html[data-theme='light']_&]:text-[#0a66c2]",
            compact ? "h-9 px-4 text-[13px]" : "h-10 px-5 text-[15px]",
          )}
        >
          {ctaLabel}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-5 text-sm leading-6">
      <dt className="text-[var(--text-secondary)]">{label}</dt>
      <dd className="min-w-0 max-w-64 text-right font-medium text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-[13px] font-semibold uppercase leading-5 tracking-wider text-[var(--text-tertiary)]">
        {title}
      </h3>
      <dl className="space-y-2.5">{children}</dl>
    </section>
  );
}

function formatCreativeDuration(seconds: number | null | undefined) {
  if (!seconds) {
    return "Not available";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (!minutes) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

function getMetaCreativeMetric(input: {
  format: string | null;
  variationCount: number;
  carouselSlides?: number | null;
  creativeDurationSeconds?: number | null;
}) {
  const formatKey = getAdFormatKey(input.format);

  if (formatKey === "carousel") {
    return {
      label: "Carousel Slides",
      value: input.carouselSlides ? String(input.carouselSlides) : "Not available",
    };
  }

  if (formatKey === "image" && input.variationCount > 1) {
    return {
      label: "Variations",
      value: `${input.variationCount} total`,
    };
  }

  return {
    label: "Duration",
    value: formatCreativeDuration(input.creativeDurationSeconds),
  };
}

function getLinkedInCreativeRows(input: {
  details: NonNullable<AdDetailRecord["linkedInDetails"]> | null;
  format: string | null;
  language: string | null;
}) {
  const formatKey = getAdFormatKey(input.format);
  const mediaType = input.details?.mediaType ?? (formatKey === "text" || formatKey === "follow" ? "Text" : formatKey === "video" ? "Video" : formatKey === "document" ? "Document" : "Image");
  const format = input.details?.format ?? (formatKey === "text" ? "Text" : formatKey === "follow" ? "Follow Company" : formatKey === "carousel" ? "Carousel" : formatKey === "document" ? "Document" : "Single");
  const rows = [
    { label: "Language", value: input.language ?? input.details?.language ?? "English" },
    { label: "Format", value: format },
  ];

  if (format === "Carousel" || format === "Document") {
    rows.push({
      label: format === "Document" ? "Preview Slides" : "Carousel Items",
      value: input.details?.carouselItems ? String(input.details.carouselItems) : "Not available",
    });
  }

  rows.push({ label: "Media Type", value: mediaType });

  if (mediaType === "Video") {
    rows.push({
      label: "Duration",
      value: formatCreativeDuration(input.details?.creativeDurationSeconds),
    });
    rows.push({
      label: "Ad Type",
      value: input.details?.adType ?? "Video Ad",
    });
  } else if (input.details?.adType) {
    rows.push({
      label: "Ad Type",
      value: input.details.adType,
    });
  }

  return rows;
}

function formatLinkedInCountryImpressions(countries: NonNullable<AdDetailRecord["linkedInDetails"]>["countryImpressions"]) {
  if (!countries.length) {
    return "Not available";
  }

  return countries
    .slice(0, 5)
    .map((country) => `${country.country} ${country.percentage}`)
    .join(", ");
}

function formatMetaCountryList(countries: string[]) {
  if (!countries.length) {
    return "Not available";
  }

  return countries.slice(0, 8).join(", ");
}

function formatMetaPlatformSummary(platforms: string[]) {
  if (!platforms.length) {
    return "Meta";
  }

  if (platforms.includes("Facebook") && platforms.includes("Instagram")) {
    return "Meta";
  }

  return platforms.slice(0, 2).join(", ");
}

function MetaDetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-5 text-[14px] leading-6">
      <dt className="text-[var(--text-secondary)]">{label}</dt>
      <dd className="min-w-0 max-w-64 text-right font-semibold text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function MetaDetailSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 text-[14px] font-bold leading-5 text-[var(--text-primary)]">
        <span className="inline-flex h-4 w-4 items-center justify-center text-[var(--text-primary)]">{icon}</span>
        {title}
      </h3>
      <dl className="space-y-1.5">{children}</dl>
    </section>
  );
}

function LinkedInFollowCompanyAdPreview({
  ad,
  className,
  compact = false,
}: {
  ad: BrowseAdRecord;
  className?: string;
  compact?: boolean;
}) {
  const headline = getLinkedInFollowCompanyHeadline(ad);
  const body = getLinkedInFollowCompanyBody(ad);

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-[#151918] text-[#e4e6eb]",
        compact ? "px-4 py-5" : "px-6 py-8",
        className,
      )}
    >
      <div className={cn("mx-auto flex w-full flex-col items-center text-center", compact ? "max-w-xs gap-3" : "max-w-sm gap-5")}>
        <AdvertiserLogo
          name={ad.advertiserName}
          logoUrl={ad.advertiserLogoUrl}
          className={cn("shrink-0", compact ? "h-12 w-12" : "h-20 w-20")}
        />
        <div className="space-y-2">
          <p className={cn("font-semibold", compact ? "text-[15px] leading-5" : "text-[21px] leading-7")}>{headline}</p>
          <p className={cn("text-[#b0b3b8]", compact ? "line-clamp-2 text-[13px] leading-5" : "text-[15px] leading-6")}>{body}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-[#0a66c2] font-semibold text-white",
            compact ? "h-9 px-4 text-[13px]" : "h-11 px-6 text-[15px]",
          )}
        >
          Follow
        </span>
      </div>
    </div>
  );
}

function MetaAdvertiserBadge({ ad }: { ad: BrowseAdRecord }) {
  const workspaceHref = useWorkspaceHref();

  return (
    <Link
      href={workspaceHref(`/advertisers/${ad.advertiserId}/overview`)}
      className="inline-flex min-w-0 items-center justify-end gap-2 rounded-md text-[var(--text-primary)] transition hover:text-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
    >
      <AdvertiserLogo
        name={ad.advertiserName}
        logoUrl={ad.advertiserLogoUrl}
        className="h-7 w-7 shrink-0"
        fallbackClassName="bg-lime-400 text-slate-950"
      />
      <span className="truncate text-[14px] font-bold">{ad.advertiserName}</span>
    </Link>
  );
}

function LinkedInAdvertiserBadge({ ad }: { ad: BrowseAdRecord }) {
  const workspaceHref = useWorkspaceHref();

  return (
    <Link
      href={workspaceHref(`/advertisers/${ad.advertiserId}/overview`)}
      className="inline-flex min-w-0 items-center justify-end gap-2 rounded-md text-[var(--text-primary)] transition hover:text-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
    >
      <AdvertiserLogo
        name={ad.advertiserName}
        logoUrl={ad.advertiserLogoUrl}
        className="h-7 w-7 shrink-0"
        fallbackClassName="bg-white text-slate-950"
      />
      <span className="truncate text-[14px] font-bold">{ad.advertiserName}</span>
    </Link>
  );
}

function GoogleAdvertiserBadge({ ad }: { ad: BrowseAdRecord }) {
  const workspaceHref = useWorkspaceHref();

  return (
    <Link
      href={workspaceHref(`/advertisers/${ad.advertiserId}/overview`)}
      className="inline-flex min-w-0 items-center justify-end gap-2 rounded-md text-[var(--text-primary)] transition hover:text-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
    >
      <AdvertiserLogo
        name={ad.advertiserName}
        logoUrl={ad.advertiserLogoUrl}
        className="h-7 w-7 shrink-0"
        fallbackClassName="bg-white text-slate-950"
      />
      <span className="truncate text-[14px] font-bold">{ad.advertiserName}</span>
    </Link>
  );
}

function GoogleSitelinkPills({
  onSelect,
  sitelinks,
}: {
  onSelect?: () => void;
  sitelinks: GoogleSitelink[];
}) {
  if (!sitelinks.length) {
    return null;
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {sitelinks.map((sitelink) => {
        const className =
          "inline-flex h-10 max-w-full shrink-0 items-center rounded-full border border-neutral-200 bg-white px-4 text-[14px] font-medium leading-5 text-blue-600 shadow-sm transition [html[data-theme='dark']_&]:border-[#2f2a3d] [html[data-theme='dark']_&]:bg-[#100d19] [html[data-theme='dark']_&]:text-blue-500";
        const children = <span className="truncate">{sitelink.title}</span>;

        return onSelect ? (
          <button
            key={`${sitelink.title}:${sitelink.description ?? ""}`}
            type="button"
            onClick={onSelect}
            className={className}
          >
            {children}
          </button>
        ) : (
          <span key={`${sitelink.title}:${sitelink.description ?? ""}`} className={className}>
            {children}
          </span>
        );
      })}
    </div>
  );
}

function GoogleAdPreviewCard({
  ad,
  constrainToViewport = false,
  displayUrl,
}: {
  ad: BrowseAdRecord;
  constrainToViewport?: boolean;
  displayUrl: string | null;
}) {
  const destinationHost = displayUrl ? extractHostname(displayUrl) : null;
  const bodyCopy = getGoogleBodyCopy(ad);
  const displayTitle = getGoogleDisplayTitle(ad);
  const sitelinks = getGoogleSitelinks(ad);
  const hasMedia = !isTextAd(ad) && Boolean(ad.mediaUrl ?? ad.posterUrl ?? ad.videoUrl);
  const isVideo = isVideoAd(ad);
  const isImageCreative = isGoogleImageAd(ad) && hasMedia && !isVideo;
  const shouldConstrainMedia = constrainToViewport && hasMedia;
  const mediaAspectRatio = getFeedMediaAspectRatio(ad);

  return (
    <div
      className={cn(
        "flex w-full max-w-md flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] shadow-[var(--shadow-card)]",
        shouldConstrainMedia ? "lg:h-full lg:max-h-full lg:min-h-0" : null,
      )}
    >
      {!isVideo ? (
        <div className="shrink-0 space-y-4 px-4 py-5">
          <p className="text-xs font-semibold leading-4 text-[var(--text-secondary)]">Sponsored</p>

          <div className="flex min-w-0 items-start gap-3">
            <AdvertiserLogo
              name={ad.advertiserName}
              logoUrl={ad.advertiserLogoUrl}
              className="h-9 w-9 shrink-0"
              fallbackClassName="bg-white text-slate-950"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-5 text-[var(--text-primary)]">{ad.advertiserName}</p>
              {destinationHost ? (
                <p className="truncate text-xs leading-4 text-[var(--text-tertiary)]">{displayUrl?.replace(/^https?:\/\//, "")}</p>
              ) : null}
            </div>
          </div>

          {!isImageCreative ? (
            <div className="space-y-2">
              <h3 className="text-lg font-semibold leading-6 text-blue-500">{displayTitle ?? ad.advertiserName}</h3>
              {bodyCopy ? (
                <p className="whitespace-pre-line text-sm leading-6 text-[var(--text-secondary)]">{bodyCopy}</p>
              ) : null}
              <GoogleSitelinkPills sitelinks={sitelinks} />
            </div>
          ) : null}
        </div>
      ) : null}

      {hasMedia ? (
        <div
          className={cn(
            "min-h-0 bg-[var(--bg-surface-2)]",
            !isVideo ? "border-t border-[var(--border-subtle)]" : null,
            shouldConstrainMedia ? "lg:flex-1" : null,
          )}
        >
          <div className={cn("flex h-full w-full items-center justify-center", isVideo ? "p-0" : null)}>
            <div
              className={cn(
                "overflow-hidden",
                isVideo && shouldConstrainMedia ? "w-full bg-black lg:h-full lg:max-h-full lg:max-w-full" : "h-full w-full",
              )}
              style={isVideo || !shouldConstrainMedia ? { aspectRatio: String(mediaAspectRatio) } : undefined}
            >
              <AdMediaPreview
                ad={ad}
                controls
                className={cn("h-full w-full", isVideo ? "object-cover" : "object-contain")}
              />
            </div>
          </div>
        </div>
      ) : null}

      {isVideo && (ad.title || bodyCopy) ? (
        <div className="shrink-0 space-y-2 border-t border-[var(--border-subtle)] px-4 py-4">
          {displayTitle ? (
            <h3 className="text-[18px] font-bold leading-6 text-[var(--text-primary)]">{displayTitle}</h3>
          ) : null}
          {bodyCopy ? (
            <p className="text-sm leading-5 text-[var(--text-secondary)]">{bodyCopy}</p>
          ) : null}
        </div>
      ) : null}

      {!isVideo ? (
        <div className="shrink-0 border-t border-[var(--border-subtle)]">
          <div className="px-4 py-4">
            <p className="text-sm font-semibold leading-5 text-[var(--text-primary)]">{formatRunDateRange(ad)}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MetaCreativeCard({
  ad,
  constrainToViewport = false,
  creativeAspectRatio,
  creativeFallbackUrl,
  mediaFit = "contain",
  creativePosterUrl,
  creativeSrc,
}: {
  ad: BrowseAdRecord;
  constrainToViewport?: boolean;
  creativeAspectRatio: number;
  creativeFallbackUrl?: string | null;
  mediaFit?: "contain" | "cover";
  creativePosterUrl?: string | null;
  creativeSrc: string;
}) {
  const posterSrc = creativePosterUrl ?? ad.posterUrl ?? ad.mediaUrl ?? null;
  const fallbackSources = [posterSrc, creativeFallbackUrl].filter(
    (src): src is string => Boolean(src && src !== creativeSrc),
  );
  const [useFallback, setUseFallback] = useState(false);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [hasMediaError, setHasMediaError] = useState(false);
  const mediaSrc = useFallback ? fallbackSources[fallbackIndex] ?? null : creativeSrc;
  const isTextCreative = isTextAd(ad);
  const isJobCreative = isLinkedInJobAd(ad);
  const isMessageCreative = isLinkedInMessageAd(ad);
  const isFollowCompanyCreative = isLinkedInFollowCompanyAd(ad);
  const hasStoredMedia = Boolean(mediaSrc) && !isTextCreative && !hasMediaError;
  const shouldConstrainMedia = constrainToViewport && hasStoredMedia;
  const isRenderingVideo = Boolean(mediaSrc && mediaSrc === ad.videoUrl);
  const ctaLabel = ad.callToAction?.trim() || null;
  const [isCopyExpanded, setIsCopyExpanded] = useState(false);
  const displayBody = isFollowCompanyCreative ? getLinkedInFollowCompanyBody(ad) : ad.body;
  const displayTitle = isFollowCompanyCreative ? getLinkedInFollowCompanyHeadline(ad) : ad.title ?? "Untitled creative";
  const shouldCollapseCopy = Boolean(displayBody && (displayBody.length > 150 || displayBody.includes("\n")));
  const shouldSizeCreativeBlockToContent = constrainToViewport && isCopyExpanded;

  useEffect(() => {
    setUseFallback(false);
    setFallbackIndex(0);
    setHasMediaError(false);
    setIsCopyExpanded(false);
  }, [ad.id, creativeSrc, posterSrc, creativeFallbackUrl]);

  return (
    <div
      className={cn(
        "flex min-h-0 w-full max-w-md flex-col rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)]",
        constrainToViewport ? "max-h-full overflow-x-hidden overflow-y-auto" : "overflow-hidden",
        shouldConstrainMedia ? "lg:h-full" : null,
      )}
    >
      <div className="flex shrink-0 items-start gap-2 p-3">
        <AdvertiserLogo
          name={ad.advertiserName}
          logoUrl={ad.advertiserLogoUrl}
          className="h-8 w-8 shrink-0"
          fallbackClassName="bg-lime-400 text-slate-950"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold leading-5 text-[var(--text-primary)]">{ad.advertiserName}</p>
          <p className="text-[12px] leading-4 text-[var(--text-tertiary)]">{formatRunDateRange(ad)}</p>
        </div>
      </div>

      {displayBody && !isMessageCreative && !isFollowCompanyCreative ? (
        <div className="shrink-0 px-3 pb-2">
          <p
            className={cn(
              "whitespace-pre-line text-[14px] leading-5 text-[var(--text-secondary)]",
              shouldCollapseCopy && !isCopyExpanded ? "line-clamp-2" : null,
            )}
          >
            {displayBody}
          </p>
          {shouldCollapseCopy ? (
            <button
              type="button"
              onClick={() => setIsCopyExpanded((current) => !current)}
              className="mt-1 text-[13px] font-semibold leading-5 text-violet-500 transition hover:text-violet-400"
              aria-expanded={isCopyExpanded}
            >
              {isCopyExpanded ? "See less" : "See more"}
            </button>
          ) : null}
        </div>
      ) : null}

      {isFollowCompanyCreative && !hasStoredMedia ? (
        <div
          className={cn(
            "overflow-hidden bg-[var(--bg-surface-2)]",
            constrainToViewport && !shouldSizeCreativeBlockToContent ? "min-h-[22rem] lg:min-h-0 lg:flex-1" : "min-h-[22rem] shrink-0",
          )}
        >
          <LinkedInFollowCompanyAdPreview ad={ad} />
        </div>
      ) : isJobCreative && !hasStoredMedia ? (
        <div
          className={cn(
            "overflow-hidden bg-[var(--bg-surface-2)]",
            constrainToViewport && !shouldSizeCreativeBlockToContent ? "min-h-[22rem] lg:min-h-0 lg:flex-1" : "min-h-[22rem] shrink-0",
          )}
        >
          <LinkedInJobAdPreview ad={ad} />
        </div>
      ) : isMessageCreative && !hasStoredMedia ? (
        <div className="overflow-hidden bg-[var(--bg-surface-2)]" style={{ aspectRatio: "2 / 1" }}>
          <LinkedInMessageAdPreview ad={ad} />
        </div>
      ) : hasStoredMedia ? (
        <div
          className={cn(
            "overflow-hidden bg-[var(--bg-surface-2)]",
            shouldConstrainMedia && !shouldSizeCreativeBlockToContent ? "shrink-0 lg:min-h-0 lg:flex-1" : "shrink-0",
          )}
          style={{ aspectRatio: String(creativeAspectRatio) }}
        >
          <CreativeAssetMedia
            key={`${ad.id}:${mediaSrc}`}
            src={mediaSrc ?? ""}
            alt={ad.title ?? ad.advertiserName}
            hint={mediaSrc === creativeSrc ? ad.format : null}
            kind={isRenderingVideo ? "video" : undefined}
            poster={posterSrc}
            controls={isRenderingVideo || Boolean(mediaSrc === creativeSrc && isVideoCreativeAsset(mediaSrc ?? "", ad.format))}
            className={cn("h-full w-full", shouldConstrainMedia && mediaFit === "contain" ? "object-contain" : "object-cover")}
            onMediaError={() => {
              if (!useFallback && fallbackSources.length > 0) {
                setUseFallback(true);
                setFallbackIndex(0);
                return;
              }

              if (useFallback && fallbackIndex < fallbackSources.length - 1) {
                setFallbackIndex((current) => current + 1);
                return;
              }

              setHasMediaError(true);
            }}
          />
        </div>
      ) : !isTextCreative ? (
        <div
          className={cn(
            "flex items-center justify-center bg-[var(--bg-surface-2)] px-6 text-center text-sm text-[var(--text-tertiary)]",
            constrainToViewport && !shouldSizeCreativeBlockToContent ? "min-h-[22rem] lg:min-h-0 lg:flex-1" : "min-h-[22rem] shrink-0",
          )}
        >
          No creative preview is stored for this ad yet.
        </div>
      ) : null}

      {!isJobCreative && !isMessageCreative ? (
        <div className="flex shrink-0 items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            {ad.destinationUrl ? (
              <p className="truncate text-[11px] font-semibold uppercase leading-4 text-[var(--text-tertiary)]">
                {extractHostname(ad.destinationUrl)}
              </p>
            ) : null}
            <p className="whitespace-pre-line break-words text-[14px] font-bold leading-5 text-[var(--text-primary)]">
              {displayTitle}
            </p>
            {isFollowCompanyCreative && displayBody ? (
              <p className="mt-1 line-clamp-2 text-[12px] leading-4 text-[var(--text-secondary)]">{displayBody}</p>
            ) : null}
          </div>
          {ctaLabel ? (
            <span className="shrink-0 rounded-md bg-[var(--bg-surface-2)] px-3 py-2 text-[12px] font-bold text-[var(--text-secondary)]">
              {ctaLabel}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MetaVariationPicker({
  activeAdId,
  label = "Variation:",
  onSelect,
  variations,
}: {
  activeAdId: string;
  label?: string;
  onSelect: (id: string) => void;
  variations: MetaAdVariationRecord[];
}) {
  if (variations.length <= 1) {
    return null;
  }

  if (variations.length > 4) {
    return (
      <label className="flex w-full max-w-sm items-center gap-3">
        <span className="shrink-0 text-[14px] font-bold leading-5 text-[var(--text-secondary)]">{label}</span>
        <select
          value={activeAdId}
          onChange={(event) => onSelect(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
        >
          {variations.map((variation, index) => (
            <option key={variation.id} value={variation.id}>
              {index === 0 ? "Original" : `Variant ${index}`}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-2">
      <span className="mr-1 text-[14px] font-bold leading-5 text-[var(--text-secondary)]">{label}</span>
      {variations.map((variation, index) => {
        const isActive = variation.id === activeAdId;

        return (
          <button
            key={variation.id}
            type="button"
            onClick={() => onSelect(variation.id)}
            className={cn(
              "h-9 rounded-full border px-4 text-xs font-bold leading-5 transition",
              isActive
                ? "border-violet-500 bg-violet-500 text-white"
                : "border-[var(--border-subtle)] bg-[var(--bg-surface-1)] text-[var(--text-secondary)] hover:border-violet-400 hover:text-[var(--text-primary)]",
            )}
          >
            {index === 0 ? "Original" : `Variant ${index}`}
          </button>
        );
      })}
    </div>
  );
}

function CreativeAssetPicker({
  activeAssetId,
  assets,
  label = "Variation:",
  onSelect,
}: {
  activeAssetId: string;
  assets: MetaCreativeAssetRecord[];
  label?: string;
  onSelect: (id: string) => void;
}) {
  if (assets.length <= 1) {
    return null;
  }

  if (assets.length > 4) {
    return (
      <label className="flex w-full max-w-sm items-center gap-3">
        <span className="shrink-0 text-[14px] font-bold leading-5 text-[var(--text-secondary)]">{label}</span>
        <select
          value={activeAssetId}
          onChange={(event) => onSelect(event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
        >
          {assets.map((asset, index) => (
            <option key={asset.id} value={asset.id}>
              {asset.label || (index === 0 ? "Original" : `Variant ${index}`)}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-2">
      <span className="mr-1 text-[14px] font-bold leading-5 text-[var(--text-secondary)]">{label}</span>
      {assets.map((asset, index) => {
        const isActive = asset.id === activeAssetId;

        return (
          <button
            key={asset.id}
            type="button"
            onClick={() => onSelect(asset.id)}
            className={cn(
              "h-9 rounded-full border px-4 text-xs font-bold leading-5 transition",
              isActive
                ? "border-violet-500 bg-violet-500 text-white"
                : "border-[var(--border-subtle)] bg-[var(--bg-surface-1)] text-[var(--text-secondary)] hover:border-violet-400 hover:text-[var(--text-primary)]",
            )}
          >
            {asset.label || (index === 0 ? "Original" : `Variant ${index}`)}
          </button>
        );
      })}
    </div>
  );
}

function renderAdDetailPresentation({
  children,
  onClose,
  overlayClassName,
  presentation,
}: {
  children: ReactNode;
  onClose: () => void;
  overlayClassName: string;
  presentation: AdDetailsPresentation;
}) {
  if (presentation === "page") {
    return <div className="w-full">{children}</div>;
  }

  return createPortal(
    <div className={overlayClassName}>
      <button type="button" aria-label="Close ad details" className="fixed inset-0 cursor-default" onClick={onClose} />
      {children}
    </div>,
    document.body,
  );
}

function SavedAdNoteEditor({ adId }: { adId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    setError(null);
    setMessage(null);
    startLoading(async () => {
      const response = (await getSaveAdModalStateAction(adId)) as SaveAdStateResponse;

      if (response.status === "error") {
        setError(response.message);
        return;
      }

      setNote(response.state.note);
    });
  }, [adId]);

  return (
    <DetailSection title="Saved note">
      <div className="space-y-3">
        <textarea
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={isLoading ? "Loading note..." : "Add note"}
          className="app-textarea"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isLoading || isSaving}
            onClick={() => {
              startSaving(async () => {
                setError(null);
                setMessage(null);

                const response = (await saveAdToSwipeFileAction({
                  adId,
                  note,
                })) as SaveAdNoteResponse;

                if (response.status === "error") {
                  setError(response.message);
                  return;
                }

                setMessage("Note saved.");
                router.refresh();
              });
            }}
            className="app-button app-button-secondary"
          >
            {isSaving ? "Saving..." : "Save note"}
          </button>
          {message ? <p className="text-[13px] leading-5 text-[#a7f3d0]">{message}</p> : null}
        </div>
        {error ? <p className="text-[13px] leading-5 text-[#fecaca]">{error}</p> : null}
      </div>
    </DetailSection>
  );
}

function SwipeFileCardMetaSection({ meta }: { meta: SwipeFileCardMeta }) {
  const router = useRouter();
  const [note, setNote] = useState(meta.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setNote(meta.note ?? "");
    setError(null);
    setMessage(null);
  }, [meta.savedAdId, meta.note]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="app-pill app-pill-default">Saved {formatCompactDate(meta.savedAt)}</span>
        {meta.collections.length ? (
          meta.collections.map((collection) => (
            <span key={collection.id} className="app-pill app-pill-accent">
              {collection.name}
            </span>
          ))
        ) : (
          <span className="app-pill app-pill-default">No collection</span>
        )}
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            setError(null);
            setMessage(null);

            const response = (await updateSavedAdNoteAction({
              savedAdId: meta.savedAdId,
              note,
            })) as SwipeFileCardActionResponse;

            if (response.status === "error") {
              setError(response.message);
              return;
            }

            setMessage("Note saved.");
            router.refresh();
          });
        }}
      >
        <label className="block space-y-3">
          <span className="mb-3 block text-[12px] font-semibold uppercase leading-4 tracking-wider text-[var(--text-tertiary)]">
            Note
          </span>
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Add note"
            className="app-textarea min-h-24 text-sm"
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="app-button app-button-secondary h-9 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? "Saving..." : "Save note"}
          </button>
          {message ? <p className="text-[13px] leading-5 text-[#a7f3d0]">{message}</p> : null}
        </div>
        {error ? <p className="text-[13px] leading-5 text-[#fecaca]">{error}</p> : null}
      </form>
    </div>
  );
}

export function AdDetailsModal({
  ad,
  detail,
  error,
  onClose,
  onRemovedFromWatchlist,
  onWatchlistChanged,
  presentation = "modal",
}: {
  ad: BrowseAdRecord;
  detail: AdDetailRecord | null;
  error: string | null;
  onClose: () => void;
  onRemovedFromWatchlist?: () => void;
  onWatchlistChanged?: (isWatched: boolean) => void;
  presentation?: AdDetailsPresentation;
}) {
  const modalRouter = useRouter();
  const [isMounted, setIsMounted] = useState(false);
  const [isWatchlistPending, startWatchlistTransition] = useTransition();
  const [activeVariationId, setActiveVariationId] = useState<string | null>(null);
  const [activeMetaCreativeAssetId, setActiveMetaCreativeAssetId] = useState<string | null>(null);
  const [activeGoogleCreativeAssetId, setActiveGoogleCreativeAssetId] = useState<string | null>(null);
  const [activeLinkedInCreativeAssetId, setActiveLinkedInCreativeAssetId] = useState<string | null>(null);
  const metaVariations = detail?.metaVariations ?? [];
  const activeMetaVariation = metaVariations.find((variation) => variation.id === activeVariationId) ?? null;
  const activeBaseAd = activeMetaVariation ?? detail ?? ad;
  const activeGoogleDetails = detail?.googleDetails ?? null;
  const activeLinkedInDetails = detail?.linkedInDetails ?? null;
  const activeLinkedInCreativeAssets =
    activeBaseAd.source === "linkedin" ? detail?.linkedInCreativeAssets ?? [] : [];
  const activeLinkedInCreativeAsset =
    activeLinkedInCreativeAssets.find((asset) => asset.id === activeLinkedInCreativeAssetId) ??
    activeLinkedInCreativeAssets[0] ??
    null;
  const activeGoogleCreativeAssets =
    activeBaseAd.source === "google" ? detail?.googleCreativeAssets ?? [] : [];
  const isActiveGoogleTextAd =
    activeBaseAd.source === "google" &&
    (getAdFormatKey(activeBaseAd.format) === "text" || activeGoogleDetails?.mediaType === "Text");
  const googleCreativeAssetOptions =
    !isActiveGoogleTextAd && activeGoogleCreativeAssets.length > 1
      ? activeGoogleCreativeAssets
      : [];
  const activeGoogleCreativeAsset =
    (!isActiveGoogleTextAd
      ? activeGoogleCreativeAssets.find((asset) => asset.id === activeGoogleCreativeAssetId) ??
        activeGoogleCreativeAssets[0]
      : null) ??
    null;
  const activeMetaDetails = activeMetaVariation?.metaDetails ?? detail?.metaDetails ?? null;
  const activeMetaCreativeAssets =
    activeBaseAd.source === "facebook"
      ? activeMetaVariation?.metaCreativeAssets ?? detail?.metaCreativeAssets ?? []
      : [];
  const activeMetaCreativeAsset =
    activeMetaCreativeAssets.find((asset) => asset.id === activeMetaCreativeAssetId) ??
    activeMetaCreativeAssets[0] ??
    null;
  const showMetaVariationPicker = metaVariations.length > 1;
  const showMetaCreativeAssetPicker = Boolean(activeMetaCreativeAssets.length > 1 && activeMetaCreativeAsset);
  const activeCreativeAsset = activeGoogleCreativeAsset ?? activeMetaCreativeAsset ?? activeLinkedInCreativeAsset;
  const activeCreativeAssetHasMedia = Boolean(
    activeCreativeAsset?.mediaUrl ?? activeCreativeAsset?.posterUrl ?? activeCreativeAsset?.videoUrl,
  );
  const activeAd = activeCreativeAsset
    ? {
        ...activeBaseAd,
        title: activeCreativeAsset.title ?? activeBaseAd.title,
        body: activeCreativeAsset.body ?? activeBaseAd.body,
        callToAction: activeCreativeAsset.callToAction ?? activeBaseAd.callToAction,
        destinationUrl: activeCreativeAsset.destinationUrl ?? activeBaseAd.destinationUrl,
        mediaUrl: activeCreativeAsset.mediaUrl ?? activeBaseAd.mediaUrl,
        posterUrl: activeCreativeAsset.posterUrl ?? (activeCreativeAssetHasMedia ? null : activeBaseAd.posterUrl),
        videoUrl: activeCreativeAsset.videoUrl ?? activeBaseAd.videoUrl,
        mediaWidth: activeCreativeAsset.mediaWidth ?? activeBaseAd.mediaWidth,
        mediaHeight: activeCreativeAsset.mediaHeight ?? activeBaseAd.mediaHeight,
        mediaAspectRatio: activeCreativeAsset.mediaAspectRatio ?? activeBaseAd.mediaAspectRatio,
      }
    : activeBaseAd;
  const detailScreenshotUrl = detail?.screenshotUrl ?? null;
  const activeMetaCreativePosterUrl = activeMetaCreativeAsset?.posterUrl ?? null;
  const shouldContainLinkedInDocument = activeAd.source === "linkedin" && getAdFormatKey(activeAd.format) === "document";
  const creativeSrc = activeAd.videoUrl ?? activeAd.mediaUrl ?? activeAd.posterUrl ?? (activeAd.source === "facebook" ? null : detailScreenshotUrl) ?? "";
  const shouldRenderLinkedInJobPreview = isLinkedInJobAd(activeAd) && !creativeSrc;
  const shouldRenderLinkedInMessagePreview = isLinkedInMessageAd(activeAd) && !creativeSrc;
  const creativeAspectRatio = getFeedMediaAspectRatio(activeAd);
  const variationCount = detail ? Math.max(detail.metaVariationTotal, detail.variations.length + 1) : 1;
  const status = isActiveAd(activeAd) ? "Active" : "Inactive";
  const landingPageUrl = activeAd.destinationUrl;

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    setActiveVariationId(null);
    setActiveMetaCreativeAssetId(null);
    setActiveGoogleCreativeAssetId(null);
  }, [ad.id, detail?.id]);

  useEffect(() => {
    setActiveMetaCreativeAssetId(null);
    setActiveGoogleCreativeAssetId(null);
  }, [activeVariationId]);

  useEffect(() => {
    if (presentation !== "modal") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, presentation]);

  const toggleWatchlist = () => {
    startWatchlistTransition(async () => {
      if (activeAd.isWatched) {
        const response = await removeAdvertiserEntityFromWatchlistAction(activeAd.advertiserId);

        if (response.status === "removed") {
          onWatchlistChanged?.(false);
          onRemovedFromWatchlist?.();
          modalRouter.refresh();
        }

        return;
      }

      const response = await addAdvertiserToWatchlistByIdAction({
        id: activeAd.advertiserId,
        canonicalName: activeAd.advertiserName,
        profileUrl: activeAd.advertiserProfileUrl,
        industry: activeAd.advertiserIndustry,
        companySize: activeAd.advertiserCompanySize,
        country: activeAd.advertiserCountry,
        summary: activeAd.advertiserSummary,
      });

      if (response.status === "queued" || response.status === "existing") {
        onWatchlistChanged?.(true);
        modalRouter.refresh();
      }
    });
  };
  const detailHeaderActionClassName =
    "inline-flex h-10 w-10 items-center justify-center rounded-md border border-transparent bg-transparent text-[var(--text-secondary)] transition hover:bg-[var(--ghost-hover)] hover:text-[var(--text-primary)]";
  const detailHeaderMenuTriggerClassName =
    "!border-transparent !bg-transparent !text-[var(--text-secondary)] !shadow-none !backdrop-blur-none hover:!border-transparent hover:!bg-[var(--ghost-hover)] hover:!text-[var(--text-primary)]";

  const renderDetailActions = ({
    closeButtonClassName,
    groupClassName = "flex shrink-0 items-center gap-2",
    iconSize = 20,
    triggerClassName,
    triggerSizeClassName = "h-8 w-8",
  }: {
    closeButtonClassName: string;
    groupClassName?: string;
    iconSize?: number;
    triggerClassName?: string;
    triggerSizeClassName?: string;
  }) => (
    <div className={groupClassName}>
      <AdCardActionsMenu
        ad={activeAd}
        hideViewDetails
        onOpenDetails={() => undefined}
        onRemovedFromWatchlist={onRemovedFromWatchlist}
        onWatchlistChanged={onWatchlistChanged}
        triggerClassName={cn(
          "rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)] shadow-none backdrop-blur-none hover:border-[var(--border-subtle)] hover:bg-[var(--bg-surface-3)] hover:text-[var(--text-primary)]",
          triggerClassName,
        )}
        triggerSizeClassName={triggerSizeClassName}
        wrapperPositionClassName="relative z-30"
      />
      {presentation === "modal" ? (
        <button
          type="button"
          aria-label="Close ad details"
          onClick={onClose}
          className={closeButtonClassName}
        >
          <X size={iconSize} strokeWidth={2.2} />
        </button>
      ) : null}
    </div>
  );

  if (!isMounted && presentation === "modal") {
    return null;
  }

  if (activeAd.source === "google") {
    return renderAdDetailPresentation({
      presentation,
      onClose,
      overlayClassName: "fixed inset-0 z-[80] overflow-y-auto bg-[var(--overlay)] p-0 lg:overflow-hidden lg:p-5",
      children: (
        <div className="relative z-[1] mx-auto min-h-dvh w-full overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] text-[var(--text-primary)] shadow-[var(--shadow-overlay)] lg:min-h-0 lg:max-w-6xl lg:rounded-lg">
          <header className="flex h-16 items-center justify-between border-b border-[var(--border-subtle)] px-6">
            <h2 className="text-[20px] font-bold leading-7 text-[var(--text-primary)]">Ad Details</h2>
            {renderDetailActions({
              closeButtonClassName: detailHeaderActionClassName,
              iconSize: 22,
              triggerClassName: detailHeaderMenuTriggerClassName,
              triggerSizeClassName: "h-10 w-10",
            })}
          </header>

          <div className="grid min-h-[calc(100dvh-4rem)] bg-[var(--bg-surface-2)] lg:h-[calc(100dvh-6.5rem)] lg:min-h-0 lg:grid-cols-[minmax(480px,1fr)_minmax(390px,0.78fr)] lg:overflow-hidden">
            <div
              className={cn(
                "flex min-h-0 flex-col items-center justify-start gap-4 p-6",
                isActiveGoogleTextAd ? "lg:overflow-y-auto" : "lg:overflow-hidden",
              )}
            >
              <div
                className={cn(
                  "flex min-h-0 w-full justify-center",
                  isActiveGoogleTextAd ? "items-start overflow-visible" : "flex-1 items-center overflow-hidden",
                )}
              >
                <GoogleAdPreviewCard
                  ad={activeAd}
                  constrainToViewport
                  displayUrl={getGoogleBrandDisplayUrl(activeAd, activeGoogleDetails)}
                />
              </div>
              {googleCreativeAssetOptions.length > 1 && activeGoogleCreativeAsset ? (
                <CreativeAssetPicker
                  activeAssetId={activeGoogleCreativeAsset.id}
                  assets={googleCreativeAssetOptions}
                  onSelect={setActiveGoogleCreativeAssetId}
                />
              ) : null}
            </div>

            <aside className="min-h-0 overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--bg-surface-1)]">
              <div className="space-y-6 px-6 py-6">
                {error ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </p>
                ) : null}

                <section className="space-y-3">
                  <div className="flex min-w-0 items-center justify-between gap-4">
                    <h3 className="flex min-w-0 items-center gap-2 text-[14px] font-bold leading-5 text-[var(--text-primary)]">
                      <Briefcase size={18} strokeWidth={2.3} />
                      Brand
                    </h3>
                    <div className="flex min-w-0 justify-end">
                      <GoogleAdvertiserBadge ad={activeAd} />
                    </div>
                  </div>
                  <dl className="space-y-1.5">
                  {activeGoogleDetails?.advertiserCountry || activeAd.advertiserCountry ? (
                    <MetaDetailRow label="Location" value={activeGoogleDetails?.advertiserCountry ?? activeAd.advertiserCountry} />
                  ) : null}
                  {activeGoogleDetails?.advertiserVerified !== null && activeGoogleDetails?.advertiserVerified !== undefined ? (
                    <MetaDetailRow label="Verified" value={activeGoogleDetails.advertiserVerified ? "Yes" : "No"} />
                  ) : null}
                  {activeGoogleDetails?.advertiserPaymentProfileName ? (
                    <MetaDetailRow label="Paid For By" value={activeGoogleDetails.advertiserPaymentProfileName} />
                  ) : null}
                  </dl>
                </section>

                <MetaDetailSection title="Status" icon={<BadgeInfo size={18} strokeWidth={2.3} />}>
                  <MetaDetailRow label="Platform" value="Google" />
                  <MetaDetailRow label="Status" value={status} />
                  <MetaDetailRow label="Time Running" value={formatDurationDays(activeAd.durationDays)} />
                  <MetaDetailRow label="Run Dates" value={formatRunDateRange(activeAd)} />
                </MetaDetailSection>

                <MetaDetailSection title="Creative" icon={<Palette size={18} strokeWidth={2.3} />}>
                  {activeGoogleDetails?.creativeId ? <MetaDetailRow label="Creative ID" value={activeGoogleDetails.creativeId} /> : null}
                  <MetaDetailRow label="Format" value={activeGoogleDetails?.format ?? getAdFormatLabel(activeAd.format)} />
                  <MetaDetailRow label="Media Type" value={activeGoogleDetails?.mediaType ?? "Image"} />
                  {activeGoogleDetails?.creativeVariationTotal && activeGoogleDetails.creativeVariationTotal > 1 ? (
                    <MetaDetailRow label="Variations" value={activeGoogleDetails.creativeVariationTotal} />
                  ) : null}
                  {!isActiveGoogleTextAd ? (
                    <>
                      <MetaDetailRow label="Aspect Ratio" value={getAspectRatioLabel(activeAd)} />
                      {activeAd.mediaWidth && activeAd.mediaHeight ? (
                        <MetaDetailRow
                          label="Asset Size"
                          value={`${Math.round(activeAd.mediaWidth)} x ${Math.round(activeAd.mediaHeight)}`}
                        />
                      ) : activeGoogleDetails?.creativeWidth && activeGoogleDetails.creativeHeight ? (
                        <MetaDetailRow
                          label="Asset Size"
                          value={`${Math.round(activeGoogleDetails.creativeWidth)} x ${Math.round(activeGoogleDetails.creativeHeight)}`}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {activeGoogleDetails?.formatCode ? <MetaDetailRow label="Format Code" value={activeGoogleDetails.formatCode} /> : null}
                  {activeGoogleDetails?.topicCode ? <MetaDetailRow label="Topic Code" value={activeGoogleDetails.topicCode} /> : null}
                </MetaDetailSection>

                <MetaDetailSection title="Landing Page" icon={<Target size={18} strokeWidth={2.3} />}>
                  <MetaDetailRow
                    label="URL"
                    value={
                      landingPageUrl ? (
                        <a
                          href={landingPageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-64 items-center justify-end gap-1 truncate text-blue-500 transition hover:text-blue-400"
                        >
                          <span className="truncate">{landingPageUrl}</span>
                          <ExternalLink size={13} strokeWidth={2} className="shrink-0" />
                        </a>
                      ) : (
                        "Not available"
                      )
                    }
                  />
                </MetaDetailSection>
              </div>

              <div className="mt-auto space-y-3 border-t border-[var(--border-subtle)] px-6 py-5">
                <button
                  type="button"
                  disabled={isWatchlistPending}
                  onClick={toggleWatchlist}
                  className={cn(
                    "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border bg-[var(--bg-surface-1)] px-4 text-[15px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60",
                    activeAd.isWatched
                      ? "border-violet-500 text-violet-500 hover:bg-[var(--accent-soft)]"
                      : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
                  )}
                >
                  {activeAd.isWatched ? <EyeOff size={17} strokeWidth={2} /> : <Eye size={17} strokeWidth={2} />}
                  {isWatchlistPending
                    ? "Updating..."
                    : activeAd.isWatched
                      ? "Remove from Watchlist"
                      : "Add to Watchlist"}
                </button>

                {activeAd.adLibraryUrl ? (
                  <a
                    href={activeAd.adLibraryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-4 text-[15px] font-bold text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
                  >
                    <SourceLogo source="google" className="h-5 w-5" />
                    Open in Ad Library
                  </a>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      ),
    });
  }

  if (activeAd.source === "linkedin") {
    const creativeRows = getLinkedInCreativeRows({
      details: activeLinkedInDetails,
      format: activeAd.format,
      language: activeAd.language,
    });

    return renderAdDetailPresentation({
      presentation,
      onClose,
      overlayClassName: "fixed inset-0 z-[80] overflow-y-auto bg-[var(--overlay)] p-0 lg:overflow-hidden lg:p-5",
      children: (
        <div className="relative z-[1] mx-auto min-h-dvh w-full overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] text-[var(--text-primary)] shadow-[var(--shadow-overlay)] lg:min-h-0 lg:max-w-6xl lg:rounded-lg">
          <header className="flex h-16 items-center justify-between border-b border-[var(--border-subtle)] px-6">
            <h2 className="text-[20px] font-bold leading-7 text-[var(--text-primary)]">Ad Details</h2>
            {renderDetailActions({
              closeButtonClassName: detailHeaderActionClassName,
              iconSize: 22,
              triggerClassName: detailHeaderMenuTriggerClassName,
              triggerSizeClassName: "h-10 w-10",
            })}
          </header>

          <div className="grid min-h-[calc(100dvh-4rem)] bg-[var(--bg-surface-2)] lg:h-[calc(100dvh-6.5rem)] lg:min-h-0 lg:grid-cols-[minmax(480px,1fr)_minmax(390px,0.78fr)] lg:overflow-hidden">
            <div className="flex min-h-0 flex-col items-center justify-start overflow-x-hidden overflow-y-auto p-6">
              <div className="flex min-h-0 w-full flex-1 items-start justify-center">
                <MetaCreativeCard
                  ad={activeAd}
                  constrainToViewport
                  creativeAspectRatio={creativeAspectRatio}
                  mediaFit={activeAd.source === "linkedin" || shouldContainLinkedInDocument || isExtremeTallMedia(activeAd) ? "contain" : "cover"}
                  creativeSrc={creativeSrc}
                />
              </div>
              {activeLinkedInCreativeAssets.length > 1 && activeLinkedInCreativeAsset ? (
                <div className="mt-6 flex w-full justify-center">
                  <CreativeAssetPicker
                    activeAssetId={activeLinkedInCreativeAsset.id}
                    assets={activeLinkedInCreativeAssets}
                    label="Slide:"
                    onSelect={setActiveLinkedInCreativeAssetId}
                  />
                </div>
              ) : null}
            </div>

            <aside className="min-h-0 overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--bg-surface-1)]">
              <div className="space-y-6 px-6 py-6">
                {error ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </p>
                ) : null}

                <section className="flex min-w-0 items-center justify-between gap-4">
                  <h3 className="flex min-w-0 items-center gap-2 text-[14px] font-bold leading-5 text-[var(--text-primary)]">
                    <Briefcase size={18} strokeWidth={2.3} />
                    Advertiser
                  </h3>
                  <div className="flex min-w-0 justify-end">
                    <LinkedInAdvertiserBadge ad={activeAd} />
                  </div>
                </section>

                <MetaDetailSection title="Status" icon={<BadgeInfo size={18} strokeWidth={2.3} />}>
                  <MetaDetailRow
                    label="Platform"
                    value={
                      <span className="inline-flex items-center justify-end gap-2">
                        <SourceLogo source="linkedin" className="h-5 w-5" />
                        LinkedIn
                      </span>
                    }
                  />
                  <MetaDetailRow
                    label="Status"
                    value={
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", isActiveAd(activeAd) ? "bg-emerald-500" : "bg-[var(--text-secondary)]")} />
                        {status}
                      </span>
                    }
                  />
                  <MetaDetailRow label="Time Running" value={formatDurationDays(activeAd.durationDays)} />
                </MetaDetailSection>

                <MetaDetailSection title="Creative" icon={<Palette size={18} strokeWidth={2.3} />}>
                  {creativeRows.map((row) => (
                    <MetaDetailRow key={row.label} label={row.label} value={row.value} />
                  ))}
                </MetaDetailSection>

                <MetaDetailSection title="Delivery" icon={<Share2 size={18} strokeWidth={2.3} />}>
                  <MetaDetailRow label="Run Dates" value={formatRunDateRange(activeAd)} />
                  <MetaDetailRow label="Impressions" value={activeLinkedInDetails?.totalImpressions ?? "Not available"} />
                  <MetaDetailRow
                    label="Top Countries"
                    value={activeLinkedInDetails ? formatLinkedInCountryImpressions(activeLinkedInDetails.countryImpressions) : "Not available"}
                  />
                </MetaDetailSection>

                <MetaDetailSection title="Landing Page" icon={<Target size={18} strokeWidth={2.3} />}>
                  <MetaDetailRow
                    label="URL"
                    value={
                      landingPageUrl ? (
                        <a
                          href={landingPageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-64 items-center justify-end gap-1 truncate text-blue-500 transition hover:text-blue-400"
                        >
                          <span className="truncate">{landingPageUrl}</span>
                          <ExternalLink size={13} strokeWidth={2} className="shrink-0" />
                        </a>
                      ) : (
                        "Not available"
                      )
                    }
                  />
                </MetaDetailSection>

                {activeAd.isSaved ? <SavedAdNoteEditor adId={activeAd.id} /> : null}

                <div className="space-y-3 border-t border-[var(--border-subtle)] pt-5">
                  <button
                    type="button"
                    disabled={isWatchlistPending}
                    onClick={toggleWatchlist}
                    className={cn(
                      "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border bg-[var(--bg-surface-1)] px-4 text-[15px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60",
                      activeAd.isWatched
                        ? "border-violet-500 text-violet-500 hover:bg-[var(--accent-soft)]"
                        : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {activeAd.isWatched ? <EyeOff size={17} strokeWidth={2} /> : <Eye size={17} strokeWidth={2} />}
                    {isWatchlistPending
                      ? "Updating..."
                      : activeAd.isWatched
                        ? "Remove from Watchlist"
                        : "Add to Watchlist"}
                  </button>

                  {activeAd.adLibraryUrl ? (
                    <a
                      href={activeAd.adLibraryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-4 text-[15px] font-bold text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
                    >
                      <SourceLogo source="linkedin" className="h-5 w-5" />
                      Open in Ad Library
                    </a>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </div>
      ),
    });
  }

  if (activeAd.source === "facebook") {
    const creativeMetric = getMetaCreativeMetric({
      carouselSlides: activeMetaDetails?.carouselSlides,
      creativeDurationSeconds: activeMetaDetails?.creativeDurationSeconds,
      format: activeAd.format,
      variationCount,
    });
    const platformLabel = formatMetaPlatformSummary(activeMetaDetails?.publisherPlatforms ?? []);

    return renderAdDetailPresentation({
      presentation,
      onClose,
      overlayClassName: "fixed inset-0 z-[80] overflow-y-auto bg-[var(--overlay)] p-0 lg:overflow-hidden lg:p-5",
      children: (
        <div className="relative z-[1] mx-auto min-h-dvh w-full overflow-hidden border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] text-[var(--text-primary)] shadow-[var(--shadow-overlay)] lg:min-h-0 lg:max-w-6xl lg:rounded-lg">
          <header className="flex h-16 items-center justify-between border-b border-[var(--border-subtle)] px-6">
            <h2 className="text-[20px] font-bold leading-7 text-[var(--text-primary)]">Ad Details</h2>
            {renderDetailActions({
              closeButtonClassName: detailHeaderActionClassName,
              iconSize: 22,
              triggerClassName: detailHeaderMenuTriggerClassName,
              triggerSizeClassName: "h-10 w-10",
            })}
          </header>

          <div className="grid min-h-[calc(100dvh-4rem)] bg-[var(--bg-surface-2)] lg:h-[calc(100dvh-6.5rem)] lg:min-h-0 lg:grid-cols-[minmax(480px,1fr)_minmax(390px,0.78fr)] lg:overflow-hidden">
            <div className="flex min-h-0 flex-col items-center gap-4 overflow-x-hidden overflow-y-auto p-6">
              <div className="flex min-h-0 w-full flex-1 justify-center">
                <MetaCreativeCard
                  ad={activeAd}
                  constrainToViewport
                  creativeAspectRatio={creativeAspectRatio}
                  creativePosterUrl={activeMetaCreativePosterUrl}
                  creativeSrc={creativeSrc}
                />
              </div>
              {showMetaVariationPicker || showMetaCreativeAssetPicker ? (
                <div className="flex w-full max-w-2xl flex-col items-center gap-2">
                  {showMetaVariationPicker ? (
                    <MetaVariationPicker
                      activeAdId={activeBaseAd.id}
                      label={showMetaCreativeAssetPicker ? "Ad:" : "Variation:"}
                      variations={metaVariations}
                      onSelect={setActiveVariationId}
                    />
                  ) : null}
                  {showMetaCreativeAssetPicker && activeMetaCreativeAsset ? (
                    <CreativeAssetPicker
                      activeAssetId={activeMetaCreativeAsset.id}
                      assets={activeMetaCreativeAssets}
                      label={showMetaVariationPicker ? "Creative:" : "Variation:"}
                      onSelect={setActiveMetaCreativeAssetId}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            <aside className="min-h-0 overflow-y-auto border-l border-[var(--border-subtle)] bg-[var(--bg-surface-1)]">
              <div className="space-y-6 px-6 py-6">
                {error ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </p>
                ) : null}

                <section className="flex min-w-0 items-center justify-between gap-4">
                  <h3 className="flex min-w-0 items-center gap-2 text-[16px] font-bold leading-6 text-[var(--text-primary)]">
                    <Briefcase size={16} strokeWidth={2.3} />
                    Advertiser
                  </h3>
                  <div className="flex min-w-0 justify-end">
                    <MetaAdvertiserBadge ad={activeAd} />
                  </div>
                </section>

                <MetaDetailSection title="Status" icon={<BadgeInfo size={16} strokeWidth={2.3} />}>
                  <MetaDetailRow
                    label="Platform"
                    value={
                      <span className="inline-flex items-center justify-end gap-2">
                        <MetaLogo aria-hidden="true" className="h-4 w-7" />
                        {platformLabel}
                      </span>
                    }
                  />
                  <MetaDetailRow
                    label="Status"
                    value={
                      <span className="inline-flex items-center justify-end gap-1.5">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", isActiveAd(activeAd) ? "bg-emerald-500" : "bg-[var(--text-secondary)]")} />
                        {status}
                      </span>
                    }
                  />
                  <MetaDetailRow label="Time Running" value={formatDurationDays(activeAd.durationDays)} />
                </MetaDetailSection>

                <MetaDetailSection title="Creative" icon={<Palette size={16} strokeWidth={2.3} />}>
                  <MetaDetailRow label="Language" value={activeAd.language ?? activeMetaDetails?.language ?? "Not available"} />
                  <MetaDetailRow label="Format" value={getAdFormatLabel(activeAd.format)} />
                  <MetaDetailRow label={creativeMetric.label} value={creativeMetric.value} />
                </MetaDetailSection>

                <MetaDetailSection title="Delivery" icon={<Share2 size={16} strokeWidth={2.3} />}>
                  <MetaDetailRow label="Run Dates" value={formatRunDateRange(activeAd)} />
                  <MetaDetailRow label="EU Countries" value={formatMetaCountryList(activeMetaDetails?.targetedCountries ?? [])} />
                  <MetaDetailRow label="Age Range" value={activeMetaDetails?.ageRange ?? "All"} />
                  <MetaDetailRow label="Gender" value={activeMetaDetails?.gender ?? "All"} />
                </MetaDetailSection>

                <MetaDetailSection title="Estimated Performance" icon={<Target size={16} strokeWidth={2.3} />}>
                  <MetaDetailRow label="EU Reach" value={activeMetaDetails?.estimatedReach ?? "Not available"} />
                  <MetaDetailRow label="Est. Spend" value={activeMetaDetails?.estimatedSpend ?? "Not available"} />
                </MetaDetailSection>

                <MetaDetailSection title="Landing Page" icon={<Target size={16} strokeWidth={2.3} />}>
                  <MetaDetailRow
                    label="URL"
                    value={
                      landingPageUrl ? (
                        <a
                          href={landingPageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-64 items-center justify-end gap-1 truncate text-blue-500 transition hover:text-blue-400"
                        >
                          <span className="truncate">{landingPageUrl}</span>
                          <ExternalLink size={13} strokeWidth={2} className="shrink-0" />
                        </a>
                      ) : (
                        "Not available"
                      )
                    }
                  />
                </MetaDetailSection>

                {activeAd.isSaved ? <SavedAdNoteEditor adId={activeAd.id} /> : null}

                <div className="space-y-2 border-t border-[var(--border-subtle)] pt-4">
                  <button
                    type="button"
                    disabled={isWatchlistPending}
                    onClick={toggleWatchlist}
                    className={cn(
                      "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border bg-[var(--bg-surface-1)] px-4 text-[14px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60",
                      activeAd.isWatched
                        ? "border-violet-500 text-violet-500 hover:bg-[var(--accent-soft)]"
                        : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {activeAd.isWatched ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                    {isWatchlistPending
                      ? "Updating..."
                      : activeAd.isWatched
                        ? "Remove from Watchlist"
                        : "Add to Watchlist"}
                  </button>

                  {activeAd.adLibraryUrl ? (
                    <a
                      href={activeAd.adLibraryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-4 text-[14px] font-bold text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
                    >
                      <MetaLogo aria-hidden="true" className="h-4 w-7" />
                      Open in Ad Library
                    </a>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </div>
      ),
    });
  }

  return renderAdDetailPresentation({
    presentation,
    onClose,
    overlayClassName: "fixed inset-0 z-[80] overflow-y-auto bg-[var(--overlay)] px-3 py-3 sm:px-5 sm:py-6 lg:overflow-hidden",
    children: (
      <div className="app-modal-surface relative z-[1] mx-auto flex w-full max-w-6xl flex-col overflow-hidden lg:h-[calc(100dvh-3rem)] lg:max-h-[calc(100dvh-3rem)]">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--border-subtle)] px-4 sm:px-6">
          <h2 className="text-[18px] font-semibold leading-7 text-[var(--text-primary)] sm:text-[20px]">Ad Details</h2>
          {renderDetailActions({
            closeButtonClassName: detailHeaderActionClassName,
            iconSize: 18,
            triggerClassName: detailHeaderMenuTriggerClassName,
            triggerSizeClassName: "h-10 w-10",
          })}
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
          <div className="flex min-h-0 flex-col border-b border-[var(--border-subtle)] lg:border-b-0 lg:border-r">
            <div className="flex min-h-0 flex-1 flex-col items-center justify-start overflow-y-auto bg-[rgba(255,255,255,0.02)] p-4 sm:p-6">
              <div className="flex min-h-0 w-full max-w-xl flex-1 flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)]">
                {shouldRenderLinkedInJobPreview ? (
                  <div className="flex min-h-[18rem] items-stretch justify-center bg-black/20 lg:min-h-0 lg:flex-1">
                    <LinkedInJobAdPreview ad={activeAd} />
                  </div>
                ) : shouldRenderLinkedInMessagePreview ? (
                  <div className="flex items-stretch justify-center bg-black/20" style={{ aspectRatio: "2 / 1" }}>
                    <LinkedInMessageAdPreview ad={activeAd} />
                  </div>
                ) : creativeSrc ? (
                  <div className="flex min-h-[18rem] items-center justify-center bg-black/20 lg:min-h-0 lg:flex-1">
                    <CreativeAssetMedia
                      src={creativeSrc}
                      alt={activeAd.title ?? activeAd.advertiserName}
                      hint={activeAd.format}
                      kind={creativeSrc === activeAd.videoUrl ? "video" : undefined}
                      poster={activeAd.posterUrl}
                      controls={creativeSrc === activeAd.videoUrl}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div
                    style={{ aspectRatio: String(creativeAspectRatio) }}
                    className="flex min-h-[18rem] items-center justify-center px-6 text-center text-sm text-[var(--text-tertiary)] lg:min-h-0 lg:flex-1"
                  >
                    No creative preview is stored for this ad yet.
                  </div>
                )}

                {!shouldRenderLinkedInJobPreview && !shouldRenderLinkedInMessagePreview ? (
                  <div className="min-h-0 shrink-0 space-y-1 p-4">
                    {landingPageUrl ? (
                      <p className="truncate text-[11px] font-semibold uppercase leading-4 text-[var(--text-tertiary)]">
                        {landingPageUrl.replace(/^https?:\/\//, "").split("/")[0]}
                      </p>
                    ) : null}
                    <p className="text-[15px] font-semibold leading-5 text-[var(--text-primary)]">
                      {activeAd.title ?? "Untitled creative"}
                    </p>
                    {activeAd.body ? (
                      <p className="whitespace-pre-line text-[13px] leading-5 text-[var(--text-secondary)]">{activeAd.body}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

            {metaVariations.length > 1 ? (
              <div className="mt-4 flex w-full max-w-xl flex-wrap items-center gap-2">
                <span className="mr-1 text-[13px] font-semibold leading-5 text-[var(--text-secondary)]">
                  Variation:
                </span>
                {metaVariations.map((variation, index) => {
                  const isActive = variation.id === activeAd.id;

                  return (
                    <button
                      key={variation.id}
                      type="button"
                      onClick={() => setActiveVariationId(variation.id)}
                      className={cn(
                        "h-9 rounded-xl border px-3 text-xs font-semibold leading-5 transition",
                        isActive
                          ? "border-violet-500 bg-violet-500 text-white ring-2 ring-violet-300"
                          : "border-[var(--border-subtle)] bg-[var(--bg-surface-1)] text-[var(--text-secondary)] hover:border-violet-500/70 hover:text-[var(--text-primary)]",
                      )}
                    >
                      {index === 0 ? "Original" : `Variant ${index}`}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <aside className="min-h-0 overflow-y-auto p-5 sm:p-6">
          <div className="space-y-7">
            {error ? (
              <p className="rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {error}
              </p>
            ) : null}

            <DetailSection title="Product">
              <DetailRow label="Name" value={activeAd.advertiserName} />
            </DetailSection>

            <DetailSection title="Status">
              <DetailRow
                label="Active"
                value={
                  <span className={status === "Active" ? "text-emerald-300" : "text-[var(--text-primary)]"}>
                    {status}
                  </span>
                }
              />
              <DetailRow label="Time running" value={`${activeAd.durationDays} days`} />
            </DetailSection>

            <DetailSection title="Creative">
              <DetailRow label="Language" value={activeAd.language ?? "Not available"} />
              <DetailRow label="Format" value={getAdFormatLabel(activeAd.format)} />
              <DetailRow label="Aspect ratio" value={getAspectRatioLabel(activeAd)} />
              <DetailRow label="Variations" value={`${variationCount} total`} />
            </DetailSection>

            <DetailSection title="Delivery">
              <DetailRow
                label="Platform"
                value={
                  <span className="inline-flex items-center justify-end gap-2">
                    <SourceLogo source={activeAd.source} />
                    {getPlatformLabel(activeAd.source)}
                  </span>
                }
              />
              <DetailRow label="Start date" value={formatLongDate(activeAd.firstSeenAt)} />
              <DetailRow label="Duration" value={`${activeAd.durationDays} days`} />
            </DetailSection>

            <DetailSection title="Call to Action">
              <DetailRow label="CTA" value={activeAd.callToAction ?? "Not available"} />
              <DetailRow
                label="Landing page"
                value={
                  landingPageUrl ? (
                    <a
                      href={landingPageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-64 items-center justify-end gap-1 truncate text-[var(--accent-hover)] transition hover:text-[var(--text-primary)]"
                    >
                      <span className="truncate">{landingPageUrl.replace(/^https?:\/\//, "")}</span>
                      <ExternalLink size={13} strokeWidth={1.9} className="shrink-0" />
                    </a>
                  ) : (
                    "Not available"
                  )
                }
              />
            </DetailSection>

            {activeAd.isSaved ? <SavedAdNoteEditor adId={activeAd.id} /> : null}
          </div>

          <div className="mt-8 space-y-3 border-t border-[var(--border-subtle)] pt-5">
            <SaveAdModalTrigger
              adId={activeAd.id}
              initialSaved={activeAd.isSaved}
              idleLabel="Save to Swipe File"
              savedLabel="Saved to Swipe File"
              className="app-button app-button-primary w-full"
            />

            {activeAd.isWatched ? (
              <button
                type="button"
                disabled={isWatchlistPending}
                onClick={toggleWatchlist}
                className="app-button app-button-secondary w-full"
              >
                {isWatchlistPending ? "Removing..." : "Remove from Watchlist"}
              </button>
            ) : null}

            {activeAd.adLibraryUrl ? (
              <a
                href={activeAd.adLibraryUrl}
                target="_blank"
                rel="noreferrer"
                className="app-button app-button-secondary w-full"
              >
                Open in Ad Library
              </a>
            ) : null}
          </div>
        </aside>
        </div>
      </div>
    ),
  });
}

function AdCardActionsMenu({
  ad,
  hideViewDetails = false,
  onRemovedFromWatchlist,
  onOpenDetails,
  onWatchlistChanged,
  panelClassName,
  swipeFileMeta,
  wrapperPositionClassName = "absolute right-3 top-3 z-20",
  wrapperClassName,
  triggerSizeClassName = "h-9 w-9",
  triggerClassName = "rounded-full",
}: {
  ad: BrowseAdRecord;
  hideViewDetails?: boolean;
  onRemovedFromWatchlist?: () => void;
  onOpenDetails: (ad: BrowseAdRecord) => void;
  onWatchlistChanged?: (isWatched: boolean) => void;
  panelClassName?: string;
  swipeFileMeta?: SwipeFileCardMeta;
  wrapperPositionClassName?: string;
  wrapperClassName?: string;
  triggerSizeClassName?: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isWatched, setIsWatched] = useState(ad.isWatched);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isSwipePending, startSwipeTransition] = useTransition();
  const activeCollectionIds = new Set(swipeFileMeta?.collections.map((collection) => collection.id) ?? []);
  const menuItemClassName =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left !text-sm !font-medium leading-5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-3)] hover:text-[var(--text-primary)]";

  useEffect(() => {
    setIsWatched(ad.isWatched);
  }, [ad.isWatched]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element;

      if (target.closest("[data-save-ad-modal]")) {
        return;
      }

      if (!menuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <div ref={menuRef} className={cn(wrapperPositionClassName, wrapperClassName)}>
      <button
        type="button"
        aria-label={`Open actions for ${ad.title ?? ad.advertiserName}`}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
        className={cn(
          "inline-flex items-center justify-center border border-white/12 bg-[rgba(12,10,18,0.78)] text-white backdrop-blur-sm transition hover:border-white/20 hover:bg-[rgba(18,15,28,0.9)]",
          triggerSizeClassName,
          triggerClassName,
        )}
      >
        <MoreHorizontal size={18} strokeWidth={1.9} />
      </button>

      {isOpen ? (
        <div className={cn("absolute right-0 top-11 w-64 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-1.5 shadow-[var(--shadow-overlay)]", panelClassName)}>
          <SaveAdModalTrigger
            adId={ad.id}
            initialSaved={ad.isSaved}
            idleLabel="Save to file"
            savedLabel="Saved to file"
            className={menuItemClassName}
            icon={<Bookmark size={15} strokeWidth={1.9} />}
          />

          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                if (isWatched) {
                  const response = await removeAdvertiserEntityFromWatchlistAction(ad.advertiserId);

                  if (response.status === "removed") {
                    setIsWatched(false);
                    setIsOpen(false);
                    onWatchlistChanged?.(false);
                    onRemovedFromWatchlist?.();
                    router.refresh();
                  }

                  return;
                }

                const response = await addAdvertiserToWatchlistByIdAction({
                  id: ad.advertiserId,
                  canonicalName: ad.advertiserName,
                  profileUrl: ad.advertiserProfileUrl,
                  industry: ad.advertiserIndustry,
                  companySize: ad.advertiserCompanySize,
                  country: ad.advertiserCountry,
                  summary: ad.advertiserSummary,
                });

                if (response.status === "queued" || response.status === "existing") {
                  setIsWatched(true);
                  setIsOpen(false);
                  onWatchlistChanged?.(true);
                  router.refresh();
                }
              });
            }}
            className={cn(menuItemClassName, "disabled:cursor-not-allowed disabled:opacity-55")}
          >
            {isWatched ? <Eye size={15} strokeWidth={1.9} /> : <Plus size={15} strokeWidth={1.9} />}
            {isWatched ? (isPending ? "Removing..." : "In watchlist") : isPending ? "Adding..." : "Add to watchlist"}
          </button>

          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(`${window.location.origin}/share/ads/${ad.id}`);
              setCopied(true);
            }}
            className={menuItemClassName}
          >
            <Copy size={15} strokeWidth={1.9} />
            {copied ? "Copied" : "Copy public link"}
          </button>

          {!hideViewDetails ? (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenDetails(ad);
              }}
              className={menuItemClassName}
            >
              <Info size={15} strokeWidth={1.9} />
              View more
            </button>
          ) : null}

          {ad.adLibraryUrl ? (
            <a
              href={ad.adLibraryUrl}
              target="_blank"
              rel="noreferrer"
              className={menuItemClassName}
            >
              <ExternalLink size={15} strokeWidth={1.9} />
              Open in Ad Library
            </a>
          ) : null}

          {swipeFileMeta ? (
            <>
              <div className="my-1 border-t border-[var(--border-subtle)]" />
              <p className="px-3 py-1 text-[11px] font-semibold uppercase leading-4 tracking-wider text-[var(--text-tertiary)]">
                Collections
              </p>
              {swipeFileMeta.allCollections.length ? (
                swipeFileMeta.allCollections.map((collection) => {
                  const isInCollection = activeCollectionIds.has(collection.id);

                  return (
                    <button
                      key={collection.id}
                      type="button"
                      disabled={isSwipePending || isInCollection}
                      onClick={() => {
                        startSwipeTransition(async () => {
                          const response = (await moveSavedAdToCollectionAction({
                            savedAdId: swipeFileMeta.savedAdId,
                            collectionId: collection.id,
                            currentCollectionIds: swipeFileMeta.collections.map((currentCollection) => currentCollection.id),
                          })) as SwipeFileCardActionResponse;

                          if (response.status !== "error") {
                            setIsOpen(false);
                            router.refresh();
                          }
                        });
                      }}
                      className={cn(menuItemClassName, "disabled:cursor-not-allowed disabled:opacity-55")}
                    >
                      {isInCollection ? (
                        <Check size={15} strokeWidth={1.9} className="text-violet-300" />
                      ) : (
                        <FolderOpen size={15} strokeWidth={1.9} />
                      )}
                      <span className="min-w-0 truncate">{collection.name}</span>
                    </button>
                  );
                })
              ) : (
                <p className="px-3 py-2 text-[13px] leading-5 text-[var(--text-tertiary)]">
                  Create a collection to move this ad.
                </p>
              )}

              <div className="my-1 border-t border-[var(--border-subtle)]" />

              <button
                type="button"
                disabled={isSwipePending}
                onClick={() => {
                  startSwipeTransition(async () => {
                    const response = (await removeSavedAdAction(swipeFileMeta.savedAdId)) as SwipeFileCardActionResponse;

                    if (response.status !== "error") {
                      setIsOpen(false);
                      router.refresh();
                    }
                  });
                }}
                className={cn(
                  menuItemClassName,
                  "text-red-200 hover:bg-red-500/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-55",
                )}
              >
                <Trash2 size={15} strokeWidth={1.9} />
                {isSwipePending ? "Updating..." : "Remove from swipe file"}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function NativeAdHeaderRunDate({ ad, variant = "neutral" }: { ad: BrowseAdRecord; variant?: "meta" | "neutral" }) {
  const isMeta = variant === "meta";

  return (
    <p
      className={cn(
        "mt-0.5 flex items-center gap-1.5 text-xs font-medium leading-4",
        isMeta
          ? "text-[#b0b3b8] [html[data-theme='light']_&]:text-[#65676b]"
          : "text-neutral-500 [html[data-theme='dark']_&]:text-[#b0b3b8]",
      )}
    >
      <span
        aria-label={isActiveAd(ad) ? "Active ad" : "Inactive ad"}
        title={isActiveAd(ad) ? "Active ad" : "Inactive ad"}
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          isActiveAd(ad) ? (isMeta ? "bg-emerald-400" : "bg-emerald-500") : "bg-[#8a8d91]",
        )}
      />
      <span>{formatRunDateRange(ad)}</span>
    </p>
  );
}

function AdVariantCountBadge({ ad }: { ad: BrowseAdRecord }) {
  if (ad.variationCount <= 1) {
    return null;
  }

  return (
    <span className="inline-flex h-6 items-center rounded-full border border-violet-500/25 bg-violet-500/10 px-2 text-xs font-semibold leading-4 text-violet-300 [html[data-theme='light']_&]:text-violet-700">
      {ad.variationCount} variants
    </span>
  );
}

const nativeAdActionsTriggerClassName =
  "!rounded-none !border-0 !bg-transparent !text-[var(--text-secondary)] !shadow-none !backdrop-blur-none hover:!border-0 hover:!bg-transparent hover:!text-[var(--text-primary)] [&_svg]:h-5 [&_svg]:w-5";

function MetaNativeAdCardContent({
  ad,
  onOpenDetails,
  swipeFileMeta,
  contentRef,
}: {
  ad: BrowseAdRecord;
  onOpenDetails: (ad: BrowseAdRecord) => void;
  swipeFileMeta?: SwipeFileCardMeta;
  contentRef: Ref<HTMLElement>;
}) {
  const destinationHost = ad.destinationUrl ? extractHostname(ad.destinationUrl) : null;
  const headline = ad.title ?? ad.advertiserName;
  const ctaLabel = ad.callToAction ?? "Learn more";
  const mediaAspectRatio = getFeedMediaAspectRatio(ad);

  return (
    <article
      ref={contentRef}
      className="overflow-visible rounded-lg border border-[#2f2a3d] bg-[#100d19] text-[#e4e6eb] shadow-sm [html[data-theme='light']_&]:border-[#dadde1] [html[data-theme='light']_&]:bg-white [html[data-theme='light']_&]:text-[#050505]"
    >
      <div className="relative flex items-start gap-2.5 px-3 pb-2.5 pt-3">
        <AdvertiserLogo name={ad.advertiserName} logoUrl={ad.advertiserLogoUrl} className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold leading-5">
            <button
              type="button"
              onClick={() => onOpenDetails(ad)}
              className="block min-w-0 truncate text-left text-[#e4e6eb] hover:underline [html[data-theme='light']_&]:text-[#050505]"
            >
              {ad.advertiserName}
            </button>
            <SourceLogo source={ad.source} className="h-3.5 w-5 shrink-0" />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <NativeAdHeaderRunDate ad={ad} variant="meta" />
            <AdVariantCountBadge ad={ad} />
          </div>
        </div>

        <AdCardActionsMenu
          ad={ad}
          onOpenDetails={onOpenDetails}
          swipeFileMeta={swipeFileMeta}
          wrapperClassName="right-2 top-2"
          triggerSizeClassName="h-7 w-7"
          triggerClassName={nativeAdActionsTriggerClassName}
        />
      </div>

      {ad.body ? (
        <div className="px-3 pb-2 text-[15px] leading-5 text-[#e4e6eb] [html[data-theme='light']_&]:text-[#050505]">
          <p className="line-clamp-3">{ad.body}</p>
          <span className="mt-1 block text-[13px] leading-5">
            <button
              type="button"
              onClick={() => onOpenDetails(ad)}
              className="text-[#b0b3b8] hover:underline [html[data-theme='light']_&]:text-[#65676b]"
            >
              See more
            </button>
          </span>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onOpenDetails(ad)}
        aria-label={`Open ${headline}`}
        className="block w-full text-left"
      >
        <div
          className="relative overflow-hidden rounded-b-lg bg-[#0c0a14] [html[data-theme='light']_&]:bg-[#f0f2f5]"
          style={{ aspectRatio: String(mediaAspectRatio) }}
        >
          <AdMediaPreview
            ad={ad}
            className={cn("h-full w-full", shouldContainFeedMedia(ad) ? "object-contain" : "object-cover")}
          />
        </div>
      </button>

      <div className="flex items-center gap-3 bg-[#171321] px-3 py-2.5 [html[data-theme='light']_&]:bg-[#f0f2f5]">
        <div className="min-w-0 flex-1">
          {destinationHost ? (
            <p className="truncate text-[12px] font-medium uppercase leading-4 text-[#b0b3b8] [html[data-theme='light']_&]:text-[#65676b]">{destinationHost}</p>
          ) : null}
          <p className="line-clamp-2 text-[15px] font-semibold leading-5 text-[#e4e6eb] [html[data-theme='light']_&]:text-[#050505]">{headline}</p>
        </div>
        <span className="inline-flex h-9 shrink-0 items-center rounded-md bg-[#2f2a3d] px-3 text-[14px] font-semibold leading-5 text-[#e4e6eb] [html[data-theme='light']_&]:bg-[#e4e6eb] [html[data-theme='light']_&]:text-[#050505]">
          {ctaLabel}
        </span>
      </div>

      {swipeFileMeta ? (
        <div className="border-t border-[#2f2a3d] px-3 py-3 [html[data-theme='light']_&]:border-[#ced0d4]">
          <SwipeFileCardMetaSection meta={swipeFileMeta} />
        </div>
      ) : null}
    </article>
  );
}

function GoogleNativeAdCardContent({
  ad,
  onOpenDetails,
  swipeFileMeta,
  contentRef,
}: {
  ad: BrowseAdRecord;
  onOpenDetails: (ad: BrowseAdRecord) => void;
  swipeFileMeta?: SwipeFileCardMeta;
  contentRef: Ref<HTMLElement>;
}) {
  const sitelinks = getGoogleSitelinks(ad);
  const ctaLabel = ad.callToAction?.trim();
  const hasMedia = !isTextAd(ad) && Boolean(ad.mediaUrl ?? ad.posterUrl ?? ad.videoUrl);
  const isVideo = isVideoAd(ad);
  const isImageCreative = isGoogleImageAd(ad) && hasMedia && !isVideo;
  const headline = isImageCreative ? null : getGoogleDisplayTitle(ad) ?? "Untitled ad";
  const description = isImageCreative ? null : getGoogleBodyCopy(ad);
  const mediaAspectRatio = getFeedMediaAspectRatio(ad);

  return (
    <article
      ref={contentRef}
      className="relative overflow-visible rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-sm [html[data-theme='dark']_&]:border-[#2f2a3d] [html[data-theme='dark']_&]:bg-[#100d19] [html[data-theme='dark']_&]:text-[#e4e6eb]"
    >
      <div className="px-3 pb-2.5 pt-3">
        <div className="flex items-start gap-2.5 pr-12">
          <AdvertiserLogo
            name={ad.advertiserName}
            logoUrl={ad.advertiserLogoUrl}
            className="h-7 w-7 shrink-0"
            fallbackClassName="text-xs"
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold leading-5">
              <button
                type="button"
                onClick={() => onOpenDetails(ad)}
                className="block min-w-0 truncate text-left text-neutral-900 hover:underline [html[data-theme='dark']_&]:text-[#e4e6eb]"
              >
                {ad.advertiserName}
              </button>
              <SourceLogo source={ad.source} className="h-3.5 w-5 shrink-0" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <NativeAdHeaderRunDate ad={ad} />
              <AdVariantCountBadge ad={ad} />
            </div>
          </div>
        </div>

        <AdCardActionsMenu
          ad={ad}
          onOpenDetails={onOpenDetails}
          swipeFileMeta={swipeFileMeta}
          wrapperClassName="right-2 top-2"
          triggerSizeClassName="h-7 w-7"
          triggerClassName={nativeAdActionsTriggerClassName}
        />

        {headline || description ? (
          <button
            type="button"
            onClick={() => onOpenDetails(ad)}
            className="mt-4 block w-full text-left"
          >
            {headline ? (
              <h2 className="text-[15px] font-semibold leading-5">
                <span className="line-clamp-2 text-neutral-900 [html[data-theme='dark']_&]:text-[#e4e6eb]">{headline}</span>
              </h2>
            ) : null}
            {description ? (
              <p className="mt-2 line-clamp-3 whitespace-pre-line text-[13px] leading-5 text-neutral-800 [html[data-theme='dark']_&]:text-[#e4e6eb]">{description}</p>
            ) : null}
          </button>
        ) : null}

        <GoogleSitelinkPills sitelinks={sitelinks} onSelect={() => onOpenDetails(ad)} />

        {ctaLabel && !isVideo ? (
          <button
            type="button"
            onClick={() => onOpenDetails(ad)}
            className="mt-4 flex w-full items-center justify-between rounded-md border border-neutral-200 px-3 py-2 text-left text-sm font-semibold leading-5 text-violet-500 transition hover:border-violet-200 hover:bg-violet-50 [html[data-theme='dark']_&]:border-[#2f2a3d] [html[data-theme='dark']_&]:bg-[#100d19] [html[data-theme='dark']_&]:hover:border-violet-500/50 [html[data-theme='dark']_&]:hover:bg-[#171321]"
          >
            <span className="truncate">{ctaLabel}</span>
            <ChevronRight size={18} strokeWidth={1.9} className="shrink-0 text-neutral-400 [html[data-theme='dark']_&]:text-[#b0b3b8]" />
          </button>
        ) : null}
      </div>

      {hasMedia ? (
        <button
          type="button"
          onClick={() => onOpenDetails(ad)}
          aria-label={`Open ${headline ?? ad.advertiserName}`}
          className="block w-full text-left"
        >
          <div
            className="relative overflow-hidden bg-neutral-100 [html[data-theme='dark']_&]:bg-[#0c0a14]"
            style={{ aspectRatio: String(mediaAspectRatio) }}
          >
            <AdMediaPreview
              ad={ad}
              className={cn("h-full w-full", shouldContainFeedMedia(ad) ? "object-contain" : "object-cover")}
            />
          </div>
        </button>
      ) : null}

      {swipeFileMeta ? (
        <div className="border-t border-neutral-100 px-4 py-3 [html[data-theme='dark']_&]:border-[#2f2a3d]">
          <SwipeFileCardMetaSection meta={swipeFileMeta} />
        </div>
      ) : null}
    </article>
  );
}

function LinkedinNativeAdCardContent({
  ad,
  onOpenDetails,
  swipeFileMeta,
  contentRef,
}: {
  ad: BrowseAdRecord;
  onOpenDetails: (ad: BrowseAdRecord) => void;
  swipeFileMeta?: SwipeFileCardMeta;
  contentRef: Ref<HTMLElement>;
}) {
  const isFollowCompanyAd = isLinkedInFollowCompanyAd(ad);
  const headline = isFollowCompanyAd ? getLinkedInFollowCompanyHeadline(ad) : ad.title ?? ad.advertiserName;
  const body = isFollowCompanyAd ? getLinkedInFollowCompanyBody(ad) : ad.body;
  const ctaLabel = ad.callToAction?.trim() || null;
  const hasMedia = Boolean(ad.mediaUrl ?? ad.posterUrl ?? ad.videoUrl);
  const shouldContainMedia = shouldContainFeedMedia(ad);
  const isJobAd = isLinkedInJobAd(ad);
  const isMessageAd = isLinkedInMessageAd(ad);
  const mediaAspectRatio =
    isJobAd && !hasMedia ? 16 / 9 : isMessageAd && !hasMedia ? 16 / 8 : isFollowCompanyAd && !hasMedia ? 16 / 9 : getFeedMediaAspectRatio(ad);

  return (
    <article
      ref={contentRef}
      className="relative overflow-visible rounded-lg border border-neutral-200 bg-white text-neutral-900 shadow-sm [html[data-theme='dark']_&]:border-[#2f2a3d] [html[data-theme='dark']_&]:bg-[#100d19] [html[data-theme='dark']_&]:text-[#e4e6eb]"
    >
      <div className="relative flex items-start gap-2.5 px-3 pb-2 pt-3">
        <AdvertiserLogo
          name={ad.advertiserName}
          logoUrl={ad.advertiserLogoUrl}
          className="h-7 w-7 shrink-0"
          fallbackClassName="text-xs"
        />
        <div className="min-w-0 flex-1 pr-10">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold leading-5">
            <button
              type="button"
              onClick={() => onOpenDetails(ad)}
              className="block min-w-0 truncate text-left text-neutral-900 hover:underline [html[data-theme='dark']_&]:text-[#e4e6eb]"
            >
              {ad.advertiserName}
            </button>
            <SourceLogo source={ad.source} className="h-3.5 w-5 shrink-0" />
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <NativeAdHeaderRunDate ad={ad} />
            <AdVariantCountBadge ad={ad} />
          </div>
        </div>

        <AdCardActionsMenu
          ad={ad}
          onOpenDetails={onOpenDetails}
          swipeFileMeta={swipeFileMeta}
          wrapperClassName="right-2 top-2"
          triggerSizeClassName="h-7 w-7"
          triggerClassName={nativeAdActionsTriggerClassName}
        />
      </div>

      {body && !isMessageAd && !isFollowCompanyAd ? (
        <div className="px-3 pb-2 text-[13px] leading-5 text-neutral-800 [html[data-theme='dark']_&]:text-[#e4e6eb]">
          <p className="line-clamp-3">{body}</p>
          <span className="mt-1 block text-[13px] font-semibold leading-5">
            <button
              type="button"
              onClick={() => onOpenDetails(ad)}
              className="text-neutral-600 hover:underline [html[data-theme='dark']_&]:text-[#b0b3b8]"
            >
              See more
            </button>
          </span>
        </div>
      ) : null}

      {hasMedia || isJobAd || isMessageAd || isFollowCompanyAd ? (
        <button
          type="button"
          onClick={() => onOpenDetails(ad)}
          aria-label={`Open ${headline}`}
          className="block w-full text-left"
        >
          <div
            className={cn(
              "relative overflow-hidden bg-neutral-100 [html[data-theme='dark']_&]:bg-[#0c0a14]",
              shouldContainMedia ? null : "max-h-96 md:max-h-none",
            )}
            style={{ aspectRatio: String(mediaAspectRatio) }}
          >
            {isFollowCompanyAd && !hasMedia ? (
              <LinkedInFollowCompanyAdPreview ad={ad} compact />
            ) : isJobAd && !hasMedia ? (
              <LinkedInJobAdPreview ad={ad} compact />
            ) : isMessageAd && !hasMedia ? (
              <LinkedInMessageAdPreview ad={ad} compact />
            ) : (
              <AdMediaPreview
                ad={ad}
                className={cn("h-full w-full", shouldContainMedia ? "object-contain" : "object-cover")}
              />
            )}
          </div>
        </button>
      ) : null}

      {!isJobAd && !isMessageAd ? (
        <div className="flex items-center gap-3 border-t border-neutral-100 px-3 py-2.5 [html[data-theme='dark']_&]:border-[#2f2a3d]">
          <button
            type="button"
            onClick={() => onOpenDetails(ad)}
            className="min-w-0 flex-1 text-left text-[15px] font-semibold leading-5 text-neutral-900 hover:underline [html[data-theme='dark']_&]:text-[#e4e6eb]"
          >
            <span className="line-clamp-2">{headline}</span>
            {isFollowCompanyAd ? (
              <span className="mt-1 line-clamp-2 text-[13px] font-medium leading-5 text-neutral-600 [html[data-theme='dark']_&]:text-[#b0b3b8]">{body}</span>
            ) : null}
          </button>
          {ctaLabel ? (
            <button
              type="button"
              onClick={() => onOpenDetails(ad)}
              className="inline-flex h-8 shrink-0 items-center rounded-md bg-neutral-100 px-3 text-xs font-semibold leading-5 text-neutral-700 transition hover:bg-neutral-200 [html[data-theme='dark']_&]:bg-[#171321] [html[data-theme='dark']_&]:text-[#e4e6eb] [html[data-theme='dark']_&]:hover:bg-[#2f2a3d]"
            >
              {ctaLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {swipeFileMeta ? (
        <div className="border-t border-neutral-100 px-3 py-3 [html[data-theme='dark']_&]:border-[#2f2a3d]">
          <SwipeFileCardMetaSection meta={swipeFileMeta} />
        </div>
      ) : null}
    </article>
  );
}

export function AdBentoCard({
  ad,
  onOpenDetails,
  layout = "grid",
  swipeFileMeta,
}: {
  ad: BrowseAdRecord;
  onOpenDetails: (ad: BrowseAdRecord) => void;
  layout?: "grid" | "columns";
  swipeFileMeta?: SwipeFileCardMeta;
}) {
  const workspaceHref = useWorkspaceHref();
  const contentRef = useRef<HTMLElement | null>(null);
  const [rowSpan, setRowSpan] = useState(() => estimateBentoRowSpan(ad));
  const mediaAspectRatio = getFeedMediaAspectRatio(ad);
  const columnSpanClass = getBentoColumnSpanClass(ad);
  const wrapperClassName = layout === "columns" ? adBentoColumnItemClass : cn(adBentoGridItemClass, columnSpanClass);
  const wrapperStyle = layout === "columns" ? undefined : { gridRowEnd: `span ${rowSpan}` };

  useEffect(() => {
    const element = contentRef.current;

    if (!element || typeof ResizeObserver === "undefined") {
      return;
    }

    let frame = 0;

    const update = () => {
      frame = 0;
      const height = element.getBoundingClientRect().height;
      const nextSpan = Math.max(1, Math.ceil((height + bentoGapPx) / (bentoRowHeight + bentoGapPx)));
      setRowSpan((current) => (current === nextSpan ? current : nextSpan));
    };

    const scheduleUpdate = () => {
      if (frame) {
        return;
      }

      frame = window.requestAnimationFrame(update);
    };

    scheduleUpdate();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(element);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }

      observer.disconnect();
    };
  }, [
    ad.id,
    ad.mediaWidth,
    ad.mediaHeight,
    ad.title,
    ad.body,
    ad.callToAction,
    ad.durationDays,
    ad.lastSeenAt,
    ad.isSaved,
    ad.status,
    swipeFileMeta?.savedAdId,
    swipeFileMeta?.note,
    swipeFileMeta?.collections,
  ]);

  if (ad.source === "facebook") {
    return (
      <div className={wrapperClassName} style={wrapperStyle}>
        <MetaNativeAdCardContent
          ad={ad}
          onOpenDetails={onOpenDetails}
          swipeFileMeta={swipeFileMeta}
          contentRef={contentRef}
        />
      </div>
    );
  }

  if (ad.source === "google") {
    return (
      <div className={wrapperClassName} style={wrapperStyle}>
        <GoogleNativeAdCardContent
          ad={ad}
          onOpenDetails={onOpenDetails}
          swipeFileMeta={swipeFileMeta}
          contentRef={contentRef}
        />
      </div>
    );
  }

  if (ad.source === "linkedin") {
    return (
      <div className={wrapperClassName} style={wrapperStyle}>
        <LinkedinNativeAdCardContent
          ad={ad}
          onOpenDetails={onOpenDetails}
          swipeFileMeta={swipeFileMeta}
          contentRef={contentRef}
        />
      </div>
    );
  }

  return (
    <div className={wrapperClassName} style={wrapperStyle}>
      <article
        ref={contentRef}
        className="app-surface-card overflow-hidden border border-[var(--border-subtle)] bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.08),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.08),transparent_26%),var(--bg-surface-1)]"
      >
        <div className="ad-card-media-divider relative border-b bg-[linear-gradient(180deg,rgba(12,10,18,0.82),rgba(9,8,14,0.94))]">
          <button
            type="button"
            onClick={() => onOpenDetails(ad)}
            aria-label={`Open ${ad.title ?? ad.advertiserName}`}
            className="block w-full text-left transition hover:opacity-95"
          >
            <div
              className="relative overflow-hidden bg-[rgba(5,5,8,0.72)]"
              style={{ aspectRatio: String(mediaAspectRatio) }}
            >
              <AdMediaPreview
                ad={ad}
                className="h-full w-full object-contain"
              />
            </div>
          </button>

          <AdCardActionsMenu ad={ad} onOpenDetails={onOpenDetails} swipeFileMeta={swipeFileMeta} />
        </div>

        <div className="space-y-5 p-5">
          <AdvertiserIdentity
            name={ad.advertiserName}
            href={workspaceHref(`/advertisers/${ad.advertiserId}/overview`)}
            logoUrl={ad.advertiserLogoUrl}
            logoSizeClassName="h-10 w-10"
          />

          <div className="space-y-3">
            <h2 className="text-lg font-semibold leading-6 text-[var(--text-primary)]">
              <button
                type="button"
                onClick={() => onOpenDetails(ad)}
                className="text-left !text-[var(--text-primary)] !underline !decoration-transparent underline-offset-4 transition hover:!text-[var(--accent-hover)] hover:!decoration-violet-500"
              >
                {ad.title ?? "Untitled creative"}
              </button>
            </h2>
            {ad.body ? (
              <div className="space-y-1">
                <p className="line-clamp-3 text-sm leading-6 text-[var(--text-secondary)]">{ad.body}</p>
                <button
                  type="button"
                  onClick={() => onOpenDetails(ad)}
                  className="!text-sm font-medium !leading-5 text-[var(--accent-hover)] transition hover:text-[var(--text-primary)]"
                >
                  Read more
                </button>
              </div>
            ) : (
              <p className="text-sm leading-6 text-[var(--text-secondary)]">No primary text is stored for this ad yet.</p>
            )}
          </div>

          {!swipeFileMeta ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--border-subtle)] pt-4 text-sm text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-2 font-medium text-[var(--text-primary)]">
                <SourceLogo source={ad.source} />
              </span>
              <span className="inline-flex items-center gap-2">
                {ad.callToAction ? (
                  <Check size={15} strokeWidth={2} className="text-emerald-300" />
                ) : (
                  <X size={15} strokeWidth={2} className="text-[var(--text-tertiary)]" />
                )}
                CTA
              </span>
              <span className="inline-flex items-center gap-2">
                {isActiveAd(ad) ? (
                  <span
                    aria-label="Active ad"
                    title="Active ad"
                    className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]"
                  />
                ) : null}
                {formatRunDateRange(ad)}
              </span>
              <AdVariantCountBadge ad={ad} />
            </div>
          ) : null}

          {swipeFileMeta ? (
            <div className="border-t border-[var(--border-subtle)] pt-4">
              <SwipeFileCardMetaSection meta={swipeFileMeta} />
            </div>
          ) : null}
        </div>
      </article>
    </div>
  );
}

export function BrowseAdsPage({ result }: { result: BrowseAdsResult }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const requestedPageRef = useRef<number | null>(null);
  const adDetailRequestRef = useRef(0);
  const closingModalAdIdRef = useRef<string | null>(null);
  const [selectedAd, setSelectedAd] = useState<BrowseAdRecord | null>(null);
  const [selectedAdDetail, setSelectedAdDetail] = useState<AdDetailRecord | null>(null);
  const [selectedAdError, setSelectedAdError] = useState<string | null>(null);
  const [, startDetailTransition] = useTransition();
  const selectedFormats = searchParams.getAll("format");
  const rawSelectedNetwork = searchParams.get("network");
  const selectedNetwork: NetworkSelectValue = rawSelectedNetwork && isNetworkFilter(rawSelectedNetwork) ? rawSelectedNetwork : "all";
  const industry = searchParams.get("industry") ?? "";
  const country = searchParams.get("country") ?? "";
  const language = searchParams.get("language") ?? "";
  const status = (searchParams.get("status") as StatusFilter | null) ?? "all";
  const watchlist = (searchParams.get("watchlist") as WatchlistFilter | null) ?? "all";
  const requestedSort = searchParams.get("sort");
  const sort = isBrowseAdsSort(requestedSort) ? requestedSort : "most_recent";
  const age = (searchParams.get("age") as AdAgeFilter | null) ?? "all";
  const modalAdId = searchParams.get("ad");
  const pageFromUrl = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const listParamsKey = (() => {
    const params = new URLSearchParams(searchParams.toString());

    params.delete("ad");
    params.delete("page");

    return params.toString();
  })();
  const [visiblePage, setVisiblePage] = useState(pageFromUrl);
  const pageSize = 24;
  const getCurrentSearchParams = useCallback(() => {
    if (typeof window === "undefined") {
      return new URLSearchParams(searchParams.toString());
    }

    return new URLSearchParams(window.location.search);
  }, [searchParams]);
  const replacePageParam = useCallback((nextPage: number) => {
    const next = getCurrentSearchParams();

    if (nextPage === 1) {
      next.delete("page");
    } else {
      next.set("page", String(nextPage));
    }

    const queryString = next.toString();
    window.history.replaceState(window.history.state, "", queryString ? `${pathname}?${queryString}` : pathname);
  }, [getCurrentSearchParams, pathname]);

  const updateParams = (updates: Record<string, string | string[] | null>, options?: { scroll?: boolean }) => {
    const next = getCurrentSearchParams();
    next.delete("reactionsMin");
    next.delete("reactionsMax");
    next.delete("commentsMin");
    next.delete("commentsMax");

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

      if (!value) {
        continue;
      }

      if (
        (key === "sort" && value === "most_recent") ||
        (key === "age" && value === "all") ||
        (key === "status" && value === "all") ||
        (key === "network" && value === "all") ||
        (key === "watchlist" && value === "all") ||
        (key === "page" && value === "1")
      ) {
        continue;
      }

      next.set(key, value);
    }

    if (updates.page === undefined) {
      next.delete("page");
    }

    const queryString = next.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname, options);
  };

  const filteredAds = result.ads
    .filter((ad) => {
      if (selectedFormats.length && !selectedFormats.includes(getAdFormatKey(ad.format))) {
        return false;
      }

      if (!matchesNetworkFilter(ad.source, selectedNetwork)) {
        return false;
      }

      if (industry && ad.advertiserIndustry !== industry) {
        return false;
      }

      if (country && ad.advertiserCountry !== country) {
        return false;
      }

      if (language && ad.language !== language) {
        return false;
      }

      if (status === "active" && ad.status?.toLowerCase() !== "active") {
        return false;
      }

      if (status === "inactive" && ad.status?.toLowerCase() === "active") {
        return false;
      }

      if (watchlist === "watched" && !ad.isWatched) {
        return false;
      }

      if (watchlist === "not_watched" && ad.isWatched) {
        return false;
      }

      if (!getAgeMatch(ad, age)) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      if (sort === "most_impressions") {
        return (right.impressions ?? 0) - (left.impressions ?? 0) || compareAdsByMostRecent(left, right);
      }

      if (sort === "longest_running") {
        return right.durationDays - left.durationDays || compareAdsByMostRecent(left, right);
      }

      return compareAdsByMostRecent(left, right);
    });
  const displayAds = filteredAds;

  const pageCount = Math.max(1, Math.ceil(displayAds.length / pageSize));
  const safePage = Math.min(visiblePage, pageCount);
  const visibleAds = displayAds.slice(0, safePage * pageSize);
  const hasMorePages = safePage < pageCount;

  useEffect(() => {
    requestedPageRef.current = null;
    setVisiblePage(Math.min(pageFromUrl, pageCount));
  }, [listParamsKey, pageCount, pageFromUrl]);

  useEffect(() => {
    requestedPageRef.current = null;
  }, [listParamsKey, safePage]);

  useEffect(() => {
    const target = loadMoreRef.current;

    if (!target || !hasMorePages || !visibleAds.length) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const nextPage = safePage + 1;

        if (!entries.some((entry) => entry.isIntersecting) || requestedPageRef.current === nextPage) {
          return;
        }

        requestedPageRef.current = nextPage;
        setVisiblePage(nextPage);
        replacePageParam(nextPage);
      },
      { rootMargin: "700px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMorePages, replacePageParam, safePage, visibleAds.length]);

  const chips: FilterChip[] = [];

  for (const selectedFormat of selectedFormats) {
    const label = formatOptions.find((option) => option.value === selectedFormat)?.label ?? selectedFormat;
    chips.push({
      label: "Ad format",
      value: label,
      remove: () => updateParams({ format: selectedFormats.filter((value) => value !== selectedFormat) }),
    });
  }

  if (industry) {
    chips.push({
      label: "Industry",
      value: industry,
      remove: () => updateParams({ industry: null }),
    });
  }

  if (country) {
    chips.push({
      label: "Country",
      value: country,
      remove: () => updateParams({ country: null }),
    });
  }

  if (language) {
    chips.push({
      label: "Language",
      value: language,
      remove: () => updateParams({ language: null }),
    });
  }

  if (status !== "all") {
    chips.push({
      label: "Status",
      value: status === "active" ? "Active" : "Inactive",
      remove: () => updateParams({ status: null }),
    });
  }

  if (watchlist !== "all") {
    chips.push({
      label: "Watchlist",
      value: watchlist === "watched" ? "Watched" : "Not watched",
      remove: () => updateParams({ watchlist: null }),
    });
  }

  if (selectedNetwork !== "all") {
    chips.push({
      label: "Network",
      value: networkOptions.find((option) => option.value === selectedNetwork)?.label ?? selectedNetwork,
      remove: () => updateParams({ network: null }),
    });
  }

  if (age !== "all") {
    chips.push({
      label: "Ad age",
      value: ageOptions.find((option) => option.value === age)?.label ?? age,
      remove: () => updateParams({ age: null }),
    });
  }

  const hasActiveFilters = chips.length > 0;
  const hasClientOnlyFilters =
    selectedFormats.length > 0 ||
    Boolean(industry) ||
    Boolean(country) ||
    Boolean(language) ||
    status !== "all" ||
    watchlist !== "all" ||
    age !== "all";
  const adsFoundLabel = hasClientOnlyFilters
    ? `${filteredAds.length.toLocaleString()} matching ads`
    : `${result.totalAds.toLocaleString()} ads found`;
  const [filtersOpen, setFiltersOpen] = useState(() => chips.length > 0);
  const buildAdModalHref = (adId: string | null) => {
    const next = getCurrentSearchParams();

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

    loadAdDetails(modalAdId, result.ads.find((ad) => ad.id === modalAdId) ?? null);
  }, [modalAdId, result.ads, selectedAd?.id, selectedAdDetail?.id]);

  return (
    <div className="space-y-6">
      {selectedAd ? (
        <AdDetailsModal
          ad={selectedAd}
          detail={selectedAdDetail}
          error={selectedAdError}
          onClose={closeAdDetails}
          onWatchlistChanged={(isWatched) => {
            setSelectedAd((current) => (current ? { ...current, isWatched } : current));
            setSelectedAdDetail((current) =>
              current
                ? {
                    ...current,
                    isWatched,
                    metaVariations: current.metaVariations.map((variation) => ({ ...variation, isWatched })),
                  }
                : current,
            );
            router.refresh();
          }}
        />
      ) : null}

      <section className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-start gap-4">
            <ToolbarSelect
              label="Network"
              value={selectedNetwork}
              onChange={(event) => updateParams({ network: event.target.value })}
              wrapperClassName="min-w-40"
              className="h-10"
            >
              <option value="all">All networks</option>
              {networkOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </ToolbarSelect>

            <div className="grid gap-[7px]">
              <span aria-hidden="true" className="invisible text-[12px] font-medium leading-4">
                Filters
              </span>
              <button
                type="button"
                onClick={() => setFiltersOpen((value) => !value)}
                className={cn(
                  "app-button app-button-secondary gap-2",
                  filtersOpen && "border-violet-500/30 bg-[var(--accent-soft)] text-[var(--text-primary)]",
                )}
              >
                <SlidersHorizontal size={16} strokeWidth={1.9} />
                Filters
              </button>
            </div>

            <ToolbarSelect
              label="Sort by"
              value={sort}
              onChange={(event) => updateParams({ sort: event.target.value })}
              wrapperClassName="min-w-44"
              className="h-10"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </ToolbarSelect>

            <ToolbarSelect
              label="Watchlist"
              value={watchlist}
              onChange={(event) => updateParams({ watchlist: event.target.value })}
              wrapperClassName="min-w-40"
              className="h-10"
            >
              <option value="all">All</option>
              <option value="watched">Watched</option>
              <option value="not_watched">Not watched</option>
            </ToolbarSelect>

            <p className="flex h-10 items-center self-end text-[14px] leading-[22px] text-[var(--text-secondary)]">
              {adsFoundLabel}
            </p>
          </div>
        </div>

        {filtersOpen ? (
          <Toolbar>
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <ToolbarSelect
                  label="Industry"
                  value={industry}
                  onChange={(event) => updateParams({ industry: event.target.value || null })}
                >
                  <option value="">All industries</option>
                  {result.availableIndustries.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </ToolbarSelect>

                <ToolbarSelect
                  label="Country"
                  value={country}
                  onChange={(event) => updateParams({ country: event.target.value || null })}
                >
                  <option value="">All countries</option>
                  {result.availableCountries.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </ToolbarSelect>

                <ToolbarSelect
                  label="Language"
                  value={language}
                  onChange={(event) => updateParams({ language: event.target.value || null })}
                >
                  <option value="">All languages</option>
                  {result.availableLanguages.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </ToolbarSelect>

                <ToolbarSelect label="Status" value={status} onChange={(event) => updateParams({ status: event.target.value })}>
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </ToolbarSelect>

                <ToolbarSelect label="Ad age" value={age} onChange={(event) => updateParams({ age: event.target.value })}>
                  <option value="all">All</option>
                  {ageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </ToolbarSelect>
              </div>

              <div className="grid gap-2">
                <span className="text-[12px] font-medium leading-4 text-[var(--text-secondary)]">Ad format</span>
                <div className="flex flex-wrap gap-2">
                  {formatOptions.map((option) => {
                    const active = selectedFormats.includes(option.value);

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          updateParams({
                            format: active
                              ? selectedFormats.filter((value) => value !== option.value)
                              : [...selectedFormats, option.value],
                          });
                        }}
                        className={`app-pill px-3 py-2 ${active ? "app-pill-accent" : "app-pill-default"}`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end">
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={() => {
                      router.push(pathname);
                    }}
                    className="app-button app-button-secondary"
                  >
                    Clear all filters
                  </button>
                ) : null}
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

      {visibleAds.length ? (
        <>
          <section
            className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-5"
            style={{ gridAutoRows: `${bentoRowHeight}px` }}
          >
            {visibleAds.map((ad) => (
              <AdBentoCard key={ad.id} ad={ad} onOpenDetails={openAdDetails} />
            ))}
          </section>

          <section ref={loadMoreRef} className="flex flex-col items-center gap-3 py-2 text-center">
            <p className="text-[14px] leading-[22px] text-[var(--text-secondary)]">
              Showing {visibleAds.length} of {filteredAds.length} ads
            </p>
            {hasMorePages ? (
              <button
                type="button"
                onClick={() => {
                  const nextPage = safePage + 1;

                  setVisiblePage(nextPage);
                  replacePageParam(nextPage);
                }}
                className="app-button app-button-secondary"
              >
                Load more ads
              </button>
            ) : (
              <p className="text-[13px] leading-5 text-[var(--text-tertiary)]">All matching ads loaded</p>
            )}
          </section>
        </>
      ) : (
        <EmptyState
          title={hasActiveFilters ? "No ads match these filters" : "No ads to show yet"}
          body={
            hasActiveFilters
              ? "Try a broader search, remove one filter, or switch to a different sort order."
              : "Add an advertiser to start pulling ads into the library."
          }
          primaryAction={
            hasActiveFilters ? (
              <button
                type="button"
                onClick={() => {
                  router.push(pathname);
                }}
                className="app-button app-button-primary"
              >
                Clear all filters
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
