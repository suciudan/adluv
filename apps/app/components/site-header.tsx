import Link from "next/link";

import { getSiteHref } from "@adluv/config";
import { Button } from "@adluv/ui";

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <Link href="/" className="flex items-center gap-3 text-sm font-medium uppercase tracking-[0.18em]">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-[#17130f] text-amber-300">
          AP
        </span>
        AdLuv
      </Link>

      <nav className="hidden items-center gap-6 text-sm text-stone-400 md:flex">
        <Link href="/demo" className="transition hover:text-white">
          Demo
        </Link>
        <Link href={getSiteHref("/#waitlist")} className="transition hover:text-white">
          Waitlist
        </Link>
        <Link href="/insights" className="transition hover:text-white">
          Insights
        </Link>
        <Link href="/activity" className="transition hover:text-white">
          App
        </Link>
      </nav>

      <div className="flex items-center gap-3">
        <Link href="/login" className="text-sm font-medium text-stone-400 transition hover:text-white">
          Sign in
        </Link>
        <Link href={getSiteHref("/#waitlist")}>
          <Button>Join waitlist</Button>
        </Link>
      </div>
    </header>
  );
}
