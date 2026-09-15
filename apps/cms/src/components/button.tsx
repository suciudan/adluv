import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "sm" | "md" | "lg";

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function buttonClassName({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}) {
  return joinClasses(
    "inline-flex items-center justify-center rounded-md !font-sans text-sm font-medium not-italic transition disabled:opacity-60",
    fullWidth && "w-full",
    size === "sm" && "h-10 px-4",
    size === "md" && "h-11 px-4",
    size === "lg" && "h-12 px-5",
    variant === "primary" && "bg-violet-500 text-white hover:bg-violet-400",
    variant === "secondary" &&
      "border border-white/10 bg-zinc-900 text-zinc-200 hover:border-violet-400 hover:text-violet-400",
    variant === "danger" &&
      "border border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/20",
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      {...props}
      className={buttonClassName({ variant, size, fullWidth, className })}
    >
      {children}
    </button>
  );
}
