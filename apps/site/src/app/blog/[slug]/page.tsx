import type { Metadata } from "next";
import { Instrument_Serif, Inter } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";

import { isAuthUserAdmin } from "@adluv/auth";
import { appConfig } from "@adluv/config";
import { getPublishedBlogPostBySlug, listPublishedBlogPosts } from "@adluv/db";

import { JsonLd } from "../../../components/json-ld";
import styles from "../../../components/marketing-homepage/styles.module.css";
import { BlogTableOfContents } from "../../../components/blog-table-of-contents";
import { Footer } from "../../../components/marketing-homepage/components/Footer";
import { Header } from "../../../components/marketing-homepage/components/Header";
import { buildArticleMetadata, buildSiteMetadata } from "../../metadata";
import {
  categoryToSlug,
  extractTableOfContents,
  formatDate,
  formatReadTime,
  renderBlogMdxSafely,
} from "../../../lib/blog";
import { buildBlogPostJsonLd } from "../../../lib/json-ld";
import { getCurrentUser } from "../../../lib/session";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
});

type BlogArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

function BlogBodyRenderError({
  showDetails,
  error,
}: {
  error: {
    cause: string | null;
    message: string;
    stack: string | null;
  };
  showDetails: boolean;
}) {
  return (
    <section className="rounded-[1.75rem] border border-red-500/25 bg-red-500/10 p-6 font-sans text-sm text-red-100">
      <p className="font-semibold text-red-50">
        {showDetails ? "This article failed to render." : "This article is temporarily unavailable."}
      </p>
      {showDetails ? (
        <>
          <p className="mt-3 text-red-100/90">{error.message}</p>
          {error.cause ? <p className="mt-2 text-red-100/80">Cause: {error.cause}</p> : null}
          {error.stack ? (
            <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-6 text-red-100/85">
              {error.stack}
            </pre>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-red-100/80">The publish succeeded, but the body content crashed during rendering.</p>
      )}
    </section>
  );
}

export async function generateMetadata({ params }: BlogArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedBlogPostBySlug(slug);

  if (!post) {
    return buildSiteMetadata({
      title: `Blog | ${appConfig.name}`,
      path: "/blog",
    });
  }

  return buildArticleMetadata({
    title: `${post.seoTitle ?? post.title} | ${appConfig.name} Blog`,
    description: post.seoDescription ?? post.excerpt,
    path: `/blog/${post.slug}`,
    image: post.coverImageUrl,
    authors: [post.author.name],
    publishedTime: post.publishedAt ?? post.createdAt,
    modifiedTime: post.updatedAt,
    tags: [post.category.name],
  });
}

export default async function BlogArticlePage({ params }: BlogArticlePageProps) {
  const { slug } = await params;
  const [post, user, sameCategoryPosts, allPosts] = await Promise.all([
    getPublishedBlogPostBySlug(slug),
    getCurrentUser(),
    listPublishedBlogPosts(),
    listPublishedBlogPosts(),
  ]);

  if (!post) {
    notFound();
  }

  const relatedPosts = [
    ...sameCategoryPosts.filter((entry) => entry.id !== post.id && entry.category.id === post.category.id),
    ...allPosts.filter((entry) => entry.id !== post.id && entry.category.id !== post.category.id),
  ].slice(0, 3);
  const tableOfContents = extractTableOfContents(post.bodyMdx);
  const isAdmin = user ? await isAuthUserAdmin(user.id, process.env) : false;
  const renderResult = await renderBlogMdxSafely(post.bodyMdx);

  return (
    <div className={`${styles.root} ${inter.variable} ${instrumentSerif.variable} dark min-h-screen bg-[#09090f] text-white`}>
      <JsonLd data={buildBlogPostJsonLd(post)} />
      <Header isAuthenticated={Boolean(user)} />

      <main className="mx-auto max-w-[72rem] px-4 pb-24 pt-24 sm:px-6 sm:pt-36">
        <section className="border-b border-white/8 pb-10 pt-0 text-center sm:pb-12 sm:pt-4">
          <time dateTime={post.publishedAt?.toISOString()} className="mt-4 block text-sm font-semibold uppercase text-violet-400 sm:mt-8">
            {formatDate(post.publishedAt ?? post.createdAt)}
          </time>
          <h1 className="mx-auto mt-5 text-5xl text-white md:text-7xl">{post.title}</h1>
          <div className="mt-8 flex items-center justify-center">
            <div className="inline-flex items-center gap-4 text-left">
              {post.author.avatarImageUrl ? (
                <img
                  src={post.author.avatarImageUrl}
                  alt={post.author.name}
                  className="h-8 w-8 rounded-full border border-violet-400/20 object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-400/20 bg-violet-500/12 text-sm font-semibold text-violet-100">
                  {post.author.avatarLabel}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <div className="flex items-center gap-1 text-base font-medium">
                  <span className="text-zinc-500">By</span>
                  <Link href={`/blog/author/${post.author.slug}`} className="inline-block text-white transition-colors hover:text-violet-300">
                    {post.author.name}
                  </Link>
                </div>
                <p className="text-sm text-zinc-400">{post.author.role}</p>
                <span className="text-sm text-zinc-500">• {formatReadTime(post.readTimeMinutes)}</span>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03]">
          <div className="aspect-[16/9]">
            {post.coverImageUrl ? (
              <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${post.coverImageUrl})` }} />
            ) : (
              <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.4),transparent_38%),linear-gradient(180deg,rgba(124,58,237,0.28),rgba(9,9,15,0.6))]" />
            )}
          </div>
        </div>

        <article className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="blog-post-body min-w-0 prose prose-invert max-w-none prose-p:text-zinc-300 prose-strong:text-white prose-blockquote:border-violet-400/30 prose-blockquote:text-zinc-100 [&_h2]:my-5 [&_h2]:scroll-mt-28 [&_h2]:text-4xl [&_h2]:leading-tight [&_h2]:font-normal [&_h2]:text-white [&_h3]:my-5 [&_h3]:scroll-mt-28 [&_h3]:text-3xl [&_h3]:leading-snug [&_h3]:font-normal [&_h3]:text-white [&_p]:my-5 [&_p]:leading-8 [&_ul]:my-5 [&_ol]:my-5 [&_blockquote]:my-6 [&_table]:my-6 [&_figure]:my-6 [&_figure_img]:my-0 [&_figure_img]:rounded-2xl [&_figcaption]:mt-3 [&_figcaption]:text-center [&_figcaption]:text-sm [&_figcaption]:leading-6 [&_figcaption]:text-zinc-500 [&_li+li]:mt-2 md:[&_h2]:text-5xl md:[&_h3]:text-4xl">
            {renderResult.status === "ok" ? (
              renderResult.content
            ) : (
              <BlogBodyRenderError error={renderResult.error} showDetails={isAdmin} />
            )}
          </div>

          {renderResult.status === "ok" && tableOfContents.length ? (
            <aside className="hidden lg:sticky lg:top-28 lg:block lg:h-fit">
              <BlogTableOfContents items={tableOfContents} />
            </aside>
          ) : null}
        </article>

        <section className="mt-16 border-t border-white/8 pt-10">
          <div className="max-w-3xl">
            <div className="flex items-start gap-4">
              {post.author.avatarImageUrl ? (
                <img
                  src={post.author.avatarImageUrl}
                  alt={post.author.name}
                  className="h-12 w-12 shrink-0 rounded-full border border-violet-400/20 object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-violet-400/20 bg-violet-500/12 text-sm font-semibold text-violet-100">
                  {post.author.avatarLabel}
                </div>
              )}
              <div>
                <p className="text-lg font-medium text-white">{post.author.name}</p>
                <p className="text-sm text-zinc-400">{post.author.role}</p>
              </div>
            </div>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400">{post.author.bio}</p>
            <Link href={`/blog/author/${post.author.slug}`} className="mt-5 inline-flex text-sm font-semibold text-violet-400 transition-colors hover:text-violet-300">
              View articles
            </Link>
          </div>
        </section>

        {relatedPosts.length > 0 ? (
          <section className="mt-20 border-t border-white/8 pt-10">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-widest text-violet-300/80">Related reads</p>
                <h2 className="mt-3 text-4xl leading-tight text-white md:text-5xl">
                  More from <span className="text-violet-500">{post.category.name}</span>
                </h2>
              </div>
              <Link href={`/blog/category/${categoryToSlug(post.category.name)}`} className="text-sm font-semibold text-zinc-200 underline underline-offset-4">
                View all articles
              </Link>
            </div>

            <div className="mt-10 grid gap-8 md:grid-cols-3">
              {relatedPosts.map((relatedPost) => (
                <Link key={relatedPost.id} href={`/blog/${relatedPost.slug}`} className="group block">
                  <div className="overflow-hidden rounded-[1.6rem] border border-white/10 bg-white/[0.03]">
                    <div className="aspect-[1.34/1]">
                      {relatedPost.coverImageUrl ? (
                        <div className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url(${relatedPost.coverImageUrl})` }} />
                      ) : (
                        <div className="h-full w-full bg-[radial-gradient(circle_at_top_left,rgba(139,92,246,0.4),transparent_38%),linear-gradient(180deg,rgba(124,58,237,0.28),rgba(9,9,15,0.6))]" />
                      )}
                    </div>
                  </div>
                  <div className="mt-4 text-xs uppercase tracking-wide text-zinc-500">
                    {relatedPost.category.name} • {formatReadTime(relatedPost.readTimeMinutes)}
                  </div>
                  <h3 className="mt-3 text-4xl leading-tight text-zinc-100 transition-colors group-hover:text-white">
                    {relatedPost.title}
                  </h3>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <Footer isAuthenticated={Boolean(user)} />
    </div>
  );
}
