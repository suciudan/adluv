import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  getBlogPostByIdForCms,
  listBlogAuthors,
  listBlogCategories,
} from "@adluv/db";

import { CmsShell } from "../../../src/components/cms-shell";
import { PostEditorForm } from "../../../src/components/post-editor-form";
import { requireCurrentAdmin } from "../../../src/lib/session";

type CmsPostEditorPageProps = {
  params: Promise<{ postId: string }>;
};

export const metadata: Metadata = {
  title: "Edit post",
};

export default async function CmsPostEditorPage({ params }: CmsPostEditorPageProps) {
  const [{ postId }, _user, authors, categories] = await Promise.all([
    params,
    requireCurrentAdmin(),
    listBlogAuthors(),
    listBlogCategories(),
  ]);
  const post = await getBlogPostByIdForCms(postId);

  if (!post) {
    notFound();
  }

  return (
    <CmsShell
      currentPath="/posts"
      title="Edit post"
      subtitle="Update the article content, SEO fields, and publish state."
    >
      <PostEditorForm post={post} authors={authors} categories={categories} />
    </CmsShell>
  );
}
