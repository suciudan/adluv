"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import type { BlogPostRecord } from "@adluv/db";

import { Button } from "@adluv/ui"

import styles from "./marketing-homepage/styles.module.css"
import { Footer } from "./marketing-homepage/components/Footer";
import { Header } from "./marketing-homepage/components/Header";
import { categoryToSlug, formatReadTime } from "../lib/blog";

const initialVisibleCount = 6;

function BlogCard({ post }: { post: BlogPostRecord }) {
  return (
    <article className="group">
      <Link href={`/blog/${post.slug}`} className="block">
        <div className="relative aspect-[1.38/1] overflow-hidden rounded-[1.8rem] border border-white/10 bg-white/[0.03]">
          {post.coverImageUrl ? (
            <div className="h-full w-full bg-cover bg-center transition duration-300 group-hover:scale-[1.02]" style={{ backgroundImage: `url(${post.coverImageUrl})` }} />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.4),transparent_38%),linear-gradient(180deg,rgba(124,58,237,0.28),rgba(9,9,15,0.6))]" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_55%,rgba(9,9,15,0.18)_100%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        </div>
        <div className="pt-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs uppercase text-zinc-500">
            <span>{post.category.name}</span>
            <span aria-hidden="true">•</span>
            <span>{formatReadTime(post.readTimeMinutes)}</span>
          </div>
          <h2 className="mt-3 text-4xl text-zinc-100 transition-colors duration-200 group-hover:text-white">
            {post.title}
          </h2>
          <p className="mt-4 max-w-[60ch] text-sm leading-7 text-zinc-400">{post.excerpt}</p>
        </div>
      </Link>
    </article>
  );
}

export function BlogPage({
  className,
  isAuthenticated,
  posts,
  categories,
}: {
  className: string;
  isAuthenticated: boolean;
  posts: BlogPostRecord[];
  categories: string[];
}) {
  const [activeCategory] = useState<string>("All");
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);

  const filteredPosts = useMemo(() => {
    if (activeCategory === "All") {
      return posts;
    }

    return posts.filter((post) => post.category.name === activeCategory);
  }, [activeCategory, posts]);

  const visiblePosts = filteredPosts.slice(0, visibleCount);
  const canLoadMore = visiblePosts.length < filteredPosts.length;

  return (
    <div className={`${styles.root} ${className} dark min-h-screen bg-[#09090f] text-white`}>
      <Header isAuthenticated={isAuthenticated} />

      <main>
        <section className="mx-auto max-w-7xl px-6 pb-14 pt-[7.5rem] sm:pt-[8.5rem]">
          <div className="flex min-h-[22rem] flex-col items-center justify-center border-b border-white/8 pb-12 text-center">
            <p className="text-sm font-semibold uppercase text-violet-400">Blog</p>
            <h1 className="mt-8 text-5xl text-white md:text-7xl">
              Adluv Insights
            </h1>
            <p className="mt-6 max-w-xl text-base text-zinc-400 md:text-lg">
              Learn what’s working (and why) across brands, channels, and campaigns.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-24">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-wrap gap-2.5 lg:min-w-0">
                {["All", ...categories].map((category) => {
                  const isActive = category === "All";
                  return (
                    <Link
                      key={category}
                      href={category === "All" ? "/blog" : `/blog/category/${categoryToSlug(category)}`}
                      className={[
                        "shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors duration-200",
                        isActive
                          ? "border-violet-400/30 bg-violet-500/18 text-violet-100"
                          : "border-white/10 bg-transparent text-zinc-400 hover:border-violet-400/30 hover:text-white",
                      ].join(" ")}
                    >
                      {category}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="mt-12 grid gap-x-8 gap-y-12 lg:grid-cols-2 xl:grid-cols-3">
              {visiblePosts.map((post) => (
                <BlogCard key={post.slug} post={post} />
              ))}
            </div>

            {filteredPosts.length === 0 ? (
              <div className="mt-16 rounded-[2rem] border border-dashed border-white/10 bg-white/[0.02] px-8 py-14 text-center">
                <p className="text-xl font-medium text-white">No articles have been published yet.</p>
                <p className="mt-3 text-zinc-500">Create and publish the first post from the CMS.</p>
              </div>
            ) : null}
            {canLoadMore ? (
              <div className="mt-16 flex justify-center">
                <Button
                  type="button"
                  onClick={() => setVisibleCount((current) => current + 3)}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-8 py-2.5 text-base font-semibold text-zinc-200 hover:border-violet-400/30 hover:bg-violet-500/10"
                >
                  Load More
                </Button>
              </div>
            ) : null}
        </section>
      </main>

      <Footer isAuthenticated={isAuthenticated} />
    </div>
  );
}
