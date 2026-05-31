import {
  fetchWeather,
  formatForecastDay,
  weatherCodeIcon,
  weatherCodeLabel,
} from "@/lib/weather";

/**
 * Current conditions + 3-day forecast card for a crag's lat/lng. Server
 * component so the Open-Meteo request happens at the edge and is
 * cached via Next.js' `revalidate`. Renders nothing if coords are
 * missing or the API is unreachable, so callers can drop it inline
 * without guards.
 */
export async function WeatherForecast({
  lat,
  lng,
}: {
  lat: number | null | undefined;
  lng: number | null | undefined;
}) {
  if (lat == null || lng == null) return null;
  const data = await fetchWeather(lat, lng);
  if (!data) return null;

  const { current, daily } = data;
  const currentLabel = weatherCodeLabel(current.weather_code);
  const currentIcon = weatherCodeIcon(current.weather_code);

  return (
    <section
      aria-label="Weather"
      className="mb-4 rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-4"
    >
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-2xl" aria-hidden>
          {currentIcon}
        </span>
        <span className="text-2xl font-semibold text-stone-900 dark:text-stone-100 tabular-nums">
          {Math.round(current.temperature_2m)}°F
        </span>
        <span className="text-stone-700 dark:text-stone-300">
          {currentLabel}
        </span>
      </div>
      <p className="text-sm text-stone-600 dark:text-stone-400 mt-1">
        Feels {Math.round(current.apparent_temperature)}° · Wind{" "}
        {Math.round(current.wind_speed_10m)} mph · {current.relative_humidity_2m}
        % humidity
      </p>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {daily.time.map((date, i) => (
          <div
            key={date}
            className="rounded-md border border-stone-200 dark:border-stone-800 px-2 py-2 text-center"
          >
            <div className="text-xs text-stone-500 dark:text-stone-400 mb-0.5">
              {formatForecastDay(date, i)}
            </div>
            <div className="text-xl" aria-hidden>
              {weatherCodeIcon(daily.weather_code[i])}
            </div>
            <div
              className="text-sm text-stone-900 dark:text-stone-100 tabular-nums"
              title={weatherCodeLabel(daily.weather_code[i])}
            >
              {Math.round(daily.temperature_2m_max[i])}° /{" "}
              <span className="text-stone-500 dark:text-stone-400">
                {Math.round(daily.temperature_2m_min[i])}°
              </span>
            </div>
            <div className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              {daily.precipitation_probability_max[i] ?? 0}% rain
            </div>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-stone-400 dark:text-stone-500 mt-2 text-right">
        Weather: Open-Meteo
      </p>
    </section>
  );
}
