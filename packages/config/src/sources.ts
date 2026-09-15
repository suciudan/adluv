export const allSourceNames = ["linkedin", "facebook", "google", "tiktok"] as const;
export type SourceName = (typeof allSourceNames)[number];

export const supportedSourceNames = ["linkedin", "facebook", "google"] as const satisfies readonly SourceName[];
export type SupportedSourceName = (typeof supportedSourceNames)[number];

export const sourceLabels: Record<SourceName, string> = {
  linkedin: "LinkedIn",
  facebook: "Meta",
  google: "Google Ads",
  tiktok: "TikTok",
};

export function getSourceLabel(source: SourceName) {
  return sourceLabels[source];
}
