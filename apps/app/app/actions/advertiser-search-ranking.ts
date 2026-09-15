import {
  buildAdvertiserAcronym,
  buildAdvertiserCoreTokens,
  compactAdvertiserText,
  isAdvertiserNoiseToken,
  normalizeAdvertiserCoreText,
  normalizeAdvertiserText,
  tokenizeAdvertiserText,
  type AdvertiserMatch,
} from "@adluv/source-adapters";

type RankedResult<T extends AdvertiserMatch> = {
  index: number;
  isLocal: boolean;
  result: T;
  score: number;
};

function compactTokens(tokens: string[]) {
  return tokens.join(" ").trim();
}

function readProfileSlug(profileUrl?: string) {
  if (!profileUrl) {
    return "";
  }

  try {
    const url = new URL(profileUrl);
    const accountOwner = url.searchParams.get("accountOwner");

    if (accountOwner) {
      return normalizeAdvertiserText(accountOwner.replace(/[-_]+/g, " "));
    }

    const slug = url.pathname
      .split("/")
      .filter(Boolean)
      .at(-1);

    return slug ? normalizeAdvertiserText(slug.replace(/[-_]+/g, " ")) : "";
  } catch {
    return "";
  }
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

  const queryCoverage = overlapCount / queryTokens.length;
  const candidateCoverage = overlapCount / candidateTokens.length;

  return queryCoverage * 90 + candidateCoverage * 35;
}

function scoreCandidateName(query: string, candidate: AdvertiserMatch) {
  const normalizedQuery = normalizeAdvertiserText(query);
  const queryTokens = tokenizeAdvertiserText(query);
  const queryCoreTokens = buildAdvertiserCoreTokens(query);
  const queryCore = compactTokens(queryCoreTokens);
  const queryCompact = compactAdvertiserText(query);
  const queryAcronym = buildAdvertiserAcronym(query);

  const candidateName = candidate.canonicalName ?? "";
  const normalizedCandidate = normalizeAdvertiserText(candidateName);
  const candidateTokens = tokenizeAdvertiserText(candidateName);
  const candidateCoreTokens = buildAdvertiserCoreTokens(candidateName);
  const candidateCore = normalizeAdvertiserCoreText(candidateName);
  const candidateCompact = compactAdvertiserText(candidateName);
  const candidateAcronym = buildAdvertiserAcronym(candidateName);
  const profileSlug = readProfileSlug(candidate.profileUrl);
  let score = 0;

  if (normalizedCandidate === normalizedQuery) {
    score += 320;
  }

  if (queryCore && candidateCore && queryCore === candidateCore) {
    score += 280;
  }

  if (profileSlug && profileSlug === queryCore) {
    score += 220;
  }

  if (queryCore && candidateCore.startsWith(queryCore)) {
    score += 150;
  }

  if (queryCore && candidateCore.includes(` ${queryCore}`)) {
    score += 60;
  }

  if (queryCompact && candidateCompact === queryCompact) {
    score += 120;
  }

  if (queryCompact && candidateCompact.startsWith(queryCompact)) {
    score += 60;
  }

  if (queryAcronym && queryAcronym.length > 1 && candidateAcronym === queryAcronym) {
    score += 90;
  }

  if (queryCompact.length > 1 && candidateAcronym === queryCompact) {
    score += 70;
  }

  score += scoreTokenOverlap(queryTokens, candidateTokens);
  score += scoreTokenOverlap(queryCoreTokens, candidateCoreTokens);

  if (queryTokens.length && queryTokens.every((token) => candidateTokens.includes(token))) {
    score += 45;
  }

  if (queryCoreTokens.length && queryCoreTokens.every((token) => candidateCoreTokens.includes(token))) {
    score += 70;
  }

  const extraCoreTokens = Math.max(0, candidateCoreTokens.length - queryCoreTokens.length);
  score -= extraCoreTokens * 8;

  const noisyTokens = candidateTokens.filter((token) => isAdvertiserNoiseToken(token) && !queryTokens.includes(token));
  score -= noisyTokens.length * 6;

  if (candidate.logoUrl) {
    score += 4;
  }

  return score;
}

export function getAdvertiserSearchScore(query: string, candidate: AdvertiserMatch) {
  return scoreCandidateName(query, candidate);
}

export function classifyAdvertiserSearchStrength(query: string, results: AdvertiserMatch[]) {
  if (!results.length) {
    return "empty" as const;
  }

  const rankedResults = results
    .map((result) => ({
      result,
      score: scoreCandidateName(query, result),
    }))
    .sort((left, right) => right.score - left.score);
  const topScore = rankedResults[0]?.score ?? 0;
  const secondScore = rankedResults[1]?.score ?? Number.NEGATIVE_INFINITY;

  if (topScore >= 220) {
    return "strong" as const;
  }

  if (topScore >= 175 && topScore - secondScore >= 35) {
    return "strong" as const;
  }

  return "weak" as const;
}

function compareRankedResults(left: RankedResult<AdvertiserMatch>, right: RankedResult<AdvertiserMatch>) {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  if (left.isLocal !== right.isLocal) {
    return left.isLocal ? -1 : 1;
  }

  return left.index - right.index;
}

function rankResults<T extends AdvertiserMatch>(
  query: string,
  results: T[],
  options?: {
    isLocal?: boolean;
  },
) {
  const isLocal = options?.isLocal ?? false;

  return results
    .map((result, index) => ({
      index,
      isLocal,
      result,
      score: scoreCandidateName(query, result) + (isLocal ? 16 : 0),
    }))
    .sort(compareRankedResults);
}

export function sortAdvertiserSearchResults<
  TLocal extends AdvertiserMatch,
  TExternal extends AdvertiserMatch,
>(input: {
  query: string;
  localResults: TLocal[];
  externalResults: TExternal[];
}) {
  const rankedLocalResults = rankResults(input.query, input.localResults, { isLocal: true });
  const rankedExternalResults = rankResults(input.query, input.externalResults);
  const rankedCombinedResults = [...rankedLocalResults, ...rankedExternalResults].sort(compareRankedResults);

  return {
    localResults: rankedLocalResults.map((entry) => entry.result),
    externalResults: rankedExternalResults.map((entry) => entry.result),
    results: rankedCombinedResults.map((entry) => entry.result),
  };
}
