# Kylling 🐔 Aarhus

Bar crawl app for the "find the chicken" game: friends dressed as chickens hide
in bars around Aarhus, players walk from place to place having a drink at each
one, ticking off where they've been.

State is server-side and shared, so everyone in the group sees the same list
updating live on their own phone.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## State storage

The app stores the whole game state in one place and picks the backend at
runtime:

| Condition                                                   | Backend                    |
| ----------------------------------------------------------- | -------------------------- |
| Default — no env vars                                        | JSON file at `data/state.json` |
| `UPSTASH_REDIS_REST_URL` **and** `UPSTASH_REDIS_REST_TOKEN` set | Upstash Redis (key `kylling:state`) |

**The file backend does not work on serverless hosts.** Vercel, Netlify and
Cloudflare give each instance its own ephemeral filesystem, so players would
each get their own private copy of the state. Use Upstash there — on Vercel,
add Upstash Redis from the Marketplace and both env vars are injected for you.

On a single container or VM the file backend is fine. Mount `/data` on a
persistent volume so a restart doesn't wipe the night's progress.

See `.env.example`.

## Bars

Seed bars live in [`src/data/bars.ts`](src/data/bars.ts) with per-weekday
opening hours (intervals may cross midnight — `open: "20:00", close: "05:00"`
means it's still open at 02:00). Opening hours are best-effort and worth
double-checking before relying on them.

Bars can also be added from the UI at runtime; those are stored server-side as
`customBars` and can be deleted again. Seed bars cannot be deleted.

## API

All routes are uncached and return the same `StateResponse` shape.

| Route                    | Method   | Body / query              |
| ------------------------ | -------- | ------------------------- |
| `/api/state`             | `GET`    | —                         |
| `/api/visits`            | `POST`   | `ToggleVisitRequest`      |
| `/api/bars`              | `POST`   | `AddBarRequest`           |
| `/api/bars?id=<id>`      | `DELETE` | custom bars only          |

The shared contract between store, routes and UI is
[`src/lib/types.ts`](src/lib/types.ts).

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · shadcn/ui

`.npmrc` sets `minimumReleaseAge` so no package published in the last three
days gets installed.
