import { getUnreadNotificationInboxCount, listNotificationInbox } from "@adluv/db";

import { NotificationsArchivePage } from "../../../components/notifications-archive-page";
import { requireWorkspaceContext } from "../../../lib/workspace";

export default async function NotificationsPage() {
  const { user, workspace } = await requireWorkspaceContext();
  const [items, unreadCount] = await Promise.all([
    listNotificationInbox(user.id, 250, workspace.id),
    getUnreadNotificationInboxCount(user.id, workspace.id),
  ]);

  return <NotificationsArchivePage items={items} unreadCount={unreadCount} />;
}
