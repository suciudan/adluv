import type { ComponentProps } from "react";
import Link from "next/link";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export const siteButtonClassName =
  "inline-flex cursor-pointer items-center justify-center rounded-lg bg-violet-600 px-4 py-2 text-[14px] font-medium !text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60";

export function SiteButton({
  className,
  children,
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={joinClasses(siteButtonClassName, className)}
    >
      {children}
    </button>
  );
}

export function SiteLinkButton({
  href,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  return (
    <Link
      href={href}
      {...props}
      className={joinClasses(siteButtonClassName, className)}
    >
      {children}
    </Link>
  );
}
