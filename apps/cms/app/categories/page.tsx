import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { listBlogCategories } from "@adluv/db";

import { buttonClassName } from "../../src/components/button";
import { CmsShell } from "../../src/components/cms-shell";
import { CategoryManager } from "../../src/components/category-manager";
import { requireCurrentAdmin } from "../../src/lib/session";

export const metadata: Metadata = {
  title: "Categories",
};

export default async function CmsCategoriesPage() {
  await requireCurrentAdmin();
  const categories = await listBlogCategories();

  return (
    <CmsShell
      currentPath="/categories"
      title="Categories"
      subtitle="Manage public blog categories and their descriptions."
      headerAction={
        <Link
          href="/categories/new"
          aria-label="Add category"
          className={buttonClassName({
            size: "sm",
            className: "!h-8 !w-8 min-w-0 shrink-0 !px-0",
          })}
        >
          <Plus className="h-4 w-4" />
        </Link>
      }
    >
      <CategoryManager categories={categories} />
    </CmsShell>
  );
}
