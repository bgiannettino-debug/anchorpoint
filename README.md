# Anchorpoint

The open climbing database, reimagined — a Next.js frontend over the
[OpenBeta](https://openbeta.io) GraphQL API.

Search for a climbing area (Smith Rock, Joshua Tree, Red Rocks…) and drill
into its sub-areas and individual routes, with grades sorted sensibly and
recursive climb counts so a parent crag shows everything nested beneath it.

## Stack

- Next.js 16 (App Router, React Server Components)
- React 19
- Apollo Client 4 (`@apollo/client-integration-nextjs` for SSR)
- Tailwind CSS v4
- TypeScript (strict)

## Getting started

```bash
npm install
npm run dev -- -p 3001
```

Then open <http://localhost:3001>. Port 3001 isn't required — pick whatever's
free. The data source is the public OpenBeta endpoint (`api.openbeta.io`);
no API key or `.env` file is needed.

## Scripts

| Command         | What it does                          |
| --------------- | ------------------------------------- |
| `npm run dev`   | Start the dev server                  |
| `npm run build` | Production build                      |
| `npm run start` | Serve the production build            |
| `npm run lint`  | ESLint (Next core-web-vitals + TS)    |

## Layout

```
app/
  page.tsx              # search landing page
  area/[uuid]/page.tsx  # area detail (sub-areas + climbs)
  layout.tsx, globals.css
components/
  area-card.tsx         # clickable area summary card
lib/
  apollo-client.ts      # registerApolloClient wrapper
  grades.ts             # YDS grade parsing + range formatting
```

## Notes for contributors

`AGENTS.md` is the source of truth for project conventions. In particular:
this is Next.js **16** — `params` and `searchParams` are Promises, and a
few APIs differ from older docs. When in doubt, check
`node_modules/next/dist/docs/` rather than relying on memory.
