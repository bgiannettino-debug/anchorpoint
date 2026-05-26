import { HttpLink } from "@apollo/client";
import {
  ApolloClient,
  InMemoryCache,
  registerApolloClient,
} from "@apollo/client-integration-nextjs";

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
    }),
  });
});
