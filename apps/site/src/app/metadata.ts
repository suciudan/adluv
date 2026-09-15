import type { Metadata } from "next";

import { appConfig, getSiteHref, getSiteOrigin } from "@adluv/config";

const DEFAULT_DESCRIPTION = appConfig.tagline;
const DEFAULT_OG_IMAGE_PATH = "/opengraph-image";

type BaseMetadataOptions = {
  title: string;
  description?: string | null;
  path?: string;
  image?: string | null;
  noIndex?: boolean;
};

type ArticleMetadataOptions = BaseMetadataOptions & {
  authors?: string[];
  modifiedTime?: Date | null;
  publishedTime?: Date | null;
  tags?: string[];
};

function resolveAbsoluteUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).toString();
  } catch {
    return getSiteHref(value);
  }
}

function buildRobots(noIndex: boolean | undefined): Metadata["robots"] | undefined {
  if (!noIndex) {
    return undefined;
  }

  return {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  };
}

export function getMetadataBase() {
  return new URL(getSiteOrigin());
}

export function buildSiteMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "/",
  image = DEFAULT_OG_IMAGE_PATH,
  noIndex,
}: BaseMetadataOptions): Metadata {
  const canonicalUrl = getSiteHref(path);
  const resolvedImage = resolveAbsoluteUrl(image);
  const resolvedDescription = description ?? DEFAULT_DESCRIPTION;

  return {
    title,
    description: resolvedDescription,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: buildRobots(noIndex),
    openGraph: {
      title,
      description: resolvedDescription,
      url: canonicalUrl,
      siteName: appConfig.name,
      locale: "en_US",
      type: "website",
      ...(resolvedImage
        ? {
            images: [
              {
                url: resolvedImage,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: resolvedImage ? "summary_large_image" : "summary",
      title,
      description: resolvedDescription,
      ...(resolvedImage ? { images: [resolvedImage] } : {}),
    },
  };
}

export function buildArticleMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
  image,
  authors,
  modifiedTime,
  publishedTime,
  tags,
}: ArticleMetadataOptions): Metadata {
  const canonicalUrl = getSiteHref(path ?? "/");
  const resolvedImage = resolveAbsoluteUrl(image ?? DEFAULT_OG_IMAGE_PATH);
  const resolvedDescription = description ?? DEFAULT_DESCRIPTION;

  return {
    ...buildSiteMetadata({
      title,
      description: resolvedDescription,
      path,
      image,
    }),
    openGraph: {
      title,
      description: resolvedDescription,
      url: canonicalUrl,
      siteName: appConfig.name,
      locale: "en_US",
      type: "article",
      ...(publishedTime ? { publishedTime: publishedTime.toISOString() } : {}),
      ...(modifiedTime ? { modifiedTime: modifiedTime.toISOString() } : {}),
      ...(authors?.length ? { authors } : {}),
      ...(tags?.length ? { tags } : {}),
      ...(resolvedImage
        ? {
            images: [
              {
                url: resolvedImage,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: resolvedImage ? "summary_large_image" : "summary",
      title,
      description: resolvedDescription,
      ...(resolvedImage ? { images: [resolvedImage] } : {}),
    },
  };
}
