import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { getBufferMediaDimensions } from "../media-conversion";
import { headStoredObject, isB2StorageConfigured, uploadStoredObject } from "../b2";
import { resolveCdnStoragePath } from "../paths";

const supportedCollections = ["ad-assets", "advertiser-logos"] as const;
const syncConcurrency = 16;

function getContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    case ".svg":
      return "image/svg+xml";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    default:
      return null;
  }
}

async function* walkDirectory(root: string): AsyncGenerator<string> {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const absolutePath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      yield* walkDirectory(absolutePath);
      continue;
    }

    yield absolutePath;
  }
}

function buildMetadata(collection: (typeof supportedCollections)[number], absolutePath: string, body: Buffer) {
  if (collection !== "ad-assets") {
    return {};
  }

  const contentType = getContentType(absolutePath);

  return getBufferMediaDimensions(body, path.extname(absolutePath).toLowerCase(), contentType).then((dimensions) =>
    dimensions
      ? {
          width: String(dimensions.width),
          height: String(dimensions.height),
          "aspect-ratio": String(dimensions.aspectRatio),
        }
      : {},
  );
}

async function syncCollection(collection: (typeof supportedCollections)[number]) {
  const directory = resolveCdnStoragePath(collection);
  const files: string[] = [];

  for await (const absolutePath of walkDirectory(directory)) {
    files.push(absolutePath);
  }

  let uploaded = 0;
  let skipped = 0;
  let completed = 0;
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(syncConcurrency, files.length) }, async () => {
      while (nextIndex < files.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;

        const absolutePath = files[currentIndex];
        const relativePath = path.relative(directory, absolutePath).replace(/\\/g, "/");
        const pathname = `/${collection}/${relativePath}`;

        if (await headStoredObject(pathname)) {
          skipped += 1;
          completed += 1;
        } else {
          const body = await readFile(absolutePath);
          const contentType = getContentType(absolutePath);

          await uploadStoredObject({
            pathname,
            body,
            contentType,
            metadata: await buildMetadata(collection, absolutePath, body),
          });

          uploaded += 1;
          completed += 1;
        }

        if (completed % 100 === 0 || completed === files.length) {
          console.log(
            `[sync-b2-assets] ${collection}: processed ${completed}/${files.length} (uploaded ${uploaded}, skipped ${skipped})`,
          );
        }
      }
    }),
  );

  return { uploaded, skipped };
}

async function main() {
  if (!isB2StorageConfigured()) {
    throw new Error("B2 is not configured. Set B2_ENDPOINT, B2_BUCKET_NAME, B2_APPLICATION_KEY_ID, and B2_APPLICATION_KEY.");
  }

  for (const collection of supportedCollections) {
    const result = await syncCollection(collection);
    console.log(`[sync-b2-assets] ${collection}: uploaded ${result.uploaded}, skipped ${result.skipped}`);
  }
}

await main();
