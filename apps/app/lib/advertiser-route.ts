import { redirect } from "next/navigation";

import { getAdvertiserDirectoryDetail, type AdvertiserDirectoryDetail } from "@adluv/db";

import { buildWorkspaceHref } from "./workspace";

export type AdvertiserRouteSearchParams = Record<string, string | string[] | undefined>;

export function buildAdvertiserRoutePath(
  advertiserId: string,
  segment?: string,
  searchParams?: AdvertiserRouteSearchParams,
  workspaceSlug?: string,
) {
  const pathname = segment ? `/advertisers/${advertiserId}/${segment}` : `/advertisers/${advertiserId}`;
  const scopedPathname = workspaceSlug ? buildWorkspaceHref(workspaceSlug, pathname) : pathname;

  if (!searchParams) {
    return scopedPathname;
  }

  const next = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) {
          next.append(key, item);
        }
      }

      continue;
    }

    if (value) {
      next.set(key, value);
    }
  }

  const queryString = next.toString();
  return queryString ? `${scopedPathname}?${queryString}` : scopedPathname;
}

export async function requireAdvertiserDirectoryDetailForRoute(input: {
  userId: string;
  workspaceId?: string | null;
  workspaceSlug?: string;
  advertiserId: string;
  segment: string;
  searchParams?: AdvertiserRouteSearchParams;
}): Promise<AdvertiserDirectoryDetail | null> {
  const advertiser = await getAdvertiserDirectoryDetail(input.userId, input.advertiserId, input.workspaceId);

  if (!advertiser) {
    return null;
  }

  if (advertiser.id !== input.advertiserId) {
    redirect(buildAdvertiserRoutePath(advertiser.id, input.segment, input.searchParams, input.workspaceSlug));
  }

  return advertiser;
}
