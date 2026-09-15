import {
  buildAdvertiserCoreTokens,
  fetchTextViaHttpProxy,
  fetchTextViaWebScrapingApi,
  fetchTextViaWebScrapingApiProxy,
  loadGoogleRpcProxyUrlsFromEnvAsync,
  normalizeAdvertiserCoreText,
  normalizeAdvertiserText,
} from "@adluv/source-adapters";

const companyDiscoveryTimeoutMs = 5_000;
const maxCompanyDiscoveryResults = 8;
const bingSearchUrl = "https://www.bing.com/search";
const bingSuggestUrl = "https://api.bing.com/osjson.aspx";
const duckDuckGoSuggestUrl = "https://duckduckgo.com/ac/";
const companyDiscoveryProxyAttemptsPerRequest = 3;
const discouragedDomains = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "reddit.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "wikipedia.org",
]);

type BingSearchCandidate = {
  title: string;
  snippet: string;
  rootDomain: string | null;
};

export type DiscoveredCompany = {
  companyKey: string;
  displayName: string;
  websiteUrl: string | null;
  domain: string | null;
  logoUrl: string | null;
  description: string | null;
  rankScore: number;
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;/g, "'")
    .replace(/&#x3D;/g, "=")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)));
}

function stripTags(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractHostname(value: string) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function extractRegistrableDomain(hostname: string) {
  const labels = hostname
    .split(".")
    .map((label) => label.trim().toLowerCase())
    .filter(Boolean);

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

function extractRootDomainFromBlock(block: string) {
  const citeMatch = block.match(/<cite>(.*?)<\/cite>/is);
  const citeText = citeMatch ? stripTags(citeMatch[1]) : "";
  const citeUrl = citeText.match(/https?:\/\/[^\s›<]+/i)?.[0] ?? null;
  const citeHost = citeUrl ? extractHostname(citeUrl) : null;

  if (citeHost) {
    return extractRegistrableDomain(citeHost);
  }

  const labelMatch = block.match(/aria-label="([^"]+)"/i);
  const label = labelMatch ? stripTags(labelMatch[1]) : "";
  const labelHost = label ? extractHostname(`https://${label}`) : null;

  return labelHost ? extractRegistrableDomain(labelHost) : null;
}

function buildDomainBrand(rootDomain: string | null) {
  if (!rootDomain) {
    return "";
  }

  const labels = rootDomain.split(".");
  const registrableLabel = labels.length > 2 ? labels.at(-3) ?? labels[0] : labels[0] ?? "";
  return normalizeAdvertiserCoreText(registrableLabel.replace(/[-_]+/g, " "));
}

function toDisplayCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(" ");
}

function scoreTokenOverlap(queryTokens: string[], candidateTokens: string[]) {
  if (!queryTokens.length || !candidateTokens.length) {
    return 0;
  }

  const candidateSet = new Set(candidateTokens);
  const overlapCount = queryTokens.filter((token) => candidateSet.has(token)).length;

  if (!overlapCount) {
    return 0;
  }

  return overlapCount * 40;
}

function readTitleSegment(title: string, query: string, domainBrand: string) {
  const queryCore = normalizeAdvertiserCoreText(query);
  const segments = title
    .split(/\s(?:\||-|:|·)\s/g)
    .map((segment) => stripTags(segment))
    .filter(Boolean);

  if (!segments.length) {
    return "";
  }

  return segments
    .map((segment) => {
      const normalizedSegment = normalizeAdvertiserCoreText(segment);
      let score = scoreTokenOverlap(buildAdvertiserCoreTokens(query), buildAdvertiserCoreTokens(segment));

      if (queryCore && normalizedSegment === queryCore) {
        score += 220;
      }

      if (domainBrand && normalizedSegment === domainBrand) {
        score += 180;
      }

      if (queryCore && normalizedSegment.startsWith(queryCore)) {
        score += 90;
      }

      if (domainBrand && normalizedSegment.startsWith(domainBrand)) {
        score += 70;
      }

      return {
        score,
        segment,
      };
    })
    .sort((left, right) => right.score - left.score)[0]?.segment ?? segments[0] ?? "";
}

function scoreCandidate(query: string, candidate: BingSearchCandidate, index: number) {
  const queryCore = normalizeAdvertiserCoreText(query);
  const queryTokens = buildAdvertiserCoreTokens(query);
  const domainBrand = buildDomainBrand(candidate.rootDomain);
  const domainTokens = buildAdvertiserCoreTokens(domainBrand);
  const titleTokens = buildAdvertiserCoreTokens(candidate.title);
  const snippetTokens = buildAdvertiserCoreTokens(candidate.snippet);
  let score = Math.max(0, 40 - index * 4);

  if (candidate.rootDomain && discouragedDomains.has(candidate.rootDomain)) {
    score -= 140;
  }

  if (domainBrand && domainBrand === queryCore) {
    score += 280;
  }

  if (domainBrand && queryCore && (domainBrand.startsWith(queryCore) || queryCore.startsWith(domainBrand))) {
    score += 150;
  }

  score += scoreTokenOverlap(queryTokens, domainTokens) * 2;
  score += scoreTokenOverlap(queryTokens, titleTokens);
  score += Math.floor(scoreTokenOverlap(queryTokens, snippetTokens) * 0.5);

  if (!domainTokens.length) {
    score -= 40;
  } else if (!queryTokens.some((token) => domainTokens.includes(token))) {
    score -= 80;
  }

  if (/\b(contact|community|docs|documentation|forum|help|learn|support)\b/i.test(candidate.title)) {
    score -= 24;
  }

  return score;
}

function buildDisplayName(query: string, candidate: BingSearchCandidate) {
  const queryCore = normalizeAdvertiserCoreText(query);
  const domainBrand = buildDomainBrand(candidate.rootDomain);
  const titleSegment = readTitleSegment(candidate.title, query, domainBrand);
  const normalizedTitleSegment = normalizeAdvertiserCoreText(titleSegment);

  if (domainBrand && queryCore && (domainBrand === queryCore || queryCore.startsWith(domainBrand))) {
    return toDisplayCase(queryCore);
  }

  if (normalizedTitleSegment && queryCore && normalizedTitleSegment.startsWith(queryCore)) {
    return toDisplayCase(normalizedTitleSegment);
  }

  if (domainBrand) {
    return toDisplayCase(domainBrand);
  }

  return titleSegment || query.trim();
}

function buildCompanyKey(query: string, candidate: BingSearchCandidate) {
  const queryCore = normalizeAdvertiserCoreText(query);
  const domainBrand = buildDomainBrand(candidate.rootDomain);
  const titleSegment = normalizeAdvertiserCoreText(readTitleSegment(candidate.title, query, domainBrand));

  if (domainBrand && queryCore && (domainBrand === queryCore || queryCore.startsWith(domainBrand))) {
    return queryCore || domainBrand;
  }

  if (titleSegment && queryCore && titleSegment.startsWith(queryCore)) {
    return titleSegment;
  }

  return domainBrand || titleSegment || normalizeAdvertiserText(query);
}

function buildLogoUrl(rootDomain: string | null) {
  if (!rootDomain) {
    return null;
  }

  return `https://www.google.com/s2/favicons?sz=128&domain_url=${encodeURIComponent(`https://${rootDomain}`)}`;
}

function parseBingCandidates(html: string) {
  return html
    .split(/<li class="b_algo"[^>]*>/i)
    .slice(1)
    .map((block) => {
      const titleMatch = block.match(/<h2[^>]*>\s*<a[^>]*>(.*?)<\/a>\s*<\/h2>/is);
      const snippetMatch = block.match(/<div class="b_caption"[^>]*>.*?<p[^>]*>(.*?)<\/p>/is);
      const title = titleMatch ? stripTags(titleMatch[1]) : "";
      const snippet = snippetMatch ? stripTags(snippetMatch[1]) : "";
      const rootDomain = extractRootDomainFromBlock(block);

      return {
        title,
        snippet,
        rootDomain,
      } satisfies BingSearchCandidate;
    })
    .filter((candidate) => candidate.title && candidate.rootDomain);
}

function getWebScrapingApiProxyOptions() {
  const username = process.env.WEBSCRAPINGAPI_PROXY_USERNAME?.trim();
  const password = process.env.WEBSCRAPINGAPI_PROXY_PASSWORD?.trim();
  const url = process.env.WEBSCRAPINGAPI_PROXY_URL?.trim();

  if (!url) {
    return undefined;
  }

  return username && password ? { username, password, url } : { url };
}

async function fetchWithTimeout(url: URL) {
  const headers = {
    "accept-language": "en-US,en;q=0.9",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  };
  const proxyUrls = await loadGoogleRpcProxyUrlsFromEnvAsync();
  const proxyAttempts = proxyUrls.slice(0, Math.min(proxyUrls.length, companyDiscoveryProxyAttemptsPerRequest));
  const attempts: string[] = [];

  for (const proxyUrl of proxyAttempts) {
    try {
      const response = await fetchTextViaHttpProxy(url.toString(), {
        headers,
        proxy: proxyUrl,
        timeoutMs: companyDiscoveryTimeoutMs,
      });

      if (!response.ok) {
        attempts.push(`${new URL(proxyUrl).host}: HTTP ${response.status}`);
        continue;
      }

      return response.text;
    } catch (error) {
      attempts.push(`${new URL(proxyUrl).host}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  const webScrapingApiKey = process.env.WEBSCRAPINGAPI_API_KEY?.trim();

  if (webScrapingApiKey) {
    const response = await fetchTextViaWebScrapingApi(url.toString(), {
      apiKey: webScrapingApiKey,
      headers,
      timeoutMs: companyDiscoveryTimeoutMs,
    });

    if (!response.ok) {
      throw new Error(`Company discovery via WebScrapingAPI returned HTTP ${response.status}.`);
    }

    return response.text;
  }

  const webScrapingApiProxy = getWebScrapingApiProxyOptions();

  if (webScrapingApiProxy) {
    const response = await fetchTextViaWebScrapingApiProxy(url.toString(), {
      headers,
      proxy: webScrapingApiProxy,
      timeoutMs: companyDiscoveryTimeoutMs,
    });

    if (!response.ok) {
      throw new Error(`Company discovery via WebScrapingAPI proxy returned HTTP ${response.status}.`);
    }

    return response.text;
  }

  throw new Error(
    attempts.length
      ? `Company discovery proxy attempts failed: ${attempts.join("; ")}`
      : "Company discovery proxy transport is not configured.",
  );
}

async function fetchQuerySuggestions(query: string, seedQueries: string[] = []) {
  const suggestions = new Map<string, string>();

  const bingUrl = new URL(bingSuggestUrl);
  bingUrl.searchParams.set("query", query);

  const duckDuckGoUrl = new URL(duckDuckGoSuggestUrl);
  duckDuckGoUrl.searchParams.set("q", query);
  duckDuckGoUrl.searchParams.set("type", "list");

  const [bingResponse, duckDuckGoResponse] = await Promise.allSettled([
    fetchWithTimeout(bingUrl).then((body) => JSON.parse(body) as [string, string[]]),
    fetchWithTimeout(duckDuckGoUrl).then((body) => JSON.parse(body) as Array<{ phrase?: string } | string>),
  ]);

  if (bingResponse.status === "fulfilled") {
    for (const suggestion of bingResponse.value[1] ?? []) {
      const normalizedSuggestion = normalizeAdvertiserCoreText(suggestion);

      if (normalizedSuggestion) {
        suggestions.set(normalizedSuggestion, suggestion);
      }
    }
  }

  if (duckDuckGoResponse.status === "fulfilled") {
    for (const entry of duckDuckGoResponse.value) {
      if (typeof entry === "string") {
        const normalizedSuggestion = normalizeAdvertiserCoreText(entry);

        if (normalizedSuggestion) {
          suggestions.set(normalizedSuggestion, entry);
        }
        continue;
      }

      if (typeof entry?.phrase === "string") {
        const normalizedSuggestion = normalizeAdvertiserCoreText(entry.phrase);

        if (normalizedSuggestion) {
          suggestions.set(normalizedSuggestion, entry.phrase);
        }
      }
    }
  }

  for (const seedQuery of seedQueries) {
    const normalizedSeed = normalizeAdvertiserCoreText(seedQuery);

    if (normalizedSeed) {
      suggestions.set(normalizedSeed, seedQuery);
    }
  }

  const normalizedQuery = normalizeAdvertiserCoreText(query);

  return [...suggestions.entries()]
    .map(([, suggestion]) => suggestion.trim())
    .filter((suggestion) => {
      const normalizedSuggestion = normalizeAdvertiserCoreText(suggestion);

      return (
        suggestion.length > query.length &&
        Boolean(normalizedSuggestion) &&
        Boolean(normalizedQuery) &&
        normalizedSuggestion.startsWith(normalizedQuery) &&
        !/\d/.test(suggestion)
      );
    })
    .sort((left, right) => {
      const leftHasSpace = left.includes(" ");
      const rightHasSpace = right.includes(" ");

      if (leftHasSpace !== rightHasSpace) {
        return leftHasSpace ? 1 : -1;
      }

      return left.length - right.length;
    })
    .slice(0, 5);
}

async function searchCompaniesOnWebCore(
  searchQuery: string,
  options?: {
    contextQuery?: string;
  },
): Promise<DiscoveredCompany[]> {
  const contextQuery = options?.contextQuery ?? searchQuery;
  const searchUrl = new URL(bingSearchUrl);
  searchUrl.searchParams.set("q", searchQuery);
  searchUrl.searchParams.set("cc", "us");
  searchUrl.searchParams.set("ensearch", "1");
  searchUrl.searchParams.set("setlang", "en-US");

  const html = await fetchWithTimeout(searchUrl);
  const candidates = parseBingCandidates(html);
  const companiesByKey = new Map<string, DiscoveredCompany>();

  candidates.forEach((candidate, index) => {
    const rankScore = scoreCandidate(contextQuery, candidate, index);

    if (rankScore < 80) {
      return;
    }

    const companyKey = buildCompanyKey(contextQuery, candidate);

    if (!companyKey) {
      return;
    }

    const current = companiesByKey.get(companyKey);
    const nextCompany: DiscoveredCompany = {
      companyKey,
      displayName: buildDisplayName(contextQuery, candidate),
      websiteUrl: candidate.rootDomain ? `https://${candidate.rootDomain}/` : null,
      domain: candidate.rootDomain,
      logoUrl: buildLogoUrl(candidate.rootDomain),
      description: candidate.snippet || null,
      rankScore,
    };

    if (!current || nextCompany.rankScore > current.rankScore) {
      companiesByKey.set(companyKey, nextCompany);
    }
  });

  return [...companiesByKey.values()]
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, maxCompanyDiscoveryResults);
}

function collapseDuplicateDomains(companies: DiscoveredCompany[]) {
  const companiesByDomain = new Map<string, DiscoveredCompany>();
  const companiesWithoutDomain: DiscoveredCompany[] = [];

  for (const company of companies) {
    if (!company.domain) {
      companiesWithoutDomain.push(company);
      continue;
    }

    const current = companiesByDomain.get(company.domain);

    if (
      !current ||
      company.rankScore > current.rankScore ||
      (company.rankScore === current.rankScore && company.displayName.length < current.displayName.length)
    ) {
      companiesByDomain.set(company.domain, company);
    }
  }

  return [...companiesByDomain.values(), ...companiesWithoutDomain]
    .sort((left, right) => right.rankScore - left.rankScore)
    .slice(0, maxCompanyDiscoveryResults);
}

export async function searchCompaniesOnWeb(
  query: string,
  options?: {
    seedQueries?: string[];
  },
): Promise<DiscoveredCompany[]> {
  let directResults = await searchCompaniesOnWebCore(query);

  if (!directResults.length && query.trim().length > 3) {
    directResults = await searchCompaniesOnWebCore(`${query} official site`, {
      contextQuery: query,
    });
  }

  if (query.trim().length > 3) {
    return collapseDuplicateDomains(directResults);
  }

  const suggestionQueries = await fetchQuerySuggestions(query, options?.seedQueries);

  if (!suggestionQueries.length) {
    return directResults;
  }

  const suggestionResults = await Promise.allSettled(
    suggestionQueries.map((suggestion) => searchCompaniesOnWebCore(suggestion)),
  );
  const companiesByKey = new Map(
    directResults.map((company) => [company.companyKey, company] as const),
  );

  for (const result of suggestionResults) {
    if (result.status !== "fulfilled") {
      continue;
    }

    for (const company of result.value) {
      const companyPrefix = company.companyKey.toLowerCase();
      const queryPrefix = query.trim().toLowerCase();

      if (!companyPrefix.startsWith(queryPrefix)) {
        continue;
      }

      const current = companiesByKey.get(company.companyKey);

      if (!current || company.rankScore > current.rankScore) {
        companiesByKey.set(company.companyKey, company);
      }
    }
  }

  return collapseDuplicateDomains([...companiesByKey.values()]);
}
