"use client";

import { Menu, X } from "lucide-react"
import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Logo } from "../../Logo"

const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "With vs Without", href: "/#with-vs-without" },
  { label: "MCP", href: "/#mcp"},
  { label: "Use Cases", href: "/#use-cases" },
];

export function Header({ isAuthenticated: _isAuthenticated }: { isAuthenticated: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  function isActiveLink(href: string) {
    if (href === "/blog") {
      return pathname === "/blog" || pathname.startsWith("/blog/");
    }

    return false;
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/8 bg-[#09090f]/78 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-3">
        <Logo href="/" size="h-9 sm:h-10" />
        <nav className="hidden items-center gap-8 lg:flex">
          {navLinks.map((link) => {
            const isActive = isActiveLink(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={`px-3 py-1.5 text-[14px] transition-colors ${
                  isActive
                    ? "!font-semibold !text-violet-400"
                    : "font-normal text-zinc-400 hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          <Link
            href="/#waitlist"
            className="inline-flex rounded-full bg-violet-600 px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-violet-500"
          >
            Join Waitlist
          </Link>
        </div>

        <button type="button" className="text-white lg:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="size-6 sm:size-8" /> : <Menu className="size-6 sm:size-8" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/5 bg-[#0a0a0f] px-6 py-6 lg:hidden">
          <nav className="flex flex-col gap-4">
            {navLinks.map((link) => {
              const isActive = isActiveLink(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`px-3 py-2 text-[15px] transition-colors ${
                    isActive
                      ? "!font-semibold !text-violet-400"
                      : "font-normal text-zinc-400 hover:text-white"
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              );
            })}
            <hr className="border-white/10" />
            <Link
              href="/#waitlist"
              className="inline-flex w-full justify-center rounded-full bg-violet-600 px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-violet-500"
              onClick={() => setMobileOpen(false)}
            >
              Join Waitlist
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
