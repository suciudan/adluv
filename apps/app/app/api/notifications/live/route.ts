import { NextResponse } from "next/server";

import { getUnreadNotificationInboxCount, listNotificationInbox } from "@adluv/db";

import { getCurrentUser } from "../../../../lib/session";
import { getCurrentWorkspaceContext } from "../../../../lib/workspace";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        message: "Authentication is required.",
      },
      { status: 401 },
    );
  }

  const context = await getCurrentWorkspaceContext();
  const workspaceId = context?.workspace.id ?? undefined;

  const [items, unreadCount] = await Promise.all([
    listNotificationInbox(user.id, 20, workspaceId),
    getUnreadNotificationInboxCount(user.id, workspaceId),
  ]);

  return NextResponse.json({
    items,
    unreadCount,
  });
}
