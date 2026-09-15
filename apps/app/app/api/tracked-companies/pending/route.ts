import { NextResponse } from "next/server";

import { listPendingTrackedCompanies } from "@adluv/db";

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
  const items = await listPendingTrackedCompanies(user.id, context?.workspace.id);

  return NextResponse.json({
    items,
  });
}
