"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Body text that collapses to 4 lines (the `line-clamp-4` below) with a
 * Read more / Show less toggle. The toggle only appears when the text
 * actually overflows the clamp (measured after mount), so short content
 * stays clean. Preserves newlines (climb notes are multi-paragraph).
 */
export function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Measured while collapsed (clamp applied): a taller scroll height than
    // the visible box means there's more to reveal.
    setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text]);

  return (
    <div>
      <p
        ref={ref}
        className={`text-stone-700 dark:text-stone-300 whitespace-pre-line ${
          expanded ? "" : "line-clamp-4"
        }`}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-1 text-sm font-medium text-stone-600 dark:text-stone-300 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
        >
          {expanded ? "Show less" : "Read more…"}
        </button>
      )}
    </div>
  );
}
