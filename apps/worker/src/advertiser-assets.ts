import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { getCdnAssetPathname, resolveCdnAssetUrl } from "@adluv/config";
import { type AdvertiserMatch } from "@adluv/source-adapters";

import { headStoredObject, isB2StorageConfigured, uploadStoredObject } from "./b2";
import { resolveCdnStoragePath } from "./paths";

const logoDirectory = resolveCdnStoragePath("advertiser-logos");
const publicLogoPrefix = "/advertiser-logos/";
const logoUserAgent = "Mozilla/5.0";
const logoFetchTimeoutMs = 20_000;
const maxLogoBytes = 8 * 1024 * 1024;

function buildPublicLogoUrl(pathname: string) {
  return resolveCdnAssetUrl(pathname) ?? pathname;
}

function buildAbsoluteLogoPath(filename: string) {
  return path.join(logoDirectory, filename);
}

function getContentTypeFromFilename(filename: string) {
  const extension = path.extname(filename).toLowerCase();

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
    default:
      return null;
  }
}

function isStoredLogoUrl(value?: string | null) {
  return Boolean(getCdnAssetPathname(value)?.startsWith(publicLogoPrefix));
}

function getExtensionFromContentType(contentType: string | null) {
  const normalized = contentType?.split(";")[0]?.trim().toLowerCase();

  switch (normalized) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/avif":
      return ".avif";
    case "image/svg+xml":
      return ".svg";
    default:
      return null;
  }
}

function getExtensionFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();

    for (const extension of [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"]) {
      if (pathname.endsWith(extension)) {
        return extension === ".jpeg" ? ".jpg" : extension;
      }
    }
  } catch {
    return null;
  }

  return null;
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

async function writeAssetFile(filePath: string, buffer: Buffer) {
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

async function ensureRemoteLogo(pathname: string, absolutePath: string, contentType: string | null) {
  if (!isB2StorageConfigured() || !(await fileExists(absolutePath))) {
    return null;
  }

  if (!(await headStoredObject(pathname))) {
    await uploadStoredObject({
      pathname,
      body: await readFile(absolutePath),
      contentType,
    });
  }

  return {
    absolutePath,
    url: buildPublicLogoUrl(pathname),
  };
}

async function fetchLogoAsset(sourceUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), logoFetchTimeoutMs);

  let response: Response;

  try {
    response = await fetch(sourceUrl, {
      headers: {
        "user-agent": logoUserAgent,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Advertiser logo request timed out after ${logoFetchTimeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Advertiser logo request failed with status ${response.status}.`);
  }

  const contentType = response.headers.get("content-type");
  const extension = getExtensionFromContentType(contentType) ?? getExtensionFromUrl(sourceUrl);

  if (!extension) {
    throw new Error("Advertiser logo content type is not supported.");
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!buffer.length) {
    throw new Error("Advertiser logo response body was empty.");
  }

  if (buffer.length > maxLogoBytes) {
    throw new Error("Advertiser logo exceeded the maximum download size.");
  }

  return {
    buffer,
    extension,
  };
}

export async function materializeAdvertiserLogo(advertiser: AdvertiserMatch) {
  if (!advertiser.logoUrl) {
    return advertiser;
  }

  if (isStoredLogoUrl(advertiser.logoUrl)) {
    const pathname = getCdnAssetPathname(advertiser.logoUrl);

    if (pathname) {
      const filename = pathname.slice(publicLogoPrefix.length);
      await ensureRemoteLogo(pathname, buildAbsoluteLogoPath(filename), getContentTypeFromFilename(filename));
    }

    return {
      ...advertiser,
      logoUrl: resolveCdnAssetUrl(advertiser.logoUrl) ?? advertiser.logoUrl,
    };
  }

  const { buffer, extension } = await fetchLogoAsset(advertiser.logoUrl);
  const filename = buildStoredFilename(buffer, extension);
  const absolutePath = buildAbsoluteLogoPath(filename);
  const pathname = `${publicLogoPrefix}${filename}`;

  if (isB2StorageConfigured()) {
    if (!(await headStoredObject(pathname))) {
      await uploadStoredObject({
        pathname,
        body: buffer,
        contentType: getContentTypeFromFilename(filename),
      });
    }
  } else if (!(await fileExists(absolutePath))) {
    await writeAssetFile(absolutePath, buffer);
  }

  return {
    ...advertiser,
    logoUrl: buildPublicLogoUrl(pathname),
  };
}
