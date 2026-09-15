function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "\r")
    .replace(/&#xA;/gi, "\n")
    .replace(/&#xD;/gi, "\r")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function normalizeText(value: string) {
  return decodeHtmlEntities(value)
    .replace(/\r\n?/g, "\n")
    .replace(/â†’/g, "→")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function escapeMdxText(value: string) {
  return value.replace(/[{}]/g, (match) => `\\${match}`);
}

function toStringProp(value: string) {
  return `{${JSON.stringify(normalizeText(value))}}`;
}

function toArrayProp(values: string[]) {
  return `{${JSON.stringify(values.map((value) => normalizeText(value)))}}`;
}

function splitLines(value: string) {
  return normalizeText(value)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonArray<T>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(decodeHtmlEntities(value));
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function readAttribute(attributes: string, name: string) {
  const match = attributes.match(new RegExp(`\\s${name}="([\\s\\S]*?)"`));
  return match ? match[1] : "";
}

function stripOuterParagraph(value: string) {
  return value.replace(/^<p[^>]*>/i, "").replace(/<\/p>$/i, "");
}

function convertInlineHtmlToMdx(source: string): string {
  let normalized = source.replace(/\r\n?/g, "\n");

  normalized = normalized.replace(/<br\s*\/?>/gi, "  \n");
  normalized = normalized.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_match, href, innerHtml) => {
    const label = convertInlineHtmlToMdx(innerHtml).replace(/\s*\n\s*/g, " ").trim();
    return `[${label}](${normalizeText(href)})`;
  });
  normalized = normalized.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (_match, _tag, innerHtml) => {
    return `**${convertInlineHtmlToMdx(innerHtml).trim()}**`;
  });
  normalized = normalized.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, (_match, _tag, innerHtml) => {
    return `*${convertInlineHtmlToMdx(innerHtml).trim()}*`;
  });
  normalized = normalized.replace(/<u>([\s\S]*?)<\/u>/gi, (_match, innerHtml) => {
    return convertInlineHtmlToMdx(innerHtml);
  });
  normalized = normalized.replace(/<code>([\s\S]*?)<\/code>/gi, (_match, innerHtml) => {
    return `\`${normalizeText(innerHtml)}\``;
  });
  normalized = normalized.replace(/<[^>]+>/g, "");

  return escapeMdxText(normalizeText(normalized).replace(/\s*\n\s*/g, " "));
}

function convertListToMdx(source: string, ordered: boolean): string {
  let index = 0;
  const items = Array.from(source.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
    .map((match) => {
      const item = convertInlineHtmlToMdx(stripOuterParagraph(match[1] ?? ""));

      if (!item) {
        return null;
      }

      index += 1;
      return ordered ? `${index}. ${item}` : `- ${item}`;
    })
    .filter((item): item is string => Boolean(item));

  return items.join("\n");
}

function renderComponent(name: string, props: Array<[string, string | null]>, selfClosing = true) {
  const serializedProps = props
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");

  if (!serializedProps) {
    return selfClosing ? `<${name} />` : `<${name}></${name}>`;
  }

  return selfClosing ? `<${name} ${serializedProps} />` : `<${name} ${serializedProps}></${name}>`;
}

function convertBlockHtmlToMdx(source: string): string {
  let normalized = source.replace(/\r\n?/g, "\n");
  const blocks: string[] = [];

  function storeBlock(value: string) {
    const token = `__BLOG_MDX_BLOCK_${blocks.length}__`;
    blocks.push(value.trim());
    return `\n\n${token}\n\n`;
  }

  normalized = normalized.replace(
    /<figure[^>]*data-cms-image=""[^>]*>[\s\S]*?<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>[\s\S]*?(?:<figcaption[^>]*>([\s\S]*?)<\/figcaption>)?[\s\S]*?<\/figure>/gi,
    (_match, src, alt, caption) =>
      storeBlock(
        renderComponent("BlogImage", [
          ["src", toStringProp(src)],
          ["alt", normalizeText(alt) ? toStringProp(alt) : null],
          ["caption", normalizeText(caption ?? "") ? toStringProp(caption) : null],
        ]),
      ),
  );

  normalized = normalized.replace(
    /<section([^>]*)data-blog-cta=""([^>]*)>[\s\S]*?<\/section>/gi,
    (_match, beforeAttributes, afterAttributes) => {
      const attributes = `${beforeAttributes} ${afterAttributes}`;

      return storeBlock(
        renderComponent("BlogCta", [
          ["heading", toStringProp(readAttribute(attributes, "data-heading"))],
          ["body", toStringProp(readAttribute(attributes, "data-body"))],
          ["buttonLabel", toStringProp(readAttribute(attributes, "data-button-label"))],
          ["buttonHref", toStringProp(readAttribute(attributes, "data-button-href"))],
          [
            "backgroundImage",
            normalizeText(readAttribute(attributes, "data-background-image"))
              ? toStringProp(readAttribute(attributes, "data-background-image"))
              : null,
          ],
        ]),
      );
    },
  );

  normalized = normalized.replace(
    /<div data-title="([\s\S]*?)" data-pain="([\s\S]*?)" data-benefit="([\s\S]*?)" data-hook-comparison=""[^>]*>[\s\S]*?<div class="blog-hook-comparison__row">[\s\S]*?<\/div><div class="blog-hook-comparison__row">[\s\S]*?<\/div><\/div>/gi,
    (_match, title, pain, benefit) => {
      return storeBlock(
        renderComponent("BlogHookComparison", [
          ["title", toStringProp(title)],
          ["pain", toStringProp(pain)],
          ["benefit", toStringProp(benefit)],
        ]),
      );
    },
  );

  normalized = normalized.replace(
    /<div data-title="([\s\S]*?)" data-body="([\s\S]*?)" data-variant="([\s\S]*?)" data-blog-note-panel=""[^>]*>[\s\S]*?<\/div>/gi,
    (_match, title, body, variant) => {
      const normalizedVariant = normalizeText(variant);

      return storeBlock(
        renderComponent("BlogNotePanel", [
          ["title", toStringProp(title)],
          ["body", toStringProp(body)],
          ["variant", normalizedVariant && normalizedVariant !== "warm" ? toStringProp(normalizedVariant) : null],
        ]),
      );
    },
  );

  normalized = normalized.replace(
    /<div data-title="([\s\S]*?)" data-items="([\s\S]*?)" data-blog-takeaways=""[^>]*>[\s\S]*?<\/div>/gi,
    (_match, title, items) => {
      const normalizedTitle = normalizeText(title);

      return storeBlock(
        renderComponent("BlogTakeaways", [
          ["title", normalizedTitle && normalizedTitle !== "Key takeaways" ? toStringProp(normalizedTitle) : null],
          ["items", toArrayProp(splitLines(items))],
        ]),
      );
    },
  );

  normalized = normalized.replace(
    /<div data-left-title="([\s\S]*?)" data-left-items="([\s\S]*?)" data-left-footer="([\s\S]*?)" data-right-title="([\s\S]*?)" data-right-items="([\s\S]*?)" data-right-footer="([\s\S]*?)" data-blog-split-comparison=""[^>]*>[\s\S]*?<div class="blog-split-comparison__column blog-split-comparison__column--negative">[\s\S]*?<\/div><div class="blog-split-comparison__column blog-split-comparison__column--positive">[\s\S]*?<\/div><\/div>/gi,
    (_match, leftTitle, leftItems, leftFooter, rightTitle, rightItems, rightFooter) => {
      return storeBlock(
        renderComponent("BlogSplitComparison", [
          ["leftTitle", toStringProp(leftTitle)],
          ["leftItems", toArrayProp(splitLines(leftItems))],
          ["leftFooter", normalizeText(leftFooter) ? toStringProp(leftFooter) : null],
          ["rightTitle", toStringProp(rightTitle)],
          ["rightItems", toArrayProp(splitLines(rightItems))],
          ["rightFooter", normalizeText(rightFooter) ? toStringProp(rightFooter) : null],
        ]),
      );
    },
  );

  normalized = normalized.replace(
    /<div data-headers="([\s\S]*?)" data-rows="([\s\S]*?)" data-blog-table=""[^>]*>[\s\S]*?<\/div><\/div>/gi,
    (_match, headers, rows) => {
      return storeBlock(
        renderComponent("BlogDataTable", [
          ["headers", `{${JSON.stringify(parseJsonArray<string[]>(headers, []))}}`],
          ["rows", `{${JSON.stringify(parseJsonArray<string[][]>(rows, []))}}`],
        ]),
      );
    },
  );

  normalized = normalized.replace(/<blockquote>([\s\S]*?)<\/blockquote>/gi, (_match, innerHtml) => {
    const innerMdx = convertBlockHtmlToMdx(innerHtml);
    return storeBlock(`<Quote>\n\n${innerMdx}\n\n</Quote>`);
  });

  normalized = normalized.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_match, innerHtml) => {
    return `\n\n## ${convertInlineHtmlToMdx(innerHtml)}\n\n`;
  });

  normalized = normalized.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_match, innerHtml) => {
    return `\n\n### ${convertInlineHtmlToMdx(innerHtml)}\n\n`;
  });

  normalized = normalized.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_match, innerHtml) => {
    const paragraph = convertInlineHtmlToMdx(innerHtml);
    return paragraph ? `\n\n${paragraph}\n\n` : "\n\n";
  });

  normalized = normalized.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_match, innerHtml) => {
    const list = convertListToMdx(innerHtml, false);
    return list ? `\n\n${list}\n\n` : "\n\n";
  });

  normalized = normalized.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_match, innerHtml) => {
    const list = convertListToMdx(innerHtml, true);
    return list ? `\n\n${list}\n\n` : "\n\n";
  });

  normalized = normalized.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");

  normalized = normalized.replace(/<\/?(div|section|span|table|thead|tbody|tr|th|td|svg|path)[^>]*>/gi, "");

  normalized = normalized.replace(/__BLOG_MDX_BLOCK_(\d+)__/g, (_match, index) => {
    return blocks[Number(index)] ?? "";
  });

  return normalized
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

export function isLikelyLegacyBlogHtml(source: string) {
  return /<(?:p|h2|h3|figure|section|blockquote|ul|ol|div)\b/i.test(source);
}

export function convertLegacyBlogHtmlToMdx(source: string) {
  return convertBlockHtmlToMdx(source);
}
