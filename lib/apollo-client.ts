import { HttpLink } from "@apollo/client";
import {
  ApolloClient,
  InMemoryCache,
  registerApolloClient,
} from "@apollo/client-integration-nextjs";

// Cap server-side OpenBeta requests at 4 seconds. Without this, a slow
// upstream blocks the entire page render — typical pages already
// show a loading skeleton from app/loading.tsx, but with no timeout
// the actual content never paints. Pages that catch and render an
// error UI on Apollo failure recover gracefully.
const OPENBETA_TIMEOUT_MS = 4000;

function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // AbortSignal.any combines whatever caller signal exists (Next's
  // request-abort, for instance) with our timeout — whichever fires
  // first wins. Falls back to just-timeout when no caller signal.
  const timeout = AbortSignal.timeout(OPENBETA_TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  return fetch(input, { ...init, signal });
}

export const { getClient } = registerApolloClient(() => {
  return new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({
      uri: "https://api.openbeta.io",
      // OpenBeta data (areas, climbs) changes when contributors edit it,
      // not in real time. Caching responses at Vercel's edge for an hour
      // makes repeat visits to /area/<id> and /climb/<id> near-instant
      // and cuts our load on the public OpenBeta endpoint. The first
      // visit per hour still pays full latency.
      fetchOptions: { next: { revalidate: 3600 } },
      fetch: fetchWithTimeout,
    }),
  });
});
