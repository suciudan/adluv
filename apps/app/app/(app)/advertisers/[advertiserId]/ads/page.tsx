import { notFound } from "next/navigation";

import { AdvertiserAdsPage } from "../../../../../components/advertiser-ads-page";
import { requireAdvertiserDirectoryDetailForRoute, type AdvertiserRouteSearchParams } from "../../../../../lib/advertiser-route";
import { requireWorkspaceContext } from "../../../../../lib/workspace";

export default async function AdvertiserAdsRoutePage({
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
    segment: "ads",
    searchParams: await searchParams,
  });

  if (!advertiser) {
    notFound();
  }

  return (
    <AdvertiserAdsPage
      advertiserId={advertiser.id}
      advertiserName={advertiser.canonicalName}
      advertiserLogoUrl={advertiser.logoUrl}
      ads={advertiser.ads}
    />
  );
}
