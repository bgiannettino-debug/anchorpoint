import {
  EMPTY_GRADE_RANGE,
  V_GRADES,
  YDS_GRADES,
  type GradeRange,
} from "@/lib/grade-options";

type Props = {
  range: GradeRange;
  /** Visual + button label, e.g. "Apply grade filter". */
  label?: string;
  /**
   * When true, only the V-scale row renders. Useful in contexts where
   * the surrounding filter already narrows to bouldering.
   */
  boulderOnly?: boolean;
};

/**
 * Min / max grade dropdowns for both scales. Pure form fields with
 * `name` attributes — sits inside the parent search form, so changes
 * apply on the existing Submit button rather than needing a separate
 * onChange handler. Keeps server-component-only and avoids the client
 * boundary.
 *
 * Each <select> includes a leading "Any" option whose value is the
 * empty string; parseGradeRange treats that as "no constraint".
 */
export function GradeRangeFilter({ range, label, boulderOnly }: Props) {
  return (
    <fieldset className="mb-3 rounded-lg border border-stone-200 dark:border-stone-800 px-3 py-3">
      {label && (
        <legend className="text-xs uppercase tracking-wide text-stone-500 dark:text-stone-400 px-1">
          {label}
        </legend>
      )}
      {!boulderOnly && (
        <GradePair
          title="Route grade"
          name="yds"
          options={YDS_GRADES}
          min={range.ydsMin}
          max={range.ydsMax}
        />
      )}
      <GradePair
        title="Boulder grade"
        name="v"
        options={V_GRADES}
        min={range.vMin}
        max={range.vMax}
      />
    </fieldset>
  );
}

function GradePair({
  title,
  name,
  options,
  min,
  max,
}: {
  title: string;
  /** URL param prefix — actual fields are `${name}Min`, `${name}Max`. */
  name: "yds" | "v";
  options: string[];
  min: string;
  max: string;
}) {
  const selectCls =
    "min-w-[5.5rem] px-2 py-1 text-sm rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-700 dark:focus:ring-stone-300";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-stone-700 dark:text-stone-200 mb-2 last:mb-0">
      <span className="w-28 shrink-0">{title}</span>
      <select
        name={`${name}Min`}
        defaultValue={min}
        aria-label={`${title} minimum`}
        className={selectCls}
      >
        <option value="">Any</option>
        {options.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
      <span aria-hidden>–</span>
      <select
        name={`${name}Max`}
        defaultValue={max}
        aria-label={`${title} maximum`}
        className={selectCls}
      >
        <option value="">Any</option>
        {options.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Re-exported empty constant so callers building hrefs don't have to
 * import from two places.
 */
export { EMPTY_GRADE_RANGE };
