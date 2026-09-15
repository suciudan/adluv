"use server";

import { revalidatePath } from "next/cache";

import {
  createSwipeFileCollection,
  deleteSwipeFileCollection,
  removeSavedAdForUser,
  setSavedAdCollectionMembership,
  updateSavedAdNote,
} from "@adluv/db";

import { getCurrentWorkspaceContext } from "../../lib/workspace";

export async function createSwipeFileCollectionAction(input: {
  name: string;
  description?: string;
}) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  try {
    const result = await createSwipeFileCollection({
      userId: user.id,
      workspaceId: workspace.id,
      name: input.name,
      description: input.description,
    });

    revalidatePath("/swipe-file");

    return {
      status: result.created ? ("created" as const) : ("existing" as const),
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to create the collection.",
    };
  }
}

export async function updateSavedAdNoteAction(input: {
  savedAdId: string;
  note: string;
}) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  try {
    await updateSavedAdNote({
      userId: user.id,
      workspaceId: workspace.id,
      savedAdId: input.savedAdId,
      note: input.note,
    });

    revalidatePath("/swipe-file");

    return {
      status: "updated" as const,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to update the note.",
    };
  }
}

export async function moveSavedAdToCollectionAction(input: {
  savedAdId: string;
  collectionId: string;
  currentCollectionIds: string[];
}) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  try {
    const currentCollectionIds = Array.from(
      new Set(input.currentCollectionIds.filter((collectionId) => collectionId !== input.collectionId)),
    );

    for (const currentCollectionId of currentCollectionIds) {
      await setSavedAdCollectionMembership({
        userId: user.id,
        workspaceId: workspace.id,
        savedAdId: input.savedAdId,
        collectionId: currentCollectionId,
        present: false,
      });
    }

    await setSavedAdCollectionMembership({
      userId: user.id,
      workspaceId: workspace.id,
      savedAdId: input.savedAdId,
      collectionId: input.collectionId,
      present: true,
    });

    revalidatePath("/swipe-file");

    return {
      status: "updated" as const,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to update the collection.",
    };
  }
}

export async function removeSavedAdAction(savedAdId: string) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  try {
    await removeSavedAdForUser({
      userId: user.id,
      workspaceId: workspace.id,
      savedAdId,
    });

    revalidatePath("/swipe-file");

    return {
      status: "removed" as const,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to remove this ad.",
    };
  }
}

export async function deleteSwipeFileCollectionAction(collectionId: string) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  try {
    await deleteSwipeFileCollection({
      userId: user.id,
      workspaceId: workspace.id,
      collectionId,
    });

    revalidatePath("/swipe-file");

    return {
      status: "deleted" as const,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to delete this collection.",
    };
  }
}
