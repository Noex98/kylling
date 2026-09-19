// Tonight's game window, and which bars are actually in play during it.
//
// The crawl runs once, for one evening. Rather than hardcode a date that goes
// stale the moment the start slips, the window is anchored to whatever day the
// app is being used on — so it stays meaningful without anyone editing it.

import { openMinutesBetween, parseTime, type HoursInput } from "@/lib/hours"

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

/** Is there enough of an overlap to bother walking there? */
export function isInPlay(hours: HoursInput, game: GameWindow): boolean {
  return openDuringGame(hours, game) >= MIN_OPEN_MINUTES
}
