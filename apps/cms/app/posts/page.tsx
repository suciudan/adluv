import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { listBlogPostsForCms } from "@adluv/db";

import { buttonClassName } from "../../src/components/button";
import { CmsShell } from "../../src/components/cms-shell";
import { requireCurrentAdmin } from "../../src/lib/session";

export const metadata: Metadata = {
  title: "Posts",
};

export default async function CmsPostsPage() {
  await requireCurrentAdmin();
  const posts = await listBlogPostsForCms();

  return (
    <CmsShell
      currentPath="/posts"
      title="Posts"
      subtitle="Create, edit, preview, and publish blog content."
      headerAction={
        <Link
          href="/posts/new"
          aria-label="Add post"
          className={buttonClassName({
            size: "sm",
            className: "!h-8 !w-8 min-w-0 shrink-0 !px-0",
          })}
        >
          <Plus className="h-4 w-4" />
        </Link>
      }
    >
      <div className="overflow-hidden rounded-md border border-white/10 bg-zinc-950 shadow-2xl shadow-black/10">
        {posts.length ? (
          <table className="min-w-full border-collapse text-left font-sans text-sm">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="border-b border-white/10 px-4 py-3 font-semibold">Title</th>
                <th className="border-b border-white/10 px-4 py-3 font-semibold">Author</th>
                <th className="border-b border-white/10 px-4 py-3 font-semibold">Category</th>
                <th className="border-b border-white/10 px-4 py-3 font-semibold">Status</th>
                <th className="border-b border-white/10 px-4 py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id} className="align-top hover:bg-zinc-900/70">
                  <td className="border-b border-white/10 px-4 py-4">
                    <Link href={`/posts/${post.id}`} className="font-medium text-[#2271b1] hover:text-violet-500 hover:underline">
                      {post.title}
                    </Link>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-400">{post.excerpt}</p>
                    <p className="mt-2 text-xs text-zinc-500">/{post.slug} • {post.readTimeMinutes} min read</p>
                  </td>
                  <td className="border-b border-white/10 px-4 py-4 text-zinc-300">{post.author.name}</td>
                  <td className="border-b border-white/10 px-4 py-4 text-zinc-300">{post.category.name}</td>
                  <td className="border-b border-white/10 px-4 py-4">
                    <span className="rounded-sm bg-zinc-800 px-2 py-1 text-xs font-medium uppercase tracking-wide text-zinc-300">
                      {post.status}
                    </span>
                  </td>
                  <td className="border-b border-white/10 px-4 py-4 text-xs text-zinc-400">
                    {post.updatedAt.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-8 py-16 text-center">
            <p className="font-sans text-xl text-zinc-100">No posts yet.</p>
            <p className="mt-3 font-sans text-sm text-zinc-400">Create your first draft to start the CMS.</p>
          </div>
        )}
      </div>
    </CmsShell>
  );
}
