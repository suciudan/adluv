import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";

import { appConfig } from "@adluv/config";
import { getBlogCategoryBySlug, listBlogCategories, listPublishedBlogPosts } from "@adluv/db";

import styles from "../../../../components/marketing-homepage/styles.module.css";
import { Footer } from "../../../../components/marketing-homepage/components/Footer";
import { Header } from "../../../../components/marketing-homepage/components/Header";
import { categoryToSlug, formatReadTime } from "../../../../lib/blog";
import { buildSiteMetadata } from "../../../metadata";
import { getCurrentUser } from "../../../../lib/session";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

type BlogCategoryPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: BlogCategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getBlogCategoryBySlug(slug);

  if (!category) {
    return buildSiteMetadata({
      title: `Blog | ${appConfig.name}`,
      path: "/blog",
    });
  }

  return buildSiteMetadata({
    title: `${category.name} | ${appConfig.name} Blog`,
    description: category.description ?? `Articles from the ${category.name} category.`,
    path: `/blog/category/${category.slug}`,
  });
}

export default async function BlogCategoryPage({ params }: BlogCategoryPageProps) {
  const { slug } = await params;
  const [category, categories, posts, user] = await Promise.all([
    getBlogCategoryBySlug(slug),
    listBlogCategories(),
    listPublishedBlogPosts({ categorySlug: slug }),
    getCurrentUser(),
  ]);

  if (!category) {
    notFound();
  }

  return (
    <div className={`${styles.root} ${inter.variable} ${instrumentSerif.variable} dark min-h-screen bg-[#09090f] text-white`}>
      <Header isAuthenticated={Boolean(user)} />

      <main>
        <section className="mx-auto max-w-7xl px-6 pb-14 pt-[7.5rem] sm:pt-[8.5rem]">
          <div className="border-b border-white/8 pb-12 text-center">
            <p className="text-sm font-semibold uppercase text-violet-400">Category</p>
            <h1 className="mt-8 text-5xl text-white md:text-7xl">{category.name}</h1>
            <p className="mt-6 text-base text-zinc-400 md:text-lg">{posts.length} articles</p>
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/blog"
              className="rounded-full border border-violet-400/30 bg-violet-500/18 px-6 py-3 text-base font-semibold text-violet-100 transition-colors duration-200 hover:border-violet-400/40 hover:bg-violet-500/24"
            >
              All
            </Link>
            {categories.map((item) => {
              const isActive = item.slug === category.slug;

              return (
                <Link
                  key={item.id}
                  href={`/blog/category/${item.slug ?? categoryToSlug(item.name)}`}
                  className={[
                    "rounded-full border px-6 py-3 text-base font-semibold transition-colors duration-200",
                    isActive
                      ? "border-violet-400/30 bg-violet-500/18 text-violet-100"
                      : "border-white/10 bg-transparent text-white hover:border-violet-400/30 hover:text-violet-100",
                  ].join(" ")}
                >
                  {item.name}
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 pb-24">
          <div className="mt-10 grid gap-x-8 gap-y-12 lg:grid-cols-2 xl:grid-cols-3">
            {posts.map((post) => (
              <article key={post.id} className="group">
                <Link href={`/blog/${post.slug}`} className="block">
                  <div className="relative aspect-[1.38/1] overflow-hidden rounded-[1.8rem] border border-white/10 bg-white/[0.03]">
                    {post.coverImageUrl ? (
                      <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${post.coverImageUrl})` }} />
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
            ))}
          </div>
        </section>
      </main>

      <Footer isAuthenticated={Boolean(user)} />
    </div>
  );
}
