import type { Metadata } from "next";
import { listBlogAuthors, listBlogCategories } from "@adluv/db";

import { CmsShell } from "../../../src/components/cms-shell";
import { PostEditorForm } from "../../../src/components/post-editor-form";
import { requireCurrentAdmin } from "../../../src/lib/session";

export const metadata: Metadata = {
  title: "New post",
};

export default async function CmsNewPostPage() {
  await requireCurrentAdmin();
  const [authors, categories] = await Promise.all([
    listBlogAuthors(),
    listBlogCategories(),
  ]);

  return (
    <CmsShell
      currentPath="/posts"
      title="New post"
    >
      <PostEditorForm post={null} authors={authors} categories={categories} />
    </CmsShell>
  );
}
