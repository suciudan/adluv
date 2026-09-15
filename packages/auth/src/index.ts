import { eq } from "drizzle-orm";
import { z } from "zod";

import { authUsersTable, getDb } from "@adluv/db";

export const authEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url(),
});

export type AuthEnv = z.infer<typeof authEnvSchema>;
type AuthEnvLike = Record<string, string | undefined>;

export type AuthUserProfile = {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  role: "member" | "admin" | "owner";
};

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

export function isBetterAuthConfigured(env: AuthEnvLike = process.env) {
  return Boolean(env.BETTER_AUTH_SECRET?.trim() && env.BETTER_AUTH_URL?.trim());
}

function toAuthUserProfile(user: {
  id: string;
  email: string;
  username: string | null;
  name: string | null;
  role: "member" | "admin" | "owner";
}): AuthUserProfile {
  return {
    id: user.id,
    email: user.email.trim().toLowerCase(),
    username: user.username ? normalizeUsername(user.username) : null,
    name: user.name,
    role: user.role,
  };
}

async function findUserByWhere(where: any) {
  const db = getDb();
  const [user] = await db
    .select({
      id: authUsersTable.id,
      email: authUsersTable.email,
      username: authUsersTable.username,
      name: authUsersTable.name,
      role: authUsersTable.role,
    })
    .from(authUsersTable)
    .where(where)
    .limit(1);

  return user ? toAuthUserProfile(user) : null;
}

export async function findAuthUserByEmail(
  email: string,
  _env: Partial<Record<string, string | undefined>> = process.env,
) {
  return findUserByWhere(eq(authUsersTable.email, email.trim().toLowerCase()));
}

export async function findAuthUserByUsername(
  username: string,
  _env: Partial<Record<string, string | undefined>> = process.env,
) {
  return findUserByWhere(eq(authUsersTable.username, normalizeUsername(username)));
}

export async function getAuthUserById(
  userId: string,
  _env: Partial<Record<string, string | undefined>> = process.env,
) {
  return findUserByWhere(eq(authUsersTable.id, userId));
}

export async function isAuthUserAdmin(
  userId: string,
  _env: Partial<Record<string, string | undefined>> = process.env,
) {
  const user = await getAuthUserById(userId);

  if (!user) {
    return false;
  }

  return user.role === "admin" || user.role === "owner";
}
