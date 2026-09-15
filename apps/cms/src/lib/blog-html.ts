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

function encodeHtmlAttribute(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, "&#10;");
}

function getHtmlAttribute(attributes: string, attributeName: string) {
  const match = attributes.match(new RegExp(`\\s${attributeName}="([\\s\\S]*?)"`));
  return match ? decodeHtmlAttribute(match[1]) : "";
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

function normalizeStoredTextareaValue(value: string) {
  return value.replace(/\r\n?/g, "\n").trim();
}

function renderMultilineHtml(value: string) {
  return escapeHtml(normalizeStoredTextareaValue(value)).replace(/\n/g, "<br />");
}

function normalizeStoredCtaBlocks(source: string) {
  return source.replace(/<section([^>]*\sdata-blog-cta=""[^>]*)>[\s\S]*?<\/section>/g, (_match, attributes) => {
    const backgroundImage = normalizeStoredTextareaValue(getHtmlAttribute(attributes, "data-background-image"));
    const heading = normalizeStoredTextareaValue(getHtmlAttribute(attributes, "data-heading"));
    const body = normalizeStoredTextareaValue(getHtmlAttribute(attributes, "data-body"));
    const buttonLabel = normalizeStoredTextareaValue(getHtmlAttribute(attributes, "data-button-label"));
    const buttonHref = normalizeStoredTextareaValue(getHtmlAttribute(attributes, "data-button-href"));
    const style = backgroundImage
      ? ` style="${escapeHtml(
          `background-image: linear-gradient(180deg, rgba(10, 10, 12, 0.9), rgba(10, 10, 12, 0.96)), url(${backgroundImage});`,
        )}"`
      : "";

    return `<section data-background-image="${encodeHtmlAttribute(backgroundImage)}" data-heading="${encodeHtmlAttribute(heading)}" data-body="${encodeHtmlAttribute(body)}" data-button-label="${encodeHtmlAttribute(buttonLabel)}" data-button-href="${encodeHtmlAttribute(buttonHref)}" data-blog-cta="" class="blog-cta"${style}><div class="blog-cta__inner"><h2 class="blog-cta__heading">${renderMultilineHtml(heading)}</h2><p class="blog-cta__body">${renderMultilineHtml(body)}</p><div class="blog-cta__actions"><a class="blog-cta__button" href="${escapeHtml(buttonHref)}">${escapeHtml(buttonLabel)}</a></div></div></section>`;
  });
}

export function normalizeBlogHtmlForStorage(source: string) {
  return normalizeStoredCtaBlocks(normalizeMultilineDataAttributes(source));
}
