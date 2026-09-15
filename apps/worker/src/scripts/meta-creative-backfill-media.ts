import { getCdnAssetPathname } from "@adluv/config";

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isStoredAdAssetUrl(value: string | null) {
  const pathname = value ? getCdnAssetPathname(value) : null;

  return Boolean(pathname?.startsWith("/ad-assets/"));
}

export function getBackfilledMetaMediaUrl(input: {
  currentMediaUrl: string | null | undefined;
  hydratedMediaUrl: string | null | undefined;
  hydratedMetadata: Record<string, unknown>;
}) {
  const currentMediaUrl = input.currentMediaUrl ?? null;
  const hydratedMediaUrl = cleanString(input.hydratedMediaUrl);

  if (!hydratedMediaUrl || hydratedMediaUrl === currentMediaUrl) {
    return currentMediaUrl;
  }

  if (isStoredAdAssetUrl(hydratedMediaUrl)) {
    return hydratedMediaUrl;
  }

  const assetStoredUrl = cleanString(input.hydratedMetadata.assetStoredUrl);

  if (isStoredAdAssetUrl(assetStoredUrl)) {
    return assetStoredUrl;
  }

  return currentMediaUrl;
}
