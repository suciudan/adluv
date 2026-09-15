"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "./app-ui";

const tabs = [
  { label: "Overview", href: "overview" },
  { label: "Ads", href: "ads" },
  { label: "Landing Pages", href: "landing-pages" },
  { label: "Assets", href: "assets" },
];

function stripWorkspacePath(pathname: string) {
  const match = pathname.match(/^\/w\/[^/]+(?<path>\/.*)?$/);
  return match?.groups?.path ?? pathname;
}

function buildWorkspaceHref(workspaceSlug: string | undefined, href: string) {
  return workspaceSlug ? `/w/${workspaceSlug}${href}` : href;
}

export function AdvertiserTabsNav({
  advertiserId,
  workspaceSlug,
}: {
  advertiserId: string;
  workspaceSlug?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const routePathname = stripWorkspacePath(pathname);
  const activeTab = tabs.find((tab) => routePathname === `/advertisers/${advertiserId}/${tab.href}`) ?? tabs[0];

  return (
    <>
      <div className="relative sm:hidden">
        <select
          aria-label="Select advertiser section"
          value={activeTab.href}
          onChange={(event) => router.push(buildWorkspaceHref(workspaceSlug, `/advertisers/${advertiserId}/${event.target.value}`))}
          className="h-10 w-full appearance-none rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-4 pr-10 text-sm font-medium text-[var(--text-primary)] outline-none transition"
        >
          {tabs.map((tab) => (
            <option key={tab.href} value={tab.href}>
              {tab.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          strokeWidth={1.8}
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
        />
      </div>

      <nav className="hidden items-center gap-2 overflow-x-auto pb-1 sm:flex sm:flex-wrap sm:overflow-visible">
        {tabs.map((tab) => {
          const routeHref = `/advertisers/${advertiserId}/${tab.href}`;
          const href = buildWorkspaceHref(workspaceSlug, routeHref);
          const active = routePathname === routeHref;

          return (
            <Link
              key={tab.href}
              href={href}
              className={cn(
                "inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-sm font-medium transition",
                active
                  ? "border-[rgba(124,58,237,0.28)] bg-[var(--accent-soft)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-secondary)] hover:border-[var(--border-subtle)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
