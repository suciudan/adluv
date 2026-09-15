import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, PropsWithChildren } from "react";

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Button({
  children,
  className,
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return (
    <button
      className={joinClasses(
        "inline-flex cursor-pointer items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition",
        "bg-amber-500 text-neutral-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      className={joinClasses(
        "rounded-3xl border border-neutral-800 bg-neutral-950/80 p-6 text-neutral-100 shadow-lg shadow-black/20",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Pill({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLSpanElement>>) {
  return (
    <span
      className={joinClasses(
        "inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/12 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-amber-300",
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function BlogCallout({
  children,
  title,
  className,
  ...props
}: PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    title?: string;
  }
>) {
  return (
    <div
      className={joinClasses(
        "rounded-3xl border border-violet-500/20 bg-violet-500/10 px-5 py-4 text-sm text-violet-50",
        className,
      )}
      {...props}
    >
      {title ? <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">{title}</p> : null}
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function BlogQuote({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return (
    <blockquote
      className={joinClasses(
        "border-l-2 border-violet-400/40 pl-5 text-base italic leading-8 text-zinc-100 md:text-lg",
        className,
      )}
      {...props}
    >
      {children}
    </blockquote>
  );
}

export function BlogCtaLink({
  children,
  className,
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLAnchorElement> & { href: string }>) {
  return (
    <a
      className={joinClasses(
        "inline-flex items-center rounded-full bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}

function BlogInlineIcon({
  kind,
}: {
  kind: "arrow-right" | "check" | "x";
}) {
  return (
    <svg
      className="blog-inline-icon"
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {kind === "arrow-right" ? <path d="M5 12h14" /> : null}
      {kind === "arrow-right" ? <path d="m12 5 7 7-7 7" /> : null}
      {kind === "x" ? <path d="M18 6 6 18" /> : null}
      {kind === "x" ? <path d="m6 6 12 12" /> : null}
      {kind === "check" ? <path d="M20 6 9 17l-5-5" /> : null}
    </svg>
  );
}

export function BlogImage({
  alt,
  caption,
  className,
  src,
}: {
  alt?: string;
  caption?: string;
  className?: string;
  src: string;
}) {
  return (
    <figure className={joinClasses("blog-inline-image", className)}>
      <img src={src} alt={alt ?? ""} />
      {caption ? <figcaption className="blog-inline-image__caption">{caption}</figcaption> : null}
    </figure>
  );
}

export function BlogCta({
  backgroundImage,
  body,
  buttonHref,
  buttonLabel,
  className,
  heading,
}: {
  backgroundImage?: string;
  body: string;
  buttonHref: string;
  buttonLabel: string;
  className?: string;
  heading: string;
}) {
  const style: CSSProperties | undefined = backgroundImage
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(10, 10, 12, 0.9), rgba(10, 10, 12, 0.96)), url(${backgroundImage})`,
      }
    : undefined;

  return (
    <section className={joinClasses("blog-cta", className)} style={style}>
      <div className="blog-cta__inner">
        <h2 className="blog-cta__heading">{heading}</h2>
        <p className="blog-cta__body">{body}</p>
        <div className="blog-cta__actions">
          <a className="blog-cta__button" href={buttonHref}>
            {buttonLabel}
          </a>
        </div>
      </div>
    </section>
  );
}

export function BlogHookComparison({
  benefit,
  className,
  pain,
  title,
}: {
  benefit: string;
  className?: string;
  pain: string;
  title: string;
}) {
  return (
    <div className={joinClasses("blog-hook-comparison", className)}>
      <p className="blog-hook-comparison__eyebrow">{title}</p>
      <div className="blog-hook-comparison__row">
        <span className="blog-hook-comparison__label blog-hook-comparison__label--pain">Pain-led</span>
        <p className="blog-hook-comparison__copy">{pain}</p>
      </div>
      <div className="blog-hook-comparison__row">
        <span className="blog-hook-comparison__label blog-hook-comparison__label--benefit">Benefit-led</span>
        <p className="blog-hook-comparison__copy">{benefit}</p>
      </div>
    </div>
  );
}

export function BlogNotePanel({
  body,
  className,
  title,
  variant = "warm",
}: {
  body: string;
  className?: string;
  title: string;
  variant?: "neutral" | "warm";
}) {
  return (
    <div
      className={joinClasses(`blog-note-panel blog-note-panel--${variant}`, className)}
      data-variant={variant}
    >
      <p className="blog-note-panel__title">{title}</p>
      <p className="blog-note-panel__body">{body}</p>
    </div>
  );
}

export function BlogTakeaways({
  className,
  items,
  title = "Key takeaways",
}: {
  className?: string;
  items: string[];
  title?: string;
}) {
  return (
    <div className={joinClasses("blog-takeaways", className)}>
      <p className="blog-takeaways__title">{title}</p>
      <ul className="blog-takeaways__list">
        {items.map((item) => (
          <li key={item} className="blog-takeaways__item">
            <span className="blog-takeaways__icon">
              <BlogInlineIcon kind="arrow-right" />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BlogSplitComparison({
  className,
  leftFooter,
  leftItems,
  leftTitle,
  rightFooter,
  rightItems,
  rightTitle,
}: {
  className?: string;
  leftFooter?: string;
  leftItems: string[];
  leftTitle: string;
  rightFooter?: string;
  rightItems: string[];
  rightTitle: string;
}) {
  return (
    <div className={joinClasses("blog-split-comparison", className)}>
      <div className="blog-split-comparison__column blog-split-comparison__column--negative">
        <p className="blog-split-comparison__title">{leftTitle}</p>
        <ul className="blog-split-comparison__list">
          {leftItems.map((item) => (
            <li key={item} className="blog-split-comparison__item blog-split-comparison__item--negative">
              <span className="blog-split-comparison__itemIcon">
                <BlogInlineIcon kind="x" />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {leftFooter ? <p className="blog-split-comparison__footer">{leftFooter}</p> : null}
      </div>
      <div className="blog-split-comparison__column blog-split-comparison__column--positive">
        <p className="blog-split-comparison__title">{rightTitle}</p>
        <ul className="blog-split-comparison__list">
          {rightItems.map((item) => (
            <li key={item} className="blog-split-comparison__item blog-split-comparison__item--positive">
              <span className="blog-split-comparison__itemIcon">
                <BlogInlineIcon kind="check" />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {rightFooter ? <p className="blog-split-comparison__footer">{rightFooter}</p> : null}
      </div>
    </div>
  );
}

export function BlogDataTable({
  className,
  headers,
  rows,
}: {
  className?: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className={joinClasses("blog-data-table", className)}>
      <div className="blog-data-table__scroll">
        <table className="blog-data-table__table">
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${rowIndex}-${row.join("|")}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
