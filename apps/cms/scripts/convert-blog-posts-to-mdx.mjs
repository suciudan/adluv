import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");

for (const envPath of [path.join(repoRoot, ".env.local"), path.join(repoRoot, ".env")]) {
  dotenv.config({ path: envPath, quiet: true });
}

function decodeHtmlEntities(value) {
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

function normalizeText(value) {
  return decodeHtmlEntities(value)
    .replace(/\r\n?/g, "\n")
    .replace(/â†’/g, "→")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function escapeMdxText(value) {
  return value.replace(/[{}]/g, (match) => `\\${match}`);
}

function toStringProp(value) {
  return `{${JSON.stringify(normalizeText(value))}}`;
}

function toArrayProp(values) {
  return `{${JSON.stringify(values.map((value) => normalizeText(value)))}}`;
}

function splitLines(value) {
  return normalizeText(value)
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJsonArray(value, fallback) {
  try {
    const parsed = JSON.parse(decodeHtmlEntities(value));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readAttribute(attributes, name) {
  const match = attributes.match(new RegExp(`\\s${name}="([\\s\\S]*?)"`));
  return match ? match[1] : "";
}

function stripOuterParagraph(value) {
  return value.replace(/^<p[^>]*>/i, "").replace(/<\/p>$/i, "");
}

function convertInlineHtmlToMdx(source) {
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

function convertListToMdx(source, ordered) {
  let index = 0;

  return Array.from(source.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi))
    .map((match) => {
      const item = convertInlineHtmlToMdx(stripOuterParagraph(match[1] ?? ""));

      if (!item) {
        return null;
      }

      index += 1;
      return ordered ? `${index}. ${item}` : `- ${item}`;
    })
    .filter(Boolean)
    .join("\n");
}

function renderComponent(name, props) {
  const serializedProps = props
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");

  return serializedProps ? `<${name} ${serializedProps} />` : `<${name} />`;
}

function convertBlockHtmlToMdx(source) {
  let normalized = source.replace(/\r\n?/g, "\n");
  const blocks = [];

  function storeBlock(value) {
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
          ["headers", `{${JSON.stringify(parseJsonArray(headers, []))}}`],
          ["rows", `{${JSON.stringify(parseJsonArray(rows, []))}}`],
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
  normalized = normalized.replace(/__BLOG_MDX_BLOCK_(\d+)__/g, (_match, index) => blocks[Number(index)] ?? "");

  return normalized
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function isLikelyLegacyBlogHtml(source) {
  return /<(?:p|h2|h3|figure|section|blockquote|ul|ol|div)\b/i.test(source);
}

function computeReadTimeMinutes(source) {
  const words = source
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_>#-]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  return Math.max(1, Math.ceil(words / 220));
}

function parseArgs(argv) {
  const args = new Set(argv);
  const slugArg = argv.find((value) => value.startsWith("--slug="));

  return {
    apply: args.has("--apply"),
    slug: slugArg ? slugArg.slice("--slug=".length).trim() : null,
  };
}

async function assertCompiles(source) {
  await compileMDX({
    source,
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
      },
    },
  });
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const options = parseArgs(process.argv.slice(2));
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    const [rows] = await connection.query(
      `
        select
          id,
          slug,
          body_mdx as bodyMdx
        from blog_posts
        order by created_at asc
      `,
    );

    const targets = rows.filter((post) => {
      if (options.slug && post.slug !== options.slug) {
        return false;
      }

      return isLikelyLegacyBlogHtml(post.bodyMdx);
    });

    if (!targets.length) {
      console.log("No legacy HTML blog posts found.");
      return;
    }

    let convertedCount = 0;

    for (const post of targets) {
      const nextBodyMdx = convertBlockHtmlToMdx(post.bodyMdx);

      if (isLikelyLegacyBlogHtml(nextBodyMdx)) {
        throw new Error(`Converted output for ${post.slug} still looks like legacy HTML.`);
      }

      await assertCompiles(nextBodyMdx);

      if (!options.apply) {
        console.log(`DRY RUN ${post.slug}`);
        console.log(nextBodyMdx.slice(0, 500));
        console.log("---");
        convertedCount += 1;
        continue;
      }

      await connection.query(
        `
          update blog_posts
          set
            body_mdx = ?,
            read_time_minutes = ?,
            updated_at = current_timestamp(3)
          where id = ?
        `,
        [nextBodyMdx, computeReadTimeMinutes(nextBodyMdx), post.id],
      );

      console.log(`UPDATED ${post.slug}`);
      convertedCount += 1;
    }

    console.log(
      options.apply
        ? `Converted ${convertedCount} blog post${convertedCount === 1 ? "" : "s"} to MDX.`
        : `Validated ${convertedCount} blog post conversion${convertedCount === 1 ? "" : "s"} in dry-run mode.`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
