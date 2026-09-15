import { notFound } from "next/navigation";

import { AdvertiserAssetsPage } from "../../../../../components/advertiser-assets-page";
import { requireAdvertiserDirectoryDetailForRoute, type AdvertiserRouteSearchParams } from "../../../../../lib/advertiser-route";
import { requireWorkspaceContext } from "../../../../../lib/workspace";

export default async function AdvertiserAssetsRoutePage({
  params,
  searchParams,
}: {
  params: Promise<{ advertiserId: string }>;
  searchParams: Promise<AdvertiserRouteSearchParams>;
}) {
  const { user, workspace } = await requireWorkspaceContext();
  const { advertiserId } = await params;
  const advertiser = await requireAdvertiserDirectoryDetailForRoute({
    userId: user.id,
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    advertiserId,
    segment: "assets",
    searchParams: await searchParams,
  });

  if (!advertiser) {
    notFound();
  }

  return <AdvertiserAssetsPage advertiserId={advertiser.id} advertiserName={advertiser.canonicalName} ads={advertiser.ads} />;
}
