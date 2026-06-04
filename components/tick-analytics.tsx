"use client";

import { gradeToNumber, vScaleToNumber } from "@/lib/grades";
import { YDS_GRADES, V_GRADES } from "@/lib/grade-options";
import type { Tick, TickStyle } from "@/lib/ticks";

/**
 * Tick analytics v1: a grade pyramid (by style) plus a first-go-vs-worked
 * summary, split into Roped and Boulder scales. Pure + presentational —
 * computes everything from the ticks already loaded on /ticks, so there's
 * no new data or chart dependency (bars are Tailwind divs).
 *
 * Counts clean sends only — onsight / flash / redpoint / pinkpoint.
 * Attempts and top-rope are excluded. Each logged send counts once
 * (laps and repeat ascents of the same climb are not deduped).
 */

// Best → most-worked, which is also the bar stacking order.
const SEND_STYLES = ["onsight", "flash", "redpoint", "pinkpoint"] as const;
type SendStyle = (typeof SEND_STYLES)[number];

const STYLE_META: Record<SendStyle, { label: string; bar: string }> = {
  onsight: { label: "Onsight", bar: "bg-emerald-500" },
  flash: { label: "Flash", bar: "bg-sky-500" },
  redpoint: { label: "Redpoint", bar: "bg-amber-500" },
  pinkpoint: { label: "Pinkpoint", bar: "bg-rose-400" },
};

type Bucket = { label: string; key: number };

// Canonical grade buckets, precomputed once. gradeToNumber/vScaleToNumber
// never return null for these well-formed canonical strings.
const YDS_BUCKETS: Bucket[] = YDS_GRADES.map((g) => ({
  label: g,
  key: gradeToNumber(g) ?? 0,
}));
const V_BUCKETS: Bucket[] = V_GRADES.map((g) => ({
  label: g,
  key: vScaleToNumber(g) ?? 0,
}));

/** Snap a (possibly messy: "5.11+", "5.10a/b") grade to its nearest bucket. */
function snap(
  grade: string,
  buckets: Bucket[],
  toNumber: (g: string) => number | null,
): Bucket | null {
  const k = toNumber(grade);
  if (k == null) return null;
  let best: Bucket | null = null;
  let bestD = Infinity;
  for (const b of buckets) {
    const d = Math.abs(b.key - k);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

type Scale = "roped" | "boulder";

function classify(
  grade: string | undefined,
): { scale: Scale; bucket: Bucket } | null {
  if (!grade) return null;
  const yds = snap(grade, YDS_BUCKETS, gradeToNumber);
  if (yds) return { scale: "roped", bucket: yds };
  const v = snap(grade, V_BUCKETS, vScaleToNumber);
  if (v) return { scale: "boulder", bucket: v };
  return null;
}

function isSendStyle(s: TickStyle): s is SendStyle {
  return (SEND_STYLES as readonly string[]).includes(s);
}

type Row = {
  label: string;
  key: number;
  counts: Record<SendStyle, number>;
  total: number;
};
type ScaleData = {
  rows: Row[]; // hardest first
  maxTotal: number;
  firstGo: Bucket | null; // hardest onsight/flash
  worked: Bucket | null; // hardest redpoint/pinkpoint
  total: number;
};

function buildScale(sends: Tick[], scale: Scale): ScaleData | null {
  const byBucket = new Map<string, Row>();
  let firstGo: Bucket | null = null;
  let worked: Bucket | null = null;
  let total = 0;

  for (const t of sends) {
    const c = classify(t.climbGrade);
    if (!c || c.scale !== scale || !isSendStyle(t.style)) continue;
    const style = t.style;
    let row = byBucket.get(c.bucket.label);
    if (!row) {
      row = {
        label: c.bucket.label,
        key: c.bucket.key,
        counts: { onsight: 0, flash: 0, redpoint: 0, pinkpoint: 0 },
        total: 0,
      };
      byBucket.set(c.bucket.label, row);
    }
    row.counts[style] += 1;
    row.total += 1;
    total += 1;

    if (style === "onsight" || style === "flash") {
      if (!firstGo || c.bucket.key > firstGo.key) firstGo = c.bucket;
    } else if (!worked || c.bucket.key > worked.key) {
      worked = c.bucket;
    }
  }

  if (byBucket.size === 0) return null;
  const rows = [...byBucket.values()].sort((a, b) => b.key - a.key);
  const maxTotal = Math.max(...rows.map((r) => r.total));
  return { rows, maxTotal, firstGo, worked, total };
}

export function TickAnalytics({ ticks }: { ticks: Tick[] }) {
  const sends = ticks.filter((t) => isSendStyle(t.style) && t.climbGrade);
  const roped = buildScale(sends, "roped");
  const boulder = buildScale(sends, "boulder");
  if (!roped && !boulder) return null;

  return (
    <section
      aria-label="Send analytics"
      className="mb-8 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4 sm:p-5"
    >
      <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
        Your sends
      </h2>
      <p className="text-xs text-stone-500 dark:text-stone-400 mb-4">
        Clean ascents — onsight, flash, redpoint, pinkpoint.
      </p>
      <div className="space-y-6">
        {roped && <ScaleBlock title="Roped" data={roped} />}
        {boulder && <ScaleBlock title="Boulder" data={boulder} />}
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
        {SEND_STYLES.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400"
          >
            <span className={`w-2.5 h-2.5 rounded-sm ${STYLE_META[s].bar}`} />
            {STYLE_META[s].label}
          </span>
        ))}
      </div>
    </section>
  );
}

function ScaleBlock({ title, data }: { title: string; data: ScaleData }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-sm font-medium text-stone-700 dark:text-stone-200">
          {title}{" "}
          <span className="text-stone-400 dark:text-stone-500 font-normal tabular-nums">
            ({data.total})
          </span>
        </h3>
        <p className="text-xs text-stone-500 dark:text-stone-400 tabular-nums">
          First go {data.firstGo?.label ?? "—"} · Worked{" "}
          {data.worked?.label ?? "—"}
        </p>
      </div>
      <div className="space-y-1">
        {data.rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-right text-xs font-mono tabular-nums text-stone-500 dark:text-stone-400">
              {row.label}
            </span>
            <div className="flex-1">
              <div
                className="flex h-4 rounded-sm overflow-hidden min-w-[2px]"
                style={{ width: `${(row.total / data.maxTotal) * 100}%` }}
              >
                {SEND_STYLES.map((s) =>
                  row.counts[s] > 0 ? (
                    <div
                      key={s}
                      className={STYLE_META[s].bar}
                      style={{ width: `${(row.counts[s] / row.total) * 100}%` }}
                      title={`${row.counts[s]} ${STYLE_META[s].label}`}
                    />
                  ) : null,
                )}
              </div>
            </div>
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-stone-500 dark:text-stone-400">
              {row.total}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
