import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getBlogPostByIdForCms } from "@adluv/db";

import { requireCurrentAdmin } from "../../../../src/lib/session";
import { renderBlogMdxSafely } from "../../../../src/lib/blog-mdx";

type CmsPostPreviewPageProps = {
  params: Promise<{ postId: string }>;
};

export const metadata: Metadata = {
  title: "Post preview",
};

export default async function CmsPostPreviewPage({ params }: CmsPostPreviewPageProps) {
  const [{ postId }] = await Promise.all([params, requireCurrentAdmin()]);
  const post = await getBlogPostByIdForCms(postId);

  if (!post) {
    notFound();
  }

  const renderResult = await renderBlogMdxSafely(post.bodyMdx);

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12">
      <div className="mx-auto max-w-4xl rounded-md border border-white/10 bg-zinc-900 p-8 shadow-2xl shadow-black/20">
        <p className="font-sans text-xs font-semibold uppercase tracking-widest text-violet-500">Saved preview</p>
        <h1 className="mt-4 text-5xl text-zinc-100">{post.title}</h1>
        <p className="mt-4 text-lg leading-8 text-zinc-300">{post.excerpt}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3 font-sans text-sm text-zinc-500">
          <span>{post.category.name}</span>
          <span>•</span>
          <span>{post.author.name}</span>
          <span>•</span>
          <span>{post.readTimeMinutes} min read</span>
        </div>

        {post.coverImageUrl ? (
          <div
            className="mt-8 aspect-video rounded-md border border-white/10 bg-cover bg-center"
            style={{ backgroundImage: `url(${post.coverImageUrl})` }}
          />
        ) : null}

        {renderResult.status === "ok" ? (
          <article className="prose prose-invert mt-10 max-w-none prose-headings:text-zinc-100 prose-p:text-zinc-300 prose-strong:text-zinc-100 prose-a:text-violet-400">
            {renderResult.content}
          </article>
        ) : (
          <section className="mt-10 rounded-md border border-red-500/30 bg-red-500/10 p-5 font-sans text-sm text-red-100">
            <p className="font-semibold text-red-50">Preview render failed</p>
            <p className="mt-2 text-red-100/90">{renderResult.error.message}</p>
            {renderResult.error.cause ? (
              <p className="mt-2 text-red-100/80">Cause: {renderResult.error.cause}</p>
            ) : null}
            {renderResult.error.stack ? (
              <pre className="mt-4 overflow-x-auto rounded-md border border-white/10 bg-black/30 p-4 text-xs leading-6 text-red-100/85">
                {renderResult.error.stack}
              </pre>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}
