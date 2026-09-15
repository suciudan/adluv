import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { getAdvertiserDirectoryDetail } from "@adluv/db";

import { AdvertiserDirectoryActionButton } from "../../../../components/advertiser-directory-action-button";
import { AdvertiserIdentity } from "../../../../components/advertiser-identity";
import { AdvertiserTabsNav } from "../../../../components/advertiser-tabs-nav";
import { buildWorkspaceHref, requireWorkspaceContext } from "../../../../lib/workspace";

export default async function AdvertiserLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ advertiserId: string }>;
}) {
  const { user, workspace } = await requireWorkspaceContext();
  const { advertiserId } = await params;
  const advertiser = await getAdvertiserDirectoryDetail(user.id, advertiserId, workspace.id);

  if (!advertiser) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-[var(--border-subtle)] pb-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1">
          <AdvertiserIdentity
            name={advertiser.canonicalName}
            href={buildWorkspaceHref(workspace.slug, `/advertisers/${advertiser.id}/overview`)}
            logoUrl={advertiser.logoUrl}
            metadata={[advertiser.industry]}
            className="flex items-start gap-4"
            contentClassName="space-y-0"
            metadataClassName="mt-0 leading-3.5"
            titleAction={
              <AdvertiserDirectoryActionButton
                advertiser={{
                  id: advertiser.id,
                  canonicalName: advertiser.canonicalName,
                  profileUrl: advertiser.profileUrl,
                  websiteUrl: advertiser.websiteUrl,
                  industry: advertiser.industry,
                  companySize: advertiser.companySize,
                  country: advertiser.country,
                  summary: advertiser.summary,
                }}
                trackedCompanyIds={advertiser.trackedCompanyIds}
              />
            }
          />
        </div>

        <div className="xl:shrink-0">
          <AdvertiserTabsNav advertiserId={advertiser.id} workspaceSlug={workspace.slug} />
        </div>
      </section>

      {children}
    </div>
  );
}
