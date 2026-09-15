import { notFound, redirect } from "next/navigation";

import { buildAdvertiserRoutePath, requireAdvertiserDirectoryDetailForRoute, type AdvertiserRouteSearchParams } from "../../../../lib/advertiser-route";
import { requireWorkspaceContext } from "../../../../lib/workspace";

export default async function LegacyAdvertiserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ advertiserId: string }>;
  searchParams: Promise<AdvertiserRouteSearchParams>;
}) {
  const { user, workspace } = await requireWorkspaceContext();
  const { advertiserId } = await params;
  const currentSearchParams = await searchParams;
  const advertiser = await requireAdvertiserDirectoryDetailForRoute({
    userId: user.id,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    advertiserId,
    segment: "overview",
    searchParams: currentSearchParams,
  });

  if (!advertiser) {
    notFound();
  }

  redirect(buildAdvertiserRoutePath(advertiser.id, "overview", currentSearchParams, workspace.slug));
}
