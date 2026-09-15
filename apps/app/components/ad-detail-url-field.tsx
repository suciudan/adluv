"use client";

import { useState, useTransition } from "react";
import { ArrowUpRight, Check, Copy } from "lucide-react";

export function AdDetailUrlField({
  value,
}: {
  value: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [isPending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium leading-5 text-[var(--text-secondary)]">Landing page URL</p>

      <div className="relative">
        <input
          type="text"
          value={value}
          readOnly
          className="h-14 w-full rounded-[16px] border border-[var(--border-subtle)] bg-[color:var(--bg-surface-2)] pl-4 pr-28 text-[14px] font-medium leading-6 text-[var(--text-primary)] outline-none"
        />

        <div className="absolute inset-y-0 right-3 flex items-center gap-1">
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            aria-label="Open landing page"
            title="Open landing page"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-white/5 hover:text-[var(--text-primary)]"
          >
            <ArrowUpRight size={16} strokeWidth={1.75} />
          </a>

          <button
            type="button"
            aria-label={copyState === "copied" ? "Copied" : "Copy URL"}
            title={copyState === "copied" ? "Copied" : "Copy URL"}
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                try {
                  await navigator.clipboard.writeText(value);
                  setCopyState("copied");
                  window.setTimeout(() => setCopyState("idle"), 1800);
                } catch {
                  setCopyState("failed");
                  window.setTimeout(() => setCopyState("idle"), 1800);
                }
              });
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] transition hover:bg-white/5 hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {copyState === "copied" ? <Check size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      {copyState === "failed" ? (
        <p className="text-[12px] leading-5 text-[var(--text-tertiary)]">Copy failed. Try selecting the URL manually.</p>
      ) : null}
    </div>
  );
}
