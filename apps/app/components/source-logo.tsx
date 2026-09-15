import type { SVGProps } from "react";

import type { SourceName } from "@adluv/config";

import MetaLogo from "../../site/src/components/Brands/MetaLogo";

type LogoProps = SVGProps<SVGSVGElement>;

export function GoogleAdsLogo({ className = "h-5 w-5", ...props }: LogoProps) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={className} {...props}>
      <g transform="matrix(.257748 0 0 .257745 -.361416 2.515516)">
        <path
          d="M85.9 28.6c2.4-6.3 5.7-12.1 10.6-16.8 19.6-19.1 52-14.3 65.3 9.7 10 18.2 20.6 36 30.9 54l51.6 89.8c14.3 25.1-1.2 56.8-29.6 61.1-17.4 2.6-33.7-5.4-42.7-21l-45.4-78.8c-.3-.6-.7-1.1-1.1-1.6-1.6-1.3-2.3-3.2-3.3-4.9L88.8 62.2c-3.9-6.8-5.7-14.2-5.5-22 .3-4 .8-8 2.6-11.6"
          fill="#3c8bd9"
        />
        <path
          d="M85.9 28.6c-.9 3.6-1.7 7.2-1.9 11-.3 8.4 1.8 16.2 6 23.5l32.9 56.9c1 1.7 1.8 3.4 2.8 5l-18.1 31.1-25.3 43.6c-.4 0-.5-.2-.6-.5-.1-.8.2-1.5.4-2.3 4.1-15 .7-28.3-9.6-39.7-6.3-6.9-14.3-10.8-23.5-12.1-12-1.7-22.6 1.4-32.1 8.9-1.7 1.3-2.8 3.2-4.8 4.2-.4 0-.6-.2-.7-.5l14.3-24.9L85.2 29.7c.2-.4.5-.7.7-1.1"
          fill="#fabc04"
        />
        <path
          d="m11.8 158 5.7-5.1c24.3-19.2 60.8-5.3 66.1 25.1 1.3 7.3.6 14.3-1.6 21.3-.1.6-.2 1.1-.4 1.7-.9 1.6-1.7 3.3-2.7 4.9-8.9 14.7-22 22-39.2 20.9C20 225.4 4.5 210.6 1.8 191c-1.3-9.5.6-18.4 5.5-26.6 1-1.8 2.2-3.4 3.3-5.2.5-.4.3-1.2 1.2-1.2"
          fill="#34a852"
        />
        <path d="M11.8 158c-.4.4-.4 1.1-1.1 1.2-.1-.7.3-1.1.7-1.6l.4.4" fill="#fabc04" />
        <path d="M81.6 201c-.4-.7 0-1.2.4-1.7l.4.4-.8 1.3" fill="#e1c025" />
      </g>
    </svg>
  );
}

export function LinkedInLogo({ className = "h-5 w-5", ...props }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" fill="#0A66C2" aria-hidden="true" className={className} {...props}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

export function SourceLogo({
  className,
  source,
  ...props
}: LogoProps & {
  source: SourceName;
}) {
  if (source === "google") {
    return <GoogleAdsLogo className={className} {...props} />;
  }

  if (source === "linkedin") {
    return <LinkedInLogo className={className} {...props} />;
  }

  if (source === "facebook") {
    return <MetaLogo aria-hidden="true" className={className ?? "h-5 w-8"} {...props} />;
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className ?? "h-5 w-5"} {...props}>
      <circle cx="12" cy="12" r="10" fill="#111" />
      <path fill="#fff" d="M13.84 6.25c.58 1.1 1.41 1.86 2.5 2.24v2.1a5.17 5.17 0 0 1-2.39-.72v4.07a3.91 3.91 0 1 1-3.91-3.91c.18 0 .35.02.52.04v2.16a1.88 1.88 0 1 0 1.35 1.8V6.25h1.93Z" />
    </svg>
  );
}
