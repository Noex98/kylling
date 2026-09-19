"use client"

import * as React from "react"
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"

import { emptyOpeningHours } from "@/lib/hours"
import type {
  AddBarRequest,
  Bar,
  StateResponse,
  ToggleVisitRequest,
  Visit,
} from "@/lib/types"

/** How often every phone re-reads the shared state. */
const POLL_MS = 5_000
/** How often the clock is nudged forward so open/closed badges stay honest. */
const TICK_MS = 15_000

/** The one cache entry the whole app renders from. */
const STATE_KEY = ["state"] as const

/**
 * Shared prefix for every write, so "is anything still in the air?" is one
 * `isMutating` call instead of hand-rolled counters.
 */
const WRITE_KEY = ["state", "write"] as const

/** Optimistically added bars carry a placeholder id until the server names them. */
const TEMP_PREFIX = "kylling-temp:"

const isTempId = (id: string) => id.startsWith(TEMP_PREFIX)

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    if (body?.error) return body.error
  } catch {
    // ignore — fall through to a generic message
  }
  return `Serverfejl (${res.status})`
}

/** Every endpoint answers with the whole `StateResponse`, or an `{ error }`. */
async function request(url: string, init?: RequestInit): Promise<StateResponse> {
  const res = await fetch(url, { cache: "no-store", ...init })
  if (!res.ok) throw new Error(await readError(res))
  return (await res.json()) as StateResponse
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

// ---------------------------------------------------------------------------
// Cache rules
// ---------------------------------------------------------------------------

/** Writes still settling, not counting the caller's own (`self` = 1 inside a mutation callback). */
function otherWrites(client: QueryClient, self: 0 | 1): number {
  return Math.max(client.isMutating({ mutationKey: WRITE_KEY }) - self, 0)
}

/**
 * The single gate every server snapshot passes through before it may become
 * what the UI renders. Both failure modes it closes come from the same fact:
 * a write to Vercel Blob takes a few hundred ms, so several taps really are in
 * flight at once, and each of them answers with a *full* state.
 *
 *  1. **Out of order.** A response that describes an older revision than the
 *     one we already know about is dropped outright — `rev` only ever grows.
 *  2. **Behind the user.** A snapshot can be newer than the cache yet still
 *     older than the taps already made. While other writes are settling, the
 *     optimistic state stays on screen; only the snapshot's `rev` is taken, so
 *     a straggler resolving afterwards is recognised as stale by rule 1 and
 *     cannot flip the UI back.
 *
 * The truth is restored by the invalidate in `settle`, which runs once every
 * write has landed — at which point rule 2 no longer applies.
 */
function reconcile(
  current: StateResponse | undefined,
  incoming: StateResponse,
  pending: number
): StateResponse {
  if (!current) return incoming
  if (incoming.rev < current.rev) return current
  if (pending > 0) {
    return incoming.rev === current.rev
      ? current
      : // Keep the optimistic data, remember how far the server has got.
        { ...current, rev: incoming.rev, serverNow: incoming.serverNow }
  }
  return incoming
}

/** Puts a server snapshot into the cache — via `reconcile`, always. */
function commit(client: QueryClient, incoming: StateResponse, self: 0 | 1) {
  const current = client.getQueryData<StateResponse>(STATE_KEY)
  const next = reconcile(current, incoming, otherWrites(client, self))
  if (next !== current) client.setQueryData(STATE_KEY, next)
}

/**
 * Re-read the server, but only once nothing else is in the air — invalidating
 * after every write would put the poll and the writes back in the same race.
 *
 * Mutation callbacks run *before* the mutation leaves the pending set, so "only
 * me left" is a count of exactly 1. The refetch is deliberately not awaited:
 * awaiting it would keep this mutation pending while the response is read, and
 * `reconcile` would then treat its own refresh as something to hold back.
 */
function settle(client: QueryClient) {
  if (client.isMutating({ mutationKey: WRITE_KEY }) === 1) {
    void client.invalidateQueries({ queryKey: STATE_KEY })
  }
}

// ---------------------------------------------------------------------------
// Optimistic edits (pure)
// ---------------------------------------------------------------------------

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

function withBar(state: StateResponse, bar: Bar, index?: number): StateResponse {
  if (state.bars.some((b) => b.id === bar.id)) return state
  const bars = [...state.bars]
  bars.splice(index ?? bars.length, 0, bar)
  return { ...state, bars }
}

function withoutBar(state: StateResponse, barId: string): StateResponse {
  const visits = { ...state.visits }
  delete visits[barId]
  return { ...state, bars: state.bars.filter((b) => b.id !== barId), visits }
}

/** Edits the cache in place, leaving `rev` alone — optimistic state is not a revision. */
function edit(client: QueryClient, fn: (state: StateResponse) => StateResponse) {
  client.setQueryData<StateResponse>(STATE_KEY, (s) => (s ? fn(s) : s))
}

// ---------------------------------------------------------------------------
// Server clock
// ---------------------------------------------------------------------------

/**
 * "Now" according to the server, so a phone with a wrong clock still agrees
 * with everyone else about which bars are open. Stays null until the first
 * response lands, so the server render and the first client render match.
 */
function useServerClock(serverNow: string | undefined) {
  const offsetRef = React.useRef(0)
  const [nowMs, setNowMs] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (!serverNow) return
    const offset = Date.parse(serverNow) - Date.now()
    offsetRef.current = Number.isFinite(offset) ? offset : 0
    // Adopting the server's clock is the entire job of this effect.
    setNowMs(Date.now() + offsetRef.current)
  }, [serverNow])

  // Keep "now" moving between polls, without ever reading the clock at render.
  React.useEffect(() => {
    const tick = setInterval(
      () => setNowMs((ms) => (ms === null ? null : Date.now() + offsetRef.current)),
      TICK_MS
    )
    return () => clearInterval(tick)
  }, [])

  const now = React.useMemo(
    () => (nowMs === null ? null : new Date(nowMs)),
    [nowMs]
  )

  return { now, offsetRef }
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export type GameState = ReturnType<typeof useGameState>

/**
 * The single entry point for the shared game state.
 *
 * One query holds `GET /api/state`; the three writes are mutations that paint
 * their change optimistically and reconcile whatever the server answers with
 * through `reconcile`. What the user sees is the optimistic state, and it never
 * flips back while requests settle.
 */
export function useGameState() {
  const client = useQueryClient()

  const query = useQuery({
    queryKey: STATE_KEY,
    queryFn: async ({ signal }) => {
      const incoming = await request("/api/state", { signal })
      // The query writes its own result, so it returns through the gate
      // instead of calling setQueryData.
      return reconcile(
        client.getQueryData<StateResponse>(STATE_KEY),
        incoming,
        otherWrites(client, 0)
      )
    },
    // Verified against query-core 5.103: the interval callback only fetches
    // when `refetchIntervalInBackground` is set or `focusManager.isFocused()`,
    // which is `document.visibilityState !== "hidden"`. So polling pauses on a
    // hidden tab, as it did before.
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: true,
    staleTime: 0,
    // One quick retry absorbs a dropped packet; more than that and the banner
    // should be honest about the fact that there is no contact.
    retry: 1,
  })

  const state = query.data ?? null
  const { now, offsetRef } = useServerClock(state?.serverNow)

  const toggle = useMutation({
    mutationKey: [...WRITE_KEY, "visit"],
    mutationFn: (vars: ToggleVisitRequest) =>
      request("/api/visits", json(vars satisfies ToggleVisitRequest)),
    onMutate: async ({ barId, visited }) => {
      // This is what stops an in-flight poll from landing on top of the write.
      await client.cancelQueries({ queryKey: STATE_KEY })
      const previous = client.getQueryData<StateResponse>(STATE_KEY)?.visits[
        barId
      ]
      const next: Visit | null = visited
        ? { barId, at: new Date(Date.now() + offsetRef.current).toISOString() }
        : null
      edit(client, (s) => withVisit(s, barId, next))
      return { previous }
    },
    onError: (error, { barId, visited }, context) => {
      // Roll back this bar only. The rest of the snapshot may have picked up
      // other people's ticks since, and our own other taps may still be settling.
      edit(client, (s) => withVisit(s, barId, context?.previous ?? null))
      toast.error(
        visited ? "Kunne ikke krydse baren af" : "Kunne ikke fortryde",
        { description: error.message }
      )
    },
    onSuccess: (data) => commit(client, data, 1),
    onSettled: () => settle(client),
  })

  const add = useMutation({
    mutationKey: [...WRITE_KEY, "add"],
    mutationFn: (bar: AddBarRequest) => request("/api/bars", json(bar)),
    onMutate: async (bar) => {
      await client.cancelQueries({ queryKey: STATE_KEY })
      const tempId = `${TEMP_PREFIX}${Date.now().toString(36)}`
      edit(client, (s) =>
        withBar(s, {
          id: tempId,
          name: bar.name,
          address: bar.address,
          note: bar.note,
          hours: { ...emptyOpeningHours(), ...bar.hours },
          custom: true,
        })
      )
      return { tempId }
    },
    onError: (error, _bar, context) => {
      if (context) edit(client, (s) => withoutBar(s, context.tempId))
      toast.error("Kunne ikke tilføje baren", { description: error.message })
    },
    onSuccess: (data) => commit(client, data, 1),
    onSettled: () => settle(client),
  })

  const remove = useMutation({
    mutationKey: [...WRITE_KEY, "delete"],
    mutationFn: (barId: string) =>
      request(`/api/bars?id=${encodeURIComponent(barId)}`, { method: "DELETE" }),
    onMutate: async (barId) => {
      await client.cancelQueries({ queryKey: STATE_KEY })
      const snapshot = client.getQueryData<StateResponse>(STATE_KEY)
      const index = snapshot?.bars.findIndex((b) => b.id === barId) ?? -1
      const context = {
        bar: index >= 0 ? snapshot?.bars[index] : undefined,
        visit: snapshot?.visits[barId],
        index,
      }
      edit(client, (s) => withoutBar(s, barId))
      return context
    },
    onError: (error, barId, context) => {
      // Put back exactly what we took out, and nothing else.
      if (context?.bar) {
        const bar = context.bar
        const visit = context.visit
        edit(client, (s) => {
          const restored = withBar(s, bar, context.index)
          return visit ? withVisit(restored, barId, visit) : restored
        })
      }
      toast.error("Kunne ikke slette baren", { description: error.message })
    },
    onSuccess: (data) => commit(client, data, 1),
    onSettled: () => settle(client),
  })

  const toggleVisit = (barId: string, visited: boolean) => {
    // A bar that only exists optimistically has no id the server would accept.
    if (isTempId(barId)) return
    toggle.mutate({ barId, visited })
  }

  const deleteBar = (barId: string) => {
    if (isTempId(barId)) return
    remove.mutate(barId)
  }

  /** Resolves false when the server refused — the dialog stays open on false. */
  const addBar = async (bar: AddBarRequest) => {
    try {
      await add.mutateAsync(bar)
      return true
    } catch {
      // Already reported by the mutation's onError toast.
      return false
    }
  }

  return {
    state,
    /** Server-aligned "now". null until the first fetch (avoids hydration drift). */
    now,
    /** Set while the last fetch failed; `state` still holds the last good snapshot. */
    error: query.error,
    /** No state yet and no verdict yet — the first load is still running. */
    loading: query.isPending,
    /** Everything the UI needs is present. */
    ready: state !== null && now !== null,
    refresh: query.refetch,
    toggleVisit,
    addBar,
    deleteBar,
  }
}
