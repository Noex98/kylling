"use client"

import * as React from "react"
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query"
import { toast } from "sonner"

import type {
  AddBarRequest,
  StateResponse,
  ToggleVisitRequest,
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
const VISIT_KEY = [...WRITE_KEY, "visit"] as const
const ADD_KEY = [...WRITE_KEY, "add"] as const
const DELETE_KEY = [...WRITE_KEY, "delete"] as const

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

/**
 * The one gate every server snapshot passes through before it becomes what the
 * UI renders.
 *
 * A write to Vercel Blob takes a few hundred ms and several can be in flight at
 * once (different bars, or a poll overlapping a write), so responses really do
 * land out of order. `rev` only ever grows, so a snapshot describing an older
 * revision than the cache already holds is simply dropped.
 */
function newest(
  current: StateResponse | undefined,
  incoming: StateResponse
): StateResponse {
  return current && incoming.rev < current.rev ? current : incoming
}

/** Puts a server snapshot into the cache — via `newest`, always. */
function commit(client: QueryClient, incoming: StateResponse) {
  const current = client.getQueryData<StateResponse>(STATE_KEY)
  const next = newest(current, incoming)
  if (next !== current) client.setQueryData(STATE_KEY, next)
}

/**
 * Re-read the server, but only once nothing else is in the air — invalidating
 * after every write would put the poll and the writes back in the same race.
 *
 * Mutation callbacks run *before* the mutation leaves the pending set, so "only
 * me left" is a count of exactly 1. The refetch is deliberately not awaited:
 * that would keep this mutation pending for the whole round trip and hold up
 * the controls that are disabled while it runs.
 */
function settle(client: QueryClient) {
  if (client.isMutating({ mutationKey: WRITE_KEY }) === 1) {
    void client.invalidateQueries({ queryKey: STATE_KEY })
  }
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
      () =>
        setNowMs((ms) => (ms === null ? null : Date.now() + offsetRef.current)),
      TICK_MS
    )
    return () => clearInterval(tick)
  }, [])

  return React.useMemo(() => (nowMs === null ? null : new Date(nowMs)), [nowMs])
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

export type GameState = ReturnType<typeof useGameState>

/**
 * The single entry point for the shared game state.
 *
 * One query holds `GET /api/state`; the three writes are mutations. Nothing is
 * applied optimistically — a control that is waiting on the server says so and
 * is disabled, and the state only changes when the server answers.
 */
export function useGameState() {
  const client = useQueryClient()

  const query = useQuery({
    queryKey: STATE_KEY,
    queryFn: async ({ signal }) => {
      const incoming = await request("/api/state", { signal })
      // The query writes its own result, so it returns through the gate
      // rather than calling setQueryData.
      return newest(client.getQueryData<StateResponse>(STATE_KEY), incoming)
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
  const now = useServerClock(state?.serverNow)

  const toggle = useMutation({
    mutationKey: VISIT_KEY,
    mutationFn: (vars: ToggleVisitRequest) =>
      request("/api/visits", json(vars satisfies ToggleVisitRequest)),
    // Stops a poll that is already in flight from coming back with a snapshot
    // taken before this write and costing a needless render.
    onMutate: () => client.cancelQueries({ queryKey: STATE_KEY }),
    onSuccess: (data, { barId, visited }) => {
      commit(client, data)
      if (!visited) return
      const name = data.bars.find((bar) => bar.id === barId)?.name
      if (name) toast.success(`${name} krydset af 🐔`)
    },
    onError: (error, { visited }) =>
      toast.error(
        visited ? "Kunne ikke krydse baren af" : "Kunne ikke fortryde",
        { description: error.message }
      ),
    onSettled: () => settle(client),
  })

  const add = useMutation({
    mutationKey: ADD_KEY,
    mutationFn: (bar: AddBarRequest) => request("/api/bars", json(bar)),
    onMutate: () => client.cancelQueries({ queryKey: STATE_KEY }),
    onSuccess: (data) => commit(client, data),
    onError: (error) =>
      toast.error("Kunne ikke tilføje baren", { description: error.message }),
    onSettled: () => settle(client),
  })

  const remove = useMutation({
    mutationKey: DELETE_KEY,
    mutationFn: (barId: string) =>
      request(`/api/bars?id=${encodeURIComponent(barId)}`, { method: "DELETE" }),
    onMutate: () => client.cancelQueries({ queryKey: STATE_KEY }),
    onSuccess: (data) => commit(client, data),
    onError: (error) =>
      toast.error("Kunne ikke slette baren", { description: error.message }),
    onSettled: () => settle(client),
  })

  // Which bars are waiting on the server right now. Read from the mutation
  // cache rather than kept alongside it, so it cannot drift out of step.
  // `useMutationState` shares its result structurally, so these sets keep their
  // identity between renders and stay usable as memo dependencies.
  const toggling = useMutationState({
    filters: { mutationKey: VISIT_KEY, status: "pending" },
    select: (mutation) => (mutation.state.variables as ToggleVisitRequest).barId,
  })
  const deleting = useMutationState({
    filters: { mutationKey: DELETE_KEY, status: "pending" },
    select: (mutation) => mutation.state.variables as string,
  })
  const togglingBars = React.useMemo(() => new Set(toggling), [toggling])
  const deletingBars = React.useMemo(() => new Set(deleting), [deleting])

  /**
   * Is this exact bar already waiting on the server? Asked of the mutation
   * cache rather than of the rendered `togglingBars`, so two taps inside one
   * frame are caught too — the disabled attribute alone would not see them.
   */
  const isBusy = (key: readonly unknown[], barId: string) =>
    client.isMutating({
      mutationKey: key,
      predicate: (mutation) => {
        const vars = mutation.state.variables
        const id = typeof vars === "string" ? vars : (vars as ToggleVisitRequest)?.barId
        return id === barId
      },
    }) > 0

  const toggleVisit = (barId: string, visited: boolean) => {
    // Taps while the previous one is still in flight are dropped, not queued.
    if (isBusy(VISIT_KEY, barId)) return
    toggle.mutate({ barId, visited })
  }

  const deleteBar = (barId: string) => {
    if (isBusy(DELETE_KEY, barId)) return
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
    /** Bar ids whose tick is waiting on the server. */
    togglingBars,
    /** Bar ids being deleted. */
    deletingBars,
  }
}
