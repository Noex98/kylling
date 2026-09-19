"use client"

import * as React from "react"
import {
  useIsFetching,
  useQueryClient,
  type QueryState,
} from "@tanstack/react-query"
import { cn } from "cn"

/**
 * The header's "are we still in touch with the server?" light.
 *
 * Self-contained on purpose: it reads everything out of the query cache itself,
 * so mounting it is `<SyncIndicator />` and nothing has to be threaded down
 * through the page.
 *
 * Two things it deliberately is *not*:
 *
 *   - It is not on a timer. Whether a fetch is in the air comes from the cache,
 *     so the dot cannot claim contact the app has not actually got.
 *   - It is not the per-bar spinner. A spinner means "your tap is being saved",
 *     and it is worth watching. This is a refresh nobody asked for, firing every
 *     five seconds for a whole evening, so it is a dim dot that breathes — no
 *     rotation, no icon, nothing that moves faster than a slow fade.
 *
 * The state that gets words is the *quiet* one. A refresh that works says almost
 * nothing; a refresh that keeps failing gets a colour, a sentence and a count of
 * how old the list on screen actually is — because a stale list is the thing
 * that costs a player something, not a missing refresh animation.
 */

/** The one query the whole app renders from. */
const STATE_KEY = ["state"] as const

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE

/**
 * How old the data has to get before the indicator says so out loud. Six missed
 * polls: long enough that one slow round trip stays silent, short enough that a
 * phone which has dropped off the wifi admits it before anyone walks somewhere
 * on the strength of what is on screen.
 */
const STALE_AFTER = 30 * SECOND

// ---------------------------------------------------------------------------
// Reading the cache
// ---------------------------------------------------------------------------

/**
 * The poll query's cached state, kept live by subscribing to the query cache.
 *
 * Deliberately not a second `useQuery`: another observer on this key would join
 * in on the refetch interval and change the very thing being reported on.
 *
 * `getQueryState` hands back the query's own state object, and that object only
 * gets replaced when the query dispatches, so `useSyncExternalStore` re-renders
 * on real changes and ignores the rest of the cache's chatter.
 */
function useStateQuery(): QueryState | undefined {
  const client = useQueryClient()

  const subscribe = React.useCallback(
    (onStoreChange: () => void) =>
      client.getQueryCache().subscribe(onStoreChange),
    [client]
  )

  const getSnapshot = React.useCallback(
    () => client.getQueryState(STATE_KEY),
    [client]
  )

  // Nothing is cached during the server render, and saying so keeps the first
  // client render identical to it.
  return React.useSyncExternalStore(subscribe, getSnapshot, () => undefined)
}

// ---------------------------------------------------------------------------
// Age
// ---------------------------------------------------------------------------

/** How long until `formatAgo` would say something different. */
function nextChangeIn(ageMs: number): number {
  if (ageMs < STALE_AFTER) return STALE_AFTER - ageMs
  if (ageMs < MINUTE) return MINUTE - ageMs
  if (ageMs < HOUR) return MINUTE - (ageMs % MINUTE)
  return HOUR - (ageMs % HOUR)
}

/**
 * Milliseconds since `since`, re-read only at the moments the answer would
 * actually change on screen: the staleness threshold, then each minute, then
 * each hour. Not a one-second interval — and because this component is a leaf
 * with no children, the re-render stops here rather than touching the list.
 *
 * In the healthy case the timer never even fires: every successful poll changes
 * `since`, which restarts the effect five seconds before the first tick is due.
 *
 * Returns null until the first effect has run, so the server render and the
 * first client render agree on what to paint.
 */
function useAge(since: number | null): number | null {
  const [nowMs, setNowMs] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (since === null) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      const now = Date.now()
      setNowMs(now)
      // Clamped, so a clock that jumps backwards cannot turn this into a loop.
      timer = setTimeout(tick, Math.max(SECOND, nextChangeIn(now - since)))
    }
    tick()
    return () => clearTimeout(timer)
  }, [since])

  if (since === null || nowMs === null) return null
  return Math.max(0, nowMs - since)
}

/**
 * Danish, past tense, and never more precise than we re-render: we only wake up
 * on minute boundaries, so nothing under a minute is allowed to claim a number
 * it would then sit on for another half minute.
 */
function formatAgo(ageMs: number): string {
  if (ageMs < MINUTE) return "for lidt siden"
  if (ageMs < HOUR) return `for ${Math.floor(ageMs / MINUTE)} min siden`
  return `for ${Math.floor(ageMs / HOUR)} t siden`
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

function subscribeToMotionPreference(onStoreChange: () => void): () => void {
  const media = window.matchMedia(REDUCED_MOTION)
  media.addEventListener("change", onStoreChange)
  return () => media.removeEventListener("change", onStoreChange)
}

/**
 * Asked in JS rather than with a `motion-reduce:` class, because the honest
 * answer here is not "the same fade, but faster" — that would leave a dot
 * snapping on and off every five seconds, which is worse than the fade. Someone
 * who has asked the OS to stop things moving gets a dot that simply sits there;
 * everything that actually matters is spelled out in words anyway.
 */
function useReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false
  )
}

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

export function SyncIndicator({ className }: { className?: string }) {
  const fetching = useIsFetching({ queryKey: STATE_KEY }) > 0
  const state = useStateQuery()
  const reducedMotion = useReducedMotion()

  // A `dataUpdatedAt` of 0 means "never succeeded", which is not a timestamp
  // anything can be counted from.
  const ageMs = useAge(state?.dataUpdatedAt || null)

  /**
   * Both of these are sticky until a fetch actually succeeds — `status` stays
   * "error" right through the retry and the next poll's in-flight window — so
   * the offline line cannot flicker on and off every five seconds.
   */
  const offline =
    state?.fetchStatus === "paused"
      ? // The fetch never left the phone: the browser says there is no network.
        "Ingen forbindelse"
      : state?.status === "error"
        ? "Kan ikke nå serveren"
        : null

  const stale = ageMs !== null && ageMs >= STALE_AFTER

  // How old the list is, said out loud only when it is worth knowing. While
  // everything is healthy this is five seconds and nobody needs to be told.
  const age =
    ageMs !== null && (offline !== null || stale)
      ? `Opdateret ${formatAgo(ageMs)}`
      : null

  return (
    <div
      className={cn(
        // `self-center` so a header row using `items-baseline` still lines the
        // dot up with the title; `min-w-0` so the text truncates under pressure
        // on a narrow phone rather than pushing the header wider.
        "flex min-w-0 items-center gap-1.5 self-center text-right leading-tight",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          offline !== null
            ? "bg-destructive"
            : stale
              ? "bg-amber-400"
              : "bg-muted-foreground",
          // Trouble is held steady. It is already stated in words next to the
          // dot, and a red light blinking for the rest of the evening would be
          // the single most irritating thing on the screen.
          offline !== null || stale
            ? "opacity-100"
            : reducedMotion
              ? "opacity-50"
              : fetching
                ? // Up quickly, so a 200 ms round trip still registers…
                  "opacity-90 transition-opacity duration-200 ease-out"
                : // …and down slowly, so it reads as a breath, not a blink.
                  "opacity-25 transition-opacity duration-1000 ease-out"
        )}
      />

      <div className="min-w-0">
        {/* Always rendered, so the live region exists before it has anything to
            say. Only the headline announces: the age line below changes once a
            minute, and a screen reader repeating it that often is a nuisance. */}
        <p
          role="status"
          className="truncate text-[11px] font-medium text-destructive"
        >
          {offline}
        </p>
        {age && (
          <p className="truncate text-[10px] text-muted-foreground">{age}</p>
        )}
      </div>
    </div>
  )
}
