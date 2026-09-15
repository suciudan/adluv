import { listAdvertiserDirectory } from "@adluv/db";

import { BrowseAdvertisersPage } from "../../../components/browse-advertisers-page";
import { requireWorkspaceContext } from "../../../lib/workspace";

export default async function AdvertisersPage() {
  const { user, workspace } = await requireWorkspaceContext();
  const result = await listAdvertiserDirectory({
    userId: user.id,
    workspaceId: workspace.id,
  });

  return <BrowseAdvertisersPage result={result} />;
}
