"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { PendingTrackedCompany, WorkspaceSummary } from "@adluv/db";
import {
  Activity,
  Bookmark,
  Building2,
  ChevronsUpDown,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Search,
  Settings,
  ShieldCheck,
  User,
  Eye,
  MessageCircle,
} from "lucide-react";

import { AddAdvertiserRequestModal } from "./add-advertiser-request-modal";
import { AppShellSearch } from "./app-shell-search";
import { LogoutButton } from "./logout-button";
import { PendingTrackedCompaniesChip } from "./pending-tracked-companies-chip";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "./app-ui";
import { AdluvLogo } from "./adluv-logo";
import { WorkspaceManagementModal } from "./workspace-management-modal";
import { openCrispChat } from "./crisp-chat";
import { isAdminUser } from "../lib/admin";

function AdsIcon({ size = 18, strokeWidth = 1.75 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M18 6H6v5h12zM6 16h12"
      />
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        d="M3.5 2h17A1.5 1.5 0 0 1 22 3.5v17a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 20.5v-17A1.5 1.5 0 0 1 3.5 2"
      />
    </svg>
  );
}

const navGroups = [
  {
    label: "Overview",
    items: [
      {
        href: "/activity",
        label: "Activity Feed",
        icon: Activity,
        matches: (pathname: string) => pathname === "/activity",
      },
    ],
  },
  {
    label: "Monitor",
    items: [
      {
        href: "/watchlist",
        label: "Watchlist",
        icon: Eye,
        matches: (pathname: string) => pathname === "/watchlist",
      },
    ],
  },
  {
    label: "Discover",
    items: [
      {
        href: "/advertisers",
        label: "Advertisers",
        icon: Building2,
        matches: (pathname: string) =>
          pathname === "/advertisers" || pathname.startsWith("/advertisers/"),
      },
      {
        href: "/ads",
        label: "Ads",
        icon: AdsIcon,
        matches: (pathname: string) => pathname === "/ads" || pathname.startsWith("/ads/"),
      },
    ],
  },
  {
    label: "Library",
    items: [
      {
        href: "/swipe-file",
        label: "Swipe File",
        icon: Bookmark,
        matches: (pathname: string) =>
          pathname === "/swipe-file" || pathname.startsWith("/swipe-file/"),
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        href: "/setup-mcp",
        label: "Setup MCP",
        icon: Plug,
        matches: (pathname: string) => pathname === "/setup-mcp",
      },
      {
        href: "/settings/account",
        label: "Settings",
        icon: Settings,
        matches: (pathname: string) => pathname === "/settings" || pathname.startsWith("/settings/"),
      },
      {
        href: "/admin/ads",
        label: "Admin",
        icon: ShieldCheck,
        adminOnly: true,
        matches: (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/"),
      },
    ],
  },
];

function getTopbarPageDefinition(pathname: string) {
  if (pathname === "/activity") {
    return { title: "Activity Feed" };
  }

  if (pathname === "/ads") {
    return { title: "Ads" };
  }

  if (pathname === "/advertisers") {
    return { title: "Advertisers" };
  }

  if (pathname === "/watchlist") {
    return { title: "Watchlist" };
  }

  if (pathname === "/swipe-file") {
    return { title: "Swipe File" };
  }

  if (pathname === "/setup-mcp") {
    return { title: "Setup MCP" };
  }

  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return { title: "Settings" };
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return { title: "Admin" };
  }

  return null;
}

function getWorkspaceRoutePath(pathname: string) {
  const match = pathname.match(/^\/w\/[^/]+(\/.*)?$/);
  return match ? match[1] || "/ads" : pathname;
}

function getWorkspaceHref(workspaceSlug: string, href: string) {
  return `/w/${workspaceSlug}${href}`;
}

function navigateToWorkspace(workspaceSlug: string, href: string) {
  window.location.assign(getWorkspaceHref(workspaceSlug, href));
}

function getInitials(user: { email: string; username?: string | null; name?: string | null }) {
  const source = user.name?.trim() || user.username?.trim() || user.email.trim();
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

function getUserDisplayName(user: { email: string; username?: string | null; name?: string | null }) {
  return user.name?.trim() || user.username?.trim() || user.email.trim();
}

const sidebarExpandedWidth = 264;
const sidebarCollapsedWidth = 72;
const desktopSidebarMediaQuery = "(min-width: 1024px) and (max-width: 1279px)";
const sidebarTooltipOffset = 12;

export function AppShell({
  children,
  pendingTrackedCompanies,
  unreadNotificationCount,
  user,
  workspace,
  workspaces,
  watchlistNavEntries,
}: {
  children: React.ReactNode;
  pendingTrackedCompanies: PendingTrackedCompany[];
  unreadNotificationCount: number;
  user: {
    email: string;
    username?: string | null;
    name?: string | null;
  };
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  watchlistNavEntries: Array<{
    advertiserId: string;
    advertiserName: string;
    activeAds: number;
  }>;
}) {
  const pathname = usePathname();
  const routePathname = getWorkspaceRoutePath(pathname);
  const userInitials = getInitials(user);
  const userDisplayName = getUserDisplayName(user);
  const showAdminNavigation = isAdminUser(user);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [workspaceManagementOpen, setWorkspaceManagementOpen] = useState(false);
  const [isDesktopSidebar, setIsDesktopSidebar] = useState(false);
  const [sidebarTooltip, setSidebarTooltip] = useState<{ label: string; top: number; left: number } | null>(null);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const compactSidebar = collapsed || isDesktopSidebar;
  const sidebarCollapsed = compactSidebar && !mobileNavOpen;
  const topbarPage = getTopbarPageDefinition(routePathname);
  const visibleUnreadActivityCount = routePathname === "/activity" ? 0 : unreadNotificationCount;

  const showSidebarTooltip = (element: HTMLElement, label: string) => {
    if (!sidebarCollapsed) {
      return;
    }

    const rect = element.getBoundingClientRect();
    setSidebarTooltip({
      label,
      left: rect.right + sidebarTooltipOffset,
      top: rect.top + rect.height / 2,
    });
  };

  const hideSidebarTooltip = () => setSidebarTooltip(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia(desktopSidebarMediaQuery);
    const updateIsDesktopSidebar = () => setIsDesktopSidebar(mediaQuery.matches);

    updateIsDesktopSidebar();
    mediaQuery.addEventListener("change", updateIsDesktopSidebar);

    return () => mediaQuery.removeEventListener("change", updateIsDesktopSidebar);
  }, []);

  useEffect(() => {
    setMobileNavOpen(false);
    setMobileSearchOpen(false);
    setUserMenuOpen(false);
    setWorkspaceMenuOpen(false);
    setSidebarTooltip(null);
  }, [pathname]);

  useEffect(() => {
    if (!sidebarCollapsed) {
      setSidebarTooltip(null);
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!userMenuOpen) {
      return undefined;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;

      if (target instanceof Node && userMenuRef.current?.contains(target)) {
        return;
      }

      setUserMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUserMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

  return (
    <div
      className="app-shell-root text-[var(--text-primary)]"
      data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
      style={{
        ["--sidebar-expanded-width" as string]: `${sidebarExpandedWidth}px`,
        ["--sidebar-collapsed-width" as string]: `${sidebarCollapsedWidth}px`,
        ["--sidebar-width" as string]: sidebarCollapsed ? `${sidebarCollapsedWidth}px` : `${sidebarExpandedWidth}px`,
      }}
    >
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-[var(--overlay)] lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "app-sidebar fixed inset-y-0 left-0 z-40 flex -translate-x-full flex-col border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] transition-transform duration-200 ease-out lg:translate-x-0",
          mobileNavOpen && "translate-x-0",
        )}
      >
        <div
          className={cn(
            "sticky top-0 bg-[var(--bg-sidebar)] pt-4",
            sidebarCollapsed ? "px-3 pb-2" : "px-4 pb-4",
          )}
        >
          <AdluvLogo
            href={getWorkspaceHref(workspace.slug, "/ads")}
            collapsed={sidebarCollapsed}
            size="site"
            className={sidebarCollapsed ? "justify-center" : undefined}
          />
          <div className={cn("relative", sidebarCollapsed ? "mt-3" : "mt-4")}>
            <button
              type="button"
              className={cn(
                "flex h-10 w-full items-center gap-2 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-3 text-left text-[var(--text-primary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-2)]",
                sidebarCollapsed && "justify-center px-0",
              )}
              onClick={() => setWorkspaceMenuOpen((value) => !value)}
              aria-label="Switch workspace"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-[var(--accent-soft)] text-[var(--accent-primary)]">
                <Building2 size={14} strokeWidth={1.9} />
              </span>
              {!sidebarCollapsed ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-[13px] leading-5">{workspace.name}</span>
                  <ChevronsUpDown size={14} strokeWidth={1.75} className="text-[var(--text-tertiary)]" />
                </>
              ) : null}
            </button>

            {workspaceMenuOpen ? (
              <div
                className={cn(
                  "z-50 overflow-hidden rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] p-2 shadow-[var(--shadow-card)]",
                  sidebarCollapsed ? "absolute left-full top-0 ml-3 w-64" : "mt-2",
                )}
              >
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {workspaces.map((item) => {
                    const isActiveWorkspace = item.id === workspace.id;

                    return (
                      <button
                        type="button"
                        key={item.id}
                        aria-current={isActiveWorkspace ? "true" : undefined}
                        onClick={() => {
                          setWorkspaceMenuOpen(false);

                          if (!isActiveWorkspace) {
                            navigateToWorkspace(item.slug, routePathname);
                          }
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-[10px] border px-3 py-2 text-left transition hover:bg-[var(--bg-surface-2)]",
                          isActiveWorkspace
                            ? "border-violet-500 bg-violet-500/10 text-[var(--text-primary)]"
                            : "border-transparent text-[var(--text-secondary)]",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] leading-5">{item.name}</span>
                          <span className="block text-[10px] leading-4 capitalize text-[var(--text-tertiary)]">{item.role}</span>
                        </span>
                        {isActiveWorkspace ? (
                          <span aria-label="Current workspace" className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                <div className="my-2 h-px bg-[var(--border-subtle)]" />
                <button
                  type="button"
                  onClick={() => {
                    setWorkspaceMenuOpen(false);
                    setWorkspaceManagementOpen(true);
                  }}
                  className="block w-full rounded-[10px] px-3 py-2 text-left text-[13px] leading-5 text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
                  style={{ fontSize: 13, lineHeight: "20px" }}
                >
                  Manage workspaces
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <nav className={cn("app-sidebar-scrollbar min-h-0 flex-1 overflow-y-auto px-3", sidebarCollapsed ? "py-2" : "py-4")}>
          <div className={sidebarCollapsed ? "space-y-2" : "space-y-5"}>
            {navGroups.map((group) => (
              <div key={group.label}>
                {!sidebarCollapsed ? (
                  <p className="px-3 pb-2 text-[12px] font-medium leading-4 text-[var(--text-tertiary)]">
                    {group.label}
                  </p>
                ) : null}
                <div className="space-y-1">
                  {group.items.filter((item) => !("adminOnly" in item) || !item.adminOnly || showAdminNavigation).map((item) => {
                    const active = item.matches(routePathname);
                    const Icon = item.icon;

                    return (
                      <div key={item.href}>
                      <Link
                        href={getWorkspaceHref(workspace.slug, item.href)}
                        aria-label={sidebarCollapsed ? item.label : undefined}
                        aria-describedby={sidebarTooltip?.label === item.label ? "app-sidebar-nav-tooltip" : undefined}
                        onPointerEnter={(event) => showSidebarTooltip(event.currentTarget, item.label)}
                        onPointerLeave={hideSidebarTooltip}
                        onFocus={(event) => showSidebarTooltip(event.currentTarget, item.label)}
                        onBlur={hideSidebarTooltip}
                        className={cn(
                          "group relative flex h-10 items-center gap-[10px] rounded-[12px] px-3 text-[14px] font-medium transition",
                          active
                            ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                            : "text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]",
                          sidebarCollapsed && "mx-auto w-10 justify-center px-0",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full bg-transparent",
                            active && "bg-[var(--accent-primary)]",
                          )}
                        />
                        <Icon size={18} strokeWidth={1.75} />
                        {!sidebarCollapsed ? <span>{item.label}</span> : null}
                        {item.href === "/activity" && visibleUnreadActivityCount ? (
                          sidebarCollapsed ? (
                            <span
                              aria-label={`${visibleUnreadActivityCount > 99 ? "99+" : visibleUnreadActivityCount} unread`}
                              className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border border-[var(--bg-sidebar)] bg-[var(--accent-primary)]"
                            />
                          ) : (
                            <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--accent-primary)] px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-white">
                              {visibleUnreadActivityCount > 99 ? "99+" : visibleUnreadActivityCount}
                            </span>
                          )
                        ) : null}
                      </Link>
                      {!sidebarCollapsed && item.href === "/watchlist" && watchlistNavEntries.length ? (
                        <div className="ml-7 mt-1 space-y-0.5">
                          {watchlistNavEntries.map((entry) => {
                            const href = getWorkspaceHref(workspace.slug, `/advertisers/${entry.advertiserId}/overview`);
                            const activeAdvertiser = routePathname.startsWith(`/advertisers/${entry.advertiserId}`);

                            return (
                              <Link
                                key={entry.advertiserId}
                                href={href}
                                className={cn(
                                  "flex h-8 min-w-0 items-center justify-between gap-2 rounded-lg px-2 text-[13px] leading-5 transition",
                                  activeAdvertiser
                                    ? "bg-[var(--bg-surface-2)] text-[var(--text-primary)]"
                                    : "text-[var(--text-tertiary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
                                )}
                              >
                                <span className="min-w-0 truncate">{entry.advertiserName}</span>
                                <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">{entry.activeAds}</span>
                              </Link>
                            );
                          })}
                        </div>
                      ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="sticky bottom-0 border-t border-[var(--border-subtle)] bg-[var(--bg-sidebar)] px-3 py-2">
          <button
            type="button"
            onClick={openCrispChat}
            aria-label={sidebarCollapsed ? "Help & Feedback" : undefined}
            aria-describedby={sidebarTooltip?.label === "Help & Feedback" ? "app-sidebar-nav-tooltip" : undefined}
            onPointerEnter={(event) => showSidebarTooltip(event.currentTarget, "Help & Feedback")}
            onPointerLeave={hideSidebarTooltip}
            onFocus={(event) => showSidebarTooltip(event.currentTarget, "Help & Feedback")}
            onBlur={hideSidebarTooltip}
            className={cn(
              "mb-2 flex h-10 w-full items-center gap-[10px] rounded-[12px] px-3 text-[14px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
              sidebarCollapsed && "mx-auto w-10 justify-center px-0",
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center">
              <MessageCircle size={18} strokeWidth={1.75} />
            </span>
            {!sidebarCollapsed ? <span>Help & Feedback</span> : null}
          </button>
          <div ref={userMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setUserMenuOpen((value) => !value)}
              aria-label="User menu"
              className={cn(
                "flex h-10 w-full items-center gap-3 rounded-[12px] px-3 text-left text-[14px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
                sidebarCollapsed && "justify-center px-0",
              )}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] text-[12px] font-semibold text-[var(--text-primary)]">
                {userInitials}
              </span>
              {!sidebarCollapsed ? <span className="min-w-0 truncate">{userDisplayName}</span> : null}
            </button>

            {userMenuOpen ? (
              <div
                className={cn(
                  "app-modal-surface absolute z-50 p-2",
                  sidebarCollapsed ? "bottom-0 left-full ml-3 w-64" : "bottom-[calc(100%+10px)] left-0 right-0",
                )}
              >
                <Link
                  href={getWorkspaceHref(workspace.slug, "/settings/account")}
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[14px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
                >
                  <User size={18} strokeWidth={1.75} />
                  <span>Account</span>
                </Link>
                <ThemeToggle
                  showLabel
                  className="flex w-full items-center justify-start gap-3 rounded-[12px] border-0 bg-transparent px-3 py-2.5 text-[14px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
                />
                <div className="mt-1">
                  <LogoutButton className="flex w-full items-center justify-start gap-3 rounded-[12px] border-0 bg-transparent px-3 py-2.5 text-[14px] font-medium normal-case text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]" />
                </div>
              </div>
            ) : null}
          </div>

        </div>
      </aside>

      {sidebarTooltip ? (
        <div
          id="app-sidebar-nav-tooltip"
          role="tooltip"
          className="pointer-events-none fixed z-50 -translate-y-1/2 whitespace-nowrap rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] px-3 py-2 text-[13px] font-medium leading-5 text-[var(--text-primary)] shadow-[var(--shadow-card)]"
          style={{ left: sidebarTooltip.left, top: sidebarTooltip.top }}
        >
          {sidebarTooltip.label}
        </div>
      ) : null}

      <div className="app-shell-main lg:ml-[var(--sidebar-width)]">
        <header className="app-topbar-blur sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-topbar)] px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <button
              type="button"
              className="app-icon-button lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={18} strokeWidth={1.75} />
            </button>
            {collapsed && !isDesktopSidebar ? (
              <button
                type="button"
                className="hidden app-icon-button lg:inline-flex"
                onClick={() => setCollapsed(false)}
                aria-label="Expand sidebar"
              >
                <PanelLeftOpen size={18} strokeWidth={1.75} />
              </button>
            ) : null}
            {!compactSidebar ? (
              <button
                type="button"
                className="hidden app-icon-button lg:inline-flex"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose size={18} strokeWidth={1.75} />
              </button>
            ) : null}
            {topbarPage ? (
              <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                <h1
                  className="truncate text-[24px] leading-[0.96] tracking-[-0.04em] text-[var(--text-primary)] sm:text-[28px]"
                  style={{ fontFamily: "var(--font-instrument-serif), serif" }}
                >
                  {topbarPage.title}
                </h1>
                <span className="hidden h-8 w-px shrink-0 bg-[var(--border-subtle)] lg:block" />
              </div>
            ) : null}
            <AddAdvertiserRequestModal
              triggerVariant="secondary"
              triggerClassName="!hidden lg:!inline-flex"
            />
            <div className="hidden min-w-0 flex-1 lg:block lg:pl-1">
              <div className="min-w-0 lg:max-w-[420px]">
                <AppShellSearch workspaceSlug={workspace.slug} />
              </div>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2 lg:hidden">
              <button
                type="button"
                className="app-icon-button"
                onClick={() => setMobileSearchOpen((value) => !value)}
                aria-label={mobileSearchOpen ? "Hide search" : "Show search"}
                aria-expanded={mobileSearchOpen}
              >
                <Search size={18} strokeWidth={1.75} />
              </button>
              <AddAdvertiserRequestModal
                triggerVariant="icon"
                iconOnly
                triggerClassName="shrink-0"
              />
            </div>
            <PendingTrackedCompaniesChip initialItems={pendingTrackedCompanies} />
            {mobileSearchOpen ? (
              <div className="order-3 w-full min-w-0 lg:hidden">
                <AppShellSearch workspaceSlug={workspace.slug} placeholder="Search" />
              </div>
            ) : null}
          </div>
        </header>

        <main className="px-4 pb-8 pt-5 sm:px-6 sm:pt-6">
          <div className="mx-auto max-w-[1680px]">{children}</div>
        </main>
      </div>

      <WorkspaceManagementModal
        workspace={workspace}
        workspaces={workspaces}
        open={workspaceManagementOpen}
        onOpenChange={setWorkspaceManagementOpen}
      />
    </div>
  );
}
