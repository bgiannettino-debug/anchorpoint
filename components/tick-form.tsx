"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  addTick,
  TICK_STYLES,
  type NewTickInput,
  type TickStyle,
} from "@/lib/ticks";
import {
  getAuthServerSnapshot,
  getAuthSnapshot,
  subscribeAuth,
} from "@/lib/auth";

type Props = {
  climbUuid: string;
  climbName: string;
  climbGrade?: string;
  parentUuid?: string;
  parentName?: string;
  ancestorUuids?: string[];
};

const TRIGGER_CLASSES =
  "shrink-0 inline-flex items-center text-sm px-3 py-1.5 rounded-full border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors";

function todayLocalDate(): string {
  // toISOString() always renders in UTC and trims it — fine for our
  // YYYY-MM-DD column. Using locale-derived parts keeps the date local
  // so "today" matches the user's clock when they're west of GMT.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function TickForm(props: Props) {
  const auth = useSyncExternalStore(
    subscribeAuth,
    getAuthSnapshot,
    getAuthServerSnapshot,
  );

  if (auth.status === "loading") {
    return (
      <span className={`${TRIGGER_CLASSES} opacity-0`} aria-hidden="true">
        Log a tick
      </span>
    );
  }

  if (auth.status === "signed-out") {
    return (
      <Link href="/login" className={TRIGGER_CLASSES}>
        Sign in to log a tick
      </Link>
    );
  }

  return <TickFormSignedIn {...props} />;
}

function TickFormSignedIn(props: Props) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayLocalDate());
  const [style, setStyle] = useState<TickStyle>("redpoint");
  // Keep laps as a string so the user can clear the field while typing
  // a new number — normalizing on every keystroke snaps it back to "1"
  // and makes the input feel broken.
  const [lapsText, setLapsText] = useState("1");
  const [notes, setNotes] = useState("");
  const [suggestedGrade, setSuggestedGrade] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={TRIGGER_CLASSES}
      >
        Log a tick
      </button>
    );
  }

  function reset() {
    setDate(todayLocalDate());
    setStyle("redpoint");
    setLapsText("1");
    setNotes("");
    setSuggestedGrade("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const parsedLaps = parseInt(lapsText, 10);
    const laps = Number.isFinite(parsedLaps) && parsedLaps >= 1 ? parsedLaps : 1;
    const payload: NewTickInput = {
      climbUuid: props.climbUuid,
      climbName: props.climbName,
      climbGrade: props.climbGrade,
      parentUuid: props.parentUuid,
      parentName: props.parentName,
      ancestorUuids: props.ancestorUuids,
      dateClimbed: date,
      style,
      laps,
      notes: notes.trim() || undefined,
      suggestedGrade: suggestedGrade.trim() || undefined,
    };
    try {
      await addTick(payload);
      reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save tick.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-800 p-5 space-y-4"
    >
      <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
        Log a tick
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block min-w-0">
          <span className="text-sm text-stone-700 dark:text-stone-300">
            Date
          </span>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={saving}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent disabled:opacity-60"
          />
        </label>

        <label className="block min-w-0">
          <span className="text-sm text-stone-700 dark:text-stone-300">
            Style
          </span>
          <select
            required
            value={style}
            onChange={(e) => setStyle(e.target.value as TickStyle)}
            disabled={saving}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent disabled:opacity-60"
          >
            {TICK_STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="text-sm text-stone-700 dark:text-stone-300">
            Laps
          </span>
          <input
            type="number"
            min={1}
            required
            value={lapsText}
            onChange={(e) => setLapsText(e.target.value)}
            onBlur={() => {
              // Snap empty / invalid / sub-1 back to "1" only after the
              // user leaves the field, so typing isn't disrupted.
              const n = parseInt(lapsText, 10);
              if (!Number.isFinite(n) || n < 1) setLapsText("1");
            }}
            disabled={saving}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent disabled:opacity-60"
          />
        </label>

        <label className="block min-w-0">
          <span className="text-sm text-stone-700 dark:text-stone-300">
            Suggested grade{" "}
            <span className="text-xs text-stone-500 dark:text-stone-400">
              (optional)
            </span>
          </span>
          <input
            type="text"
            value={suggestedGrade}
            onChange={(e) => setSuggestedGrade(e.target.value)}
            placeholder={props.climbGrade ?? "e.g. 5.10c"}
            disabled={saving}
            className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent disabled:opacity-60"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm text-stone-700 dark:text-stone-300">
          Notes{" "}
          <span className="text-xs text-stone-500 dark:text-stone-400">
            (optional)
          </span>
        </span>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={saving}
          className="mt-1 w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300 focus:border-transparent disabled:opacity-60 resize-y"
        />
      </label>

      {error && (
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-stone-900 dark:bg-stone-100 text-white dark:text-stone-900 font-medium hover:bg-stone-800 dark:hover:bg-stone-200 transition-colors disabled:opacity-60 disabled:cursor-wait"
        >
          {saving ? "Saving…" : "Save tick"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={saving}
          className="px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 font-medium hover:border-stone-500 dark:hover:border-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800/50 transition-colors disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
