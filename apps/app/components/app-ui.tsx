import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { siteButtonClassName } from "./site-button";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const toolbarFieldLabelClassName = "text-[12px] font-medium leading-4 text-[var(--text-secondary)]";

export function DetailField({
  label,
  value,
  className,
  labelClassName,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className={cn("text-[13px] font-medium leading-5 text-[var(--text-secondary)]", labelClassName)}>
        {label}
      </p>
      <div className={cn("text-[16px] font-medium leading-6 text-[var(--text-primary)]", valueClassName)}>
        {value}
      </div>
    </div>
  );
}

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          {Icon ? (
            <span className="app-icon-chip">
              <Icon size={18} strokeWidth={1.75} />
            </span>
          ) : null}
          <h1
            className="text-[28px] leading-[0.96] tracking-[-0.04em] text-[var(--text-primary)] sm:text-[34px]"
            style={{ fontFamily: "var(--font-instrument-serif), serif" }}
          >
            {title}
          </h1>
        </div>
        {subtitle ? (
          <p className="max-w-3xl text-[15px] leading-[24px] text-[var(--text-secondary)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </section>
  );
}

export function AppButton({
  variant = "secondary",
  className,
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "icon";
}) {
  return (
    <button
      {...props}
      className={cn(
        variant === "primary" && siteButtonClassName,
        variant === "secondary" && "app-button app-button-secondary",
        variant === "ghost" && "app-button app-button-ghost",
        variant === "destructive" && "app-button app-button-destructive",
        variant === "icon" && "app-icon-button",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function AppLinkButton({
  href,
  variant = "secondary",
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Link
      href={href}
      {...props}
      className={cn(
        variant === "primary" && siteButtonClassName,
        variant === "secondary" && "app-button app-button-secondary",
        variant === "ghost" && "app-button app-button-ghost",
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function SurfaceCard({
  className,
  children,
  interactive = false,
}: {
  className?: string;
  children: ReactNode;
  interactive?: boolean;
}) {
  return <article className={cn("app-surface-card", interactive && "app-surface-card-interactive", className)}>{children}</article>;
}

export function SectionCard({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const hasHeaderContent = Boolean(Icon || title || subtitle);

  return (
    <SurfaceCard className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-4">
        {hasHeaderContent ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              {Icon ? (
                <span className="app-icon-chip">
                  <Icon size={18} strokeWidth={1.75} />
                </span>
              ) : null}
              {title ? (
                <h2
                  className="text-[24px] leading-[1] tracking-[-0.035em] text-[var(--text-primary)] sm:text-[28px]"
                  style={{ fontFamily: "var(--font-instrument-serif), serif" }}
                >
                  {title}
                </h2>
              ) : null}
            </div>
            {subtitle ? <p className="text-[14px] leading-6 text-[var(--text-secondary)]">{subtitle}</p> : null}
          </div>
        ) : (
          <div />
        )}
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </SurfaceCard>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  helper,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  helper?: string;
  href?: string;
}) {
  const content = (
    <SurfaceCard interactive={Boolean(href)} className="p-4">
      <div className="flex items-center gap-3">
        <span className="app-icon-chip h-8 w-8 shrink-0 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent-primary)]">
          <Icon size={16} strokeWidth={1.75} />
        </span>
        <p className="text-[13px] font-medium leading-5 text-[var(--text-secondary)]">{label}</p>
      </div>
      <p className="mt-2 text-[28px] font-semibold leading-[34px] tracking-[-0.03em] text-[var(--text-primary)]">
        {value}
      </p>
      {helper ? <p className="mt-2 text-[13px] leading-5 text-[var(--text-tertiary)]">{helper}</p> : null}
    </SurfaceCard>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}

export function Toolbar({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <section className={cn("app-toolbar", className)}>{children}</section>;
}

export function ToolbarLabel({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-[7px]", className)}>
      <span className={toolbarFieldLabelClassName}>{label}</span>
      {children}
    </div>
  );
}

export function ToolbarSelect({
  label,
  hideLabel = false,
  wrapperClassName,
  className,
  children,
  ...props
}: ComponentProps<"select"> & {
  label: string;
  hideLabel?: boolean;
  wrapperClassName?: string;
}) {
  return (
    <label className={cn("grid", !hideLabel && "gap-[7px]", wrapperClassName)}>
      <span className={hideLabel ? "sr-only" : toolbarFieldLabelClassName}>{label}</span>
      <span className="relative block">
        <select {...props} className={cn("app-select appearance-none bg-none pr-12 !text-sm", className)}>
          {children}
        </select>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
        />
      </span>
    </label>
  );
}

export function ToolbarInput({
  label,
  hideLabel = false,
  icon: Icon,
  wrapperClassName,
  className,
  ...props
}: ComponentProps<"input"> & {
  label: string;
  hideLabel?: boolean;
  icon?: LucideIcon;
  wrapperClassName?: string;
}) {
  return (
    <label className={cn("grid", !hideLabel && "gap-[7px]", wrapperClassName)}>
      <span className={hideLabel ? "sr-only" : toolbarFieldLabelClassName}>{label}</span>
      <span className="relative block">
        {Icon ? (
          <Icon
            size={16}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]"
          />
        ) : null}
        <input {...props} className={cn("app-input !text-sm", Icon && "app-input-with-icon", className)} />
      </span>
    </label>
  );
}

export function FilterTabs({
  items,
  activeValue,
  onSelect,
  className,
  itemClassName,
}: {
  items: Array<{ label: string; value: string }>;
  activeValue: string;
  onSelect: (value: string) => void;
  className?: string;
  itemClassName?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex h-10 max-w-full items-center gap-1 overflow-x-auto rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface-2)] p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === activeValue;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onSelect(item.value)}
            style={{ fontSize: "13px", lineHeight: "18px" }}
            className={cn(
              "inline-flex h-8 items-center rounded-[11px] px-4 font-medium transition",
              itemClassName,
              active
                ? "bg-[var(--accent-soft)] text-[var(--text-primary)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function Pill({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
  className?: string;
}) {
  return <span className={cn("app-pill", `app-pill-${tone}`, className)}>{children}</span>;
}

export function EmptyState({
  title,
  body,
  primaryAction,
  secondaryAction,
  icon: Icon = AlertCircle,
}: {
  title: string;
  body: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <SurfaceCard className="px-6 py-14 text-center">
      <div className="mx-auto flex max-w-2xl flex-col items-center">
        <span className="app-icon-chip h-12 w-12 rounded-[16px] bg-[var(--accent-soft)] text-[var(--accent-primary)]">
          <Icon size={20} strokeWidth={1.75} />
        </span>
        <h2
          className="mt-5 text-[32px] leading-[1] tracking-[-0.04em] text-[var(--text-primary)]"
          style={{ fontFamily: "var(--font-instrument-serif), serif" }}
        >
          {title}
        </h2>
        <p className="mt-3 text-[15px] leading-[24px] text-[var(--text-secondary)]">{body}</p>
        {(primaryAction || secondaryAction) ? (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {primaryAction}
            {secondaryAction}
          </div>
        ) : null}
      </div>
    </SurfaceCard>
  );
}

export function InfoRow({
  label,
  value,
  helper,
}: {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--border-subtle)] bg-[color:var(--bg-surface-2)] px-4 py-3">
      <p className="text-[12px] font-medium leading-4 text-[var(--text-tertiary)]">{label}</p>
      <div className="mt-2 text-[14px] font-medium leading-[22px] text-[var(--text-primary)]">{value}</div>
      {helper ? <div className="mt-2 text-[13px] leading-5 text-[var(--text-secondary)]">{helper}</div> : null}
    </div>
  );
}

export function InlineActionLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--accent-hover)] transition hover:text-[var(--text-primary)]">
      {children}
      <ArrowRight size={14} strokeWidth={1.75} />
    </Link>
  );
}
