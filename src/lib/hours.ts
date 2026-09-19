import type { OpeningHours, OpeningInterval, Weekday } from "@/lib/types"

/**
 * Pure helpers for reasoning about opening hours.
 *
 * Every function takes "now" as an argument — nothing in here reads the clock,
 * so the UI can drive it from the server's time instead of the phone's.
 *
 * Intervals may cross midnight: open "20:00" / close "05:00" means the bar is
 * still open at 02:00 the following calendar day (per the contract in types.ts,
 * `close <= open` is treated as the next day).
 */

const MINUTES_PER_DAY = 24 * 60

/** Hours are sometimes partial (custom bars added from the UI). */
export type HoursInput = Partial<OpeningHours> | null | undefined

/** A resolved, absolute open period. */
export type OpenWindow = { start: Date; end: Date }

export type OpenState = {
  isOpen: boolean
  /** Open, but closing within CLOSING_SOON_MINUTES. */
  isClosingSoon: boolean
  /** Whole minutes until `closesAt`. null when closed. */
  minutesUntilClosing: number | null
  /** End of the window we are currently inside. null when closed. */
  closesAt: Date | null
  /** Next time it opens, at or after `now`. null if never within a week. */
  opensAt: Date | null
  /** Whole minutes until `opensAt`. null when open now or never opening. */
  minutesUntilOpen: number | null
  /** Does `opensAt` fall on the same calendar day as `now`? */
  opensToday: boolean
}

export const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: "søndag",
  1: "mandag",
  2: "tirsdag",
  3: "onsdag",
  4: "torsdag",
  5: "fredag",
  6: "lørdag",
}

export const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: "sø",
  1: "ma",
  2: "ti",
  3: "on",
  4: "to",
  5: "fr",
  6: "lø",
}

/** Monday-first, the way a Dane reads a week. */
export const WEEKDAY_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0]

// ---------------------------------------------------------------------------
// Low level
// ---------------------------------------------------------------------------

/** "HH:mm" -> minutes since midnight. Accepts "24:00". null when unparseable. */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (minutes > 59) return null
  if (hours === 24 && minutes === 0) return MINUTES_PER_DAY
  if (hours > 23) return null
  return hours * 60 + minutes
}

/** Minutes since midnight -> "HH:mm". */
export function formatMinutes(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`
}

/** Local wall-clock time of a date as "HH:mm". */
export function formatTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function pad(n: number): string {
  return n.toString().padStart(2, "0")
}

/** `ref`'s calendar day shifted by `dayOffset`, at `minutes` past midnight. */
function atMinutes(ref: Date, dayOffset: number, minutes: number): Date {
  return new Date(
    ref.getFullYear(),
    ref.getMonth(),
    ref.getDate() + dayOffset,
    0,
    minutes,
    0,
    0
  )
}

function weekdayOf(ref: Date, dayOffset: number): Weekday {
  return atMinutes(ref, dayOffset, 0).getDay() as Weekday
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * The absolute open window that *starts* on `ref + dayOffset`, if any.
 * A close time of "05:00" after an open time of "20:00" lands on the next day.
 */
function windowStartingOn(
  hours: HoursInput,
  ref: Date,
  dayOffset: number
): OpenWindow | null {
  const interval = hours?.[weekdayOf(ref, dayOffset)]
  if (!interval) return null
  const open = parseTime(interval.open)
  const close = parseTime(interval.close)
  if (open === null || close === null) return null
  const closeAbs = close <= open ? close + MINUTES_PER_DAY : close
  return {
    start: atMinutes(ref, dayOffset, open),
    end: atMinutes(ref, dayOffset, closeAbs),
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** The open window containing `date`, or null. Looks back a day for after-midnight hours. */
export function currentWindow(hours: HoursInput, date: Date): OpenWindow | null {
  for (const offset of [-1, 0]) {
    const win = windowStartingOn(hours, date, offset)
    if (win && date >= win.start && date < win.end) return win
  }
  return null
}

/** Is the bar open at `date`? */
export function isOpenAt(hours: HoursInput, date: Date): boolean {
  return currentWindow(hours, date) !== null
}

/** When does the current open window end? null when closed at `date`. */
export function closingAt(hours: HoursInput, date: Date): Date | null {
  return currentWindow(hours, date)?.end ?? null
}

/**
 * The next time the bar opens, at or after `date`.
 * Returns null if it does not open again within a week.
 * If it is already open, this is the *following* opening — use `closingAt` instead.
 */
export function nextOpeningAt(hours: HoursInput, date: Date): Date | null {
  for (let offset = 0; offset <= 7; offset++) {
    const win = windowStartingOn(hours, date, offset)
    if (win && win.start >= date) return win.start
  }
  return null
}

/**
 * How many minutes the bar is open between `from` and `to`.
 *
 * Sums every open window that overlaps the range rather than asking "is it open
 * at some instant", because the useful question is how *much* of a period a bar
 * is available for — a place that unlocks its door twenty minutes before the
 * range ends is technically open during it and practically no use.
 */
export function openMinutesBetween(
  hours: HoursInput,
  from: Date,
  to: Date
): number {
  if (to <= from) return 0
  // -1 catches a window that opened the day before and runs past midnight into
  // the range; the upper bound covers every day the range itself touches.
  const spanDays = Math.ceil(
    (to.getTime() - from.getTime()) / (MINUTES_PER_DAY * 60_000)
  )
  let total = 0
  for (let offset = -1; offset <= spanDays + 1; offset++) {
    const win = windowStartingOn(hours, from, offset)
    if (!win) continue
    const start = Math.max(win.start.getTime(), from.getTime())
    const end = Math.min(win.end.getTime(), to.getTime())
    if (end > start) total += Math.round((end - start) / 60_000)
  }
  return total
}

/**
 * When the bar shuts for the last time in a window that overlaps `[from, to)`,
 * or null if it is never open in that range.
 *
 * The returned time is the real closing time, which may fall outside the range
 * — the caller asked when it shuts, not when the range ends. Unlike `closingAt`
 * this does not need the bar to be open at any particular instant, so it still
 * answers for one that opens partway through.
 */
export function lastClosingBetween(
  hours: HoursInput,
  from: Date,
  to: Date
): Date | null {
  if (to <= from) return null
  const spanDays = Math.ceil(
    (to.getTime() - from.getTime()) / (MINUTES_PER_DAY * 60_000)
  )
  let last: Date | null = null
  for (let offset = -1; offset <= spanDays + 1; offset++) {
    const win = windowStartingOn(hours, from, offset)
    // Only windows that actually overlap the range have anything to say.
    if (!win || win.end <= from || win.start >= to) continue
    if (!last || win.end > last) last = win.end
  }
  return last
}

/**
 * A bar closing within this many minutes is worth flagging. Once the evening is
 * under way almost everything is open, so "open" stops carrying information and
 * only the ones about to close do.
 */
export const CLOSING_SOON_MINUTES = 60

/** Minutes until the current opening ends. null when closed at `date`. */
export function minutesUntilClosing(
  hours: HoursInput,
  date: Date
): number | null {
  const end = closingAt(hours, date)
  if (!end) return null
  return Math.max(0, Math.round((end.getTime() - date.getTime()) / 60000))
}

/** Open, but not for much longer. False when closed. */
export function isClosingSoon(hours: HoursInput, date: Date): boolean {
  const minutes = minutesUntilClosing(hours, date)
  return minutes !== null && minutes <= CLOSING_SOON_MINUTES
}

/** Everything the UI needs about one bar's status, in one pass. */
export function getOpenState(hours: HoursInput, now: Date): OpenState {
  const current = currentWindow(hours, now)
  const opensAt = nextOpeningAt(hours, now)
  const untilClosing = current
    ? Math.max(0, Math.round((current.end.getTime() - now.getTime()) / 60000))
    : null
  return {
    isOpen: current !== null,
    isClosingSoon: untilClosing !== null && untilClosing <= CLOSING_SOON_MINUTES,
    minutesUntilClosing: untilClosing,
    closesAt: current?.end ?? null,
    opensAt,
    minutesUntilOpen:
      current || !opensAt
        ? null
        : Math.max(0, Math.round((opensAt.getTime() - now.getTime()) / 60000)),
    opensToday: opensAt !== null && isSameDay(opensAt, now),
  }
}

// ---------------------------------------------------------------------------
// Danish formatting
// ---------------------------------------------------------------------------

/**
 * The one line that matters right now:
 * "Lukker 02:00" · "Åbner 16:00" · "Lukket i dag" · "Lukket".
 */
export function formatOpeningLine(hours: HoursInput, now: Date): string {
  const state = getOpenState(hours, now)
  if (state.closesAt) return `Lukker ${formatTime(state.closesAt)}`
  if (state.opensAt && state.opensToday) return `Åbner ${formatTime(state.opensAt)}`
  if (state.opensAt) return "Lukket i dag"
  return "Lukket"
}

/**
 * Secondary line for bars that are done for today:
 * "Åbner i morgen 16:00" · "Åbner lørdag 16:00". null when open or never.
 */
export function formatNextOpening(hours: HoursInput, now: Date): string | null {
  const state = getOpenState(hours, now)
  if (state.isOpen || !state.opensAt) return null
  const time = formatTime(state.opensAt)
  if (state.opensToday) return `Åbner ${time}`
  const tomorrow = atMinutes(now, 1, 0)
  if (isSameDay(state.opensAt, tomorrow)) return `Åbner i morgen ${time}`
  return `Åbner ${WEEKDAY_NAMES[state.opensAt.getDay() as Weekday]} ${time}`
}

/** Today's hours as a plain range: "16:00–02:00" or "Lukket i dag". */
export function formatDayHours(hours: HoursInput, date: Date): string {
  const interval = hours?.[date.getDay() as Weekday]
  if (!interval) return "Lukket i dag"
  return formatInterval(interval)
}

export function formatInterval(interval: OpeningInterval): string {
  return `${interval.open}–${interval.close}`
}

/** "om 25 min" · "om 2 t 10 min" · "om 1 dag". */
export function formatIn(minutes: number): string {
  if (minutes < 1) return "lige om lidt"
  if (minutes < 60) return `om ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours < 24) return rest === 0 ? `om ${hours} t` : `om ${hours} t ${rest} min`
  const days = Math.round(hours / 24)
  return days === 1 ? "om 1 dag" : `om ${days} dage`
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/** All days closed — a starting point for the "add bar" form. */
export function emptyOpeningHours(): OpeningHours {
  return { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null }
}

/** The same interval on every selected day. */
export function buildOpeningHours(
  days: Weekday[],
  open: string,
  close: string
): OpeningHours {
  const hours = emptyOpeningHours()
  for (const day of days) hours[day] = { open, close }
  return hours
}
