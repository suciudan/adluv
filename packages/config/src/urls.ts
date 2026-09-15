const DEFAULT_SITE_URL = "http://127.0.0.1:3000";
const DEFAULT_APP_URL = "http://127.0.0.1:3001";
const DEFAULT_CMS_URL = "http://127.0.0.1:3002";
const LEGACY_CDN_ASSET_PATH_PREFIX = "/cdn";
const CDN_ASSET_PATH_PREFIXES = [
  "/ad-assets",
  "/advertiser-logos",
  "/blog-media",
  "/author-avatars",
  "/landing-page-screenshots",
] as const;
const AD_MEDIA_PATH_PREFIXES = ["/ad-assets", "/advertiser-logos"] as const;

function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, "");
}

function joinOrigin(origin: string, path: string) {
  if (!path || path === "/") {
    return origin;
  }

  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

function tryGetHostname(origin: string) {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function tryGetProtocol(origin: string) {
  try {
    return new URL(origin).protocol;
  } catch {
    return null;
  }
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function normalizeCdnAssetPathname(pathname: string) {
  if (pathname === LEGACY_CDN_ASSET_PATH_PREFIX || pathname.startsWith(`${LEGACY_CDN_ASSET_PATH_PREFIX}/`)) {
    const trimmedPath = pathname.slice(LEGACY_CDN_ASSET_PATH_PREFIX.length) || "/";
    return trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;
  }

  return pathname;
}

function isCdnAssetPathname(pathname: string) {
  const normalizedPathname = normalizeCdnAssetPathname(pathname);

  return CDN_ASSET_PATH_PREFIXES.some(
    (prefix) => normalizedPathname === prefix || normalizedPathname.startsWith(`${prefix}/`),
  );
}

function getSharedSuffix(left: string, right: string) {
  const leftParts = left.split(".").filter(Boolean);
  const rightParts = right.split(".").filter(Boolean);
  const suffix: string[] = [];

  while (leftParts.length && rightParts.length) {
    const leftPart = leftParts[leftParts.length - 1];
    const rightPart = rightParts[rightParts.length - 1];

    if (leftPart !== rightPart) {
      break;
    }

    suffix.unshift(leftPart);
    leftParts.pop();
    rightParts.pop();
  }

  return suffix;
}

export function getSiteOrigin() {
  return normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? DEFAULT_SITE_URL);
}

export function getAppOrigin() {
  return normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? DEFAULT_APP_URL);
}

export function getCmsOrigin() {
  return normalizeOrigin(process.env.NEXT_PUBLIC_CMS_URL ?? process.env.CMS_URL ?? DEFAULT_CMS_URL);
}

export function getAuthCookieDomain() {
  const explicitDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();

  if (explicitDomain) {
    return explicitDomain;
  }

  const siteHostname = tryGetHostname(getSiteOrigin());
  const appHostname = tryGetHostname(getAppOrigin());
  const cmsHostname = tryGetHostname(getCmsOrigin());

  if (!siteHostname || !appHostname || !cmsHostname) {
    return undefined;
  }

  if (isLocalHostname(siteHostname) || isLocalHostname(appHostname) || isLocalHostname(cmsHostname)) {
    return undefined;
  }

  const siteAppSuffix = getSharedSuffix(siteHostname, appHostname);
  const appCmsSuffix = getSharedSuffix(appHostname, cmsHostname);
  const sharedSuffix =
    siteAppSuffix.length <= appCmsSuffix.length ? siteAppSuffix : appCmsSuffix;

  if (sharedSuffix.length < 2) {
    return undefined;
  }

  return `.${sharedSuffix.join(".")}`;
}

export function shouldUseSecureCookies() {
  const explicit = process.env.AUTH_COOKIE_SECURE?.trim();

  if (explicit === "true") {
    return true;
  }

  if (explicit === "false") {
    return false;
  }

  return [getSiteOrigin(), getAppOrigin(), getCmsOrigin()].some((origin) => tryGetProtocol(origin) === "https:");
}

export function getSiteHref(path = "/") {
  return joinOrigin(getSiteOrigin(), path);
}

export function getAppHref(path = "/") {
  return joinOrigin(getAppOrigin(), path);
}

export function getCmsHref(path = "/") {
  return joinOrigin(getCmsOrigin(), path);
}

export function getCdnAssetPathname(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (isCdnAssetPathname(value)) {
    return normalizeCdnAssetPathname(value);
  }

  try {
    const pathname = new URL(value).pathname;
    return isCdnAssetPathname(pathname) ? normalizeCdnAssetPathname(pathname) : null;
  } catch {
    return null;
  }
}

export function resolveCdnAssetUrl(value: string | null) {
  if (!value) {
    return value;
  }

  const pathname = getCdnAssetPathname(value);

  if (!pathname) {
    return value;
  }

  const cdnUrl = AD_MEDIA_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
    ? process.env.NEXT_PUBLIC_AD_ASSET_CDN_URL?.trim() ||
      process.env.AD_ASSET_CDN_URL?.trim() ||
      process.env.NEXT_PUBLIC_CDN_URL?.trim() ||
      process.env.CDN_URL?.trim()
    : process.env.NEXT_PUBLIC_CDN_URL?.trim() || process.env.CDN_URL?.trim();

  if (!cdnUrl) {
    return pathname;
  }

  return joinOrigin(normalizeOrigin(cdnUrl), pathname);
}
