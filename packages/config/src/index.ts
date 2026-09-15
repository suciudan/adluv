import { supportedSourceNames } from "./sources";

export const appConfig = {
  name: "AdLuv",
  tagline: "Track and benchmark ads across any brand on Meta, Google, and LinkedIn - with landing pages, unlimited creatives, and performance insights.",
  supportedSources: supportedSourceNames,
  refreshCadence: "twice-daily",
  trackedCompanyLimit: 10,
  planPriceMonthlyUsd: 49,
};

export const queueNames = {
  advertiserSearch: "{advertiser-search}",
  initialIndex: "{initial-index}",
  scheduledSync: "{scheduled-sync}",
  creativeAssetRepair: "{creative-asset-repair}",
  activeAdStatusCheck: "{active-ad-status-check}",
  landingPageCapture: "{landing-page-capture}",
  sendAlert: "{send-alert}",
  sendAlertDigest: "{send-alert-digest}",
} as const;

export const demoUser = {
  id: "demo-user",
  email: "demo@adluv.local",
  name: "Demo User",
};

export * from "./sources";
export * from "./urls";
export * from "./advertiser-industries";
export * from "./discord-errors";
