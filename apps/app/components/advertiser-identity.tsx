"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "./app-ui";

type AdvertiserIdentityProps = {
  name: string;
  href: string;
  logoUrl?: string | null;
  metadata?: Array<ReactNode | null | undefined>;
  className?: string;
  contentClassName?: string;
  metadataClassName?: string;
  logoSizeClassName?: string;
  logoClassName?: string;
  titleAction?: ReactNode;
};

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AdvertiserIdentity({
  name,
  href,
  logoUrl,
  metadata = [],
  className,
  contentClassName,
  metadataClassName,
  logoSizeClassName = "h-12 w-12",
  logoClassName,
  titleAction,
}: AdvertiserIdentityProps) {
  const descriptionItems = metadata.filter((item): item is ReactNode => Boolean(item));

  return (
    <div className={className ?? "flex items-center gap-3"}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={`${name} logo`}
          className={cn(
            "rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] object-cover",
            logoSizeClassName,
            logoClassName,
          )}
        />
      ) : (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] text-sm font-semibold text-[var(--text-primary)]",
            logoSizeClassName,
            logoClassName,
          )}
        >
          {getInitials(name)}
        </span>
      )}
      <div className={cn("min-w-0 flex-1", contentClassName)}>
        <div className="flex min-w-0 items-center gap-1">
          <Link
            href={href}
            className="truncate text-[15px] font-semibold leading-5 !text-[var(--text-primary)] !underline !decoration-transparent underline-offset-4 transition hover:!text-[var(--accent-hover)] hover:!decoration-violet-500"
          >
            {name}
          </Link>
          {titleAction}
        </div>
        {descriptionItems.length ? (
          <p className={cn("text-[13px] leading-5 text-[var(--text-secondary)]", metadataClassName)}>
            {descriptionItems.map((item, index) => (
              <span key={index}>
                {index > 0 ? <span className="px-1.5">·</span> : null}
                {item}
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </div>
  );
}
