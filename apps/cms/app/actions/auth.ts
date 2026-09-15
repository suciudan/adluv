"use server";

import { z } from "zod";

import {
  findAuthUserByUsername,
  normalizeUsername,
} from "@adluv/auth";

import { clearUserSession, signInWithPassword } from "../../src/lib/session";

const loginSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(255),
});

function getLoginErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return "Enter a valid username and password.";
  }

  return "Unable to sign in right now. Please try again in a moment.";
}

export async function loginAction(input: { username: string; password: string }) {
  try {
    const payload = loginSchema.parse(input);
    const username = normalizeUsername(payload.username);
    const user = await findAuthUserByUsername(username, process.env);

    if (!user?.email) {
      return {
        status: "error" as const,
        message: "Invalid username or password.",
      };
    }

    const { error } = await signInWithPassword(user.email, payload.password);

    if (error) {
      return {
        status: "error" as const,
        message: "Invalid username or password.",
      };
    }

    return {
      status: "authenticated" as const,
    };
  } catch (error) {
    console.error("[cms] loginAction failed", error);

    return {
      status: "error" as const,
      message: getLoginErrorMessage(error),
    };
  }
}

export async function logoutAction() {
  await clearUserSession();

  return {
    status: "signed_out" as const,
  };
}
