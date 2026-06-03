"use client";

import Link from "next/link";
import { useRef } from "react";

export type SortDropdownOption = {
  label: string;
  href: string;
  isActive: boolean;
};

/**
 * Mobile sort dropdown — a native <details> chevron disclosure styled
 * after the weather card (same ▾ glyph + group-open:rotate-180,
 * right-anchored popover).
 *
 * Client component for one reason: it has to close itself on selection.
 * The options navigate via soft <Link> navigation, which preserves the
 * <details> DOM node across the navigation — so its uncontrolled `open`
 * state would otherwise survive and the menu would stay open after a
 * pick. We close it explicitly onClick instead. Navigation is still the
 * <Link>'s job; this just collapses the disclosure.
 */
export function SortDropdown({
  activeLabel,
  options,
}: {
  activeLabel: string;
  options: SortDropdownOption[];
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={ref} className="sm:hidden group relative text-sm">
      <summary className="cursor-pointer list-none flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
        <span aria-hidden>Sort:</span>
        <span className="font-medium text-stone-900 dark:text-stone-100">
          {activeLabel}
        </span>
        <span
          aria-hidden
          className="text-stone-400 dark:text-stone-500 transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div
        role="group"
        aria-label="Sort climbs"
        className="absolute right-0 z-10 mt-1 min-w-32 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 py-1 shadow-lg"
      >
        {options.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            aria-current={o.isActive ? "true" : undefined}
            onClick={() => {
              if (ref.current) ref.current.open = false;
            }}
            className={
              o.isActive
                ? "block px-3 py-1.5 font-medium text-stone-900 dark:text-stone-100 bg-stone-100 dark:bg-stone-800"
                : "block px-3 py-1.5 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800/50"
            }
          >
            {o.label}
          </Link>
        ))}
      </div>
    </details>
  );
}
