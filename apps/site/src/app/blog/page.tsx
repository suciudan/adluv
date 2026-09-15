import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";

import { appConfig } from "@adluv/config";
import { listBlogCategories, listPublishedBlogPosts } from "@adluv/db";

import { BlogPage } from "../../components/blog-page";
import { JsonLd } from "../../components/json-ld";
import { buildSiteMetadata } from "../metadata";
import { getCurrentUser } from "../../lib/session";
import { buildBlogIndexJsonLd } from "../../lib/json-ld";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildSiteMetadata({
  title: `Blog | ${appConfig.name}`,
  description: "Creative ideas, practical tips, and operator notes for paid media teams.",
  path: "/blog",
});

export default async function BlogRoute() {
  const [user, posts, categories] = await Promise.all([
    getCurrentUser(),
    listPublishedBlogPosts(),
    listBlogCategories(),
  ]);

  return (
    <>
      <JsonLd data={buildBlogIndexJsonLd(posts)} />
      <BlogPage
        className={`${inter.variable} ${instrumentSerif.variable}`}
        isAuthenticated={Boolean(user)}
        posts={posts}
        categories={categories.map((category) => category.name)}
      />
    </>
  );
}
