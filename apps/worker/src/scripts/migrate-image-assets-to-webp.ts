import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { getPool } from "@adluv/db";
import { resolveCdnAssetUrl } from "@adluv/config";
import { type RowDataPacket } from "mysql2/promise";

import { compressVideoBufferToMp4, convertImageBufferToWebp } from "../media-conversion";
import { resolveCdnStoragePath } from "../paths";

const assetDirectory = resolveCdnStoragePath("ad-assets");
const assetIndexPath = path.join(assetDirectory, ".source-url-index.json");
const publicAssetPrefix = "/ad-assets/";

type Args = {
  dryRun: boolean;
};

type AssetMigration = {
  kind: "image" | "video";
  oldFilename: string;
  newFilename: string;
  oldPath: string;
  newPath: string;
  oldUrl: string;
  newUrl: string;
};

type AdRow = RowDataPacket & {
  id: string;
  mediaUrl: string | null;
  metadata: unknown;
};

function logProgress(message: string) {
  console.log(`[migrate:image-assets-to-webp] ${message}`);
}

function parseArgs(argv: string[]): Args {
  return {
    dryRun: argv.includes("--dry-run"),
  };
}

function isConvertibleImageFilename(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  return extension === ".jpg" || extension === ".jpeg" || extension === ".png" || extension === ".gif" || extension === ".avif";
}

function isConvertibleVideoFilename(filename: string) {
  const extension = path.extname(filename).toLowerCase();
  return extension === ".mp4" || extension === ".mov" || extension === ".webm";
}

function buildStoredFilename(buffer: Buffer, extension: string) {
  return `${createHash("sha1").update(buffer).digest("hex")}${extension}`;
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeFileAtomic(filePath: string, buffer: Buffer) {
  await mkdir(path.dirname(filePath), { recursive: true });

  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tempPath, buffer);

  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);

    if (!(await fileExists(filePath))) {
      throw error;
    }
  }
}

async function loadAssetIndex() {
  try {
    const content = await readFile(assetIndexPath, "utf8");
    const parsed = JSON.parse(content);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {} as Record<string, string>;
    }

    return parsed as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
}

async function saveAssetIndex(index: Record<string, string>) {
  await writeFileAtomic(assetIndexPath, Buffer.from(JSON.stringify(index, null, 2)));
}

function buildPublicAssetUrl(filename: string) {
  const pathname = `${publicAssetPrefix}${filename}`;
  return resolveCdnAssetUrl(pathname) ?? pathname;
}

function parseMetadata(value: unknown) {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }

  return {};
}

function replaceMappedValue(value: unknown, replacements: Map<string, string>) {
  if (typeof value !== "string") {
    return { changed: false, value };
  }

  const nextValue = replacements.get(value);

  if (!nextValue || nextValue === value) {
    return { changed: false, value };
  }

  return {
    changed: true,
    value: nextValue,
  };
}

async function collectConvertibleFilenames(predicate: (filename: string) => boolean, index: Record<string, string>) {
  await mkdir(assetDirectory, { recursive: true });
  const filenames = new Set<string>();

  for (const filename of Object.values(index)) {
    if (predicate(filename)) {
      filenames.add(filename);
    }
  }

  for (const filename of await readdir(assetDirectory)) {
    if (predicate(filename)) {
      filenames.add(filename);
    }
  }

  return filenames;
}

async function migrateStoredImages(index: Record<string, string>, dryRun: boolean) {
  const filenames = await collectConvertibleFilenames(isConvertibleImageFilename, index);
  logProgress(`found ${filenames.size} convertible stored image assets`);

  const migrations = new Map<string, AssetMigration>();
  let processed = 0;

  for (const filename of filenames) {
    const absolutePath = path.join(assetDirectory, filename);

    if (!(await fileExists(absolutePath))) {
      continue;
    }

    const originalBuffer = await readFile(absolutePath);
    const convertedBuffer = await convertImageBufferToWebp(originalBuffer, path.extname(filename).toLowerCase());

    if (!convertedBuffer.length) {
      throw new Error(`Converted image buffer for ${filename} is empty.`);
    }

    const newFilename = buildStoredFilename(convertedBuffer, ".webp");
    const newPath = path.join(assetDirectory, newFilename);

    migrations.set(filename, {
      kind: "image",
      oldFilename: filename,
      newFilename,
      oldPath: absolutePath,
      newPath,
      oldUrl: buildPublicAssetUrl(filename),
      newUrl: buildPublicAssetUrl(newFilename),
    });

    for (const [sourceUrlKey, indexedFilename] of Object.entries(index)) {
      if (indexedFilename === filename) {
        index[sourceUrlKey] = newFilename;
      }
    }

    if (!dryRun) {
      if (!(await fileExists(newPath))) {
        await writeFileAtomic(newPath, convertedBuffer);
      }

      if (newFilename !== filename) {
        await unlink(absolutePath).catch(() => undefined);
      }
    }

    processed += 1;
    if (processed % 50 === 0 || processed === filenames.size) {
      logProgress(`${dryRun ? "scanned" : "converted"} ${processed}/${filenames.size} stored images`);
    }
  }

  return migrations;
}

async function migrateStoredVideos(index: Record<string, string>, dryRun: boolean) {
  const filenames = await collectConvertibleFilenames(isConvertibleVideoFilename, index);
  logProgress(`found ${filenames.size} convertible stored video assets`);
  logProgress("starting video compression phase");

  const migrations = new Map<string, AssetMigration>();
  let processed = 0;

  for (const filename of filenames) {
    const absolutePath = path.join(assetDirectory, filename);

    if (!(await fileExists(absolutePath))) {
      continue;
    }

    const originalBuffer = await readFile(absolutePath);
    const convertedBuffer = await compressVideoBufferToMp4(originalBuffer, path.extname(filename).toLowerCase());

    if (!convertedBuffer.length) {
      throw new Error(`Compressed video buffer for ${filename} is empty.`);
    }

    const newFilename = buildStoredFilename(convertedBuffer, ".mp4");
    const newPath = path.join(assetDirectory, newFilename);

    migrations.set(filename, {
      kind: "video",
      oldFilename: filename,
      newFilename,
      oldPath: absolutePath,
      newPath,
      oldUrl: buildPublicAssetUrl(filename),
      newUrl: buildPublicAssetUrl(newFilename),
    });

    for (const [sourceUrlKey, indexedFilename] of Object.entries(index)) {
      if (indexedFilename === filename) {
        index[sourceUrlKey] = newFilename;
      }
    }

    if (!dryRun) {
      if (!(await fileExists(newPath))) {
        await writeFileAtomic(newPath, convertedBuffer);
      }

      if (newFilename !== filename) {
        await unlink(absolutePath).catch(() => undefined);
      }
    }

    processed += 1;
    if (processed === 1) {
      logProgress(`processing first video asset (${filename})`);
    }

    if (processed % 5 === 0 || processed === filenames.size) {
      logProgress(`${dryRun ? "scanned" : "converted"} ${processed}/${filenames.size} stored videos`);
    }
  }

  return migrations;
}

async function updateAdReferences(
  imageMigrations: Map<string, AssetMigration>,
  videoMigrations: Map<string, AssetMigration>,
  dryRun: boolean,
) {
  const pool = getPool();
  const imageUrlReplacements = new Map<string, string>();
  const imagePathReplacements = new Map<string, string>();
  const videoUrlReplacements = new Map<string, string>();
  const videoPathReplacements = new Map<string, string>();
  const allUrlReplacements = new Map<string, string>();

  for (const migration of imageMigrations.values()) {
    imageUrlReplacements.set(migration.oldUrl, migration.newUrl);
    imagePathReplacements.set(migration.oldPath, migration.newPath);
    allUrlReplacements.set(migration.oldUrl, migration.newUrl);
  }

  for (const migration of videoMigrations.values()) {
    videoUrlReplacements.set(migration.oldUrl, migration.newUrl);
    videoPathReplacements.set(migration.oldPath, migration.newPath);
    allUrlReplacements.set(migration.oldUrl, migration.newUrl);
  }

  const [rows] = await pool.query<AdRow[]>(
    "select id, media_url as mediaUrl, metadata from ads where media_url like ? or metadata is not null",
    [`${publicAssetPrefix}%`],
  );

  logProgress(`loaded ${rows.length} ad rows to inspect for URL/path rewrites`);

  let updatedRows = 0;
  let scannedRows = 0;

  for (const row of rows) {
    let changed = false;
    const mediaUrlResult = replaceMappedValue(row.mediaUrl, allUrlReplacements);
    const metadata = parseMetadata(row.metadata);
    const mediaUrl = mediaUrlResult.value as string | null;

    changed ||= mediaUrlResult.changed;

    const assetStoredUrlImageResult = replaceMappedValue(metadata.assetStoredUrl, imageUrlReplacements);
    if (assetStoredUrlImageResult.changed) {
      metadata.assetStoredUrl = assetStoredUrlImageResult.value;
      metadata.assetContentType = "image/webp";
      changed = true;
    }

    const assetStoredPathImageResult = replaceMappedValue(metadata.assetStoredPath, imagePathReplacements);
    if (assetStoredPathImageResult.changed) {
      metadata.assetStoredPath = assetStoredPathImageResult.value;
      metadata.assetContentType = "image/webp";
      changed = true;
    }

    const assetThumbnailStoredUrlResult = replaceMappedValue(metadata.assetThumbnailStoredUrl, imageUrlReplacements);
    if (assetThumbnailStoredUrlResult.changed) {
      metadata.assetThumbnailStoredUrl = assetThumbnailStoredUrlResult.value;
      metadata.assetThumbnailContentType = "image/webp";
      changed = true;
    }

    const assetThumbnailStoredPathResult = replaceMappedValue(metadata.assetThumbnailStoredPath, imagePathReplacements);
    if (assetThumbnailStoredPathResult.changed) {
      metadata.assetThumbnailStoredPath = assetThumbnailStoredPathResult.value;
      metadata.assetThumbnailContentType = "image/webp";
      changed = true;
    }

    const assetStoredUrlVideoResult = replaceMappedValue(metadata.assetStoredUrl, videoUrlReplacements);
    if (assetStoredUrlVideoResult.changed) {
      metadata.assetStoredUrl = assetStoredUrlVideoResult.value;
      metadata.assetContentType = "video/mp4";
      changed = true;
    }

    const assetStoredPathVideoResult = replaceMappedValue(metadata.assetStoredPath, videoPathReplacements);
    if (assetStoredPathVideoResult.changed) {
      metadata.assetStoredPath = assetStoredPathVideoResult.value;
      metadata.assetContentType = "video/mp4";
      changed = true;
    }

    const assetVideoStoredUrlResult = replaceMappedValue(metadata.assetVideoStoredUrl, videoUrlReplacements);
    if (assetVideoStoredUrlResult.changed) {
      metadata.assetVideoStoredUrl = assetVideoStoredUrlResult.value;
      metadata.assetVideoContentType = "video/mp4";
      changed = true;
    }

    const assetVideoStoredPathResult = replaceMappedValue(metadata.assetVideoStoredPath, videoPathReplacements);
    if (assetVideoStoredPathResult.changed) {
      metadata.assetVideoStoredPath = assetVideoStoredPathResult.value;
      metadata.assetVideoContentType = "video/mp4";
      changed = true;
    }

    scannedRows += 1;

    if (!changed) {
      if (scannedRows % 250 === 0 || scannedRows === rows.length) {
        logProgress(`scanned ${scannedRows}/${rows.length} ad rows, updated ${updatedRows}`);
      }
      continue;
    }

    updatedRows += 1;

    if (!dryRun) {
      const nextMetadataValue =
        row.metadata == null && Object.keys(metadata).length === 0 ? null : JSON.stringify(metadata);

      await pool.query(
        "update ads set media_url = ?, metadata = ?, updated_at = ? where id = ?",
        [mediaUrl, nextMetadataValue, new Date(), row.id],
      );
    }

    if (scannedRows % 250 === 0 || scannedRows === rows.length) {
      logProgress(`scanned ${scannedRows}/${rows.length} ad rows, updated ${updatedRows}`);
    }
  }

  return updatedRows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  logProgress(`starting migration${args.dryRun ? " (dry run)" : ""}`);
  const assetIndex = await loadAssetIndex();
  logProgress(`loaded ${Object.keys(assetIndex).length} source-url index entries`);

  const imageMigrations = await migrateStoredImages(assetIndex, args.dryRun);
  const videoMigrations = await migrateStoredVideos(assetIndex, args.dryRun);

  logProgress(
    `prepared ${imageMigrations.size} image migrations and ${videoMigrations.size} video migrations`,
  );

  const updatedRows = await updateAdReferences(imageMigrations, videoMigrations, args.dryRun);

  if (!args.dryRun) {
    await saveAssetIndex(assetIndex);
    logProgress("saved updated source-url index");
  }

  console.log(
    JSON.stringify(
      {
        convertedImages: imageMigrations.size,
        convertedVideos: videoMigrations.size,
        dryRun: args.dryRun,
        updatedAds: updatedRows,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    const pool = getPool();
    await pool.end();
  });
