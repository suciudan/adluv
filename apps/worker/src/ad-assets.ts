import { createHash } from "node:crypto";
import { access, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import http, { type IncomingHttpHeaders } from "node:http";
import https from "node:https";
import path from "node:path";
import vm from "node:vm";

import { getCdnAssetPathname, resolveCdnAssetUrl } from "@adluv/config";
import { type NormalizedAd } from "@adluv/source-adapters";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { Innertube, Log, Platform } from "youtubei.js";

import {
  compressVideoBufferToMp4,
  convertImageBufferToWebp,
  getBufferMediaDimensions,
  getStoredMediaDimensions,
  type MediaDimensions,
} from "./media-conversion";
import { headStoredObject, isB2StorageConfigured, uploadStoredObject } from "./b2";
import { resolveCdnStoragePath } from "./paths";

const assetDirectory = resolveCdnStoragePath("ad-assets");
const publicAssetPrefix = "/ad-assets/";
const assetIndexPath = path.join(assetDirectory, ".source-url-index.json");
const binaryAssetIndexPath = path.join(assetDirectory, ".binary-hash-index.json");
const creativeUserAgent = "Mozilla/5.0";
const maxImageAssetBytes = 32 * 1024 * 1024;
const creativeAssetFetchTimeoutMs = 20_000;
const assetMaterializationConcurrency = 6;
// Bump these when the normalized output changes so raw-binary dedupe does not reuse stale encodes.
const imageTransformProfile = "image/webp:v1";
const videoTransformProfile = "video/mp4:h264-max1280-crf23:v1";

type AssetIndex = Record<string, string>;

type BinaryAssetIndexEntry = {
  filename: string;
  contentType: string | null;
  transformProfile: string;
};

type BinaryAssetIndex = Record<string, BinaryAssetIndexEntry>;

type MaterializeAdAssetsOptions = {
  forceSourceRefetch?: boolean;
  persist?: boolean;
  refreshExpiredSourceUrl?: (input: RefreshExpiredSourceUrlInput) => Promise<string | null | undefined>;
  sourceProxyUrls?: string[];
};

export type RefreshExpiredSourceUrlInput = {
  ad: NormalizedAd;
  asset?: Record<string, unknown>;
  error: CreativeAssetRequestError;
  sourceKey: string;
  sourceUrl: string;
};

type AssetIndices = {
  sourceUrlIndex: AssetIndex;
  binaryAssetIndex: BinaryAssetIndex;
};

type MaterializedAsset = {
  contentType: string | null | undefined;
  storedPath: string;
  storedUrl: string;
  dimensions: MediaDimensions | null;
};

type PreparedCreativeAsset = {
  kind: "image" | "video" | "passthrough";
  sourceBuffer: Buffer;
  sourceContentType: string | null;
  sourceExtension: string;
  normalizedContentType: string | null;
  normalizedExtension: string;
  transformProfile: string;
};

type CreativeAssetFetchBody = {
  buffer: Buffer;
  contentType: string | null;
  contentLength: number | null;
  ok: boolean;
  status: number;
};

export class CreativeAssetRequestError extends Error {
  constructor(
    message: string,
    readonly input: {
      bodySnippet?: string | null;
      contentType?: string | null;
      sourceUrl: string;
      status: number;
    },
  ) {
    super(message);
    this.name = "CreativeAssetRequestError";
  }

  get bodySnippet() {
    return this.input.bodySnippet ?? null;
  }

  get contentType() {
    return this.input.contentType ?? null;
  }

  get sourceUrl() {
    return this.input.sourceUrl;
  }

  get status() {
    return this.input.status;
  }
}

type YoutubeClientName = "ANDROID" | "TV" | "WEB";

type YoutubeStreamingFormat = {
  content_length?: string | number;
  container?: string;
  decipher?: (player?: unknown) => Promise<string> | string;
  has_audio?: boolean;
  has_video?: boolean;
  height?: number;
  itag?: number;
  mime_type?: string;
  quality_label?: string;
  url?: string;
};

let youtubeRuntimeConfigured = false;
let youtubeClientPromise: Promise<Innertube> | null = null;

function buildPublicAssetUrl(pathname: string) {
  return resolveCdnAssetUrl(pathname) ?? pathname;
}

function buildAbsoluteAssetPath(filename: string) {
  return path.join(assetDirectory, filename);
}

function isStoredAssetUrl(value?: string | null) {
  return Boolean(value && getStoredFilenameFromUrl(value));
}

function getStoredFilenameFromUrl(value: string) {
  const pathname = getCdnAssetPathname(value);

  if (pathname?.startsWith(publicAssetPrefix)) {
    return pathname.slice(publicAssetPrefix.length);
  }

  return null;
}

function collectNestedStrings(value: unknown, depth = 0): string[] {
  if (depth > 4 || value == null) {
    return [];
  }

  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectNestedStrings(item, depth + 1));
  }

  if (typeof value !== "object") {
    return [];
  }

  return Object.values(value as Record<string, unknown>).flatMap((item) => collectNestedStrings(item, depth + 1));
}

function sanitizeExternalAssetUrl(value: string) {
  const trimmed = value.trim().replace(/\\/g, "");

  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  return trimmed;
}

function extractYoutubeVideoIdFromThumbnailUrl(value?: string | null) {
  if (!value) {
    return null;
  }

  return value.match(/\/vi\/([^/?#]+)\//i)?.[1] ?? null;
}

function getGoogleYoutubeVideoId(record: Record<string, unknown>) {
  const explicitId = getMetadataString(record, "googleYoutubeVideoId");

  if (explicitId) {
    return explicitId;
  }

  return (
    extractYoutubeVideoIdFromThumbnailUrl(getMetadataString(record, "sourceThumbnailUrl")) ??
    extractYoutubeVideoIdFromThumbnailUrl(getMetadataString(record, "sourceMediaUrl")) ??
    extractYoutubeVideoIdFromThumbnailUrl(getMetadataString(record, "assetThumbnailStoredUrl")) ??
    null
  );
}

function configureYoutubeRuntime() {
  if (youtubeRuntimeConfigured) {
    return;
  }

  const currentShim = Platform.shim;

  Log.setLevel(Log.Level.NONE);

  Platform.load({
    ...currentShim,
    eval: (data, env) => {
      return vm.runInNewContext(
        `(() => {\n${data.output}\n})()`,
        {
          ...env,
          URL,
          URLSearchParams,
          decodeURIComponent,
          encodeURIComponent,
        },
        { timeout: 1_000 },
      );
    },
  });

  youtubeRuntimeConfigured = true;
}

function getYoutubeClient() {
  configureYoutubeRuntime();

  youtubeClientPromise ??= Innertube.create({
    lang: "en",
    location: "US",
    retrieve_player: true,
  });

  return youtubeClientPromise;
}

function getYoutubeFormatHeight(format: YoutubeStreamingFormat) {
  if (typeof format.height === "number" && Number.isFinite(format.height)) {
    return format.height;
  }

  const parsed = Number.parseInt(format.quality_label ?? "", 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function getYoutubeFormatContentLength(format: YoutubeStreamingFormat) {
  const parsed = Number.parseInt(String(format.content_length ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Number.MAX_SAFE_INTEGER;
}

function getYoutubeFormatContainer(format: YoutubeStreamingFormat) {
  const mimeContainer = format.mime_type?.match(/^video\/([^;]+)/i)?.[1]?.toLowerCase();
  return format.container?.toLowerCase() ?? mimeContainer ?? null;
}

function chooseYoutubeDownloadFormat(formats: YoutubeStreamingFormat[]) {
  const videoFormats = formats.filter((format) => {
    const container = getYoutubeFormatContainer(format);

    return Boolean((format.url || format.decipher) && format.has_video && (container === "mp4" || container === "webm"));
  });
  const muxedFormats = videoFormats.filter((format) => format.has_audio);
  const candidates = muxedFormats.length ? muxedFormats : videoFormats;

  return candidates.sort((left, right) => {
    const leftIsMp4 = getYoutubeFormatContainer(left) === "mp4" ? 0 : 1;
    const rightIsMp4 = getYoutubeFormatContainer(right) === "mp4" ? 0 : 1;

    return (
      leftIsMp4 - rightIsMp4 ||
      getYoutubeFormatHeight(left) - getYoutubeFormatHeight(right) ||
      getYoutubeFormatContentLength(left) - getYoutubeFormatContentLength(right)
    );
  })[0];
}

async function resolveYoutubeVideoDownloadUrl(videoId: string, clientName: YoutubeClientName) {
  if (!/^[\w-]{11}$/.test(videoId)) {
    throw new Error("Google creative has an invalid YouTube video id.");
  }

  const youtube = await getYoutubeClient();
  const info = await youtube.getInfo(videoId, { client: clientName });
  const streamingData = (info as unknown as {
    streaming_data?: {
      adaptive_formats?: YoutubeStreamingFormat[];
      formats?: YoutubeStreamingFormat[];
    };
  }).streaming_data;
  const format = chooseYoutubeDownloadFormat([
    ...(streamingData?.formats ?? []),
    ...(streamingData?.adaptive_formats ?? []),
  ]);

  if (!format) {
    throw new Error(`YouTube ${clientName} did not expose a downloadable video format.`);
  }

  const sourceUrl = format.decipher ? await format.decipher(youtube.session.player) : format.url;

  if (!sourceUrl) {
    throw new Error(`YouTube ${clientName} returned an empty video URL.`);
  }

  return sourceUrl;
}

async function materializeYoutubeVideoSource(
  videoId: string,
  indices: AssetIndices,
  options: MaterializeAdAssetsOptions,
) {
  const clients: YoutubeClientName[] = ["ANDROID", "TV", "WEB"];
  let lastError: unknown = null;

  for (const clientName of clients) {
    try {
      const sourceUrl = await resolveYoutubeVideoDownloadUrl(videoId, clientName);
      return await materializeAssetSource(sourceUrl, indices, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("YouTube video storage failed.");
}

function extractGoogleArchivedImageUrl(metadata: Record<string, unknown>) {
  const rawPayload = metadata.rawPayload;

  if (!rawPayload) {
    return null;
  }

  const match = collectNestedStrings(rawPayload)
    .map((value) => {
      const imgMatch =
        value.match(/<img[^>]+src=["']((?:https?:)?\/\/[^"' >]+)["']/i) ??
        value.match(/((?:https?:)?\/\/tpc\.googlesyndication\.com\/archive\/simgad\/[^"' <]+)/i);

      return imgMatch?.[1] ? sanitizeExternalAssetUrl(imgMatch[1]) : null;
    })
    .find((value): value is string => Boolean(value));

  return match ?? null;
}

function normalizeContentType(contentType: string | null) {
  return contentType?.split(";")[0]?.trim().toLowerCase() ?? null;
}

function getExtensionFromContentType(contentType: string | null) {
  switch (normalizeContentType(contentType)) {
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
    case "video/mp4":
      return ".mp4";
    case "video/quicktime":
      return ".mov";
    case "video/webm":
      return ".webm";
    default:
      return null;
  }
}

function getExtensionFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();

    for (const extension of [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".mp4", ".mov", ".webm"]) {
      if (pathname.endsWith(extension)) {
        return extension === ".jpeg" ? ".jpg" : extension;
      }
    }
  } catch {
    return null;
  }

  return null;
}

function getExtensionFromBuffer(buffer: Buffer) {
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return ".mp4";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return ".webp";
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return ".png";
  }

  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return ".jpg";
  }

  if (buffer.length >= 6) {
    const signature = buffer.subarray(0, 6).toString("ascii");

    if (signature === "GIF87a" || signature === "GIF89a") {
      return ".gif";
    }
  }

  return null;
}

function isVideoExtension(extension: string | null) {
  return extension === ".mp4" || extension === ".mov" || extension === ".webm";
}

function isImageAsset(contentType: string | null, extension: string | null) {
  const normalizedContentType = normalizeContentType(contentType);

  return Boolean(
    normalizedContentType?.startsWith("image/") ||
      extension === ".jpg" ||
      extension === ".png" ||
      extension === ".webp" ||
      extension === ".gif" ||
      extension === ".avif",
  );
}

function resolveMaxAssetBytes(contentType: string | null, extension: string | null) {
  if (isVideoExtension(extension)) {
    return null;
  }

  return maxImageAssetBytes;
}

function buildHash(input: Buffer | string) {
  return createHash("sha1").update(input).digest("hex");
}

function buildStoredFilename(buffer: Buffer, extension: string) {
  return `${buildHash(buffer)}${extension}`;
}

function buildSourceUrlKey(sourceUrl: string) {
  return buildHash(sourceUrl);
}

function buildBinaryAssetKey(buffer: Buffer, transformProfile: string) {
  return `${transformProfile}:${buildHash(buffer)}`;
}

function resolveAssetDescriptor(contentType: string | null, extension: string): Omit<PreparedCreativeAsset, "sourceBuffer"> {
  if (isImageAsset(contentType, extension)) {
    return {
      kind: "image",
      sourceContentType: normalizeContentType(contentType),
      sourceExtension: extension,
      normalizedContentType: "image/webp",
      normalizedExtension: ".webp",
      transformProfile: imageTransformProfile,
    };
  }

  if (isVideoExtension(extension)) {
    return {
      kind: "video",
      sourceContentType: normalizeContentType(contentType),
      sourceExtension: extension,
      normalizedContentType: "video/mp4",
      normalizedExtension: ".mp4",
      transformProfile: videoTransformProfile,
    };
  }

  return {
    kind: "passthrough",
    sourceContentType: normalizeContentType(contentType),
    sourceExtension: extension,
    normalizedContentType: normalizeContentType(contentType),
    normalizedExtension: extension,
    transformProfile: `passthrough:${extension}:v1`,
  };
}

async function findLegacyStoredAsset(sourceUrl: string) {
  const legacyHash = buildHash(sourceUrl);

  for (const extension of [".jpg", ".png", ".webp", ".gif", ".avif", ".mp4", ".mov", ".webm"]) {
    const absolutePath = buildAbsoluteAssetPath(`${legacyHash}${extension}`);

    if (await fileExists(absolutePath)) {
      return {
        storedPath: absolutePath,
        storedUrl: buildPublicAssetUrl(`${publicAssetPrefix}${legacyHash}${extension}`),
        filename: `${legacyHash}${extension}`,
      };
    }
  }

  return null;
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

async function loadAssetIndex() {
  try {
    const content = await readFile(assetIndexPath, "utf8");
    const parsed = JSON.parse(content);

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed as AssetIndex;
  } catch {
    return {};
  }
}

async function loadBinaryAssetIndex() {
  try {
    const content = await readFile(binaryAssetIndexPath, "utf8");
    const parsed = JSON.parse(content);

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, value]) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return [];
        }

        const entry = value as Record<string, unknown>;
        const filename = typeof entry.filename === "string" ? entry.filename : null;
        const contentType = typeof entry.contentType === "string" ? normalizeContentType(entry.contentType) : null;
        const transformProfile = typeof entry.transformProfile === "string" ? entry.transformProfile : null;

        if (!filename || !transformProfile) {
          return [];
        }

        return [[key, { filename, contentType, transformProfile } satisfies BinaryAssetIndexEntry]];
      }),
    );
  } catch {
    return {};
  }
}

async function saveAssetIndex(index: AssetIndex) {
  await writeAssetFile(assetIndexPath, Buffer.from(JSON.stringify(index, null, 2)));
}

async function saveBinaryAssetIndex(index: BinaryAssetIndex) {
  await writeAssetFile(binaryAssetIndexPath, Buffer.from(JSON.stringify(index, null, 2)));
}

function getHeaderValue(headers: IncomingHttpHeaders, key: string) {
  const value = headers[key.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function fetchCreativeAssetViaProxy(
  sourceUrl: string,
  proxyUrl: string,
  redirectCount = 0,
): Promise<CreativeAssetFetchBody> {
  const url = new URL(sourceUrl);
  const transport = url.protocol === "http:" ? http : https;
  const proxy = url.protocol === "http:"
    ? (new HttpProxyAgent(proxyUrl) as unknown as http.Agent)
    : (new HttpsProxyAgent(proxyUrl) as unknown as http.Agent);

  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        agent: proxy,
        headers: {
          "accept-encoding": "identity",
          "user-agent": creativeUserAgent,
        },
        method: "GET",
        timeout: creativeAssetFetchTimeoutMs,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = getHeaderValue(response.headers, "location");
        const contentType = getHeaderValue(response.headers, "content-type");
        const responseExtension = getExtensionFromContentType(contentType) ?? getExtensionFromUrl(sourceUrl);
        const contentLength = Number.parseInt(getHeaderValue(response.headers, "content-length") ?? "", 10);
        const normalizedContentLength = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null;
        const maxAssetBytes = resolveMaxAssetBytes(contentType, responseExtension);

        if (location && [301, 302, 303, 307, 308].includes(status) && redirectCount < 5) {
          response.resume();
          resolve(fetchCreativeAssetViaProxy(new URL(location, url).toString(), proxyUrl, redirectCount + 1));
          return;
        }

        if (maxAssetBytes && normalizedContentLength && normalizedContentLength > maxAssetBytes) {
          response.resume();
          reject(new Error(`Creative asset exceeded the maximum download size (${maxAssetBytes} bytes).`));
          return;
        }

        const chunks: Buffer[] = [];

        response.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("end", () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType,
            contentLength: normalizedContentLength,
            ok: status >= 200 && status < 300,
            status,
          });
        });
        response.on("error", reject);
      },
    );

    request.on("timeout", () => request.destroy(new Error(`Creative asset request timed out after ${creativeAssetFetchTimeoutMs}ms.`)));
    request.on("error", reject);
    request.end();
  });
}

function getResponseBodySnippet(buffer: Buffer) {
  return buffer.subarray(0, 512).toString("utf8").replace(/\s+/g, " ").trim() || null;
}

async function fetchCreativeAssetDirect(sourceUrl: string): Promise<CreativeAssetFetchBody> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), creativeAssetFetchTimeoutMs);

  try {
    const response = await fetch(sourceUrl, {
      headers: {
        "user-agent": creativeUserAgent,
      },
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type");
    const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    const normalizedContentLength = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null;

    if (!response.ok) {
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        contentType,
        contentLength: normalizedContentLength,
        ok: false,
        status: response.status,
      };
    }

    const responseExtension = getExtensionFromContentType(contentType) ?? getExtensionFromUrl(sourceUrl);
    const maxAssetBytes = resolveMaxAssetBytes(contentType, responseExtension);

    if (maxAssetBytes && normalizedContentLength && normalizedContentLength > maxAssetBytes) {
      throw new Error(`Creative asset exceeded the maximum download size (${maxAssetBytes} bytes).`);
    }

    const arrayBuffer = await response.arrayBuffer();

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType,
      contentLength: normalizedContentLength,
      ok: true,
      status: response.status,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Creative asset request timed out after ${creativeAssetFetchTimeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchCreativeAssetFromTransport(sourceUrl: string, proxyUrl?: string) {
  return proxyUrl ? fetchCreativeAssetViaProxy(sourceUrl, proxyUrl) : fetchCreativeAssetDirect(sourceUrl);
}

async function fetchCreativeAsset(sourceUrl: string, proxyUrls: string[] = []): Promise<PreparedCreativeAsset> {
  let lastError: unknown = null;

  for (const proxyUrl of [undefined, ...proxyUrls]) {
    try {
      const response = await fetchCreativeAssetFromTransport(sourceUrl, proxyUrl);

      if (!response.ok) {
        throw new CreativeAssetRequestError(`Creative asset request failed with status ${response.status}.`, {
          bodySnippet: getResponseBodySnippet(response.buffer),
          contentType: response.contentType,
          sourceUrl,
          status: response.status,
        });
      }

      const contentType = response.contentType;
      const responseExtension = getExtensionFromContentType(contentType) ?? getExtensionFromUrl(sourceUrl);

      const maxAssetBytes = resolveMaxAssetBytes(contentType, responseExtension);
      const contentLength = response.contentLength;

      if (maxAssetBytes && contentLength && contentLength > maxAssetBytes) {
        throw new Error(`Creative asset exceeded the maximum download size (${maxAssetBytes} bytes).`);
      }

      const buffer = response.buffer;

      if (!buffer.length) {
        throw new Error("Creative asset response body was empty.");
      }

      const extension = responseExtension ?? getExtensionFromBuffer(buffer);

      if (!extension) {
        throw new Error("Creative asset content type is not supported.");
      }

      if (maxAssetBytes && buffer.length > maxAssetBytes) {
        throw new Error(`Creative asset exceeded the maximum download size (${maxAssetBytes} bytes).`);
      }

      return {
        sourceBuffer: buffer,
        ...resolveAssetDescriptor(contentType, extension),
      };
    } catch (error) {
      lastError = error;

      if (isExpiredMetaCreativeAssetUrlError(error)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Creative asset request failed.");
}

export function isExpiredMetaCreativeAssetUrlError(error: unknown): error is CreativeAssetRequestError {
  let hostname = "";

  if (error instanceof CreativeAssetRequestError) {
    try {
      hostname = new URL(error.sourceUrl).hostname;
    } catch {
      hostname = "";
    }
  }

  return (
    error instanceof CreativeAssetRequestError &&
    error.status === 403 &&
    /(?:^|\.)fbcdn\.net$/i.test(hostname)
  );
}

async function normalizeCreativeAsset(asset: PreparedCreativeAsset) {
  if (asset.kind === "image") {
    const convertedBuffer = await convertImageBufferToWebp(asset.sourceBuffer, asset.sourceExtension);

    if (!convertedBuffer.length) {
      throw new Error("Creative asset image conversion produced an empty body.");
    }

    if (maxImageAssetBytes && convertedBuffer.length > maxImageAssetBytes) {
      throw new Error(`Creative asset exceeded the maximum download size (${maxImageAssetBytes} bytes).`);
    }

    return convertedBuffer;
  }

  if (asset.kind === "video") {
    const convertedBuffer = await compressVideoBufferToMp4(asset.sourceBuffer, asset.sourceExtension);

    if (!convertedBuffer.length) {
      throw new Error("Creative asset video conversion produced an empty body.");
    }

    return convertedBuffer;
  }

  return asset.sourceBuffer;
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;

        nextIndex += 1;
        await worker(items[currentIndex], currentIndex);
      }
    }),
  );
}

function applyDimensionsMetadata(
  metadata: Record<string, unknown>,
  prefix: "asset" | "assetThumbnail" | "assetVideo",
  dimensions: MediaDimensions | null,
) {
  const widthKey = `${prefix}Width`;
  const heightKey = `${prefix}Height`;
  const aspectRatioKey = `${prefix}AspectRatio`;

  if (!dimensions) {
    delete metadata[widthKey];
    delete metadata[heightKey];
    delete metadata[aspectRatioKey];
    return;
  }

  metadata[widthKey] = dimensions.width;
  metadata[heightKey] = dimensions.height;
  metadata[aspectRatioKey] = dimensions.aspectRatio;
}

function getMetadataString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getMetadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getMetadataArray(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return Array.isArray(value) ? value : [];
}

type MetaCreativeAssetCandidate = {
  dedupeKey: string | null;
  label: string;
  value: unknown;
};

function collectMetaCreativeAssetCandidates(metadata: Record<string, unknown>): MetaCreativeAssetCandidate[] {
  const rawPayload = getMetadataRecord(metadata.rawPayload);
  const snapshot = getMetadataRecord(rawPayload?.snapshot);

  if (!snapshot) {
    return [];
  }

  const cards = getMetadataArray(snapshot, "cards");
  const videos = getMetadataArray(snapshot, "videos");
  const extraVideos = getMetadataArray(snapshot, "extra_videos");
  const images = getMetadataArray(snapshot, "images");
  const extraImages = getMetadataArray(snapshot, "extra_images");

  return [
    ...cards.map((value, index) => ({
      dedupeKey: `card:${index}`,
      label: index === 0 ? "Original" : `Variant ${index}`,
      value,
    })),
    ...videos.map((value, index) => ({ dedupeKey: null, label: `Video ${index + 1}`, value })),
    ...extraVideos.map((value, index) => ({ dedupeKey: null, label: `Extra video ${index + 1}`, value })),
    ...images.map((value, index) => ({ dedupeKey: null, label: `Image ${index + 1}`, value })),
    ...extraImages.map((value, index) => ({ dedupeKey: null, label: `Extra image ${index + 1}`, value })),
  ];
}

function pickFirstMetadataString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = getMetadataString(record, key);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function buildMetaCreativeAssetFromRawPayload(candidate: MetaCreativeAssetCandidate) {
  const record = getMetadataRecord(candidate.value);

  if (!record) {
    return null;
  }

  const sourceVideoUrl = pickFirstMetadataString(record, [
    "video_hd_url",
    "video_sd_url",
    "watermarked_video_hd_url",
    "watermarked_video_sd_url",
  ]);
  const sourceMediaUrl = pickFirstMetadataString(record, [
    "original_image_url",
    "resized_image_url",
    "watermarked_resized_image_url",
  ]);
  const sourceThumbnailUrl = getMetadataString(record, "video_preview_image_url") ?? sourceMediaUrl;
  const identity = sourceVideoUrl ?? sourceMediaUrl ?? sourceThumbnailUrl;

  if (!identity) {
    return null;
  }

  return {
    label: candidate.label,
    title: getMetadataString(record, "title") ?? getMetadataString(record, "link_description"),
    body: getMetadataString(record, "body") ?? getMetadataString(record, "caption"),
    callToAction: getMetadataString(record, "cta_text") ?? getMetadataString(record, "cta_type"),
    destinationUrl: getMetadataString(record, "link_url"),
    sourceMediaUrl,
    sourceThumbnailUrl,
    sourceVideoUrl,
  } satisfies Record<string, unknown>;
}

function getMetaCreativeAssetIdentity(asset: Record<string, unknown>) {
  return (
    getMetadataString(asset, "sourceVideoUrl") ??
    getMetadataString(asset, "assetVideoStoredUrl") ??
    getMetadataString(asset, "sourceMediaUrl") ??
    getMetadataString(asset, "assetStoredUrl") ??
    getMetadataString(asset, "sourceThumbnailUrl") ??
    getMetadataString(asset, "assetThumbnailStoredUrl")
  );
}

function getMetaCreativeAssetSlotKey(asset: Record<string, unknown>) {
  const label = getMetadataString(asset, "label");

  if (label === "Original") {
    return "card:0";
  }

  const variantMatch = label?.match(/^Variant (\d+)$/);

  return variantMatch ? `card:${variantMatch[1]}` : null;
}

export function ensureMetaCreativeAssetsFromRawPayload(metadata: Record<string, unknown>) {
  const existingAssets = Array.isArray(metadata.metaCreativeAssets)
    ? metadata.metaCreativeAssets.filter(
        (asset): asset is Record<string, unknown> => Boolean(asset && typeof asset === "object" && !Array.isArray(asset)),
      )
    : [];
  const seen = new Set(
    existingAssets.flatMap((asset) => {
      const keys = [getMetaCreativeAssetIdentity(asset), getMetaCreativeAssetSlotKey(asset)];
      return keys.filter((value): value is string => Boolean(value));
    }),
  );
  const nextAssets = [...existingAssets];

  for (const candidate of collectMetaCreativeAssetCandidates(metadata)) {
    const asset = buildMetaCreativeAssetFromRawPayload(candidate);
    const identity = asset ? getMetaCreativeAssetIdentity(asset) : null;
    const dedupeKey = candidate.dedupeKey ?? identity;

    if (!asset || !identity || !dedupeKey || seen.has(dedupeKey)) {
      continue;
    }

    const enrichedAsset = asset as Record<string, unknown>;

    if (asset.sourceMediaUrl === metadata.sourceMediaUrl) {
      enrichedAsset.assetContentType = metadata.assetContentType;
      enrichedAsset.assetStoredPath = metadata.assetStoredPath;
      enrichedAsset.assetStoredUrl = metadata.assetStoredUrl;
      enrichedAsset.assetWidth = metadata.assetWidth;
      enrichedAsset.assetHeight = metadata.assetHeight;
      enrichedAsset.assetAspectRatio = metadata.assetAspectRatio;
    }

    if (asset.sourceThumbnailUrl === metadata.sourceThumbnailUrl) {
      enrichedAsset.assetThumbnailContentType = metadata.assetThumbnailContentType ?? metadata.assetContentType;
      enrichedAsset.assetThumbnailStoredPath = metadata.assetThumbnailStoredPath ?? metadata.assetStoredPath;
      enrichedAsset.assetThumbnailStoredUrl = metadata.assetThumbnailStoredUrl ?? metadata.assetStoredUrl;
      enrichedAsset.assetThumbnailWidth = metadata.assetThumbnailWidth ?? metadata.assetWidth;
      enrichedAsset.assetThumbnailHeight = metadata.assetThumbnailHeight ?? metadata.assetHeight;
      enrichedAsset.assetThumbnailAspectRatio = metadata.assetThumbnailAspectRatio ?? metadata.assetAspectRatio;
    }

    seen.add(dedupeKey);
    nextAssets.push(asset);
  }

  if (nextAssets.length) {
    metadata.metaCreativeAssets = nextAssets;
  }
}

function applyNestedDimensionsMetadata(
  metadata: Record<string, unknown>,
  prefix: "asset" | "assetThumbnail" | "assetVideo",
  dimensions: MediaDimensions | null,
) {
  const widthKey = `${prefix}Width`;
  const heightKey = `${prefix}Height`;
  const aspectRatioKey = `${prefix}AspectRatio`;

  if (!dimensions) {
    delete metadata[widthKey];
    delete metadata[heightKey];
    delete metadata[aspectRatioKey];
    return;
  }

  metadata[widthKey] = dimensions.width;
  metadata[heightKey] = dimensions.height;
  metadata[aspectRatioKey] = dimensions.aspectRatio;
}

async function materializeNestedCreativeAssetSource(input: {
  ad: NormalizedAd;
  asset: Record<string, unknown>;
  contentTypeKey: string;
  indices: AssetIndices;
  options: MaterializeAdAssetsOptions;
  sourceKey: string;
  storedPathKey: string;
  storedUrlKey: string;
  prefix: "asset" | "assetThumbnail" | "assetVideo";
}) {
  const sourceUrl = getMetadataString(input.asset, input.sourceKey);
  let materializedAsset = null;

  if (sourceUrl && !isStoredAssetUrl(sourceUrl)) {
    try {
      materializedAsset = await materializeAssetSourceWithExpiredUrlRefresh({
        ad: input.ad,
        asset: input.asset,
        indices: input.indices,
        options: input.options,
        sourceKey: input.sourceKey,
        sourceUrl,
      });
    } catch (error) {
      materializedAsset = await inspectStoredAssetReference({
        storedPath: getMetadataString(input.asset, input.storedPathKey),
        storedUrl: getMetadataString(input.asset, input.storedUrlKey),
        contentType: getMetadataString(input.asset, input.contentTypeKey),
      });

      if (!materializedAsset) {
        throw error;
      }
    }
  } else if (sourceUrl || getMetadataString(input.asset, input.storedUrlKey) || getMetadataString(input.asset, input.storedPathKey)) {
    materializedAsset = await inspectStoredAssetReference({
      storedPath: getMetadataString(input.asset, input.storedPathKey),
      storedUrl: getMetadataString(input.asset, input.storedUrlKey) ?? (sourceUrl && isStoredAssetUrl(sourceUrl) ? sourceUrl : undefined),
      contentType: getMetadataString(input.asset, input.contentTypeKey),
    });
  }

  if (!materializedAsset) {
    return;
  }

  if ("sourceUrl" in materializedAsset && typeof materializedAsset.sourceUrl === "string") {
    input.asset[input.sourceKey] = materializedAsset.sourceUrl;
  }
  input.asset[input.contentTypeKey] = materializedAsset.contentType ?? undefined;
  input.asset[input.storedPathKey] = materializedAsset.storedPath;
  input.asset[input.storedUrlKey] = materializedAsset.storedUrl;
  applyNestedDimensionsMetadata(input.asset, input.prefix, materializedAsset.dimensions);
}

async function materializeNestedCreativeAssets(
  ad: NormalizedAd,
  metadata: Record<string, unknown>,
  metadataKey: "metaCreativeAssets" | "googleCreativeAssets" | "linkedInDocumentSlides" | "linkedInCarouselCards",
  indices: AssetIndices,
  options: MaterializeAdAssetsOptions,
) {
  if (!Array.isArray(metadata[metadataKey])) {
    return;
  }

  metadata[metadataKey] = await Promise.all(
    metadata[metadataKey].map(async (asset) => {
      if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
        return asset;
      }

      const nextAsset = { ...(asset as Record<string, unknown>) };

      try {
        await materializeNestedCreativeAssetSource({
          ad,
          asset: nextAsset,
          contentTypeKey: "assetContentType",
          indices,
          options,
          sourceKey: "sourceMediaUrl",
          storedPathKey: "assetStoredPath",
          storedUrlKey: "assetStoredUrl",
          prefix: "asset",
        });
        delete nextAsset.assetStorageError;
      } catch (error) {
        nextAsset.assetStorageError = error instanceof Error ? error.message : "Unknown creative asset storage error.";
      }

      try {
        await materializeNestedCreativeAssetSource({
          ad,
          asset: nextAsset,
          contentTypeKey: "assetThumbnailContentType",
          indices,
          options,
          sourceKey: "sourceThumbnailUrl",
          storedPathKey: "assetThumbnailStoredPath",
          storedUrlKey: "assetThumbnailStoredUrl",
          prefix: "assetThumbnail",
        });
        delete nextAsset.assetThumbnailStorageError;
      } catch (error) {
        nextAsset.assetThumbnailStorageError = error instanceof Error ? error.message : "Unknown creative thumbnail storage error.";
      }

      try {
        await materializeNestedCreativeAssetSource({
          ad,
          asset: nextAsset,
          contentTypeKey: "assetVideoContentType",
          indices,
          options,
          sourceKey: "sourceVideoUrl",
          storedPathKey: "assetVideoStoredPath",
          storedUrlKey: "assetVideoStoredUrl",
          prefix: "assetVideo",
        });
        delete nextAsset.assetVideoStorageError;
      } catch (error) {
        nextAsset.assetVideoStorageError = error instanceof Error ? error.message : "Unknown creative video storage error.";
      }

      return nextAsset;
    }),
  );
}

async function materializeMetaCreativeAssets(
  ad: NormalizedAd,
  metadata: Record<string, unknown>,
  indices: AssetIndices,
  options: MaterializeAdAssetsOptions,
) {
  await materializeNestedCreativeAssets(ad, metadata, "metaCreativeAssets", indices, options);
}

async function materializeGoogleCreativeAssets(
  ad: NormalizedAd,
  metadata: Record<string, unknown>,
  indices: AssetIndices,
  options: MaterializeAdAssetsOptions,
) {
  await materializeNestedCreativeAssets(ad, metadata, "googleCreativeAssets", indices, options);

  if (!Array.isArray(metadata.googleCreativeAssets)) {
    return;
  }

  metadata.googleCreativeAssets = await Promise.all(
    metadata.googleCreativeAssets.map(async (asset) => {
      if (!asset || typeof asset !== "object" || Array.isArray(asset)) {
        return asset;
      }

      const nextAsset = { ...(asset as Record<string, unknown>) };

      if (getMetadataString(nextAsset, "assetVideoStoredUrl")) {
        return nextAsset;
      }

      const youtubeVideoId = getGoogleYoutubeVideoId(nextAsset);

      if (!youtubeVideoId) {
        return nextAsset;
      }

      try {
        const videoAsset = await materializeYoutubeVideoSource(youtubeVideoId, indices, options);

        nextAsset.googleYoutubeVideoId = youtubeVideoId;
        nextAsset.assetVideoContentType = videoAsset.contentType ?? undefined;
        nextAsset.assetVideoStoredPath = videoAsset.storedPath;
        nextAsset.assetVideoStoredUrl = videoAsset.storedUrl;
        applyNestedDimensionsMetadata(nextAsset, "assetVideo", videoAsset.dimensions);
        delete nextAsset.assetVideoStorageError;
      } catch (error) {
        nextAsset.assetVideoStorageError = error instanceof Error ? error.message : "Unknown YouTube video storage error.";
      }

      return nextAsset;
    }),
  );
}

async function materializeLinkedInDocumentSlides(
  ad: NormalizedAd,
  metadata: Record<string, unknown>,
  indices: AssetIndices,
  options: MaterializeAdAssetsOptions,
) {
  await materializeNestedCreativeAssets(ad, metadata, "linkedInDocumentSlides", indices, options);
}

async function materializeLinkedInCarouselCards(
  ad: NormalizedAd,
  metadata: Record<string, unknown>,
  indices: AssetIndices,
  options: MaterializeAdAssetsOptions,
) {
  await materializeNestedCreativeAssets(ad, metadata, "linkedInCarouselCards", indices, options);
}

async function inspectStoredAssetReference(input: {
  storedPath?: string;
  storedUrl?: string;
  contentType?: string | null;
}) {
  const storedPath =
    typeof input.storedPath === "string" && input.storedPath
      ? input.storedPath
      : typeof input.storedUrl === "string"
        ? (() => {
            const filename = getStoredFilenameFromUrl(input.storedUrl);
            return filename ? buildAbsoluteAssetPath(filename) : null;
          })()
        : null;

  const filename =
    storedPath && storedPath.startsWith(assetDirectory) ? path.basename(storedPath) : input.storedUrl ? getStoredFilenameFromUrl(input.storedUrl) : null;

  if (filename) {
    const storedAsset = await inspectStoredAssetByFilename(filename, input.contentType);

    if (storedAsset) {
      return storedAsset;
    }
  }

  if (!storedPath || !(await fileExists(storedPath))) {
    return null;
  }

  const storedUrl =
    typeof input.storedUrl === "string" && input.storedUrl
      ? (resolveCdnAssetUrl(input.storedUrl) ?? input.storedUrl)
      : buildPublicAssetUrl(`${publicAssetPrefix}${path.basename(storedPath)}`);

  return {
    contentType: input.contentType,
    storedPath,
    storedUrl,
    dimensions: await getStoredMediaDimensions(storedPath, input.contentType),
  } satisfies MaterializedAsset;
}

function getDimensionsMetadata(dimensions: MediaDimensions | null) {
  if (!dimensions) {
    return {};
  }

  return {
    width: String(dimensions.width),
    height: String(dimensions.height),
    "aspect-ratio": String(dimensions.aspectRatio),
  };
}

function parseDimensionsMetadata(metadata: Record<string, string>) {
  const width = Number(metadata.width ?? "");
  const height = Number(metadata.height ?? "");
  const aspectRatio = Number(metadata["aspect-ratio"] ?? "");

  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(aspectRatio)) {
    return null;
  }

  return {
    width,
    height,
    aspectRatio,
  } satisfies MediaDimensions;
}

async function ensureRemoteAsset(pathname: string, localPath: string, input: {
  contentType?: string | null;
  dimensions?: MediaDimensions | null;
}) {
  if (!isB2StorageConfigured() || !(await fileExists(localPath))) {
    return null;
  }

  const existing = await headStoredObject(pathname);

  if (existing) {
    return {
      contentType: existing.contentType ?? input.contentType ?? null,
      storedPath: localPath,
      storedUrl: buildPublicAssetUrl(pathname),
      dimensions: parseDimensionsMetadata(existing.metadata),
    } satisfies MaterializedAsset;
  }

  const body = await readFile(localPath);

  await uploadStoredObject({
    pathname,
    body,
    contentType: input.contentType ?? null,
    metadata: getDimensionsMetadata(input.dimensions ?? null),
  });

  return {
    contentType: input.contentType ?? null,
    storedPath: localPath,
    storedUrl: buildPublicAssetUrl(pathname),
    dimensions: input.dimensions ?? null,
  } satisfies MaterializedAsset;
}

async function inspectStoredAssetByFilename(filename: string, contentType?: string | null) {
  const storedPath = buildAbsoluteAssetPath(filename);
  const pathname = `${publicAssetPrefix}${filename}`;

  if (isB2StorageConfigured()) {
    const remoteAsset = await headStoredObject(pathname);

    if (remoteAsset) {
      return {
        contentType: remoteAsset.contentType ?? contentType ?? null,
        storedPath,
        storedUrl: buildPublicAssetUrl(pathname),
        dimensions: parseDimensionsMetadata(remoteAsset.metadata),
      } satisfies MaterializedAsset;
    }

    const localDimensions = await getStoredMediaDimensions(storedPath, contentType);
    const syncedAsset = await ensureRemoteAsset(pathname, storedPath, {
      contentType,
      dimensions: localDimensions,
    });

    if (syncedAsset) {
      return syncedAsset;
    }
  }

  if (!(await fileExists(storedPath))) {
    return null;
  }

  return {
    contentType: contentType ?? null,
    storedPath,
    storedUrl: buildPublicAssetUrl(pathname),
    dimensions: await getStoredMediaDimensions(storedPath, contentType),
  } satisfies MaterializedAsset;
}

async function materializeAssetSource(
  sourceUrl: string,
  indices: AssetIndices,
  options: MaterializeAdAssetsOptions = {},
) {
  const sourceUrlKey = buildSourceUrlKey(sourceUrl);

  if (!options.forceSourceRefetch) {
    const indexedFilename = indices.sourceUrlIndex[sourceUrlKey];

    if (indexedFilename) {
      const indexedAsset = await inspectStoredAssetByFilename(indexedFilename);

      if (indexedAsset) {
        return indexedAsset;
      }

      delete indices.sourceUrlIndex[sourceUrlKey];
    }

    const legacyAsset = await findLegacyStoredAsset(sourceUrl);

    if (legacyAsset) {
      indices.sourceUrlIndex[sourceUrlKey] = legacyAsset.filename;

      return {
        contentType: undefined,
        storedPath: legacyAsset.storedPath,
        storedUrl: legacyAsset.storedUrl,
        dimensions: await getStoredMediaDimensions(legacyAsset.storedPath),
      } satisfies MaterializedAsset;
    }
  }

  const asset = await fetchCreativeAsset(sourceUrl, options.sourceProxyUrls);
  const binaryKey = buildBinaryAssetKey(asset.sourceBuffer, asset.transformProfile);
  const binaryHit = indices.binaryAssetIndex[binaryKey];

  if (binaryHit?.transformProfile === asset.transformProfile) {
    const indexedAsset = await inspectStoredAssetByFilename(binaryHit.filename, binaryHit.contentType ?? asset.normalizedContentType);

    if (indexedAsset) {
      indices.sourceUrlIndex[sourceUrlKey] = binaryHit.filename;
      return indexedAsset;
    }

    delete indices.binaryAssetIndex[binaryKey];
  }

  const normalizedBuffer = await normalizeCreativeAsset(asset);
  const filename = buildStoredFilename(normalizedBuffer, asset.normalizedExtension);
  const absolutePath = buildAbsoluteAssetPath(filename);
  const pathname = `${publicAssetPrefix}${filename}`;
  const dimensions = await getBufferMediaDimensions(
    normalizedBuffer,
    asset.normalizedExtension,
    asset.normalizedContentType,
  );

  if (options.persist !== false) {
    if (isB2StorageConfigured()) {
      if (!(await headStoredObject(pathname))) {
        await uploadStoredObject({
          pathname,
          body: normalizedBuffer,
          contentType: asset.normalizedContentType,
          metadata: getDimensionsMetadata(dimensions),
        });
      }
    } else if (!(await fileExists(absolutePath))) {
      await writeAssetFile(absolutePath, normalizedBuffer);
    }
  }

  if (options.persist !== false) {
    indices.sourceUrlIndex[sourceUrlKey] = filename;
    indices.binaryAssetIndex[binaryKey] = {
      filename,
      contentType: asset.normalizedContentType,
      transformProfile: asset.transformProfile,
    };
  }

  return {
    contentType: asset.normalizedContentType,
    storedPath: absolutePath,
    storedUrl: buildPublicAssetUrl(pathname),
    dimensions,
  } satisfies MaterializedAsset;
}

async function materializeAssetSourceWithExpiredUrlRefresh(input: {
  ad: NormalizedAd;
  asset?: Record<string, unknown>;
  indices: AssetIndices;
  options: MaterializeAdAssetsOptions;
  sourceKey: string;
  sourceUrl: string;
}) {
  try {
    const asset = await materializeAssetSource(input.sourceUrl, input.indices, input.options);

    return { ...asset, sourceUrl: input.sourceUrl };
  } catch (error) {
    if (!isExpiredMetaCreativeAssetUrlError(error) || !input.options.refreshExpiredSourceUrl) {
      throw error;
    }

    const refreshedSourceUrl = await input.options.refreshExpiredSourceUrl({
      ad: input.ad,
      asset: input.asset,
      error,
      sourceKey: input.sourceKey,
      sourceUrl: input.sourceUrl,
    });

    if (!refreshedSourceUrl || refreshedSourceUrl === input.sourceUrl || isStoredAssetUrl(refreshedSourceUrl)) {
      throw error;
    }

    const asset = await materializeAssetSource(refreshedSourceUrl, input.indices, input.options);

    if (input.asset) {
      input.asset[input.sourceKey] = refreshedSourceUrl;
    }

    return { ...asset, sourceUrl: refreshedSourceUrl };
  }
}

async function materializeAdAsset(ad: NormalizedAd, indices: AssetIndices, options: MaterializeAdAssetsOptions = {}) {
  const metadata = { ...(ad.metadata ?? {}) };
  const googleArchivedPreviewUrl = ad.source === "google" ? extractGoogleArchivedImageUrl(metadata) : null;
  const sourceMediaUrl = typeof metadata.sourceMediaUrl === "string" ? metadata.sourceMediaUrl : ad.mediaUrl;
  const sourceThumbnailUrl =
    typeof metadata.sourceThumbnailUrl === "string" ? metadata.sourceThumbnailUrl : googleArchivedPreviewUrl ?? undefined;
  const sourceVideoUrl = typeof metadata.sourceVideoUrl === "string" ? metadata.sourceVideoUrl : undefined;
  const primarySourceUrl =
    ad.source === "google"
      ? googleArchivedPreviewUrl ?? sourceThumbnailUrl ?? sourceMediaUrl
      : ad.source === "facebook"
        ? sourceMediaUrl
        : sourceThumbnailUrl ?? sourceMediaUrl;

  try {
    let nextMediaUrl = ad.mediaUrl;

    let primaryAsset = null;

    if (primarySourceUrl && !isStoredAssetUrl(primarySourceUrl)) {
      try {
        primaryAsset = await materializeAssetSourceWithExpiredUrlRefresh({
          ad,
          indices,
          options,
          sourceKey: "sourceMediaUrl",
          sourceUrl: primarySourceUrl,
        });
        nextMediaUrl = primaryAsset.storedUrl;
        metadata.sourceMediaUrl = primaryAsset.sourceUrl;
        if (googleArchivedPreviewUrl) {
          metadata.sourceThumbnailUrl = googleArchivedPreviewUrl;
        }
      } catch (error) {
        metadata.assetStorageError = error instanceof Error ? error.message : "Unknown asset storage error.";
        metadata.sourceMediaUrl = sourceMediaUrl;
        primaryAsset = await inspectStoredAssetReference({
          storedPath: typeof metadata.assetStoredPath === "string" ? metadata.assetStoredPath : undefined,
          storedUrl:
            (typeof metadata.assetStoredUrl === "string" ? metadata.assetStoredUrl : undefined) ??
            (typeof nextMediaUrl === "string" && isStoredAssetUrl(nextMediaUrl) ? nextMediaUrl : undefined),
          contentType: typeof metadata.assetContentType === "string" ? metadata.assetContentType : undefined,
        });
      }
    } else {
      primaryAsset = await inspectStoredAssetReference({
        storedPath: typeof metadata.assetStoredPath === "string" ? metadata.assetStoredPath : undefined,
        storedUrl:
          (typeof metadata.assetStoredUrl === "string" ? metadata.assetStoredUrl : undefined) ??
          (primarySourceUrl && isStoredAssetUrl(primarySourceUrl) ? primarySourceUrl : undefined) ??
          (typeof nextMediaUrl === "string" && isStoredAssetUrl(nextMediaUrl) ? nextMediaUrl : undefined),
        contentType: typeof metadata.assetContentType === "string" ? metadata.assetContentType : undefined,
      });
    }

    if (primaryAsset) {
      nextMediaUrl = primaryAsset.storedUrl;
      metadata.assetContentType = primaryAsset.contentType ?? metadata.assetContentType;
      metadata.assetStoredPath = primaryAsset.storedPath;
      metadata.assetStoredUrl = primaryAsset.storedUrl;
      delete metadata.assetStorageError;
      if (googleArchivedPreviewUrl) {
        metadata.sourceThumbnailUrl = googleArchivedPreviewUrl;
      }
      applyDimensionsMetadata(metadata, "asset", primaryAsset.dimensions);
    }

    let thumbnailAsset = null;

    if (sourceThumbnailUrl && sourceThumbnailUrl !== primarySourceUrl && !isStoredAssetUrl(sourceThumbnailUrl)) {
      thumbnailAsset = await materializeAssetSourceWithExpiredUrlRefresh({
        ad,
        indices,
        options,
        sourceKey: "sourceThumbnailUrl",
        sourceUrl: sourceThumbnailUrl,
      });
      metadata.sourceThumbnailUrl = thumbnailAsset.sourceUrl;
    } else if (sourceThumbnailUrl && sourceThumbnailUrl !== primarySourceUrl) {
      thumbnailAsset = await inspectStoredAssetReference({
        storedPath: typeof metadata.assetThumbnailStoredPath === "string" ? metadata.assetThumbnailStoredPath : undefined,
        storedUrl:
          (typeof metadata.assetThumbnailStoredUrl === "string" ? metadata.assetThumbnailStoredUrl : undefined) ??
          (isStoredAssetUrl(sourceThumbnailUrl) ? sourceThumbnailUrl : undefined),
        contentType: typeof metadata.assetThumbnailContentType === "string" ? metadata.assetThumbnailContentType : undefined,
      });
    } else if (typeof metadata.assetThumbnailStoredUrl === "string" || typeof metadata.assetThumbnailStoredPath === "string") {
      thumbnailAsset = await inspectStoredAssetReference({
        storedPath: typeof metadata.assetThumbnailStoredPath === "string" ? metadata.assetThumbnailStoredPath : undefined,
        storedUrl: typeof metadata.assetThumbnailStoredUrl === "string" ? metadata.assetThumbnailStoredUrl : undefined,
        contentType: typeof metadata.assetThumbnailContentType === "string" ? metadata.assetThumbnailContentType : undefined,
      });
    }

    if (thumbnailAsset) {
      metadata.assetThumbnailContentType = thumbnailAsset.contentType ?? undefined;
      metadata.assetThumbnailStoredPath = thumbnailAsset.storedPath;
      metadata.assetThumbnailStoredUrl = thumbnailAsset.storedUrl;
      applyDimensionsMetadata(metadata, "assetThumbnail", thumbnailAsset.dimensions);
    }

    let videoAsset = null;

    if (sourceVideoUrl && !isStoredAssetUrl(sourceVideoUrl)) {
      try {
        videoAsset = await materializeAssetSourceWithExpiredUrlRefresh({
          ad,
          indices,
          options,
          sourceKey: "sourceVideoUrl",
          sourceUrl: sourceVideoUrl,
        });
        delete metadata.assetVideoStorageError;
      } catch (error) {
        metadata.assetVideoStorageError = error instanceof Error ? error.message : "Unknown video asset storage error.";
      }

      metadata.sourceVideoUrl = videoAsset?.sourceUrl ?? sourceVideoUrl;
    } else if (sourceVideoUrl) {
      videoAsset = await inspectStoredAssetReference({
        storedPath: typeof metadata.assetVideoStoredPath === "string" ? metadata.assetVideoStoredPath : undefined,
        storedUrl:
          (typeof metadata.assetVideoStoredUrl === "string" ? metadata.assetVideoStoredUrl : undefined) ??
          (isStoredAssetUrl(sourceVideoUrl) ? sourceVideoUrl : undefined),
        contentType: typeof metadata.assetVideoContentType === "string" ? metadata.assetVideoContentType : undefined,
      });
    } else if (typeof metadata.assetVideoStoredUrl === "string" || typeof metadata.assetVideoStoredPath === "string") {
      videoAsset = await inspectStoredAssetReference({
        storedPath: typeof metadata.assetVideoStoredPath === "string" ? metadata.assetVideoStoredPath : undefined,
        storedUrl: typeof metadata.assetVideoStoredUrl === "string" ? metadata.assetVideoStoredUrl : undefined,
        contentType: typeof metadata.assetVideoContentType === "string" ? metadata.assetVideoContentType : undefined,
      });
    }

    if (!videoAsset && ad.source === "google") {
      const youtubeVideoId = getGoogleYoutubeVideoId(metadata);

      if (youtubeVideoId) {
        try {
          videoAsset = await materializeYoutubeVideoSource(youtubeVideoId, indices, options);
          metadata.googleYoutubeVideoId = youtubeVideoId;
          delete metadata.assetVideoStorageError;
        } catch (error) {
          metadata.assetVideoStorageError = error instanceof Error ? error.message : "Unknown YouTube video storage error.";
        }
      }
    }

    if (videoAsset) {
      metadata.assetVideoContentType = videoAsset.contentType ?? undefined;
      metadata.assetVideoStoredPath = videoAsset.storedPath;
      metadata.assetVideoStoredUrl = videoAsset.storedUrl;
      applyDimensionsMetadata(metadata, "assetVideo", videoAsset.dimensions);
      delete metadata.assetVideoStorageError;
    }

    if (ad.source === "facebook") {
      ensureMetaCreativeAssetsFromRawPayload(metadata);
    }

    await materializeMetaCreativeAssets(ad, metadata, indices, options);
    await materializeGoogleCreativeAssets(ad, metadata, indices, options);
    await materializeLinkedInDocumentSlides(ad, metadata, indices, options);
    await materializeLinkedInCarouselCards(ad, metadata, indices, options);

    return {
      ...ad,
      mediaUrl: nextMediaUrl,
      metadata,
    } satisfies NormalizedAd;
  } catch (error) {
    return {
      ...ad,
      metadata: {
        ...metadata,
        assetStorageError: error instanceof Error ? error.message : "Unknown asset storage error.",
        sourceMediaUrl,
      },
    } satisfies NormalizedAd;
  }
}

export async function materializeAdAssets(ads: NormalizedAd[], options: MaterializeAdAssetsOptions = {}) {
  if (!isB2StorageConfigured()) {
    await mkdir(assetDirectory, { recursive: true });
  }

  const sourceUrlIndex = await loadAssetIndex();
  const binaryAssetIndex = await loadBinaryAssetIndex();

  const hydratedAds = new Array<NormalizedAd>(ads.length);

  await runPool(ads, assetMaterializationConcurrency, async (ad, index) => {
    hydratedAds[index] = await materializeAdAsset(
      ad,
      {
        sourceUrlIndex,
        binaryAssetIndex,
      },
      options,
    );
  });

  if (options.persist !== false) {
    await Promise.all([saveAssetIndex(sourceUrlIndex), saveBinaryAssetIndex(binaryAssetIndex)]);
  }

  return hydratedAds;
}
