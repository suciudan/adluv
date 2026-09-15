"use client";

import Link from "next/link"

import { Logo } from "../../Logo"

const columns = [
  {
    title: "Product",
    links: [
      {
        text: "Features",
        href: "/#features"
      },
      {
        text: "With vs Without",
        href: "/#with-vs-without"
      },
      {
        text: "Use Cases",
        href: "/#use-cases"
      },
    ],
  },
  {
    title: "Resources",
    links: [
      {
        text: "Blog",
        href: "/blog"
      }
    ],
  },
  {
    title: "Company",
    links: [
      {
        text: "Contact",
        href: "mailto:support@adluv.co"
      },
      {
        text: "LinkedIn",
        href: "https://www.linkedin.com/company/adluv"
      }
    ],
  },
  {
    title: "Legal",
    links: [
      {
        text: "Privacy",
        href: "/privacy-policy"
      },
      {
        text: "Terms",
        href: "/terms-of-service"
      }
    ],
  },
];

export function Footer({ isAuthenticated: _isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <footer className="border-t border-white/5 bg-[#08080c] py-16">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-5 lg:gap-12">
          <div className="col-span-2 md:col-span-1">

            <Logo href="/" size="h-10" />
            <p className="mt-4 max-w-xs text-sm leading-[1.7] text-zinc-500">
              The ad intelligence platform for marketers, agencies, and growth teams who want faster competitor research and better creative decisions.
            </p>
          </div>

          {columns.map((column) => (
            <div key={column.title}>
              <h4 className="text-sm font-semibold tracking-[0.04em] text-zinc-300">
                {column.title}
              </h4>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                        className="text-sm text-zinc-500 transition-colors hover:text-zinc-300"
                        rel={link.href.startsWith("https://") ? "noreferrer noopener" : ""}
                        href={link.href}
                    >
                      {link.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 border-t border-white/5 pt-6 text-center">
          <p className="text-[12px] text-zinc-600">
            &copy; {new Date().getFullYear()} Adluv. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
