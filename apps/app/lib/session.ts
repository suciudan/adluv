import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { isBetterAuthConfigured } from "@adluv/auth";
import { touchAuthUserLastSeenAt } from "@adluv/db";

import { auth } from "./auth";

type AuthenticatedUser = {
  id: string;
  email: string;
  username?: string | null;
  name?: string | null;
};

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  if (!isBetterAuthConfigured(process.env)) {
    return null;
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id || !session.user.email) {
    return null;
  }

  await touchAuthUserLastSeenAt(session.user.id);

  return {
    id: session.user.id,
    email: session.user.email,
    username: session.user.username ?? null,
    name: session.user.name ?? null,
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function signInWithPassword(email: string, password: string) {
  if (!isBetterAuthConfigured(process.env)) {
    return {
      data: null,
      error: new Error("Better Auth is not configured."),
    };
  }

  try {
    const data = await auth.api.signInEmail({
      body: {
        email,
        password,
      },
      headers: await headers(),
    });

    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("Unable to sign in."),
    };
  }
}

export async function updateCurrentUserMetadata(metadata: Record<string, unknown>) {
  if (!isBetterAuthConfigured(process.env)) {
    return { data: null, error: new Error("Better Auth is not configured.") };
  }

  try {
    const data = await auth.api.updateUser({
      body: metadata,
      headers: await headers(),
    });

    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("Unable to update your profile."),
    };
  }
}

export async function updateCurrentUserPassword(
  currentPassword: string,
  newPassword: string,
) {
  if (!isBetterAuthConfigured(process.env)) {
    return { data: null, error: new Error("Better Auth is not configured.") };
  }

  try {
    const data = await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      },
      headers: await headers(),
    });

    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error("Unable to update your password."),
    };
  }
}

export async function createUserSession() {
  return;
}

export async function clearUserSession() {
  if (!isBetterAuthConfigured(process.env)) {
    return;
  }

  await auth.api.signOut({
    headers: await headers(),
  });
}
