"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";

export function getWorkspacePrefix(pathname: string) {
  const match = pathname.match(/^\/w\/[^/]+/);
  return match?.[0] ?? "";
}

export function useWorkspaceHref() {
  const pathname = usePathname();
  const prefix = getWorkspacePrefix(pathname);

  return useCallback(
    (href: string) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        return href;
      }

      const normalizedHref = href.startsWith("/") ? href : `/${href}`;

      if (!prefix || normalizedHref.startsWith("/w/")) {
        return normalizedHref;
      }

      return `${prefix}${normalizedHref}`;
    },
    [prefix],
  );
}
