"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Skip registration in dev so Next's HMR / Turbopack aren't
    // shadowed by a stale SW. Prod gets the real thing.
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("[sw] registration failed:", err);
    });
  }, []);
  return null;
}
