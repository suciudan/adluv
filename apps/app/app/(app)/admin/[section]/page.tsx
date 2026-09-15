import { notFound, redirect } from "next/navigation";

import {
  getAdminCreativeCoverageStats,
  getAdminRefreshStats,
  listAdminAds,
  listAdminAdvertisersPage,
  listAdminWorkspaceUsers,
  type AdminCreativeCoverageStats,
  type AdminRefreshStats,
  type AdminAdListItem,
  type AdminAdvertiserListItem,
  type AdminWorkspaceInvitationSummary,
  type WorkspaceMemberSummary,
} from "@adluv/db";

import { AdminManagementPage } from "../../../../components/admin-management-page";
import { isAdminUser } from "../../../../lib/admin";
import { requireWorkspaceContext } from "../../../../lib/workspace";

type AdminSection = "status" | "ads" | "advertisers" | "coverage" | "users";

function isAdminSection(value: string): value is AdminSection {
  return value === "status" || value === "ads" || value === "advertisers" || value === "coverage" || value === "users";
}

function serializeAd(ad: AdminAdListItem) {
  return {
    ...ad,
    firstSeenAt: ad.firstSeenAt.toISOString(),
    lastSeenAt: ad.lastSeenAt.toISOString(),
    createdAt: ad.createdAt.toISOString(),
  };
}

function serializeAdvertiser(advertiser: AdminAdvertiserListItem) {
  return {
    ...advertiser,
    lastIndexedAt: advertiser.lastIndexedAt?.toISOString() ?? null,
    createdAt: advertiser.createdAt.toISOString(),
  };
}

function parsePageParam(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function serializeStats(stats: AdminRefreshStats) {
  return {
    ...stats,
    generatedAt: stats.generatedAt.toISOString(),
    advertisers: {
      ...stats.advertisers,
      oldestIndexedAt: stats.advertisers.oldestIndexedAt?.toISOString() ?? null,
      newestIndexedAt: stats.advertisers.newestIndexedAt?.toISOString() ?? null,
    },
    bySource: stats.bySource.map((source) => ({
      ...source,
      lastIndexedAt: source.lastIndexedAt?.toISOString() ?? null,
      lastSeenAt: source.lastSeenAt?.toISOString() ?? null,
    })),
    queues: stats.queues.map((queue) => ({
      ...queue,
      lastUpdatedAt: queue.lastUpdatedAt?.toISOString() ?? null,
    })),
    recentFailures: stats.recentFailures.map((failure) => ({
      ...failure,
      updatedAt: failure.updatedAt.toISOString(),
      startedAt: failure.startedAt?.toISOString() ?? null,
      finishedAt: failure.finishedAt?.toISOString() ?? null,
    })),
  };
}

function serializeCoverageStats(stats: AdminCreativeCoverageStats) {
  return {
    ...stats,
    generatedAt: stats.generatedAt.toISOString(),
    worstAds: stats.worstAds.map((ad) => ({
      ...ad,
      lastSeenAt: ad.lastSeenAt.toISOString(),
    })),
  };
}

function serializeWorkspaceMember(member: WorkspaceMemberSummary) {
  return {
    ...member,
    lastSeenAt: member.lastSeenAt?.toISOString() ?? null,
    createdAt: member.createdAt.toISOString(),
  };
}

function serializeWorkspaceInvitation(invitation: AdminWorkspaceInvitationSummary) {
  return {
    ...invitation,
    expiresAt: invitation.expiresAt?.toISOString() ?? null,
    createdAt: invitation.createdAt.toISOString(),
  };
}

export default async function AdminSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  const resolvedSearchParams = await searchParams;

  if (!isAdminSection(section)) {
    notFound();
  }

  const { user, workspace } = await requireWorkspaceContext();

  if (!isAdminUser(user)) {
    redirect("/ads");
  }

  const stats = section === "status" ? serializeStats(await getAdminRefreshStats()) : undefined;
  const coverageStats = section === "coverage" ? serializeCoverageStats(await getAdminCreativeCoverageStats()) : undefined;
  const workspaceUsers = section === "users" ? await listAdminWorkspaceUsers(user.id, workspace.id) : undefined;
  const advertiserPage = section === "advertisers"
    ? await listAdminAdvertisersPage({
        page: parsePageParam(resolvedSearchParams?.page),
        pageSize: 100,
      })
    : undefined;
  const [ads, advertisers] = section === "ads"
    ? [(await listAdminAds()).map(serializeAd), []]
    : section === "advertisers"
      ? [[], advertiserPage?.items.map(serializeAdvertiser) ?? []]
      : [[], []];

  return (
    <AdminManagementPage
      activeSection={section}
      ads={ads}
      advertisers={advertisers}
      advertiserPagination={advertiserPage ? {
        page: advertiserPage.page,
        pageSize: advertiserPage.pageSize,
        totalItems: advertiserPage.totalItems,
        totalPages: advertiserPage.totalPages,
      } : undefined}
      coverageStats={coverageStats}
      invitations={workspaceUsers?.invitations.map(serializeWorkspaceInvitation) ?? []}
      members={workspaceUsers?.members.map(serializeWorkspaceMember) ?? []}
      stats={stats}
      workspace={workspace}
    />
  );
}
