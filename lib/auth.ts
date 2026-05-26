"use client";

import { createClient } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; userId: string; email: string };

const LOADING: AuthState = { status: "loading" };
const SIGNED_OUT: AuthState = { status: "signed-out" };

let cache: AuthState = LOADING;
let initialized = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function applySession(session: Session | null) {
  const next: AuthState = session?.user
    ? {
        status: "signed-in",
        userId: session.user.id,
        email: session.user.email ?? "",
      }
    : SIGNED_OUT;
  // Skip notify if nothing changed — keeps useSyncExternalStore quiet.
  if (
    cache.status === next.status &&
    (cache.status !== "signed-in" ||
      (next.status === "signed-in" && cache.userId === next.userId))
  ) {
    return;
  }
  cache = next;
  notify();
}

function initialize() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  const supabase = createClient();
  void supabase.auth.getSession().then(({ data }) => applySession(data.session));
  supabase.auth.onAuthStateChange((_event, session) => applySession(session));
}

export function subscribeAuth(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.add(listener);
  initialize();
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthSnapshot(): AuthState {
  return cache;
}

export function getAuthServerSnapshot(): AuthState {
  return LOADING;
}
