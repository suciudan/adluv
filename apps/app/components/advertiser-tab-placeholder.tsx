"use client";

import Link from "next/link";

import { useWorkspaceHref } from "../lib/client-workspace";

export function AdvertiserTabPlaceholder({
  advertiserName,
  title,
  body,
}: {
  advertiserName: string;
  title: string;
  body: string;
}) {
  const workspaceHref = useWorkspaceHref();

  return (
    <section className="rounded-[34px] border border-dashed border-white/12 bg-[linear-gradient(180deg,rgba(23,18,14,0.86),rgba(12,12,14,0.98))] px-6 py-16 text-center sm:px-10">
      <p className="text-[11px] uppercase tracking-[0.28em] text-stone-500">{advertiserName}</p>
      <h2 className="mt-5 font-[family-name:var(--font-instrument-serif)] text-4xl leading-none tracking-[-0.04em] text-white sm:text-5xl">
        {title}
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-stone-300">{body}</p>
      <div className="mt-8">
        <Link
          href={workspaceHref("/advertisers")}
          className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-stone-100 transition hover:bg-white/10"
        >
          Browse advertisers
        </Link>
      </div>
    </section>
  );
}
