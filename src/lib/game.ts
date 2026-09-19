// Tonight's game window, and which bars are actually in play during it.
//
// The crawl runs once, for one evening. Rather than hardcode a date that goes
// stale the moment the start slips, the window is anchored to whatever day the
// app is being used on — so it stays meaningful without anyone editing it.

import { coords } from "@/data/coords"
import { openMinutesBetween, parseTime, type HoursInput } from "@/lib/hours"
import { formatMetres } from "@/lib/maps"
import type { Bar, Visit } from "@/lib/types"
import { metresOutside, type Zone } from "@/lib/zone"

/** When the chickens go into hiding. */
export const GAME_START = "15:30"

/** How long they stay there. */
export const GAME_HOURS = 4

/**
 * How much of the game a bar has to be open for before it is worth walking to.
 *
 * Zero would only exclude the bars that are shut the whole evening. That misses
 * the other half of the problem: a bar that opens at 19:00 on a game that ends
 * at 19:30 is open "during the game" and is still not somewhere anyone has been
 * sitting in a chicken suit for the last three hours. An hour is the smallest
 * window a hider could plausibly have been found in.
 */
export const MIN_OPEN_MINUTES = 60

export type GameWindow = { start: Date; end: Date }

/** The game window on `now`'s calendar day. */
export function gameWindow(now: Date): GameWindow {
  const startMinutes = parseTime(GAME_START) ?? 0
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    startMinutes,
    0,
    0
  )
  return {
    start,
    end: new Date(start.getTime() + GAME_HOURS * 60 * 60_000),
  }
}

/** Minutes this bar is open during the game. */
export function openDuringGame(hours: HoursInput, game: GameWindow): number {
  return openMinutesBetween(hours, game.start, game.end)
}

/**
 * Why a bar is no longer in play. Every bar is either in play or carries
 * exactly one of these — that is the whole model, and every way a bar can leave
 * the game is a case here rather than a separate flag somewhere.
 *
 * Each case carries the number or note behind it, so the UI can say *how* far
 * out a bar is rather than only that it is.
 *
 * `clue` has no producer yet: the clues arrive later in the evening and will
 * rule bars out the same way the others do. It is in the union now so that
 * every place which handles a reason is already forced to handle that one.
 */
export type Exclusion =
  | { reason: "visited"; at: string }
  | { reason: "clue"; note?: string }
  | { reason: "closed"; openMinutes: number }
  | { reason: "zone"; metresOutside: number }

/**
 * Why this bar is out, or null if it is still in play.
 *
 * The order is the precedence, and it is not arbitrary:
 *
 *  - `visited` first, because it is the only one that records something you
 *    *did*. A bar you drank at counts, whatever the circle did afterwards.
 *  - `clue` next: being told the chicken is not there is a stronger statement
 *    than any of the geometry below it.
 *  - `closed` before `zone`, because the zone moves and will keep moving, while
 *    a bar that is shut all evening is a permanent fact and the more useful
 *    thing to be told.
 */
export function exclusionOf(
  bar: Bar,
  visit: Visit | undefined,
  game: GameWindow,
  zone: Zone | null
): Exclusion | null {
  if (visit) return { reason: "visited", at: visit.at }

  const openMinutes = openDuringGame(bar.hours, game)
  if (openMinutes < MIN_OPEN_MINUTES) return { reason: "closed", openMinutes }

  // No zone announced yet means nothing is outside one.
  if (!zone) return null

  // No coordinates means no way to prove it is outside — every bar added from
  // the UI during the game is in this position, and throwing those out for
  // failing to be geocoded would be the wrong way round.
  const position = coords[bar.id]
  if (!position) return null

  const metres = metresOutside(zone, position)
  return metres > 0 ? { reason: "zone", metresOutside: Math.round(metres) } : null
}

/** Is this an exclusion that took the bar off the board, rather than a tick? */
export function isRuledOut(exclusion: Exclusion | null): boolean {
  return exclusion !== null && exclusion.reason !== "visited"
}

// ---------------------------------------------------------------------------
// Danish formatting
// ---------------------------------------------------------------------------

/** The one line that says why, short enough to sit on a card. */
export function describeExclusion(exclusion: Exclusion): string {
  switch (exclusion.reason) {
    case "visited":
      return "Besøgt"
    case "clue":
      return exclusion.note ?? "Udelukket af en ledetråd"
    case "closed":
      return exclusion.openMinutes === 0
        ? "Lukket under hele spillet"
        : `Kun åben ${exclusion.openMinutes} min af spillet`
    case "zone":
      return `${formatMetres(exclusion.metresOutside)} uden for zonen`
  }
}
