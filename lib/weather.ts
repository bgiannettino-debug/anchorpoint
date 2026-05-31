// Open-Meteo client (free, no API key required). Used by the
// WeatherForecast server component on area / climb pages.
//
// Why Open-Meteo: it's the only mainstream forecast API that's both
// free at our scale and doesn't require an API key, which keeps the
// client request signed at the edge. Server-side fetches are cached
// via Next.js' `next: { revalidate }` so popular crags hit our edge
// cache instead of hammering open-meteo.com.

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
// Refresh weather every 30 minutes. Climbers care more about
// "today vs. tomorrow" than minute-by-minute accuracy, and this keeps
// us well under Open-Meteo's free-tier ceiling even at scale.
const REVALIDATE_SECONDS = 1800;

export type WeatherData = {
  timezone: string;
  current: {
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
    weather_code: number[];
  };
};

export async function fetchWeather(
  lat: number,
  lng: number,
): Promise<WeatherData | null> {
  try {
    const url = new URL(ENDPOINT);
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("precipitation_unit", "inch");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "3");
    url.searchParams.set(
      "current",
      "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m",
    );
    url.searchParams.set(
      "daily",
      "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    );
    const res = await fetch(url, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) return null;
    return (await res.json()) as WeatherData;
  } catch (err) {
    console.error("Open-Meteo fetch failed (non-fatal):", err);
    return null;
  }
}

// WMO weather codes → emoji + short label. Reference:
// https://open-meteo.com/en/docs (search "weather_code").
const CODE_TABLE: Record<number, { icon: string; label: string }> = {
  0: { icon: "☀️", label: "Clear" },
  1: { icon: "🌤️", label: "Mostly clear" },
  2: { icon: "⛅", label: "Partly cloudy" },
  3: { icon: "☁️", label: "Overcast" },
  45: { icon: "🌫️", label: "Fog" },
  48: { icon: "🌫️", label: "Icy fog" },
  51: { icon: "🌦️", label: "Light drizzle" },
  53: { icon: "🌦️", label: "Drizzle" },
  55: { icon: "🌦️", label: "Heavy drizzle" },
  56: { icon: "🌧️", label: "Freezing drizzle" },
  57: { icon: "🌧️", label: "Freezing drizzle" },
  61: { icon: "🌧️", label: "Light rain" },
  63: { icon: "🌧️", label: "Rain" },
  65: { icon: "🌧️", label: "Heavy rain" },
  66: { icon: "🌧️", label: "Freezing rain" },
  67: { icon: "🌧️", label: "Freezing rain" },
  71: { icon: "🌨️", label: "Light snow" },
  73: { icon: "❄️", label: "Snow" },
  75: { icon: "❄️", label: "Heavy snow" },
  77: { icon: "🌨️", label: "Snow grains" },
  80: { icon: "🌦️", label: "Light showers" },
  81: { icon: "🌧️", label: "Showers" },
  82: { icon: "🌧️", label: "Heavy showers" },
  85: { icon: "🌨️", label: "Snow showers" },
  86: { icon: "🌨️", label: "Heavy snow showers" },
  95: { icon: "⛈️", label: "Thunderstorm" },
  96: { icon: "⛈️", label: "Thunderstorm w/ hail" },
  99: { icon: "⛈️", label: "Severe thunderstorm" },
};

const FALLBACK = { icon: "🌡️", label: "—" };

export function weatherCodeLabel(code: number): string {
  return (CODE_TABLE[code] ?? FALLBACK).label;
}

export function weatherCodeIcon(code: number): string {
  return (CODE_TABLE[code] ?? FALLBACK).icon;
}

/**
 * Render the daily forecast's date label relative to the area's local
 * timezone (using the array index, not the server's clock — Vercel
 * runs UTC and a naive `new Date()` comparison would mislabel Today vs
 * Tomorrow for negative-offset crags).
 */
export function formatForecastDay(dateStr: string, index: number): string {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short" });
}
