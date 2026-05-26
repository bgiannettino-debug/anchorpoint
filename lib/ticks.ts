"use client";

import { createClient } from "@/lib/supabase/client";
import type {
  RealtimeChannel,
  SupabaseClient,
} from "@supabase/supabase-js";

export type TickStyle =
  | "onsight"
  | "flash"
  | "redpoint"
  | "pinkpoint"
  | "top-rope"
  | "attempt";

export const TICK_STYLES: { value: TickStyle; label: string }[] = [
  { value: "onsight", label: "Onsight" },
  { value: "flash", label: "Flash" },
  { value: "redpoint", label: "Redpoint" },
  { value: "pinkpoint", label: "Pinkpoint" },
  { value: "top-rope", label: "Top-rope" },
  { value: "attempt", label: "Attempt" },
];

export type Tick = {
  id: string;
  climbUuid: string;
  climbName: string;
  climbGrade?: string;
  parentUuid?: string;
  parentName?: string;
  ancestorUuids?: string[];
  // YYYY-MM-DD string — matches Postgres `date` and the value of an
  // <input type="date">, so we never have to parse Date objects.
  dateClimbed: string;
  style: TickStyle;
  laps: number;
  notes?: string;
  suggestedGrade?: string;
  // ms epoch, for tie-breaking when sorting by dateClimbed.
  addedAt: number;
};

type Row = {
  id: string;
  climb_uuid: string;
  climb_name: string;
  climb_grade: string | null;
  parent_uuid: string | null;
  parent_name: string | null;
  ancestor_uuids: string[] | null;
  date_climbed: string;
  style: string;
  laps: number;
  notes: string | null;
  suggested_grade: string | null;
  added_at: string;
};

const EMPTY: Tick[] = [];

let supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!supabase) supabase = createClient();
  return supabase;
}

let cache: Tick[] = EMPTY;
let currentUserId: string | null = null;
let initialized = false;
let realtimeChannel: RealtimeChannel | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function rowToTick(row: Row): Tick {
  return {
    id: row.id,
    climbUuid: row.climb_uuid,
    climbName: row.climb_name,
    climbGrade: row.climb_grade ?? undefined,
    parentUuid: row.parent_uuid ?? undefined,
    parentName: row.parent_name ?? undefined,
    ancestorUuids: row.ancestor_uuids ?? undefined,
    dateClimbed: row.date_climbed,
    style: row.style as TickStyle,
    laps: row.laps,
    notes: row.notes ?? undefined,
    suggestedGrade: row.suggested_grade ?? undefined,
    addedAt: new Date(row.added_at).getTime(),
  };
}

async function fetchTicks(userId: string) {
  const { data, error } = await getSupabase()
    .from("ticks")
    .select(
      "id, climb_uuid, climb_name, climb_grade, parent_uuid, parent_name, ancestor_uuids, date_climbed, style, laps, notes, suggested_grade, added_at",
    )
    .eq("user_id", userId)
    .order("date_climbed", { ascending: false })
    .order("added_at", { ascending: false });
  if (error) {
    console.error("Failed to fetch ticks:", error);
    return;
  }
  cache = (data as Row[]).map(rowToTick);
  notify();
}

async function teardownRealtime() {
  if (!realtimeChannel) return;
  await getSupabase().removeChannel(realtimeChannel);
  realtimeChannel = null;
}

function setupRealtime(userId: string) {
  realtimeChannel = getSupabase()
    .channel(`ticks:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "ticks",
        filter: `user_id=eq.${userId}`,
      },
      () => {
        void fetchTicks(userId);
      },
    )
    .subscribe();
}

async function syncUser(userId: string | null) {
  if (userId === currentUserId) return;
  await teardownRealtime();
  currentUserId = userId;
  if (!userId) {
    if (cache !== EMPTY) {
      cache = EMPTY;
      notify();
    }
    return;
  }
  await fetchTicks(userId);
  setupRealtime(userId);
}

function initialize() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const client = getSupabase();
  void client.auth
    .getSession()
    .then(({ data }) => syncUser(data.session?.user.id ?? null));
  client.auth.onAuthStateChange((_event, session) => {
    void syncUser(session?.user.id ?? null);
  });
}

export function subscribeTicks(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(listener);
  initialize();
  return () => {
    listeners.delete(listener);
  };
}

export function getTicksSnapshot(): Tick[] {
  return cache;
}

export function getTicksServerSnapshot(): Tick[] {
  return EMPTY;
}

export type NewTickInput = Omit<Tick, "id" | "addedAt">;

export async function addTick(t: NewTickInput): Promise<void> {
  if (!currentUserId) return;
  const { error } = await getSupabase().from("ticks").insert({
    user_id: currentUserId,
    climb_uuid: t.climbUuid,
    climb_name: t.climbName,
    climb_grade: t.climbGrade ?? null,
    parent_uuid: t.parentUuid ?? null,
    parent_name: t.parentName ?? null,
    ancestor_uuids: t.ancestorUuids ?? null,
    date_climbed: t.dateClimbed,
    style: t.style,
    laps: t.laps,
    notes: t.notes ?? null,
    suggested_grade: t.suggestedGrade ?? null,
  });
  if (error) {
    console.error("Failed to insert tick:", error);
    throw error;
  }
  // Refetch rather than guess at server-assigned id/added_at. Realtime
  // will fire too — fetchTicks just makes the UI snap immediately.
  if (currentUserId) await fetchTicks(currentUserId);
}

export async function removeTick(id: string): Promise<void> {
  if (!currentUserId) return;
  const prev = cache;
  cache = cache.filter((t) => t.id !== id);
  if (cache === prev) return;
  notify();
  const { error } = await getSupabase()
    .from("ticks")
    .delete()
    .match({ user_id: currentUserId, id });
  if (error) {
    console.error("Failed to delete tick:", error);
    cache = prev;
    notify();
  }
}
