"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";

import { appThemeStorageKey, defaultAppTheme, normalizeAppTheme, type AppTheme } from "../lib/theme";

function readTheme(): AppTheme {
  if (typeof document === "undefined") {
    return defaultAppTheme;
  }

  return normalizeAppTheme(document.documentElement.dataset.theme);
}

function applyTheme(nextTheme: AppTheme) {
  document.documentElement.dataset.theme = nextTheme;
  window.localStorage.setItem(appThemeStorageKey, nextTheme);
}

export function ThemeToggle({
  className,
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const [theme, setTheme] = useState<AppTheme>(defaultAppTheme);
  const isLight = theme === "light";
  const label = isLight ? "Light mode" : "Dark mode";

  useEffect(() => {
    setTheme(readTheme());

    const observer = new MutationObserver(() => {
      setTheme(readTheme());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  return (
    <button
      type="button"
      aria-label={`Switch to ${isLight ? "dark" : "light"} mode`}
      aria-pressed={isLight}
      title={`Switch to ${isLight ? "dark" : "light"} mode`}
      onClick={() => {
        const nextTheme = isLight ? "dark" : "light";
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
      className={
        className ??
        "inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface-1)] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
      }
    >
      <span className="sr-only">Toggle color theme</span>
      {isLight ? (
        <MoonStar aria-hidden="true" size={18} strokeWidth={1.9} />
      ) : (
        <SunMedium aria-hidden="true" size={18} strokeWidth={1.9} />
      )}
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}
