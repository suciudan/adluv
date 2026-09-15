"use client";

import { useState } from "react";

export function ExpandableDescription({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const canCollapse = text.length > 260;

  return (
    <div>
      <p
        className={`text-[13px] leading-5 text-[var(--text-secondary)] md:line-clamp-none ${
          canCollapse && !isExpanded ? "line-clamp-6" : ""
        }`}
      >
        {text}
      </p>

      {canCollapse ? (
        <button
          type="button"
          onClick={() => setIsExpanded((value) => !value)}
          className="mt-3 inline-flex text-sm font-medium leading-5 text-[var(--accent-hover)] transition hover:text-[var(--text-primary)] md:hidden"
        >
          {isExpanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}
