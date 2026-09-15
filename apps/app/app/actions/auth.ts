"use server";

import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { and, eq } from "drizzle-orm";

import {
  findAuthUserByUsername,
  normalizeUsername,
} from "@adluv/auth";
import {
  acceptWorkspaceUserInvitation,
  authAccountsTable,
  getDb,
} from "@adluv/db";

import { clearUserSession, signInWithPassword } from "../../lib/session";
import { getLocalDevCredentials, isLocalDevHost } from "../../lib/local-dev-auth";

const loginSchema = z.object({
  username: z.string().trim().min(3).max(64),
  password: z.string().min(8).max(255),
});
const acceptInvitationSchema = z.object({
  token: z.string().trim().min(20),
  name: z.string().trim().min(1).max(255),
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(8).max(255),
});

function getLoginErrorMessage(error: unknown) {
  if (error instanceof z.ZodError) {
    return "Enter a valid username and password.";
  }

  return "Unable to sign in right now. Please try again in a moment.";
}

async function isLocalDevLoginRequestAllowed() {
  if (!getLocalDevCredentials()) {
    return false;
  }

  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");
  const origin = requestHeaders.get("origin");

  if (!isLocalDevHost(host)) {
    return false;
  }

  if (!origin) {
    return true;
  }

  try {
    return isLocalDevHost(new URL(origin).host);
  } catch {
    return false;
  }
}

async function ensureLocalDevCredential(userId: string, password: string) {
  const db = getDb();
  const now = new Date();
  const passwordHash = await hashPassword(password);
  const [credentialAccount] = await db
    .select({ id: authAccountsTable.id })
    .from(authAccountsTable)
    .where(
      and(
        eq(authAccountsTable.userId, userId),
        eq(authAccountsTable.providerId, "credential"),
      ),
    )
    .limit(1);

  if (!credentialAccount) {
    await db.insert(authAccountsTable).values({
      id: randomUUID(),
      userId,
      accountId: userId,
      providerId: "credential",
      password: passwordHash,
      accessToken: null,
      refreshToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
      idToken: null,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

  await db
    .update(authAccountsTable)
    .set({
      password: passwordHash,
      updatedAt: now,
    })
    .where(eq(authAccountsTable.id, credentialAccount.id));
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
    console.error("[auth] loginAction failed", error);

    return {
      status: "error" as const,
      message: getLoginErrorMessage(error),
    };
  }
}

export async function localDevLoginAction() {
  try {
    if (!(await isLocalDevLoginRequestAllowed())) {
      return {
        status: "error" as const,
        message: "Local development login is unavailable.",
      };
    }

    const credentials = getLocalDevCredentials();
    if (!credentials) {
      return { status: "error" as const, message: "Local development login is unavailable." };
    }
    const username = normalizeUsername(credentials.username);
    const password = credentials.password;
    const user = await findAuthUserByUsername(username, process.env);

    if (!user?.id || !user.email) {
      return {
        status: "error" as const,
        message: `Local user "${username}" does not exist.`,
      };
    }

    await ensureLocalDevCredential(user.id, password);

    const { error } = await signInWithPassword(user.email, password);

    if (error) {
      return {
        status: "error" as const,
        message: "Unable to sign in as the local development user.",
      };
    }

    return {
      status: "authenticated" as const,
    };
  } catch (error) {
    console.error("[auth] localDevLoginAction failed", error);

    return {
      status: "error" as const,
      message: "Unable to sign in as the local development user.",
    };
  }
}

export async function acceptInvitationAction(input: {
  token: string;
  name: string;
  username: string;
  password: string;
}) {
  try {
    const payload = acceptInvitationSchema.parse(input);
    const username = normalizeUsername(payload.username);
    const passwordHash = await hashPassword(payload.password);
    const accepted = await acceptWorkspaceUserInvitation({
      token: payload.token,
      name: payload.name,
      username,
      passwordHash,
    });
    const { error } = await signInWithPassword(accepted.email, payload.password);

    if (error) {
      return {
        status: "accepted" as const,
        workspaceSlug: accepted.workspaceSlug,
        message: "Your account was created. Sign in with your new password.",
      };
    }

    return {
      status: "authenticated" as const,
      workspaceSlug: accepted.workspaceSlug,
    };
  } catch (error) {
    console.error("[auth] acceptInvitationAction failed", error);

    return {
      status: "error" as const,
      message: error instanceof Error ? error.message : "Unable to accept this invitation.",
    };
  }
}

export async function logoutAction() {
  await clearUserSession();

  return {
    status: "signed_out" as const,
  };
}
