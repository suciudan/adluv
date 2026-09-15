import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { isAuthUserAdmin, isBetterAuthConfigured } from "@adluv/auth";
import { touchAuthUserLastSeenAt } from "@adluv/db";

import { auth } from "./auth";

export type AuthenticatedCmsUser = {
  id: string;
  email: string;
  username?: string | null;
  name?: string | null;
};

export async function getCurrentUser(): Promise<AuthenticatedCmsUser | null> {
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

export async function requireCurrentAdmin() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const isAdmin = await isAuthUserAdmin(user.id, process.env);

  if (!isAdmin) {
    redirect("/forbidden");
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

export async function clearUserSession() {
  if (!isBetterAuthConfigured(process.env)) {
    return;
  }

  await auth.api.signOut({
    headers: await headers(),
  });
}
