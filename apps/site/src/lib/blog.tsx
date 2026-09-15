import type { ReactNode } from "react";

import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";

import {
  BlogCallout,
  BlogCta,
  BlogCtaLink,
  BlogDataTable,
  BlogHookComparison,
  BlogImage,
  BlogNotePanel,
  BlogQuote,
  BlogSplitComparison,
  BlogTakeaways,
} from "@adluv/ui";

export type BlogSort = "Latest" | "Popular" | "Shortest Read";
export type BlogMdxRenderDebugInfo = {
  cause: string | null;
  message: string;
  name: string;
  stack: string | null;
};

export type BlogMdxRenderResult =
  | {
      content: ReactNode;
      status: "ok";
    }
  | {
      error: BlogMdxRenderDebugInfo;
      status: "error";
    };

export function formatReadTime(readTime: number) {
  return `${readTime} min to read`;
}

export function formatDate(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function categoryToSlug(category: string) {
  return category.toLowerCase().replace(/\s+/g, "-");
}

function renderBlogIconSvg(icon: "arrow-right" | "x" | "check") {
  const paths =
    icon === "arrow-right"
      ? '<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>'
      : icon === "x"
        ? '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>'
        : '<path d="M20 6 9 17l-5-5"></path>';

  return `<svg className="blog-inline-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
}

function normalizeStoredBlogIcons(source: string) {
  return source
    .replace(
      /<span class="blog-takeaways__icon">(?![\s\S]*?blog-inline-icon)[\s\S]*?<\/span>/g,
      `<span class="blog-takeaways__icon">${renderBlogIconSvg("arrow-right")}</span>`,
    )
    .replace(
      /<li class="([^"]*\bblog-split-comparison__item--negative\b[^"]*)">([\s\S]*?)<\/li>/g,
      (_match, className, innerHtml) => {
        const nextInnerHtml = innerHtml.replace(
          /<span class="blog-split-comparison__itemIcon">(?![\s\S]*?blog-inline-icon)[\s\S]*?<\/span>/,
          `<span class="blog-split-comparison__itemIcon">${renderBlogIconSvg("x")}</span>`,
        );

        return `<li class="${className}">${nextInnerHtml}</li>`;
      },
    )
    .replace(
      /<li class="([^"]*\bblog-split-comparison__item--positive\b[^"]*)">([\s\S]*?)<\/li>/g,
      (_match, className, innerHtml) => {
        const nextInnerHtml = innerHtml.replace(
          /<span class="blog-split-comparison__itemIcon">(?![\s\S]*?blog-inline-icon)[\s\S]*?<\/span>/,
          `<span class="blog-split-comparison__itemIcon">${renderBlogIconSvg("check")}</span>`,
        );

        return `<li class="${className}">${nextInnerHtml}</li>`;
      },
    );
}

function normalizeStoredHookComparisonCopy(source: string) {
  return source.replace(
    /<p class="blog-hook-comparison__copy">\s*(?:"|&quot;){1,2}\s*([\s\S]*?)\s*(?:"|&quot;){1,2}\s*<\/p>/g,
    (_match, copy) => `<p class="blog-hook-comparison__copy">${copy.trim()}</p>`,
  );
}

function normalizeMultilineDataAttributes(source: string) {
  return source.replace(/\s(data-[\w-]+)="([\s\S]*?)"/g, (match, attributeName, rawValue) => {
    if (!/[\r\n]/.test(rawValue)) {
      return match;
    }

    const normalizedValue = rawValue.replace(/\r?\n\s*/g, "&#10;");
    return ` ${attributeName}="${normalizedValue}"`;
  });
}

function normalizeHeadingLabel(label: string) {
  return label
    .replace(/[`*_~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function stripLeadingSectionNumber(label: string) {
  return label.replace(/^\d+\.\s*/, "");
}

function headingToAnchor(label: string) {
  return normalizeHeadingLabel(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function textFromNode(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textFromNode).join(" ");
  }

  if (node && typeof node === "object" && "props" in node) {
    return textFromNode((node as { props?: { children?: ReactNode } }).props?.children ?? "");
  }

  return "";
}

function Heading({
  as: Tag,
  children,
}: {
  as: "h2" | "h3";
  children: ReactNode;
}) {
  const label = normalizeHeadingLabel(textFromNode(children));
  const id = headingToAnchor(label);
  const className =
    Tag === "h2"
      ? "mt-14 mb-6 scroll-mt-32 text-[2rem] font-normal leading-tight text-white first:mt-0 md:text-[2.35rem]"
      : "mt-10 mb-4 scroll-mt-32 text-[1.45rem] font-normal leading-snug text-white md:text-[1.7rem]";

  return (
    <Tag id={id} className={className}>
      {children}
    </Tag>
  );
}

export function extractTableOfContents(source: string) {
  const seen = new Set<string>();
  const items: Array<{ id: string; label: string }> = [];
  const markdownMatches = source.matchAll(/^##\s+(.+)$/gm);
  const htmlMatches = source.matchAll(/<h2[^>]*>(.*?)<\/h2>/gim);

  for (const match of [...markdownMatches, ...htmlMatches]) {
    const rawLabel = String(match[1] ?? "").replace(/<[^>]+>/g, " ");
    const label = normalizeHeadingLabel(rawLabel);
    const id = headingToAnchor(label);

    if (!label || !id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    items.push({ id, label });
  }

  return items;
}

function renderGuideMarkup(items: Array<{ id: string; label: string }>) {
  if (!items.length) {
    return "";
  }

  const links = items
    .map(
      (item, index) =>
        `<li class="blog-guide-outline__item"><a class="blog-guide-outline__link" href="#${escapeHtml(item.id)}"><span class="blog-guide-outline__index">${index + 1}.</span><span>${escapeHtml(stripLeadingSectionNumber(item.label))}</span></a></li>`,
    )
    .join("");

  return `<section class="blog-guide-outline"><p class="blog-guide-outline__eyebrow">In this guide</p><ol class="blog-guide-outline__list">${links}</ol></section>`;
}

function injectGuideAfterFirstParagraph(source: string, items: Array<{ id: string; label: string }>) {
  if (!items.length) {
    return source;
  }

  const guideMarkup = renderGuideMarkup(items);
  const closingParagraphIndex = source.indexOf("</p>");

  if (closingParagraphIndex === -1) {
    return `${guideMarkup}${source}`;
  }

  const insertionIndex = closingParagraphIndex + "</p>".length;
  return `${source.slice(0, insertionIndex)}${guideMarkup}${source.slice(insertionIndex)}`;
}

function injectHeadingAnchors(source: string) {
  return source.replace(/<h([23])([^>]*)>(.*?)<\/h\1>/gim, (match, level, attributes, innerHtml) => {
    if (/\sid=/.test(attributes)) {
      return match;
    }

    const label = normalizeHeadingLabel(String(innerHtml).replace(/<[^>]+>/g, " "));
    const id = headingToAnchor(label);

    if (!id) {
      return match;
    }

    return `<h${level}${attributes} id="${escapeHtml(id)}">${innerHtml}</h${level}>`;
  });
}

const voidHtmlTags = ["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"];

function normalizeVoidHtmlTags(source: string) {
  return voidHtmlTags.reduce(
    (normalized, tagName) =>
      normalized.replace(new RegExp(`<${tagName}([^>]*?)(?<!/)>`, "gim"), `<${tagName}$1 />`),
    source,
  );
}

function kebabToCamelCase(value: string) {
  return value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function normalizeInlineStyleAttribute(styleValue: string) {
  const declarations = decodeHtmlAttribute(styleValue)
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separatorIndex = declaration.indexOf(":");

      if (separatorIndex === -1) {
        return null;
      }

      const property = declaration.slice(0, separatorIndex).trim();
      const value = declaration.slice(separatorIndex + 1).trim();

      if (!property || !value) {
        return null;
      }

      return `${kebabToCamelCase(property)}: ${JSON.stringify(value)}`;
    })
    .filter(Boolean);

  if (!declarations.length) {
    return null;
  }

  return `{{${declarations.join(", ")}}}`;
}

function normalizeStoredCtaBackgrounds(source: string) {
  return source.replace(/<section([^>]*\sdata-blog-cta=""[^>]*)>/g, (match, attributes) => {
    const backgroundImageMatch = attributes.match(/\sdata-background-image="([^"]*)"/);
    const backgroundImage = backgroundImageMatch ? decodeHtmlAttribute(backgroundImageMatch[1]) : "";
    const styleMatch = attributes.match(/\sstyle=(["'])([\s\S]*?)\1/);
    const normalizedAttributes = attributes.replace(/\sstyle=(["'])([\s\S]*?)\1/, "");

    if (backgroundImage) {
      const style = escapeHtml(
        `background-image: linear-gradient(180deg, rgba(10, 10, 12, 0.9), rgba(10, 10, 12, 0.96)), url(${backgroundImage});`,
      );
      return `<section${normalizedAttributes} style="${style}">`;
    }

    if (!styleMatch) {
      return match;
    }

    const decodedStyleValue = decodeHtmlAttribute(styleMatch[2]);
    const normalizedStyleValue = /background-image\s*:/.test(decodedStyleValue)
      ? decodedStyleValue
      : `background-image: ${decodedStyleValue};`;
    const style = escapeHtml(normalizedStyleValue);

    return `<section${normalizedAttributes} style="${style}">`;
  });
}

function normalizeHtmlReactAttributes(source: string) {
  return source
    .replace(/(\s)class=/gi, "$1className=")
    .replace(/(\s)stroke-width=/gi, "$1strokeWidth=")
    .replace(/(\s)stroke-linecap=/gi, "$1strokeLinecap=")
    .replace(/(\s)stroke-linejoin=/gi, "$1strokeLinejoin=")
    .replace(/(\s)fill-rule=/gi, "$1fillRule=")
    .replace(/(\s)clip-rule=/gi, "$1clipRule=")
    .replace(/(\s)viewbox=/gi, "$1viewBox=")
    .replace(/(\s)style=(["'])([\s\S]*?)\2/gi, (_match, leadingSpace, _quote, styleValue) => {
      const normalizedStyle = normalizeInlineStyleAttribute(styleValue);

      return normalizedStyle ? `${leadingSpace}style=${normalizedStyle}` : "";
    });
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "\r")
    .replace(/&#xA;/gi, "\n")
    .replace(/&#xD;/gi, "\r")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonArray<T>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(decodeHtmlAttribute(value));
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeLegacyCustomBlocks(source: string) {
  let normalized = source;

  normalized = normalized.replace(
    /<div data-title="([^"]*)" data-pain="([^"]*)" data-benefit="([^"]*)" data-hook-comparison="" class="blog-hook-comparison"><p class="blog-hook-comparison__eyebrow"><\/p><div class="blog-hook-comparison__row"><span class="blog-hook-comparison__label blog-hook-comparison__label--pain">Pain-led<\/span><p class="blog-hook-comparison__copy">""<\/p><\/div><div class="blog-hook-comparison__row"><span class="blog-hook-comparison__label blog-hook-comparison__label--benefit">Benefit-led<\/span><p class="blog-hook-comparison__copy">""<\/p><\/div><\/div>/g,
    (_match, title, pain, benefit) => {
      const decodedTitle = decodeHtmlAttribute(title);
      const decodedPain = decodeHtmlAttribute(pain);
      const decodedBenefit = decodeHtmlAttribute(benefit);

      return `<div data-title="${title}" data-pain="${pain}" data-benefit="${benefit}" data-hook-comparison="" class="blog-hook-comparison"><p class="blog-hook-comparison__eyebrow">${escapeHtml(decodedTitle)}</p><div class="blog-hook-comparison__row"><span class="blog-hook-comparison__label blog-hook-comparison__label--pain">Pain-led</span><p class="blog-hook-comparison__copy">${escapeHtml(decodedPain)}</p></div><div class="blog-hook-comparison__row"><span class="blog-hook-comparison__label blog-hook-comparison__label--benefit">Benefit-led</span><p class="blog-hook-comparison__copy">${escapeHtml(decodedBenefit)}</p></div></div>`;
    },
  );

  normalized = normalized.replace(
    /<div data-title="([^"]*)" data-body="([^"]*)" data-variant="([^"]*)" data-blog-note-panel="" class="blog-note-panel [^"]*"><p class="blog-note-panel__title"><\/p><p class="blog-note-panel__body"><\/p><\/div>/g,
    (match, title, body, variant) => {
      const decodedTitle = decodeHtmlAttribute(title);
      const decodedBody = decodeHtmlAttribute(body);
      const classMatch = match.match(/class="([^"]*)"/);
      const className = classMatch ? classMatch[1] : `blog-note-panel blog-note-panel--${variant}`;

      return `<div data-title="${title}" data-body="${body}" data-variant="${variant}" data-blog-note-panel="" class="${className}"><p class="blog-note-panel__title">${escapeHtml(decodedTitle)}</p><p class="blog-note-panel__body">${escapeHtml(decodedBody)}</p></div>`;
    },
  );

  normalized = normalized.replace(
    /<div data-title="([^"]*)" data-items="([^"]*)" data-blog-takeaways="" class="blog-takeaways"><p class="blog-takeaways__title"><\/p><ul class="blog-takeaways__list"><\/ul><\/div>/g,
    (_match, title, items) => {
      const decodedTitle = decodeHtmlAttribute(title) || "Key takeaways";
      const decodedItems = splitLines(decodeHtmlAttribute(items));
      const listItems = decodedItems
        .map(
          (item) =>
            `<li class="blog-takeaways__item"><span class="blog-takeaways__icon">${renderBlogIconSvg("arrow-right")}</span><span>${escapeHtml(item)}</span></li>`,
        )
        .join("");

      return `<div data-title="${title}" data-items="${items}" data-blog-takeaways="" class="blog-takeaways"><p class="blog-takeaways__title">${escapeHtml(decodedTitle)}</p><ul class="blog-takeaways__list">${listItems}</ul></div>`;
    },
  );

  normalized = normalized.replace(
    /<div data-left-title="([^"]*)" data-left-items="([^"]*)" data-left-footer="([^"]*)" data-right-title="([^"]*)" data-right-items="([^"]*)" data-right-footer="([^"]*)" data-blog-split-comparison="" class="blog-split-comparison"><div class="blog-split-comparison__column blog-split-comparison__column--negative"><p class="blog-split-comparison__title"><\/p><ul class="blog-split-comparison__list"><\/ul><p class="blog-split-comparison__footer"><\/p><\/div><div class="blog-split-comparison__column blog-split-comparison__column--positive"><p class="blog-split-comparison__title"><\/p><ul class="blog-split-comparison__list"><\/ul><p class="blog-split-comparison__footer"><\/p><\/div><\/div>/g,
    (_match, leftTitle, leftItems, leftFooter, rightTitle, rightItems, rightFooter) => {
      const leftList = splitLines(decodeHtmlAttribute(leftItems))
        .map(
          (item) =>
            `<li class="blog-split-comparison__item blog-split-comparison__item--negative"><span class="blog-split-comparison__itemIcon">${renderBlogIconSvg("x")}</span><span>${escapeHtml(item)}</span></li>`,
        )
        .join("");
      const rightList = splitLines(decodeHtmlAttribute(rightItems))
        .map(
          (item) =>
            `<li class="blog-split-comparison__item blog-split-comparison__item--positive"><span class="blog-split-comparison__itemIcon">${renderBlogIconSvg("check")}</span><span>${escapeHtml(item)}</span></li>`,
        )
        .join("");

      return `<div data-left-title="${leftTitle}" data-left-items="${leftItems}" data-left-footer="${leftFooter}" data-right-title="${rightTitle}" data-right-items="${rightItems}" data-right-footer="${rightFooter}" data-blog-split-comparison="" class="blog-split-comparison"><div class="blog-split-comparison__column blog-split-comparison__column--negative"><p class="blog-split-comparison__title">${escapeHtml(decodeHtmlAttribute(leftTitle))}</p><ul class="blog-split-comparison__list">${leftList}</ul><p class="blog-split-comparison__footer">${escapeHtml(decodeHtmlAttribute(leftFooter))}</p></div><div class="blog-split-comparison__column blog-split-comparison__column--positive"><p class="blog-split-comparison__title">${escapeHtml(decodeHtmlAttribute(rightTitle))}</p><ul class="blog-split-comparison__list">${rightList}</ul><p class="blog-split-comparison__footer">${escapeHtml(decodeHtmlAttribute(rightFooter))}</p></div></div>`;
    },
  );

  normalized = normalized.replace(
    /<div data-headers="([^"]*)" data-rows="([^"]*)" data-blog-table="" class="blog-data-table"><div class="blog-data-table__scroll"><table class="blog-data-table__table"><thead><tr><\/tr><\/thead><tbody><\/tbody><\/table><\/div><\/div>/g,
    (_match, headers, rows) => {
      const parsedHeaders = parseJsonArray<string[]>(headers, []);
      const parsedRows = parseJsonArray<string[][]>(rows, []);
      const headMarkup = parsedHeaders.map((header) => `<th>${escapeHtml(header)}</th>`).join("");
      const bodyMarkup = parsedRows
        .map(
          (row) =>
            `<tr>${row.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join("")}</tr>`,
        )
        .join("");

      return `<div data-headers="${headers}" data-rows="${rows}" data-blog-table="" class="blog-data-table"><div class="blog-data-table__scroll"><table class="blog-data-table__table"><thead><tr>${headMarkup}</tr></thead><tbody>${bodyMarkup}</tbody></table></div></div>`;
    },
  );

  return normalized;
}

export async function renderBlogMdx(source: string) {
  const normalizedSource = normalizeHtmlReactAttributes(
    normalizeVoidHtmlTags(
      injectHeadingAnchors(
        normalizeStoredCtaBackgrounds(
          normalizeStoredHookComparisonCopy(
            normalizeStoredBlogIcons(
              normalizeLegacyCustomBlocks(normalizeMultilineDataAttributes(source)),
            ),
          ),
        ),
      ),
    ),
  );
  const guideItems = extractTableOfContents(normalizedSource);
  const { content } = await compileMDX({
    source: injectGuideAfterFirstParagraph(normalizedSource, guideItems),
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
      },
    },
    components: {
      Callout: BlogCallout,
      BlogCta,
      Quote: BlogQuote,
      CtaLink: BlogCtaLink,
      BlogDataTable,
      BlogHookComparison,
      BlogImage,
      BlogNotePanel,
      BlogSplitComparison,
      BlogTakeaways,
      h2: ({ children }) => <Heading as="h2">{children}</Heading>,
      h3: ({ children }) => <Heading as="h3">{children}</Heading>,
    },
  });

  return content;
}

function toBlogMdxRenderDebugInfo(error: unknown): BlogMdxRenderDebugInfo {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error
        ? error.cause.message
        : typeof error.cause === "string"
          ? error.cause
          : null;

    return {
      cause,
      message: error.message,
      name: error.name,
      stack: error.stack ?? null,
    };
  }

  return {
    cause: null,
    message: typeof error === "string" ? error : "Unknown MDX render error.",
    name: "Error",
    stack: null,
  };
}

export async function renderBlogMdxSafely(source: string): Promise<BlogMdxRenderResult> {
  try {
    return {
      content: await renderBlogMdx(source),
      status: "ok",
    };
  } catch (error) {
    return {
      error: toBlogMdxRenderDebugInfo(error),
      status: "error",
    };
  }
}
