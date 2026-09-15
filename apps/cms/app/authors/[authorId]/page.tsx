import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getBlogAuthorById } from "@adluv/db";

import { CmsShell } from "../../../src/components/cms-shell";
import { AuthorForm } from "../../../src/components/author-form";
import { requireCurrentAdmin } from "../../../src/lib/session";

type CmsAuthorEditorPageProps = {
  params: Promise<{ authorId: string }>;
};

export const metadata: Metadata = {
  title: "Edit author",
};

export default async function CmsAuthorEditorPage({ params }: CmsAuthorEditorPageProps) {
  const [{ authorId }] = await Promise.all([params, requireCurrentAdmin()]);
  const author = await getBlogAuthorById(authorId);

  if (!author) {
    notFound();
  }

  return (
    <CmsShell
      currentPath="/authors"
      title="Edit author"
      subtitle="Update the public author profile shown across the blog."
    >
      <AuthorForm author={author} />
    </CmsShell>
  );
}
