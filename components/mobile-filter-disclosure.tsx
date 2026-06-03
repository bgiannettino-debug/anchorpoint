"use client";

import { useState, type ReactNode } from "react";

/**
 * Mobile-only collapsible wrapper for the area-page climb filters. The
 * filter controls (type chips, name search, grade range) stacked
 * ~500px tall above the climb list on phones; this hides them behind a
 * "Filters" toggle so the list is visible immediately. On desktop
 * (>=sm) the toggle is hidden and the filters always render.
 *
 * Controlled (not a native <details>) so the open state is reliable
 * across viewports without the UA content-hiding quirks — desktop just
 * forces the body visible with `sm:block`. `defaultOpen` is computed on
 * the server (hasAnyFilter), so the disclosure starts open when filters
 * are already active (making it clear why the count is reduced) and
 * hydration stays in sync.
 *
 * Styled after the weather card: same ▾ glyph + rotate-on-open.
 */
export function MobileFilterDisclosure({
  defaultOpen,
  children,
}: {
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="sm:hidden flex w-full items-center gap-2 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-3 text-sm"
      >
        <span className="font-medium text-stone-900 dark:text-stone-100">
          Filters
        </span>
        <span
          aria-hidden
          className={`ml-auto text-stone-400 dark:text-stone-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>
      <div className={`${open ? "block" : "hidden"} sm:block mt-3 sm:mt-0`}>
        {children}
      </div>
    </div>
  );
}
