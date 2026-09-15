"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  MessageSquareQuote,
  Redo2,
  Undo2,
} from "lucide-react";

import { MediaLibraryDialog } from "./media-library-dialog";

type MdxEditorProps = {
  value: string;
  onChange: (value: string) => void;
};

type SelectionRange = {
  end: number;
  start: number;
};

type EditorSnapshot = SelectionRange & {
  value: string;
};

function normalizeSelection(start: number, end: number): SelectionRange {
  return start <= end ? { start, end } : { start: end, end: start };
}

function getLineSelection(value: string, selection: SelectionRange) {
  const start = value.lastIndexOf("\n", Math.max(0, selection.start - 1)) + 1;
  const endCandidate = value.indexOf("\n", selection.end);
  const end = endCandidate === -1 ? value.length : endCandidate;

  return {
    end,
    start,
    text: value.slice(start, end),
  };
}

function wrapSelection(
  value: string,
  selection: SelectionRange,
  options: {
    after: string;
    before: string;
    placeholder: string;
  },
) {
  const current = value.slice(selection.start, selection.end);
  const text = current || options.placeholder;
  const nextValue = `${value.slice(0, selection.start)}${options.before}${text}${options.after}${value.slice(selection.end)}`;
  const contentStart = selection.start + options.before.length;

  return {
    nextSelection: {
      start: contentStart,
      end: contentStart + text.length,
    },
    nextValue,
  };
}

function toggleHeading(value: string, selection: SelectionRange, prefix: "## " | "### ") {
  const lineSelection = getLineSelection(value, selection);
  if (!lineSelection.text.trim()) {
    const nextText = prefix;

    return {
      nextSelection: {
        start: lineSelection.start + nextText.length,
        end: lineSelection.start + nextText.length,
      },
      nextValue: `${value.slice(0, lineSelection.start)}${nextText}${value.slice(lineSelection.end)}`,
    };
  }

  const lines = lineSelection.text.split("\n");
  const shouldRemove = lines.every((line) => !line.trim() || line.startsWith(prefix));
  const nextText = lines
    .map((line) => {
      if (!line.trim()) {
        return line;
      }

      if (shouldRemove) {
        return line.startsWith(prefix) ? line.slice(prefix.length) : line;
      }

      return `${prefix}${line}`;
    })
    .join("\n");

  return {
    nextSelection: {
      start: lineSelection.start,
      end: lineSelection.start + nextText.length,
    },
    nextValue: `${value.slice(0, lineSelection.start)}${nextText}${value.slice(lineSelection.end)}`,
  };
}

function toggleList(
  value: string,
  selection: SelectionRange,
  mode: "bullet" | "ordered",
) {
  const lineSelection = getLineSelection(value, selection);
  const lines = lineSelection.text.split("\n");
  const bulletPattern = /^(\s*)-\s+/;
  const orderedPattern = /^(\s*)\d+\.\s+/;
  const listPrefix = (index: number) => (mode === "bullet" ? "- " : `${index}. `);
  const hasNonEmptyLine = lines.some((line) => line.trim().length > 0);
  const shouldRemove = lines.every((line) => {
    if (!line.trim()) {
      return true;
    }

    return mode === "bullet" ? bulletPattern.test(line) : orderedPattern.test(line);
  }) && hasNonEmptyLine;

  let orderIndex = 0;
  const nextText = lines
    .map((line) => {
      const indent = line.match(/^\s*/)?.[0] ?? "";

      if (!line.trim()) {
        if (shouldRemove) {
          return line;
        }

        orderIndex += 1;
        return `${indent}${listPrefix(orderIndex)}`;
      }

      const withoutPrefix = line.replace(bulletPattern, "$1").replace(orderedPattern, "$1");

      if (shouldRemove) {
        return withoutPrefix;
      }

      orderIndex += 1;
      return `${indent}${listPrefix(orderIndex)}${withoutPrefix.trimStart()}`;
    })
    .join("\n");

  return {
    nextSelection: {
      start: lineSelection.start,
      end: lineSelection.start + nextText.length,
    },
    nextValue: `${value.slice(0, lineSelection.start)}${nextText}${value.slice(lineSelection.end)}`,
  };
}

function insertBlock(
  value: string,
  selection: SelectionRange,
  snippet: string,
) {
  const before = value.slice(0, selection.start);
  const after = value.slice(selection.end);
  const needsLeadingBreak = before.length > 0 && !before.endsWith("\n\n");
  const needsTrailingBreak = after.length > 0 && !after.startsWith("\n\n");
  const prefix = needsLeadingBreak ? "\n\n" : "";
  const suffix = needsTrailingBreak ? "\n\n" : "";
  const nextValue = `${before}${prefix}${snippet}${suffix}${after}`;
  const start = before.length + prefix.length;

  return {
    nextSelection: {
      start: start + snippet.length,
      end: start + snippet.length,
    },
    nextValue,
  };
}

function insertQuote(value: string, selection: SelectionRange) {
  const selected = value.slice(selection.start, selection.end).trim();

  return insertBlock(
    value,
    selection,
    `<Quote>\n${selected || "Quoted text"}\n</Quote>`,
  );
}

function insertLink(value: string, selection: SelectionRange, href: string, label: string) {
  const nextText = `[${label}](${href})`;

  return {
    nextSelection: {
      start: selection.start,
      end: selection.start + nextText.length,
    },
    nextValue: `${value.slice(0, selection.start)}${nextText}${value.slice(selection.end)}`,
  };
}

function ToolbarButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-zinc-900 text-zinc-200 transition hover:border-violet-500 hover:text-white"
    >
      {children}
    </button>
  );
}

export function MdxEditor({ value, onChange }: MdxEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const selectionRef = useRef<SelectionRange>({ start: 0, end: 0 });
  const undoStackRef = useRef<EditorSnapshot[]>([]);
  const redoStackRef = useRef<EditorSnapshot[]>([]);
  const pendingSelectionRef = useRef<SelectionRange | null>(null);
  const isApplyingHistoryRef = useRef(false);
  const [isMediaLibraryOpen, setIsMediaLibraryOpen] = useState(false);

  const syncSelection = () => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return selectionRef.current;
    }

    const nextSelection = normalizeSelection(textarea.selectionStart, textarea.selectionEnd);
    selectionRef.current = nextSelection;
    return nextSelection;
  };

  const restoreSelection = (selection: SelectionRange) => {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(selection.start, selection.end);
      selectionRef.current = selection;
    });
  };

  useEffect(() => {
    const pendingSelection = pendingSelectionRef.current;

    if (!pendingSelection) {
      return;
    }

    pendingSelectionRef.current = null;
    restoreSelection(pendingSelection);
  }, [value]);

  const pushUndoSnapshot = (snapshot: EditorSnapshot) => {
    const previous = undoStackRef.current[undoStackRef.current.length - 1];

    if (
      previous &&
      previous.value === snapshot.value &&
      previous.start === snapshot.start &&
      previous.end === snapshot.end
    ) {
      return;
    }

    undoStackRef.current.push(snapshot);

    if (undoStackRef.current.length > 120) {
      undoStackRef.current.shift();
    }
  };

  const applyUpdate = (input: {
    nextSelection: SelectionRange;
    nextValue: string;
    previousSelection?: SelectionRange;
  }) => {
    const previousSelection = input.previousSelection ?? syncSelection();

    if (input.nextValue === value) {
      pendingSelectionRef.current = input.nextSelection;
      restoreSelection(input.nextSelection);
      return;
    }

    pushUndoSnapshot({
      value,
      start: previousSelection.start,
      end: previousSelection.end,
    });
    redoStackRef.current = [];
    pendingSelectionRef.current = input.nextSelection;
    onChange(input.nextValue);
  };

  const handleUndo = () => {
    const snapshot = undoStackRef.current.pop();

    if (!snapshot) {
      return;
    }

    const currentSelection = syncSelection();
    redoStackRef.current.push({
      value,
      start: currentSelection.start,
      end: currentSelection.end,
    });
    pendingSelectionRef.current = {
      start: snapshot.start,
      end: snapshot.end,
    };
    isApplyingHistoryRef.current = true;
    onChange(snapshot.value);
  };

  const handleRedo = () => {
    const snapshot = redoStackRef.current.pop();

    if (!snapshot) {
      return;
    }

    const currentSelection = syncSelection();
    pushUndoSnapshot({
      value,
      start: currentSelection.start,
      end: currentSelection.end,
    });
    pendingSelectionRef.current = {
      start: snapshot.start,
      end: snapshot.end,
    };
    isApplyingHistoryRef.current = true;
    onChange(snapshot.value);
  };

  const handleChange = (nextValue: string, nextSelection: SelectionRange) => {
    if (!isApplyingHistoryRef.current) {
      pushUndoSnapshot({
        value,
        start: selectionRef.current.start,
        end: selectionRef.current.end,
      });
      redoStackRef.current = [];
    }

    isApplyingHistoryRef.current = false;
    selectionRef.current = nextSelection;
    pendingSelectionRef.current = nextSelection;
    onChange(nextValue);
  };

  const applyInlineAction = (before: string, after: string, placeholder: string) => {
    applyUpdate(
      wrapSelection(value, syncSelection(), {
        before,
        after,
        placeholder,
      }),
    );
  };

  const handleInsertLink = () => {
    const selection = syncSelection();
    const selectedText = value.slice(selection.start, selection.end).trim();
    const href = window.prompt("Link URL", "https://");

    if (!href) {
      return;
    }

    const label = selectedText || window.prompt("Link label", "Link text") || "Link text";
    applyUpdate(insertLink(value, selection, href.trim(), label));
  };

  const handleInsertImage = (pathname: string) => {
    setIsMediaLibraryOpen(false);
    applyUpdate(
      insertBlock(
        value,
        syncSelection(),
        `<BlogImage src={${JSON.stringify(pathname)}} alt={""} caption={""} />`,
      ),
    );
  };

  return (
    <>
      <div className="overflow-hidden rounded-md border border-white/10 bg-zinc-900">
        <div className="flex flex-wrap gap-1.5 border-b border-white/10 bg-zinc-950 px-3 py-3">
          <ToolbarButton label="Undo" onClick={handleUndo}>
            <Undo2 size={18} />
          </ToolbarButton>
          <ToolbarButton label="Redo" onClick={handleRedo}>
            <Redo2 size={18} />
          </ToolbarButton>
          <ToolbarButton label="Heading 2" onClick={() => applyUpdate(toggleHeading(value, syncSelection(), "## "))}>
            <span className="text-[11px] font-semibold">H2</span>
          </ToolbarButton>
          <ToolbarButton label="Heading 3" onClick={() => applyUpdate(toggleHeading(value, syncSelection(), "### "))}>
            <span className="text-[11px] font-semibold">H3</span>
          </ToolbarButton>
          <ToolbarButton label="Bold" onClick={() => applyInlineAction("**", "**", "Bold text")}>
            <Bold size={18} />
          </ToolbarButton>
          <ToolbarButton label="Italic" onClick={() => applyInlineAction("*", "*", "Italic text")}>
            <Italic size={18} />
          </ToolbarButton>
          <ToolbarButton label="Bullet list" onClick={() => applyUpdate(toggleList(value, syncSelection(), "bullet"))}>
            <List size={18} />
          </ToolbarButton>
          <ToolbarButton label="Ordered list" onClick={() => applyUpdate(toggleList(value, syncSelection(), "ordered"))}>
            <ListOrdered size={18} />
          </ToolbarButton>
          <ToolbarButton label="Quote" onClick={() => applyUpdate(insertQuote(value, syncSelection()))}>
            <MessageSquareQuote size={18} />
          </ToolbarButton>
          <ToolbarButton label="Insert image" onClick={() => setIsMediaLibraryOpen(true)}>
            <ImagePlus size={18} />
          </ToolbarButton>
          <ToolbarButton
            label="CTA"
            onClick={() =>
              applyUpdate(
                insertBlock(
                  value,
                  syncSelection(),
                  '<BlogCta heading={"CTA heading"} body={"Supporting copy"} buttonLabel={"See AdLuv in action"} buttonHref={"/contact-sales"} />',
                ),
              )
            }
          >
            <span className="font-sans text-[10px] font-semibold uppercase">CTA</span>
          </ToolbarButton>
          <ToolbarButton
            label="Note panel"
            onClick={() =>
              applyUpdate(
                insertBlock(
                  value,
                  syncSelection(),
                  '<BlogNotePanel title={"Note title"} body={"Supporting note copy"} />',
                ),
              )
            }
          >
            <span className="font-sans text-[10px] font-semibold uppercase">NOTE</span>
          </ToolbarButton>
          <ToolbarButton
            label="A/B comparison"
            onClick={() =>
              applyUpdate(
                insertBlock(
                  value,
                  syncSelection(),
                  '<BlogSplitComparison leftTitle={"Avoid this"} leftItems={["Point one", "Point two"]} leftFooter={"Why it underperforms"} rightTitle={"Do this instead"} rightItems={["Point one", "Point two"]} rightFooter={"Why it wins"} />',
                ),
              )
            }
          >
            <span className="font-sans text-[10px] font-semibold uppercase">A/B</span>
          </ToolbarButton>
          <ToolbarButton
            label="Key takeaways"
            onClick={() =>
              applyUpdate(
                insertBlock(
                  value,
                  syncSelection(),
                  '<BlogTakeaways title={"Key takeaways"} items={["First takeaway", "Second takeaway", "Third takeaway"]} />',
                ),
              )
            }
          >
            <span className="font-sans text-[10px] font-semibold uppercase">KEY</span>
          </ToolbarButton>
          <ToolbarButton
            label="Hook comparison"
            onClick={() =>
              applyUpdate(
                insertBlock(
                  value,
                  syncSelection(),
                  '<BlogHookComparison title={"Example: two hook strategies for the same product"} pain={"Still wasting hours tracking competitor ads manually?"} benefit={"See every competitor ad, across every platform, in one place."} />',
                ),
              )
            }
          >
            <span className="font-sans text-[10px] font-semibold uppercase">H/B</span>
          </ToolbarButton>
          <ToolbarButton
            label="Table"
            onClick={() =>
              applyUpdate(
                insertBlock(
                  value,
                  syncSelection(),
                  '<BlogDataTable headers={["Column 1", "Column 2", "Column 3"]} rows={[["Value", "Value", "Value"], ["Value", "Value", "Value"]]} />',
                ),
              )
            }
          >
            <span className="font-sans text-[10px] font-semibold uppercase">TBL</span>
          </ToolbarButton>
          <ToolbarButton label="Link" onClick={handleInsertLink}>
            <Link2 size={18} />
          </ToolbarButton>
        </div>

        <div className="p-4">
          <div className="grid gap-2">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(event) =>
                handleChange(event.target.value, normalizeSelection(event.target.selectionStart, event.target.selectionEnd))
              }
              onClick={syncSelection}
              onKeyUp={syncSelection}
              onMouseUp={syncSelection}
              onSelect={syncSelection}
              spellCheck={false}
              placeholder={`## Lead with a sharp section heading\n\nWrite the article in MDX.\n\n<BlogNotePanel title={"Why this matters"} body={"Explain the insight here."} />`}
              className="min-h-[34rem] w-full resize-y rounded-sm border border-white/10 bg-zinc-950 px-4 py-4 font-mono text-[14px] leading-7 text-zinc-100 outline-none transition focus:border-violet-500"
            />
            <p className="font-sans text-xs leading-6 text-zinc-500">
              Use GitHub-flavored Markdown plus MDX components. The toolbar now matches the legacy editor actions while keeping the source editable as plain MDX.
            </p>
          </div>
        </div>
      </div>

      <MediaLibraryDialog
        open={isMediaLibraryOpen}
        collection="blog-media"
        selectedValue=""
        onClose={() => setIsMediaLibraryOpen(false)}
        onConfirm={handleInsertImage}
      />
    </>
  );
}
