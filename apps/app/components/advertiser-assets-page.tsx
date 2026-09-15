"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Image as ImageIcon, Images, Megaphone, Search, Video } from "lucide-react";

import { getSourceLabel, supportedSourceNames, type SourceName } from "@adluv/config";

import { useWorkspaceHref } from "../lib/client-workspace";
import { cn, DetailField, EmptyState, Pill, StatCard, SurfaceCard, Toolbar, ToolbarInput, ToolbarSelect } from "./app-ui";
import { CreativeAssetMedia, isVideoCreativeAsset } from "./creative-asset-media";
import { SourceLogo } from "./source-logo";

type AdvertiserAssetAd = {
  id: string;
  source: SourceName;
  title: string | null;
  body: string | null;
  format: string | null;
  callToAction: string | null;
  status: string | null;
  destinationUrl: string | null;
  mediaUrl: string | null;
  posterUrl: string | null;
  videoUrl: string | null;
  snapshotUrl: string | null;
  snapshotTitle: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  isSaved: boolean;
};

type AssetFilter = "all" | "images" | "videos";
type SortFilter = "most_used" | "newest";
type AssetSourceFilter = (typeof supportedSourceNames)[number];
type AssetContentTab = "creatives" | "copy" | "headlines" | "descriptions";

type AssetRecord = {
  key: string;
  previewUrl: string;
  posterUrl: string | null;
  type: "Image" | "Video";
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  relatedAds: AdvertiserAssetAd[];
};

type CopyRecord = {
  text: string;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

const sortOptions: Array<{ label: string; value: SortFilter }> = [
  { label: "Most used", value: "most_used" },
  { label: "Newest", value: "newest" },
];

const contentTabs: Array<{ label: string; value: AssetContentTab }> = [
  { label: "Creatives", value: "creatives" },
  { label: "Ad copy", value: "copy" },
  { label: "Headlines", value: "headlines" },
  { label: "Descriptions", value: "descriptions" },
];

function isAssetSourceFilter(value: string | null): value is AssetSourceFilter {
  return supportedSourceNames.some((source) => source === value);
}

function isAssetContentTab(value: string | null): value is AssetContentTab {
  return contentTabs.some((tab) => tab.value === value);
}

function isSortFilter(value: string | null): value is SortFilter {
  return sortOptions.some((option) => option.value === value);
}

function getDurationLabel(firstSeenAt: Date, lastSeenAt: Date) {
  const days = Math.max(1, Math.ceil((lastSeenAt.getTime() - firstSeenAt.getTime()) / (24 * 60 * 60 * 1000)));
  return `${days} day${days === 1 ? "" : "s"}`;
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function inferAssetType(ad: AdvertiserAssetAd): "Image" | "Video" {
  return isVideoCreativeAsset(ad.videoUrl ?? ad.mediaUrl ?? "", ad.format) ? "Video" : "Image";
}

function buildAssets(ads: AdvertiserAssetAd[]) {
  const grouped = new Map<string, AssetRecord>();

  for (const ad of ads) {
    const key = ad.videoUrl ?? ad.mediaUrl;
    if (!key) {
      continue;
    }

    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.posterUrl && ad.posterUrl) {
        existing.posterUrl = ad.posterUrl;
      }
      if (ad.firstSeenAt < existing.firstSeenAt) {
        existing.firstSeenAt = ad.firstSeenAt;
      }
      if (ad.lastSeenAt > existing.lastSeenAt) {
        existing.lastSeenAt = ad.lastSeenAt;
      }
      existing.relatedAds.push(ad);
      continue;
    }

    grouped.set(key, {
      key,
      previewUrl: key,
      posterUrl: ad.posterUrl,
      type: inferAssetType(ad),
      count: 1,
      firstSeenAt: ad.firstSeenAt,
      lastSeenAt: ad.lastSeenAt,
      relatedAds: [ad],
    });
  }

  return Array.from(grouped.values()).map((asset) => ({
    ...asset,
    relatedAds: asset.relatedAds.sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime()),
  }));
}

function buildCopyRecords(ads: AdvertiserAssetAd[], tab: AssetContentTab) {
  if (tab === "creatives") {
    return [];
  }

  const grouped = new Map<string, CopyRecord>();

  for (const ad of ads) {
    const text = tab === "copy" ? ad.body : tab === "headlines" ? ad.title : null;
    const normalized = text?.trim();

    if (!normalized) {
      continue;
    }

    const existing = grouped.get(normalized);
    if (existing) {
      existing.count += 1;
      if (ad.firstSeenAt < existing.firstSeenAt) {
        existing.firstSeenAt = ad.firstSeenAt;
      }
      if (ad.lastSeenAt > existing.lastSeenAt) {
        existing.lastSeenAt = ad.lastSeenAt;
      }
      continue;
    }

    grouped.set(normalized, {
      text: normalized,
      count: 1,
      firstSeenAt: ad.firstSeenAt,
      lastSeenAt: ad.lastSeenAt,
    });
  }

  return Array.from(grouped.values());
}

export function AdvertiserAssetsPage({
  advertiserId,
  advertiserName,
  ads,
}: {
  advertiserId: string;
  advertiserName: string;
  ads: AdvertiserAssetAd[];
}) {
  const pathname = usePathname();
  const workspaceHref = useWorkspaceHref();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [queryDraft, setQueryDraft] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    setQueryDraft(searchParams.get("q") ?? "");
  }, [searchParams]);

  const assetType = (searchParams.get("assetType") as AssetFilter | null) ?? "all";
  const requestedSort = searchParams.get("sort");
  const sort = isSortFilter(requestedSort) ? requestedSort : "most_used";
  const requestedTab = searchParams.get("tab");
  const contentTab = isAssetContentTab(requestedTab) ? requestedTab : "creatives";
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const assetsBySource = supportedSourceNames.map((source) => ({
    source,
    assets: buildAssets(ads.filter((ad) => ad.source === source)),
  }));
  const fallbackSource = assetsBySource.find((entry) => entry.assets.length)?.source ?? "facebook";
  const requestedSource = searchParams.get("source");
  const source = isAssetSourceFilter(requestedSource) ? requestedSource : fallbackSource;
  const sourceAds = ads.filter((ad) => ad.source === source);
  const allAssets = assetsBySource.find((entry) => entry.source === source)?.assets ?? [];

  const filteredAssets = allAssets
    .filter((asset) => {
      if (assetType === "images") {
        return asset.type === "Image";
      }

      if (assetType === "videos") {
        return asset.type === "Video";
      }

      return true;
    })
    .sort((left, right) => {
      if (sort === "newest") {
        return right.lastSeenAt.getTime() - left.lastSeenAt.getTime();
      }

      return right.count - left.count || right.lastSeenAt.getTime() - left.lastSeenAt.getTime();
    });

  const mostUsedAsset = [...allAssets].sort((left, right) => right.count - left.count)[0] ?? null;
  const copyRows = buildCopyRecords(sourceAds, contentTab)
    .filter((item) => !query || item.text.toLowerCase().includes(query))
    .sort((left, right) => {
      if (sort === "newest") {
        return right.lastSeenAt.getTime() - left.lastSeenAt.getTime();
      }

      return right.count - left.count || right.lastSeenAt.getTime() - left.lastSeenAt.getTime();
    });

  const buildParamsHref = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(updates)) {
      if (
        !value ||
        (key === "assetType" && value === "all") ||
        (key === "sort" && value === "most_used") ||
        (key === "tab" && value === "creatives")
      ) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
    }

    const queryString = next.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  };

  const updateParams = (updates: Record<string, string | null>) => {
    router.push(buildParamsHref(updates));
  };

  return (
    <div className="space-y-6">
      <nav aria-label="Asset platform" className="flex flex-wrap gap-2">
        {assetsBySource.map((entry) => {
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
              <span className="text-xs font-medium text-[var(--text-tertiary)]">{entry.assets.length}</span>
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Asset content" className="flex flex-wrap gap-2 border-b border-[var(--border-subtle)] pb-3">
        {contentTabs.map((tab) => {
          const active = tab.value === contentTab;

          return (
            <Link
              key={tab.value}
              href={buildParamsHref({ tab: tab.value, q: null })}
              className={cn(
                "inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition",
                active
                  ? "border-[rgba(124,58,237,0.28)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {contentTab === "creatives" ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Images} label="Total assets" value={allAssets.length} />
          <StatCard icon={ImageIcon} label="Image assets" value={allAssets.filter((asset) => asset.type === "Image").length} />
          <StatCard icon={Video} label="Video assets" value={allAssets.filter((asset) => asset.type === "Video").length} />
          <StatCard
            icon={Megaphone}
            label="Most used asset"
            value={mostUsedAsset ? `${mostUsedAsset.type} · ${mostUsedAsset.count} ads` : "None yet"}
          />
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2">
          <StatCard icon={Megaphone} label="Unique snippets" value={copyRows.length} />
          <StatCard icon={Images} label="Used in ads" value={copyRows.reduce((sum, row) => sum + row.count, 0)} />
        </section>
      )}

      <Toolbar>
        {contentTab === "creatives" ? (
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-[7px]">
              <span className="text-[12px] font-medium leading-4 text-[var(--text-secondary)]">Asset type</span>
              <div className="inline-flex h-10 items-center gap-1 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-1">
                {[
                  { label: "All", value: "all" },
                  { label: "Images", value: "images" },
                  { label: "Videos", value: "videos" },
                ].map((option) => {
                  const active = option.value === assetType;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateParams({ assetType: option.value })}
                      style={{ fontSize: "13px", lineHeight: "18px" }}
                      className={cn(
                        "inline-flex h-8 items-center rounded-[10px] px-4 font-medium transition",
                        active
                          ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <ToolbarSelect
              label="Sort by"
              value={sort}
              wrapperClassName="w-[240px]"
              onChange={(event) => updateParams({ sort: event.target.value })}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </ToolbarSelect>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                updateParams({ q: queryDraft || null });
              }}
            >
              <ToolbarInput
                label="Search"
                icon={Search}
                value={queryDraft}
                placeholder={`Search ${contentTabs.find((tab) => tab.value === contentTab)?.label.toLowerCase() ?? "copy"}`}
                onChange={(event) => setQueryDraft(event.target.value)}
              />
            </form>

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
          </div>
        )}
      </Toolbar>

      {contentTab !== "creatives" ? (
        copyRows.length ? (
          <section className="overflow-hidden rounded-[18px] border border-[var(--border-subtle)]">
            <div className="grid grid-cols-[2fr_0.7fr_0.8fr_0.8fr_0.7fr] gap-3 border-b border-[var(--border-subtle)] bg-[color:var(--bg-surface-3)] px-4 py-3 text-[12px] font-medium leading-4 text-[var(--text-tertiary)]">
              <span>Text</span>
              <span>Used in ads</span>
              <span>First seen</span>
              <span>Last seen</span>
              <span>Actions</span>
            </div>
            {copyRows.map((row, index) => (
              <div
                key={`${contentTab}-${row.text}`}
                className={cn(
                  "grid grid-cols-[2fr_0.7fr_0.8fr_0.8fr_0.7fr] gap-3 border-b border-[var(--border-subtle)] px-4 py-4 text-[14px] leading-7 text-[var(--text-secondary)] last:border-b-0",
                  index % 2 === 0 ? "bg-[color:var(--bg-surface-2)]" : "bg-[color:var(--bg-surface-1)]",
                )}
              >
                <span className="max-w-none whitespace-pre-wrap text-[var(--text-primary)]">{row.text}</span>
                <span>{row.count}</span>
                <span>{formatDate(row.firstSeenAt)}</span>
                <span>{formatDate(row.lastSeenAt)}</span>
                <span>
                  <Link
                    href={workspaceHref(`/advertisers/${advertiserId}/ads?source=${source}&q=${encodeURIComponent(row.text)}`)}
                    className="text-[13px] font-medium text-[var(--accent-hover)] transition hover:text-[var(--text-primary)]"
                  >
                    View ads
                  </Link>
                </span>
              </div>
            ))}
          </section>
        ) : (
          <EmptyState
            title="No copy found"
            body={`No ${contentTabs.find((tab) => tab.value === contentTab)?.label.toLowerCase() ?? "copy"} snippets are available for ${getSourceLabel(source)} yet.`}
          />
        )
      ) : filteredAssets.length ? (
        <section className="grid gap-5 xl:grid-cols-2">
          {filteredAssets.map((asset) => (
            <SurfaceCard key={asset.key} className="overflow-hidden p-0">
              <div className="border-b border-[var(--border-subtle)] bg-[color:var(--bg-surface-2)]">
                <CreativeAssetMedia
                  src={asset.previewUrl}
                  alt={`${advertiserName} asset`}
                  hint={asset.type}
                  kind={asset.type === "Video" ? "video" : undefined}
                  poster={asset.posterUrl}
                  className="aspect-[16/10] w-full object-cover"
                />
              </div>

              <div className="space-y-5 p-5">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <h2
                      className="text-[28px] leading-[0.96] tracking-[-0.04em] text-[var(--text-primary)]"
                      style={{ fontFamily: "var(--font-instrument-serif), serif" }}
                    >
                      {asset.type}
                    </h2>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Pill>{getSourceLabel(source)}</Pill>
                      <Pill>{asset.count} ads</Pill>
                    </div>
                  </div>
                  <p className="text-[14px] leading-6 text-[var(--text-secondary)]">
                    Used in {asset.count} ads over {getDurationLabel(asset.firstSeenAt, asset.lastSeenAt)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-x-8 gap-y-5 lg:grid-cols-3">
                  <DetailField label="Asset type" value={asset.type} />
                  <DetailField label="Used in ads" value={asset.count} />
                  <DetailField label="Seen over" value={getDurationLabel(asset.firstSeenAt, asset.lastSeenAt)} />
                  <DetailField label="Newest reuse" value={formatDate(asset.lastSeenAt)} />
                </div>

                <div className="flex flex-wrap gap-3 border-t border-[var(--border-subtle)] pt-5">
                  <Link
                    href={workspaceHref(`/advertisers/${advertiserId}/ads?asset=${encodeURIComponent(asset.key)}`)}
                    className="app-button app-button-secondary"
                  >
                    View related ads
                  </Link>
                  <Link href={workspaceHref(`/advertisers/${advertiserId}/ads`)} className="app-button app-button-secondary">
                    Open advertiser ads
                  </Link>
                </div>
              </div>
            </SurfaceCard>
          ))}
        </section>
      ) : (
        <section className="rounded-[28px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center sm:px-10">
          <p className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-tertiary)]">{advertiserName}</p>
          <h2
            className="mt-5 text-4xl leading-none tracking-[-0.04em] text-[var(--text-primary)] sm:text-5xl"
            style={{ fontFamily: "var(--font-instrument-serif), serif" }}
          >
            No stored assets yet
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[14px] leading-6 text-[var(--text-secondary)]">
            Assets appear here after the worker downloads and stores creative images or videos for this advertiser.
          </p>
        </section>
      )}
    </div>
  );
}
