"use client"

import * as React from "react"
import { toast } from "sonner"

import type {
  AddBarRequest,
  StateResponse,
  ToggleVisitRequest,
  Visit,
} from "@/lib/types"

const POLL_MS = 5_000
/** How often the clock is nudged forward so open/closed badges stay honest. */
const TICK_MS = 15_000

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    if (body?.error) return body.error
  } catch {
    // ignore — fall through to a generic message
  }
  return `Serverfejl (${res.status})`
}

function withVisit(
  state: StateResponse,
  barId: string,
  visit: Visit | null
): StateResponse {
  const visits = { ...state.visits }
  if (visit) visits[barId] = visit
  else delete visits[barId]
  return { ...state, visits }
}

export type GameState = ReturnType<typeof useGameState>

/**
 * Shared game state: polls the server every 5s, refetches on focus and applies
 * optimistic updates that roll back (with a toast) if the server says no.
 */
export function useGameState() {
  const [state, setState] = React.useState<StateResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [nowMs, setNowMs] = React.useState<number | null>(null)

  /** serverNow - Date.now(), so everyone agrees on the time. */
  const offsetRef = React.useRef(0)
  /** Number of writes in flight — polls must not clobber optimistic state. */
  const writesRef = React.useRef(0)
  const stateRef = React.useRef<StateResponse | null>(null)

  React.useEffect(() => {
    stateRef.current = state
  }, [state])

  const apply = React.useCallback((next: StateResponse) => {
    const offset = Date.parse(next.serverNow) - Date.now()
    offsetRef.current = Number.isFinite(offset) ? offset : 0
    setState(next)
    setNowMs(Date.now() + offsetRef.current)
    setError(null)
  }, [])

  const refresh = React.useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetch("/api/state", { cache: "no-store", signal })
        if (!res.ok) throw new Error(await readError(res))
        const next = (await res.json()) as StateResponse
        // A poll must never overwrite an optimistic change still in flight.
        if (writesRef.current === 0) apply(next)
      } catch (err) {
        if (signal?.aborted) return
        setError(err instanceof Error ? err.message : "Kunne ikke hente data")
      }
    },
    [apply]
  )

  // Initial load + polling. Polling pauses while the tab is hidden.
  React.useEffect(() => {
    const controller = new AbortController()
    // Loading from the server is the whole point of this effect; refresh()
    // only ever setStates asynchronously, so no cascading render happens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(controller.signal)

    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh(controller.signal)
    }, POLL_MS)

    const onFocus = () => void refresh(controller.signal)
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(controller.signal)
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      controller.abort()
      clearInterval(interval)
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  // Keep "now" moving between polls, without ever reading the clock at render.
  // The first value arrives with the first successful fetch (see `apply`).
  React.useEffect(() => {
    const tick = setInterval(
      () => setNowMs(Date.now() + offsetRef.current),
      TICK_MS
    )
    return () => clearInterval(tick)
  }, [])

  const post = React.useCallback(
    async (
      url: string,
      init: RequestInit,
      onFail: () => void,
      failMsg: string
    ) => {
      writesRef.current += 1
      try {
        const res = await fetch(url, init)
        if (!res.ok) throw new Error(await readError(res))
        apply((await res.json()) as StateResponse)
        return true
      } catch (err) {
        onFail()
        toast.error(failMsg, {
          description: err instanceof Error ? err.message : undefined,
        })
        return false
      } finally {
        writesRef.current -= 1
      }
    },
    [apply]
  )

  const toggleVisit = React.useCallback(
    async (barId: string, visited: boolean, options?: { by?: string }) => {
      const previous = stateRef.current?.visits[barId] ?? null
      const optimistic: Visit | null = visited
        ? {
            barId,
            at: new Date(Date.now() + offsetRef.current).toISOString(),
            by: options?.by || previous?.by,
          }
        : null

      setState((s) => (s ? withVisit(s, barId, optimistic) : s))

      const body: ToggleVisitRequest = {
        barId,
        visited,
        ...(options?.by ? { by: options.by } : {}),
      }

      await post(
        "/api/visits",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        // Roll back just this bar, so other people's ticks survive.
        () => setState((s) => (s ? withVisit(s, barId, previous) : s)),
        visited ? "Kunne ikke krydse baren af" : "Kunne ikke fortryde"
      )
    },
    [post]
  )

  const addBar = React.useCallback(
    async (bar: AddBarRequest) =>
      post(
        "/api/bars",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bar),
        },
        () => {},
        "Kunne ikke tilføje baren"
      ),
    [post]
  )

  const deleteBar = React.useCallback(
    async (barId: string) =>
      post(
        `/api/bars?id=${encodeURIComponent(barId)}`,
        { method: "DELETE" },
        () => {},
        "Kunne ikke slette baren"
      ),
    [post]
  )

  return {
    state,
    /** Server-aligned "now". null until the first client tick (avoids hydration drift). */
    now: nowMs === null ? null : new Date(nowMs),
    error,
    loading: state === null,
    refresh,
    toggleVisit,
    addBar,
    deleteBar,
  }
}
