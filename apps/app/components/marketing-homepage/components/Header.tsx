"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";

import { AdluvLogo } from "../../adluv-logo";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "With vs Without", href: "#with-vs-without" },
  { label: "Use Cases", href: "#use-cases" },
];

export function Header({ isAuthenticated: _isAuthenticated }: { isAuthenticated: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/8 bg-[#09090f]/78 backdrop-blur-xl">
      <div className="mx-auto flex w-[min(1200px,calc(100vw-2rem))] items-center justify-between px-1 py-4 sm:px-3">
        <AdluvLogo href="/" size="site" textClassName="text-white" />

        <nav className="hidden items-center gap-8 lg:flex">
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} className="text-zinc-400 transition-colors hover:text-white" style={{ fontSize: 14 }}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          <a
            href="#waitlist"
            className="inline-flex rounded-full bg-violet-600 px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-violet-500"
          >
            Join Waitlist
          </a>
        </div>

        <button type="button" className="text-white lg:hidden" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/5 bg-[#0a0a0f] px-6 py-6 lg:hidden">
          <nav className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-zinc-400 transition-colors hover:text-white"
                style={{ fontSize: 15 }}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <hr className="border-white/10" />
            <a
              href="#waitlist"
              className="inline-flex w-full justify-center rounded-full bg-violet-600 px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-violet-500"
              onClick={() => setMobileOpen(false)}
            >
              Join Waitlist
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
