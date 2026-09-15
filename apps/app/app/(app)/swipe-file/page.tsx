import { getSwipeFileLibrary } from "@adluv/db";

import { SwipeFilePageContent } from "../../../components/swipe-file-page-content";
import { requireWorkspaceContext } from "../../../lib/workspace";

export default async function SwipeFilePage() {
  const { user, workspace } = await requireWorkspaceContext();
  const library = await getSwipeFileLibrary(user.id, undefined, workspace.id);

  return <SwipeFilePageContent library={library} />;
}
