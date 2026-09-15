import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveCdnAssetUrl } from "@adluv/config";

export type MediaCollection = "blog-media" | "author-avatars";

export type MediaAsset = {
  pathname: string;
  url: string;
  fileName: string;
  size: number;
  uploadedAt: string;
  contentType: string | null;
  collection: MediaCollection;
};

const COLLECTIONS: Record<MediaCollection, { directory: string; acceptPrefix: string }> = {
  "blog-media": { directory: "blog-media", acceptPrefix: "image/" },
  "author-avatars": { directory: "author-avatars", acceptPrefix: "image/" },
};

const CONTENT_TYPES = new Map<string, string>([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function getStorageRoot() {
  const configuredRoot = process.env.CDN_STORAGE_ROOT?.trim();

  if (configuredRoot) {
    return path.resolve(configuredRoot);
  }

  const candidates = [
    path.resolve(process.cwd(), "apps/cdn/storage"),
    path.resolve(process.cwd(), "../cdn/storage"),
  ];

  const existingCandidate = candidates.find((candidate) => existsSync(candidate));
  return existingCandidate ?? candidates[0];
}

function getCollectionConfig(collection: MediaCollection) {
  const config = COLLECTIONS[collection];

  if (!config) {
    throw new Error("Unsupported media collection.");
  }

  return config;
}

function getCollectionDirectory(collection: MediaCollection) {
  return path.join(getStorageRoot(), getCollectionConfig(collection).directory);
}

function toPublicPath(collection: MediaCollection, fileName: string) {
  return `/${getCollectionConfig(collection).directory}/${fileName}`;
}

function toAbsoluteAssetPath(collection: MediaCollection, pathname: string) {
  const directory = getCollectionDirectory(collection);
  const collectionPrefix = `/${getCollectionConfig(collection).directory}/`;

  if (!pathname.startsWith(collectionPrefix)) {
    throw new Error("Invalid media asset path.");
  }

  const relativePath = pathname.slice(collectionPrefix.length);

  if (!relativePath || relativePath.includes("\0")) {
    throw new Error("Invalid media asset path.");
  }

  const absolutePath = path.resolve(directory, relativePath);
  const relativeToCollection = path.relative(directory, absolutePath);

  if (
    !relativeToCollection ||
    relativeToCollection.startsWith("..") ||
    path.isAbsolute(relativeToCollection)
  ) {
    throw new Error("Invalid media asset path.");
  }

  return absolutePath;
}

function toPublicUrl(pathname: string) {
  return resolveCdnAssetUrl(pathname) ?? pathname;
}

function inferExtension(fileName: string, contentType: string) {
  const lowerFileName = fileName.toLowerCase();
  const fileExtension = path.extname(lowerFileName);

  if (fileExtension) {
    return fileExtension;
  }

  const fromContentType = [
    ["image/avif", ".avif"],
    ["image/gif", ".gif"],
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/svg+xml", ".svg"],
    ["image/webp", ".webp"],
  ].find(([type]) => type === contentType)?.[1];

  return fromContentType ?? "";
}

function getContentType(fileName: string) {
  return CONTENT_TYPES.get(path.extname(fileName).toLowerCase()) ?? null;
}

async function listFilesRecursive(directory: string) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(absolutePath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

export async function ensureMediaCollection(collection: MediaCollection) {
  await mkdir(getCollectionDirectory(collection), { recursive: true });
}

export async function listMediaAssets(collection: MediaCollection): Promise<MediaAsset[]> {
  const directory = getCollectionDirectory(collection);
  await ensureMediaCollection(collection);

  const absoluteFiles = await listFilesRecursive(directory);
  const assets = await Promise.all(
    absoluteFiles.map(async (absolutePath) => {
      const fileStat = await stat(absolutePath);
      const relativePath = path.relative(directory, absolutePath).split(path.sep).join("/");
      const pathname = toPublicPath(collection, relativePath);

      return {
        pathname,
        url: toPublicUrl(pathname),
        fileName: path.basename(absolutePath),
        size: fileStat.size,
        uploadedAt: fileStat.mtime.toISOString(),
        contentType: getContentType(absolutePath),
        collection,
      } satisfies MediaAsset;
    }),
  );

  return assets.sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt));
}

export async function saveMediaFile(input: {
  collection: MediaCollection;
  fileName: string;
  contentType: string;
  bytes: Uint8Array<ArrayBuffer>;
}) {
  const config = getCollectionConfig(input.collection);

  if (!input.contentType.startsWith(config.acceptPrefix)) {
    throw new Error("Unsupported file type.");
  }

  await ensureMediaCollection(input.collection);

  const extension = inferExtension(input.fileName, input.contentType);
  const digest = createHash("sha1").update(input.bytes).digest("hex");
  const finalFileName = `${digest}-${randomUUID().slice(0, 8)}${extension}`;
  const absolutePath = path.join(getCollectionDirectory(input.collection), finalFileName);

  await writeFile(absolutePath, input.bytes);

  const fileStat = await stat(absolutePath);
  const pathname = toPublicPath(input.collection, finalFileName);

  return {
    pathname,
    url: toPublicUrl(pathname),
    fileName: finalFileName,
    size: fileStat.size,
    uploadedAt: fileStat.mtime.toISOString(),
    contentType: input.contentType,
    collection: input.collection,
  } satisfies MediaAsset;
}

export async function deleteMediaAsset(input: {
  collection: MediaCollection;
  pathname: string;
}) {
  const absolutePath = toAbsoluteAssetPath(input.collection, input.pathname);
  await rm(absolutePath, { force: false });
}
