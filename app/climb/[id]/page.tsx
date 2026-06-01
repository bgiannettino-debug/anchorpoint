import { Fragment, Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { gql } from "@apollo/client";
import { getClient } from "@/lib/apollo-client";
import { BookmarkButton } from "@/components/bookmark-button";
import { TickForm } from "@/components/tick-form";
import { DirectionsButton } from "@/components/directions-button";
import { MapToggle } from "@/components/map-toggle";
import { Stars } from "@/components/stars";
import { RateClimb } from "@/components/rate-climb";
import { WeatherForecast } from "@/components/weather-forecast";
import { WeatherSkeleton } from "@/components/weather-skeleton";
import { coordsOf } from "@/lib/geo";
import { blendRating, type RatingSource } from "@/lib/ratings";
import { createClient } from "@/lib/supabase/server";

type ClimbRatingRow = RatingSource;

async function fetchRating(uuid: string): Promise<ClimbRatingRow | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("climbs_index")
      .select("curated_stars, curated_votes, ugc_stars, ugc_votes")
      .eq("uuid", uuid)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  } catch (err) {
    console.error("Climb rating fetch failed (non-fatal):", err);
    return null;
  }
}

// The signed-in user's own rating for this climb (1–5), or null if
// they haven't rated it (or aren't signed in). Used to pre-fill the
// RateClimb input.
async function fetchUserRating(uuid: string): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("climb_ratings")
      .select("stars")
      .eq("climb_uuid", uuid)
      .maybeSingle();
    if (error) throw error;
    return data?.stars ?? null;
  } catch (err) {
    console.error("User rating fetch failed (non-fatal):", err);
    return null;
  }
}

async function fetchSignedIn(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return !!data.user;
  } catch {
    return false;
  }
}

type ClimbDetail = {
  uuid: string;
  name: string;
  fa?: string | null;
  safety?: string | null;
  boltsCount?: number | null;
  length: number;
  type?: {
    sport?: boolean | null;
    trad?: boolean | null;
    bouldering?: boolean | null;
    tr?: boolean | null;
    mixed?: boolean | null;
    ice?: boolean | null;
    aid?: boolean | null;
    alpine?: boolean | null;
    deepwatersolo?: boolean | null;
  } | null;
  pitches?: { id: string }[] | null;
  grades?: { yds?: string | null; vscale?: string | null } | null;
  content?: {
    description?: string | null;
    location?: string | null;
    protection?: string | null;
  } | null;
  media?: {
    mediaUrl: string;
    width: number;
    height: number;
  }[] | null;
  ticks?: { _id: string }[] | null;
  metadata?: { lat?: number | null; lng?: number | null } | null;
  pathTokens: string[];
  ancestors: string[];
  parent?: {
    uuid: string;
    area_name: string;
    totalClimbs: number;
    metadata?: { lat?: number | null; lng?: number | null } | null;
  } | null;
};

type GetClimbResponse = {
  climb: ClimbDetail | null;
};

const GET_CLIMB = gql`
  query GetClimb($uuid: ID) {
    climb(uuid: $uuid) {
      uuid
      name
      fa
      safety
      boltsCount
      length
      type {
        sport
        trad
        bouldering
        tr
        mixed
        ice
        aid
        alpine
        deepwatersolo
      }
      pitches {
        id
      }
      grades {
        yds
        vscale
      }
      content {
        description
        location
        protection
      }
      media {
        mediaUrl
        width
        height
      }
      ticks {
        _id
      }
      metadata {
        lat
        lng
      }
      pathTokens
      ancestors
      parent {
        uuid
        area_name
        totalClimbs
        metadata {
          lat
          lng
        }
      }
    }
  }
`;

async function fetchClimb(uuid: string): Promise<ClimbDetail | null> {
  try {
    const result = await getClient().query<GetClimbResponse>({
      query: GET_CLIMB,
      variables: { uuid },
      errorPolicy: "all",
    });
    return result.data?.climb ?? null;
  } catch (err) {
    console.error("OpenBeta GraphQL query failed:", err);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const climb = await fetchClimb(id);
  if (climb) {
    const grade = climb.grades?.yds ?? climb.grades?.vscale;
    return {
      title: `${climb.name}${grade ? ` (${grade})` : ""} · Anchorpoint`,
      description: `Climb: ${climb.name}${grade ? ` ${grade}` : ""}`,
    };
  }
  return {};
}

export default async function ClimbPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // OpenBeta detail + aggregate rating + this user's own rating +
  // sign-in status, all independent — fire in parallel.
  const [climb, rating, userRating, signedIn] = await Promise.all([
    fetchClimb(id),
    fetchRating(id),
    fetchUserRating(id),
    fetchSignedIn(),
  ]);
  const blended = rating ? blendRating(rating) : null;

  if (!climb) {
    return (
      <main className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/"
            className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
          >
            ← Search
          </Link>
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100 mt-6">
            Climb not found
          </h1>
          <p className="text-stone-600 dark:text-stone-400 mt-2">
            No climb exists with that ID.
          </p>
        </div>
      </main>
    );
  }

  const grade = climb.grades?.yds ?? climb.grades?.vscale ?? "—";
  const type = formatClimbType(climb.type);
  const pitchCount = climb.pitches?.length ?? 0;
  const danger =
    climb.safety === "R" || climb.safety === "X"
      ? climb.safety
      : climb.safety === "runout"
        ? "Runout"
        : null;
  const tickCount = climb.ticks?.length ?? 0;
  const fa = climb.fa?.trim();
  // Prefer the climb's own coords; fall back to the parent area's.
  const mapCoords = coordsOf(climb.metadata) ?? coordsOf(climb.parent?.metadata);

  // Build a JSX list of meta parts, joined with " · ". Doing this here
  // (rather than as a string) lets the safety rating keep its own styling.
  const metaParts: React.ReactNode[] = [];
  if (type) metaParts.push(type);
  if (climb.length > 0) metaParts.push(`${climb.length}m`);
  if (pitchCount > 1) metaParts.push(`${pitchCount} pitches`);
  if (climb.boltsCount && climb.boltsCount > 0) {
    metaParts.push(`${climb.boltsCount} bolts`);
  }
  if (danger) {
    metaParts.push(
      <span className="font-semibold text-red-700 dark:text-red-400">
        {danger}
      </span>,
    );
  }

  return (
    <main className="min-h-screen bg-stone-50 dark:bg-stone-950 p-8">
      <div className="max-w-3xl mx-auto">
        <Link
          href={climb.parent ? `/area/${climb.parent.uuid}` : "/"}
          className="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100"
        >
          ← {climb.parent ? climb.parent.area_name : "Search"}
        </Link>

        <Breadcrumbs
          pathTokens={climb.pathTokens}
          ancestors={climb.ancestors}
        />

        <div className="flex items-baseline justify-between gap-4 mt-2">
          <h1 className="text-4xl font-bold text-stone-900 dark:text-stone-100">
            {climb.name}
          </h1>
          <span className="flex items-baseline gap-3 shrink-0">
            {blended && <Stars {...blended} size="md" />}
            <span className="text-2xl font-mono text-stone-700 dark:text-stone-300">
              {grade}
            </span>
          </span>
        </div>

        {metaParts.length > 0 && (
          <p className="text-stone-600 dark:text-stone-400 mt-2">
            {metaParts.map((p, i) => (
              <Fragment key={i}>
                {i > 0 && " · "}
                {p}
              </Fragment>
            ))}
          </p>
        )}

        {fa && (
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
            FA: {fa}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <BookmarkButton
            type="climb"
            uuid={climb.uuid}
            name={climb.name}
            grade={grade !== "—" ? grade : undefined}
            parentUuid={climb.parent?.uuid}
            parentName={climb.parent?.area_name}
            // ancestors[last] is the climb itself — drop it so we only
            // store area UUIDs in the chain. Used to nest the climb
            // under the closest bookmarked ancestor on /bookmarks.
            ancestorUuids={climb.ancestors.slice(0, -1)}
            // Full climb payload — written to IndexedDB on save so
            // the page can be rebuilt offline from this snapshot.
            snapshot={climb}
          />
          {mapCoords && (
            <DirectionsButton lat={mapCoords.lat} lng={mapCoords.lng} />
          )}
        </div>
        <div className="mt-3">
          <RateClimb
            climbUuid={climb.uuid}
            initial={userRating}
            signedIn={signedIn}
          />
        </div>
        <div className="mt-3">
          <TickForm
            climbUuid={climb.uuid}
            climbName={climb.name}
            climbGrade={grade !== "—" ? grade : undefined}
            parentUuid={climb.parent?.uuid}
            parentName={climb.parent?.area_name}
            ancestorUuids={climb.ancestors.slice(0, -1)}
          />
        </div>

        {mapCoords && (
          <div className="mt-4">
            <Suspense fallback={<WeatherSkeleton />}>
              <WeatherForecast lat={mapCoords.lat} lng={mapCoords.lng} />
            </Suspense>
          </div>
        )}

        {mapCoords && climb.parent && (
          <div className="mt-3">
            <MapToggle
              crags={[
                {
                  uuid: climb.parent.uuid,
                  name: climb.parent.area_name,
                  lat: mapCoords.lat,
                  lng: mapCoords.lng,
                  climbs: climb.parent.totalClimbs,
                },
              ]}
              frameRadiusMiles={0.25}
            />
          </div>
        )}

        {climb.media && climb.media.length > 0 && (
          <section className="mt-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {climb.media.map((m) => (
                <a
                  key={m.mediaUrl}
                  href={`https://media.openbeta.io${m.mediaUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900"
                >
                  <Image
                    src={`https://media.openbeta.io${m.mediaUrl}`}
                    alt={`Photo of ${climb.name}`}
                    width={m.width}
                    height={m.height}
                    sizes="(max-width: 640px) 100vw, 50vw"
                    className="w-full h-auto"
                  />
                </a>
              ))}
            </div>
          </section>
        )}

        <ContentSection title="Description" text={climb.content?.description} />
        <ContentSection title="Location" text={climb.content?.location} />
        <ContentSection title="Protection" text={climb.content?.protection} />

        {tickCount > 0 && (
          <p className="text-sm text-stone-500 dark:text-stone-400 mt-8">
            Logged by {tickCount} climber{tickCount === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </main>
  );
}

function ContentSection({
  title,
  text,
}: {
  title: string;
  text?: string | null;
}) {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold text-stone-800 dark:text-stone-200 mb-2">
        {title}
      </h2>
      <p className="text-stone-700 dark:text-stone-300 whitespace-pre-line">
        {trimmed}
      </p>
    </section>
  );
}

function Breadcrumbs({
  pathTokens,
  ancestors,
}: {
  pathTokens: string[];
  ancestors: string[];
}) {
  // For a climb, the trailing entries in pathTokens/ancestors are the
  // climb itself — strip them so the breadcrumb only shows parent areas.
  // We drop any entries whose corresponding ancestor doesn't look like a
  // resolvable area uuid (the climb's own id sits at the end).
  const areaCount = Math.min(pathTokens.length, ancestors.length);
  // The climb's own name typically appears as the last pathToken; the
  // corresponding ancestor is the climb's id. Drop the last entry.
  const tokens = pathTokens.slice(0, Math.max(0, areaCount - 1));
  const ids = ancestors.slice(0, Math.max(0, areaCount - 1));
  if (tokens.length === 0) return null;
  return (
    <nav
      aria-label="Breadcrumbs"
      className="mt-4 text-sm text-stone-500 dark:text-stone-400"
    >
      {tokens.map((name, i) => (
        <span key={ids[i] ?? i}>
          <Link
            href={`/area/${ids[i]}`}
            className="hover:text-stone-900 dark:hover:text-stone-100"
          >
            {name}
          </Link>
          {i < tokens.length - 1 && <span className="mx-2">/</span>}
        </span>
      ))}
    </nav>
  );
}

function formatClimbType(type: ClimbDetail["type"]): string | null {
  if (!type) return null;
  const labels: string[] = [];
  if (type.sport) labels.push("Sport");
  if (type.trad) labels.push("Trad");
  if (type.bouldering) labels.push("Boulder");
  if (type.tr) labels.push("TR");
  if (type.mixed) labels.push("Mixed");
  if (type.ice) labels.push("Ice");
  if (type.aid) labels.push("Aid");
  if (type.alpine) labels.push("Alpine");
  if (type.deepwatersolo) labels.push("DWS");
  return labels.length > 0 ? labels.join("/") : null;
}
