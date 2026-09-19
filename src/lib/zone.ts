// The shrinking zone, Fortnite-style: a circle that steps inward on a timer and
// takes bars out of play as it goes.
//
// It is *computed* from the clock rather than stored on the server. Every phone
// already agrees on the time — the state response carries `serverNow` — so they
// all derive the same circle without a write path, a race, or anyone having to
// remember to advance it. The cost is that it cannot be steered mid-game; the
// schedule below is the whole game, and changing it means a deploy.
//
// Radii are picked against the real spread of the bar list: every bar is within
// ~1.5 km of the centre, 83 are within 1 km, and 54 are within 400 m. So the
// first stage holds everything and the last one squeezes the crawl into the
// dense middle of town without running anyone out of options.

import { AARHUS_CENTRE, metresBetween, type LatLng } from "@/lib/maps"

/** Where the circle closes in on. Each stage may override it. */
export const ZONE_CENTRE: LatLng = AARHUS_CENTRE

export type ZoneStage = {
  /** Minutes after the game starts that this stage takes over. */
  afterMinutes: number
  /** Metres from the centre. */
  radius: number
  /** Defaults to ZONE_CENTRE — set it to make the circle drift. */
  centre?: LatLng
}

/**
 * Must be sorted by `afterMinutes`, and the first one must be 0 — before the
 * game starts the zone is simply the opening one.
 */
export const ZONE_STAGES: ZoneStage[] = [
  { afterMinutes: 0, radius: 1600 }, // 15:30 — all 106
  { afterMinutes: 60, radius: 1100 }, // 16:30 — drops Trøjborg and the south
  { afterMinutes: 120, radius: 800 }, // 17:30
  { afterMinutes: 165, radius: 550 }, // 18:15
  { afterMinutes: 210, radius: 350 }, // 19:00 — the last half hour, city core
]

export type Zone = {
  centre: LatLng
  radius: number
  /** 1-based, for "zone 2 af 5". */
  index: number
  count: number
  /** When the next stage takes over. null once this is the last one. */
  shrinksAt: Date | null
  /** The radius it shrinks to. null once this is the last one. */
  nextRadius: number | null
}

const stageCentre = (stage: ZoneStage): LatLng => stage.centre ?? ZONE_CENTRE

/**
 * The zone in force at `now`.
 *
 * Before the game starts this is the opening stage rather than "no zone", so
 * the map has something to draw and nobody has to wonder whether it is broken.
 */
export function zoneAt(gameStart: Date, now: Date): Zone {
  const elapsed = (now.getTime() - gameStart.getTime()) / 60_000

  let index = 0
  for (let i = 0; i < ZONE_STAGES.length; i++) {
    if (elapsed >= ZONE_STAGES[i].afterMinutes) index = i
  }

  const stage = ZONE_STAGES[index]
  const next = ZONE_STAGES[index + 1] ?? null

  return {
    centre: stageCentre(stage),
    radius: stage.radius,
    index: index + 1,
    count: ZONE_STAGES.length,
    shrinksAt: next
      ? new Date(gameStart.getTime() + next.afterMinutes * 60_000)
      : null,
    nextRadius: next?.radius ?? null,
  }
}

/** How far outside the circle this position is. 0 means it is inside. */
export function metresOutside(zone: Zone, position: LatLng): number {
  return Math.max(0, metresBetween(zone.centre, position) - zone.radius)
}
