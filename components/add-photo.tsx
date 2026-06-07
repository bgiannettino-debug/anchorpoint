"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadClimbPhoto } from "@/lib/photo-upload";
import { PHOTO_LICENSE, MAX_CAPTION } from "@/lib/photos";

type Props = {
  climbUuid: string;
  signedIn: boolean;
};

/**
 * "Add a photo" control for the climb page. Signed-out users get a sign-in
 * link; signed-in users get a small inline form: pick an image, optional
 * caption, and a required CC BY-SA 4.0 consent checkbox (the auth + license
 * gate is also enforced by RLS, not just this UI). On success we
 * router.refresh() so the server re-fetches and the new photo appears in
 * the gallery.
 */
export function AddPhoto({ climbUuid, signedIn }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  if (!signedIn) {
    return (
      <p className="text-sm text-stone-600 dark:text-stone-300">
        <Link
          href="/login"
          className="underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
        >
          Sign in
        </Link>{" "}
        to add a photo.
      </p>
    );
  }

  function reset() {
    setFile(null);
    setCaption("");
    setConsent(false);
    setError(null);
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    setFile(e.target.files?.[0] ?? null);
    setError(null);
  }

  function submit() {
    if (!file || !consent || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await uploadClimbPhoto(climbUuid, file, caption);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      setOpen(false);
      // Re-render the server component so the new photo shows up.
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm px-3 py-1.5 rounded-full border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
      >
        📷 Add a photo
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 space-y-3">
      {/* Two source buttons. The camera input's `capture` attribute opens
          the device camera directly on mobile; on desktop it's ignored and
          falls back to a file dialog. Both feed the same onPick handler. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => cameraInput.current?.click()}
          className="text-sm px-3 py-1.5 rounded-full border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
        >
          📷 Take a photo
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="text-sm px-3 py-1.5 rounded-full border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors"
        >
          Choose a file
        </button>
        {file && (
          <span className="text-sm text-stone-600 dark:text-stone-300 truncate max-w-[14rem]">
            {file.name}
          </span>
        )}
      </div>
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPick}
        className="hidden"
      />
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        onChange={onPick}
        className="hidden"
      />
      <input
        type="text"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        maxLength={MAX_CAPTION}
        placeholder="Caption (optional)"
        aria-label="Photo caption"
        className="w-full px-3 py-2 text-sm rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent"
      />
      <label className="flex items-start gap-2 text-sm text-stone-600 dark:text-stone-300">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I took this photo and license it under{" "}
          <a
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100"
          >
            {PHOTO_LICENSE}
          </a>
          .
        </span>
      </label>
      {error && (
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!file || !consent || pending}
          className="text-sm px-4 py-1.5 rounded-full bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Uploading…" : "Upload"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={pending}
          className="text-sm text-stone-500 dark:text-stone-400 underline underline-offset-4 hover:text-stone-900 dark:hover:text-stone-100 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
