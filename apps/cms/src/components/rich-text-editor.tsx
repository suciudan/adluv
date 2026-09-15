"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";

import Link from "@tiptap/extension-link";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from "@tiptap/react";
import { Bold, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Redo2, Undo2, X } from "lucide-react";
import { marked } from "marked";

import { normalizeBlogHtmlForStorage } from "../lib/blog-html";
import { MediaLibraryDialog } from "./media-library-dialog";

type LinkTargetMode = "same-tab" | "new-tab";
type LinkMode = "external" | "internal";
type LinkPostOption = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published";
};

function getInternalPostHref(slug: string) {
  return `/blog/${slug}`;
}

function parseInternalPostSlug(href: string | null | undefined) {
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href, "https://cms.adluv.local");
    const match = url.pathname.match(/^\/blog\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function iconSvgNode(paths: ReadonlyArray<readonly [tag: string, attrs: Record<string, string>]>) {
  return [
    "svg",
    {
      class: "blog-inline-icon",
      xmlns: "http://www.w3.org/2000/svg",
      width: "18",
      height: "18",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "2",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
      focusable: "false",
    },
    ...paths.map(([tag, attrs]) => [tag, attrs]),
  ] as const;
}

const blogIconPaths = {
  arrowRight: [
    ["path", { d: "M5 12h14" }],
    ["path", { d: "m12 5 7 7-7 7" }],
  ],
  x: [
    ["path", { d: "M18 6 6 18" }],
    ["path", { d: "m6 6 12 12" }],
  ],
  check: [["path", { d: "M20 6 9 17l-5-5" }]],
} as const;

function getLinkTargetMode(target: string | null | undefined) {
  return target === "_blank" ? "new-tab" : "same-tab";
}

function getLinkRel(targetMode: LinkTargetMode) {
  return targetMode === "new-tab" ? "noopener noreferrer" : null;
}

const CmsImage = Node.create({
  name: "image",
  group: "block",
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: "",
      },
      title: {
        default: null,
      },
      caption: {
        default: "",
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: "figure[data-cms-image]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }

          const image = element.querySelector("img");
          const figcaption = element.querySelector("figcaption");

          if (!image) {
            return false;
          }

          return {
            src: image.getAttribute("src"),
            alt: image.getAttribute("alt") ?? "",
            title: image.getAttribute("title"),
            caption: figcaption?.textContent?.trim() ?? "",
          };
        },
      },
      {
        tag: "img[src]",
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }

          return {
            src: element.getAttribute("src"),
            alt: element.getAttribute("alt") ?? "",
            title: element.getAttribute("title"),
            caption: element.getAttribute("data-caption") ?? "",
          };
        },
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    const src = typeof HTMLAttributes.src === "string" ? HTMLAttributes.src : "";
    const alt = typeof HTMLAttributes.alt === "string" ? HTMLAttributes.alt : "";
    const title = typeof HTMLAttributes.title === "string" ? HTMLAttributes.title : null;
    const caption = typeof HTMLAttributes.caption === "string" ? HTMLAttributes.caption.trim() : "";

    const imageAttributes = mergeAttributes({
      src,
      alt,
      title,
    });

    return [
      "figure",
      {
        "data-cms-image": "",
        class: "blog-inline-image",
      },
      ["img", imageAttributes],
      ...(caption ? [["figcaption", { class: "blog-inline-image__caption" }, caption]] : []),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CmsImageNodeView, {
      stopEvent: ({ event }) => shouldStopNodeViewEvent(event),
    });
  },
});

function shouldStopNodeViewEvent(event: Event) {
  const target = event.target;

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLButtonElement
  );
}

function CmsImageNodeView({
  node,
  updateAttributes,
  deleteNode,
}: {
  node: {
    attrs: {
      src?: string;
      alt?: string;
      caption?: string;
    };
  };
  updateAttributes: (attributes: Record<string, string>) => void;
  deleteNode: () => void;
}) {
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);

  return (
    <NodeViewWrapper as="div" className="group mb-4 overflow-hidden rounded-md border border-white/10 bg-zinc-900">
      <div className="relative bg-zinc-950">
        <img
          src={node.attrs.src ?? ""}
          alt={node.attrs.alt ?? ""}
          className="!m-0 block max-h-[34rem] w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
        <div className="absolute inset-x-0 top-0 flex justify-end gap-2 p-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          <button
            type="button"
            onClick={() => setIsMediaLibraryOpen(true)}
            className="rounded-md border border-white/10 bg-zinc-950/90 px-3 py-1.5 font-sans text-xs font-semibold text-zinc-100 transition hover:border-violet-500 hover:text-white"
          >
            Change
          </button>
          <button
            type="button"
            onClick={deleteNode}
            className="rounded-md border border-white/10 bg-zinc-950/90 px-3 py-1.5 font-sans text-xs font-semibold text-zinc-100 transition hover:border-violet-500 hover:text-white"
          >
            Remove
          </button>
        </div>
        <div className="absolute bottom-3 left-3 right-3">
          <input
            value={node.attrs.caption ?? ""}
            onChange={(event) => updateAttributes({ caption: event.target.value })}
            className="w-full rounded-md border border-white/10 bg-zinc-950/88 px-3 py-2 font-sans text-sm leading-5 text-zinc-200 outline-none backdrop-blur-sm placeholder:text-zinc-500 focus:border-violet-500"
            placeholder="Add image description"
          />
        </div>
      </div>
      <MediaLibraryDialog
        open={isMediaLibraryOpen}
        collection={["blog-media", "author-avatars"]}
        selectedValue={node.attrs.src ?? ""}
        confirmValueMode="url"
        title="Replace image"
        description="Select an image from the media library or upload a new one."
        confirmLabel="Replace image"
        onClose={() => setIsMediaLibraryOpen(false)}
        onConfirm={(src) => {
          updateAttributes({ src });
          setIsMediaLibraryOpen(false);
        }}
      />
    </NodeViewWrapper>
  );
}

function CtaBlockNodeView({
  node,
  updateAttributes,
}: {
  node: {
    attrs: {
      backgroundImage?: string;
      heading?: string;
      body?: string;
      buttonLabel?: string;
      buttonHref?: string;
    };
  };
  updateAttributes: (attributes: Record<string, string>) => void;
}) {
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);
  const headingRef = useRef<HTMLTextAreaElement | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const backgroundImage = node.attrs.backgroundImage ?? "";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (headingRef.current) {
        autoResizeTextarea(headingRef.current);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [node.attrs.heading]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (bodyRef.current) {
        autoResizeTextarea(bodyRef.current);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [node.attrs.body]);

  return (
    <NodeViewWrapper
      as="div"
      className="blog-cta"
      contentEditable={false}
      data-blog-cta=""
      style={backgroundImage
        ? {
            backgroundImage: `linear-gradient(180deg, rgba(10, 10, 12, 0.9), rgba(10, 10, 12, 0.96)), url(${backgroundImage})`,
          }
        : undefined}
    >
      <div className="blog-cta__mediaToolbar">
        <button
          type="button"
          onClick={() => setIsMediaLibraryOpen(true)}
          className="blog-cta__mediaButton"
        >
          {backgroundImage ? "Change background" : "Add background"}
        </button>
        {backgroundImage ? (
          <button
            type="button"
            onClick={() => updateAttributes({ backgroundImage: "" })}
            className="blog-cta__mediaButton"
          >
            Remove image
          </button>
        ) : null}
      </div>
      <div className="blog-cta__inner">
        <textarea
          value={node.attrs.heading ?? ""}
          onChange={(event) => updateAttributes({ heading: event.target.value })}
          onInput={(event) => autoResizeTextarea(event.currentTarget)}
          ref={headingRef}
          className="blog-cta__headingInput"
          rows={2}
          placeholder="Enter the title"
        />
        <textarea
          value={node.attrs.body ?? ""}
          onChange={(event) => updateAttributes({ body: event.target.value })}
          onInput={(event) => autoResizeTextarea(event.currentTarget)}
          ref={bodyRef}
          className="blog-cta__bodyInput"
          rows={4}
          placeholder="Enter the subtitle"
        />
        <div className="blog-cta__actionsEditor">
          <input
            value={node.attrs.buttonLabel ?? ""}
            onChange={(event) => updateAttributes({ buttonLabel: event.target.value })}
            className="blog-cta__buttonInput"
            placeholder="Enter the button label"
          />
          <input
            value={node.attrs.buttonHref ?? ""}
            onChange={(event) => updateAttributes({ buttonHref: event.target.value })}
            className="blog-cta__buttonInput"
            placeholder="Enter the button link"
          />
        </div>
      </div>
      <MediaLibraryDialog
        open={isMediaLibraryOpen}
        collection={["blog-media", "author-avatars"]}
        selectedValue={backgroundImage}
        confirmValueMode="url"
        title="Choose CTA background"
        description="Select a background image from the media library or upload a new one."
        confirmLabel="Use image"
        onClose={() => setIsMediaLibraryOpen(false)}
        onConfirm={(src) => {
          updateAttributes({ backgroundImage: src });
          setIsMediaLibraryOpen(false);
        }}
      />
    </NodeViewWrapper>
  );
}

function HookComparisonNodeView({
  node,
  updateAttributes,
}: {
  node: {
    attrs: {
      title?: string;
      pain?: string;
      benefit?: string;
    };
  };
  updateAttributes: (attributes: Record<string, string>) => void;
}) {
  return (
    <NodeViewWrapper
      as="div"
      className="blog-hook-comparison"
      data-hook-comparison=""
    >
      <input
        value={node.attrs.title ?? ""}
        onChange={(event) => updateAttributes({ title: event.target.value })}
        className="blog-hook-comparison__eyebrowInput"
        placeholder="Example title"
      />
      <div className="blog-hook-comparison__row">
        <span className="blog-hook-comparison__label blog-hook-comparison__label--pain">Pain-led</span>
        <textarea
          value={node.attrs.pain ?? ""}
          onChange={(event) => updateAttributes({ pain: event.target.value })}
          className="blog-hook-comparison__copyInput"
          rows={2}
          placeholder="Pain-led hook"
        />
      </div>
      <div className="blog-hook-comparison__row">
        <span className="blog-hook-comparison__label blog-hook-comparison__label--benefit">Benefit-led</span>
        <textarea
          value={node.attrs.benefit ?? ""}
          onChange={(event) => updateAttributes({ benefit: event.target.value })}
          className="blog-hook-comparison__copyInput"
          rows={2}
          placeholder="Benefit-led hook"
        />
      </div>
    </NodeViewWrapper>
  );
}

function NotePanelNodeView({
  node,
  updateAttributes,
}: {
  node: {
    attrs: {
      title?: string;
      body?: string;
      variant?: string;
    };
  };
  updateAttributes: (attributes: Record<string, string>) => void;
}) {
  return (
    <NodeViewWrapper
      as="div"
      className={`blog-note-panel blog-note-panel--${node.attrs.variant ?? "warm"}`}
      data-blog-note-panel=""
    >
      <div className="blog-note-panel__toolbar">
        <select
          value={node.attrs.variant ?? "warm"}
          onChange={(event) => updateAttributes({ variant: event.target.value })}
          className="blog-note-panel__variantSelect"
        >
          <option value="warm">Warning</option>
          <option value="neutral">Neutral</option>
        </select>
      </div>
      <input
        value={node.attrs.title ?? ""}
        onChange={(event) => updateAttributes({ title: event.target.value })}
        className="blog-note-panel__titleInput"
        placeholder="Panel title"
      />
      <textarea
        value={node.attrs.body ?? ""}
        onChange={(event) => updateAttributes({ body: event.target.value })}
        onInput={(event) => autoResizeTextarea(event.currentTarget)}
        ref={(element) => {
          if (element) {
            autoResizeTextarea(element);
          }
        }}
        className="blog-note-panel__bodyInput"
        rows={3}
        placeholder="Panel body"
      />
    </NodeViewWrapper>
  );
}

function SplitComparisonNodeView({
  node,
  updateAttributes,
}: {
  node: {
    attrs: {
      leftTitle?: string;
      leftItems?: string;
      leftFooter?: string;
      rightTitle?: string;
      rightItems?: string;
      rightFooter?: string;
    };
  };
  updateAttributes: (attributes: Record<string, string>) => void;
}) {
  return (
    <NodeViewWrapper as="div" className="blog-split-comparison" data-blog-split-comparison="">
      <div className="blog-split-comparison__column blog-split-comparison__column--negative">
        <input
          value={node.attrs.leftTitle ?? ""}
          onChange={(event) => updateAttributes({ leftTitle: event.target.value })}
          className="blog-split-comparison__titleInput"
          placeholder="Cons title"
        />
        <textarea
          value={node.attrs.leftItems ?? ""}
          onChange={(event) => updateAttributes({ leftItems: event.target.value })}
          onInput={(event) => autoResizeTextarea(event.currentTarget)}
          ref={(element) => {
            if (element) {
              autoResizeTextarea(element);
            }
          }}
          className="blog-split-comparison__itemsInput"
          rows={6}
          placeholder={"Cons list, one item per line"}
        />
        <input
          value={node.attrs.leftFooter ?? ""}
          onChange={(event) => updateAttributes({ leftFooter: event.target.value })}
          className="blog-split-comparison__footerInput"
          placeholder="Cons outro"
        />
      </div>

      <div className="blog-split-comparison__column blog-split-comparison__column--positive">
        <input
          value={node.attrs.rightTitle ?? ""}
          onChange={(event) => updateAttributes({ rightTitle: event.target.value })}
          className="blog-split-comparison__titleInput"
          placeholder="Pros title"
        />
        <textarea
          value={node.attrs.rightItems ?? ""}
          onChange={(event) => updateAttributes({ rightItems: event.target.value })}
          onInput={(event) => autoResizeTextarea(event.currentTarget)}
          ref={(element) => {
            if (element) {
              autoResizeTextarea(element);
            }
          }}
          className="blog-split-comparison__itemsInput"
          rows={6}
          placeholder={"Pros list, one item per line"}
        />
        <input
          value={node.attrs.rightFooter ?? ""}
          onChange={(event) => updateAttributes({ rightFooter: event.target.value })}
          className="blog-split-comparison__footerInput"
          placeholder="Pros outro"
        />
      </div>
    </NodeViewWrapper>
  );
}

function TakeawaysNodeView({
  node,
  updateAttributes,
}: {
  node: {
    attrs: {
      title?: string;
      items?: string;
    };
  };
  updateAttributes: (attributes: Record<string, string>) => void;
}) {
  return (
    <NodeViewWrapper as="div" className="blog-takeaways" data-blog-takeaways="">
      <input
        value={node.attrs.title ?? ""}
        onChange={(event) => updateAttributes({ title: event.target.value })}
        className="blog-takeaways__titleInput"
        placeholder="Key takeaways"
      />
      <textarea
        value={node.attrs.items ?? ""}
        onChange={(event) => updateAttributes({ items: event.target.value })}
        onInput={(event) => autoResizeTextarea(event.currentTarget)}
        ref={(element) => {
          if (element) {
            autoResizeTextarea(element);
          }
        }}
        className="blog-takeaways__itemsInput"
        rows={7}
        placeholder={"Add takeaways, one per line"}
      />
    </NodeViewWrapper>
  );
}

const CtaBlock = Node.create({
  name: "ctaBlock",
  group: "block",
  atom: true,
  draggable: false,
  selectable: false,
  addAttributes() {
    return {
      backgroundImage: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-background-image"),
        renderHTML: (attributes) => ({ "data-background-image": attributes.backgroundImage }),
      },
      heading: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-heading"),
        renderHTML: (attributes) => ({ "data-heading": attributes.heading }),
      },
      body: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-body"),
        renderHTML: (attributes) => ({ "data-body": attributes.body }),
      },
      buttonLabel: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-button-label"),
        renderHTML: (attributes) => ({ "data-button-label": attributes.buttonLabel }),
      },
      buttonHref: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-button-href"),
        renderHTML: (attributes) => ({ "data-button-href": attributes.buttonHref }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "section[data-blog-cta]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const backgroundImage = String(HTMLAttributes["data-background-image"] ?? "");
    const heading = String(HTMLAttributes["data-heading"] ?? "");
    const body = String(HTMLAttributes["data-body"] ?? "");
    const buttonLabel = String(HTMLAttributes["data-button-label"] ?? "");
    const buttonHref = String(HTMLAttributes["data-button-href"] ?? "");
    const style = backgroundImage
      ? `background-image: linear-gradient(180deg, rgba(10, 10, 12, 0.9), rgba(10, 10, 12, 0.96)), url(${backgroundImage});`
      : undefined;

    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-blog-cta": "",
        class: "blog-cta",
        ...(style ? { style } : {}),
      }),
      [
        "div",
        { class: "blog-cta__inner" },
        ["h2", { class: "blog-cta__heading" }, heading],
        ["p", { class: "blog-cta__body" }, body],
        [
          "div",
          { class: "blog-cta__actions" },
          ["a", { class: "blog-cta__button", href: buttonHref }, buttonLabel],
        ],
      ],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(CtaBlockNodeView, {
      stopEvent: ({ event }) => shouldStopNodeViewEvent(event),
    });
  },
});

const HookComparison = Node.create({
  name: "hookComparison",
  group: "block",
  atom: true,
  draggable: false,
  selectable: false,
  addAttributes() {
    return {
      title: {
        default: "EXAMPLE: TWO HOOK STRATEGIES FOR THE SAME PRODUCT",
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) => ({ "data-title": attributes.title }),
      },
      pain: {
        default: "Still wasting hours tracking competitor ads manually?",
        parseHTML: (element) => element.getAttribute("data-pain"),
        renderHTML: (attributes) => ({ "data-pain": attributes.pain }),
      },
      benefit: {
        default: "See every competitor ad, across every platform, in one place.",
        parseHTML: (element) => element.getAttribute("data-benefit"),
        renderHTML: (attributes) => ({ "data-benefit": attributes.benefit }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-hook-comparison]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const title = String(HTMLAttributes["data-title"] ?? "");
    const pain = String(HTMLAttributes["data-pain"] ?? "");
    const benefit = String(HTMLAttributes["data-benefit"] ?? "");

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-hook-comparison": "",
        class: "blog-hook-comparison",
      }),
      ["p", { class: "blog-hook-comparison__eyebrow" }, title],
      [
        "div",
        { class: "blog-hook-comparison__row" },
        ["span", { class: "blog-hook-comparison__label blog-hook-comparison__label--pain" }, "Pain-led"],
        ["p", { class: "blog-hook-comparison__copy" }, pain],
      ],
      [
        "div",
        { class: "blog-hook-comparison__row" },
        ["span", { class: "blog-hook-comparison__label blog-hook-comparison__label--benefit" }, "Benefit-led"],
        ["p", { class: "blog-hook-comparison__copy" }, benefit],
      ],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(HookComparisonNodeView, {
      stopEvent: ({ event }) => shouldStopNodeViewEvent(event),
    });
  },
});

const NotePanel = Node.create({
  name: "notePanel",
  group: "block",
  atom: true,
  draggable: false,
  selectable: false,
  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) => ({ "data-title": attributes.title }),
      },
      body: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-body"),
        renderHTML: (attributes) => ({ "data-body": attributes.body }),
      },
      variant: {
        default: "warm",
        parseHTML: (element) => element.getAttribute("data-variant"),
        renderHTML: (attributes) => ({ "data-variant": attributes.variant }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-blog-note-panel]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const title = String(HTMLAttributes["data-title"] ?? "");
    const body = String(HTMLAttributes["data-body"] ?? "");
    const variant = String(HTMLAttributes["data-variant"] ?? "warm");

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-blog-note-panel": "",
        class: `blog-note-panel blog-note-panel--${variant}`,
      }),
      ["p", { class: "blog-note-panel__title" }, title],
      ["p", { class: "blog-note-panel__body" }, body],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(NotePanelNodeView, {
      stopEvent: ({ event }) => shouldStopNodeViewEvent(event),
    });
  },
});

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

const SplitComparison = Node.create({
  name: "splitComparison",
  group: "block",
  atom: true,
  draggable: false,
  selectable: false,
  addAttributes() {
    return {
      leftTitle: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-left-title"),
        renderHTML: (attributes) => ({ "data-left-title": attributes.leftTitle }),
      },
      leftItems: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-left-items"),
        renderHTML: (attributes) => ({ "data-left-items": attributes.leftItems }),
      },
      leftFooter: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-left-footer"),
        renderHTML: (attributes) => ({ "data-left-footer": attributes.leftFooter }),
      },
      rightTitle: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-right-title"),
        renderHTML: (attributes) => ({ "data-right-title": attributes.rightTitle }),
      },
      rightItems: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-right-items"),
        renderHTML: (attributes) => ({ "data-right-items": attributes.rightItems }),
      },
      rightFooter: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-right-footer"),
        renderHTML: (attributes) => ({ "data-right-footer": attributes.rightFooter }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-blog-split-comparison]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const leftTitle = String(HTMLAttributes["data-left-title"] ?? "");
    const leftItems = splitLines(String(HTMLAttributes["data-left-items"] ?? ""));
    const leftFooter = String(HTMLAttributes["data-left-footer"] ?? "");
    const rightTitle = String(HTMLAttributes["data-right-title"] ?? "");
    const rightItems = splitLines(String(HTMLAttributes["data-right-items"] ?? ""));
    const rightFooter = String(HTMLAttributes["data-right-footer"] ?? "");

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-blog-split-comparison": "",
        class: "blog-split-comparison",
      }),
      [
        "div",
        { class: "blog-split-comparison__column blog-split-comparison__column--negative" },
        ["p", { class: "blog-split-comparison__title" }, leftTitle],
        [
          "ul",
          { class: "blog-split-comparison__list" },
          ...leftItems.map((item) => [
            "li",
            { class: "blog-split-comparison__item blog-split-comparison__item--negative" },
            ["span", { class: "blog-split-comparison__itemIcon" }, iconSvgNode(blogIconPaths.x)],
            ["span", {}, item],
          ]),
        ],
        ["p", { class: "blog-split-comparison__footer" }, leftFooter],
      ],
      [
        "div",
        { class: "blog-split-comparison__column blog-split-comparison__column--positive" },
        ["p", { class: "blog-split-comparison__title" }, rightTitle],
        [
          "ul",
          { class: "blog-split-comparison__list" },
          ...rightItems.map((item) => [
            "li",
            { class: "blog-split-comparison__item blog-split-comparison__item--positive" },
            ["span", { class: "blog-split-comparison__itemIcon" }, iconSvgNode(blogIconPaths.check)],
            ["span", {}, item],
          ]),
        ],
        ["p", { class: "blog-split-comparison__footer" }, rightFooter],
      ],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SplitComparisonNodeView, {
      stopEvent: ({ event }) => shouldStopNodeViewEvent(event),
    });
  },
});

const Takeaways = Node.create({
  name: "takeaways",
  group: "block",
  atom: true,
  draggable: false,
  selectable: false,
  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) => ({ "data-title": attributes.title }),
      },
      items: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-items"),
        renderHTML: (attributes) => ({ "data-items": attributes.items }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-blog-takeaways]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const title = String(HTMLAttributes["data-title"] ?? "") || "Key takeaways";
    const items = splitLines(String(HTMLAttributes["data-items"] ?? ""));

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-blog-takeaways": "",
        class: "blog-takeaways",
      }),
      ["p", { class: "blog-takeaways__title" }, title],
      [
        "ul",
        { class: "blog-takeaways__list" },
        ...items.map((item) => [
          "li",
          { class: "blog-takeaways__item" },
          ["span", { class: "blog-takeaways__icon" }, iconSvgNode(blogIconPaths.arrowRight)],
          ["span", {}, item],
        ]),
      ],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TakeawaysNodeView, {
      stopEvent: ({ event }) => shouldStopNodeViewEvent(event),
    });
  },
});

function parseJsonArray(value: string | null, fallback: string[][] | string[]) {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function autoResizeTextarea(element: HTMLTextAreaElement) {
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

function TableBlockNodeView({
  node,
  updateAttributes,
}: {
  node: {
    attrs: {
      headers?: string[];
      rows?: string[][];
    };
  };
  updateAttributes: (attributes: Record<string, string[] | string[][]>) => void;
}) {
  const headers = Array.isArray(node.attrs.headers) ? node.attrs.headers : [];
  const rows = Array.isArray(node.attrs.rows) ? node.attrs.rows : [];

  const updateHeader = (columnIndex: number, nextValue: string) => {
    updateAttributes({
      headers: headers.map((header, index) => (index === columnIndex ? nextValue : header)),
    });
  };

  const updateCell = (rowIndex: number, columnIndex: number, nextValue: string) => {
    updateAttributes({
      rows: rows.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex
          ? row.map((cell, currentColumnIndex) => (currentColumnIndex === columnIndex ? nextValue : cell))
          : row,
      ),
    });
  };

  const addRow = () => {
    updateAttributes({
      rows: [...rows, headers.map(() => "")],
    });
  };

  const addRowAndFocusFirstCell = () => {
    const nextRowIndex = rows.length;

    updateAttributes({
      rows: [...rows, headers.map(() => "")],
    });

    window.requestAnimationFrame(() => {
      const selector = `[data-table-row="${nextRowIndex}"][data-table-column="0"]`;
      const nextCell = document.querySelector<HTMLTextAreaElement>(selector);
      nextCell?.focus();
    });
  };

  const addColumn = () => {
    updateAttributes({
      headers: [...headers, `Column ${headers.length + 1}`],
      rows: rows.map((row) => [...row, ""]),
    });
  };

  const removeRow = (rowIndex: number) => {
    if (rows.length <= 1) {
      return;
    }

    updateAttributes({
      rows: rows.filter((_, currentRowIndex) => currentRowIndex !== rowIndex),
    });
  };

  const removeColumn = (columnIndex: number) => {
    if (headers.length <= 1) {
      return;
    }

    updateAttributes({
      headers: headers.filter((_, currentColumnIndex) => currentColumnIndex !== columnIndex),
      rows: rows.map((row) => row.filter((_, currentColumnIndex) => currentColumnIndex !== columnIndex)),
    });
  };

  return (
    <NodeViewWrapper as="div" className="blog-data-table" data-blog-table="">
      <div className="blog-data-table__controls">
        <button type="button" onClick={addRow} className="blog-data-table__controlButton">
          Add row
        </button>
        <button type="button" onClick={addColumn} className="blog-data-table__controlButton">
          Add column
        </button>
      </div>

      <div className="blog-data-table__scroll">
        <table className="blog-data-table__table">
          <thead>
            <tr>
              {headers.map((header, columnIndex) => (
                <th key={`header-${columnIndex}`}>
                  <div className="blog-data-table__headerCell">
                    <textarea
                      value={header}
                      onChange={(event) => updateHeader(columnIndex, event.target.value)}
                      onInput={(event) => autoResizeTextarea(event.currentTarget)}
                      ref={(element) => {
                        if (element) {
                          autoResizeTextarea(element);
                        }
                      }}
                      className="blog-data-table__headerInput"
                      rows={1}
                      placeholder={`Column ${columnIndex + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => removeColumn(columnIndex)}
                      disabled={headers.length <= 1}
                      className="blog-data-table__removeButton"
                      aria-label={`Remove column ${columnIndex + 1}`}
                      title="Remove column"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {row.map((cell, columnIndex) => (
                  <td key={`cell-${rowIndex}-${columnIndex}`}>
                    <div className="blog-data-table__cellWrap">
                      <textarea
                        value={cell}
                        onChange={(event) => updateCell(rowIndex, columnIndex, event.target.value)}
                        onInput={(event) => autoResizeTextarea(event.currentTarget)}
                        onKeyDown={(event) => {
                          const isLastColumn = columnIndex === headers.length - 1;
                          const isLastRow = rowIndex === rows.length - 1;

                          if (event.key === "Tab" && !event.shiftKey && isLastColumn && isLastRow) {
                            event.preventDefault();
                            addRowAndFocusFirstCell();
                          }
                        }}
                        ref={(element) => {
                          if (element) {
                            autoResizeTextarea(element);
                          }
                        }}
                        className="blog-data-table__cellInput"
                        data-table-row={rowIndex}
                        data-table-column={columnIndex}
                        rows={1}
                        placeholder="Value"
                      />
                      {columnIndex === 0 ? (
                        <button
                          type="button"
                          onClick={() => removeRow(rowIndex)}
                          disabled={rows.length <= 1}
                          className="blog-data-table__removeButton blog-data-table__removeButton--row"
                          aria-label={`Remove row ${rowIndex + 1}`}
                          title="Remove row"
                        >
                          <X size={14} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </NodeViewWrapper>
  );
}

const TableBlock = Node.create({
  name: "tableBlock",
  group: "block",
  atom: true,
  draggable: false,
  selectable: false,
  addAttributes() {
    return {
      headers: {
        default: ["Column 1", "Column 2", "Column 3"],
        parseHTML: (element) =>
          parseJsonArray(element.getAttribute("data-headers"), ["Column 1", "Column 2", "Column 3"]),
        renderHTML: (attributes) => ({ "data-headers": JSON.stringify(attributes.headers ?? []) }),
      },
      rows: {
        default: [
          ["Value", "Value", "Value"],
          ["Value", "Value", "Value"],
        ],
        parseHTML: (element) =>
          parseJsonArray(element.getAttribute("data-rows"), [
            ["Value", "Value", "Value"],
            ["Value", "Value", "Value"],
          ]),
        renderHTML: (attributes) => ({ "data-rows": JSON.stringify(attributes.rows ?? []) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-blog-table]" }];
  },
  renderHTML({ HTMLAttributes }) {
    const headers = parseJsonArray(HTMLAttributes["data-headers"] as string | null, []);
    const rows = parseJsonArray(HTMLAttributes["data-rows"] as string | null, []);

    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-blog-table": "",
        class: "blog-data-table",
      }),
      [
        "div",
        { class: "blog-data-table__scroll" },
        [
          "table",
          { class: "blog-data-table__table" },
          [
            "thead",
            {},
            [
              "tr",
              {},
              ...headers.map((header) => ["th", {}, String(header)]),
            ],
          ],
          [
            "tbody",
            {},
            ...rows.map((row) => [
              "tr",
              {},
              ...(Array.isArray(row) ? row : []).map((cell) => ["td", {}, String(cell)]),
            ]),
          ],
        ],
      ],
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TableBlockNodeView, {
      stopEvent: ({ event }) => shouldStopNodeViewEvent(event),
    });
  },
});

function isLikelyHtml(value: string) {
  return /<[^>]+>/.test(value);
}

function normalizeInitialContent(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "<p></p>";
  }

  if (isLikelyHtml(trimmed)) {
    return trimmed;
  }

  return marked.parse(trimmed, { async: false });
}

function normalizeOutput(value: string) {
  return normalizeBlogHtmlForStorage(value)
    .replace(/<p><\/p>$/i, "")
    .replace(/<p>\s*<\/p>$/i, "")
    .trim();
}

function ToolbarButton({
  label,
  isActive = false,
  onClick,
  children,
}: {
  label: string;
  isActive?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={[
        "inline-flex h-9 w-9 items-center justify-center rounded-md border text-sm transition",
        isActive
          ? "border-violet-500 bg-violet-500/15 text-violet-200"
          : "border-white/10 bg-zinc-900 text-zinc-300 hover:border-violet-500 hover:text-violet-200",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function LinkModal({
  open,
  mode,
  targetMode,
  externalUrl,
  selectedPostSlug,
  availablePosts,
  onModeChange,
  onTargetModeChange,
  onExternalUrlChange,
  onSelectedPostSlugChange,
  onClose,
  onSubmit,
  onRemove,
  canRemove,
}: {
  open: boolean;
  mode: LinkMode;
  targetMode: LinkTargetMode;
  externalUrl: string;
  selectedPostSlug: string;
  availablePosts: LinkPostOption[];
  onModeChange: (value: LinkMode) => void;
  onTargetModeChange: (value: LinkTargetMode) => void;
  onExternalUrlChange: (value: string) => void;
  onSelectedPostSlugChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xl rounded-xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="space-y-1">
            <h3 className="font-sans text-lg font-semibold text-zinc-100">Add link</h3>
            <p className="font-sans text-sm text-zinc-400">
              Choose an external URL or link to another blog post.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-zinc-900 text-zinc-300 transition hover:border-violet-500 hover:text-violet-200"
            aria-label="Close link modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onModeChange("external")}
              className={[
                "rounded-lg border px-4 py-3 text-left transition",
                mode === "external"
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-white/10 bg-zinc-900 hover:border-violet-500/60",
              ].join(" ")}
            >
              <p className="font-sans text-sm font-semibold text-zinc-100">External Link</p>
              <p className="mt-1 font-sans text-sm text-zinc-400">Enter any URL.</p>
            </button>
            <button
              type="button"
              onClick={() => onModeChange("internal")}
              className={[
                "rounded-lg border px-4 py-3 text-left transition",
                mode === "internal"
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-white/10 bg-zinc-900 hover:border-violet-500/60",
              ].join(" ")}
            >
              <p className="font-sans text-sm font-semibold text-zinc-100">Internal Link</p>
              <p className="mt-1 font-sans text-sm text-zinc-400">Select another blog post.</p>
            </button>
          </div>

          {mode === "external" ? (
            <label className="grid gap-2">
              <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">URL</span>
              <input
                value={externalUrl}
                onChange={(event) => onExternalUrlChange(event.target.value)}
                placeholder="https://example.com"
                className="rounded-md border border-white/10 bg-zinc-900 px-3 py-2.5 font-sans text-sm text-zinc-100 outline-none transition focus:border-violet-500"
              />
            </label>
          ) : (
            <label className="grid gap-2">
              <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">Blog post</span>
              <select
                value={selectedPostSlug}
                onChange={(event) => onSelectedPostSlugChange(event.target.value)}
                className="rounded-md border border-white/10 bg-zinc-900 px-3 py-2.5 font-sans text-sm text-zinc-100 outline-none transition focus:border-violet-500"
              >
                <option value="">Select a blog post</option>
                {availablePosts.map((post) => (
                  <option key={post.id} value={post.slug}>
                    {post.title} {post.status === "draft" ? "(Draft)" : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="grid gap-2">
            <span className="font-sans text-xs font-semibold uppercase tracking-wide text-zinc-500">Open link in</span>
            <select
              value={targetMode}
              onChange={(event) => onTargetModeChange(event.target.value as LinkTargetMode)}
              className="rounded-md border border-white/10 bg-zinc-900 px-3 py-2.5 font-sans text-sm text-zinc-100 outline-none transition focus:border-violet-500"
            >
              <option value="same-tab">Same window</option>
              <option value="new-tab">New tab</option>
            </select>
          </label>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {canRemove ? (
              <button
                type="button"
                onClick={onRemove}
                className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 font-sans text-sm font-medium text-red-200 transition hover:border-red-400/50"
              >
                Remove link
              </button>
            ) : null}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-white/10 bg-zinc-900 px-4 py-2 font-sans text-sm font-medium text-zinc-200 transition hover:border-violet-500 hover:text-violet-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              className="rounded-md border border-violet-500 bg-violet-500 px-4 py-2 font-sans text-sm font-semibold text-white transition hover:bg-violet-400"
            >
              Apply link
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function RichTextEditor({
  value,
  onChange,
  availablePosts,
}: {
  value: string;
  onChange: (value: string) => void;
  availablePosts: LinkPostOption[];
}) {
  const lastSyncedValueRef = useRef(normalizeOutput(normalizeInitialContent(value)));
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkMode, setLinkMode] = useState<LinkMode>("external");
  const [linkTargetMode, setLinkTargetMode] = useState<LinkTargetMode>("same-tab");
  const [externalUrl, setExternalUrl] = useState("https://");
  const [selectedPostSlug, setSelectedPostSlug] = useState("");
  const openLinkModal = (attributes: { href?: string | null; target?: string | null }) => {
    const previousHref = typeof attributes.href === "string" ? attributes.href : "";
    const internalPostSlug = parseInternalPostSlug(previousHref);

    if (internalPostSlug) {
      setLinkMode("internal");
      setSelectedPostSlug(internalPostSlug);
      setExternalUrl("https://");
    } else {
      setLinkMode("external");
      setExternalUrl(previousHref || "https://");
      setSelectedPostSlug("");
    }

    setLinkTargetMode(getLinkTargetMode(attributes.target));
    setIsLinkModalOpen(true);
  };
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3],
        },
      }),
      Link.configure({
        openOnClick: false,
        enableClickSelection: true,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: {
          target: null,
          rel: null,
        },
      }),
      CmsImage,
      CtaBlock,
      NotePanel,
      SplitComparison,
      Takeaways,
      HookComparison,
      TableBlock,
    ],
    editorProps: {
      attributes: {
        class: "cms-wysiwyg__content min-h-[34rem] px-4 py-4 outline-none",
      },
    },
    content: normalizeInitialContent(value),
    onUpdate: ({ editor: currentEditor }) => {
      const nextValue = normalizeOutput(currentEditor.getHTML());
      lastSyncedValueRef.current = nextValue;
      onChange(nextValue);
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const normalizedExternalValue = normalizeOutput(normalizeInitialContent(value));

    if (normalizedExternalValue !== lastSyncedValueRef.current) {
      const nextContent = normalizeInitialContent(value);
      editor.commands.setContent(nextContent, { emitUpdate: false });
      lastSyncedValueRef.current = normalizedExternalValue;
    }
  }, [editor, value]);

  if (!editor) {
    return (
      <div className="rounded-md border border-white/10 bg-zinc-900 p-4 font-sans text-sm text-zinc-400">
        Loading editor...
      </div>
    );
  }

  const setLink = () => {
    const attributes = editor.getAttributes("link") as { href?: string; target?: string | null };
    openLinkModal(attributes);
  };

  const applyLink = () => {
    const href = linkMode === "internal" ? getInternalPostHref(selectedPostSlug) : externalUrl.trim();

    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setIsLinkModalOpen(false);
      return;
    }

    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({
        href,
        target: linkTargetMode === "new-tab" ? "_blank" : null,
        rel: getLinkRel(linkTargetMode),
      })
      .run();

    setIsLinkModalOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setIsLinkModalOpen(false);
  };

  const insertHookComparison = () => {
    editor
      .chain()
      .focus()
      .splitBlock()
      .insertContent([
        {
          type: "hookComparison",
          attrs: {
            title: "EXAMPLE: TWO HOOK STRATEGIES FOR THE SAME PRODUCT",
            pain: "Still wasting hours tracking competitor ads manually?",
            benefit: "See every competitor ad, across every platform, in one place.",
          },
        },
        {
          type: "paragraph",
        },
      ])
      .run();
  };

  const insertCtaBlock = () => {
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "ctaBlock",
          attrs: {
            backgroundImage: "",
            heading: "",
            body: "",
            buttonLabel: "",
            buttonHref: "",
          },
        },
      ])
      .run();
  };

  const insertTableBlock = () => {
    editor
      .chain()
      .focus()
      .splitBlock()
      .insertContent([
        {
          type: "tableBlock",
          attrs: {
            headers: ["Column 1", "Column 2", "Column 3"],
            rows: [
              ["Value", "Value", "Value"],
              ["Value", "Value", "Value"],
            ],
          },
        },
        {
          type: "paragraph",
        },
      ])
      .run();
  };

  const insertNotePanel = () => {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "notePanel",
          attrs: {
            title: "",
            body: "",
            variant: "warm",
          },
        },
      ])
      .run();

    window.requestAnimationFrame(() => {
      window.scrollTo(scrollX, scrollY);
    });
  };

  const insertSplitComparison = () => {
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "splitComparison",
          attrs: {
            leftTitle: "",
            leftItems: "",
            leftFooter: "",
            rightTitle: "",
            rightItems: "",
            rightFooter: "",
          },
        },
      ])
      .run();
  };

  const insertTakeaways = () => {
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: "takeaways",
          attrs: {
            title: "Key takeaways",
            items: "",
          },
        },
      ])
      .run();
  };

  return (
    <>
      <div className="rounded-md border border-white/10 bg-zinc-900">
        <div className="sticky top-0 z-10 flex flex-wrap gap-2 rounded-t-md border-b border-white/10 bg-zinc-950/95 p-3 backdrop-blur">
          <ToolbarButton label="Undo" onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 size={15} />
          </ToolbarButton>
          <ToolbarButton label="Redo" onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Heading 2"
            isActive={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <span className="text-[13px] font-semibold">H2</span>
          </ToolbarButton>
          <ToolbarButton
            label="Heading 3"
            isActive={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            <span className="text-[13px] font-semibold">H3</span>
          </ToolbarButton>
          <ToolbarButton
            label="Bold"
            isActive={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            isActive={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Bullet List"
            isActive={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Ordered List"
            isActive={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Quote"
            isActive={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote size={15} />
          </ToolbarButton>
          <ToolbarButton
            label="Insert image"
            onClick={() => setIsMediaLibraryOpen(true)}
          >
            <ImagePlus size={15} />
          </ToolbarButton>
          <ToolbarButton label="CTA" onClick={insertCtaBlock}>
            <span className="text-[11px] font-semibold uppercase tracking-wide">CTA</span>
          </ToolbarButton>
          <ToolbarButton label="Note panel" onClick={insertNotePanel}>
            <span className="text-[11px] font-semibold uppercase tracking-wide">Note</span>
          </ToolbarButton>
          <ToolbarButton label="A/B comparison" onClick={insertSplitComparison}>
            <span className="text-[11px] font-semibold uppercase tracking-wide">A/B</span>
          </ToolbarButton>
          <ToolbarButton label="Takeaways" onClick={insertTakeaways}>
            <span className="text-[11px] font-semibold uppercase tracking-wide">Key</span>
          </ToolbarButton>
          <ToolbarButton
            label="Hook comparison"
            onClick={insertHookComparison}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide">H/B</span>
          </ToolbarButton>
          <ToolbarButton label="Table" onClick={insertTableBlock}>
            <span className="text-[11px] font-semibold uppercase tracking-wide">Tbl</span>
          </ToolbarButton>
          <ToolbarButton
            label="Link"
            isActive={editor.isActive("link")}
            onClick={setLink}
          >
            <Link2 size={15} />
          </ToolbarButton>
        </div>
        <div className="rounded-b-md">
          <EditorContent
            editor={editor}
            onDoubleClick={(event) => {
              const target = event.target;

              if (!(target instanceof HTMLElement)) {
                return;
              }

              const link = target.closest("a");

              if (!link) {
                return;
              }

              event.preventDefault();
              editor.commands.focus();
              openLinkModal({
                href: link.getAttribute("href"),
                target: link.getAttribute("target"),
              });
            }}
          />
        </div>
      </div>
      <MediaLibraryDialog
        open={isMediaLibraryOpen}
        collection={["blog-media", "author-avatars"]}
        selectedValue=""
        confirmValueMode="url"
        title="Insert image"
        description="Select an image from the media library or upload a new one."
        confirmLabel="Insert image"
        onClose={() => setIsMediaLibraryOpen(false)}
        onConfirm={(src) => {
          editor.chain().focus().insertContent({
            type: "image",
            attrs: { src, alt: "", caption: "" },
          }).run();
        }}
      />
      <LinkModal
        open={isLinkModalOpen}
        mode={linkMode}
        targetMode={linkTargetMode}
        externalUrl={externalUrl}
        selectedPostSlug={selectedPostSlug}
        availablePosts={availablePosts}
        onModeChange={setLinkMode}
        onTargetModeChange={setLinkTargetMode}
        onExternalUrlChange={setExternalUrl}
        onSelectedPostSlugChange={setSelectedPostSlug}
        onClose={() => setIsLinkModalOpen(false)}
        onSubmit={applyLink}
        onRemove={removeLink}
        canRemove={editor.isActive("link")}
      />
    </>
  );
}
