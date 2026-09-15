import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { getCdnAssetPathname, resolveCdnAssetUrl } from "@adluv/config";
import {
  extractHostnameFromWebsite,
  extractRegistrableDomain,
  listAdPersistenceStateByIds,
  stripAdvertiserLegalSuffixes,
} from "@adluv/db";
import type { NormalizedAd } from "@adluv/source-adapters";
import sharp from "sharp";
import * as Tesseract from "tesseract.js";

import { resolveCdnStoragePath, resolveWorkerPath } from "./paths";

type GoogleAdOcrStatus = "completed" | "low_confidence" | "no_text" | "failed" | "skipped_non_image";

type GoogleAdOcrMetadata = {
  engine: "tesseract.js";
  version: string;
  languages: string[];
  status: GoogleAdOcrStatus;
  confidence: number | null;
  extractedText: string | null;
  titleCandidate: string | null;
  bodyCandidate: string | null;
  assetFingerprint: string;
  processedAt: string;
  error: string | null;
};

type GoogleAdOcrStats = {
  scanned: number;
  completed: number;
  lowConfidence: number;
  noText: number;
  skippedNonImage: number;
  failed: number;
  reused: number;
};

type StoredImageAsset = {
  fingerprint: string;
  storedPath: string | null;
  storedUrl: string;
};

type OcrWorkerSlot = {
  createPromise: Promise<Tesseract.Worker> | null;
  worker: Tesseract.Worker | null;
};

type EnrichGoogleAdsWithOcrOptions = {
  concurrency?: number;
  force?: boolean;
  timeoutMs?: number;
};

type PrepareGoogleAdsForPersistenceOptions = EnrichGoogleAdsWithOcrOptions & {
  advertiserId: string;
  ads: NormalizedAd[];
};

const googleAdOcrEngine = "tesseract.js" as const;
const googleAdOcrVersion = "v3" as const;
const googleAdOcrLanguages = ["eng", "spa", "fra", "deu", "ita", "por", "nld"] as const;
const googleAdOcrConcurrency = 2;
const googleAdOcrTimeoutMs = 15_000;
const googleAdOcrMinConfidence = 55;
const googleAdOcrMinTextLength = 12;
const googleAdOcrTessdataPath = resolveWorkerPath("assets", "tessdata");
const googleAdOcrCachePath = resolveWorkerPath(".cache", "tesseract");
const videoExtensions = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".bmp", ".tif", ".tiff"]);
const defaultStats: GoogleAdOcrStats = {
  scanned: 0,
  completed: 0,
  lowConfidence: 0,
  noText: 0,
  skippedNonImage: 0,
  failed: 0,
  reused: 0,
};
const googleSponsoredMarkers = new Set([
  "ad",
  "sponsored",
  "gesponsert",
  "gesponsord",
  "patrocinado",
  "sponsorise",
  "sponsorisé",
  "sponsorizzato",
]);
const ocrWorkerSlots: OcrWorkerSlot[] = Array.from({ length: googleAdOcrConcurrency }, () => ({
  createPromise: null,
  worker: null,
}));

export const googleAdOcrMetadataVersion = googleAdOcrVersion;

function cloneMetadataRecord(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return { ...(metadata as Record<string, unknown>) };
}

function normalizeMetadataString(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getGoogleFormatCode(metadata: Record<string, unknown>) {
  const rawPayload =
    metadata.rawPayload && typeof metadata.rawPayload === "object" && !Array.isArray(metadata.rawPayload)
      ? (metadata.rawPayload as Record<string, unknown>)
      : null;

  return normalizeMetadataString(metadata.googleFormatCode) ?? normalizeMetadataString(rawPayload?.["4"]);
}

function shouldRunOcrForGoogleAd(ad: NormalizedAd) {
  const metadata = cloneMetadataRecord(ad.metadata);
  const formatCode = getGoogleFormatCode(metadata);
  const format = typeof ad.format === "string" ? ad.format.toLowerCase() : "";

  if (formatCode === "1") {
    return true;
  }

  if (formatCode === "2" || formatCode === "3") {
    return false;
  }

  if (format.includes("video") || format.includes("image")) {
    return false;
  }

  return format.includes("text");
}

function mergeMetadataRecords(existingMetadata: unknown, nextMetadata: Record<string, unknown> | undefined) {
  return {
    ...cloneMetadataRecord(existingMetadata),
    ...(nextMetadata ?? {}),
  };
}

function pickPersistedCopy(nextValue: string | undefined, existingValue: string | null) {
  if (typeof nextValue === "string" && nextValue.trim().length > 0) {
    return nextValue;
  }

  if (typeof existingValue === "string" && existingValue.trim().length > 0) {
    return existingValue;
  }

  return undefined;
}

function getAdId(advertiserId: string, ad: NormalizedAd) {
  return createHash("sha1")
    .update(`${advertiserId}:${ad.source}:${ad.sourceAdId ?? ""}:${ad.fingerprint}`)
    .digest("hex");
}

function hasUsableCopy(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}

function sanitizeAssetUrl(value: string) {
  return value.trim().replace(/\\/g, "");
}

function getUrlExtension(value: string) {
  const sanitizedValue = sanitizeAssetUrl(value);

  try {
    return path.extname(new URL(sanitizedValue, "https://adluv.local").pathname).toLowerCase();
  } catch {
    return path.extname(sanitizedValue).toLowerCase();
  }
}

function isImageAsset(value: string | null | undefined, contentType: string | null | undefined) {
  if (!value) {
    return false;
  }

  if (typeof contentType === "string" && contentType.toLowerCase().startsWith("image/")) {
    return true;
  }

  if (typeof contentType === "string" && contentType.toLowerCase().startsWith("video/")) {
    return false;
  }

  return imageExtensions.has(getUrlExtension(value));
}

function isVideoAsset(value: string | null | undefined, contentType: string | null | undefined) {
  if (!value) {
    return false;
  }

  if (typeof contentType === "string" && contentType.toLowerCase().startsWith("video/")) {
    return true;
  }

  if (typeof contentType === "string" && contentType.toLowerCase().startsWith("image/")) {
    return false;
  }

  return videoExtensions.has(getUrlExtension(value));
}

function buildAssetFingerprint(storedUrl: string, storedPath: string | null) {
  const sanitizedUrl = sanitizeAssetUrl(storedUrl);
  const canonicalSource =
    getCdnAssetPathname(sanitizedUrl) ??
    (storedPath ? path.basename(storedPath) : null) ??
    sanitizedUrl;

  return createHash("sha1").update(canonicalSource).digest("hex");
}

function getGoogleStoredImageAsset(ad: NormalizedAd): StoredImageAsset | null {
  const metadata = cloneMetadataRecord(ad.metadata);
  const sourceMediaUrl = typeof ad.mediaUrl === "string" ? ad.mediaUrl : null;
  const assetStoredUrl = typeof metadata.assetStoredUrl === "string" ? metadata.assetStoredUrl : null;
  const assetStoredPath = typeof metadata.assetStoredPath === "string" ? metadata.assetStoredPath : null;
  const assetContentType = typeof metadata.assetContentType === "string" ? metadata.assetContentType : null;
  const assetThumbnailStoredUrl =
    typeof metadata.assetThumbnailStoredUrl === "string" ? metadata.assetThumbnailStoredUrl : null;
  const assetThumbnailStoredPath =
    typeof metadata.assetThumbnailStoredPath === "string" ? metadata.assetThumbnailStoredPath : null;
  const assetThumbnailContentType =
    typeof metadata.assetThumbnailContentType === "string" ? metadata.assetThumbnailContentType : null;
  const assetVideoStoredUrl =
    typeof metadata.assetVideoStoredUrl === "string" ? metadata.assetVideoStoredUrl : null;
  const assetVideoContentType =
    typeof metadata.assetVideoContentType === "string" ? metadata.assetVideoContentType : null;
  const sourceVideoUrl = typeof metadata.sourceVideoUrl === "string" ? metadata.sourceVideoUrl : null;
  const format = typeof ad.format === "string" ? ad.format.toLowerCase() : "";

  if (
    format.includes("video") ||
    isVideoAsset(assetVideoStoredUrl, assetVideoContentType) ||
    isVideoAsset(sourceVideoUrl, assetVideoContentType) ||
    isVideoAsset(sourceMediaUrl, assetContentType)
  ) {
    return null;
  }

  const candidates = [
    {
      storedUrl: assetStoredUrl,
      storedPath: assetStoredPath,
      contentType: assetContentType,
      allowUnknownImage: false,
    },
    {
      storedUrl: assetThumbnailStoredUrl,
      storedPath: assetThumbnailStoredPath,
      contentType: assetThumbnailContentType,
      allowUnknownImage: false,
    },
    {
      storedUrl: sourceMediaUrl,
      storedPath: assetStoredPath,
      contentType: assetContentType,
      allowUnknownImage: true,
    },
  ];

  for (const candidate of candidates) {
    if (!candidate.storedUrl) {
      continue;
    }

    if (!isImageAsset(candidate.storedUrl, candidate.contentType) && !candidate.allowUnknownImage) {
      continue;
    }

    return {
      storedUrl: sanitizeAssetUrl(candidate.storedUrl),
      storedPath: candidate.storedPath ?? null,
      fingerprint: buildAssetFingerprint(candidate.storedUrl, candidate.storedPath ?? null),
    };
  }

  return null;
}

function getExistingOcrMetadata(metadata: Record<string, unknown>) {
  const ocr = metadata.ocr;

  if (!ocr || typeof ocr !== "object" || Array.isArray(ocr)) {
    return null;
  }

  const record = ocr as Record<string, unknown>;
  const status = record.status;
  const version = record.version;
  const assetFingerprint = record.assetFingerprint;

  if (typeof status !== "string" || typeof version !== "string" || typeof assetFingerprint !== "string") {
    return null;
  }

  return {
    status,
    version,
    assetFingerprint,
  };
}

function shouldSkipOcrForCurrentAsset(metadata: Record<string, unknown>, assetFingerprint: string, force: boolean) {
  if (force) {
    return false;
  }

  const existingOcr = getExistingOcrMetadata(metadata);

  if (!existingOcr) {
    return false;
  }

  if (!cleanGoogleBrandUrl(typeof metadata.googleBrandUrl === "string" ? metadata.googleBrandUrl : null)) {
    return false;
  }

  return (
    existingOcr.version === googleAdOcrVersion &&
    existingOcr.assetFingerprint === assetFingerprint &&
    existingOcr.status !== "failed"
  );
}

function hasReusablePersistedGoogleCopy(ad: NormalizedAd, force: boolean) {
  if (force) {
    return false;
  }

  const metadata = cloneMetadataRecord(ad.metadata);
  const existingOcr = getExistingOcrMetadata(metadata);

  if (existingOcr) {
    return false;
  }

  return hasUsableCopy(ad.title) && hasUsableCopy(ad.body);
}

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadStoredImageBuffer(asset: StoredImageAsset) {
  const sanitizedStoredUrl = sanitizeAssetUrl(asset.storedUrl);

  if (asset.storedPath && (await fileExists(asset.storedPath))) {
    return readFile(asset.storedPath);
  }

  const pathname = getCdnAssetPathname(sanitizedStoredUrl);

  if (pathname) {
    const localAssetPath = resolveCdnStoragePath(...pathname.replace(/^\/+/, "").split("/"));

    if (await fileExists(localAssetPath)) {
      return readFile(localAssetPath);
    }
  }

  const resolvedUrl = resolveCdnAssetUrl(sanitizedStoredUrl) ?? sanitizedStoredUrl;

  if (resolvedUrl.startsWith("/")) {
    throw new Error(`Stored asset ${resolvedUrl} is not readable without a local file.`);
  }

  const response = await fetch(resolvedUrl, {
    headers: {
      "user-agent": "Mozilla/5.0",
    },
    signal: AbortSignal.timeout(googleAdOcrTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Stored asset fetch failed with ${response.status}.`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function preprocessOcrImage(buffer: Buffer) {
  const baseImage = sharp(buffer, {
    animated: false,
    limitInputPixels: false,
  });
  const metadata = await baseImage.metadata();
  let pipeline = sharp(buffer, {
    animated: false,
    limitInputPixels: false,
  })
    .rotate()
    .flatten({ background: "#ffffff" })
    .grayscale()
    .normalize()
    .sharpen();

  const width = metadata.width ?? null;

  if (width && width < 1600) {
    pipeline = pipeline.resize({
      width: Math.min(2400, width * 2),
      withoutEnlargement: false,
      fit: "inside",
    });
  }

  return pipeline.png().toBuffer();
}

async function createOcrWorker() {
  const worker = await Tesseract.createWorker(
    [...googleAdOcrLanguages],
    Tesseract.OEM.LSTM_ONLY,
    {
      langPath: googleAdOcrTessdataPath,
      cachePath: googleAdOcrCachePath,
      cacheMethod: "none",
      gzip: true,
      logger: () => undefined,
      errorHandler: () => undefined,
    },
  );

  await worker.setParameters({
    tessedit_pageseg_mode: Tesseract.PSM.SPARSE_TEXT,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });

  return worker;
}

async function getOcrWorker(slot: OcrWorkerSlot) {
  if (slot.worker) {
    return slot.worker;
  }

  if (!slot.createPromise) {
    slot.createPromise = createOcrWorker().then((worker) => {
      slot.worker = worker;
      slot.createPromise = null;
      return worker;
    });
  }

  return slot.createPromise;
}

async function resetOcrWorker(slot: OcrWorkerSlot) {
  const currentWorker = slot.worker;
  slot.worker = null;
  slot.createPromise = null;

  if (!currentWorker) {
    return;
  }

  await currentWorker.terminate().catch(() => undefined);
}

export async function disposeGoogleAdOcrWorkers() {
  await Promise.all(ocrWorkerSlots.map((slot) => resetOcrWorker(slot)));
}

async function recognizeWithOcrWorker(slot: OcrWorkerSlot, imageBuffer: Buffer, timeoutMs: number) {
  const worker = await getOcrWorker(slot);
  let timeoutHandle: NodeJS.Timeout | undefined;

  try {
    const result = await Promise.race([
      worker.recognize(imageBuffer),
      new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`Google ad OCR timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);

    return result;
  } catch (error) {
    await resetOcrWorker(slot);
    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function normalizeOcrText(text: string) {
  const lines = text
    .split(/\r?\n/g)
    .map((line) =>
      line
        .replace(/Â®/g, "®")
        .replace(/Â©/g, "©")
        .replace(/Â™/g, "™")
        .replace(/â„¢/g, "™")
        .replace(/â€™/g, "’")
        .replace(/â€œ/g, "“")
        .replace(/â€/g, "”")
        .replace(/â€“/g, "–")
        .replace(/â€”/g, "—")
        .replace(/Ã¼/g, "ü")
        .replace(/Ã¶/g, "ö")
        .replace(/Ã¤/g, "ä")
        .replace(/ÃŸ/g, "ß")
        .replace(/Ã©/g, "é")
        .replace(/Ã¨/g, "è")
        .replace(/\bAl\b/g, "AI")
        .replace(/^[<[{(|]+/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .filter((line, index, nextLines) => (index === 0 ? true : line !== nextLines[index - 1]));
  const mergedLines: string[] = [];

  for (const line of lines) {
    const previousLine = mergedLines.at(-1);

    if (previousLine && previousLine.endsWith("-")) {
      mergedLines[mergedLines.length - 1] = `${previousLine.slice(0, -1)}${line}`;
      continue;
    }

    mergedLines.push(line);
  }

  return mergedLines.join("\n");
}

function normalizeOcrComparisonText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9./&+\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getGoogleOcrAdvertiserBrandHints(ad: NormalizedAd) {
  const metadata = cloneMetadataRecord(ad.metadata);
  const rawPayload = metadata.rawPayload;
  const hints = new Set<string>();
  const addBrandHint = (value: string | null | undefined) => {
    const normalizedValue = normalizeOcrComparisonText(value ?? "");

    if (!normalizedValue) {
      return;
    }

    hints.add(normalizedValue);

    const firstWord = normalizedValue.split(" ")[0]?.trim();

    if (firstWord && firstWord.length > 2 && !["the", "and", "ads", "inc", "llc", "ltd", "corp", "company"].includes(firstWord)) {
      hints.add(firstWord);
    }
  };
  const rawAdvertiserName =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)["12"]
      : null;
  const advertiserName =
    typeof rawAdvertiserName === "string" ? rawAdvertiserName : typeof ad.payer === "string" ? ad.payer : null;
  const normalizedAdvertiserName = normalizeOcrComparisonText(
    stripAdvertiserLegalSuffixes(advertiserName ?? "") || advertiserName || "",
  );

  addBrandHint(normalizedAdvertiserName);

  const googleBrandUrl = normalizeMetadataString(metadata.googleBrandUrl);
  const destinationHostname = extractHostnameFromWebsite(ad.destinationUrl ?? googleBrandUrl ?? null);
  const destinationDomain = extractRegistrableDomain(destinationHostname);

  if (destinationDomain) {
    addBrandHint(destinationDomain);
    const domainLabel = destinationDomain.split(".")[0]?.trim();

    if (domainLabel) {
      addBrandHint(domainLabel);
    }
  }

  return hints;
}

function isGoogleSponsoredHeaderLine(line: string) {
  return googleSponsoredMarkers.has(normalizeOcrComparisonText(line));
}

function isGoogleUrlHeaderLine(line: string) {
  const normalizedLine = normalizeOcrText(line);

  if (!normalizedLine) {
    return false;
  }

  const strippedLine = normalizeOcrComparisonText(normalizedLine);
  const lineWithoutHeaderLabels = strippedLine
    .replace(/\b(?:ad|ads|sponsored|gesponsert|gesponsord|patrocinado|sponsorise|sponsorise|sponsorisé|sponsorizzato)\b/g, " ")
    .replace(/[|:·•]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const urlMatches =
    lineWithoutHeaderLabels.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?/gi) ?? [];

  if (!urlMatches.length) {
    return false;
  }

  const remainder = lineWithoutHeaderLabels
    .replace(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?/gi, " ")
    .replace(/[./\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return !remainder;
}

function cleanGoogleBrandUrl(value: string | null | undefined) {
  const normalized = value?.trim().replace(/^https?:\/\//i, "").toLowerCase() ?? "";
  const hostname = extractHostnameFromWebsite(normalized);

  if (
    !normalized ||
    hostname === "object.create" ||
    normalized.includes("adstransparency.google.com") ||
    normalized.includes("googleadservices.com") ||
    normalized.includes("googlesyndication.com") ||
    normalized.includes("googleusercontent.com") ||
    normalized.includes("doubleclick.net") ||
    normalized.includes("gstatic.com")
  ) {
    return null;
  }

  return normalized;
}

function extractGoogleBrandUrlFromOcrText(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 6)) {
    const match = line.match(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:\/[^\s"'<>]*)?/i);
    const brandUrl = cleanGoogleBrandUrl(match?.[0]);

    if (brandUrl) {
      return brandUrl;
    }
  }

  return null;
}

function withGoogleBrandUrlMetadata(ad: NormalizedAd, brandUrl: string | null) {
  const metadata = cloneMetadataRecord(ad.metadata);

  if (brandUrl) {
    metadata.googleBrandUrl = brandUrl;
  } else if ("googleBrandUrl" in metadata && !cleanGoogleBrandUrl(typeof metadata.googleBrandUrl === "string" ? metadata.googleBrandUrl : null)) {
    delete metadata.googleBrandUrl;
  }

  return {
    ...ad,
    metadata,
  } satisfies NormalizedAd;
}

function isGoogleShortHeaderNoiseLine(line: string) {
  const normalizedLine = normalizeOcrComparisonText(line);

  if (!normalizedLine) {
    return line.trim().length > 0 && line.trim().length <= 4;
  }

  return /^[a-z0-9=]{1,2}$/i.test(normalizedLine);
}

function isGoogleAdvertiserHeaderLine(
  line: string,
  nextLine: string | undefined,
  secondNextLine: string | undefined,
  brandHints: Set<string>,
) {
  if (!brandHints.size) {
    return false;
  }

  const normalizedLine = normalizeOcrComparisonText(line.replace(/^[<[{(|]+/g, "")).replace(/^[a-z]\s+/i, "");

  if (!normalizedLine || normalizedLine.length > 48) {
    return false;
  }

  const matchesBrandHint = [...brandHints].some(
    (hint) =>
      normalizedLine === hint ||
      normalizedLine.includes(` ${hint}`) ||
      normalizedLine.startsWith(`${hint}.`) ||
      normalizedLine.startsWith(`www.${hint}.`) ||
      normalizedLine.endsWith(` ${hint}`) ||
      normalizedLine.includes(hint),
  );

  if (!matchesBrandHint) {
    return false;
  }

  if (!nextLine) {
    return true;
  }

  if (isGoogleUrlHeaderLine(nextLine) || isGoogleSponsoredHeaderLine(nextLine)) {
    return true;
  }

  if (!secondNextLine) {
    return false;
  }

  return isGoogleShortHeaderNoiseLine(nextLine) && isGoogleUrlHeaderLine(secondNextLine);
}

function shouldOverwriteGoogleCopy(ad: NormalizedAd, force: boolean) {
  if (force) {
    return true;
  }

  const metadata = cloneMetadataRecord(ad.metadata);
  return Boolean(getExistingOcrMetadata(metadata));
}

export function extractGoogleCreativeLines(ad: NormalizedAd, normalizedText: string) {
  const brandHints = getGoogleOcrAdvertiserBrandHints(ad);
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let headerStripped = false;

  while (lines.length > 1) {
    const currentLine = lines[0];
    const nextLine = lines[1];
    const secondNextLine = lines[2];

    if (isGoogleSponsoredHeaderLine(currentLine) || isGoogleUrlHeaderLine(currentLine)) {
      lines.shift();
      headerStripped = true;
      continue;
    }

    if (headerStripped && isGoogleShortHeaderNoiseLine(currentLine)) {
      lines.shift();
      continue;
    }

    if (isGoogleAdvertiserHeaderLine(currentLine, nextLine, secondNextLine, brandHints)) {
      lines.shift();
      headerStripped = true;
      continue;
    }

    break;
  }

  return lines;
}

function isLikelyGoogleHeadlineContinuation(line: string, remainingLineCount: number) {
  const normalizedLine = line.trim();

  if (remainingLineCount < 2 || normalizedLine.length < 4 || normalizedLine.length > 64) {
    return false;
  }

  const endsWithTruncation = /(?:\.{2,}|…)$/.test(normalizedLine);
  const sentencePunctuationCount = (normalizedLine.match(/[.!?]/g) ?? []).length;

  if (/[.!?,;:]$/.test(normalizedLine) && !endsWithTruncation) {
    return false;
  }

  if (sentencePunctuationCount >= 2 && !/[—-]/.test(normalizedLine)) {
    return false;
  }

  const alphaWords = normalizedLine.match(/[A-Za-z][A-Za-z0-9&+-]*/g) ?? [];

  if (!alphaWords.length) {
    return /\d/.test(normalizedLine);
  }

  const titleishWords = alphaWords.filter((word) => /^[A-Z0-9]/.test(word));
  const titleishRatio = titleishWords.length / alphaWords.length;

  return titleishRatio >= 0.45;
}

export function extractGoogleCreativeCopyCandidates(creativeLines: string[]) {
  if (!creativeLines.length) {
    return {
      titleCandidate: null,
      bodyCandidate: null,
    };
  }

  const titleLines = [creativeLines[0]];
  let bodyStartIndex = 1;

  while (
    bodyStartIndex < creativeLines.length &&
    isLikelyGoogleHeadlineContinuation(creativeLines[bodyStartIndex], creativeLines.length - bodyStartIndex)
  ) {
    titleLines.push(creativeLines[bodyStartIndex]);
    bodyStartIndex += 1;
  }

  return {
    titleCandidate: titleLines.join(" ").slice(0, 255),
    bodyCandidate: creativeLines.slice(bodyStartIndex).join("\n") || null,
  };
}

function buildGoogleAdOcrMetadata(input: {
  status: GoogleAdOcrStatus;
  assetFingerprint: string;
  confidence: number | null;
  extractedText: string | null;
  titleCandidate: string | null;
  bodyCandidate: string | null;
  error?: string | null;
}) {
  return {
    engine: googleAdOcrEngine,
    version: googleAdOcrVersion,
    languages: [...googleAdOcrLanguages],
    status: input.status,
    confidence: input.confidence,
    extractedText: input.extractedText,
    titleCandidate: input.titleCandidate,
    bodyCandidate: input.bodyCandidate,
    assetFingerprint: input.assetFingerprint,
    processedAt: new Date().toISOString(),
    error: input.error ?? null,
  } satisfies GoogleAdOcrMetadata;
}

function applyGoogleAdOcrMetadata(ad: NormalizedAd, metadata: GoogleAdOcrMetadata) {
  return {
    ...ad,
    metadata: {
      ...cloneMetadataRecord(ad.metadata),
      ocr: metadata,
    },
  } satisfies NormalizedAd;
}

async function processGoogleAdWithOcr(
  ad: NormalizedAd,
  slot: OcrWorkerSlot,
  timeoutMs: number,
  force: boolean,
) {
  const mergedMetadata = cloneMetadataRecord(ad.metadata);

  if (!shouldRunOcrForGoogleAd({
    ...ad,
    metadata: mergedMetadata,
  })) {
    return {
      ad: {
        ...ad,
        metadata: mergedMetadata,
      },
      status: "skipped_non_image" as const,
    };
  }

  const imageAsset = getGoogleStoredImageAsset({
    ...ad,
    metadata: mergedMetadata,
  });

  if (!imageAsset) {
    const nextAd = applyGoogleAdOcrMetadata(
      withGoogleBrandUrlMetadata(
        {
          ...ad,
          metadata: mergedMetadata,
        },
        null,
      ),
      buildGoogleAdOcrMetadata({
        status: "skipped_non_image",
        assetFingerprint: "non-image",
        confidence: null,
        extractedText: null,
        titleCandidate: null,
        bodyCandidate: null,
      }),
    );

    return {
      ad: nextAd,
      status: "skipped_non_image" as const,
    };
  }

  if (
    shouldSkipOcrForCurrentAsset(mergedMetadata, imageAsset.fingerprint, force) ||
    hasReusablePersistedGoogleCopy(
      {
        ...ad,
        metadata: mergedMetadata,
      },
      force,
    )
  ) {
    return {
      ad: {
        ...ad,
        metadata: mergedMetadata,
      },
      status: "reused" as const,
    };
  }

  try {
    const imageBuffer = await loadStoredImageBuffer(imageAsset);
    const preparedImage = await preprocessOcrImage(imageBuffer);
    const result = await recognizeWithOcrWorker(slot, preparedImage, timeoutMs);
    const normalizedText = normalizeOcrText(result.data.text ?? "");
    const googleBrandUrl = extractGoogleBrandUrlFromOcrText(normalizedText);
    const confidence = Number.isFinite(result.data.confidence) ? result.data.confidence : null;
    const shouldOverwriteCopy = shouldOverwriteGoogleCopy(
      {
        ...ad,
        metadata: mergedMetadata,
      },
      force,
    );

    if (!normalizedText) {
      return {
        ad: applyGoogleAdOcrMetadata(
          withGoogleBrandUrlMetadata(
            {
              ...ad,
              metadata: mergedMetadata,
            },
            googleBrandUrl,
          ),
          buildGoogleAdOcrMetadata({
            status: "no_text",
            assetFingerprint: imageAsset.fingerprint,
            confidence,
            extractedText: null,
            titleCandidate: null,
            bodyCandidate: null,
          }),
        ),
        status: "no_text" as const,
      };
    }

    const creativeLines = extractGoogleCreativeLines(ad, normalizedText);
    const extractedCreativeText = creativeLines.join("\n");

    if (!extractedCreativeText) {
      return {
        ad: applyGoogleAdOcrMetadata(
          withGoogleBrandUrlMetadata(
            {
              ...ad,
              metadata: mergedMetadata,
            },
            googleBrandUrl,
          ),
          buildGoogleAdOcrMetadata({
            status: "no_text",
            assetFingerprint: imageAsset.fingerprint,
            confidence,
            extractedText: null,
            titleCandidate: null,
            bodyCandidate: null,
          }),
        ),
        status: "no_text" as const,
      };
    }

    const { titleCandidate, bodyCandidate } = extractGoogleCreativeCopyCandidates(creativeLines);

    if ((confidence ?? 0) < googleAdOcrMinConfidence || extractedCreativeText.length < googleAdOcrMinTextLength) {
      return {
        ad: applyGoogleAdOcrMetadata(
          withGoogleBrandUrlMetadata(
            {
              ...ad,
              metadata: mergedMetadata,
            },
            googleBrandUrl,
          ),
          buildGoogleAdOcrMetadata({
            status: "low_confidence",
            assetFingerprint: imageAsset.fingerprint,
            confidence,
            extractedText: extractedCreativeText,
            titleCandidate,
            bodyCandidate,
          }),
        ),
        status: "low_confidence" as const,
      };
    }

    return {
      ad: applyGoogleAdOcrMetadata(
        withGoogleBrandUrlMetadata(
          {
            ...ad,
            title:
              !shouldOverwriteCopy && hasUsableCopy(ad.title)
                ? ad.title
                : titleCandidate ?? ad.title ?? undefined,
            body:
              !shouldOverwriteCopy && hasUsableCopy(ad.body)
                ? ad.body
                : bodyCandidate ?? ad.body ?? undefined,
            metadata: mergedMetadata,
          },
          googleBrandUrl,
        ),
        buildGoogleAdOcrMetadata({
          status: "completed",
          assetFingerprint: imageAsset.fingerprint,
          confidence,
          extractedText: extractedCreativeText,
          titleCandidate,
          bodyCandidate,
        }),
      ),
      status: "completed" as const,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown Google OCR failure.";

    return {
      ad: applyGoogleAdOcrMetadata(
        {
          ...ad,
          metadata: mergedMetadata,
        },
        buildGoogleAdOcrMetadata({
          status: "failed",
          assetFingerprint: imageAsset.fingerprint,
          confidence: null,
          extractedText: null,
          titleCandidate: null,
          bodyCandidate: null,
          error: errorMessage,
        }),
      ),
      status: "failed" as const,
    };
  }
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, slotIndex: number) => Promise<void>) {
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length || 1) }, async (_unused, slotIndex) => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        await worker(items[currentIndex], slotIndex);
      }
    }),
  );
}

function buildStatsSummary() {
  return {
    ...defaultStats,
  };
}

export async function prepareGoogleAdsForPersistence({
  advertiserId,
  ads,
  concurrency = googleAdOcrConcurrency,
  force = false,
  timeoutMs = googleAdOcrTimeoutMs,
}: PrepareGoogleAdsForPersistenceOptions) {
  const googleAds = ads.filter((ad) => ad.source === "google");

  if (!googleAds.length) {
    return {
      ads,
      stats: buildStatsSummary(),
    };
  }

  const persistenceStateById = await listAdPersistenceStateByIds(
    googleAds.map((ad) => getAdId(advertiserId, ad)),
  );

  const mergedAds = ads.map((ad) => {
    if (ad.source !== "google") {
      return ad;
    }

    const persistedState = persistenceStateById.get(getAdId(advertiserId, ad));
    const metadata = mergeMetadataRecords(persistedState?.metadata, ad.metadata);

    return {
      ...ad,
      title: pickPersistedCopy(ad.title, persistedState?.title ?? null),
      body: pickPersistedCopy(ad.body, persistedState?.body ?? null),
      metadata,
    } satisfies NormalizedAd;
  });

  return enrichGoogleAdsWithOcr(mergedAds, {
    concurrency,
    force,
    timeoutMs,
  });
}

export async function enrichGoogleAdsWithOcr(
  ads: NormalizedAd[],
  options: EnrichGoogleAdsWithOcrOptions = {},
) {
  const concurrency = options.concurrency ?? googleAdOcrConcurrency;
  const timeoutMs = options.timeoutMs ?? googleAdOcrTimeoutMs;
  const force = options.force ?? false;
  const nextAds = [...ads];
  const stats = buildStatsSummary();
  const ocrCandidates = ads
    .map((ad, index) => ({ ad, index }))
    .filter(({ ad }) => ad.source === "google" && shouldRunOcrForGoogleAd(ad));

  if (!ocrCandidates.length) {
    return {
      ads,
      stats,
    };
  }

  stats.scanned = ocrCandidates.length;

  await runPool(ocrCandidates, concurrency, async ({ ad, index }, slotIndex) => {
    const result = await processGoogleAdWithOcr(ad, ocrWorkerSlots[slotIndex], timeoutMs, force);
    nextAds[index] = result.ad;

    switch (result.status) {
      case "completed":
        stats.completed += 1;
        break;
      case "low_confidence":
        stats.lowConfidence += 1;
        break;
      case "no_text":
        stats.noText += 1;
        break;
      case "skipped_non_image":
        stats.skippedNonImage += 1;
        break;
      case "failed":
        stats.failed += 1;
        break;
      case "reused":
        stats.reused += 1;
        break;
      default:
        break;
    }
  });

  return {
    ads: nextAds,
    stats,
  };
}
