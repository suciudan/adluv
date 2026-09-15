import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { getSourceLabel } from "@adluv/config";
import { getPublicAdShare } from "@adluv/db";

import { CreativeAssetMedia } from "../../../../components/creative-asset-media";
import { getAdFormatLabel } from "../../../../lib/ad-format";

function formatDate(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isVideoAsset(ad: { videoUrl: string | null; mediaUrl: string | null; format: string | null }) {
  const value = `${ad.videoUrl ?? ad.mediaUrl ?? ""} ${ad.format ?? ""}`.toLowerCase();
  return Boolean(ad.videoUrl) || value.includes(".mp4") || value.includes("video");
}

export default async function PublicAdSharePage({ params }: { params: Promise<{ adId: string }> }) {
  const { adId } = await params;
  const ad = await getPublicAdShare(adId);

  if (!ad) {
    notFound();
  }

  const creativeUrl = ad.videoUrl ?? ad.mediaUrl ?? ad.posterUrl ?? ad.screenshotUrl;
  const landingPageUrl = ad.destinationUrl ?? ad.snapshotUrl;
  const isVideo = isVideoAsset(ad);

  return (
    <main className="min-h-dvh bg-[var(--bg-app)] px-4 py-6 text-[var(--text-primary)] sm:px-6 sm:py-10">
      <article className="mx-auto grid max-w-5xl overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] shadow-[var(--shadow-overlay)] lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <div className="flex min-h-[22rem] items-center justify-center border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] lg:border-b-0 lg:border-r">
          {creativeUrl ? (
            isVideo ? (
              <CreativeAssetMedia
                src={creativeUrl}
                alt={ad.title ?? ad.advertiserName}
                hint={ad.format}
                kind="video"
                poster={ad.posterUrl}
                controls
                className="max-h-[72vh] w-full object-contain"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- Shared ad creatives can come from arbitrary stored remote URLs.
              <img src={creativeUrl} alt={ad.title ?? ad.advertiserName} className="max-h-[72vh] w-full object-contain" />
            )
          ) : (
            <p className="px-6 text-center text-sm text-[var(--text-tertiary)]">No creative preview is stored for this ad.</p>
          )}
        </div>

        <div className="space-y-6 p-5 sm:p-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold uppercase leading-4 text-[var(--text-tertiary)]">
              <span>{getSourceLabel(ad.source)}</span>
              <span aria-hidden="true">/</span>
              <span>{getAdFormatLabel(ad.format)}</span>
              {ad.language ? (
                <>
                  <span aria-hidden="true">/</span>
                  <span>{ad.language}</span>
                </>
              ) : null}
            </div>
            <h1 className="text-2xl font-semibold leading-8 text-[var(--text-primary)]">{ad.title ?? ad.advertiserName}</h1>
            <p className="text-[15px] leading-7 text-[var(--text-secondary)]">{ad.advertiserName}</p>
          </div>

          {ad.body ? <p className="whitespace-pre-line text-[15px] leading-7 text-[var(--text-primary)]">{ad.body}</p> : null}

          <dl className="grid gap-3 border-t border-[var(--border-subtle)] pt-5 text-[14px] leading-6">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[var(--text-secondary)]">Status</dt>
              <dd className="font-medium">{ad.status ?? "Unknown"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[var(--text-secondary)]">First seen</dt>
              <dd className="font-medium">{formatDate(ad.firstSeenAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-[var(--text-secondary)]">Duration</dt>
              <dd className="font-medium">{ad.durationDays} days</dd>
            </div>
          </dl>

          {landingPageUrl ? (
            <a
              href={landingPageUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-violet-500 px-4 text-[14px] font-semibold text-white transition hover:bg-violet-600"
            >
              Open landing page
              <ExternalLink size={15} strokeWidth={1.9} />
            </a>
          ) : null}
        </div>
      </article>
    </main>
  );
}
