import { randomUUID } from "node:crypto";
import { stdin, stdout } from "node:process";

import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";

import {
  findAuthUserByEmail,
  findAuthUserByUsername,
  normalizeUsername,
} from "@adluv/auth";
import {
  authAccountsTable,
  authUsersTable,
  closePool,
  ensureDefaultWorkspaceForUser,
  ensureUserEntitlements,
  ensureUserNotificationSettings,
  getDb,
} from "@adluv/db";

type UserRole = "member" | "admin" | "owner";

type Args = {
  help: boolean;
  email: string | null;
  username: string | null;
  name: string | null;
  password: string | null;
  role: UserRole;
};

const usage = [
  "Usage: yarn auth:provision-user -- --email \"user@example.com\" --username \"username\" --name \"Full Name\" [--password \"temporary-password\"] [--role member|admin|owner]",
  "",
  "Creates or updates a private-beta Better Auth credential user.",
  "If --password is omitted and a TTY is available, the CLI prompts securely.",
].join("\n");

function parseArgs(argv: string[]): Args {
  let help = false;
  let email: string | null = null;
  let username: string | null = null;
  let name: string | null = null;
  let password: string | null = null;
  let role: UserRole = "member";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--email" && nextValue) {
      email = nextValue;
      index += 1;
      continue;
    }

    if (arg.startsWith("--email=")) {
      email = arg.slice("--email=".length);
      continue;
    }

    if (arg === "--username" && nextValue) {
      username = nextValue;
      index += 1;
      continue;
    }

    if (arg.startsWith("--username=")) {
      username = arg.slice("--username=".length);
      continue;
    }

    if (arg === "--name" && nextValue) {
      name = nextValue;
      index += 1;
      continue;
    }

    if (arg.startsWith("--name=")) {
      name = arg.slice("--name=".length);
      continue;
    }

    if (arg === "--password" && nextValue) {
      password = nextValue;
      index += 1;
      continue;
    }

    if (arg.startsWith("--password=")) {
      password = arg.slice("--password=".length);
      continue;
    }

    if (arg === "--role" && nextValue) {
      role = parseRole(nextValue);
      index += 1;
      continue;
    }

    if (arg.startsWith("--role=")) {
      role = parseRole(arg.slice("--role=".length));
      continue;
    }

    throw new Error(`${usage}\n\nUnknown argument: ${arg}`);
  }

  return {
    help,
    email,
    username,
    name,
    password,
    role,
  };
}

function parseRole(role: string): UserRole {
  if (role === "member" || role === "admin" || role === "owner") {
    return role;
  }

  throw new Error(`Invalid role "${role}". Expected member, admin, or owner.`);
}

function validateEmail(email: string) {
  const normalized = email.trim().toLowerCase();

  if (!normalized.includes("@") || normalized.length > 255) {
    throw new Error("Email must be a valid address 255 characters or fewer.");
  }

  return normalized;
}

function validateUsername(username: string) {
  const normalized = normalizeUsername(username);

  if (normalized.length < 3 || normalized.length > 64) {
    throw new Error("Username must be between 3 and 64 characters.");
  }

  return normalized;
}

function validateName(name: string) {
  const trimmed = name.trim();

  if (trimmed.length < 1 || trimmed.length > 255) {
    throw new Error("Name must be between 1 and 255 characters.");
  }

  return trimmed;
}

function validatePassword(password: string) {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  if (password.length > 255) {
    throw new Error("Password must be 255 characters or fewer.");
  }
}

async function promptForHiddenValue(label: string) {
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      'A TTY is required for the interactive password prompt. Re-run with --password "temporary-password".',
    );
  }

  stdout.write(label);

  return await new Promise<string>((resolve, reject) => {
    let value = "";
    const previousRawMode = stdin.isRaw;

    const cleanup = () => {
      stdin.removeListener("data", handleData);
      stdin.setRawMode?.(Boolean(previousRawMode));
      stdin.pause();
    };

    const handleData = (chunk: Buffer) => {
      const text = chunk.toString("utf8");

      for (const character of text) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Prompt cancelled."));
          return;
        }

        if (character === "\r" || character === "\n") {
          cleanup();
          stdout.write("\n");
          resolve(value);
          return;
        }

        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          continue;
        }

        if (character >= " " && character !== "\u007f") {
          value += character;
        }
      }
    };

    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on("data", handleData);
  });
}

async function resolvePassword(password: string | null) {
  if (password !== null) {
    return password;
  }

  const nextPassword = await promptForHiddenValue("Temporary password: ");
  const confirmedPassword = await promptForHiddenValue("Confirm temporary password: ");

  if (nextPassword !== confirmedPassword) {
    throw new Error("Password confirmation does not match.");
  }

  return nextPassword;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(usage);
    return;
  }

  if (!args.email || !args.username || !args.name) {
    throw new Error(`${usage}\n\n--email, --username, and --name are required.`);
  }

  const email = validateEmail(args.email);
  const username = validateUsername(args.username);
  const name = validateName(args.name);
  const password = await resolvePassword(args.password);
  validatePassword(password);

  const existingByEmail = await findAuthUserByEmail(email, process.env);
  const existingByUsername = await findAuthUserByUsername(username, process.env);

  if (existingByEmail && existingByUsername && existingByEmail.id !== existingByUsername.id) {
    throw new Error(
      `Cannot provision user because email ${email} and username ${username} belong to different accounts.`,
    );
  }

  const existingUser = existingByEmail ?? existingByUsername;
  const db = getDb();
  const now = new Date();
  const userId = existingUser?.id ?? randomUUID();

  if (!existingUser) {
    await db.insert(authUsersTable).values({
      id: userId,
      email,
      name,
      username,
      displayUsername: username,
      role: args.role,
      emailVerified: true,
      image: null,
      createdAt: now,
      updatedAt: now,
    });

    console.log(`[auth:provision-user] created user ${email}`);
  } else {
    await db
      .update(authUsersTable)
      .set({
        email,
        name,
        username,
        displayUsername: username,
        role: args.role,
        emailVerified: true,
        updatedAt: now,
      })
      .where(eq(authUsersTable.id, userId));

    console.log(`[auth:provision-user] updated user ${email}`);
  }

  const [credentialAccount] = await db
    .select({
      id: authAccountsTable.id,
    })
    .from(authAccountsTable)
    .where(
      and(
        eq(authAccountsTable.userId, userId),
        eq(authAccountsTable.providerId, "credential"),
      ),
    )
    .limit(1);

  const passwordHash = await hashPassword(password);

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

    console.log("[auth:provision-user] created credential account");
  } else {
    await db
      .update(authAccountsTable)
      .set({
        password: passwordHash,
        updatedAt: now,
      })
      .where(eq(authAccountsTable.id, credentialAccount.id));

    console.log("[auth:provision-user] updated credential password");
  }

  await ensureUserEntitlements(userId);
  await ensureUserNotificationSettings(userId);
  await ensureDefaultWorkspaceForUser(userId);

  console.log(
    `[auth:provision-user] ready username=${username} email=${email} role=${args.role}`,
  );
}

void main().finally(closePool).catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Failed to provision auth user.",
  );
  process.exitCode = 1;
});
