// Tonight's game window, and which bars are actually in play during it.
//
// The crawl runs once, for one evening. Rather than hardcode a date that goes
// stale the moment the start slips, the window is anchored to whatever day the
// app is being used on — so it stays meaningful without anyone editing it.

import { coords } from "@/data/coords"
import { openMinutesBetween, parseTime, type HoursInput } from "@/lib/hours"
import type { Bar } from "@/lib/types"
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
 * Why a bar is out of play. Being *visited* is deliberately not one of these:
 * a bar you have ticked off is still a bar that counted, and it stays on the
 * list wearing its tick. Out of play means the opposite — it never counted and
 * never will, through no decision of yours.
 *
 * Each case carries the number behind it so the UI can say how far out it is
 * rather than just that it is.
 */
export type OutOfPlay =
  | { reason: "closed"; openMinutes: number }
  | { reason: "zone"; metresOutside: number }

/**
 * Why this bar is out, or null if it is in play.
 *
 * Closed beats outside-the-zone when both are true: the zone moves and will
 * keep moving, but a bar that is shut all evening is a permanent fact, and it
 * is the more useful thing to be told.
 */
export function outOfPlay(
  bar: Bar,
  game: GameWindow,
  zone: Zone
): OutOfPlay | null {
  const openMinutes = openDuringGame(bar.hours, game)
  if (openMinutes < MIN_OPEN_MINUTES) return { reason: "closed", openMinutes }

  // No coordinates means no way to prove it is outside — every bar added from
  // the UI during the game is in this position, and throwing those out for
  // failing to be geocoded would be the wrong way round.
  const position = coords[bar.id]
  if (!position) return null

  const metres = metresOutside(zone, position)
  return metres > 0 ? { reason: "zone", metresOutside: Math.round(metres) } : null
}
