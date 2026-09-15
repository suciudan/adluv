import { existsSync } from "node:fs";
import path from "node:path";

import { config as loadDotEnv } from "dotenv";
import mysql from "mysql2/promise";

const workspaceEnvDirByPackageName = new Map([
  ["@adluv/app", "apps/app"],
  ["@adluv/cdn", "apps/cdn"],
  ["@adluv/cms", "apps/cms"],
  ["@adluv/mcp", "apps/mcp"],
  ["@adluv/site", "apps/site"],
  ["@adluv/worker", "apps/worker"],
]);

function findWorkspaceRoot(startDir) {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (
      existsSync(path.join(currentDir, "package.json")) &&
      existsSync(path.join(currentDir, "apps")) &&
      existsSync(path.join(currentDir, "packages"))
    ) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      return path.resolve(startDir, "../..");
    }

    currentDir = parentDir;
  }
}

function normalizeEnvDir(rootDir, envDir) {
  if (!envDir?.trim()) {
    return null;
  }

  return path.isAbsolute(envDir) ? path.resolve(envDir) : path.resolve(rootDir, envDir);
}

function dedupePaths(paths) {
  return [...new Set(paths.map((candidatePath) => path.resolve(candidatePath)))];
}

function getWorkspaceEnvDirectories() {
  const cwd = process.cwd();
  const rootDir = findWorkspaceRoot(cwd);
  const relativeCwd = path.relative(rootDir, cwd);
  const [topLevelDir] = relativeCwd.split(path.sep);

  const explicitEnvDir = normalizeEnvDir(rootDir, process.env.ADLUV_ENV_DIR);
  const packageEnvDir = normalizeEnvDir(
    rootDir,
    workspaceEnvDirByPackageName.get(process.env.npm_package_name?.trim() ?? ""),
  );
  const shouldLoadAllAppDirs = !explicitEnvDir && !packageEnvDir && topLevelDir !== "apps";

  return dedupePaths([
    ...(explicitEnvDir ? [explicitEnvDir] : []),
    ...(packageEnvDir ? [packageEnvDir] : []),
    cwd,
    ...(shouldLoadAllAppDirs ? [...workspaceEnvDirByPackageName.values()].map((envDir) => path.join(rootDir, envDir)) : []),
    rootDir,
  ]);
}

for (const envDir of getWorkspaceEnvDirectories()) {
  loadDotEnv({ path: path.join(envDir, ".env.local"), override: false });
  loadDotEnv({ path: path.join(envDir, ".env"), override: false });
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not configured.");
}

const requiredTables = [
  "user",
  "session",
  "account",
  "verification",
  "subscriptions",
  "entitlements",
  "notification_settings",
  "oauthApplication",
  "oauthAccessToken",
  "oauthConsent",
  "advertisers",
  "advertiser_companies",
  "advertiser_search_aliases",
  "tracked_companies",
  "ads",
  "ad_observations",
  "landing_page_snapshots",
  "alerts",
  "alert_deliveries",
  "jobs",
  "saved_ads",
  "tracker_notifications",
  "swipe_file_collections",
  "swipe_file_collection_items",
  "blog_authors",
  "blog_categories",
  "blog_posts",
];

const requiredColumns = {
  user: ["emailVerified", "username", "displayUsername", "role"],
  session: ["token", "expiresAt"],
  account: ["accountId", "providerId", "password"],
  verification: ["identifier", "value", "expiresAt"],
  advertisers: [
    "industry",
    "company_size",
    "country",
    "summary",
    "logo_url",
    "website_url",
    "normalized_domain",
    "company_id",
  ],
  advertiser_companies: ["normalized_domain", "website_url", "display_name", "logo_url"],
  ads: ["status", "reaction_count", "comment_count"],
  tracked_companies: ["id", "user_id", "advertiser_id", "tracker_status", "last_synced_at"],
  notification_settings: ["digest_frequency", "last_digest_sent_at"],
  oauthApplication: [
    "id",
    "name",
    "clientId",
    "clientSecret",
    "redirectUrls",
    "type",
    "authenticationScheme",
    "disabled",
    "userId",
    "createdAt",
    "updatedAt",
  ],
  oauthAccessToken: [
    "id",
    "accessToken",
    "refreshToken",
    "accessTokenExpiresAt",
    "refreshTokenExpiresAt",
    "clientId",
    "userId",
    "scopes",
    "createdAt",
    "updatedAt",
  ],
  oauthConsent: [
    "id",
    "clientId",
    "userId",
    "scopes",
    "consentGiven",
    "createdAt",
    "updatedAt",
  ],
  alert_deliveries: ["read_at"],
  tracker_notifications: [
    "id",
    "job_id",
    "user_id",
    "tracked_company_id",
    "advertiser_id",
    "tracker_notification_kind",
    "headline",
    "target_url",
    "created_at",
    "updated_at",
  ],
  jobs: ["id", "queue_name", "job_status", "attempts", "started_at", "finished_at"],
  saved_ads: ["id", "user_id", "ad_id", "note", "created_at", "updated_at"],
  swipe_file_collections: ["id", "user_id", "name", "description", "created_at", "updated_at"],
  swipe_file_collection_items: ["id", "collection_id", "saved_ad_id", "created_at"],
  blog_authors: ["id", "slug", "name", "role", "avatar_label", "avatar_image_url", "bio", "created_at", "updated_at"],
  blog_categories: ["id", "slug", "name", "description", "created_at", "updated_at"],
  blog_posts: [
    "id",
    "slug",
    "status",
    "title",
    "excerpt",
    "body_mdx",
    "cover_image_url",
    "seo_title",
    "seo_description",
    "read_time_minutes",
    "author_id",
    "category_id",
    "published_at",
    "created_at",
    "updated_at",
  ],
};

const connection = await mysql.createConnection({
  uri: connectionString,
  timezone: "Z",
});

try {
  const [tableRows] = await connection.query("show tables");
  const existingTables = new Set(tableRows.map((row) => row[Object.keys(row)[0]]));
  const missingTables = requiredTables.filter((tableName) => !existingTables.has(tableName));

  if (missingTables.length > 0) {
    throw new Error(
      `Schema rollout is incomplete. Missing tables: ${missingTables.join(", ")}. Run \`yarn db:migrate\` and then \`yarn db:verify\`.`,
    );
  }

  for (const [tableName, expectedColumns] of Object.entries(requiredColumns)) {
    const [columnRows] = await connection.query(`show columns from \`${tableName}\``);
    const existingColumns = new Set(columnRows.map((row) => row.Field));
    const missingColumns = expectedColumns.filter((columnName) => !existingColumns.has(columnName));

    if (missingColumns.length > 0) {
      throw new Error(
        `Schema rollout is incomplete. Missing columns in ${tableName}: ${missingColumns.join(", ")}. Run \`yarn db:migrate\` and then \`yarn db:verify\`.`,
      );
    }
  }

  console.log(
    `[db:verify] schema looks good. tables=${requiredTables.length} critical_columns=${Object.values(requiredColumns).flat().length}`,
  );
} finally {
  await connection.end();
}
