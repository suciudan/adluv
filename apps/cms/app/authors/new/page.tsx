import type { Metadata } from "next";
import { CmsShell } from "../../../src/components/cms-shell";
import { AuthorForm } from "../../../src/components/author-form";
import { requireCurrentAdmin } from "../../../src/lib/session";

export const metadata: Metadata = {
  title: "New author",
};

export default async function CmsNewAuthorPage() {
  await requireCurrentAdmin();

  return (
    <CmsShell
      currentPath="/authors"
      title="New author"
      subtitle="Create a public author profile for blog bylines and contributor pages."
    >
      <AuthorForm author={null} />
    </CmsShell>
  );
}
