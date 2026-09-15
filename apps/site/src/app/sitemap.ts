import type { MetadataRoute } from "next";

import { getSiteHref } from "@adluv/config";
import { listBlogAuthors, listBlogCategories, listPublishedBlogPosts } from "@adluv/db";

export const dynamic = "force-dynamic";

function buildUrl(path: string) {
  return getSiteHref(path);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, authors, categories] = await Promise.all([
    listPublishedBlogPosts(),
    listBlogAuthors(),
    listBlogCategories(),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: buildUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: buildUrl("/access"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: buildUrl("/demo"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: buildUrl("/insights"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: buildUrl("/blog"),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: buildUrl("/privacy-policy"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: buildUrl("/terms-of-service"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
    url: buildUrl(`/blog/${post.slug}`),
    lastModified: post.updatedAt ?? post.publishedAt ?? post.createdAt,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const authorRoutes: MetadataRoute.Sitemap = authors.map((author) => ({
    url: buildUrl(`/blog/author/${author.slug}`),
    lastModified: author.updatedAt ?? author.createdAt,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: buildUrl(`/blog/category/${category.slug}`),
    lastModified: category.updatedAt ?? category.createdAt,
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...postRoutes, ...authorRoutes, ...categoryRoutes];
}
