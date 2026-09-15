"use client";

import { useRouter } from "next/navigation";

import type { AdDetailRecord } from "@adluv/db";

import { useWorkspaceHref } from "../lib/client-workspace";
import { AdDetailsModal } from "./browse-ads-page";

export function AdDetailPageContent({ ad }: { ad: AdDetailRecord }) {
  const router = useRouter();
  const workspaceHref = useWorkspaceHref();

  return (
    <AdDetailsModal
      ad={ad}
      detail={ad}
      error={null}
      onClose={() => router.push(workspaceHref("/ads"))}
      presentation="page"
    />
  );
}
