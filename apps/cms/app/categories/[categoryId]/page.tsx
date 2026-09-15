import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getBlogCategoryById } from "@adluv/db";

import { CmsShell } from "../../../src/components/cms-shell";
import { CategoryForm } from "../../../src/components/category-form";
import { requireCurrentAdmin } from "../../../src/lib/session";

type CmsCategoryEditorPageProps = {
  params: Promise<{ categoryId: string }>;
};

export const metadata: Metadata = {
  title: "Edit category",
};

export default async function CmsCategoryEditorPage({ params }: CmsCategoryEditorPageProps) {
  const [{ categoryId }] = await Promise.all([params, requireCurrentAdmin()]);
  const category = await getBlogCategoryById(categoryId);

  if (!category) {
    notFound();
  }

  return (
    <CmsShell
      currentPath="/categories"
      title="Edit category"
      subtitle="Update the public category details shown across the blog."
    >
      <CategoryForm category={category} />
    </CmsShell>
  );
}
