import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
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

const journalPath = path.join(process.cwd(), "drizzle/meta/_journal.json");
const migrationTableName = "__adluv_migrations";

const journal = JSON.parse(await readFile(journalPath, "utf8"));
const entries = Array.isArray(journal.entries) ? journal.entries : [];

function splitStatements(sql) {
  return sql
    .split(/--> statement-breakpoint[\t ]*(?:\r?\n|$)/g)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function normalizeIdentifier(value) {
  return String(value ?? "").trim().toLowerCase();
}

function parseEnumValues(enumDefinition) {
  const matches = [...enumDefinition.matchAll(/'((?:\\'|[^'])*)'/g)];
  return matches.map((match) => match[1].replace(/\\'/g, "'"));
}

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = ?
      LIMIT 1
    `,
    [tableName],
  );

  return rows.length > 0;
}

async function columnExists(connection, tableName, columnName) {
  return (await columnDefinition(connection, tableName, columnName)) !== null;
}

async function columnDefinition(connection, tableName, columnName) {
  const [rows] = await connection.query(
    `
      SELECT column_type
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND column_name = ?
      LIMIT 1
    `,
    [tableName, columnName],
  );

  return rows[0] ?? null;
}

async function oneOfTablesExists(connection, tableNames) {
  for (const tableName of tableNames) {
    if (await tableExists(connection, tableName)) {
      return true;
    }
  }

  return false;
}

async function oneOfColumnsExists(connection, tableNames, columnName) {
  for (const tableName of tableNames) {
    if (await columnExists(connection, tableName, columnName)) {
      return true;
    }
  }

  return false;
}

async function indexExists(connection, tableName, indexName) {
  const [rows] = await connection.query(
    `
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
      LIMIT 1
    `,
    [tableName, indexName],
  );

  return rows.length > 0;
}

async function foreignKeyExists(connection, tableName, constraintName) {
  const [rows] = await connection.query(
    `
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND constraint_name = ?
        AND constraint_type = 'FOREIGN KEY'
      LIMIT 1
    `,
    [tableName, constraintName],
  );

  return rows.length > 0;
}

async function enumColumnIncludesValues(connection, tableName, columnName, values) {
  const column = await columnDefinition(connection, tableName, columnName);

  if (!column) {
    return false;
  }

  const actualType = normalizeIdentifier(column.column_type);
  const requiredValues = values.map(normalizeIdentifier);

  if (!actualType.startsWith("enum(")) {
    return false;
  }

  return requiredValues.every((value) => actualType.includes(`'${value}'`));
}

async function isKnownMigrationBaselineSatisfied(connection, tag) {
  switch (tag) {
    case "0000_uneven_sprite":
      return (
        (await oneOfTablesExists(connection, ["account", "accounts"])) &&
        (await oneOfTablesExists(connection, ["user", "users"])) &&
        (await oneOfTablesExists(connection, ["session", "sessions"])) &&
        (await tableExists(connection, "ads")) &&
        (await tableExists(connection, "advertisers")) &&
        (await tableExists(connection, "ad_observations")) &&
        (await tableExists(connection, "alert_deliveries")) &&
        (await tableExists(connection, "alerts")) &&
        (await tableExists(connection, "entitlements")) &&
        (await tableExists(connection, "jobs")) &&
        (await tableExists(connection, "landing_page_snapshots")) &&
        (await tableExists(connection, "subscriptions")) &&
        (await tableExists(connection, "tracked_companies"))
      );
    case "0001_misty_colleen_wing":
      return (
        (await oneOfColumnsExists(connection, ["user", "users"], "username")) &&
        ((await oneOfColumnsExists(connection, ["account"], "password")) ||
          (await oneOfColumnsExists(connection, ["users"], "password_hash")))
      );
    case "0002_outgoing_cerebro":
      return tableExists(connection, "notification_settings");
    case "0003_sturdy_ad_intel":
      return (
        (await columnExists(connection, "advertisers", "industry")) &&
        (await columnExists(connection, "advertisers", "company_size")) &&
        (await columnExists(connection, "advertisers", "country")) &&
        (await columnExists(connection, "advertisers", "summary")) &&
        (await columnExists(connection, "ads", "status")) &&
        (await columnExists(connection, "ads", "reaction_count")) &&
        (await columnExists(connection, "ads", "comment_count"))
      );
    case "0004_bright_mimic":
      return tableExists(connection, "saved_ads");
    case "0005_swipe_file_collections":
      return (
        (await columnExists(connection, "saved_ads", "note")) &&
        (await tableExists(connection, "swipe_file_collections")) &&
        (await tableExists(connection, "swipe_file_collection_items"))
      );
    case "0006_notification_inbox_and_digest":
      return (
        (await columnExists(connection, "notification_settings", "digest_frequency")) &&
        (await columnExists(connection, "alert_deliveries", "read_at"))
      );
    case "0007_notification_digest_cursor":
      return columnExists(connection, "notification_settings", "last_digest_sent_at");
    case "0008_advertiser_logo":
      return columnExists(connection, "advertisers", "logo_url");
    case "0009_tracker_notifications":
      return tableExists(connection, "tracker_notifications");
    case "0010_google_source":
      return (
        (await enumColumnIncludesValues(connection, "advertisers", "source", ["google"])) &&
        (await enumColumnIncludesValues(connection, "ads", "source", ["google"]))
      );
    case "0011_advertiser_search_aliases":
      return tableExists(connection, "advertiser_search_aliases");
    case "0012_blog_media_manager":
      return columnExists(connection, "blog_authors", "avatar_image_url");
    case "0014_mcp_api_keys":
      return tableExists(connection, "mcp_api_keys");
    case "0015_mcp_oauth":
      return (
        (await tableExists(connection, "oauthApplication")) &&
        (await tableExists(connection, "oauthAccessToken")) &&
        (await tableExists(connection, "oauthConsent"))
      );
    case "0016_remove_mcp_api_keys":
      return !(await tableExists(connection, "mcp_api_keys"));
    case "0019_advertiser_companies":
      return (
        (await tableExists(connection, "advertiser_companies")) &&
        (await columnExists(connection, "advertisers", "website_url")) &&
        (await columnExists(connection, "advertisers", "normalized_domain")) &&
        (await columnExists(connection, "advertisers", "company_id"))
      );
    default:
      return false;
  }
}

async function isStatementAlreadySatisfied(connection, statement) {
  const createTableMatch = statement.match(/^CREATE TABLE\s+`([^`]+)`/i);

  if (createTableMatch) {
    return tableExists(connection, createTableMatch[1]);
  }

  const addColumnMatch = statement.match(
    /^ALTER TABLE\s+`([^`]+)`\s+ADD(?:\s+COLUMN)?\s+`([^`]+)`/i,
  );

  if (addColumnMatch) {
    const [, tableName, columnName] = addColumnMatch;
    return (await columnDefinition(connection, tableName, columnName)) !== null;
  }

  const addUniqueConstraintMatch = statement.match(
    /^ALTER TABLE\s+`([^`]+)`\s+ADD\s+CONSTRAINT\s+`([^`]+)`\s+UNIQUE/i,
  );

  if (addUniqueConstraintMatch) {
    const [, tableName, constraintName] = addUniqueConstraintMatch;
    return indexExists(connection, tableName, constraintName);
  }

  const addForeignKeyConstraintMatch = statement.match(
    /^ALTER TABLE\s+`([^`]+)`\s+ADD\s+CONSTRAINT\s+`([^`]+)`\s+FOREIGN KEY/i,
  );

  if (addForeignKeyConstraintMatch) {
    const [, tableName, constraintName] = addForeignKeyConstraintMatch;
    return foreignKeyExists(connection, tableName, constraintName);
  }

  const modifyEnumMatch = statement.match(
    /^ALTER TABLE\s+`([^`]+)`\s+MODIFY COLUMN\s+`([^`]+)`\s+(enum\(.+\))/i,
  );

  if (modifyEnumMatch) {
    const [, tableName, columnName, enumDefinition] = modifyEnumMatch;
    const column = await columnDefinition(connection, tableName, columnName);

    if (!column) {
      return false;
    }

    const actualType = normalizeIdentifier(column.column_type);
    const requiredValues = parseEnumValues(enumDefinition).map(normalizeIdentifier);

    if (!actualType.startsWith("enum(")) {
      return false;
    }

    return requiredValues.every((value) => actualType.includes(`'${value}'`));
  }

  return false;
}

async function isMigrationAlreadySatisfied(connection, statements) {
  if (statements.length === 0) {
    return true;
  }

  for (const statement of statements) {
    if (!(await isStatementAlreadySatisfied(connection, statement))) {
      return false;
    }
  }

  return true;
}

async function markMigrationApplied(connection, tag) {
  await connection.query(
    `INSERT INTO \`${migrationTableName}\` (\`tag\`, \`applied_at\`) VALUES (?, ?)`,
    [tag, new Date()],
  );
}

const connection = await mysql.createConnection({
  uri: connectionString,
  timezone: "Z",
  multipleStatements: true,
});

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS \`${migrationTableName}\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`tag\` varchar(255) NOT NULL,
      \`applied_at\` datetime(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`${migrationTableName}_tag_unique\` (\`tag\`)
    )
  `);

  const [appliedRows] = await connection.query(
    `SELECT \`tag\` FROM \`${migrationTableName}\` ORDER BY \`id\` ASC`,
  );
  const appliedTags = new Set(appliedRows.map((row) => row.tag));

  let appliedCount = 0;

  for (const entry of entries) {
    if (!entry?.tag || appliedTags.has(entry.tag)) {
      continue;
    }

    const filePath = path.join(process.cwd(), "drizzle", `${entry.tag}.sql`);
    const sql = await readFile(filePath, "utf8");
    const statements = splitStatements(sql);

    if (
      (await isKnownMigrationBaselineSatisfied(connection, entry.tag)) ||
      (await isMigrationAlreadySatisfied(connection, statements))
    ) {
      console.log(`[db:migrate] baselining ${entry.tag}`);
      await markMigrationApplied(connection, entry.tag);
      appliedTags.add(entry.tag);
      appliedCount += 1;
      continue;
    }

    console.log(`[db:migrate] applying ${entry.tag}`);

    await connection.beginTransaction();

    try {
      for (const statement of statements) {
        await connection.query(statement);
      }

      await markMigrationApplied(connection, entry.tag);

      await connection.commit();
      appliedTags.add(entry.tag);
      appliedCount += 1;
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }

  if (appliedCount === 0) {
    console.log("[db:migrate] no pending migrations.");
  } else {
    console.log(`[db:migrate] applied ${appliedCount} migration(s).`);
  }
} finally {
  await connection.end();
}
