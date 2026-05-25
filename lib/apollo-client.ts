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
      fetchOptions: {
        // OpenBeta data (areas, climbs) changes when contributors edit it,
        // not in real time — hourly revalidation gives us snappy navigation
        // via Next's fetch cache while still picking up edits same-day.
        next: { revalidate: 3600 },
      },
    }),
  });
});
