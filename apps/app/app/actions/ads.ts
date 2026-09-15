"use server";

import { revalidatePath } from "next/cache";

import {
  createSwipeFileCollection,
  getAdDetail,
  getAdAdvertiserContext,
  getSaveAdModalState,
  saveAdForUser,
  setSavedAdCollectionMembership,
  updateSavedAdNote,
} from "@adluv/db";

import { getCurrentWorkspaceContext } from "../../lib/workspace";

export async function saveAdAction(adId: string) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const { user, workspace } = context;

  const ad = await getAdAdvertiserContext(adId);

  if (!ad) {
    return {
      status: "error" as const,
      message: "Ad was not found.",
    };
  }

  const savedAd = await saveAdForUser({
    userId: user.id,
    workspaceId: workspace.id,
    adId,
  });

  revalidatePath(`/ads/${adId}`);
  revalidatePath("/activity");
  revalidatePath("/swipe-file");

  return {
    status: savedAd.created ? ("saved" as const) : ("existing" as const),
  };
}

export async function getSaveAdModalStateAction(adId: string) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const state = await getSaveAdModalState(context.user.id, adId, context.workspace.id);

  return {
    status: "ok" as const,
    state,
  };
}

export async function getAdModalDetailAction(adId: string) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const ad = await getAdDetail(context.user.id, adId, context.workspace.id);

  if (!ad) {
    return {
      status: "error" as const,
      message: "Ad was not found.",
    };
  }

  return {
    status: "ok" as const,
    ad,
  };
}

export async function saveAdToSwipeFileAction(input: {
  adId: string;
  note: string;
  collectionId?: string;
  createCollectionName?: string;
  createCollectionDescription?: string;
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
    const savedAd = await saveAdForUser({
      userId: user.id,
      workspaceId: workspace.id,
      adId: input.adId,
    });

    await updateSavedAdNote({
      userId: user.id,
      workspaceId: workspace.id,
      savedAdId: savedAd.id,
      note: input.note,
    });

    let selectedCollectionId = input.collectionId ?? null;

    if (input.createCollectionName?.trim()) {
      const createdCollection = await createSwipeFileCollection({
        userId: user.id,
        workspaceId: workspace.id,
        name: input.createCollectionName,
        description: input.createCollectionDescription,
      });

      selectedCollectionId = createdCollection.id;
    }

    if (selectedCollectionId) {
      await setSavedAdCollectionMembership({
        userId: user.id,
        workspaceId: workspace.id,
        savedAdId: savedAd.id,
        collectionId: selectedCollectionId,
        present: true,
      });
    }

    revalidatePath(`/ads/${input.adId}`);
    revalidatePath("/ads");
    revalidatePath("/activity");
    revalidatePath("/swipe-file");
    revalidatePath("/watchlist");

    return {
      status: "ok" as const,
      savedAdId: savedAd.id,
      created: savedAd.created,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to save this ad.",
    };
  }
}
