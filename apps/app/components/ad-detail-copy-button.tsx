"use client";

import { useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";

export function AdDetailCopyButton({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const [label, setLabel] = useState("Copy URL");
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          try {
            await navigator.clipboard.writeText(value);
            setLabel("Copied");
            window.setTimeout(() => setLabel("Copy URL"), 1800);
          } catch {
            setLabel("Copy failed");
            window.setTimeout(() => setLabel("Copy URL"), 1800);
          }
        });
      }}
      className={
        className ??
        "app-button app-button-secondary disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {label === "Copied" ? <Check size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />}
      {label}
    </button>
  );
}
