import { appConfig, getSiteHref, getSiteOrigin } from "@adluv/config";
import type { BlogPostRecord } from "@adluv/db";

const SITE_ORIGIN = getSiteOrigin();
const SITE_NAME = appConfig.name;
const SITE_DESCRIPTION = appConfig.tagline;
const DEFAULT_IMAGE = getSiteHref("/opengraph-image");
const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;
const WEBSITE_ID = `${SITE_ORIGIN}/#website`;
const BLOG_ID = `${getSiteHref("/blog")}#blog`;

function buildOrganizationJsonLd() {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE_NAME,
    url: SITE_ORIGIN,
    description: SITE_DESCRIPTION,
    image: DEFAULT_IMAGE,
  };
}

function buildWebsiteJsonLd() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_ORIGIN,
    description: SITE_DESCRIPTION,
    inLanguage: "en-US",
    publisher: {
      "@id": ORGANIZATION_ID,
    },
  };
}

function buildBreadcrumbListJsonLd(items: Array<{ name: string; item: string }>) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: entry.item,
    })),
  };
}

function buildBlogPostSummaryJsonLd(post: BlogPostRecord) {
  const publishedAt = post.publishedAt ?? post.createdAt;
  const postUrl = getSiteHref(`/blog/${post.slug}`);

  return {
    "@type": "BlogPosting",
    "@id": `${postUrl}#blog-posting`,
    headline: post.title,
    url: postUrl,
    description: post.seoDescription ?? post.excerpt,
    datePublished: publishedAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    articleSection: post.category.name,
    author: {
      "@type": "Person",
      "@id": `${getSiteHref(`/blog/author/${post.author.slug}`)}#author`,
      name: post.author.name,
      url: getSiteHref(`/blog/author/${post.author.slug}`),
    },
    publisher: {
      "@id": ORGANIZATION_ID,
    },
    ...(post.coverImageUrl ? { image: [post.coverImageUrl] } : {}),
  };
}

export function buildHomepageJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationJsonLd(),
      buildWebsiteJsonLd(),
      {
        "@type": "WebPage",
        "@id": `${SITE_ORIGIN}/#webpage`,
        url: SITE_ORIGIN,
        name: `${SITE_NAME} | Track ads across any brand, instantly`,
        description: SITE_DESCRIPTION,
        inLanguage: "en-US",
        isPartOf: {
          "@id": WEBSITE_ID,
        },
        about: {
          "@id": ORGANIZATION_ID,
        },
      },
    ],
  };
}

export function buildBlogIndexJsonLd(posts: BlogPostRecord[]) {
  const blogUrl = getSiteHref("/blog");

  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationJsonLd(),
      buildWebsiteJsonLd(),
      {
        "@type": "Blog",
        "@id": BLOG_ID,
        url: blogUrl,
        name: `${SITE_NAME} Blog`,
        description: "Creative ideas, practical tips, and operator notes for paid media teams.",
        inLanguage: "en-US",
        isPartOf: {
          "@id": WEBSITE_ID,
        },
        publisher: {
          "@id": ORGANIZATION_ID,
        },
        blogPost: posts.map(buildBlogPostSummaryJsonLd),
      },
      buildBreadcrumbListJsonLd([
        { name: SITE_NAME, item: SITE_ORIGIN },
        { name: "Blog", item: blogUrl },
      ]),
    ],
  };
}

export function buildBlogPostJsonLd(post: BlogPostRecord) {
  const publishedAt = post.publishedAt ?? post.createdAt;
  const postUrl = getSiteHref(`/blog/${post.slug}`);
  const authorUrl = getSiteHref(`/blog/author/${post.author.slug}`);

  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganizationJsonLd(),
      buildWebsiteJsonLd(),
      {
        "@type": "Person",
        "@id": `${authorUrl}#author`,
        name: post.author.name,
        url: authorUrl,
        description: post.author.bio,
        jobTitle: post.author.role,
        ...(post.author.avatarImageUrl ? { image: post.author.avatarImageUrl } : {}),
      },
      {
        "@type": "BlogPosting",
        "@id": `${postUrl}#blog-posting`,
        url: postUrl,
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": postUrl,
        },
        headline: post.title,
        description: post.seoDescription ?? post.excerpt,
        datePublished: publishedAt.toISOString(),
        dateModified: post.updatedAt.toISOString(),
        articleSection: post.category.name,
        keywords: [post.category.name],
        timeRequired: `PT${post.readTimeMinutes}M`,
        isPartOf: {
          "@id": BLOG_ID,
        },
        author: {
          "@id": `${authorUrl}#author`,
        },
        publisher: {
          "@id": ORGANIZATION_ID,
        },
        ...(post.coverImageUrl ? { image: [post.coverImageUrl] } : {}),
      },
      buildBreadcrumbListJsonLd([
        { name: SITE_NAME, item: SITE_ORIGIN },
        { name: "Blog", item: getSiteHref("/blog") },
        { name: post.title, item: postUrl },
      ]),
    ],
  };
}
