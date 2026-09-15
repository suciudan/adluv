"use server";

import { revalidatePath } from "next/cache";

import {
  addExistingUserToWorkspace,
  createWorkspaceForUser,
  deleteWorkspaceForUser,
  listWorkspaceMembers,
  updateWorkspaceDetails,
} from "@adluv/db";

import { getCurrentWorkspaceContext } from "../../lib/workspace";

export async function createWorkspaceAction(input: {
  name: string;
  slug?: string;
}) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  try {
    const workspace = await createWorkspaceForUser({
      userId: context.user.id,
      name: input.name,
      slug: input.slug,
    });

    if (!workspace) {
      throw new Error("Workspace could not be created.");
    }

    revalidatePath("/settings");

    return {
      status: "ok" as const,
      workspace,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to create workspace.",
    };
  }
}

export async function updateWorkspaceDetailsAction(input: {
  name: string;
  slug?: string;
}) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  try {
    const workspace = await updateWorkspaceDetails({
      actorUserId: context.user.id,
      workspaceId: context.workspace.id,
      name: input.name,
      slug: input.slug,
    });

    revalidatePath("/settings");

    return {
      status: "ok" as const,
      workspace,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to update workspace.",
    };
  }
}

export async function deleteWorkspaceAction(input: {
  confirmation: string;
}) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  if (input.confirmation.trim() !== context.workspace.slug) {
    return {
      status: "error" as const,
      message: "Type the workspace URL exactly to confirm deletion.",
    };
  }

  try {
    const workspace = await deleteWorkspaceForUser({
      actorUserId: context.user.id,
      workspaceId: context.workspace.id,
    });

    revalidatePath("/", "layout");
    revalidatePath("/settings");

    return {
      status: "ok" as const,
      workspace,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to delete workspace.",
    };
  }
}

export async function addExistingUserToWorkspaceAction(input: {
  identifier: string;
  role: "admin" | "member";
}) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  try {
    const members = await addExistingUserToWorkspace({
      actorUserId: context.user.id,
      workspaceId: context.workspace.id,
      identifier: input.identifier,
      role: input.role,
    });

    revalidatePath("/settings");

    return {
      status: "ok" as const,
      members,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to add workspace member.",
    };
  }
}

export async function listWorkspaceMembersAction() {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  try {
    const members = await listWorkspaceMembers(context.user.id, context.workspace.id);

    return {
      status: "ok" as const,
      members,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to load workspace members.",
    };
  }
}
