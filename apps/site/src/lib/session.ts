import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { getAppHref } from "@adluv/config";
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
    redirect(getAppHref("/login"));
  }

  return user;
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
