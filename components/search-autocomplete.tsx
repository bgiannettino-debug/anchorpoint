"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Suggestion } from "@/app/api/suggest/route";

type Props = {
  mode: "areas" | "routes" | "location" | "ask";
  name: string;
  defaultValue: string;
  placeholder: string;
  ariaLabel: string;
};

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

/**
 * Search input with live typeahead suggestions. As you type (debounced,
 * after 2 chars) it fetches /api/suggest for the current mode and shows a
 * dropdown; selecting an item jumps straight to it (a climb/area page, or
 * the near-me view for a place). Ask mode has no suggestions. Plain Enter
 * with nothing highlighted falls through to the normal form submit, so
 * existing search behavior is unchanged.
 */
export function SearchAutocomplete({
  mode,
  name,
  defaultValue,
  placeholder,
  ariaLabel,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const canSuggest =
    mode === "routes" || mode === "areas" || mode === "location";

  // Debounced fetch on input change. All state updates happen inside the
  // timeout (never synchronously in the effect body) to avoid cascading
  // renders.
  useEffect(() => {
    if (!canSuggest) return;
    const q = value.trim();
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      if (q.length < MIN_CHARS) {
        setItems([]);
        setOpen(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/suggest?mode=${mode}&q=${encodeURIComponent(q)}`,
          { signal: ctrl.signal },
        );
        const data = (await res.json()) as { suggestions?: Suggestion[] };
        const next = data.suggestions ?? [];
        setItems(next);
        setOpen(next.length > 0);
        setActive(-1);
      } catch {
        // aborted or network error — leave the box as a plain search
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value, mode, canSuggest]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function go(s: Suggestion) {
    setOpen(false);
    if (s.href) {
      router.push(s.href);
    } else if (s.lat != null && s.lng != null) {
      router.push(`/?lat=${s.lat.toFixed(5)}&lng=${s.lng.toFixed(5)}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      // Only intercept Enter when a suggestion is highlighted; otherwise
      // let the form submit (normal search).
      e.preventDefault();
      go(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={boxRef} className="relative flex-1 min-w-0">
      <input
        type="search"
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (items.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        autoFocus
        className="w-full px-4 py-3 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent"
      />
      {open && items.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-80 overflow-auto rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-lg"
        >
          {items.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === active}
              // mousedown (not click) fires before the input blur, so the
              // dropdown is still open when we navigate.
              onMouseDown={(e) => {
                e.preventDefault();
                go(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2 cursor-pointer ${
                i === active ? "bg-stone-100 dark:bg-stone-800" : ""
              }`}
            >
              <div className="text-sm text-stone-900 dark:text-stone-100 truncate">
                {s.label}
              </div>
              {s.sublabel && (
                <div className="text-xs text-stone-500 dark:text-stone-400 truncate">
                  {s.sublabel}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
