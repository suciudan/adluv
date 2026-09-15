"use client";

import { useEffect, useState } from "react";

type TableOfContentsItem = {
  id: string;
  label: string;
};

export function BlogTableOfContents({ items }: { items: TableOfContentsItem[] }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((heading): heading is HTMLElement => heading instanceof HTMLElement);

    if (headings.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);

        if (visibleEntries.length > 0) {
          setActiveId(visibleEntries[0].target.id);
        }
      },
      {
        rootMargin: "-20% 0px -60% 0px",
        threshold: [0, 0.2, 0.5, 1],
      },
    );

    headings.forEach((heading) => observer.observe(heading));

    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    const guide = document.querySelector(".blog-guide-outline");

    if (!(guide instanceof HTMLElement)) {
      setIsVisible(true);
      return;
    }

    const updateVisibility = () => {
      const guideBottom = guide.getBoundingClientRect().bottom;
      setIsVisible(guideBottom <= 112);
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, []);

  return (
    <div
      className={`rounded-[1.8rem] border border-white/10 bg-white/[0.03] p-6 transition-all duration-200 ${
        isVisible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0"
      }`}
    >
      <p className="text-sm font-semibold uppercase tracking-widest text-violet-300/80">Table of contents</p>
      <nav className="mt-3">
        <ul className="space-y-3">
          {items.map((item) => {
            const isActive = item.id === activeId;

            return (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`text-base leading-6 transition-colors ${
                    isActive ? "!font-medium !text-violet-400" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {item.label}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
