export type SourceName = "linkedin" | "facebook" | "google" | "tiktok";

export type AdvertiserMatch = {
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
};

export class AdvertiserSearchError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_query" | "rate_limited" | "unavailable",
  ) {
    super(message);
    this.name = "AdvertiserSearchError";
  }
}

export type NormalizedAd = {
  source: SourceName;
  sourceAdId?: string;
  fingerprint: string;
  title?: string;
  body?: string;
  payer?: string;
  format?: string;
  callToAction?: string;
  destinationUrl?: string;
  mediaUrl?: string;
  status?: string;
  reactionCount?: number;
  commentCount?: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  metadata?: Record<string, unknown>;
};

export type FetchAdvertiserAdsOptions = {
  since?: Date;
  until?: Date;
  maxResults?: number;
  country?: string;
  sourceAdIds?: string[];
};

export type LandingPageSnapshot = {
  url: string;
  title?: string;
  html?: string;
  screenshotUrl?: string;
  capturedAt: Date;
};

export interface SourceAdapter {
  readonly source: SourceName;
  searchAdvertisers(query: string): Promise<AdvertiserMatch[]>;
  fetchAdvertiserProfile(sourceAdvertiserId: string): Promise<AdvertiserMatch | null>;
  fetchAdvertiserAds(sourceAdvertiserId: string, options?: FetchAdvertiserAdsOptions): Promise<NormalizedAd[]>;
  fetchLandingPage(url: string): Promise<LandingPageSnapshot>;
}
