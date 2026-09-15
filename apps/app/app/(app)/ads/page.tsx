import { browseAds, type BrowseAdsFilters, type BrowseAdsSort } from "@adluv/db";

import { BrowseAdsPage } from "../../../components/browse-ads-page";
import { requireWorkspaceContext } from "../../../lib/workspace";

type AdsBrowseSearchParams = Record<string, string | string[] | undefined>;
type NetworkFilter = "google" | "linkedin" | "meta";

const networkSourceMap: Record<NetworkFilter, NonNullable<BrowseAdsFilters["source"]>> = {
  google: "google",
  linkedin: "linkedin",
  meta: "facebook",
};

function getSingleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getBrowseAdsSource(searchParams: AdsBrowseSearchParams): BrowseAdsFilters["source"] {
  const network = getSingleValue(searchParams.network);

  return network === "google" || network === "linkedin" || network === "meta"
    ? networkSourceMap[network]
    : undefined;
}

function getBrowseAdsSort(searchParams: AdsBrowseSearchParams): BrowseAdsSort {
  const sort = getSingleValue(searchParams.sort);

  return sort === "longest_running" || sort === "most_impressions" ? sort : "most_recent";
}

export default async function AdsBrowsePage({
  searchParams,
}: {
  searchParams: Promise<AdsBrowseSearchParams>;
}) {
  const { user, workspace } = await requireWorkspaceContext();
  const resolvedSearchParams = await searchParams;
  const result = await browseAds({
    userId: user.id,
    workspaceId: workspace.id,
    source: getBrowseAdsSource(resolvedSearchParams),
    sort: getBrowseAdsSort(resolvedSearchParams),
  });

  return <BrowseAdsPage result={result} />;
}
