"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { findAuthUserByUsername, normalizeUsername } from "@adluv/auth";

import { auth } from "../../lib/auth";
import {
  getCurrentUser,
  signInWithPassword,
  updateCurrentUserMetadata,
} from "../../lib/session";

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80, "Name is too long."),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters.")
    .max(64, "Username is too long.")
    .regex(/^[a-zA-Z0-9._-]+$/, "Use letters, numbers, dots, underscores, or hyphens only."),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(8, "Current password is required.").max(255),
    newPassword: z.string().min(8, "Password must be at least 8 characters.").max(32, "Password must be 32 characters or fewer."),
  })
  .superRefine((value, context) => {
    if (value.currentPassword === value.newPassword) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["newPassword"],
        message: "Choose a new password instead of reusing the current one.",
      });
    }
  });

export async function updateProfileAction(input: { name: string; username: string }) {
  const user = await getCurrentUser();

  if (!user) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  try {
    const payload = profileSchema.parse(input);
    const username = normalizeUsername(payload.username);
    const usernameOwner = await findAuthUserByUsername(username, process.env);

    if (usernameOwner && usernameOwner.id !== user.id) {
      throw new Error("That username is already taken.");
    }

    const { error } = await updateCurrentUserMetadata({
      name: payload.name,
      username,
      displayUsername: username,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/", "layout");
    revalidatePath("/settings");

    return {
      status: "ok" as const,
      user: {
        email: user.email,
        username,
        name: payload.name,
      },
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to update your profile.",
    };
  }
}

export async function updatePasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}) {
  const user = await getCurrentUser();

  if (!user) {
    return {
      status: "error" as const,
      message: "Authentication is required.",
    };
  }

  try {
    const payload = passwordSchema.parse(input);
    const { error: signInError } = await signInWithPassword(
      user.email,
      payload.currentPassword,
    );

    if (signInError) {
      throw new Error("Current password is incorrect.");
    }

    const { error } = await auth.api.changePassword({
      body: {
        currentPassword: payload.currentPassword,
        newPassword: payload.newPassword,
        revokeOtherSessions: false,
      },
      headers: await headers(),
    }).then((data) => ({ data, error: null })).catch((error) => ({
      data: null,
      error: error instanceof Error ? error : new Error("Unable to update your password."),
    }));

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/settings");

    return {
      status: "ok" as const,
      message: "Password updated.",
    };
  } catch (error) {
    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to update your password.",
    };
  }
}
