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

const mdxComponents = {
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
};

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

function renderBlogIconSvg(icon: "arrow-right" | "x" | "check") {
  const paths =
    icon === "arrow-right"
      ? '<path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path>'
      : icon === "x"
        ? '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>'
        : '<path d="M20 6 9 17l-5-5"></path>';

  return `<svg class="blog-inline-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`;
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

function normalizeHeadingLabel(label: string) {
  return label
    .replace(/[`*_~]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function headingToAnchor(label: string) {
  return normalizeHeadingLabel(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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
  const { content } = await compileMDX({
    source: normalizeVoidHtmlTags(
      injectHeadingAnchors(
        normalizeStoredHookComparisonCopy(
          normalizeStoredBlogIcons(
            normalizeLegacyCustomBlocks(normalizeMultilineDataAttributes(source)),
          ),
        ),
      ),
    ),
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
      },
    },
    components: mdxComponents,
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

export function formatBlogMdxRenderError(error: BlogMdxRenderDebugInfo) {
  return error.cause ? `${error.message} Cause: ${error.cause}` : error.message;
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
