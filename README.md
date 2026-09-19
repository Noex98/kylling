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

The whole game state is one JSON document in **Vercel Blob**, at
`kylling/state.json`. `BLOB_READ_WRITE_TOKEN` is required — Vercel sets it once
a Blob store is connected to the project, and **a redeploy is needed** because
env vars only apply to new deployments.

Reads bypass the CDN cache; otherwise players would poll a document minutes out
of date, which defeats the point of shared state.

For local development, `vercel env pull .env.local` fetches the same token.
Local and deployed then share one state, so ticking a bar while testing is
visible to everyone in the game — clear it before the night starts.

### One caveat

State is read-modify-written per request. The in-process mutex makes that safe
within a single server instance, but not across several. If two players on two
different serverless instances tick a bar in the same instant, one tick can be
lost. With a group of ten walking between bars that is unlikely, and the player
simply ticks again. Making it airtight would need per-bar atomic writes, which
this design does not have.

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

`.npmrc` sets `min-release-age=3` (days) so no package published in the last
three days gets installed.
