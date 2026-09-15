"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";

import {
  getUserNotificationSettingsSummary,
  markAllNotificationInboxItemsRead,
  markNotificationInboxItemRead,
  markNotificationInboxItemUnread,
  updateUserNotificationSettings,
} from "@adluv/db";

import { getCurrentUser } from "../../lib/session";
import { getCurrentWorkspaceContext } from "../../lib/workspace";

const settingsSchema = z.object({
  alertsEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  inAppEnabled: z.boolean(),
  digestFrequency: z.enum(["instant", "daily", "weekly", "monthly"]),
});

export async function updateNotificationSettingsAction(input: {
  alertsEnabled: boolean;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  digestFrequency: "instant" | "daily" | "weekly" | "monthly";
}) {
  const user = await getCurrentUser();

  if (!user) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  try {
    const payload = settingsSchema.parse(input);
    const settings = await updateUserNotificationSettings(user.id, payload);

    revalidatePath("/settings");
    revalidatePath("/notifications");
    revalidatePath("/activity");

    return {
      status: "ok" as const,
      settings,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to update notification settings.",
    };
  }
}

export async function getNotificationSettingsAction() {
  const user = await getCurrentUser();

  if (!user) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  const settings = await getUserNotificationSettingsSummary(user.id);

  return {
    status: "ok" as const,
    settings,
  };
}

export async function markNotificationInboxItemReadAction(deliveryId: string) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  try {
    await markNotificationInboxItemRead(context.user.id, deliveryId, context.workspace.id);

    revalidatePath("/notifications");

    return {
      status: "ok" as const,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to mark notification as read.",
    };
  }
}

export async function markAllNotificationInboxItemsReadAction() {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  try {
    const updatedCount = await markAllNotificationInboxItemsRead(context.user.id, context.workspace.id);

    revalidatePath("/notifications");

    return {
      status: "ok" as const,
      updatedCount,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to mark notifications as read.",
    };
  }
}

export async function markNotificationInboxItemUnreadAction(deliveryId: string) {
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  try {
    await markNotificationInboxItemUnread(context.user.id, deliveryId, context.workspace.id);

    revalidatePath("/notifications");

    return {
      status: "ok" as const,
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to mark notification as unread.",
    };
  }
}
