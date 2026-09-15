const ignoredAdvertiserDomains = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "reddit.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "wikipedia.org",
  "google.com",
  "doubleclick.net",
  "googlesyndication.com",
  "googleadservices.com",
]);

const advertiserLegalSuffixPattern =
  /\b(incorporated|inc|llc|l\.?l\.?c|ltd|limited|corp|corporation|co|company|gmbh|s\.?a\.?|s\.?l\.?|s\.?e\.?|k\.?g\.?|ag|bv|plc|pty)\.?$/i;

const advertiserBrandContextSuffixes = new Set([
  "apac",
  "crm",
  "design",
  "emea",
  "group",
  "holding",
  "holdings",
  "lab",
  "labs",
  "latam",
  "media",
  "official",
  "se",
]);

const advertiserBrandContextPrefixes = new Set([
  "intuit",
]);

const weakAdvertiserBrandKeys = new Set([
  "ads",
  "advertising",
  "business",
  "company",
  "official",
  "page",
  "profile",
  "the",
]);

function ensureUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    try {
      return new URL(`https://${value}`);
    } catch {
      return null;
    }
  }
}

export function extractHostnameFromWebsite(value: string | null | undefined) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  const parsedUrl = ensureUrl(trimmedValue);

  if (!parsedUrl) {
    return null;
  }

  return parsedUrl.hostname.trim().toLowerCase().replace(/^www\./, "") || null;
}

export function extractRegistrableDomain(hostname: string | null | undefined) {
  const trimmedHostname = hostname?.trim().toLowerCase().replace(/^www\./, "");

  if (!trimmedHostname) {
    return null;
  }

  const labels = trimmedHostname
    .split(".")
    .map((label) => label.trim())
    .filter(Boolean);

  if (!labels.length) {
    return null;
  }

  if (labels.length <= 2) {
    return labels.join(".");
  }

  const secondLevelLabels = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
  const topLevel = labels.at(-1) ?? "";
  const secondLevel = labels.at(-2) ?? "";

  if (topLevel.length === 2 && secondLevelLabels.has(secondLevel)) {
    return labels.slice(-3).join(".");
  }

  return labels.slice(-2).join(".");
}

export function normalizeAdvertiserWebsite(value: string | null | undefined) {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return {
      websiteUrl: null,
      normalizedDomain: null,
    };
  }

  const parsedUrl = ensureUrl(trimmedValue);

  if (!parsedUrl) {
    return {
      websiteUrl: null,
      normalizedDomain: null,
    };
  }

  parsedUrl.hash = "";
  parsedUrl.username = "";
  parsedUrl.password = "";
  const hostname = parsedUrl.hostname.trim().toLowerCase().replace(/^www\./, "");

  if (!hostname) {
    return {
      websiteUrl: null,
      normalizedDomain: null,
    };
  }

  parsedUrl.hostname = hostname;
  const normalizedDomain = extractRegistrableDomain(hostname);

  return {
    websiteUrl: parsedUrl.toString(),
    normalizedDomain,
  };
}

export function isIgnoredAdvertiserDomain(domain: string | null | undefined) {
  const normalizedDomain = domain?.trim().toLowerCase();

  if (!normalizedDomain) {
    return false;
  }

  return (
    ignoredAdvertiserDomains.has(normalizedDomain) ||
    [...ignoredAdvertiserDomains].some((candidate) => normalizedDomain.endsWith(`.${candidate}`))
  );
}

export function buildPublicAdvertiserId(input: {
  companyId?: string | null;
  advertiserId?: string | null;
}) {
  if (input.companyId) {
    return `company_${input.companyId}`;
  }

  if (input.advertiserId) {
    return `advertiser_${input.advertiserId}`;
  }

  throw new Error("A public advertiser id requires either a companyId or advertiserId.");
}

export function parsePublicAdvertiserId(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.startsWith("company_")) {
    return {
      kind: "company" as const,
      id: trimmedValue.slice("company_".length),
    };
  }

  if (trimmedValue.startsWith("advertiser_")) {
    return {
      kind: "advertiser" as const,
      id: trimmedValue.slice("advertiser_".length),
    };
  }

  return null;
}

function normalizeAdvertiserDisplayName(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function stripAdvertiserLegalSuffixes(value: string | null | undefined) {
  let normalizedValue = normalizeAdvertiserDisplayName(value);

  if (!normalizedValue) {
    return "";
  }

  while (advertiserLegalSuffixPattern.test(normalizedValue)) {
    normalizedValue = normalizedValue.replace(advertiserLegalSuffixPattern, "").trim().replace(/[.,]+$/g, "");
  }

  return normalizedValue;
}

export function hasAdvertiserLegalSuffix(value: string | null | undefined) {
  const normalizedValue = normalizeAdvertiserDisplayName(value);

  if (!normalizedValue) {
    return false;
  }

  return stripAdvertiserLegalSuffixes(normalizedValue).toLowerCase() !== normalizedValue.toLowerCase();
}

export function normalizeAdvertiserBrandKey(value: string | null | undefined) {
  const normalizedValue = stripAdvertiserLegalSuffixes(value)
    .replace(/\([^)]*\)/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(powered by|by)\b.*$/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  if (!normalizedValue) {
    return null;
  }

  const tokens = normalizedValue.split(/\s+/).filter(Boolean);

  while (
    tokens.length > 1 &&
    advertiserBrandContextPrefixes.has(tokens[0] ?? "")
  ) {
    tokens.shift();
  }

  while (
    tokens.length > 1 &&
    (tokens[tokens.length - 1] === "and" || tokens[tokens.length - 1] === "co")
  ) {
    tokens.pop();
  }

  while (
    tokens.length > 1 &&
    advertiserBrandContextSuffixes.has(tokens[tokens.length - 1] ?? "")
  ) {
    tokens.pop();
  }

  const key = tokens.join("-");

  if (!key || key.length < 3 || weakAdvertiserBrandKeys.has(key)) {
    return null;
  }

  return key;
}

export function shouldPreferAdvertiserDisplayName(
  candidate: string | null | undefined,
  current: string | null | undefined,
) {
  const normalizedCandidate = normalizeAdvertiserDisplayName(candidate);
  const normalizedCurrent = normalizeAdvertiserDisplayName(current);

  if (!normalizedCandidate) {
    return false;
  }

  if (!normalizedCurrent) {
    return true;
  }

  const candidateBaseName = stripAdvertiserLegalSuffixes(normalizedCandidate).toLowerCase();
  const currentBaseName = stripAdvertiserLegalSuffixes(normalizedCurrent).toLowerCase();

  if (candidateBaseName && currentBaseName && candidateBaseName === currentBaseName) {
    const candidateHasLegalSuffix = hasAdvertiserLegalSuffix(normalizedCandidate);
    const currentHasLegalSuffix = hasAdvertiserLegalSuffix(normalizedCurrent);

    if (candidateHasLegalSuffix !== currentHasLegalSuffix) {
      return !candidateHasLegalSuffix;
    }

    if (normalizedCandidate.length !== normalizedCurrent.length) {
      return normalizedCandidate.length < normalizedCurrent.length;
    }
  }

  return false;
}

type AdvertiserBrandCandidate = {
  canonicalName: string;
  logoUrl?: string | null;
  totalAds?: number | null;
  lastIndexedAt?: Date | null;
};

export function compareAdvertiserBrandCandidates(
  left: AdvertiserBrandCandidate,
  right: AdvertiserBrandCandidate,
) {
  if (shouldPreferAdvertiserDisplayName(left.canonicalName, right.canonicalName)) {
    return -1;
  }

  if (shouldPreferAdvertiserDisplayName(right.canonicalName, left.canonicalName)) {
    return 1;
  }

  if (Boolean(left.logoUrl) !== Boolean(right.logoUrl)) {
    return left.logoUrl ? -1 : 1;
  }

  const totalAdsDelta = (right.totalAds ?? 0) - (left.totalAds ?? 0);

  if (totalAdsDelta !== 0) {
    return totalAdsDelta;
  }

  const lastIndexedAtDelta = (right.lastIndexedAt?.getTime() ?? 0) - (left.lastIndexedAt?.getTime() ?? 0);

  if (lastIndexedAtDelta !== 0) {
    return lastIndexedAtDelta;
  }

  return normalizeAdvertiserDisplayName(left.canonicalName).localeCompare(
    normalizeAdvertiserDisplayName(right.canonicalName),
  );
}

export function pickBestAdvertiserBrandCandidate<T extends AdvertiserBrandCandidate>(candidates: T[]) {
  return [...candidates].sort(compareAdvertiserBrandCandidates)[0] ?? null;
}
