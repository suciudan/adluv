import { normalizeAdvertiserWebsite, isIgnoredAdvertiserDomain } from "@adluv/db";
import {
  buildAdvertiserCoreTokens,
  isPlausibleDomainAdvertiserNameMatch,
  normalizeAdvertiserCoreText,
  normalizeAdvertiserText,
  type AdvertiserMatch,
  type SourceName,
} from "@adluv/source-adapters";

import { sortAdvertiserSearchResults } from "./advertiser-search-ranking";

const minAdvertiserQueryLength = 2;

export type SearchResultItem = {
  id: string;
  source: SourceName;
  sourceAdvertiserId: string;
  canonicalName: string;
  profileUrl?: string;
  websiteUrl?: string;
  logoUrl?: string;
  industry?: string;
  companySize?: string;
  country?: string;
  summary?: string;
  companyKey?: string | null;
  trackedCompanyId: string | null;
  trackedStatus: "pending_initial_index" | "active" | "retryable_error" | "paused" | null;
};

export type CompanyProviderStatus = "matched" | "searching" | "no_match" | "failed";

export type CompanyProvider = {
  source: SourceName;
  status: CompanyProviderStatus;
  result: SearchResultItem | null;
};

export type CompanyCard = {
  companyKey: string;
  displayName: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  domain: string | null;
  description: string | null;
  matchedProviderCount: number;
  providers: Record<"facebook" | "linkedin" | "google", CompanyProvider>;
  fullyResolved: boolean;
};

export type TrackableCompanyResult = {
  advertiserId: string;
  source: SourceName;
  sourceAdvertiserId: string;
  companyKey: string;
  rankScore: number;
  canonicalName: string;
  profileUrl: string | null;
  logoUrl: string | null;
  industry: string | null;
  companySize: string | null;
  country: string | null;
  summary: string | null;
};

function stripTrailingUrlPunctuation(value: string) {
  return value.trim().replace(/[),.;\]]+$/g, "");
}

function normalizeUrlishValue(value: string) {
  const trimmed = stripTrailingUrlPunctuation(value);

  if (!trimmed) {
    return "";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return trimmed.replace(/^https?:\/\//i, "");
}

function parseInputUrl(value: string) {
  const trimmed = stripTrailingUrlPunctuation(value);

  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

function buildDomainDisplayName(normalizedDomain: string) {
  const label = normalizedDomain.split(".")[0] ?? normalizedDomain;

  return label
    .replace(/[-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function buildDomainLogoUrl(normalizedDomain: string) {
  return `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(`https://${normalizedDomain}`)}`;
}

export function getSearchInputDomain(value: string) {
  const rawValue = normalizeUrlishValue(value);
  const parsedUrl = parseInputUrl(rawValue);

  if (!parsedUrl) {
    return null;
  }

  const isExplicitUrl = /^https?:\/\//i.test(rawValue);
  const hostname = parsedUrl.hostname.toLowerCase();

  if (!isExplicitUrl && !hostname.includes(".")) {
    return null;
  }

  const normalized = normalizeAdvertiserWebsite(rawValue);
  const normalizedDomain = normalized.normalizedDomain;

  if (!normalizedDomain || isIgnoredAdvertiserDomain(normalizedDomain)) {
    return null;
  }

  return {
    websiteUrl: normalized.websiteUrl ?? `https://${normalizedDomain}/`,
    normalizedDomain,
    displayName: buildDomainDisplayName(normalizedDomain),
    brandQuery: normalizedDomain.split(".")[0] ?? normalizedDomain,
  };
}

export function buildSearchQueryVariants(query: string) {
  const inputDomain = getSearchInputDomain(query);
  const variants = [query.trim()];
  const normalizedQuery = normalizeAdvertiserText(query);
  const coreQuery = normalizeAdvertiserCoreText(query);
  const dominantTokenQuery = buildAdvertiserCoreTokens(query).slice(0, 2).join(" ");

  for (const candidate of [
    inputDomain?.brandQuery,
    inputDomain?.normalizedDomain,
    coreQuery,
    normalizedQuery,
    dominantTokenQuery,
  ]) {
    if (!candidate) {
      continue;
    }

    const trimmedCandidate = candidate.trim();

    if (!trimmedCandidate || trimmedCandidate.length < minAdvertiserQueryLength) {
      continue;
    }

    if (variants.some((variant) => normalizeAdvertiserText(variant) === normalizeAdvertiserText(trimmedCandidate))) {
      continue;
    }

    variants.push(trimmedCandidate);
  }

  return variants;
}

export function buildCompanyKey(name: string) {
  const normalizedCore = normalizeAdvertiserCoreText(name);

  if (normalizedCore) {
    return normalizedCore;
  }

  const normalized = normalizeAdvertiserText(name);
  return normalized || "unknown";
}

export function buildCompanyKeyForSearchQuery(query: string) {
  return getSearchInputDomain(query)?.normalizedDomain ?? buildCompanyKey(query);
}

export function buildCompanyKeyForResult(input: {
  query: string;
  resultName: string;
  resultWebsiteUrl?: string | null;
}) {
  const resultDomain = normalizeAdvertiserWebsite(input.resultWebsiteUrl ?? null).normalizedDomain;

  if (resultDomain && !isIgnoredAdvertiserDomain(resultDomain)) {
    return resultDomain;
  }

  return getSearchInputDomain(input.query)?.normalizedDomain ?? buildCompanyKey(input.resultName);
}

function splitAdvertiserInputValues(input: string) {
  const urlMatches = [...input.matchAll(/https?:\/\/[^\s,]+/gi)].map((match) => stripTrailingUrlPunctuation(match[0]));
  let remainder = input;

  for (const match of urlMatches) {
    remainder = remainder.replace(match, " ");
  }

  const looseValues = remainder
    .split(/[\s,\n\r]+/)
    .map((value) => stripTrailingUrlPunctuation(value))
    .filter(Boolean);

  return [...urlMatches, ...looseValues].filter((value, index, values) => values.indexOf(value) === index);
}

function parseDirectAdvertiserInputLink(value: string) {
  const parsedUrl = parseInputUrl(value);

  if (!parsedUrl) {
    return null;
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = parsedUrl.pathname.toLowerCase();

  if (
    (hostname === "facebook.com" || hostname === "meta.com" || hostname.endsWith(".facebook.com")) &&
    (pathname.includes("/ads/library") || parsedUrl.searchParams.has("view_all_page_id") || parsedUrl.searchParams.has("id"))
  ) {
    return {
      source: "facebook" as const,
      value: stripTrailingUrlPunctuation(value),
    };
  }

  if (
    hostname === "adstransparency.google.com" &&
    (pathname.includes("/advertiser/") || /^ar[0-9a-z]{12,}$/i.test(stripTrailingUrlPunctuation(value)))
  ) {
    return {
      source: "google" as const,
      value: stripTrailingUrlPunctuation(value),
    };
  }

  if (
    (hostname === "linkedin.com" || hostname.endsWith(".linkedin.com")) &&
    (pathname.includes("/ad-library") || pathname.includes("/company/"))
  ) {
    return {
      source: "linkedin" as const,
      value: stripTrailingUrlPunctuation(value),
    };
  }

  return null;
}

export function parseAdvertiserTrackingInput(input: string) {
  const values = splitAdvertiserInputValues(input);
  const directLinks = values
    .map((value) => parseDirectAdvertiserInputLink(value))
    .filter((link): link is { source: "facebook" | "google" | "linkedin"; value: string } => Boolean(link));
  const directLinkValues = new Set(directLinks.map((link) => link.value));
  const companyDomains = values
    .filter((value) => !directLinkValues.has(value))
    .map((value) => getSearchInputDomain(value))
    .filter((domain): domain is NonNullable<ReturnType<typeof getSearchInputDomain>> => Boolean(domain));
  const invalidValues = values.filter((value) => !directLinkValues.has(value) && !getSearchInputDomain(value));
  const primaryCompanyDomain =
    companyDomains.find((domain, index, domains) =>
      domains.findIndex((candidate) => candidate.normalizedDomain === domain.normalizedDomain) === index,
    ) ?? null;

  return {
    values,
    primaryCompanyDomain,
    directLinks,
    invalidValues,
  };
}

export function buildDiscoveredCompanyFromDomain(domain: NonNullable<ReturnType<typeof getSearchInputDomain>>) {
  return {
    companyKey: domain.normalizedDomain,
    displayName: domain.displayName,
    websiteUrl: domain.websiteUrl,
    domain: domain.normalizedDomain,
    logoUrl: buildDomainLogoUrl(domain.normalizedDomain),
    description: null,
    rankScore: 10_000,
  };
}

export function buildProviderSearchDisplayQuery(input: {
  primaryCompanyDomain: NonNullable<ReturnType<typeof getSearchInputDomain>> | null;
  directMatches: Array<Pick<AdvertiserMatch, "canonicalName" | "websiteUrl" | "profileUrl">>;
  fallbackQuery: string;
}) {
  if (input.primaryCompanyDomain) {
    return input.primaryCompanyDomain.normalizedDomain;
  }

  for (const match of input.directMatches) {
    const websiteDomain = getSearchInputDomain(match.websiteUrl ?? "");

    if (websiteDomain) {
      return websiteDomain.normalizedDomain;
    }
  }

  const namedMatch = input.directMatches.find((match) => match.canonicalName.trim().length >= minAdvertiserQueryLength);

  return namedMatch?.canonicalName.trim() || input.fallbackQuery.trim();
}

export function selectBestCompanyResultsForTracking(results: TrackableCompanyResult[]) {
  const seenSources = new Set<SourceName>();
  const selected: TrackableCompanyResult[] = [];

  for (const result of results) {
    if (seenSources.has(result.source)) {
      continue;
    }

    seenSources.add(result.source);
    selected.push(result);
  }

  return selected;
}

export function isRateLimitProviderMessage(message: string) {
  return /rate\s*limit|rate-limited|\b429\b/i.test(message);
}

export function getAdvertiserSearchUserErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Advertiser search is temporarily unavailable.";
  }

  if (isRateLimitProviderMessage(error.message)) {
    return "Advertiser search is temporarily unavailable. Provider lookup is retrying through proxies.";
  }

  return error.message;
}

function getDefaultProviderStatus(source: SourceName): CompanyProvider {
  return {
    source,
    status: "searching",
    result: null,
  };
}

function getProviderStatus(
  source: SourceName,
  sourceStatuses: Map<SourceName, { status: string; errorMessage: string | null }>,
  hasMatch: boolean,
): CompanyProviderStatus {
  if (hasMatch) {
    return "matched";
  }

  const sourceStatus = sourceStatuses.get(source);

  if (!sourceStatus) {
    return "searching";
  }

  if (sourceStatus.status === "failed") {
    return "failed";
  }

  if (sourceStatus.status === "completed") {
    return "no_match";
  }

  return "searching";
}

export function resolveCompanyKeyForResult(input: {
  query: string;
  resultName: string;
  resultWebsiteUrl?: string | null;
  cachedCompanyKey?: string | null;
  existingCompanyKeys: Set<string>;
}) {
  if (input.cachedCompanyKey) {
    return input.cachedCompanyKey;
  }

  const directCompanyKey = buildCompanyKeyForResult({
    query: input.query,
    resultName: input.resultName,
    resultWebsiteUrl: input.resultWebsiteUrl,
  });

  if (input.existingCompanyKeys.has(directCompanyKey)) {
    return directCompanyKey;
  }

  const queryCompanyKey = buildCompanyKeyForSearchQuery(input.query);

  if (
    input.existingCompanyKeys.has(queryCompanyKey) &&
    (directCompanyKey === queryCompanyKey ||
      directCompanyKey.startsWith(`${queryCompanyKey} `) ||
      directCompanyKey.includes(` ${queryCompanyKey}`))
  ) {
    return queryCompanyKey;
  }

  return directCompanyKey;
}

function buildDomainBrand(domain: string | null) {
  if (!domain) {
    return "";
  }

  const labels = domain
    .split(".")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);

  if (!labels.length) {
    return "";
  }

  const registrableLabel = labels.length > 2 ? labels.at(-3) ?? labels[0] : labels[0] ?? "";
  return normalizeAdvertiserCoreText(registrableLabel.replace(/[-_]+/g, " "));
}

function hasConflictingDiscoveredCompanyContext(input: {
  query: string;
  result: SearchResultItem;
  discoveredCompany: {
    displayName: string;
    domain: string | null;
    description: string | null;
  };
}) {
  const companyContextTokens = new Set(
    buildAdvertiserCoreTokens(
      [
        input.query,
        input.discoveredCompany.displayName,
        buildDomainBrand(input.discoveredCompany.domain),
      ]
        .filter(Boolean)
        .join(" "),
    ),
  );
  const discoveredReferenceTokens = buildAdvertiserCoreTokens(
    [
      input.discoveredCompany.displayName,
      buildDomainBrand(input.discoveredCompany.domain),
      input.discoveredCompany.description ?? "",
    ].join(" "),
  ).filter((token) => !companyContextTokens.has(token));
  const resultReferenceTokens = buildAdvertiserCoreTokens(
    [
      input.result.canonicalName,
      input.result.industry ?? "",
      input.result.summary ?? "",
    ].join(" "),
  ).filter((token) => !companyContextTokens.has(token));

  if (discoveredReferenceTokens.length < 3 || resultReferenceTokens.length < 3) {
    return false;
  }

  const discoveredReferenceSet = new Set(discoveredReferenceTokens);
  const overlapCount = resultReferenceTokens.filter((token) => discoveredReferenceSet.has(token)).length;

  return overlapCount === 0;
}

export function buildCompanyCards(input: {
  query: string;
  discoveredCompanies: Array<{
    companyKey: string;
    displayName: string;
    websiteUrl: string | null;
    domain: string | null;
    logoUrl: string | null;
    description: string | null;
    rankScore: number;
  }>;
  localResults: SearchResultItem[];
  cachedResults: SearchResultItem[];
  sourceStatuses: Map<SourceName, { status: string; errorMessage: string | null }>;
  sources: SourceName[];
}) {
  const dedupedCachedResults = input.cachedResults.filter((cachedResult) => {
    const localMatch = input.localResults.find(
      (localResult) =>
        localResult.source === cachedResult.source &&
        localResult.sourceAdvertiserId === cachedResult.sourceAdvertiserId,
    );

    return !localMatch;
  });

  const rankedResults = sortAdvertiserSearchResults({
    query: input.query,
    localResults: input.localResults,
    externalResults: dedupedCachedResults,
  });

  const cardsByKey = new Map<string, CompanyCard>();
  const cardOrder: string[] = [];
  const existingCompanyKeys = new Set<string>();

  for (const discoveredCompany of input.discoveredCompanies) {
    cardsByKey.set(discoveredCompany.companyKey, {
      companyKey: discoveredCompany.companyKey,
      displayName: discoveredCompany.displayName,
      logoUrl: discoveredCompany.logoUrl,
      websiteUrl: discoveredCompany.websiteUrl,
      domain: discoveredCompany.domain,
      description: discoveredCompany.description,
      matchedProviderCount: 0,
      providers: {
        facebook: getDefaultProviderStatus("facebook"),
        linkedin: getDefaultProviderStatus("linkedin"),
        google: getDefaultProviderStatus("google"),
      },
      fullyResolved: false,
    });
    cardOrder.push(discoveredCompany.companyKey);
    existingCompanyKeys.add(discoveredCompany.companyKey);
  }

  for (const result of [...rankedResults.localResults, ...rankedResults.externalResults]) {
    const companyKey = resolveCompanyKeyForResult({
      query: input.query,
      resultName: result.canonicalName,
      resultWebsiteUrl: result.websiteUrl ?? result.profileUrl,
      cachedCompanyKey: result.companyKey,
      existingCompanyKeys,
    });
    const existingCard = cardsByKey.get(companyKey);
    const provider = {
      source: result.source,
      status: "matched" as const,
      result,
    };

    if (
      existingCard?.domain &&
      !isPlausibleDomainAdvertiserNameMatch({
        normalizedDomain: existingCard.domain,
        candidateName: result.canonicalName,
      })
    ) {
      continue;
    }

    if (
      existingCard &&
      hasConflictingDiscoveredCompanyContext({
        query: input.query,
        result,
        discoveredCompany: {
          displayName: existingCard.displayName,
          domain: existingCard.domain,
          description: existingCard.description,
        },
      })
    ) {
      continue;
    }

    if (!existingCard) {
      const providers: CompanyCard["providers"] = {
        facebook: getDefaultProviderStatus("facebook"),
        linkedin: getDefaultProviderStatus("linkedin"),
        google: getDefaultProviderStatus("google"),
      };

      if (result.source === "facebook" || result.source === "linkedin" || result.source === "google") {
        providers[result.source] = provider;
      }

      cardsByKey.set(companyKey, {
        companyKey,
        displayName: result.canonicalName,
        logoUrl: result.logoUrl ?? null,
        websiteUrl: result.websiteUrl ?? result.profileUrl ?? null,
        domain: getSearchInputDomain(result.websiteUrl ?? "")?.normalizedDomain ?? null,
        description: result.summary ?? null,
        matchedProviderCount: result.source === "facebook" || result.source === "linkedin" || result.source === "google" ? 1 : 0,
        providers,
        fullyResolved: false,
      });
      cardOrder.push(companyKey);
      existingCompanyKeys.add(companyKey);
      continue;
    }

    if ((result.source === "facebook" || result.source === "linkedin" || result.source === "google") && !existingCard.providers[result.source].result) {
      existingCard.providers[result.source] = provider;
      existingCard.matchedProviderCount += 1;
    }

    if (!existingCard.logoUrl && result.logoUrl) {
      existingCard.logoUrl = result.logoUrl;
    }

    if (!existingCard.websiteUrl && (result.websiteUrl || result.profileUrl)) {
      existingCard.websiteUrl = result.websiteUrl ?? result.profileUrl ?? null;
    }

    if (!existingCard.description && result.summary) {
      existingCard.description = result.summary;
    }
  }

  for (const [companyKey, card] of cardsByKey.entries()) {
    for (const source of input.sources) {
      if (source !== "facebook" && source !== "linkedin" && source !== "google") {
        continue;
      }

      const provider = card.providers[source];
      const nextStatus = getProviderStatus(source, input.sourceStatuses, Boolean(provider.result));
      card.providers[source] = {
        source,
        status: nextStatus,
        result: provider.result,
      };
    }

    card.fullyResolved = input.sources.every((source) => {
      if (source !== "facebook" && source !== "linkedin" && source !== "google") {
        return true;
      }

      return card.providers[source].status !== "searching";
    });

    if (!card.logoUrl) {
      const fallback = Object.values(card.providers).find((provider) => provider.result?.logoUrl);
      card.logoUrl = fallback?.result?.logoUrl ?? null;
    }

    if (!card.displayName) {
      const fallback = Object.values(card.providers).find((provider) => provider.result?.canonicalName);
      card.displayName = fallback?.result?.canonicalName ?? companyKey;
    }

    cardsByKey.set(companyKey, card);
  }

  return {
    cards: cardOrder.map((companyKey) => cardsByKey.get(companyKey)).filter((card): card is CompanyCard => Boolean(card)),
    localResults: rankedResults.localResults,
    externalResults: rankedResults.externalResults,
    results: [...rankedResults.localResults, ...rankedResults.externalResults],
  };
}
