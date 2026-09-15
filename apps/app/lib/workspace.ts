import { headers } from "next/headers";

import {
  ensureDefaultWorkspaceForUser,
  getWorkspaceForUserBySlug,
  listWorkspacesForUser,
  type WorkspaceSummary,
} from "@adluv/db";

import { getCurrentUser, requireCurrentUser } from "./session";

export type CurrentWorkspaceContext = {
  user: Awaited<ReturnType<typeof requireCurrentUser>>;
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
};

async function resolveWorkspaceContextForUser(userId: string, requestedSlug: string | null) {
  if (requestedSlug) {
    const workspace = await getWorkspaceForUserBySlug(userId, requestedSlug);

    if (workspace) {
      return {
        workspace,
        workspaces: await listWorkspacesForUser(userId),
      };
    }
  }

  const workspace = await ensureDefaultWorkspaceForUser(userId);

  return {
    workspace,
    workspaces: await listWorkspacesForUser(userId),
  };
}

export function buildWorkspaceHref(workspaceSlug: string, href: string) {
  const normalizedHref = href.startsWith("/") ? href : `/${href}`;

  if (normalizedHref === "/") {
    return `/w/${workspaceSlug}/ads`;
  }

  if (normalizedHref.startsWith(`/w/`)) {
    return normalizedHref;
  }

  return `/w/${workspaceSlug}${normalizedHref}`;
}

export async function getWorkspaceSlugFromRequest() {
  const headerList = await headers();
  const directSlug = headerList.get("x-adluv-workspace-slug")?.trim();

  if (directSlug) {
    return directSlug;
  }

  const cookieSlug = headerList
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("adluv_workspace_slug="))
    ?.slice("adluv_workspace_slug=".length);

  if (cookieSlug) {
    return decodeURIComponent(cookieSlug).trim() || null;
  }

  const referer = headerList.get("referer");

  if (!referer) {
    return null;
  }

  try {
    const refererUrl = new URL(referer);
    const match = refererUrl.pathname.match(/^\/w\/([^/]+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function requireWorkspaceContext(): Promise<CurrentWorkspaceContext> {
  const user = await requireCurrentUser();
  const requestedSlug = await getWorkspaceSlugFromRequest();
  const { workspace, workspaces } = await resolveWorkspaceContextForUser(user.id, requestedSlug);

  return {
    user,
    workspace,
    workspaces,
  };
}

export async function getWorkspaceContextOrNull() {
  const user = await requireCurrentUser();
  const requestedSlug = await getWorkspaceSlugFromRequest();
  const { workspace, workspaces } = await resolveWorkspaceContextForUser(user.id, requestedSlug);

  return {
    user,
    workspace,
    workspaces,
  };
}

export async function getCurrentWorkspaceContext() {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const requestedSlug = await getWorkspaceSlugFromRequest();
  const { workspace, workspaces } = await resolveWorkspaceContextForUser(user.id, requestedSlug);

  return {
    user,
    workspace,
    workspaces,
  };
}
