import Link from "next/link";

import { getAppHref } from "@adluv/config";

import { SiteHeader } from "./site-header";

export function MarketingFrame({
  children,
  lead,
  title,
}: {
  children: React.ReactNode;
  lead?: string;
  title?: string;
}) {
  return (
    <div className="min-h-screen bg-[#0d0c0a] text-neutral-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_12%_14%,rgba(240,153,40,0.2),transparent_24%),radial-gradient(circle_at_86%_18%,rgba(178,83,9,0.18),transparent_22%),linear-gradient(180deg,rgba(13,12,10,0.84),rgba(13,12,10,0.98))]" />
      <div className="relative">
        <SiteHeader />

        <main className="mx-auto max-w-6xl px-6 pb-24 pt-8">
          {title ? (
            <section className="mb-12 grid gap-6 border-b border-white/10 pb-10 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
              <div className="space-y-4">
                <p className="text-[11px] uppercase tracking-[0.28em] text-amber-300/80">adluv launch site</p>
                <h1 className="max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-balance sm:text-6xl">
                  {title}
                </h1>
              </div>
              {lead ? <p className="max-w-xl text-sm leading-7 text-stone-300">{lead}</p> : null}
            </section>
          ) : null}

          {children}
        </main>

        <footer className="mx-auto flex max-w-6xl flex-col gap-6 border-t border-white/10 px-6 py-8 text-sm text-stone-400 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold text-stone-200">AdLuv</p>
            <p className="mt-1">LinkedIn-first competitor ad intelligence.</p>
          </div>
          <div className="flex flex-wrap gap-5">
            <Link href="/demo" className="transition hover:text-white">
              Demo
            </Link>
            <Link href="/#waitlist" className="transition hover:text-white">
              Waitlist
            </Link>
            <Link href="/insights" className="transition hover:text-white">
              Insights
            </Link>
            <Link href={getAppHref("/login")} className="transition hover:text-white">
              Sign in
            </Link>
            <Link href="/privacy-policy" className="transition hover:text-white">
              Privacy
            </Link>
            <Link href="/terms-of-service" className="transition hover:text-white">
              Terms
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
