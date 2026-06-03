"use client";

import { useEffect, useRef } from "react";

/**
 * Lightweight confirmation modal built on the native <dialog> element —
 * gives us a backdrop, focus trapping, top-layer stacking, and
 * Escape-to-dismiss for free, with no dependencies. Controlled via the
 * `open` prop; `onCancel` fires on Escape, backdrop click, or Cancel.
 *
 * The backdrop is dimmed via the `backdrop:` variant; clicking it (i.e.
 * a click whose target is the <dialog> itself, outside the inner panel)
 * cancels.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Native `cancel` fires only on Escape (not on programmatic close or
      // confirm), so this syncs React state without clobbering a confirm.
      onCancel={onCancel}
      // Click on the backdrop (target is the dialog itself) cancels.
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
      aria-labelledby="confirm-dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-0 text-stone-900 dark:text-stone-100 shadow-xl backdrop:bg-black/50"
    >
      <div className="p-5">
        <h2 id="confirm-dialog-title" className="text-base font-semibold">
          {title}
        </h2>
        {body && (
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            {body}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
