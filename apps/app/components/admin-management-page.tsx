"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  RectangleHorizontal,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";

import type { WorkspaceSummary } from "@adluv/db";

import {
  addAdminAdvertiserSourceAction,
  deleteAdminAdAction,
  deleteAdminAdvertiserAction,
  inviteAdminUserAction,
  mergeAdminAdvertisersAction,
  updateAdminAdvertiserAction,
} from "../app/actions/admin";
import { AppButton } from "./app-ui";

type AdminSection = "status" | "ads" | "advertisers" | "coverage" | "users";

type AdminAdView = {
  id: string;
  source: string;
  sourceAdId: string | null;
  advertiserId: string;
  advertiserName: string;
  title: string | null;
  format: string | null;
  status: string | null;
  mediaUrl: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  createdAt: string;
};

type AdminAdvertiserView = {
  id: string;
  advertiserIds: string[];
  source: string;
  sources: string[];
  sourceProfiles: Array<{
    advertiserId: string;
    source: string;
    sourceAdvertiserId: string;
    profileUrl: string | null;
  }>;
  sourceAdvertiserId: string;
  sourceAdvertiserIds: string[];
  canonicalName: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  totalAds: number;
  activeAds: number;
  lastIndexedAt: string | null;
  createdAt: string;
};

type AdminPaginationView = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

type AdminWorkspaceMemberView = {
  id: string;
  userId: string;
  email: string;
  username: string | null;
  name: string | null;
  role: string;
  lastSeenAt: string | null;
  createdAt: string;
};

type AdminWorkspaceInvitationView = {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string | null;
  createdAt: string;
};

type AdminRefreshStatsView = {
  generatedAt: string;
  ads: {
    total: number;
    active: number;
    inactive: number;
    withMedia: number;
    seenLast24h: number;
    createdLast24h: number;
  };
  advertisers: {
    total: number;
    neverIndexed: number;
    indexedLast24h: number;
    stale7d: number;
    oldestIndexedAt: string | null;
    newestIndexedAt: string | null;
  };
  activeStatusChecks: {
    dueAdvertisers: number;
    dueAds: number;
    oldestCheckedAtMs: number | null;
  };
  bySource: Array<{
    source: string;
    advertisers: number;
    ads: number;
    activeAds: number;
    lastIndexedAt: string | null;
    lastSeenAt: string | null;
  }>;
  adStatuses: Array<{
    source: string;
    status: string;
    total: number;
  }>;
  queues: Array<{
    queueName: string;
    queued: number;
    running: number;
    completed: number;
    failed: number;
    lastUpdatedAt: string | null;
  }>;
  recentFailures: Array<{
    id: string;
    queueName: string;
    status: string;
    attempts: number;
    updatedAt: string;
    startedAt: string | null;
    finishedAt: string | null;
    errorMessage: string | null;
  }>;
};

type AdminCreativeCoverageStatsView = {
  generatedAt: string;
  totalAds: number;
  variantAds: number;
  expectedCreatives: number;
  availableCreatives: number;
  materializedCreatives: number;
  storedCreatives: number;
  unavailableCreatives: number;
  missingSourceCreatives: number;
  storageFailedCreatives: number;
  pendingStorageCreatives: number;
  completeVariantAds: number;
  partialVariantAds: number;
  emptyVariantAds: number;
  landingPagePreviews: {
    adsWithLandingPage: number;
    withPreview: number;
    missingPreview: number;
    neverCaptured: number;
    capturedWithoutPreview: number;
    bySource: Array<{
      source: string;
      adsWithLandingPage: number;
      withPreview: number;
      missingPreview: number;
      neverCaptured: number;
      capturedWithoutPreview: number;
    }>;
  };
  bySource: Array<{
    source: string;
    totalAds: number;
    variantAds: number;
    expectedCreatives: number;
    availableCreatives: number;
    materializedCreatives: number;
    storedCreatives: number;
    unavailableCreatives: number;
    missingSourceCreatives: number;
    storageFailedCreatives: number;
    pendingStorageCreatives: number;
    completeVariantAds: number;
    partialVariantAds: number;
    emptyVariantAds: number;
  }>;
  worstAds: Array<{
    id: string;
    source: string;
    advertiserName: string;
    title: string | null;
    expectedCreatives: number;
    availableCreatives: number;
    materializedCreatives: number;
    storedCreatives: number;
    unavailableCreatives: number;
    missingStoredCreatives: number;
    storageFailedCreatives: number;
    pendingStorageCreatives: number;
    primaryGap: "missing_source" | "storage_failed" | "pending_storage";
    lastSeenAt: string;
  }>;
};

type ActionResponse =
  | {
      status: "ok";
    }
  | {
      status: "error";
      message: string;
    };

const sections = [
  {
    id: "ads" as const,
    label: "Ads",
    icon: RectangleHorizontal,
  },
  {
    id: "coverage" as const,
    label: "Coverage",
    icon: BarChart3,
  },
  {
    id: "advertisers" as const,
    label: "Advertisers",
    icon: Building2,
  },
  {
    id: "users" as const,
    label: "Users",
    icon: Users,
  },
  {
    id: "status" as const,
    label: "Status",
    icon: Activity,
  },
];

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

function formatPercent(numerator: number, denominator: number) {
  if (!denominator) {
    return "0%";
  }

  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent",
  }).format(numerator / denominator);
}

function formatSource(source: string) {
  if (source === "facebook") {
    return "Meta";
  }

  return source.charAt(0).toUpperCase() + source.slice(1);
}

function SourceBadge({ source }: { source: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
      {formatSource(source)}
    </span>
  );
}

function SourceBadges({ sources }: { sources: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {sources.map((source) => (
        <SourceBadge key={source} source={source} />
      ))}
    </div>
  );
}

const adminInputClassName =
  "h-10 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-tertiary)] focus:border-violet-500";

function AdminField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
      <span className="mt-2 block">{children}</span>
    </label>
  );
}

function AdminDeleteButton({
  confirmMessage,
  label,
  onDelete,
}: {
  confirmMessage: string;
  label: string;
  onDelete: () => Promise<ActionResponse>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (!window.confirm(confirmMessage)) {
            return;
          }

          startTransition(async () => {
            setError(null);
            const response = await onDelete();

            if (response.status === "error") {
              setError(response.message);
              return;
            }

            router.refresh();
          });
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgba(239,68,68,0.22)] text-[#fca5a5] transition hover:bg-[rgba(239,68,68,0.1)] hover:text-[#fecaca] disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={label}
        title={label}
      >
        <Trash2 size={16} strokeWidth={1.8} />
      </button>
      {error ? <p className="max-w-56 text-right text-xs leading-5 text-[#fecaca]">{error}</p> : null}
    </div>
  );
}

function AdminTabs({
  activeSection,
  workspace,
}: {
  activeSection: AdminSection;
  workspace: WorkspaceSummary;
}) {
  return (
    <nav className="overflow-x-auto">
      <div className="flex min-w-max items-center gap-2">
        {sections.map((section) => {
          const Icon = section.icon;
          const active = activeSection === section.id;

          return (
            <Link
              key={section.id}
              href={`/w/${workspace.slug}/admin/${section.id}`}
              className={[
                "flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition",
                active
                  ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]",
              ].join(" ")}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{section.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function AdminTableShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h2>
        <AppButton type="button" variant="secondary" disabled>
          <MoreHorizontal size={16} strokeWidth={1.8} />
          More actions
        </AppButton>
      </div>
      {children}
    </section>
  );
}

function StatTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: number | string;
  detail?: string;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-3 text-3xl font-semibold leading-none text-[var(--text-primary)]">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {detail ? <p className="mt-3 text-sm leading-5 text-[var(--text-secondary)]">{detail}</p> : null}
    </div>
  );
}

function StatusPanel({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)]">
      <div className="border-b border-[var(--border-subtle)] px-5 py-4">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function AdminStatusDashboard({ stats }: { stats: AdminRefreshStatsView }) {
  const totalQueued = stats.queues.reduce((sum, queue) => sum + queue.queued, 0);
  const totalRunning = stats.queues.reduce((sum, queue) => sum + queue.running, 0);
  const totalFailed = stats.queues.reduce((sum, queue) => sum + queue.failed, 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Advertisers indexed"
          value={stats.advertisers.indexedLast24h}
          detail={`${formatNumber(stats.advertisers.stale7d)} stale beyond 7 days`}
        />
        <StatTile
          label="Ads seen"
          value={stats.ads.seenLast24h}
          detail={`${formatNumber(stats.ads.total)} total ads`}
        />
        <StatTile
          label="Status checks due"
          value={stats.activeStatusChecks.dueAdvertisers}
          detail={`${formatNumber(stats.activeStatusChecks.dueAds)} active ads need checking`}
        />
        <StatTile
          label="Queue pressure"
          value={totalQueued + totalRunning}
          detail={`${formatNumber(totalQueued)} queued · ${formatNumber(totalRunning)} running · ${formatNumber(totalFailed)} failed`}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
        <StatusPanel title="Source refresh">
          <div className="overflow-x-auto">
            <table className="min-w-[760px] w-full border-collapse text-left text-sm">
              <thead className="bg-[var(--bg-surface-2)] text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">Advertisers</th>
                  <th className="px-4 py-3 font-semibold">Ads</th>
                  <th className="px-4 py-3 font-semibold">Active ads</th>
                  <th className="px-4 py-3 font-semibold">Last indexed</th>
                  <th className="px-5 py-3 font-semibold">Last ad seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {stats.bySource.map((source) => (
                  <tr key={source.source}>
                    <td className="px-5 py-4"><SourceBadge source={source.source} /></td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatNumber(source.advertisers)}</td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatNumber(source.ads)}</td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatNumber(source.activeAds)}</td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatDateTime(source.lastIndexedAt)}</td>
                    <td className="px-5 py-4 text-[var(--text-secondary)]">{formatDateTime(source.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StatusPanel>

        <StatusPanel title="Advertiser freshness">
          <div className="divide-y divide-[var(--border-subtle)] px-5">
            {[
              ["Total advertisers", formatNumber(stats.advertisers.total)],
              ["Never indexed", formatNumber(stats.advertisers.neverIndexed)],
              ["Oldest refresh", formatDateTime(stats.advertisers.oldestIndexedAt)],
              ["Newest refresh", formatDateTime(stats.advertisers.newestIndexedAt)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-4">
                <span className="text-sm text-[var(--text-secondary)]">{label}</span>
                <span className="text-right text-sm font-semibold text-[var(--text-primary)]">{value}</span>
              </div>
            ))}
          </div>
        </StatusPanel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <StatusPanel title="Queues">
          <div className="overflow-x-auto">
            <table className="min-w-[620px] w-full border-collapse text-left text-sm">
              <thead className="bg-[var(--bg-surface-2)] text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Queue</th>
                  <th className="px-4 py-3 font-semibold">Queued</th>
                  <th className="px-4 py-3 font-semibold">Running</th>
                  <th className="px-4 py-3 font-semibold">Failed</th>
                  <th className="px-5 py-3 font-semibold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {stats.queues.map((queue) => (
                  <tr key={queue.queueName}>
                    <td className="px-5 py-4 font-semibold text-[var(--text-primary)]">{queue.queueName}</td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatNumber(queue.queued)}</td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatNumber(queue.running)}</td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatNumber(queue.failed)}</td>
                    <td className="px-5 py-4 text-[var(--text-secondary)]">{formatDateTime(queue.lastUpdatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </StatusPanel>

        <StatusPanel title="Failed job samples">
          {stats.recentFailures.length ? (
            <div className="divide-y divide-[var(--border-subtle)]">
              {stats.recentFailures.map((failure) => (
                <div key={failure.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[rgba(239,68,68,0.22)] bg-[rgba(239,68,68,0.1)] px-2.5 py-1 text-xs font-semibold text-[#fecaca]">
                      {failure.queueName}
                    </span>
                    <span className="text-xs text-[var(--text-tertiary)]">{formatDateTime(failure.updatedAt)}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-[var(--text-secondary)]">
                    {failure.errorMessage ?? failure.id}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-12 text-sm text-[var(--text-secondary)]">No failed jobs found.</p>
          )}
        </StatusPanel>
      </div>

      <StatusPanel title="Ad statuses">
        <div className="flex flex-wrap gap-2 p-5">
          {stats.adStatuses.map((status) => (
            <span
              key={`${status.source}:${status.status}`}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-3 py-2 text-sm text-[var(--text-secondary)]"
            >
              <span className="font-semibold text-[var(--text-primary)]">{formatSource(status.source)}</span>
              <span>{status.status}</span>
              <span className="text-[var(--text-tertiary)]">{formatNumber(status.total)}</span>
            </span>
          ))}
        </div>
      </StatusPanel>

      <p className="text-xs text-[var(--text-tertiary)]">
        Generated {formatDateTime(stats.generatedAt)}
      </p>
    </div>
  );
}

function CoverageMeter({
  denominator,
  numerator,
}: {
  denominator: number;
  numerator: number;
}) {
  const width = denominator ? Math.max(2, Math.min(100, (numerator / denominator) * 100)) : 0;

  return (
    <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-surface-2)]">
      <div className="h-full rounded-full bg-violet-500" style={{ width: `${width}%` }} />
    </div>
  );
}

function CoverageStatTile({
  detail,
  label,
  tone = "neutral",
  value,
}: {
  detail: string;
  label: string;
  tone?: "neutral" | "danger";
  value: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
        {tone === "danger" ? <AlertTriangle size={18} strokeWidth={1.8} className="text-amber-400" /> : null}
      </div>
      <p className="mt-4 text-4xl font-semibold leading-none text-[var(--text-primary)]">{value}</p>
      <p className="mt-3 text-sm leading-5 text-[var(--text-secondary)]">{detail}</p>
    </div>
  );
}

function AdminCreativeCoverageDashboard({
  stats,
  workspace,
}: {
  stats: AdminCreativeCoverageStatsView;
  workspace: WorkspaceSummary;
}) {
  const missingAvailableCreatives = Math.max(0, stats.availableCreatives - stats.storedCreatives);
  const operationalCoverageRate = formatPercent(stats.storedCreatives, stats.availableCreatives);
  const strictCoverageRate = formatPercent(stats.storedCreatives, stats.expectedCreatives);
  const missingLandingPagePreviews = stats.landingPagePreviews.missingPreview;
  const landingPagePreviewCoverageRate = formatPercent(
    stats.landingPagePreviews.withPreview,
    stats.landingPagePreviews.adsWithLandingPage,
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <CoverageStatTile
          label="Operational coverage"
          value={operationalCoverageRate}
          detail={`${formatNumber(stats.storedCreatives)} of ${formatNumber(stats.availableCreatives)} available variant creatives are stored`}
          tone={missingAvailableCreatives ? "danger" : "neutral"}
        />
        <CoverageStatTile
          label="Repairable gap"
          value={formatNumber(missingAvailableCreatives)}
          detail={`${formatNumber(stats.storageFailedCreatives)} failed storage · ${formatNumber(stats.pendingStorageCreatives)} pending storage`}
          tone={missingAvailableCreatives ? "danger" : "neutral"}
        />
        <CoverageStatTile
          label="Provider unavailable"
          value={formatNumber(stats.unavailableCreatives)}
          detail={`${formatNumber(stats.missingSourceCreatives)} strict expected slots have no usable creative URL`}
        />
        <CoverageStatTile
          label="Strict coverage"
          value={strictCoverageRate}
          detail={`${formatNumber(stats.variantAds)} variant ads across ${formatNumber(stats.totalAds)} ads scanned`}
        />
      </div>

      <StatusPanel title="Coverage by source">
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--bg-surface-2)] text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
              <tr>
                <th className="px-5 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Variant ads</th>
                <th className="px-4 py-3 font-semibold">Operational</th>
                <th className="px-4 py-3 font-semibold">Strict</th>
                <th className="px-4 py-3 font-semibold">Expected</th>
                <th className="px-4 py-3 font-semibold">Available</th>
                <th className="px-4 py-3 font-semibold">Stored</th>
                <th className="px-5 py-3 font-semibold">Repairable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {stats.bySource.map((source) => {
                const missing = Math.max(0, source.availableCreatives - source.storedCreatives);

                return (
                  <tr key={source.source}>
                    <td className="px-5 py-4"><SourceBadge source={source.source} /></td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatNumber(source.variantAds)}</td>
                    <td className="px-4 py-4">
                      <div className="min-w-40 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {formatPercent(source.storedCreatives, source.availableCreatives)}
                          </span>
                          <span className="text-xs text-[var(--text-tertiary)]">
                            {formatNumber(source.completeVariantAds)} complete
                          </span>
                        </div>
                        <CoverageMeter numerator={source.storedCreatives} denominator={source.availableCreatives} />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">
                      {formatPercent(source.storedCreatives, source.expectedCreatives)}
                    </td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatNumber(source.expectedCreatives)}</td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatNumber(source.availableCreatives)}</td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatNumber(source.storedCreatives)}</td>
                    <td className={["px-5 py-4 font-semibold", missing ? "text-amber-400" : "text-[var(--text-secondary)]"].join(" ")}>
                      {formatNumber(missing)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </StatusPanel>

      <StatusPanel title="Landing page previews">
        <div className="grid gap-4 border-b border-[var(--border-subtle)] p-5 lg:grid-cols-4">
          <CoverageStatTile
            label="Preview coverage"
            value={landingPagePreviewCoverageRate}
            detail={`${formatNumber(stats.landingPagePreviews.withPreview)} of ${formatNumber(stats.landingPagePreviews.adsWithLandingPage)} ads with landing pages have previews`}
            tone={missingLandingPagePreviews ? "danger" : "neutral"}
          />
          <CoverageStatTile
            label="Missing previews"
            value={formatNumber(missingLandingPagePreviews)}
            detail={`${formatNumber(stats.landingPagePreviews.neverCaptured)} never captured · ${formatNumber(stats.landingPagePreviews.capturedWithoutPreview)} captured without screenshot`}
            tone={missingLandingPagePreviews ? "danger" : "neutral"}
          />
          <CoverageStatTile
            label="Never captured"
            value={formatNumber(stats.landingPagePreviews.neverCaptured)}
            detail="Eligible ads that do not have a landing page snapshot row yet"
          />
          <CoverageStatTile
            label="Capture missing screenshot"
            value={formatNumber(stats.landingPagePreviews.capturedWithoutPreview)}
            detail="Snapshot rows that exist but still need a screenshot URL"
            tone={stats.landingPagePreviews.capturedWithoutPreview ? "danger" : "neutral"}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[820px] w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--bg-surface-2)] text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
              <tr>
                <th className="px-5 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold">Ads with landing page</th>
                <th className="px-4 py-3 font-semibold">Preview coverage</th>
                <th className="px-4 py-3 font-semibold">With preview</th>
                <th className="px-4 py-3 font-semibold">Missing</th>
                <th className="px-4 py-3 font-semibold">Never captured</th>
                <th className="px-5 py-3 font-semibold">Capture missing screenshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {stats.landingPagePreviews.bySource.length ? (
                stats.landingPagePreviews.bySource.map((source) => (
                  <tr key={source.source}>
                    <td className="px-5 py-4"><SourceBadge source={source.source} /></td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatNumber(source.adsWithLandingPage)}</td>
                    <td className="px-4 py-4">
                      <div className="min-w-40 space-y-2">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {formatPercent(source.withPreview, source.adsWithLandingPage)}
                        </span>
                        <CoverageMeter numerator={source.withPreview} denominator={source.adsWithLandingPage} />
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatNumber(source.withPreview)}</td>
                    <td className={["px-4 py-4 font-semibold", source.missingPreview ? "text-amber-400" : "text-[var(--text-secondary)]"].join(" ")}>
                      {formatNumber(source.missingPreview)}
                    </td>
                    <td className="px-4 py-4 text-[var(--text-secondary)]">{formatNumber(source.neverCaptured)}</td>
                    <td className={["px-5 py-4 font-semibold", source.capturedWithoutPreview ? "text-amber-400" : "text-[var(--text-secondary)]"].join(" ")}>
                      {formatNumber(source.capturedWithoutPreview)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-sm text-[var(--text-secondary)]">
                    No ads with landing pages found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </StatusPanel>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <StatusPanel title="Variant ad states">
          <div className="divide-y divide-[var(--border-subtle)] px-5">
            {[
              ["Complete available", stats.completeVariantAds],
              ["Partial available", stats.partialVariantAds],
              ["Empty available", stats.emptyVariantAds],
              ["Provider unavailable", stats.unavailableCreatives],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-4">
                <span className="text-sm text-[var(--text-secondary)]">{label}</span>
                <span className="text-right text-sm font-semibold text-[var(--text-primary)]">{formatNumber(value as number)}</span>
              </div>
            ))}
          </div>
        </StatusPanel>

        <StatusPanel title="Largest creative gaps">
          {stats.worstAds.length ? (
            <div className="divide-y divide-[var(--border-subtle)]">
              {stats.worstAds.map((ad) => (
                <div key={ad.id} className="px-5 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <SourceBadge source={ad.source} />
                        <span className="text-xs text-[var(--text-tertiary)]">{formatDate(ad.lastSeenAt)}</span>
                      </div>
                      <Link
                        href={`/w/${workspace.slug}/ads/${ad.id}`}
                        className="mt-2 block truncate font-semibold text-[var(--text-primary)] transition hover:text-violet-500"
                      >
                        {ad.title?.trim() || "Untitled ad"}
                      </Link>
                      <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">{ad.advertiserName}</p>
                    </div>
                    <div className="min-w-56">
                      <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                        <span className="text-[var(--text-tertiary)]">
                          {formatNumber(ad.storedCreatives)} stored / {formatNumber(ad.expectedCreatives)} expected
                        </span>
                        <span className="font-semibold text-amber-400">
                          {formatNumber(ad.missingStoredCreatives || ad.unavailableCreatives)} {ad.missingStoredCreatives ? "repairable" : "unavailable"}
                        </span>
                      </div>
                      <CoverageMeter numerator={ad.storedCreatives} denominator={ad.availableCreatives || ad.expectedCreatives} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-12 text-sm text-[var(--text-secondary)]">No variant creative gaps found.</p>
          )}
        </StatusPanel>
      </div>

      <p className="text-xs text-[var(--text-tertiary)]">
        Operational coverage counts stored creatives against available source URLs. Strict coverage keeps provider-reported but currently unavailable slots in view. Generated {formatDateTime(stats.generatedAt)}.
      </p>
    </div>
  );
}

function AdsTable({ ads }: { ads: AdminAdView[] }) {
  if (!ads.length) {
    return <p className="px-5 py-12 text-sm text-[var(--text-secondary)]">No ads found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[980px] w-full border-collapse text-left text-sm">
        <thead className="bg-[var(--bg-surface-2)] text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
          <tr>
            <th className="px-5 py-3 font-semibold">Ad</th>
            <th className="px-4 py-3 font-semibold">Advertiser</th>
            <th className="px-4 py-3 font-semibold">Source</th>
            <th className="px-4 py-3 font-semibold">Status</th>
            <th className="px-4 py-3 font-semibold">Last seen</th>
            <th className="px-5 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {ads.map((ad) => (
            <tr key={ad.id} className="align-middle">
              <td className="max-w-[360px] px-5 py-4">
                <div className="flex items-center gap-3">
                  {ad.mediaUrl ? (
                    <img
                      src={ad.mediaUrl}
                      alt=""
                      className="h-12 w-12 rounded-lg border border-[var(--border-subtle)] object-cover"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[var(--text-tertiary)]">
                      <RectangleHorizontal size={18} strokeWidth={1.8} />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--text-primary)]">
                      {ad.title?.trim() || "Untitled ad"}
                    </p>
                    <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">
                      {ad.format ?? "Unknown format"} · {ad.sourceAdId ?? ad.id}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4 text-[var(--text-secondary)]">{ad.advertiserName}</td>
              <td className="px-4 py-4"><SourceBadge source={ad.source} /></td>
              <td className="px-4 py-4 text-[var(--text-secondary)]">{ad.status ?? "Unknown"}</td>
              <td className="px-4 py-4 text-[var(--text-secondary)]">{formatDate(ad.lastSeenAt)}</td>
              <td className="px-5 py-4">
                <AdminDeleteButton
                  label="Delete ad"
                  confirmMessage={`Delete "${ad.title?.trim() || "this ad"}"? This removes the ad from saved ads, alerts, snapshots, and listings.`}
                  onDelete={() => deleteAdminAdAction(ad.id)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdvertiserLogoPreview({
  advertiser,
  className = "h-11 w-11",
}: {
  advertiser: Pick<AdminAdvertiserView, "canonicalName" | "logoUrl">;
  className?: string;
}) {
  if (advertiser.logoUrl) {
    return (
      <img
        src={advertiser.logoUrl}
        alt={`${advertiser.canonicalName} logo`}
        className={`${className} rounded-lg border border-[var(--border-subtle)] bg-white object-contain`}
      />
    );
  }

  return (
    <div
      className={`${className} flex items-center justify-center rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-[var(--text-tertiary)]`}
    >
      <Building2 size={18} strokeWidth={1.8} />
    </div>
  );
}

function AdvertiserSourceLine({ advertiser }: { advertiser: AdminAdvertiserView }) {
  return (
    <span className="block truncate text-xs text-[var(--text-tertiary)]">
      {advertiser.canonicalName} · {advertiser.sources.map(formatSource).join(", ")}
    </span>
  );
}

function MergeChoice({
  checked,
  children,
  name,
  onChange,
  value,
}: {
  checked: boolean;
  children: React.ReactNode;
  name: string;
  onChange: () => void;
  value: string;
}) {
  return (
    <label
      className={[
        "flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 text-sm transition",
        checked
          ? "border-violet-500 bg-violet-500/10 text-[var(--text-primary)]"
          : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[rgba(255,255,255,0.04)]",
      ].join(" ")}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-1 accent-violet-500"
      />
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

function MergeAdvertisersPanel({
  onClear,
  selectedAdvertisers,
}: {
  onClear: () => void;
  selectedAdvertisers: AdminAdvertiserView[];
}) {
  const router = useRouter();
  const [nameSourceId, setNameSourceId] = useState(selectedAdvertisers[0]?.id ?? "");
  const [websiteSourceId, setWebsiteSourceId] = useState(
    selectedAdvertisers.find((advertiser) => advertiser.websiteUrl)?.id ?? selectedAdvertisers[0]?.id ?? "",
  );
  const [logoSourceId, setLogoSourceId] = useState(
    selectedAdvertisers.find((advertiser) => advertiser.logoUrl)?.id ?? selectedAdvertisers[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setNameSourceId((current) =>
      selectedAdvertisers.some((advertiser) => advertiser.id === current)
        ? current
        : selectedAdvertisers[0]?.id ?? "",
    );
    setWebsiteSourceId((current) =>
      selectedAdvertisers.some((advertiser) => advertiser.id === current)
        ? current
        : selectedAdvertisers.find((advertiser) => advertiser.websiteUrl)?.id ?? selectedAdvertisers[0]?.id ?? "",
    );
    setLogoSourceId((current) =>
      selectedAdvertisers.some((advertiser) => advertiser.id === current)
        ? current
        : selectedAdvertisers.find((advertiser) => advertiser.logoUrl)?.id ?? selectedAdvertisers[0]?.id ?? "",
    );
  }, [selectedAdvertisers]);

  if (selectedAdvertisers.length < 2) {
    return null;
  }

  const nameSource = selectedAdvertisers.find((advertiser) => advertiser.id === nameSourceId) ?? selectedAdvertisers[0];
  const websiteSource = selectedAdvertisers.find((advertiser) => advertiser.id === websiteSourceId) ?? selectedAdvertisers[0];
  const logoSource = selectedAdvertisers.find((advertiser) => advertiser.id === logoSourceId) ?? selectedAdvertisers[0];
  const selectedAdvertiserIds = selectedAdvertisers.flatMap((advertiser) => advertiser.advertiserIds);

  return (
    <div className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-5 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            Merge {selectedAdvertisers.length} selected rows
          </p>
          <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
            This links {selectedAdvertiserIds.length} advertiser records to one shared company profile.
          </p>
        </div>
        <div className="flex gap-2">
          <AppButton type="button" variant="secondary" onClick={onClear} disabled={isPending}>
            Clear
          </AppButton>
          <AppButton
            type="button"
            variant="primary"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                setError(null);
                const response = await mergeAdminAdvertisersAction({
                  advertiserIds: selectedAdvertiserIds,
                  displayName: nameSource?.canonicalName ?? "",
                  websiteUrl: websiteSource?.websiteUrl ?? null,
                  logoUrl: logoSource?.logoUrl ?? null,
                });

                if (response.status === "error") {
                  setError(response.message);
                  return;
                }

                onClear();
                router.refresh();
              });
            }}
          >
            {isPending ? "Merging..." : "Merge advertisers"}
          </AppButton>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Selected records</p>
        <div className="mt-2 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {selectedAdvertisers.map((advertiser) => (
            <div
              key={advertiser.id}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-3 py-3"
            >
              <AdvertiserLogoPreview advertiser={advertiser} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--text-primary)]">{advertiser.canonicalName}</p>
                <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">
                  {advertiser.websiteUrl ?? "No URL"} · {advertiser.totalAds} ads
                </p>
                <div className="mt-2">
                  <SourceBadges sources={advertiser.sources} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <fieldset className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Final name
          </legend>
          <div className="mt-2 space-y-2">
            {selectedAdvertisers.map((advertiser) => (
              <MergeChoice
                key={advertiser.id}
                name="merge-name"
                value={advertiser.id}
                checked={nameSourceId === advertiser.id}
                onChange={() => setNameSourceId(advertiser.id)}
              >
                <span className="block truncate font-semibold text-[var(--text-primary)]">
                  {advertiser.canonicalName}
                </span>
                <AdvertiserSourceLine advertiser={advertiser} />
              </MergeChoice>
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Final URL
          </legend>
          <div className="mt-2 space-y-2">
            {selectedAdvertisers.map((advertiser) => (
              <MergeChoice
                key={advertiser.id}
                name="merge-url"
                value={advertiser.id}
                checked={websiteSourceId === advertiser.id}
                onChange={() => setWebsiteSourceId(advertiser.id)}
              >
                <span className="block truncate font-semibold text-[var(--text-primary)]">
                  {advertiser.websiteUrl ?? "No URL"}
                </span>
                <AdvertiserSourceLine advertiser={advertiser} />
              </MergeChoice>
            ))}
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
            Final logo
          </legend>
          <div className="mt-2 space-y-2">
            {selectedAdvertisers.map((advertiser) => (
              <MergeChoice
                key={advertiser.id}
                name="merge-logo"
                value={advertiser.id}
                checked={logoSourceId === advertiser.id}
                onChange={() => setLogoSourceId(advertiser.id)}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <AdvertiserLogoPreview advertiser={advertiser} className="h-14 w-14" />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-[var(--text-primary)]">
                      {advertiser.logoUrl ? "Use this logo" : "No logo"}
                    </span>
                    <AdvertiserSourceLine advertiser={advertiser} />
                  </span>
                </span>
              </MergeChoice>
            ))}
          </div>
        </fieldset>
      </div>

      {error ? <p className="mt-3 text-sm leading-5 text-[#fecaca]">{error}</p> : null}
    </div>
  );
}

function AdminAdvertiserEditor({
  advertiser,
  onClose,
}: {
  advertiser: AdminAdvertiserView;
  onClose: () => void;
}) {
  const router = useRouter();
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [isUpdating, startUpdateTransition] = useTransition();
  const [isAdding, startAddTransition] = useTransition();
  const usedSources = new Set(advertiser.sourceProfiles.map((profile) => profile.source));
  const availableSources = ["linkedin", "facebook", "google", "tiktok"].filter((source) => !usedSources.has(source));

  return (
    <tr>
      <td colSpan={6} className="bg-[var(--bg-surface-2)] px-5 py-5">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-[var(--text-primary)]">Edit advertiser information</p>
              <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
                Update the shared company profile and the source IDs used by future refreshes.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]"
              aria-label="Close editor"
              title="Close editor"
            >
              <X size={16} strokeWidth={1.8} />
            </button>
          </div>

          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const sourceUpdates = advertiser.sourceProfiles.map((profile) => ({
                advertiserId: profile.advertiserId,
                sourceAdvertiserId: String(formData.get(`sourceAdvertiserId:${profile.advertiserId}`) ?? ""),
                profileUrl: String(formData.get(`profileUrl:${profile.advertiserId}`) ?? "") || null,
              }));

              startUpdateTransition(async () => {
                setUpdateError(null);
                const response = await updateAdminAdvertiserAction({
                  advertiserIds: advertiser.advertiserIds,
                  displayName: String(formData.get("displayName") ?? ""),
                  websiteUrl: String(formData.get("websiteUrl") ?? "") || null,
                  logoUrl: String(formData.get("logoUrl") ?? "") || null,
                  sourceUpdates,
                });

                if (response.status === "error") {
                  setUpdateError(response.message);
                  return;
                }

                router.refresh();
              });
            }}
          >
            <div className="grid gap-4 lg:grid-cols-3">
              <AdminField label="Display name">
                <input name="displayName" defaultValue={advertiser.canonicalName} className={adminInputClassName} required />
              </AdminField>
              <AdminField label="Website URL">
                <input name="websiteUrl" defaultValue={advertiser.websiteUrl ?? ""} className={adminInputClassName} />
              </AdminField>
              <AdminField label="Logo URL">
                <input name="logoUrl" defaultValue={advertiser.logoUrl ?? ""} className={adminInputClassName} />
              </AdminField>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Existing sources</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {advertiser.sourceProfiles.map((profile) => (
                  <div key={profile.advertiserId} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <SourceBadge source={profile.source} />
                      <span className="truncate text-xs text-[var(--text-tertiary)]">{profile.advertiserId}</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <AdminField label="Source advertiser ID">
                        <input
                          name={`sourceAdvertiserId:${profile.advertiserId}`}
                          defaultValue={profile.sourceAdvertiserId}
                          className={adminInputClassName}
                          required
                        />
                      </AdminField>
                      <AdminField label="Profile URL">
                        <input
                          name={`profileUrl:${profile.advertiserId}`}
                          defaultValue={profile.profileUrl ?? ""}
                          className={adminInputClassName}
                        />
                      </AdminField>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              {updateError ? <p className="text-sm leading-5 text-[#fecaca]">{updateError}</p> : <span />}
              <AppButton type="submit" variant="primary" disabled={isUpdating}>
                {isUpdating ? "Saving..." : "Save changes"}
              </AppButton>
            </div>
          </form>

          <form
            className="border-t border-[var(--border-subtle)] pt-5"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const formData = new FormData(event.currentTarget);

              startAddTransition(async () => {
                setAddError(null);
                const response = await addAdminAdvertiserSourceAction({
                  advertiserIds: advertiser.advertiserIds,
                  source: String(formData.get("source") ?? "linkedin") as "linkedin" | "facebook" | "google" | "tiktok",
                  sourceAdvertiserId: String(formData.get("sourceAdvertiserId") ?? ""),
                  canonicalName: String(formData.get("canonicalName") ?? "") || advertiser.canonicalName,
                  profileUrl: String(formData.get("profileUrl") ?? "") || null,
                  websiteUrl: String(formData.get("websiteUrl") ?? "") || advertiser.websiteUrl,
                  logoUrl: String(formData.get("logoUrl") ?? "") || advertiser.logoUrl,
                });

                if (response.status === "error") {
                  setAddError(response.message);
                  return;
                }

                form.reset();
                router.refresh();
              });
            }}
          >
            <p className="text-sm font-semibold text-[var(--text-primary)]">Add source</p>
            <div className="mt-3 grid gap-4 lg:grid-cols-4">
              <AdminField label="Source">
                <select name="source" defaultValue={availableSources[0] ?? "linkedin"} className={adminInputClassName} disabled={!availableSources.length}>
                  {availableSources.length ? availableSources.map((source) => (
                    <option key={source} value={source}>
                      {formatSource(source)}
                    </option>
                  )) : <option value="linkedin">All sources linked</option>}
                </select>
              </AdminField>
              <AdminField label="Source advertiser ID">
                <input name="sourceAdvertiserId" className={adminInputClassName} required />
              </AdminField>
              <AdminField label="Profile URL">
                <input name="profileUrl" className={adminInputClassName} />
              </AdminField>
              <AdminField label="Display name">
                <input name="canonicalName" defaultValue={advertiser.canonicalName} className={adminInputClassName} />
              </AdminField>
            </div>
            <input type="hidden" name="websiteUrl" value={advertiser.websiteUrl ?? ""} />
            <input type="hidden" name="logoUrl" value={advertiser.logoUrl ?? ""} />
            <div className="mt-4 flex items-center justify-between gap-3">
              {addError ? <p className="text-sm leading-5 text-[#fecaca]">{addError}</p> : <span />}
              <AppButton type="submit" variant="secondary" disabled={isAdding || !availableSources.length}>
                <Plus size={16} strokeWidth={1.8} />
                {isAdding ? "Adding..." : "Add source"}
              </AppButton>
            </div>
          </form>
        </div>
      </td>
    </tr>
  );
}

function PaginationLink({
  children,
  disabled,
  href,
  label,
}: {
  children: React.ReactNode;
  disabled: boolean;
  href: string;
  label: string;
}) {
  const className = [
    "inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border-subtle)] px-3 text-sm font-semibold transition",
    disabled
      ? "pointer-events-none text-[var(--text-tertiary)] opacity-50"
      : "text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]",
  ].join(" ");

  return disabled ? (
    <span className={className} aria-disabled="true">
      {children}
    </span>
  ) : (
    <Link href={href} className={className} aria-label={label}>
      {children}
    </Link>
  );
}

function AdvertiserPagination({
  pagination,
  workspace,
}: {
  pagination?: AdminPaginationView;
  workspace: WorkspaceSummary;
}) {
  if (!pagination || pagination.totalItems <= pagination.pageSize) {
    return null;
  }

  const firstItem = (pagination.page - 1) * pagination.pageSize + 1;
  const lastItem = Math.min(pagination.page * pagination.pageSize, pagination.totalItems);
  const pageHref = (page: number) => `/w/${workspace.slug}/admin/advertisers?page=${page}`;

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[var(--text-secondary)]">
        Showing {firstItem}-{lastItem} of {pagination.totalItems} advertisers
      </p>
      <div className="flex items-center gap-2">
        <PaginationLink
          href={pageHref(pagination.page - 1)}
          disabled={pagination.page <= 1}
          label="Previous advertiser page"
        >
          <ChevronLeft size={16} strokeWidth={1.8} />
          Previous
        </PaginationLink>
        <span className="min-w-24 text-center text-sm font-semibold text-[var(--text-secondary)]">
          Page {pagination.page} of {pagination.totalPages}
        </span>
        <PaginationLink
          href={pageHref(pagination.page + 1)}
          disabled={pagination.page >= pagination.totalPages}
          label="Next advertiser page"
        >
          Next
          <ChevronRight size={16} strokeWidth={1.8} />
        </PaginationLink>
      </div>
    </div>
  );
}

function AdvertisersTable({
  advertisers,
  pagination,
  workspace,
}: {
  advertisers: AdminAdvertiserView[];
  pagination?: AdminPaginationView;
  workspace: WorkspaceSummary;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const selectedAdvertisers = advertisers.filter((advertiser) => selectedIds.includes(advertiser.id));

  if (!advertisers.length) {
    return <p className="px-5 py-12 text-sm text-[var(--text-secondary)]">No advertisers found.</p>;
  }

  return (
    <>
      <MergeAdvertisersPanel
        selectedAdvertisers={selectedAdvertisers}
        onClear={() => setSelectedIds([])}
      />
      <div className="overflow-x-auto">
        <table className="min-w-[1040px] w-full border-collapse text-left text-sm">
        <thead className="bg-[var(--bg-surface-2)] text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
          <tr>
            <th className="w-12 px-5 py-3 font-semibold">
              <input
                type="checkbox"
                checked={selectedIds.length === advertisers.length}
                onChange={(event) => {
                  setSelectedIds(event.target.checked ? advertisers.map((advertiser) => advertiser.id) : []);
                }}
                className="accent-violet-500"
                aria-label="Select all advertisers"
              />
            </th>
            <th className="px-5 py-3 font-semibold">Advertiser</th>
            <th className="px-4 py-3 font-semibold">Source</th>
            <th className="px-4 py-3 font-semibold">Ads</th>
            <th className="px-4 py-3 font-semibold">Last indexed</th>
            <th className="px-5 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {advertisers.map((advertiser) => (
            <Fragment key={advertiser.id}>
            <tr className="align-middle">
              <td className="px-5 py-4">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(advertiser.id)}
                  onChange={(event) => {
                    setSelectedIds((current) =>
                      event.target.checked
                        ? [...current, advertiser.id]
                        : current.filter((id) => id !== advertiser.id),
                    );
                  }}
                  className="accent-violet-500"
                  aria-label={`Select ${advertiser.canonicalName}`}
                />
              </td>
              <td className="max-w-[420px] px-5 py-4">
                <div className="flex items-center gap-3">
                  <AdvertiserLogoPreview advertiser={advertiser} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--text-primary)]">
                      {advertiser.canonicalName}
                    </p>
                    <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">
                      {advertiser.websiteUrl ?? advertiser.sourceAdvertiserId}
                      {advertiser.advertiserIds.length > 1 ? ` · ${advertiser.advertiserIds.length} records` : ""}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4"><SourceBadges sources={advertiser.sources} /></td>
              <td className="px-4 py-4 text-[var(--text-secondary)]">
                {advertiser.totalAds} total · {advertiser.activeAds} active
              </td>
              <td className="px-4 py-4 text-[var(--text-secondary)]">
                {formatDate(advertiser.lastIndexedAt)}
              </td>
              <td className="px-5 py-4">
                <div className="flex items-start justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId((current) => current === advertiser.id ? null : advertiser.id)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border-subtle)] text-[var(--text-secondary)] transition hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]"
                    aria-label={`Edit ${advertiser.canonicalName}`}
                    title="Edit advertiser"
                  >
                    <Pencil size={16} strokeWidth={1.8} />
                  </button>
                  <AdminDeleteButton
                    label="Delete advertiser"
                    confirmMessage={`Delete "${advertiser.canonicalName}"? This removes ${advertiser.advertiserIds.length} advertiser record${advertiser.advertiserIds.length === 1 ? "" : "s"}, their ads, saved-ad links, alerts, snapshots, and tracked-company records.`}
                    onDelete={() => deleteAdminAdvertiserAction(advertiser.advertiserIds)}
                  />
                </div>
              </td>
            </tr>
            {editingId === advertiser.id ? (
              <AdminAdvertiserEditor advertiser={advertiser} onClose={() => setEditingId(null)} />
            ) : null}
            </Fragment>
          ))}
        </tbody>
        </table>
      </div>
      <AdvertiserPagination pagination={pagination} workspace={workspace} />
    </>
  );
}

function formatRole(role: string) {
  if (role === "owner") {
    return "Owner";
  }

  if (role === "admin") {
    return "Admin";
  }

  return "Member";
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
      {formatRole(role)}
    </span>
  );
}

function InviteUserPanel() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <section className="rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)]">
      <div className="border-b border-[var(--border-subtle)] px-5 py-4">
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Invite user</h2>
      </div>
      <form
        className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_180px_auto]"
        onSubmit={(event) => {
          event.preventDefault();

          startTransition(async () => {
            setError(null);
            setMessage(null);

            const response = await inviteAdminUserAction({ email, role });

            if (response.status === "error") {
              setError(response.message);
              return;
            }

            setEmail("");
            setRole("member");
            setMessage("Invite sent.");
            router.refresh();
          });
        }}
      >
        <AdminField label="Email">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={adminInputClassName}
            placeholder="user@company.com"
            required
          />
        </AdminField>
        <AdminField label="Role">
          <select
            value={role}
            onChange={(event) => setRole(event.target.value === "admin" ? "admin" : "member")}
            className={adminInputClassName}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </AdminField>
        <div className="flex items-end">
          <AppButton type="submit" variant="primary" disabled={isPending}>
            <Send size={16} strokeWidth={1.8} />
            {isPending ? "Sending..." : "Send invite"}
          </AppButton>
        </div>
        {error ? <p className="lg:col-span-3 text-sm leading-5 text-[#fecaca]">{error}</p> : null}
        {message ? <p className="lg:col-span-3 text-sm leading-5 text-[var(--text-secondary)]">{message}</p> : null}
      </form>
    </section>
  );
}

function WorkspaceMembersTable({ members }: { members: AdminWorkspaceMemberView[] }) {
  if (!members.length) {
    return <p className="px-5 py-12 text-sm text-[var(--text-secondary)]">No users found.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[900px] w-full border-collapse text-left text-sm">
        <thead className="bg-[var(--bg-surface-2)] text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
          <tr>
            <th className="px-5 py-3 font-semibold">User</th>
            <th className="px-4 py-3 font-semibold">Role</th>
            <th className="px-4 py-3 font-semibold">Last seen</th>
            <th className="px-4 py-3 font-semibold">Joined</th>
            <th className="px-5 py-3 font-semibold">ID</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {members.map((member) => (
            <tr key={member.id}>
              <td className="max-w-[360px] px-5 py-4">
                <p className="truncate font-semibold text-[var(--text-primary)]">{member.name ?? member.email}</p>
                <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">
                  {member.email}
                  {member.username ? ` · @${member.username}` : ""}
                </p>
              </td>
              <td className="px-4 py-4"><RoleBadge role={member.role} /></td>
              <td className="px-4 py-4 text-[var(--text-secondary)]">{formatDateTime(member.lastSeenAt)}</td>
              <td className="px-4 py-4 text-[var(--text-secondary)]">{formatDateTime(member.createdAt)}</td>
              <td className="max-w-[220px] px-5 py-4 text-xs text-[var(--text-tertiary)]">
                <span className="block truncate">{member.userId}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PendingInvitationsTable({ invitations }: { invitations: AdminWorkspaceInvitationView[] }) {
  if (!invitations.length) {
    return <p className="px-5 py-12 text-sm text-[var(--text-secondary)]">No pending invites.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[720px] w-full border-collapse text-left text-sm">
        <thead className="bg-[var(--bg-surface-2)] text-xs uppercase tracking-wide text-[var(--text-tertiary)]">
          <tr>
            <th className="px-5 py-3 font-semibold">Email</th>
            <th className="px-4 py-3 font-semibold">Role</th>
            <th className="px-4 py-3 font-semibold">Created</th>
            <th className="px-5 py-3 font-semibold">Expires</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {invitations.map((invitation) => (
            <tr key={invitation.id}>
              <td className="max-w-[360px] px-5 py-4">
                <p className="truncate font-semibold text-[var(--text-primary)]">{invitation.email}</p>
                <p className="mt-1 truncate text-xs text-[var(--text-tertiary)]">{invitation.status}</p>
              </td>
              <td className="px-4 py-4"><RoleBadge role={invitation.role} /></td>
              <td className="px-4 py-4 text-[var(--text-secondary)]">{formatDateTime(invitation.createdAt)}</td>
              <td className="px-5 py-4 text-[var(--text-secondary)]">{formatDateTime(invitation.expiresAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminUsersPanel({
  invitations,
  members,
}: {
  invitations: AdminWorkspaceInvitationView[];
  members: AdminWorkspaceMemberView[];
}) {
  return (
    <div className="space-y-5">
      <InviteUserPanel />
      <AdminTableShell title="Users">
        <WorkspaceMembersTable members={members} />
      </AdminTableShell>
      <AdminTableShell title="Pending invites">
        <PendingInvitationsTable invitations={invitations} />
      </AdminTableShell>
    </div>
  );
}

export function AdminManagementPage({
  activeSection,
  ads = [],
  advertisers = [],
  advertiserPagination,
  coverageStats,
  invitations = [],
  members = [],
  stats,
  workspace,
}: {
  activeSection: AdminSection;
  ads?: AdminAdView[];
  advertisers?: AdminAdvertiserView[];
  advertiserPagination?: AdminPaginationView;
  coverageStats?: AdminCreativeCoverageStatsView;
  invitations?: AdminWorkspaceInvitationView[];
  members?: AdminWorkspaceMemberView[];
  stats?: AdminRefreshStatsView;
  workspace: WorkspaceSummary;
}) {
  return (
    <div className="relative space-y-8 pb-32">
      <section className="space-y-5">
        <AdminTabs activeSection={activeSection} workspace={workspace} />
        {activeSection === "status" && stats ? (
          <AdminStatusDashboard stats={stats} />
        ) : activeSection === "coverage" && coverageStats ? (
          <AdminCreativeCoverageDashboard stats={coverageStats} workspace={workspace} />
        ) : activeSection === "ads" ? (
          <AdminTableShell title="Ads">
            <AdsTable ads={ads} />
          </AdminTableShell>
        ) : activeSection === "users" ? (
          <AdminUsersPanel invitations={invitations} members={members} />
        ) : (
          <AdminTableShell title="Advertisers">
            <AdvertisersTable advertisers={advertisers} pagination={advertiserPagination} workspace={workspace} />
          </AdminTableShell>
        )}
      </section>
    </div>
  );
}
