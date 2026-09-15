import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";

import { appConfig } from "@adluv/config";
import { getBlogAuthorBySlug, listPublishedBlogPosts } from "@adluv/db";

import styles from "../../../../components/marketing-homepage/styles.module.css";
import { Footer } from "../../../../components/marketing-homepage/components/Footer";
import { Header } from "../../../../components/marketing-homepage/components/Header";
import { formatDate, formatReadTime } from "../../../../lib/blog";
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

type BlogAuthorPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: BlogAuthorPageProps): Promise<Metadata> {
  const { slug } = await params;
  const author = await getBlogAuthorBySlug(slug);

  if (!author) {
    return buildSiteMetadata({
      title: `Blog | ${appConfig.name}`,
      path: "/blog",
    });
  }

  return buildSiteMetadata({
    title: `${author.name} | ${appConfig.name} Blog`,
    description: author.bio,
    path: `/blog/author/${author.slug}`,
    image: author.avatarImageUrl,
  });
}

export default async function BlogAuthorPage({ params }: BlogAuthorPageProps) {
  const { slug } = await params;
  const [author, authorPosts, user] = await Promise.all([
    getBlogAuthorBySlug(slug),
    listPublishedBlogPosts({ authorSlug: slug }),
    getCurrentUser(),
  ]);

  if (!author) {
    notFound();
  }

  return (
    <div className={`${styles.root} ${inter.variable} ${instrumentSerif.variable} dark min-h-screen bg-[#09090f] text-white`}>
      <Header isAuthenticated={Boolean(user)} />

      <main className="mx-auto max-w-7xl px-6 pb-24 pt-32 sm:pt-36">
        <section className="border-b border-white/8 pb-12 pt-4">
          <p className="text-sm font-semibold uppercase text-violet-400">Author</p>
          <div className="mt-8 flex items-start gap-5">
            {author.avatarImageUrl ? (
              <img
                src={author.avatarImageUrl}
                alt={author.name}
                className="h-16 w-16 shrink-0 rounded-full border border-violet-400/20 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-violet-400/20 bg-violet-500/12 text-xl font-semibold text-violet-100">
                {author.avatarLabel}
              </div>
            )}
            <div className="max-w-3xl">
              <h1 className="text-4xl text-white md:text-6xl">{author.name}</h1>
              <p className="mt-3 text-lg text-zinc-400">{author.role}</p>
              <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400">{author.bio}</p>
            </div>
          </div>
        </section>

        <section className="mt-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-violet-300/80">Articles</p>
          <div className="mt-8 grid gap-10 md:grid-cols-2 xl:grid-cols-3">
            {authorPosts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`} className="group block">
                <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.03]">
                  <div className="aspect-[1.34/1]">
                    {post.coverImageUrl ? (
                      <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${post.coverImageUrl})` }} />
                    ) : (
                      <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.4),transparent_38%),linear-gradient(180deg,rgba(124,58,237,0.28),rgba(9,9,15,0.6))]" />
                    )}
                  </div>
                </div>
                <div className="mt-4 text-xs uppercase tracking-wide text-zinc-500">
                  {post.category.name} • {formatReadTime(post.readTimeMinutes)} • {formatDate(post.publishedAt ?? post.createdAt)}
                </div>
                <h2 className="mt-3 text-3xl leading-tight text-zinc-100 transition-colors group-hover:text-white">
                  {post.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-zinc-400">{post.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>

      <Footer isAuthenticated={Boolean(user)} />
    </div>
  );
}
