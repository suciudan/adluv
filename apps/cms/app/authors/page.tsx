import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { listBlogAuthors } from "@adluv/db";

import { buttonClassName } from "../../src/components/button";
import { CmsShell } from "../../src/components/cms-shell";
import { AuthorManager } from "../../src/components/author-manager";
import { requireCurrentAdmin } from "../../src/lib/session";

export const metadata: Metadata = {
  title: "Authors",
};

export default async function CmsAuthorsPage() {
  await requireCurrentAdmin();
  const authors = await listBlogAuthors();

  return (
    <CmsShell
      currentPath="/authors"
      title="Authors"
      subtitle="Manage public author bios, display names, and bylines used across the blog."
      headerAction={
        <Link
          href="/authors/new"
          aria-label="Add author"
          className={buttonClassName({
            size: "sm",
            className: "!h-8 !w-8 min-w-0 shrink-0 !px-0",
          })}
        >
          <Plus className="h-4 w-4" />
        </Link>
      }
    >
      <AuthorManager authors={authors} />
    </CmsShell>
  );
}
