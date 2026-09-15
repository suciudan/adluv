"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Images } from "lucide-react";

import { FilterTabs, Pill, SurfaceCard } from "./app-ui";
import { CreativeAssetMedia } from "./creative-asset-media";
import { getAdFormatLabel } from "../lib/ad-format";
import { useWorkspaceHref } from "../lib/client-workspace";

type VariationTab = "same_creative" | "same_copy" | "same_landing_page";

type Variation = {
  id: string;
  title: string | null;
  body: string | null;
  format: string | null;
  callToAction: string | null;
  destinationUrl: string | null;
  mediaUrl: string | null;
  posterUrl: string | null;
  videoUrl: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaAspectRatio: number | null;
  reactions: number;
  comments: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  variationReason: string;
};

const tabs: Array<{ id: VariationTab; label: string }> = [
  { id: "same_creative", label: "Same creative" },
  { id: "same_copy", label: "Same copy" },
  { id: "same_landing_page", label: "Same landing page" },
];

const bentoRowHeight = 8;
const bentoGapPx = 16;

function getDurationDays(firstSeenAt: Date, lastSeenAt: Date) {
  return Math.max(1, Math.ceil((lastSeenAt.getTime() - firstSeenAt.getTime()) / (24 * 60 * 60 * 1000)));
}

function formatDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function VariationBentoCard({
  advertiserName,
  variation,
  workspaceHref,
}: {
  advertiserName: string;
  variation: Variation;
  workspaceHref: (href: string) => string;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [loadedAspectRatios, setLoadedAspectRatios] = useState<Record<string, number>>({});
  const [rowSpan, setRowSpan] = useState(42);
  const creativeAspectRatio =
    (variation.mediaWidth && variation.mediaHeight ? variation.mediaWidth / variation.mediaHeight : null) ??
    variation.mediaAspectRatio ??
    loadedAspectRatios[variation.id];

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
  }, [variation.id, variation.title, variation.callToAction, variation.firstSeenAt, variation.lastSeenAt, variation.reactions, variation.comments]);

  return (
    <article
      style={{ gridRow: `span ${rowSpan} / span ${rowSpan}` }}
      className="self-start"
    >
      <div ref={contentRef}>
        <SurfaceCard className="overflow-hidden p-0">
          <Link
            href={workspaceHref(`/ads/${variation.id}`)}
            className="block border-b border-[var(--border-subtle)] bg-[color:var(--bg-surface-2)] transition hover:opacity-95"
          >
            {variation.mediaUrl || variation.videoUrl || variation.posterUrl ? (
              creativeAspectRatio ? (
                <div style={{ aspectRatio: String(creativeAspectRatio) }} className="w-full">
                  <CreativeAssetMedia
                    src={variation.videoUrl ?? variation.mediaUrl ?? variation.posterUrl ?? ""}
                    alt={variation.title ?? advertiserName}
                    hint={variation.format}
                    kind={variation.videoUrl ? "video" : undefined}
                    poster={variation.posterUrl}
                    className="h-full w-full object-contain"
                    onMediaLoad={(dimensions) => {
                      if (!dimensions) {
                        return;
                      }

                      setLoadedAspectRatios((current) => {
                        if (current[variation.id] === dimensions.aspectRatio) {
                          return current;
                        }

                        return {
                          ...current,
                          [variation.id]: dimensions.aspectRatio,
                        };
                      });
                    }}
                  />
                </div>
              ) : (
                <CreativeAssetMedia
                  src={variation.videoUrl ?? variation.mediaUrl ?? variation.posterUrl ?? ""}
                  alt={variation.title ?? advertiserName}
                  hint={variation.format}
                  kind={variation.videoUrl ? "video" : undefined}
                  poster={variation.posterUrl}
                  className="h-auto w-full object-contain"
                  onMediaLoad={(dimensions) => {
                    if (!dimensions) {
                      return;
                    }

                    setLoadedAspectRatios((current) => {
                      if (current[variation.id] === dimensions.aspectRatio) {
                        return current;
                      }

                      return {
                        ...current,
                        [variation.id]: dimensions.aspectRatio,
                      };
                    });
                  }}
                />
              )
            ) : (
              <div className="flex min-h-[280px] items-center justify-center px-6 text-center text-[13px] leading-5 text-[var(--text-tertiary)]">
                No creative preview available.
              </div>
            )}
          </Link>

          <div className="space-y-4 p-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {variation.format ? <Pill>{getAdFormatLabel(variation.format)}</Pill> : null}
                {variation.callToAction ? <Pill tone="accent">{variation.callToAction}</Pill> : null}
              </div>
              <Link
                href={workspaceHref(`/ads/${variation.id}`)}
                className="block text-[14px] font-medium leading-[22px] text-[var(--text-primary)] underline-offset-4 transition hover:text-[var(--accent-hover)] hover:underline"
              >
                {variation.title ?? "Untitled variation"}
              </Link>
            </div>

            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {[
                { label: "First seen", value: formatDate(variation.firstSeenAt) },
                { label: "Duration", value: `${getDurationDays(variation.firstSeenAt, variation.lastSeenAt)} days` },
                { label: "Reactions", value: variation.reactions },
                { label: "Comments", value: variation.comments },
              ].map((item) => (
                <div key={item.label} className="min-w-0 space-y-1">
                  <p className="text-[12px] font-medium leading-4 text-[var(--text-tertiary)]">
                    {item.label}
                  </p>
                  <p className="text-[14px] font-medium leading-[22px] text-[var(--text-primary)]">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

          </div>
        </SurfaceCard>
      </div>
    </article>
  );
}

export function AdDetailVariations({
  advertiserName,
  variations,
}: {
  advertiserName: string;
  variations: Variation[];
}) {
  const workspaceHref = useWorkspaceHref();
  const [activeTab, setActiveTab] = useState<VariationTab>("same_creative");

  const grouped = useMemo(() => {
    return {
      same_creative: variations.filter((variation) => variation.variationReason === "Same format family"),
      same_copy: variations.filter((variation) => variation.variationReason === "Copy variant"),
      same_landing_page: variations.filter((variation) => variation.variationReason === "Shared landing page"),
    } satisfies Record<VariationTab, Variation[]>;
  }, [variations]);

  const visible = grouped[activeTab];

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="app-icon-chip">
              <Images size={18} strokeWidth={1.75} />
            </span>
            <h2
              className="text-[28px] leading-[1] tracking-[-0.035em] text-[var(--text-primary)]"
              style={{ fontFamily: "var(--font-instrument-serif), serif" }}
            >
              {`Related ads from ${advertiserName}`}
            </h2>
          </div>
        </div>

        <div className="w-full sm:hidden">
          <div className="relative">
            <select
              aria-label="Select related ads group"
              value={activeTab}
              onChange={(event) => setActiveTab(event.target.value as VariationTab)}
              className="h-10 w-full appearance-none rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-4 pr-10 text-sm font-medium text-[var(--text-primary)] outline-none transition"
            >
              {tabs.map((tab) => (
                <option key={tab.id} value={tab.id}>
                  {tab.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={16}
              strokeWidth={1.8}
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
            />
          </div>
        </div>

        <div className="hidden sm:block">
          <FilterTabs
            items={tabs.map((tab) => ({ label: tab.label, value: tab.id }))}
            activeValue={activeTab}
            onSelect={(value) => setActiveTab(value as VariationTab)}
          />
        </div>
      </div>

      {visible.length ? (
        <div className="grid auto-rows-[8px] gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {visible.map((variation) => (
            <VariationBentoCard
              key={variation.id}
              advertiserName={advertiserName}
              variation={variation}
              workspaceHref={workspaceHref}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[18px] border border-dashed border-[var(--border-subtle)] px-5 py-5 text-[14px] leading-[22px] text-[var(--text-secondary)]">
          No related ads found for this grouping yet.
        </div>
      )}
    </section>
  );
}
