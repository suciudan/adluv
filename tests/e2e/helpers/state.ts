import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { hashPassword } from "better-auth/crypto";
import { config as loadDotEnv } from "dotenv";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";

type SourceName = "linkedin" | "facebook" | "google" | "tiktok";

const repoRoot = path.resolve(__dirname, "../../..");
const pidFile = path.join(repoRoot, ".tmp", "e2e-worker.pid");
const e2eAuthAccount = {
  username: "e2e-member",
  password: "adluv-e2e-password",
  email: "e2e-member@adluv.local",
  name: "E2E Member",
} as const;
const tablesToClear = [
  "swipe_file_collection_items",
  "swipe_file_collections",
  "tracker_notifications",
  "saved_ads",
  "alert_deliveries",
  "alerts",
  "landing_page_snapshots",
  "ad_observations",
  "ads",
  "jobs",
  "tracked_companies",
  "advertiser_search_aliases",
  "advertisers",
  "notification_settings",
  "entitlements",
  "subscriptions",
  "invitation",
  "member",
  "organization",
  "session",
  "account",
  "verification",
  "user",
];
const safeE2eDatabaseNamePattern = /(^|[_-])(e2e|test)([_-]|$)/i;

let envLoaded = false;

function loadEnv() {
  if (envLoaded) {
    return;
  }

  loadDotEnv({ path: path.join(repoRoot, ".env.local"), override: false });
  loadDotEnv({ path: path.join(repoRoot, ".env"), override: false });
  envLoaded = true;
}

export function getE2eDatabaseUrl() {
  loadEnv();

  const value = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!value) {
    throw new Error("E2E_DATABASE_URL or DATABASE_URL is required for e2e tests.");
  }

  return value;
}

function getDatabaseName(connectionString: string) {
  try {
    const url = new URL(connectionString);
    return decodeURIComponent(url.pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

function assertSafeE2eDatabase() {
  const databaseUrl = getE2eDatabaseUrl();
  const databaseName = getDatabaseName(databaseUrl);

  if (safeE2eDatabaseNamePattern.test(databaseName)) {
    return;
  }

  throw new Error(
    [
      `Refusing to reset e2e state because DATABASE_URL points at "${databaseName || "unknown"}".`,
      "E2E tests truncate application tables.",
      'Set E2E_DATABASE_URL or DATABASE_URL to a dedicated database with "e2e" or "test" in its name, for example mysql://user:pass@127.0.0.1:3306/adluv_e2e.',
    ].join(" "),
  );
}

export function getRepoRoot() {
  return repoRoot;
}

export function getWorkerPidFile() {
  return pidFile;
}

export function getE2eAuthAccount() {
  return e2eAuthAccount;
}

async function withDatabase<T>(fn: (client: Pool) => Promise<T>) {
  const client = createPool({
    uri: getE2eDatabaseUrl(),
    timezone: "Z",
    connectionLimit: 2,
  });

  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function seedAuthUser(
  client: Pool,
  account: {
    username: string;
    password: string;
    email: string;
    name: string;
  },
  role: "member" | "admin" | "owner",
) {
  const now = new Date();
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const passwordHash = await hashPassword(account.password);

  await client.query(
    `insert into \`user\`
      (\`id\`, \`name\`, \`email\`, \`emailVerified\`, \`image\`, \`username\`, \`displayUsername\`, \`role\`, \`createdAt\`, \`updatedAt\`)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      account.name,
      account.email,
      1,
      null,
      account.username,
      account.username,
      role,
      now,
      now,
    ],
  );

  await client.query(
    `insert into \`account\`
      (\`id\`, \`userId\`, \`accountId\`, \`providerId\`, \`accessToken\`, \`refreshToken\`, \`accessTokenExpiresAt\`, \`refreshTokenExpiresAt\`, \`scope\`, \`idToken\`, \`password\`, \`createdAt\`, \`updatedAt\`)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      userId,
      userId,
      "credential",
      null,
      null,
      null,
      null,
      null,
      null,
      passwordHash,
      now,
      now,
    ],
  );

  await client.query(
    `insert into \`entitlements\`
      (\`id\`, \`user_id\`, \`tracked_company_limit\`, \`alerts_enabled\`, \`sync_enabled\`, \`created_at\`, \`updated_at\`)
    values (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), userId, 10, 1, 1, now, now],
  );

  await client.query(
    `insert into \`notification_settings\`
      (\`id\`, \`user_id\`, \`alerts_enabled\`, \`email_enabled\`, \`in_app_enabled\`, \`digest_frequency\`, \`last_digest_sent_at\`, \`created_at\`, \`updated_at\`)
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), userId, 1, 1, 1, "instant", null, now, now],
  );

  await client.query(
    `insert into \`organization\`
      (\`id\`, \`name\`, \`slug\`, \`logo\`, \`metadata\`, \`owner_user_id\`, \`createdAt\`, \`updatedAt\`)
    values (?, ?, ?, ?, ?, ?, ?, ?)`,
    [workspaceId, account.name, account.username, null, null, userId, now, now],
  );

  await client.query(
    `insert into \`member\`
      (\`id\`, \`organizationId\`, \`userId\`, \`role\`, \`createdAt\`)
    values (?, ?, ?, ?, ?)`,
    [randomUUID(), workspaceId, userId, "owner", now],
  );
}

export async function resetE2eState() {
  assertSafeE2eDatabase();

  await withDatabase(async (client) => {
    await client.query("SET FOREIGN_KEY_CHECKS = 0");

    try {
      for (const table of tablesToClear) {
        await client.query(`TRUNCATE TABLE \`${table}\``);
      }
    } finally {
      await client.query("SET FOREIGN_KEY_CHECKS = 1");
    }

    await seedAuthUser(client, e2eAuthAccount, "member");
  });
}

export async function readTrackedCompanySnapshot(sourceAdvertiserId: string, source?: SourceName) {
  return withDatabase(async (client) => {
    type TrackedCompanySnapshotRow = RowDataPacket & {
      id: string;
      advertiserId: string;
      status: string;
      lastSyncedAt: Date | null;
      adsCount: number;
      canonicalName: string;
    };

    const query = `
      select
        tc.id,
        adv.id as advertiserId,
        tc.tracker_status as status,
        tc.last_synced_at as lastSyncedAt,
        cast(count(a.id) as unsigned) as adsCount,
        adv.canonical_name as canonicalName
      from tracked_companies tc
      inner join advertisers adv on adv.id = tc.advertiser_id
      left join ads a on a.advertiser_id = adv.id
      where adv.source_advertiser_id = ?
      ${source ? "and adv.source = ?" : ""}
      group by tc.id, adv.id, tc.tracker_status, tc.last_synced_at, adv.canonical_name
      limit 1
    `;
    const params = source ? [sourceAdvertiserId, source] : [sourceAdvertiserId];
    const [rows] = await client.query<TrackedCompanySnapshotRow[]>(query, params);

    return rows[0]
      ? {
          id: rows[0].id,
          advertiserId: rows[0].advertiserId,
          status: rows[0].status,
          lastSyncedAt: rows[0].lastSyncedAt,
          adsCount: rows[0].adsCount,
          canonicalName: rows[0].canonicalName,
        }
      : null;
  });
}

export async function readTrackedCompanySnapshots() {
  return withDatabase(async (client) => {
    type TrackedCompanySnapshotRow = RowDataPacket & {
      id: string;
      status: string;
      lastSyncedAt: Date | null;
      adsCount: number;
      source: SourceName;
      sourceAdvertiserId: string;
      canonicalName: string;
    };

    const [rows] = await client.query<TrackedCompanySnapshotRow[]>(`
      select
        tc.id,
        tc.tracker_status as status,
        tc.last_synced_at as lastSyncedAt,
        cast(count(a.id) as unsigned) as adsCount,
        adv.source,
        adv.source_advertiser_id as sourceAdvertiserId,
        adv.canonical_name as canonicalName
      from tracked_companies tc
      inner join advertisers adv on adv.id = tc.advertiser_id
      left join ads a on a.advertiser_id = adv.id
      group by
        tc.id,
        tc.tracker_status,
        tc.last_synced_at,
        adv.source,
        adv.source_advertiser_id,
        adv.canonical_name
      order by adv.source, adv.canonical_name
    `);

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      lastSyncedAt: row.lastSyncedAt,
      adsCount: row.adsCount,
      source: row.source,
      sourceAdvertiserId: row.sourceAdvertiserId,
      canonicalName: row.canonicalName,
    }));
  });
}

export async function readAlertSnapshot(sourceAdvertiserId: string, source?: SourceName) {
  return withDatabase(async (client) => {
    type AlertSnapshotRow = RowDataPacket & {
      id: string;
      headline: string;
      channels: string | null;
    };

    const query = `
      select
        al.id,
        al.headline,
        group_concat(distinct adl.alert_channel order by adl.alert_channel separator ',') as channels
      from alerts al
      inner join tracked_companies tc on tc.id = al.tracked_company_id
      inner join advertisers adv on adv.id = tc.advertiser_id
      left join alert_deliveries adl on adl.alert_id = al.id
      where adv.source_advertiser_id = ?
      ${source ? "and adv.source = ?" : ""}
      group by al.id, al.headline
      order by al.created_at desc
      limit 1
    `;
    const params = source ? [sourceAdvertiserId, source] : [sourceAdvertiserId];
    const [rows] = await client.query<AlertSnapshotRow[]>(query, params);

    return rows[0]
      ? {
          id: rows[0].id,
          headline: rows[0].headline,
          channels: rows[0].channels ? rows[0].channels.split(",") : [],
        }
      : null;
  });
}

export async function ensureTmpDir() {
  await fs.mkdir(path.join(repoRoot, ".tmp"), { recursive: true });
}
