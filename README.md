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

| Condition                                                       | Backend                             |
| --------------------------------------------------------------- | ----------------------------------- |
| `BLOB_READ_WRITE_TOKEN` set                                      | Vercel Blob (`kylling/state.json`)  |
| `UPSTASH_REDIS_REST_URL` **and** `UPSTASH_REDIS_REST_TOKEN` set  | Upstash Redis (key `kylling:state`) |
| Neither — the default                                            | JSON file at `data/state.json`      |

**The file backend does not work on serverless hosts.** Vercel, Netlify and
Cloudflare give each instance a read-only, per-instance filesystem: reads
succeed, every write fails, so the list loads but no tick ever saves. The app
detects this and returns a 503 explaining it rather than a bare 500.

On Vercel, pick either storage from the dashboard — Blob is one click and sets
`BLOB_READ_WRITE_TOKEN` for you; Upstash Redis comes from the Marketplace and
sets both `UPSTASH_*` vars. **Redeploy afterwards**, since env vars only apply
to new deployments.

On a single container or VM the file backend is fine. Mount `/data` on a
persistent volume so a restart doesn't wipe the night's progress.

### A caveat that applies to all three

State is stored as one document, read-modify-written per request. The in-process
mutex makes that safe within one server instance, but not across several. If two
players on two different serverless instances tick a bar in the same instant,
one tick can be lost. With a group of ten walking between bars that is unlikely,
and a player simply ticks again. Making it airtight would mean per-bar atomic
writes (Redis hash fields), which is a bigger change than tonight allows.

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
