import { notFound } from "next/navigation";

import { getAdDetail } from "@adluv/db";

import { AdDetailPageContent } from "../../../../components/ad-detail-page-content";
import { requireWorkspaceContext } from "../../../../lib/workspace";

export default async function AdDetailPage({
  params,
}: {
  params: Promise<{ adId: string }>;
}) {
  const { user, workspace } = await requireWorkspaceContext();
  const { adId } = await params;
  const ad = await getAdDetail(user.id, adId, workspace.id);

  if (!ad) {
    notFound();
  }

  return <AdDetailPageContent ad={ad} />;
}
