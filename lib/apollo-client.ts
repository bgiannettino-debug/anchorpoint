import { HttpLink } from "@apollo/client";
import {
  ApolloClient,
  InMemoryCache,
  registerApolloClient,
} from "@apollo/client-integration-nextjs";

// Cap server-side OpenBeta requests so a hanging upstream can't block
// a page render forever — but generous enough to absorb a Vercel
// serverless cold start + mobile-network jitter (which together can
// chew up several seconds before the upstream even responds). The
// route-level loading.tsx gives users instant feedback during this
// window, so the timeout's only job is to catch genuinely dead
// upstreams; pages catch the resulting Apollo error and render their
// "couldn't reach the climbing database" UI.
const OPENBETA_TIMEOUT_MS = 8000;

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
