import type { Metadata } from "next";
import { CmsShell } from "../../../src/components/cms-shell";
import { CategoryForm } from "../../../src/components/category-form";
import { requireCurrentAdmin } from "../../../src/lib/session";

export const metadata: Metadata = {
  title: "New category",
};

export default async function CmsNewCategoryPage() {
  await requireCurrentAdmin();

  return (
    <CmsShell
      currentPath="/categories"
      title="New category"
      subtitle="Create a blog category used for site navigation and post organization."
    >
      <CategoryForm category={null} />
    </CmsShell>
  );
}
