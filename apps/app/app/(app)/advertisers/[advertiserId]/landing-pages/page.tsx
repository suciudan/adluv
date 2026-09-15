import { notFound } from "next/navigation";

import { AdvertiserLandingPagesPage } from "../../../../../components/advertiser-landing-pages-page";
import { requireAdvertiserDirectoryDetailForRoute, type AdvertiserRouteSearchParams } from "../../../../../lib/advertiser-route";
import { requireWorkspaceContext } from "../../../../../lib/workspace";

export default async function AdvertiserLandingPagesRoutePage({
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
    segment: "landing-pages",
    searchParams: await searchParams,
  });

  if (!advertiser) {
    notFound();
  }

  return (
    <AdvertiserLandingPagesPage
      advertiserId={advertiser.id}
      advertiserName={advertiser.canonicalName}
      landingPages={advertiser.landingPages}
    />
  );
}
