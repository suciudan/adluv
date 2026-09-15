import { createHash } from "node:crypto";

import type { LandingPageSnapshot, SourceName } from "./types";

const advertiserNoiseTokens = new Set([
  "ad",
  "ads",
  "advertising",
  "app",
  "apps",
  "brand",
  "brands",
  "co",
  "company",
  "corp",
  "corporation",
  "global",
  "group",
  "holding",
  "holdings",
  "hq",
  "inc",
  "incorporated",
  "lab",
  "labs",
  "limited",
  "llc",
  "ltd",
  "official",
  "plc",
  "sa",
  "services",
  "software",
  "solutions",
  "studio",
  "studios",
  "systems",
  "technologies",
  "technology",
]);

const trustedDomainBrandContextTokens = new Set([
  "ab",
  "ag",
  "apac",
  "bhd",
  "bv",
  "com",
  "dach",
  "emea",
  "eu",
  "gmbh",
  "international",
  "io",
  "kft",
  "kk",
  "latam",
  "llp",
  "lp",
  "net",
  "nv",
  "org",
  "oy",
  "pte",
  "pty",
  "sas",
  "sasu",
  "sarl",
  "se",
  "sl",
  "spa",
  "srl",
  "sro",
  "uk",
  "us",
  "usa",
  "zrt",
]);

const trustedRegionTokens = new Set(
  [
    "africa",
    "america",
    "americas",
    "argentina",
    "asia",
    "australia",
    "austria",
    "belgium",
    "brazil",
    "britain",
    "bulgaria",
    "canada",
    "china",
    "croatia",
    "czech",
    "denmark",
    "east",
    "eastern",
    "europe",
    "european",
    "finland",
    "france",
    "germany",
    "greece",
    "hong",
    "hungary",
    "india",
    "indonesia",
    "ireland",
    "israel",
    "italia",
    "italy",
    "japan",
    "kong",
    "korea",
    "malaysia",
    "mexico",
    "middle",
    "netherlands",
    "new",
    "north",
    "norway",
    "philippines",
    "poland",
    "portugal",
    "romania",
    "singapore",
    "slovakia",
    "south",
    "spain",
    "sweden",
    "switzerland",
    "taiwan",
    "thailand",
    "turkey",
    "united",
    "vietnam",
    "west",
    "western",
    "zealand",
  ].map((token) => normalizeAdvertiserText(token)),
);

export function buildSourceScopedId(source: SourceName, sourceEntityId: string) {
  return createHash("sha1").update(`${source}:${sourceEntityId.trim()}`).digest("hex");
}

export function normalizeAdvertiserText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenizeAdvertiserText(value: string) {
  return normalizeAdvertiserText(value)
    .split(/\s+/)
    .filter(Boolean);
}

export function isAdvertiserNoiseToken(token: string) {
  return advertiserNoiseTokens.has(token);
}

export function buildAdvertiserCoreTokens(value: string) {
  return tokenizeAdvertiserText(value).filter((token) => !isAdvertiserNoiseToken(token));
}

export function normalizeAdvertiserCoreText(value: string) {
  const coreTokens = buildAdvertiserCoreTokens(value);

  return coreTokens.length ? coreTokens.join(" ") : normalizeAdvertiserText(value);
}

export function compactAdvertiserText(value: string) {
  return normalizeAdvertiserText(value).replace(/\s+/g, "");
}

export function buildAdvertiserAcronym(value: string) {
  return buildAdvertiserCoreTokens(value)
    .map((token) => token[0] ?? "")
    .join("");
}

function getDomainBrandLabel(normalizedDomain: string) {
  const labels = normalizedDomain
    .split(".")
    .map((label) => label.trim())
    .filter(Boolean);

  return labels[0] ?? normalizedDomain;
}

function isTrustedDomainBrandContextToken(token: string) {
  return trustedDomainBrandContextTokens.has(token) || trustedRegionTokens.has(token);
}

function getCompactSuffixTokensAfterPrefix(tokens: string[], compactPrefix: string) {
  let compactValue = "";

  for (let index = 0; index < tokens.length; index += 1) {
    compactValue += compactAdvertiserText(tokens[index] ?? "");

    if (compactValue === compactPrefix) {
      return tokens.slice(index + 1);
    }

    if (!compactPrefix.startsWith(compactValue)) {
      return tokens;
    }
  }

  return [];
}

export function isPlausibleDomainAdvertiserNameMatch(input: {
  normalizedDomain: string;
  candidateName: string;
}) {
  const brandLabel = getDomainBrandLabel(input.normalizedDomain);
  const brandCoreTokens = buildAdvertiserCoreTokens(brandLabel.replace(/[-_]+/g, " "));
  const candidateCoreTokens = buildAdvertiserCoreTokens(input.candidateName);

  if (!brandCoreTokens.length || !candidateCoreTokens.length) {
    return false;
  }

  const brandCompact = compactAdvertiserText(brandLabel);
  const candidateCompact = compactAdvertiserText(input.candidateName);

  if (brandCompact && candidateCompact === brandCompact) {
    return true;
  }

  if (brandCompact && candidateCompact.startsWith(brandCompact)) {
    const compactSuffix = candidateCompact.slice(brandCompact.length);
    const suffixTokens = getCompactSuffixTokensAfterPrefix(candidateCoreTokens, brandCompact);

    if (compactSuffix && compactSuffix === suffixTokens.filter(isTrustedDomainBrandContextToken).join("")) {
      return true;
    }
  }

  const hasBrandPrefix = brandCoreTokens.every((token, index) => candidateCoreTokens[index] === token);

  if (!hasBrandPrefix) {
    return false;
  }

  const extraTokens = candidateCoreTokens.slice(brandCoreTokens.length);

  return !extraTokens.length || extraTokens.every(isTrustedDomainBrandContextToken);
}

export function isE2eFixtureMode() {
  return process.env.adluv_E2E_FIXTURE_MODE === "1";
}

export function isValidSourceAdvertiserId(source: SourceName, sourceAdvertiserId: string) {
  const trimmed = sourceAdvertiserId.trim();

  if (!trimmed) {
    return false;
  }

  if (source === "facebook") {
    return /^\d{5,}$/.test(trimmed);
  }

  if (source === "google") {
    return /^AR[0-9A-Z]{12,}$/i.test(trimmed);
  }

  return true;
}

export async function fetchLandingPageSnapshot(url: string): Promise<LandingPageSnapshot> {
  const capturedAt = new Date();

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "AdluvBot/1.0 (+https://adluv.io)",
      },
    });

    const resolvedUrl = response.url || url;
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok || (contentType && !contentType.toLowerCase().includes("text/html"))) {
      return {
        url: resolvedUrl,
        capturedAt,
      };
    }

    const html = (await response.text()).slice(0, 512_000);
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]
      ?.replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return {
      url: resolvedUrl,
      title: title || undefined,
      html,
      capturedAt,
    };
  } catch {
    return {
      url,
      capturedAt,
    };
  }
}

export async function fetchPlaceholderLandingPageSnapshot(url: string): Promise<LandingPageSnapshot> {
  return {
    url,
    capturedAt: new Date(),
  };
}
