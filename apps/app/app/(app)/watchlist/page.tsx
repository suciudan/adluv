import {
  listWatchlistEntries,
} from "@adluv/db";

import { WatchlistPageContent } from "../../../components/watchlist-page-content";
import { requireWorkspaceContext } from "../../../lib/workspace";

export default async function WatchlistPage() {
  const { user, workspace } = await requireWorkspaceContext();
  const entries = await listWatchlistEntries(user.id, workspace.id);

  return (
    <WatchlistPageContent
      entries={entries}
    />
  );
}
