const metadataFetchTimeoutMs = 4_500;
const maxMetadataHtmlChars = 512_000;

const weakSummaryPrefixes = [
  "categories:",
  "public meta advertiser profile",
  "verified google ads advertiser profile",
  "deterministic google ads advertiser fixture",
  "deterministic meta advertiser fixture",
  "deterministic linkedin advertiser fixture",
];

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function normalizeMetadataText(value: string | null | undefined) {
  const normalized = decodeHtmlEntities(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length >= 24 ? normalized : null;
}

function normalizeWebsiteUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value.startsWith("http://") || value.startsWith("https://") ? value : `https://${value}`);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function getMetaTagAttribute(tag: string, attribute: string) {
  const pattern = new RegExp(`${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i");
  const match = tag.match(pattern);

  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function extractMetadataDescription(html: string) {
  const candidates: Array<{ key: string; content: string }> = [];

  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (getMetaTagAttribute(tag, "property") ?? getMetaTagAttribute(tag, "name") ?? "").toLowerCase();
    const content = normalizeMetadataText(getMetaTagAttribute(tag, "content"));

    if (key && content) {
      candidates.push({ key, content });
    }
  }

  for (const key of ["og:description", "description", "twitter:description"]) {
    const description = candidates.find((candidate) => candidate.key === key)?.content;

    if (description) {
      return description;
    }
  }

  return null;
}

export function isWeakAdvertiserSummary(summary: string | null | undefined) {
  const normalized = normalizeMetadataText(summary);

  if (!normalized) {
    return true;
  }

  const normalizedLower = normalized.toLowerCase();

  return weakSummaryPrefixes.some((prefix) => normalizedLower.startsWith(prefix));
}

export async function fetchWebsiteMetadataDescription(websiteUrl: string | null | undefined) {
  const url = normalizeWebsiteUrl(websiteUrl);

  if (!url) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), metadataFetchTimeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "AdluvBot/1.0 (+https://adluv.io)",
      },
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType && !contentType.toLowerCase().includes("text/html")) {
      return null;
    }

    const html = (await response.text()).slice(0, maxMetadataHtmlChars);
    return extractMetadataDescription(html);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveAdvertiserSummary(input: {
  websiteUrl?: string | null;
  currentSummary?: string | null;
  fallbackSummary?: string | null;
}) {
  const currentSummary = normalizeMetadataText(input.currentSummary);

  if (!isWeakAdvertiserSummary(currentSummary)) {
    return currentSummary;
  }

  const websiteDescription = await fetchWebsiteMetadataDescription(input.websiteUrl);

  if (websiteDescription) {
    return websiteDescription;
  }

  const fallbackSummary = normalizeMetadataText(input.fallbackSummary);

  if (!isWeakAdvertiserSummary(fallbackSummary)) {
    return fallbackSummary;
  }

  return fallbackSummary ?? null;
}
