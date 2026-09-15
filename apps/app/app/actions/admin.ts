"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAppHref } from "@adluv/config";
import {
  addAdminAdvertiserSource,
  createWorkspaceUserInvitation,
  deleteAdminAd,
  deleteAdminAdvertisers,
  mergeAdminAdvertisers,
  updateAdminAdvertiser,
} from "@adluv/db";

import { isAdminUser } from "../../lib/admin";
import { sendTransactionalEmail } from "../../lib/email";
import { getCurrentUser } from "../../lib/session";
import { getCurrentWorkspaceContext } from "../../lib/workspace";

const idSchema = z.string().trim().min(1);
const idsSchema = z.array(idSchema).min(1);
const mergeAdvertisersSchema = z.object({
  advertiserIds: idsSchema.min(2),
  displayName: z.string().trim().min(1).max(255),
  websiteUrl: z.string().trim().max(1024).nullable().optional(),
  logoUrl: z.string().trim().max(1024).nullable().optional(),
});
const sourceSchema = z.enum(["linkedin", "facebook", "google", "tiktok"]);
const updateAdvertiserSchema = z.object({
  advertiserIds: idsSchema,
  displayName: z.string().trim().min(1).max(255),
  websiteUrl: z.string().trim().max(1024).nullable().optional(),
  logoUrl: z.string().trim().max(1024).nullable().optional(),
  sourceUpdates: z.array(z.object({
    advertiserId: idSchema,
    sourceAdvertiserId: z.string().trim().min(1).max(191),
    profileUrl: z.string().trim().max(512).nullable().optional(),
  })).optional(),
});
const addAdvertiserSourceSchema = z.object({
  advertiserIds: idsSchema,
  source: sourceSchema,
  sourceAdvertiserId: z.string().trim().min(1).max(191),
  canonicalName: z.string().trim().max(255).nullable().optional(),
  profileUrl: z.string().trim().max(512).nullable().optional(),
  websiteUrl: z.string().trim().max(1024).nullable().optional(),
  logoUrl: z.string().trim().max(1024).nullable().optional(),
});
const inviteUserSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  role: z.enum(["member", "admin"]).default("member"),
});

async function requireAdminAction() {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Authentication is required.");
  }

  if (!isAdminUser(user)) {
    throw new Error("Admin access is required.");
  }

  return user;
}

async function requireAdminWorkspaceAction() {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    throw new Error("Authentication is required.");
  }

  if (!isAdminUser(context.user)) {
    throw new Error("Admin access is required.");
  }

  return context;
}

function revalidateAdminSectionPaths(workspaceSlug: string, sections: Array<"ads" | "advertisers" | "status">) {
  for (const section of sections) {
    revalidatePath(`/admin/${section}`);
    revalidatePath(`/w/${workspaceSlug}/admin/${section}`);
  }
}

export async function inviteAdminUserAction(input: {
  email: string;
  role?: "member" | "admin";
}) {
  try {
    const { user, workspace } = await requireAdminWorkspaceAction();
    const payload = inviteUserSchema.parse(input);
    const result = await createWorkspaceUserInvitation({
      actorUserId: user.id,
      workspaceId: workspace.id,
      email: payload.email,
      role: payload.role,
    });
    const inviteHref = getAppHref(`/invite/${encodeURIComponent(result.token)}`);

    await sendTransactionalEmail({
      to: payload.email,
      subject: `You're invited to ${workspace.name} on Adluv`,
      text: [
        `${user.name?.trim() || user.email} invited you to ${workspace.name} on Adluv.`,
        "",
        "Open this link to set up your password:",
        inviteHref,
        "",
        "This invitation expires in 7 days.",
      ].join("\n"),
    });

    revalidatePath("/admin/users");
    revalidatePath(`/w/${workspace.slug}/admin/users`);

    return {
      status: "ok" as const,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to invite this user.",
    };
  }
}

export async function deleteAdminAdAction(adId: string) {
  try {
    const { workspace } = await requireAdminWorkspaceAction();
    const result = await deleteAdminAd(idSchema.parse(adId));

    revalidateAdminSectionPaths(workspace.slug, ["ads"]);
    revalidatePath("/ads");
    revalidatePath("/activity");
    revalidatePath("/swipe-file");
    revalidatePath("/watchlist");

    return {
      status: "ok" as const,
      result,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to delete this ad.",
    };
  }
}

export async function deleteAdminAdvertiserAction(advertiserIds: string[]) {
  try {
    const { workspace } = await requireAdminWorkspaceAction();
    const result = await deleteAdminAdvertisers(idsSchema.parse(advertiserIds));

    revalidateAdminSectionPaths(workspace.slug, ["advertisers", "ads"]);
    revalidatePath("/advertisers");
    revalidatePath("/ads");
    revalidatePath("/activity");
    revalidatePath("/swipe-file");
    revalidatePath("/watchlist");

    return {
      status: "ok" as const,
      result,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to delete this advertiser.",
    };
  }
}

export async function mergeAdminAdvertisersAction(input: {
  advertiserIds: string[];
  displayName: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
}) {
  try {
    await requireAdminAction();
    const payload = mergeAdvertisersSchema.parse(input);
    const result = await mergeAdminAdvertisers(payload);

    revalidatePath("/admin/advertisers");
    revalidatePath("/admin/status");
    revalidatePath("/advertisers");
    revalidatePath("/ads");
    revalidatePath("/activity");
    revalidatePath("/watchlist");

    return {
      status: "ok" as const,
      result,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to merge these advertisers.",
    };
  }
}

export async function updateAdminAdvertiserAction(input: {
  advertiserIds: string[];
  displayName: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  sourceUpdates?: Array<{
    advertiserId: string;
    sourceAdvertiserId: string;
    profileUrl?: string | null;
  }>;
}) {
  try {
    await requireAdminAction();
    const payload = updateAdvertiserSchema.parse(input);
    const result = await updateAdminAdvertiser(payload);

    revalidatePath("/admin/advertisers");
    revalidatePath("/admin/status");
    revalidatePath("/advertisers");
    revalidatePath("/ads");
    revalidatePath("/activity");
    revalidatePath("/watchlist");

    return {
      status: "ok" as const,
      result,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to update this advertiser.",
    };
  }
}

export async function addAdminAdvertiserSourceAction(input: {
  advertiserIds: string[];
  source: "linkedin" | "facebook" | "google" | "tiktok";
  sourceAdvertiserId: string;
  canonicalName?: string | null;
  profileUrl?: string | null;
  websiteUrl?: string | null;
  logoUrl?: string | null;
}) {
  try {
    await requireAdminAction();
    const payload = addAdvertiserSourceSchema.parse(input);
    const result = await addAdminAdvertiserSource(payload);

    revalidatePath("/admin/advertisers");
    revalidatePath("/admin/status");
    revalidatePath("/advertisers");
    revalidatePath("/ads");
    revalidatePath("/activity");
    revalidatePath("/watchlist");

    return {
      status: "ok" as const,
      result,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to add this advertiser source.",
    };
  }
}
